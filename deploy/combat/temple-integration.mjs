import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !dir || !/^montra-(temple|monster)-test-/.test(path.basename(dir)))throw Error("Use an isolated local SQLite server");
const temple="bound_temple",forest="forbidden_forest",clients=[];
const token=i=>"mt1_"+("1"+i).repeat(32);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const savedPosition=path.join(dir,"temple-checkpoint.json");
async function until(fn,label,timeout=9000){
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=fn();if(value)return value;await sleep(45);}
  throw Error("timeout: "+label);
}
async function seed(i,mapId,x,z){
  const id=createHash("sha256").update(token(i)).digest("hex"),slots=Array(12).fill(null);
  slots[0]={itemId:"health_potion",quantity:2};
  for(const [n,itemId] of ["ritual_dagger","arcane_sword","spirit_staff"].entries())slots[n+1]={itemId,quantity:1};
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"นักเดินทาง",level:8,experience:0,pkKills:0,pkDeaths:0,x,y:0,z,hp:352,mapId,inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
}
async function join(i,roomId,capable=true){
  const sdk=new Client(url),options={guestToken:token(i),worldVersion:1,...(capable?{templeVersion:1}:{})};
  const r=roomId?await sdk.joinById(roomId,options):await sdk.create("my_room",options);
  const events=[];r.onMessage("*",(type,data)=>events.push({type,data}));
  const client={r,events,me:()=>r.state?.players?.get(r.sessionId)};clients.push(client);
  await until(client.me,"join");return client;
}
async function leave(c){await c.r.leave();clients.splice(clients.indexOf(c),1);await sleep(220);}
async function move(c,x,z){
  c.r.send("move",{x,z});await until(()=>Math.hypot(c.me().x-x,c.me().z-z)<.25,"walk to "+x+","+z,18000);
}
async function rejected(c,verb,payload,reason){
  c.events.length=0;c.r.send(verb,payload);
  await until(()=>c.events.find(e=>e.type==="command_rejected"&&e.data.reason===reason),reason);
}
try{
  if(process.env.MONTRA_TEMPLE_STAGE==="read"){
    await assert.rejects(join(1,null,false),/world_client_update_required/);
    const a=await join(1),expected=JSON.parse(await readFile(savedPosition,"utf8"));
    assert.equal(a.me().mapId,temple);assert.equal(a.me().experience,expected.experience);
    assert.ok(Math.hypot(a.me().x-expected.x,a.me().z-expected.z)<.02);
    a.r.send("get_inventory",{});const bag=await until(()=>a.events.find(e=>e.type==="inventory_state")?.data,"bag");
    assert.equal(bag.slots[0].quantity,2);assert.equal(bag.equippedWeaponSlot,1);
    await move(a,0,28);await sleep(5200);a.r.send("warp",{portalId:"temple_to_forest"});
    await until(()=>a.me().mapId===forest,"return gate");assert.ok(Math.abs(a.me().x+48)<.01);
    console.log("PASS: old client cannot load temple save; restart preserves position, XP and bag; forest return works");
  }else{
    await seed(1,forest,-48,-84);await seed(2,temple,-3,-9);await seed(3,temple,-3,-16);await seed(4,forest,-28,-55);
    const old=await join(1,null,false);await rejected(old,"warp",{portalId:"forest_to_temple"},"world_client_update_required");assert.equal(old.me().mapId,forest);await leave(old);
    const a=await join(1),b=await join(2,a.r.roomId),c=await join(3,a.r.roomId),other=await join(4,a.r.roomId);
    await until(()=>a.r.state.players.size===4 && a.r.state.monsters.size===33,"room ready");
    const def=JSON.parse(a.r.state.worldDefinition).maps[temple];assert.equal(def.camps.length,4);
    a.r.send("warp",{portalId:"forest_to_temple"});await until(()=>a.me().mapId===temple,"enter temple");
    await rejected(a,"attack",{targetId:"temple_forecourt_1"},"target_unavailable");
    await rejected(other,"attack",{targetId:"temple_forecourt_1"},"target_unavailable");
    const hp=c.me().hp;
    await rejected(b,"shoot",{targetId:c.r.sessionId},"shot_blocked");
    b.r.send("dash",{dx:0,dz:-1});await sleep(650);assert.ok(b.me().z>=-10.81 && b.me().z<-9);
    b.r.send("move",{x:-3,z:-16});await sleep(900);assert.ok(b.me().z>=-10.81);assert.equal(c.me().hp,hp);
    await move(b,4.5,-9);await move(b,4.5,-16);
    b.r.send("shoot",{targetId:c.r.sessionId});await until(()=>c.me().hp<hp,"shot after flanking");
    await move(a,0,5);a.r.send("attack",{targetId:"temple_forecourt_1"});
    const reward=await until(()=>a.events.find(e=>e.type==="experience_gained")?.data,"temple EXP",30000);
    assert.equal(reward.amount,800);await until(()=>a.me().experience===800,"XP patch");assert.equal(other.me().experience,0);
    await writeFile(savedPosition,JSON.stringify({x:a.me().x,z:a.me().z,experience:a.me().experience}));
    console.log("PASS: four clients, real gate, protected entrance, physical wall/dash/line of sight, flank, kill and map-local EXP");
  }
}finally{for(const {r} of clients.reverse())await r.leave().catch(()=>{});}
