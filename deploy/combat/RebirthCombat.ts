import {newRebirthState,rebirthBonuses,type RebirthState} from "./Rebirth.js";
import {PROGRESSION} from "./Progression.js";

/** Deployment switch affects power, never earned history or reading existing saves. */
export const MASTERY_ENABLED=process.env.MONTRA_MASTERY_ENABLED==="1";
export type MasteryMode="pve"|"pvp";
export type MasteryVitals={version:1;hpRemainder:number;pvpUntil:number};
const ZERO=Object.freeze({hp:0,atk:0,magicAtk:0,def:0,magicDef:0,mana:0,regen:0,movement:0});
export function masteryBonuses(state:RebirthState|undefined,mode:MasteryMode,enabled=MASTERY_ENABLED){
  return enabled?rebirthBonuses(state??newRebirthState(),mode):ZERO;
}
export function masteryCapacity(base:number,bonus:number):number {return Math.round(base*(1+bonus));}
/** Only context changes rescale resources; equipment and buffs retain the clamp rule. */
export function scaleResource(current:number,previousMax:number,nextMax:number):number {
  return Math.max(0,Math.min(nextMax,previousMax>0?current/previousMax*nextMax:current));
}
/** Legacy hp/mana stay in pre-mastery units, readable even when power is disabled. */
export function encodeMasteryVitals(hp:number,mana:number,hpScale:number,manaScale:number,pvpUntil:number){
  const normalizedHp=Math.min(PROGRESSION.maxHp,Math.max(0,hp/hpScale)),whole=Math.floor(normalizedHp);
  return {hp:whole,mana:Math.min(PROGRESSION.maxMana,Math.max(0,mana/manaScale)),
    masteryVitals:{version:1 as const,hpRemainder:normalizedHp-whole,pvpUntil}};
}
export function validateMasteryVitals(value:unknown,updatedAt:string,hp:number):MasteryVitals|undefined {
  if(value===undefined)return undefined;
  if(!value || typeof value!=="object" || Array.isArray(value))throw Error("invalid_mastery_vitals");
  const v=value as Record<string,unknown>,savedAt=Date.parse(updatedAt);
  if(Object.keys(v).sort().join(",")!=="hpRemainder,pvpUntil,version" || v.version!==1 ||
      typeof v.hpRemainder!=="number" || !Number.isFinite(v.hpRemainder) || v.hpRemainder<0 || v.hpRemainder>=1 ||
      hp+v.hpRemainder>PROGRESSION.maxHp || !Number.isSafeInteger(v.pvpUntil) || (v.pvpUntil as number)<0 ||
      !Number.isFinite(savedAt) || (v.pvpUntil as number)>savedAt+PROGRESSION.combatQuietMs+1000)throw Error("invalid_mastery_vitals");
  return {version:1,hpRemainder:v.hpRemainder,pvpUntil:v.pvpUntil as number};
}
export function masteryPreview(state:RebirthState|undefined){
  return {enabled:MASTERY_ENABLED,pve:masteryBonuses(state,"pve"),pvp:masteryBonuses(state,"pvp")};
}
