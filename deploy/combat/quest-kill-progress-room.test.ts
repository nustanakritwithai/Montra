import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import type {Client} from "colyseus";
import {MyRoom} from "./MyRoom.js";
import {Monster,Player} from "./schema/MyRoomState.js";
import {characterStore,type CharacterSnapshot} from "./CharacterStore.js";
import {makeStarterInventory,type InventorySnapshot} from "./ItemRules.js";
import {FOREST_OBJECTIVES,type ForestObjective} from "./ForestObjectives.js";
import {PartyManager} from "./PartyManager.js";
import {monsterExperience} from "./Progression.js";

type Internals={persistentCharacters:Map<string,string>;inventories:Map<string,InventorySnapshot>;
  forestObjectives:Map<string,ForestObjective>;forestDefenses:Map<string,{id:string;hp:number;nextAttack:number}>;
  pendingRewards:Map<string,Promise<void>>;pendingWarps:Set<string>;parties:PartyManager;
  awardMonsterExperience(id:string,monster:InstanceType<typeof Monster>,tier:"normal"):void};
type Event={id:string;type:string;data:any};
function fixture(){
  const room=new MyRoom(),inside=room as unknown as Internals,events:Event[]=[];
  const monster=new Monster({id:"forest_west_1",mapId:"forbidden_forest",x:0,y:0,z:0,alive:false,level:1});
  room.state.monsters.set(monster.id,monster);
  function actor(id:string,level=21,objective:ForestObjective|null={id:"west",progress:0},overrides={}){
    const player=new Player({characterName:"Quest tester",mapId:monster.mapId,x:0,y:0,z:0,level,alive:true,hp:100,...overrides});
    room.state.players.set(id,player);inside.persistentCharacters.set(id,createHash("sha256").update(id).digest("hex"));
    inside.inventories.set(id,makeStarterInventory());if(objective)inside.forestObjectives.set(id,objective);
    room.clients.push({sessionId:id,send:(type:string,data:unknown)=>events.push({id,type,data})} as unknown as Client);
    return player;
  }
  function party(ids:string[]){for(const id of ids.slice(1)){
    const invitation=inside.parties.invite(ids[0],id,0);inside.parties.accept(id,invitation.id,0);
  }}
  const award=async(id:string)=>{inside.awardMonsterExperience(id,monster,"normal");await Promise.all(inside.pendingRewards.values());};
  return {room,inside,events,monster,actor,party,award};
}

for(const level of [1,21,100])test(`existing hunt progresses at level ${level}, independently of EXP`,async()=>{
  const f=fixture(),player=f.actor("solo",level),save=characterStore.save,saved:CharacterSnapshot[]=[];
  characterStore.save=async snapshot=>{saved.push(structuredClone(snapshot));};
  try{
    await f.award("solo");
    assert.equal(f.inside.forestObjectives.get("solo")?.progress,1);
    assert.equal(saved.length,1);assert.equal(saved[0].forestObjective?.progress,1);
    assert.equal(player.level,level);assert.equal(player.experience,level===1?monsterExperience(1,1):0);
    assert.equal(f.events.find(e=>e.type==="forest_objective_state")?.data.active.progress,1);
    assert.equal(f.events.find(e=>e.type==="experience_gained")?.data.amount,level===1?monsterExperience(1,1):0);
    assert.deepEqual(saved[0].inventory,f.inside.inventories.get("solo"));
  }finally{characterStore.save=save;}
});

test("zero-EXP completion commits once and announces the next objective state",async()=>{
  const f=fixture();f.actor("solo",21,{id:"west",progress:7});
  const save=characterStore.save,saved:CharacterSnapshot[]=[];
  characterStore.save=async snapshot=>{saved.push(structuredClone(snapshot));};
  try{
    await f.award("solo");await f.award("solo");
    assert.equal(saved.length,1);assert.equal(saved[0].forestObjective,null);assert.equal(f.inside.forestObjectives.has("solo"),false);
    assert.equal(f.events.filter(e=>e.type==="forest_objective_state").length,1);
    assert.equal(f.events.find(e=>e.type==="forest_objective_state")?.data.active,null);
    const receipts=f.events.filter(e=>e.type==="experience_gained");assert.equal(receipts.length,1);
    assert.equal(receipts[0].data.forestObjectiveCompleted,"west");assert.equal(receipts[0].data.amount,0);
  }finally{characterStore.save=save;}
});

