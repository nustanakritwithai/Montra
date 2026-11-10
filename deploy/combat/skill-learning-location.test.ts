import test from "node:test";
import assert from "node:assert/strict";
import {MyRoom} from "./MyRoom.js";
import {Player,Monster} from "./schema/MyRoomState.js";
import {CommandBucket} from "./GameRules.js";
import {characterStore,type CharacterSnapshot} from "./CharacterStore.js";
import {makeStarterInventory} from "./ItemRules.js";
import {newSwordTree,SWORD_NODES,SWORD_CORE,SWORD_RANKABLE_SKILLS} from "./SkillCatalog.js";
import {newMuayBook,MUAY_LESSONS,MUAY_CORE,MUAY_RANKABLE_SKILLS} from "./MuayRules.js";
import {newOccultBook,OCCULT_LESSONS,SEER_CORE,MENDER_CORE,OCCULT_RANKABLE_SKILLS} from "./OccultRules.js";
import {newBladeBook,BLADE_LESSONS,BLADE_CORE,BLADE_RANKABLE_SKILLS} from "./BladeRules.js";
import {newSentinelBook,SENTINEL_LESSONS,SENTINEL_CORE,SENTINEL_RANKABLE_SKILLS} from "./SentinelRules.js";
import {DEFAULT_MAP_ID,WORLD_MAPS} from "./WorldMaps.js";

