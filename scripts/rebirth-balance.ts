/** Reproducible estimate, not a playtest. No map traversal or live data. */
import { PATHS, DUAL_SWORD, type PathId } from "../deploy/combat/CharacterBuilds.js";
import { WEAPON_STATS, SHRINE_RECIPE } from "../deploy/combat/ItemRules.js";
import { FORT } from "../deploy/combat/HeightRules.js";
import { MENDER_PVE_RICE_MULTIPLIER } from "../deploy/combat/SkillCatalog.js";
import { calculateDamage, calculateStats, cycleExperience, emptyAllocations, monsterExperience, xpForNextLevel } from "../deploy/combat/Progression.js";
import { monsterProfile } from "../deploy/combat/MonsterProfiles.js";
import { WAR_PARTICIPATION_INTERVAL_MS, warParticipationExperience } from "../deploy/combat/TerritoryWar.js";

function estimatedHuntHours(path:PathId,rebirthCount:number):number {
  let seconds=0;
  for(let level=1;level<100;level++) {
    const stats=calculateStats(level,emptyAllocations()),monster=monsterProfile(level);
    const magic=path==="seer" || path==="mender",dual=path==="phutthaisawan";
    const weapon=path==="muay_boran"?WEAPON_STATS.muay_wraps.meleeBonus:path==="sentinel"?SHRINE_RECIPE.meleeBonus:
      magic?WEAPON_STATS.spirit_staff.rangedBonus:WEAPON_STATS.arcane_sword.meleeBonus;
    const attack=(magic?stats.magicAtk:stats.atk)+weapon;
    const hit=calculateDamage(attack*(dual?DUAL_SWORD.damageMultiplier:path==="mender"?MENDER_PVE_RICE_MULTIPLIER:1),monster.defense,level);
    const interval=(magic?FORT.rangedCooldownMs:dual?DUAL_SWORD.attackIntervalMs:1000)/1000;
    const killSeconds=Math.ceil(monster.maxHp/hit)*interval+6;
    const reward=cycleExperience(monsterExperience(level,level),rebirthCount);
    seconds+=xpForNextLevel(level)/reward*killSeconds;
  }
  return Math.round(seconds/360)/10;
}
function estimatedEligibleWarHours(rebirthCount:number):number {
  let seconds=0;
  for(let level=1;level<100;level++) {
    const need=xpForNextLevel(level),reward=cycleExperience(warParticipationExperience(need),rebirthCount);
    seconds+=need/reward*(WAR_PARTICIPATION_INTERVAL_MS/1000);
  }
  return Math.round(seconds/360)/10;
}
console.log(JSON.stringify({
  assumptions:["solo basic attacks against equal-level normal monsters; fixed six seconds travel/recovery per kill",
    "starter-style weapons, no skills, equipment progression, deaths, latency, congestion, quests or gathering XP",
    "war time counts only eligible active objective participation; it does not include waiting or travel",
    "each level is modeled continuously without rounding kills or reward ticks; mixed real play will differ"],
  hunt:Object.keys(PATHS).map(path=>({path,firstLifeHours:estimatedHuntHours(path as PathId,0),laterLifeHours:estimatedHuntHours(path as PathId,1)})),
  eligibleWarOnly:{firstLifeHours:estimatedEligibleWarHours(0),laterLifeHours:estimatedEligibleWarHours(1)},
  targets:{firstLifeMixedHours:48,laterLifeMixedHours:72,realPlayVerified:false}
},null,2));
