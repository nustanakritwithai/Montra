// Trial profile. The production atlas keeps its original passage unless this world opts in.
export const CASTLE_ID="tri_wiang_castle";
export const CASTLE_ENABLED=process.env.MONTRA_WORLD_EXPANSION==="1" && process.env.MONTRA_CASTLE_PILOT==="1";
export const CASTLE_SEATS=10, CASTLE_DURATION=45*60_000, CAPTURE_RADIUS=7;
export const castleObjectives=[
  {id:1,name:"สะพานขบวนเสบียง",x:0,z:630,rate:2},
  {id:2,name:"ท่าน้ำตะวันตก",x:-680,z:100,rate:1},
  {id:3,name:"ช่องเขาตะวันออก",x:690,z:100,rate:1},
  {id:4,name:"คลังเสบียงหลวง",x:-250,z:-110,rate:1},
  {id:5,name:"ลานกลองศึก",x:0,z:155,rate:2},
  {id:6,name:"โรงช่างประตู",x:250,z:-110,rate:1},
  {id:7,name:"ท้องพระโรง",x:0,z:-175,rate:0},
] as const;
const legacyNodes=castleObjectives.filter(p=>[2,4,5].includes(p.id));
const scoringNodes=castleObjectives.filter(p=>p.id<7);
export const musterNodes=[1,2,3];
export const forwardCamps=[
  {id:1,name:"ค่ายสะพานใต้",x:14,z:654},{id:2,name:"ค่ายท่าน้ำ",x:-700,z:122},
  {id:3,name:"ค่ายช่องเขา",x:710,z:122},{id:4,name:"ค่ายคลังหลวง",x:-270,z:-90}
] as const;
export type Side="attack"|"defend";
const sides=["attack","defend"] as const;
const sidesAtZero=()=>({attack:0,defend:0});
const throneOpens=30*60_000, throneGoal=120_000, captureGoal=300_000;
export function pilotSpawn(point:number,side:Side,seat:number,garrison=false){
  if(garrison && side==="defend"){
    const post=point===1?{x:0,z:522}:point===2?{x:-552,z:100}:{x:552,z:100};
    return {x:post.x+seat%5-2,y:0,z:post.z+Math.floor(seat/5)};
  }
  const node=castleObjectives.find(p=>p.id===point)!;
  const offset=side==="attack"?195:-195;
  const x=point===1?(side==="attack"?-180:180):point===5?offset:0;
  const z=point===1?100:point===5?0:offset;
  return {x:node.x+x+seat%5-2,y:0,z:node.z+z+Math.floor(seat/5)};
}
export type PilotPresence=Record<Side,number>[];
type Point={owner:Side|null;pressure:number;awarded:Record<Side,boolean>};
type Gate={open:boolean;hp:number;lastHit:number|null};
const links:ReadonlyArray<readonly [number,number,readonly string[]]>=[
  [1,5,["outer-south","middle-south"]],[2,4,["outer-west","middle-west"]],[3,6,["outer-east","middle-east"]],
  [4,5,[]],[5,6,[]]
];
const gateIds=["outer-south","outer-north","outer-east","outer-west","middle-south","middle-east","middle-west","inner-east","inner-west"];
type Siege={gates:Record<string,Gate>;throne:Record<Side,number>;cutMs:Record<Side,number>;defended:boolean;victor:Side|null};
// Older three-front battles remain readable and finish under the rules they started with.
export type PilotState={points:Point[];score:Record<Side,number>;middleTime:Record<Side,number>;siege?:Siege};
export function newPilot(defended=false):PilotState {
  return {points:scoringNodes.map(():Point=>({owner:null,pressure:0,awarded:{attack:false,defend:false}})),
    score:sidesAtZero(),middleTime:sidesAtZero(),siege:{gates:Object.fromEntries(gateIds.map((id):[string,Gate]=>[id,{open:!defended,hp:120,lastHit:null}])),
      throne:sidesAtZero(),cutMs:sidesAtZero(),defended,victor:null}};
}
function reachable(starts:readonly number[],canEnter:(id:number)=>boolean,passable:(gate:string)=>boolean){
  const found=new Set(starts);
  for(const id of found)for(const [a,b,doors] of links){
    const next=a===id?b:b===id?a:0;
    if(next && !found.has(next) && canEnter(next) && doors.every(passable))found.add(next);
  }
  return found;
}
function fronts(s:PilotState,side:Side){
  const nodes=s.siege?scoringNodes:legacyNodes;
  const owned=nodes.filter((_,i)=>s.points[i].owner===side).map(p=>Number(p.id));
  const seen=new Set<number>(),linked=new Set<number>();
  const held=(id:number)=>owned.includes(id);
  function passable(id:string){const g=s.siege!.gates[id];return g.open || g.hp===0;}
  for(const id of owned)if(!seen.has(id)){
    const group=reachable([id],held,()=>true);
    for(const k of group){seen.add(k);if(group.size>=3)linked.add(k);}
  }
  const outer=owned.filter(id=>id<=3),middle=owned.length-outer.length;
  const route=!!s.siege && outer.some(id=>{
    const group=reachable([id],held,passable);
    return (group.has(4)&&passable("inner-west")) || (group.has(6)&&passable("inner-east"));
  });
  return {linked,outer:outer.length,middle,route,eligible:outer.length>=2 && middle>=2 && route};
}
// Dispatch and respawn re-evaluate this same rule against live ground presence, even between score samples.
export function castleLogistics(v:ReturnType<typeof pilotView>,counts:PilotPresence,campCounts:PilotPresence,side:Side){
  if(!v.throne || !v.gates)return undefined;
  const enemy=side==="attack"?"defend":"attack";
  const held=(id:number)=>v.points[id-1].owner===side;
  const contested=(id:number)=>counts[id-1][enemy]>0;
  const supplied=(id:number)=>held(id) && !contested(id);
  const passable=(id:string)=>!v.gates![id].closed;
  const exits=["outer-south","outer-west","outer-east"];
  const starts=musterNodes.filter(id=>supplied(id) && (!v.throne!.defended || side!=="defend" || passable(exits[id-1])));
  const connected=reachable(starts,supplied,passable);
  const camps=forwardCamps.map(({id})=>{
    const threatened=contested(id) || campCounts[id-1][enemy]>0;
    const status=!held(id)?"unheld":threatened?"contested":connected.has(id)?"ready":"cut";
    return {id,status};
  });
  return {camps,drums:held(5)?[4,5,6].filter(id=>held(id) && contested(id)):[]};
}
export function changeCastleGate(s:PilotState,id:string,side:Side,occupied:boolean,now:number,repair=false){
  const siege=s.siege,gate=siege && Object.hasOwn(siege.gates,id)?siege.gates[id]:undefined;
  if(!siege?.defended || !gate || gate.hp===0)throw Error("war_gate_inactive");
  if(repair){
    if(side!=="defend" || s.points[5].owner!=="defend" || gate.hp===120 || (gate.lastHit!==null && now-gate.lastHit<5000))throw Error("war_gate_repair");
    gate.hp=Math.min(120,gate.hp+10);
  }else if(side==="attack"){
    if(gate.open)throw Error("war_gate_open");
    gate.hp=Math.max(0,gate.hp-15);gate.lastHit=now;
  }else{
    if(gate.open && occupied)throw Error("war_gate_occupied");
    gate.open=!gate.open;
  }
}
// Presence is in atlas ID order, including the throne. The room supplies only consecutive live samples.
export function tickPilot(s:PilotState,presence:PilotPresence,elapsedMs:number,age=0):number {
  const nodes=s.siege?scoringNodes:legacyNodes;
  const speed=nodes.map(p=>{
    const net=presence[p.id-1].attack-presence[p.id-1].defend;
    return Math.sign(net)*Math.min(10,4+Math.abs(net));
  });
  let advanced=0;
  while(advanced<elapsedMs && !s.siege?.victor){
    const t=age+advanced;
    let dt=elapsedMs-advanced;
    if(t<throneOpens)dt=Math.min(dt,throneOpens-t);
    s.points.forEach((p,i)=>{
      const v=speed[i];
      if(v && p.owner!==(v>0?"attack":"defend"))dt=Math.min(dt,Math.ceil((captureGoal-Math.sign(v)*p.pressure)/Math.abs(v)));
    });
    const frontsBySide={attack:fronts(s,"attack"),defend:fronts(s,"defend")};
    const siege=s.siege;
    if(siege && t>=throneOpens){
      const net=presence[6].attack-presence[6].defend;
      const pushing=net>0?"attack":net<0?"defend":null;
      if(pushing && (!siege.defended || pushing==="attack") && frontsBySide[pushing].eligible)
        dt=Math.min(dt,throneGoal-siege.throne[pushing]);
      for(const side of sides){
        if(siege.defended && side==="defend")continue;
        if(frontsBySide[side].eligible){
          siege.cutMs[side]=0;
          if(side===pushing)siege.throne[side]+=dt;
        }else{
          const grace=Math.max(0,30_000-siege.cutMs[side]);
          siege.cutMs[side]=Math.min(30_000,siege.cutMs[side]+dt);
          siege.throne[side]=Math.max(0,siege.throne[side]-Math.max(0,dt-grace));
        }
        if(siege.throne[side]>=throneGoal)siege.victor=side;
      }
    }
    for(const [i,p] of s.points.entries()){
      const id=nodes[i].id;
      if(p.owner){
        s.score[p.owner]+=dt*nodes[i].rate*(frontsBySide[p.owner].linked.has(id)?6:5);
        if(id>=4)s.middleTime[p.owner]+=dt;
      }
      const v=speed[i];if(!v)continue;
      const sign=Math.sign(v),side=v>0?"attack":"defend";
      p.pressure=p.owner===side?sign*Math.min(0,sign*(p.pressure+v*dt)):p.pressure+v*dt;
      if(sign*p.pressure>=captureGoal){
        p.owner=side;p.pressure=0;
        if(!p.awarded[side]){s.score[side]+=100_000;p.awarded[side]=true;}
      }
    }
    advanced+=dt;
  }
  return advanced;
}
export function pilotWinner(s:PilotState):Side|null {
  if(s.siege?.victor)return s.siege.victor;
  const lead=s.score.attack-s.score.defend || s.middleTime.attack-s.middleTime.defend;
  return lead===0?null:lead>0?"attack":"defend";
}
export function pilotView(s:PilotState){
  const nodes=s.siege?scoringNodes:legacyNodes,attack=fronts(s,"attack"),defend=fronts(s,"defend");
  const siege=s.siege;
  return {score:{attack:Math.floor(s.score.attack/5000),defend:Math.floor(s.score.defend/5000)},
    points:s.points.map((p,i)=>({id:nodes[i].id,name:nodes[i].name,owner:p.owner,progress:Math.trunc(p.pressure/3000)})),
    linked:attack.linked.size?"attack":defend.linked.size?"defend":null,
    networks:{attack:[...attack.linked],defend:[...defend.linked]},
    gates:siege?Object.fromEntries(Object.entries(siege.gates).map(([id,g])=>[id,{closed:g.hp>0&&!g.open,hp:g.hp}])):undefined,
    throne:siege?{progress:siege.throne,defended:siege.defended,victor:siege.victor,
      attack:{outer:attack.outer,middle:attack.middle,route:attack.route},defend:{outer:defend.outer,middle:defend.middle,route:defend.route}}:undefined};
}
