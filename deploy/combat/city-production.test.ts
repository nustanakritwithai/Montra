import test, {type TestContext} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {EconomyStore} from "./EconomyStore.js";
import {GuildStore} from "./GuildStore.js";
import {makeClassInventory} from "./ItemRules.js";
import {
  CITY_PRODUCT, CITY_PRODUCTION_SITE, CITY_RAW_ITEMS, CITY_WAREHOUSE_DURATION_MS, CITY_WAREHOUSE_MATERIALS, parseCityOrder,
} from "./CityProductionRules.js";
import {RIVER_WAR_DURATION} from "./RiverCity.js";
import {WAR_PROTECTION} from "./TerritoryWar.js";

const leader = "a".repeat(64), member = "b".repeat(64), rival = "c".repeat(64);
const [wood, stone] = CITY_RAW_ITEMS;

function bag(full = false) {
  const inventory = makeClassInventory("seer");
  inventory.slots.fill(null);
  inventory.equippedWeaponSlot = null;
  if (full) inventory.slots.fill({itemId: "health_potion", quantity: 99});
  else {
    inventory.slots[0] = {itemId: wood, quantity: 99};
    inventory.slots[1] = {itemId: stone, quantity: 99};
  }
  return inventory;
}

function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "montra-city-test-"));
  const guildFile = join(directory, "guilds.sqlite"), economyFile = join(directory, "economy.sqlite");
  let guild = new GuildStore(guildFile), economy = new EconomyStore(economyFile);
  t.after(() => {
    guild.close();
    economy.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, {recursive: true, force: true});
  });
  for (const [actor, name] of [[leader, "เจ้าของเมือง"], [rival, "ผู้ชิงเมือง"]])
    guild.create(actor, name, name);
  guild.add(leader, member, "สมาชิก");
  for (const actor of [leader, member, rival]) economy.register(actor, bag(actor === rival));
  let serial = 0;
  const request = () => "city_test_request_" + ++serial;
  const guildMember = (actor: string) => guild.war.member(actor)!;
  const sync = (now: number) => economy.syncCity(previous => guild.war.government.cityOwnership(previous), now);
  const capture = (actor: string, at: number) => {
    guild.war.government.settleVictory(CITY_PRODUCTION_SITE, guildMember(actor).id, at, false);
  };
  const order = (actor: string, fields: object, now = 1000, requestId = request()) => {
    const parsed = parseCityOrder({...fields, requestId});
    assert.ok(parsed && parsed.action !== "disband" && parsed.action !== "claim_disband");
    return economy.cityOrder(actor, guildMember(actor), parsed, sync(now), now);
  };
  const view = (actor: string, now = 1000) => economy.viewCity(guildMember(actor), sync(now));
  const restart = () => {
    guild.close();
    economy.close();
    guild = new GuildStore(guildFile);
    economy = new EconomyStore(economyFile);
  };
  capture(leader, 1000);
  const epoch = view(leader).epoch!;
  const deposit = (actor: string, slot: number, amount: number, requestId?: string) =>
    order(actor, {action: "deposit", epoch, item: CITY_RAW_ITEMS[slot], slot, amount}, 1000, requestId);
  return {get economy() { return economy; }, get guild() { return guild; }, guildFile, economyFile,
    capture, request, order, view, restart, epoch, deposit, guildMember};
}

function warehouseFixture(t: TestContext) {
  const f = fixture(t), {epoch} = f;
  // The shared fixture seeds the estate directly. Give the war service its matching battle record.
  const owner = f.guildMember(leader).id;
  const db = new DatabaseSync(f.guildFile);
  db.prepare("INSERT INTO territory_battles(site,attacker,started,sample,ended,winner) VALUES(?,?,?,?,?,?)")
    .run(CITY_PRODUCTION_SITE, owner, 1, 1_000, 1_000, owner);
  db.close();
  const start = {action: "warehouse_start", epoch};
  const contribute = (actor: string, slot: number, amount: number, now = 1000, requestId?: string) =>
    f.order(actor, {action: "warehouse_contribute", epoch, slot, item: [...CITY_RAW_ITEMS, CITY_PRODUCT][slot], amount}, now, requestId);
  const allocate = (actor: string, item: string, amount: number, now: number) =>
    f.order(actor, {action: "warehouse_allocate", epoch, item, amount}, now);
  const fund = (at: number) => {
    const inventory = f.economy.getAccount(member).inventory;
    inventory.slots[2] = {itemId: CITY_PRODUCT, quantity: 4};
    f.economy.saveCharacter(member, {}, inventory);
    for (const [slot, {amount}] of CITY_WAREHOUSE_MATERIALS.entries()) contribute(member, slot, amount, at);
    return at + CITY_WAREHOUSE_DURATION_MS;
  };
  const siege = (at: number) => f.guild.war.start(CITY_PRODUCTION_SITE, f.guildMember(rival), at);
  return {...f, get economy() { return f.economy; }, get guild() { return f.guild; },
    start, contribute, allocate, fund, siege, openAt: 1_000 + WAR_PROTECTION};
}

