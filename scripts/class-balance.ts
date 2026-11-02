/**
 * Reproducible, provisional arithmetic fixtures for class balance.
 * This is not a duel simulator: movement, interrupt, equipment upgrades,
 * defensive actions, action scheduling, and uptime are intentionally excluded.
 */
import { BLADE_LESSONS } from "../deploy/combat/BladeRules.js";
import { DUAL_SWORD, PATHS } from "../deploy/combat/CharacterBuilds.js";
import { RULES } from "../deploy/combat/GameRules.js";
import { FORT } from "../deploy/combat/HeightRules.js";
import { SHRINE_GLAIVE, SHRINE_RECIPE, WEAPON_STATS } from "../deploy/combat/ItemRules.js";
import { monsterProfile, type MonsterTier } from "../deploy/combat/MonsterProfiles.js";
import { MUAY_LESSONS, MUAY_PVP_DAMAGE_MULTIPLIER, MUAY_SKILLS } from "../deploy/combat/MuayRules.js";
import { OCCULT_LESSONS } from "../deploy/combat/OccultRules.js";
import { PROGRESSION, calculateDamage, calculateStats, emptyAllocations } from "../deploy/combat/Progression.js";
import { SENTINEL_LESSONS } from "../deploy/combat/SentinelRules.js";
import { MENDER_PVE_RICE_MULTIPLIER, SWORD_NODES, SWORD_PVP_DAMAGE_MULTIPLIER } from "../deploy/combat/SkillCatalog.js";
import { calculateModifiedStats } from "../deploy/combat/StatModifiers.js";

const levels=[1,10,25,60,100];
const round=(n:number)=>Number(n.toFixed(2));
const withBuff=(stats:ReturnType<typeof calculateStats>,id:string,bonuses:{def?:number;magicDef?:number})=>
  calculateModifiedStats(stats,[{id,sourceId:"fixture",group:"fixture",bonuses}]);
const scenario=(level:number,mode:"pve"|"pvp",tier:MonsterTier="normal")=>{
  const stats=calculateStats(level,emptyAllocations()),monster=monsterProfile(level,tier);
  const defense=mode==="pve"?monster.defense:stats.def,magicDefense=mode==="pve"?monster.defense:stats.magicDef;
  const weaponGlaive=level>=SHRINE_RECIPE.itemLevel ? SHRINE_GLAIVE : "ritual_dagger";
  const glaive=mode==="pvp" && weaponGlaive===SHRINE_GLAIVE ? SHRINE_RECIPE.pvpMeleeBonus : WEAPON_STATS[weaponGlaive].meleeBonus;
  const sword=stats.atk+WEAPON_STATS.arcane_sword.meleeBonus,boxing=stats.atk+WEAPON_STATS.muay_wraps.meleeBonus;
  const blade=stats.atk+WEAPON_STATS.arcane_sword.meleeBonus,guardian=stats.atk+glaive,magic=stats.magicAtk+WEAPON_STATS.spirit_staff.rangedBonus;
  const dmg=(power:number,def=defense)=>calculateDamage(power,def,level);
  return {level,mode,tier,targetHp:mode==="pve"?monster.maxHp:stats.maxHp,stamina:stats.maxStamina,
    basic:{
      muay:round(dmg(boxing)*1000/RULES.playerAttackCooldownMs),
      sword:round(dmg(sword*DUAL_SWORD.damageMultiplier)*1000/DUAL_SWORD.attackIntervalMs),
      blade:round(dmg(blade)*1000/RULES.playerAttackCooldownMs),
      sentinel:round(dmg(guardian)*1000/RULES.playerAttackCooldownMs),
      seer:round(dmg(magic,magicDefense)*1000/FORT.rangedCooldownMs),
      mender:round(dmg(magic*(mode==="pve"?MENDER_PVE_RICE_MULTIPLIER:1),magicDefense)*1000/FORT.rangedCooldownMs),
    },
    heals:{menderSingle:Math.round(stats.maxHp*OCCULT_LESSONS.mender_heal.power),menderClass:Math.round(stats.maxHp*0.10)},
  };
};

