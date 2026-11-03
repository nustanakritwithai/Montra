import {PERSONAL_ITEMS,bossTreasure,gearSchools,guideFamily,startingWeapon,type CardId,type PersonalId,type BodySlot,type ForgeRating,type ItemStats} from "./PersonalItems.js";
import {STARTER_HUNT,cardHunt,cardHunts,findItemHunt,itemCamp,journeyWeapon,practiceSite} from "./MonsterLoot.js";
import {TEMPLE_SPAWNS} from "./TempleMap.js";
import {PROGRESSION,baseManaAtLevel} from "./Progression.js";
export {cardHunt} from "./MonsterLoot.js";

const playNotes={
  muay_boran:["ผ้าพันหมัดและพลังประชิดช่วยหมัดชุดโคราชกับท่าเสา เก็บมานาไว้ฉากพุ่งด้วยท่าลพบุรี","เกราะช่วยให้ยืนรับระหว่างตั้งท่าไชยา พลังประชิดช่วยหมัดสวน เก็บ Stamina ไว้แดช"],
  phutthaisawan:["ดาบคู่กับพลังประชิดช่วยเพลงดาบพุทไธสวรรค์และท่าฟันกวาดอาทมาฏ มานาช่วยต่อเพลงดาบ","เกราะช่วยให้ยืนตั้งดาบสวนศรีไตรรัตน์ มานาช่วยให้ใช้ท่าชุมพรคุ้มกันเพื่อนได้อีก"],
  blade:["ATK และออปชันประชิดช่วยคมสังหาร ปลุกจิตสังหารเพื่อเพิ่ม ATK ก่อนเปิดจากล่องหน","เก็บมานาไว้ล่องหนและฟันถอนเงา เกราะช่วยให้รอดหลังเปิดเผยตัว ส่วนระยะเวลาล่องหนขึ้นกับขั้นวิชา"],
  sentinel:["ทวนกับพลังประชิดช่วยตอนตั้งง้าวสวน เก็บมานาไว้กระแทกหยุดทัพ ระยะเวลาสตันมอนสเตอร์ขึ้นกับขั้นวิชา","ทวน โล่ และเกราะหนักเสริม DEF กับ HP เพื่อปักหลักพิทักษ์และรับความเสียหายแทนเพื่อนด้วยยืนเคียงท้าทาย"],
  seer:["เวทและออปชันโจมตีไกลเพิ่มแรงควายธนูและผีจากหม้อเมื่อล่ามอนสเตอร์","ยันต์สะกดช่วยข้าวสารพิษกัดเลือดตาม HP ของเป้าหมาย เลือกมานากับเกราะเพื่อยืนร่าย"],
  mender:["เวทและออปชันรักษาช่วยพรฟื้นกายกับมหายันต์ฟื้นชีพใน PvE มานาช่วยให้เหลือแรงร่ายฮีลหมู่","เน้นมานาและเกราะเพื่อยืนกางอาณาเขตคุ้มภัย ระยะเวลาคุ้มภัยและความแรงของพรหมู่ขึ้นกับขั้นสกิล"],
} as const;
type School=keyof typeof gearSchools;
type Position="mainHand"|BodySlot;
const order:readonly Position[]=["mainHand","chest","offHand","head","legs","arms","feet","shoulders","leftHand","rightHand","neck","leftEar","rightEar","leftRing","rightRing"];
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
  for(const path of item.path==="all"?Object.keys(gearSchools):[item.path]){
    const key=path+"/"+item.family;
    const family=upgrades.get(key)??[];
    family.push(id);upgrades.set(key,family);
  }
}
for(const family of upgrades.values())family.sort((a,b)=>PERSONAL_ITEMS[a].level!-PERSONAL_ITEMS[b].level!);
export function personalGearGuides(path:string,level:number){
  if(!Object.hasOwn(gearSchools,path) || !Number.isInteger(level) || level<1 || level>100)return null;
  const school=path as School, builds=(["pressure","endurance"] as const).map(style=>{
    const pieces=order.map(position=>{
      const family=upgrades.get(school+"/"+guideFamily(school,position,style))!;
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
    return {style,name:gearSchools[school][style==="pressure"?2:3],focus:playNotes[school][style==="pressure"?0:1],totals,maxMana,slots};
  });
  const starterHunt=level<=STARTER_HUNT.maxLevel?{...STARTER_HUNT,weapon:startingWeapon(school)}:undefined;
  const weapon=journeyWeapon(school,Math.max(10,level)),boss=bossTreasure("boss_bound_temple")!;
  const journey=weapon?{weapon,camp:itemCamp(weapon,PERSONAL_ITEMS[weapon].level!),
    practice:practiceSite(TEMPLE_SPAWNS.find(m=>m.level===15)!.id),
    boss:level>=18 && level<=22?{fragment:boss.fragment,gear:boss.gear,level:boss.level,camp:itemCamp(boss.fragment,boss.level)}:undefined}:undefined;
  return {path,level,baseMana:baseManaAtLevel(level),manaCap:PROGRESSION.maxMana,builds,starterHunt,journey};
}
