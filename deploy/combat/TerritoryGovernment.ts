import type {DatabaseSync} from "node:sqlite";

// An income tick is 1/3,600,000 of a guild coin. No fractional income is lost on collection or conquest.
const HOUR=3_600_000;
const upgrades={market:[240,480],warehouse:[180,360],workshop:[120,240]} as const;
type Building=keyof typeof upgrades;
type Action=Building|"collect"|"repair";
export type GovernmentOrder={site:string;revision:number;action:Action};
type Member={id:string;officer:boolean;commander?:boolean};
type Estate={site:string;owner:string|null;settled:number;ticks:number;revision:number;market:number;warehouse:number;workshop:number;damaged:number};

export function parseGovernmentOrder(input:unknown):GovernmentOrder|null {
  if(!input || typeof input!=="object" || Array.isArray(input))return null;
  const r=input as Record<string,unknown>;
  if(Object.keys(r).length!==3 || typeof r.site!=="string" || typeof r.revision!=="number" ||
     !Number.isSafeInteger(r.revision) || r.revision<1 || typeof r.action!=="string" ||
     !(r.action==="collect" || r.action==="repair" || Object.hasOwn(upgrades,r.action)))return null;
  return {site:r.site,revision:r.revision,action:r.action as Action};
}
function terms(e:Estate){
  const rate=60+(e.market-1)*15, hours=8+(e.damaged?0:(e.warehouse-1)*4);
  return {rate,hours,cap:rate*hours,repairCost:60-(e.workshop-1)*20};
}
function earned(e:Estate,now:number){
  const {rate,cap}=terms(e);
  // Preserve already stored income even if a damaged warehouse temporarily loses its extra capacity.
  return Math.max(e.ticks,Math.min(cap*HOUR,e.ticks+Math.max(0,now-e.settled)*rate));
}
function price(e:Estate,building:Building):number|null {return upgrades[building][e[building]-1]??null;}

