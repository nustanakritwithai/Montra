import test from "node:test";
import assert from "node:assert/strict";
import {EconomyStore} from "./EconomyStore.js";
import {FISH_PERIOD,fishItem,fishNeedle,fishingWater,isFishingWater,pullFish,validateFishingPosition,type FishingSession} from "./Fishing.js";

function session():FishingSession{return {id:"fish_"+"a".repeat(32),mapId:"ritual_village",x:9,z:0,originX:5,originZ:0,combatAt:-1,biteAt:1000,lastReel:0,distance:9,initialDistance:9,strength:100,line:100,item:"mat_fish_common"};}

test("fishing targets real water within reach on the current map",()=>{
  const p={mapId:"ritual_village",x:-5,y:0,z:0,alive:true,mounted:false,flying:false};
  assert.ok(isFishingWater(p.mapId,-9,0));assert.doesNotThrow(()=>validateFishingPosition(p,-9,0));
  assert.throws(()=>validateFishingPosition(p,0,0),/fish_water/);
  assert.throws(()=>validateFishingPosition(p,-19,0),/fish_range/);
  assert.throws(()=>validateFishingPosition({...p,flying:true},-9,0),/fish_ground/);
  assert.equal(isFishingWater("not-a-map",9,0),false);
  assert.ok(fishingWater("ritual_village").length>=2);
  assert.ok(fishingWater("river_watch").length>0);
});

test("accurate timing brings the fish to the player; misses damage the line",()=>{
  const s=session();assert.equal(pullFish(s,999),"early");
  assert.equal(fishNeedle(0),0);assert.equal(fishNeedle(FISH_PERIOD/4),.5);assert.equal(fishNeedle(FISH_PERIOD/2),1);
  assert.equal(pullFish(s,1700),"perfect");assert.equal(s.distance,5.5);assert.equal(s.line,99);
  assert.equal(pullFish(s,1701),"slow");assert.equal(pullFish(s,4500),"perfect");assert.equal(s.distance,2);
  assert.equal(pullFish(s,7300),"caught");assert.equal(s.distance,0);
  const miss=session();miss.distance=3;
  for(let i=0;i<4;i++)assert.equal(pullFish(miss,1000+i*FISH_PERIOD),"miss");
  assert.equal(pullFish(miss,1000+4*FISH_PERIOD),"broken");
  const escaping=session();escaping.distance=16;assert.equal(pullFish(escaping,1000),"escaped");
  assert.equal(fishItem(0),"mat_fish_common");assert.equal(fishItem(70),"mat_fish_silver");assert.equal(fishItem(99),"mat_fish_spirit");
});

test("caught fish are stackable saleable inventory, and a repeated catch cannot duplicate rewards",()=>{
  const db=new EconomyStore(":memory:"),actor="a".repeat(64),id="fish_"+"a".repeat(32);
  try{
    db.register(actor,{version:1,slots:Array(12).fill(null),equippedWeaponSlot:null});
    assert.deepEqual(db.catchFish(actor,id,"mat_fish_spirit"),{item:"mat_fish_spirit",quantity:1});
    assert.deepEqual(db.catchFish(actor,id,"mat_fish_spirit"),{item:"mat_fish_spirit",quantity:1});
    const account=db.getAccount(actor),slot=account.inventory.slots.findIndex(s=>s?.itemId==="mat_fish_spirit");
    assert.equal(account.inventory.slots[slot]?.quantity,1);
    assert.equal(db.sellMaterial(actor,"fish_sell_request_0001",slot,"mat_fish_spirit",1).receivedGold,18);
  }finally{db.close();}
});

test("a full inventory does not consume a catch request",()=>{
  const db=new EconomyStore(":memory:"),actor="b".repeat(64),id="fish_"+"b".repeat(32);
  try{
    db.register(actor,{version:1,slots:Array.from({length:12},()=>({itemId:"mat_fish_common" as const,quantity:99})),equippedWeaponSlot:null});
    assert.throws(()=>db.catchFish(actor,id,"mat_fish_spirit"),/inventory_full/);
    db.sellMaterial(actor,"fish_sell_request_0002",0,"mat_fish_common",99);
    db.catchFish(actor,id,"mat_fish_spirit");
    assert.equal(db.getAccount(actor).inventory.slots.find(s=>s?.itemId==="mat_fish_spirit")?.quantity,1);
  }finally{db.close();}
});
