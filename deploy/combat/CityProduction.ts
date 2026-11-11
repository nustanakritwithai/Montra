import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {
  CITY_CAPACITY, CITY_DURATION_MS, CITY_FACTORY_COSTS, CITY_HAUL_AMOUNT, CITY_HAUL_DURATION_MS, CITY_LINES,
  CITY_MARKET_BUDGET, CITY_MARKET_QUANTITY, CITY_MARKET_SHELF, CITY_MARKET_TARGET, cityMarketPrices,
  CITY_MINING_ORE, CITY_MINING_PRODUCT, CITY_MINING_SITE,
  CITY_MISSION_HOURS, CITY_MISSION_MAX_REWARD, CITY_MISSION_ORE_COUNT, CITY_MISSION_POST_LIMIT, CITY_MISSION_WORKERS,
  CITY_POLICY_COOLDOWN_MS, CITY_POLICY_PURCHASE_AMOUNT, CITY_POLICY_SPEED,
  CITY_PRODUCT, CITY_PRODUCTION_SITE,
  CITY_PURCHASE_AMOUNT, CITY_PURCHASE_DURATION_MS, CITY_PURCHASE_MAX_PRICE, CITY_RAW_ITEMS, CITY_RECIPE, CITY_RUSH_GOLD, CITY_SITES,
  CITY_MINING_WAREHOUSE_MATERIALS, CITY_WAREHOUSE_CAPACITY, CITY_WAREHOUSE_DURATION_MS, CITY_WAREHOUSE_REQUIREMENTS,
  CITY_SUPPLY_MATERIALS, CITY_SUPPLY_RECOVERY_SPEED, CITY_WORKSHOP_FEE, CITY_WORKSHOP_SLOTS,
  otherCity, type CityAsset, type CityDisband, type CityHaulOrder, type CityItem, type CityMarketOrder, type CityMember,
  type CityMissionOrder, type CityOwnership, type CityOwnerships, type CityPolicy, type CitySite, type CitySupplyOrder, type CitySupplyRepair,
} from "./CityProductionRules.js";

type Job = {id: string; site: CitySite; product: CityItem; epoch: number; guild: string; ready: number;
  wood: number; stone: number; quantity: number; fee: number};
type Factory = {epoch: number | null; guild: string | null; level: 0 | 1 | 2};
type Stock = {epoch: number; item: CityItem; quantity: number};
type GuildListing = {id: string; guild: string; name: string; epoch: number; item: CityItem; quantity: number; price: number};
type DisbandClaim = {guildId: string; name: string; item: CityAsset; amount: number};
type WarehouseProject = {
  epoch: number; site: CitySite; guild: string; wood: number; stone: number; metal: number;
  ready: number | null; status: "collecting" | "building";
};
type WorkshopJob = {id: string; readyAt: number; item: CityItem; quantity: number};
type PurchaseOrder = {
  id: string; epoch: number; guild: string; name: string; amount: number;
  remaining: number; unitPrice: number; expiresAt: number;
};
type Mission = {id: string; epoch: number; guild: string; name: string; audience: "guild" | "public";
  slots: number; completed: number; reward: number; expires: number; purpose: "stock" | "warehouse"};
type Haul = {id: string; source: CitySite; sourceEpoch: number; sender: string; name: string;
  destination: CitySite; destinationEpoch: number; receiver: string; item: CityItem; amount: number;
  reward: number; expires: number; audience: "guild" | "public"; state: "pending" | "open" | "carrying";
  courier: string | null};
type Policy = {mode: CityPolicy; changed: number};
type Supply = {id: string; epoch: number; guild: string; reserved: number; state: "held" | "repair_pending"};
type LocalMarket = {epoch: number; site: CitySite; guild: string; open: number; stockLimit: number; shelf: number; budget: number};
type Treasury = {sales: number; workshops: number; rushPaid: number; rushHeld: number; purchasePaid: number;
  purchaseHeld: number; missionPaid: number; missionHeld: number; haulPaid: number; haulHeld: number;
  localSales: number; localPaid: number; localHeld: number};
type Release = {guild: string; gold: number};
const purchaseTable = `CREATE TABLE IF NOT EXISTS city_purchase_orders (
  id TEXT PRIMARY KEY, epoch INTEGER NOT NULL, guild TEXT NOT NULL, name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND ${CITY_POLICY_PURCHASE_AMOUNT}),
  remaining INTEGER NOT NULL CHECK(remaining BETWEEN 0 AND amount),
  unit_price INTEGER NOT NULL CHECK(unit_price BETWEEN 1 AND ${CITY_PURCHASE_MAX_PRICE}),
  expires INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('open','filled','expired','cancelled')),
  CHECK((remaining=0)=(state='filled')));`;
const purchaseIndexes = `CREATE UNIQUE INDEX IF NOT EXISTS city_purchase_one_open ON city_purchase_orders((1)) WHERE state='open';
  CREATE INDEX IF NOT EXISTS city_purchase_guild ON city_purchase_orders(guild);`;
const activeHauls = "state IN ('pending','open','carrying')";
const activeSupplies = "state IN ('held','repair_pending')";
const supplySpace = CITY_SUPPLY_MATERIALS.reduce((total, material) => total + material.amount, 0);

