import { DatabaseSync } from "node:sqlite";
import { PROVINCES } from "./StrategicProvinces.js";
import {TerritoryGovernment,type GovernmentOrder} from "./TerritoryGovernment.js";
import {RIVER_CITY,RIVER_WAR_DURATION,newRiverBattle,changeRiverGate,sampleRiverPosts,riverSupplied,type RiverBattle,type RiverCensus} from "./RiverCity.js";
import {CASTLE_ID,CASTLE_DURATION,newPilot,tickPilot,pilotView,pilotWinner,changeCastleGate,type PilotPresence,type PilotState} from "./CastlePilot.js";

export const WAR_DURATION=5*60_000, WAR_PROTECTION=8*60*60_000, WAR_HOLD=60, WAR_SIDE_SIZE=5;
// Only direct player-versus-player damage inside an active war uses this floor.
// HP, actual levels, equipment and saved character stats remain unchanged.
export const WAR_ENTRY_FLOOR_LEVEL=40;
export const WAR_PARTICIPATION_INTERVAL_MS=30_000;
export const WAR_SUPPLY_INTERVAL_MS=120_000;
export const WAR_CARGO_COOLDOWN_MS=60_000;
/** A modest repeatable EXP award, tied to active objective participation. */
export function warParticipationExperience(xpToNext:number):number {
  if(!Number.isSafeInteger(xpToNext) || xpToNext<0)throw Error("war_invalid_experience");
  return xpToNext===0?0:Math.max(1,Math.floor(xpToNext*0.025));
}
export function warEntryDamageFactor(attackerLevel:number,defenderLevel:number):number {
  if(!Number.isInteger(attackerLevel) || !Number.isInteger(defenderLevel) || attackerLevel<1 || defenderLevel<1)throw Error("war_invalid_level");
  const scale=(level:number)=>1+(Math.min(level,100)-1)/15;
  return (scale(Math.max(WAR_ENTRY_FLOOR_LEVEL,attackerLevel))/scale(attackerLevel)) *
    (scale(defenderLevel)/scale(Math.max(WAR_ENTRY_FLOOR_LEVEL,defenderLevel)));
}
const warDuration=(site:string)=>site===CASTLE_ID?CASTLE_DURATION:site===RIVER_CITY?RIVER_WAR_DURATION:WAR_DURATION;
export const warSites=Object.fromEntries(Object.entries(PROVINCES).filter(([,p])=>p.kind==="territory")
  .map(([id,p])=>[id,p.sites.find(s=>s.kind==="fort")!]));
export type WarMember={id:string;officer:boolean;commander?:boolean};
type Battle={seq:number;site:string;incumbent:string|null;attacker:string;defender:string|null;started:number;
  progress:number;sample:number;ended:number|null;winner:string|null;gate_hp:number;gate_open:number;gates_json:string|null;pilot_json:string|null;city_json:string|null};
export type FieldGate={hp:number;open:boolean};
export type FieldGateView={hp:number;closed:boolean};
const GATE_HP=120;
const fieldGateIds=(site:string)=>PROVINCES[site]?.rampart?.gates.map(g=>g.id) ?? [];
/** Ordinary fields store one state per gate. Rows written before gates_json existed
 * seed every gate from the legacy single gate_hp/gate_open pair. */
function fieldGates(b:Pick<Battle,"site"|"gate_hp"|"gate_open"|"gates_json">):Record<string,FieldGate>{
  const saved=b.gates_json?JSON.parse(b.gates_json) as Record<string,FieldGate>:{};
  return Object.fromEntries(fieldGateIds(b.site).map(id=>[id,saved[id] ?? {hp:b.gate_hp,open:!!b.gate_open}]));
}
const gateViews=(gates:Record<string,FieldGate>,active:boolean)=>Object.fromEntries(Object.entries(gates)
  .map(([id,g])=>[id,{hp:active?g.hp:GATE_HP,closed:active && g.hp>0 && !g.open}])) as Record<string,FieldGateView>;
export type Battlefield={site:string;seq:number};
export type WarSide="attack"|"defend";

