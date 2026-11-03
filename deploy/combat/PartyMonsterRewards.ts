/** Pure server-side policy for sharing one defeated monster's EXP. */
import type { MonsterTier } from "./MonsterProfiles.js";
import { PARTY_XP_RADIUS } from "./PartyManager.js";
import { PROGRESSION, monsterExperience } from "./Progression.js";
export type PartyRewardMember = Readonly<{
  sessionId:string; mapId:string; x:number; y:number; z:number;
  alive:boolean; persistent:boolean; level:number; inTransit:boolean;
}>;
export type RewardMonster = Readonly<{mapId:string;level:number;tier:MonsterTier;x:number;y:number;z:number}>;
export type PartyMonsterShare = Readonly<{sessionId:string;amount:number}>;
/**
 * Inputs come from authoritative room state, never request payloads.
 * Each earner's own level controls the gap modifier; no last-hit advantage.
 * Nearby earners add 10% each to the shared pool, capped at 30%.
 */
export function partyMonsterShares(winnerLevel:number, monster:RewardMonster, members:readonly PartyRewardMember[], radius=PARTY_XP_RADIUS, includeLootOnly=false):PartyMonsterShare[] {
  if(!Number.isSafeInteger(winnerLevel) || winnerLevel<1 || winnerLevel>1000) throw new Error("invalid_player_level");
  if(!monster || typeof monster.mapId!=="string" || !monster.mapId ||
    ![monster.x,monster.y,monster.z,radius].every(Number.isFinite) || radius<0) throw new Error("invalid_reward_location");
  if(members.length>4) throw new Error("invalid_party_size");
  const unique=new Set<string>();
  for(const member of members) {
    if(!member.sessionId || unique.has(member.sessionId) || ![member.x,member.y,member.z].every(Number.isFinite) || !Number.isSafeInteger(member.level) || member.level<1 || member.level>1000) throw new Error("invalid_party_member");
    unique.add(member.sessionId);
  }
  const eligible=members.filter(member=>member.alive && member.persistent && !member.inTransit && (includeLootOnly || monster.tier==="boss" || member.level<PROGRESSION.maxLevel) && member.mapId===monster.mapId && Math.hypot(member.x-monster.x,member.y-monster.y,member.z-monster.z)<=radius);
  if(!eligible.length)return [];
  const earning=eligible.filter(member=>member.level<PROGRESSION.maxLevel).length;
  const factor=1+Math.min(3,Math.max(0,earning-1))*.1;
  return eligible.map(member=>{
    const reward=member.level<PROGRESSION.maxLevel ? monsterExperience(member.level,monster.level,monster.tier) : 0;
    return {sessionId:member.sessionId,amount:reward>0 ? Math.max(1,Math.floor(reward*factor/earning)) : 0};
  }).filter(member=>includeLootOnly || member.amount>0 || monster.tier==="boss");
}
