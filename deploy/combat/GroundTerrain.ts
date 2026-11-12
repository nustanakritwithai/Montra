import type { WorldMapDefinition, WorldPortal, WorldWall } from "./WorldMaps.js";

export const RIDGE_PASS = "twin_neck_pass";
export const RIDGE_ENABLED = process.env.MONTRA_RIDGE_TERRAIN === "1";
type XZ = {x:number; z:number};
type Point = XZ & {y:number};
export type GroundTerrain = { xs:number[]; zs:number[]; heights:number[][]; maxGrade:number };
const xs = [-279,-114,-104,-86,-76,-17,-10,10,17,76,86,104,114,279];
const zs = [-225,-36,-33,-12,42,45,66,225];
const rise = (z:number,foot:number,top:number) => 3*Math.max(0,Math.min(1,(foot-z)/(foot-top)));
// Triangulated terraces. The center saddle links both levels; each also has a flank ramp.
export const ridgeTerrain:GroundTerrain = {xs,zs,maxGrade:.52,heights:zs.map(z=>xs.map(x=>{
  const center=Math.abs(x)<=10;
  return rise(z,center || (x>=-104 && x<=-86)?66:45,42) +
    rise(z,center || (x>=86 && x<=104)?-12:-33,-36);
}))};

const interval=(cuts:number[],v:number)=>{
  const next=cuts.findIndex(n=>n>v);
  return next<0?cuts.length-2:Math.max(0,next-1);
};
export function groundSample(t:GroundTerrain,x:number,z:number){
  const i=interval(t.xs,x),j=interval(t.zs,z);
  const dx=t.xs[i+1]-t.xs[i],dz=t.zs[j+1]-t.zs[j];
  const u=(x-t.xs[i])/dx,v=(z-t.zs[j])/dz;
  const a=t.heights[j][i],b=t.heights[j][i+1],c=t.heights[j+1][i],d=t.heights[j+1][i+1];
  const du=u>=v?b-a:d-c,dv=u>=v?d-b:c-a;
  return {height:a+du*u+dv*v,grade:Math.hypot(du/dx,dv/dz)};
}

const WATER_LEVEL = .025;
const SHORE_HEIGHT = -.025;
const MAX_WATER_DEPTH = 1.45;

function containsWaterArea(area:WorldWall,x:number,z:number):boolean {
  return x>=area.x && x<=area.x+area.width && z>=area.z && z<=area.z+area.length;
}

export function waterDepthAt(map:WorldMapDefinition,x:number,z:number):number {
  if(map.waterLevel===undefined || !map.terrain || x<map.bounds.minX || x>map.bounds.maxX ||
      z<map.bounds.minZ || z>map.bounds.maxZ || !map.water?.some(area=>containsWaterArea(area,x,z)))return 0;
  const bed=groundSample(map.terrain,x,z).height;
  return bed<SHORE_HEIGHT ? map.waterLevel-bed : 0;
}

// Split the perimeter of the union so adjoining rectangles share a bed.
function shoreline(waters:readonly WorldWall[],vertical:boolean) {
  const spans=waters.map(w=>vertical?[w.x,w.x+w.width,w.z,w.z+w.length]:[w.z,w.z+w.length,w.x,w.x+w.width]);
  const edges:{at:number;start:number;end:number}[]=[];
  for(const [lo,hi,start,end] of spans)for(const at of [lo,hi]){
    const overlaps=spans.filter(([a,b,c,d])=>
      (at===lo ? a<at && b>=at : a<=at && b>at) && c<end && d>start).sort((a,b)=>a[2]-b[2]);
    let cursor=start;
    for(const [, ,a,b] of overlaps){
      if(a>cursor)edges.push({at,start:cursor,end:a});
      cursor=Math.max(cursor,b);
    }
    if(cursor<end)edges.push({at,start:cursor,end});
  }
  return edges;
}

