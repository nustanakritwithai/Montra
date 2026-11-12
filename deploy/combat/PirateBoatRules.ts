// Adapted from Pirate Fruit 1d931558d7a484a1c321f719f07735195ae95801 (shared/src/world/boats.ts).
import type { WorldMapDefinition, WorldWall } from "./WorldMaps.js";

type Position = Readonly<{x:number;z:number}>;
export type BoatLane = readonly [Position,Position];
export type BoatBerth = Position & Readonly<{heading:number}>;
export type BoatHarbor = Readonly<{shore:Position;berth:BoatBerth;offshore:Position}>;
export type BoatPort = BoatHarbor & Readonly<{id:string;name:string}>;
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
  channelRadius?:number;
  gates:readonly Coordinate[];
  dock?:HarborLayout;
  ports?:readonly (HarborLayout & {id:string;name:string})[];
  dockName?:string;
  basins?:readonly WorldWall[];
  bounds?:Partial<WorldMapDefinition["bounds"]>;
  shorePaths?:readonly (readonly Coordinate[])[];
}>;

const point=([x,z]:Coordinate):Position=>({x,z});
const canalRadius=7;
const capitalCanal={west:-44,east:44,north:-70,south:38,radius:6};
export const CAPITAL_MOAT={minX:capitalCanal.west-capitalCanal.radius,maxX:capitalCanal.east+capitalCanal.radius,
  minZ:capitalCanal.north-capitalCanal.radius,maxZ:capitalCanal.south+capitalCanal.radius};
const eastBank=(x:number,z:number):HarborLayout=>({shore:[x+8,z],berth:[x+2,z],direction:[0,1]});
const southBank=(x:number,z:number):HarborLayout=>({shore:[x,z+8],berth:[x,z+2],direction:[1,0]});
const capitalDock=southBank(-12,capitalCanal.south);

