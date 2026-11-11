import { ATLAS_MAPS, FRONTIER_SPAWNS, RIFT_WARDEN } from "./WorldAtlas.js";
import { TEMPLE_CAMPS, TEMPLE_ID } from "./TempleMap.js";
import { getWorldMap, groundAt, isSafeWorldPoint, isWorldSegmentClear, SHRINE_GUARDIAN, FOREST_CAMPS } from "./WorldMaps.js";
import { REGIONAL_BOSSES } from "./RegionalBosses.js";

type Stage=Readonly<{camp:string;prefix:string}>;
type Definition=Readonly<{name:string;camp:string;levels:string;mapId:string;goal:number;prefix?:string;stages?:readonly Stage[];
  kind?:"delivery"|"elite"|"defense"|"escort";destinationMapId?:string;destinationName?:string;targetId?:string;rewardLevel?:number;
  defense?:Readonly<{x:number;z:number;radius:number}>;escort?:Readonly<{x:number;z:number;radius:number}>}>;
const forest="forbidden_forest";
const forestObjectives:Record<string,Definition>={
  west:{name:"ลาดตระเวนชายป่า",camp:"ชายป่ากระซิบ",levels:"Lv.1–4",mapId:forest,prefix:"forest_west_",goal:8},
  east:{name:"สยบเงารากไม้",camp:"ดงรากอาคม",levels:"Lv.4–7",mapId:forest,prefix:"forest_east_",goal:8},
  deep_west:{name:"สำรวจค่ายเงาไม้",camp:"ค่ายเงาไม้",levels:"Lv.7–10",mapId:forest,prefix:"forest_deep_west_",goal:8},
  deep_east:{name:"ปกป้องดงวิญญาณ",camp:"ดงวิญญาณ",levels:"Lv.9–12",mapId:forest,prefix:"forest_deep_east_",goal:8},
  trail:{name:"สำรวจเส้นทางสี่ค่าย",camp:"ชายป่าไปดงวิญญาณ",levels:"Lv.9–12",mapId:forest,goal:4,stages:[
    {camp:"ชายป่ากระซิบ",prefix:"forest_west_"},{camp:"ดงรากอาคม",prefix:"forest_east_"},
    {camp:"ค่ายเงาไม้",prefix:"forest_deep_west_"},{camp:"ดงวิญญาณ",prefix:"forest_deep_east_"}]},
};
const range=(levels:readonly number[])=>`Lv.${Math.min(...levels)}–${Math.max(...levels)}`;
for(const [mapId,map] of Object.entries(ATLAS_MAPS))for(const [index,camp] of (map.camps ?? []).entries()){
  const id=`atlas_${mapId}_${index+1}`;
  forestObjectives[id]={name:`ภารกิจ${camp.name}`,camp:camp.name,levels:range(camp.levels),mapId,prefix:`${id}_`,goal:8};
}
for(const camp of TEMPLE_CAMPS){
  const id=`temple_${camp.id}`;
  forestObjectives[id]={name:`ภารกิจ${camp.name}`,camp:camp.name,levels:range(camp.levels),mapId:TEMPLE_ID,prefix:`${id}_`,goal:8};
}
for(const spawn of FRONTIER_SPAWNS){
  const prefix=spawn.id.replace(/\d+$/,""),id=prefix.slice(0,-1);
  const matching=FRONTIER_SPAWNS.filter(item=>item.id.startsWith(prefix));
  forestObjectives[id]={name:`ลาดตระเวน${spawn.name}`,camp:spawn.name,levels:range(matching.map(item=>item.level)),mapId:spawn.mapId,prefix,goal:8};
}
// Keep optional-map objectives readable even if a later server disables that map.
for(const [mapId,group,name,levels] of [
  ["twin_neck_pass",1,"ผีพรานเชิงเขา","Lv.29–36"],["twin_neck_pass",2,"พรายสันผา","Lv.41–53"],
  ["tri_wiang_castle",1,"เงาพลเสบียง","Lv.59–64"],["tri_wiang_castle",2,"วิญญาณไพร่แนวล้อม","Lv.68–73"],
] as const){
  const id=`frontier_${mapId}_${group}`;
  if(!forestObjectives[id])forestObjectives[id]={name:`ลาดตระเวน${name}`,camp:name,levels,mapId,prefix:`${id}_`,goal:8};
}
// Multi-camp patrols require two eligible kills at each of three distinct camps.
for(const mapId of [TEMPLE_ID,...Object.keys(ATLAS_MAPS)]){
  const camps=Object.values(forestObjectives).filter(def=>def.mapId===mapId && def.prefix);
  if(camps.length<2)continue;
  const picks=camps.length>=3?[camps[0],camps[Math.floor(camps.length/2)],camps[camps.length-1]]:camps;
  const stages=picks.flatMap(camp=>[{camp:camp.camp,prefix:camp.prefix!},{camp:camp.camp,prefix:camp.prefix!}]);
  forestObjectives[`patrol_${mapId}`]={name:"ลาดตระเวนหลายค่าย",camp:picks.map(c=>c.camp).join(" → "),levels:picks.map(c=>c.levels).join(" / "),mapId,goal:stages.length,stages};
}
// Defense pressure comes from living camp monsters while a player is guarding
// its supplies. Defeating the camp's enemies reduces that pressure.
for(const [mapId,camps] of [[forest,FOREST_CAMPS],[TEMPLE_ID,TEMPLE_CAMPS],...Object.entries(ATLAS_MAPS).map(([id,map])=>[id,map.camps ?? []] as const)] as const){
  const camp=camps[0],local=Object.values(forestObjectives).find(def=>def.mapId===mapId && def.prefix && !def.kind);
  if(!camp || !local)continue;
  forestObjectives[`defense_${mapId}`]={name:`ป้องกันเสบียง${camp.name}`,camp:camp.name,levels:local.levels,mapId,goal:6,
    prefix:local.prefix,kind:"defense",defense:{x:camp.x,z:camp.z,radius:14}};
  forestObjectives[`escort_${mapId}`]={name:`คุ้มกันผู้เดินทางไป${camp.name}`,camp:camp.name,levels:local.levels,mapId,goal:1,
    kind:"escort",escort:{x:camp.x,z:camp.z,radius:5},rewardLevel:camp.levels[0]};
}
// Each route starts with an actual local hunt and finishes at a ranger in the
// directly connected map; no portable button can pay the reward.
for(const [from,to] of [
  [forest,TEMPLE_ID],[TEMPLE_ID,"moon_cemetery"],["drowned_marsh","moon_cemetery"],
  ["moon_cemetery","bamboo_frontier"],["bamboo_frontier","moon_cemetery"],
  ["hex_ridge","naga_cavern"],["naga_cavern","hex_ridge"],["lotus_basin","river_watch"],
  ["fallen_city","asura_peak"],["asura_peak","fallen_city"],["spirit_rift","asura_peak"],
  ["moon_pass","moon_cemetery"],["river_watch","fallen_city"],["sam_lan_estuary","river_watch"],
] as const){
  const local=Object.values(forestObjectives).find(def=>def.mapId===from && def.prefix && !def.kind);
  if(!local)continue;
  const destination=ATLAS_MAPS[to]?.name ?? (to===TEMPLE_ID?"วัดร้างพันธนาการ":to);
  forestObjectives[`delivery_${from}_${to}`]={name:`ส่งเสบียงไป${destination}`,camp:local.camp,levels:local.levels,mapId:from,
    goal:5,prefix:local.prefix,kind:"delivery",destinationMapId:to,destinationName:destination,rewardLevel:Number(local.levels.match(/\d+/)?.[0] ?? 1)};
}
forestObjectives.elite_forest_shrine={name:`ปราบ${SHRINE_GUARDIAN.name}`,camp:"ศาลร้างในป่าต้องห้าม",levels:"Lv.12",mapId:forest,goal:1,kind:"elite",targetId:SHRINE_GUARDIAN.id};
for(const boss of REGIONAL_BOSSES)if(!forestObjectives[`elite_${boss.mapId}`])forestObjectives[`elite_${boss.mapId}`]={name:`ปราบ${boss.name}`,camp:boss.name,levels:`Lv.${boss.level}`,mapId:boss.mapId,goal:1,kind:"elite",targetId:boss.id};
forestObjectives.elite_spirit_rift={name:`ปราบ${RIFT_WARDEN.name}`,camp:RIFT_WARDEN.name,levels:`Lv.${RIFT_WARDEN.level}`,mapId:"spirit_rift",goal:1,kind:"elite",targetId:RIFT_WARDEN.id};
export const FOREST_OBJECTIVES:Readonly<Record<string,Definition>>=Object.freeze(forestObjectives);
export const FOREST_RANGER = Object.freeze({mapId:forest,x:3,y:0,z:12,radius:3,name:"นายพรานเฝ้าป่า"});
export type ForestObjectiveId=string;
export type ForestObjective={id:ForestObjectiveId;progress:number;directorEventId?:string};
type ObjectiveRanger={mapId:string;x:number;y:number;z:number;radius:number;name:string};
const rangerCache=new Map<string,ObjectiveRanger|null>();

