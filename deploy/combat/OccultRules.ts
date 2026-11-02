/** Game-design values are provisional and all combat decisions remain server-owned. */
export const OCCULT_PATHS = ["seer", "mender"] as const;
export type OccultPath = typeof OCCULT_PATHS[number];
export type OccultEffect = "mark" | "rice" | "rice_area" | "detonate" | "interrupt" | "curse" | "curse_burst" |
  "spirit" | "spirit_bind" | "trance" | "heal" | "heal_area" | "spirit_heal" | "ward" | "ward_area" |
  "cleanse" | "cleanse_area" | "spirit_ward";
export type OccultLesson = Readonly<{
  name:string; description:string; path:OccultPath; level:number; requires:readonly string[];
  training:number; effect:OccultEffect; stamina:number; cooldownMs:number; range:number; power:number;
}>;
export const OCCULT_LESSONS = {
  seer_mark: {name:"ยันต์ตีตรา",description:"โจมตีและติดตราให้วิชาข้าวสารหรือระเบิดยันต์",path:"seer",level:1,requires:[],training:0,effect:"mark",stamina:12,cooldownMs:4000,range:8,power:0.8},
  seer_rice: {name:"ข้าวสารฝังอาคม",description:"โจมตีเป้าเดียว แรงขึ้นเมื่อเป้าติดตราของตน",path:"seer",level:3,requires:["seer_mark"],training:3,effect:"rice",stamina:16,cooldownMs:5000,range:15,power:1.25},
  seer_scatter: {name:"ข้าวสารแตกกระจาย",description:"ซัดข้าวสารใส่มอนสเตอร์ใกล้เป้าหมายสูงสุด 3 ตัว",path:"seer",level:5,requires:["seer_rice"],training:6,effect:"rice_area",stamina:24,cooldownMs:10000,range:12,power:0.75},
  seer_burst: {name:"ระเบิดยันต์",description:"ใช้ตราของตนเพื่อโจมตีเป้าหมายอย่างรุนแรง",path:"seer",level:5,requires:["seer_rice"],training:6,effect:"detonate",stamina:24,cooldownMs:10000,range:12,power:2.0},
  seer_seal: {name:"ยันต์สะกด",description:"โจมตีและหยุดจังหวะมอนสเตอร์ทั่วไปชั่วคราว Elite และบอสไม่ถูกหยุด",path:"seer",level:8,requires:["seer_mark"],training:10,effect:"interrupt",stamina:20,cooldownMs:12000,range:8,power:0.9},
  seer_curse: {name:"คำสาปกัดกิน",description:"โจมตีและสาปเป้าหมายเป็นช่วงสั้น ๆ ใน PvP พลังลดลง",path:"seer",level:8,requires:["seer_mark"],training:10,effect:"curse",stamina:22,cooldownMs:12000,range:12,power:0.7},
  seer_spirit: {name:"สั่งผีจู่โจม",description:"สั่งผีจากหม้อโจมตีมอนสเตอร์ที่เลือก",path:"seer",level:10,requires:["seer_rice"],training:15,effect:"spirit",stamina:18,cooldownMs:9000,range:8,power:1.4},
  seer_hexburst: {name:"ถอนเคราะห์กลับ",description:"ใช้คำสาปของตนที่อยู่บนเป้าหมายระเบิดเป็นดาเมจ",path:"seer",level:12,requires:["seer_curse","seer_burst"],training:20,effect:"curse_burst",stamina:25,cooldownMs:14000,range:12,power:1.8},
  seer_spirit_bind: {name:"ผีรังควาน",description:"สั่งผีโจมตีและหยุดจังหวะมอนสเตอร์ทั่วไปชั่วคราว",path:"seer",level:15,requires:["seer_spirit","seer_seal"],training:25,effect:"spirit_bind",stamina:24,cooldownMs:14000,range:8,power:1.1},
  seer_trance: {name:"อาคมยืมฤทธิ์",description:"ขณะเข้าทรงเพิ่มพลังเวทชั่วคราว",path:"seer",level:15,requires:["seer_burst","seer_spirit"],training:25,effect:"trance",stamina:25,cooldownMs:25000,range:0,power:0.2},
  mender_heal: {name:"ยันต์ฟื้นกาย",description:"รักษาตนเองหรือสมาชิกปาร์ตี้ที่เลือก",path:"mender",level:1,requires:[],training:0,effect:"heal",stamina:18,cooldownMs:6000,range:12,power:0.14},
  mender_area: {name:"วงยันต์ฟื้นฟู",description:"ฟื้น HP ทันทีและอีก 3 ครั้งในวงอาคมนาน 6 วินาที",path:"mender",level:3,requires:["mender_heal"],training:3,effect:"heal_area",stamina:24,cooldownMs:12000,range:8,power:0.09},
  mender_ward: {name:"ยันต์คุ้มชีพ",description:"เพิ่มป้องกันให้ตนเองหรือสมาชิกปาร์ตี้ชั่วคราว",path:"mender",level:5,requires:["mender_heal"],training:6,effect:"ward",stamina:20,cooldownMs:15000,range:12,power:0.15},
  mender_cleanse: {name:"ถอนคุณไสย",description:"ถอนคำสาปอาคมที่วิชานี้รองรับจากตนเองหรือปาร์ตี้",path:"mender",level:8,requires:["mender_ward"],training:10,effect:"cleanse",stamina:18,cooldownMs:12000,range:12,power:0},
  mender_spirit: {name:"ผีคุ้มครอง",description:"ให้ผีที่เรียกมาช่วยคุ้มครองสมาชิกปาร์ตี้",path:"mender",level:10,requires:["mender_ward"],training:15,effect:"spirit_ward",stamina:22,cooldownMs:18000,range:12,power:0.2},
  mender_ward_area: {name:"เขตอาคมคุ้มภัย",description:"เพิ่มป้องกันกายและเวทให้ปาร์ตี้ใกล้เคียง",path:"mender",level:10,requires:["mender_ward","mender_area"],training:15,effect:"ward_area",stamina:30,cooldownMs:22000,range:8,power:0.1},
  mender_cleanse_area: {name:"ข้าวสารปัดเคราะห์",description:"ถอนคำสาปอาคมจากตนและสมาชิกปาร์ตี้ใกล้เคียง",path:"mender",level:12,requires:["mender_cleanse","mender_area"],training:20,effect:"cleanse_area",stamina:28,cooldownMs:20000,range:8,power:0},
  mender_spirit_heal: {name:"ผีประคอง",description:"ให้ผีจากหม้อช่วยฟื้น HP ตนเองหรือสมาชิกปาร์ตี้",path:"mender",level:12,requires:["mender_spirit","mender_heal"],training:20,effect:"spirit_heal",stamina:25,cooldownMs:16000,range:12,power:0.2},
  mender_trance: {name:"ทรงผีฟื้นกำลัง",description:"ขณะเข้าทรงเพิ่มการป้องกันและฟื้นกำลัง 15 ให้ปาร์ตี้ใกล้เคียง",path:"mender",level:15,requires:["mender_area","mender_spirit"],training:25,effect:"trance",stamina:28,cooldownMs:25000,range:8,power:0.12},
} as const satisfies Record<string, OccultLesson>;
export type OccultSkillId = keyof typeof OCCULT_LESSONS;
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
};
export type OccultBook = {
  learned:Record<OccultPath,OccultSkillId[]>;
  loadouts:Record<OccultPath,Array<OccultSkillId|null>>;
  training:Record<OccultPath,number>;
  cooldowns:Partial<Record<OccultSkillId,number>>;
  mastery:OccultMastery;
};
export const occultPoints = (level:number):number => 1 + Math.floor((Math.min(level,100)-1)/2);
export function newOccultBook():OccultBook {
  return {learned:{seer:[],mender:[]},loadouts:{seer:[null,null,null,null],mender:[null,null,null,null]},training:{seer:0,mender:0},cooldowns:{},
    mastery:{seer:{rice:0,talisman:0,spirit:0,curse:0},mender:{healing:0,protection:0,cleanse:0,spirit:0}}};
}
function record(value:unknown):value is Record<string,unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function validateOccultBook(value:unknown,level:number):OccultBook {
  if (!record(value) || Object.keys(value).some(key=>!["cooldowns","learned","loadouts","training","mastery"].includes(key)) ||
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
    if (!Object.hasOwn(OCCULT_LESSONS,id) || typeof ready!=="number" || !Number.isSafeInteger(ready) || ready<0) throw Error("invalid_occult_book");
    result.cooldowns[id as OccultSkillId]=ready;
  }
  return result;
}
