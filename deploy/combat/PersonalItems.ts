import { randomInt } from "node:crypto";
import type { CombatStats } from "./Progression.js";

export type ItemStats = Partial<Record<"hp" | "stamina" | "mana" | "atk" | "def" | "magicAtk" | "magicDef",number>>;
export type ForgeRating="melee"|"ranged"|"guard"|"healing";
export type ForgeProfile={primary:ForgeRating; pool:readonly ForgeRating[]; enhanceMax:number; affixMax:number; materialTier:number};
export const WEAPON_LEVELS=[1,10,20,30,40,50,60,70,85,100] as const;
export const OUTFIT_LEVELS=[1,10,25,45,65,85,95,100] as const;
// End equipment can be made from materials found before the last boss.
export const MATERIAL_LEVELS=[1,10,25,45,65,85,95] as const;
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
  name:string; kind:"mainHand"|BodySlot|"earring"|"ring"|"material"|"catalyst"|"consumable"|"card"; path:string; stats:ItemStats;
  recipe?:readonly {item:string; qty:number}[];
  monster?:string;
  chancePct?:number;
  level?:number; rarity?:string; family?:string; recommended?:readonly string[]; dropMax?:number;
  forge?:ForgeProfile; craftGold?:number; sellGold?:number; healHp?:number; sourceCamp?:string;
};
const STARTING_ITEMS = {
  card_possessed: {"name":"การ์ดผีสิง","kind":"card","path":"all","stats":{"atk":1},"monster":"ผีสิง","chancePct":12},
  card_lost_ghost: {"name":"การ์ดผีหลงป่า","kind":"card","path":"all","stats":{"hp":8},"monster":"ผีหลงป่า","chancePct":12},
  card_root_shadow: {"name":"การ์ดเงารากไม้","kind":"card","path":"all","stats":{"def":1},"monster":"เงารากไม้","chancePct":12},
  card_arcane_spirit: {"name":"การ์ดวิญญาณอาคม","kind":"card","path":"all","stats":{"magicAtk":1},"monster":"วิญญาณอาคม","chancePct":12},
  card_shrine_keeper: {"name":"การ์ดผู้พิทักษ์ศาลร้าง","kind":"card","path":"all","stats":{"def":2,"hp":8},"monster":"ผู้พิทักษ์ศาลร้าง","chancePct":20},
  card_rift_warden: {"name":"การ์ดราชันรอยแยก","kind":"card","path":"all","stats":{"atk":2,"magicAtk":2},"monster":"ราชันรอยแยก","chancePct":25,"level":100},
  card_reed: {name:"การ์ดพรายกอกก",kind:"card",path:"all",stats:{stamina:4},monster:"พรายกอกก",chancePct:10,level:10,sourceCamp:"atlas_drowned_marsh_1"},
  card_bamboo: {name:"การ์ดผีตาไผ่",kind:"card",path:"all",stats:{atk:2},monster:"ผีตาไผ่",chancePct:10,level:25,sourceCamp:"atlas_bamboo_frontier_1"},
  card_lotus: {name:"การ์ดภูตบัวธูป",kind:"card",path:"all",stats:{magicAtk:2,stamina:2},monster:"ภูตบัวธูป",chancePct:10,level:40,sourceCamp:"atlas_lotus_basin_1"},
  card_merchant: {name:"การ์ดเงาพ่อค้า",kind:"card",path:"all",stats:{hp:16,magicDef:1},monster:"เงาพ่อค้า",chancePct:10,level:55,sourceCamp:"atlas_fallen_city_1"},
  card_asura: {name:"การ์ดอสุราลาดตระเวน",kind:"card",path:"all",stats:{def:3},monster:"อสุราลาดตระเวน",chancePct:10,level:68,sourceCamp:"atlas_asura_peak_1"},
  card_dream: {name:"การ์ดเงาเศษฝัน",kind:"card",path:"all",stats:{magicAtk:2,hp:16},monster:"เงาเศษฝัน",chancePct:10,level:80,sourceCamp:"atlas_spirit_rift_1"},
  card_forge_master: {name:"การ์ดนายเตาหลอมอสุรา",kind:"card",path:"all",stats:{atk:3,stamina:2},monster:"นายเตาหลอมอสุรา",chancePct:10,level:85,sourceCamp:"atlas_asura_peak_5"},
  card_light_eater: {name:"การ์ดผู้กลืนแสง",kind:"card",path:"all",stats:{magicAtk:2,mana:4},monster:"ผู้กลืนแสง",chancePct:10,level:85,sourceCamp:"atlas_spirit_rift_2"},
  card_last_spirit: {name:"การ์ดวิญญาณปลายกาล",kind:"card",path:"all",stats:{magicAtk:3,mana:2},monster:"วิญญาณปลายกาล",chancePct:10,level:95,sourceCamp:"atlas_spirit_rift_3"},
  card_star_warden: {name:"การ์ดผู้เฝ้าดาวดับ",kind:"card",path:"all",stats:{def:3,hp:8},monster:"ผู้เฝ้าดาวดับ",chancePct:10,level:95,sourceCamp:"atlas_spirit_rift_5"},
  mat_metal_1: {"name":"แร่เหล็กชั้น1","kind":"material","path":"all","stats":{}},
  mat_wood_1: {"name":"แก่นไม้ชั้น1","kind":"material","path":"all","stats":{}},
  mat_fiber_1: {"name":"เส้นใยป่านชั้น1","kind":"material","path":"all","stats":{}},
  mat_hide_1: {"name":"แผ่นหนังชั้น1","kind":"material","path":"all","stats":{}},
  mat_ink_1: {"name":"เขม่าหมึกชั้น1","kind":"material","path":"all","stats":{}},
  mat_herb_1: {"name":"รากสมุนไพรชั้น1","kind":"material","path":"all","stats":{}},
  mat_resin_1: {"name":"ยางไม้ชั้น1","kind":"material","path":"all","stats":{}},
  acc_torc_1: {"name":"สร้อยลูกประคำฝึกหัด","kind":"neck","path":"all","stats":{"magicDef":2,"stamina":2},"recipe":[{"item":"mat_wood_1","qty":3},{"item":"mat_fiber_1","qty":2}]},
  acc_gorget_1: {"name":"สร้อยเกราะห่วงฝึกหัด","kind":"neck","path":"all","stats":{"def":2,"hp":8},"recipe":[{"item":"mat_metal_1","qty":3},{"item":"mat_fiber_1","qty":2}]},
  acc_fang_1: {name:"สร้อยเขี้ยวเสือฝึกหัด",kind:"neck",path:"all",stats:{atk:2,stamina:2},recipe:[{item:"mat_hide_1",qty:3},{item:"mat_fiber_1",qty:2}]},
  acc_spell_1: {name:"สร้อยตราอักขระฝึกหัด",kind:"neck",path:"all",stats:{magicAtk:2,mana:2},recipe:[{item:"mat_ink_1",qty:3},{item:"mat_fiber_1",qty:2}]},
  acc_earrings_duelist_1: {name:"ตุ้มหูคมศึกฝึกหัด",kind:"earring",path:"all",stats:{atk:1,hp:8},recipe:[{item:"mat_metal_1",qty:2},{item:"mat_hide_1",qty:2}]},
  acc_earrings_focus_1: {name:"ตุ้มหูจารคาถาฝึกหัด",kind:"earring",path:"all",stats:{magicAtk:1,mana:2},recipe:[{item:"mat_ink_1",qty:2},{item:"mat_resin_1",qty:2}]},
  acc_ring_spell_1: {name:"แหวนตราผีฝึกหัด",kind:"ring",path:"all",stats:{magicAtk:2,mana:2},recipe:[{item:"mat_metal_1",qty:3},{item:"mat_ink_1",qty:2}]},
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

type BaseId=keyof typeof STARTING_ITEMS;
type Stem<K extends string>=K extends `${infer Family}_1`?Family:never;
type FieldGearId = `arm_field_${string}_${number}`;
export type PersonalId = BaseId | `${Stem<BaseId>}_${number}` | `ref_${string}_${number}` | FieldGearId;
export type PracticeWeapon = Extract<PersonalId,`wp_${string}`>;
export type ChestId = Extract<BaseId,`arm_${string}_chest_1`>;
export type BodyItemId = Extract<PersonalId,`arm_${string}`|`off_${string}`|`acc_${string}`>;
export type MaterialId = Extract<PersonalId,`mat_${string}`>;
export type CatalystId = Extract<PersonalId,`ref_${string}`>;
export type SalveId = Extract<PersonalId,`use_salve_${number}`>;
export type CardId = Extract<PersonalId,`card_${string}`>;
export const SALVE_ID = "use_salve_1";
export const WORKBENCH_GOLD = 4;
const fieldKits={
  muay_boran:{title:"คาดเชือก",armor:"hide",offHand:"off_brace",neck:"acc_fang",earring:"acc_earrings_duelist",ring:"acc_ring_atk"},
  phutthaisawan:{title:"ดาบคู่",armor:"medium",offHand:"off_guard",neck:"acc_fang",earring:"acc_earrings_hunter",ring:"acc_ring_atk"},
  blade:{title:"พรางเงา",armor:"hide",offHand:"off_veil",neck:"acc_fang",earring:"acc_earrings_duelist",ring:"acc_ring_atk"},
  sentinel:{title:"รักษาด่าน",armor:"heavy",offHand:"off_shield",neck:"acc_gorget",earring:"acc_earrings_ward",ring:"acc_ring_guard"},
  seer:{title:"ครูอาคม",armor:"cloth",offHand:"off_jar",neck:"acc_spell",earring:"acc_earrings_focus",ring:"acc_ring_spell"},
  mender:{title:"เรียกขวัญ",armor:"cloth",offHand:"off_bell",neck:"acc_torc",earring:"acc_earrings_focus",ring:"acc_ring_heal"},
} as const;
const schools=Object.keys(fieldKits);
const fieldSlots=["offHand","arms","head","feet","neck","shoulders","ring","legs","leftHand","earring","rightHand","chest"] as const;
const names=["ฝึกหัด","ชายป่า","ศาลเก่า","ด่านคลอง","ป่าลึก","ค่ายหน้า","เวียงเหล็ก","ภูผา","ทัพหลวง","พิชัยยุทธ์"];
const outfitNames=["ฝึกหัด","ชายป่า","สำนักครู","ค่ายหน้า","เวียงเหล็ก","ทัพหลวง","ราชสำนัก","พิชัยยุทธ์"];
const weights:Required<ItemStats>={atk:1,magicAtk:1,def:1,magicDef:1,hp:.125,stamina:.5,mana:.5};
const catalysts=[["flux","ผงประสาน","metal"],["powder","ผงอาคม","ink"],["oil","น้ำมันชุบ","resin"],["seal","ตราค้ำขวัญ","fiber"],["core","แกนหลอม","wood"]] as const;
export function materialTier(level:number){return MATERIAL_LEVELS.filter(min=>min<=level).length || 1;}
function recommend(family:string,item:PersonalDefinition):readonly string[]{
  if(item.path!=="all")return [item.path];
  if(family==="acc_fang" || family==="acc_earrings_duelist")return ["muay_boran","phutthaisawan","blade","sentinel"];
  if(family==="acc_earrings_ward")return ["sentinel","seer","mender"];
  if(family.includes("_heavy_") || item.stats.hp && item.stats.def)return ["sentinel"];
  if(family.includes("_medium_"))return ["sentinel","phutthaisawan"];
  if(family.includes("_cloth_") || item.stats.magicAtk || item.stats.magicDef)return ["seer","mender"];
  return ["muay_boran","phutthaisawan","blade"];
}
function forgeProfile(item:PersonalDefinition):ForgeProfile {
  const preferred=item.recommended??[];
  let primary:ForgeRating="melee", other:ForgeRating="guard";
  if(item.family==="acc_earrings_ward"){primary="guard";other="healing";}
  else if(item.path==="mender" || item.family==="acc_ring_heal" || item.family==="acc_torc"){primary="healing";other="ranged";}
  else if(preferred.includes("seer")){primary="ranged";other="healing";}
  else if(preferred.includes("sentinel") && !preferred.includes("blade")){primary="guard";other="melee";}
  const spent=Object.entries(item.stats).reduce((sum,[key,value])=>sum+value*weights[key as keyof ItemStats],0);
  const budget=spent/.78;
  return {primary,pool:[primary,other],enhanceMax:Math.max(1,Math.round(budget*.10)),affixMax:Math.max(1,Math.round(budget*.08)),materialTier:materialTier(item.level??1)};
}
function buildPersonalCatalog():Readonly<Record<PersonalId,PersonalDefinition>> {
  const result:Partial<Record<PersonalId,PersonalDefinition>>={};
  function put(id:PersonalId,item:PersonalDefinition){if(result[id])throw Error("duplicate_item:"+id);result[id]=item;}
  for(const [baseKey,raw] of Object.entries(STARTING_ITEMS)){
    const base:PersonalDefinition=raw, family=baseKey.replace(/_1$/,"");
    if(base.kind==="card"){
      put(baseKey as PersonalId,{...base,family,level:base.level??1,rarity:"rare"});
      continue;
    }
    const levels=base.kind==="mainHand"?WEAPON_LEVELS:base.kind==="material"?MATERIAL_LEVELS:OUTFIT_LEVELS;
    for(const [index,level] of levels.entries()){
      const rarity=level>=95?"legendary":level>=65?"epic":level>=25?"rare":level>=10?"uncommon":"common";
      const factor=(14+.52*level)/14.52*({common:1,uncommon:1.04,rare:1.08,epic:1.12,legendary:1.16}[rarity])*(level===100?1.08:1);
      const id=(family+"_"+(index+1)) as PersonalId, material=materialTier(level);
      const item:PersonalDefinition={...base,level,rarity,family,stats:{}};
      if(base.kind!=="consumable")item.dropMax=(levels[index+1]??101)-1;
      for(const [stat,value] of Object.entries(base.stats))item.stats[stat as keyof ItemStats]=Math.round(value*factor);
      if(level>=25 && family==="wp_wrap"){
        item.stats.atk=Math.max(1,item.stats.atk!-1);item.stats.stamina=(item.stats.stamina??0)+2;
      }
      if(level>=25 && family==="wp_pike"){
        const offense=Math.max(1,Math.round(item.stats.def!*.2));
        item.stats.def!-=offense;item.stats.atk=offense;
      }
      if(level>=25){
        // Allocate part of the secondary stat budget to skill resources, at equal cost.
        const donor=["wp_crook","wp_wrap","wp_twins","off_jar","acc_torc"].includes(family)?"stamina":
          ["wp_wand","wp_shadow","off_bell","acc_ring_heal"].includes(family)?"magicDef":null;
        if(donor && item.stats[donor]){
          const moved=Math.floor(item.stats[donor]!*0.4);
          item.stats[donor]!-=moved;item.stats.mana=moved*weights[donor]/weights.mana;
        }
      }
      if(index && base.kind!=="material")item.name=base.name.replace(/(?:ลานฝึก|ฝึกหัด)$/,"")+(base.kind==="mainHand"?names:outfitNames)[index];
      if(base.kind==="material"){
        item.name=base.name.replace(/ชั้น1$/,"ชั้น"+(index+1));item.sellGold=4+Math.floor(level/2);
        if(index>0){item.recipe=[{item:family+"_"+index,qty:3}];item.craftGold=4+Math.floor(level/4);}
      } else {
        item.recipe=base.recipe?.map(input=>({item:input.item.replace(/_1$/,"_"+material),qty:input.qty+Math.floor(index/2)}));
        item.craftGold=level===1?WORKBENCH_GOLD:8+2*level;
        if(base.kind==="consumable")item.healHp=22+Math.round((level-1)*1.8);
        else {item.recommended=recommend(family,item);item.forge=forgeProfile(item);}
      }
      put(id,item);
    }
  }
  // Each level between major unlocks adds one class-specific recipe. Its base stats
  // stay between the regular pieces of the same family on either side of the level.
  const milestones=new Set<number>([...WEAPON_LEVELS,...OUTFIT_LEVELS]);
  let step=0;
  for(let level=2;level<100;level++){
    if(milestones.has(level))continue;
    const slot=fieldSlots[step++%fieldSlots.length];
    const tier=OUTFIT_LEVELS.filter(n=>n<=level).length;
    for(const [path,kit] of Object.entries(fieldKits)){
      const family=slot==="offHand"||slot==="neck"||slot==="ring"||slot==="earring"?kit[slot]:"arm_"+kit.armor+"_"+slot;
      const lower=result[(family+"_"+tier) as PersonalId]!, upper=result[(family+"_"+(tier+1)) as PersonalId]!;
      const progress=(level-lower.level!)/(upper.level!-lower.level!);
      const stats:ItemStats={};
      for(const key of Object.keys({...lower.stats,...upper.stats}) as (keyof ItemStats)[]){
        const from=lower.stats[key]??0, to=upper.stats[key]??0;
        const value=Math.round(from+(to-from)*progress);
        if(value)stats[key]=value;
      }
      const base=result[(family+"_1") as PersonalId]!;
      const item:PersonalDefinition={name:base.name.replace(/ฝึกหัด$/,"")+"สาย"+kit.title+" รุ่น "+level,
        kind:base.kind,family,path,level,stats,rarity:lower.rarity,recommended:[path],dropMax:Math.min(100,level+4),
        recipe:lower.recipe!.map(r=>({item:r.item.replace(/_\d+$/,"_"+materialTier(level)),qty:r.qty})),craftGold:8+level*2};
      item.forge=forgeProfile(item);
      put(`arm_field_${path}_${level}`,item);
    }
  }
  for(const [i,level] of MATERIAL_LEVELS.entries())for(const [key,name,source] of catalysts)
    put(`ref_${key}_${i+1}`,{name:name+"ชั้น"+(i+1),kind:"catalyst",path:"all",level,stats:{},rarity:"common",craftGold:4+Math.floor(level/4),recipe:[{item:`mat_${source}_${i+1}`,qty:2}]});
  return Object.freeze(result) as Readonly<Record<PersonalId,PersonalDefinition>>;
}
export const PERSONAL_ITEMS=buildPersonalCatalog();
const catalogEntries=Object.entries(PERSONAL_ITEMS);
export const CATALOG_PAGES=Array.from({length:Math.ceil(catalogEntries.length/16)},(_,i)=>Object.fromEntries(catalogEntries.slice(i*16,i*16+16)));
export function personalItem(id:unknown): PersonalDefinition | undefined {
  return typeof id === "string" && Object.hasOwn(PERSONAL_ITEMS,id) ? PERSONAL_ITEMS[id as PersonalId] : undefined;
}
export function isCardId(id:unknown):id is CardId {return personalItem(id)?.kind==="card";}
const campCards=new Map(Object.entries(PERSONAL_ITEMS).filter(([,def])=>def.sourceCamp).map(([id,def])=>[def.sourceCamp!,id as CardId]));
export function monsterCardFor(id:string,level:number):CardId|null {
  let card:CardId;
  if(id==="possessed-1")card="card_possessed";
  else if(id==="forest_shrine_keeper")card="card_shrine_keeper";
  else if(id==="atlas_rift_warden")card="card_rift_warden";
  else if(/^forest_(west|east|deep_west|deep_east)_[1-4]$/.test(id))
    card=level<5?"card_lost_ghost":level<9?"card_root_shadow":"card_arcane_spirit";
  else {const found=campCards.get(id.replace(/_\d+$/,""));if(!found)return null;card=found;}
  return card;
}
export function monsterCardDrop(id:string,level:number,draw=()=>randomInt(100)):CardId|null {
  const card=monsterCardFor(id,level);
  return card && draw()<(PERSONAL_ITEMS[card].chancePct??0)?card:null;
}
export function startingWeapon(path:string):PracticeWeapon {
  const id = (Object.keys(STARTING_ITEMS) as BaseId[]).find(key => personalItem(key)?.kind==="mainHand" && personalItem(key)?.path===path);
  if (!id) throw Error("invalid_character_path");
  return id as PracticeWeapon;
}
export function firstChest(path:string,level=1):BodyItemId {
  const family=path==="mender"||path==="seer"?"cloth":path==="muay_boran"||path==="blade"?"hide":path==="sentinel"?"heavy":"medium";
  return `arm_${family}_chest_${OUTFIT_LEVELS.filter(min=>level>=min).length||1}` as BodyItemId;
}
const catalogIds=Object.keys(PERSONAL_ITEMS) as PersonalId[];
const materialsByTier=MATERIAL_LEVELS.map(level=>catalogIds.filter(id=>PERSONAL_ITEMS[id].kind==="material" && PERSONAL_ITEMS[id].level===level) as MaterialId[]);
const dropsByLevel=new Map<string,PersonalId[]>();
for(const path of schools)for(let level=1;level<=100;level++){
  dropsByLevel.set(path+level,catalogIds.filter(id=>{
    const def=PERSONAL_ITEMS[id];
    return (def.path==="all" || def.path===path) &&
      !!def.forge && def.level!<=level && level<=def.dropMax!;
  }));
}
export function fieldItem(path:string,owned:ReadonlySet<string>,monsterLevel=1,draw:(max:number)=>number=randomInt):BodyItemId|PracticeWeapon|MaterialId {
  const level=Math.min(100,Math.max(1,Math.floor(monsterLevel)));
  if(draw(4)===0){
    const candidates=(dropsByLevel.get(path+level)??[]).filter(id=>!owned.has(id));
    if(candidates.length)return candidates[draw(candidates.length)] as BodyItemId|PracticeWeapon;
  }
  const mats=materialsByTier[materialTier(level)-1];
  return mats[draw(mats.length)];
}
export function wearsWraps(id:unknown):boolean { return id==="muay_wraps" || personalItem(id)?.family==="wp_wrap"; }
export function wearsTwinSwords(id:unknown):boolean { return id==="arcane_sword" || personalItem(id)?.family==="wp_twins"; }
export function usesStaff(id:unknown):boolean {const family=personalItem(id)?.family;return id==="spirit_staff" || family==="wp_wand" || family==="wp_crook";}
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
