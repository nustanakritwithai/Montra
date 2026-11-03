import test from "node:test";
import assert from "node:assert/strict";
import {countsMuayTechnique,MUAY_MASTERY_REQUIREMENTS,newMuayBook,newMuayLoadouts,validateMuayBook} from "./MuayRules.js";

test("old one-school and four-school books keep learned skills and gain independent zero mastery",()=>{
  const old={learned:["chaiya_elbow"],training:{strikes:73,blocks:9},slots:["step","chaiya_elbow","guard","counter"]};
  const migrated=validateMuayBook(old,25);
  assert.deepEqual(migrated.training,old.training);assert.deepEqual(migrated.slots,[null,"chaiya_elbow",null,null]);assert.deepEqual(migrated.learned,old.learned);
  assert.deepEqual(migrated.mastery.chaiya,{technique:0,sequences:0});
  migrated.mastery.chaiya.technique=4;assert.equal(migrated.mastery.korat.technique,0);
  const loadouts=newMuayLoadouts();loadouts.korat=["korat_press","punch","guard","counter"];
  const prior={school:"korat",learned:["korat_heavy","korat_swing","korat_press"],training:{strikes:70,blocks:8},slots:[...loadouts.korat],loadouts};
  const current=validateMuayBook(prior,25);
  assert.ok(current.learned.includes("korat_press"),"already-learned advanced skill remains usable despite zero new mastery");
  assert.deepEqual(current.slots,["korat_press",null,null,null]);assert.deepEqual(current.mastery.korat,{technique:0,sequences:0});
  assert.deepEqual(validateMuayBook(current,25),current);
});

test("mastery rejects malformed, incomplete, excessive, or unexpected save data",()=>{
  const original=newMuayBook();
  for(const bad of [-1,1.5,1_000_001,"5",null]) {
    const book=structuredClone(original);(book.mastery.korat as unknown as Record<string,unknown>).technique=bad;
    assert.throws(()=>validateMuayBook(book,25),/invalid_muay_book/);
  }
  const missing=structuredClone(original);delete (missing.mastery as unknown as Record<string,unknown>).chaiya;
  assert.throws(()=>validateMuayBook(missing,25),/invalid_muay_book/);
  const extra=structuredClone(original);(extra.mastery.thasao as unknown as Record<string,unknown>).other=1;
  assert.throws(()=>validateMuayBook(extra,25),/invalid_muay_book/);
});

test("school training counts only its own technique, with movement required for evasive schools",()=>{
  assert.equal(countsMuayTechnique("chaiya","counter",false),true);
  assert.equal(countsMuayTechnique("korat","korat_heavy",false),true);
  assert.equal(countsMuayTechnique("lopburi","lopburi_angle",false),false);
  assert.equal(countsMuayTechnique("lopburi","lopburi_angle",true),true);
  assert.equal(countsMuayTechnique("thasao","thasao_step",false),false);
  assert.equal(countsMuayTechnique("thasao","thasao_step",true),true);
  assert.equal(countsMuayTechnique("thasao","korat_heavy",true),false);
  assert.deepEqual(MUAY_MASTERY_REQUIREMENTS.korat_pierce,{technique:5,sequences:0});
  assert.deepEqual(MUAY_MASTERY_REQUIREMENTS.korat_press,{technique:10,sequences:3});
});
