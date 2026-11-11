import { MUAY_CORE_LEVELS, muayCorePoints } from "./MuayRules.js";
import type { StatModifier } from "./StatModifiers.js";
import { skillRankCost, validateSkillRanks, type SkillRanks } from "./Progression.js";

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

export const TALISMAN = Object.freeze({ range:2.8, magicMultiplier:1.5, cooldownMs:4_000 });
/** Solo PvE support for the healing path; never applied to player targets. */
export const MENDER_PVE_RICE_MULTIPLIER=1.1;


/** Trial sword tree. Levels, costs, and combat values are server-owned. */
/** PvP only: sword skills retain a small setup-based burst advantage. */
export const SWORD_PVP_DAMAGE_MULTIPLIER=0.8;
export const SWORD_SCHOOLS = {
  phutthaisawan: {name:"พุทไธสวรรค์", level:1},
  sritrairat: {name:"ศรีไตรรัตน์", level:10},
  atamat: {name:"อาทมาฏนเรศวร", level:10},
  chumphon: {name:"วังกรมหลวงชุมพร", level:10, note:"แนววิชาทดลองสำหรับเกม กำลังค้นคว้าประวัติเพิ่มเติม"},
} as const;
export type SwordSchool = keyof typeof SWORD_SCHOOLS;
export type SwordEffect = "strike" | "step" | "guard" | "counter" | "flurry" | "area" | "support" | "passive";
export type SwordNode = Readonly<{
  name:string; description:string; school:"common"|SwordSchool; level:number;
  requires:readonly string[]; effect:SwordEffect; stamina:number; cooldownMs:number;
  power:number; range:number; training?:Readonly<{id:"strikes"|"blocks"|"finishes";count:number}>;
}>;
export const SWORD_NODES: Readonly<Record<string,SwordNode>> = Object.freeze({
  footwork:{name:"ย่างสามขุม",description:"ก้าวเข้าหาเป้าหมายและฟัน",school:"common",level:1,requires:[],effect:"step",stamina:13,cooldownMs:6000,power:0.9,range:6},
  guard:{name:"ตั้งดาบรับ",description:"ลดความเสียหายและเปิดโอกาสสวน",school:"common",level:3,requires:["footwork"],training:{id:"strikes",count:5},effect:"guard",stamina:13,cooldownMs:8000,power:0.5,range:0},
  sweep:{name:"ฟันเปิดทาง",description:"ฟันศัตรูด้านหน้าหลายตัว",school:"common",level:5,requires:["footwork"],training:{id:"strikes",count:10},effect:"area",stamina:20,cooldownMs:8000,power:0.85,range:3},
  rhythm:{name:"จังหวะเพลงดาบ",description:"เพิ่มพลังโจมตีประชิด 5%",school:"common",level:7,requires:["guard","sweep"],training:{id:"blocks",count:3},effect:"passive",stamina:0,cooldownMs:0,power:0.05,range:0},
  twin_cut:{name:"ฟันสลับซ้ายขวา",description:"ฟันเป้าหมายสองครั้งต่อเนื่อง",school:"phutthaisawan",level:10,requires:["footwork"],effect:"flurry",stamina:18,cooldownMs:6000,power:0.7,range:2.8},
  circle_step:{name:"ก้าววนคมดาบ",description:"ก้าวเข้าประชิดและฟัน",school:"phutthaisawan",level:15,requires:["twin_cut"],effect:"step",stamina:20,cooldownMs:7000,power:1.2,range:6},
  twin_finale:{name:"เพลงดาบต่อเนื่อง",description:"ใช้คอมโบ 3 จังหวะฟันสามครั้ง",school:"phutthaisawan",level:20,requires:["circle_step","rhythm"],training:{id:"finishes",count:3},effect:"flurry",stamina:30,cooldownMs:15000,power:0.8,range:2.8},
  measure:{name:"ตั้งดาบคุมเชิง",description:"รับความเสียหายและเตรียมสวน",school:"sritrairat",level:10,requires:["guard"],effect:"guard",stamina:18,cooldownMs:9000,power:0.35,range:0},
  riposte:{name:"ก้าวหลบสวน",description:"สวนเมื่อเพิ่งรับการโจมตีสำเร็จ",school:"sritrairat",level:15,requires:["measure"],effect:"counter",stamina:18,cooldownMs:7000,power:1.6,range:3},
  seize:{name:"ฟันชิงจังหวะ",description:"โจมตีหนักหลังรับดาบสำเร็จ",school:"sritrairat",level:20,requires:["riposte","rhythm"],effect:"counter",stamina:25,cooldownMs:12000,power:2.0,range:3},
  circle_guard:{name:"วนดาบคุมทิศ",description:"ป้องกันการโจมตีรอบตัวชั่วครู่",school:"atamat",level:10,requires:["guard"],effect:"guard",stamina:20,cooldownMs:10000,power:0.45,range:0},
  opening_cut:{name:"ปาดเปิดทาง",description:"ฟันศัตรูที่อยู่ด้านหน้า",school:"atamat",level:15,requires:["circle_guard","sweep"],effect:"area",stamina:25,cooldownMs:9000,power:1.1,range:3.5},
  turning_counter:{name:"รับแล้วสวน",description:"สวนศัตรูเมื่อรับการโจมตีสำเร็จ",school:"atamat",level:20,requires:["opening_cut","rhythm"],effect:"counter",stamina:25,cooldownMs:11000,power:1.8,range:3},
  naval_guard:{name:"ตั้งรับคุ้มกัน",description:"ตั้งรับด้านหน้าและเปิดจังหวะสวน",school:"chumphon",level:10,requires:["guard"],effect:"guard",stamina:18,cooldownMs:9000,power:0.4,range:0},
  protect_ally:{name:"ขวัญผู้ร่วมรบ",description:"เพิ่มป้องกันให้ตนและสมาชิกปาร์ตี้ในระยะ 8 หน่วย 10% นาน 8 วินาที",school:"chumphon",level:15,requires:["naval_guard"],effect:"support",stamina:25,cooldownMs:25000,power:0.1,range:8},
  guardian_sweep:{name:"กวาดดาบคุ้มแนว",description:"ฟันศัตรูที่อยู่ด้านหน้า",school:"chumphon",level:20,requires:["protect_ally","rhythm"],effect:"area",stamina:25,cooldownMs:9000,power:1,range:3.5},
  flowing_blades:{name:"เพลงดาบสืบจังหวะ",description:"ฟันเป้าหมายสองครั้งต่อเนื่อง",school:"common",level:35,requires:["rhythm"],training:{id:"strikes",count:50},effect:"flurry",stamina:24,cooldownMs:10000,power:0.72,range:2.8},
  open_circle:{name:"วงดาบเปิดแนว",description:"กวาดมอนสเตอร์ด้านหน้า",school:"common",level:55,requires:["flowing_blades"],training:{id:"finishes",count:8},effect:"area",stamina:30,cooldownMs:14000,power:1.1,range:3.5},
  steady_guard:{name:"รับดาบมั่นคง",description:"ตั้งดาบรับด้านหน้าและเปิดจังหวะสวน",school:"common",level:75,requires:["open_circle"],training:{id:"blocks",count:20},effect:"guard",stamina:23,cooldownMs:12000,power:0.35,range:0},
  final_counter:{name:"เพลงดาบสวนสุดท้าย",description:"สวนเป้าหมายหลังรับสำเร็จ",school:"common",level:95,requires:["steady_guard"],training:{id:"finishes",count:20},effect:"counter",stamina:32,cooldownMs:20000,power:2.15,range:3},
});
// The old book is retained in saves; these four techniques are always available.
export const SWORD_CORE = {
  phuttha_core:{name:"พุทไธสวรรค์ · เพลงดาบคู่",description:"ก้าวเข้าหาเป้าหมายแล้วฟันสามจังหวะ",stamina:24,cooldownMs:12000,kind:"target",effect:"flurry"},
  sritra_core:{name:"ศรีไตรรัตน์ · ตั้งดาบสวน",description:"ตั้งรับ ลดความเสียหายและสวนศัตรูในระยะดาบโดยอัตโนมัติ",stamina:18,cooldownMs:12000,kind:"stance",effect:"guard"},
  atamat_core:{name:"อาทมาฏ · ฟันเปิดแนว",description:"กวาดมอนสเตอร์ด้านหน้าสูงสุดสามตัว หรือโจมตีผู้เล่นที่เลือก",stamina:22,cooldownMs:10000,kind:"target",effect:"area"},
  chumphon_core:{name:"ชุมพร · คุ้มกันสหาย",description:"เพิ่มพลังป้องกันให้ตนเองและสมาชิกปาร์ตี้ในระยะ",stamina:25,cooldownMs:25000,kind:"support",effect:"support"},
} as const;
export type SwordCoreId=keyof typeof SWORD_CORE;
export function swordCoreProgress(rank:number) {
  return {
    phuttha_core:{scale:1+rank*.07,finalPower:.65+(rank>=4?.04:0)+(rank>=8?.04:0)},
    sritra_core:{durationMs:2000+rank*350,damageFactor:Math.max(.42,.7-rank*.035),counterPower:1+rank*.1,counterIntervalMs:rank>=8?300:rank>=4?350:400},
    atamat_core:{range:3.5+rank*.1,power:.85+rank*.06},
    chumphon_core:{range:8+rank*.25,defense:.1+rank*.01,durationMs:8000+rank*250},
  };
}
export type SwordTraining = {strikes:number; blocks:number; finishes:number};
export type SwordLoadouts = Record<SwordSchool,Array<string|null>>;
export function emptySwordLoadouts():SwordLoadouts {
  return {phutthaisawan:[null,null,null],sritrairat:[null,null,null],atamat:[null,null,null],chumphon:[null,null,null]};
}
export const SWORD_RANKABLE_SKILLS=["footwork","sweep","twin_cut","circle_step","twin_finale","riposte","seize","opening_cut","turning_counter","guardian_sweep","flowing_blades","open_circle","final_counter"] as const;
export type SwordTree = {school:SwordSchool; learned:string[]; cooldowns:Record<string,number>; training:SwordTraining; loadouts:SwordLoadouts;ranks?:SkillRanks;coreRanks?:Partial<Record<SwordCoreId,number>>};
export function newSwordTree():SwordTree { return {school:"phutthaisawan",learned:[],cooldowns:{},training:{strikes:0,blocks:0,finishes:0},loadouts:emptySwordLoadouts()}; }
export function swordPoints(level:number):number { return 1 + Math.floor((Math.min(level,100)-1)/2); }
export function validateSwordTree(value:unknown, level:number):SwordTree {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("invalid_sword_tree");
  const tree=value as Record<string,unknown>;
  if (Object.keys(tree).some(key=>!["cooldowns","learned","school","training","loadouts","ranks","coreRanks"].includes(key)) ||
      typeof tree.school !== "string" || !Object.hasOwn(SWORD_SCHOOLS,tree.school) ||
      !Array.isArray(tree.learned) || !tree.cooldowns || typeof tree.cooldowns !== "object" || Array.isArray(tree.cooldowns)) throw Error("invalid_sword_tree");
  if (SWORD_SCHOOLS[tree.school as SwordSchool].level>level) throw Error("invalid_sword_tree");
  const learned=tree.learned as unknown[];
  if (learned.length > swordPoints(level) || new Set(learned).size !== learned.length ||
      learned.some(id=>typeof id !== "string" || !Object.hasOwn(SWORD_NODES,id))) throw Error("invalid_sword_tree");
  for (const id of learned as string[]) {
    const node=SWORD_NODES[id];
    if (node.level>level || node.requires.some(required=>!learned.includes(required))) throw Error("invalid_sword_tree");
  }
  const cooldowns=tree.cooldowns as Record<string,unknown>;
  if (Object.keys(cooldowns).some(id=>(!Object.hasOwn(SWORD_NODES,id) && !Object.hasOwn(SWORD_CORE,id)) || typeof cooldowns[id]!=="number" ||
      !Number.isSafeInteger(cooldowns[id]) || (cooldowns[id] as number)<0)) throw Error("invalid_sword_tree");
  const training=tree.training === undefined ? {strikes:0,blocks:0,finishes:0} : tree.training;
  if (!training || typeof training!=="object" || Array.isArray(training) || Object.keys(training).sort().join(",")!=="blocks,finishes,strikes") throw Error("invalid_sword_tree");
  const counts=training as Record<string,unknown>;
  if (Object.values(counts).some(n=>typeof n!=="number" || !Number.isSafeInteger(n) || n<0 || n>1_000_000)) throw Error("invalid_sword_tree");
  const loadouts=tree.loadouts === undefined ? emptySwordLoadouts() : tree.loadouts;
  if (!loadouts || typeof loadouts!=="object" || Array.isArray(loadouts) || Object.keys(loadouts).sort().join(",")!==Object.keys(SWORD_SCHOOLS).sort().join(",")) throw Error("invalid_sword_tree");
  const checked=emptySwordLoadouts(), entries=loadouts as Record<string,unknown>;
  for (const school of Object.keys(SWORD_SCHOOLS) as SwordSchool[]) {
    const slots=entries[school];
    if (!Array.isArray(slots) || slots.length!==3) throw Error("invalid_sword_tree");
    const occupied=slots.filter(value=>value!==null);
    if (new Set(occupied).size!==occupied.length || occupied.some(id=>typeof id!=="string" || !learned.includes(id) || !Object.hasOwn(SWORD_NODES,id) || SWORD_NODES[id].effect==="passive" || (SWORD_NODES[id].school!=="common" && SWORD_NODES[id].school!==school))) throw Error("invalid_sword_tree");
    checked[school]=[...slots] as Array<string|null>;
  }
  let ranks:SkillRanks;
  try{ranks=validateSkillRanks(tree.ranks,learned as string[],level,swordPoints(level),SWORD_RANKABLE_SKILLS);}catch{throw Error("invalid_sword_tree");}
  const coreRanks=tree.coreRanks ?? {};
  if(!coreRanks || typeof coreRanks!=="object" || Array.isArray(coreRanks))throw Error("invalid_sword_tree");
  for(const [id,rank] of Object.entries(coreRanks)) {
    if(!Object.hasOwn(SWORD_CORE,id) || typeof rank!=="number" || !Number.isInteger(rank) || rank<1 || rank>MUAY_CORE_LEVELS.length || level<MUAY_CORE_LEVELS[rank-1])throw Error("invalid_sword_tree");
  }
  if(Object.values(coreRanks).reduce<number>((sum,n)=>sum+(n as number),0)>muayCorePoints(level))throw Error("invalid_sword_tree");
  return {school:tree.school as SwordSchool, learned:[...learned] as string[], cooldowns:{...cooldowns} as Record<string,number>,training:{...counts} as SwordTraining,loadouts:checked,...(skillRankCost(ranks)?{ranks}:{}),...(Object.keys(coreRanks).length?{coreRanks:coreRanks as Partial<Record<SwordCoreId,number>>}:{})};
}
