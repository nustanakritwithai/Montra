/**
 * MONTRA V0.2.7 permanent weapons integration.
 * Runs on an ISOLATED localhost Colyseus server with TEMP character data.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { Client } from "@colyseus/sdk";

const endpoint = process.env.MONTRA_TEST_URL || "http://127.0.0.1:4108";
if (!/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(endpoint) ||
    !process.env.MONTRA_CHARACTER_DIR) {
  throw new Error("Weapon integration requires LOCAL TEST server and TEMP MONTRA_CHARACTER_DIR");
}
const guestToken="mt1_"+randomBytes(32).toString("hex");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(condition,timeout,label){
  const started=Date.now();
  while(Date.now()-started<timeout){
    if(condition())return;
    await sleep(50);
  }
  throw new Error("Timed out: "+label);
}
const rooms=[];
try{
  const a=await new Client(endpoint).create("my_room",{guestToken,characterSlot:1});
  rooms.push(a);
  const b=await new Client(endpoint).joinById(a.roomId);
  rooms.push(b);
  const attackerId=a.sessionId, victimId=b.sessionId;
  const attacker=()=>a.state?.players?.get(attackerId);
  const victim=()=>a.state?.players?.get(victimId);
  const inventory=[],equipEvents=[],rejected=[],pvp=[];
  a.onMessage("inventory_state",payload=>inventory.push(payload));
  a.onMessage("weapon_equipped",payload=>equipEvents.push(payload));
  a.onMessage("command_rejected",notice=>rejected.push(notice.reason));
  a.onMessage("pvp_hit",info=>pvp.push(info));
  await until(()=>a.state?.weaponsAvailable===true &&
    a.state?.inventoryAvailable===true && b.state?.players?.size===2 &&
    attacker()?.equippedWeaponId==="ritual_dagger",4500,
    "players and starter dagger equipped");
  a.send("get_inventory",{});
  await until(()=>inventory.at(-1)?.slots?.[0]?.quantity===3 &&
    inventory.at(-1)?.slots?.[1]?.itemId==="ritual_dagger" &&
    inventory.at(-1)?.slots?.[2]?.itemId==="arcane_sword" &&
    inventory.at(-1)?.slots?.[3]?.itemId==="spirit_staff" &&
    inventory.at(-1)?.equippedWeaponSlot===1,3500,"all starter weapons");
  console.log("PASS: persisted player starts with 3 weapons and exactly 3 health potions");

  // Forged damage, quantity, item ID and attempts to drink a weapon fail.
  a.send("equip_weapon",{slot:2,damage:99999});
  await until(()=>rejected.includes("invalid_weapon_equip"),2000,"reject forged weapon power");
  await sleep(550); // one rejection notice per 500ms
  a.send("use_item",{slot:2});
  await until(()=>rejected.includes("not_consumable"),2000,"weapons cannot be consumed");
  assert.equal(inventory.at(-1).slots[2].quantity,1);
  assert.equal(attacker().equippedWeaponId,"ritual_dagger");
  console.log("PASS: can't forge weapon damage or consume a permanent weapon as a potion");

  a.send("equip_weapon",{slot:2});
  await until(()=>attacker().equippedWeaponId==="arcane_sword" &&
    inventory.at(-1)?.equippedWeaponSlot===2 && equipEvents.at(-1)?.weaponId==="arcane_sword",
    3200,"equip sword written and replicated");
  assert.equal(b.state.players.get(attackerId).equippedWeaponId,"arcane_sword");
  a.send("attack",{targetId:victimId});
  await until(()=>victim()?.hp===80,3100,"sword melee PvP damage 12 + 8");
  const swordHit=pvp.find(hit=>hit.attackerId===attackerId && hit.damage===20);
  assert.ok(swordHit,"sword has exact server-calculated PvP bonus");
  a.send("move",{x:0,z:0}); // cancel auto attack
  console.log("PASS: equipped arcane sword adds 8 to real server PvP melee damage");

  await sleep(900);
  a.send("equip_weapon",{slot:3});
  await until(()=>attacker().equippedWeaponId==="spirit_staff" &&
    inventory.at(-1)?.equippedWeaponSlot===3,3200,"equip spirit staff");
  await sleep(1250); // shared melee/ranged attack timer
  a.send("shoot",{targetId:victimId});
  await until(()=>pvp.some(hit=>hit.source==="ranged" &&
    hit.damage===16 && hit.targetId===victimId),2600,
    "staff ranged PvP damage 10 + 6");
  console.log("PASS: spirit staff boosts SERVER calculated magic shot from 10 to 16");

  await sleep(850);
  a.send("equip_weapon",{slot:null});
  await until(()=>attacker().equippedWeaponId==="" &&
    inventory.at(-1)?.equippedWeaponSlot===null,3200,"unequip staff");
  assert.equal(inventory.at(-1).slots[0].quantity,3);
  assert.equal(inventory.at(-1).slots[1].quantity,1);
  assert.equal(inventory.at(-1).slots[2].quantity,1);
  assert.equal(inventory.at(-1).slots[3].quantity,1);
  console.log("PASS: unequip does not consume a weapon or refill potions");

  // The room remains authoritative after rejoin and the exact character
  // slot receives its saved equipment marker, not a second starter kit.
  for(const r of rooms.reverse())await r.leave().catch(()=>{});
  rooms.length=0;
  const resumed=await new Client(endpoint).create("my_room",{guestToken,characterSlot:1});
  rooms.push(resumed);
  await until(()=>resumed.state?.players?.get(resumed.sessionId),3000,"rejoin same guest");
  assert.equal(resumed.state.players.get(resumed.sessionId).equippedWeaponId,"");
  const inventoryAfter=[];
  resumed.onMessage("inventory_state",x=>inventoryAfter.push(x));
  resumed.send("get_inventory",{});
  await until(()=>inventoryAfter.at(-1)?.equippedWeaponSlot===null,3000,
    "unequipped weapon persisted");
  assert.equal(inventoryAfter.at(-1).slots[0].quantity,3);
  assert.equal(inventoryAfter.at(-1).slots.filter(s=>s?.itemId==="arcane_sword").length,1);
  console.log("PASS: equipped status survives leaving/rejoining without extra weapons");
}catch(err){
  console.error("FAIL: MONTRA weapon integration",err);
  process.exitCode=1;
}finally{
  for(const r of rooms.reverse())await r.leave().catch(()=>{});
}
