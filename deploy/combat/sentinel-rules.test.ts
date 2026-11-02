import {test} from "node:test";
import assert from "node:assert/strict";
import {SENTINEL_LESSONS,SENTINEL_PRACTICE_LABELS,newSentinelBook,sentinelPoints,validateSentinelBook} from "./SentinelRules.js";

test("guardian prerequisites and practice categories are reachable and bounded",()=>{
  for(const [id,node] of Object.entries(SENTINEL_LESSONS)){
    for(const req of node.requires){assert.ok(Object.hasOwn(SENTINEL_LESSONS,req));assert.ok(SENTINEL_LESSONS[req as keyof typeof SENTINEL_LESSONS].level<node.level,`${id} prerequisite level`);}
    for(const [category,count] of Object.entries(node.practice)){assert.ok(Object.hasOwn(SENTINEL_PRACTICE_LABELS,category));assert.ok(Number.isSafeInteger(count) && count>0);}
    if(node.effect!=="passive")assert.ok(node.stamina>0 && node.cooldownMs>0);
  }
});
test("guardian book retains skills, shortcuts, practice and cooldown independently",()=>{
  const book=newSentinelBook();book.learned=["guard","bash","taunt"];book.slots=["bash","guard","taunt",null];book.practice.guard=4;book.cooldowns.bash=123456;
  const restored=validateSentinelBook(book,5);assert.deepEqual(restored,book);restored.learned.pop();assert.equal(book.learned.length,3);assert.equal(sentinelPoints(5),3);
});
test("guardian book rejects invalid prerequisites, duplicate slots and forged practice",()=>{
  const book=newSentinelBook();book.learned=["slam"];assert.throws(()=>validateSentinelBook(book,20));
  book.learned=["guard","fortitude"];book.slots=["fortitude",null,null,null];assert.throws(()=>validateSentinelBook(book,15));
  book.slots=["guard",null,null,null];book.practice.stun=-1;assert.throws(()=>validateSentinelBook(book,15));
  book.practice.stun=0;(book.cooldowns as Record<string,number>).forged=1;assert.throws(()=>validateSentinelBook(book,15));
});