// Synthetic rooms and in-memory save replacement only. Never use player files.
const cases=[
  {path:"phutthaisawan",map:"swordTrees",snapshot:"swordTree",make:newSwordTree,nodes:SWORD_NODES,core:SWORD_CORE,target:"final_counter",rank:"footwork",channel:"sword_tree",rankable:SWORD_RANKABLE_SKILLS},
  {path:"muay_boran",map:"muayBooks",snapshot:"muayBook",make:newMuayBook,nodes:MUAY_LESSONS,core:MUAY_CORE,target:"chaiya_final_counter",rank:"chaiya_elbow",channel:"muay_book",rankable:MUAY_RANKABLE_SKILLS},
  {path:"seer",map:"occultBooks",snapshot:"occultBook",make:newOccultBook,nodes:OCCULT_LESSONS,core:SEER_CORE,target:"seer_spirit_rain",rank:"seer_mark",channel:"occult_book",rankable:OCCULT_RANKABLE_SKILLS},
  {path:"mender",map:"occultBooks",snapshot:"occultBook",make:newOccultBook,nodes:OCCULT_LESSONS,core:MENDER_CORE,target:"mender_spirit_rice",rank:"mender_heal",channel:"occult_book",rankable:OCCULT_RANKABLE_SKILLS},
  {path:"blade",map:"bladeBooks",snapshot:"bladeBook",make:newBladeBook,nodes:BLADE_LESSONS,core:BLADE_CORE,target:"sealed_finale",rank:"hidden_edge",channel:"blade_book",rankable:BLADE_RANKABLE_SKILLS},
  {path:"sentinel",map:"sentinelBooks",snapshot:"sentinelBook",make:newSentinelBook,nodes:SENTINEL_LESSONS,core:SENTINEL_CORE,target:"enduring_ward",rank:"bash",channel:"sentinel_book",rankable:SENTINEL_RANKABLE_SKILLS},
];
type Case=typeof cases[number];
type Action="learn"|"upgrade"|"core_upgrade";
function fillCounters(value:any,amount:number):void {
  for(const key of Object.keys(value)) {
    if(typeof value[key]==="number")value[key]=amount;
    else if(value[key] && typeof value[key]==="object")fillCounters(value[key],amount);
  }
}
function prerequisites(c:Case,target:string):string[] {
  const result:string[]=[];
  function visit(id:string){for(const req of (c.nodes as any)[id].requires){visit(req);if(!result.includes(req))result.push(req);}}
  visit(target);return result;
}
function setLearned(c:Case,book:any,ids:string[]):void {
  if(c.channel==="occult_book")book.learned[c.path]=ids;else book.learned=ids;
}
function fixture(c:Case,action:Action="learn",location={mapId:DEFAULT_MAP_ID,x:30,y:0,z:30}) {
  const room=new MyRoom(),r=room as any,id="synthetic-learning-session";
  const player=new Player({pathId:c.path,ancestryId:"woodland",level:100,alive:true,...location});
  room.state.players.set(id,player);
  r.inventories.set(id,makeStarterInventory());r.persistentCharacters.set(id,"c".repeat(64));
  r.gates.set(id,{build:new CommandBucket(100,100),occult:new CommandBucket(100,100),swordTree:new CommandBucket(100,100)});
  r.simulatedMs=10000;r.broadcast=()=>{};
  const book:any=c.make();
  for(const field of ["training","practice","mastery"])if(book[field])fillCounters(book[field],10000);
  const ids=action==="core_upgrade"?[]:prerequisites(c,action==="upgrade"?c.rank:c.target);
  if(action==="upgrade")ids.push(c.rank);
  setLearned(c,book,ids);r[c.map].set(id,book);
  const notices:Array<{type:string;data:any}>=[];
  const client:any={sessionId:id,send:(type:string,data:any)=>notices.push({type,data})};
  const get=()=>r[c.map].get(id);
  const send=(a:string=action,skillId:string=a==="core_upgrade"?Object.keys(c.core)[0]:a==="upgrade"?c.rank:c.target,extra:any={})=>{
    if(c.channel==="sword_tree") {
      if(a==="core_upgrade" || a==="core_reset")r.messages.sword_core_book(client,{action:a==="core_upgrade"?"upgrade":"reset",...(a==="core_upgrade"?{skillId}:{}),...extra});
      else r.messages[`sword_tree_${a}`](client,{...(["learn","upgrade","equip"].includes(a)?{skillId}:{}),...extra});
    }else r.messages[c.channel](client,{action:a,...(["learn","upgrade","core_upgrade","equip"].includes(a)?{skillId}:{}),...extra});
  };
  return {r,id,player,book,notices,get,send,pending:()=>r.pendingItemUses.get(id) as Promise<void>|undefined};
}
async function withSave(run:(writes:CharacterSnapshot[])=>Promise<void>) {
  const original=characterStore.save,writes:CharacterSnapshot[]=[];
  characterStore.save=async snapshot=>{writes.push(structuredClone(snapshot));};
  try{await run(writes);}finally{characterStore.save=original;}
}
function assertLearned(c:Case,f:ReturnType<typeof fixture>,action:Action) {
  const b=f.get();
  if(action==="learn")assert.ok((c.channel==="occult_book"?b.learned[c.path]:b.learned).includes(c.target));
  else if(action==="upgrade")assert.equal(b.ranks[c.rank],1);
  else assert.equal(b[c.path==="mender"?"menderCoreRanks":"coreRanks"][Object.keys(c.core)[0]],1);
}
for(const c of cases) {
  for(const action of ["learn","upgrade","core_upgrade"] as const) {
    test(`${c.path}: ${action} works outside shrine, in every enabled map, and airborne`,()=>withSave(async writes=>{
      const locations=[{mapId:DEFAULT_MAP_ID,x:30,y:0,z:30},...Object.keys(WORLD_MAPS).map(mapId=>({mapId,x:0,y:0,z:0})),{mapId:DEFAULT_MAP_ID,x:0,y:20,z:0}];
      for(const location of locations){
        const f=fixture(c,action,location),before=structuredClone(f.get());f.send();
        assert.ok(f.pending(),`${JSON.stringify(location)} ${JSON.stringify(f.notices)}`);
        assert.deepEqual(f.get(),before,"not applied before save resolves");
        await f.pending();assertLearned(c,f,action);
        assert.deepEqual((writes.at(-1) as any)[c.snapshot],f.get(),"durable snapshot matches applied progression");
        assert.ok(!f.notices.some(n=>n.type==="command_rejected"));
      }
    }));
    test(`${c.path}: ${action} keeps the exact 5-second combat boundary`,()=>withSave(async writes=>{
      for(const elapsed of [0,4999,5000,5001]){
        const f=fixture(c,action);f.r.lastCombatMs.set(f.id,f.r.simulatedMs-elapsed);const count=writes.length;f.send();
        if(elapsed<5000){assert.equal(f.pending(),undefined);assert.equal(writes.length,count);assert.ok(f.notices.some(n=>n.type==="command_rejected" && n.data.reason==="skill_learning_in_combat"));}
        else {assert.ok(f.pending());await f.pending();assertLearned(c,f,action);}
      }
    }));
    test(`${c.path}: ${action} rejects moving transitions and pending attacks before the first hit`,()=>withSave(async writes=>{
      const blockers=["climbs","flightTransitions","activeDashes","own_attack","incoming_attack","central_monster","forest_monster",
        ...["sentinelWindups","bladeWindups","muayCoreSequences","swordCoreSequences"].flatMap(key=>[`own_${key}`,`incoming_${key}`])];
      for(const blocker of blockers){
        const f=fixture(c,action),before=structuredClone(f.get());
        assert.equal(f.r.lastCombatMs.has(f.id),false,"pending combat itself must prevent learning");
        if(["climbs","flightTransitions","activeDashes"].includes(blocker))f.r[blocker].set(f.id,{});
        else if(blocker==="own_attack")f.r.attackTargets.set(f.id,"enemy");
        else if(blocker==="incoming_attack")f.r.attackTargets.set("enemy",f.id);
        else if(blocker==="central_monster")f.r.state.monster.targetId=f.id;
        else if(blocker==="forest_monster")f.r.state.monsters.set("synthetic-monster",new Monster({alive:true,targetId:f.id}));
        else {const own=blocker.startsWith("own_");const key=blocker.slice(own?4:9);f.r[key].set(own?f.id:"enemy",{targetId:own?"enemy":f.id});}
        f.send();assert.equal(f.pending(),undefined,blocker);assert.deepEqual(f.get(),before,blocker);
        assert.ok(f.notices.some(n=>n.type==="command_rejected"),blocker);
        assert.equal(writes.length,0,`${blocker} must not begin a durable-save combat freeze`);
      }
    }));
    test(`${c.path}: ${action} rejects unknown skills without saving`,()=>withSave(async writes=>{
      for(const skillId of ["not_a_skill","__proto__","constructor"]){
        const f=fixture(c,action),before=structuredClone(f.get());f.send(action,skillId);
        assert.equal(f.pending(),undefined);assert.deepEqual(f.get(),before);assert.ok(f.notices.some(n=>n.type==="command_rejected"));
      }
      assert.equal(writes.length,0);
    }));
    test(`${c.path}: ${action} commits only once when requests overlap`,async()=>{
      const original=characterStore.save;let release!:()=>void;const barrier=new Promise<void>(resolve=>release=resolve);
      const f=fixture(c,action),before=structuredClone(f.get());const writes:CharacterSnapshot[]=[];
      characterStore.save=async snapshot=>{writes.push(structuredClone(snapshot));await barrier;};
      try{
        f.send();const pending=f.pending();assert.ok(pending);f.send();assert.equal(writes.length,1);
        assert.deepEqual(f.get(),before);assert.ok(f.notices.some(n=>n.data?.reason==="character_busy"));
        release();await pending;assertLearned(c,f,action);assert.deepEqual((writes[0] as any)[c.snapshot],f.get());
        assert.equal(f.r.pendingWarps.has(f.id),false);assert.equal(f.pending(),undefined);
      }finally{release();characterStore.save=original;}
    });
    test(`${c.path}: ${action} is atomic on save failure and rejects concurrent writes`,async()=>{
      const original=characterStore.save;let release!:()=>void;const barrier=new Promise<void>(resolve=>release=resolve);
      const f=fixture(c,action),before=structuredClone(f.get());let calls=0;
      characterStore.save=async()=>{calls++;await barrier;throw Error("synthetic save failure");};
      try{
        f.send();const pending=f.pending();assert.ok(pending);assert.equal(f.r.pendingWarps.has(f.id),true);
        f.send();assert.equal(calls,1);assert.ok(f.notices.some(n=>n.data?.reason==="character_busy"));
        assert.deepEqual(f.get(),before);release();await pending;
        assert.deepEqual(f.get(),before);assert.equal(f.pending(),undefined);assert.equal(f.r.pendingWarps.has(f.id),false);
        assert.ok(!f.notices.some(n=>n.type.endsWith("_changed")),"failure never acknowledges success");
        characterStore.save=async()=>{calls++;};f.send();await f.pending();assertLearned(c,f,action);assert.equal(calls,2,"retry succeeds after failure releases lock");
      }finally{release();characterStore.save=original;}
    });
  }
  test(`${c.path}: rejects malformed, dead, busy, wrong-class, low-level and unmet practice requests`,()=>withSave(async writes=>{
    for(const invalid of ["malformed","dead","busy","class","level","practice","prerequisite"]){
      const f=fixture(c);
      if(invalid==="dead")f.player.alive=false;
      if(invalid==="busy")f.r.pendingWarps.add(f.id);
      if(invalid==="class")f.player.pathId="not_a_class";
      if(invalid==="level"){f.player.level=1;setLearned(c,f.book,[]);}
      if(invalid==="practice")for(const field of ["training","practice","mastery"])if(f.book[field])fillCounters(f.book[field],0);
      if(invalid==="prerequisite")setLearned(c,f.book,[]);
      const expected=structuredClone(f.get());f.send("learn",c.target,invalid==="malformed"?{unexpected:true}:{});
      assert.equal(f.pending(),undefined,invalid);assert.deepEqual(f.get(),expected,invalid);assert.ok(f.notices.some(n=>n.type==="command_rejected"),invalid);
    }
    assert.equal(writes.length,0);
  }));
  test(`${c.path}: duplicate learn never spends twice`,()=>withSave(async writes=>{
    const f=fixture(c);f.send();await f.pending();const before=structuredClone(f.get());f.send();await f.pending();
    assert.equal(writes.length,1);assert.deepEqual(f.get(),before);assert.ok(f.notices.some(n=>n.type==="command_rejected"));
  }));
  test(`${c.path}: advanced upgrade cannot overspend a fully allocated legal book`,()=>withSave(async writes=>{
    const allowed:readonly string[]=c.rankable;
    const f=fixture(c,"upgrade");let prepared=false;
    for(const level of [25,45,65,85,95,100]){
      const budget=1+Math.floor((level-1)/2),maxRank=[25,45,65,85,95].filter(n=>n<=level).length;
      const ids=Object.keys(c.nodes).filter(id=>{const n=(c.nodes as any)[id];return n.level<=level && (!n.path || n.path===c.path) && (!n.school || n.school==="common" || n.school===f.book.school);});
      let remaining=budget-ids.length;if(remaining<0 || !ids.includes(c.rank))continue;
      const ranks:Record<string,number>={};
      for(const id of ids.filter(id=>allowed.includes(id))){const count=Math.min(remaining,maxRank-(id===c.rank?1:0));if(count>0)ranks[id]=count;remaining-=count;}
      if(remaining!==0)continue;
      f.player.level=level;f.book.ranks=ranks;setLearned(c,f.book,ids);prepared=true;break;
    }
    assert.ok(prepared,"fixture must use a valid exhausted point budget");const before=structuredClone(f.get());f.send();
    assert.equal(f.pending(),undefined);assert.deepEqual(f.get(),before);assert.equal(writes.length,0);
    assert.ok(f.notices.some(n=>n.type==="command_rejected" && n.data.reason.endsWith("no_points")));
  }));
  test(`${c.path}: core point budget cannot be overspent`,()=>withSave(async writes=>{
    const f=fixture(c,"core_upgrade");f.player.level=13;f.send();await f.pending();assert.equal(writes.length,1);
    const before=structuredClone(f.get());f.send("core_upgrade",Object.keys(c.core)[1]);await f.pending();
    assert.equal(writes.length,1);assert.deepEqual(f.get(),before);assert.ok(f.notices.some(n=>n.type==="command_rejected"));
  }));
  test(`${c.path}: reset/equip/school keep their existing shrine restrictions`,()=>withSave(async writes=>{
    for(const action of ["reset","core_reset","equip",...(["phutthaisawan","muay_boran"].includes(c.path)?["school"]:[])]){
      const f=fixture(c,"upgrade");f.send(action,c.rank,action==="equip"?{slot:0}:action==="school"?{school:c.path==="muay_boran"?"korat":"sritrairat"}:{});
      if(action==="equip" && c.path==="phutthaisawan"){assert.ok(f.pending());await f.pending();}
      else {assert.equal(f.pending(),undefined);assert.ok(f.notices.some(n=>n.type==="command_rejected"));}
    }
    assert.equal(writes.length,c.path==="phutthaisawan"?1:0);
  }));
}
