/** Lightweight planning baseline. This is not a playtest or a combat simulator. */
import { WORLD_MAPS, WORLD_EXPANSION } from "../deploy/combat/WorldMaps.js";
import { PATHS, DUAL_SWORD, type PathId } from "../deploy/combat/CharacterBuilds.js";
import { WEAPON_STATS, SHRINE_RECIPE } from "../deploy/combat/ItemRules.js";
import { personalGearGuides } from "../deploy/combat/GearGuides.js";
import { withEquipmentStats } from "../deploy/combat/PersonalItems.js";
import { hunts, huntDetails } from "../deploy/combat/MonsterLoot.js";
import { RULES } from "../deploy/combat/GameRules.js";
import { FORT } from "../deploy/combat/HeightRules.js";
import { MENDER_PVE_RICE_MULTIPLIER } from "../deploy/combat/SkillCatalog.js";
import { calculateDamage, calculateStats, cycleExperience, emptyAllocations, monsterExperience, xpForNextLevel } from "../deploy/combat/Progression.js";
import { monsterProfile, monsterRespawnDelay } from "../deploy/combat/MonsterProfiles.js";
import { partyMonsterShares } from "../deploy/combat/PartyMonsterRewards.js";

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
  const xp=Math.max(1,Math.floor(monsterExperience(level,level)*(1+Math.min(3,party-1)*.1)/party));
  const hourly=Math.floor(3600*xp/seconds);
  return {path,level,party,hits,estimatedXpPerHour:hourly,estimatedHoursToNext:xpForNextLevel(level)/hourly};
}
const scenarios=paths.flatMap(path=>checkpoints.flatMap(level=>[1,2,4].map(party=>scenario(path,level,party))));
const roughHoursTo100=paths.map(path=>({path,hours:Number(Array.from({length:99},(_,i)=>scenario(path,i+1,1).estimatedHoursToNext).reduce((a,b)=>a+b,0).toFixed(1))}));
const openNormal=hunts.filter(hunt=>(!hunt.tier || hunt.tier==="normal") && huntDetails(hunt).open);
const round=(value:number)=>Math.round(value*100)/100;
const builds=paths.flatMap(path=>[30,40,50].flatMap(level=>{
  const guide=personalGearGuides(path,level)!;
  const site=guide.journey?.practice;
  if(!site)return [];
  const target=monsterProfile(site.level,"normal");
  const campSize=openNormal.filter(hunt=>hunt.mapId===site.mapId && hunt.level<=level && level-hunt.level<=4).length;
  const magic=path==="seer" || path==="mender",dual=path==="phutthaisawan";
  return guide.builds.flatMap(build=>{
    const stats=withEquipmentStats(calculateStats(level,emptyAllocations()),build.slots.map(slot=>slot.id));
    const power=(magic?stats.magicAtk:stats.atk)*(dual?DUAL_SWORD.damageMultiplier:path==="mender"?MENDER_PVE_RICE_MULTIPLIER:1);
    const hit=calculateDamage(power,target.defense,level),received=calculateDamage(target.attack,stats.def,level);
    const interval=magic?FORT.rangedCooldownMs:dual?DUAL_SWORD.attackIntervalMs:RULES.playerAttackCooldownMs;
    return [1,4].map(party=>{
      const hits=Math.ceil(target.maxHp/(hit*party));
      const killSeconds=hits*interval/1000;
      const activeSeconds=killSeconds+6;
      const respawnSeconds=monsterRespawnDelay(party)/1000;
      const cycleSeconds=Math.max(activeSeconds,respawnSeconds/Math.max(1,campSize));
      const prey={level:target.level,tier:"normal" as const,mapId:site.mapId,x:0,y:0,z:0};
      const members=Array.from({length:party},(_,i)=>({
        ...prey,sessionId:String(i),level,alive:true,persistent:true,inTransit:false,
      }));
      const xp=partyMonsterShares(level,prey,members)[0]?.amount??0;
      return {path,level,style:build.style,party,map:site.mapId,targetLevel:site.level,
        hit,killSeconds:round(killSeconds),receivedPerHit:received,hitsSurvived:Math.ceil(stats.maxHp/received),
        eligibleSpawns:campSize,respawnSeconds:round(respawnSeconds),
        activeFirstLifeXpPerHour:Math.floor(xp*3600/activeSeconds),
        activeLaterLifeXpPerHour:Math.floor(cycleExperience(xp,1)*3600/activeSeconds),
        firstLifeXpPerHour:Math.floor(xp*3600/cycleSeconds),
        laterLifeXpPerHour:Math.floor(cycleExperience(xp,1)*3600/cycleSeconds)};
    });
  });
}));
console.log(JSON.stringify({
  assumptions:["basic attacks only, equal-level normal monster, starter weapons", "party members have identical builds, move together, and share EXP with the current party bonus", "fixed six seconds for travel and recovery per kill", "no skills, target switching, incoming damage, death, spawn congestion or latency", "map graph and spawn definitions only: walking paths and LIVE flags are not checked"],
  reachableMaps:[...seen],unreachableMaps:Object.keys(WORLD_MAPS).filter(id=>!seen.has(id)),levelsWithoutNearbyDefinedCamp:gaps,roughHoursTo100,scenarios,
  gearedAssumptions:["Lv30/40/50 recommended +0 gear, unmodified basic attacks and live target levels",
    "party members use identical builds; incoming damage is per hit, not group mitigation",
    "six seconds between kills; active rates assume a target is ready and sustained rates include theoretical map-wide spawn capacity",
    "no measured travel, skill rotations or player behavior"],
  builds
},null,2));
