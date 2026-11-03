import {test} from "node:test";
import assert from "node:assert/strict";
import {BLADE_LESSONS, BLADE_PRACTICE_LABELS, bladePoints, newBladeBook, validateBladeBook} from "./BladeRules.js";
import {skillRankMultiplier} from "./Progression.js";

test("blade skill tree has valid prerequisites, practice categories and active values",()=>{
  for(const [id,node] of Object.entries(BLADE_LESSONS)) {
    for(const req of node.requires) {
      assert.ok(Object.hasOwn(BLADE_LESSONS,req),`${id}: unknown prerequisite ${req}`);
      assert.ok(BLADE_LESSONS[req as keyof typeof BLADE_LESSONS].level<node.level,`${id}: prerequisite must be earlier`);
    }
    for(const [category,amount] of Object.entries(node.practice)) {
      assert.ok(Object.hasOwn(BLADE_PRACTICE_LABELS,category));
      assert.ok(Number.isSafeInteger(amount) && amount>0);
    }
    if(node.effect!=="passive") assert.ok(node.stamina>0 && node.cooldownMs>0);
  }
});

test("blade upgrades preserve legacy books and validate points, level and learned skills",()=>{
  const book=newBladeBook();book.learned=["cloak","hidden_edge"];book.slots=["cloak","hidden_edge",null,null];
  assert.deepEqual(validateBladeBook(book,25),book);
  book.ranks={hidden_edge:1};
  assert.deepEqual(validateBladeBook(book,25).ranks,{hidden_edge:1});
  assert.equal(skillRankMultiplier(book.ranks,"hidden_edge"),1.04);
  assert.throws(()=>validateBladeBook(book,24));
  book.ranks={hidden_edge:2};assert.throws(()=>validateBladeBook(book,44));
  book.ranks={piercing_edge:1};assert.throws(()=>validateBladeBook(book,100));
  book.ranks={hidden_edge:6};assert.throws(()=>validateBladeBook(book,100));
  book.ranks={cloak:1};assert.throws(()=>validateBladeBook(book,100));
});

test("blade book preserves learned abilities, practice, loadout and cooldowns",()=>{
  const book=newBladeBook();book.learned=["cloak","hidden_edge","evade"];book.slots=["cloak","hidden_edge","evade",null];
  book.practice={ambush:9,mark:4,evade:3,combo:1};book.cooldowns.hidden_edge=12345;
  const restored=validateBladeBook(book,5);assert.deepEqual(restored,book);
  restored.learned.pop();assert.equal(book.learned.length,3);
  assert.equal(bladePoints(5),3);
});

test("blade book rejects invalid prerequisites, forged counters and passive hotbar slots",()=>{
  const book=newBladeBook();book.learned=["marked_cut"];
  assert.throws(()=>validateBladeBook(book,20));
  book.learned=["cloak","quiet_step"];book.slots=["quiet_step",null,null,null];
  assert.throws(()=>validateBladeBook(book,10));
  book.slots=["cloak",null,null,null];book.practice.ambush=-1;
  assert.throws(()=>validateBladeBook(book,10));
  book.practice.ambush=0;(book.cooldowns as Record<string,number>).forged=1;
  assert.throws(()=>validateBladeBook(book,10));
});