for(const fail of [false,true])test(`zero-EXP quest progress waits for its save${fail?" and rolls back on failure":""}`,async()=>{
  const f=fixture();f.actor("solo");const save=characterStore.save;
  let unblock!:()=>void;const barrier=new Promise<void>(resolve=>{unblock=resolve;});
  let writes=0;characterStore.save=async()=>{writes++;await barrier;if(fail)throw Error("expected quest save failure");};
  try{
    f.inside.awardMonsterExperience("solo",f.monster,"normal");const pending=f.inside.pendingRewards.get("solo");assert.ok(pending);
    await new Promise<void>(resolve=>setImmediate(resolve));
    assert.equal(writes,1);assert.equal(f.inside.forestObjectives.get("solo")?.progress,0);
    assert.equal(f.events.length,0);assert.equal(f.inside.pendingWarps.has("solo"),true);
    unblock();await pending;
    assert.equal(f.inside.forestObjectives.get("solo")?.progress,fail?0:1);
    assert.equal(f.events.some(e=>e.type==="forest_objective_state"),!fail);
    assert.equal(f.events.some(e=>e.type==="experience_gained"),!fail);
    assert.equal(f.events.some(e=>e.type==="character_save_error"),fail);
    assert.equal(f.inside.pendingRewards.has("solo"),false);assert.equal(f.inside.pendingWarps.has("solo"),false);
    if(fail){characterStore.save=async()=>{};await f.award("solo");assert.equal(f.inside.forestObjectives.get("solo")?.progress,1);}
  }finally{unblock();characterStore.save=save;}
});

for(const variant of ["wrong target","wrong map","delivery hand-in","inactive defense","no quest"])test(`zero-EXP kill does not advance ${variant}`,async()=>{
  const f=fixture(),objective=variant==="delivery hand-in"?{id:"delivery_forbidden_forest_bound_temple",progress:4}:
    variant==="inactive defense"?{id:"defense_forbidden_forest",progress:0}:variant==="no quest"?null:{id:"west",progress:0};
  f.actor("solo",21,objective);
  if(variant==="wrong target")f.monster.id="forest_east_1";
  if(variant==="wrong map")f.room.state.players.get("solo")!.mapId="bound_temple";
  const save=characterStore.save;let writes=0;characterStore.save=async()=>{writes++;};
  try{await f.award("solo");assert.equal(writes,0);assert.deepEqual(f.inside.forestObjectives.get("solo")??null,objective);assert.equal(f.events.length,0);}
  finally{characterStore.save=save;}
});

test("zero-EXP patrol selects the next camp and delivery stops for its NPC hand-in",async()=>{
  const f=fixture();f.actor("solo",21,{id:"trail",progress:0});const save=characterStore.save;characterStore.save=async()=>{};
  try{
    await f.award("solo");assert.equal(f.inside.forestObjectives.get("solo")?.progress,1);
    await f.award("solo");assert.equal(f.inside.forestObjectives.get("solo")?.progress,1);
    f.inside.forestObjectives.set("solo",{id:"delivery_forbidden_forest_bound_temple",progress:3});
    await f.award("solo");assert.equal(f.inside.forestObjectives.get("solo")?.progress,4);
    await f.award("solo");assert.equal(f.inside.forestObjectives.get("solo")?.progress,4);
    assert.equal(f.events.some(e=>e.data.forestObjectiveCompleted),false);
  }finally{characterStore.save=save;}
});

test("zero-EXP defense still requires an active guard and both participants in the camp",async()=>{
  const f=fixture(),def=FOREST_OBJECTIVES.defense_forbidden_forest,area=def.defense!;
  const player=f.actor("solo",21,{id:"defense_forbidden_forest",progress:0},{x:area.x,z:area.z});
  f.monster.x=area.x;f.monster.z=area.z;
  f.inside.forestDefenses.set("solo",{id:"defense_forbidden_forest",hp:120,nextAttack:10000});
  const save=characterStore.save;characterStore.save=async()=>{};
  try{
    await f.award("solo");assert.equal(f.inside.forestObjectives.get("solo")?.progress,1);
    player.x=area.x+area.radius+1;await f.award("solo");assert.equal(f.inside.forestObjectives.get("solo")?.progress,1);
    player.x=area.x;f.monster.x=area.x+area.radius+1;await f.award("solo");assert.equal(f.inside.forestObjectives.get("solo")?.progress,1);
  }finally{characterStore.save=save;}
});

