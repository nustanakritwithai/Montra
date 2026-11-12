import {VILLAGE_WATERS,WORLD_MAPS,groundAt,onMapGround,provinceShotClear,type WorldWall} from "./WorldMaps.js";
import {waterDepthAt} from "./GroundTerrain.js";

export const FISH_CAST_RANGE=9;
export const FISH_BITE_DELAY=3000;
export const FISH_PERIOD=2800;
export const FISH_DURATION=45000;
export const FISH_MAX_DISTANCE=18;
export type FishItem="mat_fish_common"|"mat_fish_silver"|"mat_fish_spirit";
export type FishingSession={id:string;mapId:string;x:number;z:number;originX:number;originZ:number;combatAt:number;biteAt:number;lastReel:number;lastDriftAt:number;distance:number;initialDistance:number;strength:number;line:number;item:FishItem};

export function fishingWater(mapId:string):readonly WorldWall[]{
  const map=WORLD_MAPS[mapId];if(!map)return [];
  return map.water??(mapId==="ritual_village"?VILLAGE_WATERS:[]);
}
export function isFishingWater(mapId:string,x:number,z:number):boolean{
  if(!Number.isFinite(x) || !Number.isFinite(z))return false;
  const map=WORLD_MAPS[mapId];
  if(map?.waterLevel!==undefined)return waterDepthAt(map,x,z)>0;
  return fishingWater(mapId).some(w=>x>=w.x && x<=w.x+w.width && z>=w.z && z<=w.z+w.length);
}
export function validateFishingPosition(p:{mapId:string;x:number;y:number;z:number;alive:boolean;mounted:boolean;flying:boolean},x:number,z:number):void{
  const map=WORLD_MAPS[p.mapId];
  if(!map || !isFishingWater(p.mapId,x,z))throw Error("fish_water");
  if(!p.alive || p.mounted || p.flying || !onMapGround(p))throw Error("fish_ground");
  if(Math.hypot(p.x-x,p.z-z)>FISH_CAST_RANGE)throw Error("fish_range");
  if(!provinceShotClear(map,{x:p.x,y:p.y+1,z:p.z},{x,y:groundAt(p.mapId,x,z)+1,z}))throw Error("fish_blocked");
}
export function fishItem(draw:number):FishItem{return draw<70?"mat_fish_common":draw<95?"mat_fish_silver":"mat_fish_spirit";}
export function fishNeedle(elapsed:number):number{
  const phase=((elapsed%FISH_PERIOD)+FISH_PERIOD)%FISH_PERIOD/FISH_PERIOD;
  return phase<=.5?phase*2:(1-phase)*2;
}
export function advanceFishing(s:FishingSession,now:number):"escaped"|null{
  if(s.distance<=0 || now<s.biteAt)return null;
  if(now-s.biteAt>FISH_DURATION)return "escaped";
  const elapsed=Math.max(0,now-Math.max(s.lastDriftAt,s.biteAt));
  s.distance=Math.min(FISH_MAX_DISTANCE,s.distance+elapsed/1000*(.12+.35*s.strength/100));
  s.lastDriftAt=Math.max(s.lastDriftAt,now);
  return s.distance>=FISH_MAX_DISTANCE?"escaped":null;
}
export function pullFish(s:FishingSession,now:number):"early"|"slow"|"perfect"|"good"|"miss"|"escaped"|"broken"|"caught"{
  if(now<s.biteAt)return "early";
  if(advanceFishing(s,now))return "escaped";
  if(now-s.lastReel<450)return "slow";
  s.lastReel=now;
  const needle=fishNeedle(now-s.biteAt);
  let result:"perfect"|"good"|"miss";
  if(needle>=.44 && needle<=.56){result="perfect";s.strength=Math.max(0,s.strength-32);s.distance=Math.max(0,s.distance-3.5);s.line=Math.max(0,s.line-1);}
  else if(needle>=.32 && needle<=.68){result="good";s.strength=Math.max(0,s.strength-18);s.distance=Math.max(0,s.distance-(s.strength===0?3:2));s.line=Math.max(0,s.line-4);}
  else {result="miss";s.strength=Math.min(100,s.strength+8);s.distance=Math.min(FISH_MAX_DISTANCE,s.distance+2);s.line=Math.max(0,s.line-24);}
  if(s.line===0)return "broken";
  if(s.distance>=FISH_MAX_DISTANCE)return "escaped";
  return s.distance<=0?"caught":result;
}
