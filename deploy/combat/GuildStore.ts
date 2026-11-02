import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { characterStore } from "./CharacterStore.js";

export const GUILD_MAX_MEMBERS = 30;
type GuildRow = {id:string;name:string;leader:string};
type MemberRow = {member_id:string;character_id:string;name:string};
export type GuildView = {
  id:string; name:string; leaderId:string; ownId:string;
  members:{id:string;name:string;publicId:string;online:boolean}[];
};

export function parseGuildName(payload:unknown):string | null {
  if (!payload || typeof payload!=="object" || Array.isArray(payload)) return null;
  const record=payload as Record<string,unknown>;
  if(Object.keys(record).length!==1 || typeof record.name!=="string")return null;
  const name=record.name.normalize("NFC").trim();
  if(Array.from(name).length<2 || Array.from(name).length>24 ||
    !/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]*$/u.test(name))return null;
  return name;
}

/** Guild membership is authoritative, shared by all rooms in this Node process. */
export class GuildStore {
  private readonly db:DatabaseSync;
  constructor(file:string) {
    this.db=new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS guilds(
        id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, leader TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS guild_members(
        member_id TEXT PRIMARY KEY, character_id TEXT NOT NULL UNIQUE,
        guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
        name TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS guild_members_guild ON guild_members(guild_id);`);
  }
  close():void { this.db.close(); }
  private transaction<T>(fn:()=>T):T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result=fn();this.db.exec("COMMIT");return result; }
    catch(error) { this.db.exec("ROLLBACK");throw error; }
  }
  private guild(character:string):GuildRow | undefined {
    return this.db.prepare("SELECT g.id,g.name,g.leader FROM guilds g JOIN guild_members m ON m.guild_id=g.id WHERE m.character_id=?").get(character) as GuildRow | undefined;
  }
  view(character:string,online:(id:string)=>boolean):GuildView | null {
    const guild=this.guild(character);if(!guild)return null;
    const members=this.db.prepare("SELECT member_id,character_id,name FROM guild_members WHERE guild_id=? ORDER BY rowid").all(guild.id) as MemberRow[];
    const own=members.find(m=>m.character_id===character),leader=members.find(m=>m.character_id===guild.leader);
    if(!own || !leader)throw new Error("guild_data_invalid");
    return {id:guild.id,name:guild.name,ownId:own.member_id,leaderId:leader.member_id,
      members:members.map(m=>({id:m.member_id,name:m.name,publicId:m.character_id.slice(0,12),online:online(m.character_id)}))};
  }
  rename(character:string,name:string):boolean {
    return Number(this.db.prepare("UPDATE guild_members SET name=? WHERE character_id=? AND name<>?").run(name,character,name).changes)>0;
  }
  create(character:string,characterName:string,name:string):void {
    this.transaction(()=>{
      if(this.guild(character))throw new Error("guild_already_member");
      if(this.db.prepare("SELECT id FROM guilds WHERE name_key=?").get(name.toLowerCase()))throw new Error("guild_name_taken");
      const id=randomUUID();
      this.db.prepare("INSERT INTO guilds(id,name,name_key,leader) VALUES(?,?,?,?)").run(id,name,name.toLowerCase(),character);
      this.db.prepare("INSERT INTO guild_members(member_id,character_id,guild_id,name) VALUES(?,?,?,?)").run(randomUUID(),character,id,characterName);
    });
  }
  add(leader:string,member:string,memberName:string):void {
    this.transaction(()=>{
      const guild=this.guild(leader);
      if(!guild || guild.leader!==leader)throw new Error("guild_leader_only");
      if(this.guild(member))throw new Error("guild_already_member");
      const count=this.db.prepare("SELECT COUNT(*) AS n FROM guild_members WHERE guild_id=?").get(guild.id) as {n:number};
      if(count.n>=GUILD_MAX_MEMBERS)throw new Error("guild_full");
      this.db.prepare("INSERT INTO guild_members(member_id,character_id,guild_id,name) VALUES(?,?,?,?)").run(randomUUID(),member,guild.id,memberName);
    });
  }
  leave(character:string):void {
    this.transaction(()=>{
      const guild=this.guild(character);if(!guild)throw new Error("guild_not_member");
      const count=this.db.prepare("SELECT COUNT(*) AS n FROM guild_members WHERE guild_id=?").get(guild.id) as {n:number};
      if(guild.leader===character && count.n>1)throw new Error("guild_transfer_first");
      if(guild.leader===character)this.db.prepare("DELETE FROM guilds WHERE id=?").run(guild.id);
      else this.db.prepare("DELETE FROM guild_members WHERE character_id=?").run(character);
    });
  }
  manage(leader:string,memberId:string,action:"kick"|"transfer"):void {
    this.transaction(()=>{
      const guild=this.guild(leader);
      if(!guild || guild.leader!==leader)throw new Error("guild_leader_only");
      const member=this.db.prepare("SELECT member_id,character_id,name FROM guild_members WHERE member_id=? AND guild_id=?").get(memberId,guild.id) as MemberRow | undefined;
      if(!member || member.character_id===leader)throw new Error("guild_invalid_member");
      if(action==="kick")this.db.prepare("DELETE FROM guild_members WHERE member_id=?").run(memberId);
      else this.db.prepare("UPDATE guilds SET leader=? WHERE id=?").run(member.character_id,guild.id);
    });
  }
}

let instance:GuildStore | undefined;
export function guildStore():GuildStore {
  if(!instance){
    mkdirSync(characterStore.directory,{recursive:true,mode:0o700});
    instance=new GuildStore(path.join(characterStore.directory,"guilds.sqlite"));
  }
  return instance;
}
const listeners=new Map<string,()=>void>();
export function guildOnline(character:string):boolean { return listeners.has(character); }
export function subscribeGuild(character:string,notify:()=>void):()=>void {
  listeners.set(character,notify);
  return ()=>{if(listeners.get(character)===notify)listeners.delete(character);};
}
export function notifyGuilds():void {
  for(const notify of listeners.values())try{notify();}catch(error){console.error("MONTRA guild notification failed",error);}
}