export class CityProduction {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS city_factory (
        id INTEGER PRIMARY KEY CHECK(id=1), epoch INTEGER, guild TEXT, level INTEGER NOT NULL CHECK(level BETWEEN 0 AND 2),
        CHECK((epoch IS NULL)=(guild IS NULL)));
      INSERT OR IGNORE INTO city_factory(id,level) VALUES(1,0);
      CREATE TABLE IF NOT EXISTS city_factory_sites (
        site TEXT PRIMARY KEY, epoch INTEGER UNIQUE, guild TEXT, level INTEGER NOT NULL CHECK(level BETWEEN 0 AND 2),
        CHECK((epoch IS NULL)=(guild IS NULL)));
      INSERT OR IGNORE INTO city_factory_sites(site,epoch,guild,level)
        SELECT '${CITY_PRODUCTION_SITE}',epoch,guild,level FROM city_factory WHERE id=1;
      CREATE TABLE IF NOT EXISTS city_stock (
        epoch INTEGER NOT NULL, guild TEXT NOT NULL, item TEXT NOT NULL,
        quantity INTEGER NOT NULL CHECK(quantity>0), PRIMARY KEY(epoch,item));
      CREATE INDEX IF NOT EXISTS city_stock_guild ON city_stock(guild,epoch);
      CREATE TABLE IF NOT EXISTS city_jobs (
        id TEXT PRIMARY KEY, epoch INTEGER NOT NULL, guild TEXT NOT NULL, ready INTEGER NOT NULL,
        wood INTEGER NOT NULL, stone INTEGER NOT NULL, quantity INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('running','complete','cancelled')));
      CREATE UNIQUE INDEX IF NOT EXISTS city_one_running_job ON city_jobs(epoch) WHERE status='running';
      CREATE TABLE IF NOT EXISTS city_warehouse_projects (
        epoch INTEGER PRIMARY KEY, guild TEXT NOT NULL, site TEXT NOT NULL DEFAULT '${CITY_PRODUCTION_SITE}',
        wood INTEGER NOT NULL DEFAULT 0 CHECK(wood>=0), stone INTEGER NOT NULL DEFAULT 0 CHECK(stone>=0),
        metal INTEGER NOT NULL DEFAULT 0 CHECK(metal>=0), ready INTEGER,
        status TEXT NOT NULL CHECK(status IN ('collecting','building','complete','cancelled')));
      CREATE TABLE IF NOT EXISTS city_workshop_jobs (
        id TEXT PRIMARY KEY, actor TEXT NOT NULL, epoch INTEGER NOT NULL, guild TEXT NOT NULL,
        ready INTEGER NOT NULL, item TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0),
        fee INTEGER NOT NULL CHECK(fee>0), claimed INTEGER NOT NULL DEFAULT 0 CHECK(claimed IN (0,1)));
      CREATE UNIQUE INDEX IF NOT EXISTS city_workshop_one_job ON city_workshop_jobs(actor) WHERE claimed=0;
      CREATE INDEX IF NOT EXISTS city_workshop_running ON city_workshop_jobs(ready) WHERE claimed=0;
      CREATE INDEX IF NOT EXISTS city_workshop_revenue ON city_workshop_jobs(guild);
      ${purchaseTable}
      ${purchaseIndexes}
      CREATE TABLE IF NOT EXISTS city_economic_policies (
        epoch INTEGER PRIMARY KEY, guild TEXT NOT NULL, mode TEXT NOT NULL CHECK(mode IN ('industry','procurement')),
        changed INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS city_treasury_events (
        seq INTEGER PRIMARY KEY, guild TEXT NOT NULL, at INTEGER NOT NULL, kind TEXT NOT NULL,
        gold INTEGER NOT NULL CHECK(gold>=0));
      CREATE INDEX IF NOT EXISTS city_treasury_recent ON city_treasury_events(guild,seq DESC);
      CREATE TABLE IF NOT EXISTS city_missions (
        id TEXT PRIMARY KEY, epoch INTEGER NOT NULL, guild TEXT NOT NULL, name TEXT NOT NULL,
        audience TEXT NOT NULL CHECK(audience IN ('guild','public')),
        slots INTEGER NOT NULL CHECK(slots BETWEEN 1 AND ${CITY_MISSION_WORKERS}),
        completed INTEGER NOT NULL DEFAULT 0 CHECK(completed BETWEEN 0 AND slots),
        reward INTEGER NOT NULL CHECK(reward BETWEEN 1 AND ${CITY_MISSION_MAX_REWARD}),
        expires INTEGER NOT NULL, state TEXT NOT NULL CHECK(state IN ('open','closed')),
        purpose TEXT NOT NULL DEFAULT 'stock' CHECK(purpose IN ('stock','warehouse')),
        CHECK(state<>'open' OR completed<slots));
      CREATE INDEX IF NOT EXISTS city_mission_guild ON city_missions(guild);
      CREATE INDEX IF NOT EXISTS city_mission_open_epoch ON city_missions(epoch) WHERE state='open';
      CREATE TABLE IF NOT EXISTS city_mission_workers (
        mission TEXT NOT NULL REFERENCES city_missions(id), actor TEXT NOT NULL,
        progress INTEGER NOT NULL DEFAULT 0 CHECK(progress BETWEEN 0 AND ${CITY_MISSION_ORE_COUNT}),
        state TEXT NOT NULL CHECK(state IN ('active','complete','cancelled')), PRIMARY KEY(mission,actor));
      CREATE UNIQUE INDEX IF NOT EXISTS city_mission_one_active ON city_mission_workers(actor) WHERE state='active';
      CREATE TABLE IF NOT EXISTS guild_market_gold (
        listing TEXT PRIMARY KEY REFERENCES listings(id), guild TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK(amount>0));
      CREATE INDEX IF NOT EXISTS guild_market_gold_owner ON guild_market_gold(guild);
      CREATE INDEX IF NOT EXISTS city_jobs_guild ON city_jobs(guild);
      CREATE TABLE IF NOT EXISTS city_guild_closures (
        guild TEXT PRIMARY KEY, actor TEXT NOT NULL, name TEXT NOT NULL, closed INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS city_guild_closures_actor ON city_guild_closures(actor);
      CREATE TABLE IF NOT EXISTS city_hauls (
        id TEXT PRIMARY KEY, source TEXT NOT NULL, sourceEpoch INTEGER NOT NULL, sender TEXT NOT NULL, name TEXT NOT NULL,
        destination TEXT NOT NULL CHECK(destination<>source), destinationEpoch INTEGER NOT NULL, receiver TEXT NOT NULL,
        item TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND ${CITY_HAUL_AMOUNT}),
        reward INTEGER NOT NULL CHECK(reward BETWEEN 1 AND ${CITY_MISSION_MAX_REWARD}), expires INTEGER NOT NULL,
        audience TEXT NOT NULL CHECK(audience IN ('guild','public')), courier TEXT,
        state TEXT NOT NULL CHECK(state IN ('pending','open','carrying','delivered','cancelled')),
        CHECK(state NOT IN ('carrying','delivered') OR courier IS NOT NULL));
      CREATE UNIQUE INDEX IF NOT EXISTS city_haul_per_origin ON city_hauls(sourceEpoch) WHERE ${activeHauls};
      CREATE UNIQUE INDEX IF NOT EXISTS city_haul_per_courier ON city_hauls(courier) WHERE state='carrying';
      CREATE INDEX IF NOT EXISTS city_haul_sender ON city_hauls(sender);
      CREATE TABLE IF NOT EXISTS city_supply_reserves (
        id TEXT PRIMARY KEY, epoch INTEGER NOT NULL, guild TEXT NOT NULL, reserved INTEGER NOT NULL, battle INTEGER,
        state TEXT NOT NULL CHECK(state IN ('held','repair_pending','used','cancelled')),
        CHECK(state<>'repair_pending' OR battle IS NOT NULL));
      CREATE UNIQUE INDEX IF NOT EXISTS city_supply_per_tenure ON city_supply_reserves(epoch) WHERE ${activeSupplies};
      CREATE TABLE IF NOT EXISTS city_local_markets (
        epoch INTEGER PRIMARY KEY, site TEXT NOT NULL, guild TEXT NOT NULL,
        open INTEGER NOT NULL CHECK(open IN (0,1)), stockLimit INTEGER NOT NULL CHECK(stockLimit BETWEEN 1 AND ${CITY_MARKET_TARGET[2]}),
        shelf INTEGER NOT NULL DEFAULT 0 CHECK(shelf BETWEEN 0 AND ${CITY_MARKET_SHELF}),
        budget INTEGER NOT NULL DEFAULT 0 CHECK(budget BETWEEN 0 AND ${CITY_MARKET_BUDGET}));
      CREATE TABLE IF NOT EXISTS city_local_market_trades (
        seq INTEGER PRIMARY KEY, site TEXT NOT NULL, epoch INTEGER NOT NULL, guild TEXT NOT NULL,
        actor TEXT NOT NULL, at INTEGER NOT NULL, amount INTEGER NOT NULL CHECK(amount BETWEEN 1 AND ${CITY_MARKET_QUANTITY}),
        total INTEGER NOT NULL CHECK(total>0));
      CREATE INDEX IF NOT EXISTS city_local_market_guild ON city_local_market_trades(guild,site,seq);
      CREATE INDEX IF NOT EXISTS city_local_market_actor ON city_local_market_trades(actor,seq);
      CREATE INDEX IF NOT EXISTS city_local_market_epoch ON city_local_market_trades(epoch,seq);
      CREATE TABLE IF NOT EXISTS city_disband_assets (
        guild TEXT NOT NULL REFERENCES city_guild_closures(guild), item TEXT NOT NULL,
        awarded INTEGER NOT NULL CHECK(awarded>0),
        claimed INTEGER NOT NULL DEFAULT 0 CHECK(claimed>=0 AND claimed<=awarded), PRIMARY KEY(guild,item));`);
    const factorySite = db.prepare("INSERT OR IGNORE INTO city_factory_sites(site,level) VALUES(?,0)");
    for (const site of CITY_SITES) factorySite.run(site);
    this.migrateWarehouseProjects();
    const columns = new Set(db.prepare("PRAGMA table_info(city_jobs)").all().map(column => column.name));
    for (const [name, definition] of [
      ["fee", "INTEGER NOT NULL DEFAULT 0 CHECK(fee>=0)"],
      ["site", `TEXT NOT NULL DEFAULT '${CITY_PRODUCTION_SITE}'`],
      ["product", `TEXT NOT NULL DEFAULT '${CITY_PRODUCT}'`],
    ]) {
      if (!columns.has(name)) db.exec(`ALTER TABLE city_jobs ADD COLUMN ${name} ${definition}`);
    }
    const purchaseSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='city_purchase_orders'").get()?.sql;
    if (typeof purchaseSql === "string" && purchaseSql.includes(`CHECK(amount BETWEEN 1 AND ${CITY_PURCHASE_AMOUNT})`)) {
      db.exec("SAVEPOINT city_purchase_limit");
      try {
        db.exec(`ALTER TABLE city_purchase_orders RENAME TO city_purchase_orders_old;
          ${purchaseTable}
          INSERT INTO city_purchase_orders(id,epoch,guild,name,amount,remaining,unit_price,expires,state)
            SELECT id,epoch,guild,name,amount,remaining,unit_price,expires,state FROM city_purchase_orders_old;
          DROP TABLE city_purchase_orders_old;
          ${purchaseIndexes}
          RELEASE city_purchase_limit;`);
      } catch (error) {
        db.exec("ROLLBACK TO city_purchase_limit; RELEASE city_purchase_limit");
        throw error;
      }
    }
  }

  private migrateWarehouseProjects(): void {
    this.db.exec("SAVEPOINT city_warehouse_sites");
    try {
      if (!this.db.prepare("PRAGMA table_info(city_warehouse_projects)").all().some(column => column.name === "site"))
        this.db.exec(`ALTER TABLE city_warehouse_projects ADD COLUMN site TEXT NOT NULL DEFAULT '${CITY_PRODUCTION_SITE}';`);
      if (!this.db.prepare("PRAGMA table_info(city_missions)").all().some(column => column.name === "purpose"))
        this.db.exec("ALTER TABLE city_missions ADD COLUMN purpose TEXT NOT NULL DEFAULT 'stock' CHECK(purpose IN ('stock','warehouse'));");
      this.db.exec(`DROP INDEX IF EXISTS city_warehouse_completed;
        CREATE UNIQUE INDEX IF NOT EXISTS city_warehouse_completed_by_site ON city_warehouse_projects(site) WHERE status='complete';
        RELEASE city_warehouse_sites;`);
    } catch (error) {
      this.db.exec("ROLLBACK TO city_warehouse_sites; RELEASE city_warehouse_sites");
      throw error;
    }
  }

  private factory(site: CitySite): Factory {
    return this.db.prepare("SELECT epoch,guild,level FROM city_factory_sites WHERE site=?").get(site) as Factory;
  }

  epoch(site: CitySite): number | null {
    return this.factory(site).epoch;
  }

  private running(epoch: number): Job | undefined {
    return this.db.prepare("SELECT * FROM city_jobs WHERE epoch=? AND status='running'").get(epoch) as Job | undefined;
  }

  /** The caller holds the economy write transaction. Use the committed handover time on catch-up. */
  reconcile(ownership: CityOwnership, now: number, site: CitySite): void {
    const {epoch, guild} = this.factory(site);
    const active = ownership.active?.id ?? null;
    if (epoch !== null) {
      const owner = epoch === active ? ownership.active : ownership.previous;
      if (!owner || owner.guild !== guild) throw Error("city_ownership_unavailable");
      const cutoff = "ended" in owner ? owner.ended : now;
      const job = this.running(epoch);
      if (job && (job.site !== site || job.guild !== owner.guild)) throw Error("city_ownership_unavailable");
      if (job && job.ready <= cutoff) {
        this.completeJob(job);
      } else if (job && epoch !== active) {
        this.cancelJob(job, cutoff);
      }
      const siege = "ended" in owner ? owner.siegeStarted : ownership.siegeStarted;
      this.settleWarehouse(site, epoch, owner.guild, Math.min(cutoff, siege ?? cutoff), epoch !== active);
      if (epoch !== active) {
        const market = this.localMarket(epoch);
        if (market) this.releaseLocalMarket(market, cutoff);
      }
    }
    if (epoch !== active)
      this.db.prepare("UPDATE city_factory_sites SET epoch=?,guild=? WHERE site=?").run(active, ownership.active?.guild ?? null, site);
    this.cancelHauls(`expires<=? OR (source=? AND sourceEpoch IS NOT ?) OR (destination=? AND destinationEpoch IS NOT ?)`,
      now, now, site, active, site, active);
    if (site === CITY_MINING_SITE) {
      const reserves = this.db.prepare(`SELECT * FROM city_supply_reserves WHERE state='held' AND epoch IS NOT ?`).all(active) as Supply[];
      for (const supply of reserves) this.refundSupply(supply);
      this.released("purchase_release", now, this.db.prepare(`UPDATE city_purchase_orders
        SET state=CASE WHEN epoch IS NOT ? THEN 'cancelled' ELSE 'expired' END
        WHERE state='open' AND (epoch IS NOT ? OR expires<=?) RETURNING guild,remaining*unit_price AS gold`).all(active, active, now) as Release[]);
      this.released("mission_release", now, this.db.prepare(`UPDATE city_missions SET state='closed'
        WHERE state='open' AND (epoch IS NOT ? OR expires<=?) RETURNING guild,(slots-completed)*reward AS gold`).all(active, now) as Release[]);
      this.releaseClosedMissions();
    }
  }

  private completeJob(job: Job): void {
    this.add(job.epoch, job.guild, job.product, job.quantity);
    this.db.prepare("UPDATE city_jobs SET status='complete' WHERE id=?").run(job.id);
    if (job.fee) this.treasuryEvent(job.guild, job.ready, "rush_paid", job.fee);
  }

  private cancelJob(job: Job, at: number): void {
    const [first, second] = CITY_LINES[job.site].inputs;
    this.add(job.epoch, job.guild, first, job.wood);
    this.add(job.epoch, job.guild, second, job.stone);
    this.db.prepare("UPDATE city_jobs SET status='cancelled' WHERE id=?").run(job.id);
    if (job.fee) this.treasuryEvent(job.guild, at, "rush_release", job.fee);
  }

  private treasury(guild: string) {
    const values = this.db.prepare(`SELECT
      (SELECT coalesce(sum(amount),0) FROM guild_market_gold WHERE guild=?) AS sales,
      (SELECT coalesce(sum(fee),0) FROM city_workshop_jobs WHERE guild=?) AS workshops,
      (SELECT coalesce(sum(fee),0) FROM city_jobs WHERE guild=? AND status='complete') AS rushPaid,
      (SELECT coalesce(sum(fee),0) FROM city_jobs WHERE guild=? AND status='running') AS rushHeld,
      (SELECT coalesce(sum((amount-remaining)*unit_price),0) FROM city_purchase_orders WHERE guild=?) AS purchasePaid,
      (SELECT coalesce(sum(remaining*unit_price),0) FROM city_purchase_orders WHERE guild=? AND state='open') AS purchaseHeld,
      (SELECT coalesce(sum(completed*reward),0) FROM city_missions WHERE guild=?) AS missionPaid,
      (SELECT coalesce(sum((slots-completed)*reward),0) FROM city_missions WHERE guild=? AND state='open') AS missionHeld,
      (SELECT coalesce(sum(reward),0) FROM city_hauls WHERE sender=? AND state='delivered') AS haulPaid,
      (SELECT coalesce(sum(reward),0) FROM city_hauls WHERE sender=? AND ${activeHauls}) AS haulHeld,
      (SELECT coalesce(sum(total),0) FROM city_local_market_trades WHERE guild=? AND site=?) AS localSales,
      (SELECT coalesce(sum(total),0) FROM city_local_market_trades WHERE guild=? AND site=?) AS localPaid,
      (SELECT coalesce(sum(budget),0) FROM city_local_markets WHERE guild=?) AS localHeld`)
      .get(guild, guild, guild, guild, guild, guild, guild, guild, guild, guild,
        guild, CITY_PRODUCTION_SITE, guild, CITY_MINING_SITE, guild) as Treasury;
    const earned = values.sales + values.workshops + values.localSales;
    const paid = values.rushPaid + values.purchasePaid + values.missionPaid + values.haulPaid + values.localPaid;
    const held = values.rushHeld + values.purchaseHeld + values.missionHeld + values.haulHeld + values.localHeld;
    return {...values, earned, paid, held, available: earned - paid - held};
  }

  private marketGold(guild: string): number {
    return this.treasury(guild).available;
  }

  private treasuryEvent(guild: string, at: number, kind: string, gold: number): void {
    this.db.prepare("INSERT INTO city_treasury_events(guild,at,kind,gold) VALUES(?,?,?,?)").run(guild, at, kind, gold);
  }

  private localMarket(epoch: number): LocalMarket | undefined {
    return this.db.prepare("SELECT * FROM city_local_markets WHERE epoch=?").get(epoch) as LocalMarket | undefined;
  }

  hasLocalMarketAssets(): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM city_local_markets WHERE shelf>0 OR budget>0 LIMIT 1").get());
  }

  private releaseLocalMarket(market: LocalMarket, at: number): void {
    if (market.shelf) this.add(market.epoch, market.guild, CITY_PRODUCT, market.shelf);
    if (market.budget) this.treasuryEvent(market.guild, at, "local_market_release", market.budget);
    this.db.prepare("UPDATE city_local_markets SET open=0,shelf=0,budget=0 WHERE epoch=?").run(market.epoch);
  }

  private localMarketDemand(market: LocalMarket) {
    const onHand = this.stockQuantity(market.epoch, market.guild, CITY_PRODUCT);
    const pending = this.db.prepare(`SELECT
      (SELECT coalesce(sum(remaining),0) FROM city_purchase_orders WHERE epoch=? AND state='open') +
      (SELECT coalesce(sum(amount),0) FROM city_hauls WHERE destinationEpoch=? AND item=? AND state IN ('open','carrying')) AS total`)
      .get(market.epoch, market.epoch, CITY_PRODUCT);
    return {onHand, incoming: Number(pending?.total ?? 0)};
  }

  private localMarketQuote(market: LocalMarket) {
    if (market.site === CITY_PRODUCTION_SITE) {
      const prices = cityMarketPrices(market.site, market.shelf, market.stockLimit, 0, 0);
      return {prices, status: prices.length ? "open" : "empty"};
    }
    const {onHand, incoming} = this.localMarketDemand(market);
    const stock = onHand + incoming, free = this.capacity(market.site) - this.used(market.epoch);
    const prices = cityMarketPrices(market.site, stock, market.stockLimit, market.budget, free);
    return {prices, status: prices.length ? "open" : stock >= market.stockLimit ? "target" : free <= 0 ? "capacity" : "budget"};
  }

  localMarketView(site: CitySite, ownership: CityOwnership, member: CityMember | undefined, enabled: boolean) {
    const active = ownership.active;
    const market = active && this.localMarket(active.id);
    const closed = !active ? "unowned" : !enabled ? "disabled" : ownership.siegeStarted !== undefined ? "siege" : !market?.open ? "paused" : null;
    const quote = !closed && market ? this.localMarketQuote(market) : {status: closed ?? "paused", prices: []};
    const origin = site === CITY_PRODUCTION_SITE;
    const manage = active && member?.officer && member.id === active.guild && !this.closureActor(member.id);
    return {
      site, epoch: active?.id ?? null, siege: ownership.siegeStarted !== undefined, ...quote,
      lastTrade: active ? this.db.prepare("SELECT at,amount,total FROM city_local_market_trades WHERE epoch=? ORDER BY seq DESC LIMIT 1")
        .get(active.id) ?? null : null,
      manage: manage ? {
        commander: member.commander === true, configured: !!market, open: !!market?.open,
        shelf: market?.shelf ?? 0, budget: market?.budget ?? 0,
        limit: market?.stockLimit ?? (origin ? CITY_MARKET_SHELF : CITY_MARKET_TARGET[1]),
        minLimit: origin ? 1 : CITY_MARKET_TARGET[0], maxLimit: origin ? CITY_MARKET_SHELF : CITY_MARKET_TARGET[2],
        stock: this.stockQuantity(active.id, member.id, CITY_PRODUCT), gold: this.marketGold(member.id),
        maxBudget: CITY_MARKET_BUDGET,
        incoming: !origin && market ? this.localMarketDemand(market).incoming : 0,
        history: this.db.prepare("SELECT at,amount,total FROM city_local_market_trades WHERE guild=? AND site=? ORDER BY seq DESC LIMIT 10")
          .all(member.id, site),
      } : null,
    };
  }

  localMarketHistory(actor: string) {
    return this.db.prepare("SELECT at,site,amount,total FROM city_local_market_trades WHERE actor=? ORDER BY seq DESC LIMIT 10").all(actor);
  }

  configureLocalMarket(member: CityMember, order: Exclude<CityMarketOrder, {action: "local_market_trade"}>,
    ownership: CityOwnership, now: number) {
    this.requireCity(member, order.epoch, ownership, order.site);
    this.requireOfficer(member);
    if (this.closureActor(member.id)) throw Error("city_disband_pending");
    if (ownership.siegeStarted !== undefined) throw Error("city_market_siege");
    if (order.action !== "local_market_stock" && !member.commander) throw Error("city_commander_required");
    const market = this.localMarket(order.epoch);
    if (order.action === "local_market_config") {
      if ((market?.shelf ?? 0) > order.limit) throw Error("city_market_shelf_limit");
      this.db.prepare(`INSERT INTO city_local_markets(epoch,site,guild,open,stockLimit) VALUES(?,?,?,?,?)
        ON CONFLICT(epoch) DO UPDATE SET open=excluded.open,stockLimit=excluded.stockLimit`)
        .run(order.epoch, order.site, member.id, Number(order.open), order.limit);
      return {site: order.site, limit: order.limit};
    }
    if (!market) throw Error("city_market_config_required");
    const {amount} = order;
    if (order.action === "local_market_stock") {
      const shelf = market.shelf + amount;
      if (shelf < 0 || shelf > market.stockLimit) throw Error("city_market_shelf_limit");
      if (amount > 0) this.take(market.epoch, market.guild, CITY_PRODUCT, amount);
      else this.add(market.epoch, market.guild, CITY_PRODUCT, -amount);
      this.db.prepare("UPDATE city_local_markets SET shelf=? WHERE epoch=?").run(shelf, market.epoch);
    } else {
      const budget = market.budget + amount;
      if (budget < 0 || budget > CITY_MARKET_BUDGET) throw Error("city_market_budget");
      if (amount > 0 && amount > this.marketGold(member.id)) throw Error("city_market_funds");
      this.db.prepare("UPDATE city_local_markets SET budget=? WHERE epoch=?").run(budget, market.epoch);
      this.treasuryEvent(member.id, now, amount > 0 ? "local_market_hold" : "local_market_release", Math.abs(amount));
    }
    return {site: order.site, amount};
  }

  tradeAtLocalMarket(actor: string, order: Extract<CityMarketOrder, {action: "local_market_trade"}>, ownership: CityOwnership, now: number) {
    const active = ownership.active, {site, epoch, amount, total} = order;
    if (!active || active.id !== epoch || this.epoch(site) !== epoch) throw Error("city_ownership_changed");
    if (this.closureActor(active.guild)) throw Error("city_disband_pending");
    if (ownership.siegeStarted !== undefined) throw Error("city_market_siege");
    const market = this.localMarket(epoch);
    if (!market?.open || market.guild !== active.guild) throw Error("city_market_closed");
    const {prices} = this.localMarketQuote(market);
    if (prices.length < amount) throw Error("city_market_quantity");
    const actual = prices.slice(0, amount).reduce((sum, price) => sum + price, 0);
    if (actual !== total) throw Error("city_market_price_changed");
    const buyer = site === CITY_PRODUCTION_SITE;
    if (buyer) {
      this.db.prepare("UPDATE city_local_markets SET shelf=shelf-? WHERE epoch=?").run(amount, epoch);
    } else {
      this.add(epoch, active.guild, CITY_PRODUCT, amount);
      this.db.prepare("UPDATE city_local_markets SET budget=budget-? WHERE epoch=?").run(total, epoch);
    }
    this.db.prepare("INSERT INTO city_local_market_trades(site,epoch,guild,actor,at,amount,total) VALUES(?,?,?,?,?,?,?)")
      .run(site, epoch, active.guild, actor, now, amount, total);
    this.treasuryEvent(active.guild, now, buyer ? "local_market_income" : "local_market_paid", total);
    return {site, amount, total};
  }

  private released(kind: string, now: number, rows: Release[]): void {
    for (const {guild, gold} of rows) if (gold) this.treasuryEvent(guild, now, kind, gold);
  }

  private policy(epoch: number | null): Policy | undefined {
    return this.db.prepare("SELECT mode,changed FROM city_economic_policies WHERE epoch=?").get(epoch) as Policy | undefined;
  }

  private purchaseLimit(epoch: number | null): number {
    return this.policy(epoch)?.mode === "procurement" ? CITY_POLICY_PURCHASE_AMOUNT : CITY_PURCHASE_AMOUNT;
  }

  private productionDuration(site: CitySite, epoch: number | null, level: Factory["level"], rush = false): number {
    const factor = site === CITY_MINING_SITE && this.policy(epoch)?.mode === "industry" ? CITY_POLICY_SPEED : 1;
    return Math.round(CITY_DURATION_MS[level] * factor / (rush ? 2 : 1));
  }

  governanceView(member: CityMember, ownership: CityOwnership) {
    this.requireOfficer(member);
    const active = ownership.active;
    if (!active || active.guild !== member.id || this.closureActor(member.id)) throw Error("city_not_owner");
    const policy = this.policy(active.id);
    return {
      site: CITY_MINING_SITE, epoch: active.id, policy: policy?.mode ?? null,
      nextAt: policy ? policy.changed + CITY_POLICY_COOLDOWN_MS : 0,
      commander: member.commander === true, siege: ownership.siegeStarted !== undefined,
      treasury: this.treasury(member.id), used: this.used(active.id), capacity: this.capacity(CITY_MINING_SITE),
      supply: this.supplyView(active, ownership),
      stock: this.db.prepare("SELECT item,quantity FROM city_stock WHERE guild=? AND epoch=? ORDER BY item").all(member.id, active.id),
      history: this.db.prepare("SELECT at,kind,gold FROM city_treasury_events WHERE guild=? ORDER BY seq DESC LIMIT 25").all(member.id),
    };
  }

  private supply(epoch: number): Supply | undefined {
    return this.db.prepare(`SELECT * FROM city_supply_reserves WHERE epoch=? AND ${activeSupplies}`).get(epoch) as Supply | undefined;
  }

  private supplyView(active: NonNullable<CityOwnership["active"]>, ownership: CityOwnership) {
    const supply = this.supply(active.id), defense = ownership.defense;
    const ready = supply?.state === "held" && ownership.siegeStarted === undefined && !!defense && defense.started >= supply.reserved;
    return {
      id: supply?.id ?? null, status: supply?.state ?? null, canRecover: ready, canRepair: ready && defense.damaged,
      materials: CITY_SUPPLY_MATERIALS.map(({item, amount}) => ({item, amount, stock: this.stockQuantity(active.id, active.guild, item)})),
    };
  }

  private refundSupply(supply: Supply): void {
    for (const {item, amount} of CITY_SUPPLY_MATERIALS) this.add(supply.epoch, supply.guild, item, amount);
    this.db.prepare("UPDATE city_supply_reserves SET state='cancelled' WHERE id=?").run(supply.id);
  }

  pendingSupplyRepairs(): CitySupplyRepair[] {
    return this.db.prepare("SELECT id,epoch,guild,battle FROM city_supply_reserves WHERE state='repair_pending'").all() as CitySupplyRepair[];
  }

  finishSupplyRepair(id: string, repaired: boolean): void {
    const supply = this.db.prepare("SELECT * FROM city_supply_reserves WHERE id=? AND state='repair_pending'").get(id) as Supply | undefined;
    if (!supply) return;
    if (repaired) this.db.prepare("UPDATE city_supply_reserves SET state='used' WHERE id=?").run(id);
    else this.refundSupply(supply);
  }

  supplyRepairSucceeded(id: string): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM city_supply_reserves WHERE id=? AND state='used'").get(id));
  }

  supplyOrder(member: CityMember, order: CitySupplyOrder, ownership: CityOwnership, now: number): Record<string, string | number> {
    if (!member.commander) throw Error("city_commander_required");
    const {epoch, action} = order;
    this.requireCity(member, epoch, ownership, CITY_MINING_SITE);
    if (ownership.siegeStarted !== undefined) throw Error("city_supply_siege");
    const supply = this.supply(epoch);
    if (action === "supply_reserve") {
      if (supply) throw Error("city_supply_exists");
      for (const {item, amount} of CITY_SUPPLY_MATERIALS) this.take(epoch, member.id, item, amount);
      const supplyId = randomUUID();
      this.db.prepare("INSERT INTO city_supply_reserves(id,epoch,guild,reserved,state) VALUES(?,?,?,?,'held')")
        .run(supplyId, epoch, member.id, now);
      return {supplyId};
    }
    if (!supply || supply.id !== order.supplyId || supply.state !== "held") throw Error("city_supply_missing");
    const supplyId = supply.id;
    if (action === "supply_cancel") {
      this.refundSupply(supply);
      return {supplyId};
    }
    const defense = ownership.defense;
    if (!defense || defense.started < supply.reserved) throw Error("city_supply_defense");
    if (action === "supply_repair") {
      if (!defense.damaged) throw Error("city_supply_no_damage");
      this.db.prepare("UPDATE city_supply_reserves SET state='repair_pending',battle=? WHERE id=?").run(defense.seq, supplyId);
      return {supplyId};
    }
    this.db.prepare("UPDATE city_supply_reserves SET state='used' WHERE id=?").run(supplyId);
    const job = this.start(epoch, member, now, false, CITY_MINING_SITE, CITY_SUPPLY_RECOVERY_SPEED);
    return {supplyId, ...job};
  }

  setPolicy(member: CityMember, ownership: CityOwnership, epoch: number, mode: CityPolicy, now: number) {
    if (!member.commander) throw Error("city_commander_required");
    this.requireCity(member, epoch, ownership, CITY_MINING_SITE);
    if (ownership.siegeStarted !== undefined) throw Error("city_policy_siege");
    const current = this.policy(epoch);
    if (current?.mode === mode) return {policy: mode, nextAt: current.changed + CITY_POLICY_COOLDOWN_MS};
    if (current && now < current.changed + CITY_POLICY_COOLDOWN_MS) throw Error("city_policy_cooldown");
    this.db.prepare(`INSERT INTO city_economic_policies(epoch,guild,mode,changed) VALUES(?,?,?,?)
      ON CONFLICT(epoch) DO UPDATE SET mode=excluded.mode,changed=excluded.changed`).run(epoch, member.id, mode, now);
    this.treasuryEvent(member.id, now, "policy_"+mode, 0);
    return {policy: mode, nextAt: now + CITY_POLICY_COOLDOWN_MS};
  }

  requireCity(member: CityMember, epoch: number, ownership: CityOwnership, site: CitySite): void {
    if (ownership.active?.guild !== member.id) throw Error("city_not_owner");
    if (ownership.active.id !== epoch) throw Error("city_ownership_changed");
    if (this.epoch(site) !== epoch) throw Error("city_ownership_unavailable");
  }

  private requireOfficer(member: CityMember): void {
    if (!member.officer) throw Error("city_officer_required");
  }

  private openPurchase(): PurchaseOrder | undefined {
    return this.db.prepare(`SELECT id,epoch,guild,name,amount,remaining,unit_price AS unitPrice,expires AS expiresAt
      FROM city_purchase_orders WHERE state='open'`).get() as PurchaseOrder | undefined;
  }

  hasOpenPurchase(): boolean {
    return this.openPurchase() !== undefined;
  }

  purchaseView(member: CityMember | undefined, ownership: CityOwnership) {
    const active = ownership.active;
    const order = this.openPurchase();
    const officer = member?.officer && !this.closureActor(member.id) ? member : null;
    return {
      site: CITY_MINING_SITE, item: CITY_PRODUCT, maxAmount: this.purchaseLimit(active?.id ?? null), maxUnitPrice: CITY_PURCHASE_MAX_PRICE,
      siege: ownership.siegeStarted !== undefined, canCancel: !!order && officer?.id === order.guild,
      open: order ? {id: order.id, guild: order.name, amount: order.amount, remaining: order.remaining,
        unitPrice: order.unitPrice, expiresAt: order.expiresAt} : null,
      manage: active && officer?.id === active.guild ? {epoch: active.id, gold: this.marketGold(active.guild),
        free: Math.max(0, this.capacity(CITY_MINING_SITE) - this.used(active.id))} : null,
    };
  }

  purchaseOpen(member: CityMember, ownership: CityOwnership, epoch: number, amount: number, unitPrice: number, now: number) {
    this.requireOfficer(member);
    this.requireCity(member, epoch, ownership, CITY_MINING_SITE);
    if (ownership.siegeStarted !== undefined) throw Error("city_purchase_siege");
    if (amount > this.purchaseLimit(epoch)) throw Error("city_purchase_policy_limit");
    if (this.hasOpenPurchase()) throw Error("city_purchase_exists");
    const reserved = amount * unitPrice;
    if (this.marketGold(member.id) < reserved) throw Error("city_market_funds");
    if (this.used(epoch) + amount > this.capacity(CITY_MINING_SITE)) throw Error("city_storage_full");
    const orderId = randomUUID(), expiresAt = now + CITY_PURCHASE_DURATION_MS;
    this.db.prepare(`INSERT INTO city_purchase_orders(id,epoch,guild,name,amount,remaining,unit_price,expires,state)
      VALUES(?,?,?,?,?,?,?,?,'open')`).run(orderId, epoch, member.id, member.name, amount, amount, unitPrice, expiresAt);
    this.treasuryEvent(member.id, now, "purchase_hold", reserved);
    return {orderId, reserved, expiresAt};
  }

  purchaseCancel(member: CityMember, orderId: string, now: number) {
    this.requireOfficer(member);
    const order = this.openPurchase();
    if (!order || order.id !== orderId || order.guild !== member.id) throw Error("city_purchase_missing");
    this.db.prepare("UPDATE city_purchase_orders SET state='cancelled' WHERE id=?").run(orderId);
    const released = order.remaining * order.unitPrice;
    this.treasuryEvent(member.id, now, "purchase_release", released);
    return {orderId, released};
  }

  purchaseFill(orderId: string, amount: number, ownership: CityOwnership, now: number) {
    const order = this.openPurchase(), active = ownership.active;
    if (!order || order.id !== orderId || order.expiresAt <= now ||
        active?.id !== order.epoch || active.guild !== order.guild || this.closureActor(order.guild))
      throw Error("city_purchase_missing");
    if (ownership.siegeStarted !== undefined) throw Error("city_purchase_siege");
    if (amount > order.remaining) throw Error("city_purchase_quantity");
    const remaining = order.remaining - amount;
    this.add(order.epoch, order.guild, CITY_PRODUCT, amount);
    this.db.prepare("UPDATE city_purchase_orders SET remaining=?,state=? WHERE id=?")
      .run(remaining, remaining ? "open" : "filled", orderId);
    const gold = amount * order.unitPrice;
    this.treasuryEvent(order.guild, now, "purchase_paid", gold);
    return {orderId, amount, gold, remaining};
  }

  private releaseClosedMissions(): void {
    this.db.prepare(`UPDATE city_mission_workers SET state='cancelled' WHERE state='active'
      AND EXISTS (SELECT 1 FROM city_missions WHERE id=city_mission_workers.mission AND state='closed')`).run();
  }

  private activeMission(actor: string) {
    return this.db.prepare(`SELECT mission AS id,progress FROM city_mission_workers
      WHERE actor=? AND state='active'`).get(actor) as {id: string; progress: number} | undefined;
  }

  hasOpenMission(): boolean {
    return Boolean(this.db.prepare("SELECT 1 FROM city_missions WHERE state='open' LIMIT 1").get());
  }

  missionView(actor: string, member: CityMember | undefined, ownership: CityOwnership) {
    const active = ownership.active, own = this.activeMission(actor);
    const officer = member?.officer && !this.closureActor(member.id) ? member : null;
    const rows = this.db.prepare(`SELECT m.*,
      (SELECT count(*) FROM city_mission_workers w WHERE w.mission=m.id AND w.state IN ('active','complete')) AS assigned,
      EXISTS(SELECT 1 FROM city_mission_workers w WHERE w.mission=m.id AND w.actor=?) AS participated
      FROM city_missions m WHERE m.state='open' ORDER BY m.rowid DESC`).all(actor) as (Mission & {assigned: number; participated: number})[];
    return {
      site: CITY_MINING_SITE, item: CITY_MINING_ORE, required: CITY_MISSION_ORE_COUNT, maxSlots: CITY_MISSION_WORKERS,
      maxReward: CITY_MISSION_MAX_REWARD, hours: CITY_MISSION_HOURS, siege: ownership.siegeStarted !== undefined,
      manage: active && active.guild === officer?.id ? {
        epoch: active.id, gold: this.marketGold(active.guild), free: Math.max(0, this.capacity(CITY_MINING_SITE) - this.used(active.id)),
        warehouseFree: this.warehouseOreAvailable(active.id),
        canPost: rows.length < CITY_MISSION_POST_LIMIT,
      } : null,
      missions: rows.filter(row => row.audience === "public" || row.guild === member?.id || row.id === own?.id)
        .map(row => ({id: row.id, name: row.name, audience: row.audience, purpose: row.purpose, slots: row.slots, remaining: row.slots - row.assigned,
          reward: row.reward, expiresAt: row.expires, canCancel: officer?.id === row.guild,
          canAccept: !own && !row.participated && row.assigned < row.slots, progress: own?.id === row.id ? own.progress : null})),
    };
  }

  missionOpen(member: CityMember, ownership: CityOwnership, order: Extract<CityMissionOrder, {action: "mission_open"}>, now: number) {
    this.requireOfficer(member);
    this.requireCity(member, order.epoch, ownership, CITY_MINING_SITE);
    if (ownership.siegeStarted !== undefined) throw Error("city_mission_siege");
    if (Number(this.db.prepare("SELECT count(*) AS n FROM city_missions WHERE state='open'").get()?.n) >= CITY_MISSION_POST_LIMIT)
      throw Error("city_mission_limit");
    const reserved = order.reward * order.slots;
    if (this.marketGold(member.id) < reserved) throw Error("city_market_funds");
    const units = CITY_MISSION_ORE_COUNT * order.slots, purpose = order.purpose ?? "stock";
    if (purpose === "warehouse") {
      if (order.audience !== "guild") throw Error("city_mission_guild_only");
      if (units > this.warehouseOreAvailable(order.epoch)) throw Error("city_project_surplus");
    } else if (this.used(order.epoch) + units > this.capacity(CITY_MINING_SITE))
      throw Error("city_storage_full");
    const missionId = randomUUID(), expiresAt = now + order.hours * 3_600_000;
    this.db.prepare(`INSERT INTO city_missions(id,epoch,guild,name,audience,slots,reward,expires,state,purpose)
      VALUES(?,?,?,?,?,?,?,?,'open',?)`).run(missionId, order.epoch, member.id, member.name, order.audience, order.slots, order.reward, expiresAt, purpose);
    this.treasuryEvent(member.id, now, "mission_hold", reserved);
    return {missionId, reserved, expiresAt};
  }

  private mission(missionId: string): Mission | undefined {
    return this.db.prepare("SELECT * FROM city_missions WHERE id=? AND state='open'").get(missionId) as Mission | undefined;
  }

  private availableMission(missionId: string, ownership: CityOwnership, now: number): Mission {
    const mission = this.mission(missionId), owner = ownership.active;
    if (!mission || mission.expires <= now || owner?.id !== mission.epoch || owner.guild !== mission.guild ||
        this.closureActor(mission.guild)) throw Error("city_mission_missing");
    if (ownership.siegeStarted !== undefined) throw Error("city_mission_siege");
    return mission;
  }

  missionAccept(actor: string, member: CityMember | undefined, missionId: string, ownership: CityOwnership, now: number) {
    const mission = this.availableMission(missionId, ownership, now);
    if (mission.audience === "guild" && member?.id !== mission.guild) throw Error("city_mission_guild_only");
    if (this.activeMission(actor)) throw Error("city_mission_active");
    if (this.db.prepare("SELECT 1 FROM city_mission_workers WHERE mission=? AND actor=?").get(missionId, actor))
      throw Error("city_mission_done");
    const slots = this.db.prepare("SELECT count(*) AS n FROM city_mission_workers WHERE mission=? AND state IN ('active','complete')").get(missionId);
    if (Number(slots?.n) >= mission.slots) throw Error("city_mission_full");
    this.db.prepare("INSERT INTO city_mission_workers(mission,actor,state) VALUES(?,?,'active')").run(missionId, actor);
    return {missionId};
  }

  recordMissionHarvest(actor: string, quantity: number, now: number): void {
    this.db.prepare(`UPDATE city_mission_workers SET progress=min(progress+?,?)
      WHERE actor=? AND state='active' AND progress<? AND mission IN
      (SELECT id FROM city_missions WHERE state='open' AND expires>?)`)
      .run(quantity, CITY_MISSION_ORE_COUNT, actor, CITY_MISSION_ORE_COUNT, now);
  }

  missionSubmit(actor: string, missionId: string, ownership: CityOwnership, now: number) {
    const mission = this.availableMission(missionId, ownership, now), worker = this.activeMission(actor);
    if (worker?.id !== missionId || worker.progress < CITY_MISSION_ORE_COUNT) throw Error("city_mission_progress");
    this.db.prepare("UPDATE city_mission_workers SET state='complete' WHERE actor=? AND mission=?").run(actor, missionId);
    this.db.prepare(`UPDATE city_missions SET completed=completed+1,
      state=CASE WHEN completed+1=slots THEN 'closed' ELSE 'open' END WHERE id=?`).run(missionId);
    if (mission.purpose === "warehouse")
      this.addWarehouseMaterial(CITY_MINING_SITE, mission.epoch, mission.guild, now, CITY_MINING_ORE, CITY_MISSION_ORE_COUNT, false);
    else this.add(mission.epoch, mission.guild, CITY_MINING_ORE, CITY_MISSION_ORE_COUNT);
    this.treasuryEvent(mission.guild, now, "mission_paid", mission.reward);
    return {missionId, gold: mission.reward, amount: CITY_MISSION_ORE_COUNT, purpose: mission.purpose};
  }

  missionAbandon(actor: string, missionId: string) {
    const removed = this.db.prepare("DELETE FROM city_mission_workers WHERE actor=? AND mission=? AND state='active'").run(actor, missionId);
    if (!removed.changes) throw Error("city_mission_missing");
    return {missionId};
  }

  missionCancel(member: CityMember, missionId: string, now: number) {
    this.requireOfficer(member);
    const mission = this.mission(missionId);
    if (mission?.guild !== member.id) throw Error("city_mission_missing");
    this.db.prepare("UPDATE city_missions SET state='closed' WHERE id=?").run(missionId);
    this.releaseClosedMissions();
    const released = (mission.slots - mission.completed) * mission.reward;
    this.treasuryEvent(member.id, now, "mission_release", released);
    return {missionId, released};
  }

  private capacity(site: CitySite): number {
    return this.db.prepare("SELECT 1 FROM city_warehouse_projects WHERE site=? AND status='complete'").get(site)
      ? CITY_WAREHOUSE_CAPACITY : CITY_CAPACITY;
  }

  hasOpenHaul(): boolean {
    return Boolean(this.db.prepare(`SELECT 1 FROM city_hauls WHERE ${activeHauls} LIMIT 1`).get());
  }

  private cancelHauls(condition: string, now: number, ...args: (string | number | null)[]): void {
    const rows = this.db.prepare(`UPDATE city_hauls SET state='cancelled',courier=NULL
      WHERE ${activeHauls} AND (${condition}) RETURNING *`).all(...args) as Haul[];
    for (const haul of rows) {
      this.add(haul.sourceEpoch, haul.sender, haul.item, haul.amount);
      this.treasuryEvent(haul.sender, now, "haul_release", haul.reward);
    }
  }

  private haulPaused(cities: CityOwnerships): boolean {
    return CITY_SITES.some(site => cities[site].siegeStarted !== undefined);
  }

  haulView(actor: string, member: CityMember | undefined, cities: CityOwnerships, atCity: CitySite | null) {
    const officer = member?.officer ? member.id : null, paused = this.haulPaused(cities);
    const rows = this.db.prepare(`SELECT * FROM city_hauls WHERE ${activeHauls} ORDER BY expires`).all() as Haul[];
    const carrying = rows.some(haul => haul.courier === actor);
    const jobs = rows.filter(haul => haul.courier === actor || officer === haul.sender || officer === haul.receiver ||
      (haul.state === "open" && (haul.audience === "public" || member?.id === haul.sender)));
    const destination = atCity === null ? null : otherCity(atCity);
    const origin = atCity === null ? null : cities[atCity].active;
    const target = destination === null ? null : cities[destination].active;
    const canPost = atCity !== null && destination !== null && origin && target && origin.guild === officer &&
      !rows.some(haul => haul.sourceEpoch === origin.id);
    return {
      atCity, paused,
      manage: canPost ? {
        epoch: origin.id, destination, destinationEpoch: target.id,
        needsApproval: target.guild !== officer, item: CITY_LINES[atCity].output,
        amount: Math.min(CITY_HAUL_AMOUNT, this.stockQuantity(origin.id, origin.guild, CITY_LINES[atCity].output),
          target.guild === officer ? Math.max(0, this.capacity(destination) - this.used(target.id)) : CITY_HAUL_AMOUNT),
        reward: Math.min(CITY_MISSION_MAX_REWARD, this.marketGold(origin.guild)),
      } : null,
      jobs: jobs.map(haul => ({
        id: haul.id, source: haul.source, destination: haul.destination, name: haul.name, state: haul.state,
        item: haul.item, amount: haul.amount, reward: haul.reward, expires: haul.expires, audience: haul.audience,
        canApprove: officer === haul.receiver && haul.state === "pending",
        canCancel: officer === haul.sender && haul.state !== "carrying",
        canPickup: !carrying && haul.state === "open" && (haul.audience === "public" || member?.id === haul.sender),
        carrying: haul.courier === actor,
      })),
    };
  }

  private openHaul(member: CityMember | undefined, order: Extract<CityHaulOrder, {action: "haul_open"}>,
    cities: CityOwnerships, atCity: CitySite | null, now: number) {
    if (!member) throw Error("city_not_member");
    this.requireOfficer(member);
    const destination = order.destination, source = otherCity(destination), target = cities[destination].active;
    if (atCity !== source) throw Error("city_haul_location");
    this.requireCity(member, order.epoch, cities[source], source);
    if (target?.id !== order.destinationEpoch || this.closureActor(target.guild)) throw Error("city_ownership_changed");
    if (this.haulPaused(cities)) throw Error("city_haul_siege");
    if (this.db.prepare(`SELECT 1 FROM city_hauls WHERE sourceEpoch=? AND ${activeHauls}`).get(order.epoch))
      throw Error("city_haul_exists");
    if (this.marketGold(member.id) < order.reward) throw Error("city_market_funds");
    const sameGuild = target.guild === member.id;
    if (sameGuild && this.used(target.id) + order.amount > this.capacity(destination)) throw Error("city_storage_full");
    const haulId = randomUUID(), item = CITY_LINES[source].output;
    this.take(order.epoch, member.id, item, order.amount);
    this.db.prepare(`INSERT INTO city_hauls(id,source,sourceEpoch,sender,name,destination,destinationEpoch,receiver,
      item,amount,reward,expires,audience,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(haulId, source, order.epoch, member.id, member.name, destination, target.id, target.guild,
        item, order.amount, order.reward, now + CITY_HAUL_DURATION_MS, order.audience, sameGuild ? "open" : "pending");
    this.treasuryEvent(member.id, now, "haul_hold", order.reward);
    return {haulId};
  }

  haulOrder(actor: string, member: CityMember | undefined, order: CityHaulOrder, cities: CityOwnerships, atCity: CitySite | null, now: number) {
    if (order.action === "haul_open") return this.openHaul(member, order, cities, atCity, now);
    const haul = this.db.prepare(`SELECT * FROM city_hauls WHERE id=? AND ${activeHauls}`).get(order.haulId) as Haul | undefined;
    if (!haul || haul.expires <= now || cities[haul.source].active?.id !== haul.sourceEpoch ||
        cities[haul.destination].active?.id !== haul.destinationEpoch ||
        this.closureActor(haul.sender) || this.closureActor(haul.receiver)) throw Error("city_haul_missing");
    const haulId = haul.id;
    switch (order.action) {
      case "haul_cancel":
      case "haul_decline": {
        const decline = order.action === "haul_decline";
        if (!member?.officer || member.id !== (decline ? haul.receiver : haul.sender)) throw Error("city_officer_required");
        if (decline ? haul.state !== "pending" : haul.state === "carrying") throw Error("city_haul_state");
        this.cancelHauls("id=?", now, haulId);
        return {haulId};
      }
      case "haul_abandon":
        if (haul.courier !== actor || haul.state !== "carrying") throw Error("city_haul_courier");
        this.db.prepare("UPDATE city_hauls SET state='open',courier=NULL WHERE id=?").run(haulId);
        return {haulId};
    }
    if (this.haulPaused(cities)) throw Error("city_haul_siege");
    if (atCity !== (order.action === "haul_pickup" ? haul.source : haul.destination)) throw Error("city_haul_location");
    switch (order.action) {
      case "haul_approve":
        if (!member?.officer || member.id !== haul.receiver) throw Error("city_officer_required");
        if (haul.state !== "pending") throw Error("city_haul_state");
        if (this.used(haul.destinationEpoch) + haul.amount > this.capacity(haul.destination)) throw Error("city_storage_full");
        this.db.prepare("UPDATE city_hauls SET state='open' WHERE id=?").run(haulId);
        return {haulId};
      case "haul_pickup":
        if (haul.state !== "open") throw Error("city_haul_state");
        if (haul.audience === "guild" && member?.id !== haul.sender) throw Error("city_mission_guild_only");
        if (this.db.prepare("SELECT 1 FROM city_hauls WHERE courier=? AND state='carrying'").get(actor))
          throw Error("city_haul_active");
        this.db.prepare("UPDATE city_hauls SET state='carrying',courier=? WHERE id=?").run(actor, haulId);
        return {haulId};
      case "haul_deliver":
        if (haul.courier !== actor || haul.state !== "carrying") throw Error("city_haul_courier");
        this.add(haul.destinationEpoch, haul.receiver, haul.item, haul.amount);
        this.db.prepare("UPDATE city_hauls SET state='delivered' WHERE id=?").run(haulId);
        this.treasuryEvent(haul.sender, now, "haul_paid", haul.reward);
        return {haulId, gold: haul.reward};
    }
  }

  private workshopJob(actor: string): WorkshopJob | undefined {
    return this.db.prepare(`SELECT id,ready AS readyAt,item,quantity FROM city_workshop_jobs WHERE actor=? AND claimed=0`)
      .get(actor) as WorkshopJob | undefined;
  }

  hasWorkshopJob(actor: string): boolean {
    return this.workshopJob(actor) !== undefined;
  }

  private workshopRunning(now: number): number {
    return Number(this.db.prepare("SELECT count(*) AS n FROM city_workshop_jobs WHERE claimed=0 AND ready>?").get(now)?.n);
  }

  workshopView(actor: string, ownership: CityOwnership, now: number) {
    const {level, epoch} = this.factory(CITY_PRODUCTION_SITE);
    const owner = ownership.active;
    return {
      epoch: owner?.id ?? null, unlocked: !!owner && epoch === owner.id && level > 0 &&
        this.capacity(CITY_PRODUCTION_SITE) === CITY_WAREHOUSE_CAPACITY && !this.closureActor(owner.guild),
      siege: ownership.siegeStarted !== undefined, used: this.workshopRunning(now), slots: CITY_WORKSHOP_SLOTS,
      fee: CITY_WORKSHOP_FEE, durationMs: CITY_DURATION_MS[level], job: this.workshopJob(actor) ?? null,
      inputs: [{item: CITY_RAW_ITEMS[0], amount: CITY_RECIPE.wood}, {item: CITY_RAW_ITEMS[1], amount: CITY_RECIPE.stone}],
      output: {item: CITY_PRODUCT, quantity: CITY_RECIPE.quantity},
    };
  }

  workshopStart(actor: string, epoch: number, ownership: CityOwnership, now: number) {
    const owner = ownership.active;
    if (!owner || owner.id !== epoch) throw Error("city_ownership_changed");
    const view = this.workshopView(actor, ownership, now);
    if (!view.unlocked) throw Error("city_workshop_locked");
    if (view.siege) throw Error("city_workshop_siege");
    if (view.job) throw Error("city_workshop_pending");
    if (view.used >= view.slots) throw Error("city_workshop_full");
    const jobId = randomUUID(), readyAt = now + view.durationMs;
    this.db.prepare(`INSERT INTO city_workshop_jobs(id,actor,epoch,guild,ready,item,quantity,fee)
      VALUES(?,?,?,?,?,?,?,?)`).run(jobId, actor, epoch, owner.guild, readyAt, CITY_PRODUCT, CITY_RECIPE.quantity, CITY_WORKSHOP_FEE);
    this.treasuryEvent(owner.guild, now, "workshop_income", CITY_WORKSHOP_FEE);
    return {jobId, readyAt, fee: CITY_WORKSHOP_FEE};
  }

  workshopClaim(actor: string, jobId: string, now: number): WorkshopJob {
    const job = this.workshopJob(actor);
    if (!job || job.id !== jobId) throw Error("city_workshop_job_missing");
    if (job.readyAt > now) throw Error("city_workshop_not_ready");
    this.db.prepare("UPDATE city_workshop_jobs SET claimed=1 WHERE id=?").run(jobId);
    return job;
  }

  private warehouseProject(epoch: number): WarehouseProject | undefined {
    return this.db.prepare("SELECT * FROM city_warehouse_projects WHERE epoch=? AND status IN ('collecting','building')")
      .get(epoch) as WarehouseProject | undefined;
  }

  private settleWarehouse(site: CitySite, epoch: number, guild: string, cutoff: number, retire: boolean): void {
    const project = this.warehouseProject(epoch);
    if (!project) return;
    if (project.guild !== guild || project.site !== site) throw Error("city_ownership_unavailable");
    if (project.ready !== null && project.ready <= cutoff) {
      this.db.prepare("UPDATE city_warehouse_projects SET status='complete' WHERE epoch=?").run(epoch);
    } else if (retire) {
      for (const {item, column} of CITY_WAREHOUSE_REQUIREMENTS[site]) {
        if (project[column] > 0) this.add(epoch, guild, item, project[column]);
      }
      this.db.prepare("UPDATE city_warehouse_projects SET status='cancelled' WHERE epoch=?").run(epoch);
    }
  }

  warehouseStart(site: CitySite, epoch: number, member: CityMember, ownership: CityOwnership) {
    if (!member.commander) throw Error("city_commander_required");
    if (ownership.siegeStarted !== undefined) throw Error("city_construction_siege");
    if (this.capacity(site) === CITY_WAREHOUSE_CAPACITY) throw Error("city_warehouse_complete");
    if (this.warehouseProject(epoch)) throw Error("city_project_exists");
    this.db.prepare("INSERT INTO city_warehouse_projects(epoch,guild,site,status) VALUES(?,?,?,'collecting')").run(epoch, member.id, site);
    return {epoch};
  }

  private warehouseOrePromised(epoch: number): number {
    const row = this.db.prepare(`SELECT coalesce(sum(slots-completed),0) AS slots FROM city_missions
      WHERE epoch=? AND state='open' AND purpose='warehouse'`).get(epoch);
    return Number(row?.slots ?? 0) * CITY_MISSION_ORE_COUNT;
  }

  private warehouseOreAvailable(epoch: number): number {
    const project = this.warehouseProject(epoch);
    if (project?.site !== CITY_MINING_SITE || project.status !== "collecting") return 0;
    return CITY_MINING_WAREHOUSE_MATERIALS[0].amount - project.stone - this.warehouseOrePromised(epoch);
  }

  warehouseContribute(site: CitySite, epoch: number, member: CityMember, ownership: CityOwnership, now: number,
    item: CityItem, amount: number, source: "bag" | "stock") {
    if (source === "stock") this.requireOfficer(member);
    if (ownership.siegeStarted !== undefined) throw Error("city_construction_siege");
    this.addWarehouseMaterial(site, epoch, member.id, now, item, amount, source === "stock");
    return {epoch, item, quantity: amount, source};
  }

  private addWarehouseMaterial(site: CitySite, epoch: number, guild: string, now: number,
    item: CityItem, amount: number, fromStock: boolean): void {
    const project = this.warehouseProject(epoch);
    if (!project || project.status !== "collecting" || project.site !== site || project.guild !== guild)
      throw Error("city_project_unavailable");
    const requirements = CITY_WAREHOUSE_REQUIREMENTS[site], material = requirements.find(entry => entry.item === item);
    const promised = site === CITY_MINING_SITE && item === CITY_MINING_ORE ? this.warehouseOrePromised(epoch) : 0;
    if (!material || amount > material.amount - project[material.column] - promised) throw Error("city_project_surplus");
    if (fromStock) this.take(epoch, guild, item, amount);
    project[material.column] += amount;
    const funded = requirements.every(({column, amount: required}) => project[column] === required);
    const readyAt = funded ? now + CITY_WAREHOUSE_DURATION_MS : null;
    this.db.prepare(`UPDATE city_warehouse_projects SET ${material.column}=?,ready=?,status=? WHERE epoch=?`)
      .run(project[material.column], readyAt, funded ? "building" : "collecting", epoch);
  }

  private used(epoch: number): number {
    const stock = this.db.prepare("SELECT coalesce(sum(quantity),0) AS total FROM city_stock WHERE epoch=?").get(epoch);
    const listed = this.db.prepare(`SELECT coalesce(sum(json_extract(item,'$.quantity')),0) AS total
      FROM listings WHERE city_epoch=? AND state='open'`).get(epoch);
    const ordered = this.db.prepare("SELECT remaining FROM city_purchase_orders WHERE epoch=? AND state='open'").get(epoch);
    const missions = this.db.prepare("SELECT coalesce(sum(slots-completed),0) AS slots FROM city_missions WHERE epoch=? AND state='open' AND purpose='stock'").get(epoch);
    const hauls = this.db.prepare(`SELECT coalesce(sum(amount),0) AS total FROM city_hauls WHERE ${activeHauls}
      AND (sourceEpoch=? OR (destinationEpoch=? AND state<>'pending'))`).get(epoch, epoch);
    return Number(stock?.total) + Number(listed?.total) + (this.running(epoch)?.quantity ?? 0) +
      Number(ordered?.remaining ?? 0) + Number(missions?.slots ?? 0) * CITY_MISSION_ORE_COUNT + Number(hauls?.total) +
      (this.supply(epoch) ? supplySpace : 0) + (this.localMarket(epoch)?.shelf ?? 0);
  }

  private stockQuantity(epoch: number, guild: string, item: CityItem): number {
    const row = this.db.prepare("SELECT quantity FROM city_stock WHERE epoch=? AND guild=? AND item=?").get(epoch, guild, item);
    return Number(row?.quantity ?? 0);
  }

  private add(epoch: number, guild: string, item: CityItem, amount: number): void {
    this.db.prepare(`INSERT INTO city_stock(epoch,guild,item,quantity) VALUES(?,?,?,?)
      ON CONFLICT(epoch,item) DO UPDATE SET quantity=quantity+excluded.quantity`).run(epoch, guild, item, amount);
  }

  private take(epoch: number, guild: string, item: CityItem, amount: number): void {
    const deleted = this.db.prepare("DELETE FROM city_stock WHERE epoch=? AND guild=? AND item=? AND quantity=?")
      .run(epoch, guild, item, amount).changes;
    if (deleted) return;
    const reduced = this.db.prepare("UPDATE city_stock SET quantity=quantity-? WHERE epoch=? AND guild=? AND item=? AND quantity>?")
      .run(amount, epoch, guild, item, amount).changes;
    if (!reduced) throw Error("city_stock_short");
  }

  deposit(epoch: number, member: CityMember, item: CityItem, amount: number, site: CitySite): void {
    if (!CITY_LINES[site].inputs.some(input => input === item)) throw Error("city_item_not_accepted");
    if (this.used(epoch) + amount > this.capacity(site)) throw Error("city_storage_full");
    this.add(epoch, member.id, item, amount);
  }

  private consumeRaw(epoch: number, guild: string, costs: {wood: number; stone: number}, site: CitySite): void {
    const [first, second] = CITY_LINES[site].inputs;
    this.take(epoch, guild, first, costs.wood);
    this.take(epoch, guild, second, costs.stone);
  }

  build(epoch: number, member: CityMember, site: CitySite): {level: number} {
    this.requireOfficer(member);
    const level = this.factory(site).level;
    if (level === 2) throw Error("city_factory_max");
    this.consumeRaw(epoch, member.id, CITY_FACTORY_COSTS[level], site);
    this.db.prepare("UPDATE city_factory_sites SET level=? WHERE site=?").run(level + 1, site);
    return {level: level + 1};
  }

  start(epoch: number, member: CityMember, now: number, rush: boolean, site: CitySite, speed = 1): {jobId: string; readyAt: number; fee: number} {
    this.requireOfficer(member);
    const level = this.factory(site).level;
    if (!level) throw Error("city_factory_required");
    if (this.running(epoch)) throw Error("city_job_running");
    const fee = rush ? CITY_RUSH_GOLD : 0;
    if (rush && this.marketGold(member.id) < fee) throw Error("city_market_funds");
    const {recipe, output} = CITY_LINES[site];
    this.consumeRaw(epoch, member.id, recipe, site);
    if (this.used(epoch) + recipe.quantity > this.capacity(site)) throw Error("city_storage_full");
    const jobId = randomUUID(), readyAt = now + Math.round(this.productionDuration(site, epoch, level, rush) * speed);
    this.db.prepare(`INSERT INTO city_jobs(id,epoch,guild,ready,wood,stone,quantity,status,fee,site,product)
      VALUES(?,?,?,?,?,?,?,'running',?,?,?)`).run(jobId, epoch, member.id, readyAt, recipe.wood, recipe.stone, recipe.quantity, fee, site, output);
    if (fee) this.treasuryEvent(member.id, now, "rush_hold", fee);
    return {jobId, readyAt, fee};
  }

  list(epoch: number, member: CityMember, amount: number, price: number, site: CitySite,
    imported?: typeof CITY_MINING_PRODUCT): {listingId: string} {
    this.requireOfficer(member);
    const open = this.db.prepare("SELECT count(*) AS total FROM listings WHERE seller_guild=? AND state='open'").get(member.id);
    if (Number(open?.total) >= 20) throw Error("listing_limit");
    if (imported && site !== CITY_PRODUCTION_SITE) throw Error("city_item_not_accepted");
    const itemId = imported ?? CITY_LINES[site].output;
    this.take(epoch, member.id, itemId, amount);
    const listingId = randomUUID();
    this.db.prepare(`INSERT INTO listings(id,item,price,state,seller_guild,seller_name,city_epoch)
      VALUES(?,?,?,'open',?,?,?)`).run(listingId, JSON.stringify({itemId, quantity: amount}), price, member.id, member.name, epoch);
    return {listingId};
  }

  cancel(member: CityMember, listingId: string): {listingId: string} {
    this.requireOfficer(member);
    const row = this.db.prepare(`SELECT city_epoch AS epoch,json_extract(item,'$.itemId') AS item,
      json_extract(item,'$.quantity') AS quantity FROM listings WHERE id=? AND seller_guild=? AND state='open'`)
      .get(listingId, member.id) as Pick<GuildListing, "epoch" | "item" | "quantity"> | undefined;
    if (!row) throw Error("listing_unavailable");
    this.add(row.epoch, member.id, row.item, row.quantity);
    this.db.prepare("UPDATE listings SET state='cancelled' WHERE id=?").run(listingId);
    return {listingId};
  }

  creditSale(listingId: string, guild: string, amount: number): void {
    this.db.prepare("INSERT INTO guild_market_gold(listing,guild,amount) VALUES(?,?,?)").run(listingId, guild, amount);
    this.treasuryEvent(guild, Date.now(), "sale_income", amount);
  }

  reclaim(epoch: number, member: CityMember, item: CityItem, amount: number): void {
    this.requireOfficer(member);
    if (this.db.prepare("SELECT 1 FROM city_factory_sites WHERE epoch=?").get(epoch)) throw Error("city_stock_active");
    this.take(epoch, member.id, item, amount);
  }

  hasAssets(guild: string): boolean {
    return Boolean(this.db.prepare(`SELECT 1 FROM city_stock WHERE guild=?
      UNION ALL SELECT 1 FROM city_jobs WHERE guild=? AND status='running'
      UNION ALL SELECT 1 FROM listings WHERE seller_guild=? AND state='open'
      UNION ALL SELECT 1 FROM city_purchase_orders WHERE guild=? AND state='open'
      UNION ALL SELECT 1 FROM city_missions WHERE guild=? AND state='open'
      UNION ALL SELECT 1 FROM city_hauls WHERE (sender=? OR receiver=?) AND ${activeHauls}
      UNION ALL SELECT 1 FROM city_supply_reserves WHERE guild=? AND ${activeSupplies}
      UNION ALL SELECT 1 FROM city_local_markets WHERE guild=? AND (shelf>0 OR budget>0)
      UNION ALL SELECT 1 FROM city_warehouse_projects
        WHERE guild=? AND status IN ('collecting','building') AND wood+stone+metal>0 LIMIT 1`).get(guild, guild, guild, guild, guild, guild, guild, guild, guild, guild))
      || this.marketGold(guild) > 0;
  }

  closureActor(guild: string): string | undefined {
    const row = this.db.prepare("SELECT actor FROM city_guild_closures WHERE guild=?").get(guild);
    return typeof row?.actor === "string" ? row.actor : undefined;
  }

  /** The guild store has recorded the irrevocable intent. The caller holds the economy transaction. */
  disband(disband: CityDisband, ownerships: ReadonlyMap<CitySite, CityOwnership>): void {
    const {guild, actor, name, requested} = disband;
    const closedBy = this.closureActor(guild);
    if (closedBy !== undefined) {
      if (closedBy !== actor) throw Error("city_disband_unavailable");
      return;
    }
    if (this.db.prepare("SELECT 1 FROM city_supply_reserves WHERE guild=? AND state='repair_pending'").get(guild))
      throw Error("city_supply_pending");
    const reserves = this.db.prepare("SELECT * FROM city_supply_reserves WHERE guild=? AND state='held'").all(guild) as Supply[];
    for (const supply of reserves) this.refundSupply(supply);
    this.cancelHauls("sender=? OR receiver=?", requested, guild, guild);
    const markets = this.db.prepare("SELECT * FROM city_local_markets WHERE guild=? AND (open=1 OR shelf>0 OR budget>0)")
      .all(guild) as LocalMarket[];
    for (const market of markets) this.releaseLocalMarket(market, requested);
    const running = this.db.prepare("SELECT * FROM city_jobs WHERE guild=? AND status='running'").all(guild) as Job[];
    for (const job of running) {
      const ownership = ownerships.get(job.site);
      if (!ownership) throw Error("city_ownership_unavailable");
      const owner = ownership.active?.id === job.epoch ? ownership.active : ownership.previous;
      if (owner?.guild !== guild || job.epoch !== this.epoch(job.site)) throw Error("city_ownership_unavailable");
      const cutoff = "ended" in owner ? Math.min(requested, owner.ended) : requested;
      if (job.ready <= cutoff) this.completeJob(job);
      else this.cancelJob(job, cutoff);
    }
    for (const site of CITY_SITES) {
      const epoch = this.epoch(site);
      if (epoch === null || this.warehouseProject(epoch)?.guild !== guild) continue;
      const ownership = ownerships.get(site);
      if (!ownership) throw Error("city_ownership_unavailable");
      const owner = ownership.active?.id === epoch ? ownership.active : ownership.previous;
      if (owner?.guild !== guild) throw Error("city_ownership_unavailable");
      const siege = "ended" in owner ? owner.siegeStarted : ownership.siegeStarted;
      const cutoff = "ended" in owner ? Math.min(requested, owner.ended) : requested;
      this.settleWarehouse(site, epoch, guild, Math.min(cutoff, siege ?? cutoff), true);
    }
    const stock = this.db.prepare("SELECT item,sum(quantity) AS quantity FROM city_stock WHERE guild=? GROUP BY item")
      .all(guild) as {item: CityItem; quantity: number}[];
    const assets = new Map<CityAsset, number>(stock.map(row => [row.item, row.quantity]));
    const listed = this.db.prepare(`SELECT json_extract(item,'$.itemId') AS item, sum(json_extract(item,'$.quantity')) AS quantity
      FROM listings WHERE seller_guild=? AND state='open' GROUP BY json_extract(item,'$.itemId')`)
      .all(guild) as Pick<GuildListing, "item" | "quantity">[];
    for (const {item, quantity} of listed) assets.set(item, (assets.get(item) ?? 0) + quantity);
    this.released("purchase_release", requested, this.db.prepare(`UPDATE city_purchase_orders SET state='cancelled'
      WHERE guild=? AND state='open' RETURNING guild,remaining*unit_price AS gold`).all(guild) as Release[]);
    this.released("mission_release", requested, this.db.prepare(`UPDATE city_missions SET state='closed'
      WHERE guild=? AND state='open' RETURNING guild,(slots-completed)*reward AS gold`).all(guild) as Release[]);
    this.releaseClosedMissions();
    assets.set("gold", this.marketGold(guild));
    this.db.prepare("INSERT INTO city_guild_closures(guild,actor,name,closed) VALUES(?,?,?,?)").run(guild, actor, name, requested);
    const award = this.db.prepare("INSERT INTO city_disband_assets(guild,item,awarded) VALUES(?,?,?)");
    for (const [item, amount] of assets) if (amount > 0) award.run(guild, item, amount);
    this.db.prepare("UPDATE listings SET state='cancelled' WHERE seller_guild=? AND state='open'").run(guild);
    this.db.prepare("DELETE FROM city_stock WHERE guild=?").run(guild);
  }

  claims(actor: string) {
    const rows = this.db.prepare(`SELECT a.guild AS guildId,c.name,a.item,a.awarded-a.claimed AS amount
      FROM city_guild_closures c JOIN city_disband_assets a USING(guild)
      WHERE c.actor=? AND a.claimed<a.awarded ORDER BY c.closed,a.item LIMIT 60`).all(actor) as DisbandClaim[];
    return rows.map(row => ({...row}));
  }

  hasClaims(actor: string): boolean {
    return Boolean(this.db.prepare(`SELECT 1 FROM city_guild_closures c JOIN city_disband_assets a USING(guild)
      WHERE c.actor=? AND a.claimed<a.awarded LIMIT 1`).get(actor));
  }

  claim(actor: string, guild: string, item: CityAsset, amount: number): void {
    const updated = this.db.prepare(`UPDATE city_disband_assets SET claimed=claimed+?
      WHERE guild=? AND item=? AND awarded-claimed>=?
        AND EXISTS (SELECT 1 FROM city_guild_closures WHERE guild=? AND actor=?)`).run(amount, guild, item, amount, guild, actor);
    if (!updated.changes) throw Error("city_claim_unavailable");
  }

  view(member: CityMember, ownership: CityOwnership, site: CitySite) {
    const {epoch, level} = this.factory(site);
    const ownEpoch = ownership.active?.guild === member.id ? epoch : null;
    const stock = this.db.prepare(`SELECT epoch,item,quantity FROM city_stock
      WHERE guild=? AND epoch=? ORDER BY item`).all(member.id, ownEpoch) as Stock[];
    const reclaim = this.db.prepare(`SELECT epoch,item,quantity FROM city_stock
      WHERE guild=? AND epoch NOT IN (SELECT epoch FROM city_factory_sites WHERE epoch IS NOT NULL)
      ORDER BY epoch,item LIMIT 60`).all(member.id) as Stock[];
    const listings = this.db.prepare(`SELECT id,seller_guild AS guild,seller_name AS name,city_epoch AS epoch,
      json_extract(item,'$.itemId') AS item,json_extract(item,'$.quantity') AS quantity,price
      FROM listings WHERE seller_guild=? AND state='open' ORDER BY rowid DESC`)
      .all(member.id) as GuildListing[];
    const job = ownEpoch === null ? undefined : this.running(ownEpoch);
    const project = ownEpoch === null ? undefined : this.warehouseProject(ownEpoch);
    const capacity = this.capacity(site);
    const {inputs, output, recipe} = CITY_LINES[site];
    return {
      epoch: ownEpoch, level, stock: stock.map(row => ({...row})), reclaim: reclaim.map(row => ({...row})),
      listings: listings.map(row => ({...row})), capacity,
      used: ownEpoch === null ? 0 : this.used(ownEpoch), marketGold: this.marketGold(member.id),
      officer: member.officer, job: job ? {id: job.id, readyAt: job.ready, fee: job.fee} : null,
      constructionReserved: !!project && project.wood + project.stone + project.metal > 0,
      hasAssets: this.hasAssets(member.id),
      construction: {
        commander: member.commander === true, siege: ownership.siegeStarted !== undefined,
        complete: capacity === CITY_WAREHOUSE_CAPACITY, capacity: CITY_WAREHOUSE_CAPACITY,
        durationMs: CITY_WAREHOUSE_DURATION_MS, status: project?.status ?? null, readyAt: project?.ready ?? null,
        materials: CITY_WAREHOUSE_REQUIREMENTS[site].map(({item, column, amount}) => ({
          item, amount, reserved: project?.[column] ?? 0,
          promised: ownEpoch !== null && site === CITY_MINING_SITE && item === CITY_MINING_ORE ? this.warehouseOrePromised(ownEpoch) : 0,
        })),
      },
      costs: level === 2 ? null : CITY_FACTORY_COSTS[level],
      recipe: {inputs: [{item: inputs[0], amount: recipe.wood}, {item: inputs[1], amount: recipe.stone}],
        output, amount: recipe.quantity, durationMs: this.productionDuration(site, epoch, level),
        rush: level ? {gold: CITY_RUSH_GOLD, durationMs: this.productionDuration(site, epoch, level, true)} : null},
    };
  }
}
