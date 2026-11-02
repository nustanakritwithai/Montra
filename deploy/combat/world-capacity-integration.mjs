/** Run against a fresh, isolated world server. Exercises the same matchmaker used by the browser. */
import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !/^montra-monster-test-/.test(path.basename(dir??"")))throw Error("A local isolated monster test server is required");
const connected=new Set();
const options={worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1};
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
  const character={version:1,id,name:"นักทดสอบ",level:100,experience:0,pkKills:0,pkDeaths:0,mapId,x,y:0,z,hp:1500,updatedAt:new Date().toISOString()};
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

  const maps=[world.ritual_village,...Object.values(world).filter(m=>m.region)];
  assert.equal(maps.length,10);
  const travelers=await fillRoom(await Promise.all(maps.map(m=>seed(m.id,m.spawn.x,m.spawn.z))));
  await until(()=>travelers.every(r=>r.state.monsters.size===97),"all ten regions and their enemies");
  assert.equal(new Set([...travelers[0].state.players.values()].map(p=>p.mapId)).size,10);
  for(const room of travelers)room.send("summon",{});
  await until(()=>travelers.every(r=>r.state.summons.size===10),"ten summons across the occupied world");
  await closeAll();
  console.log("PASS ten occupied maps, ten summons and 98 monsters including the village ghost");

  const hunters=await fillRoom(await Promise.all(Array.from({length:10},(_,i)=>seed("forbidden_forest",-33+(i%3)*.25,-17+Math.floor(i/3)*.25))));
  const targetId="forest_west_1",monster=()=>hunters[0].state.monsters.get(targetId);
  assert.ok([...hunters[0].state.players.values()].every(p=>p.alive && p.mapId==="forbidden_forest" && Math.hypot(p.x-monster().x,p.z-monster().z)<20));
  hunters[0].send("attack",{targetId});
  await until(()=>hunters.every(r=>r.state.monsters.get(targetId)?.alive===false),"crowded kill",20000);
  const killed=Date.now();
  await until(()=>hunters.every(r=>r.state.monsters.get(targetId)?.alive===true),"crowded respawn",30000);
  console.log("PASS ten nearby hunters, death and respawn replicated after "+((Date.now()-killed)/1000).toFixed(1)+"s");
}finally{await closeAll();}
