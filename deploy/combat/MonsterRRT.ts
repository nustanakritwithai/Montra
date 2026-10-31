/**
 * MONTRA Monster RRT navigation — adapted from the user's RRT-Game-Lab
 * multi_target_core.js (RRT, collision checking and path smoothing).
 *
 * Source reference:
 * https://github.com/nustanakritwithai/RRT-Game-Lab/blob/main/multi_target_core.js
 *
 * ONLY navigation is changed. Combat, HP, aggro, patrol/return intent,
 * hit range, attack speed, Colyseus schemas and browser client are unchanged.
 *
 * RRT runs on ground-plane X/Z; it cannot climb and never edits Y.
 * The server still moves the NPC on fixed 20 Hz game ticks.
 */
import { FORT } from "./HeightRules.js";
import { RULES, type Vec2 } from "./GameRules.js";

export type WallRect = { x: number; z: number; width: number; length: number };
export type NavigationBounds = { minX: number; maxX: number; minZ: number; maxZ: number };
export type RRTPathResult = {
  path: Vec2[];
  found: boolean;
  iterations: number;
  nodes: number;
  direct: boolean;
};

export const MONSTER_NAV = Object.freeze({
  radius: FORT.capsuleRadius,
  bounds: { minX:-RULES.mapLimit, maxX:RULES.mapLimit,
    minZ:-RULES.mapLimit, maxZ:RULES.mapLimit },
  step: 1.8,
  iterations: 1400,        // The user prioritizes reliable detours over fast planning.
  goalBias: 0.20,
  corridorBias: 0.45,
  cornerBias: 0.22,        // Sample around solid corners to escape narrow detours.
  replanMs: 1300,          // DO NOT run RRT on every 50ms simulation tick.
  goalShift: 1.0,          // Replan if a moving target shifts significantly.
  waypointRadius: 0.18,
});

export const MONSTER_WALLS: readonly WallRect[] = Object.freeze([Object.freeze({
  x: FORT.x-FORT.width/2, z: FORT.z-FORT.length/2,
  width: FORT.width, length: FORT.length,
})]);

const EPS=1e-8;
const sqDist=(a:Vec2,b:Vec2) => (a.x-b.x)**2+(a.z-b.z)**2;
export const distanceXZ=(a:Vec2,b:Vec2) => Math.hypot(a.x-b.x,a.z-b.z);

function seededRandom(seed:number):()=>number {
  let s=(seed>>>0)||1;
  return ()=>{
    s^=s<<13;
    s^=s>>>17;
    s^=s<<5;
    return (s>>>0)/4294967296;
  };
}

/** Signed-world bounds and expanded wall AABB, with monster footprint. */
export function isMonsterFree(
  point:Vec2,
  obstacles:readonly WallRect[]=MONSTER_WALLS,
  radius:number=MONSTER_NAV.radius,
  bounds:NavigationBounds=MONSTER_NAV.bounds,
):boolean {
  if(!Number.isFinite(point.x)||!Number.isFinite(point.z))return false;
  if(point.x<bounds.minX+radius||point.x>bounds.maxX-radius||
     point.z<bounds.minZ+radius||point.z>bounds.maxZ-radius)return false;
  return !obstacles.some(w=>
    point.x>=w.x-radius&&point.x<=w.x+w.width+radius&&
    point.z>=w.z-radius&&point.z<=w.z+w.length+radius
  );
}

function segmentIntersectsExpandedWall(
  a:Vec2,b:Vec2,w:WallRect,radius:number,
):boolean {
  const minX=w.x-radius,maxX=w.x+w.width+radius;
  const minZ=w.z-radius,maxZ=w.z+w.length+radius;
  const dx=b.x-a.x,dz=b.z-a.z;
  let entry=0,exit=1;

  for(const [start,delta,low,high] of [
    [a.x,dx,minX,maxX],[a.z,dz,minZ,maxZ],
  ]) {
    if(Math.abs(delta)<EPS) {
      if(start<low||start>high)return false;
      continue;
    }
    const t1=(low-start)/delta,t2=(high-start)/delta;
    entry=Math.max(entry,Math.min(t1,t2));
    exit=Math.min(exit,Math.max(t1,t2));
    if(entry>exit)return false;
  }
  return entry<=1&&exit>=0;
}

