import type { StatModifier } from "./StatModifiers.js";

/** Server-owned starter skill configuration; values are provisional. */
const POSSESSION_BONUS=0.2;
export const POSSESSION_BUFF = Object.freeze({
  id:"possession", durationMs:60_000, cooldownMs:30_000, statMultiplier:1+POSSESSION_BONUS,
  requiresSummon:true, target:"self" as const,
});
export const POSSESSION_MODIFIER:StatModifier = Object.freeze({
  id:"possession",sourceId:"self",group:"possession",
  bonuses:Object.freeze({atk:POSSESSION_BONUS,def:POSSESSION_BONUS,magicAtk:POSSESSION_BONUS,magicDef:POSSESSION_BONUS}),
});
