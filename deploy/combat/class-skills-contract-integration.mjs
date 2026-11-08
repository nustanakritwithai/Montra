// Run from generated combat-verify with: node --import tsx class-skills-contract-integration.mjs
// Requires a separate localhost server pointed at the same disposable directory.
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {Client} from '@colyseus/sdk';
const url=process.env.MONTRA_TEST_URL,dir=process.env.MONTRA_CHARACTER_DIR;
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url||'') || new URL(url).port==='4108' || !dir || !path.basename(dir).startsWith('montra-class-skills-test-'))throw Error('Requires isolated localhost and disposable montra-class-skills-test directory');
const {makeClassInventory}=await import('./src/rooms/ItemRules.ts');
const specs=[
  {path:'phutthaisawan',prefix:'sword',command:'sword_core_book',action:'upgrade',field:'swordTreeData',catalog:'swordTreeCatalog',ids:['phuttha_core','sritra_core','atamat_core','chumphon_core']},
  {path:'muay_boran',prefix:'muay',command:'muay_book',field:'muayBookData',catalog:'muayBookCatalog',ids:['chaiya','korat','lopburi','thasao']},
  {path:'seer',prefix:'occult',command:'occult_book',ids:['seer_pot','seer_binding','seer_poison','seer_buffalo']},
  {path:'mender',prefix:'occult',command:'occult_book',ranks:'menderCoreRanks',ids:['mender_core_heal','mender_core_circle','mender_core_cleanse','mender_core_ward']},
  {path:'blade',prefix:'blade',command:'blade_book',ids:['blade_vanish','blade_heavy','blade_withdraw','blade_fury']},
  {path:'sentinel',prefix:'sentinel',command:'sentinel_book',ids:['shock','bulwark','riposte','protect']},
];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+10000;while(Date.now()<end){const result=fn();if(result)return result;await sleep(30);}throw Error('Timeout '+label);}
const sdk=new Client(url);let active;
async function join(token){const room=await sdk.create('my_room',{guestToken:token,worldVersion:1,templeVersion:1,atlasVersion:1});active=room;const events=[];room.onMessage('*',(type,data)=>events.push({type,data}));await until(()=>room.state?.players?.get(room.sessionId)?.persistent,'join');return {room,events,own:()=>room.state.players.get(room.sessionId)};}
async function send(c,type,payload,reply){await sleep(1100);const start=c.events.length;c.room.send(type,payload);return (await until(()=>c.events.slice(start).find(e=>e.type===reply),type+' -> '+reply)).data;}
async function book(c,s){if(s.field){await sleep(150);return JSON.parse(c.own()[s.field]);}return (await send(c,s.prefix+'_book_get',{},s.prefix+'_book_state')).book;}
try{
 for(const s of specs){
  const token='mt1_'+randomBytes(32).toString('hex'),id=createHash('sha256').update(token).digest('hex');
  await writeFile(path.join(dir,id+'.json'),JSON.stringify({version:1,id,name:'ContractTest',level:25,experience:0,pkKills:0,pkDeaths:0,x:0,y:0,z:0,hp:100,mapId:'ritual_village',build:{path:s.path,ancestry:'woodland'},inventory:makeClassInventory(s.path),updatedAt:new Date().toISOString()}),{flag:'wx'});
  let c=await join(token);
  const catalog=s.catalog?JSON.parse(c.room.state[s.catalog]):await send(c,s.prefix+'_book_get',{},s.prefix+'_book_state');
  assert.deepEqual(Object.keys(catalog.core).sort(),s.ids.slice().sort(),s.path+' authoritative four-skill catalog');
  assert.equal(catalog.coreProgress.length,9);assert.equal(catalog.coreLevels.length,8);
  if(s.prefix==='occult')assert.equal(catalog.path,s.path);
  // A valid foreign core skill must fail the server's class gate before consuming mana.
  const foreign=specs.find(other=>other.path!==s.path && other.path!=='phutthaisawan');
  const castPrefix=foreign.path==='muay_boran'?'muay':foreign.path;
  const mana=c.own().mana;
  const rejected=await send(c,castPrefix+'_core_skill',{skillId:foreign.ids[0]},'command_rejected');
  assert.match(rejected.reason,/class_required|wrong_path|weapon_required|wrap_required/,'foreign cast class gate');
  assert.equal(c.own().mana,mana,'foreign cast costs no mana');
  const action=s.action||'core_upgrade',rankKey=s.ranks||'coreRanks';
  const initial=await book(c,s);
  const forged=await send(c,s.command,{action,skillId:s.ids[0],rank:8},'command_rejected');
  assert.match(forged.reason,/^invalid_/,'client cannot set rank');
  const wrong=await send(c,s.command,{action,skillId:specs.find(other=>other.path!==s.path && other.ids.every(id=>!s.ids.includes(id))).ids[0]},'command_rejected');
  assert.match(wrong.reason,/^invalid_/,'foreign class skill rejected');
  assert.deepEqual((await book(c,s))[rankKey],initial[rankKey],'rejections do not mutate ranks');
  const changed=s.prefix==='sword'?'sword_tree_changed':s.prefix+'_book_changed';
  await send(c,s.command,{action,skillId:s.ids[0]},changed);
  assert.equal((await book(c,s))[rankKey][s.ids[0]],1,s.path+' upgrade returned');
  await c.room.leave();active=null;await sleep(400);c=await join(token);
  assert.equal((await book(c,s))[rankKey][s.ids[0]],1,s.path+' rank restored');
  const invalidEquip=s.prefix==='sword'?'sword_tree_equip':s.command;
  const payload=s.prefix==='sword'?{slot:0,skillId:s.ids[0]}:{action:'equip',slot:0,skillId:s.ids[0]};
  await send(c,invalidEquip,payload,'command_rejected');
  assert.equal((await book(c,s))[rankKey][s.ids[0]],1,'legacy equip cannot change core rank');
  await send(c,s.command,{action:s.prefix==='sword'?'reset':'core_reset'},changed);
  assert.equal((await book(c,s))[rankKey]?.[s.ids[0]],undefined,'reset affects appropriate rank namespace');
  c.room.send('move',{x:0,z:8});
  await until(()=>Math.hypot(c.own().x,c.own().z-8)<.5,'leave shrine');
  const cast={phutthaisawan:['sword','sritra_core','sword_skill_used'],muay_boran:['muay','chaiya','muay_core_used'],seer:['seer','seer_pot','summon_spawn'],mender:['mender','mender_core_heal','mender_core_used'],blade:['blade','blade_fury','blade_skill_used'],sentinel:['sentinel','bulwark','sentinel_core_used']}[s.path];
  const beforeMana=c.own().mana;
  const used=await send(c,cast[0]+'_core_skill',{skillId:cast[1]},cast[2]);
  if(s.path==='seer')assert.equal(used.kind,'pot_spirit');else assert.equal(used.skillId,cast[1]);
  await until(()=>c.own().mana<beforeMana,'successful core cast consumes mana');
  await c.room.leave();active=null;
  console.log('PASS',s.path,'catalog / foreign cast / forged rank / foreign skill / upgrade / reconnect / fixed core slots / reset / valid cast');
 }
}finally{if(active)await active.leave();}
