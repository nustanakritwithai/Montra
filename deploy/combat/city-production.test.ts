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
  CITY_WORKSHOP_FEE, CITY_WORKSHOP_SLOTS,
  CITY_MINING_ENABLED, CITY_MINING_ORE, CITY_MINING_PRODUCT, CITY_MINING_SITE, CITY_PRODUCTION_ENABLED, type CitySite,
  CITY_POLICY_COOLDOWN_MS, CITY_PURCHASE_DURATION_MS, isCityMissionOrder, isCityPurchaseOrder, type CityPolicy,
} from "./CityProductionRules.js";
import {RIVER_WAR_DURATION} from "./RiverCity.js";
import {WAR_DURATION, WAR_PROTECTION} from "./TerritoryWar.js";
import {WORLD_EXPANSION} from "./WorldMaps.js";
import {harvestableFrom, rawResource, resourceApproach, resourceNodes, type ResourceNode} from "./WorldResources.js";

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
  const sync = (now: number, site: CitySite = CITY_PRODUCTION_SITE) =>
    economy.syncCity(previous => guild.war.government.cityOwnership(previous, site), now, site);
  const capture = (actor: string, at: number, site: CitySite = CITY_PRODUCTION_SITE) => {
    guild.war.government.settleVictory(site, guildMember(actor).id, at, false);
  };
  const order = (actor: string, fields: object, now = 1000, requestId = request(), site: CitySite = CITY_PRODUCTION_SITE) => {
    const parsed = parseCityOrder({...fields, requestId});
    assert.ok(parsed && parsed.action !== "disband" && parsed.action !== "claim_disband" &&
      parsed.action !== "workshop_start" && parsed.action !== "workshop_claim" &&
      !isCityPurchaseOrder(parsed) && !isCityMissionOrder(parsed) && parsed.action !== "policy_set");
    return economy.cityOrder(actor, guildMember(actor), parsed, sync(now, site), now, site);
  };
  const view = (actor: string, now = 1000, site: CitySite = CITY_PRODUCTION_SITE) => economy.viewCity(guildMember(actor), sync(now, site), site);
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
    capture, request, order, view, restart, epoch, deposit, guildMember, sync};
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

const visitor = "d".repeat(64);
function workshopFixture(t: TestContext) {
  const f = warehouseFixture(t);
  f.economy.register(visitor, bag());
  const workshop = (actor: string, now: number) => f.economy.viewCityWorkshop(actor, f.sync(now), now);
  const unlock = () => {
    f.order(leader, f.start);
    const due = f.fund(2_000);
    f.deposit(leader, 0, 5);
    f.deposit(leader, 1, 5);
    f.order(leader, {action: "build", epoch: f.epoch});
    return due;
  };
  const start = (actor: string, now: number, requestId = f.request(), epoch = f.epoch, stoneSlot = 1) =>
    f.economy.startCityWorkshop(actor, {action: "workshop_start", requestId, epoch, woodSlot: 0, stoneSlot}, f.sync(now), now);
  const claim = (actor: string, jobId: string, now: number, requestId = f.request()) =>
    f.economy.claimCityWorkshop(actor, {action: "workshop_claim", requestId, jobId}, now);
  return {...f, get economy() { return f.economy; }, get guild() { return f.guild; }, workshop, unlock, start, claim};
}