export class TerritoryGovernment {
  constructor(private readonly db:DatabaseSync){
    db.exec(`CREATE TABLE IF NOT EXISTS territory_estates(
      site TEXT PRIMARY KEY, owner TEXT REFERENCES guilds(id) ON DELETE SET NULL, settled INTEGER NOT NULL,
      ticks INTEGER NOT NULL DEFAULT 0 CHECK(ticks>=0), revision INTEGER NOT NULL DEFAULT 1,
      market INTEGER NOT NULL DEFAULT 1 CHECK(market BETWEEN 1 AND 3),
      warehouse INTEGER NOT NULL DEFAULT 1 CHECK(warehouse BETWEEN 1 AND 3),
      workshop INTEGER NOT NULL DEFAULT 1 CHECK(workshop BETWEEN 1 AND 3),
      damaged INTEGER NOT NULL DEFAULT 0 CHECK(damaged IN (0,1)));
      CREATE TABLE IF NOT EXISTS guild_treasuries(guild TEXT PRIMARY KEY REFERENCES guilds(id) ON DELETE CASCADE,
        ticks INTEGER NOT NULL CHECK(ticks>=0));
      CREATE TABLE IF NOT EXISTS guild_treasury_entries(seq INTEGER PRIMARY KEY,
        guild TEXT NOT NULL REFERENCES guilds(id) ON DELETE CASCADE, site TEXT NOT NULL, at INTEGER NOT NULL,
        reason TEXT NOT NULL, delta INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS guild_treasury_history ON guild_treasury_entries(guild,seq);`);
    // An existing owner starts at deployment. Never mint pre-feature revenue on first visit or restart.
    db.prepare(`INSERT OR IGNORE INTO territory_estates(site,owner,settled)
      SELECT b.site,g.id,? FROM territory_battles b LEFT JOIN guilds g
        ON g.id=CASE WHEN b.ended IS NULL THEN b.incumbent ELSE b.winner END
      WHERE b.seq IN (SELECT MAX(seq) FROM territory_battles GROUP BY site)`).run(Date.now());
  }
  beginBattle(site:string,owner:string|null,now:number){
    this.db.prepare("INSERT OR IGNORE INTO territory_estates(site,owner,settled) VALUES(?,?,?)").run(site,owner,now);
  }
  private estate(site:string){return this.db.prepare("SELECT * FROM territory_estates WHERE site=?").get(site) as Estate|undefined;}
  balance(guild:string):number {
    const row=this.db.prepare("SELECT ticks FROM guild_treasuries WHERE guild=?").get(guild);
    return Math.floor(Number(row?.ticks??0)/HOUR);
  }
  private book(guild:string,site:string,at:number,delta:number,reason:string){
    if(delta===0)return;
    if(delta>0)this.db.prepare(`INSERT INTO guild_treasuries(guild,ticks) VALUES(?,?)
      ON CONFLICT(guild) DO UPDATE SET ticks=ticks+excluded.ticks`).run(guild,delta);
    else if(!this.db.prepare("UPDATE guild_treasuries SET ticks=ticks+? WHERE guild=? AND ticks>=?").run(delta,guild,-delta).changes)
      throw Error("war_funds");
    this.db.prepare("INSERT INTO guild_treasury_entries(guild,site,at,reason,delta) VALUES(?,?,?,?,?)").run(guild,site,at,reason,delta);
  }
  // Called in the same transaction as the battle result.
  settleVictory(site:string,winner:string|null,ended:number,breached:boolean){
    const e=this.estate(site);
    if(!e){
      this.db.prepare("INSERT INTO territory_estates(site,owner,settled,damaged) VALUES(?,?,?,?)").run(site,winner,ended,Number(breached));
      return;
    }
    const at=Math.max(ended,e.settled),ticks=e.owner?earned(e,ended):0;
    const changed=e.owner!==winner;
    if(changed && e.owner)this.book(e.owner,site,ended,ticks,"handover");
    this.db.prepare(`UPDATE territory_estates SET owner=?,settled=?,ticks=?,revision=revision+1,damaged=max(damaged,?) WHERE site=?`)
      .run(winner,at,changed?0:ticks,Number(breached),site);
  }
  view(site:string,member:Member|null|undefined,now:number){
    if(!member)return;
    const e=this.estate(site);
    if(!e || e.owner!==member.id)return;
    return {revision:e.revision,market:e.market,warehouse:e.warehouse,workshop:e.workshop,damaged:!!e.damaged,
      ...terms(e),available:Math.floor(earned(e,now)/HOUR),balance:this.balance(member.id),
      prices:{market:price(e,"market"),warehouse:price(e,"warehouse"),workshop:price(e,"workshop")},
      officer:member.officer,commander:member.commander===true};
  }
  // Caller holds BEGIN IMMEDIATE and has settled any outstanding battle before looking up membership.
  apply(order:GovernmentOrder,member:Member|undefined,now:number){
    const e=this.estate(order.site);
    if(!member || !e || e.owner!==member.id)throw Error("war_not_owner");
    const act=order.action;
    if(act==="collect"?!member.officer:!member.commander)throw Error("war_government_role");
    if(e.revision!==order.revision)throw Error("war_government_stale");
    let ticks=earned(e,now),amount:number;
    if(act==="collect"){
      const whole=Math.floor(ticks/HOUR)*HOUR;
      if(!whole)throw Error("war_no_income");
      amount=whole/HOUR;ticks-=whole;
    }else if(act==="repair"){
      if(!e.damaged)throw Error("war_no_damage");
      amount=-terms(e).repairCost;e.damaged=0;
    }else{
      if(e.damaged)throw Error("war_repair_first");
      const cost=price(e,act);if(cost===null)throw Error("war_building_max");
      amount=-cost;e[act]++;
    }
    this.book(member.id,e.site,now,amount*HOUR,act);
    this.db.prepare(`UPDATE territory_estates SET settled=?,ticks=?,damaged=?,market=?,warehouse=?,workshop=?,revision=revision+1 WHERE site=?`)
      .run(Math.max(now,e.settled),ticks,e.damaged,e.market,e.warehouse,e.workshop,e.site);
    return amount;
  }
}
