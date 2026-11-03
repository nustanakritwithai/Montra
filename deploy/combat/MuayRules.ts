/** Prototype game mechanics inspired by historical Muay, not historical instruction. */
import {skillRankCost,validateSkillRanks,type SkillRanks} from "./Progression.js";
export const MUAY_WRAP_ID = "muay_wraps" as const;
export const MUAY_SKILLS = {
  step: {name:"ย่างสามขุม", effect:"step", stamina:15, cooldownMs:6000, power:0.9, range:6},
  punch: {name:"หมัดนำ", effect:"strike", stamina:8, cooldownMs:3000, power:1.1, range:2.5},
  guard: {name:"ป้อง ปัด ปิด", effect:"guard", stamina:12, cooldownMs:8000, power:0.5, range:0},
  parry: {name:"ปัดเปิดจังหวะ", effect:"parry", stamina:18, cooldownMs:9000, power:0.35, range:0},
  evade: {name:"เบี่ยงหลบ", effect:"evade", stamina:20, cooldownMs:8000, power:0.2, range:0},
  counter: {name:"ศอกสวนไชยา", effect:"counter", stamina:20, cooldownMs:9000, power:1.6, range:2.5},
  teep: {name:"ถีบหยุดจังหวะ", effect:"teep", stamina:16, cooldownMs:6000, power:0.8, range:3},
  grapple: {name:"จับทุ่ม", effect:"grapple", stamina:24, cooldownMs:12000, power:1.2, range:1.8},
  chaiya_elbow: {name:"ศอกวงในไชยา", effect:"strike", stamina:16, cooldownMs:5500, power:1.3, range:2},
  chaiya_knee: {name:"เข่าสวนไชยา", effect:"counter", stamina:22, cooldownMs:10000, power:1.85, range:2},
  chaiya_finish: {name:"ศอกคุมวงไชยา", effect:"strike", stamina:20, cooldownMs:12000, power:1.5, range:2},
  chaiya_cover: {name:"คุมวงไชยา", effect:"guard", stamina:22, cooldownMs:12000, power:0.65, range:0},
  chaiya_return: {name:"ศอกสวนคุมกำลัง", effect:"counter", stamina:22, cooldownMs:11000, power:1.65, range:2},
  korat_heavy: {name:"หมัดหนักโคราช", effect:"strike", stamina:22, cooldownMs:8500, power:1.7, range:2.5},
  korat_swing: {name:"หมัดเหวี่ยงควาย", effect:"strike", stamina:30, cooldownMs:12000, power:2.1, range:2.5},
  korat_finish: {name:"หมัดกระแทกโคราช", effect:"strike", stamina:25, cooldownMs:13000, power:1.6, range:2.5},
  korat_pierce: {name:"หมัดทะลวงโคราช", effect:"strike", stamina:32, cooldownMs:15000, power:1.9, range:2.5},
  korat_press: {name:"หมัดกดจังหวะโคราช", effect:"strike", stamina:20, cooldownMs:10000, power:1.3, range:2.5},
  lopburi_angle: {name:"ฉากหลบลพบุรี", effect:"sidestep", stamina:16, cooldownMs:7000, power:0.9, range:5},
  lopburi_counter: {name:"ลวงรับสวนกลับ", effect:"counter", stamina:20, cooldownMs:8500, power:1.65, range:2.5},
  lopburi_finish: {name:"ฉากซ้ำลพบุรี", effect:"sidestep", stamina:18, cooldownMs:11000, power:1.2, range:3.5},
  lopburi_reverse: {name:"ฉากกลับลพบุรี", effect:"sidestep", stamina:18, cooldownMs:8000, power:0.95, range:5},
  lopburi_slipcounter: {name:"ฉากสวนลพบุรี", effect:"counter_sidestep", stamina:23, cooldownMs:11000, power:1.55, range:3.5},
  thasao_step: {name:"ก้าวไวท่าเสา", effect:"step", stamina:17, cooldownMs:6500, power:1, range:7},
  thasao_flurry: {name:"ชุดหมัดท่าเสา", effect:"flurry", stamina:22, cooldownMs:9500, power:0.7, range:2.5},
  thasao_finish: {name:"หมัดต่อเนื่องท่าเสา", effect:"flurry", stamina:20, cooldownMs:11000, power:0.65, range:2.5},
  thasao_rush: {name:"ก้าวชุดท่าเสา", effect:"step_flurry", stamina:24, cooldownMs:11000, power:0.6, range:6},
  thasao_retreat: {name:"หมัดถอยท่าเสา", effect:"retreat_strike", stamina:18, cooldownMs:9000, power:0.95, range:2.5},
  chaiya_advanced_counter: {name:"ศอกสวนคุมวง",effect:"counter",stamina:24,cooldownMs:12000,power:1.75,range:2},
  chaiya_master_counter: {name:"เข่าสวนมั่นคง",effect:"counter",stamina:30,cooldownMs:17000,power:2.05,range:2},
  korat_advanced_strike: {name:"หมัดอัดแนวโคราช",effect:"strike",stamina:25,cooldownMs:11000,power:1.8,range:2.5},
  korat_master_strike: {name:"หมัดสะท้านโคราช",effect:"strike",stamina:34,cooldownMs:18000,power:2.25,range:2.5},
  lopburi_advanced_angle: {name:"ฉากอ้อมลพบุรี",effect:"sidestep",stamina:22,cooldownMs:10000,power:1.15,range:5},
  lopburi_master_counter: {name:"ฉากสวนชั้นครู",effect:"counter_sidestep",stamina:30,cooldownMs:16000,power:1.95,range:3.5},
  thasao_advanced_flurry: {name:"ชุดหมัดต่อเนื่องท่าเสา",effect:"flurry",stamina:26,cooldownMs:11000,power:0.75,range:2.5},
  thasao_master_rush: {name:"ก้าวชุดชั้นครู",effect:"step_flurry",stamina:32,cooldownMs:17000,power:0.8,range:6},
  chaiya_final_counter: {name:"สวนคุมวงชั้นครู",effect:"counter",stamina:34,cooldownMs:20000,power:2.15,range:2},
  korat_final_strike: {name:"หมัดพิชิตแนว",effect:"strike",stamina:34,cooldownMs:21000,power:2.35,range:2.5},
  lopburi_final_counter: {name:"ฉากสวนพิชิตจังหวะ",effect:"counter_sidestep",stamina:34,cooldownMs:19000,power:2.1,range:3.5},
  thasao_final_rush: {name:"ก้าวชุดพิชิตจังหวะ",effect:"step_flurry",stamina:36,cooldownMs:21000,power:0.9,range:6},
} as const;
export type MuaySkillId = keyof typeof MUAY_SKILLS;
export type MuayCooldowns = Partial<Record<MuaySkillId, number>>;
export const MUAY_BASE_SKILLS = ["step","punch","guard","counter","teep","grapple","parry","evade"] as const;
export const MUAY_DEFAULT_SLOTS: readonly [null, null, null, null] = [null,null,null,null];
export const isMuayFoundation = (id:string):boolean => MUAY_BASE_SKILLS.some(base=>base===id);
// Shared across schools; students learn and equip each technique explicitly.
const foundation = (level:number,description:string,requires:readonly string[]=[]) =>
  ({school:"chaiya" as const,level,description,requires,training:{strikes:0,blocks:0}});
