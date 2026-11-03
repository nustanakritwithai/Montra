import {PERSONAL_ITEMS,OUTFIT_LEVELS,WEAPON_LEVELS,monsterCardFor,type CardId,type PersonalId,type BodySlot,type ForgeRating,type ItemStats} from "./PersonalItems.js";
import {FOREST_CAMPS,SHRINE_GUARDIAN,WORLD_EXPANSION,getWorldMap} from "./WorldMaps.js";
import {TEMPLE_ID,TEMPLE_MAP,TEMPLE_SPAWNS} from "./TempleMap.js";
import {ATLAS_MAPS,ATLAS_SPAWNS,FRONTIER_SPAWNS} from "./WorldAtlas.js";

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
type Hunt={id:string;name:string;level:number;mapId:string;tier?:string};
const hunts:Hunt[]=[
  {id:"possessed-1",name:"ผีสิง",mapId:"ritual_village",level:1},
  ...FOREST_CAMPS.flatMap(c=>c.levels.map((level,index)=>({id:"forest_"+c.id+"_"+(index+1),name:level<5?"ผีหลงป่า":level<9?"เงารากไม้":"วิญญาณอาคม",level,mapId:"forbidden_forest",tier:c.tier}))),
  {...SHRINE_GUARDIAN,mapId:"forbidden_forest",tier:"elite"},
  ...TEMPLE_SPAWNS.map(monster=>({...monster,mapId:TEMPLE_ID})),...ATLAS_SPAWNS,...FRONTIER_SPAWNS,
];
function findHunt(low:number,high:number,playerLevel:number){
  let best:Hunt|undefined,score=Infinity;
  for(const mob of hunts){
    if(mob.level<low || mob.level>high)continue;
    const inaccessible=mob.mapId!=="ritual_village" && (!WORLD_EXPANSION || !getWorldMap(mob.mapId));
    const cost=(inaccessible?1000:0)+(mob.tier==="boss"?100:mob.tier==="elite"?25:0)+Math.abs(mob.level-playerLevel);
    if(cost<score){best=mob;score=cost;}
  }
  return best?huntDetails(best):null;
}
function huntDetails(mob:Hunt){
  const map=getWorldMap(mob.mapId)??ATLAS_MAPS[mob.mapId]??(mob.mapId===TEMPLE_ID?TEMPLE_MAP:undefined);
  return {monster:mob.name,level:mob.level,mapId:mob.mapId,map:map?.name??mob.mapId,
    open:mob.mapId==="ritual_village"||Boolean(WORLD_EXPANSION&&getWorldMap(mob.mapId))};
}
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
const cardHunts=new Map<CardId,ReturnType<typeof huntDetails>>();
for(const mob of hunts){
  const card=monsterCardFor(mob.id,mob.level);
  if(card && mob.level<(cardHunts.get(card)?.level??Infinity))cardHunts.set(card,huntDetails(mob));
}
export function cardHunt(card:CardId){return cardHunts.get(card)??null;}
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
export function personalGearGuides(path:string,level:number){
  if(!Object.hasOwn(schools,path) || !Number.isInteger(level) || level<1 || level>100)return null;
  const school=path as School, builds=(["pressure","endurance"] as const).map(style=>{
    const slots=order.map(position=>{
      const levels=position==="mainHand"?WEAPON_LEVELS:OUTFIT_LEVELS, tier=levels.filter(n=>n<=level).length;
      const family=itemFamily(school,position,style),id=(family+"_"+tier) as PersonalId, item=PERSONAL_ITEMS[id];
      const profile=item.forge!, offense:ForgeRating=school==="mender"?"healing":school==="seer"?"ranged":"melee";
      const rating=style==="endurance" && profile.pool.includes("guard")?"guard":
        profile.pool.includes(offense)?offense:profile.primary;
      const card=bestCard(rating,item.level!,level);
      return {position,id,affix:rating,card,cardHunt:card?cardHunt(card):null,hunt:findHunt(item.level!,item.dropMax!,level),
        next:tier<levels.length?(family+"_"+(tier+1)) as PersonalId:null};
    });
    const totals:ItemStats={};
    for(const {id} of slots)for(const [key,n] of Object.entries(PERSONAL_ITEMS[id].stats)){
      const stat=key as keyof ItemStats;totals[stat]=(totals[stat]??0)+n;
    }
    return {style,name:schools[school][style==="pressure"?2:3],focus:playNotes[school][style==="pressure"?0:1],totals,slots};
  });
  return {path,level,builds};
}
