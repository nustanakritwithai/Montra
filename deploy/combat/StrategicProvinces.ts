import type { WorldMapDefinition, WorldPortal, WorldWall } from "./WorldMaps.js";

type XY = readonly [number, number];
export type ProvinceSite = Readonly<{
  kind:"palace"|"market"|"tower"|"fort"|"mine"|"port"|"bridge"|"grove"|"shrine";
  name:string; x:number; z:number; direction?:"east";
}>;
export type Province = Readonly<{
  kind:"capital"|"territory"|"hunting"; hint:string; sites:readonly ProvinceSite[];
  safeRoads?:readonly number[];
}>;
const site=(kind:ProvinceSite["kind"],name:string,x:number,z:number,direction?:"east"):ProvinceSite=>({kind,name,x,z,direction});
const wall=(x:number,z:number,width:number,length:number):WorldWall=>({x,z,width,length});
const trails=(...routes:XY[][])=>routes.map(route=>route.map(([x,z])=>({x,z})));

export const PROVINCES:Readonly<Record<string,Province>>={
  mantra_capital:{kind:"capital",hint:"ลานพระนครเชื่อมหมู่บ้าน สองเขตล่า และด่านจันทรา",sites:[
    site("palace","คุ้มหลวงเวียงมนตรา",0,-35),site("market","ตลาดสี่ประตู",-16,1),
    site("tower","หอกลองประกาศ",17,-14),site("shrine","ศาลหลักเมือง",0,-14)]},
  moon_pass:{kind:"territory",hint:"ถนนตลาดฝั่งตะวันตกเป็นเขตพัก สะพานกลางเข้าป้อมตรง ทางเหมืองอ้อมเข้าด้านข้าง",safeRoads:[0,1],sites:[
    site("fort","ป้อมผนึกจันทรา",12,-36),site("market","ตลาดชายด่าน",-24,-20),site("mine","เหมืองเงินจันทร์",32,-25),
    site("bridge","สะพานตลาด",-30,-4),site("bridge","สะพานเสบียง",0,-4),site("bridge","ทางข้ามเหมือง",27,-4)]},
  river_watch:{kind:"territory",hint:"ถนนท่าข้าวฝั่งตะวันออกเป็นเขตพัก ข้ามสะพานเสบียงไปป้อมหรือตามท่าเรืออ้อมเข้าด้านหลัง",safeRoads:[0,1],sites:[
    site("fort","ป้อมปากชล",-18,-29),site("port","ท่าเรือลำเลียง",-23,-49),site("market","ตลาดท่าข้าว",24,9),
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
    [[0,26],[0,10],[0,-4],[0,-24],[6,-35],[12,-36]],[[0,10],[20,10],[27,0],[27,-25],[22,-36],[12,-36]]),
    water:[wall(-42,-6,9,4),wall(-27,-6,24,4),wall(3,-6,21,4),wall(30,-6,12,4)],
    walls:[wall(4,-43,18,2),wall(6,-30,4,2),wall(15,-30,7,2),wall(21,-25,2,6),wall(31,-26,4,3)],obstacles:[]},
  river_watch:{name:"ป้อมท่าปากชล",paths:trails([[0,26],[30,16],[30,-14],[30,-44],[0,-58]],[[30,-14],[34,-14]],
    [[30,-14],[-12,-14],[-18,-21],[-18,-29]],[[30,-44],[10,-46],[-18,-46],[-27,-32],[-18,-29]],
    [[0,26],[0,12],[-18,12],[-22,-14],[-12,-14]]),
    water:[wall(-6,-65,4,16),wall(-6,-43,4,26),wall(-6,-11,4,20),wall(-6,15,4,17)],
    walls:[wall(-20,-38,7,2),wall(-13,-36,2,9),wall(-28,-23,7,2),wall(-12,-22,5,2)],obstacles:[]},
};
export function makeHubs(portalsFor:(id:string)=>WorldPortal[]):Record<string,WorldMapDefinition>{
  return Object.fromEntries(Object.entries(hubs).map(([id,data])=>{
    const portals=portalsFor(id);
    return [id,{...data,id,strategic:PROVINCES[id],bounds:{minX:-42,maxX:42,minZ:-65,maxZ:32},spawn:{x:0,y:0,z:25},
      portals,restAreas:[...portals.map(p=>({x:p.x,z:p.z,radius:4,name:"เขตพักประตู"})),
        ...PROVINCES[id].sites.filter(s=>s.kind==="market" && PROVINCES[id].kind==="territory").map(s=>({x:s.x,z:s.z,radius:5,name:"เขตพักตลาด"}))],camps:[] as const}];
  }));
}
