import type { StatModifier } from "./StatModifiers.js";

export type CharacterBuild = { path: PathId; ancestry: AncestryId };
type SkillEffect = { kind: "buff"; bonuses: StatModifier["bonuses"]; durationMs: number } | { kind: "heal"; fraction: number };
type PathDefinition = { role: string; name: string; skill: string; targets: "self" | "party"; stamina: number; cooldownMs: number; effect: SkillEffect };

export const PATHS = {
  blade: { role: "นักรบอาคม", name: "คมดาบ", skill: "ปลุกคมดาบ", targets: "self", stamina: 20, cooldownMs: 25_000, effect: {kind: "buff", durationMs: 10_000, bonuses: {atk: 0.25}} },
  sentinel: { role: "นักรบอาคม", name: "ผู้พิทักษ์", skill: "ยันต์คุ้มกาย", targets: "party", stamina: 25, cooldownMs: 30_000, effect: {kind: "buff", durationMs: 10_000, bonuses: {def: 0.20}} },
  seer: { role: "จอมอาคม", name: "ผู้ร่ายเวท", skill: "เพ่งจิต", targets: "self", stamina: 20, cooldownMs: 25_000, effect: {kind: "buff", durationMs: 10_000, bonuses: {magicAtk: 0.25}} },
  mender: { role: "จอมอาคม", name: "ผู้เยียวยา", skill: "พรฟื้นกาย", targets: "party", stamina: 25, cooldownMs: 30_000, effect: {kind: "heal", fraction: 0.10} },
} as const satisfies Record<string, PathDefinition>;
export type PathId = keyof typeof PATHS;
export const ANCESTRIES = {
  woodland: { name: "ชาวป่า", trait: "บอกทิศไปค่ายล่าใกล้ที่สุด" },
  shrine: { name: "ชาวศาล", trait: "บอกทิศไปเขตพักใกล้ที่สุด" },
} as const;
export type AncestryId = keyof typeof ANCESTRIES;
export const SUPPORT_RADIUS = 12;

export function parseBuild(value: unknown): CharacterBuild | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  if (Object.keys(fields).length !== 2 || typeof fields.path !== "string" || typeof fields.ancestry !== "string") return null;
  if (!Object.hasOwn(PATHS, fields.path) || !Object.hasOwn(ANCESTRIES, fields.ancestry)) return null;
  return { path: fields.path as PathId, ancestry: fields.ancestry as AncestryId };
}
export const BUILD_CATALOG = JSON.stringify({ paths: PATHS, ancestries: ANCESTRIES, supportRadius: SUPPORT_RADIUS });