function level25Burst(mode:"pve"|"pvp"){
  const level=25,s=calculateStats(level,emptyAllocations()),mob=monsterProfile(level,"normal"),def=mode==="pve"?mob.defense:s.def,magicDef=mode==="pve"?mob.defense:s.magicDef;
  const pvp=mode==="pvp",swordPower=(s.atk+WEAPON_STATS.arcane_sword.meleeBonus)*1.05;
  const boxPower=s.atk+WEAPON_STATS.muay_wraps.meleeBonus,bladePower=s.atk+WEAPON_STATS.arcane_sword.meleeBonus;
  const guardianPower=s.atk+(pvp?SHRINE_RECIPE.pvpMeleeBonus:SHRINE_RECIPE.meleeBonus);
  const magicPower=s.magicAtk+WEAPON_STATS.spirit_staff.rangedBonus;
  const hit=(power:number,protection=def)=>calculateDamage(power,protection,level);
  const muay=Object.entries(MUAY_LESSONS).filter(([id])=>MUAY_SKILLS[id as keyof typeof MUAY_LESSONS].effect!=="guard").map(([id,lesson])=>{
    const skill=MUAY_SKILLS[id as keyof typeof MUAY_LESSONS],hits=skill.effect==="flurry"||skill.effect==="step_flurry"?2:1;
    return {school:lesson.school,id,hits,conditional:/counter/.test(skill.effect) || id=== "chaiya_finish" || id==="korat_finish" || id==="lopburi_finish" || id==="thasao_finish",
      damage:hits*hit(boxPower*skill.power*(pvp?MUAY_PVP_DAMAGE_MULTIPLIER:1))};
  }).sort((a,b)=>b.damage-a.damage);
  const swords=Object.entries(SWORD_NODES).filter(([,node])=>node.school!=="common" && node.effect!=="passive" && node.effect!=="guard" && node.effect!=="support" && (!pvp || node.effect!=="area")).map(([id,node])=>{
    const hits=node.effect==="flurry"?(id==="twin_finale"?3:2):1;
    return {school:node.school,id,hits,conditional:node.effect==="counter" || id==="twin_finale",
      previousDamage:hits*hit(swordPower*node.power),damage:hits*hit(swordPower*node.power*(pvp?SWORD_PVP_DAMAGE_MULTIPLIER:1))};
  }).sort((a,b)=>b.damage-a.damage);
  return {mode,level,targetHp:pvp?s.maxHp:mob.maxHp,muay,swords,
    blade:{skill:"sever_mark",conditional:"mark; cloak separately",damage:hit(bladePower*BLADE_LESSONS.sever_mark.power*(pvp?0.75:1)),
      fromCloak:hit(bladePower*BLADE_LESSONS.sever_mark.power*(pvp?0.75:1)*(pvp?1.2:1.5))},
    sentinel:{skill:"counter",conditional:"successful block or stun",damage:hit(guardianPower*SENTINEL_LESSONS.counter.power*(pvp?0.75:1))},
    seer:pvp?{skill:"seer_hexburst",conditional:"existing curse",damage:hit(magicPower*OCCULT_LESSONS.seer_hexburst.power*0.65,magicDef)}:
      {skill:"seer_burst",conditional:"existing mark",damage:hit(magicPower*OCCULT_LESSONS.seer_burst.power)},
    mender:{singleHeal:Math.round(s.maxHp*OCCULT_LESSONS.mender_heal.power),partyClassHeal:Math.round(s.maxHp*(PATHS.mender.effect.fraction))}
  };
}

const source=["equal-level targets","empty legacy allocations","unforged starter weapon; guardian glaive only from Lv12",
  "only guaranteed damage is included; burst rows show conditions and omit class buffs, criticals and latency",
  "basic DPS assumes uninterrupted range and cooldown-perfect input; no skills, defense, combat travel, or healing"];
const level25=calculateStats(25,emptyAllocations()),normal25=monsterProfile(25,"normal");
const ward=withBuff(level25,"mender_ward",{def:OCCULT_LESSONS.mender_ward.power,magicDef:OCCULT_LESSONS.mender_ward.power});
const guardianWard=withBuff(level25,"guardian_class",PATHS.sentinel.effect.bonuses);
const healerCostPerSecond=OCCULT_LESSONS.mender_heal.stamina/(OCCULT_LESSONS.mender_heal.cooldownMs/1000)+
  OCCULT_LESSONS.mender_area.stamina/(OCCULT_LESSONS.mender_area.cooldownMs/1000)+PATHS.mender.stamina/(PATHS.mender.cooldownMs/1000);
const utility={
  level:25,monsterAttack:normal25.attack,baselineHit:calculateDamage(normal25.attack,level25.def,25),
  menderWardHit:calculateDamage(normal25.attack,ward.def,25),
  sentinelWardAndGlaiveHit:calculateDamage(normal25.attack,Math.round(guardianWard.def*(1+SENTINEL_LESSONS.fortitude.power)),25),
  sentinelGuardFactor:SENTINEL_LESSONS.guard.power,
  healingAssumptions:"steady-state average, all healing effective, uninterrupted, self within area; three area ticks; no other stamina spending",
  menderIdealAverageHealPer30s:Math.round(level25.maxHp*(OCCULT_LESSONS.mender_heal.power*5+(OCCULT_LESSONS.mender_area.power+0.03*3)*2.5+0.1)),
  menderHealingStaminaPerSecond:round(healerCostPerSecond),
  inCombatStaminaRegenPerSecond:PROGRESSION.staminaRegenIn,
  estimatedSecondsBeforeStaminaRunsOut:round(level25.maxStamina/(healerCostPerSecond-PROGRESSION.staminaRegenIn))
};
const results={source,fixtures:levels.flatMap(level=>[scenario(level,"pve"),scenario(level,"pvp")]),bursts:[level25Burst("pve"),level25Burst("pvp")],utility};
console.log(JSON.stringify(results,null,2));
