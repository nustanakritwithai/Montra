// Adapted from Pirate Fruit 1d931558d7a484a1c321f719f07735195ae95801 (shared/src/world/boats.ts).
import type { WorldMapDefinition, WorldWall } from "./WorldMaps.js";

type Position = Readonly<{x:number;z:number}>;
export type BoatLane = readonly [Position,Position];
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

type Coordinate = readonly [x:number,z:number];
type HarborLayout = Readonly<{
  shore:Coordinate;
  berth:Coordinate;
  direction:Coordinate;
}>;
type CanalLayout = Readonly<{
  channels:readonly (readonly Coordinate[])[];
  gates:readonly Coordinate[];
  dock?:HarborLayout;
  maxX?:number;
}>;

const point=([x,z]:Coordinate):Position=>({x,z});
const canalRadius=7;
const eastBank=(x:number,z:number):HarborLayout=>({shore:[x+8,z],berth:[x,z],direction:[0,1]});
const southBank=(x:number,z:number):HarborLayout=>({shore:[x,z+8],berth:[x,z],direction:[1,0]});

// Each gate belongs to the corresponding neighbor in waterLinks. Author channels
// around transfer pads and fort walls so the river crosses the map without opening land defenses.
const canals:Readonly<Record<string,CanalLayout>>={
  ritual_village:{
    channels:[[[-53,54],[53,54]],[[22,-53],[22,54]]],
    gates:[[-53,54],[22,-53],[53,54]],
  },
  drowned_marsh:{
    channels:[[[-112,-83],[-112,-34],[52,-34]]],
    gates:[[-112,-83],[52,-34],[-41,-34]],
  },
  lotus_basin:{
    channels:[[[-53,-35],[125,-35]],[[32,-35],[32,-92],[58,-92]]],
    gates:[[-53,-35],[125,-35]],
    dock:{shore:[58,-100],berth:[58,-95],direction:[0,1]},
  },
  river_watch:{
    channels:[[[-100,-87],[-100,27]],[[-100,-3],[72,-3]]],
    gates:[[-100,-87],[72,-3],[-38,-3],[24,-3]],
  },
  sam_lan_estuary:{
    channels:[[[-193,-193],[-193,159],[-16,159],[-16,144],[0,144]]],
    gates:[[-193,-193]],
    dock:{shore:[0,134],berth:[0,140],direction:[1,0]},
  },
  forbidden_forest:{
    channels:[[[-53,-45],[-14,-45],[-14,-49],[39,-49],[39,-57],[53,-57]]],
    gates:[[53,-57],[-53,-45]],dock:southBank(0,-49),
  },
  bound_temple:{
    channels:[[[-43,3],[43,3]]],gates:[[43,3],[-43,3]],dock:southBank(0,3),
  },
  moon_cemetery:{
    channels:[[[29,-97],[29,41]]],gates:[[29,-97],[29,41]],dock:eastBank(29,-8),
  },
  mantra_capital:{
    channels:[[[-35,37],[43,37],[43,-58]]],gates:[[-35,37],[43,-58],[26,37]],dock:southBank(0,37),maxX:50,
  },
  bamboo_frontier:{
    channels:[[[-38,-93],[-38,45]]],gates:[[-38,-93]],dock:eastBank(-38,38),
  },
  moon_pass:{
    channels:[[[-51,-7],[115,-7]]],gates:[[-51,-7],[115,-7]],dock:southBank(-20,-7),
  },
  hex_ridge:{
    channels:[[[39,-103],[39,47]]],gates:[[39,47],[39,-103]],dock:eastBank(39,-84),
  },
  twin_neck_pass:{
    channels:[[[-272,92],[272,92]]],gates:[[-272,92],[272,92]],dock:southBank(0,92),
  },
  naga_cavern:{
    channels:[[[-127,4],[47,4]]],gates:[[-127,4],[47,4]],dock:southBank(-8,4),
  },
  fallen_city:{
    channels:[[[27,-103],[27,47]]],gates:[[27,47],[27,-103]],dock:eastBank(27,0),
  },
  tri_wiang_castle:{
    channels:[[[-326,-343],[-326,340],[343,340]]],
    gates:[[-326,-343],[343,340]],dock:eastBank(-326,0),
  },
  asura_peak:{
    channels:[[[-39,-108],[-39,48]]],gates:[[-39,-108],[-39,48]],dock:eastBank(-39,0),
  },
  spirit_rift:{
    channels:[[[-129,-38],[59,-38]]],gates:[[-129,-38]],dock:southBank(46,-38),
  },
};

const originalShore:Readonly<Record<string,Position>>={
  ritual_village:{x:0,z:46},drowned_marsh:{x:-104,z:-68},river_watch:{x:-92.7,z:24},
};

function canalWater([a,b]:BoatLane):WorldWall {
  return {x:Math.min(a.x,b.x)-canalRadius,z:Math.min(a.z,b.z)-canalRadius,
    width:Math.abs(b.x-a.x)+2*canalRadius,length:Math.abs(b.z-a.z)+2*canalRadius};
}

function gateHeading(gate:Position,lanes:readonly BoatLane[]):number {
  const [a,b]=lanes.find(([a,b])=>gate.x>=Math.min(a.x,b.x) && gate.x<=Math.max(a.x,b.x) &&
    gate.z>=Math.min(a.z,b.z) && gate.z<=Math.max(a.z,b.z))!;
  const inside=Math.hypot(gate.x-a.x,gate.z-a.z)>Math.hypot(gate.x-b.x,gate.z-b.z)?a:b;
  return Math.atan2(inside.x-gate.x,inside.z-gate.z);
}

export function addWaterways(map:WorldMapDefinition,maps:Readonly<Record<string,WorldMapDefinition>>):WorldMapDefinition {
  const links=maps.tri_wiang_castle?waterLinks:[...waterLinks,["fallen_city","asura_peak"] as const];
  const neighbors=links.flatMap(([a,b])=>a===map.id && maps[b]?[b]:b===map.id && maps[a]?[a]:[]);
  if(!neighbors.length)return map;
  const layout=canals[map.id];
  if(!layout || layout.gates.length<neighbors.length)throw new Error("missing_canal_layout:"+map.id);
  const lanes=layout.channels.flatMap(channel=>channel.slice(1).map((end,i):BoatLane=>[point(channel[i]),point(end)]));
  const water=[...map.water??[],...lanes.map(canalWater)];
  const harbor:BoatHarbor=layout.dock?{
    shore:point(layout.dock.shore),offshore:point(layout.dock.direction),
    berth:{...point(layout.dock.berth),heading:Math.atan2(...layout.dock.direction)},
  }:{
    shore:originalShore[map.id],offshore:BOAT_DOCK_OFFSHORE_DIRECTIONS[map.id],berth:BOAT_DOCK_SPAWNS[map.id],
  };
  const waterGates=neighbors.map((targetMapId,i)=>{
    const gate=point(layout.gates[i]);
    return {...gate,heading:gateHeading(gate,lanes),id:"water_"+map.id+"_to_"+targetMapId,targetMapId,range:WATER_GATE_RANGE};
  });
  // Keep the previous bounds for saves made around the former southern docks.
  const legacyExtension=!layout.dock || map.id==="lotus_basin" || map.id==="sam_lan_estuary"?0:21;
  const bounds={...map.bounds,maxX:layout.maxX??map.bounds.maxX,maxZ:map.bounds.maxZ+legacyExtension};
  return {...map,bounds,water,boatHarbor:harbor,boatLanes:lanes,waterGates};
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
