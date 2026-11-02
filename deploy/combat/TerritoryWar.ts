import { DatabaseSync } from "node:sqlite";
import { PROVINCES } from "./StrategicProvinces.js";
import {CASTLE_ID,CASTLE_DURATION,newPilot,tickPilot,pilotView,pilotWinner,changeCastleGate,type PilotPresence,type PilotState} from "./CastlePilot.js";

export const WAR_DURATION=5*60_000, WAR_PROTECTION=8*60*60_000, WAR_HOLD=60, WAR_SIDE_SIZE=5;
export const warSites=Object.fromEntries(Object.entries(PROVINCES).filter(([,p])=>p.kind==="territory")
  .map(([id,p])=>[id,p.sites.find(s=>s.kind==="fort")!]));
export type WarMember={id:string;officer:boolean};
type Battle={seq:number;site:string;incumbent:string|null;attacker:string;defender:string|null;started:number;
  progress:number;sample:number;ended:number|null;winner:string|null;gate_hp:number;gate_open:number;pilot_json:string|null};
export type Battlefield={site:string;seq:number};
export type WarSide="attack"|"defend";

export class TerritoryWar {
  private castleWriter:{seq:number;sample:number}|undefined;
  constructor(private readonly db:DatabaseSync){
    db.exec(`CREATE TABLE IF NOT EXISTS territory_battles(
      seq INTEGER PRIMARY KEY,site TEXT NOT NULL,incumbent TEXT,attacker TEXT NOT NULL,defender TEXT,
      started INTEGER NOT NULL,progress REAL NOT NULL DEFAULT 0,sample INTEGER NOT NULL,ended INTEGER,winner TEXT);
      CREATE TABLE IF NOT EXISTS castle_pilot_musters(battle INTEGER NOT NULL,character TEXT NOT NULL,point INTEGER NOT NULL,PRIMARY KEY(battle,character));
      CREATE INDEX IF NOT EXISTS territory_recent ON territory_battles(site,seq DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS territory_one_battle ON territory_battles(site) WHERE ended IS NULL;`);
    const musters=db.prepare("PRAGMA table_info(castle_pilot_musters)").all();
    if(!musters.some(c=>c.name==="camp"))db.exec("ALTER TABLE castle_pilot_musters ADD COLUMN camp INTEGER NOT NULL DEFAULT 0");
    const cols=db.prepare("PRAGMA table_info(territory_battles)").all();
    if(!cols.some(c=>c.name==="gate_hp"))db.exec("ALTER TABLE territory_battles ADD COLUMN gate_hp INTEGER NOT NULL DEFAULT 120");
    if(!cols.some(c=>c.name==="gate_open"))db.exec("ALTER TABLE territory_battles ADD COLUMN gate_open INTEGER NOT NULL DEFAULT 0");
    if(!cols.some(c=>c.name==="pilot_json"))db.exec("ALTER TABLE territory_battles ADD COLUMN pilot_json TEXT");
  }
  private atomic<T>(work:()=>T):T {
    this.db.exec("BEGIN IMMEDIATE");
    try {const value=work();this.db.exec("COMMIT");return value;}
    catch(e){this.db.exec("ROLLBACK");throw e;}
  }
  member(character:string):WarMember|undefined {
    const row=this.db.prepare("SELECT g.id,(g.leader=m.character_id OR m.rank='officer') AS officer FROM guild_members m JOIN guilds g ON g.id=m.guild_id WHERE m.character_id=?").get(character) as {id:string;officer:number}|undefined;
    return row && {id:row.id,officer:Boolean(row.officer)};
  }
  private guildName(id:string|null|undefined):string|null {
    if(!id)return null;
    return (this.db.prepare("SELECT name FROM guilds WHERE id=?").get(id) as {name:string}|undefined)?.name ?? null;
  }
  private latest(site:string):Battle|undefined {
    if(!Object.hasOwn(warSites,site))throw Error("war_unknown");
    return this.db.prepare("SELECT * FROM territory_battles WHERE site=? ORDER BY seq DESC LIMIT 1").get(site) as Battle|undefined;
  }
  private finish(b:Battle,winner:string|null,ended:number){
    this.db.prepare("UPDATE territory_battles SET ended=?,winner=? WHERE seq=? AND ended IS NULL").run(ended,winner,b.seq);
  }
  private current(site:string,now:number):Battle|undefined {
    const b=this.latest(site);
    if(!b || b.ended!==null)return b;
    const end=b.started+(site===CASTLE_ID?CASTLE_DURATION:WAR_DURATION);
    if(this.guildName(b.attacker)){
      if(now<end)return b;
      // Let a live field commit the interval ending at the deadline before a world-room observer settles it.
      if(b.pilot_json && this.castleWriter?.seq===b.seq && this.castleWriter.sample===b.sample &&
        end-b.sample<=2000 && now-b.sample<=2000)return b;
    }
    const at=Math.min(now,end);
    let winner=this.guildName(b.incumbent)?b.incumbent:null;
    if(b.pilot_json && now>=end){
      const side=pilotWinner(JSON.parse(b.pilot_json));
      const candidate=side==="attack"?b.attacker:side==="defend"?b.defender:null;
      if(this.guildName(candidate))winner=candidate;
    }
    this.finish(b,winner,at);
    return this.latest(site);
  }
  inspect(site:string,now:number){
    const b=this.current(site,now),active=b?.ended===null;
    const ownerId=active?b.incumbent:b?.winner;
    const owner=this.guildName(ownerId);
    const phase=active?"battle":b?.ended!=null && now<b.ended+WAR_PROTECTION?"protected":"open";
    return {seq:b?.seq??0,phase,owner,ownerId:owner?ownerId:null,attacker:active?b.attacker:null,defender:active?b.defender:null,
      attackName:active?this.guildName(b.attacker):null,defendName:active?this.guildName(b.defender):null,
      gateHp:active?b.gate_hp:120,gateClosed:!!(active && b.gate_hp>0 && !b.gate_open),
      pilot:b?.pilot_json?pilotView(JSON.parse(b.pilot_json)):undefined,
      progress:active?b.progress:0,seconds:active?Math.max(0,Math.ceil((b.started+(site===CASTLE_ID?CASTLE_DURATION:WAR_DURATION)-now)/1000)):0};
  }
  start(site:string,member:WarMember,now:number):Battlefield {
    return this.atomic(()=>{
      const s=this.inspect(site,now);
      if(!member.officer)throw Error("war_officer");
      if(s.phase!=="open" || s.ownerId===member.id)throw Error("war_unavailable");
      const row=this.db.prepare("INSERT INTO territory_battles(site,incumbent,attacker,defender,started,sample) VALUES(?,?,?,?,?,?)")
        .run(site,s.ownerId??null,member.id,s.ownerId??null,now,now);
      if(site===CASTLE_ID)this.db.prepare("UPDATE territory_battles SET pilot_json=? WHERE seq=?").run(JSON.stringify(newPilot(!!s.ownerId)),row.lastInsertRowid);
      return {site,seq:Number(row.lastInsertRowid)};
    });
  }
  side(field:Battlefield,member:WarMember,now:number,enlist=false):WarSide {
    const s=this.inspect(field.site,now);
    if(s.seq!==field.seq || s.phase!=="battle")throw Error("war_ended");
    if(member.id===s.attacker)return "attack";
    if(member.id===s.defender)return "defend";
    if(!s.owner && !s.defendName && member.officer){
      if(enlist)this.db.prepare("UPDATE territory_battles SET defender=? WHERE seq=? AND ended IS NULL").run(member.id,field.seq);
      return "defend";
    }
    throw Error("war_other_guild");
  }
  muster(field:Battlefield,character:string,point:number):number {
    this.db.prepare("INSERT OR IGNORE INTO castle_pilot_musters(battle,character,point) VALUES(?,?,?)").run(field.seq,character,point);
    return (this.db.prepare("SELECT point FROM castle_pilot_musters WHERE battle=? AND character=?").get(field.seq,character) as {point:number}).point;
  }
  campPreference(field:Battlefield,character:string,select?:number):number {
    if(select!==undefined)this.db.prepare("UPDATE castle_pilot_musters SET camp=? WHERE battle=? AND character=?").run(select,field.seq,character);
    const row=this.db.prepare("SELECT camp FROM castle_pilot_musters WHERE battle=? AND character=?").get(field.seq,character);
    return Number(row?.camp??0);
  }
  gate(field:Battlefield,side:WarSide,occupied:boolean,now:number,relaySide:WarSide|null=null):void{
    this.atomic(()=>{
      const b=this.current(field.site,now);
      if(!b || b.seq!==field.seq || b.ended!==null || !b.gate_hp)throw Error("war_gate_inactive");
      if(side==="attack"){
        if(b.gate_open)throw Error("war_gate_open");
        const damage=PROVINCES[field.site].relay?.effect==="gate" && relaySide?(relaySide==="attack"?30:10):15;
        this.db.prepare("UPDATE territory_battles SET gate_hp=max(0,gate_hp-?) WHERE seq=?").run(damage,b.seq);
      }else{
        if(b.gate_open && occupied)throw Error("war_gate_occupied");
        this.db.prepare("UPDATE territory_battles SET gate_open=? WHERE seq=?").run(b.gate_open?0:1,b.seq);
      }
    });
  }
  castleGate(field:Battlefield,id:string,side:WarSide,occupied:boolean,now:number,repair:boolean){
    return this.atomic(()=>{
      const b=this.current(field.site,now);
      if(!b?.pilot_json || b.seq!==field.seq || b.ended!==null || now>=b.started+CASTLE_DURATION)throw Error("war_gate_inactive");
      const state:PilotState=JSON.parse(b.pilot_json);
      changeCastleGate(state,id,side,occupied,now,repair);
      this.db.prepare("UPDATE territory_battles SET pilot_json=? WHERE seq=?").run(JSON.stringify(state),b.seq);
      return pilotView(state).gates!;
    });
  }
  advance(field:Battlefield,now:number,attack:number,defend:number,presence?:PilotPresence,previousSample?:number,relaySide:WarSide|null=null):void {
    this.atomic(()=>{
      const b=field.site===CASTLE_ID?this.latest(field.site):this.current(field.site,now);
      if(!b || b.seq!==field.seq || b.ended!==null || now<=b.sample)return;
      // Only sampled live seconds count. Never credit a vacant or stopped room for elapsed time.
      const elapsed=Math.min(1,(now-b.sample)/1000),net=Math.max(-2,Math.min(2,attack-defend));
      if(b.pilot_json){
        if(!presence)return;
        const pilot:PilotState=JSON.parse(b.pilot_json);
        // A delayed normal sample still measures wall time. A long gap cannot earn offline capture or score.
        const gap=now-b.sample;
        const deadline=b.started+CASTLE_DURATION,cutoff=Math.min(now,deadline);
        let sample=cutoff;
        if(!this.guildName(b.attacker)){this.current(field.site,now);return;}
        if(previousSample===b.sample && gap<=2000)
          sample=b.sample+tickPilot(pilot,presence,cutoff-b.sample,b.sample-b.started);
        this.db.prepare("UPDATE territory_battles SET pilot_json=?,sample=? WHERE seq=?").run(JSON.stringify(pilot),sample,b.seq);
        this.castleWriter={seq:b.seq,sample};
        if(pilot.siege?.victor || now>=deadline){
          const winner=pilotWinner(pilot),candidate=winner==="attack"?b.attacker:winner==="defend"?b.defender:b.incumbent;
          this.finish(b,this.guildName(candidate)?candidate:this.guildName(b.incumbent)?b.incumbent:null,sample);
          this.castleWriter=undefined;
        }
        return;
      }
      const min=b.incumbent?0:-WAR_HOLD;
      const supported=PROVINCES[field.site].relay?.effect==="banner" && ((net>0 && relaySide==="attack") || (net<0 && relaySide==="defend"));
      const rate=supported?net+Math.sign(net):net;
      const progress=Math.min(WAR_HOLD,Math.max(min,b.progress+rate*elapsed));
      this.db.prepare("UPDATE territory_battles SET progress=?,sample=? WHERE seq=?").run(progress,now,b.seq);
      if(progress>=WAR_HOLD)this.finish(b,b.attacker,now);
      else if(progress<=-WAR_HOLD && b.defender && this.guildName(b.defender))this.finish(b,b.defender,now);
    });
  }
}
