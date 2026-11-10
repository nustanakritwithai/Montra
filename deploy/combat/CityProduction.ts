import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {
  CITY_CAPACITY, CITY_DURATION_MS, CITY_FACTORY_COSTS, CITY_PRODUCT, CITY_RAW_ITEMS, CITY_RECIPE, CITY_RUSH_GOLD,
  CITY_WAREHOUSE_CAPACITY, CITY_WAREHOUSE_DURATION_MS, CITY_WAREHOUSE_MATERIALS,
  CITY_WORKSHOP_FEE, CITY_WORKSHOP_SLOTS,
  type CityAsset, type CityDisband, type CityItem, type CityMember, type CityOwnership,
} from "./CityProductionRules.js";

type Job = {id: string; epoch: number; guild: string; ready: number; wood: number; stone: number; quantity: number; fee: number};
type Factory = {epoch: number | null; guild: string | null; level: 0 | 1 | 2};
type Stock = {epoch: number; item: CityItem; quantity: number};
type GuildListing = {id: string; guild: string; name: string; epoch: number; quantity: number; price: number};
type DisbandClaim = {guildId: string; name: string; item: CityAsset; amount: number};
type WarehouseProject = {
  epoch: number; guild: string; wood: number; stone: number; metal: number;
  ready: number | null; status: "collecting" | "building";
};
type WorkshopJob = {id: string; readyAt: number; item: CityItem; quantity: number};

