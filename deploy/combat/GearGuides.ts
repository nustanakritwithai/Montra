import {PERSONAL_ITEMS,bossTreasure,gearSchools,guideFamily,startingWeapon,type CardId,type PersonalId,type BodySlot,type ForgeRating,type ItemStats} from "./PersonalItems.js";
import {STARTER_HUNT,cardHunt,cardHunts,findItemHunt,hunts,itemCamp,journeyWeapon,practiceSite} from "./MonsterLoot.js";
import {MUAY_CORE,MUAY_CORE_LEVELS,MUAY_CORE_POINT_LEVELS,MUAY_LESSONS,MUAY_SKILLS} from "./MuayRules.js";
import {SWORD_CORE,SWORD_NODES} from "./SkillCatalog.js";
import {BLADE_CORE,BLADE_LESSONS} from "./BladeRules.js";
import {SENTINEL_CORE,SENTINEL_LESSONS} from "./SentinelRules.js";
import {SEER_CORE,MENDER_CORE,OCCULT_LESSONS} from "./OccultRules.js";
import {RIFT_WARDEN} from "./WorldAtlas.js";
import {MAX_REBIRTHS,REBIRTH_SHRINE} from "./Rebirth.js";
import {REGIONAL_BOSSES,BOSS_RESPAWN_MS} from "./RegionalBosses.js";
import {PROGRESSION,SKILL_RANK_LEVELS,SKILL_RANK_PRACTICE,baseManaAtLevel} from "./Progression.js";
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
const fieldLessons={
  muay_boran:[MUAY_CORE.korat,MUAY_CORE.thasao],
  phutthaisawan:[SWORD_CORE.phuttha_core,SWORD_CORE.atamat_core],
  blade:[BLADE_CORE.blade_vanish,BLADE_CORE.blade_heavy],
  sentinel:[SENTINEL_CORE.shock,SENTINEL_CORE.bulwark],
  seer:[SEER_CORE.seer_pot,SEER_CORE.seer_buffalo],
  mender:[MENDER_CORE.mender_core_heal,MENDER_CORE.mender_core_ward],
} as const;
function journeyBoss(monsterId:string){
  const {fragment,gear,level}=bossTreasure(monsterId)!;
  return {fragment,gear,level,camp:itemCamp(fragment,level),respawnMinutes:BOSS_RESPAWN_MS/60_000};
}
function midgameBosses(school:School,level:number){
  const preferred=school==="sentinel"?"guard":school==="seer"||school==="mender"?"spirit":"grove";
  return REGIONAL_BOSSES.filter(b=>b.level>=26 && b.level<=level)
    .sort((a,b)=>Number(b.theme===preferred)-Number(a.theme===preferred) || b.level-a.level)
    .map(b=>journeyBoss(b.id));
}
// Keep a fallback on the ordinary hunting route even when optional provinces close.
function upperCamps(level:number){
  const maps=level<55?["lotus_basin","naga_cavern","river_watch"]:level<60?["naga_cavern","fallen_city"]:
    level<68?["fallen_city"]:level<75?["fallen_city","asura_peak"]:level<80?["asura_peak"]:
    level<85?["asura_peak","spirit_rift","fallen_city"]:["spirit_rift","fallen_city"];
  const candidates=hunts.filter(m=>maps.includes(m.mapId) && m.tier==="normal" && m.level<=level && level-m.level<=4)
    .sort((a,b)=>b.level-a.level || maps.indexOf(a.mapId)-maps.indexOf(b.mapId));
  const seen=new Set<string>();
  return candidates.flatMap(m=>{
    const key=m.mapId+"/"+m.name, site=practiceSite(m.id);
    if(!site?.open || seen.has(key))return [];
    seen.add(key); return [site];
  });
}
function upperBosses(school:School,level:number){
  const start=level<=75?51:76;
  const preference=school==="sentinel"?"guard":school==="seer" || school==="mender"?"spirit":"hunter";
  const choices=REGIONAL_BOSSES.filter(b=>b.level>=start && b.level<=level)
    .sort((a,b)=>Number(b.theme===preference)-Number(a.theme===preference) || b.level-a.level)
    .map(b=>journeyBoss(b.id));
  if(level>=RIFT_WARDEN.level)choices.unshift(journeyBoss(RIFT_WARDEN.id));
  return choices.filter(b=>b.camp?.open);
}
function upperTechniques(school:School,level:number){
  if(school==="muay_boran"){
    const target=level>=90?95:level>=75?80:40;
    return Object.entries(MUAY_LESSONS).filter(([,lesson])=>lesson.level===target)
      .map(([id,lesson])=>({id,name:MUAY_SKILLS[id as keyof typeof MUAY_SKILLS].name,level:target,school:lesson.school}));
  }
  const target=level>=90?95:level>=70?75:55;
  const catalog=school==="phutthaisawan"?SWORD_NODES:school==="blade"?BLADE_LESSONS:
    school==="sentinel"?SENTINEL_LESSONS:OCCULT_LESSONS;
  return Object.entries(catalog).filter(([,n])=>n.level===target && (!("path" in n) || n.path===school))
    .map(([id,n])=>({id,name:n.name,level:n.level,school:""}));
}
function upperCourse(school:School,level:number,learningLevel:number){
  const milestones=[...new Set<number>([...MUAY_CORE_POINT_LEVELS,...MUAY_CORE_LEVELS])];
  const band=Math.max(0,...milestones.filter(n=>n>=51 && n<=level));
  return {band,techniques:upperTechniques(school,level),coreCap:MUAY_CORE_LEVELS.filter(n=>n<=learningLevel).length,
    ranks:SKILL_RANK_LEVELS.map((lv,i)=>({level:lv,rank:i+1,practice:SKILL_RANK_PRACTICE[i]}))};
}
function fieldPracticeSite(level:number,preferredMap?:string){
  const candidates=hunts.filter(m=>(!m.tier || m.tier==="normal") && m.level<=level && level-m.level<=4)
    .map(m=>practiceSite(m.id)!).filter(site=>site.open);
  candidates.sort((a,b)=>b.level-a.level || Number(b.mapId===preferredMap)-Number(a.mapId===preferredMap));
  return candidates[0]??null;
}
// Early journeys alternate equipment goals with ordinary, level-eligible camps.
// Use the same authoritative spawns as loot and EXP, never a future Lv15 target.
function earlyCamps(level:number){
  const seen=new Set<string>();
  return hunts.filter(m=>(!m.tier || m.tier==="normal") && m.level<=level && level-m.level<=4)
    .sort((a,b)=>b.level-a.level).flatMap(m=>{
      const site=practiceSite(m.id),key=m.mapId+"/"+m.id.slice(0,m.id.lastIndexOf("_"))+"/"+m.name;
      if(!site?.open || seen.has(key))return [];
      seen.add(key);return [site];
    });
}
export function personalGearGuides(path:string,level:number,learningLevel=level){
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
  const weapon=journeyWeapon(school,Math.max(10,level));
  const camp=weapon?itemCamp(weapon,PERSONAL_ITEMS[weapon].level!):null;
  const upper=level>=51;
  const camps=upper?upperCamps(level):level<=25?earlyCamps(level):[];
  const challenges=level>=98?hunts.filter(m=>m.mapId==="spirit_rift" && m.tier==="strong" && m.level<=level)
    .flatMap(m=>{const site=practiceSite(m.id);return site?.open?[site]:[];}):[];
  const course=upper?upperCourse(school,level,learningLevel):undefined;
  const bosses=upper?upperBosses(school,level):level>=26?midgameBosses(school,level):[];
  const midgame=level>=26 && level<=50;
  const targetMap=level<40?(school==="muay_boran" || school==="seer" || school==="mender"?"bamboo_frontier":"hex_ridge"):
    (school==="phutthaisawan" || school==="sentinel" || school==="blade"?"naga_cavern":"lotus_basin");
  const lesson=midgame?fieldLessons[school][level<45?0:1]:undefined;
  const journey=weapon || midgame || upper?{weapon,camp,camps,challenges,course,rebirthLimit:level===100?MAX_REBIRTHS:undefined,shrine:level===100?REBIRTH_SHRINE:undefined,
    practice:upper?camps[0]??null:fieldPracticeSite(level,midgame?targetMap:camp?.mapId),
    lesson:lesson?{name:lesson.name,level:level<45?35:45}:undefined,
    boss:level>=18 && level<=22?journeyBoss("boss_bound_temple"):bosses[0],bosses}:undefined;
  return {path,level,baseMana:baseManaAtLevel(level),manaCap:PROGRESSION.maxMana,builds,starterHunt,journey};
}
