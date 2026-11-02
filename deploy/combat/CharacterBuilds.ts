import type { StatModifier } from "./StatModifiers.js";

export const SUPPORT_RADIUS = 12;
export const DEFAULT_WARD_TALENT = "lasting";
export const WARD_TALENTS = {
  lasting: { name: "คุ้มกันนาน", radius: SUPPORT_RADIUS, durationMs: 10_000 },
  wide: { name: "คุ้มกันกว้าง", radius: 18, durationMs: 6_000 },
} as const;
export type WardTalentId = keyof typeof WARD_TALENTS;
export const BLADE_TALENTS = {
  steady: {name:"คมต่อเนื่อง", durationMs:10_000, bonuses:{atk:0.25}},
  burst: {name:"คมระเบิด", durationMs:6_000, bonuses:{atk:0.40}},
} as const;
export type BladeTalentId = keyof typeof BLADE_TALENTS;
export type CharacterBuild = { path: PathId; ancestry: AncestryId; wardTalent?: WardTalentId; bladeTalent?: BladeTalentId };
type TalentField = "wardTalent" | "bladeTalent";
type TalentVariant = {name:string; durationMs:number; radius?:number; bonuses?:StatModifier["bonuses"]};
type TalentGroup = {field:TalentField; defaultId:string; variants:Readonly<Record<string,TalentVariant>>};
const TALENT_GROUPS = {
  sentinel: {field:"wardTalent", defaultId:DEFAULT_WARD_TALENT, variants:WARD_TALENTS},
  blade: {field:"bladeTalent", defaultId:"steady", variants:BLADE_TALENTS},
} as const satisfies Record<string,TalentGroup>;
export function talentGroup(path: PathId): TalentGroup | undefined {
  if (path === "sentinel" || path === "blade") return TALENT_GROUPS[path];
}
type SkillEffect = { kind: "buff"; bonuses: StatModifier["bonuses"]; durationMs: number } | { kind: "heal"; fraction: number };
type PathDefinition = { role: string; name: string; skill: string; targets: "self" | "party"; stamina: number; cooldownMs: number; effect: SkillEffect };

export const DUAL_SWORD = Object.freeze({weaponId:"arcane_sword", attackIntervalMs:750, damageMultiplier:0.8});

export const PATHS = {
  muay_boran: { role: "นักมวยอาคม", name: "มวยไทยโบราณ", skill: "จิตนักสู้", targets: "self", stamina: 20, cooldownMs: 25_000, effect: {kind: "buff", durationMs: 8_000, bonuses: {atk:0.15}} },
  phutthaisawan: { role: "นักดาบอยุธยา", name: "นักดาบไทย", skill: "รำดาบคู่", targets: "self", stamina: 20, cooldownMs: 25_000, effect: {kind: "buff", durationMs: 8_000, bonuses: {atk:0.20}} },
  blade: { role: "นักรบอาคม", name: "คมดาบ", skill: "ปลุกคมดาบ", targets: "self", stamina: 20, cooldownMs: 25_000, effect: {kind: "buff", durationMs: BLADE_TALENTS.steady.durationMs, bonuses: BLADE_TALENTS.steady.bonuses} },
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

export function classSkill(path: PathId, talent?: WardTalentId | BladeTalentId): PathDefinition & { radius: number } {
  const skill = PATHS[path];
  const baseRadius = skill.targets === "party" ? SUPPORT_RADIUS : 0;
  const group = talentGroup(path);
  if (!group || skill.effect.kind !== "buff") {
    if (talent !== undefined) throw new Error("invalid_class_talent");
    return {...skill, radius:baseRadius};
  }
  const id = talent ?? group.defaultId;
  if (!Object.hasOwn(group.variants,id)) throw new Error("invalid_class_talent");
  const variant = group.variants[id];
  return {...skill, radius:variant.radius ?? baseRadius,
    effect:{kind:"buff", durationMs:variant.durationMs, bonuses:variant.bonuses ?? skill.effect.bonuses}};
}

export function parseBuild(value: unknown): CharacterBuild | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fields = value as Record<string, unknown>;
  if (!Object.hasOwn(fields, "path") || !Object.hasOwn(fields, "ancestry") ||
      typeof fields.path !== "string" || typeof fields.ancestry !== "string") return null;
  if (!Object.hasOwn(PATHS, fields.path) || !Object.hasOwn(ANCESTRIES, fields.ancestry)) return null;
  const build: CharacterBuild = {path: fields.path as PathId, ancestry: fields.ancestry as AncestryId};
  const group = talentGroup(build.path);
  if (Object.keys(fields).some(key => key !== "path" && key !== "ancestry" && key !== group?.field)) return null;
  if (group && Object.hasOwn(fields, group.field)) {
    const id = fields[group.field];
    if (typeof id !== "string" || !Object.hasOwn(group.variants,id)) return null;
    if (group.field === "wardTalent") build.wardTalent = id as WardTalentId;
    else build.bladeTalent = id as BladeTalentId;
  }
  return build;
}
export const BUILD_CATALOG = JSON.stringify({ paths: PATHS, ancestries: ANCESTRIES, supportRadius: SUPPORT_RADIUS, wardTalents: WARD_TALENTS, defaultWardTalent: DEFAULT_WARD_TALENT, talentGroups: TALENT_GROUPS });
