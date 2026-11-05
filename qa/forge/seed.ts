/** Isolated setup and durable verification for the real NPC-to-forge browser test.
 * Copy beside server.ts in the temporary runtime's src directory. No live store
 * is accepted and no forge command is issued by this helper.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const rootInput = process.env.MONTRA_TEST_DIR;
assert(rootInput && path.isAbsolute(rootInput), "MONTRA_TEST_DIR must be an absolute isolated test directory");
assert(path.basename(rootInput).startsWith("montra-forge-test-"), "Expected a fresh montra-forge-test-* directory");
mkdirSync(rootInput, { recursive: true, mode: 0o700 });
const root = realpathSync(rootInput);
const directory = path.join(root, "characters");
assert.equal(path.resolve(process.env.MONTRA_CHARACTER_DIR || ""), directory, "Character DB must be inside the isolated test directory");
assert.equal(process.env.MONTRA_ECONOMY_ENABLED, "1", "Real transactional economy must be enabled");
assert.equal(process.env.MONTRA_WORLD_EXPANSION, "1", "Real service NPC catalog must be enabled");
assert.notEqual(process.env.MONTRA_ACCOUNTS_REQUIRED, "0", "The test must use a genuine account session");
const verify = process.argv[2] === "verify";
const fixtureFile = path.resolve(process.argv[verify ? 3 : 2] || path.join(root, "fixture.json"));
assert.equal(path.dirname(fixtureFile), root, "Credentials must stay in the isolated directory, outside public artifacts");
if (!verify) {
  assert(!existsSync(fixtureFile), "Refusing to overwrite an existing fixture");
  assert(!existsSync(directory) || readdirSync(directory).length === 0, "Refusing to seed an existing character store");
}
mkdirSync(directory, { recursive: true, mode: 0o700 });
assert.equal(realpathSync(directory), directory, "Character directory must not be a symlink");

// Dynamic imports intentionally happen only after checking the database location.
const { accounts } = await import("./rooms/AccountService.js");
const { characterStore } = await import("./rooms/CharacterStore.js");
const { EconomyStore } = await import("./rooms/EconomyStore.js");
const { makeClassInventory, equippedStats, gearMana } = await import("./rooms/ItemRules.js");
const { FORGE_CATALOG, forgeStamp, plainForge, quoteForge } = await import("./rooms/ForgeRules.js");
const { personalItem } = await import("./rooms/PersonalItems.js");
const { calculateStats, emptyAllocations } = await import("./rooms/Progression.js");
const { serviceNpcsFor } = await import("./rooms/ServiceNpcs.js");
const { groundAt } = await import("./rooms/WorldMaps.js");

type Fixture = {
  version: 1; session: string; guestKey: string; expiresAt: number;
  characterId: string; characterSlot: number; characterName: string; mapId: string;
  itemId: string; itemName: string; slot: number;
  smith: { id: string; name: string; x: number; y: number; z: number; radius: number };
  before: { gold: number; copies: number; rank: number; revision: number; instanceId: string; stamp: string };
  expected: { cost: number; copiesSpent: number; gold: number; copies: number; rank: number; revision: number; chance: number };
  database: { accounts: string; economy: string };
};

try {
  if (verify) {
    const fixture = JSON.parse(readFileSync(fixtureFile, "utf8")) as Fixture;
    assert.equal(fixture.version, 1);
    assert.equal(fixture.database.economy, path.join(directory, "economy.sqlite"));
    assert.equal(fixture.database.accounts, path.join(directory, "player-accounts.sqlite"));
    const identity = accounts().resolve(fixture.session);
    assert(identity, "The real account session must survive a server restart");
    assert.equal(identity.characterIds[fixture.characterSlot - 1], fixture.characterId);
    const economy = new EconomyStore(fixture.database.economy);
    try {
      const account = economy.getAccount(fixture.characterId);
      const item = account.inventory.slots[fixture.slot];
      assert(item && item.forge, "The forged weapon must still be present on disk");
      assert.equal(item.itemId, fixture.itemId);
      assert.equal(item.forge.instanceId, fixture.before.instanceId);
      assert.equal(item.forge.rank, fixture.expected.rank);
      assert.equal(item.forge.revision, fixture.expected.revision);
      assert.equal(account.inventory.equippedWeaponSlot, fixture.slot);
      assert.equal(account.gold, fixture.expected.gold);
      assert.equal(account.inventory.forgeCopies?.[fixture.itemId] ?? 0, fixture.expected.copies);
      const character = economy.getCharacter(fixture.characterId) as { inventory?: unknown } | null;
      assert(character, "The persistent character snapshot must exist");
      assert.deepEqual(character.inventory, account.inventory, "Wallet and character snapshot must agree");
      const db = new DatabaseSync(fixture.database.economy, { readOnly: true });
      try {
        const receipts = db.prepare("SELECT result FROM receipts WHERE actor=? AND kind='forge'").all(fixture.characterId);
        assert.equal(receipts.length, 1, "Exactly one actual forge must have committed");
        const receipt = JSON.parse(String(receipts[0].result));
        assert.equal(receipt.success, true);
        assert.equal(receipt.broken, false);
        assert.equal(receipt.downgraded, false);
        assert.equal(receipt.cost, fixture.expected.cost);
        assert.equal(receipt.itemId, fixture.itemId);
        assert.deepEqual(receipt.forge, item.forge);
      } finally { db.close(); }
      console.log(JSON.stringify({
        ok: true, stage: "durable-forge-verification", characterId: fixture.characterId,
        itemId: fixture.itemId, slot: fixture.slot, rank: item.forge.rank,
        revision: item.forge.revision, instancePreserved: true,
        gold: account.gold, copies: account.inventory.forgeCopies?.[fixture.itemId] ?? 0,
        goldSpent: fixture.before.gold - account.gold,
        copiesSpent: fixture.before.copies - (account.inventory.forgeCopies?.[fixture.itemId] ?? 0),
        committedForgeReceipts: 1,
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
    const slot = 1;
    const weapon = inventory.slots[slot];
    assert(weapon && personalItem(weapon.itemId)?.forge, "Seeded weapon must be eligible for forging");
    weapon.forge = plainForge();
    const terms = FORGE_CATALOG.enhanceSteps[0];
    const { cost, chance } = quoteForge(weapon.forge, "enhance", personalItem(weapon.itemId)?.level);
    assert.equal(chance, 100, "The first upgrade must use the native guaranteed-success rule");
    inventory.forgeCopies = { [weapon.itemId]: terms.copies };
    const statAllocations = emptyAllocations();
    const stats = equippedStats(calculateStats(1, statAllocations), inventory);
    const characterName = "Forge Browser QA";
    // Stand at the server's actual safe NPC location, rather than a guessed anchor.
    await characterStore.save({
      version: 1, id: characterId, name: characterName, level: 1, experience: 0,
      pkKills: 0, pkDeaths: 0, x: smith.x, y: groundAt(mapId, smith.x, smith.z), z: smith.z,
      hp: stats.maxHp, stamina: stats.maxStamina, mana: gearMana(1, inventory).max,
      mapId, statAllocations, build: { path: "blade", ancestry: "woodland", bladeTalent: "steady" },
      inventory, updatedAt: new Date().toISOString(),
    });
    const account = characterStore.economy.getAccount(characterId);
    assert(account.gold >= cost);
    const fixture: Fixture = {
      version: 1, ...credentials, characterId, characterSlot: 1, characterName, mapId,
      itemId: weapon.itemId, itemName: personalItem(weapon.itemId)!.name, slot, smith,
      before: { gold: account.gold, copies: terms.copies, rank: 0, revision: weapon.forge.revision,
        instanceId: weapon.forge.instanceId, stamp: forgeStamp(weapon) },
      expected: { cost, copiesSpent: terms.copies, gold: account.gold - cost, copies: 0,
        rank: 1, revision: weapon.forge.revision + 1, chance },
      database: { accounts: path.join(directory, "player-accounts.sqlite"), economy: path.join(directory, "economy.sqlite") },
    };
    writeFileSync(fixtureFile, JSON.stringify(fixture, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    // Never print account session or guest key to logs or evidence artifacts.
    console.log(JSON.stringify({ ok: true, stage: "seeded", characterId, characterSlot: 1,
      itemId: fixture.itemId, itemName: fixture.itemName, slot, smith,
      before: fixture.before, expected: fixture.expected }));
  }
} finally {
  characterStore.close();
  accounts().close();
}
