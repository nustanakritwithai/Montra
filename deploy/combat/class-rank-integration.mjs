import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";
import {DatabaseSync} from "node:sqlite";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-class-rank-test-"))
  throw Error("Requires isolated localhost server and disposable class-rank test directory");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,label){const end=Date.now()+12000;while(Date.now()<end){const value=fn();if(value)return value;await sleep(40);}throw Error("timeout: "+label);}
const sdk=new Client(url),rooms=[];
await mkdir(dir,{recursive:true});
async function savedCharacter(id){
  if(process.env.MONTRA_ECONOMY_ENABLED!=="1")return JSON.parse(await readFile(path.join(dir,id+".json"),"utf8"));
  const db=new DatabaseSync(path.join(dir,"economy.sqlite"),{readOnly:true});
  try {const row=db.prepare("SELECT snapshot FROM characters WHERE id=?").get(id);assert.ok(row);return JSON.parse(row.snapshot);}
  finally {db.close();}
}
function savedGold(id){
  if(process.env.MONTRA_ECONOMY_ENABLED!=="1")return null;
  const db=new DatabaseSync(path.join(dir,"economy.sqlite"),{readOnly:true});
  try {const row=db.prepare("SELECT gold FROM accounts WHERE id=?").get(id);assert.ok(row);return row.gold;}
  finally {db.close();}
}
const muaySlots=["step","punch","guard","counter"];
const muayLoadouts={chaiya:[...muaySlots],korat:[...muaySlots],lopburi:[...muaySlots],thasao:[...muaySlots]};
const mastery={chaiya:{technique:0,sequences:0},korat:{technique:0,sequences:0},lopburi:{technique:0,sequences:0},thasao:{technique:0,sequences:0}};
const occult=()=>({learned:{seer:[],mender:[]},loadouts:{seer:[null,null,null,null],mender:[null,null,null,null]},training:{seer:0,mender:0},cooldowns:{},mastery:{seer:{rice:0,talisman:0,spirit:0,curse:0},mender:{healing:0,protection:0,cleanse:0,spirit:0}}});
const specs=[
  {path:"blade",bookKey:"bladeBook",skill:"hidden_edge",book:{learned:["cloak","hidden_edge"],slots:["cloak","hidden_edge",null,null],practice:{ambush:3,mark:0,evade:0,combo:0},cooldowns:{}},command:"blade_book",get:"blade_book_get",state:"blade_book_state",changed:"blade_book_changed"},
  {path:"sentinel",bookKey:"sentinelBook",skill:"bash",book:{learned:["bash"],slots:["bash",null,null,null],practice:{guard:0,stun:3,assist:0},cooldowns:{}},command:"sentinel_book",get:"sentinel_book_get",state:"sentinel_book_state",changed:"sentinel_book_changed"},
  {path:"phutthaisawan",bookKey:"swordTree",skill:"footwork",book:{school:"phutthaisawan",learned:["footwork"],cooldowns:{},training:{strikes:3,blocks:0,finishes:0},loadouts:{phutthaisawan:["footwork",null,null],sritrairat:[null,null,null],atamat:[null,null,null],chumphon:[null,null,null]}},command:"sword_tree_upgrade",changed:"sword_tree_changed"},
  {path:"muay_boran",bookKey:"muayBook",skill:"chaiya_elbow",book:{learned:["chaiya_elbow"],training:{strikes:5,blocks:0},mastery,school:"chaiya",slots:[...muaySlots],loadouts:muayLoadouts},command:"muay_book",changed:"muay_book_changed"},
  {path:"seer",bookKey:"occultBook",skill:"seer_mark",book:(()=>{const b=occult();b.learned.seer=["seer_mark"];b.loadouts.seer[0]="seer_mark";b.training.seer=3;return b;})(),command:"occult_book",get:"occult_book_get",state:"occult_book_state",changed:"occult_book_changed"},
  {path:"mender",bookKey:"occultBook",skill:"mender_pve_rice",book:(()=>{const b=occult();b.learned.mender=["mender_heal","mender_pve_rice"];b.loadouts.mender[0]="mender_pve_rice";b.training.mender=8;return b;})(),command:"occult_book",get:"occult_book_get",state:"occult_book_state",changed:"occult_book_changed"},
];
async function fixture(spec,z=0,level=25){
  const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex");
  const slots=Array(12).fill(null);slots[0]={itemId:"ritual_dagger",quantity:1};
  const save={version:1,id,name:"RankTester",level,experience:0,pkKills:0,pkDeaths:0,x:z?1.1:0,y:0,z,hp:100,mapId:"ritual_village",
    build:{path:spec.path,ancestry:"woodland"},inventory:{version:1,slots,equippedWeaponSlot:0},updatedAt:new Date().toISOString(),[spec.bookKey]:spec.book};
  if(spec.path==="muay_boran")save.muayWrapGranted=true;
  await writeFile(path.join(dir,id+".json"),JSON.stringify(save),{flag:"wx"});return {token,id};
}
async function join(token,roomId){const opts={guestToken:token,worldVersion:1,templeVersion:1,atlasVersion:1};const room=roomId?await sdk.joinById(roomId,opts):await sdk.create("my_room",opts);rooms.push(room);
  const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));await until(()=>room.state?.players?.get(room.sessionId)?.persistent,"join");return {room,events};}
