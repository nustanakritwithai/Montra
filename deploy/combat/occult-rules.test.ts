import { test } from "node:test";
import assert from "node:assert/strict";
import { isOccultPath } from "./CharacterBuilds.js";
import { newOccultBook, OCCULT_LESSONS, OCCULT_MASTERY_LABELS, OCCULT_MASTERY_REQUIREMENTS, occultPoints, validateOccultBook } from "./OccultRules.js";

test("both occult branches own rituals; other classes do not",()=>{
  for (const path of ["seer","mender"]) assert.equal(isOccultPath(path),true);
  for (const path of ["","blade","sentinel","phutthaisawan","muay_boran"]) assert.equal(isOccultPath(path),false);
});
test("book keeps separate path learning, loadouts and cooldowns",()=>{
  const book=newOccultBook();
  book.learned.seer=["seer_mark","seer_rice"];
  book.learned.mender=["mender_heal"];
  book.loadouts.seer[0]="seer_mark";book.loadouts.mender[0]="mender_heal";
  book.training.seer=8;book.training.mender=3;book.cooldowns.seer_mark=10000;
  book.mastery.seer.rice=4;book.mastery.mender.healing=2;
  assert.deepEqual(validateOccultBook(book,5),book);
  assert.equal(occultPoints(5),3);
  const copy=validateOccultBook(book,5);copy.learned.seer.pop();
  assert.equal(book.learned.seer.length,2);
});
test("legacy occult saves retain learned skills and start separate mastery at zero",()=>{
  const old=newOccultBook();
  old.learned.seer=["seer_mark","seer_rice"];old.loadouts.seer[0]="seer_rice";
  old.training.seer=8;old.cooldowns.seer_rice=10000;
  const {mastery:_omitted,...legacy}=old;
  const restored=validateOccultBook(legacy,5);
  assert.deepEqual(restored.learned.seer,old.learned.seer);
  assert.deepEqual(restored.loadouts,old.loadouts);
  assert.deepEqual(restored.cooldowns,old.cooldowns);
  assert.equal(restored.training.seer,8);
  assert.deepEqual(restored.mastery,newOccultBook().mastery);
});
test("mastery values and all lesson requirements are bounded and path-specific",()=>{
  for (const [id,requirements] of Object.entries(OCCULT_MASTERY_REQUIREMENTS)) {
    const path=OCCULT_LESSONS[id as keyof typeof OCCULT_LESSONS].path,labels=OCCULT_MASTERY_LABELS[path];
    for (const [category,count] of Object.entries(requirements)) {
      assert.ok(Object.hasOwn(labels,category),id+" has a category from its own path");
      assert.ok(Number.isSafeInteger(count) && count>0,id+" has a positive requirement");
    }
  }
  const bad=newOccultBook();
  bad.mastery.seer.rice=-1;
  assert.throws(()=>validateOccultBook(bad,15));
  bad.mastery.seer.rice=0;
  (bad.mastery.seer as Record<string,number>).forged=1;
  assert.throws(()=>validateOccultBook(bad,15));
});
test("invalid prerequisites, cross-path slots, excess points and forged cooldowns fail closed",()=>{
  const book=newOccultBook();book.learned.seer=["seer_burst"];
  assert.throws(()=>validateOccultBook(book,15));
  book.learned.seer=["seer_mark"];book.loadouts.mender[0]="seer_mark";
  assert.throws(()=>validateOccultBook(book,15));
  book.loadouts.mender[0]=null;book.cooldowns.seer_mark=-1;
  assert.throws(()=>validateOccultBook(book,15));
  book.cooldowns.seer_mark=10;book.learned.seer=["seer_mark","seer_rice"];
  assert.throws(()=>validateOccultBook(book,1));
});
test("seer core ranks and cooldowns preserve legacy books and respect the level 100 point limit",()=>{
  const book=newOccultBook();assert.deepEqual(validateOccultBook(book,1),book);
  book.coreRanks={seer_binding:8,seer_poison:4};book.cooldowns.seer_poison=123;
  assert.deepEqual(validateOccultBook(book,100).coreRanks,book.coreRanks);
  assert.equal(validateOccultBook(book,100).cooldowns.seer_poison,123);
  assert.throws(()=>validateOccultBook(book,99));
  book.coreRanks={seer_binding:8,seer_poison:5};assert.throws(()=>validateOccultBook(book,100));
  book.coreRanks={seer_binding:2};assert.throws(()=>validateOccultBook(book,5));
});
test("mender core progress is saved separately from seer and respects its own point limit",()=>{
  const book=newOccultBook();book.coreRanks={seer_pot:4};book.menderCoreRanks={mender_core_heal:8,mender_core_ward:4};
  book.cooldowns.mender_core_heal=234;
  const restored=validateOccultBook(book,100);
  assert.deepEqual(restored.menderCoreRanks,book.menderCoreRanks);assert.deepEqual(restored.coreRanks,book.coreRanks);
  assert.equal(restored.cooldowns.mender_core_heal,234);
  assert.throws(()=>validateOccultBook(book,99));
  book.menderCoreRanks={mender_core_heal:8,mender_core_ward:5};assert.throws(()=>validateOccultBook(book,100));
  book.menderCoreRanks={mender_core_heal:2};assert.throws(()=>validateOccultBook(book,5));
});
