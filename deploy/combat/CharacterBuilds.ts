import type { StatModifier } from "./StatModifiers.js";

export const SUPPORT_RADIUS = 12;
export const DEFAULT_WARD_TALENT = "lasting";
export const WARD_TALENTS = {
  lasting: { name: "คุ้มกันนาน", radius: SUPPORT_RADIUS, durationMs: 10_000 },
  wide: { name: "คุ้มกันกว้าง", radius: 18, durationMs: 6_000 },
} as const;
export type WardTalentId = keyof typeof WARD_TALENTS;
export type CharacterBuild = { path: PathId; ancestry: AncestryId; wardTalent?: WardTalentId };
type SkillEffect = { kind: "buff"; bonuses: StatModifier["bonuses"]; durationMs: number } | { kind: "heal"; fraction: number };
type PathDefinition = { role: string; name: string; skill: string; targets: "self" | "party"; stamina: number; cooldownMs: number; effect: SkillEffect };

export const PATHS = {
  blade: { role: "นักรบอาคม", name: "คมดาบ", skill: "ปลุกคมดาบ", targets: "self", stamina: 20, cooldownMs: 25_000, effect: {kind: "buff", durationMs: 10_000, bonuses: {atk: 0.25}} },
  sentinel: { role: "นักรบอาคม", name: "ผู้พิทักษ์", skill: "ยันต์คุ้มกาย", targets: "party", stamina: 25, cooldownMs: 30_000, effect: {kind: "buff", durationMs: WARD_TALENTS.lasting.durationMs, bonuses: {def: 0.20}} },
  seer: { role: "จอมอาคม", name: "ผู้ร่ายเวท", skill: "เพ่งจิต", targets: "self", stamina: 20, cooldownMs: 25_000, effect: {kind: "buff", durationMs: 10_000, bonuses: {magicAtk: 0.25}} },
  mender: { role: "จอมอาคม", name: "ผู้เยียวยา", skill: "พรฟื้นกาย", targets: "party", stamina: 25, cooldownMs: 30_000, effect: {kind: "heal", fraction: 0.10} },
} as const satisfies Record<string, PathDefinition>;
export type PathId = keyof typeof PATHS;
export const ANCESTRIES = {
  woodland: { name: "ชาวป่า", trait: "บอกทิศไปค่ายล่าใกล้ที่สุด" },
  shrine: { name: "ชาวศาล", trait: "บอกทิศไปเขตพักใกล้ที่สุด" },
} as const;
export type AncestryId = keyof typeof ANCESTRIES;

export function classSkill(path: PathId, talent: WardTalentId = DEFAULT_WARD_TALENT): PathDefinition & { radius: number } {
  if (path === "sentinel") {
    const ward = WARD_TALENTS[talent];
    const skill = PATHS.sentinel;
    return {...skill, radius: ward.radius, effect: {...skill.effect, durationMs: ward.durationMs}};
  }
  const skill = PATHS[path];
  return {...skill, radius: skill.targets === "party" ? SUPPORT_RADIUS : 0};
}

export function parseBuild(value: unknown): CharacterBuild | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  if (!Object.hasOwn(fields, "path") || !Object.hasOwn(fields, "ancestry") ||
      typeof fields.path !== "string" || typeof fields.ancestry !== "string") return null;
  if (Object.keys(fields).some(key => key !== "path" && key !== "ancestry" && key !== "wardTalent")) return null;
  if (!Object.hasOwn(PATHS, fields.path) || !Object.hasOwn(ANCESTRIES, fields.ancestry)) return null;
  const build: CharacterBuild = {path: fields.path as PathId, ancestry: fields.ancestry as AncestryId};
  if (Object.hasOwn(fields, "wardTalent")) {
    if (build.path !== "sentinel" || typeof fields.wardTalent !== "string" || !Object.hasOwn(WARD_TALENTS, fields.wardTalent)) return null;
    build.wardTalent = fields.wardTalent as WardTalentId;
  }
  return build;
}
export const BUILD_CATALOG = JSON.stringify({ paths: PATHS, ancestries: ANCESTRIES, supportRadius: SUPPORT_RADIUS, wardTalents: WARD_TALENTS, defaultWardTalent: DEFAULT_WARD_TALENT });
