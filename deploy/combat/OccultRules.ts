/** Game-design values are provisional and all combat decisions remain server-owned. */
import {skillRankCost,validateSkillRanks,type SkillRanks} from "./Progression.js";
import {MUAY_CORE_LEVELS,muayCorePoints} from "./MuayRules.js";
export const SEER_CORE={
  seer_pot:{name:"ผีจากหม้อ",description:"เรียกผีช่วยติดตามและต่อสู้",effect:"spirit",stamina:15,cooldownMs:12000},
  seer_binding:{name:"ยันต์สะกด",description:"สะกดมอนทั่วไปหนึ่งตัวไว้จนกว่าจะคลายหรือออกจากพื้นที่",effect:"interrupt",stamina:22,cooldownMs:12000},
  seer_poison:{name:"ข้าวสารพิษ",description:"พิษค่อย ๆ ลดเลือดเป้าหมายจนเหลือ 1 แต่ไม่สังหาร",effect:"curse",stamina:20,cooldownMs:8000},
  seer_buffalo:{name:"ควายธนู",description:"ร่ายเสกควายธนูโจมตีเป้าหมายระยะไกล",effect:"rice",stamina:30,cooldownMs:14000},
} as const;
export type SeerCoreId=keyof typeof SEER_CORE;
export function seerCoreProgress(rank:number){return {
  seer_pot:{pvePower:1+rank*.08},
  seer_binding:{range:10+rank*.25,poisonBonus:rank*.0005,pvpDurationMs:25000,pvpImmunityMs:40000},
  seer_poison:{range:12+rank*.25,pveFraction:.02+rank*.00125,pvpFraction:.04,intervalMs:2500},
  seer_buffalo:{range:15+rank*.25,power:2+rank*.12,castMs:900},
};}
export const MENDER_CORE={
  mender_core_heal:{name:"พรฟื้นกาย",description:"เพิ่มฟื้นฟูต่อเนื่องและล้างสถานะให้ตนหรือเพื่อนหนึ่งคน",effect:"heal",stamina:16,cooldownMs:12000},
  mender_core_circle:{name:"มหายันต์ฟื้นชีพ",description:"ฟื้น HP ปาร์ตี้ในวงอย่างแรงทันทีครั้งเดียว",effect:"heal_area",stamina:32,cooldownMs:24000},
  mender_core_ward:{name:"อาณาเขตคุ้มภัย",description:"กางเขตป้องกันให้ตนและปาร์ตี้ไม่รับความเสียหาย",effect:"ward_area",stamina:40,cooldownMs:45000},
  mender_core_cleanse:{name:"พรอำนวยหมู่",description:"เพิ่มค่าสถานะทั้งหมดให้ตนและปาร์ตี้ชั่วคราว",effect:"ward_area",stamina:30,cooldownMs:30000},
} as const;
export type MenderCoreId=keyof typeof MENDER_CORE;
export function menderCoreProgress(rank:number){return {
  mender_core_heal:{range:12+rank*.25,tickFraction:.02+rank*.003,durationMs:10000,intervalMs:2000},
  mender_core_circle:{range:8+rank*.125,fraction:.30+rank*.02},
  mender_core_ward:{range:7+rank*.125,durationMs:4000+rank*250},
  mender_core_cleanse:{range:8+rank*.125,bonus:.10+rank*.01,durationMs:10000+rank*500},
};}
export const OCCULT_PATHS = ["seer", "mender"] as const;
export type OccultPath = typeof OCCULT_PATHS[number];
export type OccultEffect = "mark" | "rice" | "rice_area" | "detonate" | "interrupt" | "curse" | "curse_burst" |
  "spirit" | "spirit_bind" | "trance" | "heal" | "heal_area" | "spirit_heal" | "ward" | "ward_area" |
  "cleanse" | "cleanse_area" | "spirit_ward" | "pve_rice";
