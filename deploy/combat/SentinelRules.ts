/** Provisional, server-owned guardian lessons and control rules. */
export type SentinelPractice = "guard"|"stun"|"assist";
export type SentinelEffect = "guard"|"step"|"passive"|"anchor"|"stun"|"sweep"|"slam"|"counter"|"taunt"|"ward"|"intercept"|"party_ward";
export type SentinelLesson = Readonly<{
  name:string;description:string;branch:"defense"|"control"|"support";level:number;
  requires:readonly string[];practice:Readonly<Partial<Record<SentinelPractice,number>>>;
  effect:SentinelEffect;stamina:number;cooldownMs:number;range:number;power:number;
}>;
export const SENTINEL_PRACTICE_LABELS:Readonly<Record<SentinelPractice,string>>={guard:"รับการโจมตี",stun:"สกัดมอนสเตอร์",assist:"คุ้มกันขณะต่อสู้"};
export const SENTINEL_LESSONS={
  guard:{name:"ตั้งง้าวรับศึก",description:"ตั้งรับด้านหน้าชั่วครู่เพื่อลดความเสียหาย",branch:"defense",level:1,requires:[],practice:{},effect:"guard",stamina:13,cooldownMs:8000,range:0,power:0.45},
  step:{name:"ย่างคุมแนว",description:"ก้าวเข้าคุมระยะและเพิ่มป้องกันชั่วคราว",branch:"defense",level:3,requires:["guard"],practice:{guard:2},effect:"step",stamina:18,cooldownMs:10000,range:5,power:0.12},
  fortitude:{name:"หลักมั่นคง",description:"เพิ่มพลังป้องกันขณะสวมง้าวผู้พิทักษ์",branch:"defense",level:7,requires:["guard"],practice:{guard:5},effect:"passive",stamina:0,cooldownMs:0,range:0,power:0.08},
  anchor:{name:"ปักหลักไม่ถอย",description:"เพิ่มป้องกันชั่วคราวแลกกับการเคลื่อนที่ช้าลง",branch:"defense",level:13,requires:["step","fortitude"],practice:{guard:12},effect:"anchor",stamina:28,cooldownMs:25000,range:0,power:0.25},
  bash:{name:"ฟาดง้าวสกัด",description:"ฟาดเป้าหมายและสตันช่วงสั้น",branch:"control",level:1,requires:[],practice:{},effect:"stun",stamina:16,cooldownMs:9000,range:3,power:0.9},
  sweep:{name:"กวาดเปิดแนว",description:"กวาดโจมตีมอนสเตอร์ด้านหน้าสูงสุดสามตัว",branch:"control",level:3,requires:["bash"],practice:{stun:2},effect:"sweep",stamina:24,cooldownMs:10000,range:3.5,power:0.85},
  slam:{name:"กระแทกหยุดศึก",description:"ตั้งท่าก่อนกระแทกและสตันเป้าหมาย",branch:"control",level:7,requires:["bash"],practice:{stun:5},effect:"slam",stamina:26,cooldownMs:14000,range:3,power:1.25},
  counter:{name:"ง้าวพิทักษ์พิฆาต",description:"โจมตีหนักหลังตั้งรับหรือสกัดสำเร็จ",branch:"control",level:13,requires:["guard","bash"],practice:{guard:5,stun:7},effect:"counter",stamina:30,cooldownMs:16000,range:3,power:1.8},
  taunt:{name:"เสียงท้าทาย",description:"ยั่วยุมอนสเตอร์ทั่วไปใกล้ตัวให้หันมาหาตน",branch:"support",level:1,requires:[],practice:{},effect:"taunt",stamina:16,cooldownMs:15000,range:8,power:0},
  ward:{name:"คุ้มกันสหาย",description:"เพิ่มป้องกันให้ตนหรือสมาชิกปาร์ตี้ในระยะ",branch:"support",level:3,requires:["taunt"],practice:{},effect:"ward",stamina:20,cooldownMs:14000,range:10,power:0.15},
  intercept:{name:"ยืนเคียงป้องกัน",description:"เข้าหาเพื่อนและรับความเสียหายบางส่วนแทนชั่วคราว",branch:"support",level:7,requires:["ward"],practice:{assist:3},effect:"intercept",stamina:25,cooldownMs:20000,range:6,power:0.3},
  party_ward:{name:"แนวพิทักษ์",description:"เพิ่มป้องกันให้สมาชิกปาร์ตี้ใกล้เคียง",branch:"support",level:13,requires:["intercept","guard"],practice:{assist:8,guard:4},effect:"party_ward",stamina:32,cooldownMs:25000,range:8,power:0.12},
  firm_guard:{name:"มั่นคงรับศึก",description:"ตั้งรับด้านหน้าชั่วครู่เพื่อลดแรงโจมตี",branch:"defense",level:35,requires:["guard","fortitude"],practice:{guard:15},effect:"guard",stamina:22,cooldownMs:13000,range:0,power:0.35},
  line_sweep:{name:"กวาดพิทักษ์แนว",description:"กวาดมอนสเตอร์ด้านหน้าสูงสุดสามตัว",branch:"control",level:55,requires:["sweep","firm_guard"],practice:{stun:12,guard:10},effect:"sweep",stamina:28,cooldownMs:14000,range:3.5,power:1.05},
  steadfast_counter:{name:"ง้าวสวนรักษาแนว",description:"สวนอย่างหนักหลังตั้งรับหรือสกัดสำเร็จ",branch:"control",level:75,requires:["counter","line_sweep"],practice:{guard:20,stun:18},effect:"counter",stamina:32,cooldownMs:18000,range:3,power:2.0},
  enduring_ward:{name:"แนวคุ้มครองมั่นคง",description:"เพิ่มป้องกันให้ปาร์ตี้ใกล้เคียงชั่วคราว",branch:"support",level:95,requires:["ward","firm_guard","steadfast_counter"],practice:{guard:25,stun:15},effect:"party_ward",stamina:34,cooldownMs:30000,range:8,power:0.16},
} as const satisfies Record<string,SentinelLesson>;
export const SENTINEL_CONTROL=Object.freeze({monsterStunMs:700,playerStunMs:450,immunityMs:4000,tauntMs:3000,tauntImmunityMs:8000});
import { skillRankCost, validateSkillRanks, type SkillRanks } from "./Progression.js";
export const SENTINEL_RANKABLE_SKILLS=["bash","sweep","slam","counter","line_sweep","steadfast_counter","step","anchor","ward","party_ward","enduring_ward"] as const;
export type SentinelSkillId=keyof typeof SENTINEL_LESSONS;
export type SentinelBook={learned:SentinelSkillId[];slots:Array<SentinelSkillId|null>;practice:Record<SentinelPractice,number>;cooldowns:Partial<Record<SentinelSkillId,number>>;ranks?:SkillRanks};
export function sentinelPoints(level:number):number{return 1+Math.floor((Math.min(level,100)-1)/2);}
export function newSentinelBook():SentinelBook{return {learned:[],slots:[null,null,null,null],practice:{guard:0,stun:0,assist:0},cooldowns:{}};}
function record(value:unknown):value is Record<string,unknown>{return value!==null && typeof value==="object" && !Array.isArray(value);}
export function validateSentinelBook(value:unknown,level:number):SentinelBook {
  if(!record(value) || Object.keys(value).some(key=>!["cooldowns","learned","practice","slots","ranks"].includes(key)) || !Array.isArray(value.learned) || !Array.isArray(value.slots) || !record(value.practice) || !record(value.cooldowns))throw Error("invalid_sentinel_book");
  const learned=value.learned,slots=value.slots;
  if(learned.length>sentinelPoints(level) || new Set(learned).size!==learned.length || learned.some(id=>typeof id!=="string" || !Object.hasOwn(SENTINEL_LESSONS,id)))throw Error("invalid_sentinel_book");
  for(const id of learned as SentinelSkillId[]){const lesson:SentinelLesson=SENTINEL_LESSONS[id];if(lesson.level>level || lesson.requires.some(req=>!learned.includes(req)))throw Error("invalid_sentinel_book");}
  if(slots.length!==4 || new Set(slots.filter(id=>id!==null)).size!==slots.filter(id=>id!==null).length || slots.some(id=>id!==null && (typeof id!=="string" || !learned.includes(id) || SENTINEL_LESSONS[id as SentinelSkillId].effect==="passive")))throw Error("invalid_sentinel_book");
  if(Object.keys(value.practice).sort().join(",")!=="assist,guard,stun" || Object.values(value.practice).some(n=>typeof n!=="number" || !Number.isSafeInteger(n) || n<0 || n>1_000_000))throw Error("invalid_sentinel_book");
  for(const [id,ready] of Object.entries(value.cooldowns))if(!Object.hasOwn(SENTINEL_LESSONS,id) || typeof ready!=="number" || !Number.isSafeInteger(ready) || ready<0)throw Error("invalid_sentinel_book");
  let ranks:SkillRanks;
  try{ranks=validateSkillRanks(value.ranks,learned as string[],level,sentinelPoints(level),SENTINEL_RANKABLE_SKILLS);}catch{throw Error("invalid_sentinel_book");}
  return {learned:[...learned] as SentinelSkillId[],slots:[...slots] as Array<SentinelSkillId|null>,practice:{...value.practice} as SentinelBook["practice"],cooldowns:{...value.cooldowns} as SentinelBook["cooldowns"],...(skillRankCost(ranks)?{ranks}:{})};
}
