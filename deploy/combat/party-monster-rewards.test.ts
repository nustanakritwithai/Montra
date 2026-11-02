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
