import type { HuntCamp, RestArea, WorldMapDefinition, WorldPortal, WorldWall } from "./WorldMaps.js";

import { PROVINCES } from "./StrategicProvinces.js";
import {CASTLE_ENABLED, CASTLE_ID} from "./CastlePilot.js";
import {RIVER_CITY,riverNodes} from "./RiverCity.js";

type XZ = {x:number; z:number};
type XY = readonly [number,number];
type Court = readonly [name:string,x:number,z:number,levels:readonly number[],enemy:string,tier?:"strong"];
type Region = {
  id:string; name:string; range:readonly [number,number]; hint:string; courts:readonly Court[];
  routes:readonly (readonly XY[])[]; marker:XY; scatter:readonly XY[];
  bounds?:WorldMapDefinition["bounds"]; rest?:RestArea;
  walls?:WorldWall[]; pools?:WorldWall[]; crossings?:number[]; noFlight?:boolean;
  huntTrail?:WorldMapDefinition["huntTrail"]; extraBridges?:readonly XY[];
};
const point=([x,z]:XY):XZ=>({x,z});
const wall=(x:number,z:number,width:number,length:number):WorldWall=>({x,z,width,length});
export const MARSH_GATE=point([48,-84]);
export const TEMPLE_NORTH_GATE=point([32,-65]);
export const RIFT_WARDEN={id:"atlas_rift_warden",name:"ราชันรอยแยก",level:100,x:29,z:-50,strikeRadius:3.8,respawnMs:180000} as const;
const islandRoutes:XY[][]=[
  [[0,26],[-22,16],[-22,8],[-22,-17],[22,-17],[22,-36],[0,-43],[0,-58]],
  [[0,26],[22,12],[22,-17]], [[-22,-17],[-22,-36],[0,-43]],
];
const regions:Region[]=[
  {id:"bamboo_frontier",name:"ดงไผ่ชายเวียง",range:[25,35],hint:PROVINCES.bamboo_frontier.hint,
   bounds:{minX:-124,maxX:62,minZ:-100,maxZ:52},rest:{name:"เพิงพรานตาน้ำ",x:-92,z:-27,radius:5},
   courts:[["ลานหน่อไผ่",-20,4,[25,26,27],"ผีตาไผ่"],["ค่ายพรานเก่า",20,-17,[29,31],"พรานพราย"],["ลานรากแดง",0,-41,[33,35],"อสูรรากไผ่"],
     ["ลานไผ่คราม",-73,6,[30,32],"พรายไผ่คราม"],["ดงไผ่ผนึก",-86,-74,[35],"ขุนพรานเฝ้าผนึก","strong"]],
   routes:[[[0,26],[-20,13],[-20,4],[-23,-22],[0,-41],[0,-58]],[[0,26],[20,7],[20,-17],[18,-30],[0,-41]],[[-20,4],[0,-8],[20,-17]],
     [[0,26],[-32,27],[-46,19],[-58,11],[-73,6],[-85,-10],[-92,-27],[-90,-43],[-82,-60],[-86,-74],[-68,-82],[-48,-72],[-34,-58],[0,-58]],
     [[-23,-22],[-46,-22],[-65,-28],[-92,-27]],[[-86,-74],[-64,-59],[-51,-58],[-45,-42],[-40,-28],[-23,-22]]],
   walls:[wall(-119,-14,26,3),wall(-78,-16,24,3),wall(-108,-55,16,3),wall(-73,-53,18,3),wall(-58,-40,4,9)],
   marker:[-12,-46],scatter:[[-31,5],[30,-22],[11,-45],[-32,-30],[-106,17],[-68,-37],[-104,-72],[-48,-86]]},
  {id:"lotus_basin",name:"บึงบัวนาค",range:[40,52],hint:PROVINCES.lotus_basin.hint,crossings:[-6,-29],
   bounds:{minX:-60,maxX:132,minZ:-110,maxZ:54},rest:{name:"ศาลาพักคุ้งบัว",x:110,z:-13,radius:4.5},
   courts:[["บ่อตะวันตก",-22,8,[40,41,43],"ภูตบัวธูป"],["คุ้งเรือแตก",22,-17,[45,47],"พรายคนพาย"],["ค่ายเกล็ดนาค",0,-43,[50,52],"อสรพิษบึง"],
     ["เกาะบัวเพลิง",72,-16,[46,48],"ภูตเกสรเพลิง"],["ลานนาคน้ำลึก",96,-65,[52],"ผู้เฝ้าไข่มุกนาค","strong"]],
   routes:[...islandRoutes,[[0,26],[30,34],[54,32],[72,15],[72,-4],[72,-16],[90,-17],[110,-13],[104,-27],[104,-43],[96,-65],[76,-80],[52,-74],[32,-62],[0,-58]],
     [[22,-17],[31,-13],[42,-13],[58,-21],[72,-16]],[[0,-43],[34,-44],[58,-50],[78,-60],[96,-65]]],
   pools:[wall(48,-99,20,14),wall(108,-68,24,14),wall(85,24,32,11)],
   marker:[-9,-50],scatter:[[-34,7],[32,-18],[-32,-39],[15,-45],[58,13],[88,-45],[39,-83],[119,-85]]},
  {id:"drowned_marsh",name:"บึงพราย",range:[10,22],hint:"จากชายป่า เลียบฝั่งตะวันตกข้ามสะพานไปโป๊ะอวนขาด พักที่แพโคมเขียวแล้วตามเสากระโดงไปสุสานเรือพราย",
   bounds:{minX:-121,maxX:59,minZ:-99,maxZ:51},huntTrail:{name:"สายแพโคมเขียว",path:3},rest:{name:"แพพักโคมเขียว",x:-101,z:-15,radius:5},
   crossings:[-6,-29],extraBridges:[[-62,-4],[-88,-27]],
   courts:[["เกาะกกผี",-22,8,[10,12,14],"พรายกอกก"],["ท่าน้ำจมน้ำ",22,-17,[15,17],"เงาคนแจว"],["ศาลพราย",0,-43,[19,22],"ผีเฝ้าศาลน้ำ"],
     ["โป๊ะอวนขาด",-64,-16,[16,18],"พรายลากอวน"],["สุสานเรือพราย",-80,-63,[22],"นายท้ายเรือพราย","strong"]],
   routes:[...islandRoutes,[[0,26],[-30,34],[-54,27],[-62,12],[-62,-4],[-64,-16],[-83,-17],[-101,-15],[-88,-20],[-88,-27],[-87,-45],[-80,-63],[-73,-78],[-53,-82],[-36,-70],[-18,-62],[0,-58]],
     [[-22,-17],[-44,-12],[-64,-16]],[[-80,-63],[-61,-51],[-39,-53],[0,-43]]],
   pools:[wall(-121,-90,16,45),wall(-66,-98,22,9),wall(-112,9,25,14)],
   marker:[-9,-50],scatter:[[-34,7],[34,-17],[-32,-39],[15,-45],[-97,30],[-71,20],[-106,-55],[-60,-72]]},
  {id:"moon_cemetery",name:"ป่าช้าเงาจันทร์",range:[18,32],hint:"จากประตูบึง เลี้ยวตะวันออกผ่านลานโลงจันทร์ ศาลาคนเฝ้าสุสานอยู่ก่อนแนวกำแพง ไปถึงลานระฆังดับแล้ววกกลับประตูด่านจันทรา",
   bounds:{minX:-56,maxX:130,minZ:-104,maxZ:48},huntTrail:{name:"ทางระฆังเงาจันทร์",path:5},rest:{name:"ศาลาคนเฝ้าสุสาน",x:106,z:-14,radius:5},
   courts:[["เนินป้ายวิญญาณ",-22,2,[18,20,22],"เงาหลุมศพ"],["ลานเผาศพ",22,-15,[24,27],"ผู้เฝ้าเชิงตะกอน"],["ลานจันทร์ดับ",0,-41,[29,32],"วิญญาณเงาจันทร์"],
     ["ลานโลงจันทร์",76,4,[24,26],"เงาคนแบกโลง"],["ลานระฆังดับ",93,-61,[32],"ผู้ตีระฆังไร้เงา","strong"]],
   routes:[[[-18,25],[0,21],[18,25]],[[0,21],[-22,11],[-22,2],[-24,-24],[0,-41],[0,-58]],[[0,21],[22,4],[22,-15],[20,-30],[0,-41]],[[-22,2],[0,-7],[22,-15]],[[-22,11],[-34,12]],
     [[18,25],[33,32],[55,27],[71,16],[76,4],[88,-9],[106,-14],[112,-29],[101,-44],[93,-61],[78,-75],[55,-82],[34,-70],[17,-60],[0,-58]],
     [[22,-15],[39,-20],[55,-13],[76,4]],[[0,-41],[13,-38],[30,-46],[56,-54],[73,-62],[93,-61]]],
   walls:[wall(36,-7,17,2.4),wall(71,-25,16,2.5),wall(64,-52,19,2.8),wall(100,-77,15,2.7),wall(38,-40,3,13)],
   marker:[10,-45],scatter:[[-34,-1],[33,-15],[-12,-39],[1,8],[63,37],[95,15],[120,-61],[62,-95]]},
  {id:"hex_ridge",name:"ดงอาคมบนเขา",range:[28,45],hint:"จากประตูจันทรา เลี้ยวตะวันออกไปลานเสาหินลม ผ่านเพิงพักสามผา แล้วตามธงไปผาสามตราก่อนลงประตูถ้ำนาค",
   bounds:{minX:-62,maxX:124,minZ:-110,maxZ:54},huntTrail:{name:"ทางสันผาสามตรา",path:2},rest:{name:"เพิงพักสามผา",x:107,z:-26,radius:5},
   courts:[["เชิงผาหินสลัก",-23,6,[28,30,33],"ภูตเชิงผา"],["ช่องเขาอาคม",23,-18,[35,39],"อสูรเถาวัลย์"],["ยอดผาผนึก",-14,-42,[42,45],"ผู้พิทักษ์หน้าผา"],
     ["ลานเสาหินลม",67,4,[36,39],"พรายเสาหิน"],["ผาสามตรา",79,-73,[45],"ผู้พิทักษ์ตราวายุ","strong"]],
   walls:[wall(-14,-6,45,2.4),wall(-22,-26,40,2.4),wall(43,-5,13,3),wall(73,-32,3,17),wall(46,-39,16,3),wall(77,-58,9,2.6)],
   routes:[[[0,26],[-23,17],[-23,6],[-26,-10],[12,-12],[23,-18],[27,-30],[-14,-35],[-14,-42],[0,-58]],[[-26,-10],[-32,-19],[-32,-34],[-14,-42]],
     [[0,26],[23,35],[48,26],[59,14],[67,4],[79,-10],[98,-14],[107,-26],[101,-44],[89,-58],[79,-73],[56,-87],[34,-80],[14,-66],[0,-58]],
     [[23,-18],[29,-22],[42,-19],[54,-10],[67,4]],[[79,-73],[62,-63],[45,-56],[23,-48],[4,-53],[-14,-42]]],
   marker:[-25,-47],scatter:[[-34,6],[34,-18],[0,-45],[33,11],[61,29],[109,-55],[49,-72],[87,17]]},
  {id:"naga_cavern",name:"ถ้ำนาค",range:[40,58],hint:"เลี้ยวตะวันตกจากประตูเขา ผ่านโถงผลึกคราม ข้ามสะพานหินไปศาลาน้ำซึม แล้วตามเขี้ยวนาคไปประตูป้อมท่าปากชล เขตถ้ำใช้การเดินและ Dash",noFlight:true,
   bounds:{minX:-134,maxX:54,minZ:-108,maxZ:50},huntTrail:{name:"ทางธารเขี้ยวนิล",path:3},rest:{name:"ศาลาน้ำซึม",x:-111,z:-22,radius:5},
   courts:[["โถงหินงอก",0,7,[40,42,45],"เงาหินงอก"],["ห้องเกล็ดนาค",-22,-16,[48,51],"บริวารนาค"],["โพรงแก้วนาคา",13,-40,[54,58],"พญาเกล็ดแก้ว"],
     ["โถงผลึกคราม",-68,6,[48,52],"พรายผลึกคราม"],["บัลลังก์เขี้ยวนาค",-96,-65,[58],"ผู้พิทักษ์เขี้ยวนิล","strong"]],
   walls:[wall(-40,-7,16,2),wall(-12,-7,29,2),wall(31,-7,10,2),wall(-14,-29,20,2),wall(23,-29,16,2),wall(-68,-39,25,3),wall(-99,-48,17,3),wall(-88,16,3,13),wall(-76,-72,15,3)],
   routes:[[[0,26],[0,7],[-18,1],[-18,-12],[-22,-16],[-20,-21],[15,-21],[15,-34],[13,-40],[0,-58]],[[0,7],[24,2],[24,-16],[15,-21]],[[-22,-16],[-24,-34],[0,-46],[13,-40]],
     [[0,26],[-25,36],[-48,31],[-59,20],[-68,6],[-80,0],[-83,-7],[-83,-11],[-83,-16],[-100,-16],[-111,-22],[-116,-37],[-112,-51],[-96,-65],[-78,-80],[-52,-85],[-33,-73],[-16,-65],[0,-58]],
     [[-22,-16],[-39,-22],[-56,-21],[-69,-23],[-100,-16]],[[13,-40],[-7,-47],[-29,-48],[-55,-58],[-77,-61],[-96,-65]]],
   pools:[wall(-131,-13,44,4),wall(-79,-13,34,4),wall(-127,-83,17,16),wall(-66,-99,23,8)],extraBridges:[[-83,-11]],
   marker:[26,-47],scatter:[[-10,9],[-33,-18],[2,-42],[35,-36],[-59,32],[-125,-45],[-54,-67],[-90,8]]},
  {id:"fallen_city",name:"เมืองอาคมล่ม",range:[55,72],hint:"จากประตูปากชลเลี้ยวเข้าถนนกลองนคร ผ่านโรงพิมพ์ยันต์และศาลาคนส่งสาร ลานกลองประกาศิตอยู่หลังแนวตึก เดินกลับทางหอนาฬิกาหรือออกประตูเหนือได้",
   bounds:{minX:-62,maxX:132,minZ:-110,maxZ:54},huntTrail:{name:"ถนนกลองนคร",path:4},rest:{name:"ศาลาคนส่งสาร",x:107,z:-18,radius:5},
   courts:[["ตลาดร้าง",-23,4,[55,58,61],"เงาพ่อค้า"],["ซอยตราผนึก",23,-16,[63,66],"ทหารตราแตก"],["จัตุรัสหอนาฬิกา",0,-43,[69,72],"ขุนเฝ้านคร"],
     ["ตรอกโรงพิมพ์ยันต์",69,8,[63,67],"พรายช่างพิมพ์ยันต์"],["ลานกลองประกาศิต",88,-69,[72],"ขุนกลองนครร้าง","strong"]],
   walls:[wall(-15,-10,9,8),wall(7,-9,8,8),wall(-16,-36,10,12),wall(8,-35,8,11),
     wall(41,8,11,10),wall(49,-12,10,9),wall(79,-8,12,11),wall(83,-42,10,12),wall(49,-47,12,7),wall(66,-70,8,10)],
   routes:[[[0,26],[0,4],[-23,4],[-23,-16],[0,-16],[23,-16],[23,-43],[0,-43],[0,-58]],[[0,4],[23,4],[23,-16]],[[0,4],[0,-43]],[[-23,-16],[-23,-43],[0,-43]],
     [[0,26],[31,26],[60,26],[69,21],[69,8],[69,-18],[88,-18],[107,-18],[107,-48],[88,-48],[88,-69],[88,-85],[60,-85],[34,-70],[20,-58],[0,-58]],
     [[23,-16],[35,-21],[69,-21],[69,8]],[[23,-43],[35,-54],[77,-54],[88,-69]]],
   marker:[-11,-49],scatter:[[-34,4],[34,-16],[11,-46],[-32,-30],[54,35],[118,-42],[73,-81],[42,-63]]},
  {id:"asura_peak",name:"เขาอสุรา",range:[68,85],hint:"ตามแสงเตาไปทางตะวันตกผ่านลานตีหอก พักที่เพิงช่างศิลา ก่อนเข้าปากเตาหลวง ทางเลียบผาพากลับไปประตูรอยแยก",
   bounds:{minX:-136,maxX:60,minZ:-115,maxZ:55},huntTrail:{name:"ทางเตาหลอมอสุรา",path:3},rest:{name:"เพิงช่างศิลา",x:-110,z:-23,radius:5},
   courts:[["ค่ายเชิงผา",-21,2,[68,71,73],"อสุราลาดตระเวน"],["ลานหอกเพลิง",20,-17,[75,78],"พลหอกอสุรา"],["แท่นสังเวย",-4,-43,[82,85],"องครักษ์เพลิง","strong"],
     ["ลานตีหอก",-71,8,[76,80],"ช่างหอกอสุรา"],["ปากเตาหลวง",-90,-76,[85],"นายเตาหลอมอสุรา","strong"]],
   walls:[wall(-12,-9,19,2),wall(-15,-30,25,2),
     wall(-83,-36,3,18),wall(-67,-39,18,3),wall(-106,-55,10,3),wall(-62,-69,12,3)],
   routes:[[[0,26],[-21,12],[-21,2],[-23,-16],[20,-17],[24,-34],[-4,-43],[0,-58]],[[0,26],[18,7],[20,-17]],[[-23,-16],[-28,-34],[-4,-43]],
     [[0,26],[-22,36],[-48,33],[-61,20],[-71,8],[-88,0],[-97,-11],[-110,-23],[-119,-36],[-113,-53],[-101,-67],[-90,-76],[-67,-88],[-44,-84],[-21,-65],[0,-58]],
     [[-23,-16],[-43,-20],[-54,-10],[-71,8]],[[-4,-43],[-12,-53],[-30,-49],[-51,-54],[-72,-58],[-90,-76]]],
   marker:[-16,-46],scatter:[[-33,2],[31,-17],[8,-47],[34,-37],[-56,14],[-118,-7],[-90,-48],[-45,-99]]},
  {id:"spirit_rift",name:"รอยแยกแดนวิญญาณ",range:[80,100],hint:"จากประตูเขาอสุราข้ามสะพานไปเกาะฝันค้าง พักที่ศาลาดาวหลงก่อนข้ามไปวงแหวนดาวดับ กลับประตูเดิมทางเกาะชั้นใน หรือแยกไปลานราชัน Lv.100",crossings:[-6,-29],
   bounds:{minX:-136,maxX:66,minZ:-118,maxZ:56},huntTrail:{name:"วงโคจรดาวหลง",path:4},rest:{name:"ศาลาดาวหลง",x:-108,z:-15,radius:5},
   extraBridges:[[-69,-4],[-102,-27]],pools:[wall(-129,-91,13,26),wall(-79,-107,26,9)],
   courts:[["เกาะเศษฝัน",-22,8,[80,83,86],"เงาเศษฝัน"],["สะพานดาราดับ",22,-17,[88,92],"ผู้กลืนแสง"],["วงผนึกสุดท้าย",0,-43,[96,100],"วิญญาณปลายกาล"],
     ["เกาะฝันค้าง",-69,-17,[90,94],"เงาฝันค้าง"],["วงแหวนดาวดับ",-87,-78,[98],"ผู้เฝ้าดาวดับ","strong"]],
   routes:[...islandRoutes.slice(1),islandRoutes[0].slice(0,-1),[[0,-43],[17,-43],[29,-50]],
     [[0,26],[-32,31],[-55,23],[-69,11],[-69,-4],[-69,-17],[-89,-17],[-108,-15],[-102,-22],[-102,-27],[-102,-44],[-91,-64],[-87,-78],[-66,-86],[-43,-72],[-26,-52],[-22,-36],[-22,-27],[-22,-17],[-22,-4],[-22,8],[-22,16],[0,26]],
     [[-22,-17],[-45,-16],[-69,-17]],[[-87,-78],[-54,-74],[-19,-60],[8,-57],[29,-50]]],
   marker:[-12,-49],scatter:[[-33,8],[33,-17],[8,-53],[35,-47],[-85,20],[-120,-44],[-59,-62],[-39,-93]]},
];