test("warehouse construction checks roles, reserves exactly once, accepts factory output and expands real capacity after restart", t => {
  const f = warehouseFixture(t), {epoch} = f;
  assert.throws(() => f.order(member, f.start), /city_commander_required/);
  assert.throws(() => f.order(rival, f.start), /city_not_owner/);
  assert.equal(parseCityOrder({...f.start, requestId: f.request(), amount: 1}), null);
  f.order(leader, f.start);
  assert.throws(() => f.order(leader, f.start), /city_project_exists/);

  const request = f.request();
  const receipt = f.contribute(member, 0, 10, 1_000, request);
  f.restart();
  assert.deepEqual(f.contribute(member, 0, 10, 1_001, request), receipt);
  assert.throws(() => f.contribute(leader, 0, 3, 1_001), /city_project_surplus/);
  assert.equal(f.economy.getAccount(leader).inventory.slots[0]?.quantity, 99);
  f.contribute(leader, 0, 2, 1_001);
  f.contribute(member, 1, 16, 1_001);
  assert.equal(f.economy.getAccount(member).inventory.slots[0]?.quantity, 89);

  f.deposit(leader, 0, 30);
  f.deposit(leader, 1, 30);
  assert.throws(() => f.deposit(member, 0, 1), /city_storage_full/);
  f.order(leader, {action: "build", epoch});
  f.order(leader, {action: "build", epoch});
  for (const now of [2_000, 62_000, 122_000, 182_000]) f.order(leader, {action: "start", epoch}, now);
  assert.throws(() => f.allocate(member, CITY_PRODUCT, 1, 242_000), /city_officer_required/);
  f.allocate(leader, CITY_PRODUCT, 4, 242_000);
  const readyAt = 242_000 + CITY_WAREHOUSE_DURATION_MS;
  assert.equal(f.view(leader, 242_001).construction.readyAt, readyAt);
  assert.equal(f.view(leader, 242_001).stock.find(x => x.item === CITY_PRODUCT), undefined);
  f.restart();
  assert.equal(f.view(leader, readyAt - 1).capacity, 60);
  assert.equal(f.view(leader, readyAt).capacity, 90);
  f.order(leader, {action: "deposit", epoch, slot: 0, item: wood, amount: 60}, readyAt);
  assert.equal(f.view(leader, readyAt).used, 78);
  f.capture(rival, readyAt + 1);
  const next = f.view(rival, readyAt + 1);
  assert.equal(next.capacity, 90);
  assert.deepEqual(next.stock, []);
  assert.throws(() => f.order(rival, {...f.start, epoch: next.epoch}, readyAt + 2), /city_warehouse_complete/);
});

test("an active siege blocks new work and holds a funded project until the defense settles", t => {
  const f = warehouseFixture(t);
  const siegeAt = f.openAt;
  f.order(leader, f.start, siegeAt - 2);
  const readyAt = f.fund(siegeAt - 1);
  f.siege(siegeAt);
  assert.throws(() => f.contribute(member, 0, 1, siegeAt + 1), /city_construction_siege/);
  assert.equal(f.view(leader, readyAt).construction.siege, true);
  assert.equal(f.view(leader, readyAt).capacity, 60);
  f.restart();
  const end = siegeAt + RIVER_WAR_DURATION;
  assert.equal(f.guild.war.inspect(CITY_PRODUCTION_SITE, end).ownerId, f.guildMember(leader).id);
  assert.equal(f.view(leader, end).epoch, f.epoch);
  assert.equal(f.view(leader, end).capacity, 90);
});

