import test from "node:test";
import assert from "node:assert/strict";
import type {Client} from "colyseus";
import {MyRoom} from "./MyRoom.js";
import {Player} from "./schema/MyRoomState.js";
import {CommandBucket} from "./GameRules.js";
import {characterStore,type CharacterSnapshot} from "./CharacterStore.js";
import {makeClassInventory,type InventorySnapshot} from "./ItemRules.js";
import {FOREST_OBJECTIVES,objectiveRanger,type ForestObjective} from "./ForestObjectives.js";
import {groundAt} from "./WorldMaps.js";
import {addExperience,cycleExperience,monsterExperience,xpForNextLevel} from "./Progression.js";
import {classLearningLevel,newRebirthState,recordClassLevel,startNextLife,type RebirthState} from "./Rebirth.js";
import {masteryPreview} from "./RebirthCombat.js";
import {personalGearGuides} from "./GearGuides.js";
import {muayCorePoints} from "./MuayRules.js";
import {SEER_CORE} from "./OccultRules.js";

type Internals={messages:Record<string,(client:Client,message:unknown)=>void>;persistentCharacters:Map<string,string>;
  inventories:Map<string,InventorySnapshot>;forestObjectives:Map<string,ForestObjective>;gates:Map<string,{build:CommandBucket}>;
  pendingItemUses:Map<string,Promise<void>>;pendingWarps:Set<string>;sentItemCatalog:Set<string>;rebirthStates:Map<string,RebirthState>;
  forestEscorts:Map<string,{x:number;y:number;z:number;hp:number}>;updateForestEscorts(dt:number):void};

let finalLife=newRebirthState();
for(let i=0;i<15;i++)finalLife=startNextLife(finalLife,"seer",100);
const cases=[
  {name:"first life below training level",level:4,history:newRebirthState()},
  {name:"first life training unlock",level:12,history:newRebirthState()},
  {name:"returning class after rebirth",level:12,history:startNextLife(newRebirthState(),"seer",100)},
  {name:"new class after rebirth",level:12,history:startNextLife(newRebirthState(),"sentinel",100)},
  {name:"level 100 rebirth preview",level:99,history:startNextLife(newRebirthState(),"seer",100)},
  {name:"final life has no rebirth preview",level:99,history:finalLife},
  {name:"no level up",level:12,history:startNextLife(newRebirthState(),"seer",100),noLevel:true},
  {name:"catalog not requested",level:12,history:startNextLife(newRebirthState(),"seer",100),noCatalog:true},
  {name:"failed save preserves current guidance",level:12,history:startNextLife(newRebirthState(),"seer",100),failSave:true},
];

