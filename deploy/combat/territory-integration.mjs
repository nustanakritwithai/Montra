import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url??"") || !/^montra-(guild|monster)-test-/.test(path.basename(dir??"")))throw Error("Requires isolated war test server");
const sdk=new Client(url),open=new Set(),sleep=ms=>new Promise(r=>setTimeout(r,ms));
const token=i=>"mt1_"+createHash("sha256").update("war-test-"+i).digest("hex");
async function until(fn,label,ms=10000){const end=Date.now()+ms;while(Date.now()<end){const v=fn();if(v)return v;await sleep(50);}throw Error("timed out: "+label);}
async function seed(i){
  const id=createHash("sha256").update(token(i)).digest("hex"),slots=Array(12).fill(null);
  slots[0]={itemId:"health_potion",quantity:2};slots[1]={itemId:"ritual_dagger",quantity:1};
  await writeFile(path.join(dir,id+".json"),JSON.stringify({version:1,id,name:"War"+i,level:12,experience:0,pkKills:0,pkDeaths:0,
    x:i===2?0:12,y:0,z:i===2?26:-36,hp:416,mapId:"moon_pass",inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
}
async function join(i,roomId,ticket){
  const opts={guestToken:token(i),warTicket:ticket,worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,warVersion:1};
  const r=roomId?await sdk.joinById(roomId,opts):await sdk.create("my_room",opts);open.add(r);
  const events=[];r.onMessage("*",(type,data)=>events.push({type,data}));
  const me=()=>r.state.players?.get(r.sessionId);await until(me,"spawn");
  return {r,events,me,i};
}
async function event(c,type,pred=()=>true,ms=10000){
  return (await until(()=>c.events.find(e=>e.type===type && pred(e.data)),type,ms)).data;
}
async function send(c,type,data,want,pred){c.events.length=0;c.r.send(type,data);return event(c,want,pred);}
async function leave(c){await c.r.leave();open.delete(c.r);await sleep(200);}
async function transfer(c,verb){
  const t=await send(c,verb,{},"territory_transfer");await leave(c);return join(c.i,t.roomId,t.ticket);
}
async function walk(c,x,z){c.r.send("move",{x,z});await until(()=>Math.hypot(c.me().x-x,c.me().z-z)<.35,"walk "+x+","+z,18000);}
try{
  if(process.env.MONTRA_WAR_STAGE==="read"){
    const c=await join(1);const s=await event(c,"territory_state");
    assert.equal(s.owners.moon_pass,"Moon Banner");assert.equal(s.local.phase,"protected");
    assert.equal(s.local.seconds,0);assert.ok(!JSON.stringify(s).match(/ended|nextAttack|unlock|cooldown/i));
    console.log("PASS restart preserves public owner and private cooldown");
  }else{
    for(let i=1;i<=8;i++)await seed(i);
    const a=await join(1),b=await join(2),outsider=await join(3),allies=[];
    await send(a,"guild_create",{name:"Moon Banner"},"guild_state",s=>s?.name==="Moon Banner");
    await send(b,"guild_create",{name:"River Banner"},"guild_state",s=>s?.name==="River Banner");
    for(let i=4;i<=8;i++){
      const m=await join(i,a.r.roomId);a.r.send("guild_invite",{targetId:m.r.sessionId});
      const invite=await event(m,"guild_invitation");await send(m,"guild_accept",{inviteId:invite.inviteId},"guild_state",s=>s?.name==="Moon Banner");
      allies.push(m);await sleep(550);
    }
    await send(b,"territory_start",{},"territory_error",s=>s.reason==="war_flag");
    const attacker=await transfer(a,"territory_start");
    await assert.rejects(join(9,attacker.r.roomId,"forged"),/war_admission/);
    const defender=await transfer(b,"territory_join");assert.equal(attacker.r.roomId,defender.r.roomId);
    assert.equal(attacker.me().z,26);assert.equal(defender.me().z,-58);
    await send(attacker,"party_invite",{targetId:defender.r.sessionId},"party_error",s=>s.reason==="party_invalid_target");
    const joinStatus=await event(outsider,"territory_state",s=>s.local?.phase==="battle");assert.equal(joinStatus.local.canJoin,false);
    await send(outsider,"territory_join",{},"territory_error",s=>s.reason==="war_guild");
    for(const m of allies.slice(0,4))assert.equal((await transfer(m,"territory_join")).r.roomId,attacker.r.roomId);
    const denied=await send(allies[4],"territory_join",{},"territory_error");assert.equal(denied.reason,"war_side_full");
    await send(attacker,"warp",{},"territory_error",s=>s.reason==="war_exit");
    for(const [x,z] of [[0,10],[0,-24],[6,-35],[12,-36]])await walk(attacker,x,z);
    await event(attacker,"territory_state",s=>s.local?.progress>0);
    const win=await event(attacker,"territory_state",s=>s.owners.moon_pass==="Moon Banner",75000);
    assert.equal(win.local.phase,"protected");assert.equal(win.owners.river_watch,null);
    await event(outsider,"territory_state",s=>s.owners.moon_pass==="Moon Banner");
    console.log("PASS separate world rooms converge in one battlefield, side seats, movement, capture and global owner");
  }
}finally{await Promise.allSettled([...open].map(r=>r.leave()));}
