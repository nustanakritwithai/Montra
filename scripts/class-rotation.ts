/**
 * Explicit, deterministic Lv25 PvE fixture. Stationary immortal normal target;
 * no latency, movement, misses, party buffs, gear forging, summon or possession.
 * This model is evidence for a tuning discussion, not a real combat playtest.
 */
import { BLADE_LESSONS } from "../deploy/combat/BladeRules.js";
import { DUAL_SWORD, PATHS, type PathId } from "../deploy/combat/CharacterBuilds.js";
import { FORT } from "../deploy/combat/HeightRules.js";
import { SHRINE_RECIPE, WEAPON_STATS } from "../deploy/combat/ItemRules.js";
import { monsterProfile } from "../deploy/combat/MonsterProfiles.js";
import { MUAY_SKILLS } from "../deploy/combat/MuayRules.js";
import { OCCULT_LESSONS } from "../deploy/combat/OccultRules.js";
import { PROGRESSION, calculateDamage, calculateStats, emptyAllocations } from "../deploy/combat/Progression.js";
import { SENTINEL_LESSONS } from "../deploy/combat/SentinelRules.js";
import { MENDER_PVE_RICE_MULTIPLIER, POSSESSION_MODIFIER, SWORD_NODES } from "../deploy/combat/SkillCatalog.js";
import { calculateModifiedStats } from "../deploy/combat/StatModifiers.js";

