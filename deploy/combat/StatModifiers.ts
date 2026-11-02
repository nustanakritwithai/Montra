/** Server-only power modifier math. No client-supplied numbers enter this API. */
import type { CombatStats } from "./Progression.js";
export const MODIFIED_STATS = ["atk","def","magicAtk","magicDef"] as const;
export type ModifiedStat = typeof MODIFIED_STATS[number];
export type StatModifier = Readonly<{
  id:string; sourceId:string; group:string;
  bonuses:Readonly<Partial<Record<ModifiedStat,number>>>;
}>;
/** Provisional stack rules. Values are fractions (0.2 = +20%). */
export const STACKING_RULES = Object.freeze({sameGroupFalloff:0.5,maxGroupBonus:2,maxTotalMultiplier:4,maxModifiers:32});
const IDENTIFIER=/^[a-zA-Z0-9_-]{1,80}$/;
/**
 * For each stat, same-group bonuses sort strongest first and contribute
 * 100%, 50%, 25%, ...; independent groups multiply. Always start from base.
 * Caps protect against runaway configured values and are not balance targets.
 */
export function calculateModifiedStats(base:CombatStats, modifiers:readonly StatModifier[]):CombatStats {
  if(!base || ![base.maxHp,base.maxStamina,base.atk,base.def,base.magicAtk,base.magicDef].every(v=>typeof v==="number" && Number.isFinite(v) && v>=0))throw new Error("invalid_base_stats");
  if(!Array.isArray(modifiers) || modifiers.length>STACKING_RULES.maxModifiers)throw new Error("invalid_modifier_count");
  const unique=new Set<string>();
  for(const item of modifiers) {
    if(!item || typeof item.id!=="string" || typeof item.sourceId!=="string" || typeof item.group!=="string" || !IDENTIFIER.test(item.id) || !IDENTIFIER.test(item.sourceId) || !IDENTIFIER.test(item.group) ||
       !item.bonuses || typeof item.bonuses!=="object" || Array.isArray(item.bonuses))throw new Error("invalid_modifier");
    const key=item.sourceId+":"+item.id;
    if(unique.has(key))throw new Error("duplicate_modifier_source");unique.add(key);
    for(const [stat,value] of Object.entries(item.bonuses)) {
      if(!MODIFIED_STATS.includes(stat as ModifiedStat) || typeof value!=="number" || !Number.isFinite(value) || value<0 || value>1)throw new Error("invalid_modifier_bonus");
    }
  }
  const result={...base};
  for(const stat of MODIFIED_STATS) {
    const groups=new Map<string,number[]>();
    for(const item of modifiers) {
      const value=item.bonuses[stat]??0;
      if(value>0){const values=groups.get(item.group)??[];values.push(value);groups.set(item.group,values);}
    }
    let multiplier=1;
    for(const values of groups.values()) {
      values.sort((a,b)=>b-a);
      const total=values.reduce((sum,v,i)=>sum+v*STACKING_RULES.sameGroupFalloff**i,0);
      multiplier*=1+Math.min(total,STACKING_RULES.maxGroupBonus);
    }
    result[stat]=Math.round(base[stat]*Math.min(multiplier,STACKING_RULES.maxTotalMultiplier));
  }
  return result;
}
