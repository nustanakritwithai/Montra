import type { WorldMapDefinition, WorldPortal, WorldWall } from "./WorldMaps.js";
import {CASTLE_ENABLED, CASTLE_ID, castleObjectives, forwardCamps} from "./CastlePilot.js";
import {RIVER_CITY,CITY_CELL,riverFacilities,riverGateSpecs,riverNodes,riverPaths,riverPosts,gridPoint} from "./RiverCity.js";

type Side="north"|"south"|"east"|"west";
type Opening=readonly [side:Side,at:number,span:number,name:string];
type StairSpec=readonly [side:Side,at:number];
function enclosure(x1:number,x2:number,z1:number,z2:number,openings:Opening[],stairs:StairSpec[],thickness=2.8,stairRun=6){
  const height=4;
  function strip(side:Side,a:number,b:number):WorldWall{
    const horizontal=side==="north"||side==="south";
    const fixed=side==="north"?z1:side==="south"?z2:side==="west"?x1:x2;
    return horizontal?{x:a,z:fixed-thickness/2,width:b-a,length:thickness}:{x:fixed-thickness/2,z:a,width:thickness,length:b-a};
  }
  const deck:WorldWall[]=[],bodies:WorldWall[]=[],gates:{id:string;side:Side;name:string;box:WorldWall}[]=[];
  for(const side of ["south","north","east","west"] as const){
    const horizontal=side==="south"||side==="north",start=(horizontal?x1:z1)-thickness/2,end=(horizontal?x2:z2)+thickness/2;
    deck.push(strip(side,start,end));let cursor=start;
    for(const [,at,span,name] of openings.filter(g=>g[0]===side).sort((a,b)=>a[1]-b[1])){
      bodies.push(strip(side,cursor,at-span/2));gates.push({id:side+"-"+at,side,name,box:strip(side,at-span/2,at+span/2)});cursor=at+span/2;
    }
    bodies.push(strip(side,cursor,end));
  }
  const steps=stairs.map(([side,at],i)=>{
    const top={x:side==="west"?x1:side==="east"?x2:at,z:side==="north"?z1:side==="south"?z2:at};
    const foot={x:top.x+(side==="west"?stairRun:side==="east"?-stairRun:0),z:top.z+(side==="north"?stairRun:side==="south"?-stairRun:0)};
    return {id:"wall-stair-"+i,foot,top};
  });
  return {height,deck,bodies,gates,stairs:steps,corners:[{x:x1,z:z1},{x:x2,z:z1},{x:x2,z:z2},{x:x1,z:z2}]};
}
export type Rampart=ReturnType<typeof enclosure>;
function grandWalls():Rampart {
  const rings=[
    enclosure(-200,200,-231,189,[["south",0,16,"ประตูสะพานใต้"],["west",35,16,"ประตูท่าน้ำ"],["east",35,16,"ประตูช่องเขา"],["north",0,16,"ประตูส่งกำลังเหนือ"]],
      [["west",-144],["west",124],["east",-144],["east",124],["north",-86],["north",86],["south",-86],["south",86]]),
    enclosure(-126,126,-165,93,[["south",0,14,"ประตูลานกลอง"],["west",-30,14,"ประตูคลังหลวง"],["east",-30,14,"ประตูโรงช่าง"]],
      [["west",-105],["east",-105],["north",-49],["north",49],["south",-51],["south",51]]),
    enclosure(-58,58,-115,0,[["west",-61,12,"ประตูพระราชฐานตะวันตก"],["east",-61,12,"ประตูพระราชฐานตะวันออก"]],
      [["west",-95],["east",-25],["north",-19],["south",19]])
  ];
  return {height:4,deck:rings.flatMap(r=>r.deck),corners:rings.flatMap(r=>r.corners),
    gates:rings.flatMap((r,i)=>r.gates.map(g=>({...g,id:["outer","middle","inner"][i]+"-"+g.side}))),
    bodies:rings.flatMap(r=>r.bodies),stairs:rings.flatMap((r,ring)=>r.stairs.map((s,i)=>({...s,id:"castle-"+ring+"-stair-"+i})))};
}
function riverWalls():Rampart{
  const rings=[[4,26,3,18],[12,21,6,12]].map(([west,east,north,south],i)=>{
    const nw=gridPoint(west,north),se=gridPoint(east,south);
    const gates=riverGateSpecs.filter(g=>g.ring===i);
    const stairs:StairSpec[]=i===0?[["south",gridPoint(6,18).x],["north",gridPoint(24,3).x]]:[["south",gridPoint(14,12).x],["north",gridPoint(19,6).x]];
    const r=enclosure(nw.x,se.x,nw.z,se.z,gates.map(g=>[g.side,g.at,12,g.name]),stairs,6,CITY_CELL);
    return {...r,gates:r.gates.map(g=>({...g,id:gates.find(s=>s.side===g.side)!.id})),
      stairs:r.stairs.map((s,j)=>({...s,id:"b01-stair-"+(i*2+j+1)}))};
  });
  return {height:4,deck:rings.flatMap(r=>r.deck),corners:rings.flatMap(r=>r.corners),gates:rings.flatMap(r=>r.gates),
    bodies:rings.flatMap(r=>r.bodies),stairs:rings.flatMap(r=>r.stairs)};
}
const ramparts={
  mantra_capital:enclosure(-34,34,-58,26,[["south",0,10,"ประตูหมู่บ้าน"],["north",0,10,"ประตูด่านจันทร์"],["west",-14,10,"ประตูดงไผ่"],["east",-14,10,"ประตูบัวนาค"]],[["west",-30],["east",-28],["south",15],["north",-14]]),
  moon_pass:enclosure(2,22,-44,-28,[["south",12,6,"ประตูเมืองจันทรา"],["east",-36,6,"ประตูข้างเหมือง"]],[["west",-37],["east",-31]]),
  river_watch:enclosure(-30,-8,-40,-20,[["south",-18,7,"ประตูเมืองปากชล"],["north",-22,8,"ประตูท่าเรือ"]],[["west",-29],["east",-34]]),
};
export function wallRing(r:Rampart,x:number,z:number){
  // The deck slabs overlap at corners so the wall can be walked as a complete loop.
  return Math.floor(r.deck.findIndex(b=>x>=b.x+.16 && x<=b.x+b.width-.16 && z>=b.z+.16 && z<=b.z+b.length-.16)/4);
}
export function onRampart(r:Rampart,x:number,z:number){
  return wallRing(r,x,z)>=0;
}

