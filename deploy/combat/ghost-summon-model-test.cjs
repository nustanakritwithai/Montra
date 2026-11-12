const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const {runInNewContext} = require("node:vm");

function fragment(file, start, end) {
  const source = readFileSync(join(__dirname,"../../src/client",file),"utf8");
  const from = source.indexOf(start);
  const to = end ? source.indexOf(end,from) : source.length;
  assert.ok(from >= 0 && to > from, file);
  return source.slice(from,to);
}

const nodes = [];
class Node {
  constructor(name) {
    this.name = name;
    this.position = {set(x,y,z) { Object.assign(this,{x,y,z}); }};
    this.rotation = {};
    this.scaling = {set() {}};
    nodes.push(this);
  }
  getChildMeshes() { return nodes.filter(node=>node.parent===this); }
  setEnabled(enabled) { this.enabled = enabled; }
  dispose() { this.disposed = true; }
}

const makeMesh = name => new Node(name);
const context = {
  B:{TransformNode:Node,MeshBuilder:{CreateSphere:makeMesh,CreateTorus:makeMesh,CreateBox:makeMesh}},
  scene:{}, gm:{eyeAmber:"amber",eyeRed:"red",eyeGreen:"green"},
  HIMMAPAN_VISUALS:new Map(), MONSTER_ID:"possessed-1",
  mode:"live", localId:"me", activeMapId:"ritual_village",
  performance:{now:()=>1234}, updateStatus(){}, addMovingLight(){},
  spiritMat:{}, otherGuardianMat:{}, gold:{}, glowMat:{},
  attachSpiritModel(actor) { actor.goldenSpirit = true; },
};
const {syncSummons, summonAvatars, makeForestMonster, makeVillageGhostVisual} = runInNewContext([
  fragment("render/035-ghost-instantiation.js","const ATLAS_GHOSTS","// One shared, non-pickable royal seal"),
  `function makeGhostMonster(monster,id,design = ghostDesign(monster,id)) {
    const mesh = new B.TransformNode(id,scene);
    const skeleton = {dispose() { this.disposed = true; }};
    mesh.metadata = {monsterId:id,ghost:{design,tall:1.8,attackAt:0,
      rig:{position:{},metadata:{skeletons:[skeleton]}}}};
    return mesh;
  }`,
  fragment("world/019-state-and-portals.js","function makeForestMonster","function syncForestMonsters"),
  fragment("combat/038-demo-and-monster-state.js","function makeVillageGhostVisual","const villageGhost"),
  fragment("render/027-summon-models-and-animation.js","const summonAvatars","// ---- Golden spirit"),
  fragment("render/027-summon-models-and-animation.js","function deleteSummonAvatar"),
  fragment("network/044-state-sync-and-connection.js","function syncSummons","// Reward messages"),
  "({syncSummons,summonAvatars,makeForestMonster,makeVillageGhostVisual});",
].join("\n"),context);

const summons = new Map();
const state = {players:new Map([["other",{}],["me",{}]]),summons};
const forest = {kind:"captured_ghost",sourceMonsterId:"forest_east_4",sourceMapId:"forbidden_forest",sourceLevel:7,
  mapId:"ritual_village",combatTargetId:"forest-one",x:1,y:0,z:2,hp:100,hitSeq:0};
summons.set("other",forest);
syncSummons(state);
const first = summonAvatars.get("other").capturedVisual;
const original = makeForestMonster({mapId:"forbidden_forest",tier:"normal",level:7},forest.sourceMonsterId);
assert.deepEqual(first.metadata.ghost.design,original.metadata.ghost.design);
assert.equal(first.metadata.ghost.design.kind,"nangmai");
assert.equal(first.metadata.monsterId,null);
assert.equal(first.metadata.ghostCombatTargetId,"forest-one");
assert.ok(first.isPickable);
forest.hitSeq = 1;
syncSummons(state);
assert.equal(first.metadata.ghost.attackAt,1234);

summons.set("other",{...forest,sourceMonsterId:"forest_deep_west_1",combatTargetId:"forest-two",hitSeq:0});
summons.set("me",{...forest,sourceMonsterId:"possessed-1",sourceMapId:"ritual_village",sourceLevel:1,combatTargetId:"village"});
syncSummons(state);
assert.equal(first.disposed,true);
assert.equal(first.metadata.ghost.rig.metadata.skeletons[0].disposed,true);
const second = summonAvatars.get("other").capturedVisual;
assert.equal(second.metadata.ghost.design.kind,"stump");
assert.equal(second.metadata.ghostCombatTargetId,"forest-two");
const village = summonAvatars.get("me").capturedVisual;
assert.deepEqual(village.metadata.ghost.design,makeVillageGhostVisual().metadata.ghost.design);
assert.equal(village.isPickable,false);

const graveyardId = "frontier_ritual_village_1_3";
summons.set("me",{...forest,sourceMonsterId:graveyardId,sourceMapId:"ritual_village",sourceLevel:2,combatTargetId:"graveyard"});
syncSummons(state);
const graveyard = summonAvatars.get("me").capturedVisual;
const wildGraveyard = makeForestMonster({mapId:"ritual_village",tier:"normal",level:2},graveyardId);
assert.equal(graveyard.metadata.ghost.design.kind,"corpse");
assert.deepEqual(graveyard.metadata.ghost.design,wildGraveyard.metadata.ghost.design);

summons.set("me",{...forest,sourceMonsterId:"",combatTargetId:"unknown-origin"});
summons.delete("other");
syncSummons(state);
assert.equal(second.disposed,true);
assert.equal(village.disposed,true);
assert.equal(graveyard.disposed,true);
assert.equal(summonAvatars.get("me").goldenSpirit,true);
summons.set("me",{...forest,kind:"pot_spirit",combatTargetId:""});
syncSummons(state);
assert.equal(summonAvatars.get("me").goldenSpirit,true);
console.log("PASS captured ghosts use the original model and switch, target and dispose it independently");