test("public workshop pays the original owner once and preserves personal orders through restart, conquest and disband", t => {
  const f = workshopFixture(t);
  assert.throws(() => f.start(visitor, 1_000), /city_workshop_locked/);
  const unlocked = f.unlock();
  assert.equal(f.workshop(visitor, unlocked - 1).unlocked, false);
  assert.equal(f.workshop(visitor, unlocked).unlocked, true);
  assert.equal(f.guild.war.member(visitor), undefined);
  const wallet = new DatabaseSync(f.economyFile);
  try {
    wallet.prepare("UPDATE accounts SET gold=? WHERE id=?").run(CITY_WORKSHOP_FEE - 1, visitor);
    assert.throws(() => f.start(visitor, unlocked), /city_workshop_funds/);
    assert.equal(f.workshop(visitor, unlocked).job, null);
    assert.equal(f.view(leader, unlocked).marketGold, 0);
    wallet.prepare("UPDATE accounts SET gold=1000 WHERE id=?").run(visitor);
  } finally { wallet.close(); }
  assert.throws(() => f.start(visitor, unlocked, f.request(), f.epoch, 2), /item_unavailable/);
  assert.equal(f.workshop(visitor, unlocked).job, null);
  assert.equal(f.view(leader, unlocked).marketGold, 0);
  assert.equal(f.economy.getAccount(visitor).gold, 1000);

  const request = f.request(), job = f.start(visitor, unlocked, request);
  assert.equal(job.fee, CITY_WORKSHOP_FEE);
  assert.equal(job.readyAt, unlocked + 120_000);
  assert.throws(() => f.start(visitor, unlocked), /city_workshop_pending/);
  assert.throws(() => f.claim(visitor, job.jobId, job.readyAt - 1), /city_workshop_not_ready/);
  assert.throws(() => f.claim(member, job.jobId, job.readyAt), /city_workshop_job_missing/);
  assert.throws(() => f.economy.eraseCharacter(visitor), /character_has_city_job/);
  f.capture(rival, unlocked + 1);
  f.restart();
  assert.deepEqual(f.start(visitor, unlocked + 2, request), job);
  assert.throws(() => f.start(visitor, unlocked + 2), /city_ownership_changed/);
  assert.equal(f.view(rival, unlocked + 2).marketGold, 0);
  assert.equal(f.view(leader, unlocked + 2).marketGold, CITY_WORKSHOP_FEE);
  const before = f.economy.getAccount(visitor);
  assert.equal(before.gold, 1000 - CITY_WORKSHOP_FEE);
  assert.equal(before.inventory.slots[0]?.quantity, 98);
  assert.equal(before.inventory.slots[1]?.quantity, 97);

  f.guild.leave(member);
  const oldGuild = f.guildMember(leader).id;
  f.guild.settleCityDisband(f.economy, f.guild.beginCityDisband(leader, oldGuild, unlocked + 3));
  assert.equal(f.economy.cityDisbandClaims(leader).find(row => row.item === "gold")?.amount, CITY_WORKSHOP_FEE);
  f.economy.saveCharacter(visitor, {}, bag(true));
  assert.throws(() => f.claim(visitor, job.jobId, job.readyAt), /inventory_full/);
  assert.equal(f.workshop(visitor, job.readyAt).job?.id, job.jobId);
  f.economy.saveCharacter(visitor, {}, before.inventory);
  const claimId = f.request(), result = f.claim(visitor, job.jobId, job.readyAt, claimId);
  f.restart();
  assert.deepEqual(f.claim(visitor, job.jobId, job.readyAt, claimId), result);
  assert.throws(() => f.claim(visitor, job.jobId, job.readyAt), /city_workshop_job_missing/);
  assert.equal(f.economy.getAccount(visitor).inventory.slots.find(item => item?.itemId === CITY_PRODUCT)?.quantity, 1);
  f.economy.eraseCharacter(visitor);
});