export function crestCorners(r:Rampart,from:{x:number;z:number},to:{x:number;z:number}){
  const points=[from,...r.corners,to],last=points.length-1,dist=points.map(()=>Infinity),prev=points.map(()=>-1);
  const pending=new Set(points.map((_,i)=>i));dist[0]=0;
  const inside=(p:typeof from,b:WorldWall)=>p.x>=b.x+.16 && p.x<=b.x+b.width-.16 && p.z>=b.z+.16 && p.z<=b.z+b.length-.16;
  while(pending.size){
    const i=[...pending].reduce((a,b)=>dist[a]<dist[b]?a:b);
    pending.delete(i);if(i===last)break;
    for(const j of pending)if(r.deck.some(b=>inside(points[i],b)&&inside(points[j],b))){
      const d=dist[i]+Math.hypot(points[i].x-points[j].x,points[i].z-points[j].z);
      if(d<dist[j]){dist[j]=d;prev[j]=i;}
    }
  }
  const waypoints:typeof from[]=[];
  for(let i=prev[last];i>0;i=prev[i])waypoints.unshift(points[i]);
  return waypoints;
}
type XY = readonly [number, number];
export type ProvinceSite = Readonly<{
  kind:"palace"|"market"|"tower"|"fort"|"mine"|"port"|"bridge"|"grove"|"shrine";
  name:string; x:number; z:number; direction?:"east";
}>;
export type Province = Readonly<{
  kind:"capital"|"territory"|"hunting"; hint:string; sites:readonly ProvinceSite[];
  safeRoads?:readonly number[];railPath?:number;rampart?:Rampart;
  huntTrail?:Readonly<{name:string;path:number}>;
  riverCity?:Readonly<{facilities:typeof riverFacilities;nodes:typeof riverNodes;posts:typeof riverPosts}>;
  objectives?:typeof castleObjectives;activeObjectives?:readonly number[];forwardCamps?:typeof forwardCamps;
  relay?:Readonly<{name:string;x:number;z:number;radius:number;effect:"gate"|"banner"}>;
}>;
const site=(kind:ProvinceSite["kind"],name:string,x:number,z:number,direction?:"east"):ProvinceSite=>({kind,name,x,z,direction});
const wall=(x:number,z:number,width:number,length:number):WorldWall=>({x,z,width,length});
const trails=(...routes:XY[][])=>routes.map(route=>route.map(([x,z])=>({x,z})));

