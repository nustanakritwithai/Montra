import { randomInt } from "node:crypto";
import type { CombatStats } from "./Progression.js";

export type ItemStats = Partial<Record<"hp" | "stamina" | "atk" | "def" | "magicAtk" | "magicDef",number>>;
export const BODY_SLOTS=["head","shoulders","chest","arms","leftHand","rightHand","legs","feet","offHand","neck","leftEar","rightEar","leftRing","rightRing"] as const;
export type BodySlot=typeof BODY_SLOTS[number];
export function isBodySlot(value:unknown):value is BodySlot {
  return BODY_SLOTS.some(slot=>slot===value);
}
export function equipPositions(kind:unknown):readonly BodySlot[] {
  if(kind==="earring")return ["leftEar","rightEar"];
  if(kind==="ring")return ["leftRing","rightRing"];
  return isBodySlot(kind)?[kind]:[];
}
export type PersonalDefinition = {
  name:string; kind:"mainHand"|BodySlot|"earring"|"ring"|"material"|"consumable"; path:string; stats:ItemStats;
  recipe?:readonly {item:string; qty:number}[];
};
export const PERSONAL_ITEMS = {
  mat_metal_1: {"name":"แร่เหล็กชั้น1","kind":"material","path":"all","stats":{}},
  mat_wood_1: {"name":"แก่นไม้ชั้น1","kind":"material","path":"all","stats":{}},
  mat_fiber_1: {"name":"เส้นใยป่านชั้น1","kind":"material","path":"all","stats":{}},
  mat_hide_1: {"name":"แผ่นหนังชั้น1","kind":"material","path":"all","stats":{}},
  mat_ink_1: {"name":"เขม่าหมึกชั้น1","kind":"material","path":"all","stats":{}},
  mat_herb_1: {"name":"รากสมุนไพรชั้น1","kind":"material","path":"all","stats":{}},
  mat_resin_1: {"name":"ยางไม้ชั้น1","kind":"material","path":"all","stats":{}},
  acc_torc_1: {"name":"สร้อยลูกประคำฝึกหัด","kind":"neck","path":"all","stats":{"magicDef":2,"stamina":2},"recipe":[{"item":"mat_wood_1","qty":3},{"item":"mat_fiber_1","qty":2}]},
  acc_gorget_1: {"name":"สร้อยเกราะห่วงฝึกหัด","kind":"neck","path":"all","stats":{"def":2,"hp":8},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_fiber_1","qty":2}]},
  acc_earrings_lotus_1: {"name":"ตุ้มหูบัวลงอาคม","kind":"earring","path":"all","stats":{"magicAtk":2},"recipe":[{"item":"mat_metal_1","qty":2},{"item":"mat_ink_1","qty":2}]},
  acc_earrings_hunter_1: {"name":"ตุ้มหูพรานป่า","kind":"earring","path":"all","stats":{"atk":1,"stamina":2},"recipe":[{"item":"mat_wood_1","qty":2},{"item":"mat_hide_1","qty":2}]},
  acc_earrings_ward_1: {"name":"ตุ้มหูยันต์คุ้มกาย","kind":"earring","path":"all","stats":{"magicDef":2},"recipe":[{"item":"mat_fiber_1","qty":2},{"item":"mat_ink_1","qty":2}]},
  acc_ring_atk_1: {"name":"แหวนคมศึกฝึกหัด","kind":"ring","path":"all","stats":{"atk":2,"stamina":2},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_fiber_1","qty":2}]},
  acc_ring_heal_1: {"name":"แหวนขวัญฝึกหัด","kind":"ring","path":"all","stats":{"magicAtk":2,"magicDef":1},"recipe":[{"item":"mat_wood_1","qty":3},{"item":"mat_ink_1","qty":2}]},
  acc_ring_guard_1: {"name":"แหวนพิทักษ์ศาล","kind":"ring","path":"all","stats":{"def":2,"hp":8},"recipe":[{"item":"mat_metal_1","qty":2},{"item":"mat_resin_1","qty":2}]},
  arm_cloth_chest_1: {"name":"เสื้อผ้าจารอักขระฝึกหัด","kind":"chest","path":"all","stats":{"magicAtk":4,"magicDef":2},"recipe":[{"item":"mat_fiber_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_hide_chest_1: {"name":"เสื้อหนังพรานเงาฝึกหัด","kind":"chest","path":"all","stats":{"atk":4,"stamina":4},"recipe":[{"item":"mat_hide_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_medium_chest_1: {"name":"เสื้อเกราะเกล็ดทัพฝึกหัด","kind":"chest","path":"all","stats":{"def":4,"atk":2},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_heavy_chest_1: {"name":"เสื้อเกราะรักษาเวียงฝึกหัด","kind":"chest","path":"all","stats":{"hp":32,"def":2},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_cloth_head_1: {"name":"เครื่องสวมศีรษะผ้าจารอักขระฝึกหัด","kind":"head","path":"all","stats":{"magicAtk":2,"magicDef":1},"recipe":[{"item":"mat_fiber_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_cloth_legs_1: {"name":"สนับเพลาผ้าจารอักขระฝึกหัด","kind":"legs","path":"all","stats":{"magicAtk":3,"magicDef":1},"recipe":[{"item":"mat_fiber_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_cloth_arms_1: {"name":"ปลอกแขนผ้าจารอักขระฝึกหัด","kind":"arms","path":"all","stats":{"magicAtk":2,"magicDef":1},"recipe":[{"item":"mat_fiber_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_cloth_feet_1: {"name":"รองเท้าผ้าจารอักขระฝึกหัด","kind":"feet","path":"all","stats":{"magicAtk":2,"magicDef":1},"recipe":[{"item":"mat_fiber_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_hide_head_1: {"name":"เครื่องสวมศีรษะหนังพรานเงาฝึกหัด","kind":"head","path":"all","stats":{"atk":2,"stamina":2},"recipe":[{"item":"mat_hide_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_hide_legs_1: {"name":"สนับเพลาหนังพรานเงาฝึกหัด","kind":"legs","path":"all","stats":{"atk":3,"stamina":2},"recipe":[{"item":"mat_hide_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_hide_arms_1: {"name":"ปลอกแขนหนังพรานเงาฝึกหัด","kind":"arms","path":"all","stats":{"atk":2,"stamina":2},"recipe":[{"item":"mat_hide_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_hide_feet_1: {"name":"รองเท้าหนังพรานเงาฝึกหัด","kind":"feet","path":"all","stats":{"atk":2,"stamina":2},"recipe":[{"item":"mat_hide_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_medium_head_1: {"name":"เครื่องสวมศีรษะเกราะเกล็ดทัพฝึกหัด","kind":"head","path":"all","stats":{"def":2,"atk":1},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_medium_legs_1: {"name":"สนับเพลาเกราะเกล็ดทัพฝึกหัด","kind":"legs","path":"all","stats":{"def":3,"atk":1},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_medium_arms_1: {"name":"ปลอกแขนเกราะเกล็ดทัพฝึกหัด","kind":"arms","path":"all","stats":{"def":2,"atk":1},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_medium_feet_1: {"name":"รองเท้าเกราะเกล็ดทัพฝึกหัด","kind":"feet","path":"all","stats":{"def":2,"atk":1},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_heavy_head_1: {"name":"เครื่องสวมศีรษะเกราะรักษาเวียงฝึกหัด","kind":"head","path":"all","stats":{"hp":16,"def":1},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_heavy_legs_1: {"name":"สนับเพลาเกราะรักษาเวียงฝึกหัด","kind":"legs","path":"all","stats":{"hp":24,"def":1},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_heavy_arms_1: {"name":"ปลอกแขนเกราะรักษาเวียงฝึกหัด","kind":"arms","path":"all","stats":{"hp":16,"def":1},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  arm_heavy_feet_1: {"name":"รองเท้าเกราะรักษาเวียงฝึกหัด","kind":"feet","path":"all","stats":{"hp":16,"def":1},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_resin_1","qty":2}]},
  off_brace_1: {"name":"ปลอกหมัดถักฝึกหัด","kind":"offHand","path":"muay_boran","stats":{"stamina":6,"def":1},"recipe":[{"item":"mat_wood_1","qty":3},{"item":"mat_fiber_1","qty":2}]},
  off_guard_1: {"name":"เครื่องรางกระบังดาบฝึกหัด","kind":"offHand","path":"phutthaisawan","stats":{"atk":3,"def":1},"recipe":[{"item":"mat_wood_1","qty":3},{"item":"mat_fiber_1","qty":2}]},
  off_veil_1: {"name":"ผ้ายันต์พรางเงาฝึกหัด","kind":"offHand","path":"blade","stats":{"stamina":6,"magicDef":1},"recipe":[{"item":"mat_wood_1","qty":3},{"item":"mat_fiber_1","qty":2}]},
  off_shield_1: {"name":"โล่หวายฝึกหัด","kind":"offHand","path":"sentinel","stats":{"def":3,"hp":8},"recipe":[{"item":"mat_wood_1","qty":3},{"item":"mat_fiber_1","qty":2}]},
  off_jar_1: {"name":"หม้อวิญญาณฝึกหัด","kind":"offHand","path":"seer","stats":{"magicAtk":3,"stamina":2},"recipe":[{"item":"mat_wood_1","qty":3},{"item":"mat_fiber_1","qty":2}]},
  off_bell_1: {"name":"กระดิ่งเรียกขวัญฝึกหัด","kind":"offHand","path":"mender","stats":{"magicDef":3,"magicAtk":1},"recipe":[{"item":"mat_wood_1","qty":3},{"item":"mat_fiber_1","qty":2}]},
  arm_cloth_shoulders_1: {"name":"เกราะไหล่ผ้าจารอักขระฝึกหัด","kind":"shoulders","path":"all","stats":{"magicAtk":1,"magicDef":1},"recipe":[{"item":"mat_fiber_1","qty":2},{"item":"mat_resin_1","qty":1}]},
  arm_cloth_leftHand_1: {"name":"ถุงมือซ้ายผ้าจารอักขระฝึกหัด","kind":"leftHand","path":"all","stats":{"magicAtk":1,"magicDef":1},"recipe":[{"item":"mat_fiber_1","qty":2},{"item":"mat_resin_1","qty":1}]},
  arm_cloth_rightHand_1: {"name":"ถุงมือขวาผ้าจารอักขระฝึกหัด","kind":"rightHand","path":"all","stats":{"magicAtk":1,"magicDef":1},"recipe":[{"item":"mat_fiber_1","qty":2},{"item":"mat_resin_1","qty":1}]},
  arm_hide_shoulders_1: {"name":"เกราะไหล่หนังพรานเงาฝึกหัด","kind":"shoulders","path":"all","stats":{"atk":1,"stamina":2},"recipe":[{"item":"mat_hide_1","qty":2},{"item":"mat_resin_1","qty":1}]},
  arm_hide_leftHand_1: {"name":"ถุงมือซ้ายหนังพรานเงาฝึกหัด","kind":"leftHand","path":"all","stats":{"atk":1,"stamina":2},"recipe":[{"item":"mat_hide_1","qty":2},{"item":"mat_resin_1","qty":1}]},
  arm_hide_rightHand_1: {"name":"ถุงมือขวาหนังพรานเงาฝึกหัด","kind":"rightHand","path":"all","stats":{"atk":1,"stamina":2},"recipe":[{"item":"mat_hide_1","qty":2},{"item":"mat_resin_1","qty":1}]},
  arm_medium_shoulders_1: {"name":"เกราะไหล่เกราะเกล็ดทัพฝึกหัด","kind":"shoulders","path":"all","stats":{"def":1,"atk":1},"recipe":[{"item":"mat_metal_1","qty":2},{"item":"mat_resin_1","qty":1}]},
  arm_medium_leftHand_1: {"name":"ถุงมือซ้ายเกราะเกล็ดทัพฝึกหัด","kind":"leftHand","path":"all","stats":{"def":1,"atk":1},"recipe":[{"item":"mat_metal_1","qty":2},{"item":"mat_resin_1","qty":1}]},
  arm_medium_rightHand_1: {"name":"ถุงมือขวาเกราะเกล็ดทัพฝึกหัด","kind":"rightHand","path":"all","stats":{"def":1,"atk":1},"recipe":[{"item":"mat_metal_1","qty":2},{"item":"mat_resin_1","qty":1}]},
  arm_heavy_shoulders_1: {"name":"เกราะไหล่เกราะรักษาเวียงฝึกหัด","kind":"shoulders","path":"all","stats":{"hp":8,"def":1},"recipe":[{"item":"mat_metal_1","qty":2},{"item":"mat_resin_1","qty":1}]},
  arm_heavy_leftHand_1: {"name":"ถุงมือซ้ายเกราะรักษาเวียงฝึกหัด","kind":"leftHand","path":"all","stats":{"hp":8,"def":1},"recipe":[{"item":"mat_metal_1","qty":2},{"item":"mat_resin_1","qty":1}]},
  arm_heavy_rightHand_1: {"name":"ถุงมือขวาเกราะรักษาเวียงฝึกหัด","kind":"rightHand","path":"all","stats":{"hp":8,"def":1},"recipe":[{"item":"mat_metal_1","qty":2},{"item":"mat_resin_1","qty":1}]},
  use_salve_1: {"name":"ยาประคบช่างยาฝึกหัด","kind":"consumable","path":"all","stats":{},"recipe":[{"item":"mat_herb_1","qty":3},{"item":"mat_fiber_1","qty":2}]},
  wp_wrap_1: {"name":"ผ้าพันหมัดลานฝึก","kind":"mainHand","path":"muay_boran","stats":{"atk":7,"stamina":6},"recipe":[{"item":"mat_hide_1","qty":3},{"item":"mat_fiber_1","qty":2}]},
  wp_twins_1: {"name":"ดาบคู่ลานฝึก","kind":"mainHand","path":"phutthaisawan","stats":{"atk":7,"stamina":6},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_wood_1","qty":2}]},
  wp_shadow_1: {"name":"กริชเงาลานฝึก","kind":"mainHand","path":"blade","stats":{"atk":7,"magicDef":3},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_hide_1","qty":2}]},
  wp_pike_1: {"name":"ทวนรักษาด่านลานฝึก","kind":"mainHand","path":"sentinel","stats":{"def":7,"hp":24},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_wood_1","qty":2}]},
  wp_wand_1: {"name":"ไม้ครูลงยันต์ลานฝึก","kind":"mainHand","path":"seer","stats":{"magicAtk":7,"magicDef":3},"recipe":[{"item":"mat_wood_1","qty":3},{"item":"mat_ink_1","qty":2}]},
  wp_crook_1: {"name":"ไม้เท้าขวัญลานฝึก","kind":"mainHand","path":"mender","stats":{"magicAtk":7,"stamina":6},"recipe":[{"item":"mat_wood_1","qty":3},{"item":"mat_herb_1","qty":2}]},
} as const satisfies Record<string,PersonalDefinition>;

export type PersonalId = keyof typeof PERSONAL_ITEMS;
export type PracticeWeapon = Extract<PersonalId,`wp_${string}`>;
export type ChestId = Extract<PersonalId,`arm_${string}_chest_1`>;
export type BodyItemId = Extract<PersonalId,`arm_${string}`|`off_${string}`|`acc_${string}`>;
export type MaterialId = Extract<PersonalId,`mat_${string}`>;
export const SALVE_ID = "use_salve_1";
export const WORKBENCH_GOLD = 4;
export function personalItem(id:unknown): PersonalDefinition | undefined {
  return typeof id === "string" && Object.hasOwn(PERSONAL_ITEMS,id) ? PERSONAL_ITEMS[id as PersonalId] : undefined;
}
export function startingWeapon(path:string):PracticeWeapon {
  const id = (Object.keys(PERSONAL_ITEMS) as PersonalId[]).find(key => personalItem(key)?.kind==="mainHand" && personalItem(key)?.path===path);
  if (!id) throw Error("invalid_character_path");
  return id as PracticeWeapon;
}
export function firstChest(path:string):ChestId {
  switch(path) {
    case "mender": case "seer": return "arm_cloth_chest_1";
    case "muay_boran": case "blade": return "arm_hide_chest_1";
    case "sentinel": return "arm_heavy_chest_1";
    default: return "arm_medium_chest_1";
  }
}
const materials = Object.keys(PERSONAL_ITEMS).filter(id=>personalItem(id)?.kind==="material") as MaterialId[];
export function fieldItem(path:string,owned:ReadonlySet<string>):BodyItemId|MaterialId {
  if(randomInt(4)!==0) return materials[randomInt(materials.length)];
  const candidates=(Object.keys(PERSONAL_ITEMS) as PersonalId[]).filter(id=>{
    const def=personalItem(id)!;
    return !owned.has(id) && equipPositions(def.kind).length>0 && (def.path==="all" || def.path===path);
  });
  return candidates.length ? candidates[randomInt(candidates.length)] as BodyItemId : materials[randomInt(materials.length)];
}
export function wearsWraps(id:unknown):boolean { return id==="muay_wraps" || id==="wp_wrap_1"; }
export function wearsTwinSwords(id:unknown):boolean { return id==="arcane_sword" || id==="wp_twins_1"; }
export function withEquipmentStats(base: CombatStats, ids:readonly unknown[]):CombatStats {
  const stats = {...base};
  for (const id of ids) {
    const bonus = personalItem(id)?.stats;
    if (!bonus) continue;
    stats.maxHp += bonus.hp ?? 0;
    stats.maxStamina += bonus.stamina ?? 0;
    for (const key of ["atk","def","magicAtk","magicDef"] as const) stats[key] += bonus[key] ?? 0;
  }
  return stats;
}
