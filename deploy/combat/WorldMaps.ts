import {createHash} from "node:crypto";
/** MONTRA V0.2.8: declarative world geometry. No client coordinates are trusted. */
import { isFlightAltitude, isOnGround, isOnPlatform, isOnTop, touchesWallBody, wallBlocksShot, rayHitsBox } from "./HeightRules.js";
import { groundSample, terrainRayClear, waterTerrain, RIDGE_ENABLED, RIDGE_PASS, makeRidgePass, type GroundTerrain } from "./GroundTerrain.js";
import { TEMPLE_ID, TEMPLE_GATE, TEMPLE_MAP } from "./TempleMap.js";
import { ATLAS_MAPS, BOSS_RESPAWN_MS, MARSH_GATE, atlasPortals } from "./WorldAtlas.js";
import {regionalBossOn} from "./RegionalBosses.js";
import { originalRelief } from "./AtlasRelief.js";
import { addWaterways, type BoatHarbor, type BoatLane, type BoatPort, type WaterGate } from "./PirateBoatRules.js";
import { makeHubs, onRampart, type Province } from "./StrategicProvinces.js";
export type WorldWall = Readonly<{x:number;z:number;width:number;length:number;rampart?:boolean}>;
export function segmentIntersectsExpandedWall(
  a:{x:number;z:number},b:{x:number;z:number},w:WorldWall,radius:number,
):boolean {
  const minX=w.x-radius,maxX=w.x+w.width+radius;
  const minZ=w.z-radius,maxZ=w.z+w.length+radius;
  const dx=b.x-a.x,dz=b.z-a.z;
  let entry=0,exit=1;

  for(const [start,delta,low,high] of [
    [a.x,dx,minX,maxX],[a.z,dz,minZ,maxZ],
  ]) {
    if(Math.abs(delta)<1e-8) {
      if(start<low||start>high)return false;
      continue;
    }
    const t1=(low-start)/delta,t2=(high-start)/delta;
    entry=Math.max(entry,Math.min(t1,t2));
    exit=Math.min(exit,Math.max(t1,t2));
    if(entry>exit)return false;
  }
  return entry<=1&&exit>=0;
}

export type WorldPoint = Readonly<{ x: number; y: number; z: number }>;
export type WorldObstacle = Readonly<{ id: string; x: number; z: number; radius: number }>;
export type WorldPortal = Readonly<{
  id: string; x: number; z: number; targetMapId: string; targetSpawn: WorldPoint; label?:string; groundY?:number;
}>;
export type HuntCamp = Readonly<{id:string; name:string; x:number; z:number; levels:readonly number[];tier?:"strong"}>;
export type RestArea = Readonly<{x:number; z:number; radius:number; name:string}>;
export type WalkBridge = Readonly<{
  id:string; z:number; width:number; height:number; thickness:number;
  x:readonly [approachStart:number, deckStart:number, deckEnd:number, approachEnd:number];
}>;
export const WORLD_EXPANSION = process.env.MONTRA_WORLD_EXPANSION === "1";
export const SHRINE_GUARDIAN = Object.freeze({
  id: "forest_shrine_keeper", name: "ผู้พิทักษ์ศาลร้าง", level: 12,
  x: -14, z: -90, respawnMs: BOSS_RESPAWN_MS, strikeRadius: 2.8,
});
export const FOREST_CAMPS: readonly HuntCamp[] = [
  {id:"west",name:"ชายป่ากระซิบ",x:-26,z:-10,levels:[1,2,3,4]},
  {id:"east",name:"ดงรากอาคม",x:26,z:-24,levels:[4,5,6,7]},
  {id:"deep_west",name:"ค่ายเงาไม้",x:-28,z:-55,levels:[7,8,9,10]},
  {id:"deep_east",name:"ดงวิญญาณ",x:26,z:-72,levels:[9,10,11,12]},
];
export type WorldMapDefinition = Readonly<{
  id: string; name: string;
  bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
  terrain?: GroundTerrain;
  reliefLabels?: readonly {name:string;x:number;z:number}[];
  spawn: WorldPoint;
  obstacles: readonly WorldObstacle[];
  walls?: readonly WorldWall[];
  water?: readonly WorldWall[];
  waterLevel?: number;
  boatHarbor?: BoatHarbor;
  boatPorts?: readonly BoatPort[];
  boatLanes?: readonly BoatLane[];
  waterGates?: readonly WaterGate[];
  bridges?: readonly Readonly<{x:number;z:number}>[];
  walkBridges?: readonly WalkBridge[];
  huntTrail?: Province["huntTrail"];
  region?: Readonly<{range:readonly [number,number];hint:string;noFlight:boolean}>;
  portals: readonly WorldPortal[];
  restAreas?: readonly RestArea[];
  camps?: readonly HuntCamp[];
  strategic?: Province;
  guardian?: typeof SHRINE_GUARDIAN;
  boss?: Readonly<{id:string;name:string;x:number;z:number;level:number;strikeRadius:number;respawnMs:number}>;
  paths?: readonly (readonly {x:number; z:number}[])[];
}>;
export const DEFAULT_MAP_ID = "ritual_village";
export const HOME_BUILD_GRID = Object.freeze({
  originX:-5, originZ:-3.8, step:1.35, wallWidth:1.32, wallDepth:.20, wallHeight:2.1,
});

