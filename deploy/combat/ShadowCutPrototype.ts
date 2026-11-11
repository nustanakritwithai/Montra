/** Isolated server-only prototype. Never serialize this transient session state. */
export type ShadowPoint = Readonly<{x:number;y:number;z:number;mapId:string}>;
export type ShadowMark = Readonly<{point:ShadowPoint;until:number;sequence:number}>;
export type ShadowCutState = {lastSequence:number; mark?:ShadowMark};
export type ShadowCutActor = Readonly<{point:ShadowPoint;alive:boolean;eligible:boolean}>;
export const SHADOW_CUT_TRIAL = Object.freeze({durationMs:3000,maxReturnDistance:5,maxHeightDifference:1.1});
export function newShadowCutState():ShadowCutState{return {lastSequence:-1};}
function validPoint(p:ShadowPoint):boolean{return typeof p.mapId==="string" && p.mapId.length>0 && [p.x,p.y,p.z].every(Number.isFinite);}
function sequence(state:ShadowCutState,n:number):boolean{
  if(!Number.isSafeInteger(n) || n<0 || n<=state.lastSequence)return false;
  state.lastSequence=n;return true;
}
/** Invoke on death, map/class change or other invalidation. Retains the session replay watermark. */
export function clearShadowCut(state:ShadowCutState):void{delete state.mark;}
export function expireShadowCut(state:ShadowCutState,now:number):void{if(state.mark && now>=state.mark.until)clearShadowCut(state);}
/** After existing server cast validation, perform activation and cost/cooldown commit atomically; reject duplicate commands before charging. */
export function markShadowCut(state:ShadowCutState,actor:ShadowCutActor,now:number,actionSequence:number):boolean{
  if(!Number.isFinite(now) || !sequence(state,actionSequence))return false;
  expireShadowCut(state,now);
  if(state.mark || !actor.alive || !actor.eligible || !validPoint(actor.point))return false;
  state.mark={point:{...actor.point},until:now+SHADOW_CUT_TRIAL.durationMs,sequence:actionSequence};return true;
}
/** The callback must validate destination, map, height, terrain and the whole server-side path. */
export function returnShadowCut(state:ShadowCutState,actor:ShadowCutActor,now:number,actionSequence:number,canReturn:(from:ShadowPoint,to:ShadowPoint)=>boolean):ShadowPoint|undefined{
  if(!Number.isFinite(now) || !sequence(state,actionSequence))return;
  expireShadowCut(state,now);const mark=state.mark;
  if(!mark)return;
  if(!actor.alive || !actor.eligible || !validPoint(actor.point) || actor.point.mapId!==mark.point.mapId){clearShadowCut(state);return;}
  const from=actor.point,to=mark.point;
  if(Math.abs(from.y-to.y)>SHADOW_CUT_TRIAL.maxHeightDifference || Math.hypot(from.x-to.x,from.y-to.y,from.z-to.z)>SHADOW_CUT_TRIAL.maxReturnDistance || !canReturn(from,to))return;
  clearShadowCut(state);return {...to};
}
