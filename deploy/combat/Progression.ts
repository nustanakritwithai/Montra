/** Server-owned provisional Hybrid progression. Values are tuning parameters. */
export const STAT_KEYS = ["hp", "atk", "def", "magicAtk", "magicDef", "stamina"] as const;
export type StatKey = typeof STAT_KEYS[number];
export type Allocations = Record<StatKey, number>;
export type CombatStats = { maxHp: number; atk: number; def: number; magicAtk: number; magicDef: number; maxStamina: number };
export const PROGRESSION = Object.freeze({
  maxLevel: 100, maxExperience: 1_000_000_000,
  legacyMaxLevel: 1000, pointsPerLevel: 3,
  monsterBaseExperience: 100, monsterLevel: 1,
  xpBase: 100, xpQuadratic: 50,
  baseHp: 240, baseAtk: 20, baseDef: 30, baseMagicAtk: 15, baseMagicDef: 20,
  baseStamina: 100, maxHp: 10_000, maxStamina: 300,
  combatQuietMs: 5_000, hpRegenOut: 4, hpRegenIn: 0.8,
  staminaRegenOut: 4, staminaRegenIn: 2, dashCost: 50,
});

export function emptyAllocations(): Allocations {
  return { hp: 0, atk: 0, def: 0, magicAtk: 0, magicDef: 0, stamina: 0 };
}
export function pointsAvailable(level: number, allocations: Allocations): number {
  validateAllocations(allocations, level);
  return 0; // The current system grows automatically; old allocations remain readable.
}
export function validateAllocations(value: unknown, level: number): Allocations {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_stat_allocations");
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== STAT_KEYS.length) throw new Error("invalid_stat_allocations");
  const result = emptyAllocations();
  for (const key of STAT_KEYS) {
    const n = record[key];
    if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 0 || n > PROGRESSION.legacyMaxLevel * PROGRESSION.pointsPerLevel) {
      throw new Error("invalid_stat_allocations");
    }
    result[key] = n;
  }
  if (STAT_KEYS.reduce((sum, key) => sum + result[key], 0) > (level - 1) * PROGRESSION.pointsPerLevel) throw new Error("invalid_stat_allocations");
  return result;
}
export function parseAllocateStat(payload: unknown): StatKey | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  if (Object.keys(value).length !== 1 || typeof value.stat !== "string") return null;
  return STAT_KEYS.find(key => key === value.stat) ?? null;
}
export function xpForNextLevel(level: number): number {
  return PROGRESSION.xpBase + PROGRESSION.xpQuadratic * level * level;
}
export function monsterExperience(playerLevel: number, monsterLevel: number): number {
  return Math.floor(PROGRESSION.monsterBaseExperience * monsterLevel * Math.max(0, 1 - 0.05 * (playerLevel - monsterLevel)));
}
export function addExperience(level: number, experience: number, amount: number): { level: number; experience: number } {
  if (!Number.isSafeInteger(level) || level < 1 || level > PROGRESSION.legacyMaxLevel ||
      !Number.isSafeInteger(experience) || experience < 0 || experience > PROGRESSION.maxExperience ||
      !Number.isSafeInteger(amount) || amount < 0) throw new Error("invalid_progression");
  if (level >= PROGRESSION.maxLevel) return { level, experience };
  let xp = Math.min(PROGRESSION.maxExperience, experience + amount);
  while (level < PROGRESSION.maxLevel && xp >= xpForNextLevel(level)) {
    xp -= xpForNextLevel(level); level++;
  }
  return { level, experience: xp };
}
function softCap(value: number, threshold: number): number {
  return value <= threshold ? value : threshold + (value - threshold) * 0.5;
}
export function calculateStats(level: number, allocations: Allocations): CombatStats {
  const a = validateAllocations(allocations, level);
  const scale = 1 + (level - 1) / 15;
  return {
    maxHp: Math.min(PROGRESSION.maxHp, Math.round(PROGRESSION.baseHp * scale + a.hp * 20)),
    atk: Math.round(softCap(PROGRESSION.baseAtk * scale + a.atk * 2, 2000)),
    def: Math.round(softCap(PROGRESSION.baseDef * scale + a.def * 2, 500)),
    magicAtk: Math.round(softCap(PROGRESSION.baseMagicAtk * scale + a.magicAtk * 2, 2000)),
    magicDef: Math.round(softCap(PROGRESSION.baseMagicDef * scale + a.magicDef * 2, 500)),
    maxStamina: Math.min(PROGRESSION.maxStamina, PROGRESSION.baseStamina + (level - 1) * 2 + a.stamina * 5),
  };
}
/** Damage is rounded to the nearest whole point; K scales with defender level. */
export function calculateDamage(attack: number, defense: number, defenderLevel: number): number {
  if (![attack, defense, defenderLevel].every(Number.isFinite) || attack < 0 || defense < 0 || defenderLevel < 1) throw new Error("invalid_combat_stats");
  const k = 100 * (1 + (defenderLevel - 1) / 15);
  return Math.max(1, Math.round(attack * k / (k + defense)));
}
