// B01, Castle Design Atlas seed 37. Double the horizontal grid pitch for the playable siege.
export const RIVER_CITY="sam_lan_estuary";
export const CITY_CELL=16, RIVER_WAR_DURATION=10*60_000;
export const gridPoint=(column:number,row:number)=>({x:(column-15)*CITY_CELL,z:(row-12)*CITY_CELL});
export const RIVER_WAREHOUSE_PLOT = {name: "ลานด้านเหนือของคลังข้าวหลวง", ...gridPoint(8,12), radius: 8};
export const riverNodes={
  A:gridPoint(15,23),D:gridPoint(17,7),T:gridPoint(17,9),M:gridPoint(22,15),
  S:gridPoint(8,12),F:gridPoint(8,7),W:gridPoint(16,15)
};
export const riverGateSpecs=[
  {id:"G11",ring:0,side:"south",at:0,name:"ประตูขบวนเสบียง"},
  {id:"G12",ring:0,side:"west",at:gridPoint(4,10).z,name:"ประตูคลังตะวันตก"},
  {id:"G13",ring:0,side:"east",at:gridPoint(26,13).z,name:"ประตูตลาดตะวันออก"},
  {id:"G21",ring:1,side:"south",at:gridPoint(16,12).x,name:"ประตูลานบัญชาการ"},
  {id:"G22",ring:1,side:"west",at:gridPoint(12,9).z,name:"ประตูข้างราชการ"}
] as const;
export const riverFacilities=[
  {key:"S",name:"คลังข้าวหลวง",...gridPoint(8,13)},
  {key:"M",name:"ตลาดท่าสามลาน",...gridPoint(22,14)},
  {key:"F",name:"โรงช่างประตู",...gridPoint(9,7)},
  {key:"T",name:"หอบัญชาการ",...gridPoint(18,9)}
];
const routes:number[][][]=[
  [[15,23],[22,23],[22,20],[27,20],[27,13],[25,13],[25,15],[22,15]],
  [[15,23],[22,23],[22,20],[15,20],[15,17],[9,17],[9,12],[8,12]],
  [[22,15],[9,15],[9,12],[8,12],[8,7]],[[8,7],[8,12]],
  [[8,12],[11,12],[11,13],[16,13],[16,15]],[[16,15],[16,11],[17,11],[17,9]],
  [[8,7],[8,8],[11,8],[11,9],[17,9]],[[17,7],[17,9]],[[22,15],[16,15]],
  // Signpost the alternate west bridge and gate, both present in the source grid.
  [[15,23],[8,23],[8,20],[3,20],[3,10],[8,10],[8,12]]
];
export const riverPaths=routes.map(route=>route.map(([c,r])=>gridPoint(c,r)));
export const riverPosts=[
  {id:"M",name:"ตลาดท่าเรือ",...riverNodes.M},{id:"S",name:"คลังเสบียง",...riverNodes.S},
  {id:"F",name:"โรงช่าง",...riverNodes.F}
] as const;
type Side="attack"|"defend";
type Gate={closed:boolean;hp:number};
type Post={id:string;owner:Side|null;progress:number;contested:boolean};
export type RiverCensus=readonly {attack:number;defend:number}[];
export type RiverBattle={defended:boolean;gates:Record<string,Gate>;posts:Post[]};
const HOLD_SECONDS=6;
export function newRiverBattle(defended:boolean):RiverBattle{
  return {defended,gates:Object.fromEntries(riverGateSpecs.map(g=>[g.id,{closed:defended,hp:120}])),
    posts:riverPosts.map((p):Post=>({id:p.id,owner:null,progress:0,contested:false}))};
}
export function sampleRiverPosts(b:RiverBattle,presence:RiverCensus,elapsed:number){
  b.posts.forEach((p,i)=>{
    const {attack,defend}=presence[i],both=attack>0 && defend>0;
    p.contested=both || (p.owner==="attack" && defend>0) || (p.owner==="defend" && attack>0);
    if(both || (!attack && !defend))return;
    const side=attack?"attack":"defend",direction=attack?1:-1;
    p.progress=Math.max(-HOLD_SECONDS,Math.min(HOLD_SECONDS,p.progress+direction*elapsed));
    if(p.owner && p.owner!==side && direction*p.progress>=0)p.owner=null;
    if(direction*p.progress>=HOLD_SECONDS){p.owner=side;p.contested=false;}
  });
}
export function riverSupplied(b:RiverBattle,side:Side){
  if(!b.posts.some(p=>p.id!=="F" && p.owner===side && !p.contested))return false;
  if(side==="defend" && b.defended)return true;
  return [0,1].every(r=>riverGateSpecs.some(g=>g.ring===r && !b.gates[g.id].closed));
}
export function changeRiverGate(b:RiverBattle,id:string,side:Side,occupied:boolean){
  if(!b.defended || !Object.hasOwn(b.gates,id))throw Error("war_gate_inactive");
  const gate=b.gates[id];if(!gate.hp)throw Error("war_gate_inactive");
  if(side==="defend"){
    if(!gate.closed && occupied)throw Error("war_gate_occupied");
    gate.closed=!gate.closed;
  }else{
    if(!gate.closed)throw Error("war_gate_open");
    const hasWorkshop=b.posts.some(p=>p.id==="F" && p.owner===side && !p.contested);
    gate.hp=Math.max(0,gate.hp-(hasWorkshop?30:15));if(!gate.hp)gate.closed=false;
  }
}
