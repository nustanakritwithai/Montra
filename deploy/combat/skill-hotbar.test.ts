import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultHotbar,validateHotbarSlots,validateMixedSkillLoadouts,availableHotbarSlot,hotbarState} from './SkillHotbar.js';
import {newSwordTree} from './SkillCatalog.js';
import {newMuayBook} from './MuayRules.js';
import {MyRoom} from './MyRoom.js';
import {Player} from './schema/MyRoomState.js';
import {CommandBucket} from './GameRules.js';
import {characterStore,CharacterStore} from './CharacterStore.js';
import {makeStarterInventory} from './ItemRules.js';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {newOccultBook} from './OccultRules.js';
for(const path of ['phutthaisawan','muay_boran','blade','sentinel','seer','mender'])test(path+' defaults to four available rank-zero cores',()=>{
 const slots=defaultHotbar(path);assert.equal(slots.length,4);assert.ok(slots.every(s=>availableHotbarSlot(path,'',s,{})));assert.deepEqual(hotbarState(path,{}).slots,slots);
});
test('reject malformed, duplicate, oversized and fourth sword advanced selection',()=>{
 for(const slots of [[],[null,null,null],Array(5).fill(null),[{kind:'core',id:'chaiya',extra:1},null,null,null],[{kind:'oops',id:'x'},null,null,null],[{kind:'core',id:'chaiya'},{kind:'core',id:'chaiya'},null,null],['a','b','c','d'].map(id=>({kind:'advanced',id}))])assert.throws(()=>validateHotbarSlots(slots,'phutthaisawan'));
});
test('scope ownership, foundation portability, and reset pruning preserve legacy configuration',()=>{
 const swordTree=newSwordTree(),muayBook=newMuayBook();swordTree.learned=['footwork','guard'];muayBook.learned=['punch'];
 assert.ok(availableHotbarSlot('muay_boran','korat',{kind:'advanced',id:'punch'},{muayBook}));assert.equal(availableHotbarSlot('blade','',{kind:'advanced',id:'guard'},{swordTree}),false);
 const input={version:1,loadouts:{'phutthaisawan:phutthaisawan':[{kind:'advanced',id:'guard'},null,null,null]}};
 assert.equal(validateMixedSkillLoadouts(input,{swordTree}).loadouts['phutthaisawan:phutthaisawan'][0]?.id,'guard');
 const before=structuredClone(swordTree.loadouts);swordTree.learned=[];assert.equal(validateMixedSkillLoadouts(input,{swordTree}).loadouts['phutthaisawan:phutthaisawan'][0],null);assert.deepEqual(swordTree.loadouts,before);
 assert.throws(()=>validateMixedSkillLoadouts({version:1,loadouts:{'blade:korat':Array(4).fill(null)}},{}));
});
for(const failure of [false,true])test('room atomic saved selection, busy protection and '+(failure?'failed write rollback':'authoritative cast membership'),async()=>{
 const room=new MyRoom(),r=room as any,id='hotbar_test',tree=newSwordTree();tree.learned=['footwork','guard'];tree.cooldowns.guard=Date.now()+10000;
 const player=new Player({pathId:'phutthaisawan',ancestryId:'woodland',level:10,x:-10,z:8,alive:true});room.state.players.set(id,player);
 r.swordTrees.set(id,tree);r.inventories.set(id,makeStarterInventory());r.persistentCharacters.set(id,'a'.repeat(64));r.gates.set(id,{swordTree:new CommandBucket(50,50)});r.broadcast=()=>{};
 const notices:any[]=[];const client={sessionId:id,send:(type:string,data:unknown)=>notices.push({type,data})};
 let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve),original=characterStore.save,writes:any[]=[];
 characterStore.save=async snapshot=>{writes.push(structuredClone(snapshot));await pending;if(failure)throw Error('test_disk_failure');};
 try{
  const slots=[{kind:'advanced',id:'guard'},...defaultHotbar('phutthaisawan').slice(1)];const command={version:1,pathId:'phutthaisawan',school:'phutthaisawan',slots};
  r.messages.skill_hotbar_set(client,command);assert.equal(writes.length,1);assert.equal(r.mixedSkillLoadouts.has(id),false);assert.equal(r.pendingWarps.has(id),false);
  r.messages.skill_hotbar_set(client,command);assert.equal(writes.length,1);assert.equal(notices.some(n=>n.type==='skill_hotbar_changed'),false);
  tree.cooldowns.guard+=1000;tree.training.strikes+=1;const cooldown=tree.cooldowns.guard;release();await r.pendingItemUses.get(id);
  assert.equal(tree.cooldowns.guard,cooldown);assert.equal(tree.training.strikes,1);
  if(failure){assert.equal(r.mixedSkillLoadouts.has(id),false);assert.equal(notices.some(n=>n.type==='skill_hotbar_changed'),false);}
  else {assert.deepEqual(JSON.parse(player.skillHotbarData).slots,slots);assert.ok(notices.some(n=>n.type==='skill_hotbar_changed'));assert.equal(r.hotbarCastAllowed(client,{skillId:defaultHotbar('phutthaisawan')[0]!.id},'core'),false);assert.equal(r.advancedEquipped(id,'guard',false),true);assert.equal(r.advancedEquipped(id,'footwork',true),false);r.messages.sword_tree_equip(client,{slot:0,skillId:'guard'});assert.equal(writes.length,1);assert.deepEqual(tree.loadouts,writes[0].swordTree.loadouts);}
 }finally{characterStore.save=original;release();await r.pendingItemUses.get(id);}
});
for(const economy of [false,true])test('mixed selections survive real '+(economy?'SQLite':'JSON')+' save and reconnect without replacing books',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'montra-hotbar-')),store=new CharacterStore(directory,economy),token='mt1_'+'d'.repeat(64);
 try{
  const {character}=await store.loadOrCreate(token,{x:0,z:0});const before=structuredClone(character);
  const slots=defaultHotbar('phutthaisawan');[slots[0],slots[3]]=[slots[3],slots[0]];
  await store.save({...character,mixedSkillLoadouts:{version:1,loadouts:{'phutthaisawan:phutthaisawan':slots}}});
  const loaded=(await store.loadOrCreate(token,{x:0,z:0})).character;
  assert.deepEqual(loaded.mixedSkillLoadouts?.loadouts['phutthaisawan:phutthaisawan'],slots);
  for(const key of ['swordTree','muayBook','occultBook','bladeBook','sentinelBook'] as const)assert.deepEqual(loaded[key],before[key]);
 }finally{store.close();await rm(directory,{recursive:true,force:true});}
});
test('room rejects stale class/school, unlearned selection and non-sword combat edits',async()=>{
 const room=new MyRoom(),r=room as any,id='invalid_hotbar',player=new Player({pathId:'phutthaisawan',ancestryId:'woodland',level:10,x:-10,z:8,alive:true});room.state.players.set(id,player);
 r.swordTrees.set(id,newSwordTree());r.inventories.set(id,makeStarterInventory());r.persistentCharacters.set(id,'a'.repeat(64));r.gates.set(id,{swordTree:new CommandBucket(50,50)});
 const notices:any[]=[];r.reject=(_client:unknown,reason:string)=>notices.push({reason});const client={sessionId:id,send:(type:string,data:unknown)=>notices.push({type,data})};const original=characterStore.save;let writes=0;characterStore.save=async()=>{writes++;};
 try{
  const base={version:1,pathId:'phutthaisawan',school:'phutthaisawan',slots:defaultHotbar('phutthaisawan')};
  for(const change of [{pathId:'blade'},{school:'atamat'},{slots:[{kind:'advanced',id:'guard'},null,null,null]},{slots:[{kind:'core',id:'foreign'},null,null,null]}])r.messages.skill_hotbar_set(client,{...base,...change});
  player.pathId='blade';r.messages.skill_hotbar_set(client,{version:1,pathId:'blade',school:'',slots:defaultHotbar('blade')});assert.equal(writes,0);assert.equal(notices.length,5);assert.match(JSON.stringify(notices.at(-1)),/skill_hotbar_needs_shrine/);
 }finally{characterStore.save=original;}
});
test('spirit preparation requires selected core or relevant learned advanced, possession requires selected trance',()=>{
 const room=new MyRoom(),r=room as any,id='spirit_hotbar',book=newOccultBook();room.state.players.set(id,new Player({pathId:'seer'}));r.occultBooks.set(id,book);
 assert.equal(r.canPrepareSpirit(id,'seer',false),true);const set=(slots:any[])=>r.mixedSkillLoadouts.set(id,{version:1,loadouts:{'seer:':slots}});
 set([null,null,null,null]);assert.equal(r.canPrepareSpirit(id,'seer',false),false);
 set([{kind:'core',id:'seer_pot'},null,null,null]);assert.equal(r.canPrepareSpirit(id,'seer',false),true);
 set([{kind:'advanced',id:'seer_spirit'},null,null,null]);assert.equal(r.canPrepareSpirit(id,'seer',false),false);
 book.learned.seer.push('seer_spirit');assert.equal(r.canPrepareSpirit(id,'seer',false),true);assert.equal(r.canPrepareSpirit(id,'seer',true),false);
 book.learned.seer.push('seer_trance');set([{kind:'advanced',id:'seer_trance'},null,null,null]);assert.equal(r.canPrepareSpirit(id,'seer',true),true);
});
