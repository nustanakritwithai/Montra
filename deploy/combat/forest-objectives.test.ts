import test from "node:test";
import assert from "node:assert/strict";
import { advanceForestObjective, parseForestObjectiveId, validateForestObjective } from "./ForestObjectives.js";

test("objectives advance only on the chosen forest camp and complete once",()=>{
  let active=validateForestObjective({id:"west",progress:0});
  assert.deepEqual(advanceForestObjective(active,"forest_east_1","forbidden_forest"),{active,completed:null});
  assert.deepEqual(advanceForestObjective(active,"forest_west_1","other"),{active,completed:null});
  assert.deepEqual(advanceForestObjective(active,"forest_west_55","forbidden_forest"),{active,completed:null});
  for(let i=0;i<7;i++)active=advanceForestObjective(active,"forest_west_1","forbidden_forest").active!;
  assert.equal(active.progress,7);
  assert.deepEqual(advanceForestObjective(active,"forest_west_2","forbidden_forest"),{active:null,completed:"west"});
  assert.deepEqual(advanceForestObjective(null,"forest_west_2","forbidden_forest"),{active:null,completed:null});
});
test("objective state is strictly validated",()=>{
  assert.equal(parseForestObjectiveId("deep_west"),"deep_west");
  assert.equal(parseForestObjectiveId("__proto__"),null);
  assert.throws(()=>validateForestObjective({id:"west",progress:8}),/invalid_forest_objective/);
  assert.throws(()=>validateForestObjective({id:"west",progress:-1}),/invalid_forest_objective/);
  assert.throws(()=>validateForestObjective({id:"west",progress:0,bonus:999}),/invalid_forest_objective/);
});
test("the exploration route advances through camps in order",()=>{
  let active=validateForestObjective({id:"trail",progress:0});
  assert.equal(advanceForestObjective(active,"forest_east_1","forbidden_forest").active?.progress,0);
  for(const id of ["forest_west_1","forest_east_2","forest_deep_west_3"]){
    const next=advanceForestObjective(active,id,"forbidden_forest");assert.equal(next.completed,null);active=next.active!;
  }
  assert.deepEqual(advanceForestObjective(active,"forest_deep_east_4","forbidden_forest"),{active:null,completed:"trail"});
});
test("missions track their own temple, regional and strategic enemies",()=>{
  for(const [id,monster,map] of [["temple_forecourt","temple_forecourt_1","bound_temple"],
    ["atlas_bamboo_frontier_1","atlas_bamboo_frontier_1_1","bamboo_frontier"],
    ["frontier_moon_pass_1","frontier_moon_pass_1_1","moon_pass"]]){
    const active=validateForestObjective({id,progress:0});
    assert.equal(advanceForestObjective(active,monster,map).active?.progress,1);
    assert.equal(advanceForestObjective(active,monster,"forbidden_forest").active?.progress,0);
  }
});