export const PROVINCES:Readonly<Record<string,Province>>={
  [RIVER_CITY]:{kind:"territory",rampart:riverWalls(),riverCity:{facilities:riverFacilities,nodes:riverNodes,posts:riverPosts},
    hint:"จากค่ายใต้ข้ามสะพานไม้สองฝั่ง คุมตลาดหรือคลังแล้วเข้าลานบัญชาการทางประตูใต้หรือประตูข้าง",
    sites:[{kind:"fort",name:"ลานบัญชาการ",...riverNodes.T},{kind:"market",name:"ตลาดท่าเรือ",...riverNodes.M},
      {kind:"port",name:"คลังเสบียง",...riverNodes.S},{kind:"mine",name:"โรงช่าง",...riverNodes.F},
      {kind:"shrine",name:"บ่อน้ำสามลาน",...riverNodes.W},{kind:"grove",name:"ค่ายบุกใต้",...riverNodes.A},
      {kind:"grove",name:"ค่ายรับชั้นใน",...riverNodes.D},{kind:"bridge",name:"สะพานท่าตะวันตก",...gridPoint(8,21)},
      {kind:"bridge",name:"สะพานตลาดตะวันออก",...gridPoint(22,21)}]},
  ...(CASTLE_ENABLED?{[CASTLE_ID]:{kind:"territory" as const,rampart:grandWalls(),safeRoads:[0],objectives:castleObjectives,forwardCamps,
    activeObjectives:castleObjectives.map(p=>p.id),hint:"เปิดศึกที่ธงใต้ · แบ่งกำลังชิงหกจุด แล้วเปิดทางเข้าท้องพระโรงในนาทีที่ 30",
    sites:[site("fort","ธงรวมพลไตรเวียง",0,308),site("bridge","สะพานขบวนเสบียง",0,221),
      site("port","ท่าน้ำตะวันตก",-245,35),site("shrine","ช่องเขาตะวันออก",277,35),site("market","คลังเสบียงหลวง",-96,-39),
      site("tower","หอกลองหลวง",9,54),site("mine","โรงช่างประตู",95,-39),site("palace","มหาปราสาทไตรเวียง",0,-76)]}}:{}),
  mantra_capital:{kind:"capital",rampart:ramparts.mantra_capital,hint:"ลานพระนครเชื่อมหมู่บ้าน สองเขตล่า และด่านจันทรา",sites:[
    site("palace","คุ้มหลวงเวียงมนตรา",0,-35),site("market","ตลาดสี่ประตู",-16,1),
    site("tower","หอกลองประกาศ",17,-14),site("shrine","ศาลหลักเมือง",0,-14)]},
  moon_pass:{kind:"territory",rampart:ramparts.moon_pass,hint:"ข้ามสะพานรางแร่ไปโรงคัดแร่ทางตะวันออก แล้วเลาะช่องขนเงินกลับประตูข้างเหมือง ห้องโลกมีรถรางขึ้นลงเหมือง",safeRoads:[0,1],
    railPath:4,relay:{name:"โรงคัดแร่จันทร์",x:82,z:-58,radius:4,effect:"gate"},sites:[
    site("fort","ลานธงจันทรา",12,-36),site("market","ตลาดชายด่าน",-24,-20),site("mine","เหมืองเงินจันทร์",32,-25),
    site("bridge","สะพานตลาด",-30,-4),site("bridge","สะพานเสบียง",0,-4),site("bridge","ทางข้ามเหมือง",27,-4),
    site("bridge","สะพานรางแร่",76,-4),site("mine","ลานแต่งแร่",88,-61),site("shrine","ศาลช่องขนเงิน",49,-89)]},
  river_watch:{kind:"territory",rampart:ramparts.river_watch,hint:"เลียบคุ้งตะวันตกไปลานเสบียงริมน้ำ หรือข้ามสะพานต้นน้ำย้อนเข้าประตูท่าเรือ ห้องโลกมีเรือข้ามคุ้งสองทาง",safeRoads:[0,1],
    relay:{name:"ลานเสบียงคุ้งนอก",x:-67,z:-56,radius:4,effect:"banner"},sites:[
    site("fort","ลานธงปากชล",-18,-29),site("port","ท่าเรือลำเลียง",-23,-49),site("market","ตลาดท่าข้าว",24,9),
    site("bridge","สะพานท่าน้ำ",-4,12,"east"),site("bridge","สะพานคลังเสบียง",-4,-14,"east"),site("bridge","สะพานท่าลับ",-4,-46,"east"),
    site("bridge","สะพานต้นน้ำ",-4,-83,"east"),site("bridge","สะพานคุ้งแพ",-82,16),
    site("port","ยุ้งข้าวริมน้ำ",-73,-61),site("grove","ชายเลนคุ้งนอก",-89,24)]},
  bamboo_frontier:{kind:"hunting",huntTrail:{name:"ทางพรานตะวันตก",path:3},hint:"จากประตูเวียง เลี้ยวตะวันตกเข้าลานไผ่คราม พักที่เพิงพรานตาน้ำ แล้วอ้อมดงไผ่ผนึกกลับประตูป่าช้า",sites:[
    site("grove","แนวไผ่บังตา",-31,5),site("tower","หอส่องทาง",30,-22),site("shrine","ศาลปลายดง",-12,-46)]},
  lotus_basin:{kind:"hunting",huntTrail:{name:"ทางเกาะตะวันออก",path:3},hint:"จากประตูเวียง ไปสะพานเกาะบัวเพลิง พักที่ศาลาคุ้งบัว แล้วข้ามสะพานไข่มุกไปลานนาคน้ำลึกก่อนกลับประตูปากชล",sites:[
    site("port","ศาลาท่าบัว",32,-18),site("grove","ดงบัวธูป",-34,7),site("shrine","บ่อนาคหลับ",-9,-50),
    site("bridge","สะพานบ่อตะวันตก",-22,-4),site("bridge","สะพานคุ้งเรือ",22,-4),site("bridge","สะพานเกาะบัวเพลิง",72,-4),
    site("bridge","สะพานเกล็ดนาค",-22,-27),site("bridge","สะพานท่าบัว",22,-27),site("bridge","สะพานไข่มุก",104,-27)]},
};

