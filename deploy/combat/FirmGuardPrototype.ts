/** Isolated server-only prototype. State is session-local and must never enter saves. */
export type GuardPoint=Readonly<{x:number;y:number;z:number;mapId:string}>;
export type GuardActor=Readonly<{id:string;point:GuardPoint;alive:boolean;eligible:boolean}>;
export type FirmGuardState={lastCastSequence:number;lastHitSequence:number;guard?:{until:number;remainingHits:number;point:GuardPoint;facing:number}};
export const FIRM_GUARD_TRIAL=Object.freeze({durationMs:3000,maximumHits:2,reduction:0.30,allyRange:4,maximumHeightDifference:1.1});
export function newFirmGuardState():FirmGuardState{return {lastCastSequence:-1,lastHitSequence:-1};}
export function clearFirmGuard(state:FirmGuardState):void{delete state.guard;}
export function expireFirmGuard(state:FirmGuardState,now:number):void{if(state.guard && now>=state.guard.until)clearFirmGuard(state);}
function validPoint(p:GuardPoint):boolean{return typeof p.mapId==="string" && p.mapId.length>0 && [p.x,p.y,p.z].every(Number.isFinite);}
/** After existing server cast validation, perform activation and cost/cooldown commit atomically; reject duplicate commands before charging. */
export function activateFirmGuard(state:FirmGuardState,actor:GuardActor,now:number,sequence:number,facing:number):boolean{
  if(!Number.isFinite(now) || !Number.isSafeInteger(sequence) || sequence<0 || sequence<=state.lastCastSequence)return false;
  state.lastCastSequence=sequence;expireFirmGuard(state,now);
  if(state.guard || !actor.alive || !actor.eligible || !validPoint(actor.point) || !Number.isFinite(facing))return false;
  state.guard={until:now+FIRM_GUARD_TRIAL.durationMs,remainingHits:FIRM_GUARD_TRIAL.maximumHits,point:{...actor.point},facing};return true;
}
/** Invoke on every authoritative movement/rotation and simulation tick, not only on hit. */
export function updateFirmGuard(state:FirmGuardState,actor:GuardActor,facing:number,now:number):void{
  if(!Number.isFinite(now)){clearFirmGuard(state);return;}
  expireFirmGuard(state,now);const guard=state.guard;if(!guard)return;
  if(!actor.alive || !actor.eligible || !validPoint(actor.point) || !Number.isFinite(facing)){clearFirmGuard(state);return;}
  const p=actor.point;
  const stationary=p.mapId===guard.point.mapId && Math.hypot(p.x-guard.point.x,p.y-guard.point.y,p.z-guard.point.z)<=1e-6;
  const turn=Math.abs(Math.atan2(Math.sin(facing-guard.facing),Math.cos(facing-guard.facing)));
  if(!stationary || turn>1e-6)clearFirmGuard(state);
}
export type FirmGuardResult = {kind:"pass";factor:1}|{kind:"protected";factor:number}|{kind:"duplicate"}|{kind:"invalid"};
/** All actors, party/side eligibility, facing and hitSequence come from the authoritative server.
 * Resolve at most one guard per damage event; do not stack with another firm guard.
 * canProtect must check server collision/line of sight. Apply damage only for pass/protected.
 * Global damage deduplication is the caller’s responsibility: this guard records only events observed while active. */
export function firmGuardMultiplier(state:FirmGuardState,now:number,hitSequence:number,guardian:GuardActor,facing:number,ally:GuardActor,attacker:GuardActor,partyAndCombatEligible:boolean,canProtect:(guardian:GuardPoint,ally:GuardPoint,attacker:GuardPoint)=>boolean):FirmGuardResult{
  if(!Number.isFinite(now) || !Number.isSafeInteger(hitSequence) || hitSequence<0)return {kind:"invalid"};
  updateFirmGuard(state,guardian,facing,now);const guard=state.guard;
  if(hitSequence<=state.lastHitSequence)return {kind:"duplicate"};
  if(!guard)return {kind:"pass",factor:1};
  state.lastHitSequence=hitSequence;
  if(!guardian.alive || !guardian.eligible || !validPoint(guardian.point)){clearFirmGuard(state);return {kind:"pass",factor:1};}
  if(!guardian.id || !ally.id || !attacker.id || guardian.id===attacker.id || ally.id===attacker.id || !ally.alive || !ally.eligible || !attacker.alive || !attacker.eligible || !partyAndCombatEligible || !Number.isFinite(facing) || !validPoint(ally.point) || !validPoint(attacker.point))return {kind:"pass",factor:1};
  const g=guardian.point,a=guardian.id===ally.id?g:ally.point,e=attacker.point;
  if(g.mapId!==a.mapId || g.mapId!==e.mapId || Math.abs(g.y-a.y)>FIRM_GUARD_TRIAL.maximumHeightDifference || Math.abs(g.y-e.y)>FIRM_GUARD_TRIAL.maximumHeightDifference)return {kind:"pass",factor:1};
  const fx=-Math.sin(facing),fz=-Math.cos(facing),ax=a.x-g.x,az=a.z-g.z,ex=e.x-g.x,ez=e.z-g.z;
  const allyBehind=ax*fx+az*fz,enemyFront=ex*fx+ez*fz;
  if(enemyFront<=0 || (guardian.id!==ally.id && (allyBehind>=0 || Math.hypot(ax,a.y-g.y,az)>FIRM_GUARD_TRIAL.allyRange)) || !canProtect(g,a,e))return {kind:"pass",factor:1};
  guard.remainingHits--;if(guard.remainingHits===0)clearFirmGuard(state);
  return {kind:"protected",factor:1-FIRM_GUARD_TRIAL.reduction};
}
