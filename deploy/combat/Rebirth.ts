/** Server-owned rebirth and per-class mastery. No client-supplied bonuses. */
import { PATHS, type PathId } from "./CharacterBuilds.js";

export const MAX_REBIRTHS = 15;
export const MAX_CLASS_MASTERY = 2;
export type RebirthState = {
  count: number;
  /** Highest level reached in each class, including earlier cycles. */
  highest: Partial<Record<PathId, number>>;
  mastery: Partial<Record<PathId, number>>;
  /** One mastery award at most for each level-100 cycle. */
  creditedCycle: number | null;
};

export function newRebirthState(): RebirthState {
  return { count: 0, highest: {}, mastery: {}, creditedCycle: null };
}

export function validateRebirthState(value: unknown): RebirthState {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("invalid_rebirth");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join(",") !== "count,creditedCycle,highest,mastery" ||
      !Number.isInteger(input.count) || (input.count as number) < 0 || (input.count as number) > MAX_REBIRTHS ||
      (input.creditedCycle !== null && (!Number.isInteger(input.creditedCycle) || (input.creditedCycle as number) < 0 || (input.creditedCycle as number) > (input.count as number)))) throw Error("invalid_rebirth");
  const read = (field: unknown, min: number, max: number): Partial<Record<PathId,number>> => {
    if (!field || typeof field !== "object" || Array.isArray(field)) throw Error("invalid_rebirth");
    const result: Partial<Record<PathId,number>> = {};
    for (const [path, number] of Object.entries(field)) {
      if (!Object.hasOwn(PATHS,path) || !Number.isInteger(number) || (number as number) < min || (number as number) > max) throw Error("invalid_rebirth");
      result[path as PathId] = number as number;
    }
    return result;
  };
  const highest=read(input.highest,1,100), mastery=read(input.mastery,1,MAX_CLASS_MASTERY);
  for (const path of Object.keys(mastery) as PathId[]) if (highest[path] !== 100) throw Error("invalid_rebirth");
  if (Object.values(mastery).reduce((a,b)=>a+b,0) > (input.count as number)+1) throw Error("invalid_rebirth");
  return {count:input.count as number,highest,mastery,creditedCycle:input.creditedCycle as number|null};
}

/** Call on the same durable write that first reaches level 100. */
export function recordClassLevel(state: RebirthState, path: PathId, level: number): RebirthState {
  const prior=validateRebirthState(state);
  if (!Object.hasOwn(PATHS,path) || !Number.isInteger(level) || level < 1 || level > 100) throw Error("invalid_rebirth_level");
  const next: RebirthState={...prior,highest:{...prior.highest},mastery:{...prior.mastery}};
  next.highest[path]=Math.max(next.highest[path] ?? 1,level);
  if (level===100 && next.creditedCycle!==next.count) {
    next.mastery[path]=Math.min(MAX_CLASS_MASTERY,(next.mastery[path] ?? 0)+1);
    next.creditedCycle=next.count;
  }
  return next;
}

/** Returned state belongs in the same transaction as the level/class reset. */
export function startNextLife(state: RebirthState, path: PathId, level: number): RebirthState {
  if (level!==100) throw Error("rebirth_level_required");
  const recorded=recordClassLevel(state,path,level);
  if (recorded.count>=MAX_REBIRTHS) throw Error("rebirth_maximum");
  return {...recorded,count:recorded.count+1};
}

export function classLearningLevel(state: RebirthState | undefined, path: PathId, level: number): number {
  return Math.max(level,state?.highest[path] ?? 1);
}

/** Additive bonuses, in fractions. PvP mastery is half of PvE. */
export function rebirthBonuses(state: RebirthState, mode: "pve" | "pvp") {
  const saved=validateRebirthState(state), pvp=mode==="pvp", mastery=(path:PathId)=>(saved.mastery[path] ?? 0)*(pvp?.0125:.025);
  const general=saved.count*(pvp?.003:.01);
  return {
    hp:general+mastery("muay_boran"), atk:general+mastery("phutthaisawan"), magicAtk:general+mastery("phutthaisawan"),
    def:mastery("sentinel"), magicDef:mastery("sentinel"), mana:mastery("seer"),
    regen:mastery("mender"), movement:(saved.mastery.blade ?? 0)*(pvp?.005:.01),
  };
}