const duration=30_000,step=50,level=25,mob=monsterProfile(level,"normal");
type Kind="muay_boran"|"phutthaisawan"|"blade"|"sentinel"|"seer"|"mender";
type Action={name:string;power:number;cost:number;cooldown:number;hits?:number;magic?:boolean;charge?:number};
const ordinary=(name:string,power:number,cost:number,cooldown:number,hits=1,charge=0):Action=>({name,power,cost,cooldown,hits,charge});
const actions:Record<Kind,Action[]>={
  muay_boran:[
    ordinary("korat_swing",MUAY_SKILLS.korat_swing.power,MUAY_SKILLS.korat_swing.stamina,MUAY_SKILLS.korat_swing.cooldownMs),
    ordinary("korat_heavy",MUAY_SKILLS.korat_heavy.power,MUAY_SKILLS.korat_heavy.stamina,MUAY_SKILLS.korat_heavy.cooldownMs),
    ordinary("korat_press",MUAY_SKILLS.korat_press.power,MUAY_SKILLS.korat_press.stamina,MUAY_SKILLS.korat_press.cooldownMs),
    ordinary("punch",MUAY_SKILLS.punch.power,MUAY_SKILLS.punch.stamina,MUAY_SKILLS.punch.cooldownMs)],
  phutthaisawan:[
    ordinary("twin_finale",SWORD_NODES.twin_finale.power,SWORD_NODES.twin_finale.stamina,SWORD_NODES.twin_finale.cooldownMs,3),
    ordinary("twin_cut",SWORD_NODES.twin_cut.power,SWORD_NODES.twin_cut.stamina,SWORD_NODES.twin_cut.cooldownMs,2),
    ordinary("circle_step",SWORD_NODES.circle_step.power,SWORD_NODES.circle_step.stamina,SWORD_NODES.circle_step.cooldownMs)],
  blade:[
    ordinary("hidden_edge",BLADE_LESSONS.hidden_edge.power,BLADE_LESSONS.hidden_edge.stamina,BLADE_LESSONS.hidden_edge.cooldownMs),
    ordinary("sever_mark",BLADE_LESSONS.sever_mark.power,BLADE_LESSONS.sever_mark.stamina,BLADE_LESSONS.sever_mark.cooldownMs),
    ordinary("piercing_edge",BLADE_LESSONS.piercing_edge.power,BLADE_LESSONS.piercing_edge.stamina,BLADE_LESSONS.piercing_edge.cooldownMs,1,800)],
  sentinel:[
    ordinary("counter",SENTINEL_LESSONS.counter.power,SENTINEL_LESSONS.counter.stamina,SENTINEL_LESSONS.counter.cooldownMs),
    ordinary("bash",SENTINEL_LESSONS.bash.power,SENTINEL_LESSONS.bash.stamina,SENTINEL_LESSONS.bash.cooldownMs),
    ordinary("sweep",SENTINEL_LESSONS.sweep.power,SENTINEL_LESSONS.sweep.stamina,SENTINEL_LESSONS.sweep.cooldownMs),
    ordinary("slam",SENTINEL_LESSONS.slam.power,SENTINEL_LESSONS.slam.stamina,SENTINEL_LESSONS.slam.cooldownMs,1,800)],
  seer:[
    {...ordinary("seer_curse",OCCULT_LESSONS.seer_curse.power,OCCULT_LESSONS.seer_curse.stamina,OCCULT_LESSONS.seer_curse.cooldownMs),magic:true},
    {...ordinary("seer_mark",OCCULT_LESSONS.seer_mark.power,OCCULT_LESSONS.seer_mark.stamina,OCCULT_LESSONS.seer_mark.cooldownMs),magic:true},
    {...ordinary("seer_rice",OCCULT_LESSONS.seer_rice.power,OCCULT_LESSONS.seer_rice.stamina,OCCULT_LESSONS.seer_rice.cooldownMs),magic:true},
    {...ordinary("seer_burst",OCCULT_LESSONS.seer_burst.power,OCCULT_LESSONS.seer_burst.stamina,OCCULT_LESSONS.seer_burst.cooldownMs),magic:true}],
  mender:[],
};
function run(path:Kind,possessed=false){
  const base=calculateStats(level,emptyAllocations()),book=actions[path],cooldowns:Record<string,number>={},counts:Record<string,number>={};
  const weapon=path==="muay_boran"?WEAPON_STATS.muay_wraps.meleeBonus:path==="sentinel"?SHRINE_RECIPE.meleeBonus:
    path==="seer"||path==="mender"?WEAPON_STATS.spirit_staff.rangedBonus:WEAPON_STATS.arcane_sword.meleeBonus;
  const classSkill=PATHS[path as PathId],buff=classSkill.effect.kind==="buff"?classSkill.effect:null;
  let stamina=base.maxStamina,total=0,basicAt=0,skillAt=0,classAt=0,buffUntil=0,chargeUntil=0;
  let combo=0,markUntil=0,counterUntil=0,resistUntil=0,cloaked=path==="blade";
  let activeCharge: {at:number;damage:number;id:string;stun:boolean}|null=null;
  const dots:Array<{at:number;damage:number}>=[];
  if(cloaked){stamina-=BLADE_LESSONS.cloak.stamina;chargeUntil=600;counts.cloak=1;}
  const note=(id:string,damage:number,hits=1)=>{total+=damage;counts[id]=(counts[id]??0)+hits;};
  const power=(now:number,magic=false)=>{
    const modifiers=[];
    if(possessed)modifiers.push(POSSESSION_MODIFIER);
    if(buff && now<buffUntil)modifiers.push({id:"class",sourceId:"self",group:"class_skill",bonuses:buff.bonuses});
    const modified=modifiers.length?calculateModifiedStats(base,modifiers):base;
    return (magic?modified.magicAtk:modified.atk)+weapon;
  };
  const hurt=(attack:number)=>calculateDamage(attack,mob.defense,mob.level);
  for(let now=0;now<duration;now+=step){
    stamina=Math.min(base.maxStamina,stamina+PROGRESSION.staminaRegenIn*step/1000);
    for(const dot of dots.filter(d=>d.at===now))note("curse_tick",dot.damage);
    if(activeCharge && now>=activeCharge.at){
      note(activeCharge.id,activeCharge.damage);
      if(activeCharge.stun && now>=resistUntil){counterUntil=now+3000;resistUntil=now+8000;}
      activeCharge=null;
    }
    if(buff && now>=classAt && stamina>=classSkill.stamina){
      stamina-=classSkill.stamina;buffUntil=now+buff.durationMs;classAt=now+classSkill.cooldownMs;counts.class=(counts.class??0)+1;
    }
    if(now<chargeUntil)continue;
    // Initial cloak is consumed by hidden_edge; do not accidentally use an auto hit first.
    if(now>=basicAt && !(path==="blade" && cloaked)){
      const magic=path==="seer"||path==="mender",dual=path==="phutthaisawan";
      note("basic",hurt(power(now,magic)*(dual?DUAL_SWORD.damageMultiplier*1.05:path==="mender"?MENDER_PVE_RICE_MULTIPLIER:1)));
      basicAt=now+(magic?FORT.rangedCooldownMs:dual?DUAL_SWORD.attackIntervalMs:1000);
      if(dual)combo=Math.min(3,combo+1);
    }
    if(now<skillAt)continue;
    for(const action of book){
      if(now<(cooldowns[action.name]??0) || stamina<action.cost)continue;
      if(action.name==="twin_finale" && combo<3)continue;
      if(action.name==="hidden_edge" && !cloaked)continue;
      if(action.name==="sever_mark" && now>=markUntil)continue;
      if(action.name==="counter" && now>=counterUntil)continue;
      if(action.name==="seer_mark" && now<markUntil)continue;
      if(action.name==="seer_burst" && now>=markUntil)continue;
      if(action.name==="seer_rice" && now>=markUntil)continue;
      stamina-=action.cost;cooldowns[action.name]=now+action.cooldown;skillAt=now+400;
      let multiplier=action.power*(path==="phutthaisawan"?1.05:1);
      if(action.name==="hidden_edge")multiplier*=1.5;
      if(action.name==="seer_rice")multiplier*=1.3;
      const damage=hurt(power(now,Boolean(action.magic))*multiplier);
      if(action.charge){chargeUntil=now+action.charge;activeCharge={at:chargeUntil,damage,id:action.name,stun:action.name==="slam"};}
      else note(action.name,damage*(action.hits??1),action.hits??1);
      if(action.name==="twin_finale")combo=0;
      if(action.name==="hidden_edge"){cloaked=false;markUntil=now+8000;}
      if(action.name==="sever_mark" || action.name==="seer_burst")markUntil=0;
      if(action.name==="seer_mark")markUntil=now+8000;
      if(action.name==="counter")counterUntil=0;
      if(action.name==="bash" && now>=resistUntil){counterUntil=now+3000;resistUntil=now+8000;}
      if(action.name==="seer_curse")for(const delay of [2000,4000,6000])dots.push({at:now+delay,damage:Math.max(1,Math.round(damage*0.35))});
      break;
    }
  }
  return {path,possessed,damage:total,dps:Number((total/(duration/1000)).toFixed(2)),staminaRemaining:Number(stamina.toFixed(1)),counts};
}
console.log(JSON.stringify({
  assumptions:["Lv25 equal-level normal immortal target","unforged weapons; skills learned; 3 sword/4 other slots",
    "stationary and in range; 400ms between commands; all attacks hit","no consumables, active summon damage, mobility, guard, incoming damage, party effects or travel",
    "occult possession appears as a separate 30s scenario and consumes the summon",
    "class buffs used at cooldown where applicable; mender heals omitted from DPS",
    "blade starts outside combat with one cloak; no recloak during combat",
    "stun windows modeled on normal monsters; Muay combo bonuses omitted; time-limited damage and cooldowns are approximate"
  ],
  results:[...(["muay_boran","phutthaisawan","blade","sentinel","seer","mender"] as Kind[]).map(path=>run(path)),
    run("seer",true),run("mender",true)]
},null,2));
