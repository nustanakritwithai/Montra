import { randomInt, randomUUID } from "node:crypto";

export const FORGE = {
  chances: [100, 90, 85, 80, 70, 60, 50, 40, 35, 30],
  goldPerStep: 40, maxMisses: 3, rerollCost: 60, rareAfter: 4,
  tier1Weight: 65, tier2Weight: 30,
} as const;
type Affix = { stat: "melee" | "ranged"; tier: number };
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
    if (!a || Object.keys(a).length !== 2 || (a.stat !== "ranged" && a.stat !== "melee") || !integer(a.tier, 3) || a.tier < 1) throw Error("inventory_record_invalid");
    affix = {stat:a.stat, tier:a.tier};
  }
  return {instanceId:f.instanceId, revision:f.revision, rank:f.rank, misses:f.misses, affix, rerollMisses:f.rerollMisses};
}
export function forgeStamp(item: {itemId: string; forge?: Forged}): string {
  return item.forge ? item.forge.instanceId + "." + item.forge.revision : item.itemId;
}
export function quoteForge(current: Forged | undefined, action: ForgeAction) {
  if (action === "reroll") return {cost: FORGE.rerollCost, chance: 100};
  const rank = current?.rank ?? 0;
  if (rank >= FORGE.chances.length) throw Error("forge_max_rank");
  return {cost: (rank + 1) * FORGE.goldPerStep,
    chance: current?.misses === FORGE.maxMisses ? 100 : FORGE.chances[rank]};
}
export function rollForge(current: Forged | undefined, action: ForgeAction, draw = () => randomInt(100)) {
  const {cost, chance} = quoteForge(current, action);
  const result: Forged = current ? {...current} : {instanceId:randomUUID(), revision:0, rank:0, misses:0, affix:null, rerollMisses:0};
  result.revision++;
  const roll = draw();
  const success = roll < chance;
  let affixRoll: number | null = null;
  if (action === "reroll") {
    const tier = result.rerollMisses === FORGE.rareAfter ? 3 : roll < FORGE.tier1Weight ? 1 : roll < FORGE.tier1Weight + FORGE.tier2Weight ? 2 : 3;
    affixRoll = draw();
    result.affix = {tier, stat: affixRoll < 50 ? "melee" : "ranged"};
    result.rerollMisses = tier === 3 ? 0 : result.rerollMisses + 1;
  } else if (success) {
    result.rank++; result.misses = 0;
  } else {
    result.misses++;
  }
  return {cost, chance, roll, affixRoll, success, forge: result};
}