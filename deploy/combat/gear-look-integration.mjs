// Visible gear (gearLook) end to end on an isolated account server: class field-kit pieces and boss
// accessories are worn through the real equip_gear command, seen by a second player in the same room,
// removed, carried across a portal and restored after reconnecting. Disposable test database only.
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {DatabaseSync} from "node:sqlite";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const endpoint=process.env.MONTRA_TEST_URL, folder=process.env.MONTRA_CHARACTER_DIR;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(endpoint||"") || new URL(endpoint).port==="4108" ||
    !folder || !path.basename(folder).startsWith("montra-account-test-")) throw Error("Requires an isolated test account server");
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(get,label,timeout=8000){const end=Date.now()+timeout;while(Date.now()<end){const v=get();if(v)return v;await delay(40);}throw Error("timed out: "+label);}
async function account(){
  const credentials={username:"look_"+randomBytes(5).toString("hex"),password:"gear-look-test-123"};
  const api=async route=>{const r=await fetch(endpoint+"/montra/account/"+route,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(credentials)});assert.equal(r.status,200);return r.json();};
  await api("register");return (await api("login")).session;
}
const base={characterSlot:1};
async function join(session,extra={},roomId){
  const sdk=new Client(endpoint),opts={...base,accountSession:session,...extra};
  const room=roomId?await sdk.joinById(roomId,opts):await sdk.create("my_room",opts),events=[];
  room.onMessage("*",(type,data)=>events.push({type,data}));
  const me=()=>room.state?.players?.get(room.sessionId);
  await until(()=>me()?.persistent,"admit");
  room.send("get_inventory",{});
  const bag=await until(()=>events.find(e=>e.type==="inventory_state"&&e.data.catalogReady)?.data,"bag");
  const catalog=Object.assign({},...events.filter(e=>e.type==="item_catalog_page").map(e=>e.data.items));
  return {room,me,events,bag,catalog};
}
async function equip(c,position,slot,expected){
  for(let attempt=0;attempt<5;attempt++){
    await delay(900);const start=c.events.length;
    c.room.send("equip_gear",{position,slot,expected});
    const reply=await until(()=>c.events.slice(start).find(e=>e.type==="command_rejected"||e.type==="item_use_failed"||
      e.type==="inventory_state"&&(e.data.equipment?.[position]??null)===(slot===null?null:expected)),"equip "+position);
    if(reply.type==="inventory_state")return reply.data;
    assert.equal(reply.data.reason,"equipment_cooldown",JSON.stringify(reply.data));
  }
  throw Error("equipment cooldown did not clear");
}
// Seed only this file's own disposable character: level 100, near the village→forest portal, gear in the bag.
function seed(prefix,items){
  const db=new DatabaseSync(path.join(folder,"economy.sqlite"));
  try{
    db.exec("BEGIN IMMEDIATE");
    const found=db.prepare("SELECT id,snapshot FROM characters WHERE id LIKE ?").all(prefix+"%");assert.equal(found.length,1);
    const {id,snapshot}=found[0],saved=JSON.parse(snapshot);
    const bag=JSON.parse(db.prepare("SELECT inventory FROM accounts WHERE id=?").get(id).inventory);
    for(const itemId of items){const free=bag.slots.indexOf(null);assert(free>=0,"bag space");bag.slots[free]={itemId,quantity:1};}
    saved.inventory=bag;saved.level=100;saved.experience=0;saved.mapId="ritual_village";saved.x=-10;saved.z=-55;saved.y=0;
    db.prepare("UPDATE accounts SET inventory=? WHERE id=?").run(JSON.stringify(bag),id);
    db.prepare("UPDATE characters SET snapshot=? WHERE id=?").run(JSON.stringify(saved),id);
    db.exec("COMMIT");
  }finally{db.close();}
}
const lookOf=look=>Object.fromEntries(String(look||"").split(";").filter(Boolean).map(p=>p.split("=")));
let a,b;
try{
  const sa=await account(),sb=await account();
  a=await join(sa,{characterSetup:{name:"ผู้ร่ายทดสอบ",build:{path:"seer",ancestry:"woodland"}}});
  const cat=a.catalog,pick=(test)=>Object.keys(cat).filter(test).sort((x,y)=>cat[x].level-cat[y].level)[0];
  const fieldOff=pick(id=>id.startsWith("arm_field_seer_")&&cat[id].kind==="offHand");
  const fieldEar=pick(id=>id.startsWith("arm_field_seer_")&&cat[id].kind==="earring");
  const fieldRing=pick(id=>id.startsWith("arm_field_seer_")&&cat[id].kind==="ring");
  const fieldChest=Object.keys(cat).filter(id=>id.startsWith("arm_field_seer_")&&cat[id].kind==="chest").sort((x,y)=>cat[y].level-cat[x].level)[0];
  const bossNeck=pick(id=>cat[id].sourceBoss&&cat[id].kind==="neck"&&!/\d$/.test(id));
  const bossEar=pick(id=>cat[id].sourceBoss&&cat[id].kind==="earring");
  for(const id of [fieldOff,fieldEar,fieldRing,fieldChest,bossNeck,bossEar])assert(id,"catalog piece");
  const prefix=a.me().characterId;await a.room.leave();a=null;await delay(500);
  seed(prefix,[fieldOff,fieldEar,fieldRing,fieldChest,bossNeck,bossEar]);
  a=await join(sa);
  b=await join(sb,{characterSetup:{name:"ผู้ชมทดสอบ",build:{path:"sentinel",ancestry:"woodland"}}},a.room.roomId);
  const seen=()=>b.room.state.players.get(a.room.sessionId)?.gearLook;
  const slotOf=(bag,id)=>bag.slots.findIndex(s=>s?.itemId===id);
  let bag=a.bag;
  for(const [position,id] of [["offHand",fieldOff],["leftEar",fieldEar],["rightRing",fieldRing],["chest",fieldChest],["neck",bossNeck],["rightEar",bossEar]])
    bag=await equip(a,position,slotOf(bag,id),id);
  const tier=level=>[1,10,25,45,65,85,95,100].filter(m=>m<=level).length;
  const want={offHand:`off_jar:${tier(cat[fieldOff].level)}`,leftEar:`acc_earrings_focus:${tier(cat[fieldEar].level)}`,rightRing:`acc_ring_spell:${tier(cat[fieldRing].level)}`,
    chest:`arm_cloth_chest:${tier(cat[fieldChest].level)}`,neck:`${cat[bossNeck].family}:${tier(cat[bossNeck].level)}`,rightEar:`${cat[bossEar].family}:${tier(cat[bossEar].level)}`};
  await until(()=>JSON.stringify(lookOf(a.me().gearLook))===JSON.stringify(Object.fromEntries(Object.entries(want).sort())),"own look "+a.me().gearLook);
  await until(()=>seen()===a.me().gearLook,"other player sees the same look");
  assert.doesNotMatch(a.me().gearLook,/arm_field_/);
  console.log("PASS field-kit and boss pieces worn and seen by another player:",a.me().gearLook);
  bag=await equip(a,"leftEar",null,fieldEar);
  await until(()=>!lookOf(seen()).leftEar && lookOf(seen()).rightEar,"removal reaches the other player");
  console.log("PASS one earring removed, the other ear kept");
  const look=a.me().gearLook;
  // Retry: a portal request right after a burst of equipment commands can be dropped by the server's message pacing.
  for(let tries=0;tries<6 && a.me().mapId!=="forbidden_forest";tries++){a.room.send("warp",{portalId:"village_to_forest"});await delay(1500);}
  await until(()=>a.me().mapId==="forbidden_forest","warp to forest from "+JSON.stringify([a.me().mapId,a.me().x,a.me().z,a.room.connection?.isOpen,b.room.state.players.get(a.room.sessionId)?.mapId,a.events.length,b.events.length,a.events.filter(e=>e.type==="command_rejected").slice(-3).map(e=>e.data.reason)]));
  assert.equal(a.me().gearLook,look);console.log("PASS look kept across the portal");
  await a.room.leave();a=null;await delay(600);
  a=await join(sa);
  assert.equal(a.me().gearLook,look);assert.equal(a.bag.equipment.offHand,fieldOff);assert.equal(a.bag.equipment.rightEar,bossEar);
  console.log("PASS look and equipment restored after reconnecting");
}finally{for(const c of [a,b])if(c)await c.room.leave().catch(()=>{});}