/** Swept collision: no waypoint smoothing can cut through a wall. */
export function isMonsterSegmentClear(
  a:Vec2,b:Vec2,
  obstacles:readonly WallRect[]=MONSTER_WALLS,
  radius:number=MONSTER_NAV.radius,
  bounds:NavigationBounds=MONSTER_NAV.bounds,
):boolean {
  return isMonsterFree(a,obstacles,radius,bounds)&&
    isMonsterFree(b,obstacles,radius,bounds)&&
    !obstacles.some(w=>segmentIntersectsExpandedWall(a,b,w,radius));
}

function steer(from:Vec2,to:Vec2,step:number):Vec2 {
  const length=distanceXZ(from,to);
  if(length<=step)return {x:to.x,z:to.z};
  const fraction=step/length;
  return {x:from.x+(to.x-from.x)*fraction,z:from.z+(to.z-from.z)*fraction};
}
function sampleDisk(rng:()=>number,center:Vec2,radius:number):Vec2 {
  const angle=rng()*Math.PI*2;
  const distance=Math.sqrt(rng())*radius;
  return {x:center.x+Math.cos(angle)*distance,
          z:center.z+Math.sin(angle)*distance};
}

export function smoothMonsterPath(
  path:readonly Vec2[],
  obstacles:readonly WallRect[]=MONSTER_WALLS,
  radius:number=MONSTER_NAV.radius,
  bounds:NavigationBounds=MONSTER_NAV.bounds,
):Vec2[] {
  if(path.length<3)return [...path];
  const out:Vec2[]=[path[0]];
  let current=0;
  while(current<path.length-1) {
    let next=current+1;
    for(let i=path.length-1;i>current+1;i--){
      if(isMonsterSegmentClear(path[current],path[i],obstacles,radius,bounds)){
        next=i;break;
      }
    }
    out.push(path[next]);
    current=next;
  }
  return out;
}

/** RRT with goal bias and corridor sampling adapted from RRT-Game-Lab.
 * Returns no path when goal is unreachable: callers must NOT walk through
 * walls as a fallback. With one MONTRA monster, a slower bounded plan is fine.
 */
export function planMonsterRRT(
  start:Vec2,goal:Vec2,
  options:{
    seed?:number;
    iterations?:number;
    step?:number;
    goalBias?:number;
    corridorBias?:number;
    cornerBias?:number;
    radius?:number;
    obstacles?:readonly WallRect[];
    bounds?:NavigationBounds;
  }={},
):RRTPathResult {
  const obstacles=options.obstacles??MONSTER_WALLS;
  const bounds=options.bounds??MONSTER_NAV.bounds;
  const radius=options.radius??MONSTER_NAV.radius;
  const fail=(iterations=0,nodes=0):RRTPathResult=>
    ({path:[],found:false,iterations,nodes,direct:false});

  if(!isMonsterFree(start,obstacles,radius,bounds)||
     !isMonsterFree(goal,obstacles,radius,bounds))return fail();

  if(isMonsterSegmentClear(start,goal,obstacles,radius,bounds)){
    return {path:[{x:start.x,z:start.z},{x:goal.x,z:goal.z}],found:true,iterations:0,nodes:2,direct:true};
  }

  const step=Math.max(.25,options.step??MONSTER_NAV.step);
  const iterations=Math.max(1,Math.trunc(options.iterations??MONSTER_NAV.iterations));
  const goalBias=Math.min(1,Math.max(0,options.goalBias??MONSTER_NAV.goalBias));
  const corridorBias=Math.min(1-goalBias,
    Math.max(0,options.corridorBias??MONSTER_NAV.corridorBias));
  const cornerBias=Math.min(1-goalBias-corridorBias,
    Math.max(0,options.cornerBias??MONSTER_NAV.cornerBias));
  const rand=seededRandom(options.seed??71);
  const nodes:{p:Vec2;parent:number}[]=[{p:{x:start.x,z:start.z},parent:-1}];
  let end=-1,used=0;

  for(let k=0;k<iterations;k++){
    used++;
    let sample:Vec2;
    const choice=rand();
    if(choice<goalBias){
      sample={x:goal.x,z:goal.z};
    }else if(choice<goalBias+corridorBias){
      const t=rand();
      const center={
        x:start.x+(goal.x-start.x)*t,
        z:start.z+(goal.z-start.z)*t,
      };
      sample=sampleDisk(rand,center,
        Math.max(step*2,2+distanceXZ(start,goal)*.38));
    }else if(choice<goalBias+corridorBias+cornerBias&&obstacles.length){
      // Goal/corridor-only RRT can waste its budget against a long wall.
      // Bias a portion of samples toward expanded wall corners, but the
      // actual connections remain RRT nearest-neighbor swept-collision safe.
      const w=obstacles[Math.floor(rand()*obstacles.length)];
      const clearance=radius+Math.max(.55,step*.65);
      const cx=rand()<.5 ? w.x-clearance : w.x+w.width+clearance;
      const cz=rand()<.5 ? w.z-clearance : w.z+w.length+clearance;
      sample=sampleDisk(rand,{x:cx,z:cz},step*.28);
    }else{
      sample={
        x:bounds.minX+rand()*(bounds.maxX-bounds.minX),
        z:bounds.minZ+rand()*(bounds.maxZ-bounds.minZ),
      };
    }
    if(!isMonsterFree(sample,obstacles,radius,bounds))continue;

    let nearest=0,best=Infinity;
    for(let i=0;i<nodes.length;i++){
      const d=sqDist(nodes[i].p,sample);
      if(d<best){best=d;nearest=i;}
    }
    const next=steer(nodes[nearest].p,sample,step);
    if(!isMonsterSegmentClear(nodes[nearest].p,next,obstacles,radius,bounds))continue;
    nodes.push({p:next,parent:nearest});

    if(distanceXZ(next,goal)<step*1.5 &&
       isMonsterSegmentClear(next,goal,obstacles,radius,bounds)){
      nodes.push({p:{x:goal.x,z:goal.z},parent:nodes.length-1});
      end=nodes.length-1;
      break;
    }
  }

  if(end<0)return fail(used,nodes.length);
  const route:Vec2[]=[];
  let cursor=end;
  while(cursor>=0){
    route.push({...nodes[cursor].p});
    cursor=nodes[cursor].parent;
  }
  route.reverse();
  return {
    path:smoothMonsterPath(route,obstacles,radius,bounds),
    found:true,iterations:used,nodes:nodes.length,direct:false,
  };
}

