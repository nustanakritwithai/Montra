// Real WebSocket contract test. Disposable local fixtures only; never production.
import assert from "node:assert/strict";
import {createHash,randomBytes} from "node:crypto";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import path from "node:path";
import {DatabaseSync} from "node:sqlite";
import {Client} from "@colyseus/sdk";

const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||"") || new URL(url).port==="4108" || process.env.MONTRA_ECONOMY_ENABLED!=="1" || !dir || !path.basename(dir).startsWith("montra-advanced-test-"))
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
const coreCasts={
 blade:['blade_fury','blade_heavy','blade_core_skill','blade_skill_used','cloak'],
 sentinel:['bulwark','shock','sentinel_core_skill','sentinel_core_used','guard'],
 phutthaisawan:['sritra_core','phuttha_core','sword_core_skill','sword_skill_used','sweep'],
 muay_boran:['chaiya','korat','muay_core_skill','muay_core_used','korat_heavy'],
 seer:['seer_pot','seer_binding','seer_core_skill','summon_spawn','seer_mark'],
 mender:['mender_core_heal','mender_core_ward','mender_core_skill','mender_core_used','mender_heal'],
};
async function join(token){
 const room=await sdk.create('my_room',{guestToken:token,worldVersion:1,templeVersion:1,atlasVersion:1});rooms.push(room);
 const events=[];room.onMessage('*',(type,data)=>events.push({type,data}));
 await until(()=>room.state?.players?.get(room.sessionId)?.persistent,'persistent join');
 return {room,events,own:()=>room.state.players.get(room.sessionId)};
}
async function send(c,type,payload,reply){
 await sleep(1150);const start=c.events.length;c.room.send(type,payload);
 return (await until(()=>c.events.slice(start).find(e=>e.type===reply),type+' -> '+reply)).data;
}
async function leave(c){await c.room.leave();rooms.splice(rooms.indexOf(c.room),1);await sleep(500);}
function persisted(token){const id=createHash('sha256').update(token).digest('hex');const db=new DatabaseSync(path.join(dir,'economy.sqlite'),{readOnly:true});try{return JSON.parse(db.prepare('SELECT snapshot FROM characters WHERE id=?').get(id).snapshot);}finally{db.close();}}
try{
 for(const spec of specs){
  const rankKey=spec.path==='mender'?'menderCoreRanks':'coreRanks';
  spec.book[rankKey]={[coreCasts[spec.path][0]]:2};
  const token=await fixture(spec,true);let c=await join(token);
  const command=spec.path==='phutthaisawan'?'sword_tree_learn':spec.path==='muay_boran'?'muay_book':spec.path==='blade'?'blade_book':spec.path==='sentinel'?'sentinel_book':'occult_book';
  const changed=spec.path==='phutthaisawan'?'sword_tree_changed':command+'_changed';
  await send(c,command,spec.path==='phutthaisawan'?{skillId:spec.skill}:{action:'learn',skillId:spec.skill},changed);
  const before=persisted(token),[core,unequippedCore,coreCommand,coreEvent,unequippedAdvanced]=coreCasts[spec.path];
  const school=spec.path==='phutthaisawan'?'phutthaisawan':spec.path==='muay_boran'?'korat':'';
  assert.equal(before[spec.bookKey][rankKey][core],2,'fixture keeps existing upgraded core rank');
  const layout={version:1,pathId:spec.path,school,slots:[{kind:'core',id:core},{kind:'advanced',id:spec.skill},null,null]};
  assert.deepEqual(await send(c,'skill_hotbar_set',layout,'skill_hotbar_changed'),layout);
  const saved=persisted(token);
  assert.deepEqual(saved.mixedSkillLoadouts,{version:1,loadouts:{[spec.path+':'+school]:layout.slots}},'SQLite layout committed before ack');
  assert.deepEqual(saved[spec.bookKey],before[spec.bookKey],'equipping preserves learned skills, ranks, practice and points');
  await until(()=>c.own().skillHotbarVersion===1 && JSON.stringify(JSON.parse(c.own().skillHotbarData))===JSON.stringify(layout),'replicated mixed layout');
  // SQLite is authoritative; the JSON migration source must remain readable.
  const id=createHash('sha256').update(token).digest('hex');
  assert.equal(JSON.parse(await readFile(path.join(dir,id+'.json'),'utf8')).id,id);
  if(spec.path==='phutthaisawan'){
   const rejected=await send(c,'skill_hotbar_set',{...layout,slots:['sweep','guard','footwork','flowing_blades'].map(id=>({kind:'advanced',id}))},'command_rejected');
   assert.equal(rejected.reason,'invalid_skill_hotbar','sword cannot equip four advanced skills');
   assert.deepEqual(persisted(token).mixedSkillLoadouts,saved.mixedSkillLoadouts,'rejected layout leaves persisted slots unchanged');
  }
  await leave(c);c=await join(token);
  await until(()=>c.own().skillHotbarVersion===1 && JSON.stringify(JSON.parse(c.own().skillHotbarData))===JSON.stringify(layout),'mixed layout restored');
  for(const [type,skillId] of [[coreCommand,unequippedCore],[spec.command,unequippedAdvanced]]){
   const rejected=await send(c,type,{skillId,targetId:c.room.state.monster.id},'command_rejected');assert.equal(rejected.reason,'skill_hotbar_locked','unequipped '+skillId);
  }
  c.room.send('move',{x:1.1,z:12.2});await until(()=>Math.hypot(c.own().x-1.1,c.own().z-12.2)<.5,'leave shrine');
  const player=c.own(),monster=c.room.state.monster,initialHp=player.hp,start=c.events.length;
  c.room.send(spec.command,spec.self?{skillId:spec.skill}:{skillId:spec.skill,targetId:spec.heal?c.room.sessionId:monster.id});
  if(spec.heal)await until(()=>player.hp>initialHp,'authoritative advanced healing');
  else if(spec.self)await until(()=>c.events.slice(start).some(e=>e.type==='sentinel_skill_used'&&e.data.skillId===spec.skill),'advanced guard');
  else await until(()=>c.events.slice(start).some(e=>e.type==='combat_hit'&&e.data.targetId===monster.id),'authoritative advanced damage');
  assert.ok(!c.events.slice(start).some(e=>e.type==='command_rejected'),'equipped advanced cast accepted');
  const used=await send(c,coreCommand,{skillId:core},coreEvent);
  if(spec.path==='seer')assert.equal(used.kind,'pot_spirit');else assert.equal(used.skillId,core);
  await leave(c);
  console.log('PASS mixed hotbar:',spec.path,'learn / mixed equip / SQLite commit / preserve book / reconnect / unequipped gates / advanced effect / core cast');
 }
}finally{await Promise.allSettled(rooms.map(room=>room.leave()));}