type Hub = Pick<WorldMapDefinition,"name"|"paths"|"water"|"walls"|"obstacles"> & {
  bounds?:WorldMapDefinition["bounds"];
  stations?:readonly [readonly [id:string,x:number,z:number,label:string],readonly [id:string,x:number,z:number,label:string]];
};
const hubs:Record<string,Hub>={
  mantra_capital:{name:"นครเวียงมนตรา",paths:trails([[0,26],[0,-14],[0,-58]],[[-34,-14],[0,-14],[34,-14]],
    [[0,12],[-17,8],[-22,-14],[-16,-32],[0,-40],[18,-32],[22,-14],[18,8],[0,12]]),
    walls:[wall(-16,-45,6,5),wall(10,-45,6,5),wall(-15,-4,7,3),wall(9,-5,7,4),wall(24,-25,4,4)],obstacles:[]},
  moon_pass:{name:"ด่านผนึกจันทรา",bounds:{minX:-58,maxX:122,minZ:-106,maxZ:66},
    stations:[["moon_cart_up",41,17,"ขึ้นรถรางไปเหมืองบน"],["moon_cart_down",93,-76,"นั่งรถรางกลับลานล่าง"]],
    paths:trails([[0,26],[-30,16],[-30,6],[-30,-45],[0,-58]],[[-30,6],[-34,6]],
    [[0,26],[0,10],[0,-4],[0,-18],[12,-24],[12,-36]],[[0,10],[20,10],[27,0],[27,-25],[27,-36],[12,-36]],
    [[41,17],[57,23],[77,36],[82,22],[76,8],[76,-4],[76,-22],[83,-40],[82,-58],[93,-76]],
    [[27,-25],[29,-30],[43,-29],[61,-24],[76,-22]],[[93,-76],[73,-89],[48,-84],[26,-66],[0,-58]],
    [[20,10],[41,17]],[[82,-58],[61,-51],[42,-48],[27,-36]],[[0,26],[22,39],[48,42],[77,36]]),
    water:[wall(-58,-6,25,4),wall(-27,-6,24,4),wall(3,-6,21,4),wall(30,-6,43,4),wall(79,-6,43,4)],
    walls:[wall(31,-26,4,3),wall(46,-44,8,3),wall(62,-14,6,3),wall(93,-65,7,2.5)],
    obstacles:[{id:"moon-scree",x:96,z:-41,radius:3.8},{id:"moon-tailings",x:60,z:-65,radius:3.4},{id:"moon-south-rock",x:58,z:11,radius:2.3}]},
  river_watch:{name:"ป้อมท่าปากชล",bounds:{minX:-110,maxX:80,minZ:-124,maxZ:58},
    stations:[["river_ferry_out",-35,18,"ลงเรือไปท่าคุ้งนอก"],["river_ferry_home",-90,-91,"ลงเรือกลับท่าตลาด"]],
    paths:trails([[0,26],[30,16],[30,-14],[30,-44],[0,-58]],[[30,-14],[34,-14]],
    [[30,-14],[-12,-14],[-18,-21],[-18,-29]],[[30,-44],[10,-46],[-18,-46],[-27,-32],[-18,-29]],
    [[0,26],[0,12],[-18,12],[-22,-14],[-12,-14]],
    [[-18,12],[-35,18],[-35,25],[-56,32],[-82,25],[-82,16],[-82,8],[-87,8],[-84,-13],[-72,-35],[-67,-56]],
    [[-18,-46],[-38,-48],[-50,-55],[-67,-56]],
    [[-67,-56],[-82,-72],[-90,-91],[-69,-104],[-41,-101],[-21,-83],[-4,-83],[16,-83],[28,-64],[30,-44]],
    [[-72,-35],[-55,-24],[-43,-23],[-37,-30],[-38,-48]],[[30,16],[50,20],[59,3],[54,-23],[30,-44]]),
    water:[wall(-6,-124,4,38),wall(-6,-80,4,31),wall(-6,-43,4,26),wall(-6,-11,4,20),wall(-6,15,4,43),
      wall(-109,-99,15,133),wall(-94,-70,12,37),wall(-75,-19,13,28),
      wall(-94,14,9,4),wall(-79,14,25,4),wall(-54,12,16,8)],
    walls:[wall(-60,-47,7,3),wall(-82,-64,5,2.5),wall(45,-24,5,3)],
    obstacles:[{id:"river-west-mangrove",x:-54,z:-78,radius:3},{id:"river-bank",x:-86,z:39,radius:2.5},{id:"river-reeds",x:64,z:-50,radius:2}]},
};
function makeCastle(portalsFor:(id:string)=>WorldPortal[]):WorldMapDefinition {
  const province=PROVINCES[CASTLE_ID],r=province.rampart!;
  const portals:WorldPortal[]=[...portalsFor(CASTLE_ID),
    {id:"castle_cart_north",label:"ขึ้นเกวียนไปประตูเหนือ",x:-18,z:315,targetMapId:CASTLE_ID,targetSpawn:{x:-18,y:0,z:-313}},
    {id:"castle_cart_south",label:"ขึ้นเกวียนไปประตูใต้",x:-18,z:-315,targetMapId:CASTLE_ID,targetSpawn:{x:-18,y:0,z:313}}];
  return {id:CASTLE_ID,name:"มหาปราสาทไตรเวียง",bounds:{minX:-350,maxX:350,minZ:-350,maxZ:350},spawn:{x:0,y:0,z:313},
    strategic:province,portals,obstacles:[],camps:[],restAreas:portals.map(p=>({x:p.x,z:p.z,radius:6,name:"เขตพักประตู"})),
    walls:[...r.bodies.map(b=>({...b,rampart:true})),wall(-10,-87,20,9),wall(-22,-77,8,5),wall(14,-77,8,5),
      ...forwardCamps.map(c=>wall(c.x-4,c.z-6,8,1.5))],
    water:[wall(-93,219,88,4),wall(5,219,90,4),wall(-261,-53,6,83),wall(-261,40,6,83)],
    paths:trails([[0,315],[-189,315],[-306,289],[-306,-285],[-193,-315],[0,-315]],
      [[0,315],[0,221],[0,189],[0,122],[0,93],[0,54]],[[0,277],[-103,261],[-219,227],[-240,205],[-238,35]],
      [[0,277],[103,261],[219,227],[240,205],[270,35]],
      [[-238,35],[-200,35],[-159,31],[-147,-30],[-126,-30],[-88,-39]],
      [[270,35],[200,35],[159,31],[147,-30],[126,-30],[88,-39]],
      [[-159,31],[-140,102],[0,122],[140,102],[159,31]],
      [[-88,-39],[-81,29],[0,54],[81,29],[88,-39]],
      [[-88,-39],[-75,-61],[-58,-61],[0,-61],[58,-61],[75,-61],[88,-39]],
      [[0,-315],[0,-231],[0,-184],[-140,-184],[-147,-30]],[[0,-184],[140,-184],[147,-30]])};
}
export function makeHubs(portalsFor:(id:string)=>WorldPortal[]):Record<string,WorldMapDefinition>{
  const small=Object.fromEntries(Object.entries(hubs).map(([id,{stations,bounds,...data}])=>{
    const portals=portalsFor(id);
    stations?.forEach(([stop,x,z,label],i)=>{
      const [,tx,tz]=stations[1-i];
      portals.push({id:stop,x,z,label,targetMapId:id,targetSpawn:{x:tx,y:0,z:tz+1.25}});
    });
    const province=PROVINCES[id];
    return [id,{...data,id,strategic:province,walls:[...data.walls??[],...province.rampart!.bodies.map(b=>({...b,rampart:true}))],bounds:bounds??{minX:-42,maxX:42,minZ:-65,maxZ:32},spawn:{x:0,y:0,z:25},
      portals,restAreas:[...portals.map(p=>({x:p.x,z:p.z,radius:4,name:"เขตพักประตู"})),
        ...PROVINCES[id].sites.filter(s=>s.kind==="market" && PROVINCES[id].kind==="territory").map(s=>({x:s.x,z:s.z,radius:5,name:"เขตพักตลาด"}))],camps:[] as const}];
  }));
  const river:WorldMapDefinition={id:RIVER_CITY,name:"เวียงปากน้ำสามลาน",bounds:{minX:-248,maxX:248,minZ:-200,maxZ:200},
    spawn:{...riverNodes.A,y:0},portals:portalsFor(RIVER_CITY),obstacles:[],camps:[],strategic:PROVINCES[RIVER_CITY],
    restAreas:[{...riverNodes.A,radius:4,name:"ค่ายบุกใต้"},{...riverNodes.D,radius:4,name:"ค่ายรับชั้นใน"}],
    walls:[...PROVINCES[RIVER_CITY].rampart!.bodies.map(w=>({...w,rampart:true})),...riverFacilities.map(p=>wall(p.x-CITY_CELL/2,p.z-CITY_CELL/2,CITY_CELL,CITY_CELL))],
    water:[wall(-248,136,128,16),wall(-104,136,208,16),wall(120,136,128,16)],paths:riverPaths};
  return {...small,[RIVER_CITY]:river,...(CASTLE_ENABLED?{[CASTLE_ID]:makeCastle(portalsFor)}:{})};
}
