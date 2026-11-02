import type { WorldMapDefinition, WorldPortal, WorldWall } from "./WorldMaps.js";

type Side="north"|"south"|"east"|"west";
type Opening=readonly [side:Side,at:number,span:number,name:string];
type StairSpec=readonly [side:Side,at:number];
function enclosure(x1:number,x2:number,z1:number,z2:number,openings:Opening[],stairs:StairSpec[]){
  const thickness=2.8,height=4;
  function strip(side:Side,a:number,b:number):WorldWall{
    const horizontal=side==="north"||side==="south";
    const fixed=side==="north"?z1:side==="south"?z2:side==="west"?x1:x2;
    return horizontal?{x:a,z:fixed-thickness/2,width:b-a,length:thickness}:{x:fixed-thickness/2,z:a,width:thickness,length:b-a};
  }
  const deck:WorldWall[]=[],bodies:WorldWall[]=[],gates:{name:string;box:WorldWall}[]=[];
  for(const side of ["south","north","east","west"] as const){
    const horizontal=side==="south"||side==="north",start=(horizontal?x1:z1)-thickness/2,end=(horizontal?x2:z2)+thickness/2;
    deck.push(strip(side,start,end));let cursor=start;
    for(const [,at,span,name] of openings.filter(g=>g[0]===side).sort((a,b)=>a[1]-b[1])){
      bodies.push(strip(side,cursor,at-span/2));gates.push({name,box:strip(side,at-span/2,at+span/2)});cursor=at+span/2;
    }
    bodies.push(strip(side,cursor,end));
  }
  const steps=stairs.map(([side,at],i)=>{
    const top={x:side==="west"?x1:side==="east"?x2:at,z:side==="north"?z1:side==="south"?z2:at};
    const foot={x:top.x+(side==="west"?6:side==="east"?-6:0),z:top.z+(side==="north"?6:side==="south"?-6:0)};
    return {id:"wall-stair-"+i,foot,top};
  });
  return {height,deck,bodies,gates,stairs:steps,corners:[{x:x1,z:z1},{x:x2,z:z1},{x:x2,z:z2},{x:x1,z:z2}]};
}
export type Rampart=ReturnType<typeof enclosure>;
const ramparts={
  mantra_capital:enclosure(-34,34,-58,26,[["south",0,10,"ประตูหมู่บ้าน"],["north",0,10,"ประตูด่านจันทร์"],["west",-14,10,"ประตูดงไผ่"],["east",-14,10,"ประตูบัวนาค"]],[["west",-30],["east",-28],["south",15],["north",-14]]),
  moon_pass:enclosure(2,22,-44,-28,[["south",12,6,"ประตูเมืองจันทรา"],["east",-36,6,"ประตูข้างเหมือง"]],[["west",-37],["east",-31]]),
  river_watch:enclosure(-30,-8,-40,-20,[["south",-18,7,"ประตูเมืองปากชล"],["north",-22,8,"ประตูท่าเรือ"]],[["west",-29],["east",-34]]),
};
export function onRampart(r:Rampart,x:number,z:number){
  // The deck slabs overlap at corners so the wall can be walked as a complete loop.
  return r.deck.some(b=>x>=b.x+.16 && x<=b.x+b.width-.16 && z>=b.z+.16 && z<=b.z+b.length-.16);
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
  safeRoads?:readonly number[];rampart?:Rampart;
}>;
const site=(kind:ProvinceSite["kind"],name:string,x:number,z:number,direction?:"east"):ProvinceSite=>({kind,name,x,z,direction});
const wall=(x:number,z:number,width:number,length:number):WorldWall=>({x,z,width,length});
const trails=(...routes:XY[][])=>routes.map(route=>route.map(([x,z])=>({x,z})));

