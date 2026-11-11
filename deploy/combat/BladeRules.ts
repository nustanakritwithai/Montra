/** Provisional server-owned rules for the arcane blade class. */
import { MUAY_CORE_LEVELS, muayCorePoints } from "./MuayRules.js";
export const BLADE_CORE={
  blade_vanish:{name:"ล่องหน",description:"หายตัวทันที จนโจมตี ถูกโจมตี หรือหมดเวลา",stamina:20,cooldownMs:24000},
  blade_heavy:{name:"คมสังหาร",description:"โจมตีเป้าหมายเดี่ยวอย่างหนัก",stamina:25,cooldownMs:10000},
  blade_withdraw:{name:"ฟันถอนเงา",description:"ฟันเป้าหมายแล้วพุ่งถอยออกจากเป้าหมาย",stamina:22,cooldownMs:12000},
  blade_fury:{name:"ปลุกจิตสังหาร",description:"เพิ่มพลังโจมตีของตนชั่วคราว",stamina:25,cooldownMs:30000},
} as const;
export type BladeCoreId=keyof typeof BLADE_CORE;
export function bladeCoreProgress(rank:number){return {
  blade_vanish:{durationMs:5000+rank*500},
  blade_heavy:{range:3,power:1.9+rank*.1,pvpPower:1.9+rank*.025},
  blade_withdraw:{range:3,power:1+rank*.05,pvpPower:1+rank*.0125,distance:2.5+rank*.125},
  blade_fury:{bonus:.2+rank*.02,durationMs:8000+rank*250},
};}
export type BladePractice = "ambush" | "mark" | "evade" | "combo";
export type BladeEffect = "cloak" | "passive" | "approach" | "guard" | "strike" | "consume" | "windup" | "evade" | "counter" | "retreat" | "focus";
export type BladeLesson = Readonly<{
  name:string; description:string; branch:"veil"|"edge"|"tempo";
  level:number; requires:readonly string[]; practice:Readonly<Partial<Record<BladePractice,number>>>;
  effect:BladeEffect; stamina:number; cooldownMs:number; range:number; power:number;
}>;

