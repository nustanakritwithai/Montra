/** Pure server-side policy for sharing one defeated monster's EXP. */
import { monsterReward, type MonsterTier } from "./MonsterProfiles.js";
import { PARTY_XP_RADIUS } from "./PartyManager.js";
import { PROGRESSION } from "./Progression.js";
export type PartyRewardMember = Readonly<{
  sessionId:string; mapId:string; x:number; y:number; z:number;
  alive:boolean; persistent:boolean; level:number; inTransit:boolean;
}>;
export type RewardMonster = Readonly<{mapId:string;level:number;tier:MonsterTier;x:number;y:number;z:number}>;
export type PartyMonsterShare = Readonly<{sessionId:string;amount:number}>;
/**
 * Inputs come from authoritative room state, never request payloads.
 * Equal integer shares intentionally discard any indivisible remainder.
 */
export function partyMonsterShares(winnerLevel:number, monster:RewardMonster, members:readonly PartyRewardMember[], radius=PARTY_XP_RADIUS, includeLootOnly=false):PartyMonsterShare[] {
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
  const amount=earning ? Math.floor(monsterReward(winnerLevel,monster.level,monster.tier,PROGRESSION.monsterBaseExperience)/earning) : 0;
  return eligible.filter(member=>includeLootOnly || amount>0 || monster.tier==="boss").map(member=>({sessionId:member.sessionId,amount:member.level<PROGRESSION.maxLevel?amount:0}));
}
