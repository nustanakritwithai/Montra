/** Isolated, in-memory groundwork. Not connected to game, transport or saves.
 * The producer must allocate an identity once per logical hit and reuse it for
 * every delivery/retry. Allocating a new ID during a retry defeats deduplication.
 */
export type DamageSource = "direct" | "damage_over_time" | "transfer" | "unknown";
export type DamageChildKind = "counter" | "intercept";
export type DamageChild = Readonly<{kind:DamageChildKind;targetId:string;ordinal:number;parentSource:DamageSource}>;
export type DamageEventIdentity = Readonly<{
  roomEpoch:string;producerId:string;occurrence:number;targetId:string;hitOrdinal:number;
  source:DamageSource;lineage:readonly DamageChild[];
}>;
export type DamageStatus = "in_progress" | "completed" | "uncertain";
export type DamageReservation =
  | {kind:"reserved";ticket:symbol}
  | {kind:"duplicate";status:DamageStatus}
  | {kind:"conflict"} | {kind:"capacity"} | {kind:"invalid"};
export type DamageExecution<T> = Exclude<DamageReservation,{kind:"reserved"}> | {kind:"completed";value:T};
type Entry={fingerprint:string;status:DamageStatus;retryUntilMs:number;ticket:symbol};
const SOURCES:readonly DamageSource[]=["direct","damage_over_time","transfer","unknown"];
const CHILD_KINDS:readonly DamageChildKind[]=["counter","intercept"];
const MAX_DEPTH=8,MAX_CAPACITY=10_000;
function token(s:unknown):s is string{return typeof s==="string" && s.length>0 && s.length<=128;}
function ordinal(n:unknown):n is number{return typeof n==="number" && Number.isSafeInteger(n) && n>=0;}
function childSource(kind:DamageChildKind):DamageSource{return kind==="counter"?"direct":"transfer";}
function encode(identity:DamageEventIdentity):{key:string;source:string}|undefined {
  if(!identity || !token(identity.roomEpoch) || !token(identity.producerId) || !ordinal(identity.occurrence) ||
    !token(identity.targetId) || !ordinal(identity.hitOrdinal) || !SOURCES.includes(identity.source) ||
    !Array.isArray(identity.lineage) || identity.lineage.length>MAX_DEPTH)return;
  const children:Array<[DamageChildKind,string,number]>=[],ancestorSources:DamageSource[]=[];
  let previousChildSource:DamageSource|undefined;
  for(const step of identity.lineage){
    if(!step || !CHILD_KINDS.includes(step.kind) || !token(step.targetId) || !ordinal(step.ordinal) || !SOURCES.includes(step.parentSource) ||
      (previousChildSource!==undefined && step.parentSource!==previousChildSource))return;
    children.push([step.kind,step.targetId,step.ordinal]);ancestorSources.push(step.parentSource);
    previousChildSource=childSource(step.kind);
  }
  if(previousChildSource!==undefined && identity.source!==previousChildSource)return;
  // Source and immutable hit details are checked as a fingerprint for a given
  // occurrence key: conflicting metadata must never become a second valid hit.
  return {key:JSON.stringify([identity.roomEpoch,identity.producerId,identity.occurrence,identity.targetId,identity.hitOrdinal,children]),source:JSON.stringify([identity.source,ancestorSources])};
}
/** Child keeps the root occurrence and target, plus a deterministic path.
 * Counter and interception are separate child effects, never the parent's ID. */