export const MUAY_SCHOOLS = {
  chaiya:{name:"ไชยา",level:1,strikes:0,blocks:0,description:"ป้องกันแล้วสวนในระยะใกล้"},
  korat:{name:"โคราช",level:5,strikes:10,blocks:1,description:"หมัดหนักและแรงปะทะ"},
  lopburi:{name:"ลพบุรี",level:5,strikes:10,blocks:1,description:"ฉากเข้าทำและสวนกลับ"},
  thasao:{name:"ท่าเสา",level:5,strikes:10,blocks:1,description:"ก้าวไวและออกหมัดต่อเนื่อง"},
} as const;
export type MuaySchool = keyof typeof MUAY_SCHOOLS;
export type MuayMove = "punch" | "kick" | "elbow" | "knee";
export const MUAY_COMBO_WINDOW_MS = 6000;
export const MUAY_COMBO_MULTIPLIER = 1.25;
/** Provisional PvP tuning, separate from monster combat. */
export const MUAY_PVP_DAMAGE_MULTIPLIER = 0.75;
export const MUAY_PVP_COMBO_MULTIPLIER = 1.10;
export const MUAY_INTERRUPT_MS = 700;
export const MUAY_INTERRUPT_IMMUNITY_MS = 8000;
export const MUAY_GRAPPLE_HOLD_MS = 1500;
export const MUAY_GRAPPLE_ESCAPE_STAMINA = 15;
export const MUAY_GRAPPLE_COUNTER_STAMINA = 18;
export const MUAY_GRAPPLE_COUNTER_WINDOW_MS = 2500;
export const MUAY_GRAPPLE_COUNTER_RANGE = 2.5;
export const MUAY_COMBOS:Readonly<Record<MuaySchool,readonly MuayMove[]>> = {
  chaiya:["punch","elbow","knee"], korat:["punch","kick","punch"],
  lopburi:["kick","punch","elbow"], thasao:["kick","punch","punch"],
};
export const MUAY_COMBO_MOVES:Readonly<Record<Exclude<MuaySkillId,"guard"|"parry"|"evade"|"grapple"|"chaiya_cover">,MuayMove>> = {
  step:"punch",punch:"punch",counter:"elbow",teep:"kick",chaiya_elbow:"elbow",chaiya_knee:"knee",
  korat_heavy:"punch",korat_swing:"punch",lopburi_angle:"punch",lopburi_counter:"elbow",thasao_step:"punch",thasao_flurry:"punch",
  chaiya_finish:"elbow",korat_finish:"punch",lopburi_finish:"punch",thasao_finish:"punch",
  chaiya_return:"elbow",korat_pierce:"punch",korat_press:"punch",lopburi_reverse:"punch",lopburi_slipcounter:"elbow",thasao_rush:"punch",thasao_retreat:"punch",
  chaiya_advanced_counter:"elbow",chaiya_master_counter:"knee",korat_advanced_strike:"punch",korat_master_strike:"punch",
  lopburi_advanced_angle:"punch",lopburi_master_counter:"elbow",thasao_advanced_flurry:"punch",thasao_master_rush:"punch",
  chaiya_final_counter:"elbow",korat_final_strike:"punch",lopburi_final_counter:"elbow",thasao_final_rush:"punch",
};
/** Finisher windows are transient server state; clients never supply the window or target. */
export const MUAY_FOLLOWUP_WINDOW_MS=4000;
export const MUAY_FOLLOWUPS = {
  chaiya:{opener:"chaiya_knee",finisher:"chaiya_finish"},
  korat:{opener:"korat_swing",finisher:"korat_finish"},
  lopburi:{opener:"lopburi_angle",finisher:"lopburi_finish"},
  thasao:{opener:"thasao_flurry",finisher:"thasao_finish"},
} as const;
export type MuayComboState = {school:MuaySchool;targetId:string;count:number;until:number};
export function advanceMuayCombo(previous:MuayComboState|undefined,school:MuaySchool,targetId:string,move:MuayMove,now:number):
  {state:MuayComboState|undefined;count:number;completed:boolean;next:MuayMove|undefined} {
  const sequence=MUAY_COMBOS[school];
  const valid=previous && previous.school===school && previous.targetId===targetId && now<previous.until;
  const count=valid ? previous.count : 0;
  const progress=sequence[count]===move ? count+1 : (sequence[0]===move ? 1 : 0);
  if(progress===sequence.length)return {state:undefined,count:progress,completed:true,next:undefined};
  if(progress===0)return {state:undefined,count:0,completed:false,next:sequence[0]};
  return {state:{school,targetId,count:progress,until:now+MUAY_COMBO_WINDOW_MS},count:progress,completed:false,next:sequence[progress]};
}
export const MUAY_LESSONS = {
  punch:foundation(1,"หมัดตรงระยะประชิด"),
  guard:foundation(1,"ตั้งรับและเปิดจังหวะสวน"),
  step:foundation(3,"ย่างเข้าหาเป้าหมาย"),
  teep:foundation(3,"ถีบหยุดจังหวะมอนสเตอร์ทั่วไป"),
  counter:foundation(5,"สวนกลับหลังรับสำเร็จ",["guard"]),
  parry:foundation(5,"ปัดเปิดจังหวะสวน",["guard"]),
  evade:foundation(5,"เบี่ยงหลบแล้วสวนกลับ"),
  grapple:foundation(7,"จับคู่ต่อสู้แล้วกดซ้ำเพื่อทุ่ม"),
  chaiya_elbow:{school:"chaiya",level:1,requires:[],training:{strikes:5,blocks:0},description:"ศอกระยะประชิด พลัง 130%"},
  chaiya_knee:{school:"chaiya",level:5,requires:["chaiya_elbow"],training:{strikes:5,blocks:1},description:"เข่าสวนหลังรับสำเร็จ พลัง 185%"},
  chaiya_finish:{school:"chaiya",level:15,requires:["chaiya_knee"],training:{strikes:30,blocks:4},description:"หลังเข่าสวนภายใน 4 วิ ศอก 150% และฟื้นมานา 10"},
  chaiya_cover:{school:"chaiya",level:20,requires:["chaiya_elbow"],training:{strikes:50,blocks:6},description:"ป้องด้านหน้า 1.8 วิ รับดาเมจ 65% และเปิดสวน"},
  chaiya_return:{school:"chaiya",level:25,requires:["chaiya_knee"],training:{strikes:70,blocks:8},description:"ศอกสวนหลังรับสำเร็จ พลัง 165% ฟื้นมานา 8"},
  korat_heavy:{school:"korat",level:5,requires:[],training:{strikes:10,blocks:1},description:"หมัดหนักเดี่ยว พลัง 170%"},
  korat_swing:{school:"korat",level:10,requires:["korat_heavy"],training:{strikes:20,blocks:1},description:"หมัดหนักเดี่ยว พลัง 210%"},
  korat_finish:{school:"korat",level:15,requires:["korat_swing"],training:{strikes:30,blocks:4},description:"หลังหมัดเหวี่ยงควายภายใน 4 วิ พลัง 160% หยุดมอนสเตอร์ทั่วไป 0.5 วิ"},
  korat_pierce:{school:"korat",level:20,requires:["korat_heavy"],training:{strikes:50,blocks:6},description:"หมัด 190% ลดประสิทธิภาพการป้องของเป้าหมาย 25% ของส่วนที่ป้องกัน"},
  korat_press:{school:"korat",level:25,requires:["korat_swing"],training:{strikes:70,blocks:8},description:"หมัด 130% หยุดมอนสเตอร์ทั่วไป 0.6 วิ ใช้เวลาต้านร่วมกับถีบ"},
  lopburi_angle:{school:"lopburi",level:5,requires:[],training:{strikes:10,blocks:1},description:"ก้าวเฉียงเข้าทำ พลัง 90%"},
  lopburi_counter:{school:"lopburi",level:10,requires:["lopburi_angle"],training:{strikes:15,blocks:3},description:"สวนหลังรับสำเร็จ พลัง 165%"},
  lopburi_finish:{school:"lopburi",level:15,requires:["lopburi_counter"],training:{strikes:30,blocks:4},description:"หลังฉากหลบภายใน 4 วิ ฉากซ้ำโจมตีพลัง 120%"},
  lopburi_reverse:{school:"lopburi",level:20,requires:["lopburi_angle"],training:{strikes:50,blocks:6},description:"ฉากเข้าทำด้านตรงข้ามกับฉากหลบ พลัง 95%"},
  lopburi_slipcounter:{school:"lopburi",level:25,requires:["lopburi_counter"],training:{strikes:70,blocks:8},description:"หลังรับสำเร็จ ฉากเข้าโจมตีสวน พลัง 155%"},
  thasao_step:{school:"thasao",level:5,requires:[],training:{strikes:10,blocks:1},description:"ก้าวเข้าระยะ 7 หน่วย พลัง 100%"},
  thasao_flurry:{school:"thasao",level:10,requires:["thasao_step"],training:{strikes:20,blocks:1},description:"ชกสองครั้ง ครั้งละ 70%"},
  thasao_finish:{school:"thasao",level:15,requires:["thasao_flurry"],training:{strikes:30,blocks:4},description:"หลังชุดหมัดภายใน 4 วิ ชกต่อสองครั้ง ครั้งละ 65%"},
  thasao_rush:{school:"thasao",level:20,requires:["thasao_step"],training:{strikes:50,blocks:6},description:"ก้าวเข้าทำแล้วชกสองครั้ง ครั้งละ 60%"},
  thasao_retreat:{school:"thasao",level:25,requires:["thasao_flurry"],training:{strikes:70,blocks:8},description:"หมัด 95% แล้วถอยจากเป้าหมาย 1.2 หน่วย"},
  chaiya_advanced_counter:{school:"chaiya",level:40,requires:["chaiya_knee"],training:{strikes:90,blocks:12},description:"ศอกสวนหลังรับสำเร็จ พลัง 175%"},
  chaiya_master_counter:{school:"chaiya",level:80,requires:["chaiya_advanced_counter"],training:{strikes:150,blocks:20},description:"เข่าสวนหลังรับสำเร็จ พลัง 205%"},
  korat_advanced_strike:{school:"korat",level:40,requires:["korat_heavy"],training:{strikes:90,blocks:12},description:"หมัดหนักเดี่ยว พลัง 180%"},
  korat_master_strike:{school:"korat",level:80,requires:["korat_advanced_strike"],training:{strikes:150,blocks:20},description:"หมัดหนักเดี่ยว พลัง 225%"},
  lopburi_advanced_angle:{school:"lopburi",level:40,requires:["lopburi_angle"],training:{strikes:90,blocks:12},description:"ฉากเข้าทำ พลัง 115%"},
  lopburi_master_counter:{school:"lopburi",level:80,requires:["lopburi_advanced_angle","lopburi_counter"],training:{strikes:150,blocks:20},description:"ฉากสวนหลังรับสำเร็จ พลัง 195%"},
  thasao_advanced_flurry:{school:"thasao",level:40,requires:["thasao_flurry"],training:{strikes:90,blocks:12},description:"ชกสองครั้ง ครั้งละ 75%"},
  thasao_master_rush:{school:"thasao",level:80,requires:["thasao_advanced_flurry","thasao_step"],training:{strikes:150,blocks:20},description:"ก้าวเข้าทำแล้วชกสองครั้ง ครั้งละ 80%"},
  chaiya_final_counter:{school:"chaiya",level:95,requires:["chaiya_master_counter"],training:{strikes:200,blocks:25},description:"ศอกสวนหลังรับสำเร็จ พลัง 215%"},
  korat_final_strike:{school:"korat",level:95,requires:["korat_master_strike"],training:{strikes:200,blocks:25},description:"หมัดหนักเดี่ยว พลัง 235%"},
  lopburi_final_counter:{school:"lopburi",level:95,requires:["lopburi_master_counter"],training:{strikes:200,blocks:25},description:"ฉากสวนหลังรับสำเร็จ พลัง 210%"},
  thasao_final_rush:{school:"thasao",level:95,requires:["thasao_master_rush"],training:{strikes:200,blocks:25},description:"ก้าวเข้าทำแล้วชกสองครั้ง ครั้งละ 90%"},
} as const;
export type MuayLessonId = keyof typeof MUAY_LESSONS;
export const MUAY_RANKABLE_SKILLS:readonly string[]=Object.keys(MUAY_LESSONS).filter(id=>!isMuayFoundation(id) && MUAY_SKILLS[id as MuayLessonId].effect!=="guard");
export type MuayLoadouts = Record<MuaySchool,Array<MuaySkillId|null>>;
export type MuayMastery = Record<MuaySchool,{technique:number;sequences:number}>;
export const MUAY_MASTERY_LABELS:Readonly<Record<MuaySchool,string>> = {
  chaiya:"สวนมอนสเตอร์",korat:"หมัดโคราชใส่มอนสเตอร์",lopburi:"ฉากโจมตีมอนสเตอร์",thasao:"ก้าวโจมตีมอนสเตอร์",
};
export const MUAY_MASTERY_GUIDES:Readonly<Record<MuaySchool,string>> = {
  chaiya:"ป้องหรือปัดสำเร็จ แล้วใช้ศอกสวนไชยา เข่าสวนไชยา หรือศอกสวนคุมกำลังโจมตีมอนสเตอร์",
  korat:"ใช้หมัดประจำสำนักโคราชโจมตีมอนสเตอร์",
  lopburi:"ใช้ฉากหลบ ฉากซ้ำ ฉากกลับ หรือฉากสวนโจมตีมอนสเตอร์ โดยต้องมีการเคลื่อนที่จริง",
  thasao:"ใช้ก้าวไว ก้าวชุด หรือหมัดถอยโจมตีมอนสเตอร์ โดยต้องมีการเคลื่อนที่จริง",
};
/** These goals apply when learning, not when loading already-learned legacy skills. */
export const MUAY_MASTERY_REQUIREMENTS:Readonly<Partial<Record<MuayLessonId,{technique:number;sequences:number}>>> = {
  chaiya_cover:{technique:5,sequences:0},chaiya_return:{technique:10,sequences:3},
  korat_pierce:{technique:5,sequences:0},korat_press:{technique:10,sequences:3},
  lopburi_reverse:{technique:5,sequences:0},lopburi_slipcounter:{technique:10,sequences:3},
  thasao_rush:{technique:5,sequences:0},thasao_retreat:{technique:10,sequences:3},
  chaiya_advanced_counter:{technique:15,sequences:4},chaiya_master_counter:{technique:30,sequences:8},
  korat_advanced_strike:{technique:15,sequences:4},korat_master_strike:{technique:30,sequences:8},
  lopburi_advanced_angle:{technique:15,sequences:4},lopburi_master_counter:{technique:30,sequences:8},
  thasao_advanced_flurry:{technique:15,sequences:4},thasao_master_rush:{technique:30,sequences:8},
  chaiya_final_counter:{technique:45,sequences:12},korat_final_strike:{technique:45,sequences:12},
  lopburi_final_counter:{technique:45,sequences:12},thasao_final_rush:{technique:45,sequences:12},
};
const MUAY_TECHNIQUES:Readonly<Record<MuaySchool,readonly MuaySkillId[]>> = {
  chaiya:["counter","chaiya_knee","chaiya_return","chaiya_advanced_counter","chaiya_master_counter","chaiya_final_counter"],
  korat:["korat_heavy","korat_swing","korat_finish","korat_pierce","korat_press","korat_advanced_strike","korat_master_strike","korat_final_strike"],
  lopburi:["lopburi_angle","lopburi_finish","lopburi_reverse","lopburi_slipcounter","lopburi_advanced_angle","lopburi_master_counter","lopburi_final_counter"],
  thasao:["thasao_step","thasao_rush","thasao_retreat","thasao_master_rush","thasao_final_rush"],
};
export function countsMuayTechnique(school:MuaySchool,skill:MuaySkillId,moved:boolean):boolean {
  return MUAY_TECHNIQUES[school].includes(skill) && (school!=="lopburi" && school!=="thasao" || moved);
}
export type MuayBook = {learned:MuayLessonId[]; training:{strikes:number;blocks:number}; mastery:MuayMastery; school:MuaySchool; slots:Array<MuaySkillId|null>; loadouts:MuayLoadouts;ranks?:SkillRanks};
export function muayPoints(level:number):number { return 1+Math.floor((Math.min(level,100)-1)/2); }
export function newMuayLoadouts():MuayLoadouts {return {chaiya:[...MUAY_DEFAULT_SLOTS],korat:[...MUAY_DEFAULT_SLOTS],lopburi:[...MUAY_DEFAULT_SLOTS],thasao:[...MUAY_DEFAULT_SLOTS]};}
export function newMuayMastery():MuayMastery {return {chaiya:{technique:0,sequences:0},korat:{technique:0,sequences:0},lopburi:{technique:0,sequences:0},thasao:{technique:0,sequences:0}};}
export function newMuayBook():MuayBook { return {learned:[],training:{strikes:0,blocks:0},mastery:newMuayMastery(),school:"chaiya",slots:[...MUAY_DEFAULT_SLOTS],loadouts:newMuayLoadouts()}; }
export function validateMuayBook(value:unknown,level:number):MuayBook {
  if(!value || typeof value!=="object" || Array.isArray(value))throw new Error("invalid_muay_book");
  const v=value as Record<string,unknown>;
  const keys=Object.keys(v).filter(key=>key!=="ranks").sort().join(","), legacy=keys==="learned,slots,training", prior=keys==="learned,loadouts,school,slots,training", current=keys==="learned,loadouts,mastery,school,slots,training";
  if((!legacy && !prior && !current) || !Array.isArray(v.learned) || !Array.isArray(v.slots) || v.slots.length!==4 ||
    !v.training || typeof v.training!=="object" || Array.isArray(v.training))throw new Error("invalid_muay_book");
  const training=v.training as Record<string,unknown>;
  if(Object.keys(training).sort().join(",")!=="blocks,strikes" || Object.values(training).some(n=>!Number.isSafeInteger(n) || (n as number)<0 || (n as number)>1_000_000))throw new Error("invalid_muay_book");
  const mastery=newMuayMastery();
  if(current) {
    if(!v.mastery || typeof v.mastery!=="object" || Array.isArray(v.mastery) || Object.keys(v.mastery).sort().join(",")!==Object.keys(MUAY_SCHOOLS).sort().join(","))throw new Error("invalid_muay_book");
    const incoming=v.mastery as Record<string,unknown>;
    for(const schoolId of Object.keys(MUAY_SCHOOLS) as MuaySchool[]) {
      const entry=incoming[schoolId];
      if(!entry || typeof entry!=="object" || Array.isArray(entry) || Object.keys(entry).sort().join(",")!=="sequences,technique" || Object.values(entry).some(n=>!Number.isSafeInteger(n) || (n as number)<0 || (n as number)>1_000_000))throw new Error("invalid_muay_book");
      const values=entry as {technique:number;sequences:number};mastery[schoolId]={technique:values.technique,sequences:values.sequences};
    }
  }
  if(v.learned.length>muayPoints(level) || new Set(v.learned).size!==v.learned.length || v.learned.some(id=>typeof id!=="string" || !Object.hasOwn(MUAY_LESSONS,id)))throw new Error("invalid_muay_book");
  const learned=v.learned as MuayLessonId[];
  for(const id of learned) { const lesson=MUAY_LESSONS[id]; if(lesson.level>level || (lesson.requires as readonly string[]).some(req=>!learned.includes(req as MuayLessonId)))throw new Error("invalid_muay_book"); }
  const school=legacy ? "chaiya" : v.school;
  if(typeof school!=="string" || !Object.hasOwn(MUAY_SCHOOLS,school) || MUAY_SCHOOLS[school as MuaySchool].level>level)throw new Error("invalid_muay_book");
  const loadouts=newMuayLoadouts(), incoming=legacy ? null : v.loadouts;
  if(!legacy && (!incoming || typeof incoming!=="object" || Array.isArray(incoming) || Object.keys(incoming).sort().join(",")!==Object.keys(MUAY_SCHOOLS).sort().join(",")))throw new Error("invalid_muay_book");
  for(const schoolId of Object.keys(MUAY_SCHOOLS) as MuaySchool[]) {
    const slots=legacy ? (schoolId==="chaiya" ? v.slots : loadouts[schoolId]) : (incoming as Record<string,unknown>)[schoolId];
    if(!Array.isArray(slots) || slots.length!==4)throw new Error("invalid_muay_book");
    const occupied=slots.filter(id=>id!==null);
    if(new Set(occupied).size!==occupied.length || occupied.some(id=>typeof id!=="string" || !Object.hasOwn(MUAY_SKILLS,id) ||
      (!MUAY_BASE_SKILLS.includes(id as typeof MUAY_BASE_SKILLS[number]) && (!learned.includes(id as MuayLessonId) || MUAY_LESSONS[id as MuayLessonId].school!==schoolId))))throw new Error("invalid_muay_book");
    // Old saves pre-filled four foundation techniques. Only clear unlearned ones, in place.
    if(!legacy && schoolId===school && JSON.stringify(v.slots)!==JSON.stringify(slots))throw new Error("invalid_muay_book");
    loadouts[schoolId]=slots.map(id=>id!==null && isMuayFoundation(id) && !learned.includes(id) ? null : id);
  }
  let ranks:SkillRanks;
  try{ranks=validateSkillRanks(v.ranks,learned,level,muayPoints(level),MUAY_RANKABLE_SKILLS);}catch{throw Error("invalid_muay_book");}
  return {learned:[...learned],training:{strikes:training.strikes as number,blocks:training.blocks as number},mastery,school:school as MuaySchool,slots:[...loadouts[school as MuaySchool]],loadouts,...(skillRankCost(ranks)?{ranks}:{})};
}
export function validateMuayCooldowns(value: unknown): MuayCooldowns {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid_muay_cooldowns");
  const entries = Object.entries(value);
  if (entries.some(([key, time]) => !Object.hasOwn(MUAY_SKILLS,key) || !Number.isSafeInteger(time) || (time as number) < 0)) throw new Error("invalid_muay_cooldowns");
  return Object.fromEntries(entries) as MuayCooldowns;
}