test("loss during a siege refunds reserved materials to the old guild even if the deadline has passed", t => {
  const f = warehouseFixture(t);
  const siegeAt = f.openAt;
  f.order(leader, f.start, siegeAt - 2);
  const readyAt = f.fund(siegeAt - 1);
  const field = f.siege(siegeAt);
  for (const gate of ["G11", "G21"])
    for (let hit = 0; hit < 8; hit++) f.guild.war.riverGate(field, gate, "attack", false, siegeAt);
  for (let i = 1; i <= 70; i++) {
    f.guild.war.advance(field, readyAt + i * 1000, 2, 0, undefined, undefined, null,
      [{attack: 1, defend: 0}, {attack: 0, defend: 0}, {attack: 0, defend: 0}]);
  }
  const end = readyAt + 70_000;
  assert.equal(f.guild.war.inspect(CITY_PRODUCTION_SITE, end).ownerId, f.guildMember(rival).id);
  f.restart();
  const next = f.view(rival, end);
  assert.equal(next.capacity, 60);
  assert.deepEqual(next.stock, []);
  const recovered = f.view(leader, end).reclaim.map(({item, quantity}) => [item, quantity]).sort();
  assert.deepEqual(recovered, CITY_WAREHOUSE_MATERIALS.map(({item, amount}) => [item, amount]).sort());
  assert.deepEqual(f.view(leader, end + 1).reclaim.map(({item, quantity}) => [item, quantity]).sort(), recovered);
});

test("disbanding a guild with only reserved construction materials preserves its claim", t => {
  const f = warehouseFixture(t);
  f.order(leader, f.start);
  f.contribute(member, 0, 5);
  const guildId = f.guildMember(leader).id;
  assert.equal(f.economy.hasCityAssets(guildId), true);
  f.guild.leave(member);
  const intent = f.guild.beginCityDisband(leader, guildId, 2_000);
  f.guild.settleCityDisband(f.economy, intent);
  f.restart();
  assert.deepEqual(f.economy.cityDisbandClaims(leader).map(({item, amount}) => ({item, amount})), [{item: wood, amount: 5}]);
});

test("only officers can spend market gold to rush production, and interrupted jobs refund the fee", t => {
  const f = fixture(t), {epoch} = f;
  f.deposit(leader, 0, 15);
  f.deposit(leader, 1, 15);
  f.order(leader, {action: "build", epoch});
  assert.throws(() => f.order(leader, {action: "start_fast", epoch}), /city_market_funds/);
  f.order(leader, {action: "start", epoch});
  const {listingId} = f.order(leader, {action: "list", epoch, amount: 1, price: 70}, 121_000);
  f.economy.buy(member, f.request(), String(listingId));
  assert.throws(() => f.order(member, {action: "start_fast", epoch}, 121_000), /city_officer_required/);
  const requestId = f.request();
  const rush = f.order(leader, {action: "start_fast", epoch}, 122_000, requestId);
  assert.deepEqual(f.order(leader, {action: "start_fast", epoch}, 122_001, requestId), rush);
  assert.equal(rush.readyAt, 182_000);
  assert.equal(rush.fee, 15);
  assert.equal(f.view(leader, 122_001).marketGold, 55);
  f.order(leader, {action: "start_fast", epoch}, 182_000);
  assert.equal(f.view(leader, 182_001).marketGold, 40);
  f.capture(rival, 183_000);
  f.restart();
  assert.equal(f.view(leader, 250_000).marketGold, 55);
  assert.equal(f.view(leader, 250_000).reclaim.find(x => x.item === CITY_PRODUCT)?.quantity, 1);
});

test("an existing running job is kept and gets a zero fee on upgrade", t => {
  const f = fixture(t), {epoch} = f;
  f.deposit(leader, 0, 8);
  f.deposit(leader, 1, 8);
  f.order(leader, {action: "build", epoch});
  const job = f.order(leader, {action: "start", epoch});
  const legacy = new DatabaseSync(f.economyFile);
  try { legacy.exec("ALTER TABLE city_jobs DROP COLUMN fee"); }
  finally { legacy.close(); }
  f.restart();
  assert.deepEqual(f.view(leader, 1001).job, {id: job.jobId, readyAt: job.readyAt, fee: 0});
  assert.equal(f.view(leader, 121_000).stock.find(x => x.item === CITY_PRODUCT)?.quantity, 1);
});