export function childDamageEvent(parent:DamageEventIdentity,kind:DamageChildKind,targetId:string,childOrdinal:number):DamageEventIdentity {
  if(!encode(parent) || !CHILD_KINDS.includes(kind) || !token(targetId) || !ordinal(childOrdinal) || parent.lineage.length>=MAX_DEPTH)throw Error("invalid_damage_child");
  return Object.freeze({roomEpoch:parent.roomEpoch,producerId:parent.producerId,occurrence:parent.occurrence,
    targetId:parent.targetId,hitOrdinal:parent.hitOrdinal,source:childSource(kind),
    lineage:Object.freeze([...parent.lineage.map(step=>Object.freeze({...step})),Object.freeze({kind,targetId,ordinal:childOrdinal,parentSource:parent.source})])});
}
/** A room-local bounded ledger. No data or credentials are serialized. */
export class DamageEventLedger {
  private readonly entries=new Map<string,Entry>();
  private readonly tickets=new Map<symbol,string>();
  constructor(readonly capacity:number){if(!Number.isSafeInteger(capacity) || capacity<1 || capacity>MAX_CAPACITY)throw Error("invalid_damage_capacity");}
  get size():number{return this.entries.size;}
  /** detailFingerprint is derived from immutable authoritative hit details. */
  reserve(identity:DamageEventIdentity,detailFingerprint:string,nowMs:number,retryUntilMs:number):DamageReservation {
    const encoded=encode(identity);
    if(!encoded || typeof detailFingerprint!=="string" || detailFingerprint.length===0 || detailFingerprint.length>512 ||
      !Number.isFinite(nowMs) || nowMs<0 || !Number.isFinite(retryUntilMs) || retryUntilMs<nowMs)return {kind:"invalid"};
    const fingerprint=JSON.stringify([encoded.source,detailFingerprint]);
    const existing=this.entries.get(encoded.key);
    if(existing){
      if(existing.fingerprint!==fingerprint)return {kind:"conflict"};
      existing.retryUntilMs=Math.max(existing.retryUntilMs,retryUntilMs);
      return {kind:"duplicate",status:existing.status};
    }
    if(this.entries.size>=this.capacity)return {kind:"capacity"};
    const ticket=Symbol("damage_reservation");
    this.entries.set(encoded.key,{fingerprint,status:"in_progress",retryUntilMs,ticket});this.tickets.set(ticket,encoded.key);
    return {kind:"reserved",ticket};
  }
  private finish(ticket:symbol,status:"completed"|"uncertain"):boolean {
    const key=this.tickets.get(ticket),entry=key===undefined?undefined:this.entries.get(key);
    if(!entry || entry.ticket!==ticket || entry.status!=="in_progress")return false;
    entry.status=status;return true;
  }
  complete(ticket:symbol):boolean{return this.finish(ticket,"completed");}
  markUncertain(ticket:symbol):boolean{return this.finish(ticket,"uncertain");}
  /** Execute only synchronous, eager side effects. A thrown error leaves the
   * identity uncertain and is rethrown; retrying that identity is rejected.
   * The top-level return must not be a promise/thenable, iterator, or any
   * synchronous or asynchronous iterable (including arrays, maps and sets).
   * Scalar strings are allowed. Nested values are not inspected.
   * Declared async/generator operations are rejected without invoking them.
   * A function may already have scheduled work before returning a promise or
   * iterable; observing/rejecting that result cannot cancel such work. Its end
   * must be established by the producer before asserting occurrence closure. */
  execute<T>(identity:DamageEventIdentity,detailFingerprint:string,nowMs:number,retryUntilMs:number,operation:()=>T):DamageExecution<T> {
    const tag=Object.prototype.toString.call(operation);
    if(tag==="[object AsyncFunction]" || tag==="[object GeneratorFunction]" || tag==="[object AsyncGeneratorFunction]")return {kind:"invalid"};
    const result=this.reserve(identity,detailFingerprint,nowMs,retryUntilMs);
    if(result.kind!=="reserved")return result;
    try{
      const value=operation();
      if(value!==null && (typeof value==="object" || typeof value==="function")){
        const deferred=value as {then?:unknown;next?:unknown;[Symbol.iterator]?:unknown;[Symbol.asyncIterator]?:unknown};
        if(typeof deferred.then==="function"){
          // Observe rejection immediately. This does not cancel already scheduled work.
          void Promise.resolve(value).catch(()=>{});
          throw Error("async_damage_operation_not_supported");
        }
        if(typeof deferred.next==="function" || typeof deferred[Symbol.iterator]==="function" || typeof deferred[Symbol.asyncIterator]==="function")throw Error("iterator_damage_operation_not_supported");
      }
      this.complete(result.ticket);return {kind:"completed",value};
    }catch(error){this.markUncertain(result.ticket);throw error;}
  }
  /** Retire only after the time window AND the producer confirms the occurrence
   * is closed: no side effect remains running and no callback or retry can ever
   * arrive. This proof is the caller's responsibility. In-progress work cannot
   * be retired. An incorrect closure assertion can allow an old event again. */
  retire(identity:DamageEventIdentity,detailFingerprint:string,nowMs:number,occurrenceClosed:boolean):boolean {
    const encoded=encode(identity);if(!encoded || typeof detailFingerprint!=="string" || !Number.isFinite(nowMs) || !occurrenceClosed)return false;
    const entry=this.entries.get(encoded.key);
    if(!entry || entry.fingerprint!==JSON.stringify([encoded.source,detailFingerprint]) || entry.status==="in_progress" || nowMs<entry.retryUntilMs)return false;
    this.entries.delete(encoded.key);this.tickets.delete(entry.ticket);return true;
  }
}
