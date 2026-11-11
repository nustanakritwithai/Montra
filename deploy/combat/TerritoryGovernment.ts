import type {DatabaseSync} from "node:sqlite";
import {CITY_MINING_SITE, CITY_PRODUCTION_SITE, CITY_SITES, type CityOwnership, type CitySite, type CitySupplyRepair, type CityTenure} from "./CityProductionRules.js";

// An income tick is 1/3,600,000 of a guild coin. No fractional income is lost on collection or conquest.
const HOUR=3_600_000;
const upgrades={market:[240,480],warehouse:[180,360],workshop:[120,240]} as const;
type Building=keyof typeof upgrades;
type Focus="balanced"|"trade"|"storage";
type Action=Building|"collect"|"repair"|"focus_balanced"|"focus_trade"|"focus_storage";
export type GovernmentOrder={site:string;revision:number;action:Action};
type Member={id:string;officer:boolean;commander?:boolean};
type Estate={site:string;owner:string|null;settled:number;ticks:number;revision:number;market:number;warehouse:number;workshop:number;damaged:number;focus:Focus;upkeep:number};

export function parseGovernmentOrder(input:unknown):GovernmentOrder|null {
  if(!input || typeof input!=="object" || Array.isArray(input))return null;
  const r=input as Record<string,unknown>;
  if(Object.keys(r).length!==3 || typeof r.site!=="string" || typeof r.revision!=="number" ||
     !Number.isSafeInteger(r.revision) || r.revision<1 || typeof r.action!=="string" ||
     !(r.action==="collect" || r.action==="repair" || r.action==="focus_balanced" || r.action==="focus_trade" || r.action==="focus_storage" || Object.hasOwn(upgrades,r.action)))return null;
  return {site:r.site,revision:r.revision,action:r.action as Action};
}
function terms(e:Estate){
  const base=60+(e.market-1)*15,grossRate=e.focus==="trade"?Math.round(base*1.2):base;
  const upkeep=e.upkeep?10+2*(e.market+e.warehouse+e.workshop-3):0,rate=grossRate-upkeep;
  const hours=8+(e.damaged?0:(e.warehouse-1)*4)+(e.focus==="storage" && !e.damaged?4:0);
  return {rate,grossRate,upkeep,hours,cap:rate*hours,repairCost:60-(e.workshop-1)*20};
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
      CREATE INDEX IF NOT EXISTS guild_treasury_history ON guild_treasury_entries(guild,seq);
      CREATE TABLE IF NOT EXISTS city_supply_repair_receipts(id TEXT PRIMARY KEY);`);
    const columns=db.prepare("PRAGMA table_info(territory_estates)").all();
    if(!columns.some(c=>c.name==="focus"))
      db.exec("ALTER TABLE territory_estates ADD COLUMN focus TEXT NOT NULL DEFAULT 'balanced'");
    if(!columns.some(c=>c.name==="upkeep"))
      db.exec("ALTER TABLE territory_estates ADD COLUMN upkeep INTEGER NOT NULL DEFAULT 0 CHECK(upkeep IN (0,1))");
    // An existing owner starts at deployment. Never mint pre-feature revenue on first visit or restart.
    db.prepare(`INSERT OR IGNORE INTO territory_estates(site,owner,settled)
      SELECT b.site,g.id,? FROM territory_battles b LEFT JOIN guilds g
        ON g.id=CASE WHEN b.ended IS NULL THEN b.incumbent ELSE b.winner END
      WHERE b.seq IN (SELECT MAX(seq) FROM territory_battles GROUP BY site)`).run(Date.now());
    this.initCityTenures();
  }
  private initCityTenures(): void {
    const sites = CITY_SITES.map(site => "'"+site+"'").join(",");
    const siteColumn = `site TEXT NOT NULL DEFAULT '${CITY_PRODUCTION_SITE}'`;
    this.db.exec("SAVEPOINT city_tenure_schema");
    try {
      this.db.exec(`CREATE TABLE IF NOT EXISTS city_tenures (
        id INTEGER PRIMARY KEY, guild TEXT NOT NULL, ended INTEGER, ${siteColumn});`);
      if (!this.db.prepare("PRAGMA table_info(city_tenures)").all().some(column => column.name === "site"))
        this.db.exec(`ALTER TABLE city_tenures ADD COLUMN ${siteColumn};`);
      this.db.exec(`DROP INDEX IF EXISTS city_active_tenure;
        CREATE UNIQUE INDEX IF NOT EXISTS city_active_tenure_by_site ON city_tenures(site) WHERE ended IS NULL;
        INSERT INTO city_tenures(guild,site)
          SELECT e.owner,e.site FROM territory_estates e WHERE e.site IN (${sites}) AND e.owner IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM city_tenures t WHERE t.site=e.site AND t.ended IS NULL);
        DROP TRIGGER IF EXISTS city_ownership_created;
        DROP TRIGGER IF EXISTS city_ownership_changed;
        CREATE TRIGGER city_ownership_created AFTER INSERT ON territory_estates
          WHEN NEW.site IN (${sites}) AND NEW.owner IS NOT NULL
          BEGIN INSERT INTO city_tenures(guild,site) VALUES(NEW.owner,NEW.site); END;
        CREATE TRIGGER city_ownership_changed AFTER UPDATE OF owner ON territory_estates
          WHEN NEW.site IN (${sites}) AND NEW.owner IS NOT OLD.owner
          BEGIN
            UPDATE city_tenures SET ended=CASE WHEN NEW.owner IS NULL AND NEW.revision=OLD.revision
              THEN cast(unixepoch('subsec')*1000 AS INTEGER) ELSE NEW.settled END WHERE site=NEW.site AND ended IS NULL;
            INSERT INTO city_tenures(guild,site) SELECT NEW.owner,NEW.site WHERE NEW.owner IS NOT NULL;
          END;
        RELEASE city_tenure_schema;`);
    } catch (error) {
      this.db.exec("ROLLBACK TO city_tenure_schema; RELEASE city_tenure_schema");
      throw error;
    }
  }
  cityOwnership(previous: number | null, site: CitySite = CITY_PRODUCTION_SITE): CityOwnership {
    const active = this.db.prepare("SELECT id,guild FROM city_tenures WHERE site=? AND ended IS NULL").get(site) as CityTenure | undefined;
    const ended = previous === null || active?.id === previous ? undefined :
      this.db.prepare("SELECT guild,ended FROM city_tenures WHERE id=? AND site=?").get(previous, site);
    const battle = this.db.prepare(`SELECT seq,started,ended,incumbent,winner
      FROM territory_battles WHERE site=? ORDER BY seq DESC LIMIT 1`).get(site);
    const ownership: CityOwnership = {active: active ?? null, previous: null};
    if (battle?.ended === null) ownership.siegeStarted = Number(battle.started);
    else if (site === CITY_MINING_SITE && active && battle?.incumbent === active.guild && battle.winner === active.guild)
      ownership.defense = {seq: Number(battle.seq), started: Number(battle.started), damaged: !!this.estate(site)?.damaged};
    if (typeof ended?.guild === "string" && typeof ended.ended === "number") {
      const capture = this.db.prepare(`SELECT started FROM territory_battles
        WHERE site=? AND incumbent=? AND ended=? AND winner IS NOT NULL AND winner<>incumbent
        ORDER BY seq DESC LIMIT 1`).get(site, ended.guild, ended.ended);
      ownership.previous = {guild: ended.guild, ended: ended.ended};
      if (typeof capture?.started === "number") ownership.previous.siegeStarted = capture.started;
    }
    return ownership;
  }
  repairWithCitySupply(repair: CitySupplyRepair, now: number): boolean {
    this.db.exec("SAVEPOINT city_supply_repair");
    try {
      const repaired = this.applyCitySupplyRepair(repair, now);
      this.db.exec("RELEASE city_supply_repair");
      return repaired;
    } catch (error) {
      this.db.exec("ROLLBACK TO city_supply_repair; RELEASE city_supply_repair");
      throw error;
    }
  }

  private applyCitySupplyRepair(repair: CitySupplyRepair, now: number): boolean {
    if (this.db.prepare("SELECT 1 FROM city_supply_repair_receipts WHERE id=?").get(repair.id)) return true;
    const ownership = this.cityOwnership(repair.epoch, CITY_MINING_SITE);
    if (ownership.active?.id !== repair.epoch || ownership.active.guild !== repair.guild ||
        ownership.defense?.seq !== repair.battle || !ownership.defense.damaged) return false;
    const estate = this.estate(CITY_MINING_SITE)!;
    this.db.prepare("UPDATE territory_estates SET damaged=0,settled=?,ticks=?,revision=revision+1 WHERE site=?")
      .run(Math.max(estate.settled, now), earned(estate, now), CITY_MINING_SITE);
    this.db.prepare("INSERT INTO city_supply_repair_receipts(id) VALUES(?)").run(repair.id);
    return true;
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
  /** Called only inside the atomic battle settlement. */
  creditWarSupplies(guild:string,site:string,at:number,deliveries:number):number {
    if(!Number.isSafeInteger(deliveries) || deliveries<0)throw Error("war_invalid_supply");
    const amount=Math.min(120,deliveries*5);
    this.book(guild,site,at,amount*HOUR,"war_supply");
    return amount;
  }
  bookRoute(guild:string,site:string,at:number,amount:number):void {
    this.book(guild,site,at,amount*HOUR,amount>0?"route_delivery":"route_dispatch");
  }

  // Called in the same transaction as the battle result.
  settleVictory(site:string,winner:string|null,ended:number,breached:boolean,scheduled=false){
    const e=this.estate(site);
    if(!e){
      this.db.prepare("INSERT INTO territory_estates(site,owner,settled,damaged,upkeep) VALUES(?,?,?,?,?)")
        .run(site,winner,ended,Number(breached),Number(scheduled));
      return;
    }
    const at=Math.max(ended,e.settled),ticks=e.owner?earned(e,ended):0;
    const changed=e.owner!==winner;
    if(changed && e.owner)this.book(e.owner,site,ended,ticks,"handover");
    this.db.prepare(`UPDATE territory_estates SET owner=?,settled=?,ticks=?,revision=revision+1,damaged=max(damaged,?),upkeep=max(upkeep,?) WHERE site=?`)
      .run(winner,at,changed?0:ticks,Number(breached),Number(scheduled),site);
  }
  view(site:string,member:Member|null|undefined,now:number){
    if(!member)return;
    const e=this.estate(site);
    if(!e || e.owner!==member.id)return;
    const history=this.db.prepare("SELECT at,reason,delta FROM guild_treasury_entries WHERE guild=? AND site=? ORDER BY seq DESC LIMIT 8").all(member.id,site)
      .map(row=>({at:Number(row.at),reason:String(row.reason),amount:Number(row.delta)/HOUR}));
    return {revision:e.revision,market:e.market,warehouse:e.warehouse,workshop:e.workshop,damaged:!!e.damaged,focus:e.focus,focusCost:60,history,
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
    }else if(act==="focus_balanced" || act==="focus_trade" || act==="focus_storage"){
      const focus=act.slice(6) as Focus;if(e.focus===focus)throw Error("war_focus_unchanged");
      amount=-60;e.focus=focus;
    }else{
      if(e.damaged)throw Error("war_repair_first");
      const cost=price(e,act);if(cost===null)throw Error("war_building_max");
      amount=-cost;e[act]++;
    }
    this.book(member.id,e.site,now,amount*HOUR,act);
    this.db.prepare(`UPDATE territory_estates SET settled=?,ticks=?,damaged=?,market=?,warehouse=?,workshop=?,focus=?,revision=revision+1 WHERE site=?`)
      .run(Math.max(now,e.settled),ticks,e.damaged,e.market,e.warehouse,e.workshop,e.focus,e.site);
    return amount;
  }
}
