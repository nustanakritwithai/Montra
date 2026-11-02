/** MONTRA V0.2.8: declarative world geometry. No client coordinates are trusted. */
import { isFlightAltitude, isOnGround, isOnPlatform, isOnTop, touchesWallBody } from "./HeightRules.js";
import { TEMPLE_ID, TEMPLE_GATE, TEMPLE_MAP } from "./TempleMap.js";
import { ATLAS_MAPS, MARSH_GATE, atlasPortals } from "./WorldAtlas.js";
export type WorldWall = Readonly<{x:number;z:number;width:number;length:number}>;
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
  id: string; x: number; z: number; targetMapId: string; targetSpawn: WorldPoint;
}>;
export type HuntCamp = Readonly<{id:string; name:string; x:number; z:number; levels:readonly number[]}>;
export type RestArea = Readonly<{x:number; z:number; radius:number; name:string}>;
export const WORLD_EXPANSION = process.env.MONTRA_WORLD_EXPANSION === "1";
export const SHRINE_GUARDIAN = Object.freeze({
  id: "forest_shrine_keeper", name: "ผู้พิทักษ์ศาลร้าง", level: 12,
  x: -14, z: -90, respawnMs: 120_000, strikeRadius: 2.8,
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
  spawn: WorldPoint;
  obstacles: readonly WorldObstacle[];
  walls?: readonly WorldWall[];
  water?: readonly WorldWall[];
  region?: Readonly<{range:readonly [number,number];hint:string;noFlight:boolean}>;
  portals: readonly WorldPortal[];
  restAreas?: readonly RestArea[];
  camps?: readonly HuntCamp[];
  guardian?: typeof SHRINE_GUARDIAN;
  boss?: Readonly<{id:string;name:string;x:number;z:number;level:number;strikeRadius:number;respawnMs:number}>;
  paths?: readonly (readonly {x:number; z:number}[])[];
}>;
export const DEFAULT_MAP_ID = "ritual_village";
export const WORLD_MAPS: Readonly<Record<string, WorldMapDefinition>> = Object.freeze<Record<string, WorldMapDefinition>>({
  ...(WORLD_EXPANSION ? {[TEMPLE_ID]:TEMPLE_MAP,...ATLAS_MAPS} : {}),
  ritual_village: {
    id: "ritual_village", name: "หมู่บ้านอาคม",
    bounds: { minX: -20, maxX: 20, minZ: -20, maxZ: 20 },
    spawn: { x: 0, y: 0, z: 0 },
    obstacles: [],
    restAreas: WORLD_EXPANSION ? [{x:0,z:0,radius:6,name:"ลานพักและตลาดอาคม"},{x:-4,z:-16,radius:3,name:"ประตูป่า"}] : [],
    portals: [{ id: "village_to_forest", x: -4, z: -17,
      targetMapId: "forbidden_forest", targetSpawn: { x: 0, y: 0, z: 12 } }],
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
      targetMapId: "ritual_village", targetSpawn: { x: -4, y: 0, z: -15 } },
      ...(WORLD_EXPANSION ? [{id:"forest_to_temple",...TEMPLE_GATE,targetMapId:TEMPLE_ID,targetSpawn:TEMPLE_MAP.spawn},...atlasPortals("forbidden_forest")] : [])],
  },
});
export function getWorldMap(mapId: string): WorldMapDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(WORLD_MAPS, mapId) ? WORLD_MAPS[mapId] : undefined;
}
/** Rest zones protect actors at every height, including flying attackers. */
export function isRestArea(mapId: string, point: {x:number; z:number}): boolean {
  return getWorldMap(mapId)?.restAreas?.some(a => Math.hypot(point.x-a.x,point.z-a.z) <= a.radius) ?? false;
}
export function isWorldSegmentClear(mapId:string, from:{x:number;z:number}, to:{x:number;z:number}):boolean {
  if(!WORLD_EXPANSION || mapId===DEFAULT_MAP_ID)return true;
  const map=getWorldMap(mapId);if(!map)return false;
  const dx=to.x-from.x,dz=to.z-from.z,length=dx*dx+dz*dz;
  if(map.walls?.some(w=>segmentIntersectsExpandedWall(from,to,w,0)))return false;
  return map.obstacles.every(o=>{
    const t=length>0?Math.max(0,Math.min(1,((o.x-from.x)*dx+(o.z-from.z)*dz)/length)):0;
    return Math.hypot(o.x-from.x-t*dx,o.z-from.z-t*dz)>o.radius;
  });
}
export function isSafeWorldPoint(map: WorldMapDefinition, point: WorldPoint, radius = 0.4): boolean {
  if (![point.x, point.y, point.z, radius].every(Number.isFinite) || radius < 0) return false;
  if (point.x - radius < map.bounds.minX || point.x + radius > map.bounds.maxX ||
      point.z - radius < map.bounds.minZ || point.z + radius > map.bounds.maxZ) return false;
  // A saved height must be an actual walkable level, not just a finite number.
  // Only the village owns the existing watchwall and its elevated crest.
  if (map.id === DEFAULT_MAP_ID) {
    if (isOnGround(point.y)) {
      if (touchesWallBody(point.x, point.z, radius)) return false;
    } else if (isOnPlatform(point.y)) {
      if (!isOnTop(point.x, point.z)) return false;
    } else if (!isFlightAltitude(point.y)) return false;
  } else if (!isOnGround(point.y) && !isFlightAltitude(point.y)) return false;
  if(map.region?.noFlight && !isOnGround(point.y))return false;
  if(isOnGround(point.y) && map.water?.some(w=>segmentIntersectsExpandedWall(point,point,w,radius)))return false;
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
