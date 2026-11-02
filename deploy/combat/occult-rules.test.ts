import { test } from "node:test";
import assert from "node:assert/strict";
import { isOccultPath } from "./CharacterBuilds.js";
import { newOccultBook, occultPoints, validateOccultBook } from "./OccultRules.js";

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
  assert.deepEqual(validateOccultBook(book,5),book);
  assert.equal(occultPoints(5),3);
  const copy=validateOccultBook(book,5);copy.learned.seer.pop();
  assert.equal(book.learned.seer.length,2);
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
