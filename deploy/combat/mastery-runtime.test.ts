import {test} from "node:test";
import {strict as assert} from "node:assert";
import {MyRoom} from "./MyRoom.js";
import {Player,SummonedGuardian} from "./schema/MyRoomState.js";
import {newRebirthState,startNextLife} from "./Rebirth.js";
import {MASTERY_ENABLED} from "./RebirthCombat.js";
import {PATHS,type PathId} from "./CharacterBuilds.js";
import {makeClassInventory,weaponBonuses,equippedStats} from "./ItemRules.js";
import {calculateStats,emptyAllocations,calculateDamage} from "./Progression.js";
import {CommandBucket} from "./GameRules.js";
import {newMuayBook} from "./MuayRules.js";
import {newSwordTree} from "./SkillCatalog.js";
import {newOccultBook} from "./OccultRules.js";
import {newBladeBook} from "./BladeRules.js";
import {newSentinelBook} from "./SentinelRules.js";

// Exercise actual room methods with server-owned fixtures; no sockets or production saves.
function fixture(path:PathId="muay_boran",veteran=true,level=100){
  const room=new MyRoom(),r=room as any,events:Array<{type:string;data:any}>=[];
  r.broadcast=(type:string,data:any)=>events.push({type,data});r.saveCharacter=async()=>{};
  let history=newRebirthState();
  if(veteran){for(const p of Object.keys(PATHS) as PathId[])for(let n=0;n<2;n++)history=startNextLife(history,p,100);
    while(history.count<15)history=startNextLife(history,"seer",100);}
  function add(id:string,school:PathId){
    const p=new Player({level,pathId:school,ancestryId:"shrine",characterName:"ทดสอบ",x:-10,z:8,y:0,alive:true,hp:240,mana:120});
    room.state.players.set(id,p);r.rebirthStates.set(id,history);r.inventories.set(id,makeClassInventory(school));r.statAllocations.set(id,emptyAllocations());
    r.gates.set(id,{attack:new CommandBucket(100,100),summon:new CommandBucket(100,100)});
    r.muayBooks.set(id,newMuayBook());r.muayCooldowns.set(id,{});r.swordTrees.set(id,newSwordTree());r.occultBooks.set(id,newOccultBook());r.bladeBooks.set(id,newBladeBook());r.sentinelBooks.set(id,newSentinelBook());
    r.applyStats(id,p,emptyAllocations());p.hp=p.maxHp;p.mana=p.maxMana;p.stamina=p.maxStamina;
    return p;
  }
  const p=add("one",path),opponent=add("two","sentinel");opponent.z=9.5;
  const monster=room.state.monster;Object.assign(monster,{x:-10,y:0,z:9.5,level:100,hp:10000,maxHp:10000,defense:100,alive:true});
  const client={sessionId:"one",send:(type:string,data:any)=>events.push({type,data})};
  return {room,r,p,opponent,monster,client,events,history,add};
}

test("real basic attacks use each class's mastery once in PvE and from the first PvP hit",()=>{
  assert.equal(MASTERY_ENABLED,true,"run this suite with MONTRA_MASTERY_ENABLED=1");
  for(const path of Object.keys(PATHS) as PathId[])for(const level of [1,50,100]){
    const {r,p,opponent,monster,events}=fixture(path,true,level);
    const base=equippedStats(calculateStats(level,emptyAllocations()),r.inventories.get("one"));
    r.attackTargets.set("one",monster.id);r.updatePlayerAttacks();
    const hit=events.find(e=>e.type==="combat_hit");assert(hit,path+" basic PvE did not hit");
    const magic=path==="seer"||path==="mender",w=weaponBonuses(r.inventories.get("one"),"pve");
    const factor=path==="phutthaisawan"?.8:1;
    assert.equal(hit.data.damage,calculateDamage(((magic?base.magicAtk:base.atk)+(magic?w.ranged:w.melee))*1.2*(magic?1:factor),monster.defense,100));
    const hpRatio=opponent.hp/opponent.maxHp;
    r.attackTargets.set("one","two");r.simulatedMs=3000;r.updatePlayerAttacks();
    const pk=events.find(e=>e.type==="pvp_hit");assert(pk,path+" basic PvP did not hit");
    const wp=weaponBonuses(r.inventories.get("one"),"pvp"),defBase=equippedStats(calculateStats(level,emptyAllocations()),r.inventories.get("two"));
    assert.equal(pk.data.damage,calculateDamage(((magic?base.magicAtk:base.atk)+(magic?wp.ranged:wp.melee))*1.07*(magic?1:factor),(magic?defBase.magicDef:defBase.def)*1.025,level));
    assert.ok(Math.abs(opponent.hp-(opponent.maxHp*hpRatio-pk.data.damage))<1e-8);
  }
});