test("party zero-EXP quest credit preserves the earner's share and excludes unrelated loot-only recipients",async()=>{
  const f=fixture();const earner=f.actor("earner",1,null);f.actor("veteran",21);f.actor("capped",100);f.actor("idle",21,null);
  f.party(["earner","veteran","capped","idle"]);
  const save=characterStore.save,saved:CharacterSnapshot[]=[];characterStore.save=async snapshot=>{saved.push(structuredClone(snapshot));};
  try{
    await f.award("earner");
    assert.equal(earner.experience,50,"existing party EXP division is unchanged");
    assert.equal(f.inside.forestObjectives.get("veteran")?.progress,1);assert.equal(f.inside.forestObjectives.get("capped")?.progress,1);
    assert.equal(saved.length,3);assert.equal(f.events.some(e=>e.id==="idle"),false);
  }finally{characterStore.save=save;}
});

for(const excluded of [{alive:false},{x:21},{mapId:"bound_temple"},{transit:true},{transient:true}])test(`party quest credit excludes ${JSON.stringify(excluded)}`,async()=>{
  const f=fixture();f.actor("winner",21);f.actor("excluded",21,{id:"west",progress:0},excluded);f.party(["winner","excluded"]);
  if("transit" in excluded)f.inside.pendingWarps.add("excluded");if("transient" in excluded)f.inside.persistentCharacters.delete("excluded");
  const save=characterStore.save;characterStore.save=async()=>{};
  try{await f.award("winner");assert.equal(f.inside.forestObjectives.get("winner")?.progress,1);assert.equal(f.inside.forestObjectives.get("excluded")?.progress,0);assert.equal(f.events.some(e=>e.id==="excluded"),false);}
  finally{characterStore.save=save;}
});


test("queued zero-EXP kills save successive quest progress without losing either kill",async()=>{
  const f=fixture();f.actor("solo");const save=characterStore.save,saved:CharacterSnapshot[]=[];
  let unblock!:()=>void;const barrier=new Promise<void>(resolve=>{unblock=resolve;});
  characterStore.save=async snapshot=>{saved.push(structuredClone(snapshot));if(saved.length===1)await barrier;};
  try{
    f.inside.awardMonsterExperience("solo",f.monster,"normal");
    await new Promise<void>(resolve=>setImmediate(resolve));
    f.inside.awardMonsterExperience("solo",f.monster,"normal");
    assert.equal(saved.length,1);assert.equal(f.inside.forestObjectives.get("solo")?.progress,0);
    unblock();await Promise.all(f.inside.pendingRewards.values());
    assert.deepEqual(saved.map(s=>s.forestObjective?.progress),[1,2]);
    assert.equal(f.inside.forestObjectives.get("solo")?.progress,2);
    assert.deepEqual(f.events.filter(e=>e.type==="forest_objective_state").map(e=>e.data.active.progress),[1,2]);
  }finally{unblock();characterStore.save=save;}
});


test("level-10 temple guardian advances its matching NPC hunt and completes after eight kills",async()=>{
  const f=fixture(),player=f.actor("solo",10,{id:"temple_forecourt",progress:0},{mapId:"bound_temple"});
  f.monster.id="temple_forecourt_3";f.monster.mapId="bound_temple";f.monster.level=10;
  const save=characterStore.save,saved:CharacterSnapshot[]=[];characterStore.save=async snapshot=>{saved.push(structuredClone(snapshot));};
  try{
    await f.award("solo");
    assert.equal(player.experience,1250);assert.equal(f.inside.forestObjectives.get("solo")?.progress,1);
    for(let i=1;i<8;i++)await f.award("solo");
    assert.equal(saved.length,8);assert.equal(saved[7].forestObjective,null);
    assert.deepEqual(f.events.filter(e=>e.type==="forest_objective_state").map(e=>e.data.active?.progress??null),[1,2,3,4,5,6,7,null]);
    assert.equal(f.events.filter(e=>e.data.forestObjectiveCompleted==="temple_forecourt").length,1);
  }finally{characterStore.save=save;}
});

test("queued defense reward uses the defeated position even if the monster moves before saving",async()=>{
  const f=fixture(),area=FOREST_OBJECTIVES.defense_forbidden_forest.defense!;
  f.actor("solo",21,{id:"defense_forbidden_forest",progress:0},{x:area.x,z:area.z});
  Object.assign(f.monster,{x:area.x,z:area.z});
  f.inside.forestDefenses.set("solo",{id:"defense_forbidden_forest",hp:120,nextAttack:10000});
  const save=characterStore.save;
  characterStore.save=async()=>{};
  try{
    f.inside.awardMonsterExperience("solo",f.monster,"normal");
    f.monster.x=area.x+area.radius+1;
    await Promise.all(f.inside.pendingRewards.values());
    assert.equal(f.inside.forestObjectives.get("solo")?.progress,1);
  }finally{characterStore.save=save;}
});
