import {randomUUID} from "node:crypto";
import type {DatabaseSync} from "node:sqlite";
import {
  CITY_CAPACITY, CITY_DURATION_MS, CITY_FACTORY_COSTS, CITY_PRODUCT, CITY_RAW_ITEMS, CITY_RECIPE,
  type CityItem, type CityMember, type CityOwnership,
} from "./CityProductionRules.js";

type Job = {id: string; epoch: number; guild: string; ready: number; wood: number; stone: number; quantity: number};
type Factory = {epoch: number | null; guild: string | null; level: 0 | 1 | 2};
type Stock = {epoch: number; item: CityItem; quantity: number};
type GuildListing = {id: string; guild: string; name: string; epoch: number; quantity: number; price: number};

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
      CREATE TABLE IF NOT EXISTS guild_market_gold (
        listing TEXT PRIMARY KEY REFERENCES listings(id), guild TEXT NOT NULL,
        amount INTEGER NOT NULL CHECK(amount>0));
      CREATE INDEX IF NOT EXISTS guild_market_gold_owner ON guild_market_gold(guild);`);
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
        this.add(job.epoch, job.guild, CITY_PRODUCT, job.quantity);
        this.db.prepare("UPDATE city_jobs SET status='complete' WHERE id=?").run(job.id);
      } else if (job && epoch !== active) {
        this.add(job.epoch, job.guild, CITY_RAW_ITEMS[0], job.wood);
        this.add(job.epoch, job.guild, CITY_RAW_ITEMS[1], job.stone);
        this.db.prepare("UPDATE city_jobs SET status='cancelled' WHERE id=?").run(job.id);
      }
    }
    if (epoch !== active)
      this.db.prepare("UPDATE city_factory SET epoch=?,guild=? WHERE id=1").run(active, ownership.active?.guild ?? null);
  }

  requireCity(member: CityMember, epoch: number, ownership: CityOwnership): void {
    if (ownership.active?.guild !== member.id) throw Error("city_not_owner");
    if (ownership.active.id !== epoch) throw Error("city_ownership_changed");
  }

  private requireOfficer(member: CityMember): void {
    if (!member.officer) throw Error("city_officer_required");
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
    if (this.used(epoch) + amount > CITY_CAPACITY) throw Error("city_storage_full");
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

  start(epoch: number, member: CityMember, now: number): {jobId: string; readyAt: number} {
    this.requireOfficer(member);
    const level = this.factory().level;
    if (!level) throw Error("city_factory_required");
    if (this.running(epoch)) throw Error("city_job_running");
    this.consumeRaw(epoch, member.id, CITY_RECIPE);
    if (this.used(epoch) + CITY_RECIPE.quantity > CITY_CAPACITY) throw Error("city_storage_full");
    const jobId = randomUUID(), readyAt = now + CITY_DURATION_MS[level];
    this.db.prepare(`INSERT INTO city_jobs(id,epoch,guild,ready,wood,stone,quantity,status)
      VALUES(?,?,?,?,?,?,?,'running')`).run(jobId, epoch, member.id, readyAt, CITY_RECIPE.wood, CITY_RECIPE.stone, CITY_RECIPE.quantity);
    return {jobId, readyAt};
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
    const gold = this.db.prepare("SELECT coalesce(sum(amount),0) AS amount FROM guild_market_gold WHERE guild=?").get(member.id);
    const job = ownEpoch === null ? undefined : this.running(ownEpoch);
    return {
      epoch: ownEpoch, level, stock: stock.map(row => ({...row})), reclaim: reclaim.map(row => ({...row})),
      listings: listings.map(row => ({...row})), capacity: CITY_CAPACITY,
      used: ownEpoch === null ? 0 : this.used(ownEpoch), marketGold: Number(gold?.amount),
      officer: member.officer, job: job ? {id: job.id, readyAt: job.ready} : null,
      costs: level === 2 ? null : CITY_FACTORY_COSTS[level],
      recipe: {inputs: [{item: CITY_RAW_ITEMS[0], amount: CITY_RECIPE.wood}, {item: CITY_RAW_ITEMS[1], amount: CITY_RECIPE.stone}],
        output: CITY_PRODUCT, amount: CITY_RECIPE.quantity, durationMs: CITY_DURATION_MS[level]},
    };
  }
}
