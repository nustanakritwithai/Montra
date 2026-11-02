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
    x:i===2?0:12,y:0,z:i===2?26:-36,hp:416,mapId:"moon_pass",build:{path:"seer",ancestry:"woodland"},
    occultBook:{learned:{seer:["seer_mark","seer_curse"],mender:[]},loadouts:{seer:["seer_curse",null,null,null],mender:[null,null,null,null]},training:{seer:0,mender:0},cooldowns:{}},
    inventory:{version:1,slots,equippedWeaponSlot:1},updatedAt:new Date().toISOString()}),{flag:"wx"});
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
async function walk(c,x,z){
  c.r.send("move",{x,z});
  try{await until(()=>Math.hypot(c.me().x-x,c.me().z-z)<.35,"walk "+x+","+z,24000);}
  catch(error){const p=c.me();throw Error(String(error)+" at "+JSON.stringify({x:p.x,y:p.y,z:p.z,action:p.combatState,rejections:c.events.filter(e=>e.type==="command_rejected").slice(-3)}));}
}
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
    for(let i=0;i<4;i++){allies[i]=await transfer(allies[i],"territory_join");assert.equal(allies[i].r.roomId,attacker.r.roomId);}
    const denied=await send(allies[4],"territory_join",{},"territory_error");assert.equal(denied.reason,"war_side_full");
    await send(attacker,"warp",{},"territory_error",s=>s.reason==="war_exit");
    await Promise.all([walk(attacker,5,19),walk(allies[0],6,19)]);
    await send(attacker,"occult_skill",{skillId:"seer_curse",targetId:allies[0].r.sessionId},"command_rejected",s=>s.reason==="target_unavailable");
    async function travel(c,points){for(const [x,z] of points)await walk(c,x,z);}
    async function stair(c,structureId,direction){
      c.r.send("climb",{structureId,direction});
      await until(()=>c.me().y===(direction==="up"?4:0) && c.me().combatState!=="climbing","stair "+direction);
    }
    await Promise.all([travel(attacker,[[0,10],[0,-4],[0,-18],[12,-21]]),
      travel(defender,[[27,-56],[27,-36],[16,-36],[12,-31]])]);
    const shot=(c,victim)=>send(c,"blessed_rice",{targetId:victim.r.sessionId},"pvp_hit",e=>e.attackerId===c.r.sessionId&&e.source==="ranged");
    await send(attacker,"blessed_rice",{targetId:defender.r.sessionId},"command_rejected",e=>e.reason==="shot_blocked");
    await send(defender,"territory_gate",{},"territory_state",s=>s.local.gateClosed===false);
    await sleep(1100);
    await send(defender,"territory_gate",{},"territory_state",s=>s.local.gateClosed===true);
    await walk(defender,17,-31);await stair(defender,"wall-stair-1","up");
    await walk(defender,12,-28);assert.equal(defender.me().y,4);
    await shot(defender,attacker);await shot(attacker,defender);
    await walk(attacker,12,-11.5);await shot(defender,attacker);
    await send(attacker,"blessed_rice",{targetId:defender.r.sessionId},"command_rejected",e=>e.reason==="shot_out_of_range");
    await travel(defender,[[2,-28],[2,-44],[22,-44],[22,-28],[2,-28],[2,-37]]);
    await stair(defender,"wall-stair-0","down");assert.ok(Math.abs(defender.me().x-8)<.1);
    await walk(defender,7,-32);
    await walk(attacker,12,-24.5);
    attacker.r.send("move",{x:12,z:-34});await sleep(2000);
    assert.ok(attacker.me().z>-26.7,"closed gate blocks ground runner");
    for(let hp=105;hp>=0;hp-=15){
      attacker.events.length=0;attacker.r.send("territory_gate",{});
      try{await event(attacker,"territory_state",s=>s.local.gateHp===hp);}
      catch(error){throw Error("gate "+hp+" at "+JSON.stringify({x:attacker.me().x,z:attacker.me().z,events:attacker.events.filter(e=>e.type.startsWith("territory")).slice(-3)})+" "+error);}
      await sleep(1100);
    }
    await walk(attacker,12,-36);
    await event(attacker,"territory_state",s=>s.local?.progress>0);
    const win=await event(attacker,"territory_state",s=>s.owners.moon_pass==="Moon Banner",75000);
    assert.equal(win.local.phase,"protected");assert.equal(win.owners.river_watch,null);
    const publicState=await event(outsider,"territory_state",s=>s.owners.moon_pass==="Moon Banner");
    assert.equal(publicState.local.government,undefined);assert.equal(win.local.government,undefined);
    const memberView=await event(allies[4],"territory_state",s=>!!s.local?.government);
    const estate=memberView.local.government;assert.equal(estate.market,1);assert.equal(estate.officer,false);
    const order={site:"moon_pass",revision:estate.revision,action:"collect"};
    await send(allies[4],"territory_govern",order,"territory_error",s=>s.reason==="war_government_role");
    await send(outsider,"territory_govern",order,"territory_error",s=>s.reason==="war_not_owner");
    await send(attacker,"territory_govern",order,"territory_error",s=>s.reason==="war_government_location");
    console.log("PASS common battlefield, side limits, gate defense and breach, shots uphill and downhill, full wall lap, second staircase and capture");
  }
}finally{await Promise.allSettled([...open].map(r=>r.leave()));}
