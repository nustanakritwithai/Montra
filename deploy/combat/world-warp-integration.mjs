/** Isolated localhost test only. Never point this at a live server or saves. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Client } from "@colyseus/sdk";
const endpoint=process.env.MONTRA_TEST_URL;
const dir=process.env.MONTRA_CHARACTER_DIR;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(endpoint||"") || !dir || !path.basename(dir).startsWith("montra-world-test-")) throw Error("requires isolated localhost server and montra-world-test-* directory");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,ms=5000){const end=Date.now()+ms;while(Date.now()<end){if(fn())return;await sleep(50)}throw Error("timeout: "+label)}
const token=()=>"mt1_"+randomBytes(32).toString("hex");
const file=t=>path.join(dir,createHash("sha256").update(t).digest("hex")+".json");
const open=async(t,roomId)=>{const c=new Client(endpoint);const r=roomId?await c.joinById(roomId,{guestToken:t}):await c.create("my_room",{guestToken:t});await until(()=>r.state?.players?.get(r.sessionId),"join");return r};
const own=r=>r.state.players.get(r.sessionId);
async function seed(t,mapId,x,z){const r=await open(t);await r.leave();await sleep(500);const f=file(t),s=JSON.parse(await readFile(f,"utf8"));s.mapId=mapId;s.x=x;s.y=0;s.z=z;s.inventory.slots[0].quantity=2;s.inventory.equippedWeaponSlot=2;await writeFile(f,JSON.stringify(s));}
const aToken=token(),bToken=token(),cToken=token(); let rooms=[];
try{
 await seed(aToken,"ritual_village",-4,-17); await seed(bToken,"forbidden_forest",-4,-17); await seed(cToken,"forbidden_forest",1.1,10.4);
 const a=await open(aToken);rooms.push(a);const b=await open(bToken,a.roomId);rooms.push(b);const c=await open(cToken,a.roomId);rooms.push(c);
 await until(()=>a.state.players.size===3,"all players"); const rejects=[];a.onMessage("command_rejected",e=>rejects.push(e.reason));
 const ahp=own(a).hp,bhp=own(b).hp,chp=own(c).hp;
 a.send("shoot",{targetId:b.sessionId});await until(()=>rejects.includes("target_unavailable"),"cross map shot rejected");
 b.send("attack",{targetId:a.sessionId});await sleep(2200);assert.equal(own(a).hp,ahp);assert.equal(own(b).hp,bhp);assert.equal(own(c).hp,chp,"monster must not attack forest player at its coordinates");
 a.send("warp",{portalId:"village_to_forest",mapId:"forbidden_forest",x:0});await until(()=>rejects.includes("invalid_portal_request"),"forgery rejected");
 a.send("warp",{portalId:"village_to_forest"});a.send("warp",{portalId:"village_to_forest"});await until(()=>own(a).mapId==="forbidden_forest","warp to forest");
 assert.equal(own(a).x,0);assert.equal(own(a).z,12);await sleep(400);let disk=JSON.parse(await readFile(file(aToken),"utf8"));assert.equal(disk.mapId,"forbidden_forest");assert.equal(disk.inventory.slots[0].quantity,2);assert.equal(disk.inventory.equippedWeaponSlot,2);
 a.send("warp",{portalId:"forest_to_village"});await sleep(600);assert.equal(own(a).mapId,"forbidden_forest","cooldown must prevent immediate return");
 await a.leave();rooms=rooms.filter(x=>x!==a);await sleep(600);const resumed=await open(aToken,b.roomId);rooms.push(resumed);assert.equal(own(resumed).mapId,"forbidden_forest");assert.equal(own(resumed).equippedWeaponId,"arcane_sword");
 resumed.send("warp",{portalId:"forest_to_village"});await until(()=>own(resumed).mapId==="ritual_village","return to village");
 assert.equal(own(resumed).x,-4);assert.equal(own(resumed).z,-15);
 await sleep(3200);resumed.send("warp",{portalId:"village_to_forest"});await resumed.leave();rooms=rooms.filter(x=>x!==resumed);await sleep(800);
 const after=await open(aToken,b.roomId);rooms.push(after);disk=JSON.parse(await readFile(file(aToken),"utf8"));assert.equal(own(after).mapId,disk.mapId);assert.equal(own(after).x,disk.x);assert.equal(own(after).z,disk.z);assert.equal(disk.inventory.slots[0].quantity,2);assert.equal(disk.inventory.equippedWeaponSlot,2);
 console.log("PASS: real isolated room: cross-map combat, monster isolation, forged command, round trip, cooldown, reconnect and disconnect race");
}catch(e){console.error(e);process.exitCode=1}finally{for(const r of rooms.reverse())await r.leave().catch(()=>{})}
