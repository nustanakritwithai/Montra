import test, {type TestContext} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync, rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, resolve} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {EconomyStore} from "./EconomyStore.js";
import {GuildStore} from "./GuildStore.js";
import {makeClassInventory} from "./ItemRules.js";
import {CITY_PRODUCT, CITY_PRODUCTION_SITE, CITY_RAW_ITEMS, parseCityOrder} from "./CityProductionRules.js";

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
    capture, request, order, view, restart, epoch, deposit};
}

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


test("city deposits roll back while a monster reward is pending and can be retried", t => {
  const f = fixture(t);
  const inventory = f.economy.getAccount(leader).inventory;
  const snapshot = {inventory, experience: 125};
  const requestId = f.request();
  f.economy.stageMonsterReward(leader, snapshot);

  assert.throws(() => f.deposit(leader, 0, 3, requestId), /monster_reward_pending/);
  assert.deepEqual(f.economy.getAccount(leader).inventory, inventory);
  assert.deepEqual(f.view(leader).stock, []);

  f.economy.commitMonsterReward(leader, record => {
    assert.deepEqual(record, snapshot);
    return {snapshot, inventory};
  });
  assert.deepEqual(f.deposit(leader, 0, 3, requestId), {quantity: 3});
  assert.deepEqual(f.deposit(leader, 0, 3, requestId), {quantity: 3});
  assert.equal(f.economy.getAccount(leader).inventory.slots[0]?.quantity, 96);
  assert.equal(f.view(leader).stock.find(item => item.item === wood)?.quantity, 3);
  assert.equal((f.economy.getCharacter(leader) as {experience: number}).experience, 125);
});