test("guild disband recovers after both failure boundaries and pays only the final commander", t => {
  const f = fixture(t), {epoch} = f;
  const guildId = f.guild.war.member(leader)!.id;
  f.deposit(leader, 0, 20);
  f.deposit(leader, 1, 20);
  f.order(leader, {action: "build", epoch});
  assert.throws(() => f.guild.beginCityDisband(leader, guildId, 1000), /city_disband_unavailable/);
  f.order(leader, {action: "start", epoch});
  const sold = f.order(leader, {action: "list", epoch, amount: 1, price: 70}, 121_000);
  f.economy.buy(member, f.request(), String(sold.listingId));
  f.order(leader, {action: "start", epoch}, 122_000);
  const open = f.order(leader, {action: "list", epoch, amount: 1, price: 40}, 242_000);
  f.order(leader, {action: "start_fast", epoch}, 243_000);
  f.guild.leave(member);
  assert.throws(() => f.guild.leave(leader, guild => f.economy.hasCityAssets(guild)), /guild_city_assets/);
  assert.throws(() => f.guild.beginCityDisband(rival, guildId, 244_000), /city_disband_unavailable/);
  f.guild.beginCityDisband(leader, guildId, 244_000);
  assert.throws(() => f.guild.add(leader, member, "ผู้สมัคร"), /guild_city_disband_pending/);
  assert.throws(() => f.guild.leave(leader), /guild_city_disband_pending/);
  f.restart();
  const [pending] = f.guild.pendingCityDisbands();
  assert.equal(pending.requested, 244_000);

  const marketFault = new DatabaseSync(f.economyFile);
  try {
    marketFault.exec("CREATE TRIGGER reject_award BEFORE INSERT ON city_disband_assets BEGIN SELECT RAISE(ABORT, 'award failed'); END;");
    assert.throws(() => f.guild.settleCityDisband(f.economy, pending), /award failed/);
    assert.equal(f.economy.cityDisbandClaims(leader).length, 0);
    assert.equal(f.economy.list()[0]?.id, open.listingId);
    assert.equal(f.guild.cityDisbandPending(guildId), true);
    marketFault.exec("DROP TRIGGER reject_award");
  } finally { marketFault.close(); }

  const guildFault = new DatabaseSync(f.guildFile);
  try {
    guildFault.exec("CREATE TRIGGER reject_disband BEFORE DELETE ON guilds BEGIN SELECT RAISE(ABORT, 'disband failed'); END;");
    assert.throws(() => f.guild.settleCityDisband(f.economy, pending), /disband failed/);
    assert.equal(f.economy.cityDisbandClosed(leader, guildId), true);
    assert.equal(f.guild.cityDisbandPending(guildId), true);
    assert.throws(() => f.economy.buy(member, f.request(), String(open.listingId)), /listing_unavailable/);
    guildFault.exec("DROP TRIGGER reject_disband");
  } finally { guildFault.close(); }

  f.restart();
  f.guild.settleCityDisband(f.economy, f.guild.pendingCityDisbands()[0]);
  f.guild.settleCityDisband(f.economy, pending);
  assert.equal(f.guild.hasMember(leader), false);
  assert.equal(f.guild.pendingCityDisbands().length, 0);
  const assets = Object.fromEntries(f.economy.cityDisbandClaims(leader).map(row => [row.item, row.amount]));
  assert.deepEqual(assets, {gold: 70, [CITY_PRODUCT]: 1, [wood]: 13, [stone]: 11});
  assert.deepEqual(f.economy.cityDisbandClaims(rival), []);
  const claim = {action: "claim_disband", guildId, item: "gold", amount: 25, requestId: f.request()} as const;
  assert.throws(() => f.economy.claimCityDisband(rival, {...claim, requestId: f.request()}), /city_claim_unavailable/);
  f.economy.claimCityDisband(leader, claim);
  f.restart();
  f.economy.claimCityDisband(leader, claim);
  assert.equal(f.economy.getAccount(leader).gold, 1025);
  assert.throws(() => f.economy.eraseCharacter(leader), /character_has_city_claims/);

  const held = {action: "claim_disband", guildId, item: CITY_PRODUCT, amount: 1, requestId: f.request()} as const;
  const original = f.economy.getAccount(leader).inventory;
  f.economy.saveCharacter(leader, {}, bag(true));
  assert.throws(() => f.economy.claimCityDisband(leader, held), /inventory_full/);
  assert.equal(f.economy.cityDisbandClaims(leader).find(row => row.item === CITY_PRODUCT)?.amount, 1);
  f.economy.saveCharacter(leader, {}, original);
  f.economy.claimCityDisband(leader, held);
  f.economy.claimCityDisband(leader, {...claim, amount: 45, requestId: f.request()});
  f.economy.claimCityDisband(leader, {...held, item: wood, amount: 13, requestId: f.request()});
  f.economy.claimCityDisband(leader, {...held, item: stone, amount: 11, requestId: f.request()});
  assert.equal(f.economy.hasCityDisbandClaims(leader), false);
  assert.equal(f.economy.getAccount(leader).gold, 1070);
});

