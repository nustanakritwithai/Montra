import test from "node:test";
import assert from "node:assert/strict";
import { checkWarp, parseWarpCommand } from "./WarpRules.js";
import { DEFAULT_MAP_ID, getSafeMapSpawn, getWorldMap } from "./WorldMaps.js";
const context = {
  mapId: DEFAULT_MAP_ID, position: { x: -4, y: 0, z: -17 },
  alive: true, flying: false, climbing: false, dashing: false,
  changingHeight: false, lastCombatMs: -Infinity,
  lastWarpMs: -Infinity, nowMs: 10_000
};
test("only portal ID accepted", () => {
  assert.equal(parseWarpCommand({ portalId: "village_to_forest", x: 999 }), null);
  assert.equal(parseWarpCommand({ portalId: "village_to_forest", mapId: "forbidden_forest" }), null);
  assert.equal(parseWarpCommand({ portalId: "village_to_forest" }), "village_to_forest");
});
test("server checks proximity, correct map and cooldown", () => {
  assert.equal(checkWarp({ portalId: "village_to_forest" }, context).ok, true);
  assert.equal(checkWarp({ portalId: "village_to_forest" }, { ...context, position: { x: 0, y: 0, z: 0 } }).ok, false);
  assert.equal(checkWarp({ portalId: "village_to_forest" }, { ...context, mapId: "forbidden_forest" }).ok, false);
  assert.equal(checkWarp({ portalId: "village_to_forest" }, { ...context, lastWarpMs: 9000 }).ok, false);
});
test("combat, death and movement block warp", () => {
  for (const field of ["flying", "climbing", "dashing", "changingHeight"] as const) {
    assert.equal(checkWarp({ portalId: "village_to_forest" }, { ...context, [field]: true }).ok, false);
  }
  assert.equal(checkWarp({ portalId: "village_to_forest" }, { ...context, alive: false }).ok, false);
  assert.equal(checkWarp({ portalId: "village_to_forest" }, { ...context, lastCombatMs: 9000 }).ok, false);
});
test("forest return portal and safe saved-spawn fallback", () => {
  assert.equal(checkWarp({ portalId: "forest_to_village" }, {
    ...context, mapId: "forbidden_forest", position: { x: 0, y: 0, z: 14 }
  }).ok, true);
  assert.deepEqual(getSafeMapSpawn("forbidden_forest", { x: -6, y: 0, z: 6 }), getWorldMap("forbidden_forest")?.spawn);
  assert.throws(() => getSafeMapSpawn("not_a_map"), /unknown_character_map/);
});

test("unsafe altitudes and village wall positions fall back without changing map", () => {
  const village = getWorldMap("ritual_village")!;
  const forest = getWorldMap("forbidden_forest")!;
  assert.deepEqual(getSafeMapSpawn(village.id, { x: 0, y: 50, z: 0 }), village.spawn);
  assert.deepEqual(getSafeMapSpawn(village.id, { x: 8, y: 0, z: 4 }), village.spawn);
  assert.deepEqual(getSafeMapSpawn(forest.id, { x: 0, y: 4, z: 0 }), forest.spawn);
  assert.deepEqual(getSafeMapSpawn(village.id, { x: 8, y: 4, z: 4 }), { x: 8, y: 4, z: 4 });
  assert.deepEqual(getSafeMapSpawn(forest.id, { x: 0, y: 6, z: 0 }), { x: 0, y: 6, z: 0 });
});

test("portal proximity includes authoritative height", () => {
  assert.equal(checkWarp({ portalId: "village_to_forest" }, {
    ...context, position: { x: -4, y: 4, z: -17 }
  }).ok, false);
});
