import {PERSONAL_ITEMS,type CardId,type PersonalId,type BodySlot,type ForgeRating,type ItemStats} from "./PersonalItems.js";
import {cardHunt,cardHunts,findItemHunt} from "./MonsterLoot.js";
import {PROGRESSION,baseManaAtLevel} from "./Progression.js";
export {cardHunt} from "./MonsterLoot.js";

const schools={
  muay_boran:["wrap","brace","หมัดชุดโคราช–ท่าเสา","ไชยาตั้งรับสวน"],
  phutthaisawan:["twins","guard","เพลงดาบคู่และฟันกวาด","ตั้งดาบสวนและคุ้มกัน"],
  blade:["shadow","veil","ซุ่มโจมตีเปิดแรง","พรางตัวถอนจากวงล้อม"],
  sentinel:["pike","shield","ทวนโต้กลับ","ผู้พิทักษ์แนวหน้า"],
  seer:["wand","jar","ผีจากหม้อและควายธนู","ยันต์สะกดและข้าวสารพิษ"],
  mender:["crook","bell","พรฟื้นกายและฮีลหมู่","อาณาเขตคุ้มภัยและพรหมู่"],
} as const;
const playNotes={
  muay_boran:["ผ้าพันหมัดและพลังประชิดช่วยหมัดชุดโคราชกับท่าเสา เก็บมานาไว้ฉากพุ่งด้วยท่าลพบุรี","เกราะช่วยให้ยืนรับระหว่างตั้งท่าไชยา พลังประชิดช่วยหมัดสวน เก็บ Stamina ไว้แดช"],
  phutthaisawan:["ดาบคู่กับพลังประชิดช่วยเพลงดาบพุทไธสวรรค์และท่าฟันกวาดอาทมาฏ มานาช่วยต่อเพลงดาบ","เกราะช่วยให้ยืนตั้งดาบสวนศรีไตรรัตน์ มานาช่วยให้ใช้ท่าชุมพรคุ้มกันเพื่อนได้อีก"],
  blade:["เลือกโจมตีประชิดสำหรับจังหวะเปิดจากพรางตัว แล้วถอนเมื่อท่าพัก","แลกแรงเปิดบางส่วนกับ HP และ DEF เพื่อทนช่วงถอนตัว"],
  sentinel:["คงทวนกับโล่ เลือกชิ้นโจมตีบางส่วนเพื่อเก็บเลเวลคนเดียว","สะสม HP, DEF และป้องกันมอนสเตอร์จากช่างเพื่อรักษาแนวหน้า"],
  seer:["เวทและออปชันโจมตีไกลเพิ่มแรงควายธนูและผีจากหม้อเมื่อล่ามอนสเตอร์","ยันต์สะกดช่วยข้าวสารพิษกัดเลือดตาม HP ของเป้าหมาย เลือกมานากับเกราะเพื่อยืนร่าย"],
  mender:["เวทและออปชันรักษาช่วยพรฟื้นกายกับมหายันต์ฟื้นชีพใน PvE มานาช่วยให้เหลือแรงร่ายฮีลหมู่","เน้นมานาและเกราะเพื่อยืนกางอาณาเขตคุ้มภัย ระยะเวลาคุ้มภัยและความแรงของพรหมู่ขึ้นกับขั้นสกิล"],
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
  if(path==="phutthaisawan" && (guarded || slot==="chest"))return "arm_medium_"+slot;
  const armor=tank?(guarded||core?"heavy":"medium"):caster?(guarded&&core?"heavy":"cloth"):(guarded?(core?"medium":"hide"):"hide");
  return "arm_"+armor+"_"+slot;
}
const cardWeights:Record<ForgeRating,ItemStats>={
  guard:{def:1,magicDef:.75,hp:.10},melee:{atk:1,stamina:.12,hp:.02},
  ranged:{magicAtk:1,mana:.25,magicDef:.1,hp:.02},healing:{magicAtk:.8,mana:.4,magicDef:.25,hp:.03},
};
const sustainCardWeights:ItemStats={mana:1,def:.8,magicDef:.6,hp:.08,magicAtk:.15};
function bestCard(weights:ItemStats,gearLevel:number,playerLevel:number,manaRoom:number){
  let best:CardId|null=null,value=0;
  for(const [id,source] of cardHunts){
    const item=PERSONAL_ITEMS[id];
    if(!source.open || (item.level??1)>gearLevel || source.level>playerLevel)continue;
    const score=Object.entries(item.stats).reduce((sum,[stat,n])=>sum+(stat==="mana"?Math.min(n,manaRoom):n)*(weights[stat as keyof ItemStats]??0),0);
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
    const pieces=order.map(position=>{
      const family=upgrades.get(school+"/"+itemFamily(school,position,style))!;
      const nextIndex=family.findIndex(id=>PERSONAL_ITEMS[id].level!>level);
      const id=family[nextIndex===-1?family.length-1:nextIndex-1],item=PERSONAL_ITEMS[id];
      const profile=item.forge!, offense:ForgeRating=school==="mender"?"healing":school==="seer"?"ranged":"melee";
      const rating=style==="endurance" && profile.pool.includes("guard")?"guard":
        profile.pool.includes(offense)?offense:profile.primary;
      return {position,id,affix:rating,hunt:findItemHunt(id,level),
        next:nextIndex===-1?null:family[nextIndex]};
    });
    const totals:ItemStats={};
    for(const {id} of pieces)for(const [key,n] of Object.entries(PERSONAL_ITEMS[id].stats)){
      const stat=key as keyof ItemStats;totals[stat]=(totals[stat]??0)+n;
    }
    const maxMana=Math.min(PROGRESSION.maxMana,baseManaAtLevel(level)+(totals.mana??0));
    let manaRoom=PROGRESSION.maxMana-maxMana;
    const supportive=style==="endurance" && (school==="seer" || school==="mender");
    const slots=pieces.map(piece=>{
      const weights=supportive?sustainCardWeights:cardWeights[piece.affix];
      const card=bestCard(weights,PERSONAL_ITEMS[piece.id].level!,level,manaRoom);
      if(card)manaRoom=Math.max(0,manaRoom-(PERSONAL_ITEMS[card].stats.mana??0));
      return {...piece,card,cardHunt:card?cardHunt(card):null};
    });
    return {style,name:schools[school][style==="pressure"?2:3],focus:playNotes[school][style==="pressure"?0:1],totals,maxMana,slots};
  });
  return {path,level,builds};
}