test("members can deposit once, capacity is reserved, and only officers can operate the factory", t => {
  const f = fixture(t), {epoch} = f;
  assert.equal(parseCityOrder({action: "deposit", epoch, slot: 0, item: CITY_PRODUCT, amount: 1, requestId: f.request()}), null);
  const request = f.request();
  f.deposit(member, 0, 30, request);
  assert.deepEqual(f.deposit(member, 0, 30, request), {quantity: 30});
  assert.throws(() => f.deposit(member, 0, 29, request), /request_id_conflict/);
  assert.equal(f.economy.getAccount(member).inventory.slots[0]?.quantity, 69);
  assert.throws(() => f.deposit(rival, 0, 1), /city_not_owner/);
  assert.throws(() => f.deposit(member, 1, 31), /city_storage_full/);
  assert.equal(f.economy.getAccount(member).inventory.slots[1]?.quantity, 99);
  f.deposit(leader, 1, 30);
  assert.throws(() => f.order(member, {action: "build", epoch}), /city_officer_required/);
  assert.deepEqual(f.order(leader, {action: "build", epoch}), {level: 1});
  assert.deepEqual(f.order(leader, {action: "build", epoch}), {level: 2});
  assert.throws(() => f.order(leader, {action: "build", epoch}), /city_factory_max/);
  const started = f.order(leader, {action: "start", epoch});
  assert.equal(started.readyAt, 61_000);
  assert.throws(() => f.order(leader, {action: "start", epoch}), /city_job_running/);
  f.restart();
  assert.equal(f.view(leader, 60_999).job?.id, started.jobId);
  assert.equal(f.view(leader, 61_000).job, null);
  assert.equal(f.view(leader, 61_001).stock.find(x => x.item === CITY_PRODUCT)?.quantity, 1);
  assert.throws(() => f.order(leader, {action: "reclaim", epoch, item: CITY_PRODUCT, amount: 1}, 61_001), /city_stock_active/);
});

test("a takeover keeps the factory, refunds unfinished work and preserves the original seller after restart", t => {
  const f = fixture(t), {epoch} = f;
  f.deposit(leader, 0, 15);
  f.deposit(leader, 1, 15);
  f.order(leader, {action: "build", epoch});
  f.order(leader, {action: "start", epoch});
  const listed = f.order(leader, {action: "list", epoch, amount: 1, price: 70}, 121_000);
  const listingId = String(listed.listingId);
  assert.equal(f.economy.browseMarket(rival, CITY_PRODUCT, "material", null).listings[0]?.seller, "เจ้าของเมือง");
  assert.throws(() => f.economy.buy(rival, f.request(), listingId), /inventory_full/);
  assert.equal(f.economy.getAccount(rival).gold, 1000);
  const job = f.order(leader, {action: "start", epoch}, 122_000);
  f.capture(rival, 123_000);
  f.restart();

  const state = f.view(rival, 250_000);
  assert.notEqual(state.epoch, epoch);
  assert.equal(state.level, 1);
  assert.deepEqual(state.stock, []);
  const old = f.view(leader, 250_000);
  assert.equal(old.epoch, null);
  assert.deepEqual(old.reclaim, [
    {epoch, item: stone, quantity: 8},
    {epoch, item: wood, quantity: 9},
  ]);
  assert.equal(old.listings[0]?.id, listingId);
  assert.ok(Number(job.readyAt) > 123_000);
  assert.throws(() => f.order(rival, {action: "build", epoch}, 250_000), /city_ownership_changed/);
  assert.throws(() => f.order(rival, {action: "cancel", listingId}, 250_000), /listing_unavailable/);

  const buy = f.request();
  const fault = new DatabaseSync(f.economyFile);
  try {
    fault.exec("CREATE TRIGGER reject_credit BEFORE INSERT ON guild_market_gold BEGIN SELECT RAISE(ABORT, 'credit failed'); END;");
    assert.throws(() => f.economy.buy(member, buy, listingId), /credit failed/);
    assert.equal(f.economy.getAccount(member).gold, 1000);
    assert.equal(f.economy.getAccount(member).inventory.slots.some(x => x?.itemId === CITY_PRODUCT), false);
    assert.equal(f.economy.list()[0]?.id, listingId);
    fault.exec("DROP TRIGGER reject_credit");
  } finally { fault.close(); }
  f.restart();
  f.economy.buy(member, buy, listingId);
  f.restart();
  assert.deepEqual(f.economy.buy(member, buy, listingId), {listingId});
  assert.throws(() => f.economy.buy(rival, f.request(), listingId), /listing_unavailable/);
  assert.equal(f.economy.getAccount(member).gold, 930);
  assert.equal(f.economy.getAccount(member).inventory.slots.find(x => x?.itemId === CITY_PRODUCT)?.quantity, 1);
  assert.equal(f.economy.getAccount(leader).gold, 1000);
  assert.equal(f.view(leader, 250_000).marketGold, 70);
  assert.equal(f.view(rival, 250_000).marketGold, 0);

  const reclaim = f.request();
  f.order(leader, {action: "reclaim", epoch, item: wood, amount: 9}, 250_000, reclaim);
  f.order(leader, {action: "reclaim", epoch, item: wood, amount: 9}, 250_001, reclaim);
  assert.equal(f.economy.getAccount(leader).inventory.slots[0]?.quantity, 93);
});

