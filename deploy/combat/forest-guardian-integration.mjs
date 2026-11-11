import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !dir || !path.basename(dir).startsWith("montra-monster-test-")) throw Error("Isolated SQLite test required");
const guardianId="forest_shrine_keeper",members=[];
const fullInventorySlots=108;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function waitFor(read,label,timeout=8000) {
  const until=Date.now()+timeout;
  while(Date.now()<until){const result=read();if(result)return result;await sleep(50);}
  throw Error("Timeout: "+label);
}
async function member(i,restore=false) {
  const token="mt1_"+["c","d","e","f"][i].repeat(64);
  if(!restore){
    const id=createHash("sha256").update(token).digest("hex");
    // Keep the other members as legacy saves; only the full-bag case fills current capacity.
    const full=i===3,slots=Array.from({length:full?fullInventorySlots:12},()=>full?{itemId:"health_potion",quantity:99}:null);
    slots[0]={itemId:"health_potion",quantity:full?99:2};
    for(const [j,itemId] of ["ritual_dagger","arcane_sword","spirit_staff"].entries())slots[j+1]={itemId,quantity:1};
    await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"นักทดสอบ",level:12,experience:0,pkKills:0,pkDeaths:0,x:-14+i*.2,y:0,z:-89,hp:416,mapId:"forbidden_forest",inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
  }
  const client=new Client(url),opts={guestToken:token,worldVersion:1};
  const room=members.length?await client.joinById(members[0].room.roomId,opts):await client.create("my_room",opts);
  const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
  const entry={room,events};members.push(entry);
  await waitFor(()=>room.state?.players?.get(room.sessionId),"join");
  if(!restore && i===3){
    room.send("get_inventory",{});
    const bag=await waitFor(()=>events.find(e=>e.type==="inventory_state")?.data,"full inventory before rewards");
    assert.equal(bag.slots.length,fullInventorySlots);
    assert.ok(bag.slots.every(item=>item!==null),"reward-denial fixture must fill every current slot");
  }
  return entry;
}
const craft = {recipeId:"shrine_glaive",requestId:"integration_craft_shrine_guardian"};
try{
  if(process.env.MONTRA_GUARDIAN_STAGE==="read"){
    for(let i=0;i<4;i++){
      const {room,events}=await member(i,true);
      assert.equal(room.state.players.get(room.sessionId).experience,1462);
      room.send("get_inventory",{});
      const bag=await waitFor(()=>events.find(e=>e.type==="inventory_state")?.data,"durable inventory");
      assert.equal(bag.slots.length,fullInventorySlots);
      assert.equal(bag.slots[0].quantity,i===3?99:3);
      const count = itemId => bag.slots.filter(item => item?.itemId === itemId).reduce((sum,item) => sum + item.quantity,0);
      assert.equal(count("shrine_shard"),i === 1 || i === 2 ? 1 : 0);
      assert.equal(count("shrine_glaive"),i === 0 ? 1 : 0);
      if (i === 0) {
        assert.equal(room.state.players.get(room.sessionId).equippedWeaponId,"shrine_glaive");
        room.send("craft_weapon",craft); // Retry even after process restart.
        await waitFor(()=>events.find(e=>e.type==="craft_result"),"durable craft receipt");
        assert.equal(events.findLast(e=>e.type==="economy_state").data.gold,900);
      }
      await room.leave();members.pop();
    }
    console.log("PASS: all four SQLite rewards survive a process restart, including a full bag");
  }else{
    for(let i=0;i<4;i++)await member(i);
    const leader=members[0].room;
    for(const {room,events} of members.slice(1)){
      leader.send("party_invite",{targetId:room.sessionId});
      const invite=await waitFor(()=>events.find(e=>e.type==="party_invitation")?.data,"invitation");
      room.send("party_accept",{inviteId:invite.inviteId});
      await waitFor(()=>events.find(e=>e.type==="party_state"),"join party");
    }
    for(const {room} of members)room.send("attack",{targetId:guardianId});
    await waitFor(()=>members.every(m=>m.events.some(e=>e.type==="experience_gained")),"four Elite rewards",35000);
    for(const [i,{events}] of members.entries()){
      const grants=events.filter(e=>e.type==="experience_gained");
      assert.equal(grants.length,1);assert.equal(grants[0].data.amount,1462);
      assert.equal(grants[0].data.elitePotion,i===3?"bag_full":"granted");
      assert.equal(grants[0].data.shrineShard,i===3?"bag_full":"granted");
    }
    await waitFor(()=>!leader.state.monsters.get(guardianId).alive,"death patch");
    const log = members[0].events;
    leader.send("craft_weapon",craft);
    await waitFor(()=>log.some(e=>e.type==="craft_result"),"craft from actual guardian drop");
    const bag=log.findLast(e=>e.type==="inventory_state").data;
    const slot=bag.slots.findIndex(item=>item?.itemId==="shrine_glaive");
    assert.notEqual(slot,-1);assert.equal(log.findLast(e=>e.type==="economy_state").data.gold,900);
    leader.send("equip_weapon",{slot});
    await waitFor(()=>leader.state.players.get(leader.sessionId).equippedWeaponId==="shrine_glaive","equip crafted glaive");
    console.log("PASS: four-player Elite kill, party XP and potion, shard eligibility, craft and equip");
  }
}finally{for(const {room} of members.reverse())await room.leave().catch(()=>{});}