export const BLADE_PRACTICE_LABELS:Readonly<Record<BladePractice,string>> = {
  ambush:"เปิดฉากจากการพราง",mark:"ใช้รอยอาคม",evade:"หลบการโจมตี",combo:"โจมตีต่อเนื่อง",
};
export const BLADE_LESSONS = {
  cloak:{name:"ม่านพรางกาย",description:"พรางตัวชั่วคราว การโจมตีหรือรับความเสียหายจะเปิดเผยตัว",branch:"veil",level:1,requires:[],practice:{},effect:"cloak",stamina:18,cooldownMs:24000,range:0,power:0},
  quiet_step:{name:"ย่างไร้รอย",description:"เคลื่อนที่คล่องขึ้นและลดระยะตรวจจับของมอนสเตอร์ทั่วไปขณะพราง",branch:"veil",level:5,requires:["cloak"],practice:{ambush:3},effect:"passive",stamina:0,cooldownMs:0,range:0,power:0.1},
  shadow_step:{name:"ก้าวเงาประชิด",description:"ก้าวเข้าหาเป้าหมายขณะพรางโดยตรวจสิ่งกีดขวาง",branch:"veil",level:9,requires:["cloak"],practice:{ambush:5},effect:"approach",stamina:16,cooldownMs:9000,range:6,power:0},
  veil_guard:{name:"ม่านลวง",description:"ลดความเสียหายชั่วครู่เมื่อการพรางสิ้นสุด",branch:"veil",level:15,requires:["quiet_step","shadow_step"],practice:{ambush:12,evade:3},effect:"passive",stamina:0,cooldownMs:0,range:0,power:0.15},
  hidden_edge:{name:"คมซ่อนมนต์",description:"โจมตีเปิดฉากจากการพรางและทิ้งรอยอาคม",branch:"edge",level:3,requires:["cloak"],practice:{ambush:2},effect:"strike",stamina:16,cooldownMs:7000,range:3,power:1.4},
  marked_cut:{name:"ฟันรอยอาคม",description:"โจมตีและใช้รอยอาคมของตน",branch:"edge",level:7,requires:["hidden_edge"],practice:{ambush:4,mark:2},effect:"consume",stamina:20,cooldownMs:8000,range:3,power:1.6},
  piercing_edge:{name:"คมอาคมทะลวง",description:"ตั้งท่าก่อนโจมตีเป้าหมายเดี่ยวอย่างหนัก",branch:"edge",level:11,requires:["marked_cut"],practice:{mark:5},effect:"windup",stamina:26,cooldownMs:12000,range:3,power:1.9},
  sever_mark:{name:"สะบั้นรอยแผล",description:"ใช้รอยอาคมของตนเพื่อปิดจังหวะอย่างรุนแรง",branch:"edge",level:17,requires:["piercing_edge"],practice:{mark:10,combo:5},effect:"consume",stamina:32,cooldownMs:18000,range:3,power:2.2},
  evade:{name:"ก้าวหลบคม",description:"หลบระยะสั้นและลดความเสียหายในจังหวะหลบ",branch:"tempo",level:3,requires:["cloak"],practice:{},effect:"evade",stamina:16,cooldownMs:9000,range:0,power:0.25},
  counter:{name:"ฟันชิงจังหวะ",description:"สวนหลังหลบการโจมตีสำเร็จ",branch:"tempo",level:7,requires:["evade"],practice:{evade:3},effect:"counter",stamina:18,cooldownMs:8000,range:3,power:1.4},
  retreat:{name:"ถอนกาย",description:"ถอยออกจากเป้าหมายเพื่อจัดตำแหน่งใหม่",branch:"tempo",level:10,requires:["evade"],practice:{evade:5},effect:"retreat",stamina:18,cooldownMs:10000,range:0,power:0},
  killer_focus:{name:"จิตสังหาร",description:"เพิ่มพลังช่วงสั้นหลังเปิดฉากจากการพราง",branch:"tempo",level:15,requires:["counter","hidden_edge"],practice:{ambush:8,combo:4},effect:"focus",stamina:24,cooldownMs:25000,range:0,power:0.15},
  shadow_cut:{name:"คมเงาสะท้อน",description:"ฟันเป้าหมายเดี่ยวเพื่อรักษาจังหวะระหว่างรอพราง",branch:"edge",level:35,requires:["hidden_edge"],practice:{ambush:15,mark:4},effect:"strike",stamina:22,cooldownMs:11000,range:3,power:1.65},
  rune_break:{name:"ผ่ารอยผนึก",description:"ใช้รอยอาคมบนเป้าหมายเพื่อโจมตี",branch:"edge",level:55,requires:["marked_cut","shadow_cut"],practice:{mark:18,combo:8},effect:"consume",stamina:26,cooldownMs:12000,range:3,power:1.9},
  shadow_counter:{name:"เงาสวนคม",description:"สวนเป้าหมายหลังหลบการโจมตีสำเร็จ",branch:"tempo",level:75,requires:["counter","rune_break"],practice:{evade:15,combo:10},effect:"counter",stamina:24,cooldownMs:12000,range:3,power:1.8},
  sealed_finale:{name:"สะบั้นผนึกเงา",description:"ใช้รอยอาคมของตนปิดจังหวะโจมตี",branch:"edge",level:95,requires:["sever_mark","shadow_counter"],practice:{mark:40,combo:20},effect:"consume",stamina:34,cooldownMs:22000,range:3,power:2.35},
} as const satisfies Record<string,BladeLesson>;
export type BladeSkillId = keyof typeof BLADE_LESSONS;
import { skillRankCost, validateSkillRanks, type SkillRanks } from "./Progression.js";
export const BLADE_RANKABLE_SKILLS = ["hidden_edge","marked_cut","piercing_edge","sever_mark","shadow_cut","rune_break","shadow_counter","sealed_finale"] as const;
export type BladeBook = {
  learned:BladeSkillId[]; slots:Array<BladeSkillId|null>;
  practice:Record<BladePractice,number>; cooldowns:Partial<Record<BladeSkillId|BladeCoreId,number>>;
  ranks?:SkillRanks; coreRanks?:Partial<Record<BladeCoreId,number>>;
};
export function bladePoints(level:number):number { return 1+Math.floor((Math.min(level,100)-1)/2); }
export function newBladeBook():BladeBook {
  return {learned:[],slots:[null,null,null,null],practice:{ambush:0,mark:0,evade:0,combo:0},cooldowns:{}};
}
function record(value:unknown):value is Record<string,unknown> { return value!==null && typeof value==="object" && !Array.isArray(value); }
function count(value:unknown):value is number { return typeof value==="number" && Number.isSafeInteger(value) && value>=0 && value<=1_000_000; }
export function validateBladeBook(value:unknown,level:number):BladeBook {
  if(!record(value) || Object.keys(value).some(key=>!["cooldowns","learned","practice","slots","ranks","coreRanks"].includes(key)) ||
      !Array.isArray(value.learned) || !Array.isArray(value.slots) || !record(value.practice) || !record(value.cooldowns)) throw Error("invalid_blade_book");
  const learned=value.learned,slots=value.slots;
  if(learned.length>bladePoints(level) || new Set(learned).size!==learned.length ||
      learned.some(id=>typeof id!=="string" || !Object.hasOwn(BLADE_LESSONS,id))) throw Error("invalid_blade_book");
  for(const id of learned as BladeSkillId[]) {
    const lesson:BladeLesson=BLADE_LESSONS[id];
    if(lesson.level>level || lesson.requires.some(req=>!learned.includes(req))) throw Error("invalid_blade_book");
  }
  if(slots.length!==4 || new Set(slots.filter(id=>id!==null)).size!==slots.filter(id=>id!==null).length ||
      slots.some(id=>id!==null && (typeof id!=="string" || !learned.includes(id) || BLADE_LESSONS[id as BladeSkillId].effect==="passive"))) throw Error("invalid_blade_book");
  if(Object.keys(value.practice).sort().join(",")!=="ambush,combo,evade,mark" || Object.values(value.practice).some(n=>!count(n))) throw Error("invalid_blade_book");
  for(const [id,ready] of Object.entries(value.cooldowns))
    if((!Object.hasOwn(BLADE_LESSONS,id) && !Object.hasOwn(BLADE_CORE,id)) || typeof ready!=="number" || !Number.isSafeInteger(ready) || ready<0) throw Error("invalid_blade_book");
  let ranks:SkillRanks;
  try {ranks=validateSkillRanks(value.ranks,learned as string[],level,bladePoints(level),BLADE_RANKABLE_SKILLS);}catch {throw Error("invalid_blade_book");}
  const coreRanks:Partial<Record<BladeCoreId,number>>={};
  if(value.coreRanks!==undefined){
    if(!record(value.coreRanks))throw Error("invalid_blade_book");
    for(const [id,rank] of Object.entries(value.coreRanks)){
      if(!Object.hasOwn(BLADE_CORE,id) || typeof rank!=="number" || !Number.isSafeInteger(rank) || rank<1 || rank>MUAY_CORE_LEVELS.length || level<MUAY_CORE_LEVELS[rank-1])throw Error("invalid_blade_book");
      coreRanks[id as BladeCoreId]=rank;
    }
    if(Object.values(coreRanks).reduce((sum,n)=>sum+n,0)>muayCorePoints(level))throw Error("invalid_blade_book");
  }
  return {learned:[...learned] as BladeSkillId[],slots:[...slots] as Array<BladeSkillId|null>,practice:{...value.practice} as BladeBook["practice"],cooldowns:{...value.cooldowns} as BladeBook["cooldowns"],...(skillRankCost(ranks)?{ranks}:{}),...(Object.keys(coreRanks).length?{coreRanks}:{})};
}