export class CityProduction {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS city_factory (
        id INTEGER PRIMARY KEY CHECK(id=1), epoch INTEGER, guild TEXT, level INTEGER NOT NULL CHECK(level BETWEEN 0 AND 2),
        CHECK((epoch IS NULL)=(guild IS NULL)));
      INSERT OR IGNORE INTO city_factory(id,level) VALUES(1,0);
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
        epoch INTEGER PRIMARY KEY, guild TEXT NOT NULL,
        wood INTEGER NOT NULL DEFAULT 0 CHECK(wood>=0), stone INTEGER NOT NULL DEFAULT 0 CHECK(stone>=0),
        metal INTEGER NOT NULL DEFAULT 0 CHECK(metal>=0), ready INTEGER,
        status TEXT NOT NULL CHECK(status IN ('collecting','building','complete','cancelled')));
      CREATE UNIQUE INDEX IF NOT EXISTS city_warehouse_completed ON city_warehouse_projects((1)) WHERE status='complete';
      CREATE TABLE IF NOT EXISTS city_workshop_jobs (
        id TEXT PRIMARY KEY, actor TEXT NOT NULL, epoch INTEGER NOT NULL, guild TEXT NOT NULL,
        ready INTEGER NOT NULL, item TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0),
        fee INTEGER NOT NULL CHECK(fee>0), claimed INTEGER NOT NULL DEFAULT 0 CHECK(claimed IN (0,1)));
      CREATE UNIQUE INDEX IF NOT EXISTS city_workshop_one_job ON city_workshop_jobs(actor) WHERE claimed=0;
      CREATE INDEX IF NOT EXISTS city_workshop_running ON city_workshop_jobs(ready) WHERE claimed=0;
      CREATE INDEX IF NOT EXISTS city_workshop_revenue ON city_workshop_jobs(guild);
      CREATE TABLE IF NOT EXISTS guild_market_gold (
        listing TEXT PRIMARY KEY REFERENCES listings(id), guild TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK(amount>0));
      CREATE INDEX IF NOT EXISTS guild_market_gold_owner ON guild_market_gold(guild);
      CREATE INDEX IF NOT EXISTS city_jobs_guild ON city_jobs(guild);
      CREATE TABLE IF NOT EXISTS city_guild_closures (
        guild TEXT PRIMARY KEY, actor TEXT NOT NULL, name TEXT NOT NULL, closed INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS city_guild_closures_actor ON city_guild_closures(actor);
      CREATE TABLE IF NOT EXISTS city_disband_assets (
        guild TEXT NOT NULL REFERENCES city_guild_closures(guild), item TEXT NOT NULL,
        awarded INTEGER NOT NULL CHECK(awarded>0),
        claimed INTEGER NOT NULL DEFAULT 0 CHECK(claimed>=0 AND claimed<=awarded), PRIMARY KEY(guild,item));`);
    if (!db.prepare("PRAGMA table_info(city_jobs)").all().some(column => column.name === "fee"))
      db.exec("ALTER TABLE city_jobs ADD COLUMN fee INTEGER NOT NULL DEFAULT 0 CHECK(fee>=0)");
  }

  private factory(): Factory {
    return this.db.prepare("SELECT epoch,guild,level FROM city_factory WHERE id=1").get() as Factory;
  }

  epoch(): number | null {
    return this.factory().epoch;
  }

  private running(epoch: number): Job | undefined {
    return this.db.prepare("SELECT * FROM city_jobs WHERE epoch=? AND status='running'").get(epoch) as Job | undefined;
  }

  /** The caller holds the economy write transaction. Use the committed handover time on catch-up. */
  reconcile(ownership: CityOwnership, now: number): void {
    const {epoch, guild} = this.factory();
    const active = ownership.active?.id ?? null;
    if (epoch !== null) {
      const owner = epoch === active ? ownership.active : ownership.previous;
      if (!owner || owner.guild !== guild) throw Error("city_ownership_unavailable");
      const cutoff = "ended" in owner ? owner.ended : now;
      const job = this.running(epoch);
      if (job && job.ready <= cutoff) {
        this.completeJob(job);
      } else if (job && epoch !== active) {
        this.cancelJob(job);
      }
      const siege = "ended" in owner ? owner.siegeStarted : ownership.siegeStarted;
      this.settleWarehouse(epoch, owner.guild, Math.min(cutoff, siege ?? cutoff), epoch !== active);
    }
    if (epoch !== active)
      this.db.prepare("UPDATE city_factory SET epoch=?,guild=? WHERE id=1").run(active, ownership.active?.guild ?? null);
  }

  private completeJob(job: Job): void {
    this.add(job.epoch, job.guild, CITY_PRODUCT, job.quantity);
    this.db.prepare("UPDATE city_jobs SET status='complete' WHERE id=?").run(job.id);
  }

  private cancelJob(job: Job): void {
    this.add(job.epoch, job.guild, CITY_RAW_ITEMS[0], job.wood);
    this.add(job.epoch, job.guild, CITY_RAW_ITEMS[1], job.stone);
    this.db.prepare("UPDATE city_jobs SET status='cancelled' WHERE id=?").run(job.id);
  }

  private marketGold(guild: string): number {
    const row = this.db.prepare(`SELECT
      (SELECT coalesce(sum(amount),0) FROM guild_market_gold WHERE guild=?) +
      (SELECT coalesce(sum(fee),0) FROM city_workshop_jobs WHERE guild=?) -
      (SELECT coalesce(sum(fee),0) FROM city_jobs WHERE guild=? AND status<>'cancelled') AS amount`).get(guild, guild, guild);
    return Number(row?.amount);
  }

  requireCity(member: CityMember, epoch: number, ownership: CityOwnership): void {
    if (ownership.active?.guild !== member.id) throw Error("city_not_owner");
    if (ownership.active.id !== epoch) throw Error("city_ownership_changed");
  }

  private requireOfficer(member: CityMember): void {
    if (!member.officer) throw Error("city_officer_required");
  }

  private capacity(): number {
    return this.db.prepare("SELECT 1 FROM city_warehouse_projects WHERE status='complete'").get()
      ? CITY_WAREHOUSE_CAPACITY : CITY_CAPACITY;
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
    const {level, epoch} = this.factory();
    const owner = ownership.active;
    return {
      epoch: owner?.id ?? null, unlocked: !!owner && epoch === owner.id && level > 0 &&
        this.capacity() === CITY_WAREHOUSE_CAPACITY && !this.closureActor(owner.guild),
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

  private settleWarehouse(epoch: number, guild: string, cutoff: number, retire: boolean): void {
    const project = this.warehouseProject(epoch);
    if (!project) return;
    if (project.guild !== guild) throw Error("city_ownership_unavailable");
    if (project.ready !== null && project.ready <= cutoff) {
      this.db.prepare("UPDATE city_warehouse_projects SET status='complete' WHERE epoch=?").run(epoch);
    } else if (retire) {
      for (const {item, column} of CITY_WAREHOUSE_MATERIALS) {
        if (project[column] > 0) this.add(epoch, guild, item, project[column]);
      }
      this.db.prepare("UPDATE city_warehouse_projects SET status='cancelled' WHERE epoch=?").run(epoch);
    }
  }

  warehouseStart(epoch: number, member: CityMember, ownership: CityOwnership) {
    if (!member.commander) throw Error("city_commander_required");
    if (ownership.siegeStarted !== undefined) throw Error("city_construction_siege");
    if (this.capacity() === CITY_WAREHOUSE_CAPACITY) throw Error("city_warehouse_complete");
    if (this.warehouseProject(epoch)) throw Error("city_project_exists");
    this.db.prepare("INSERT INTO city_warehouse_projects(epoch,guild,status) VALUES(?,?,'collecting')").run(epoch, member.id);
    return {epoch};
  }

  warehouseContribute(epoch: number, member: CityMember, ownership: CityOwnership, now: number,
    item: CityItem, amount: number, source: "bag" | "stock") {
    if (source === "stock") this.requireOfficer(member);
    if (ownership.siegeStarted !== undefined) throw Error("city_construction_siege");
    const project = this.warehouseProject(epoch);
    if (!project || project.status !== "collecting") throw Error("city_project_unavailable");
    const material = CITY_WAREHOUSE_MATERIALS.find(entry => entry.item === item);
    if (!material || amount > material.amount - project[material.column]) throw Error("city_project_surplus");
    if (source === "stock") this.take(epoch, member.id, item, amount);
    project[material.column] += amount;
    const funded = CITY_WAREHOUSE_MATERIALS.every(({column, amount: required}) => project[column] === required);
    const readyAt = funded ? now + CITY_WAREHOUSE_DURATION_MS : null;
    this.db.prepare(`UPDATE city_warehouse_projects SET ${material.column}=?,ready=?,status=? WHERE epoch=?`)
      .run(project[material.column], readyAt, funded ? "building" : "collecting", epoch);
    return {epoch, item, quantity: amount, source};
  }

  private used(epoch: number): number {
    const stock = this.db.prepare("SELECT coalesce(sum(quantity),0) AS total FROM city_stock WHERE epoch=?").get(epoch);
    const listed = this.db.prepare(`SELECT coalesce(sum(json_extract(item,'$.quantity')),0) AS total
      FROM listings WHERE city_epoch=? AND state='open'`).get(epoch);
    return Number(stock?.total) + Number(listed?.total) + (this.running(epoch)?.quantity ?? 0);
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

  deposit(epoch: number, member: CityMember, item: typeof CITY_RAW_ITEMS[number], amount: number): void {
    if (this.used(epoch) + amount > this.capacity()) throw Error("city_storage_full");
    this.add(epoch, member.id, item, amount);
  }

  private consumeRaw(epoch: number, guild: string, costs: {wood: number; stone: number}): void {
    this.take(epoch, guild, CITY_RAW_ITEMS[0], costs.wood);
    this.take(epoch, guild, CITY_RAW_ITEMS[1], costs.stone);
  }

  build(epoch: number, member: CityMember): {level: number} {
    this.requireOfficer(member);
    const level = this.factory().level;
    if (level === 2) throw Error("city_factory_max");
    this.consumeRaw(epoch, member.id, CITY_FACTORY_COSTS[level]);
    this.db.prepare("UPDATE city_factory SET level=? WHERE id=1").run(level + 1);
    return {level: level + 1};
  }

  start(epoch: number, member: CityMember, now: number, rush: boolean): {jobId: string; readyAt: number; fee: number} {
    this.requireOfficer(member);
    const level = this.factory().level;
    if (!level) throw Error("city_factory_required");
    if (this.running(epoch)) throw Error("city_job_running");
    const fee = rush ? CITY_RUSH_GOLD : 0;
    if (rush && this.marketGold(member.id) < fee) throw Error("city_market_funds");
    this.consumeRaw(epoch, member.id, CITY_RECIPE);
    if (this.used(epoch) + CITY_RECIPE.quantity > this.capacity()) throw Error("city_storage_full");
    const jobId = randomUUID(), readyAt = now + (rush ? CITY_DURATION_MS[level] / 2 : CITY_DURATION_MS[level]);
    this.db.prepare(`INSERT INTO city_jobs(id,epoch,guild,ready,wood,stone,quantity,status,fee)
      VALUES(?,?,?,?,?,?,?,'running',?)`).run(jobId, epoch, member.id, readyAt, CITY_RECIPE.wood, CITY_RECIPE.stone, CITY_RECIPE.quantity, fee);
    return {jobId, readyAt, fee};
  }

  list(epoch: number, member: CityMember, amount: number, price: number): {listingId: string} {
    this.requireOfficer(member);
    const open = this.db.prepare("SELECT count(*) AS total FROM listings WHERE seller_guild=? AND state='open'").get(member.id);
    if (Number(open?.total) >= 20) throw Error("listing_limit");
    this.take(epoch, member.id, CITY_PRODUCT, amount);
    const listingId = randomUUID();
    this.db.prepare(`INSERT INTO listings(id,item,price,state,seller_guild,seller_name,city_epoch)
      VALUES(?,?,?,'open',?,?,?)`).run(listingId, JSON.stringify({itemId: CITY_PRODUCT, quantity: amount}), price, member.id, member.name, epoch);
    return {listingId};
  }

  cancel(member: CityMember, listingId: string): {listingId: string} {
    this.requireOfficer(member);
    const row = this.db.prepare(`SELECT city_epoch AS epoch,json_extract(item,'$.quantity') AS quantity FROM listings
      WHERE id=? AND seller_guild=? AND state='open'`).get(listingId, member.id);
    if (!row) throw Error("listing_unavailable");
    this.add(Number(row.epoch), member.id, CITY_PRODUCT, Number(row.quantity));
    this.db.prepare("UPDATE listings SET state='cancelled' WHERE id=?").run(listingId);
    return {listingId};
  }

  creditSale(listingId: string, guild: string, amount: number): void {
    this.db.prepare("INSERT INTO guild_market_gold(listing,guild,amount) VALUES(?,?,?)").run(listingId, guild, amount);
  }

  reclaim(epoch: number, member: CityMember, item: CityItem, amount: number): void {
    this.requireOfficer(member);
    if (this.epoch() === epoch) throw Error("city_stock_active");
    this.take(epoch, member.id, item, amount);
  }

  hasAssets(guild: string): boolean {
    return Boolean(this.db.prepare(`SELECT 1 FROM city_stock WHERE guild=?
      UNION ALL SELECT 1 FROM city_jobs WHERE guild=? AND status='running'
      UNION ALL SELECT 1 FROM listings WHERE seller_guild=? AND state='open'
      UNION ALL SELECT 1 FROM city_warehouse_projects
        WHERE guild=? AND status IN ('collecting','building') AND wood+stone+metal>0 LIMIT 1`).get(guild, guild, guild, guild))
      || this.marketGold(guild) > 0;
  }

  closureActor(guild: string): string | undefined {
    const row = this.db.prepare("SELECT actor FROM city_guild_closures WHERE guild=?").get(guild);
    return typeof row?.actor === "string" ? row.actor : undefined;
  }

  /** The guild store has recorded the irrevocable intent. The caller holds the economy transaction. */
  disband(disband: CityDisband, ownership: CityOwnership): void {
    const {guild, actor, name, requested} = disband;
    const closedBy = this.closureActor(guild);
    if (closedBy !== undefined) {
      if (closedBy !== actor) throw Error("city_disband_unavailable");
      return;
    }
    const running = this.db.prepare("SELECT * FROM city_jobs WHERE guild=? AND status='running'").all(guild) as Job[];
    for (const job of running) {
      const owner = ownership.active?.id === job.epoch ? ownership.active : ownership.previous;
      if (owner?.guild !== guild || job.epoch !== this.epoch()) throw Error("city_ownership_unavailable");
      const cutoff = "ended" in owner ? Math.min(requested, owner.ended) : requested;
      if (job.ready <= cutoff) this.completeJob(job);
      else this.cancelJob(job);
    }
    const epoch = this.epoch();
    if (epoch !== null && this.warehouseProject(epoch)?.guild === guild) {
      const owner = ownership.active?.id === epoch ? ownership.active : ownership.previous;
      if (owner?.guild !== guild) throw Error("city_ownership_unavailable");
      const siege = "ended" in owner ? owner.siegeStarted : ownership.siegeStarted;
      const cutoff = "ended" in owner ? Math.min(requested, owner.ended) : requested;
      this.settleWarehouse(epoch, guild, Math.min(cutoff, siege ?? cutoff), true);
    }
    const stock = this.db.prepare("SELECT item,sum(quantity) AS quantity FROM city_stock WHERE guild=? GROUP BY item")
      .all(guild) as {item: CityItem; quantity: number}[];
    const assets = new Map<CityAsset, number>(stock.map(row => [row.item, row.quantity]));
    const listed = this.db.prepare(`SELECT coalesce(sum(json_extract(item,'$.quantity')),0) AS quantity
      FROM listings WHERE seller_guild=? AND state='open'`).get(guild);
    assets.set(CITY_PRODUCT, (assets.get(CITY_PRODUCT) ?? 0) + Number(listed?.quantity));
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

  view(member: CityMember, ownership: CityOwnership) {
    const {epoch, level} = this.factory();
    const ownEpoch = ownership.active?.guild === member.id ? epoch : null;
    const stock = this.db.prepare(`SELECT epoch,item,quantity FROM city_stock
      WHERE guild=? AND epoch=? ORDER BY item`).all(member.id, ownEpoch) as Stock[];
    const reclaim = this.db.prepare(`SELECT epoch,item,quantity FROM city_stock
      WHERE guild=? AND epoch IS NOT ? ORDER BY epoch,item LIMIT 60`).all(member.id, epoch) as Stock[];
    const listings = this.db.prepare(`SELECT id,seller_guild AS guild,seller_name AS name,city_epoch AS epoch,
      json_extract(item,'$.quantity') AS quantity,price FROM listings WHERE seller_guild=? AND state='open' ORDER BY rowid DESC`)
      .all(member.id) as GuildListing[];
    const job = ownEpoch === null ? undefined : this.running(ownEpoch);
    const project = ownEpoch === null ? undefined : this.warehouseProject(ownEpoch);
    const capacity = this.capacity();
    return {
      epoch: ownEpoch, level, stock: stock.map(row => ({...row})), reclaim: reclaim.map(row => ({...row})),
      listings: listings.map(row => ({...row})), capacity,
      used: ownEpoch === null ? 0 : this.used(ownEpoch), marketGold: this.marketGold(member.id),
      officer: member.officer, job: job ? {id: job.id, readyAt: job.ready, fee: job.fee} : null,
      constructionReserved: !!project && project.wood + project.stone + project.metal > 0,
      construction: {
        commander: member.commander === true, siege: ownership.siegeStarted !== undefined,
        complete: capacity === CITY_WAREHOUSE_CAPACITY, capacity: CITY_WAREHOUSE_CAPACITY,
        durationMs: CITY_WAREHOUSE_DURATION_MS, status: project?.status ?? null, readyAt: project?.ready ?? null,
        materials: CITY_WAREHOUSE_MATERIALS.map(({item, column, amount}) => ({item, amount, reserved: project?.[column] ?? 0})),
      },
      costs: level === 2 ? null : CITY_FACTORY_COSTS[level],
      recipe: {inputs: [{item: CITY_RAW_ITEMS[0], amount: CITY_RECIPE.wood}, {item: CITY_RAW_ITEMS[1], amount: CITY_RECIPE.stone}],
        output: CITY_PRODUCT, amount: CITY_RECIPE.quantity, durationMs: CITY_DURATION_MS[level],
        rush: level ? {gold: CITY_RUSH_GOLD, durationMs: CITY_DURATION_MS[level] / 2} : null},
    };
  }
}