type GateEnd=readonly [string,number,number];
const edges:readonly (readonly [GateEnd,GateEnd])[]=[
  [["forbidden_forest",48,-84],["drowned_marsh",0,26]],
  [["bound_temple",32,-65],["moon_cemetery",-18,25]],
  [["drowned_marsh",0,-58],["moon_cemetery",18,25]],
  [["ritual_village",4,-16],["mantra_capital",0,26]],
  [["mantra_capital",-34,-14],["bamboo_frontier",0,26]],
  [["bamboo_frontier",0,-58],["moon_cemetery",-34,12]],
  [["moon_cemetery",0,-58],["moon_pass",0,26]],
  [["moon_pass",0,-58],["hex_ridge",0,26]],
  [["mantra_capital",0,-58],["moon_pass",-34,6]],
  [["mantra_capital",34,-14],["lotus_basin",0,26]],
  [["lotus_basin",0,-58],["river_watch",34,-14]],
  [["hex_ridge",0,-58],["naga_cavern",0,26]],
  [["naga_cavern",0,-58],["river_watch",0,26]],
  [["river_watch",0,-58],["fallen_city",0,26]],
  [["river_watch",-35,25],[RIVER_CITY,riverNodes.A.x,riverNodes.A.z]],
  ...(CASTLE_ENABLED ? [ [["fallen_city",0,-58],[CASTLE_ID,0,900]], [[CASTLE_ID,0,-900],["asura_peak",0,26]] ] as const : [ [["fallen_city",0,-58],["asura_peak",0,26]] ] as const),
  [["asura_peak",0,-58],["spirit_rift",0,26]],
];
export function atlasPortals(mapId:string): WorldPortal[] {
  const portals:WorldPortal[]=[];
  for(const [a,b] of edges){
    const source=a[0]===mapId?a:b[0]===mapId?b:undefined;
    if(!source)continue;
    const target=source===a?b:a;
    portals.push({id:source[0]+"_to_"+target[0],x:source[1],z:source[2],targetMapId:target[0],
      targetSpawn:{x:target[1],y:0,z:target[2]+(target[2]>0?-1.25:1.25)}});
  }
  return portals;
}
function channels(z:number,minX:number,maxX:number,bridges:number[]):WorldWall[] {
  let edge=minX;
  const water:WorldWall[]=[];
  for(const x of bridges.sort((a,b)=>a-b)){
    water.push(wall(edge,z,x-3.5-edge,4));edge=x+3.5;
  }
  water.push(wall(edge,z,maxX-edge,4));return water;
}
export const ATLAS_MAPS:Readonly<Record<string,WorldMapDefinition>>=Object.freeze(Object.fromEntries(regions.map(region=>{
  const portals=atlasPortals(region.id);
  const camps:HuntCamp[]=region.courts.map(([name,x,z,levels,,tier],i)=>({id:"court"+(i+1),name,x,z,levels,tier}));
  const bounds=region.bounds??{minX:-42,maxX:42,minZ:-65,maxZ:32};
  const province=PROVINCES[region.id];
  const bridges=[...(region.crossings??[]).flatMap(z=>{
    const local=province?.sites.filter(s=>s.kind==="bridge" && s.z===z+2);
    const xs=local?.length?local.map(s=>s.x):[-22,22];
    return xs.map(x=>({x,z:z+2}));
  }),...(region.extraBridges??[]).map(point)];
  const water=region.crossings?.flatMap(z=>channels(z,bounds.minX,bounds.maxX,bridges.filter(p=>p.z===z+2).map(p=>p.x)));
  const spawn=region.id==="moon_cemetery"?{x:0,y:0,z:21}:{x:0,y:0,z:24.75};
  const map:WorldMapDefinition={id:region.id,name:region.name,bounds,spawn,portals,camps,bridges,huntTrail:region.huntTrail,
    region:{range:region.range,hint:region.hint,noFlight:region.noFlight===true},
    restAreas:[{...spawn,radius:4.5,name:"ศาลพักทางเข้า"},...portals.filter(p=>Math.hypot(p.x-spawn.x,p.z-spawn.z)>4).map(p=>({x:p.x,z:p.z,radius:3.6,name:"ศาลประตู"})),...(region.rest?[region.rest]:[])],
    strategic:province,
    paths:region.routes.map(route=>route.map(point)),walls:region.walls,
    boss:region.id==="spirit_rift"?RIFT_WARDEN:undefined,
    water:region.pools?[...(water??[]),...region.pools]:water,
    obstacles:[{id:"landmark",...point(region.marker),radius:2.2},...region.scatter.map((p,i)=>({id:"relic-"+i,...point(p),radius:1.1}))]};
  return [map.id,map];
})));
export function isAtlasMap(id:string){return Object.prototype.hasOwnProperty.call(ATLAS_MAPS,id);}
export type AtlasSpawn={id:string;name:string;mapId:string;x:number;z:number;level:number;tier:"normal"|"strong"|"boss"};
export const ATLAS_SPAWNS:readonly AtlasSpawn[]=[
  ...regions.flatMap(region=>region.courts.flatMap(([,x,z,levels,name,tier],camp)=>
    levels.map((level,i):AtlasSpawn=>({id:`atlas_${region.id}_${camp+1}_${i+1}`,name,mapId:region.id,level,
      x:x+[-4,4,0][i],z:z+[-3,3,5][i],tier:tier??"normal"})))),
  {...RIFT_WARDEN,mapId:"spirit_rift",tier:"boss"},
];
export const ATLAS_TARGETS:ReadonlySet<string>=new Set(ATLAS_SPAWNS.map(s=>s.id));