export function homeWallBlocks(cell: number, rotation: 0 | 1, point: {x:number;z:number}) {
  const grid = HOME_BUILD_GRID;
  const dx = Math.abs(point.x - (grid.originX+(cell%8)*grid.step));
  const dz = Math.abs(point.z - (grid.originZ+Math.floor(cell/8)*grid.step));
  const halfX = (rotation ? grid.wallDepth : grid.wallWidth) / 2;
  const halfZ = (rotation ? grid.wallWidth : grid.wallDepth) / 2;
  const radius = .35;
  return dx < halfX+radius && dz < halfZ+radius;
}

export const HOME_MAP: WorldMapDefinition = Object.freeze({
  id: "personal_home",
  name: "เรือนส่วนตัว",
  bounds: {minX:-10,maxX:10,minZ:-10,maxZ:10},
  spawn: {x:0,y:0,z:8},
  obstacles: [],
  portals: [],
  restAreas: [{x:0,z:0,radius:15,name:"เขตเรือนส่วนตัว"}],
  region: {range:[1,100] as const,hint:"จัดเรือน ปลูกสมุนไพร หรือทำอาหารจากเมนูเรือนส่วนตัว",noFlight:true},
});

export function homeMapId(character: string) { return "personal_home_" + createHash("sha256").update("home:"+character).digest("hex").slice(0,32); }
export function isHomeMap(mapId: string) { return /^personal_home_[a-f0-9]{32}$/.test(mapId); }
// The expanded village (120 m square). The canal quarter, shrine and skill training stay at the
// centre; the temple court lies north toward the gates, the market east, rice fields west, and the
// training ground and old graves (level 1 ghosts) along the river to the south.
export const VILLAGE_LAYOUT = Object.freeze({
  temple:{x:0,z:-40}, market:{x:40,z:-4}, fields:{x:-40,z:-8}, training:{x:-34,z:34}, graves:{x:38,z:38},
  forestGate:{x:-10,z:-56}, cityGate:{x:10,z:-56},
});
export const VILLAGE_RIVER: WorldWall = {x:-80,z:48,width:160,length:40};
export const VILLAGE_WATERS:readonly WorldWall[] = [
  VILLAGE_RIVER,{x:-19.7,z:-26,width:11.2,length:74},{x:8.5,z:-26,width:11.2,length:74},
  {x:-50,z:-50,width:14,length:10},
];
// Solid village buildings (boxes). Shared by the server collision and the client models.
export const VILLAGE_BUILDINGS: readonly WorldWall[] = [
  {x:-6,z:-52,width:12,length:7},                                   // ordination hall (ubosot)
  {x:-19.5,z:-45.5,width:5,length:5}, {x:15,z:-45,width:4,length:4}, // chedi and bell tower
  {x:46,z:-14,width:6,length:5}, {x:46,z:2,width:6,length:5},        // market hall and smithy
  {x:28,z:-22,width:5,length:4}, {x:28,z:14,width:5,length:4},       // market storehouses
  {x:-52,z:-30,width:5,length:5}, {x:-52,z:14,width:5,length:5}, {x:-28,z:-36,width:4,length:4}, // farm huts
];
// One starting position per world-room seat, inside the village rest area.
export const VILLAGE_ARRIVALS = [
  {x:0,z:0}, {x:2,z:0}, {x:4,z:0}, {x:6,z:0},
  {x:-2,z:0}, {x:-4,z:0}, {x:0,z:2}, {x:2,z:2}, {x:-2,z:2}, {x:0,z:-2},
] as const;
export const WORLD_ROOM_CAPACITY = VILLAGE_ARRIVALS.length;
const maps: Record<string,WorldMapDefinition>={
  ...(WORLD_EXPANSION ? {[TEMPLE_ID]:TEMPLE_MAP,...ATLAS_MAPS,...makeHubs(atlasPortals), ...(RIDGE_ENABLED?{[RIDGE_PASS]:makeRidgePass(atlasPortals(RIDGE_PASS))}:{})} : {}),
  ritual_village: {
    id: "ritual_village", name: "หมู่บ้านอาคม",
    bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
    spawn: { x: 0, y: 0, z: 0 },
    water: WORLD_EXPANSION ? VILLAGE_WATERS : undefined,
    walkBridges: WORLD_EXPANSION ? [{id:"market_bridge",x:[0,8.2,29.3,39],z:-4,width:4.4,height:3.55,thickness:.25}] : undefined,
    paths: WORLD_EXPANSION ? [
      [{x:0,z:0},{x:0,z:-32},{x:0,z:-39}],
      [{x:39,z:-4},{x:42.5,z:-4},{x:42.5,z:9},{x:50,z:15},{x:54,z:24},{x:54,z:39},{x:52,z:43},{x:49,z:46}],
      [{x:-34,z:35},{x:-42,z:38},{x:-49,z:43},{x:-49,z:46}],
      [{x:54,z:29},{x:49,z:33},{x:43,z:36}],
    ] : undefined,
    walls: VILLAGE_BUILDINGS,
    obstacles: [
      ...[[-38,30],[-34,30],[-30,30],[-38,38],[-30,38]].map(([x,z],i)=>({id:"training-dummy-"+(i+1),x,z,radius:.45})),
      ...[[32,32],[44,30],[30,44],[46,42],[38,48]].map(([x,z],i)=>({id:"old-stupa-"+(i+1),x,z,radius:.8})),
      {id:"temple-bodhi",x:12,z:-36,radius:1.2},
    ],
    restAreas: WORLD_EXPANSION ? [{x:0,z:0,radius:6,name:"ลานพักและตลาดอาคม"},
      {x:VILLAGE_LAYOUT.forestGate.x,z:VILLAGE_LAYOUT.forestGate.z+1,radius:3,name:"ประตูป่า"},{x:VILLAGE_LAYOUT.cityGate.x,z:VILLAGE_LAYOUT.cityGate.z+1,radius:3,name:"ประตูนคร"},
      {...VILLAGE_LAYOUT.temple,radius:8,name:"ลานวัดอาคม"},{...VILLAGE_LAYOUT.market,radius:9,name:"ตลาดริมคลอง"},
      {...VILLAGE_LAYOUT.training,radius:7,name:"ลานฝึกยุทธ์"}] : [],
    portals: [{ id: "village_to_forest", x: VILLAGE_LAYOUT.forestGate.x, z: VILLAGE_LAYOUT.forestGate.z,
      targetMapId: "forbidden_forest", targetSpawn: { x: 0, y: 0, z: 12 } },...(WORLD_EXPANSION?atlasPortals(DEFAULT_MAP_ID):[])],
  },
  forbidden_forest: {
    id: "forbidden_forest", name: "ป่าต้องห้าม",
    bounds: WORLD_EXPANSION ? {minX:-60,maxX:60,minZ:-100,maxZ:20} : {minX:-20,maxX:20,minZ:-20,maxZ:20},
    spawn: { x: 0, y: 0, z: 12 },
    restAreas: WORLD_EXPANSION ? [{x:0,z:12,radius:6,name:"ศาลพักชายป่า"}, {x:TEMPLE_GATE.x,z:TEMPLE_GATE.z,radius:3,name:"ซุ้มประตูวัด"}, {...MARSH_GATE,radius:3.5,name:"ท่าน้ำบึงพราย"}] : [],
    camps: WORLD_EXPANSION ? FOREST_CAMPS : [],
    guardian: WORLD_EXPANSION ? SHRINE_GUARDIAN : undefined,
    paths: WORLD_EXPANSION ? [
      [{x:0,z:14},{x:0,z:0},{x:-8,z:1},{x:-12,z:-1},{x:-20,z:-3},{x:-26,z:-10},{x:-28,z:-55},{x:-19,z:-67},{x:-4,z:-73},{x:0,z:-88}],
      [{x:0,z:0},{x:7,z:-3},{x:13,z:-9},{x:19,z:-10},{x:26,z:-24},{x:26,z:-72},{x:0,z:-88}],
      [{x:-26,z:-10},{x:0,z:-30},{x:26,z:-24}],
      [{x:-28,z:-55},{x:0,z:-46},{x:26,z:-72}],
      [{x:0,z:-88},{x:SHRINE_GUARDIAN.x,z:SHRINE_GUARDIAN.z}],
      [{x:-28,z:-55},{x:-37,z:-70},TEMPLE_GATE],
      [{x:26,z:-72},{x:38,z:-80},MARSH_GATE],
    ] : [],
    obstacles: [
      { id: "tree-west-1", x: -6, z: 6, radius: 1.4 },
      { id: "tree-east-1", x: 7, z: 7, radius: 1.4 },
      { id: "tree-west-2", x: -15, z: -15, radius: 1.4 },
      { id: "tree-west-3", x: -16, z: -8, radius: 1.4 },
      { id: "tree-west-4", x: -14, z: 2, radius: 1.4 },
      { id: "tree-west-5", x: -15, z: 12, radius: 1.4 },
      { id: "tree-east-2", x: 15, z: -15, radius: 1.4 },
      { id: "tree-east-3", x: 15, z: -5, radius: 1.4 },
      { id: "tree-east-4", x: 15, z: 3, radius: 1.4 },
      { id: "tree-east-5", x: 15, z: 14, radius: 1.4 },
      { id: "stone-north-1", x: 5, z: -9, radius: 1.8 },
      { id: "stone-west-1", x: -9, z: -3, radius: 1.5 },
      ...(WORLD_EXPANSION ? [
        {id:"temple-post-left",x:TEMPLE_GATE.x-3.6,z:TEMPLE_GATE.z,radius:.75},
        {id:"temple-post-right",x:TEMPLE_GATE.x+3.6,z:TEMPLE_GATE.z,radius:.75},
        {id:"camp-west",x:-37.5,z:-10,radius:1.6}, {id:"camp-east",x:37.5,z:-24,radius:1.8},
        {id:"camp-deep_west",x:-39.5,z:-55,radius:1.6}, {id:"camp-deep_east",x:37.5,z:-72,radius:1.7},
        ...[[-44,-9],[-42,-20],[43,-24],[40,-37],[-43,-52],[-44,-65],[41,-71],[42,-84],
          [8,-43],[-7,-58],[-46,-89],[46,-2]].map(([x,z],index)=>({id:"grove-"+index,x,z,radius:1.15})),
        {id:"north-grove-1",x:-49,z:-35,radius:2},
        {id:"north-grove-2",x:48,z:-51,radius:2},
        {id:"north-stone",x:8,z:-62,radius:2.2},
        {id:"west-stone",x:-8,z:-76,radius:1.8},
      ] : []),
    ],
    portals: [{ id: "forest_to_village", x: 0, z: 14,
      targetMapId: "ritual_village", targetSpawn: { x: VILLAGE_LAYOUT.forestGate.x, y: 0, z: VILLAGE_LAYOUT.forestGate.z+2 } },
      ...(WORLD_EXPANSION ? [{id:"forest_to_temple",...TEMPLE_GATE,targetMapId:TEMPLE_ID,targetSpawn:TEMPLE_MAP.spawn},...atlasPortals("forbidden_forest")] : [])],
  },
};
export const WORLD_MAPS:Readonly<Record<string,WorldMapDefinition>>=Object.freeze(Object.fromEntries(Object.entries(maps).map(([id,map])=>{
  if(!WORLD_EXPANSION)return [id,map];
  const reliefMap=id===DEFAULT_MAP_ID?{...map,water:[VILLAGE_RIVER]}:map;
  const raised=addWaterways({...map,...originalRelief(reliefMap)},maps);
  const world={...raised,...waterTerrain(raised)},boss=regionalBossOn(id);
  if(boss){
    const {id:bossId,name,level,x,z,strikeRadius,respawnMs}=boss;
    world.boss={id:bossId,name,level,x,z,strikeRadius,respawnMs};
  }
  return [id,world];
})));
export function getWorldMap(mapId: string): WorldMapDefinition | undefined {
  if (mapId === HOME_MAP.id || isHomeMap(mapId)) return HOME_MAP;
  return Object.prototype.hasOwnProperty.call(WORLD_MAPS, mapId) ? WORLD_MAPS[mapId] : undefined;
}
/** Rest zones protect actors at every height, including flying attackers. */
export function isRestArea(mapId: string, point: {x:number; z:number}): boolean {
  const map=getWorldMap(mapId);
  if(!map)return false;
  if(map.strategic?.kind==="capital")return true;
  for(const index of map.strategic?.safeRoads ?? []){
    const path=map.paths![index];
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(dx*dx+dz*dz)));
      if(Math.hypot(point.x-a.x-t*dx,point.z-a.z-t*dz)<=3)return true;
    }
  }
  return map.restAreas?.some(a=>Math.hypot(point.x-a.x,point.z-a.z)<=a.radius) ?? false;
}
export function walkBridgeAt(map:WorldMapDefinition|undefined,x:number,z:number){
  return map?.walkBridges?.find(bridge=>x>=bridge.x[0] && x<=bridge.x[3] && Math.abs(z-bridge.z)<=bridge.width/2);
}
function walkSurface(map:WorldMapDefinition|undefined,x:number,z:number){
  const bridge=walkBridgeAt(map,x,z);
  if(bridge){
    const [start,left,right,end]=bridge.x;
    if(x<left)return {height:bridge.height*(x-start)/(left-start),grade:bridge.height/(left-start)};
    if(x>right)return {height:bridge.height*(end-x)/(end-right),grade:bridge.height/(end-right)};
    return {height:bridge.height,grade:0};
  }
  return map?.terrain?groundSample(map.terrain,x,z):{height:0,grade:0};
}
export function groundAt(mapId:string,x:number,z:number){
  return walkSurface(getWorldMap(mapId),x,z).height;
}
export function walkBridgeTransitionClear(map:WorldMapDefinition,from:{x:number;z:number},x:number,z:number){
  for(const bridge of map.walkBridges??[])for(const side of [-1,1]){
    const edge=bridge.z+side*bridge.width/2;
    if(((from.z-edge)*side>0)===((z-edge)*side>0))continue;
    const at=from.x+(x-from.x)*(edge-from.z)/(z-from.z);
    if(at<bridge.x[0] || at>bridge.x[3])continue;
    const bed=map.terrain?groundSample(map.terrain,at,edge).height:0;
    if(walkSurface(map,at,edge).height-bed>.4)return false;
  }
  return true;
}
export function surfaceLayer(p:{mapId:string;x:number;y:number;z:number}){return p.y-groundAt(p.mapId,p.x,p.z);}
export function onMapGround(p:{mapId:string;x:number;y:number;z:number}){return isOnGround(surfaceLayer(p));}
type Feet={x:number;z:number;y?:number};
type ClosedGates=boolean|ReadonlySet<string>;
export function meleeHeightBlocked(a:WorldPoint & {mapId:string},b:WorldPoint & {mapId:string},range:number){
  // A walkable slope can close an absolute height gap. A separate deck or flight layer cannot.
  return Math.abs(a.y-b.y)>range && Math.abs(surfaceLayer(a)-surfaceLayer(b))>range;
}
export function isWorldSegmentClear(mapId:string,from:Feet,to:Feet,closedGates:ClosedGates=false):boolean {
  const map=getWorldMap(mapId);if(!map)return false;
  const body=(p:Feet)=>({x:p.x,z:p.z,y:(p.y??groundAt(mapId,p.x,p.z))+1});
  return provinceShotClear(map,body(from),body(to),closedGates) &&
    (!map.strategic?.rampart || clearOfObstacles(map,from,to));
}
function clearOfObstacles(map:WorldMapDefinition,from:Feet,to:Feet){
  const dx=to.x-from.x,dz=to.z-from.z,length=dx*dx+dz*dz;
  return map.obstacles.every(o=>{
    const t=length>0?Math.max(0,Math.min(1,((o.x-from.x)*dx+(o.z-from.z)*dz)/length)):0;
    return Math.hypot(o.x-from.x-t*dx,o.z-from.z-t*dz)>o.radius;
  });
}
export function provinceShotClear(map:WorldMapDefinition,from:WorldPoint,to:WorldPoint,closedGate:ClosedGates=false):boolean{
  const r=map.strategic?.rampart;
  if(map.terrain && !terrainRayClear(map.terrain,from,to))return false;
  if(map.walkBridges?.some(b=>rayHitsBox(from,to,{x:b.x[1],y:b.height-b.thickness,z:b.z-b.width/2},
    {x:b.x[2],y:b.height,z:b.z+b.width/2})))return false;
  if(map.id===DEFAULT_MAP_ID)return !wallBlocksShot(from,to);
  if(!WORLD_EXPANSION)return true;
  if(!r)return !map.walls?.some(w=>segmentIntersectsExpandedWall(from,to,w,0)) && clearOfObstacles(map,from,to);
  const hits=(b:WorldWall,base:number,top:number)=>{
    const y=map.terrain?groundSample(map.terrain,b.x+b.width/2,b.z+b.length/2).height:0;
    return rayHitsBox(from,to,{x:b.x,z:b.z,y:y+base},{x:b.x+b.width,z:b.z+b.length,y:y+top});
  };
  // The empty passage under each lintel is distinct from the solid deck above it.
  if(map.walls?.some(b=>hits(b,0,b.rampart?r.height:3.4)))return false;
  if(r.gates.some((g,i)=>hits(g.box,(typeof closedGate==="boolean"?i===0 && closedGate:closedGate.has(g.id))?0:r.height-.55,r.height)))return false;
  return true;
}
export function isSafeWorldPoint(map: WorldMapDefinition, point: WorldPoint, radius = 0.4): boolean {
  if (![point.x, point.y, point.z, radius].every(Number.isFinite) || radius < 0) return false;
  if (point.x - radius < map.bounds.minX || point.x + radius > map.bounds.maxX ||
      point.z - radius < map.bounds.minZ || point.z + radius > map.bounds.maxZ) return false;
  if(map.terrain){
    const surface=walkSurface(map,point.x,point.z);
    const offset=point.y-surface.height;
    if(isOnGround(offset)){
      if(surface.grade>map.terrain.maxGrade)return false;
      point={x:point.x,z:point.z,y:0};
    }else if(isOnPlatform(offset) && (map.strategic?.rampart || map.id===DEFAULT_MAP_ID))point={x:point.x,z:point.z,y:offset};
    else if(!map.region?.noFlight && isFlightAltitude(offset))point={x:point.x,z:point.z,y:offset};
    else return false;
  }
  const rampart=map.strategic?.rampart;
  if(rampart && isOnPlatform(point.y))return onRampart(rampart,point.x,point.z);
  // A saved height must be an actual walkable level, not just a finite number.
  // Only the village owns the existing watchwall and its elevated crest.
  if (map.id === DEFAULT_MAP_ID) {
    if (isOnGround(point.y)) {
      if (touchesWallBody(point.x, point.z, radius)) return false;
    } else if (isOnPlatform(point.y)) {
      if (!isOnTop(point.x, point.z)) return false;
    } else if (!isFlightAltitude(point.y)) return false;
  } else if (!isOnGround(point.y) && !isFlightAltitude(point.y)) return false;
  if((map.region?.noFlight || map.strategic?.kind==="territory") && !isOnGround(point.y))return false;
  if(map.walls?.some(w=>segmentIntersectsExpandedWall(point,point,w,radius)))return false;
  return map.obstacles.every(o => Math.hypot(point.x - o.x, point.z - o.z) > o.radius + radius);
}
export function getSafeMapSpawn(mapId: string, saved?: WorldPoint): WorldPoint {
  const map = getWorldMap(mapId);
  if (!map) throw new Error("unknown_character_map");
  if (saved && isSafeWorldPoint(map, saved)) return saved;
  if (!isSafeWorldPoint(map, map.spawn)) throw new Error("unsafe_world_spawn");
  return map.spawn;
}