async function send(c,type,data,event){c.events.length=0;c.room.send(type,data);return (await until(()=>c.events.find(e=>e.type===event),event)).data;}
try {
  for(const spec of specs){
    const f=await fixture(spec),c=await join(f.token),gold=savedGold(f.id),before=await savedCharacter(f.id);
    await send(c,spec.command,spec.command==="sword_tree_upgrade"?{skillId:spec.skill}:{action:"upgrade",skillId:spec.skill},spec.changed);
    if(spec.get){const state=await send(c,spec.get,{},spec.state);assert.equal(state.book.ranks[spec.skill],1,spec.path);}
    await c.room.leave();rooms.splice(rooms.indexOf(c.room),1);await sleep(400);
    const saved=await savedCharacter(f.id);
    assert.equal(saved[spec.bookKey].ranks[spec.skill],1,spec.path+" rank saved");
    const again=await join(f.token);
    if(spec.get){const restored=await send(again,spec.get,{},spec.state);assert.equal(restored.book.ranks[spec.skill],1,spec.path+" restored");}
    else {
      const player=again.room.state.players.get(again.room.sessionId);
      const data=spec.path==="muay_boran"?player.muayBookData:player.swordTreeData;
      assert.equal(JSON.parse(data).ranks[spec.skill],1,spec.path+" restored");
    }
    const resetCommand=spec.path==="phutthaisawan"?"sword_tree_reset":spec.command;
    const resetBody=spec.path==="phutthaisawan"?{}:{action:"reset"};
    await send(again,resetCommand,resetBody,spec.changed);
    const afterReset=await savedCharacter(f.id);
    assert.equal(afterReset[spec.bookKey].ranks?.[spec.skill],undefined,spec.path+" rank refunded");
    assert.equal(savedGold(f.id),gold,spec.path+" wallet preserved");
    assert.equal(afterReset.level,before.level,spec.path+" level preserved");
    assert.equal(afterReset.experience,before.experience,spec.path+" experience preserved");
    assert.deepEqual(afterReset.inventory,before.inventory,spec.path+" inventory preserved");
    await again.room.leave();rooms.splice(rooms.indexOf(again.room),1);
    console.log("Rank save and reconnect passed:",spec.path);
  }
  const untrainedSpec=structuredClone(specs[0]);untrainedSpec.book.practice.ambush=0;
  const untrained=await fixture(untrainedSpec),novice=await join(untrained.token);
  const forged=await send(novice,"blade_book",{action:"upgrade",skillId:"hidden_edge",rank:5},"command_rejected");
  assert.equal(forged.reason,"invalid_blade_book");await sleep(650);
  const refusal=await send(novice,"blade_book",{action:"upgrade",skillId:"hidden_edge"},"command_rejected");
  assert.equal(refusal.reason,"blade_practice","a high level alone does not bypass practice");
  await novice.room.leave();rooms.splice(rooms.indexOf(novice.room),1);
  const early=await fixture(specs[0],0,24),earlyPlayer=await join(early.token);
  const locked=await send(earlyPlayer,"blade_book",{action:"upgrade",skillId:"hidden_edge"},"command_rejected");
  assert.equal(locked.reason,"blade_level");await earlyPlayer.room.leave();rooms.splice(rooms.indexOf(earlyPlayer.room),1);
  const menderSpec=structuredClone(specs.find(spec=>spec.path==="mender"));menderSpec.book.ranks={mender_pve_rice:1};
  const support=await fixture(menderSpec,17.7),opponent=await fixture(specs[0],16.7);
  const healer=await join(support.token),other=await join(opponent.token,healer.room.roomId),monster=healer.room.state.monster;
  const invalid=await send(healer,"occult_skill",{skillId:"mender_pve_rice",targetId:other.room.sessionId},"command_rejected");
  assert.equal(invalid.reason,"target_unavailable","new healer skill cannot target players");
  healer.events.length=0;healer.room.send("occult_skill",{skillId:"mender_pve_rice",targetId:monster.id});
  const hit=(await until(()=>healer.events.find(e=>e.type==="combat_hit" && e.data.targetId===monster.id),"ranked healer monster hit")).data;
  const player=healer.room.state.players.get(healer.room.sessionId),k=100*(1+(monster.level-1)/15);
  const expected=Math.max(1,Math.round(player.magicAtk*1.3*1.04*k/(k+monster.defense)));
  assert.equal(hit.damage,expected,"learned rank increases only monster skill damage");
  console.log("Ranked healer monster damage and player-target refusal passed");
  const tankSpec=structuredClone(specs.find(spec=>spec.path==="sentinel"));tankSpec.book.ranks={bash:1};
  const tankFixture=await fixture(tankSpec,17.7),foeFixture=await fixture(specs[0],16.7);
  const tank=await join(tankFixture.token),foe=await join(foeFixture.token,tank.room.roomId);
  const actor=tank.room.state.players.get(tank.room.sessionId),victim=await until(()=>tank.room.state.players.get(foe.room.sessionId),"opponent replication");
  tank.room.send("sentinel_skill",{skillId:"bash",targetId:foe.room.sessionId});
  const pvp=(await until(()=>tank.events.find(e=>e.type==="pvp_hit" && e.data.targetId===foe.room.sessionId),"ranked guardian pvp hit")).data;
  const pvpK=100*(1+(victim.level-1)/15),pvpExpected=Math.max(1,Math.round((actor.atk+4)*0.9*0.75*pvpK/(pvpK+victim.def)));
  assert.equal(pvp.damage,pvpExpected,"monster rank bonus is not applied in PvP");
  console.log("Ranked guardian PvP damage remains unchanged");
} finally {await Promise.allSettled(rooms.map(room=>room.leave()));}