export type OccultLesson = Readonly<{
  name:string; description:string; path:OccultPath; level:number; requires:readonly string[];
  training:number; effect:OccultEffect; stamina:number; cooldownMs:number; range:number; power:number;
}>;
export const OCCULT_LESSONS = {
  seer_mark: {name:"ยันต์ตีตรา",description:"โจมตีและติดตราให้วิชาข้าวสารหรือระเบิดยันต์",path:"seer",level:1,requires:[],training:0,effect:"mark",stamina:9,cooldownMs:4000,range:8,power:0.9},
  seer_rice: {name:"ข้าวสารฝังอาคม",description:"โจมตีเป้าเดียว แรงขึ้นเมื่อเป้าติดตราของตน",path:"seer",level:3,requires:["seer_mark"],training:3,effect:"rice",stamina:12,cooldownMs:5000,range:15,power:1.4},
  seer_scatter: {name:"ข้าวสารแตกกระจาย",description:"ซัดข้าวสารใส่มอนสเตอร์ใกล้เป้าหมายสูงสุด 3 ตัว",path:"seer",level:5,requires:["seer_rice"],training:6,effect:"rice_area",stamina:24,cooldownMs:10000,range:12,power:0.75},
  seer_burst: {name:"ระเบิดยันต์",description:"ใช้ตราของตนเพื่อโจมตีเป้าหมายอย่างรุนแรง",path:"seer",level:5,requires:["seer_rice"],training:6,effect:"detonate",stamina:22,cooldownMs:10000,range:12,power:2.15},
  seer_seal: {name:"ยันต์สะกด",description:"โจมตีและหยุดจังหวะมอนสเตอร์ทั่วไปชั่วคราว Elite และบอสไม่ถูกหยุด",path:"seer",level:8,requires:["seer_mark"],training:10,effect:"interrupt",stamina:20,cooldownMs:12000,range:8,power:0.9},
  seer_curse: {name:"คำสาปกัดกิน",description:"โจมตีและสาปเป้าหมายเป็นช่วงสั้น ๆ ใน PvP พลังลดลง",path:"seer",level:8,requires:["seer_mark"],training:10,effect:"curse",stamina:22,cooldownMs:12000,range:12,power:0.7},
  seer_spirit: {name:"สั่งผีจู่โจม",description:"สั่งผีจากหม้อโจมตีมอนสเตอร์ที่เลือก",path:"seer",level:10,requires:["seer_rice"],training:15,effect:"spirit",stamina:18,cooldownMs:9000,range:8,power:1.4},
  seer_hexburst: {name:"ถอนเคราะห์กลับ",description:"ใช้คำสาปของตนที่อยู่บนเป้าหมายระเบิดเป็นดาเมจ",path:"seer",level:12,requires:["seer_curse","seer_burst"],training:20,effect:"curse_burst",stamina:25,cooldownMs:14000,range:12,power:1.8},
  seer_spirit_bind: {name:"ผีรังควาน",description:"สั่งผีโจมตีและหยุดจังหวะมอนสเตอร์ทั่วไปชั่วคราว",path:"seer",level:15,requires:["seer_spirit","seer_seal"],training:25,effect:"spirit_bind",stamina:24,cooldownMs:14000,range:8,power:1.1},
  seer_trance: {name:"อาคมยืมฤทธิ์",description:"ขณะเข้าทรงเพิ่มพลังเวทชั่วคราว",path:"seer",level:15,requires:["seer_burst","seer_spirit"],training:25,effect:"trance",stamina:25,cooldownMs:25000,range:0,power:0.2},
  mender_heal: {name:"ยันต์ฟื้นกาย",description:"รักษาตนเองหรือสมาชิกปาร์ตี้ที่เลือก",path:"mender",level:1,requires:[],training:0,effect:"heal",stamina:12,cooldownMs:6000,range:12,power:0.14},
  mender_area: {name:"วงยันต์ฟื้นฟู",description:"ฟื้น HP ทันทีและอีก 3 ครั้งในวงอาคมนาน 6 วินาที",path:"mender",level:3,requires:["mender_heal"],training:3,effect:"heal_area",stamina:20,cooldownMs:12000,range:8,power:0.09},
  mender_ward: {name:"ยันต์คุ้มชีพ",description:"เพิ่มป้องกันให้ตนเองหรือสมาชิกปาร์ตี้ชั่วคราว",path:"mender",level:5,requires:["mender_heal"],training:6,effect:"ward",stamina:20,cooldownMs:15000,range:12,power:0.15},
  mender_cleanse: {name:"ถอนคุณไสย",description:"ถอนคำสาปอาคมที่วิชานี้รองรับจากตนเองหรือปาร์ตี้",path:"mender",level:8,requires:["mender_ward"],training:10,effect:"cleanse",stamina:18,cooldownMs:12000,range:12,power:0},
  mender_spirit: {name:"ผีคุ้มครอง",description:"ให้ผีที่เรียกมาช่วยคุ้มครองสมาชิกปาร์ตี้",path:"mender",level:10,requires:["mender_ward"],training:15,effect:"spirit_ward",stamina:22,cooldownMs:18000,range:12,power:0.2},
  mender_ward_area: {name:"เขตอาคมคุ้มภัย",description:"เพิ่มป้องกันกายและเวทให้ปาร์ตี้ใกล้เคียง",path:"mender",level:10,requires:["mender_ward","mender_area"],training:15,effect:"ward_area",stamina:30,cooldownMs:22000,range:8,power:0.1},
  mender_cleanse_area: {name:"ข้าวสารปัดเคราะห์",description:"ถอนคำสาปอาคมจากตนและสมาชิกปาร์ตี้ใกล้เคียง",path:"mender",level:12,requires:["mender_cleanse","mender_area"],training:20,effect:"cleanse_area",stamina:28,cooldownMs:20000,range:8,power:0},
  mender_spirit_heal: {name:"ผีประคอง",description:"ให้ผีจากหม้อช่วยฟื้น HP ตนเองหรือสมาชิกปาร์ตี้",path:"mender",level:12,requires:["mender_spirit","mender_heal"],training:20,effect:"spirit_heal",stamina:25,cooldownMs:16000,range:12,power:0.2},
  mender_trance: {name:"ทรงผีฟื้นมานา",description:"ขณะเข้าทรงเพิ่มการป้องกันและฟื้นมานา 15 ให้ปาร์ตี้ใกล้เคียง",path:"mender",level:15,requires:["mender_area","mender_spirit"],training:25,effect:"trance",stamina:28,cooldownMs:25000,range:8,power:0.12},
  mender_pve_rice: {name:"ข้าวสารคุ้มชีพ",description:"ซัดข้าวสารอาคมใส่มอนสเตอร์ ช่วยพระเก็บเลเวลด้วยตนเอง",path:"mender",level:25,requires:["mender_heal"],training:8,effect:"pve_rice",stamina:16,cooldownMs:6000,range:12,power:1.3},
  seer_ash_rice: {name:"ข้าวสารเพลิงอาคม",description:"ซัดข้าวสารใส่มอนสเตอร์ และแรงขึ้นเมื่อเป้าหมายมีตราของตน",path:"seer",level:35,requires:["seer_rice"],training:35,effect:"rice",stamina:18,cooldownMs:9000,range:15,power:1.55},
  seer_deep_curse: {name:"คุณไสยกัดวิญญาณ",description:"สาปเป้าหมายให้ได้รับดาเมจต่อเนื่องในช่วงสั้น",path:"seer",level:55,requires:["seer_curse","seer_ash_rice"],training:60,effect:"curse",stamina:26,cooldownMs:16000,range:12,power:0.95},
  seer_ward_break: {name:"ระเบิดตราผนึก",description:"ใช้ตรายันต์ของตนเพื่อโจมตีเป้าหมายหนัก",path:"seer",level:75,requires:["seer_burst","seer_deep_curse"],training:90,effect:"detonate",stamina:30,cooldownMs:16000,range:12,power:2.3},
  seer_spirit_rain: {name:"สายฝนข้าวสารอาคม",description:"ซัดข้าวสารใส่มอนสเตอร์ใกล้เป้าหมายสูงสุดสามตัว",path:"seer",level:95,requires:["seer_scatter","seer_ward_break"],training:130,effect:"rice_area",stamina:34,cooldownMs:17000,range:12,power:1.0},
  mender_deep_heal: {name:"ยันต์ประคองชีพ",description:"ฟื้น HP ตนเองหรือสมาชิกปาร์ตี้หนึ่งคน",path:"mender",level:35,requires:["mender_heal"],training:35,effect:"heal",stamina:18,cooldownMs:10000,range:12,power:0.17},
  mender_shelter: {name:"เขตยันต์คุ้มชีพ",description:"เพิ่มป้องกันกายและเวทให้ปาร์ตี้ใกล้เคียงชั่วคราว",path:"mender",level:55,requires:["mender_ward","mender_area"],training:60,effect:"ward_area",stamina:32,cooldownMs:26000,range:8,power:0.12},
  mender_deep_circle: {name:"วงยันต์ต่อชีพ",description:"ฟื้น HP ทันทีและฟื้นอีกสามจังหวะในวงอาคม",path:"mender",level:75,requires:["mender_area","mender_shelter"],training:90,effect:"heal_area",stamina:30,cooldownMs:18000,range:8,power:0.1},
  mender_spirit_rice: {name:"ข้าวสารประคองวิญญาณ",description:"ซัดข้าวสารอาคมใส่มอนสเตอร์เป้าหมายเดียว",path:"mender",level:95,requires:["mender_pve_rice","mender_deep_heal"],training:130,effect:"pve_rice",stamina:26,cooldownMs:11000,range:12,power:1.75},
} as const satisfies Record<string, OccultLesson>;
export type OccultSkillId = keyof typeof OCCULT_LESSONS;
export const OCCULT_RANKABLE_SKILLS:readonly OccultSkillId[]=["seer_mark","seer_rice","seer_scatter","seer_burst","seer_seal","seer_curse","seer_hexburst","mender_pve_rice","seer_ash_rice","seer_deep_curse","seer_ward_break","seer_spirit_rain","mender_spirit_rice",
  "mender_heal","mender_area","mender_ward","mender_spirit","mender_ward_area","mender_spirit_heal","mender_trance","mender_deep_heal","mender_shelter","mender_deep_circle"];