export class TerritoryWar {
  readonly government:TerritoryGovernment;
  private castleWriter:{seq:number;sample:number}|undefined;
  constructor(private readonly db:DatabaseSync){
    db.exec(`CREATE TABLE IF NOT EXISTS territory_battles(
      seq INTEGER PRIMARY KEY,site TEXT NOT NULL,incumbent TEXT,attacker TEXT NOT NULL,defender TEXT,
      started INTEGER NOT NULL,progress REAL NOT NULL DEFAULT 0,sample INTEGER NOT NULL,ended INTEGER,winner TEXT);
      CREATE TABLE IF NOT EXISTS castle_pilot_musters(battle INTEGER NOT NULL,character TEXT NOT NULL,point INTEGER NOT NULL,PRIMARY KEY(battle,character));
      CREATE TABLE IF NOT EXISTS territory_supply_deliveries(battle INTEGER NOT NULL,character TEXT NOT NULL,guild TEXT NOT NULL,side TEXT NOT NULL,at INTEGER NOT NULL,token TEXT NOT NULL UNIQUE);
      CREATE INDEX IF NOT EXISTS territory_supply_battle ON territory_supply_deliveries(battle,guild);
      CREATE INDEX IF NOT EXISTS territory_supply_character ON territory_supply_deliveries(battle,character,at);
      CREATE INDEX IF NOT EXISTS territory_recent ON territory_battles(site,seq DESC);
      CREATE UNIQUE INDEX IF NOT EXISTS territory_one_battle ON territory_battles(site) WHERE ended IS NULL;`);
    const musters=db.prepare("PRAGMA table_info(castle_pilot_musters)").all();
    if(!musters.some(c=>c.name==="camp"))db.exec("ALTER TABLE castle_pilot_musters ADD COLUMN camp INTEGER NOT NULL DEFAULT 0");
    const cols=db.prepare("PRAGMA table_info(territory_battles)").all();
    if(!cols.some(c=>c.name==="gate_hp"))db.exec("ALTER TABLE territory_battles ADD COLUMN gate_hp INTEGER NOT NULL DEFAULT 120");
    if(!cols.some(c=>c.name==="gate_open"))db.exec("ALTER TABLE territory_battles ADD COLUMN gate_open INTEGER NOT NULL DEFAULT 0");
    // Additive only: legacy gate_hp/gate_open stay and remain a summary (lowest HP, any gate open).
    if(!cols.some(c=>c.name==="gates_json"))db.exec("ALTER TABLE territory_battles ADD COLUMN gates_json TEXT");
    if(!cols.some(c=>c.name==="pilot_json"))db.exec("ALTER TABLE territory_battles ADD COLUMN pilot_json TEXT");
    if(!cols.some(c=>c.name==="city_json"))db.exec("ALTER TABLE territory_battles ADD COLUMN city_json TEXT");
    this.government=new TerritoryGovernment(db);
  }
  private atomic<T>(work:()=>T):T {
    this.db.exec("BEGIN IMMEDIATE");
    try {const value=work();this.db.exec("COMMIT");return value;}
    catch(e){this.db.exec("ROLLBACK");throw e;}
  }
  member(character:string):WarMember|undefined {
    const row=this.db.prepare("SELECT g.id,g.leader=m.character_id AS commander,m.rank FROM guild_members m JOIN guilds g ON g.id=m.guild_id WHERE m.character_id=?").get(character) as {id:string;commander:number;rank:string}|undefined;
    return row && {id:row.id,officer:!!row.commander || row.rank==="officer",commander:!!row.commander};
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
    // inspect() can finish an expired war outside an existing write transaction.
    this.db.exec("SAVEPOINT settle_territory");
    try{
      const changed=this.db.prepare("UPDATE territory_battles SET ended=?,winner=? WHERE seq=? AND ended IS NULL").run(ended,winner,b.seq).changes;
      if(changed){
        const siege=b.pilot_json?(JSON.parse(b.pilot_json) as PilotState).siege:undefined;
        const gates=siege?.gates ?? (b.city_json?(JSON.parse(b.city_json) as RiverBattle).gates:undefined);
        const breached=gates?Object.values(gates).some(g=>g.hp===0):Object.values(fieldGates(b)).some(g=>g.hp===0);
        this.government.settleVictory(b.site,winner,ended,breached);
        if(winner){
          const row=this.db.prepare("SELECT count(*) AS n FROM territory_supply_deliveries WHERE battle=? AND guild=?").get(b.seq,winner);
          this.government.creditWarSupplies(winner,b.site,ended,Number(row?.n ?? 0));
        }
      }
      this.db.exec("RELEASE settle_territory");
    }catch(error){this.db.exec("ROLLBACK TO settle_territory; RELEASE settle_territory");throw error;}
  }
  private current(site:string,now:number):Battle|undefined {
    const b=this.latest(site);
    if(!b || b.ended!==null)return b;
    const end=b.started+warDuration(site);
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
    // A vacant-field timeout has no victor and must not lock out the next war.
    // Owned-field timeouts still award the incumbent a defensive victory.
    const gates=b && !b.pilot_json && !b.city_json?gateViews(fieldGates(b),active):undefined;
    const views=gates?Object.values(gates):[];
    const phase=active?"battle":b?.winner && b.ended!=null && now<b.ended+WAR_PROTECTION?"protected":"open";
    return {seq:b?.seq??0,phase,owner,ownerId:owner?ownerId:null,attacker:active?b.attacker:null,defender:active?b.defender:null,
      attackName:active?this.guildName(b.attacker):null,defendName:active?this.guildName(b.defender):null,
      gateHp:views.length?Math.min(...views.map(g=>g.hp)):active?b.gate_hp:GATE_HP,gateClosed:views.some(g=>g.closed),gates,
      pilot:b?.pilot_json?pilotView(JSON.parse(b.pilot_json)):undefined,
      river:b?.city_json?JSON.parse(b.city_json) as RiverBattle:undefined,
      progress:active?b.progress:0,seconds:active?Math.max(0,Math.ceil((b.started+warDuration(site)-now)/1000)):0,
      phaseEndsAt:active?b.started+warDuration(site):phase==="protected" && b?.ended!=null?b.ended+WAR_PROTECTION:null};
  }
  govern(character:string,order:GovernmentOrder,now:number){
    return this.atomic(()=>{
      const s=this.inspect(order.site,now);
      if(s.phase==="battle")throw Error("war_government_battle");
      const member=this.member(character);
      if(!member || member.id!==s.ownerId)throw Error("war_not_owner");
      return this.government.apply(order,member,now);
    });
  }
  supplyReadyAt(field:Battlefield,character:string):number {
    const row=this.db.prepare("SELECT MAX(at) AS last FROM territory_supply_deliveries WHERE battle=? AND character=?").get(field.seq,character);
    return row?.last==null ? 0 : Number(row.last)+WAR_CARGO_COOLDOWN_MS;
  }
  supplyCount(field:Battlefield,guild:string):number {
    const row=this.db.prepare("SELECT count(*) AS n FROM territory_supply_deliveries WHERE battle=? AND guild=?").get(field.seq,guild);
    return Number(row?.n ?? 0);
  }
  deliverSupply(field:Battlefield,character:string,side:WarSide,token:string,now:number):void {
    if(!/^[0-9a-f-]{36}$/.test(token) || !Number.isSafeInteger(now) || now<0)throw Error("war_invalid_supply");
    this.atomic(()=>{
      const member=this.member(character);
      if(!member || this.side(field,member,now)!==side)throw Error("war_supply_side");
      if(this.db.prepare("SELECT 1 FROM territory_supply_deliveries WHERE token=?").get(token))throw Error("war_supply_duplicate");
      if(now<this.supplyReadyAt(field,character))throw Error("war_supply_cooldown");
      this.db.prepare("INSERT INTO territory_supply_deliveries(battle,character,guild,side,at,token) VALUES(?,?,?,?,?,?)")
        .run(field.seq,character,member.id,side,now,token);
    });
  }
  start(site:string,member:WarMember,now:number):Battlefield {
    return this.atomic(()=>{
      const s=this.inspect(site,now);
      if(!member.officer)throw Error("war_officer");
      if(s.phase!=="open" || s.ownerId===member.id)throw Error("war_unavailable");
      this.government.beginBattle(site,s.ownerId??null,now);
      const row=this.db.prepare("INSERT INTO territory_battles(site,incumbent,attacker,defender,started,sample) VALUES(?,?,?,?,?,?)")
        .run(site,s.ownerId??null,member.id,s.ownerId??null,now,now);
      if(site===CASTLE_ID)this.db.prepare("UPDATE territory_battles SET pilot_json=? WHERE seq=?").run(JSON.stringify(newPilot(!!s.ownerId)),row.lastInsertRowid);
      if(site===RIVER_CITY)this.db.prepare("UPDATE territory_battles SET city_json=? WHERE seq=?").run(JSON.stringify(newRiverBattle(!!s.ownerId)),row.lastInsertRowid);
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
  /** Changes one ordinary-field gate; omitted gateId keeps legacy callers on the first gate. */
  gate(field:Battlefield,side:WarSide,occupied:boolean,now:number,relaySide:WarSide|null=null,gateId?:string):Record<string,FieldGateView>{
    return this.atomic(()=>{
      const b=this.current(field.site,now);
      if(!b || b.seq!==field.seq || b.ended!==null || b.pilot_json || b.city_json)throw Error("war_gate_inactive");
      const gates=fieldGates(b),id=gateId ?? fieldGateIds(field.site)[0],gate=id!==undefined?gates[id]:undefined;
      if(!gate || !gate.hp)throw Error("war_gate_inactive");
      if(side==="attack"){
        if(gate.open)throw Error("war_gate_open");
        const damage=PROVINCES[field.site].relay?.effect==="gate" && relaySide?(relaySide==="attack"?30:10):15;
        gate.hp=Math.max(0,gate.hp-damage);
      }else{
        if(gate.open && occupied)throw Error("war_gate_occupied");
        gate.open=!gate.open;
      }
      const all=Object.values(gates);
      this.db.prepare("UPDATE territory_battles SET gates_json=?,gate_hp=?,gate_open=? WHERE seq=?")
        .run(JSON.stringify(gates),Math.min(...all.map(g=>g.hp)),all.some(g=>g.open)?1:0,b.seq);
      return gateViews(gates,true);
    });
  }
  riverGate(field:Battlefield,id:string,side:WarSide,occupied:boolean,now:number){
    return this.atomic(()=>{
      const b=this.current(field.site,now);
      if(!b?.city_json || field.seq!==b.seq || b.ended!==null)throw Error("war_gate_inactive");
      const city=JSON.parse(b.city_json) as RiverBattle;
      changeRiverGate(city,id,side,occupied);
      this.db.prepare("UPDATE territory_battles SET city_json=? WHERE seq=?").run(JSON.stringify(city),b.seq);
      return city.gates;
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
  advance(field:Battlefield,now:number,attack:number,defend:number,presence?:PilotPresence,previousSample?:number,relaySide:WarSide|null=null,riverPresence?:RiverCensus):void {
    this.atomic(()=>{
      const b=field.site===CASTLE_ID?this.latest(field.site):this.current(field.site,now);
      if(!b || b.seq!==field.seq || b.ended!==null || now<=b.sample)return;
      // Only sampled live seconds count. Never credit a vacant or stopped room for elapsed time.
      const elapsed=Math.min(1,(now-b.sample)/1000);
      let net=Math.max(-2,Math.min(2,attack-defend));
      if(b.city_json){
        if(!riverPresence)return;
        const city=JSON.parse(b.city_json) as RiverBattle;
        sampleRiverPosts(city,riverPresence,elapsed);
        if(net && !riverSupplied(city,net>0?"attack":"defend"))net=0;
        this.db.prepare("UPDATE territory_battles SET city_json=? WHERE seq=?").run(JSON.stringify(city),b.seq);
      }
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
