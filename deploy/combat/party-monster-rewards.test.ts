import test from "node:test";
import assert from "node:assert/strict";
import { partyMonsterShares, type PartyRewardMember } from "./PartyMonsterRewards.js";
const m={mapId:"forbidden_forest",level:1,tier:"normal" as const,x:25,y:0,z:-30};
const actor=(sessionId:string, overrides:Partial<PartyRewardMember>={}):PartyRewardMember=>({sessionId,mapId:m.mapId,x:25,y:0,z:-30,alive:true,persistent:true,level:1,inTransit:false,...overrides});
test("forest party experience is equal, local to the defeated monster, and excludes outsiders",()=>{
  const shares=partyMonsterShares(1,m,[actor("near"),actor("edge",{x:45}),actor("far",{x:46}),actor("other-map",{mapId:"ritual_village"})]);
  assert.deepEqual(shares,[{sessionId:"near",amount:50},{sessionId:"edge",amount:50}]);
});
test("dead, travelling, capped and transient characters do not dilute EXP",()=>{
  assert.deepEqual(partyMonsterShares(1,m,[actor("alive"),actor("dead",{alive:false}),actor("warp",{inTransit:true}),actor("max",{level:100})]),[{sessionId:"alive",amount:100}]);
  assert.throws(()=>partyMonsterShares(1,m,[actor("same"),actor("same")]),/invalid_party_member/);
  assert.deepEqual(partyMonsterShares(21,m,[actor("near")]),[]);
});

test("shrine loot at the XP cap preserves the nearby member's full EXP share", () => {
  const keeper = {...m, level:12, tier:"elite" as const};
  const members = [actor("earner",{level:12}),actor("capped",{level:100}),actor("far",{x:46}),actor("dead",{alive:false})];
  assert.deepEqual(partyMonsterShares(12,keeper,members,20,true),[
    {sessionId:"earner",amount:3600}, {sessionId:"capped",amount:0}
  ]);
});
test("higher-level monsters have a bounded pool that remains equal for eligible party members",()=>{
  const monster={...m,level:100};
  const shares=partyMonsterShares(1,monster,[actor("a"),actor("b"),actor("far",{x:80})]);
  assert.deepEqual(shares,[{sessionId:"a",amount:6250},{sessionId:"b",amount:6250}]);
});