export function waterTerrain(map:WorldMapDefinition) {
  const waters=map.water;
  if(!waters?.length)return {};
  const {minX,maxX,minZ,maxZ}=map.bounds;
  const cuts=(axis:"x"|"z",min:number,max:number,existing:number[]|undefined)=>{
    const points=new Set([min,max,...existing??[]]);
    for(const area of waters){
      const start=area[axis],size=axis==="x"?area.width:area.length,inset=Math.min(1.25,size/4);
      for(const p of [start,start+inset,start+size/2,start+size-inset,start+size]){
        if(p>min && p<max)points.add(p);
      }
    }
    return [...points].sort((a,b)=>a-b).filter((p,i,a)=>i===0 || p-a[i-1]>1e-6);
  };
  const base=map.terrain;
  const xs=cuts("x",minX,maxX,base?.xs),zs=cuts("z",minZ,maxZ,base?.zs);
  const islands=base?(map.reliefLabels??[])
    .filter(p=>waters.some(area=>containsWaterArea(area,p.x,p.z)))
    .map(p=>({...p,height:groundSample(base,p.x,p.z).height})).filter(p=>p.height>0):[];
  const banksX=shoreline(waters,true),banksZ=shoreline(waters,false);
  const heights=zs.map(z=>xs.map(x=>{
    const height=base?groundSample(base,
      Math.max(base.xs[0],Math.min(base.xs.at(-1)!,x)),
      Math.max(base.zs[0],Math.min(base.zs.at(-1)!,z))).height:0;
    if(!waters.some(area=>containsWaterArea(area,x,z)))return height;
    let distance=MAX_WATER_DEPTH/.22;
    for(const {at,start,end} of banksX)distance=Math.min(distance,Math.hypot(x-at,Math.max(start-z,0,z-end)));
    for(const {at,start,end} of banksZ)distance=Math.min(distance,Math.hypot(z-at,Math.max(start-x,0,x-end)));
    let bed=height-.22*distance;
    // Keep authored hilltops above the water with a walkable bank around them.
    for(const island of islands)bed=Math.max(bed,Math.min(height,island.height-.34*Math.hypot(x-island.x,z-island.z)));
    return bed;
  }));
  return {terrain:{xs,zs,heights,maxGrade:base?.maxGrade??.52},waterLevel:WATER_LEVEL};
}
// A ray is linear within each triangle. Testing every crossed edge also catches low
// crests between two visible endpoints, without depending on simulation tick length.
export function terrainRayClear(t:GroundTerrain,a:Point,b:Point){
  const dx=b.x-a.x,dz=b.z-a.z;
  const edges=[0,1];
  for(const [cuts,start,delta] of [[t.xs,a.x,dx],[t.zs,a.z,dz]] as const){
    if(delta)for(const coord of cuts){const k=(coord-start)/delta;if(k>0 && k<1)edges.push(k);}
  }
  edges.sort((i,j)=>i-j);
  const above=(k:number)=>a.y+(b.y-a.y)*k>groundSample(t,a.x+dx*k,a.z+dz*k).height+.015;
  if(!edges.every(above))return false;
  for(let n=1;n<edges.length;n++){
    const lo=edges[n-1],hi=edges[n],mid=(lo+hi)/2;
    const i=interval(t.xs,a.x+dx*mid),j=interval(t.zs,a.z+dz*mid);
    const w=t.xs[i+1]-t.xs[i],h=t.zs[j+1]-t.zs[j],d=dx/w-dz/h;
    if(!d)continue;
    const k=((a.z-t.zs[j])/h-(a.x-t.xs[i])/w)/d;
    if(k>lo && k<hi && !above(k))return false;
  }
  return true;
}
export function makeRidgePass(portals:WorldPortal[]):WorldMapDefinition{
  const point=(x:number,z:number)=>({x,z});
  const routes=[[[0,76],[0,42],[0,-12],[0,-36],[0,-52]],
    [[0,76],[-95,76],[-95,35],[0,35]],[[0,-4],[95,-4],[95,-45],[0,-52]]];
  return {id:RIDGE_PASS,name:"ด่านสันเขาสองคอ",bounds:{minX:-279,maxX:279,minZ:-225,maxZ:225},
    spawn:{x:0,y:0,z:76},terrain:ridgeTerrain,portals,obstacles:[],camps:[],
    region:{range:[28,58],noFlight:true,hint:"เดินตามหลักสีทองขึ้นจากเชิงเขา 0 ม. ผ่านลานกลาง 3 ม. ถึงสันสูง 6 ม. ทางอ้อมขึ้นลานกลางอยู่ตะวันตก ทางขึ้นสันสูงอีกด้านอยู่ตะวันออก"},
    paths:routes.map(r=>r.map(([x,z])=>point(x,z))),restAreas:portals.map(p=>({...point(p.x,p.z),radius:4,name:"ที่พักปากทาง"}))};
}
