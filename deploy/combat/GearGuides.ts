import {PERSONAL_ITEMS,type CardId,type PersonalId,type BodySlot,type ForgeRating,type ItemStats} from "./PersonalItems.js";
import {cardHunt,cardHunts,findItemHunt} from "./MonsterLoot.js";
export {cardHunt} from "./MonsterLoot.js";

const schools={
  muay_boran:["wrap","brace","คาดเชือกรุกต่อเนื่อง","ตั้งรับแล้วสวน"],
  phutthaisawan:["twins","guard","รำดาบคู่รุกเร็ว","ดาบคู่คุมระยะ"],
  blade:["shadow","veil","ซุ่มโจมตีเปิดแรง","พรางตัวถอนจากวงล้อม"],
  sentinel:["pike","shield","ทวนโต้กลับ","ผู้พิทักษ์แนวหน้า"],
  seer:["wand","jar","อาคมตีตรา","เรียกผีคุ้มกาย"],
  mender:["crook","bell","ประคองขวัญปาร์ตี้","ผู้เยียวยายืนระยะ"],
} as const;
const playNotes={
  muay_boran:["เก็บมานาไว้ต่อท่ามวย ใช้ Stamina แดชเข้าประชิด แล้วเลือกประชิดจากช่าง","เพิ่มเกราะไว้ยืนรับก่อนสวน ลดแรงกระแทกจากมอนสเตอร์ด้วยออปชันป้องกัน"],
  phutthaisawan:["ใช้ดาบคู่กับท่าที่เรียน เน้นโจมตีต่อเนื่องและมานาพอสำหรับชุดท่า","ใช้ชิ้นป้องกันรับระหว่างคุมระยะ โดยยังถือดาบคู่สำหรับท่าสวน"],
  blade:["เลือกโจมตีประชิดสำหรับจังหวะเปิดจากพรางตัว แล้วถอนเมื่อท่าพัก","แลกแรงเปิดบางส่วนกับ HP และ DEF เพื่อทนช่วงถอนตัว"],
  sentinel:["คงทวนกับโล่ เลือกชิ้นโจมตีบางส่วนเพื่อเก็บเลเวลคนเดียว","สะสม HP, DEF และป้องกันมอนสเตอร์จากช่างเพื่อรักษาแนวหน้า"],
  seer:["เน้นเวทสำหรับยันต์และผีจากหม้อ ใช้มานาจากของเพื่อรักษาจังหวะร่าย","คงไม้ครูกับหม้อ แล้วเพิ่มเกราะส่วนอกและขาเมื่อรับแรงกดดัน"],
  mender:["เน้นเวท มานา และออปชันรักษา เพื่อให้การฟื้น HP ของปาร์ตี้ต่อเนื่อง","คงไม้เท้าขวัญกับกระดิ่ง แต่เปลี่ยนชิ้นหลักเป็นเกราะที่ช่วยให้ยืนรักษาได้นาน"],
} as const;
type School=keyof typeof schools;
type Style="pressure"|"endurance";
type Position="mainHand"|BodySlot;
const order:readonly Position[]=["mainHand","chest","offHand","head","legs","arms","feet","shoulders","leftHand","rightHand","neck","leftEar","rightEar","leftRing","rightRing"];
function itemFamily(path:School,slot:Position,style:Style){
  const caster=path==="mender"||path==="seer", guarded=style==="endurance", tank=path==="sentinel";
  switch(slot){
    case "mainHand":return "wp_"+schools[path][0];
    case "offHand":return "off_"+schools[path][1];
    case "neck":return guarded?"acc_gorget":path==="mender"?"acc_torc":caster?"acc_spell":"acc_fang";
    case "leftEar":return caster?"acc_earrings_lotus":"acc_earrings_hunter";
    case "rightEar":return guarded?"acc_earrings_ward":caster?"acc_earrings_focus":"acc_earrings_duelist";
    case "leftRing":return path==="mender"?"acc_ring_heal":caster?"acc_ring_spell":"acc_ring_atk";
    case "rightRing":return "acc_ring_guard";
  }
  const core=slot==="chest"||slot==="legs"||slot==="head";
  const armor=tank?(guarded||core?"heavy":"medium"):caster?(guarded&&core?"heavy":"cloth"):(guarded?(core?"medium":"hide"):"hide");
  return "arm_"+armor+"_"+slot;
}
const cardWeights:Record<ForgeRating,ItemStats>={
  guard:{def:1,magicDef:.75,hp:.10},melee:{atk:1,stamina:.12,hp:.02},
  ranged:{magicAtk:1,mana:.25,magicDef:.1,hp:.02},healing:{magicAtk:.8,mana:.4,magicDef:.25,hp:.03},
};
function bestCard(rating:ForgeRating,gearLevel:number,playerLevel:number){
  let best:CardId|null=null,value=0;
  const weights=cardWeights[rating];
  for(const [id,source] of cardHunts){
    const item=PERSONAL_ITEMS[id];
    if((item.level??1)>gearLevel || source.level>playerLevel)continue;
    const score=Object.entries(item.stats).reduce((sum,[stat,n])=>sum+n*(weights[stat as keyof ItemStats]??0),0);
    if(score>value){best=id;value=score;}
  }
  return best;
}
const upgrades=new Map<string,PersonalId[]>();
for(const id of Object.keys(PERSONAL_ITEMS) as PersonalId[]){
  const item=PERSONAL_ITEMS[id];
  if(!item.forge)continue;
  for(const path of item.path==="all"?Object.keys(schools):[item.path]){
    const key=path+"/"+item.family;
    const family=upgrades.get(key)??[];
    family.push(id);upgrades.set(key,family);
  }
}
for(const family of upgrades.values())family.sort((a,b)=>PERSONAL_ITEMS[a].level!-PERSONAL_ITEMS[b].level!);
export function personalGearGuides(path:string,level:number){
  if(!Object.hasOwn(schools,path) || !Number.isInteger(level) || level<1 || level>100)return null;
  const school=path as School, builds=(["pressure","endurance"] as const).map(style=>{
    const slots=order.map(position=>{
      const family=upgrades.get(school+"/"+itemFamily(school,position,style))!;
      const nextIndex=family.findIndex(id=>PERSONAL_ITEMS[id].level!>level);
      const id=family[nextIndex===-1?family.length-1:nextIndex-1],item=PERSONAL_ITEMS[id];
      const profile=item.forge!, offense:ForgeRating=school==="mender"?"healing":school==="seer"?"ranged":"melee";
      const rating=style==="endurance" && profile.pool.includes("guard")?"guard":
        profile.pool.includes(offense)?offense:profile.primary;
      const card=bestCard(rating,item.level!,level);
      return {position,id,affix:rating,card,cardHunt:card?cardHunt(card):null,hunt:findItemHunt(id,level),
        next:nextIndex===-1?null:family[nextIndex]};
    });
    const totals:ItemStats={};
    for(const {id} of slots)for(const [key,n] of Object.entries(PERSONAL_ITEMS[id].stats)){
      const stat=key as keyof ItemStats;totals[stat]=(totals[stat]??0)+n;
    }
    return {style,name:schools[school][style==="pressure"?2:3],focus:playNotes[school][style==="pressure"?0:1],totals,slots};
  });
  return {path,level,builds};
}
