const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = join(__dirname, "../..");
const source = readFileSync(join(root, "src/client/render/004-scene-camera-lights.js"), "utf8");
const fog = source.slice(source.indexOf("  const FIELD_FOG_CLEAR_RADIUS"), source.indexOf("  // Start closer"));
const rules = readFileSync(join(root, "deploy/combat/GameRules.ts"), "utf8");

class Vector {
  constructor(...values) { this.set(...values); }
  set(x, y, z, w) { Object.assign(this, { x, y, z, w }); }
}

function fixture() {
  const hero = { x: 12, y: 8, z: 7 };
  const enemy = { x: 30, y: 0, z: 7, mapId: "ritual_village" };
  const node = { setEnabled(on) { this.enabled = on; } };
  const players = new Map([["enemy", enemy]]);
  const mobs = new Map([["monster", enemy]]);
  const sandbox = {
    activeMapId: "ritual_village", room: { state: { players, monsters: mobs } },
    mode: "live", localId: "hero", MONSTER_ID: "starter", getLocalAvatar: () => hero,
    avatars: new Map([["enemy", { ...enemy, node }]]), summonAvatars: new Map(),
    B: { Vector4: Vector, Color3: Vector, MaterialPluginBase: class {} },
    scene: { fogColor: { scaleToRef() {} }, particleSystems: [] },
    selectedForestTarget: "monster", selectedPkTargetId: "enemy", spellTargetId: "monster",
    demoAutoAttack: true, ui: { monsterHint: {} }, hudTarget: { id: "monster", until: 1 }, syncPKHud() {},
  };
  vm.runInNewContext(fog + "\nthis.uniform = fieldFog;", sandbox);
  return { sandbox, hero, enemy, node };
}

test("fog follows the avatar with a shared horizontal radius on any map", () => {
  const { sandbox: s, hero } = fixture();
  const radius = Number(/battlefieldSightRadius:\s*(\d+)/.exec(rules)?.[1]);
  assert.equal(radius, 30);
  for (const mapId of ["ritual_village", "forbidden_forest", "mantra_capital", "bound_temple",
    "drowned_marsh", "tri_wiang_castle", "personal_home", "new_map"]) {
    s.activeMapId = mapId;
    hero.x += 100;
    assert.equal(s.fieldPointVisible({ x: hero.x + radius - .01, y: 100, z: hero.z }), true, mapId);
    assert.equal(s.fieldPointVisible({ x: hero.x + radius, z: hero.z }), false, mapId);
    s.updateFieldFog();
    assert.deepEqual([s.uniform.x, s.uniform.y, s.uniform.z, s.uniform.w], [hero.x, hero.z, 24, radius], mapId);
  }
  s.room.state.battlefieldFog = true;
  assert.equal(s.fieldPointVisible({ x: 50, z: 50 }), false);
});

test("moving out of sight hides the actor and clears every target HUD reference", () => {
  const { sandbox: s, hero, node } = fixture();
  s.updateFieldFog();
  assert.equal(node.enabled, true);
  assert.equal(s.selectedPkTargetId, "enemy");
  hero.x = -10;
  s.updateFieldFog();
  assert.equal(node.enabled, false);
  for (const id of [s.selectedForestTarget, s.selectedPkTargetId, s.spellTargetId, s.hudTarget.id]) {
    assert.equal(id, null);
  }
  assert.equal(s.demoAutoAttack, false);
  s.activeMapId = "bound_temple";
  s.updateFieldFog();
  assert.equal(node.enabled, false);
  assert.equal(s.uniform.w, 30);
  s.getLocalAvatar = () => undefined;
  s.updateFieldFog();
  assert.equal(node.enabled, true);
  assert.equal(s.uniform.w, 0);
});
