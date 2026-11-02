import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { characterStore } from "./CharacterStore.js";

export const GUILD_MAX_MEMBERS = 30;
export const GUILD_SQUADS = 6;
export const GUILD_SQUAD_SIZE = 5;
export type GuildRank = "commander" | "officer" | "squad_leader" | "member";
export type GuildSpecialty = "none" | "engineer" | "scout" | "support";
type GuildRow = {id:string;name:string;leader:string};
type MemberRow = {member_id:string;character_id:string;name:string;rank:Exclude<GuildRank,"commander">;squad:number|null;specialty:GuildSpecialty};
export type GuildView = {
  id:string; name:string; leaderId:string; ownId:string;
  members:{id:string;name:string;publicId:string;online:boolean;rank:GuildRank;squad:number|null;specialty:GuildSpecialty}[];
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
    // Existing databases contain only the original member columns.
    this.transaction(()=>{
      const columns=this.db.prepare("PRAGMA table_info(guild_members)").all() as {name:string}[];
      if(!columns.some(c=>c.name==="rank"))this.db.exec("ALTER TABLE guild_members ADD COLUMN rank TEXT NOT NULL DEFAULT 'member' CHECK(rank IN ('member','officer','squad_leader'))");
      if(!columns.some(c=>c.name==="squad"))this.db.exec("ALTER TABLE guild_members ADD COLUMN squad INTEGER CHECK(squad IS NULL OR squad BETWEEN 1 AND 6)");
      if(!columns.some(c=>c.name==="specialty"))this.db.exec("ALTER TABLE guild_members ADD COLUMN specialty TEXT NOT NULL DEFAULT 'none' CHECK(specialty IN ('none','engineer','scout','support'))");
      this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS guild_one_squad_leader ON guild_members(guild_id,squad) WHERE rank='squad_leader' AND squad IS NOT NULL");
    });
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
    const members=this.db.prepare("SELECT member_id,character_id,name,rank,squad,specialty FROM guild_members WHERE guild_id=? ORDER BY rowid").all(guild.id) as MemberRow[];
    const own=members.find(m=>m.character_id===character),leader=members.find(m=>m.character_id===guild.leader);
    if(!own || !leader)throw new Error("guild_data_invalid");
    return {id:guild.id,name:guild.name,ownId:own.member_id,leaderId:leader.member_id,
      members:members.map(m=>({id:m.member_id,name:m.name,publicId:m.character_id.slice(0,12),online:online(m.character_id),rank:m.character_id===guild.leader?"commander":m.rank,squad:m.squad,specialty:m.specialty}))};
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
      const actor=this.db.prepare("SELECT rank FROM guild_members WHERE character_id=?").get(leader) as {rank:string}|undefined;
      if(!guild || (guild.leader!==leader && actor?.rank!=="officer"))throw new Error("guild_officer_required");
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
  assign(actorId:string,memberId:string,kind:"rank"|"squad"|"specialty",value:unknown):void {
    this.transaction(()=>{
      const guild=this.guild(actorId);
      if(!guild)throw new Error("guild_not_member");
      const actor=this.db.prepare("SELECT member_id,character_id,name,rank,squad,specialty FROM guild_members WHERE character_id=?").get(actorId) as MemberRow;
      const target=this.db.prepare("SELECT member_id,character_id,name,rank,squad,specialty FROM guild_members WHERE member_id=? AND guild_id=?").get(memberId,guild.id) as MemberRow | undefined;
      const commander=guild.leader===actorId;
      if(!target)throw new Error("guild_invalid_member");
      if(!commander && (actor.rank!=="officer" || target.character_id===guild.leader || target.rank==="officer"))throw new Error("guild_officer_required");
      if(kind==="rank"){
        if(!commander)throw new Error("guild_leader_only");
        if(target.character_id===guild.leader)throw new Error("guild_invalid_member");
        if(value!=="member" && value!=="officer" && value!=="squad_leader")throw new Error("guild_invalid_assignment");
        if(value==="squad_leader" && target.squad===null)throw new Error("guild_squad_required");
        if(value==="squad_leader" && this.db.prepare("SELECT 1 FROM guild_members WHERE guild_id=? AND squad=? AND rank='squad_leader' AND member_id<>?").get(guild.id,target.squad,target.member_id))throw new Error("guild_squad_leader_exists");
        this.db.prepare("UPDATE guild_members SET rank=? WHERE member_id=?").run(value,target.member_id);
      }else if(kind==="squad"){
        if(value!==null && (!Number.isInteger(value) || (value as number)<1 || (value as number)>GUILD_SQUADS))throw new Error("guild_invalid_assignment");
        if(value===null && target.rank==="squad_leader")throw new Error("guild_squad_required");
        if(value!==null && value!==target.squad){
          const count=this.db.prepare("SELECT COUNT(*) AS n FROM guild_members WHERE guild_id=? AND squad=?").get(guild.id,value as number) as {n:number};
          if(count.n>=GUILD_SQUAD_SIZE)throw new Error("guild_squad_full");
          if(target.rank==="squad_leader" && this.db.prepare("SELECT 1 FROM guild_members WHERE guild_id=? AND squad=? AND rank='squad_leader'").get(guild.id,value as number))throw new Error("guild_squad_leader_exists");
        }
        this.db.prepare("UPDATE guild_members SET squad=? WHERE member_id=?").run(value as number|null,target.member_id);
      }else if(kind==="specialty"){
        if(value!=="none" && value!=="engineer" && value!=="scout" && value!=="support")throw new Error("guild_invalid_assignment");
        this.db.prepare("UPDATE guild_members SET specialty=? WHERE member_id=?").run(value,target.member_id);
      }else throw new Error("guild_invalid_assignment");
    });
  }
  manage(leader:string,memberId:string,action:"kick"|"transfer"):void {
    this.transaction(()=>{
      const guild=this.guild(leader);
      if(!guild || guild.leader!==leader)throw new Error("guild_leader_only");
      const member=this.db.prepare("SELECT member_id,character_id,name,rank,squad,specialty FROM guild_members WHERE member_id=? AND guild_id=?").get(memberId,guild.id) as MemberRow | undefined;
      if(!member || member.character_id===leader)throw new Error("guild_invalid_member");
      if(action==="kick")this.db.prepare("DELETE FROM guild_members WHERE member_id=?").run(memberId);
      else {
        // A commander has no underlying officer or squad-leader assignment.
        this.db.prepare("UPDATE guild_members SET rank='member' WHERE character_id IN (?,?)").run(leader,member.character_id);
        this.db.prepare("UPDATE guilds SET leader=? WHERE id=?").run(member.character_id,guild.id);
      }
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