// Each gate belongs to the corresponding neighbor in waterLinks. Author channels
// around transfer pads and fort walls so the river crosses the map without opening land defenses.
const canals:Readonly<Record<string,CanalLayout>>={
  ritual_village:{
    bounds:{minX:-94,maxX:94,minZ:-76,maxZ:116},
    channels:[
      [[-53,54],[53,54]],[[22,-63],[22,54]],[[0,54],[0,94]],
      [[-72,80],[-58,80],[-58,94],[58,94],[58,80],[72,80]],
    ],
    basins:[
      {x:10,z:-74,width:25,length:14}, // forest mouth, north of the dry city gate
      {x:-87,z:62,width:21,length:37},{x:66,z:62,width:21,length:37},
      {x:-81,z:84,width:162,length:19},{x:-68,z:98,width:136,length:10},
      {x:-50,z:105,width:100,length:4},
    ],
    gates:[[-72,80],[22,-63],[72,80]],dockName:"ท่ากลางหมู่บ้าน",
    ports:[
      {id:"village_fields",name:"ท่าริมนา",shore:[-49,46],berth:[-49,51],direction:[1,0]},
      {id:"village_market",name:"ท่าตลาดใต้",shore:[49,46],berth:[49,51],direction:[-1,0]},
      {id:"village_south_bend",name:"ท่าพักคุ้งใต้",shore:[32,112],berth:[32,104],direction:[1,0]},
    ],
    shorePaths:[[[49,46],[55,42],[84,42],[91,50],[91,101],[86,112],[66,113],[32,113],[32,112]]],
  },
  drowned_marsh:{
    channels:[[[-112,-99],[-112,-34],[72,-34]],[[-112,-83],[-134,-83],[-134,-34],[-112,-34]]],
    basins:[{x:-140,z:-106,width:35,length:33},{x:38,z:-51,width:43,length:31}],
    gates:[[-112,-83],[64,-34],[-41,-34]],dockName:"ท่าสุสานเรือพราย",
    ports:[
      {id:"marsh_island",name:"ท่าเกาะกอพราย",shore:[-125,-65],berth:[-131,-65],direction:[0,1]},
      {id:"marsh_reeds",name:"ท่าเกาะกกผี",shore:[-22,-26],berth:[-22,-31.5],direction:[1,0]},
      {id:"marsh_east_bend",name:"ท่าคุ้งบึงตะวันออก",shore:[85,-34],berth:[76,-34],direction:[0,1]},
    ],
    shorePaths:[[[-22,-17],[-22,-26]]],
  },
  lotus_basin:{
    bounds:{minX:-80},
    channels:[[[-72,-35],[125,-35]],[[32,-35],[32,-92],[58,-92]],
      [[-68,-35],[-68,22]],[[125,-35],[125,29],[105,29]]],
    basins:[{x:-79,z:-6,width:22,length:29},{x:102,z:20,width:30,length:19}],
    gates:[[-72,-35],[125,-35]],
    dock:{shore:[58,-100],berth:[58,-95],direction:[0,1]},dockName:"ท่าบัวเหนือ",
    ports:[
      {id:"lotus_west",name:"ท่าบ่อตะวันตก",shore:[-56,12],berth:[-61,12],direction:[0,1]},
      {id:"lotus_east",name:"ท่าเกาะบัวเพลิง",shore:[112,40],berth:[112,34],direction:[1,0]},
    ],
    shorePaths:[[[-22,8],[-42,12],[-56,12]],[[54,32],[82,41],[112,40]],[[52,-74],[48,-99],[58,-100]]],
  },
  river_watch:{
    bounds:{maxX:104},
    channels:[[[-100,-87],[-100,27]],[[-100,-3],[96,-3]],[[94,-3],[94,39],[90,39]]],
    basins:[{x:83,z:25,width:21,length:28}],
    gates:[[-100,-87],[96,-3],[-38,-3],[24,-3]],dockName:"ท่าคุ้งนอก",
    ports:[{id:"watch_east",name:"ท่าคุ้งตะวันออก",shore:[82,39],berth:[88,39],direction:[0,1]}],
    shorePaths:[[[50,20],[68,31],[82,39]]],
  },
  sam_lan_estuary:{
    bounds:{maxZ:228},
    channels:[[[-193,-193],[-193,204],[217,204],[217,-138]],[[-193,159],[-16,159],[-16,144],[0,144]],
      [[217,202],[119,202]]],
    basins:[{x:112,z:171,width:115,length:48}],
    gates:[[-193,-193]],
    dock:{shore:[0,134],berth:[0,140],direction:[1,0]},dockName:"ท่าสามลานกลาง",
    ports:[
      {id:"sam_lan_west",name:"ท่าสามลานตะวันตก",shore:[-185,76],berth:[-190.5,76],direction:[0,1]},
      {id:"sam_lan_east",name:"ท่าสามลานตะวันออก",shore:[207.5,52],berth:[213,52],direction:[0,1]},
      {id:"sam_lan_gulf",name:"ท่าอ่าวสามลาน",shore:[128,220],berth:[128,214],direction:[1,0]},
    ],
    shorePaths:[[[-112,144],[-155,121],[-185,112],[-185,76]],[[112,144],[163,126],[185,112],[207.5,52]],
      [[0,176],[53,192],[100,216],[128,220]]],
  },
  forbidden_forest:{
    bounds:{maxX:82},
    channels:[[[-53,-45],[-14,-45],[-14,-49],[39,-49],[39,-57],[75,-57]],[[69,-57],[69,-80]]],
    basins:[{x:62,z:-87,width:20,length:22}],
    gates:[[75,-57],[-53,-45]],dock:southBank(0,-49),dockName:"ท่ากลางป่า",
    ports:[{id:"forest_east",name:"ท่าชายป่าตะวันออก",shore:[61,-73],berth:[66.5,-73],direction:[0,1]}],
    shorePaths:[[[38,-80],[53,-74],[61,-73]]],
  },
  bound_temple:{
    bounds:{minX:-72},
    channels:[[[-65,3],[43,3]],[[-63,3],[-63,-31]]],
    basins:[{x:-72,z:-38,width:18,length:22}],
    gates:[[43,3],[-65,3]],dock:southBank(0,3),dockName:"ท่าหน้าวัด",
    ports:[{id:"temple_west",name:"ท่าศาลาวัดตะวันตก",shore:[-53,-25],berth:[-59,-25],direction:[0,1]}],
    shorePaths:[[[0,26],[-23,17],[-45,14],[-53,-25]]],
  },
  moon_cemetery:{
    bounds:{minX:-76},
    channels:[[[29,-97],[29,41]],[[29,41],[-69,41]]],
    basins:[{x:-75,z:33,width:24,length:15}],
    gates:[[29,-97],[29,41]],dock:eastBank(29,-8),dockName:"ท่าศาลาคนเฝ้า",
    ports:[{id:"cemetery_west",name:"ท่าริมป่าช้า",shore:[-46,49],berth:[-46,43],direction:[1,0]}],
    shorePaths:[[[-18,25],[-30,38],[-46,49]]],
  },
  mantra_capital:{
    channels:[[
      [capitalCanal.west,capitalCanal.south],[capitalCanal.east,capitalCanal.south],
      [capitalCanal.east,capitalCanal.north],[capitalCanal.west,capitalCanal.north],[capitalCanal.west,capitalCanal.south],
    ]],channelRadius:capitalCanal.radius,
    gates:[[-35,capitalCanal.south],[capitalCanal.east,-58],[26,capitalCanal.south]],
    dock:capitalDock,shorePaths:[[[capitalDock.shore[0],56],capitalDock.shore]],
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
    channels:[[[-127,4],[47,4]]],gates:[[-127,4],[47,4]],dock:southBank(-16,4),
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

function makeHarbor(dock:HarborLayout):BoatHarbor {
  return {shore:point(dock.shore),offshore:point(dock.direction),
    berth:{...point(dock.berth),heading:Math.atan2(...dock.direction)}};
}

function canalWater([a,b]:BoatLane,radius:number):WorldWall {
  return {x:Math.min(a.x,b.x)-radius,z:Math.min(a.z,b.z)-radius,
    width:Math.abs(b.x-a.x)+2*radius,length:Math.abs(b.z-a.z)+2*radius};
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
  const radius=layout.channelRadius??canalRadius;
  const water=[...map.water??[],...lanes.map(lane=>canalWater(lane,radius)),...layout.basins??[]];
  const harbor:BoatHarbor=layout.dock?makeHarbor(layout.dock):{
    shore:originalShore[map.id],offshore:BOAT_DOCK_OFFSHORE_DIRECTIONS[map.id],berth:BOAT_DOCK_SPAWNS[map.id],
  };
  const waterGates=neighbors.map((targetMapId,i)=>{
    const gate=point(layout.gates[i]);
    return {...gate,heading:gateHeading(gate,lanes),id:"water_"+map.id+"_to_"+targetMapId,targetMapId,range:WATER_GATE_RANGE};
  });
  // Keep the previous bounds for saves made around the former southern docks.
  const legacyExtension=!layout.dock || map.id==="mantra_capital" || map.id==="lotus_basin" || map.id==="sam_lan_estuary"?0:21;
  const bounds={...map.bounds,maxZ:map.bounds.maxZ+legacyExtension,...layout.bounds};
  const boatPorts:BoatPort[]=[
    {...harbor,id:map.id+"_main",name:layout.dockName??"ท่าเรือ"+map.name},
    ...layout.ports?.map(port=>({...makeHarbor(port),id:port.id,name:port.name}))??[],
  ];
  const paths=layout.shorePaths?[...map.paths??[],...layout.shorePaths.map(path=>path.map(point))]:map.paths;
  return {...map,bounds,water,paths,boatHarbor:harbor,boatPorts,boatLanes:lanes,waterGates};
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
