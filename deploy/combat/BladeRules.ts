/** Provisional server-owned rules for the arcane blade class. */
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
  cloak:{name:"ม่านพรางกาย",description:"พรางตัวชั่วคราว การโจมตีหรือรับความเสียหายจะเปิดเผยตัว",branch:"veil",level:1,requires:[],practice:{},effect:"cloak",stamina:20,cooldownMs:24000,range:0,power:0},
  quiet_step:{name:"ย่างไร้รอย",description:"เคลื่อนที่คล่องขึ้นและลดระยะตรวจจับของมอนสเตอร์ทั่วไปขณะพราง",branch:"veil",level:5,requires:["cloak"],practice:{ambush:3},effect:"passive",stamina:0,cooldownMs:0,range:0,power:0.1},
  shadow_step:{name:"ก้าวเงาประชิด",description:"ก้าวเข้าหาเป้าหมายขณะพรางโดยตรวจสิ่งกีดขวาง",branch:"veil",level:9,requires:["cloak"],practice:{ambush:5},effect:"approach",stamina:16,cooldownMs:9000,range:6,power:0},
  veil_guard:{name:"ม่านลวง",description:"ลดความเสียหายชั่วครู่เมื่อการพรางสิ้นสุด",branch:"veil",level:15,requires:["quiet_step","shadow_step"],practice:{ambush:12,evade:3},effect:"passive",stamina:0,cooldownMs:0,range:0,power:0.15},
  hidden_edge:{name:"คมซ่อนมนต์",description:"โจมตีเปิดฉากจากการพรางและทิ้งรอยอาคม",branch:"edge",level:3,requires:["cloak"],practice:{ambush:2},effect:"strike",stamina:18,cooldownMs:7000,range:3,power:1.4},
  marked_cut:{name:"ฟันรอยอาคม",description:"โจมตีและใช้รอยอาคมของตน",branch:"edge",level:7,requires:["hidden_edge"],practice:{ambush:4,mark:2},effect:"consume",stamina:20,cooldownMs:8000,range:3,power:1.6},
  piercing_edge:{name:"คมอาคมทะลวง",description:"ตั้งท่าก่อนโจมตีเป้าหมายเดี่ยวอย่างหนัก",branch:"edge",level:11,requires:["marked_cut"],practice:{mark:5},effect:"windup",stamina:26,cooldownMs:12000,range:3,power:1.9},
  sever_mark:{name:"สะบั้นรอยแผล",description:"ใช้รอยอาคมของตนเพื่อปิดจังหวะอย่างรุนแรง",branch:"edge",level:17,requires:["marked_cut","piercing_edge"],practice:{mark:10,combo:5},effect:"consume",stamina:32,cooldownMs:18000,range:3,power:2.2},
  evade:{name:"ก้าวหลบคม",description:"หลบระยะสั้นและลดความเสียหายในจังหวะหลบ",branch:"tempo",level:3,requires:["cloak"],practice:{},effect:"evade",stamina:16,cooldownMs:9000,range:0,power:0.25},
  counter:{name:"ฟันชิงจังหวะ",description:"สวนหลังหลบการโจมตีสำเร็จ",branch:"tempo",level:7,requires:["evade"],practice:{evade:3},effect:"counter",stamina:18,cooldownMs:8000,range:3,power:1.4},
  retreat:{name:"ถอนกาย",description:"ถอยออกจากเป้าหมายเพื่อจัดตำแหน่งใหม่",branch:"tempo",level:10,requires:["evade"],practice:{evade:5},effect:"retreat",stamina:18,cooldownMs:10000,range:0,power:0},
  killer_focus:{name:"จิตสังหาร",description:"เพิ่มพลังช่วงสั้นหลังเปิดฉากจากการพราง",branch:"tempo",level:15,requires:["counter","hidden_edge"],practice:{ambush:8,combo:4},effect:"focus",stamina:24,cooldownMs:25000,range:0,power:0.15},
} as const satisfies Record<string,BladeLesson>;
export type BladeSkillId = keyof typeof BLADE_LESSONS;
export type BladeBook = {
  learned:BladeSkillId[]; slots:Array<BladeSkillId|null>;
  practice:Record<BladePractice,number>; cooldowns:Partial<Record<BladeSkillId,number>>;
};
export function bladePoints(level:number):number { return 1+Math.floor((Math.min(level,100)-1)/2); }
export function newBladeBook():BladeBook {
  return {learned:[],slots:[null,null,null,null],practice:{ambush:0,mark:0,evade:0,combo:0},cooldowns:{}};
}
function record(value:unknown):value is Record<string,unknown> { return value!==null && typeof value==="object" && !Array.isArray(value); }
function count(value:unknown):value is number { return typeof value==="number" && Number.isSafeInteger(value) && value>=0 && value<=1_000_000; }
export function validateBladeBook(value:unknown,level:number):BladeBook {
  if(!record(value) || Object.keys(value).sort().join(",")!=="cooldowns,learned,practice,slots" ||
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
    if(!Object.hasOwn(BLADE_LESSONS,id) || typeof ready!=="number" || !Number.isSafeInteger(ready) || ready<0) throw Error("invalid_blade_book");
  return {learned:[...learned] as BladeSkillId[],slots:[...slots] as Array<BladeSkillId|null>,practice:{...value.practice} as BladeBook["practice"],cooldowns:{...value.cooldowns} as BladeBook["cooldowns"]};
}
