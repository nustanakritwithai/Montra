/** Run against a fresh, isolated world server. Exercises the same matchmaker used by the browser. */
import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !/^montra-monster-test-/.test(path.basename(dir??"")))throw Error("A local isolated monster test server is required");
const connected=new Set();
const options={worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,atlasReliefVersion:1,originalReliefVersion:1};
const token=()=>"mt1_"+randomBytes(32).toString("hex");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,label,ms=8000){
  const end=Date.now()+ms;
  while(Date.now()<end){if(check())return;await sleep(40);}
  throw Error("Timed out waiting for "+label);
}
async function join(guestToken,roomId){
  const client=new Client(url),opts={...options,guestToken};
  const room=roomId?await client.joinById(roomId,opts):await client.joinOrCreate("my_room",opts);
  connected.add(room);room.onMessage("*",()=>{});
  await until(()=>room.state?.players?.has(room.sessionId),"initial character");
  return room;
}
async function leave(room){await room.leave();connected.delete(room);}
async function closeAll(){await Promise.all([...connected].map(leave));}
// Use unique, offline legacy characters. The SQLite server imports each snapshot on its first join.
async function seed(mapId,x,z){
  const guestToken=token(),id=createHash("sha256").update(guestToken).digest("hex");
  const character={version:1,id,name:"นักทดสอบ",level:100,experience:0,pkKills:0,pkDeaths:0,mapId,x,y:0,z,hp:1500,build:{path:"seer",ancestry:"woodland"},updatedAt:new Date().toISOString()};
  await writeFile(path.join(dir,id+".json"),JSON.stringify(character),{flag:"wx"});
  return guestToken;
}
async function fillRoom(tokens){
  const first=await join(tokens[0]);
  const joins=await Promise.allSettled(tokens.slice(1).map(t=>join(t,first.roomId)));
  const group=[first];
  for(const result of joins){if(result.status==="rejected")throw result.reason;group.push(result.value);}
  await until(()=>group.every(r=>r.state.players.size===10),"ten replicated players on every client");
  return group;
}
try{
  const tokens=Array.from({length:10},token),group=await fillRoom(tokens);
  const world=JSON.parse(group[0].state.worldDefinition).maps,roomId=group[0].roomId;
  const starts=[...group[0].state.players.values()];
  assert.equal(new Set(starts.map(p=>p.x+","+p.z)).size,10);
  assert.ok(starts.every(p=>Math.hypot(p.x,p.z)<=6 && p.mapId==="ritual_village"));

  const overflow=await join(token());
  assert.notEqual(overflow.roomId,roomId);
  await assert.rejects(new Client(url).joinById(roomId,options),/is locked/);
  const acknowledgements=new Set();
  for(const room of group)room.onMessage("chat_message",m=>{if(m.text==="world-capacity" && m.senderId===group[9].sessionId)acknowledgements.add(room.sessionId);});
  group[9].send("chat",{channel:"world",text:"world-capacity"});
  await until(()=>acknowledgements.size===10,"tenth player's chat on ten clients");
  group.forEach(r=>r.send("move",{x:1,z:2}));
  await until(()=>group.every(r=>[...r.state.players.values()].every(p=>Math.hypot(p.x-1,p.z-2)<.25)),"ten moving players synchronized");
  const last=group[9];await leave(last);await leave(overflow);
  await until(()=>group[0].state.players.size===9,"vacated seat");
  const back=await join(tokens[9]);
  assert.equal(back.roomId,roomId);
  assert.ok(Math.hypot(back.state.players.get(back.sessionId).x-1,back.state.players.get(back.sessionId).z-2)<.25);
  await closeAll();
  console.log("PASS ten concurrent arrivals, shared movement/chat, eleventh-player matchmaking and persistent return");

  const maps=[world.ritual_village,...Object.values(world).filter(m=>m.region && m.camps.length)];
  assert.equal(maps.length,10);
  const travelers=await fillRoom(await Promise.all(maps.map(m=>seed(m.id,m.spawn.x,m.spawn.z))));
  await until(()=>travelers.every(r=>r.state.monsters.size===145),"all ten regions and their enemies");
  assert.equal(new Set([...travelers[0].state.players.values()].map(p=>p.mapId)).size,10);
  const himmapanIds = [
    "himmapan_matcha_naga", "himmapan_stone_yaksha", "himmapan_kochasri", "himmapan_hemaraj",
    "himmapan_durong_paksin", "himmapan_kunchon_wari", "himmapan_karavek",
    "himmapan_phayak_nathi", "himmapan_kraisorn", "himmapan_kilen",
    "himmapan_karin_paksa", "himmapan_tinna_siha", "himmapan_hera", "himmapan_thanthi_ma",
  ];
  for (const {state} of travelers) {
    for (const id of himmapanIds) assert.ok(state.monsters.get(id)?.specialRange>0,id);
    for (const id of ["atlas_drowned_marsh_3_2","atlas_asura_peak_4_2","atlas_bamboo_frontier_4_2",
      "atlas_hex_ridge_3_2","atlas_bamboo_frontier_2_2","atlas_naga_cavern_4_2","atlas_moon_cemetery_3_2"]) {
      assert.ok(!state.monsters.has(id),id+" was replaced");
    }
    assert.equal(state.monsters.get("himmapan_matcha_naga")?.specialRange,4);
    assert.ok(Math.abs(state.monsters.get("himmapan_stone_yaksha")?.specialRange-2.8)<1e-6);
    assert.ok(Math.abs(state.monsters.get("himmapan_kochasri")?.specialHalfAngle-Math.PI/4)<1e-6);
    assert.ok(Math.abs(state.monsters.get("himmapan_kunchon_wari")?.specialInnerRange-1.2)<1e-6);
  }
  for(const room of travelers)room.send("summon",{});
  await until(()=>travelers.every(r=>r.state.summons.size===10),"ten summons across the occupied world");
  await closeAll();
  console.log("PASS ten occupied maps, ten summons and 145 monsters including Titan and fourteen Himmapan spawns");

  const tigerId="himmapan_phayak_nathi";
  const marsh=await join(await seed("drowned_marsh",-73,-56.4));
  const tiger=()=>marsh.state.monsters.get(tigerId);
  const strikes=[];
  marsh.onMessage("monster_hit",event=>{if(event.attackerId===tigerId)strikes.push(event);});
  await until(()=>tiger()?.specialStage===1,"tiger ripple");
  assert.equal(tiger().aiState,"windup");
  assert.equal(strikes.length,0);
  await until(()=>tiger()?.specialStage===2,"tiger landing warning");
  const landing={x:tiger().specialOriginX,z:tiger().specialOriginZ};
  assert.equal(tiger().aiState,"windup");
  assert.ok(Math.hypot(landing.x-tiger().x,landing.z-tiger().z)>2);
  assert.equal(strikes.length,0);
  await until(()=>tiger()?.aiState==="special_recovery"&&strikes.length>0,"tiger landing and damage");
  assert.ok(Math.hypot(landing.x-tiger().x,landing.z-tiger().z)<.01);
  assert.equal(strikes.length,1);
  assert.equal(strikes[0].targetId,marsh.sessionId);
  await leave(marsh);
  console.log("PASS networked tiger ripple, landing warning, leap and damage");

  const bamboo=await join(await seed("bamboo_frontier",-63,-25.6));
  const kilen=()=>bamboo.state.monsters.get("himmapan_kilen");
  await until(()=>kilen()?.specialStage===1 && kilen().specialMarks?.length===9,"three Kilen seals");
  const marks=[...kilen().specialMarks];
  assert.equal(new Set([marks[0]+","+marks[1],marks[3]+","+marks[4],marks[6]+","+marks[7]]).size,3);
  for(let stage=1;stage<=3;stage++){
    await until(()=>kilen()?.specialStage===stage,"Kilen seal "+stage);
    const m=kilen(),offset=(stage-1)*3;
    for(const [actual,expected] of [[m.specialOriginX,marks[offset]],[m.specialOriginZ,marks[offset+1]],[m.specialRange,marks[offset+2]]]){
      assert.ok(Math.abs(actual-expected)<.001);
    }
    assert.deepEqual([...m.specialMarks],marks);
  }
  await until(()=>kilen()?.specialStage===0 && kilen().specialMarks?.length===0,"Kilen seal cleanup");
  await leave(bamboo);
  console.log("PASS all Kilen seals replicate up front and resolve in order");

  const hunters=await fillRoom(await Promise.all(Array.from({length:10},(_,i)=>seed("forbidden_forest",-33+(i%3)*.25,-17+Math.floor(i/3)*.25))));
  const targetId="forest_west_1",monster=()=>hunters[0].state.monsters.get(targetId);
  assert.ok([...hunters[0].state.players.values()].every(p=>p.alive && p.mapId==="forbidden_forest" && Math.hypot(p.x-monster().x,p.z-monster().z)<20));
  hunters[0].send("attack",{targetId});
  await until(()=>hunters.every(r=>r.state.monsters.get(targetId)?.alive===false),"crowded kill",20000);
  const killed=Date.now();
  await until(()=>hunters.every(r=>r.state.monsters.get(targetId)?.alive===true),"crowded respawn",30000);
  console.log("PASS ten nearby hunters, death and respawn replicated after "+((Date.now()-killed)/1000).toFixed(1)+"s");
}finally{await closeAll();}
