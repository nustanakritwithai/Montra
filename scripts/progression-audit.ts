/** Lightweight planning baseline. This is not a playtest or a combat simulator. */
import { WORLD_MAPS, WORLD_EXPANSION } from "../deploy/combat/WorldMaps.js";
import { PATHS, DUAL_SWORD, type PathId } from "../deploy/combat/CharacterBuilds.js";
import { WEAPON_STATS, SHRINE_RECIPE } from "../deploy/combat/ItemRules.js";
import { FORT } from "../deploy/combat/HeightRules.js";
import { MENDER_PVE_RICE_MULTIPLIER } from "../deploy/combat/SkillCatalog.js";
import { calculateDamage, calculateStats, emptyAllocations, xpForNextLevel } from "../deploy/combat/Progression.js";
import { monsterProfile, monsterReward } from "../deploy/combat/MonsterProfiles.js";

if (!WORLD_EXPANSION) throw Error("Set MONTRA_WORLD_EXPANSION=1 to audit the expanded world");
const seen=new Set<string>(["ritual_village"]), queue=["ritual_village"];
for(let i=0;i<queue.length;i++) for(const portal of WORLD_MAPS[queue[i]]?.portals ?? []) {
  if(WORLD_MAPS[portal.targetMapId] && !seen.has(portal.targetMapId)) {seen.add(portal.targetMapId);queue.push(portal.targetMapId);}
}
const camps=[...seen].flatMap(id=>(WORLD_MAPS[id].camps ?? []).flatMap(c=>c.levels.map(level=>({id,level}))));
const gaps=Array.from({length:100},(_,i)=>i+1).filter(level=>!camps.some(c=>Math.abs(c.level-level)<=3));
const checkpoints=[1,10,20,40,60,80,99];
const paths=Object.keys(PATHS) as PathId[];
function scenario(path:PathId,level:number,party:number){
  const stats=calculateStats(level,emptyAllocations()), monster=monsterProfile(level);
  const magic=path==="seer" || path==="mender", dual=path==="phutthaisawan";
  const weapon=path==="muay_boran"?WEAPON_STATS.muay_wraps.meleeBonus:path==="sentinel"?SHRINE_RECIPE.meleeBonus:
    magic?WEAPON_STATS.spirit_staff.rangedBonus:WEAPON_STATS.arcane_sword.meleeBonus;
  const attack=(magic?stats.magicAtk:stats.atk)+weapon;
  const hit=calculateDamage(attack*(dual?DUAL_SWORD.damageMultiplier:path==="mender"?MENDER_PVE_RICE_MULTIPLIER:1),monster.defense,level);
  const interval=magic?FORT.rangedCooldownMs:dual?DUAL_SWORD.attackIntervalMs:1000;
  const hits=Math.ceil(monster.maxHp/(hit*party));
  const seconds=hits*interval/1000+6; // fixed travel/recovery, not measured
  const xp=Math.floor(monsterReward(level,level)/party);
  const hourly=Math.floor(3600*xp/seconds);
  return {path,level,party,hits,estimatedXpPerHour:hourly,estimatedHoursToNext:xpForNextLevel(level)/hourly};
}
const scenarios=paths.flatMap(path=>checkpoints.flatMap(level=>[1,2,4].map(party=>scenario(path,level,party))));
const roughHoursTo100=paths.map(path=>({path,hours:Number(Array.from({length:99},(_,i)=>scenario(path,i+1,1).estimatedHoursToNext).reduce((a,b)=>a+b,0).toFixed(1))}));
console.log(JSON.stringify({
  assumptions:["basic attacks only, equal-level normal monster, starter weapons", "party members have identical builds, move together and share EXP equally", "fixed six seconds for travel and recovery per kill", "no skills, target switching, incoming damage, death, spawn congestion or latency", "map graph and spawn definitions only: walking paths and LIVE flags are not checked"],
  reachableMaps:[...seen],unreachableMaps:Object.keys(WORLD_MAPS).filter(id=>!seen.has(id)),levelsWithoutNearbyDefinedCamp:gaps,roughHoursTo100,scenarios
},null,2));
