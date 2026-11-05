/** Isolated setup and durable verification for the real NPC-to-crafting browser test.
 * Copy beside server.ts in the temporary runtime's src directory. This helper
 * never sends a craft command and never accepts a production character store.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const rootInput = process.env.MONTRA_TEST_DIR;
assert(rootInput && path.isAbsolute(rootInput), "MONTRA_TEST_DIR must be an absolute isolated test directory");
assert(path.basename(rootInput).startsWith("montra-craft-test-"), "Expected a fresh montra-craft-test-* directory");
mkdirSync(rootInput, { recursive: true, mode: 0o700 });
const root = realpathSync(rootInput);
assert.equal(root, path.resolve(rootInput), "Isolated test directory must not be a symlink");
const directory = path.join(root, "characters");
assert.equal(path.resolve(process.env.MONTRA_CHARACTER_DIR || ""), directory, "Character DB must be inside the isolated test directory");
assert.equal(process.env.MONTRA_ECONOMY_ENABLED, "1", "Real transactional economy must be enabled");
assert.equal(process.env.MONTRA_WORLD_EXPANSION, "1", "Real service NPC catalog must be enabled");
assert.notEqual(process.env.MONTRA_ACCOUNTS_REQUIRED, "0", "The test must use a genuine account session");
const verify = process.argv[2] === "verify";
const fixtureFile = path.resolve(process.argv[verify ? 3 : 2] || path.join(root, "fixture.json"));
const checkpointFile = path.join(root, "verified-craft.json");
assert.equal(path.dirname(fixtureFile), root, "Credentials must stay in the isolated directory, outside public artifacts");
if (!verify) {
  assert(!existsSync(fixtureFile), "Refusing to overwrite an existing fixture");
  assert(!existsSync(checkpointFile), "Refusing to reuse an existing verification checkpoint");
  assert(!existsSync(directory) || readdirSync(directory).length === 0, "Refusing to seed an existing character store");
}
mkdirSync(directory, { recursive: true, mode: 0o700 });
assert.equal(realpathSync(directory), directory, "Character directory must not be a symlink");
if (verify) assert.equal(realpathSync(fixtureFile), fixtureFile, "Fixture must not be a symlink");

// Dynamic imports intentionally happen only after checking the database location.
const { accounts } = await import("./rooms/AccountService.js");
const { characterStore } = await import("./rooms/CharacterStore.js");
const { EconomyStore, STARTER_GOLD } = await import("./rooms/EconomyStore.js");
const { makeClassInventory, equippedStats, gearMana, gearCounts } = await import("./rooms/ItemRules.js");
const { personalItem } = await import("./rooms/PersonalItems.js");
const { calculateStats, emptyAllocations } = await import("./rooms/Progression.js");
const { serviceNpcsFor } = await import("./rooms/ServiceNpcs.js");
const { groundAt } = await import("./rooms/WorldMaps.js");

type Inventory = ReturnType<typeof makeClassInventory>;
type Material = { itemId: string; name: string; quantity: number; slot: number };
type Fixture = {
  version: 1; session: string; guestKey: string; expiresAt: number;
  characterId: string; characterSlot: number; characterName: string; mapId: string;
  recipeId: "acc_ring_atk_1"; itemId: "acc_ring_atk_1"; itemName: string; slot: number;
  smith: { id: string; name: string; x: number; y: number; z: number; radius: number };
  before: { gold: number; inventory: Inventory; materials: Material[]; itemCount: number; copies: number };
  expected: {
    cost: number; gold: number; itemCount: number; copies: number; banked: false;
    materials: Material[]; rank: number; revision: number; bound: false; affix: null;
  };
  database: { accounts: string; economy: string };
};

const recipeId = "acc_ring_atk_1" as const;
const recipe = personalItem(recipeId);
assert(recipe?.recipe && recipe.forge, "Fixture recipe must be genuine craftable equipment");
assert.equal(recipe.level, 1);
assert.equal(recipe.copyLimit, 2, "Native paired accessories receive a plain, unique forge identity");
const craftGold = recipe.craftGold;
assert(typeof craftGold === "number", "Fixture recipe must declare its native gold cost");
assert.equal(craftGold, 4);
assert.deepEqual(recipe.recipe, [{ item: "mat_metal_1", qty: 3 }, { item: "mat_fiber_1", qty: 2 }]);

try {
  if (verify) {
    const fixture = JSON.parse(readFileSync(fixtureFile, "utf8")) as Fixture;
    assert.equal(fixture.version, 1);
    assert.equal(fixture.recipeId, recipeId);
    assert.equal(fixture.itemId, recipeId);
    assert.equal(fixture.slot, 2);
    assert.equal(fixture.database.economy, path.join(directory, "economy.sqlite"));
    assert.equal(fixture.database.accounts, path.join(directory, "player-accounts.sqlite"));
    const identity = accounts().resolve(fixture.session);
    assert(identity, "The real account session must survive a server restart");
    assert.equal(identity.characterIds[fixture.characterSlot - 1], fixture.characterId);
    const economy = new EconomyStore(fixture.database.economy);
    try {
      const account = economy.getAccount(fixture.characterId);
      const item = account.inventory.slots[fixture.slot];
      assert(item?.forge, "The newly crafted accessory must be saved in the inventory");
      assert.equal(item.itemId, recipeId);
      assert.equal(item.quantity, 1);
      assert.equal(Object.hasOwn(item, "bound"), false, "Crafting must not bind equipment before it is worn");
      assert.equal(Object.hasOwn(item, "socket"), false, "New equipment must remain undrilled");
      assert.match(item.forge.instanceId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
      assert.deepEqual(item.forge, {
        instanceId: item.forge.instanceId, revision: 1, rank: 0, misses: 0, affix: null, rerollMisses: 0,
      }, "Lv.1 crafting must use native plainForge without a random affix");
      assert.equal(gearCounts(account.inventory).get(recipeId), fixture.expected.itemCount);
      assert.equal(account.inventory.forgeCopies?.[recipeId] ?? 0, fixture.expected.copies);
      assert.equal(account.gold, fixture.expected.gold);
      assert.equal(fixture.before.gold - account.gold, craftGold);

      // Only the exact two input stacks may disappear, and only this new item may appear.
      const expectedInventory = structuredClone(fixture.before.inventory);
      for (const input of fixture.before.materials) {
        assert.deepEqual(expectedInventory.slots[input.slot], { itemId: input.itemId, quantity: input.quantity });
        expectedInventory.slots[input.slot] = null;
        assert.equal(account.inventory.slots.reduce((n, stack) => n + (stack?.itemId === input.itemId ? stack.quantity : 0), 0), 0);
      }
      expectedInventory.slots[fixture.slot] = item;
      assert.deepEqual(account.inventory, expectedInventory, "Crafting must preserve all unrelated inventory, equipped and bank state");
      const character = economy.getCharacter(fixture.characterId) as { inventory?: unknown } | null;
      assert(character, "The persistent character snapshot must exist");
      assert.deepEqual(character.inventory, account.inventory, "Wallet and character snapshot must agree");

      const db = new DatabaseSync(fixture.database.economy, { readOnly: true });
      let receipt: Record<string, unknown>;
      try {
        const receipts = db.prepare("SELECT request_id, kind, intent, result FROM receipts WHERE actor=?").all(fixture.characterId);
        assert.equal(receipts.length, 1, "Exactly one durable action must have committed");
        const row = receipts[0];
        assert.equal(row.kind, "craft");
        assert.match(String(row.request_id), /^eco_[a-f0-9]{32}$/, "The real browser must supply its normal economy request ID");
        assert.equal(row.intent, createHash("sha256").update(JSON.stringify({ recipe: recipeId })).digest("hex"));
        const result = JSON.parse(String(row.result));
        assert.deepEqual(result, { itemId: recipeId, spentGold: craftGold, banked: false });
        receipt = { requestId: String(row.request_id), kind: row.kind, intent: row.intent, result };
      } finally { db.close(); }

      const checkpoint = { version: 1, characterId: fixture.characterId, gold: account.gold, inventory: account.inventory, receipt };
      const restartVerified = existsSync(checkpointFile);
      if (restartVerified) {
        assert.equal(realpathSync(checkpointFile), checkpointFile, "Checkpoint must not be a symlink");
        assert.deepEqual(checkpoint, JSON.parse(readFileSync(checkpointFile, "utf8")), "Server restart must preserve the same crafted instance, inventory, wallet and receipt");
      } else {
        // Keep the UUID/receipt checkpoint private alongside the disposable fixture, never in artifacts.
        writeFileSync(checkpointFile, JSON.stringify(checkpoint, null, 2) + "\n", { flag: "wx", mode: 0o600 });
      }
      console.log(JSON.stringify({
        ok: true, stage: restartVerified ? "durable-craft-restart-verification" : "durable-craft-verification",
        itemId: recipeId, slot: fixture.slot, rank: item.forge.rank, revision: item.forge.revision,
        gold: account.gold, goldSpent: fixture.before.gold - account.gold, itemCount: fixture.expected.itemCount,
        materialsConsumed: fixture.before.materials.map(({ itemId, quantity }) => ({ itemId, quantity })),
        banked: false, bound: false, committedCraftReceipts: 1, restartIdentityPreserved: restartVerified,
      }));
    } finally { economy.close(); }
  } else {
    const credentials = accounts().createGuest();
    const identity = accounts().resolve(credentials.session);
    assert(identity?.guest, "The synthetic guest must be a genuine persisted account");
    const characterId = identity.characterIds[0];
    const mapId = "ritual_village";
    const smith = serviceNpcsFor(mapId).find(npc => npc.role === "smith");
    assert(smith, "The real world must contain its village smith");
    const inventory = makeClassInventory("blade");
    assert.equal(gearCounts(inventory).get(recipeId) ?? 0, 0, "Crafted equipment must not already be owned");
    const materials = recipe.recipe.map((input, index) => ({
      itemId: input.item, name: personalItem(input.item)!.name, quantity: input.qty, slot: index + 2,
    }));
    inventory.slots[2] = { itemId: "mat_metal_1", quantity: 3 };
    inventory.slots[3] = { itemId: "mat_fiber_1", quantity: 2 };
    const statAllocations = emptyAllocations();
    const stats = equippedStats(calculateStats(1, statAllocations), inventory);
    const characterName = "Craft Browser QA";
    await characterStore.save({
      version: 1, id: characterId, name: characterName, level: 1, experience: 0,
      pkKills: 0, pkDeaths: 0, x: smith.x, y: groundAt(mapId, smith.x, smith.z), z: smith.z,
      hp: stats.maxHp, stamina: stats.maxStamina, mana: gearMana(1, inventory).max,
      mapId, statAllocations, build: { path: "blade", ancestry: "woodland", bladeTalent: "steady" },
      inventory, updatedAt: new Date().toISOString(),
    });
    const account = characterStore.economy.getAccount(characterId);
    assert.equal(account.gold, STARTER_GOLD);
    const fixture: Fixture = {
      version: 1, ...credentials, characterId, characterSlot: 1, characterName, mapId,
      recipeId, itemId: recipeId, itemName: recipe.name, slot: 2, smith,
      before: { gold: account.gold, inventory: account.inventory, materials, itemCount: 0, copies: 0 },
      expected: {
        cost: craftGold, gold: account.gold - craftGold, itemCount: 1, copies: 0, banked: false,
        materials: materials.map(input => ({ ...input, quantity: 0 })), rank: 0, revision: 1, bound: false, affix: null,
      },
      database: { accounts: path.join(directory, "player-accounts.sqlite"), economy: path.join(directory, "economy.sqlite") },
    };
    writeFileSync(fixtureFile, JSON.stringify(fixture, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    // Never print account session or guest key to logs or evidence artifacts.
    console.log(JSON.stringify({ ok: true, stage: "seeded", characterSlot: 1, recipeId,
      itemName: fixture.itemName, slot: fixture.slot, smith,
      before: { gold: fixture.before.gold, materials, itemCount: 0, copies: 0 }, expected: fixture.expected }));
  }
} finally {
  characterStore.close();
  accounts().close();
}
