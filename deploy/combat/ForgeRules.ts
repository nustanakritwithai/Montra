import { randomInt, randomUUID } from "node:crypto";
import { personalItem, type CatalystId, type ForgeRating, type PersonalDefinition } from "./PersonalItems.js";

export const FORGE = {
  chances: [100, 100, 100, 100, 100, 95, 90, 70, 55, 40],
  goldPerStep: 12, maxMisses: 3, rerollCost: 60, rareAfter: 4,
  tier1Weight: 65, tier2Weight: 30,
} as const;
// The server uses the same per-rank quote that the workshop displays.
const enhanceSteps=FORGE.chances.map((chance,rank)=>({
  chance,gold:(rank+1)*FORGE.goldPerStep,copies:1+Math.floor(rank/3),
  breakOnFailure:chance<100,
}));
export const FORGE_CATALOG = {...FORGE,enhanceSteps};
type Affix = { stat: ForgeRating; tier: number };
export type Forged = { instanceId: string; revision: number; rank: number; misses: number; affix: Affix | null; rerollMisses: number };
export type ForgeAction = "enhance" | "reroll";
function integer(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;
}
export function readForged(value: unknown): Forged {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("inventory_record_invalid");
  const f = value as Record<string, unknown>;
  if (Object.keys(f).length !== 6 || typeof f.instanceId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(f.instanceId) ||
      !integer(f.revision, Number.MAX_SAFE_INTEGER) || f.revision < 1 || !integer(f.rank, FORGE.chances.length) ||
      !integer(f.misses, FORGE.maxMisses) || !integer(f.rerollMisses, FORGE.rareAfter)) throw Error("inventory_record_invalid");
  let affix: Affix | null = null;
  if (f.affix !== null) {
    const a = f.affix as Partial<Affix> | undefined;
    if (!a || Object.keys(a).length !== 2 || !["melee","ranged","guard","healing"].includes(a.stat!) || !integer(a.tier, 3) || a.tier < 1) throw Error("inventory_record_invalid");
    affix = {stat:a.stat!, tier:a.tier};
  }
  return {instanceId:f.instanceId, revision:f.revision, rank:f.rank, misses:f.misses, affix, rerollMisses:f.rerollMisses};
}
export function forgeStamp(item: {itemId: string; forge?: Forged}): string {
  return item.forge ? item.forge.instanceId + "." + item.forge.revision : item.itemId;
}
export function quoteForge(current: Forged | undefined, action: ForgeAction, level=1) {
  const factor=1+(level-1)/100;
  if (action === "reroll") return {cost: Math.round(FORGE.rerollCost*factor), chance: 100};
  const rank = current?.rank ?? 0;
  const step=enhanceSteps[rank];
  if (!step) throw Error("forge_max_rank");
  return {cost:Math.round(step.gold*factor),chance:step.chance};
}
export function rerollIngredient(def:PersonalDefinition|undefined) {
  return def?.forge?{item:`ref_seal_${def.forge.materialTier}` as CatalystId,qty:1}:null;
}
export function plainForge():Forged {
  return {instanceId:randomUUID(),revision:1,rank:0,misses:0,affix:null,rerollMisses:0};
}
export function rollForge(current: Forged | undefined, action: ForgeAction, draw = () => randomInt(100), def?:PersonalDefinition) {
  const {cost, chance} = quoteForge(current,action,def?.level);
  const result: Forged = current ? {...current,revision:current.revision+1} : plainForge();
  const roll = draw();
  const success = roll < chance;
  let affixRoll: number | null = null;
  if (action === "reroll") {
    const cap=def?.forge?.affixTierCap??3;
    const tier=result.rerollMisses===FORGE.rareAfter?cap:Math.min(cap,roll<FORGE.tier1Weight?1:roll<FORGE.tier1Weight+FORGE.tier2Weight?2:3);
    affixRoll = draw();
    const pool=def?.forge?.pool??(["melee","ranged"] as const);
    result.affix={tier,stat:pool[Math.floor(affixRoll*pool.length/100)]};
    result.rerollMisses = tier === cap ? 0 : result.rerollMisses + 1;
  } else if (success) {
    result.rank++; result.misses = 0;
  }
  return {cost, chance, roll, affixRoll, success, broken:action==="enhance" && !success, forge:result};
}
export function birthForge(id:string):Forged|undefined {
  const def=personalItem(id);
  if(def?.forge && (def.level??1)>=25)return rollForge(undefined,"reroll",undefined,def).forge;
  return def?.copyLimit===2?plainForge():undefined;
}
export function applyForgeRatings(total:Record<ForgeRating,number>,id:string,f:Forged|undefined):void {
  const profile=personalItem(id)?.forge;
  if(!profile || !f)return;
  total[profile.primary]+=profile.enhanceMax*f.rank/10;
  if(f.affix)total[f.affix.stat]+=profile.affixMax*f.affix.tier/3;
}