/** Place the quest giver on an accessible route near the first hunting area. */
export function objectiveRanger(mapId:string):ObjectiveRanger|null {
  if(rangerCache.has(mapId)){const value=rangerCache.get(mapId);return value?{...value}:null;}
  const value=chooseObjectiveRanger(mapId);rangerCache.set(mapId,value);return value?{...value}:null;
}
function chooseObjectiveRanger(mapId:string):ObjectiveRanger|null {
  if(!Object.values(FOREST_OBJECTIVES).some(def=>def.mapId===mapId))return null;
  const map=getWorldMap(mapId);if(!map)return null;
  const camps=map.camps?.length?map.camps:FRONTIER_SPAWNS.filter(item=>item.mapId===mapId);
  const first=camps[0];
  if(first){
    const candidates:{x:number;y:number;z:number;score:number}[]=[];
    for(const path of map.paths ?? [])for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i];
      for(const t of [.25,.5,.75,1]){
        const x=Math.round((a.x+(b.x-a.x)*t)*100)/100,z=Math.round((a.z+(b.z-a.z)*t)*100)/100,y=groundAt(mapId,x,z),point={x,y,z};
        const distance=Math.hypot(first.x-x,first.z-z);
        if(distance<9 || distance>28 || camps.some(c=>Math.hypot(c.x-x,c.z-z)<8) || map.portals.some(p=>Math.hypot(p.x-x,p.z-z)<7) ||
          !isSafeWorldPoint(map,point) || !isWorldSegmentClear(mapId,point,a))continue;
        candidates.push({...point,score:Math.abs(distance-13)});
      }
    }
    candidates.sort((a,b)=>a.score-b.score || a.x-b.x || a.z-b.z);
    if(candidates.length){const {x,y,z}=candidates[0];return {mapId,x,y,z,radius:3,name:mapId===forest?FOREST_RANGER.name:mapId===TEMPLE_ID?"ผู้ดูแลหน้าวัด":`ผู้ดูแล${map.name}`};}
  }
  const area=map.restAreas?.find(rest=>map.portals.every(p=>Math.hypot(rest.x-p.x,rest.z-p.z)>8)) ?? map.restAreas?.[0] ?? map.spawn;
  for(const [dx,dz] of [[3,0],[-3,0],[0,-3],[0,3],[2,0],[-2,0]] as const){
    const x=area.x+dx,z=area.z+dz,y=groundAt(mapId,x,z);
    if(isSafeWorldPoint(map,{x,y,z}) && map.portals.every(portal=>Math.hypot(portal.x-x,portal.z-z)>2))
      return {mapId,x,y,z,radius:3,name:mapId===TEMPLE_ID?"ผู้ดูแลหน้าวัด":`ผู้ดูแล${map.name}`};
  }
  return null;
}
export function objectiveAvailable(id:string):boolean {
  const def=FOREST_OBJECTIVES[id],map=def && getWorldMap(def.mapId);if(!def || !map)return false;
  if(def.kind==="delivery")return !!def.destinationMapId && !!getWorldMap(def.destinationMapId) &&
    map.portals.some(portal=>portal.targetMapId===def.destinationMapId) && !!objectiveRanger(def.destinationMapId);
  if(def.kind==="elite")return map.guardian?.id===def.targetId || map.boss?.id===def.targetId;
  return true;
}
export function parseForestObjectiveId(value:unknown):ForestObjectiveId|null {
  return typeof value==="string" && Object.hasOwn(FOREST_OBJECTIVES,value) ? value : null;
}
export function validateForestObjective(value:unknown):ForestObjective {
  if(!value || typeof value!=="object" || Array.isArray(value))throw Error("invalid_forest_objective");
  const input=value as Record<string,unknown>,id=parseForestObjectiveId(input.id);
  if(Object.keys(input).some(key=>!["id","progress","directorEventId"].includes(key)) || !id || !Number.isInteger(input.progress) ||
     (input.directorEventId!==undefined && (typeof input.directorEventId!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(input.directorEventId))) ||
     (input.progress as number)<0 || (input.progress as number)>=FOREST_OBJECTIVES[id].goal)throw Error("invalid_forest_objective");
  return {id,progress:input.progress as number,...(typeof input.directorEventId==="string"?{directorEventId:input.directorEventId}:{})};
}
export function advanceForestObjective(active:ForestObjective|null,monsterId:string,mapId:string):{active:ForestObjective|null;completed:ForestObjectiveId|null} {
  if(!active)return {active:null,completed:null};
  const objective=validateForestObjective(active),definition=FOREST_OBJECTIVES[objective.id];
  if(definition.kind==="escort")return {active:objective,completed:null};
  if(definition.kind==="elite")return mapId===definition.mapId && monsterId===definition.targetId
    ? {active:null,completed:objective.id} : {active:objective,completed:null};
  if(definition.kind==="delivery" && objective.progress>=definition.goal-1)return {active:objective,completed:null};
  const prefix=definition.stages?.[objective.progress]?.prefix ?? definition.prefix;
  if(mapId!==definition.mapId || !prefix || !monsterId.startsWith(prefix) || !/^[1-4]$/.test(monsterId.slice(prefix.length)))return {active:objective,completed:null};
  const progress=objective.progress+1;
  return progress>=definition.goal && definition.kind!=="delivery" ? {active:null,completed:objective.id} : {active:{...objective,progress},completed:null};
}
