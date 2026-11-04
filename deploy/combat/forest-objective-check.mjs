import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'montra-forest-objective-'));
process.env.MONTRA_CHARACTER_DIR=dir;process.env.MONTRA_WORLD_EXPANSION='1';process.env.MONTRA_ECONOMY_ENABLED='0';
const {MyRoom}=await import('./src/rooms/MyRoom.ts');
const {Player}=await import('./src/rooms/schema/MyRoomState.ts');
const {characterStore}=await import('./src/rooms/CharacterStore.ts');
const {makeStarterInventory}=await import('./src/rooms/ItemRules.ts');
const {monsterExperience}=await import('./src/rooms/Progression.ts');
const {objectiveRanger,FOREST_OBJECTIVES}=await import('./src/rooms/ForestObjectives.ts');
const {getWorldMap,isSafeWorldPoint}=await import('./src/rooms/WorldMaps.ts');
const id='d'.repeat(64),events=[],client={sessionId:'hunter',send:(type,data)=>events.push({type,data})};
const room=new MyRoom(),p=new Player({characterName:'Hunter',pathId:'muay_boran',ancestryId:'woodland',mapId:'forbidden_forest',level:8,experience:0,x:-30,z:-17,y:0,alive:true,hp:300,maxHp:500,mana:120,stamina:100});
room.state.players.set('hunter',p);room.persistentCharacters.set('hunter',id);room.inventories.set('hunter',makeStarterInventory());room.gates.set('hunter',{build:{consume:()=>true}});room.clients.push(client);
try{
  for(const mapId of new Set(Object.values(FOREST_OBJECTIVES).map(item=>item.mapId))){
    const world=getWorldMap(mapId);if(!world)continue;
    const ranger=objectiveRanger(mapId);assert.ok(ranger,`NPC location for ${mapId}`);
    assert.ok(isSafeWorldPoint(world,ranger),`NPC is on safe ground in ${mapId}`);
  }
  room.changeForestObjective(client,{id:'west'});
  assert.equal(room.forestObjectives.has('hunter'),false,'cannot accept remotely');
  assert.ok(events.some(e=>e.type==='command_rejected' && e.data.reason==='forest_objective_near_ranger'));
  const forestKeeper=objectiveRanger('forbidden_forest');p.x=forestKeeper.x;p.y=forestKeeper.y;p.z=forestKeeper.z;
  room.changeForestObjective(client,{id:'west'});await room.pendingItemUses.get('hunter');
  p.x=-30;p.z=-17;
  let saved=(await characterStore.loadOrCreateById(id,{x:0,z:0})).character;
  assert.deepEqual(saved.forestObjective,{id:'west',progress:0});
  for(let i=0;i<3;i++){room.grantMonsterExperience('hunter',undefined,8,'normal',false,'forest_west_1');await room.pendingRewards.get('hunter');}
  saved=(await characterStore.loadOrCreateById(id,{x:0,z:0})).character;
  assert.deepEqual(saved.forestObjective,{id:'west',progress:3},'progress survives reconnect');
  room.grantMonsterExperience('hunter',undefined,8,'normal',false,'forest_east_1');await room.pendingRewards.get('hunter');
  assert.equal(room.forestObjectives.get('hunter').progress,3,'wrong camp does not advance');
  for(let i=0;i<4;i++){room.grantMonsterExperience('hunter',undefined,8,'normal',false,'forest_west_1');await room.pendingRewards.get('hunter');}
  assert.equal(room.forestObjectives.get('hunter').progress,7);
  const save=characterStore.save.bind(characterStore),before=p.experience;
  characterStore.save=async()=>{throw Error('disk unavailable');};
  const logError=console.error;console.error=()=>{};
  room.grantMonsterExperience('hunter',undefined,8,'normal',false,'forest_west_1');await room.pendingRewards.get('hunter');
  console.error=logError;characterStore.save=save;
  assert.equal(room.forestObjectives.get('hunter').progress,7);assert.equal(p.experience,before,'failed save awards neither quest progress nor EXP');
  const level=p.level,bonus=monsterExperience(level,8)*2;
  room.grantMonsterExperience('hunter',undefined,8,'normal',false,'forest_west_1');await room.pendingRewards.get('hunter');
  const completion=events.find(e=>e.type==='experience_gained' && e.data.forestObjectiveCompleted);
  assert.equal(completion.data.forestObjectiveBonus,bonus);assert.equal(room.forestObjectives.has('hunter'),false);
  saved=(await characterStore.loadOrCreateById(id,{x:0,z:0})).character;
  assert.equal(saved.forestObjective,null,'completion and EXP are saved together');
  room.grantMonsterExperience('hunter',undefined,8,'normal',false,'forest_west_1');await room.pendingRewards.get('hunter');
  assert.equal(events.filter(e=>e.type==='experience_gained' && e.data.forestObjectiveCompleted).length,1,'completion cannot pay twice');
  const friendId='e'.repeat(64),friend=new Player({characterName:'Friend',pathId:'blade',ancestryId:'woodland',mapId:'forbidden_forest',level:8,experience:0,x:-29,z:-17,y:0,alive:true,hp:300,maxHp:500,mana:120,stamina:100});
  room.state.players.set('friend',friend);room.persistentCharacters.set('friend',friendId);room.inventories.set('friend',makeStarterInventory());
  room.forestObjectives.set('hunter',{id:'east',progress:0});room.forestObjectives.set('friend',{id:'east',progress:0});
  const invitation=room.parties.invite('hunter','friend',0);room.parties.accept('friend',invitation.id,1);
  room.awardMonsterExperience('hunter',{id:'forest_east_1',mapId:'forbidden_forest',level:8,x:-30,y:0,z:-17},'normal');
  await Promise.all([room.pendingRewards.get('hunter'),room.pendingRewards.get('friend')]);
  assert.equal(room.forestObjectives.get('hunter').progress,1);assert.equal(room.forestObjectives.get('friend').progress,1,'eligible party members share objective progress');
  const ranger=objectiveRanger('bamboo_frontier');p.mapId=ranger.mapId;p.x=ranger.x;p.y=ranger.y;p.z=ranger.z;
  room.changeForestObjective(client,{id:null});await room.pendingItemUses.get('hunter');
  room.changeForestObjective(client,{id:'atlas_bamboo_frontier_1'});await room.pendingItemUses.get('hunter');
  room.grantMonsterExperience('hunter',undefined,25,'normal',false,'atlas_bamboo_frontier_1_1');await room.pendingRewards.get('hunter');
  assert.equal(room.forestObjectives.get('hunter').progress,1,'regional NPC issues a working regional mission');
  saved=(await characterStore.loadOrCreateById(id,{x:0,z:0})).character;
  assert.equal(saved.forestObjective.id,'atlas_bamboo_frontier_1');
  console.log('PASS: NPC proximity and locations, forest and regional missions, party credit and atomic rewards');
} finally {
  const target=realpathSync(dir),tempRoot=realpathSync(tmpdir());
  if(path.dirname(target)!==tempRoot || !path.basename(target).startsWith('montra-forest-objective-'))throw Error('unsafe test cleanup');
  rmSync(target,{recursive:true,force:true});
}
