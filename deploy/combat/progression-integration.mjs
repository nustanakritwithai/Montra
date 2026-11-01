/** Isolated localhost server and disposable test data only. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@colyseus/sdk";
const endpoint=process.env.MONTRA_TEST_URL, dir=process.env.MONTRA_CHARACTER_DIR;
const token=process.env.MONTRA_PROGRESSION_TEST_TOKEN, stage=process.env.MONTRA_PROGRESSION_TEST_STAGE;
if (!/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(endpoint || "") ||
    !dir || !/^(?:montra-progression-test-|montra-world-test-)/.test(path.basename(dir)) ||
    !/^mt1_[0-9a-f]{64}$/.test(token || "") || !["write","read"].includes(stage)) {
  throw new Error("Requires local test server, montra-progression-test-* directory, test token and stage");
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=5000) { const end=Date.now()+timeout; while(Date.now()<end) { if(fn())return; await sleep(50); } throw new Error("timeout: "+label); }
const id=createHash("sha256").update(token).digest("hex"), file=path.join(dir,id+".json");
let room;
try {
  if(stage==="write") {
    // Construct a legacy save only inside this test directory while offline.
    room=await new Client(endpoint).create("my_room",{guestToken:token});
    await until(()=>room.state?.players?.get(room.sessionId),"create");
    await room.leave();room=null;await sleep(400);
    const old=JSON.parse(await readFile(file,"utf8"));
    old.hp=100;old.experience=50;old.level=1;old.x=1.1;old.y=0;old.z=7;
    old.inventory.slots[0].quantity=2;old.inventory.equippedWeaponSlot=2;
    delete old.statAllocations;delete old.stamina;
    await writeFile(file,JSON.stringify(old));
  }
  room=await new Client(endpoint).create("my_room",{guestToken:token});
  const own=()=>room.state?.players?.get(room.sessionId);
  const rejected=[];
  room.onMessage("command_rejected",m=>rejected.push(m.reason));
  room.onMessage("experience_gained",()=>{});
  await until(()=>own() && room.state?.progressionAvailable===true,"progression state");
  if(stage==="write") {
    assert.equal(own().maxHp,240);assert.ok(own().hp<150,"legacy HP must not be reset to full");
    assert.equal(own().experience,50);assert.equal(own().equippedWeaponId,"arcane_sword");
    room.send("attack",{targetId:"possessed-1"});
    await until(()=>own()?.level===2 && own()?.statPoints===0,"real monster EXP and level",20000);
    assert.equal(own().experience,0);
    room.send("allocate_stat",{stat:"atk",amount:99});
    await until(()=>rejected.includes("automatic_stats"),"stat allocation rejected");
    assert.equal(own().statPoints,0);
    assert.ok(own().maxHp > 240, "stats grow automatically");
    const saved=JSON.parse(await readFile(file,"utf8"));
    assert.equal(saved.statAllocations.atk,0);assert.equal(saved.level,2);assert.equal(saved.experience,0);
    assert.equal(saved.inventory.slots[0].quantity,2);assert.equal(saved.inventory.equippedWeaponSlot,2);
    console.log("PASS: legacy HP and inventory preserved; real monster awards EXP and automatic stat growth");
  } else {
    assert.equal(own().level,2);assert.equal(own().experience,0);assert.equal(own().statPoints,0);
    assert.equal(own().equippedWeaponId,"arcane_sword");
    const saved=JSON.parse(await readFile(file,"utf8"));
    assert.equal(saved.statAllocations.atk,0);assert.equal(saved.inventory.slots[0].quantity,2);
    console.log("PASS: EXP, automatic stats, weapon and potion count survive Node restart");
  }
} finally { if(room) await room.leave().catch(()=>{}); }