for(const kind of ["escort","delivery"] as const)for(const scenario of cases){
  test(`${kind} guidance: ${scenario.name}`,async()=>{
    const room=new MyRoom(),inside=room as unknown as Internals,id=`${kind}-guide`;
    const region=scenario.level===99?"spirit_rift":"forbidden_forest";
    const objectiveId=kind==="escort"?`escort_${region}`:`delivery_${region}_${scenario.level===99?"asura_peak":"bound_temple"}`;
    const def=FOREST_OBJECTIVES[objectiveId];assert.ok(def);
    const ranger=objectiveRanger(kind==="escort"?def.mapId:def.destinationMapId!);assert.ok(ranger);
    const experience="noLevel" in scenario?0:xpForNextLevel(scenario.level)-1;
    const player=new Player({characterName:"Guide tester",mapId:ranger.mapId,x:ranger.x,y:ranger.y,z:ranger.z,
      pathId:"seer",ancestryId:"shrine",level:scenario.level,experience,alive:true,hp:240});
    const history=recordClassLevel(scenario.history,"seer",player.level);
    const active={id:objectiveId,progress:kind==="escort"?0:def.goal-1};
    room.state.players.set(id,player);inside.persistentCharacters.set(id,"a".repeat(64));
    inside.inventories.set(id,makeClassInventory("seer"));inside.rebirthStates.set(id,history);
    inside.gates.set(id,{build:new CommandBucket(3,1)});inside.forestObjectives.set(id,active);
    if(!("noCatalog" in scenario))inside.sentItemCatalog.add(id);
    const events:Array<{type:string;data:unknown}>=[];
    const client={sessionId:id,send:(type:string,data:unknown)=>events.push({type,data})} as unknown as Client;
    room.clients.push(client);
    const original=characterStore.save;let saved:CharacterSnapshot|undefined,writes=0,unblock!:()=>void;
    const barrier=new Promise<void>(resolve=>{unblock=resolve;});
    characterStore.save=async snapshot=>{writes++;saved=structuredClone(snapshot);await barrier;if("failSave" in scenario)throw Error("expected quest save failure");};
    try{
      if(kind==="escort"){
        inside.messages.start_forest_escort(client,{});
        const escort=inside.forestEscorts.get(id),goal=def.escort;assert.ok(escort && goal);
        escort.x=player.x=goal.x;escort.z=player.z=goal.z;escort.y=player.y=groundAt(def.mapId,goal.x,goal.z);
        inside.updateForestEscorts(.1);
      }else inside.messages.finish_forest_delivery(client,{});
      const pending=inside.pendingItemUses.get(id);assert.ok(pending,"completion waits for its durable save");
      assert.equal(player.level,scenario.level);assert.equal(player.experience,experience);
      assert.deepEqual(inside.rebirthStates.get(id),history);assert.deepEqual(inside.forestObjectives.get(id),active);
      assert.equal(events.some(event=>event.type==="gear_guides" || event.type==="experience_gained"),false,"no premature guidance or reward");
      unblock();await pending;
      assert.equal(writes,1);assert.equal(inside.pendingWarps.has(id),false);assert.equal(inside.pendingItemUses.has(id),false);
      const guides=events.filter(event=>event.type==="gear_guides"),rewards=events.filter(event=>event.type==="experience_gained");
      if("failSave" in scenario){
        assert.equal(guides.length,0);assert.equal(rewards.length,0);
        assert.equal(player.level,scenario.level);assert.equal(player.experience,experience);
        assert.deepEqual(inside.rebirthStates.get(id),history);assert.deepEqual(inside.forestObjectives.get(id),active);
        assert.ok(events.some(event=>event.type==="command_rejected"));
        if(kind==="escort")assert.equal(inside.forestEscorts.has(id),true);
        return;
      }
      const bonus=cycleExperience(monsterExperience(scenario.level,def.rewardLevel??1)*(kind==="escort"?3:2),history.count);
      const next=addExperience(scenario.level,experience,bonus),nextHistory=recordClassLevel(history,"seer",next.level);
      assert.equal(player.level,next.level);assert.equal(player.experience,next.experience);
      assert.equal(saved?.level,next.level);assert.equal(saved?.experience,next.experience);assert.equal(saved?.forestObjective,null);
      assert.deepEqual(saved?.rebirth,nextHistory);assert.deepEqual(inside.rebirthStates.get(id),nextHistory);
      assert.equal(inside.forestObjectives.has(id),false);assert.equal(inside.forestEscorts.has(id),false);
      assert.deepEqual(rewards.map(event=>event.data),[{amount:bonus,...next,forestObjectiveCompleted:objectiveId,forestObjectiveBonus:bonus}]);
      const refresh=next.level!==scenario.level && !("noCatalog" in scenario);
      assert.equal(guides.length,refresh?1:0,"refresh only after a level up with a requested catalog");
      if(refresh){
        const learningLevel=classLearningLevel(nextHistory,"seer",next.level);
        const training=next.level>=13?{points:muayCorePoints(learningLevel),choices:Object.values(SEER_CORE).map(skill=>({name:skill.name,rank:1}))}:null;
        const rebirthPreview=next.level===100 && history.count<15
          ? {before:masteryPreview(nextHistory),after:masteryPreview(startNextLife(nextHistory,"seer",100))}:null;
        assert.deepEqual(guides[0].data,{...personalGearGuides("seer",next.level,learningLevel),learningLevel,cycle:history.count,training,rebirthPreview});
        assert.ok(events.indexOf(guides[0])<events.indexOf(rewards[0]),"guidance retains its pre-reward message ordering");
      }
      if(kind==="escort")inside.updateForestEscorts(.1);
      else inside.messages.finish_forest_delivery(client,{});
      assert.equal(writes,1,"completed objective cannot pay twice");
      assert.equal(events.filter(event=>event.type==="gear_guides").length,guides.length);
    }finally{unblock();characterStore.save=original;}
  });
}
