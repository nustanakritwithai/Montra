/** Isolated, transient prototype rules. Not wired into the live combat room or save data. */
export type Position = Readonly<{x:number; y:number; z:number}>;
export type AshTrap = Readonly<{
  kind:"seer_ash_rice"; castId:string; ownerId:string; mapId:string;
  position:Position; radius:number; armedAt:number; expiresAt:number;
}>;
export type RescueTalisman = Readonly<{
  kind:"mender_deep_heal"; castId:string; ownerId:string; targetId:string;
  mapId:string; healFraction:number; expiresAt:number;
}>;
export type PrototypeEvent =
  | Readonly<{type:"trap_triggered"; castId:string; ownerId:string; targetId:string; mapId:string; center:Position; radius:number; targetCap:3}>
  | Readonly<{type:"rescue_triggered"; castId:string; ownerId:string; targetId:string; mapId:string; amount:number}>
  | Readonly<{type:"rescue_expired"; castId:string; ownerId:string; targetId:string; mapId:string; amount:number}>
  | Readonly<{type:"expired"; skillId:"seer_ash_rice"|"mender_deep_heal"; castId:string; ownerId:string; targetId?:string; mapId:string}>;
export type Result<T> = Readonly<{state:T|null; event:PrototypeEvent|null}>;

const validId=(value:string):boolean=>typeof value==="string" && value.length>0 && value.length<=128;
const finitePosition=(p:Position):boolean=>!!p && [p.x,p.y,p.z].every(Number.isFinite);
const validTime=(n:number):boolean=>Number.isSafeInteger(n) && n>=0;
/** Return first entry fraction, or null. Boundary contact, including tangency,
 * counts, but a segment beginning on/inside does not. */
function sphereEntry(from:Position, to:Position, center:Position, radius:number):number|null {
  const x=from.x-center.x, y=from.y-center.y, z=from.z-center.z;
  const dx=to.x-from.x, dy=to.y-from.y, dz=to.z-from.z;
  const start=x*x+y*y+z*z, length=dx*dx+dy*dy+dz*dz, radiusSquared=radius*radius;
  if (![start,length,radiusSquared].every(Number.isFinite) || start<=radiusSquared || length===0) return null;
  const projection=-(x*dx+y*dy+z*dz)/length;
  if (!Number.isFinite(projection)) return null;
  const closest=(x+projection*dx)**2+(y+projection*dy)**2+(z+projection*dz)**2;
  if (!Number.isFinite(closest) || closest>radiusSquared) return null;
  const entry=projection-Math.sqrt((radiusSquared-closest)/length);
  return Number.isFinite(entry) && entry>=0 && entry<=1 ? entry : null;
}

/** Caller has already checked the real spell's equipment, learned status, cost, cooldown,
 * placement validity, etc. Reject replacing a live instance; do not consume resources
 * until creation succeeds. Configuration limits are defensive, not balance approval. */
export function createAshTrap(active:AshTrap|null, input:{castId:string; ownerId:string; mapId:string; position:Position; now:number; armDelayMs:number; durationMs:number; radius:number}):AshTrap|null {
  if (active || !validId(input.castId) || !validId(input.ownerId) || !validId(input.mapId) || !finitePosition(input.position) ||
      !validTime(input.now) || !Number.isSafeInteger(input.armDelayMs) || input.armDelayMs<0 ||
      !Number.isSafeInteger(input.durationMs) || input.durationMs!==5000 || input.armDelayMs!==1000 ||
      !Number.isFinite(input.radius) || input.radius<=0 || input.radius>15 || !validTime(input.now+input.durationMs)) return null;
  return {kind:"seer_ash_rice",castId:input.castId,ownerId:input.ownerId,mapId:input.mapId,
    position:{...input.position},radius:input.radius,armedAt:input.now+input.armDelayMs,expiresAt:input.now+input.durationMs};
}