test("repeated applyStats, PvP expiration, save normalization, and insufficient mana",()=>{
  const {r,p,client}=fixture();p.hp=p.maxHp*.37;p.mana=30;
  const hp=p.hp,max=p.maxHp;
  for(let i=0;i<30;i++)r.applyStats("one",p,emptyAllocations());
  assert.equal(p.hp,hp);assert.equal(p.maxHp,max);
  assert.equal(r.spendSkillMana(client,p,30,["two"]),false,"cannot spend PvE-sized mana on first PvP cast");
  assert.equal(r.masteryMode("one"),"pve");
  assert.equal(r.spendSkillMana(client,p,20,["two"]),true);assert.equal(r.masteryMode("one"),"pvp");
  const mp=p.mana;
  assert(p.maxHp<max);assert.ok(Math.abs(p.hp/p.maxHp-.37)<1e-10);
  r.persistentCharacters.set("one","a".repeat(64));
  const saved=r.captureCharacterSnapshot("one");assert(saved.mana<=320);assert(saved.masteryVitals.pvpUntil>Date.now());
  r.simulatedMs=5001;r.refreshMastery("one");
  assert.equal(p.maxHp,max);assert.ok(Math.abs(p.hp-hp)<1e-8);assert(p.mana>mp);
  assert.ok(Math.abs(p.mana/p.maxMana-mp/(p.maxMana/1.05*1.025))<.001);
});

test("priest recovery and ground movement improve, mounted movement and healing do not double scale",()=>{
  const veteran=fixture(),novice=fixture("muay_boran",false);
  for(const f of [veteran,novice]){f.p.hp=100;f.p.mana=0;f.p.stamina=0;f.r.updateResources(5);}
  assert.equal(veteran.p.hp,121);assert.equal(novice.p.hp,120);
  assert.ok(Math.abs(veteran.p.stamina-novice.p.stamina*1.05)<1e-9);
  assert(veteran.p.mana>novice.p.mana);
  for(const f of [veteran,novice]){f.r.destinations.set("one",{x:-14,z:8});f.r.updatePlayerMovement(.2);}
  assert.ok(Math.abs((veteran.p.x+10)/(novice.p.x+10)-1.02)<1e-8);
  const mountedStarts=[veteran.p.x,novice.p.x];
  for(const f of [veteran,novice]){f.p.mounted=true;f.r.updatePlayerMovement(.1);}
  assert.ok(Math.abs((veteran.p.x-mountedStarts[0])-(novice.p.x-mountedStarts[1]))<1e-8);
  assert.equal(veteran.r.healAmount("one","one",100),novice.r.healAmount("one","one",100));
});

test("summon uses its owner's magic mastery once, and support inherits PvP context",()=>{
  const a=fixture("seer"),b=fixture("seer",false);
  for(const f of [a,b]){
    const spirit=new SummonedGuardian({ownerId:"one",kind:"pot_spirit",x:-10,z:9.5,y:0});
    f.room.state.summons.set("one",spirit);f.r.trySummonAttack("one",spirit,f.monster.id);
  }
  assert(a.events.find(e=>e.type==="summon_hit")!.data.damage>b.events.find(e=>e.type==="summon_hit")!.data.damage);
  a.r.touchPvp(["two"]);a.r.supportMastery("one",["two"]);assert.equal(a.r.masteryMode("one"),"pvp");
  a.p.hp=0;a.p.alive=false;a.r.simulatedMs=6000;a.r.refreshMastery("one");assert.equal(a.p.hp,0);
});

test("learned class core actions use real damage, HP-based healing and defense paths",()=>{
  const commands:Record<PathId,[string,string]>={
    muay_boran:["muay_core_skill","korat"],phutthaisawan:["sword_core_skill","atamat_core"],
    blade:["blade_core_skill","blade_heavy"],sentinel:["sentinel_core_skill","bulwark"],
    seer:["seer_core_skill","seer_buffalo"],mender:["mender_core_skill","mender_core_circle"],
  };
  for(const path of Object.keys(PATHS) as PathId[]){
    const values:number[]=[];
    for(const veteran of [false,true]){
      const f=fixture(path,veteran),[command,skillId]=commands[path];
      f.r.persistentCharacters.set("one","a".repeat(64));f.opponent.x=-17;
      f.p.hp=f.p.maxHp/2;const before=f.p.hp;
      f.r.messages[command](f.client as any,{skillId,...(["mender","sentinel"].includes(path)?{}:{targetId:f.monster.id})});
      const rejected=f.events.find(e=>e.type==="command_rejected");
      assert.equal(rejected,undefined,path+" "+JSON.stringify(rejected));
      for(let n=0;n<5;n++){f.r.simulatedMs=n*1000;f.r.updateMuayCore();f.r.updateSwordCore();f.r.updateBladeEffects();f.r.updateOccultEffects();}
      values.push(path==="mender"?f.p.hp-before:path==="sentinel"?f.p.def:10000-f.monster.hp);
    }
    assert(values[0]>0,path+" did not exercise a core action");
    assert(values[1]>values[0],path+" mastery did not affect the core action");
  }
});
