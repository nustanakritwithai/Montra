import {test} from "node:test";
import assert from "node:assert/strict";
import {BLADE_LESSONS,bladePoints,newBladeBook,validateBladeBook,type BladeSkillId} from "./BladeRules.js";
import {SENTINEL_LESSONS,sentinelPoints,newSentinelBook,validateSentinelBook,type SentinelSkillId} from "./SentinelRules.js";
import {SWORD_NODES,swordPoints,newSwordTree,validateSwordTree} from "./SkillCatalog.js";
import {MUAY_LESSONS,muayPoints,newMuayBook,validateMuayBook,type MuayLessonId,type MuaySchool} from "./MuayRules.js";
import {OCCULT_LESSONS,occultPoints,newOccultBook,validateOccultBook,type OccultSkillId} from "./OccultRules.js";

function pathTo(nodes:Readonly<Record<string,{level:number;requires:readonly string[]}>>,target:string):string[]{
  const seen=new Set<string>(),active=new Set<string>(),ordered:string[]=[];
  function visit(id:string){
    const node=nodes[id];assert.ok(node,`missing lesson ${id}`);assert.ok(!active.has(id),`cycle at ${id}`);
    if(seen.has(id))return;
    active.add(id);
    for(const req of node.requires){assert.ok(nodes[req] && nodes[req].level<node.level,`${id} prerequisite ${req}`);visit(req);}
    active.delete(id);seen.add(id);ordered.push(id);
  }
  visit(target);return ordered;
}
test("high-level lessons form reachable trees within the existing point budget",()=>{
  const blade=newBladeBook();blade.learned=pathTo(BLADE_LESSONS,"sealed_finale") as BladeSkillId[];
  assert.ok(blade.learned.length<=bladePoints(95));assert.deepEqual(validateBladeBook(blade,95),blade);
  const tank=newSentinelBook();tank.learned=pathTo(SENTINEL_LESSONS,"enduring_ward") as SentinelSkillId[];
  assert.ok(tank.learned.length<=sentinelPoints(95));assert.deepEqual(validateSentinelBook(tank,95),tank);
  const sword=newSwordTree();sword.learned=pathTo(SWORD_NODES,"final_counter");
  assert.ok(sword.learned.length<=swordPoints(95));assert.deepEqual(validateSwordTree(sword,95),sword);
  const occult=newOccultBook();occult.learned.seer=pathTo(OCCULT_LESSONS,"seer_spirit_rain") as OccultSkillId[];
  occult.learned.mender=pathTo(OCCULT_LESSONS,"mender_spirit_rice") as OccultSkillId[];
  assert.ok(occult.learned.seer.length<=occultPoints(95));assert.ok(occult.learned.mender.length<=occultPoints(95));
  assert.deepEqual(validateOccultBook(occult,95),occult);
  for(const [school,target] of [["chaiya","chaiya_final_counter"],["korat","korat_final_strike"],["lopburi","lopburi_final_counter"],["thasao","thasao_final_rush"]] as const){
    const book=newMuayBook();book.school=school as MuaySchool;book.slots=[...book.loadouts[school]];
    book.learned=pathTo(MUAY_LESSONS,target) as MuayLessonId[];
    assert.ok(book.learned.length<=muayPoints(95));assert.deepEqual(validateMuayBook(book,95),book);
  }
});
