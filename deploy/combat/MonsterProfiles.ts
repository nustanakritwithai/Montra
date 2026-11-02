/**
 * Server-only monster balance definitions.
 * These are trial values, not client-selected stats or calibrated outcomes.
 * The normal level 1–12 baseline targets the proposed forest encounters.
 */
import { WORLD_ROOM_CAPACITY } from "./WorldMaps.js";

export const MONSTER_TIERS = ["weak","normal","strong","elite","boss"] as const;
export type MonsterTier = typeof MONSTER_TIERS[number];
export type MonsterProfile = Readonly<{level:number;tier:MonsterTier;maxHp:number;attack:number;defense:number}>;
/** Optional server-owned overrides by stable forest spawn ID. Unlisted spawns stay Normal. */
export const FOREST_MONSTER_TIERS:Readonly<Record<string,MonsterTier>> = Object.freeze({});
export const MONSTER_CONFIG = Object.freeze({
  minLevel:1, maxLevel:100,
  normalHp:200, hpPerLevel:20,
  normalAttack:8, attackPerLevel:0.8,
  normalDefense:34, defensePerLevel:4,
  gapPenaltyPerLevel:0.05,
  respawnMs:25_000,
  minRespawnMs:20_000, respawnReductionPerAdditionalPlayerMs:1_500,
  populationRadius:20,
  maxSpawnPointsPerRoom:84,
});
// The monster-design document gives ranges; Elite 3x and Boss 10x are
// conservative starting points. No Elite/Boss abilities or spawns are implied.
export const TIER_MULTIPLIERS:Readonly<Record<MonsterTier,Readonly<{stats:number;experience:number}>>> = Object.freeze({
  weak:Object.freeze({stats:0.5,experience:0.5}),
  normal:Object.freeze({stats:1,experience:1}),
  strong:Object.freeze({stats:1.5,experience:1.5}),
  elite:Object.freeze({stats:3,experience:3}),
  boss:Object.freeze({stats:10,experience:10}),
});
function monsterLevel(value:number):void {
  if(!Number.isSafeInteger(value) || value<MONSTER_CONFIG.minLevel || value>MONSTER_CONFIG.maxLevel) throw new Error("invalid_monster_level");
}
/** Compute the delay from the number of eligible world players near the kill. */
export function monsterRespawnDelay(nearbyPlayers:number):number {
  if(!Number.isSafeInteger(nearbyPlayers) || nearbyPlayers<0 || nearbyPlayers>WORLD_ROOM_CAPACITY) throw new Error("invalid_nearby_population");
  const additional=Math.max(0,nearbyPlayers-1);
  return Math.max(MONSTER_CONFIG.minRespawnMs,MONSTER_CONFIG.respawnMs-additional*MONSTER_CONFIG.respawnReductionPerAdditionalPlayerMs);
}
function tierValue(tier:MonsterTier):Readonly<{stats:number;experience:number}> {
  if (!Object.prototype.hasOwnProperty.call(TIER_MULTIPLIERS,tier)) throw new Error("invalid_monster_tier");
  return TIER_MULTIPLIERS[tier];
}
export function monsterProfile(level:number,tier:MonsterTier="normal"):MonsterProfile {
  monsterLevel(level); const scale=tierValue(tier).stats, step=level-1;
  return {level,tier,
    maxHp:Math.max(1,Math.round((MONSTER_CONFIG.normalHp+MONSTER_CONFIG.hpPerLevel*step)*scale)),
    attack:Math.max(1,Math.round((MONSTER_CONFIG.normalAttack+MONSTER_CONFIG.attackPerLevel*step)*(tier === "elite" ? 1.7 : scale))),
    defense:Math.max(0,Math.round((MONSTER_CONFIG.normalDefense+MONSTER_CONFIG.defensePerLevel*step)*(tier === "elite" ? 1.35 : scale))),
  };
}
/** Retains the current MONTRA level-gap formula; the caller owns party sharing. */
export function monsterReward(playerLevel:number,level:number,tier:MonsterTier="normal",baseExperience=100):number {
  if(!Number.isSafeInteger(playerLevel) || playerLevel<1 || playerLevel>1000) throw new Error("invalid_player_level");
  monsterLevel(level);
  if(!Number.isSafeInteger(baseExperience) || baseExperience<0 || baseExperience>1_000_000) throw new Error("invalid_base_experience");
  const factor=Math.max(0,1-MONSTER_CONFIG.gapPenaltyPerLevel*(playerLevel-level));
  return Math.floor(baseExperience*level*factor*tierValue(tier).experience);
}

/** Capacity estimate only: demand P/T, supply M/(T+R); not live balancing. */
export function estimateSpawnCapacity(players:number, killAndTravelSeconds:number,respawnSeconds:number):number {
  if(!Number.isSafeInteger(players) || players<0 || players>MONSTER_CONFIG.maxSpawnPointsPerRoom ||
    !Number.isFinite(killAndTravelSeconds) || killAndTravelSeconds<=0 ||
    !Number.isFinite(respawnSeconds) || respawnSeconds<0) throw new Error("invalid_spawn_estimate");
  return Math.ceil(players*(killAndTravelSeconds+respawnSeconds)/killAndTravelSeconds);
}
