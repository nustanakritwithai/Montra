import type { HuntCamp, WorldMapDefinition } from "./WorldMaps.js";

export const TEMPLE_ID = "bound_temple";
export const TEMPLE_GATE = { x: -48, z: -84 };
export const TEMPLE_CAMPS: readonly HuntCamp[] = [
  {id:"forecourt", name:"ลานประตูครุฑ", x:0, z:5, levels:[8,9,10,11]},
  {id:"cloister", name:"ระเบียงจารึก", x:-27, z:-18, levels:[11,12,13,14]},
  {id:"belfry", name:"หอระฆังร้าว", x:27, z:-23, levels:[14,15,16,17]},
  {id:"sanctum", name:"อุโบสถพันธนาการ", x:0, z:-55, levels:[17,18,19,20]},
];
const offsets = [[-6,-6],[6,-6],[-6,6],[6,6]];
const spirits = ["ภูตทวารบาล","เงาผู้จารึก","วิญญาณเสียงระฆัง","ผู้เฝ้าพันธนาการ"];
export const TEMPLE_SPAWNS = TEMPLE_CAMPS.flatMap((camp,index) =>
  camp.levels.map((level,i) => ({
    id:`temple_${camp.id}_${i+1}`, name:spirits[index], level,
    x:camp.x+offsets[i][0], z:camp.z+offsets[i][1],
  })));
export const TEMPLE_TARGETS: ReadonlySet<string> = new Set(TEMPLE_SPAWNS.map(m=>m.id));

export const TEMPLE_MAP: WorldMapDefinition = {
  id:TEMPLE_ID, name:"วัดร้างพันธนาการ",
  bounds:{minX:-50,maxX:50,minZ:-75,maxZ:35}, spawn:{x:0,y:0,z:26},
  restAreas:[{x:0,z:26,radius:6,name:"ซุ้มพักหน้าวัด"}],
  portals:[{id:"temple_to_forest",x:0,z:28,targetMapId:"forbidden_forest",targetSpawn:{x:TEMPLE_GATE.x,y:0,z:TEMPLE_GATE.z+1.5}}],
  camps:TEMPLE_CAMPS,
  paths:[
    [{x:0,z:28},{x:0,z:5},{x:4.5,z:-5},{x:4.5,z:-22},{x:11,z:-30},{x:11,z:-44},{x:0,z:-55}],
    [{x:0,z:5},{x:-15,z:2},{x:-27,z:-5},{x:-27,z:-18},{x:-27,z:-36},{x:-23,z:-45},{x:0,z:-55}],
    [{x:0,z:5},{x:15,z:2},{x:27,z:-5},{x:27,z:-23},{x:30,z:-38},{x:22,z:-49},{x:0,z:-55}],
    [{x:-27,z:-18},{x:-22,z:-26},{x:-18,z:-32},{x:-9,z:-32},{x:11,z:-30}],
  ],
  // X and Z identify the minimum X/Z corner of each rectangular footprint.
  walls:[
    {x:-17,z:-13,width:17,length:1.8},{x:9,z:-13,width:11,length:1.8},
    {x:-16,z:-38,width:23,length:1.8},{x:15,z:-38,width:7,length:1.8},
    {x:-15,z:-29,width:1.8,length:11},{x:15,z:-32,width:1.8,length:11},
  ],
  obstacles:[
    {id:"gate-left",x:-6,z:18,radius:1.5},{id:"gate-right",x:6,z:18,radius:1.5},
    {id:"cloister-stele",x:-38,z:-18,radius:2.1},{id:"cracked-bell",x:39,z:-23,radius:2.6},
    {id:"bound-prang",x:0,z:-68,radius:4},{id:"votive-west",x:-10,z:-65,radius:1.1},
    {id:"votive-east",x:10,z:-65,radius:1.1},{id:"forecourt-lamp",x:-11,z:8,radius:1.1},
    ...[[-38,-4],[-38,-32],[38,-8],[38,-38],[-21,-59],[20,-60]].map(([x,z],i)=>({id:"ruin-pillar-"+i,x,z,radius:1.35})),
  ],
};
