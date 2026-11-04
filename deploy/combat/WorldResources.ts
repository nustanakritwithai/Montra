import { WORLD_MAPS, WORLD_EXPANSION, groundAt, isSafeWorldPoint, onMapGround, provinceShotClear, type WorldMapDefinition } from "./WorldMaps.js";
import { MATERIAL_LEVELS, materialTier, type MaterialId } from "./PersonalItems.js";
import {SCENERY_NODES} from "./SceneryNodes.js";

export type ResourceKind="wood"|"stone"|"herb";
export type ResourceNode={id:string;mapId:string;kind:ResourceKind;x:number;z:number;radius:number;tier:number;capacity:number;period:number;existing:boolean;access?:{x:number;z:number}};
export const REFINE_INPUT=2;
export const GATHER_DELAY=1500;
export const GATHER_REACH=2.3;
const nodes=new Map<string,ResourceNode>();
function place(map:WorldMapDefinition,key:string,kind:ResourceKind,x:number,z:number,tier:number,radius=.7,existing=false){
  const woodland=["forbidden_forest","bamboo_frontier","drowned_marsh","lotus_basin"].includes(map.id);
  const mineral=["naga_cavern","asura_peak","spirit_rift"].includes(map.id);
  const period=kind==="herb"?(woodland?50:70):kind==="wood"?(woodland?60:90):(mineral?150:210);
  const id=map.id+"/"+key;
  const capacity=existing && radius<.5?1:kind==="wood"?4:3;
  nodes.set(id,{id,mapId:map.id,kind,x,z,radius,tier,capacity,period:period*1000,existing});
}
function campSite(map:WorldMapDefinition,key:string,x:number,z:number,level:number){
  for(const [kind,offset] of [["wood",0],["stone",6],["herb",3]] as const){
    for(let i=0;i<12;i++){
      const angle=(i+offset)*Math.PI/6, px=x+Math.cos(angle)*5,pz=z+Math.sin(angle)*5;
      if(!isSafeWorldPoint(map,{x:px,y:groundAt(map.id,px,pz),z:pz},1) ||
        [...nodes.values()].some(n=>n.mapId===map.id&&Math.hypot(n.x-px,n.z-pz)<3))continue;
      place(map,key+"-"+kind,kind,px,pz,materialTier(level));break;
    }
  }
}
for(const map of Object.values(WORLD_MAPS)){
  if(map.id==="ritual_village")campSite(map,"village",0,1,1);
  else if(map.id==="forbidden_forest"){
    for(const o of map.obstacles){
      if(!/^(tree-|stone-)/.test(o.id))continue;
      place(map,o.id,o.id.startsWith("tree-")?"wood":"stone",o.x,o.z,1,o.radius,true);
    }
    for(const c of map.camps??[])campSite(map,c.id,c.x,c.z,c.levels[0]);
  }else if(map.id==="bound_temple" || map.region){
    for(const c of map.camps??[])campSite(map,c.id,c.x,c.z,c.levels[0]);
  }
  if(!WORLD_EXPANSION && map.id!=="ritual_village")continue;
  for(const [code,cx,cz,cr] of SCENERY_NODES[map.id]??[]){
    const x=cx/100,z=cz/100,radius=cr/100,b=map.bounds;
    if(x<b.minX || x>b.maxX || z<b.minZ || z>b.maxZ)continue;
    let distance=Infinity,level=map.region?.range[0]??1;
    for(const camp of map.camps??[]){
      const d=Math.hypot(x-camp.x,z-camp.z);
      if(d<distance){distance=d;level=camp.levels[0];}
    }
    const key="scenery-"+code+"-"+cx+"-"+cz,kind=code===0?"wood":"stone";
    place(map,key,kind,x,z,materialTier(level),radius,true);
    const node=nodes.get(map.id+"/"+key)!;
    if(!resourceApproach(node)){
      // Some small rocks share a collision volume with a larger prop. Mine them
      // at its accessible edge while retaining their on-screen centre and normal reach.
      for(let d=.25;!node.access && d<=radius+GATHER_REACH;d+=.25)for(let i=0;i<32;i++){
        const a=i*Math.PI/16,px=x+d*Math.cos(a),pz=z+d*Math.sin(a);
        if(isSafeWorldPoint(map,{x:px,z:pz,y:groundAt(map.id,px,pz)})){node.access={x:px,z:pz};break;}
      }
      if(!node.access)nodes.delete(node.id);
    }
  }
}
export const resourceNodes=(mapId:string)=>[...nodes.values()].filter(n=>n.mapId===mapId);
export const getResourceNode=(id:string)=>nodes.get(id);
export const rawResource=(node:ResourceNode):MaterialId=>node.kind==="herb"?`mat_herb_${node.tier}`:`mat_raw_${node.kind}_${node.tier}`;
export function harvestableFrom(p:{x:number;y:number;z:number;mapId:string;level:number;alive:boolean;mounted:boolean;flying:boolean},n:ResourceNode){
  if(p.mapId!==n.mapId || Math.hypot(p.x-n.x,p.z-n.z)>n.radius+GATHER_REACH)throw Error("resource_range");
  if(!p.alive || p.mounted || p.flying || !onMapGround(p))throw Error("resource_ground");
  if(p.level<MATERIAL_LEVELS[n.tier-1])throw Error("item_level_required");
  // Trace only to the near edge; the existing forest tree/rock blocks its own centre.
  const dx=p.x-n.x,dz=p.z-n.z,d=Math.hypot(dx,dz),offset=Math.min(d,n.radius+.08);
  const x=n.access?.x??n.x+(d?dx/d*offset:0),z=n.access?.z??n.z+(d?dz/d*offset:0);
  // Colyseus schema properties are accessors, so spreading a Player loses x/z.
  if(!provinceShotClear(WORLD_MAPS[p.mapId],{x:p.x,y:p.y+1,z:p.z},{x,y:groundAt(p.mapId,x,z)+1,z}))throw Error("resource_range");
}
export function resourceApproach(n:ResourceNode){
  const map=WORLD_MAPS[n.mapId];
  if(n.access)return {...n.access,y:groundAt(n.mapId,n.access.x,n.access.z),mapId:n.mapId,alive:true,mounted:false,flying:false,level:100};
  for(const gap of [1.2,2.2,.45])for(let i=0;i<32;i++){
    const a=i*Math.PI/16,x=n.x+Math.cos(a)*(n.radius+gap),z=n.z+Math.sin(a)*(n.radius+gap);
    const p={x,z,y:groundAt(n.mapId,x,z),mapId:n.mapId,alive:true,mounted:false,flying:false,level:100};
    if(!isSafeWorldPoint(map,p))continue;
    const tx=n.x+Math.cos(a)*(n.radius+.08),tz=n.z+Math.sin(a)*(n.radius+.08);
    if(provinceShotClear(map,{...p,y:p.y+1},{x:tx,y:groundAt(n.mapId,tx,tz)+1,z:tz}))return p;
  }
  return null;
}
export type ResourceStock={stock:number;nextAt:number;periodMs?:number};
export function resourceStock(node:ResourceNode,row:ResourceStock|undefined,now:number):ResourceStock {
  if(!row || row.stock>=node.capacity)return {stock:node.capacity,nextAt:0};
  if(now<row.nextAt)return row;
  // Do not reinterpret elapsed time under a newer AI-generated period.
  const period=Number.isSafeInteger(row.periodMs) && row.periodMs!>0 ? row.periodMs! : node.period;
  const ticks=1+Math.floor((now-row.nextAt)/period),stock=Math.min(node.capacity,row.stock+ticks);
  return {stock,nextAt:stock===node.capacity?0:row.nextAt+ticks*period};
}