/**
 * Cache a route and consume its waypoints each fixed server tick.
 *
 * Planning is intentionally slower than movement updates. Even if clients
 * update their targets frequently, RRT is attempted at most once per
 * replanMs window per monster and never in a per-render-frame loop.
 */
export class MonsterRRTNavigator {
  private route:{
    intent:string;
    goal:Vec2;
    waypoints:Vec2[];
    index:number;
    plannedAt:number;
  }|null=null;

  clear():void { this.route=null; }

  nextWaypoint(
    position:Vec2,goal:Vec2,serverNowMs:number,intent:string,
  ):Vec2|null {
    if(!isMonsterFree(position)||!isMonsterFree(goal)) {
      this.route=null;
      return null;
    }
    if(distanceXZ(position,goal)<MONSTER_NAV.waypointRadius)return null;

    const elapsed=serverNowMs-(this.route?.plannedAt??-Infinity);
    const needsPlan= !this.route ||
      this.route.intent!==intent ||
      (elapsed>=MONSTER_NAV.replanMs && (
        distanceXZ(this.route.goal,goal)>=MONSTER_NAV.goalShift ||
        this.route.index>=this.route.waypoints.length
      )) ||
      // Retry failed plans only on the bounded interval.
      (this.route.waypoints.length===0 && elapsed>=MONSTER_NAV.replanMs);

    if(needsPlan) {
      // Use a deterministic seed derived from stable per-room state.
      // No client timestamp or random, untrusted input enters planning.
      const seed=(
        Math.imul(Math.round(position.x*17)+1021,198491317)^
        Math.imul(Math.round(position.z*17)+4093,6542989)^
        Math.imul(Math.floor(serverNowMs/MONSTER_NAV.replanMs)+1,357239)
      )>>>0;
      // Colyseus Schema 5 exposes x/z via getters/internal Symbols. Spreading
      // a Schema instance ({...goal}) does NOT copy those coordinates.
      // Convert at the planner boundary to ordinary numeric waypoints.
      const from={x:position.x,z:position.z};
      const destination={x:goal.x,z:goal.z};
      const result=planMonsterRRT(from,destination,{seed});
      this.route={
        intent,
        goal:{x:goal.x,z:goal.z},
        waypoints:result.path,
        index:1,
        plannedAt:serverNowMs,
      };
    }

    const route=this.route;
    if(!route)return null;
    while(route.index<route.waypoints.length &&
          distanceXZ(position,route.waypoints[route.index])<=MONSTER_NAV.waypointRadius){
      route.index++;
    }
    if(route.index>=route.waypoints.length)return null;

    const candidate=route.waypoints[route.index];
    if(!isMonsterSegmentClear(position,candidate)) {
      // Do not move through blocked geometry; a future plan may recover.
      route.waypoints=[];
      route.index=0;
      return null;
    }
    return candidate;
  }
}
