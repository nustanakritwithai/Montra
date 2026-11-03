import { ATLAS_MAPS, FRONTIER_SPAWNS } from "./WorldAtlas.js";
import { TEMPLE_CAMPS, TEMPLE_ID } from "./TempleMap.js";
import { getWorldMap, groundAt, isSafeWorldPoint } from "./WorldMaps.js";

type Stage=Readonly<{camp:string;prefix:string}>;
type Definition=Readonly<{name:string;camp:string;levels:string;mapId:string;goal:number;prefix?:string;stages?:readonly Stage[]}>;
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
export const FOREST_OBJECTIVES:Readonly<Record<string,Definition>>=Object.freeze(forestObjectives);
export const FOREST_RANGER = Object.freeze({mapId:forest,x:3,y:0,z:12,radius:3,name:"นายพรานเฝ้าป่า"});
export type ForestObjectiveId=string;
export type ForestObjective={id:ForestObjectiveId;progress:number};

/** NPCs stand at safe entrances of maps that actually have objectives. */
export function objectiveRanger(mapId:string) {
  if(mapId===forest){const map=getWorldMap(mapId);if(!map)return null;const y=groundAt(mapId,FOREST_RANGER.x,FOREST_RANGER.z);return {...FOREST_RANGER,y};}
  if(!Object.values(FOREST_OBJECTIVES).some(def=>def.mapId===mapId))return null;
  const map=getWorldMap(mapId);if(!map)return null;
  const area=map.restAreas?.[0] ?? map.spawn;
  for(const [dx,dz] of [[3,0],[-3,0],[0,-3],[0,3],[2,0],[-2,0]] as const){
    const x=area.x+dx,z=area.z+dz,y=groundAt(mapId,x,z);
    if(isSafeWorldPoint(map,{x,y,z}) && map.portals.every(portal=>Math.hypot(portal.x-x,portal.z-z)>2))
      return {mapId,x,y,z,radius:3,name:mapId===TEMPLE_ID?"ผู้ดูแลหน้าวัด":`ผู้ดูแล${map.name}`};
  }
  return null;
}
export function parseForestObjectiveId(value:unknown):ForestObjectiveId|null {
  return typeof value==="string" && Object.hasOwn(FOREST_OBJECTIVES,value) ? value : null;
}
export function validateForestObjective(value:unknown):ForestObjective {
  if(!value || typeof value!=="object" || Array.isArray(value))throw Error("invalid_forest_objective");
  const input=value as Record<string,unknown>,id=parseForestObjectiveId(input.id);
  if(Object.keys(input).sort().join(",")!=="id,progress" || !id || !Number.isInteger(input.progress) ||
     (input.progress as number)<0 || (input.progress as number)>=FOREST_OBJECTIVES[id].goal)throw Error("invalid_forest_objective");
  return {id,progress:input.progress as number};
}
export function advanceForestObjective(active:ForestObjective|null,monsterId:string,mapId:string):{active:ForestObjective|null;completed:ForestObjectiveId|null} {
  if(!active)return {active:null,completed:null};
  const objective=validateForestObjective(active),definition=FOREST_OBJECTIVES[objective.id];
  const prefix=definition.stages?.[objective.progress]?.prefix ?? definition.prefix;
  if(mapId!==definition.mapId || !prefix || !monsterId.startsWith(prefix) || !/^[1-4]$/.test(monsterId.slice(prefix.length)))return {active:objective,completed:null};
  const progress=objective.progress+1;
  return progress>=definition.goal ? {active:null,completed:objective.id} : {active:{...objective,progress},completed:null};
}
