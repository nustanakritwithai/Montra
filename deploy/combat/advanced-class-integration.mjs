import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" || !dir || !path.basename(dir).startsWith("montra-advanced-test-"))
  throw Error("Requires isolated localhost server and disposable advanced test directory");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),sdk=new Client(url),rooms=[];
async function until(fn,label){const end=Date.now()+12000;while(Date.now()<end){const value=fn();if(value)return value;await sleep(40);}throw Error("timeout: "+label);}
const muaySlots=["step","punch","guard","counter"],muayLoadouts={chaiya:[...muaySlots],korat:["korat_advanced_strike","punch","guard","counter"],lopburi:[...muaySlots],thasao:[...muaySlots]};
const mastery={chaiya:{technique:0,sequences:0},korat:{technique:20,sequences:5},lopburi:{technique:0,sequences:0},thasao:{technique:0,sequences:0}};
const occult=()=>({learned:{seer:[],mender:[]},loadouts:{seer:[null,null,null,null],mender:[null,null,null,null]},training:{seer:40,mender:40},cooldowns:{},mastery:{seer:{rice:10,talisman:10,spirit:0,curse:0},mender:{healing:10,protection:0,cleanse:0,spirit:0}}});
const specs=[
  {path:"blade",weapon:"ritual_dagger",bookKey:"bladeBook",skill:"shadow_cut",book:{learned:["cloak","hidden_edge","shadow_cut"],slots:["shadow_cut",null,null,null],practice:{ambush:15,mark:4,evade:0,combo:0},cooldowns:{}},command:"blade_skill"},
  {path:"sentinel",weapon:"ritual_dagger",bookKey:"sentinelBook",skill:"firm_guard",book:{learned:["guard","fortitude","firm_guard"],slots:["firm_guard",null,null,null],practice:{guard:15,stun:0,assist:0},cooldowns:{}},command:"sentinel_skill",self:true},
  {path:"phutthaisawan",weapon:"arcane_sword",bookKey:"swordTree",skill:"flowing_blades",book:{school:"phutthaisawan",learned:["footwork","guard","sweep","rhythm","flowing_blades"],cooldowns:{},training:{strikes:50,blocks:3,finishes:0},loadouts:{phutthaisawan:["flowing_blades",null,null],sritrairat:[null,null,null],atamat:[null,null,null],chumphon:[null,null,null]}},command:"sword_skill"},
  {path:"muay_boran",weapon:"muay_wraps",bookKey:"muayBook",skill:"korat_advanced_strike",book:{learned:["korat_heavy","korat_advanced_strike"],training:{strikes:90,blocks:12},mastery,school:"korat",slots:muayLoadouts.korat,loadouts:muayLoadouts},command:"muay_skill"},
  {path:"seer",weapon:"spirit_staff",bookKey:"occultBook",skill:"seer_ash_rice",book:(()=>{const b=occult();b.learned.seer=["seer_mark","seer_rice","seer_ash_rice"];b.loadouts.seer[0]="seer_ash_rice";return b;})(),command:"occult_skill"},
  {path:"mender",weapon:"spirit_staff",bookKey:"occultBook",skill:"mender_deep_heal",book:(()=>{const b=occult();b.learned.mender=["mender_heal","mender_deep_heal"];b.loadouts.mender[0]="mender_deep_heal";return b;})(),command:"occult_skill",heal:true},
];
const finals=[
  {path:"blade",weapon:"ritual_dagger",bookKey:"bladeBook",skill:"sealed_finale",book:{learned:["cloak","hidden_edge","marked_cut","piercing_edge","sever_mark","shadow_cut","rune_break","evade","counter","shadow_counter","sealed_finale"],slots:["sealed_finale",null,null,null],practice:{ambush:100,mark:100,evade:100,combo:100},cooldowns:{}}},
  {path:"sentinel",weapon:"ritual_dagger",bookKey:"sentinelBook",skill:"enduring_ward",book:{learned:["guard","fortitude","firm_guard","bash","sweep","line_sweep","counter","steadfast_counter","taunt","ward","enduring_ward"],slots:["enduring_ward",null,null,null],practice:{guard:50,stun:50,assist:0},cooldowns:{}}},
  {path:"phutthaisawan",weapon:"arcane_sword",bookKey:"swordTree",skill:"final_counter",book:{school:"phutthaisawan",learned:["footwork","guard","sweep","rhythm","flowing_blades","open_circle","steady_guard","final_counter"],cooldowns:{},training:{strikes:200,blocks:50,finishes:50},loadouts:{phutthaisawan:["final_counter",null,null],sritrairat:[null,null,null],atamat:[null,null,null],chumphon:[null,null,null]}}},
  {path:"muay_boran",weapon:"muay_wraps",bookKey:"muayBook",skill:"korat_final_strike",book:{learned:["korat_heavy","korat_advanced_strike","korat_master_strike","korat_final_strike"],training:{strikes:200,blocks:25},mastery:{...mastery,korat:{technique:45,sequences:12}},school:"korat",slots:["korat_final_strike","punch","guard","counter"],loadouts:{...muayLoadouts,korat:["korat_final_strike","punch","guard","counter"]}}},
  {path:"seer",weapon:"spirit_staff",bookKey:"occultBook",skill:"seer_spirit_rain",book:(()=>{const b=occult();b.learned.seer=["seer_mark","seer_rice","seer_scatter","seer_burst","seer_curse","seer_ash_rice","seer_deep_curse","seer_ward_break","seer_spirit_rain"];b.loadouts.seer[0]="seer_spirit_rain";b.training.seer=130;b.mastery.seer={rice:100,talisman:100,spirit:100,curse:100};return b;})()},
  {path:"mender",weapon:"spirit_staff",bookKey:"occultBook",skill:"mender_spirit_rice",book:(()=>{const b=occult();b.learned.mender=["mender_heal","mender_pve_rice","mender_deep_heal","mender_spirit_rice"];b.loadouts.mender[0]="mender_spirit_rice";b.training.mender=130;b.mastery.mender.healing=50;return b;})()},
];
await mkdir(dir,{recursive:true});
async function fixture(spec,learning=false){
  const token="mt1_"+randomBytes(32).toString("hex"),id=createHash("sha256").update(token).digest("hex"),slots=Array(12).fill(null);
  slots[0]={itemId:spec.weapon,quantity:1};
  const book=structuredClone(spec.book);
  if(learning){
    if(spec.bookKey==="occultBook"){
      book.learned[spec.path]=book.learned[spec.path].filter(id=>id!==spec.skill);
      book.loadouts[spec.path]=book.loadouts[spec.path].map(id=>id===spec.skill?null:id);
    } else {
      book.learned=book.learned.filter(id=>id!==spec.skill);
      if(book.slots)book.slots=book.slots.map(id=>id===spec.skill?null:id);
      if(book.loadouts)for(const key of Object.keys(book.loadouts))book.loadouts[key]=book.loadouts[key].map(id=>id===spec.skill?null:id);
    }
  }
  const save={version:1,id,name:"AdvancedTest",level:95,experience:0,pkKills:0,pkDeaths:0,x:learning?0:1.1,y:0,z:learning?0:12.2,hp:100,mapId:"ritual_village",build:{path:spec.path,ancestry:"woodland"},inventory:{version:1,slots,equippedWeaponSlot:0},updatedAt:new Date().toISOString(),[spec.bookKey]:book};
  if(spec.path==="muay_boran")save.muayWrapGranted=true;
  await writeFile(path.join(dir,id+".json"),JSON.stringify(save),{flag:"wx"});return token;
}
try{
  for(const spec of specs){
    const learningToken=await fixture(spec,true),learner=await sdk.create("my_room",{guestToken:learningToken,worldVersion:1,templeVersion:1,atlasVersion:1});rooms.push(learner);
    const learnedEvents=[];learner.onMessage("*",(type,data)=>learnedEvents.push({type,data}));
    await until(()=>learner.state?.players?.get(learner.sessionId)?.persistent,"learn join "+spec.path);
    const bookCommand=spec.path==="phutthaisawan"?"sword_tree_learn":spec.path==="muay_boran"?"muay_book":spec.path==="blade"?"blade_book":spec.path==="sentinel"?"sentinel_book":"occult_book";
    const changed=spec.path==="phutthaisawan"?"sword_tree_changed":spec.path==="muay_boran"?"muay_book_changed":spec.path==="blade"?"blade_book_changed":spec.path==="sentinel"?"sentinel_book_changed":"occult_book_changed";
    learner.send(bookCommand,spec.path==="phutthaisawan"?{skillId:spec.skill}:{action:"learn",skillId:spec.skill});
    await until(()=>learnedEvents.some(e=>e.type===changed),"learn "+spec.path);
    await learner.leave();rooms.splice(rooms.indexOf(learner),1);
    const token=await fixture(spec),room=await sdk.create("my_room",{guestToken:token,worldVersion:1,templeVersion:1,atlasVersion:1});rooms.push(room);
    const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
    await until(()=>room.state?.players?.get(room.sessionId)?.persistent,"join "+spec.path);
    const player=room.state.players.get(room.sessionId),monster=room.state.monster,initialHp=player.hp;
    const target=spec.heal?room.sessionId:monster.id;
    room.send(spec.command,spec.self?{skillId:spec.skill}:{skillId:spec.skill,targetId:target});
    if(spec.heal)await until(()=>player.hp>initialHp,"heal "+spec.path);
    else if(spec.self)await until(()=>events.some(e=>e.type==="sentinel_skill_used" && e.data.skillId===spec.skill),"guard");
    else await until(()=>events.some(e=>e.type==="combat_hit" && e.data.targetId===monster.id),"hit "+spec.path);
    assert.ok(!events.some(e=>e.type==="command_rejected"),spec.path+" should cast its advanced lesson");
    await room.leave();rooms.splice(rooms.indexOf(room),1);
    console.log("Advanced lesson learn and cast passed:",spec.path);
  }
  for(const spec of finals){
    const token=await fixture(spec,true),room=await sdk.create("my_room",{guestToken:token,worldVersion:1,templeVersion:1,atlasVersion:1});rooms.push(room);
    const events=[];room.onMessage("*",(type,data)=>events.push({type,data}));
    await until(()=>room.state?.players?.get(room.sessionId)?.persistent,"final join "+spec.path);
    const command=spec.path==="phutthaisawan"?"sword_tree_learn":spec.path==="muay_boran"?"muay_book":spec.path==="blade"?"blade_book":spec.path==="sentinel"?"sentinel_book":"occult_book";
    const changed=spec.path==="phutthaisawan"?"sword_tree_changed":spec.path==="muay_boran"?"muay_book_changed":spec.path==="blade"?"blade_book_changed":spec.path==="sentinel"?"sentinel_book_changed":"occult_book_changed";
    room.send(command,spec.path==="phutthaisawan"?{skillId:spec.skill}:{action:"learn",skillId:spec.skill});
    await until(()=>events.some(e=>e.type===changed),"level 95 lesson "+spec.path);
    await room.leave();rooms.splice(rooms.indexOf(room),1);
    console.log("Level 95 lesson learn passed:",spec.path);
  }
}finally{await Promise.allSettled(rooms.map(room=>room.leave()));}
