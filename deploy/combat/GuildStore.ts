import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { TerritoryWar } from "./TerritoryWar.js";
import { DatabaseSync } from "node:sqlite";
import { characterStore } from "./CharacterStore.js";
import type {CityDisband} from "./CityProductionRules.js";
import type {EconomyStore} from "./EconomyStore.js";

export const GUILD_MAX_MEMBERS = 30;
export const GUILD_SQUADS = 6;
export const GUILD_SQUAD_SIZE = 5;
export type GuildRank = "commander" | "officer" | "squad_leader" | "member";
export type GuildSpecialty = "none" | "engineer" | "scout" | "support";
type GuildRow = {id:string;name:string;leader:string};
type MemberRow = {member_id:string;character_id:string;name:string;rank:Exclude<GuildRank,"commander">;squad:number|null;specialty:GuildSpecialty};
export type GuildView = {
  id:string; name:string; leaderId:string; ownId:string; treasury:number;
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
  readonly war:TerritoryWar;
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
    this.db.exec(`CREATE TABLE IF NOT EXISTS guild_applications(
      id TEXT PRIMARY KEY, guild_id TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE,
      character_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS guild_applications_guild ON guild_applications(guild_id,created);
      CREATE TABLE IF NOT EXISTS guild_city_disbands (
        guild TEXT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
        actor TEXT NOT NULL, name TEXT NOT NULL, requested INTEGER NOT NULL);`);
    // Existing databases contain only the original member columns.
    this.transaction(()=>{
      const columns=this.db.prepare("PRAGMA table_info(guild_members)").all() as {name:string}[];
      if(!columns.some(c=>c.name==="rank"))this.db.exec("ALTER TABLE guild_members ADD COLUMN rank TEXT NOT NULL DEFAULT 'member' CHECK(rank IN ('member','officer','squad_leader'))");
      if(!columns.some(c=>c.name==="squad"))this.db.exec("ALTER TABLE guild_members ADD COLUMN squad INTEGER CHECK(squad IS NULL OR squad BETWEEN 1 AND 6)");
      if(!columns.some(c=>c.name==="specialty"))this.db.exec("ALTER TABLE guild_members ADD COLUMN specialty TEXT NOT NULL DEFAULT 'none' CHECK(specialty IN ('none','engineer','scout','support'))");
      this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS guild_one_squad_leader ON guild_members(guild_id,squad) WHERE rank='squad_leader' AND squad IS NOT NULL");
    });
    this.war=new TerritoryWar(this.db);
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
  hasMember(character:string):boolean { return Boolean(this.guild(character)); }
  cityDisbandPending(guild: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM guild_city_disbands WHERE guild=?").get(guild));
  }
  pendingCityDisbands(): CityDisband[] {
    return this.db.prepare("SELECT * FROM guild_city_disbands ORDER BY requested,guild").all() as CityDisband[];
  }
  canDisbandCityGuild(actor: string, guild: string): boolean {
    return Boolean(this.db.prepare(`SELECT 1 FROM guilds WHERE id=? AND leader=?
      AND (SELECT count(*) FROM guild_members WHERE guild_id=?)=1`).get(guild, actor, guild));
  }
  beginCityDisband(actor: string, guildId: string, now: number): CityDisband {
    return this.transaction(() => {
      const guild = this.guild(actor);
      if (guild?.id !== guildId || !this.canDisbandCityGuild(actor, guildId)) throw Error("city_disband_unavailable");
      this.db.prepare("INSERT OR IGNORE INTO guild_city_disbands(guild,actor,name,requested) VALUES(?,?,?,?)")
        .run(guildId, actor, guild.name, now);
      return this.db.prepare("SELECT * FROM guild_city_disbands WHERE guild=?").get(guildId) as CityDisband;
    });
  }
  settleCityDisband(economy: EconomyStore, disband: CityDisband): void {
    // The market seal is idempotent by guild ID. Keep the intent if either database fails.
    economy.closeCityGuild(disband, previous => this.war.government.cityOwnership(previous));
    this.transaction(() => {
      this.db.prepare(`DELETE FROM guilds WHERE id=? AND EXISTS
        (SELECT 1 FROM guild_city_disbands WHERE guild=? AND actor=?)`).run(disband.guild, disband.guild, disband.actor);
    });
  }
  view(character:string,online:(id:string)=>boolean):GuildView | null {
    const guild=this.guild(character);if(!guild)return null;
    const members=this.db.prepare("SELECT member_id,character_id,name,rank,squad,specialty FROM guild_members WHERE guild_id=? ORDER BY rowid").all(guild.id) as MemberRow[];
    const own=members.find(m=>m.character_id===character),leader=members.find(m=>m.character_id===guild.leader);
    if(!own || !leader)throw new Error("guild_data_invalid");
    return {id:guild.id,name:guild.name,ownId:own.member_id,leaderId:leader.member_id,treasury:this.war.government.balance(guild.id),
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
      this.db.prepare("DELETE FROM guild_applications WHERE character_id=?").run(character);
    });
  }
  add(leader:string,member:string,memberName:string):void {
    this.transaction(()=>{
      const guild=this.guild(leader);
      const actor=this.db.prepare("SELECT rank FROM guild_members WHERE character_id=?").get(leader) as {rank:string}|undefined;
      if(!guild || (guild.leader!==leader && actor?.rank!=="officer"))throw new Error("guild_officer_required");
      if(this.cityDisbandPending(guild.id))throw new Error("guild_city_disband_pending");
      if(this.guild(member))throw new Error("guild_already_member");
      const count=this.db.prepare("SELECT COUNT(*) AS n FROM guild_members WHERE guild_id=?").get(guild.id) as {n:number};
      if(count.n>=GUILD_MAX_MEMBERS)throw new Error("guild_full");
      this.db.prepare("INSERT INTO guild_members(member_id,character_id,guild_id,name) VALUES(?,?,?,?)").run(randomUUID(),member,guild.id,memberName);
      this.db.prepare("DELETE FROM guild_applications WHERE character_id=?").run(member);
    });
  }
  directory(character:string,query:string) {
    const rows=this.db.prepare(`SELECT g.id,g.name,leader.name AS leader,COUNT(m.member_id) AS members,
      EXISTS(SELECT 1 FROM guild_applications a WHERE a.guild_id=g.id AND a.character_id=?) AS applied
      FROM guilds g JOIN guild_members m ON m.guild_id=g.id
      JOIN guild_members leader ON leader.guild_id=g.id AND leader.character_id=g.leader
      WHERE instr(lower(g.name),lower(?))>0 AND NOT EXISTS (SELECT 1 FROM guild_city_disbands d WHERE d.guild=g.id)
      GROUP BY g.id ORDER BY g.name_key LIMIT 50`).all(character,query) as {id:string;name:string;leader:string;members:number;applied:number}[];
    return rows.map(row=>({...row,applied:Boolean(row.applied)}));
  }
  applications(actor:string) {
    const guild=this.guild(actor);
    if(!guild)return [];
    const member=this.db.prepare("SELECT rank FROM guild_members WHERE character_id=?").get(actor) as {rank:string}|undefined;
    if(guild.leader!==actor && member?.rank!=="officer")return [];
    return this.db.prepare("SELECT id,name,created FROM guild_applications WHERE guild_id=? ORDER BY created LIMIT 50").all(guild.id) as {id:string;name:string;created:number}[];
  }
  pending(character:string) {
    return this.db.prepare("SELECT g.id,g.name FROM guild_applications a JOIN guilds g ON g.id=a.guild_id WHERE a.character_id=?").get(character) as {id:string;name:string}|undefined;
  }
  apply(character:string,name:string,guildId:string):void {
    this.transaction(()=>{
      if(this.guild(character))throw new Error("guild_already_member");
      if(!this.db.prepare("SELECT id FROM guilds WHERE id=?").get(guildId))throw new Error("guild_not_found");
      if(this.cityDisbandPending(guildId))throw new Error("guild_city_disband_pending");
      const count=this.db.prepare("SELECT COUNT(*) AS n FROM guild_members WHERE guild_id=?").get(guildId) as {n:number};
      if(count.n>=GUILD_MAX_MEMBERS)throw new Error("guild_full");
      if(this.db.prepare("SELECT id FROM guild_applications WHERE character_id=?").get(character))throw new Error("guild_application_exists");
      const waiting=this.db.prepare("SELECT COUNT(*) AS n FROM guild_applications WHERE guild_id=?").get(guildId) as {n:number};
      if(waiting.n>=50)throw new Error("guild_applications_full");
      this.db.prepare("INSERT INTO guild_applications(id,guild_id,character_id,name,created) VALUES(?,?,?,?,?)").run(randomUUID(),guildId,character,name,Date.now());
    });
  }
  cancelApplication(character:string):void { this.db.prepare("DELETE FROM guild_applications WHERE character_id=?").run(character); }
  decideApplication(actor:string,id:string,accept:boolean):void {
    this.transaction(()=>{
      const guild=this.guild(actor),member=this.db.prepare("SELECT rank FROM guild_members WHERE character_id=?").get(actor) as {rank:string}|undefined;
      if(!guild || (guild.leader!==actor && member?.rank!=="officer"))throw new Error("guild_officer_required");
      const application=this.db.prepare("SELECT character_id,name FROM guild_applications WHERE id=? AND guild_id=?").get(id,guild.id) as {character_id:string;name:string}|undefined;
      if(!application)throw new Error("guild_application_missing");
      if(accept){
        if(this.cityDisbandPending(guild.id))throw new Error("guild_city_disband_pending");
        if(this.guild(application.character_id))throw new Error("guild_already_member");
        const count=this.db.prepare("SELECT COUNT(*) AS n FROM guild_members WHERE guild_id=?").get(guild.id) as {n:number};
        if(count.n>=GUILD_MAX_MEMBERS)throw new Error("guild_full");
        this.db.prepare("INSERT INTO guild_members(member_id,character_id,guild_id,name) VALUES(?,?,?,?)").run(randomUUID(),application.character_id,guild.id,application.name);
      }
      this.db.prepare("DELETE FROM guild_applications WHERE id=?").run(id);
    });
  }
  leave(character:string, hasCityAssets?: (guild: string) => boolean):void {
    this.transaction(()=>{
      const guild=this.guild(character);if(!guild)throw new Error("guild_not_member");
      const count=this.db.prepare("SELECT COUNT(*) AS n FROM guild_members WHERE guild_id=?").get(guild.id) as {n:number};
      if(guild.leader===character && count.n>1)throw new Error("guild_transfer_first");
      if(guild.leader===character){
        if(this.cityDisbandPending(guild.id))throw new Error("guild_city_disband_pending");
        if(hasCityAssets?.(guild.id))throw new Error("guild_city_assets");
        this.db.prepare("DELETE FROM guilds WHERE id=?").run(guild.id);
      } else this.db.prepare("DELETE FROM guild_members WHERE character_id=?").run(character);
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