test("public workshop enforces its shared queue and pauses intake during a siege", t => {
  const f = workshopFixture(t), now = f.unlock();
  const actors = Array.from({length: CITY_WORKSHOP_SLOTS + 1}, (_, index) => String(index + 1).repeat(64));
  for (const actor of actors) f.economy.register(actor, bag());
  const jobs = actors.slice(1).map(actor => f.start(actor, now));
  assert.equal(f.workshop(actors[0], now).used, CITY_WORKSHOP_SLOTS);
  assert.throws(() => f.start(actors[0], now), /city_workshop_full/);
  assert.equal(f.economy.getAccount(actors[0]).gold, 1000);
  assert.equal(f.workshop(actors[0], jobs[0].readyAt).used, 0);
  f.start(actors[0], jobs[0].readyAt);
  f.siege(f.openAt);
  assert.throws(() => f.start(visitor, f.openAt), /city_workshop_siege/);
  assert.equal(f.claim(actors[1], jobs[0].jobId, f.openAt).quantity, 1);
  assert.equal(parseCityOrder({action: "workshop_start", requestId: f.request(), epoch: f.epoch, woodSlot: 0, stoneSlot: 0}), null);
  assert.equal(parseCityOrder({action: "workshop_start", requestId: f.request(), epoch: f.epoch, woodSlot: 0, stoneSlot: 1, fee: 0}), null);
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
  assert.equal(parseCityOrder({action: "deposit", epoch, slot: 0, item: CITY_MINING_PRODUCT, amount: 1, requestId: f.request()}), null);
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

function miningFixture(t: TestContext, actor: string) {
  const f = fixture(t);
  f.capture(actor, 1_000, CITY_MINING_SITE);
  const epoch = f.view(actor, 1_000, CITY_MINING_SITE).epoch!;
  const mine = (fields: object, now = 1_000) =>
    f.order(actor, {epoch, ...fields}, now, f.request(), CITY_MINING_SITE);
  const miningStock = (now: number) => f.view(actor, now, CITY_MINING_SITE);
  const bagWithOre = bag();
  bagWithOre.slots[1] = {itemId: CITY_MINING_ORE, quantity: 20};
  bagWithOre.slots[2] = {itemId: CITY_PRODUCT, quantity: 7};
  f.economy.saveCharacter(actor, {}, bagWithOre);
  return {...f, get economy() { return f.economy; }, get guild() { return f.guild; }, mine, miningStock};
}

test("the enabled moon ore sources yield tier-two stone and can be reached on foot", () => {
  const ore = resourceNodes(CITY_MINING_SITE).filter(node => node.id.startsWith(CITY_MINING_SITE+"/moon-ore-"));
  assert.equal(ore.length, WORLD_EXPANSION && CITY_PRODUCTION_ENABLED && CITY_MINING_ENABLED ? 3 : 0);
  for (const node of ore) {
    assert.equal(rawResource(node), CITY_MINING_ORE);
    const p = resourceApproach(node);
    assert.ok(p);
    assert.doesNotThrow(() => harvestableFrom({...p, level: 10}, node));
    assert.throws(() => harvestableFrom({...p, level: 9}, node), /item_level_required/);
  }
});

test("cities trade the two tiers of iron without mixing active stock, levels or takeover recovery", t => {
  const f = miningFixture(t, rival);
  const moon = f.miningStock(1_000), river = f.view(leader);
  assert.notEqual(moon.epoch, river.epoch);
  assert.equal(moon.recipe.output, CITY_MINING_PRODUCT);
  f.deposit(leader, 0, 12);
  f.deposit(leader, 1, 20);
  f.order(leader, {action: "build", epoch: f.epoch});
  f.order(leader, {action: "start", epoch: f.epoch});
  assert.equal(f.miningStock(1_001).level, 0);

  const basic = f.order(leader, {action: "list", epoch: f.epoch, amount: 1, price: 20}, 121_000);
  f.economy.buy(rival, f.request(), String(basic.listingId));
  assert.equal(f.economy.getAccount(rival).inventory.slots[2]?.quantity, 8);
  assert.throws(() => f.mine({action: "deposit", epoch: f.epoch, slot: 2, item: CITY_PRODUCT, amount: 1}, 121_000),
    /city_ownership_changed/);
  assert.throws(() => f.mine({action: "deposit", slot: 0, item: wood, amount: 1}, 121_000), /city_item_not_accepted/);
  assert.equal(f.economy.getAccount(rival).inventory.slots[0]?.quantity, 99);
  f.mine({action: "deposit", slot: 2, item: CITY_PRODUCT, amount: 8}, 121_000);
  f.mine({action: "deposit", slot: 1, item: CITY_MINING_ORE, amount: 12}, 121_000);
  f.mine({action: "build"}, 121_000);
  const job = f.mine({action: "start"}, 121_000);
  f.order(leader, {action: "start", epoch: f.epoch}, 121_000);
  assert.equal(f.miningStock(121_001).job?.id, job.jobId);
  assert.notEqual(f.view(leader, 121_001).job?.id, job.jobId);
  const now = 241_000;
  assert.equal(f.miningStock(now).stock.find(row => row.item === CITY_MINING_PRODUCT)?.quantity, 1);
  const listed = f.mine({action: "list", amount: 1, price: 30}, now);
  assert.equal(f.view(rival, now).listings[0]?.item, CITY_MINING_PRODUCT);
  f.order(rival, {action: "cancel", listingId: listed.listingId}, now);
  assert.equal(f.miningStock(now).stock.find(row => row.item === CITY_MINING_PRODUCT)?.quantity, 1);
  const sale = f.mine({action: "list", amount: 1, price: 30}, now);
  f.economy.buy(member, f.request(), String(sale.listingId));
  assert.equal(f.economy.getAccount(member).inventory.slots.find(item => item?.itemId === CITY_MINING_PRODUCT)?.quantity, 1);
  assert.equal(f.miningStock(now).marketGold, 30);

  f.mine({action: "start"}, now);
  f.capture(leader, now + 1, CITY_MINING_SITE);
  f.restart();
  const newMoon = f.view(leader, now + 2, CITY_MINING_SITE);
  assert.equal(newMoon.level, 1);
  assert.deepEqual(newMoon.stock, []);
  assert.equal(f.view(leader, now + 2).epoch, f.epoch);
  assert.equal(f.view(leader, now + 2).stock.find(row => row.item === CITY_PRODUCT)?.quantity, 1);
  assert.deepEqual(f.view(leader, now + 2, CITY_MINING_SITE).reclaim, []);
  const recovered = f.view(rival, now + 2).reclaim;
  assert.equal(recovered.find(row => row.item === CITY_PRODUCT)?.quantity, 2);
  assert.equal(recovered.find(row => row.item === CITY_MINING_ORE)?.quantity, 5);
  assert.throws(() => f.order(leader, {action: "reclaim", epoch: f.epoch, item: CITY_PRODUCT, amount: 1},
    now + 2, f.request(), CITY_MINING_SITE), /city_stock_active/);
});

test("one guild disband settles jobs and pays listing stock from both cities by the actual item", t => {
  const f = miningFixture(t, leader);
  f.deposit(member, 0, 12);
  f.deposit(member, 1, 20);
  f.order(leader, {action: "build", epoch: f.epoch});
  f.order(leader, {action: "start", epoch: f.epoch});
  f.mine({action: "deposit", slot: 2, item: CITY_PRODUCT, amount: 7});
  f.mine({action: "deposit", slot: 1, item: CITY_MINING_ORE, amount: 12});
  f.mine({action: "build"});
  f.mine({action: "start"});
  f.order(leader, {action: "list", epoch: f.epoch, amount: 1, price: 20}, 121_000);
  f.mine({action: "list", amount: 1, price: 30}, 121_000);
  f.mine({action: "start"}, 121_001);
  f.guild.leave(member);
  const guildId = f.guildMember(leader).id;
  f.guild.settleCityDisband(f.economy, f.guild.beginCityDisband(leader, guildId, 121_002));
  const assets = Object.fromEntries(f.economy.cityDisbandClaims(leader).map(row => [row.item, row.amount]));
  assert.equal(assets[CITY_PRODUCT], 2);
  assert.equal(assets[CITY_MINING_PRODUCT], 1);
  assert.equal(assets[CITY_MINING_ORE], 5);
  assert.equal(f.economy.list().length, 0);
});

function purchaseFixture(t: TestContext) {
  const f = miningFixture(t, leader);
  f.economy.saveCharacter(rival, {}, bag());
  const sellerBag = bag();
  sellerBag.slots[2] = {itemId: CITY_PRODUCT, quantity: 30};
  f.economy.saveCharacter(member, {}, sellerBag);
  f.economy.register(visitor, sellerBag);
  f.mine({action: "deposit", slot: 2, item: CITY_PRODUCT, amount: 7});
  f.mine({action: "deposit", slot: 1, item: CITY_MINING_ORE, amount: 12});
  f.mine({action: "build"});
  f.mine({action: "start"});
  const now = 121_000;
  const sale = f.mine({action: "list", amount: 1, price: 100}, now);
  f.economy.buy(rival, f.request(), String(sale.listingId));
  const epoch = f.miningStock(now).epoch!;
  const order = (actor: string, fields: object, at = now, requestId = f.request()) => {
    const parsed = parseCityOrder({...fields, requestId});
    assert.ok(parsed && isCityPurchaseOrder(parsed));
    return f.economy.cityPurchaseOrder(actor, f.guild.war.member(actor), parsed, f.sync(at, CITY_MINING_SITE), at);
  };
  const open = (amount: number, unitPrice: number, at = now) => order(leader, {action: "purchase_open", epoch, amount, unitPrice}, at);
  const view = (actor: string, at = now) => f.economy.viewCityPurchase(f.guild.war.member(actor), f.sync(at, CITY_MINING_SITE));
  return {...f, get economy() { return f.economy; }, get guild() { return f.guild; }, now, moonEpoch: epoch,
    order, open, viewPurchase: view, factoryOrder: f.order};
}

const missionOre: ResourceNode = {id: CITY_MINING_SITE+"/moon-ore-1", mapId: CITY_MINING_SITE,
  kind:"stone", tier:2, x:84, z:-57, radius:.8, capacity:20, period:210_000, existing:false};

function missionFixture(t: TestContext) {
  const f = purchaseFixture(t);
  const board = (actor: string, now=f.now) => f.economy.viewCityMissions(actor,f.guild.war.member(actor),f.sync(now,CITY_MINING_SITE));
  const job = (actor: string, fields: object, now=f.now, requestId=f.request()) => {
    const parsed = parseCityOrder({...fields,requestId});
    assert.ok(parsed && isCityMissionOrder(parsed));
    return f.economy.cityMissionOrder(actor,f.guild.war.member(actor),parsed,f.sync(now,CITY_MINING_SITE),now);
  };
  const post = (fields: object={}, now=f.now) =>
    String(job(leader,{action:"mission_open",epoch:f.moonEpoch,audience:"public",slots:2,reward:20,hours:1,...fields},now).missionId);
  return {...f,get economy(){return f.economy;},get guild(){return f.guild;},board,job,post};
}

function governanceFixture(t: TestContext) {
  const f=missionFixture(t);
  const summary=(actor:string,now=f.now) => f.economy.viewCityGovernance(f.guildMember(actor),f.sync(now,CITY_MINING_SITE));
  const choose=(policy:CityPolicy,now=f.now,actor=leader,epoch=f.moonEpoch) =>
    f.economy.setCityPolicy(actor,f.guildMember(actor),{action:"policy_set",epoch,policy,requestId:f.request()},
      f.sync(now,CITY_MINING_SITE),now);
  return {...f,get economy(){return f.economy;},get guild(){return f.guild;},summary,choose};
}

test("commander policy affects future factory jobs and has a persisted 24-hour cooldown",t=>{
  const f=governanceFixture(t),now=f.now;
  const old=f.mine({action:"start"},now);
  assert.throws(()=>f.choose("industry",now+1,member),/city_commander_required/);
  assert.throws(()=>f.summary(rival,now+1),/city_not_owner/);
  assert.throws(()=>f.summary(member,now+1),/city_officer_required/);
  const officer={...f.guildMember(member),officer:true};
  const read=f.economy.viewCityGovernance(officer,f.sync(now+1,CITY_MINING_SITE));
  assert.equal(read.commander,false);
  assert.throws(()=>f.economy.setCityPolicy(member,officer,{action:"policy_set",policy:"industry",epoch:f.moonEpoch,requestId:f.request()},
    f.sync(now+1,CITY_MINING_SITE),now+1),/city_commander_required/);
  assert.equal(f.choose("industry",now+1).nextAt,now+1+CITY_POLICY_COOLDOWN_MS);
  f.restart();
  assert.equal(f.miningStock(now+2).job?.readyAt,old.readyAt);
  assert.equal(f.miningStock(now+2).recipe.durationMs,102_000);
  assert.equal(f.view(leader,now+2).recipe.durationMs,0);
  assert.throws(()=>f.choose("procurement",now+10),/city_policy_cooldown/);
  assert.equal(f.choose("industry",now+11).nextAt,now+1+CITY_POLICY_COOLDOWN_MS);
  const at=Number(old.readyAt);
  const bag=f.economy.getAccount(leader).inventory;
  bag.slots[2]={itemId:CITY_PRODUCT,quantity:2};
  f.economy.saveCharacter(leader,{},bag);
  f.mine({action:"deposit",item:CITY_PRODUCT,slot:2,amount:2},at);
  const next=f.mine({action:"start_fast"},at);
  assert.equal(next.readyAt,at+51_000);
  assert.equal(f.summary(leader,at).treasury.rushHeld,15);
  assert.equal(f.summary(leader,Number(next.readyAt)).treasury.rushPaid,15);
  f.capture(rival,Number(next.readyAt)+1,CITY_MINING_SITE);
  const acquired=f.summary(rival,Number(next.readyAt)+2);
  assert.equal(acquired.policy,null);
  assert.equal(acquired.nextAt,0);
  assert.deepEqual(acquired.history,[]);
  assert.equal(f.choose("procurement",Number(next.readyAt)+3,rival,acquired.epoch).policy,"procurement");
});

test("procurement permits 24 and a later policy change preserves order terms and reconciles shared treasury",t=>{
  const f=governanceFixture(t),now=f.now;
  assert.throws(()=>f.open(24,1),/city_purchase_policy_limit/);
  f.choose("procurement");
  const order=f.open(24,1,now+3_600_000);
  const missionId=f.post({slots:2,reward:10,hours:24},now+3_600_001);
  const later=now+CITY_POLICY_COOLDOWN_MS;
  f.choose("industry",later);
  assert.equal(f.viewPurchase(leader,later).maxAmount,20);
  assert.equal(f.viewPurchase(leader,later).open?.remaining,24);
  const totals=f.summary(leader,later).treasury;
  assert.equal(totals.earned,100);
  assert.equal(totals.purchaseHeld,24);
  assert.equal(totals.missionHeld,20);
  assert.equal(totals.available,56);
  f.order(visitor,{action:"purchase_fill",orderId:order.orderId,slot:2,amount:24},later+1);
  f.job(leader,{action:"mission_cancel",missionId},later+2);
  const after=f.summary(leader,later+3);
  assert.equal(after.treasury.available,76);
  assert.equal(after.treasury.purchasePaid,24);
  assert.equal(after.treasury.held,0);
  assert.equal(after.treasury.available+after.treasury.paid+after.treasury.held,after.treasury.earned);
  assert.ok(after.history.some(row=>row.kind==="purchase_paid" && row.gold===24));
  assert.ok(after.history.some(row=>row.kind==="mission_release" && row.gold===20));
});

test("purchase policy migration retains partially filled orders and their treasury reserves",t=>{
  const f=governanceFixture(t),now=f.now;
  const {orderId}=f.open(5,10);
  f.order(visitor,{action:"purchase_fill",orderId,slot:2,amount:2},now+1);
  const legacy=new DatabaseSync(f.economyFile);
  const schema=String(legacy.prepare("SELECT sql FROM sqlite_master WHERE name='city_purchase_orders'").get()?.sql)
    .replace("CHECK(amount BETWEEN 1 AND 24)","CHECK(amount BETWEEN 1 AND 20)");
  legacy.exec(`ALTER TABLE city_purchase_orders RENAME TO fixture_purchase_new;
    ${schema}; INSERT INTO city_purchase_orders SELECT * FROM fixture_purchase_new; DROP TABLE fixture_purchase_new;`);
  legacy.close();
  f.restart();
  const before=f.summary(leader,now+2).treasury;
  assert.equal(before.purchaseHeld,30);
  assert.equal(before.purchasePaid,20);
  assert.equal(f.viewPurchase(leader,now+2).open?.id,orderId);
  assert.equal(f.order(leader,{action:"purchase_cancel",orderId},now+3).released,30);
  f.choose("procurement",now+4);
  assert.ok(f.open(24,1,now+5).orderId);
});

test("guild missions share purchase reserves, count actual post-acceptance ore once, and deliver and pay atomically", t => {
  const f = missionFixture(t), now = f.now;
  f.open(5,10);
  const before = f.miningStock(now).used;
  const posting={action:"mission_open",epoch:f.moonEpoch,audience:"guild",slots:2,reward:20,hours:1};
  assert.throws(() => f.job(member,posting), /city_officer_required/);
  const missionId=f.post({audience:"guild"});
  assert.equal(f.miningStock(now).marketGold,10);
  assert.equal(f.miningStock(now).used,before+6);
  assert.throws(() => f.post({reward:11,slots:1}), /city_market_funds/);
  assert.equal(f.board(visitor).missions.length,0);
  assert.throws(() => f.job(visitor,{action:"mission_accept",missionId}), /city_mission_guild_only/);
  f.economy.harvest(member,f.request(),missionOre,now,12);
  f.job(member,{action:"mission_accept",missionId},now+1);
  assert.equal(f.board(member,now+1).missions[0].progress,0);
  const submit={action:"mission_submit",missionId};
  assert.throws(() => f.job(member,submit,now+1), /city_mission_progress/);
  f.economy.harvest(member,f.request(),{...missionOre,id:"moon_pass/ordinary-fixture-rock"},now+2_000,12);
  assert.equal(f.board(member,now+2_000).missions[0].progress,0);
  const request=f.request();
  f.economy.harvest(member,request,missionOre,now+4_000,12);
  f.economy.harvest(member,request,missionOre,now+4_001,12);
  assert.equal(f.board(member,now+4_001).missions[0].progress,1);
  f.economy.harvest(member,f.request(),missionOre,now+6_000,12);
  f.economy.harvest(member,f.request(),missionOre,now+8_000,12);
  f.restart();
  assert.equal(f.board(member,now+8_001).missions[0].progress,3);
  const submitId=f.request(), paid=f.job(member,submit,now+8_001,submitId);
  assert.equal(paid.gold,20);
  assert.deepEqual(f.job(member,submit,now+8_002,submitId),paid);
  assert.throws(() => f.job(member,{action:"mission_accept",missionId},now+8_003), /city_mission_done/);
  assert.equal(f.economy.getAccount(member).gold,1020);
  assert.equal(f.miningStock(now+8_003).used,before+6);
  assert.equal(f.job(leader,{action:"mission_cancel",missionId},now+8_004).released,20);
  assert.equal(f.miningStock(now+8_004).marketGold,30);
  assert.equal(f.miningStock(now+8_004).used,before+3);
});

test("public mission seats survive restart, return on abandonment and expire or close on takeover without taking ore", t => {
  const f=missionFixture(t), now=f.now;
  const missionId=f.post({slots:1});
  f.job(visitor,{action:"mission_accept",missionId});
  assert.throws(() => f.job(member,{action:"mission_accept",missionId}), /city_mission_full/);
  const other=f.post({slots:1});
  assert.throws(() => f.job(visitor,{action:"mission_accept",missionId:other}), /city_mission_active/);
  f.job(visitor,{action:"mission_abandon",missionId});
  f.job(member,{action:"mission_accept",missionId});
  f.economy.harvest(member,f.request(),missionOre,now+2_000,12);
  f.restart();
  assert.equal(f.board(member,now+3_000).missions.find(row=>row.id===missionId)?.progress,1);
  f.capture(rival,now+4_000,CITY_MINING_SITE);
  assert.deepEqual(f.board(member,now+4_001).missions,[]);
  assert.equal(f.miningStock(now+4_001).marketGold,100);
  assert.equal(f.economy.getAccount(member).inventory.slots.find(row=>row?.itemId===CITY_MINING_ORE)?.quantity,1);

  f.capture(leader,now+5_000,CITY_MINING_SITE);
  const epoch=f.miningStock(now+5_001).epoch!;
  const expiring=f.post({epoch,slots:1},now+5_001);
  f.job(visitor,{action:"mission_accept",missionId:expiring},now+5_002);
  const expires=now+5_001+3_600_000;
  assert.throws(() => f.job(visitor,{action:"mission_submit",missionId:expiring},expires), /city_mission_missing/);
  assert.equal(f.miningStock(expires).marketGold,100);
  const next=f.post({epoch,slots:1},expires+1);
  assert.equal(f.job(visitor,{action:"mission_accept",missionId:next},expires+2).missionId,next);
});

test("siege pauses mission transactions and a defended city can finish existing work", t => {
  const f=missionFixture(t), guildId=f.guildMember(leader).id, siege=1_000+WAR_PROTECTION;
  const db=new DatabaseSync(f.guildFile);
  db.prepare("INSERT INTO territory_battles(site,attacker,started,sample,ended,winner) VALUES(?,?,?,?,?,?)")
    .run(CITY_MINING_SITE,guildId,1,1_000,1_000,guildId);
  db.close();
  const missionId=f.post({slots:2},siege-10_000);
  f.job(visitor,{action:"mission_accept",missionId},siege-9_000);
  for(const delta of [8_000,6_000,4_000])f.economy.harvest(visitor,f.request(),missionOre,siege-delta,12);
  f.guild.war.start(CITY_MINING_SITE,f.guildMember(rival),siege);
  assert.throws(() => f.post({slots:1},siege+1),/city_mission_siege/);
  assert.throws(() => f.job(member,{action:"mission_accept",missionId},siege+1),/city_mission_siege/);
  assert.throws(() => f.job(visitor,{action:"mission_submit",missionId},siege+1),/city_mission_siege/);
  const end=siege+WAR_DURATION;
  assert.equal(f.guild.war.inspect(CITY_MINING_SITE,end).ownerId,guildId);
  assert.equal(f.job(visitor,{action:"mission_submit",missionId},end).gold,20);
  f.guild.leave(member);
  f.guild.settleCityDisband(f.economy,f.guild.beginCityDisband(leader,guildId,end+1));
  assert.equal(f.economy.cityDisbandClaims(leader).find(row=>row.item==="gold")?.amount,80);
});

test("opening a pre-purchase two-city save preserves stock, a running job and an open market listing", t => {
  const f = miningFixture(t, leader);
  f.deposit(member,0,10);
  f.deposit(member,1,12);
  f.order(leader,{action:"build",epoch:f.epoch});
  f.order(leader,{action:"start",epoch:f.epoch});
  f.order(leader,{action:"list",epoch:f.epoch,amount:1,price:20},121_000);
  f.mine({action:"deposit",slot:2,item:CITY_PRODUCT,amount:7},121_000);
  f.mine({action:"deposit",slot:1,item:CITY_MINING_ORE,amount:12},121_000);
  f.mine({action:"build"},121_000);
  f.mine({action:"start"},121_000);
  const before = [f.view(leader,121_001),f.miningStock(121_001)];
  const legacy = new DatabaseSync(f.economyFile);
  legacy.exec("DROP TABLE city_purchase_orders");
  legacy.close();
  f.restart();
  assert.deepEqual([f.view(leader,121_001),f.miningStock(121_001)],before);
  assert.equal(f.economy.hasOpenCityPurchase(),false);
});

test("purchase escrow reserves both gold and space and retries can only deliver each item once", t => {
  const f = purchaseFixture(t);
  const request = {action: "purchase_open", epoch: f.moonEpoch, amount: 10, unitPrice: 10};
  assert.throws(() => f.order(member, request), /city_officer_required/);
  assert.throws(() => f.order(rival, request), /city_not_owner/);
  assert.throws(() => f.open(11, 10), /city_market_funds/);
  assert.equal(parseCityOrder({...request, requestId: f.request(), expiresAt: 0}), null);
  assert.equal(parseCityOrder({...request, requestId: f.request(), amount: 25}), null);
  f.economy.saveCharacter(leader, {}, {...bag(),slots: [
    {itemId:CITY_MINING_ORE,quantity:60}, ...Array(11).fill(null),
  ]});
  f.mine({action:"deposit",slot:0,item:CITY_MINING_ORE,amount:49}, f.now);
  assert.throws(() => f.open(10, 10), /city_storage_full/);
  const before = f.miningStock(f.now);
  const orderId = String(f.open(5, 20).orderId);
  assert.throws(() => f.open(1, 1), /city_purchase_exists/);
  assert.equal(f.miningStock(f.now).used, before.used + 5);
  assert.equal(f.miningStock(f.now).marketGold, 0);
  assert.equal(f.viewPurchase(visitor).manage, null);
  assert.equal(f.viewPurchase(leader).canCancel, true);
  assert.equal(f.viewPurchase(member).canCancel, false);
  assert.throws(() => f.order(rival, {action:"purchase_cancel",orderId}), /city_purchase_missing/);
  assert.throws(() => f.mine({action:"deposit",slot:0,item:CITY_MINING_ORE,amount:1}, f.now), /city_storage_full/);
  assert.throws(() => f.mine({action:"start_fast"}, f.now), /city_market_funds/);
  const fill = {action:"purchase_fill",orderId,slot:2,amount:4};
  const db = new DatabaseSync(f.economyFile);
  try {
    db.prepare("UPDATE accounts SET gold=1000000000 WHERE id=?").run(member);
    assert.throws(() => f.order(member,fill), /city_wallet_full/);
    assert.equal(f.viewPurchase(visitor).open?.remaining,5);
    assert.equal(f.economy.getAccount(member).inventory.slots[2]?.quantity,30);
    db.prepare("UPDATE accounts SET gold=1000 WHERE id=?").run(member);
  } finally { db.close(); }
  const id = f.request(), delivered = f.order(visitor, fill, f.now, id);
  assert.equal(delivered.gold, 80);
  f.restart();
  assert.deepEqual(f.order(visitor, {...fill}, f.now+1, id), delivered);
  assert.throws(() => f.order(member, {...fill,amount:2}, f.now+1), /city_purchase_quantity/);
  assert.equal(f.economy.getAccount(member).inventory.slots[2]?.quantity, 30);
  assert.equal(f.miningStock(f.now+1).used, 60);
  assert.equal(f.viewPurchase(visitor, f.now+1).open?.remaining, 1);
  assert.equal(f.order(member, {...fill,amount:1}, f.now+2).gold, 20);
  assert.throws(() => f.order(visitor, {...fill,amount:1}, f.now+2), /city_purchase_missing/);
  assert.equal(f.economy.getAccount(visitor).gold, 1080);
  assert.equal(f.economy.getAccount(member).gold, 1020);
  assert.equal(f.miningStock(f.now+2).used, 60);
  assert.equal(f.miningStock(f.now+2).marketGold, 0);
});

test("purchase cancellation, expiry and takeover release only unused gold and keep delivered stock with the old guild", t => {
  const f = purchaseFixture(t);
  const first = f.open(4, 10), fill = {action:"purchase_fill",slot:2,amount:2};
  f.order(visitor,{...fill,orderId:first.orderId});
  const cancel = {action:"purchase_cancel",orderId:first.orderId};
  const request = f.request();
  assert.equal(f.order(leader,cancel,f.now+1,request).released,20);
  assert.equal(f.order(leader,cancel,f.now+1,request).released,20);
  assert.equal(f.miningStock(f.now+1).marketGold,80);
  const expiring = f.open(5, 10, f.now+2);
  const expiry = f.now+2+CITY_PURCHASE_DURATION_MS;
  assert.equal(expiring.expiresAt, expiry);
  f.restart();
  assert.equal(f.viewPurchase(visitor,expiry-1).open?.remaining,5);
  assert.throws(() => f.order(visitor,{...fill,orderId:expiring.orderId},expiry), /city_purchase_missing/);
  assert.equal(f.miningStock(expiry).marketGold,80);

  const captured = f.open(5,10,expiry+1);
  f.order(visitor,{...fill,orderId:captured.orderId},expiry+2);
  f.capture(rival,expiry+3,CITY_MINING_SITE);
  f.restart();
  assert.equal(f.viewPurchase(visitor,expiry+4).open,null);
  assert.equal(f.miningStock(expiry+4).marketGold,60);
  assert.equal(f.miningStock(expiry+4).reclaim.find(row=>row.item===CITY_PRODUCT)?.quantity,5);
  assert.equal(f.view(rival,expiry+4,CITY_MINING_SITE).stock.length,0);
  assert.equal(f.view(leader,expiry+4).epoch,f.epoch);
});

test("siege pauses intake and defense resumes the same purchase; disband credits the unused reserve", t => {
  const f = purchaseFixture(t), owner = f.guildMember(leader).id;
  const db = new DatabaseSync(f.guildFile);
  db.prepare("INSERT INTO territory_battles(site,attacker,started,sample,ended,winner) VALUES(?,?,?,?,?,?)")
    .run(CITY_MINING_SITE, owner, 1, 1_000, 1_000, owner);
  db.close();
  const siege = 1_000+WAR_PROTECTION;
  const {orderId}=f.open(4,10,siege-1);
  f.guild.war.start(CITY_MINING_SITE,f.guildMember(rival),siege);
  const fill={action:"purchase_fill",orderId,slot:2,amount:1};
  assert.equal(f.viewPurchase(visitor,siege+1).siege,true);
  assert.throws(() => f.order(visitor,fill,siege+1), /city_purchase_siege/);
  assert.throws(() => f.open(1,1,siege+1), /city_purchase_siege/);
  const end=siege+WAR_DURATION;
  assert.equal(f.guild.war.inspect(CITY_MINING_SITE,end).ownerId,owner);
  assert.equal(f.order(visitor,fill,end).gold,10);
  f.guild.leave(member);
  f.guild.settleCityDisband(f.economy,f.guild.beginCityDisband(leader,owner,end+1));
  assert.equal(f.economy.cityDisbandClaims(leader).find(row=>row.item==="gold")?.amount,90);
  assert.equal(f.viewPurchase(visitor,end+2).open,null);
});

test("upgrading the legacy single-city databases preserves the old epoch, factory and in-flight product", t => {
  const f = fixture(t);
  f.deposit(leader, 0, 10);
  f.deposit(leader, 1, 10);
  f.order(leader, {action: "build", epoch: f.epoch});
  const job = f.order(leader, {action: "start", epoch: f.epoch});
  f.capture(rival, 1_000, CITY_MINING_SITE);
  const economy = new DatabaseSync(f.economyFile);
  economy.exec(`UPDATE city_factory SET (epoch,guild,level)=(SELECT epoch,guild,level FROM city_factory_sites WHERE site='${CITY_PRODUCTION_SITE}');
    DROP TABLE city_factory_sites;
    ALTER TABLE city_jobs DROP COLUMN site;
    ALTER TABLE city_jobs DROP COLUMN product;`);
  economy.close();
  const guild = new DatabaseSync(f.guildFile);
  guild.exec(`DROP TRIGGER city_ownership_created;
    DROP TRIGGER city_ownership_changed;
    DROP INDEX city_active_tenure_by_site;
    DELETE FROM city_tenures WHERE site='${CITY_MINING_SITE}';
    ALTER TABLE city_tenures DROP COLUMN site;
    CREATE UNIQUE INDEX city_active_tenure ON city_tenures((1)) WHERE ended IS NULL;`);
  guild.close();
  f.restart();
  const river = f.view(leader, 2_000);
  assert.equal(river.epoch, f.epoch);
  assert.equal(river.level, 1);
  assert.equal(river.job?.id, job.jobId);
  assert.equal(f.view(leader, 121_000).stock.find(row => row.item === CITY_PRODUCT)?.quantity, 1);
  const moon = f.view(rival, 121_000, CITY_MINING_SITE);
  assert.ok(moon.epoch && moon.epoch !== f.epoch);
  assert.equal(moon.level, 0);
  assert.deepEqual(moon.stock, []);
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
