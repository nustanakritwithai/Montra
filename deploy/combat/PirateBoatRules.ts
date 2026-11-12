// Adapted from Pirate Fruit 1d931558d7a484a1c321f719f07735195ae95801 (shared/src/world/boats.ts).
import type { WorldMapDefinition } from "./WorldMaps.js";

type Position = Readonly<{x:number;z:number}>;
export type BoatBerth = Position & Readonly<{heading:number}>;
export type BoatHarbor = Readonly<{shore:Position;berth:BoatBerth;offshore:Position}>;
export type WaterGate = BoatBerth & Readonly<{id:string;targetMapId:string;range:number}>;
export const WATER_GATE_RANGE = 3.2;
/** S17 — canonical naval tuning shared by the authoritative server and render client. */
export interface AuthoritativeBoatDefinition {
  id: string;
  maxSpeed: number;
  acceleration: number;
  reverseSpeed: number;
  turnSpeed: number;
  drag: number;
  maxHp: number;
  collisionRadius: number;
}

export const AUTHORITATIVE_BOAT_DEFINITIONS: Record<string, AuthoritativeBoatDefinition> = {
  'training-dinghy': { id: 'training-dinghy', maxSpeed: 9, acceleration: 4.8, reverseSpeed: 3.2, turnSpeed: 1.35, drag: 0.72, maxHp: 130, collisionRadius: 2.6 },
};

export const BOAT_BOARD_RANGE = 10;
export const BOAT_INPUT_MIN_INTERVAL_MS = 50;
export const BOAT_RESPAWN_MS = 15_000;

/** Server-owned dock positions. A summon intent never contains a client position. */
export const BOAT_DOCK_SPAWNS: Record<string, { x: number; z: number; heading: number }> = {
  ritual_village: { x: 0, z: 51, heading: Math.PI / 2 },
  river_watch: { x: -98, z: 24, heading: 0 },
  drowned_marsh: { x: -109, z: -68, heading: 0 },
};

/** Unit vectors from each harbor into navigable water, independent of visual heading. */
export const BOAT_DOCK_OFFSHORE_DIRECTIONS: Record<string, { x: number; z: number }> = {
  ritual_village: { x: 1, z: 0 },
  river_watch: { x: 0, z: 1 },
  drowned_marsh: { x: 0, z: 1 },
};

const waterLinks = [
  ["ritual_village","drowned_marsh"],["drowned_marsh","lotus_basin"],
  ["lotus_basin","river_watch"],["river_watch","sam_lan_estuary"],
  ["ritual_village","forbidden_forest"],["ritual_village","mantra_capital"],
  ["forbidden_forest","bound_temple"],["bound_temple","moon_cemetery"],
  ["drowned_marsh","moon_cemetery"],["mantra_capital","bamboo_frontier"],["mantra_capital","moon_pass"],
  ["moon_pass","hex_ridge"],["hex_ridge","twin_neck_pass"],["twin_neck_pass","naga_cavern"],
  ["river_watch","naga_cavern"],["river_watch","fallen_city"],["fallen_city","tri_wiang_castle"],
  ["tri_wiang_castle","asura_peak"],["asura_peak","spirit_rift"],
] as const;

const existingHarbors:Readonly<Record<string,{shore:Position;gates:readonly BoatBerth[]}>> = {
  ritual_village:{shore:{x:0,z:46},gates:[24,-24,-8].map(x=>({x,z:55,heading:Math.PI/2}))},
  drowned_marsh:{shore:{x:-104,z:-68},gates:[-81,-54,-72].map(z=>({x:-113,z,heading:0}))},
  river_watch:{shore:{x:-92.7,z:24},gates:[-82,-60,-37,-14].map(z=>({x:-101.5,z,heading:0}))},
};

export function addWaterways(map:WorldMapDefinition,maps:Readonly<Record<string,WorldMapDefinition>>):WorldMapDefinition {
  const links = maps.tri_wiang_castle ? waterLinks : [...waterLinks,["fallen_city","asura_peak"] as const];
  const neighbors=links.flatMap(([a,b])=>a===map.id && maps[b]?[b]:b===map.id && maps[a]?[a]:[]);
  if(!neighbors.length)return map;
  const existing=existingHarbors[map.id];
  let bounds=map.bounds,water=map.water??[],harbor:BoatHarbor,gates:readonly BoatBerth[];
  if(existing){
    harbor={shore:existing.shore,berth:BOAT_DOCK_SPAWNS[map.id],offshore:BOAT_DOCK_OFFSHORE_DIRECTIONS[map.id]};
    gates=existing.gates;
  }else if(map.id==="lotus_basin"){
    harbor={shore:{x:58,z:-100},berth:{x:58,z:-95,heading:Math.PI/2},offshore:{x:0,z:1}};
    gates=[53,63].map(x=>({x,z:-92,heading:Math.PI/2}));
  }else if(map.id==="sam_lan_estuary"){
    harbor={shore:{x:0,z:134},berth:{x:0,z:140,heading:Math.PI/2},offshore:{x:1,z:0}};
    gates=[{x:14,z:144,heading:Math.PI/2}];
  }else{
    // Keep the existing playable land and run the shipping lane along its southern edge.
    const x=(bounds.minX+bounds.maxX)/2,z=bounds.maxZ+1;
    const width=Math.max(34,neighbors.length*12+16);
    bounds={...bounds,maxZ:z+20};
    water=[...water,{x:x-width/2,z,width,length:20}];
    harbor={shore:{x,z:z-1},berth:{x,z:z+4,heading:Math.PI/2},offshore:{x:1,z:0}};
    gates=neighbors.map((_,i)=>({x:x+(i-(neighbors.length-1)/2)*10,z:z+12,heading:Math.PI/2}));
  }
  if(gates.length<neighbors.length)throw new Error("missing_water_gate_berth:"+map.id);
  const waterGates=neighbors.map((targetMapId,i)=>({
    ...gates[i],id:`water_${map.id}_to_${targetMapId}`,targetMapId,range:WATER_GATE_RANGE,
  }));
  return {...map,bounds,water,boatHarbor:harbor,waterGates};
}

export type BoatWorldState = 'docked' | 'sailing' | 'sunk' | 'respawning';

export interface BoatWorldSnapshot {
  entityId: string;
  ownerId: string;
  definitionId: string;
  islandId: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  passage: number;
  hp: number;
  maxHp: number;
  anchor: boolean;
  state: BoatWorldState;
  helmId?: string;
  passengerIds: string[];
  respawnAt?: number;
}
