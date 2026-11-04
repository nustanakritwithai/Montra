import test from "node:test";
import assert from "node:assert/strict";
import {MyRoom} from "./MyRoom.js";
import {Monster,Player} from "./schema/MyRoomState.js";
import {characterStore,type CharacterSnapshot} from "./CharacterStore.js";
import {makeClassInventory,type InventorySnapshot} from "./ItemRules.js";
import {FOREST_OBJECTIVES,type ForestObjective} from "./ForestObjectives.js";
import {worldDirector} from "./WorldDirector.js";
import {groundAt} from "./WorldMaps.js";
import {addExperience,monsterExperience} from "./Progression.js";

type Internals={persistentCharacters:Map<string,string>;inventories:Map<string,InventorySnapshot>;forestObjectives:Map<string,ForestObjective>;
  forestDefenses:Map<string,{id:string;hp:number;nextAttack:number}>;directorClaims:Map<string,string[]>;pendingRewards:Map<string,Promise<void>>;
  grantMonsterExperience(id:string,amount:number,level:number,tier:"normal",boss:boolean,monsterId:string):void};

test("event bonus and claim save together and cannot pay twice",async()=>{
  worldDirector.observe("director-test",[{mapId:"forbidden_forest",level:5}]);await new Promise<void>(resolve=>setImmediate(resolve));
  const event=worldDirector.snapshot();assert.ok(event);const def=FOREST_OBJECTIVES[event.objectiveId];assert.equal(def.kind,"defense");
  const area=def.defense!,id="player",room=new MyRoom(),inside=room as unknown as Internals;
  const player=new Player({characterName:"Tester",mapId:def.mapId,x:area.x,y:groundAt(def.mapId,area.x,area.z),z:area.z,
    pathId:"seer",ancestryId:"shrine",level:1,alive:true,hp:240});
  const monsterId=def.prefix+"1",monster=new Monster({id:monsterId,mapId:def.mapId,x:area.x,z:area.z,alive:false,level:1});
  room.state.players.set(id,player);room.state.monsters.set(monsterId,monster);inside.persistentCharacters.set(id,"a".repeat(64));
  inside.inventories.set(id,makeClassInventory("seer"));
  const prepare=()=>{inside.forestObjectives.set(id,{id:event.objectiveId,progress:def.goal-1,directorEventId:event.id});
    inside.forestDefenses.set(id,{id:event.objectiveId,hp:100,nextAttack:10000});};
  const save=characterStore.save,writes:CharacterSnapshot[]=[];characterStore.save=async snapshot=>{writes.push(structuredClone(snapshot));};
  try{
    const first=addExperience(1,0,50+monsterExperience(1,1)*3);
    prepare();inside.grantMonsterExperience(id,50,1,"normal",false,monsterId);await inside.pendingRewards.get(id);
    assert.equal(player.level,first.level);assert.equal(player.experience,first.experience);assert.deepEqual(writes[0].directorClaims,[event.id]);assert.equal(writes[0].forestObjective,null);
    const second=addExperience(player.level,player.experience,50+monsterExperience(player.level,1)*2);
    prepare();inside.grantMonsterExperience(id,50,1,"normal",false,monsterId);await inside.pendingRewards.get(id);
    assert.equal(player.level,second.level);assert.equal(player.experience,second.experience);assert.deepEqual(writes[1].directorClaims,[event.id]);
  }finally{characterStore.save=save;worldDirector.forget("director-test");}
});
