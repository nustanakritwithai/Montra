import test from "node:test";
import assert from "node:assert/strict";
import { MyRoomState, Player } from "./schema/MyRoomState.js";
import { ForestEncounters } from "./ForestEncounters.js";
import { SHRINE_GUARDIAN } from "./WorldMaps.js";
import { RIFT_WARDEN } from "./WorldAtlas.js";
import { advanceMuayCombo, MUAY_COMBOS, MUAY_COMBO_WINDOW_MS, type MuayComboState, type MuaySchool } from "./MuayRules.js";

test("every school completes only its own ordered combo against one target",()=>{
  for(const school of Object.keys(MUAY_COMBOS) as MuaySchool[]) {
    let state:MuayComboState|undefined;
    for(const [index,move] of MUAY_COMBOS[school].entries()) {
      const result=advanceMuayCombo(state,school,"monster-a",move,1000+index*300);
      assert.equal(result.count,index+1);
      assert.equal(result.completed,index===2);
      state=result.state;
    }
    assert.equal(state,undefined,"completion is consumed and cannot be reused");
  }
});

test("a different target, school, wrong move, or exact expiry resets combo progress",()=>{
  const first=advanceMuayCombo(undefined,"korat","a","punch",100).state;
  assert.ok(first);
  assert.equal(advanceMuayCombo(first,"korat","b","kick",200).count,0);
  assert.equal(advanceMuayCombo(first,"lopburi","a","punch",200).count,0);
  assert.equal(advanceMuayCombo(first,"korat","a","elbow",200).count,0);
  assert.equal(advanceMuayCombo(first,"korat","a","kick",100+MUAY_COMBO_WINDOW_MS).count,0);
  assert.equal(advanceMuayCombo(first,"korat","a","punch",200).count,1,"a new opener restarts the sequence");
});

test("monster interruption pauses ordinary AI briefly, has per-monster resistance, and never stops elite",()=>{
  const state=new MyRoomState(), forest=new ForestEncounters(state.monsters);
  forest.initialize();
  const normal=state.monsters.get("forest_west_1")!, elite=state.monsters.get(SHRINE_GUARDIAN.id)!;
  assert.ok(normal && elite);assert.equal(elite.tier,"elite");
  state.players.set("p",new Player({x:normal.x,z:normal.z,y:0,mapId:normal.mapId,alive:true}));
  let hits=0;const tick=(now:number)=>forest.update(now,.05,state.players,new Set(),()=>{hits++;},()=>{});
  assert.equal(forest.interrupt(elite.id,1000,700,8000),"immune");
  assert.equal(forest.interrupt(normal.id,1000,700,8000),"applied");
  tick(1000);tick(1699);assert.equal(normal.aiState,"stagger");assert.equal(hits,0);
  assert.equal(forest.interrupt(normal.id,1699,700,8000),"resisted");
  tick(1700);assert.notEqual(normal.aiState,"stagger");
  assert.equal(forest.interrupt(normal.id,8999,700,8000),"resisted");
  assert.equal(forest.interrupt(normal.id,9000,700,8000),"applied");
  assert.equal(forest.kill(normal.id,9001),true);
  assert.equal(forest.interrupt(normal.id,9002,700,8000),"unavailable");
  tick(34_001);assert.equal(normal.alive,true);
  assert.equal(forest.interrupt(normal.id,34_001,700,8000),"applied","new spawn does not inherit resistance");
});

test("the atlas boss stays immune after its region activates",()=>{
  const state=new MyRoomState(),forest=new ForestEncounters(state.monsters);
  forest.initialize();
  state.players.set("p",new Player({x:0,z:0,y:0,mapId:"spirit_rift",alive:true}));
  forest.update(1000,.05,state.players,new Set(),()=>{},()=>{});
  const boss=state.monsters.get(RIFT_WARDEN.id);
  assert.ok(boss);assert.equal(boss.tier,"boss");
  assert.equal(forest.interrupt(boss.id,1000,700,8000),"immune");
  assert.notEqual(boss.aiState,"stagger");
});