/** One owner/target instance each, enforced by the caller's indexes. */
export function createRescueTalisman(active:RescueTalisman|null, input:{castId:string; ownerId:string; targetId:string; mapId:string; now:number; durationMs:number; healFraction:number}):RescueTalisman|null {
  if (active || !validId(input.castId) || !validId(input.ownerId) || !validId(input.targetId) || !validId(input.mapId) ||
      !validTime(input.now) || !Number.isSafeInteger(input.durationMs) || input.durationMs<=0 || input.durationMs>60000 ||
      !validTime(input.now+input.durationMs) ||
      !Number.isFinite(input.healFraction) || input.healFraction<=0 || input.healFraction>1) return null;
  return {kind:"mender_deep_heal",castId:input.castId,ownerId:input.ownerId,targetId:input.targetId,mapId:input.mapId,
    healFraction:input.healFraction,expiresAt:input.now+input.durationMs};
}

export type RescueContext = Readonly<{targetId:string; mapId:string; alive:boolean; eligible:boolean; ownerValid:boolean; hp:number; maxHp:number}>;
const validRescueTarget=(state:RescueTalisman, target:RescueContext):boolean=>
  target.targetId===state.targetId && target.mapId===state.mapId && target.alive && target.eligible && target.ownerValid &&
  Number.isFinite(target.hp) && Number.isFinite(target.maxHp) && target.hp>0 && target.maxHp>0 && target.hp<target.maxHp;

/** The expiry caller resolves the actual current owner/target and supplies context.
 * Missing or invalid context expires silently without a heal; expiry can never revive. */
export function expirePrototype<T extends AshTrap|RescueTalisman>(state:T|null, now:number, context?:RescueContext):Result<T> {
  if (!state || !validTime(now) || now<state.expiresAt) return {state,event:null};
  if (state.kind==="mender_deep_heal" && context && validRescueTarget(state,context)) {
    const amount=Math.min(context.maxHp-context.hp,Math.max(1,Math.floor(context.maxHp*0.06)));
    return {state:null,event:{type:"rescue_expired",castId:state.castId,ownerId:state.ownerId,targetId:state.targetId,mapId:state.mapId,amount}};
  }
  return {state:null,event:{type:"expired",skillId:state.kind,castId:state.castId,ownerId:state.ownerId,
    ...(state.kind==="mender_deep_heal"?{targetId:state.targetId}:{}),mapId:state.mapId}};
}

export type TrapMovement = Readonly<{previousAt:number; monsterId:string; mapId:string; previous:Position; current:Position; eligible:boolean}>;
/** Resolve all consecutive authoritative movement samples for this tick before expiry.
 * Samples must not interpolate teleports or changes of map. Reject duplicate IDs or
 * more than 1,024 samples rather than silently selecting from an incomplete batch.
 * Earliest entry wins; simultaneous entries are ordered by code-unit monster ID. */
export function observeTrapBatch(state:AshTrap|null, input:{now:number; ownerValid:boolean; movements:readonly TrapMovement[]}):Result<AshTrap> {
  const fallback=expirePrototype(state,input.now);
  if (!state || !validTime(input.now) || !input.ownerValid || input.now<=state.armedAt ||
      !Array.isArray(input.movements) || input.movements.length>1024) return fallback;
  const seen=new Set<string>();
  for (const movement of input.movements) {
    if (!validId(movement.monsterId) || seen.has(movement.monsterId)) return fallback;
    seen.add(movement.monsterId);
  }
  let winner:{id:string; at:number}|null=null;
  for (const movement of input.movements) {
    if (!validTime(movement.previousAt) || movement.previousAt>=input.now || movement.previousAt>=state.expiresAt ||
        movement.mapId!==state.mapId || !movement.eligible || !finitePosition(movement.previous) || !finitePosition(movement.current)) continue;
    const startAt=Math.max(movement.previousAt,state.armedAt), endAt=Math.min(input.now,state.expiresAt);
    if (startAt>=endAt) continue;
    const pointAt=(time:number):Position=>{
      const t=(time-movement.previousAt)/(input.now-movement.previousAt);
      return {x:movement.previous.x+(movement.current.x-movement.previous.x)*t,
        y:movement.previous.y+(movement.current.y-movement.previous.y)*t,
        z:movement.previous.z+(movement.current.z-movement.previous.z)*t};
    };
    const from=pointAt(startAt),to=pointAt(endAt);
    if (!finitePosition(from) || !finitePosition(to)) continue;
    const entry=sphereEntry(from,to,state.position,state.radius);
    // On/inside at arming does not count; contact exactly at expiry loses.
    if (entry===null || (endAt===state.expiresAt && entry>=1)) continue;
    const at=startAt+entry*(endAt-startAt);
    if (!winner || at<winner.at || (at===winner.at && movement.monsterId<winner.id)) winner={id:movement.monsterId,at};
  }
  if (!winner) return fallback;
  const event=Object.freeze({type:"trap_triggered" as const,castId:state.castId,ownerId:state.ownerId,
    targetId:winner.id,mapId:state.mapId,center:Object.freeze({...state.position}),radius:state.radius,targetCap:3 as const});
  return {state:null,event};
}

