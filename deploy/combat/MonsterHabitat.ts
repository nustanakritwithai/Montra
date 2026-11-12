import type { Vec2 } from "./GameRules.js";
import { groundSample, waterDepthAt } from "./GroundTerrain.js";
import { groundAt, walkBridgeAt, walkBridgeTransitionClear, type WorldMapDefinition } from "./WorldMaps.js";

export type MonsterHabitat = "land" | "water";

export function monsterHabitatAllows(map:WorldMapDefinition, habitat:MonsterHabitat, point:Vec2):boolean {
  if(habitat==="land" && walkBridgeAt(map,point.x,point.z))return true;
  return (waterDepthAt(map,point.x,point.z)>0) === (habitat==="water");
}

export function monsterHabitatHeight(map:WorldMapDefinition, habitat:MonsterHabitat, point:Vec2):number {
  if(habitat==="water" && map.waterLevel!==undefined)return map.waterLevel;
  if(walkBridgeAt(map,point.x,point.z))return groundAt(map.id,point.x,point.z);
  return map.terrain ? groundSample(map.terrain,point.x,point.z).height : 0;
}

export function monsterHabitatSegmentClear(map:WorldMapDefinition, habitat:MonsterHabitat, from:Vec2, to:Vec2):boolean {
  if(habitat==="land" && !walkBridgeTransitionClear(map,from,to.x,to.z))return false;
  if(map.waterLevel===undefined || !map.water?.length)return habitat==="land";
  const minX=Math.min(from.x,to.x),maxX=Math.max(from.x,to.x);
  const minZ=Math.min(from.z,to.z),maxZ=Math.max(from.z,to.z);
  if(habitat==="land" && !map.water.some(area=>
    minX<=area.x+area.width && maxX>=area.x && minZ<=area.z+area.length && maxZ>=area.z))return true;
  const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.5));
  for(let i=0;i<=steps;i++){
    const t=i/steps,point={x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t};
    if(!monsterHabitatAllows(map,habitat,point))return false;
  }
  return true;
}

// A target across the shore can still be approached up to the edge of the habitat.
export function monsterHabitatGoal(map:WorldMapDefinition, habitat:MonsterHabitat, from:Vec2, to:Vec2):Vec2 {
  if(monsterHabitatAllows(map,habitat,to))return to;
  const steps=Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.5);
  let goal=from;
  for(let i=1;i<steps;i++){
    const t=i/steps,point={x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t};
    if(!monsterHabitatAllows(map,habitat,point))break;
    goal=point;
  }
  return goal;
}
