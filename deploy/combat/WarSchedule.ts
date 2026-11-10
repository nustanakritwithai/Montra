import type {DatabaseSync} from "node:sqlite";
import {ALL_MAP_WARS_ENABLED} from "./WarMapProfiles.js";

export const SCHEDULED_WARS_ENABLED=process.env.MONTRA_SCHEDULED_WARS==="1";
export const CIVILIAN_WAR_FIELDS_ENABLED=ALL_MAP_WARS_ENABLED ||
  process.env.MONTRA_WORLD_EXPANSION==="1" && process.env.MONTRA_CIVILIAN_WAR_FIELDS==="1";
export const WAR_CITY_CAP=2;
const DAY=86_400_000,WEEK=7*DAY,LOCK_NOTICE=15*60_000;
const MONDAY_20_BANGKOK=Date.UTC(1970,0,5,13);
const dayByCity:Readonly<Record<string,number>>={
  ritual_village:0,
  moon_pass:1,
  river_watch:2,
  sam_lan_estuary:3,
  mantra_capital:4,
  tri_wiang_castle:5,
};

export function hasWarSchedule(site:string):boolean {
  return SCHEDULED_WARS_ENABLED && Object.hasOwn(dayByCity,site);
}

export function warWindows(site:string,now:number,duration:number){
  if(!Object.hasOwn(dayByCity,site))throw Error("war_unknown");
  const anchor=MONDAY_20_BANGKOK+dayByCity[site]*DAY;
  const startsAt=anchor+Math.floor((now-anchor)/WEEK)*WEEK;
  const nextStartsAt=startsAt+WEEK;
  return {
    current:now<startsAt+duration?{startsAt,endsAt:startsAt+duration}:null,
    next:{startsAt:nextStartsAt,locksAt:nextStartsAt-LOCK_NOTICE,endsAt:nextStartsAt+duration},
  };
}

export type WarRegistration={site:string;startsAt:number;memberIds:string[]};
export function parseWarRegistration(input:unknown):WarRegistration|null {
  if(!input || typeof input!=="object" || Array.isArray(input))return null;
  const {site,startsAt,memberIds}=input as Record<string,unknown>;
  if(Object.keys(input).length!==3 || typeof site!=="string" || site.length>40 ||
    typeof startsAt!=="number" || !Number.isSafeInteger(startsAt) || startsAt<0 ||
    !Array.isArray(memberIds) || memberIds.length>10 ||
    !memberIds.every(id=>typeof id==="string" && /^[a-z0-9-]{1,64}$/i.test(id)) ||
    new Set(memberIds).size!==memberIds.length)return null;
  return {site,startsAt,memberIds};
}

type Signup={guild:string;registered:number;lastPlayed:number;held:number;roster:string[]};
type Round={seq:number|null;attack:string|null;defend:string|null};

export class WarSchedule {
  constructor(private readonly db:DatabaseSync){
    db.exec(`CREATE TABLE IF NOT EXISTS war_signups(
      site TEXT NOT NULL,starts INTEGER NOT NULL,guild TEXT NOT NULL,registered INTEGER NOT NULL,roster TEXT NOT NULL,
      PRIMARY KEY(site,starts,guild));
      CREATE TABLE IF NOT EXISTS war_rounds(
        site TEXT NOT NULL,starts INTEGER NOT NULL,seq INTEGER UNIQUE,attack TEXT,defend TEXT,PRIMARY KEY(site,starts));
      CREATE TABLE IF NOT EXISTS war_locked_roster(
        battle INTEGER NOT NULL,character TEXT NOT NULL,guild TEXT NOT NULL,PRIMARY KEY(battle,character));
      CREATE INDEX IF NOT EXISTS war_round_attack ON war_rounds(attack,site,starts);
      CREATE INDEX IF NOT EXISTS war_round_defend ON war_rounds(defend,site,starts);`);
  }

  ownedCities(guild:string):number {
    return Number(this.db.prepare("SELECT count(*) AS n FROM territory_estates WHERE owner=?").get(guild)?.n);
  }

  registration(site:string,startsAt:number,guild:string):string[]|null {
    const row=this.db.prepare("SELECT roster FROM war_signups WHERE site=? AND starts=? AND guild=?").get(site,startsAt,guild);
    return row?JSON.parse(String(row.roster)) as string[]:null;
  }

  register(order:WarRegistration,guild:string,now:number):void {
    const {site,startsAt,memberIds}=order;
    const member=this.db.prepare("SELECT 1 FROM guild_members WHERE guild_id=? AND member_id=?");
    if(!memberIds.every(id=>member.get(guild,id)))throw Error("war_roster_member");
    if(!memberIds.length){
      this.db.prepare("DELETE FROM war_signups WHERE site=? AND starts=? AND guild=?").run(site,startsAt,guild);
      return;
    }
    this.db.prepare(`INSERT INTO war_signups(site,starts,guild,registered,roster) VALUES(?,?,?,?,?)
      ON CONFLICT(site,starts,guild) DO UPDATE SET roster=excluded.roster`).run(site,startsAt,guild,now,JSON.stringify(memberIds));
  }

  round(site:string,starts:number):Round|undefined {
    return this.db.prepare("SELECT seq,attack,defend FROM war_rounds WHERE site=? AND starts=?").get(site,starts) as Round|undefined;
  }

  forBattle(seq:number):Round|undefined {
    return this.db.prepare("SELECT seq,attack,defend FROM war_rounds WHERE seq=?").get(seq) as Round|undefined;
  }

  isRostered(seq:number,character:string,guild:string):boolean {
    return !!this.db.prepare("SELECT 1 FROM war_locked_roster WHERE battle=? AND character=? AND guild=?").get(seq,character,guild);
  }

  signups(site:string,starts:number):Signup[] {
    const rows=this.db.prepare(`SELECT s.guild,s.registered,s.roster,
      (SELECT count(*) FROM territory_estates e WHERE e.owner=s.guild) AS held,
      coalesce((SELECT max(r.starts) FROM war_rounds r WHERE r.site=s.site AND (r.attack=s.guild OR r.defend=s.guild)),0) AS lastPlayed
      FROM war_signups s JOIN guilds g ON g.id=s.guild WHERE s.site=? AND s.starts=?
      ORDER BY (held>0),lastPlayed,s.registered,s.guild`).all(site,starts);
    const members=this.db.prepare("SELECT member_id,character_id FROM guild_members WHERE guild_id=?");
    return rows.flatMap(row=>{
      const guild=String(row.guild),ids=new Set(JSON.parse(String(row.roster)) as string[]);
      const roster=members.all(guild).filter(member=>ids.has(String(member.member_id))).map(member=>String(member.character_id));
      return roster.length?[{guild,registered:Number(row.registered),held:Number(row.held),lastPlayed:Number(row.lastPlayed),roster}]:[];
    });
  }

  lock(site:string,starts:number,seq:number|null,attack:Signup|null,defender:string|null,defend:Signup|null):void {
    this.db.prepare("INSERT INTO war_rounds(site,starts,seq,attack,defend) VALUES(?,?,?,?,?)")
      .run(site,starts,seq,attack?.guild??null,defender);
    if(seq===null)return;
    const insert=this.db.prepare("INSERT INTO war_locked_roster(battle,character,guild) VALUES(?,?,?)");
    for(const signup of [attack,defend])for(const id of signup?.roster??[])insert.run(seq,id,signup!.guild);
  }
}