export type TrapTrigger = Extract<PrototypeEvent,{type:"trap_triggered"}>;
export type TrapCandidate = Readonly<{id:string; mapId:string; alive:boolean; position:Position}>;
/** Resolve from fresh authoritative monster state, never client data. The triggering
 * monster is retained if still eligible even when its segment ends outside the radius;
 * the remaining slots are closest in 3D, ties by code-unit ID. Duplicate IDs fail closed.
 * The pure callback must validate current combat eligibility, immunity and LOS. */
export function selectTrapTargets(event:TrapTrigger, candidates:readonly TrapCandidate[], canHit:(candidate:TrapCandidate)=>boolean):readonly string[] {
  const seen=new Set<string>();
  for (const candidate of candidates) {
    if (!validId(candidate.id) || seen.has(candidate.id)) return [];
    seen.add(candidate.id);
  }
  const eligible=candidates.filter(candidate=>candidate.alive && candidate.mapId===event.mapId && finitePosition(candidate.position) && canHit(candidate));
  const trigger=eligible.find(candidate=>candidate.id===event.targetId);
  if (!trigger) return [];
  const distance=(position:Position):number=>(position.x-event.center.x)**2+(position.y-event.center.y)**2+(position.z-event.center.z)**2;
  const others=eligible.filter(candidate=>candidate.id!==trigger.id && Number.isFinite(distance(candidate.position)) && distance(candidate.position)<=event.radius**2)
    .sort((a,b)=>distance(a.position)-distance(b.position) || (a.id<b.id?-1:a.id>b.id?1:0));
  return [trigger.id,...others.slice(0,event.targetCap-1).map(candidate=>candidate.id)];
}

/** Called after damage has been applied to an alive target. Never revives and never
 * calls a heal hook itself. The caller must consume the state before applying the heal. */
export function observeRescue(state:RescueTalisman|null, input:{now:number; targetId:string; mapId:string; alive:boolean; eligible:boolean; ownerValid:boolean; hp:number; maxHp:number}):Result<RescueTalisman> {
  const expired=expirePrototype(state,input.now,input); if (!expired.state || expired.event) return expired;
  const talisman=expired.state;
  if (!validTime(input.now) || input.targetId!==talisman.targetId || input.mapId!==talisman.mapId || !input.alive || !input.eligible || !input.ownerValid ||
      !Number.isFinite(input.hp) || !Number.isFinite(input.maxHp) || input.hp<=0 || input.maxHp<=0 || input.hp>input.maxHp ||
      input.hp/input.maxHp>=0.4) return {state:talisman,event:null};
  const amount=Math.min(input.maxHp-input.hp,Math.max(1,Math.floor(input.maxHp*talisman.healFraction)));
  return {state:null,event:{type:"rescue_triggered",castId:talisman.castId,ownerId:talisman.ownerId,targetId:talisman.targetId,mapId:talisman.mapId,amount}};
}

/** Silent invalidation: death, warp, class change, disconnect, reconnect and room exit.
 * The caller must invoke for either affected owner or target and delete the index entry. */
export function clearPrototype<T extends AshTrap|RescueTalisman>(state:T|null, playerId:string):T|null {
  if (!state || state.ownerId===playerId || (state.kind==="mender_deep_heal" && state.targetId===playerId)) return null;
  return state;
}
