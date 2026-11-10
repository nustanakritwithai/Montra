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
    const f=await fixture(spec,-20),c=await join(f.token),before=await savedCharacter(f.id);
    const actor=c.room.state.players.get(c.room.sessionId);
    assert.ok(Math.hypot(actor.x,actor.z)>6,spec.path+" outside shrine");
    assert.equal(actor.mapId,"ritual_village");
    await send(c,spec.command,spec.command==="sword_tree_upgrade"?{skillId:spec.skill}:{action:"upgrade",skillId:spec.skill},spec.changed);
    await c.room.leave();rooms.splice(rooms.indexOf(c.room),1);await sleep(400);
    const saved=await savedCharacter(f.id);
    assert.equal(saved[spec.bookKey].ranks[spec.skill],1,spec.path+" rank saved");
    assert.deepEqual(saved.inventory,before.inventory,spec.path+" inventory preserved");
    assert.equal(saved.level,before.level,spec.path+" level preserved");
    assert.equal(saved.experience,before.experience,spec.path+" experience preserved");
    const again=await join(f.token);
    if(spec.get){const restored=await send(again,spec.get,{},spec.state);assert.equal(restored.book.ranks[spec.skill],1,spec.path+" restored");}
    else {
      const player=again.room.state.players.get(again.room.sessionId);
      assert.equal(JSON.parse(spec.path==="muay_boran"?player.muayBookData:player.swordTreeData).ranks[spec.skill],1,spec.path+" restored");
    }
    assert.ok(Math.hypot(again.room.state.players.get(again.room.sessionId).x,again.room.state.players.get(again.room.sessionId).z)>6,spec.path+" reconnect outside shrine");
    const resetCommand=spec.path==="phutthaisawan"?"sword_tree_reset":spec.command;
    const resetBody=spec.path==="phutthaisawan"?{}:{action:"reset"};
    const rejection=await send(again,resetCommand,resetBody,"command_rejected");
    const reason=spec.path==="phutthaisawan"?"sword_tree_needs_shrine":spec.path==="muay_boran"?"muay_book_needs_shrine":spec.path==="seer"||spec.path==="mender"?"occult_book_needs_shrine":spec.path+"_book_needs_shrine";
    assert.equal(rejection.reason,reason,spec.path+" field reset rejected");
    assert.equal((await savedCharacter(f.id))[spec.bookKey].ranks[spec.skill],1,spec.path+" rejected reset preserves rank");
    await again.room.leave();rooms.splice(rooms.indexOf(again.room),1);
    console.log("Field upgrade, disk save, reconnect and reset restriction passed:",spec.path);
  }
} finally {await Promise.allSettled(rooms.map(room=>room.leave()));}
