import test from 'node:test';
import assert from 'node:assert/strict';
process.env.MONTRA_MIXED_SKILLS='0';
const {MyRoom}=await import('./MyRoom.js');
const {Player}=await import('./schema/MyRoomState.js');
const {CommandBucket}=await import('./GameRules.js');
const {characterStore}=await import('./CharacterStore.js');
const {makeStarterInventory}=await import('./ItemRules.js');
const {newSwordTree}=await import('./SkillCatalog.js');
const {defaultHotbar,hotbarState,validateMixedSkillLoadouts}=await import('./SkillHotbar.js');
test('operational disable advertises zero, preserves saved layouts, allows legacy casts/equip and refuses mixed writes',async()=>{
 const room=new MyRoom(),r=room as any,id='disabled_hotbar',tree=newSwordTree();tree.learned=['footwork','guard'];
 const player=new Player({pathId:'phutthaisawan',ancestryId:'woodland',level:10,x:-10,z:8,alive:true});room.state.players.set(id,player);
 r.swordTrees.set(id,tree);r.inventories.set(id,makeStarterInventory());r.persistentCharacters.set(id,'a'.repeat(64));r.gates.set(id,{swordTree:new CommandBucket(50,50)});r.broadcast=()=>{};
 const slots=[{kind:'advanced',id:'guard'},null,null,null];const saved={version:1,loadouts:{'phutthaisawan:phutthaisawan':slots}};r.mixedSkillLoadouts.set(id,saved);r.syncSkillHotbar(id);
 assert.equal(player.skillHotbarVersion,0);assert.equal(JSON.parse(player.skillHotbarData).version,0);assert.deepEqual(JSON.parse(player.skillHotbarData).slots,defaultHotbar('phutthaisawan'));assert.deepEqual(r.mixedSkillLoadouts.get(id),saved);
 const notices:any[]=[];r.reject=(_c:unknown,reason:string)=>notices.push({reason});const client={sessionId:id,send:(type:string,data:unknown)=>notices.push({type,data})};
 assert.equal(r.hotbarCastAllowed(client,{skillId:defaultHotbar('phutthaisawan')[0]!.id},'core'),true);assert.equal(r.hotbarCastAllowed(client,{skillId:'footwork'},'advanced'),true);assert.equal(r.advancedEquipped(id,'footwork',true),true);assert.equal(r.advancedEquipped(id,'guard',false),false);
 const original=characterStore.save,writes:any[]=[];characterStore.save=async snapshot=>{writes.push(structuredClone(snapshot));};
 try{
  r.messages.skill_hotbar_set(client,{version:1,pathId:'phutthaisawan',school:'phutthaisawan',slots});assert.equal(writes.length,0);assert.equal(notices.at(-1).reason,'skill_hotbar_unavailable');
  r.messages.sword_tree_equip(client,{slot:0,skillId:'footwork'});await r.pendingItemUses.get(id);assert.equal(writes.length,1);assert.equal(tree.loadouts.phutthaisawan[0],'footwork');assert.deepEqual(writes[0].mixedSkillLoadouts,saved);assert.deepEqual(r.captureCharacterSnapshot(id).mixedSkillLoadouts,saved);
  assert.deepEqual(hotbarState(player.pathId,{swordTree:tree},validateMixedSkillLoadouts(writes[0].mixedSkillLoadouts,{swordTree:tree})).slots,slots);
  tree.learned=[];r.syncSkillHotbar(id);assert.deepEqual(r.mixedSkillLoadouts.get(id).loadouts['phutthaisawan:phutthaisawan'],[null,null,null,null]);
 }finally{characterStore.save=original;await r.pendingItemUses.get(id);}
});
