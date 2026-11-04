import test from "node:test";
import assert from "node:assert/strict";
import {MyRoom} from "./MyRoom.js";
import {Monster,Player} from "./schema/MyRoomState.js";
import {characterStore,type CharacterSnapshot} from "./CharacterStore.js";
import {makeClassInventory,type InventorySnapshot} from "./ItemRules.js";
import {FOREST_OBJECTIVES,type ForestObjective} from "./ForestObjectives.js";
import {worldDirector} from "./WorldDirector.js";
import {groundAt} from "./WorldMaps.js";

type Internals={persistentCharacters:Map<string,string>;inventories:Map<string,InventorySnapshot>;forestObjectives:Map<string,ForestObjective>;
  forestDefenses:Map<string,{id:string;hp:number;nextAttack:number}>;pendingItemUses:Map<string,Promise<void>>;pendingRewards:Map<string,Promise<void>>;
  grantMonsterExperience(id:string,amount:number,level:number,tier:"normal",boss:boolean,monsterId:string):void};

test("a kill before the deadline retains its event bonus while the save is queued",async()=>{
  worldDirector.observe("deadline-test",[{mapId:"forbidden_forest",level:5}]);await new Promise<void>(resolve=>setImmediate(resolve));
  const event=worldDirector.snapshot();assert.ok(event);const def=FOREST_OBJECTIVES[event.objectiveId],area=def.defense!;
  const room=new MyRoom(),inside=room as unknown as Internals,id="player",monsterId=def.prefix+"1";
  const player=new Player({characterName:"Tester",mapId:def.mapId,x:area.x,y:groundAt(def.mapId,area.x,area.z),z:area.z,pathId:"seer",ancestryId:"shrine",level:1,alive:true,hp:240});
  room.state.players.set(id,player);room.state.monsters.set(monsterId,new Monster({id:monsterId,mapId:def.mapId,x:area.x,z:area.z,alive:false,level:1}));
  inside.persistentCharacters.set(id,"a".repeat(64));inside.inventories.set(id,makeClassInventory("seer"));
  inside.forestObjectives.set(id,{id:event.objectiveId,progress:def.goal-1,directorEventId:event.id});inside.forestDefenses.set(id,{id:event.objectiveId,hp:100,nextAttack:10000});
  let release!:()=>void;const barrier=new Promise<void>(resolve=>{release=resolve;});inside.pendingItemUses.set(id,barrier);
  const original=characterStore.save;let written:CharacterSnapshot|undefined;characterStore.save=async snapshot=>{written=structuredClone(snapshot);};
  try{
    inside.grantMonsterExperience(id,50,1,"normal",false,monsterId);
    worldDirector.snapshot(event.endsAt);release();await inside.pendingRewards.get(id);
    assert.deepEqual((written as CharacterSnapshot|undefined)?.directorClaims,[event.id]);
  }finally{release();characterStore.save=original;worldDirector.forget("deadline-test");}
});
