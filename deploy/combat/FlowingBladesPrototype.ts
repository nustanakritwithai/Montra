/** Isolated, provisional server rules. Never persist this session state. */
export const FLOWING_FOLLOW_MIN_MS=300;
export const FLOWING_CHOICE_MS=1200;
export const FLOWING_GUARD_MS=1000;
export const FLOWING_GUARD_DAMAGE_FACTOR=0.7;

export type FlowingState = Readonly<{
  lastSeq:number;
  lastNow:number;
  pending?:Readonly<{targetId:string;openedAt:number;until:number}>;
  guard?:Readonly<{until:number}>;
}>;
export type FlowingResult = Readonly<{state:FlowingState;action:"first"|"followup"|"none";reason?:string}>;
export const newFlowingState=():FlowingState=>({lastSeq:-1,lastNow:0});
const validTime=(now:number)=>Number.isSafeInteger(now) && now>=0 && now<=Number.MAX_SAFE_INTEGER-FLOWING_CHOICE_MS-FLOWING_GUARD_MS;

/** Expiry chooses guard, anchored to the deadline, not to a delayed server tick. */
export function advanceFlowing(state:FlowingState,now:number):FlowingState {
  if(!validTime(now) || now<state.lastNow)return state;
  let pending=state.pending,guard=state.guard;
  if(pending && now>=pending.until) {
    guard=now<pending.until+FLOWING_GUARD_MS ? {until:pending.until+FLOWING_GUARD_MS} : undefined;
    pending=undefined;
  }
  if(guard && now>=guard.until)guard=undefined;
  return {lastSeq:state.lastSeq,lastNow:now,pending,guard};
}

/**
 * The caller supplies a strictly increasing per-session command sequence and
 * validates eligibility and target against server state before accepting an action.
 * The first action alone pays the existing skill's cost and starts its cooldown.
 */
export function useFlowing(state:FlowingState,now:number,seq:number,targetId:string,serverValid:boolean):FlowingResult {
  if(!validTime(now) || now<state.lastNow)return {state,action:"none",reason:"invalid_time"};
  state=advanceFlowing(state,now);
  if(!Number.isSafeInteger(seq) || seq<0 || seq<=state.lastSeq)return {state,action:"none",reason:"replay"};
  state={...state,lastSeq:seq};
  if(!serverValid || typeof targetId!=="string" || !targetId || targetId.length>256)return {state,action:"none",reason:"invalid_target_or_caster"};
  if(state.pending) {
    if(targetId!==state.pending.targetId)return {state,action:"none",reason:"wrong_target"};
    if(now<state.pending.openedAt+FLOWING_FOLLOW_MIN_MS)return {state,action:"none",reason:"too_early"};
    return {state:{lastSeq:seq,lastNow:now},action:"followup"};
  }
  if(state.guard)return {state,action:"none",reason:"guard_active"};
  return {state:{lastSeq:seq,lastNow:now,pending:{targetId,openedAt:now,until:now+FLOWING_CHOICE_MS}},action:"first"};
}

/** Remove combat state while retaining the replay watermark for this session.
 * A new network session must create a new state instead. */
export const clearFlowing=(state:FlowingState):FlowingState=>({lastSeq:state.lastSeq,lastNow:state.lastNow});

/** Call after a different skill is accepted by the session command gate. */
export function cancelFlowing(state:FlowingState,now:number,seq:number):FlowingState {
  if(!validTime(now) || now<state.lastNow || !Number.isSafeInteger(seq) || seq<0 || seq<=state.lastSeq)return state;
  return {lastSeq:seq,lastNow:now};
}

/** Consume one positive frontal hit, with direction verified by the server. */
export function consumeFlowingGuard(state:FlowingState,now:number,serverFront:boolean,damage:number):{state:FlowingState;factor:number} {
  if(!validTime(now) || now<state.lastNow)return {state,factor:1};
  state=advanceFlowing(state,now);
  if(!state.guard || !serverFront || !Number.isFinite(damage) || damage<=0)return {state,factor:1};
  return {state:{...state,guard:undefined},factor:FLOWING_GUARD_DAMAGE_FACTOR};
}
