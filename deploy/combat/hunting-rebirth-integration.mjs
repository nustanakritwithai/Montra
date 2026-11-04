import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL, dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-account-test-"))
  throw Error("Requires an isolated server and temporary character directory");
const sdk=new Client(url), sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(route,body,session){
  const response=await fetch(url+"/montra/account/"+route,{method:body?"POST":"GET",headers:{"content-type":"application/json",...(session?{authorization:"Bearer "+session}:{})},...(body?{body:JSON.stringify(body)}:{})});
  return {status:response.status,data:await response.json()};
}
async function until(read,label,timeout=7200){
  for(const stop=Date.now()+timeout;Date.now()<stop;){const value=read();if(value)return value;await sleep(60);}
  throw Error("Timeout: "+label);
}
async function enter(session,setup){
  const room=await sdk.create("my_room",{accountSession:session,characterSlot:1,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,
    terrainVersion:1,atlasReliefVersion:1,originalReliefVersion:1,monsterAutoAttackVersion:1,...(setup?{characterSetup:setup}:{})});
  const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
  const event=type=>events.find(e=>e.type===type)?.data;
  await until(()=>room.state?.players?.get(room.sessionId)?.persistent,"admission");
  room.send("get_inventory",{});const guide=await until(()=>event("gear_guides"),"guide");
  return {room,guide,event};
}
async function exitRoom(active){await active.room.leave();await sleep(300);}
const schools=[
  ["muay_boran","thasao","muay_book"],["phutthaisawan","atamat_core","sword_core_book"],
  ["blade","blade_heavy","blade_book"],["sentinel","bulwark","sentinel_book"],
  ["seer","seer_buffalo","occult_book"],["mender","mender_core_ward","occult_book"],
];
const db=new DatabaseSync(path.join(dir,"economy.sqlite"));
const snapshot=id=>JSON.parse(db.prepare("SELECT snapshot FROM characters WHERE id=?").get(id).snapshot);
function seed(id,fields){db.prepare("UPDATE characters SET snapshot=? WHERE id=?").run(JSON.stringify({...snapshot(id),...fields}),id);}
try{
  for(const [i,[fromPath,skill,command]] of schools.entries()){
    const credentials={username:"journey_"+randomBytes(5).toString("hex"),password:"hunting-rebirth-test-123"};
    let session;
    if(i===0)session=(await api("guest",{})).data.session;
    else{
      assert.equal((await api("register",credentials)).status,200);
      session=(await api("login",credentials)).data.session;
    }
    let active=await enter(session,{name:"นักเดินทาง",build:{path:fromPath,ancestry:"shrine"}});
    const {revision}=((await api("slots",null,session)).data.slots)[0];
    await exitRoom(active);
    seed(revision,{level:75,experience:0,mapId:"ritual_village",x:0,y:0,z:0});
    active=await enter(session);
    assert.equal(active.guide.learningLevel,75);assert.equal(active.guide.training.points,8);
    assert(active.guide.journey.practice.open);assert(active.guide.journey.bosses.some(b=>b.level===72));
    active.room.send(command,{action:fromPath==="phutthaisawan"?"upgrade":"core_upgrade",skillId:skill});
    const receipt=await until(()=>active.event("field_practice")??active.event("command_rejected"),"skill");
    assert.equal(receipt.skillId,skill,JSON.stringify(receipt));assert.equal(receipt.training.points,7);
    await exitRoom(active);
    if(i===0){
      seed(revision,{level:100,experience:0,mapId:"forbidden_forest",x:-33,y:0,z:-20});
      active=await enter(session);
      const target=await until(()=>active.room.state.monsters?.get("forest_west_1"),"normal prey");
      active.room.send("attack",{targetId:target.id});
      const kill=await until(()=>active.event("experience_gained"),"capped kill receipt",35000);
      assert.equal(kill.amount,0);assert.equal(kill.fieldPrey.id,target.id);await exitRoom(active);
    }
    seed(revision,{level:100,experience:0,mapId:"ritual_village",x:10,y:0,z:0});
    const path=schools[(i+1)%schools.length][0],request={slot:1,revision,path,fromPath,cycle:0,confirmed:true};
    assert.equal((await api("rebirth",request,session)).data.error,"rebirth_shrine_required");
    seed(revision,{x:0,z:0});active=await enter(session);
    assert.equal(active.guide.training.points,11);assert.equal(active.guide.journey.practice.level,100);
    assert.deepEqual(active.guide.journey.bosses.map(b=>b.camp.id).sort(),["atlas_rift_warden","boss_asura_peak"]);
    assert.equal((await api("rebirth",request,session)).data.error,"character_online");
    await exitRoom(active);
    assert.equal((await api("rebirth",{...request,confirmed:false},session)).status,400);
    assert.equal(snapshot(revision).level,100);
    const gold=()=>db.prepare("SELECT gold FROM accounts WHERE id=?").get(revision).gold, before=gold();
    assert.deepEqual(await api("rebirth",request,session),{status:200,data:{level:1,path,cycle:1}});
    assert.equal((await api("rebirth",request,session)).data.error,"rebirth_changed");assert.equal(gold(),before);
    const saved=snapshot(revision);assert.equal(saved.rebirth.highest[fromPath],100);assert.equal(saved.rebirth.mastery[fromPath],1);
    active=await enter(session);assert.equal(active.guide.level,1);assert.equal(active.guide.cycle,1);assert.equal(active.guide.path,path);
    assert.equal(active.guide.learningLevel,1);await exitRoom(active);
    if(i===0){
      seed(revision,{level:100,experience:0,mapId:"ritual_village",x:0,y:0,z:0});
      assert.equal((await api("rebirth",{...request,fromPath:path,path:fromPath,cycle:1},session)).status,200);
      active=await enter(session);assert.equal(active.guide.level,1);assert.equal(active.guide.learningLevel,100);
      assert.equal(snapshot(revision).muayBook.coreRanks[skill],1);await exitRoom(active);
      seed(revision,{level:100,experience:0,mapId:"ritual_village",x:0,y:0,z:0});
      assert.equal((await api("rebirth",{...request,path:fromPath,cycle:2},session)).status,200);
      assert.equal(snapshot(revision).rebirth.count,3);
    }
    console.log("PASS Lv.75/100 and rebirth: "+fromPath+" -> "+path);
  }
}finally{db.close();}
