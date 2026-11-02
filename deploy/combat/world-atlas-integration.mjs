import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !dir || !/^montra-monster-test-/.test(path.basename(dir)))throw Error("Requires isolated local SQLite server");
const routes=[
  ["forbidden_forest",48,-84,"drowned_marsh"],["bound_temple",32,-65,"moon_cemetery"],
  ["drowned_marsh",0,-58,"moon_cemetery"],["moon_cemetery",0,-58,"moon_pass"],["moon_pass",0,-58,"hex_ridge"],
  ["hex_ridge",0,-58,"naga_cavern"],["naga_cavern",0,-58,"river_watch"],["river_watch",0,-58,"fallen_city"],
  ["ritual_village",4,-16,"mantra_capital"],["mantra_capital",-34,-14,"bamboo_frontier"],["bamboo_frontier",0,-58,"moon_cemetery"],
  ["mantra_capital",0,-58,"moon_pass"],["mantra_capital",34,-14,"lotus_basin"],["lotus_basin",0,-58,"river_watch"],
  ["fallen_city",0,-58,"asura_peak"],["asura_peak",0,-58,"spirit_rift"],
];
const warden="atlas_rift_warden",open=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const token=i=>"mt1_"+createHash("sha256").update("world-atlas-fixture-"+i).digest("hex");
async function until(check,label,ms=9000){
  const end=Date.now()+ms;
  while(Date.now()<end){const value=check();if(value)return value;await sleep(45);}
  throw Error("timeout "+label);
}
async function seed(i,mapId,x,z,level=100){
  const id=createHash("sha256").update(token(i)).digest("hex"),slots=Array(12).fill(null);
  slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"ritual_dagger",quantity:1};
  const save={version:1,id,name:"นักสำรวจ",level,experience:0,pkKills:0,pkDeaths:0,x,y:0,z,hp:1500,mapId,
    inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()};
  await writeFile(path.join(dir,id+".json"),JSON.stringify(save),{flag:"wx"});
}
async function join(i,roomId,atlasVersion=1,provinceVersion=1){
  const sdk=new Client(url),opts={guestToken:token(i),worldVersion:1,templeVersion:1,atlasVersion,provinceVersion};
  const r=roomId?await sdk.joinById(roomId,opts):await sdk.create("my_room",opts);
  open.add(r);const events=[];r.onMessage("*",(type,data)=>events.push({type,data}));
  const c={r,events,me:()=>r.state.players?.get(r.sessionId)};
  await until(c.me,"join");return c;
}
async function leave(c){await c.r.leave();open.delete(c.r);await sleep(160);}
async function bag(c){c.events.length=0;c.r.send("get_inventory",{});return until(()=>c.events.find(e=>e.type==="inventory_state")?.data,"inventory");}
async function reject(c,verb,payload,reason){c.events.length=0;c.r.send(verb,payload);await until(()=>c.events.some(e=>e.type==="command_rejected"&&e.data.reason===reason),reason);}
async function warp(c,to){
  const from=c.me().mapId,gate=JSON.parse(c.r.state.worldDefinition).maps[from].portals.find(p=>p.targetMapId===to);
  c.r.send("warp",{portalId:gate.id});await until(()=>c.me().mapId===to,from+" to "+to);
  assert.ok(Math.hypot(c.me().x-gate.targetSpawn.x,c.me().z-gate.targetSpawn.z)<.04);
  if(JSON.parse(c.r.state.worldDefinition).maps[to].camps?.length)await until(()=>Array.from(c.r.state.monsters.values()).some(m=>m.mapId===to),"destination enemies");
}
async function walk(c,x,z){c.r.send("move",{x,z});await until(()=>Math.hypot(c.me().x-x,c.me().z-z)<.28,"walk",15000);}
const read=process.env.MONTRA_ATLAS_STAGE==="read";
try{
  for(const [i,[from,x,z,to]] of routes.entries()){
    if(!read)await seed(i,from,x,z);
    if(i===0){
      if(read)await assert.rejects(join(i,undefined,0),/world_client_update_required/);
      else{const old=await join(i,undefined,0);await reject(old,"warp",{portalId:from+"_to_"+to},"world_client_update_required");await leave(old);}
    }
    if(from==="ritual_village" && to==="mantra_capital"){
      if(read)await assert.rejects(join(i,undefined,1,0),/world_client_update_required/);
      else{
        const old=await join(i,undefined,1,0);
        await reject(old,"warp",{portalId:from+"_to_"+to},"world_client_update_required");await leave(old);
      }
    }
    const c=await join(i);assert.equal(c.me().mapId,read?to:from);
    if(read)assert.equal((await bag(c)).slots[0].quantity,2);
    if(["naga_cavern","moon_pass","river_watch"].includes(c.me().mapId))await reject(c,"fly",{},"flight_forbidden");
    await warp(c,read?from:to);await leave(c);
  }
  if(!read){
    await seed(20,"drowned_marsh",0,-1);const m=await join(20);
    m.r.send("dash",{dx:0,dz:-1});await sleep(750);assert.ok(m.me().z>=-1.61&&m.me().z<0);
    await walk(m,-22,-1);await walk(m,-22,-9);await leave(m);
    const group=[];
    for(let i=0;i<4;i++){
      await seed(30+i,"spirit_rift",28+i*.15,-49,i===1?99:100);
      group.push(await join(30+i,group[0]?.r.roomId));
    }
    const leader=group[0];
    for(const ally of group.slice(1)){
      leader.r.send("party_invite",{targetId:ally.r.sessionId});
      const invitation=await until(()=>ally.events.find(e=>e.type==="party_invitation")?.data,"party invite");
      ally.r.send("party_accept",{inviteId:invitation.inviteId});
      await until(()=>ally.events.some(e=>e.type==="party_state"&&e.data.members?.length>1),"party accept");
    }
    for(const ally of group)ally.r.send("attack",{targetId:warden});
    for(const [i,ally] of group.entries()){
      const win=await until(()=>ally.events.find(e=>e.type==="experience_gained"&&e.data.riftVictory)?.data,"warden reward",60000);
      assert.equal(win.elitePotion,"granted");assert.equal(win.amount>0,i===1);
      assert.equal((await bag(ally)).slots[0].quantity,3);
    }
    for(const ally of group)await leave(ally);
  }else{
    for(let i=0;i<4;i++){const c=await join(30+i);assert.equal(c.me().mapId,"spirit_rift");assert.equal((await bag(c)).slots[0].quantity,3);await leave(c);}
  }
  console.log("PASS atlas",read?"return gates and boss loot after restart":"outward gates, compatibility, bridge, cave and four-player warden");
}finally{await Promise.allSettled([...open].map(r=>r.leave()));}
