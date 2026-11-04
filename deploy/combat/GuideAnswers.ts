import type {GuideSelection} from "./TyphoonGuide.js";

export type GuideWar={id:string;name:string;phase:"battle"|"protected"|"open";owner:string|null;phaseEndsAt:number|null};
export type GuideContext={mapName:string;level:number;pathName:string;rebirthCount:number;guildName:string|null;
  wars:GuideWar[];event:{name:string;mapName:string;endsAt:number}|null;localTasks:string[];questAdvice?:string};
const formatTime=(ms:number)=>new Intl.DateTimeFormat("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(ms));
const remaining=(ms:number,now:number)=>{
  const seconds=Math.max(0,Math.ceil((ms-now)/1000)),hours=Math.floor(seconds/3600),minutes=Math.floor((seconds%3600)/60);
  return hours?`${hours} ชม. ${minutes} นาที`:`${minutes} นาที ${seconds%60} วินาที`;
};
function describeWar(w:GuideWar,now:number):string {
  const owner=w.owner?`ผู้ครอง ${w.owner}`:"ยังไม่มีผู้ครอง";
  if(w.phase==="open")return `${w.name}: เปิดให้ท้าชิง · ${owner}`;
  if(w.phase==="battle")return `${w.name}: กำลังรบ · ${owner}${w.phaseEndsAt?` · กำหนดสิ้นสุดไม่เกิน ${formatTime(w.phaseEndsAt)} น. เวลาไทย`:""} ศึกอาจจบก่อนกำหนด และเริ่มคุ้มครอง 8 ชั่วโมงหลังจบจริง`;
  return `${w.name}: คุ้มครอง · ${owner}${w.phaseEndsAt?` · เปิดได้ตั้งแต่ ${formatTime(w.phaseEndsAt)} น. เวลาไทย (เหลือ ${remaining(w.phaseEndsAt,now)})`:""}`;
}

/** Deterministic, server-owned facts; no model-generated numbers or commands. */
export function guideAnswer(selection:GuideSelection,context:GuideContext,now=Date.now()):string {
  if(selection.intent==="quest")return context.questAdvice ?? "คุยกับผู้มอบงานในพื้นที่เพื่อดูภารกิจ";
  if(selection.intent==="war"){
    const named=selection.siteId && context.wars.find(w=>w.id===selection.siteId);
    if(named)return describeWar(named,now);
    if(selection.unknownSite)return `ไม่พบข้อมูลสงครามของ ${selection.unknownSite} ในเซิร์ฟเวอร์นี้ ลองเปิดแผนที่ยุทธศาสตร์เพื่อดูจุดที่เปิดอยู่`;
    const open=context.wars.filter(w=>w.phase==="open"),fighting=context.wars.filter(w=>w.phase==="battle");
    const show=(items:GuideWar[])=>items.slice(0,5).map(w=>w.name).join(" · ")+(items.length>5?` และอีก ${items.length-5} จุด`:"");
    return `ด่านที่เปิดท้าชิง: ${open.length?show(open):"ยังไม่มี"}\nกำลังรบ: ${fighting.length?show(fighting):"ไม่มี"}\nระบุชื่อด่านเพื่อดูเวลา หรือเปิดแผนที่ยุทธศาสตร์เพื่อดูทุกจุด เวลาคุ้มครองนับ 8 ชั่วโมงจากเวลาจบศึกจริง`;
  }
  if(selection.intent==="event"){
    const event=context.event;
    return event && event.endsAt>now?`${event.name} ที่ ${event.mapName} · เหลือ ${remaining(event.endsAt,now)} ไปคุยกับผู้มอบงานในพื้นที่เพื่อเข้าร่วม โบนัสเหตุการณ์รับได้ครั้งเดียวต่อตัวละคร`:
      "ขณะนี้ไม่มีเหตุการณ์ที่กำลังเปิด ลองดูประกาศใหม่ภายหลัง";
  }
  if(selection.intent==="leveling"){
    if(context.level>=100)return `คุณเลเวล ${context.level} แล้ว ตัวละครไม่ได้รับ EXP เพิ่มในรอบนี้ คุยกับครูวิชาเพื่อดูการเกิดใหม่`;
    return `ตอนนี้คุณเป็น ${context.pathName} Lv.${context.level} อยู่ที่ ${context.mapName} `+
      (context.localTasks.length?`ผู้มอบงานในพื้นที่มีงาน เช่น ${context.localTasks.slice(0,3).join(" · ")} `:"เดินทางไปพื้นที่ล่าที่มีผู้มอบงานใกล้จุดพัก ")+
      "เปิดแผนที่เพื่อดูค่ายและระดับมอนสเตอร์ ชวนปาร์ตี้หรือเข้าร่วมเหตุการณ์เพื่อเพิ่มทางเลือกได้";
  }
  if(selection.intent==="rebirth")return `เกิดใหม่แล้ว ${context.rebirthCount}/15 ครั้ง · เมื่อถึง Lv.100 ให้คุยกับครูวิชาเพื่อเลือกอาชีพในรอบใหม่ วิชาเดิมและความชำนาญเก็บไว้ อุปกรณ์ที่ใส่ไม่ได้จะถอดเข้ากระเป๋า ต้องมีช่องว่างเพียงพอ`;
  if(selection.intent==="guild")return context.guildName?`คุณอยู่กิลด์ ${context.guildName} คุยกับนายทะเบียนกิลด์เพื่อดูสมาชิกและจัดการกิลด์ สมาชิกเข้าศึกได้ตั้งแต่ Lv.1 ผู้บัญชาการหรือนายทหารเป็นผู้เปิดศึก`:
    "คุยกับนายทะเบียนกิลด์เพื่อสร้างหรือเข้าร่วมกิลด์ เมื่อเป็นสมาชิกแล้วเข้าศึกได้ตั้งแต่ Lv.1 ผู้บัญชาการหรือนายทหารเป็นผู้เปิดศึก";
  if(selection.intent==="supply")return "ในสนามรบ คุยกับพลเสบียงที่ฐาน รับเสบียงแล้วเดินอย่างน้อย 15 เมตรและ 8 วินาทีไปส่งที่จุดยุทธศาสตร์ หากล้มเสบียงจะหาย ส่งครั้งถัดไปได้หลัง 60 วินาที ฝ่ายชนะได้เงินเข้าคลังชุดละ 5 หน่วย สูงสุด 120 หน่วยต่อศึก";
  return "ข้าช่วยดูสถานะสงคราม เวลาคุ้มครอง เหตุการณ์ เก็บเลเวล เกิดใหม่ กิลด์ และการส่งเสบียงได้ ลองถามพร้อมชื่อด่าน เช่น ‘ไตรเวียงเปิดตีเมื่อไหร่’";
}