export const OCCULT_MASTERY_LABELS = {
  seer:{rice:"ข้าวสารใส่มอนสเตอร์",talisman:"ยันต์ใส่มอนสเตอร์",spirit:"ผีช่วยโจมตี",curse:"คำสาปมอนสเตอร์"},
  mender:{healing:"รักษาที่เกิดผล",protection:"คุ้มครองขณะต่อสู้",cleanse:"ถอนคำสาป",spirit:"ผีช่วยเหลือ"},
} as const;
export type OccultMastery = {
  seer:Record<keyof typeof OCCULT_MASTERY_LABELS.seer,number>;
  mender:Record<keyof typeof OCCULT_MASTERY_LABELS.mender,number>;
};
export type OccultMasteryCategory = keyof OccultMastery["seer"] | keyof OccultMastery["mender"];
/** Checked on learning only: characters retain already learned legacy lessons. */
export const OCCULT_MASTERY_REQUIREMENTS:Readonly<Partial<Record<OccultSkillId,Readonly<Record<string,number>>>>> = {
  seer_rice:{talisman:2},seer_scatter:{rice:3},seer_burst:{talisman:3},
  seer_seal:{talisman:4},seer_curse:{talisman:3},seer_spirit:{spirit:3},
  seer_hexburst:{curse:2},seer_spirit_bind:{spirit:5,talisman:3},seer_trance:{spirit:5,talisman:3},
  mender_area:{healing:3},mender_ward:{healing:3},mender_cleanse:{protection:3},
  mender_spirit:{protection:3},mender_ward_area:{healing:5,protection:3},
  mender_cleanse_area:{healing:5,protection:3},mender_spirit_heal:{healing:5,spirit:3},
  mender_trance:{healing:5,spirit:5},
  seer_ash_rice:{rice:8},seer_deep_curse:{curse:8},seer_ward_break:{talisman:15},seer_spirit_rain:{rice:20},
  mender_deep_heal:{healing:8},mender_shelter:{healing:10,protection:8},mender_deep_circle:{healing:20},mender_spirit_rice:{healing:30},
};
export type OccultBook = {
  learned:Record<OccultPath,OccultSkillId[]>;
  loadouts:Record<OccultPath,Array<OccultSkillId|null>>;
  training:Record<OccultPath,number>;
  cooldowns:Partial<Record<OccultSkillId|SeerCoreId|MenderCoreId,number>>;
  mastery:OccultMastery;
  ranks?:SkillRanks;
  coreRanks?:Partial<Record<SeerCoreId,number>>;
  menderCoreRanks?:Partial<Record<MenderCoreId,number>>;
};
export const occultPoints = (level:number):number => 1 + Math.floor((Math.min(level,100)-1)/2);
export function occultRankCost(ranks:SkillRanks | undefined,path:OccultPath):number {
  return Object.entries(ranks ?? {}).reduce((sum,[id,rank])=>sum+(Object.hasOwn(OCCULT_LESSONS,id) && OCCULT_LESSONS[id as OccultSkillId].path===path?rank:0),0);
}
export function newOccultBook():OccultBook {
  return {learned:{seer:[],mender:[]},loadouts:{seer:[null,null,null,null],mender:[null,null,null,null]},training:{seer:0,mender:0},cooldowns:{},
    mastery:{seer:{rice:0,talisman:0,spirit:0,curse:0},mender:{healing:0,protection:0,cleanse:0,spirit:0}}};
}
function record(value:unknown):value is Record<string,unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function validateOccultBook(value:unknown,level:number):OccultBook {
  if (!record(value) || Object.keys(value).some(key=>!["cooldowns","learned","loadouts","training","mastery","ranks","coreRanks","menderCoreRanks"].includes(key)) ||
      !record(value.learned) || !record(value.loadouts) || !record(value.training) || !record(value.cooldowns))
    throw Error("invalid_occult_book");
  for (const group of [value.learned,value.loadouts,value.training])
    if (Object.keys(group).sort().join(",")!=="mender,seer") throw Error("invalid_occult_book");
  const result=newOccultBook();
  if (value.mastery!==undefined) {
    if (!record(value.mastery) || Object.keys(value.mastery).sort().join(",")!=="mender,seer") throw Error("invalid_occult_book");
    for (const path of OCCULT_PATHS) {
      const raw=value.mastery[path], labels=OCCULT_MASTERY_LABELS[path];
      if (!record(raw) || Object.keys(raw).sort().join(",")!==Object.keys(labels).sort().join(",")) throw Error("invalid_occult_book");
      for (const [key,count] of Object.entries(raw)) {
        if (typeof count!=="number" || !Number.isSafeInteger(count) || count<0 || count>1_000_000) throw Error("invalid_occult_book");
        (result.mastery[path] as Record<string,number>)[key]=count;
      }
    }
  }
  for (const path of OCCULT_PATHS) {
    const learned=value.learned[path], slots=value.loadouts[path], training=value.training[path];
    if (!Array.isArray(learned) || learned.length>occultPoints(level) || new Set(learned).size!==learned.length ||
        learned.some(id=>typeof id!=="string" || !Object.hasOwn(OCCULT_LESSONS,id))) throw Error("invalid_occult_book");
    for (const id of learned as OccultSkillId[]) {
      const lesson:OccultLesson=OCCULT_LESSONS[id];
      if (lesson.path!==path || lesson.level>level || lesson.requires.some(req=>!learned.includes(req))) throw Error("invalid_occult_book");
    }
    if (!Array.isArray(slots) || slots.length!==4 || new Set(slots.filter(x=>x!==null)).size!==slots.filter(x=>x!==null).length ||
        slots.some(id=>id!==null && (typeof id!=="string" || !learned.includes(id)))) throw Error("invalid_occult_book");
    if (typeof training!=="number" || !Number.isSafeInteger(training) || training<0 || training>1_000_000) throw Error("invalid_occult_book");
    result.learned[path]=[...learned] as OccultSkillId[];
    result.loadouts[path]=[...slots] as Array<OccultSkillId|null>;
    result.training[path]=training;
  }
  for (const [id,ready] of Object.entries(value.cooldowns)) {
    if ((!Object.hasOwn(OCCULT_LESSONS,id) && !Object.hasOwn(SEER_CORE,id) && !Object.hasOwn(MENDER_CORE,id)) || typeof ready!=="number" || !Number.isSafeInteger(ready) || ready<0) throw Error("invalid_occult_book");
    result.cooldowns[id as OccultSkillId|SeerCoreId|MenderCoreId]=ready;
  }
  if(value.coreRanks!==undefined){
    if(!record(value.coreRanks))throw Error("invalid_occult_book");
    for(const [id,rank] of Object.entries(value.coreRanks))if(!Object.hasOwn(SEER_CORE,id) || typeof rank!=="number" || !Number.isInteger(rank) || rank<1 || rank>MUAY_CORE_LEVELS.length || level<MUAY_CORE_LEVELS[rank-1])throw Error("invalid_occult_book");
    if(Object.values(value.coreRanks).reduce<number>((sum,n)=>sum+(n as number),0)>muayCorePoints(level))throw Error("invalid_occult_book");
    if(Object.keys(value.coreRanks).length)result.coreRanks={...value.coreRanks} as OccultBook["coreRanks"];
  }
  if(value.menderCoreRanks!==undefined){
    if(!record(value.menderCoreRanks))throw Error("invalid_occult_book");
    for(const [id,rank] of Object.entries(value.menderCoreRanks))if(!Object.hasOwn(MENDER_CORE,id) || typeof rank!=="number" || !Number.isInteger(rank) || rank<1 || rank>MUAY_CORE_LEVELS.length || level<MUAY_CORE_LEVELS[rank-1])throw Error("invalid_occult_book");
    if(Object.values(value.menderCoreRanks).reduce<number>((sum,n)=>sum+(n as number),0)>muayCorePoints(level))throw Error("invalid_occult_book");
    if(Object.keys(value.menderCoreRanks).length)result.menderCoreRanks={...value.menderCoreRanks} as OccultBook["menderCoreRanks"];
  }
  if(value.ranks!==undefined){
    if(!record(value.ranks))throw Error("invalid_occult_book");
    const ranks:SkillRanks={};
    for(const path of OCCULT_PATHS){
      const allowed=OCCULT_RANKABLE_SKILLS.filter(id=>OCCULT_LESSONS[id].path===path);
      const raw=Object.fromEntries(Object.entries(value.ranks).filter(([id])=>allowed.includes(id as OccultSkillId)));
      try{Object.assign(ranks,validateSkillRanks(raw,result.learned[path],level,occultPoints(level),allowed));}catch{throw Error("invalid_occult_book");}
    }
    if(Object.keys(ranks).length!==Object.keys(value.ranks).length)throw Error("invalid_occult_book");
    if(skillRankCost(ranks))result.ranks=ranks;
  }
  return result;
}
