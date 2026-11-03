import {test} from "node:test";
import assert from "node:assert/strict";
import {newSwordTree,validateSwordTree} from "./SkillCatalog.js";
import {skillRankCost,skillRankMultiplier,supportRankMultiplier,validateSkillRanks} from "./Progression.js";
import {newMuayBook,validateMuayBook} from "./MuayRules.js";
import {newOccultBook,occultRankCost,validateOccultBook} from "./OccultRules.js";

test("sword upgrades preserve old trees and consume the existing skill-point budget",()=>{
  const book=newSwordTree();book.learned=["footwork"];
  assert.deepEqual(validateSwordTree(book,25),book);
  book.ranks={footwork:1};assert.deepEqual(validateSwordTree(book,25).ranks,{footwork:1});
  assert.throws(()=>validateSwordTree(book,24));
  book.ranks={footwork:2};assert.throws(()=>validateSwordTree(book,44));
  book.ranks={footwork:6};assert.throws(()=>validateSwordTree(book,100));
  book.ranks={twin_cut:1};assert.throws(()=>validateSwordTree(book,100));
});
test("Muay upgrades validate school lessons, milestones and skill-point budget",()=>{
  const book=newMuayBook();book.learned=["chaiya_elbow"];
  assert.deepEqual(validateMuayBook(book,25),book);
  book.ranks={chaiya_elbow:1};assert.deepEqual(validateMuayBook(book,25).ranks,{chaiya_elbow:1});
  assert.throws(()=>validateMuayBook(book,24));
  book.ranks={chaiya_elbow:2};assert.throws(()=>validateMuayBook(book,44));
  book.ranks={korat_heavy:1};assert.throws(()=>validateMuayBook(book,100));
});
test("generic rank validation refuses forged upgrades and excess spending",()=>{
  assert.deepEqual(validateSkillRanks(undefined,["a"],25,13,["a"]),{});
  assert.throws(()=>validateSkillRanks({a:1},["a"],25,1,["a"]),/invalid_skill_ranks/);
  assert.throws(()=>validateSkillRanks({a:1.5},["a"],99,50,["a"]),/invalid_skill_ranks/);
  assert.throws(()=>validateSkillRanks({unknown:1},["a"],99,50,["a"]),/invalid_skill_ranks/);
  assert.equal(skillRankCost({a:2,b:3}),5);
  assert.equal(skillRankMultiplier({a:5},"a"),1.2);
  assert.equal(supportRankMultiplier(undefined,"a"),1);
  assert.equal(supportRankMultiplier({a:5},"a"),1.1);
});
test("occult branches preserve separate budgets and reject cross-path or early ranks",()=>{
  const book=newOccultBook();book.learned.seer=["seer_mark"];
  book.learned.mender=["mender_heal","mender_pve_rice"];
  assert.deepEqual(validateOccultBook(book,25),book);
  book.ranks={seer_mark:1,mender_pve_rice:1};
  assert.deepEqual(validateOccultBook(book,25).ranks,book.ranks);
  assert.equal(occultRankCost(book.ranks,"seer"),1);
  assert.equal(occultRankCost(book.ranks,"mender"),1);
  assert.throws(()=>validateOccultBook(book,24));
  book.ranks={seer_mark:1,mender_heal:1};assert.deepEqual(validateOccultBook(book,99).ranks,book.ranks);
  book.ranks={mender_ward:1};assert.throws(()=>validateOccultBook(book,99));
  book.ranks={forged:1};assert.throws(()=>validateOccultBook(book,99));
});
