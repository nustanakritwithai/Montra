import {randomInt} from "node:crypto";
import {dynamicDropChance,dynamicCardChance} from "./DynamicBalance.js";
import {REGIONAL_BOSSES} from "./RegionalBosses.js";
import {PERSONAL_ITEMS,MAX_FORGE_COPIES,BOSS_GEAR_CHANCE,WEAPON_LEVELS,gearSchools,startingWeapon,monsterCardFor,type CardId,type BodyItemId,type PracticeWeapon,type MaterialId,type PersonalId} from "./PersonalItems.js";
import {FOREST_CAMPS,SHRINE_GUARDIAN,WORLD_EXPANSION,getWorldMap} from "./WorldMaps.js";
import {TEMPLE_ID,TEMPLE_MAP,TEMPLE_SPAWNS} from "./TempleMap.js";
import {ATLAS_MAPS,ATLAS_SPAWNS,FRONTIER_SPAWNS,HIMMAPAN_SPAWNS,HIMMAPAN_REPLACED_TARGETS,RIFT_WARDEN} from "./WorldAtlas.js";

type Theme="grove"|"hunter"|"guard"|"spirit";
type Hunt={id:string;name:string;level:number;mapId:string;tier?:string;theme:Theme;x?:number;z?:number};
const firstCamp=FOREST_CAMPS.find(c=>c.id==="west")!;
const firstCampSpawns=new Set(firstCamp.levels.map((_,i)=>`forest_${firstCamp.id}_${i+1}`));
export const STARTER_HUNT={mapId:"forbidden_forest",name:firstCamp.name,x:firstCamp.x,z:firstCamp.z,mobs:[...firstCampSpawns],goal:10,maxLevel:10} as const;
export function isStarterHuntMob(id:string){return firstCampSpawns.has(id);}
const starterWeapons=new Set<string>(Object.keys(gearSchools).map(startingWeapon));
// Court order follows the named camps in the world definitions. All individuals in a court share its theme.
const courtThemes:Readonly<Record<string,readonly Theme[]>>={
  bamboo_frontier:["grove","hunter","grove","grove","hunter"], lotus_basin:["grove","hunter","hunter","grove","guard"],
  drowned_marsh:["grove","hunter","spirit","hunter","guard"], moon_cemetery:["spirit","guard","spirit","hunter","guard"],
  hex_ridge:["guard","grove","guard","spirit","guard"], naga_cavern:["guard","hunter","hunter","spirit","guard"],
  fallen_city:["hunter","guard","guard","spirit","guard","guard","spirit"], asura_peak:["hunter","guard","guard","guard","guard"],
  spirit_rift:["spirit","hunter","spirit","grove","guard"], ritual_village:["spirit"], moon_pass:["guard","guard"], river_watch:["grove","hunter"],
  twin_neck_pass:["hunter","guard"], sam_lan_estuary:["hunter","grove"], tri_wiang_castle:["hunter","guard"],
};
const templeThemes:Record<string,Theme>={forecourt:"guard",cloister:"spirit",belfry:"guard",sanctum:"spirit"};
function regionalTheme(id:string,mapId:string):Theme{
  if(id===RIFT_WARDEN.id)return "guard";
  const group=Number(id.split("_").at(-2));
  const theme=courtThemes[mapId]?.[group-1];
  if(!theme)throw Error("missing_monster_loot_theme:"+id);
  return theme;
}
export const hunts:Hunt[]=[
  {id:"possessed-1",name:"ผีสิง",mapId:"ritual_village",level:1,theme:"spirit"},
  ...FOREST_CAMPS.flatMap(c=>c.levels.map((level,i):Hunt=>({id:"forest_"+c.id+"_"+(i+1),mapId:"forbidden_forest",level,x:c.x,z:c.z,
    name:level<5?"ผีหลงป่า":level<9?"เงารากไม้":"วิญญาณอาคม",theme:level<5?"hunter":level<9?"grove":"spirit"}))),
  {...SHRINE_GUARDIAN,mapId:"forbidden_forest",tier:"elite",theme:"guard"},
  ...TEMPLE_SPAWNS.map(s=>({...s,mapId:TEMPLE_ID,theme:templeThemes[s.id.split("_")[1]]})),
  ...[...ATLAS_SPAWNS,...FRONTIER_SPAWNS].map(s=>({...s,theme:regionalTheme(s.id,s.mapId)})),
  ...REGIONAL_BOSSES,
  ...HIMMAPAN_SPAWNS,
];
const materials:Record<Theme,readonly string[]>={
  grove:["wood","resin","herb"], hunter:["hide","fiber","herb"], guard:["metal","fiber"], spirit:["ink","resin"],
};
const nearbyTheme:Readonly<Record<string,Theme>>={hide:"grove",fiber:"grove",metal:"hunter",wood:"hunter",ink:"guard",resin:"spirit",herb:"grove"};
type GearId=BodyItemId|PracticeWeapon;
type DropTable={gear:GearId[];materials:MaterialId[]};
const tables=new Map(hunts.map((m):[string,DropTable]=>[m.id,{gear:[],materials:[]}]));
const sources=new Map<PersonalId,Hunt[]>();
const huntsById=new Map(hunts.map(m=>[m.id,m]));
export function capturedGhostSpecies(source?:{monsterId:string;mapId:string}):string|undefined {
  const hunt=source && huntsById.get(source.monsterId);
  if(!hunt || hunt.mapId!==source?.mapId)return;
  if(hunt.theme==="guard")return "MON_007";
  if(hunt.theme==="grove")return "MON_004";
}
const journeyWeapons=new Map<string,PracticeWeapon>();
function campKey(m:Hunt){return m.id.slice(0,m.id.lastIndexOf("_"));}
export function journeyWeapon(path:string,level:number){
  const tier=WEAPON_LEVELS.filter(tier=>tier<=level).at(-1);
  return tier && tier>=10 ? journeyWeapons.get(path+"/"+tier) : undefined;
}
for(const id of Object.keys(PERSONAL_ITEMS) as PersonalId[]){
  const item=PERSONAL_ITEMS[id];
  const journey=item.kind==="mainHand" && WEAPON_LEVELS.some(tier=>tier===item.level && tier>=10) && Object.hasOwn(gearSchools,item.path) &&
    item.family===PERSONAL_ITEMS[startingWeapon(item.path)].family;
  if(journey)journeyWeapons.set(item.path+"/"+item.level,id as PracticeWeapon);
  if(item.sourceBoss){
    const boss=hunts.find(m=>m.id===item.sourceBoss);
    if(!boss || boss.level!==item.level)throw Error("invalid_boss_treasure:"+id);
    sources.set(id,[boss]);
    continue;
  }
  if(!item.dropMax || (!item.forge && item.kind!=="material"))continue;
  const ingredient=item.kind==="material"?id:item.recipe![0].item;
  const raw=ingredient.split("_")[1],material=raw==="ingot"?"metal":raw;
  const eligible=hunts.filter(m=>m.level>=item.level! && m.level<=item.dropMax!);
  const local=eligible.filter(m=>materials[m.theme].includes(material));
  // If a short unlock window lacks this profession, one ordinary camp carries the item.
  const fallback=eligible.find(m=>m.tier!=="elite" && m.tier!=="boss" && !HIMMAPAN_REPLACED_TARGETS.has(m.id));
  const primary=local.some(m=>!HIMMAPAN_REPLACED_TARGETS.has(m.id))?local:
    [...local,...eligible.filter(m=>m.mapId===fallback?.mapId && m.name===fallback.name)];
  // Offer one accessible hunt near the unlock if the specialist camp starts much later.
  const early=eligible.filter(m=>m.level<=item.level!+2 && m.tier!=="elite" && m.tier!=="boss" && !HIMMAPAN_REPLACED_TARGETS.has(m.id));
  const alternate=early.some(m=>primary.includes(m))?undefined:early.find(m=>m.theme===nearbyTheme[material])??early[0];
  const sites=eligible.filter(m=>primary.includes(m)||m===alternate||m.tier==="elite"||m.tier==="boss"||
    (journey && item.level!<=20 && alternate && m.mapId===alternate.mapId && m.name===alternate.name && campKey(m)===campKey(alternate))||
    (starterWeapons.has(id) && isStarterHuntMob(m.id)));
  sources.set(id,sites.filter(m=>!HIMMAPAN_REPLACED_TARGETS.has(m.id)));
  for(const m of sites){
    const table=tables.get(m.id)!;
    if(item.kind==="material")table.materials.push(id as MaterialId);else table.gear.push(id as GearId);
  }
}
export function huntDetails(mob:Hunt){
  const map=getWorldMap(mob.mapId)??ATLAS_MAPS[mob.mapId]??(mob.mapId===TEMPLE_ID?TEMPLE_MAP:undefined);
  return {id:mob.id,monster:mob.name,level:mob.level,mapId:mob.mapId,map:map?.name??mob.mapId,
    open:mob.mapId==="ritual_village"||Boolean(WORLD_EXPANSION&&getWorldMap(mob.mapId))};
}
export function findItemHunt(id:PersonalId,playerLevel:number){
  let best:Hunt|undefined,score=Infinity;
  for(const m of sources.get(id)??[]){
    const cost=(m.mapId!=="ritual_village"&&(!WORLD_EXPANSION||!getWorldMap(m.mapId))?1000:0)+(m.tier==="boss"?100:m.tier==="elite"?25:0)+Math.abs(m.level-playerLevel);
    if(cost<score){best=m;score=cost;}
  }
  return best? huntDetails(best):null;
}
export function itemCamp(id:PersonalId,level:number){
  const site=findItemHunt(id,level);if(!site)return null;
  const home=huntsById.get(site.id)!;
  const mobs=(sources.get(id)??[]).filter(m=>m.mapId===home.mapId && m.name===home.name && campKey(m)===campKey(home));
  const map=getWorldMap(site.mapId);
  const camp=map?.camps?.find(c=>home.id.startsWith("temple_"+c.id+"_") || home.id.startsWith("forest_"+c.id+"_") ||
    campKey(home)==="atlas_"+site.mapId+"_"+c.id.replace(/^court/,""));
  return {...site,mobs:mobs.map(m=>m.id),camp:camp?.name??site.monster,x:camp?.x??home.x,z:camp?.z??home.z};
}
export function practiceSite(id:string){
  const mob=huntsById.get(id);
  return mob?{...huntDetails(mob),x:mob.x,z:mob.z}:null;
}
export const cardHunts=new Map<CardId,ReturnType<typeof huntDetails>>();
for(const mob of hunts){
  const card=monsterCardFor(mob.id,mob.level);
  if(!card)continue;
  const candidate=huntDetails(mob),previous=cardHunts.get(card);
  if(!previous || (candidate.open!==previous.open?candidate.open:candidate.level<previous.level))cardHunts.set(card,candidate);
}
export function cardHunt(card:CardId){return cardHunts.get(card)??null;}
const catalog=Object.entries(PERSONAL_ITEMS).map(([id,item])=>{
  const hunt=findItemHunt(id as PersonalId,item.level??1);
  const source=hunt??(item.kind==="card"?cardHunt(id as CardId):null);
  const rate=item.sourceBoss?(item.forge?" · อัตราดรอปอาจเปลี่ยนตามสภาพโลก · ชิ้นซ้ำเข้าคลังช่าง":" · ได้ 1 ชิ้นเมื่อชนะ"):"";
  const dropHint=hunt?hunt.monster+" Lv."+hunt.level+" · "+hunt.map+rate+(hunt.open?"":" · พื้นที่ยังไม่เปิด"):undefined;
  return [id,source?{...item,dropHint,huntTarget:{...source,...(hunt?itemCamp(id as PersonalId,item.level??1):{})}}:item] as const;
});
// Hunt locations and model metadata vary in UTF-8 size. Retain the 16-item cap,
// but reserve space below the transport ceiling for the envelope and live rates.
export const CATALOG_PAGES:Record<string,typeof catalog[number][1]>[]=[];
let catalogPage:Record<string,typeof catalog[number][1]>={};
for(const [id,item] of catalog){
  const count=Object.keys(catalogPage).length;
  if(count && (count>=16 || Buffer.byteLength(JSON.stringify({...catalogPage,[id]:item}))>15_000)){
    CATALOG_PAGES.push(catalogPage);catalogPage={};
  }
  catalogPage[id]=item;
}
if(Object.keys(catalogPage).length)CATALOG_PAGES.push(catalogPage);
export function catalogPageWithRates(items:Record<string,any>){
  return Object.fromEntries(Object.entries(items).map(([id,item])=>[id,item.kind==="card"?{...item,chancePct:dynamicCardChance(id,item.chancePct??0)}:item]));
}
export function cardCatalogWithRates(){return catalogPageWithRates(Object.fromEntries(catalog.filter(([,item])=>item.kind==="card")));}

