import { strict as assert } from "node:assert";
import { test } from "node:test";
import { classLearningLevel, newRebirthState, rebirthBonuses, recordClassLevel, startNextLife, validateRebirthState } from "./Rebirth.js";
import { PATHS, type PathId } from "./CharacterBuilds.js";
import { prepareRebirth } from "./RebirthTransition.js";
import { equipBody, makeClassInventory } from "./ItemRules.js";
import type { CharacterSnapshot } from "./CharacterStore.js";
import { CharacterStore } from "./CharacterStore.js";
import { newMuayBook } from "./MuayRules.js";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";

test("mastery is credited once per cycle and survives changing class",()=>{
  const one=recordClassLevel(newRebirthState(),"muay_boran",100);
  assert.equal(one.mastery.muay_boran,1);
  assert.deepEqual(recordClassLevel(one,"muay_boran",100),one);
  const next=startNextLife(one,"muay_boran",100);
  assert.equal(next.count,1);
  const mage=recordClassLevel(next,"seer",100);
  assert.deepEqual(mage.mastery,{muay_boran:1,seer:1});
  assert.equal(classLearningLevel(mage,"muay_boran",1),100);
  assert.equal(classLearningLevel(mage,"mender",1),1);
  assert.throws(()=>startNextLife(mage,"seer",99));
});

test("all six classes can reach mastery two within the 15 rebirth limit",()=>{
  let state=newRebirthState();
  const paths=Object.keys(PATHS) as PathId[];
  for (let cycle=0;cycle<12;cycle++) {
    const path=paths[cycle%paths.length];
    state=recordClassLevel(state,path,100);
    if(cycle<11)state=startNextLife(state,path,100);
  }
  for(const path of paths) assert.equal(state.mastery[path],2);
  const pve=rebirthBonuses(state,"pve"), pvp=rebirthBonuses(state,"pvp");
  assert.ok(Math.abs(pve.hp-.16)<1e-9);
  assert.ok(Math.abs(pvp.hp-.058)<1e-9);
  assert.ok(Math.abs(pve.movement-.02)<1e-9);
});

test("invalid state and duplicate credited cycle cannot grant extra mastery",()=>{
  assert.throws(()=>validateRebirthState({count:0,highest:{seer:100},mastery:{seer:2},creditedCycle:0}));
  assert.throws(()=>validateRebirthState({count:0,highest:{seer:99},mastery:{seer:1},creditedCycle:0}));
  let state=newRebirthState();
  for(let n=0;n<15;n++) state=startNextLife(state,"seer",100);
  state=recordClassLevel(state,"seer",100);
  assert.equal(state.mastery.seer,2);
  assert.throws(()=>startNextLife(state,"seer",100));
});

test("class transition preserves items and sockets and rejects a full bag atomically",()=>{
  let bag=makeClassInventory("sentinel");
  bag.slots[2]={itemId:"off_shield_1",quantity:1,socket:"card_asura"};
  const equipped=equipBody(bag,"offHand",2,"off_shield_1","sentinel",100);
  assert.equal(equipped.ok,true);
  if(!equipped.ok)throw Error("equip_failed");
  bag=equipped.inventory;
  const character:CharacterSnapshot={version:1,id:"a".repeat(64),name:"Tester",level:100,experience:0,
    pkKills:0,pkDeaths:0,x:0,y:0,z:0,hp:500,build:{path:"sentinel",ancestry:"shrine"},inventory:bag,updatedAt:new Date().toISOString()};
  const next=prepareRebirth(character,"seer");
  assert.equal(next.level,1);
  assert.equal(next.build?.path,"seer");
  assert.equal(next.rebirth?.mastery.sentinel,1);
  assert.equal(next.inventory?.slots.find(x=>x?.itemId==="off_shield_1")?.socket,"card_asura");
  assert.equal(character.inventory?.equipment?.offHand,"off_shield_1");
  const full={...character,inventory:{...bag,slots:bag.slots.map(s=>s ?? {itemId:"mat_wood_1" as const,quantity:1})}};
  assert.throws(()=>prepareRebirth(full,"seer"),/rebirth_inventory_full/);
  assert.equal(full.inventory.equipment?.offHand,"off_shield_1");
});

test("a reborn level-one save reloads with previously earned level-100 skills",async()=>{
  const dir=await mkdtemp(path.join(process.cwd(),"montra-rebirth-test-"));
  try {
    const store=new CharacterStore(dir),token="mt1_"+"ac".repeat(32);
    const original=(await store.loadOrCreate(token,{x:0,z:0})).character;
    const book=newMuayBook();book.coreRanks={chaiya:8};
    const veteran={...original,level:100,build:{path:"muay_boran" as const,ancestry:"shrine" as const},muayBook:book};
    const next=prepareRebirth(veteran,"seer");
    await store.save(next);
    const restored=(await store.loadOrCreate(token,{x:0,z:0})).character;
    assert.equal(restored.level,1);
    assert.equal(restored.build?.path,"seer");
    assert.equal(restored.muayBook?.coreRanks?.chaiya,8);
    assert.equal(restored.rebirth?.mastery.muay_boran,1);
    await assert.rejects(store.save({...next,rebirth:undefined}),/invalid_muay_book/);
  } finally { await rm(dir,{recursive:true,force:true}); }
});
