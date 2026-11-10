import test from 'node:test';
import assert from 'node:assert/strict';
process.env.MONTRA_WORLD_EXPANSION='1';
const {MyRoom}=await import('./MyRoom.js');
const {Player}=await import('./schema/MyRoomState.js');
const {CommandBucket}=await import('./GameRules.js');
const {characterStore}=await import('./CharacterStore.js');
const {makeStarterInventory}=await import('./ItemRules.js');
const {newSwordTree}=await import('./SkillCatalog.js');
const {newBladeBook}=await import('./BladeRules.js');
const {defaultHotbar}=await import('./SkillHotbar.js');
const {serviceNpcsFor}=await import('./ServiceNpcs.js');
test('rebirth restores existing destination hotbar only after save and before completion',async()=>{
 const room=new MyRoom(),r=room as any,id='rebirth_hotbar',mentor=serviceNpcsFor('ritual_village').find(n=>n.role==='mentor')!;assert.ok(mentor);
 const player=new Player({pathId:'phutthaisawan',ancestryId:'woodland',level:100,mapId:'ritual_village',x:mentor.x,z:mentor.z,y:0,alive:true});
 room.state.players.set(id,player);r.swordTrees.set(id,newSwordTree());r.bladeBooks.set(id,newBladeBook());r.inventories.set(id,makeStarterInventory());r.persistentCharacters.set(id,'a'.repeat(64));r.gates.set(id,{build:new CommandBucket(50,50)});r.broadcast=()=>{};
 const sword=defaultHotbar('phutthaisawan'),blade=defaultHotbar('blade');[blade[0],blade[3]]=[blade[3],blade[0]];blade[1]=null;
 const loadouts={version:1,loadouts:{'phutthaisawan:phutthaisawan':sword,'blade:':blade}};r.mixedSkillLoadouts.set(id,loadouts);r.syncSkillHotbar(id);
 const notices:any[]=[];const client={sessionId:id,send:(type:string,data:unknown)=>notices.push({type,data,hotbar:JSON.parse(player.skillHotbarData)})};
 let release!:()=>void;const pending=new Promise<void>(resolve=>release=resolve),original=characterStore.save,writes:any[]=[];
 characterStore.save=async snapshot=>{writes.push(structuredClone(snapshot));await pending;};
 try{
  r.beginRebirth(client,{path:'blade'});assert.equal(writes.length,1);assert.equal(player.pathId,'phutthaisawan');assert.equal(JSON.parse(player.skillHotbarData).pathId,'phutthaisawan');assert.equal(notices.some(n=>n.type==='rebirth_complete'),false);
  assert.deepEqual(writes[0].mixedSkillLoadouts,loadouts);release();await r.pendingItemUses.get(id);
  assert.equal(player.pathId,'blade');assert.equal(player.level,1);assert.deepEqual(JSON.parse(player.skillHotbarData),{version:1,pathId:'blade',school:'',slots:blade});
  assert.deepEqual(notices.find(n=>n.type==='rebirth_complete')?.hotbar.slots,blade);assert.deepEqual(r.mixedSkillLoadouts.get(id).loadouts['phutthaisawan:phutthaisawan'],sword);
  assert.equal(r.hotbarCastAllowed(client,{skillId:blade[0]!.id},'core'),true);assert.equal(r.hotbarCastAllowed(client,{skillId:defaultHotbar('blade')[1]!.id},'core'),false);
 }finally{characterStore.save=original;release();await r.pendingItemUses.get(id);}
});