test("a job due before takeover settles for the old guild; cancelling its listing returns its escrow", t => {
  const f = fixture(t), {epoch} = f;
  f.deposit(leader, 0, 10);
  f.deposit(leader, 1, 10);
  f.order(leader, {action: "build", epoch});
  f.order(leader, {action: "start", epoch});
  const {listingId} = f.order(leader, {action: "list", epoch, amount: 1, price: 100}, 121_000);
  f.order(leader, {action: "start", epoch}, 122_000);
  f.capture(rival, 250_000);
  f.restart();
  assert.equal(f.view(leader, 270_000).reclaim.find(x => x.item === CITY_PRODUCT)?.quantity, 1);
  const req = f.request();
  f.order(leader, {action: "cancel", listingId}, 270_000, req);
  f.order(leader, {action: "cancel", listingId}, 270_001, req);
  assert.equal(f.view(leader, 270_001).reclaim.find(x => x.item === CITY_PRODUCT)?.quantity, 2);
  assert.equal(f.economy.list().length, 0);
});

test("a mismatched ownership restore cannot settle a job against another guild", t => {
  const f = fixture(t);
  f.deposit(leader, 0, 10);
  f.deposit(leader, 1, 10);
  f.order(leader, {action: "build", epoch: f.epoch});
  const {jobId} = f.order(leader, {action: "start", epoch: f.epoch});
  assert.throws(() => f.economy.syncCity(() => ({
    active: {id: f.epoch, guild: "other guild"}, previous: null,
  }), 130_000), /city_ownership_unavailable/);
  assert.equal(f.view(leader, 1001).job?.id, jobId);
  assert.equal(f.view(leader, 130_000).stock.find(x => x.item === CITY_PRODUCT)?.quantity, 1);
});

test("legacy player listings keep their order and settle normally after migration", t => {
  const directory = mkdtempSync(join(tmpdir(), "montra-city-test-"));
  const file = join(directory, "economy.sqlite");
  const legacy = new DatabaseSync(file);
  legacy.exec(`CREATE TABLE accounts(id TEXT PRIMARY KEY, gold INTEGER NOT NULL, inventory TEXT NOT NULL);
    CREATE TABLE listings(id TEXT PRIMARY KEY, seller TEXT NOT NULL REFERENCES accounts(id), item TEXT NOT NULL, price INTEGER NOT NULL, state TEXT NOT NULL);
    CREATE INDEX listings_state ON listings(state);
    CREATE INDEX listings_seller_state ON listings(seller,state);`);
  legacy.prepare("INSERT INTO accounts VALUES(?,?,?),(?,?,?)")
    .run(leader, 1000, JSON.stringify(bag()), member, 1000, JSON.stringify(bag()));
  legacy.prepare("INSERT INTO listings(rowid,id,seller,item,price,state) VALUES(17,?,?,?,?,'open')")
    .run("legacy-id", leader, JSON.stringify({itemId: CITY_PRODUCT, quantity: 1}), 50);
  legacy.close();
  const store = new EconomyStore(file);
  t.after(() => {
    store.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    rmSync(directory, {recursive: true, force: true});
  });
  assert.equal(store.browseMarket(member, "", "all", 17).listings.length, 0);
  assert.equal(store.browseMarket(member, "", "all", 18).listings[0]?.id, "legacy-id");
  store.buy(member, "city_legacy_purchase", "legacy-id");
  assert.equal(store.getAccount(member).gold, 950);
  assert.equal(store.getAccount(leader).gold, 1050);
});