export const PROVINCES:Readonly<Record<string,Province>>={
  mantra_capital:{kind:"capital",rampart:ramparts.mantra_capital,hint:"ลานพระนครเชื่อมหมู่บ้าน สองเขตล่า และด่านจันทรา",sites:[
    site("palace","คุ้มหลวงเวียงมนตรา",0,-35),site("market","ตลาดสี่ประตู",-16,1),
    site("tower","หอกลองประกาศ",17,-14),site("shrine","ศาลหลักเมือง",0,-14)]},
  moon_pass:{kind:"territory",rampart:ramparts.moon_pass,hint:"ประตูเมืองอยู่ตรงสะพานเสบียง ทางเหมืองอ้อมเข้าประตูข้าง บันไดด้านในขึ้นเดินรอบกำแพงได้",safeRoads:[0,1],sites:[
    site("fort","ลานธงจันทรา",12,-36),site("market","ตลาดชายด่าน",-24,-20),site("mine","เหมืองเงินจันทร์",32,-25),
    site("bridge","สะพานตลาด",-30,-4),site("bridge","สะพานเสบียง",0,-4),site("bridge","ทางข้ามเหมือง",27,-4)]},
  river_watch:{kind:"territory",rampart:ramparts.river_watch,hint:"ประตูเมืองคุมทางสะพานเสบียง ประตูท่าเรืออยู่ด้านหลัง ขึ้นลงกำแพงได้ทั้งฝั่งตะวันตกและตะวันออก",safeRoads:[0,1],sites:[
    site("fort","ลานธงปากชล",-18,-29),site("port","ท่าเรือลำเลียง",-23,-49),site("market","ตลาดท่าข้าว",24,9),
    site("bridge","สะพานท่าน้ำ",-4,12,"east"),site("bridge","สะพานคลังเสบียง",-4,-14,"east"),site("bridge","สะพานท่าลับ",-4,-46,"east")]},
  bamboo_frontier:{kind:"hunting",hint:"ตามธงจากเวียงผ่านค่ายไผ่ หรือเลาะป่าตะวันออกไปป่าช้า",sites:[
    site("grove","แนวไผ่บังตา",-31,5),site("tower","หอส่องทาง",30,-22),site("shrine","ศาลปลายดง",-12,-46)]},
  lotus_basin:{kind:"hunting",hint:"ล่าภูตตามบ่อบัว ข้ามสะพานตะวันตกหรือตะวันออกไปท่าปากชล",sites:[
    site("port","ศาลาท่าบัว",32,-18),site("grove","ดงบัวธูป",-34,7),site("shrine","บ่อนาคหลับ",-9,-50)]},
};

type Hub = Pick<WorldMapDefinition,"name"|"paths"|"water"|"walls"|"obstacles">;
const hubs:Record<string,Hub>={
  mantra_capital:{name:"นครเวียงมนตรา",paths:trails([[0,26],[0,-14],[0,-58]],[[-34,-14],[0,-14],[34,-14]],
    [[0,12],[-17,8],[-22,-14],[-16,-32],[0,-40],[18,-32],[22,-14],[18,8],[0,12]]),
    walls:[wall(-16,-45,6,5),wall(10,-45,6,5),wall(-15,-4,7,3),wall(9,-5,7,4),wall(24,-25,4,4)],obstacles:[]},
  moon_pass:{name:"ด่านผนึกจันทรา",paths:trails([[0,26],[-30,16],[-30,6],[-30,-45],[0,-58]],[[-30,6],[-34,6]],
    [[0,26],[0,10],[0,-4],[0,-18],[12,-24],[12,-36]],[[0,10],[20,10],[27,0],[27,-25],[27,-36],[12,-36]]),
    water:[wall(-42,-6,9,4),wall(-27,-6,24,4),wall(3,-6,21,4),wall(30,-6,12,4)],
    walls:[wall(31,-26,4,3)],obstacles:[]},
  river_watch:{name:"ป้อมท่าปากชล",paths:trails([[0,26],[30,16],[30,-14],[30,-44],[0,-58]],[[30,-14],[34,-14]],
    [[30,-14],[-12,-14],[-18,-21],[-18,-29]],[[30,-44],[10,-46],[-18,-46],[-27,-32],[-18,-29]],
    [[0,26],[0,12],[-18,12],[-22,-14],[-12,-14]]),
    water:[wall(-6,-65,4,16),wall(-6,-43,4,26),wall(-6,-11,4,20),wall(-6,15,4,17)],
    walls:[],obstacles:[]},
};
export function makeHubs(portalsFor:(id:string)=>WorldPortal[]):Record<string,WorldMapDefinition>{
  return Object.fromEntries(Object.entries(hubs).map(([id,data])=>{
    const portals=portalsFor(id);
    const province=PROVINCES[id];
    return [id,{...data,id,strategic:province,walls:[...data.walls??[],...province.rampart!.bodies.map(b=>({...b,rampart:true}))],bounds:{minX:-42,maxX:42,minZ:-65,maxZ:32},spawn:{x:0,y:0,z:25},
      portals,restAreas:[...portals.map(p=>({x:p.x,z:p.z,radius:4,name:"เขตพักประตู"})),
        ...PROVINCES[id].sites.filter(s=>s.kind==="market" && PROVINCES[id].kind==="territory").map(s=>({x:s.x,z:s.z,radius:5,name:"เขตพักตลาด"}))],camps:[] as const}];
  }));
}