export const MAX_LOOT_MISSES=3;
export function rollMonsterLoot(monsterId:string,path:string,owned:ReadonlySet<string>|ReadonlyMap<string,number>,playerLevel:number,misses:number,tier:string,draw:(max:number)=>number=randomInt,partialStacks?:ReadonlySet<string>,forgeCopies?:Readonly<Record<string,number>>,worn?:ReadonlySet<string>,trainingWeapon?:PracticeWeapon){
  const table=tables.get(monsterId);
  if(!table)return null;
  const candidates=table.gear.filter(id=>{
    const def=PERSONAL_ITEMS[id];
    const available="get" in owned?(owned.get(id)??0)<(def.copyLimit??1):!owned.has(id);
    return (def.path==="all" || def.path===path) && available;
  });
  const ownedGear=[...owned.keys()].map(id=>({def:PERSONAL_ITEMS[id as PersonalId],count:"get" in owned?owned.get(id)!:1}))
    .filter(({def})=>def?.forge && def.level!<=playerLevel && (def.path==="all"||def.path===path));
  const useful=candidates.filter(id=>{
    const def=PERSONAL_ITEMS[id];
    if(def.level!>playerLevel || !def.recommended?.includes(path))return false;
    const slots=def.kind==="earring"||def.kind==="ring"?2:1;
    return ownedGear.reduce((n,{def:other,count})=>n+(other.kind===def.kind && other.level!>=def.level!?count:0),0)<slots;
  });
  const chance=dynamicDropChance(tier==="boss"?"boss":tier==="elite"?"elite":tier==="strong"?"strong":"normal",tier==="boss"?100:tier==="elite"?60:tier==="strong"?40:25);
  const guaranteed=useful.length>0 && misses===MAX_LOOT_MISSES;
  const next=playerLevel<=25?journeyWeapon(path,playerLevel):undefined;
  const firstWeapon=next && useful.includes(next);
  const repeats=forgeCopies?table.gear.filter(id=>owned.has(id) && !candidates.includes(id) && (forgeCopies[id]??0)<MAX_FORGE_COPIES &&
    (PERSONAL_ITEMS[id].path==="all" || PERSONAL_ITEMS[id].path===path)):[];
  const focus=repeats.filter(id=>worn?.has(id));
  const training=trainingWeapon && repeats.includes(trainingWeapon)?[trainingWeapon]:null;
  const bankOnly=Boolean(partialStacks && repeats.length);
  if((candidates.length || repeats.length) && (guaranteed || draw(100)<chance)){
    // Full bags can still collect workshop copies. Keep a pending wearable guarantee for the next free slot.
    let pool=[...candidates,...useful,...useful,...repeats];
    if(bankOnly && (!guaranteed || draw(100)<chance))pool=training??(focus.length?focus:repeats);
    else if(firstWeapon && draw(100)<24)pool=[next];
    else if(guaranteed)pool=useful;
    else if(training)pool=training;
    else if(focus.length && draw(100)<40)pool=focus;
    const id=pool[draw(pool.length)];
    const upgrade=useful.includes(id);
    return {id,misses:upgrade?0:Math.min(MAX_LOOT_MISSES,misses+Number(useful.length>0)),useful:upgrade};
  }
  const fitting=partialStacks?table.materials.filter(id=>partialStacks.has(id)):[];
  const pool=fitting.length?fitting:table.materials;
  const id=pool[draw(pool.length)];
  return {id,misses:Math.min(MAX_LOOT_MISSES,misses+Number(useful.length>0)),useful:false};
}
