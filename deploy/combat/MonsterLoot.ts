import {randomInt} from "node:crypto";
import {REGIONAL_BOSSES} from "./RegionalBosses.js";
import {PERSONAL_ITEMS,BOSS_GEAR_CHANCE,monsterCardFor,type CardId,type BodyItemId,type PracticeWeapon,type MaterialId,type PersonalId} from "./PersonalItems.js";
import {FOREST_CAMPS,SHRINE_GUARDIAN,WORLD_EXPANSION,getWorldMap} from "./WorldMaps.js";
import {TEMPLE_ID,TEMPLE_MAP,TEMPLE_SPAWNS} from "./TempleMap.js";
import {ATLAS_MAPS,ATLAS_SPAWNS,FRONTIER_SPAWNS,RIFT_WARDEN} from "./WorldAtlas.js";

type Theme="grove"|"hunter"|"guard"|"spirit";
type Hunt={id:string;name:string;level:number;mapId:string;tier?:string;theme:Theme};
// Court order follows the named camps in the world definitions. All individuals in a court share its theme.
const courtThemes:Readonly<Record<string,readonly Theme[]>>={
  bamboo_frontier:["grove","hunter","grove","grove","hunter"], lotus_basin:["grove","hunter","hunter","grove","guard"],
  drowned_marsh:["grove","hunter","spirit","hunter","guard"], moon_cemetery:["spirit","guard","spirit","hunter","guard"],
  hex_ridge:["guard","grove","guard","spirit","guard"], naga_cavern:["guard","hunter","hunter","spirit","guard"],
  fallen_city:["hunter","guard","guard","spirit","guard"], asura_peak:["hunter","guard","guard","guard","guard"],
  spirit_rift:["spirit","hunter","spirit","grove","guard"], moon_pass:["guard","guard"], river_watch:["grove","hunter"],
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
  ...FOREST_CAMPS.flatMap(c=>c.levels.map((level,i):Hunt=>({id:"forest_"+c.id+"_"+(i+1),mapId:"forbidden_forest",level,
    name:level<5?"ผีหลงป่า":level<9?"เงารากไม้":"วิญญาณอาคม",theme:level<5?"hunter":level<9?"grove":"spirit"}))),
  {...SHRINE_GUARDIAN,mapId:"forbidden_forest",tier:"elite",theme:"guard"},
  ...TEMPLE_SPAWNS.map(s=>({...s,mapId:TEMPLE_ID,theme:templeThemes[s.id.split("_")[1]]})),
  ...[...ATLAS_SPAWNS,...FRONTIER_SPAWNS].map(s=>({...s,theme:regionalTheme(s.id,s.mapId)})),
  ...REGIONAL_BOSSES,
];
const materials:Record<Theme,readonly string[]>={
  grove:["wood","resin","herb"], hunter:["hide","fiber","herb"], guard:["metal","fiber"], spirit:["ink","resin"],
};
const nearbyTheme:Readonly<Record<string,Theme>>={hide:"grove",fiber:"grove",metal:"hunter",wood:"hunter",ink:"guard",resin:"spirit",herb:"grove"};
type GearId=BodyItemId|PracticeWeapon;
type DropTable={gear:GearId[];materials:MaterialId[]};
const tables=new Map(hunts.map((m):[string,DropTable]=>[m.id,{gear:[],materials:[]}]));
const sources=new Map<PersonalId,Hunt[]>();
for(const id of Object.keys(PERSONAL_ITEMS) as PersonalId[]){
  const item=PERSONAL_ITEMS[id];
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
  const fallback=eligible.find(m=>m.tier!=="elite" && m.tier!=="boss");
  const primary=local.length?local:eligible.filter(m=>m.mapId===fallback?.mapId && m.name===fallback.name);
  // Offer one accessible hunt near the unlock if the specialist camp starts much later.
  const early=eligible.filter(m=>m.level<=item.level!+2 && m.tier!=="elite" && m.tier!=="boss");
  const alternate=early.some(m=>primary.includes(m))?undefined:early.find(m=>m.theme===nearbyTheme[material])??early[0];
  const sites=eligible.filter(m=>primary.includes(m)||m===alternate||m.tier==="elite"||m.tier==="boss");
  sources.set(id,sites);
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
  const rate=item.sourceBoss?(item.forge?" · โอกาส "+BOSS_GEAR_CHANCE+"% เมื่อเลเวลถึงและยังไม่มีชิ้นนี้":" · ได้ 1 ชิ้นเมื่อชนะ"):"";
  const dropHint=hunt?hunt.monster+" Lv."+hunt.level+" · "+hunt.map+rate+(hunt.open?"":" · พื้นที่ยังไม่เปิด"):undefined;
  return [id,source?{...item,dropHint,huntTarget:{id:source.id,monster:source.monster,mapId:source.mapId,open:source.open}}:item] as const;
});
export const CATALOG_PAGES=Array.from({length:Math.ceil(catalog.length/16)},(_,i)=>Object.fromEntries(catalog.slice(i*16,i*16+16)));

export const MAX_LOOT_MISSES=3;
export function rollMonsterLoot(monsterId:string,path:string,owned:ReadonlySet<string>,playerLevel:number,misses:number,tier:string,draw:(max:number)=>number=randomInt,partialStacks?:ReadonlySet<string>){
  const table=tables.get(monsterId);
  if(!table)return null;
  const candidates=table.gear.filter(id=>{
    const def=PERSONAL_ITEMS[id];return (def.path==="all" || def.path===path) && !owned.has(id);
  });
  const ownedGear=[...owned].map(id=>PERSONAL_ITEMS[id as PersonalId]).filter(def=>def?.forge && def.level!<=playerLevel && (def.path==="all"||def.path===path));
  const useful=candidates.filter(id=>{
    const def=PERSONAL_ITEMS[id];
    if(def.level!>playerLevel || !def.recommended?.includes(path))return false;
    const slots=def.kind==="earring"||def.kind==="ring"?2:1;
    return ownedGear.filter(other=>other.kind===def.kind && other.level!>=def.level!).length<slots;
  });
  const chance=tier==="boss"?100:tier==="elite"?60:tier==="strong"?40:25;
  const guaranteed=useful.length>0 && misses===MAX_LOOT_MISSES;
  if(candidates.length && (guaranteed || draw(100)<chance)){
    const pool=guaranteed?useful:[...candidates,...useful,...useful];
    const id=pool[draw(pool.length)];
    const upgrade=useful.includes(id);
    return {id,misses:upgrade?0:Math.min(MAX_LOOT_MISSES,misses+Number(useful.length>0)),useful:upgrade};
  }
  const fitting=partialStacks?table.materials.filter(id=>partialStacks.has(id)):[];
  const pool=fitting.length?fitting:table.materials;
  const id=pool[draw(pool.length)];
  return {id,misses:Math.min(MAX_LOOT_MISSES,misses+Number(useful.length>0)),useful:false};
}
