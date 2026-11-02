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
export const pilotNodes=castleObjectives.filter(p=>p.id===2 || p.id===4 || p.id===5);
type Side="attack"|"defend";
export function pilotSpawn(point:number,side:Side,seat:number){
  const node=pilotNodes.find(p=>p.id===point)!;
  const offset=side==="attack"?195:-195;
  return {x:node.x+(point===5?offset:0)+seat%5-2,y:0,z:node.z+(point===5?0:offset)+Math.floor(seat/5)};
}
export type PilotPresence=Record<Side,number>[];
type Point={owner:Side|null;pressure:number;awarded:{attack:boolean;defend:boolean}};
// pressure is signed fifths of a millisecond. Score is stored in 1/5000 point units.
export type PilotState={points:Point[];score:Record<Side,number>;middleTime:Record<Side,number>};
export function newPilot():PilotState {
  return {points:pilotNodes.map(():Point=>({owner:null,pressure:0,awarded:{attack:false,defend:false}})),score:{attack:0,defend:0},middleTime:{attack:0,defend:0}};
}
export function tickPilot(state:PilotState,presence:PilotPresence,elapsedMs:number){
  for(const side of ["attack","defend"] as const){
    const linked=state.points.every(p=>p.owner===side);
    state.points.forEach((p,i)=>{
      if(p.owner!==side)return;
      state.score[side]+=elapsedMs*pilotNodes[i].rate*(linked?6:5);
      if(pilotNodes[i].id!==2)state.middleTime[side]+=elapsedMs;
    });
  }
  const threshold=300_000;
  state.points.forEach((p,i)=>{
    const net=presence[i].attack-presence[i].defend;
    if(!net)return;
    const side=net>0?"attack":"defend",sign=net>0?1:-1;
    const delta=sign*elapsedMs*Math.min(10,5+Math.abs(net)-1);
    p.pressure=p.owner===side?sign*Math.min(0,sign*(p.pressure+delta)):p.pressure+delta;
    if(sign*p.pressure>=threshold){
      p.owner=side;p.pressure=0;
      if(!p.awarded[side]){state.score[side]+=20*5000;p.awarded[side]=true;}
    }
  });
}
export function pilotWinner(s:PilotState):Side|null {
  const lead=s.score.attack-s.score.defend || s.middleTime.attack-s.middleTime.defend;
  return lead===0?null:lead>0?"attack":"defend";
}
export function pilotView(s:PilotState){
  return {score:{attack:Math.floor(s.score.attack/5000),defend:Math.floor(s.score.defend/5000)},
    points:s.points.map((p,i)=>({id:pilotNodes[i].id,name:pilotNodes[i].name,owner:p.owner,progress:Math.trunc(p.pressure/3000)})),
    linked:s.points[0].owner && s.points.every(p=>p.owner===s.points[0].owner)?s.points[0].owner:null};
}
