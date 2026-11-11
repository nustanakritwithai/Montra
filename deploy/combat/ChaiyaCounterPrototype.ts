/** Provisional rules, kept separate from learned skills and persisted character data. */
export const CHAIYA_DEBUFF_MS=3000;
export const CHAIYA_COUNTER_WINDOW_MS=3000;
export const CHAIYA_NEXT_PHYSICAL_FACTOR=0.75;
export type CounterCursor=Readonly<{lastSeq:number}>;
export type CounterOpportunity=Readonly<{attackerId:string;openedAt:number;until:number}>;
export type ChaiyaDebuff=Readonly<{monsterId:string;sourceId:string;until:number}>;
export const newCounterCursor=():CounterCursor=>({lastSeq:-1});
export function activeChaiyaDebuff(debuff:ChaiyaDebuff|undefined,now:number):ChaiyaDebuff|undefined {
  return debuff && Number.isSafeInteger(now) && now>=0 && now<=Number.MAX_SAFE_INTEGER-CHAIYA_DEBUFF_MS && now<debuff.until ? debuff : undefined;
}
/** Called only when the server confirms a successful block and resolves its attacker. */
export function recordChaiyaBlock(attackerId:string,now:number):CounterOpportunity|undefined {
  if(typeof attackerId!=="string" || !attackerId || attackerId.length>256 || !Number.isSafeInteger(now) || now<0 || now>Number.MAX_SAFE_INTEGER-CHAIYA_COUNTER_WINDOW_MS)return undefined;
  return {attackerId,openedAt:now,until:now+CHAIYA_COUNTER_WINDOW_MS};
}
/** Check before spending or dealing damage; the server must consume the
 * opportunity atomically with an accepted counter. */
export function validChaiyaOpportunity(opportunity:CounterOpportunity|undefined,targetId:string,now:number):boolean {
  return !!opportunity && Number.isSafeInteger(now) && Number.isSafeInteger(opportunity.openedAt) && Number.isSafeInteger(opportunity.until) && now>=opportunity.openedAt && now<opportunity.until && opportunity.attackerId===targetId;
}
/**
 * The room checks eligibility before costs or damage, then in one synchronous
 * server transaction consumes the opportunity, spends mana, starts cooldown and
 * resolves the hit. A rejected preflight commits none of those effects. Once
 * accepted, this is a paid attempt: a reactive counter may defeat the caster
 * before the hit lands, with no hit-success event and no undo of combat effects.
 * Keep the old opportunity locally through hit resolution for grantChaiyaDebuff; never
 * reinsert it. Subsequent casts receive the returned opportunity.
 */
export function consumeChaiyaOpportunity(opportunity:CounterOpportunity|undefined,targetId:string,now:number):{accepted:boolean;opportunity:CounterOpportunity|undefined} {
  return validChaiyaOpportunity(opportunity,targetId,now) ? {accepted:true,opportunity:undefined} : {accepted:false,opportunity};
}
/**
 * Call only for a server-confirmed hit after the existing guard counter window,
 * combat eligibility, cost and cooldown have been validated atomically. This
 * first prototype never applies the debuff to players or bosses.
 */
export function grantChaiyaDebuff(cursor:CounterCursor,existing:ChaiyaDebuff|undefined,
  now:number,seq:number,sourceId:string,targetId:string,targetKind:"normal_monster"|"boss"|"player",
  counterValid:boolean,targetAlive:boolean,opportunity:CounterOpportunity|undefined):{cursor:CounterCursor;debuff:ChaiyaDebuff|undefined;applied:boolean} {
  if(!Number.isSafeInteger(now) || now<0 || now>Number.MAX_SAFE_INTEGER-CHAIYA_DEBUFF_MS || !Number.isSafeInteger(seq) || seq<0 || seq<=cursor.lastSeq)
    return {cursor,debuff:existing,applied:false};
  cursor={lastSeq:seq};
  existing=activeChaiyaDebuff(existing,now);
  if(!counterValid || !targetAlive || !validChaiyaOpportunity(opportunity,targetId,now) || typeof sourceId!=="string" || !sourceId || sourceId.length>256 || typeof targetId!=="string" || !targetId || targetId.length>256 || targetKind!=="normal_monster" || existing)
    return {cursor,debuff:existing,applied:false};
  return {cursor,debuff:{monsterId:targetId,sourceId,until:now+CHAIYA_DEBUFF_MS},applied:true};
}
/** A single positive direct physical hit by the marked monster consumes it. */
export function consumeChaiyaDebuff(debuff:ChaiyaDebuff|undefined,now:number,attackerId:string,
  kind:"direct_physical"|"other",damage:number):{debuff:ChaiyaDebuff|undefined;factor:number} {
  debuff=activeChaiyaDebuff(debuff,now);
  if(!debuff || debuff.monsterId!==attackerId || kind!=="direct_physical" || !Number.isFinite(damage) || damage<=0)
    return {debuff,factor:1};
  return {debuff:undefined,factor:CHAIYA_NEXT_PHYSICAL_FACTOR};
}
/** Discard marks sourced by or belonging to the removed entity; retain the
 * session cursor on death/map/class change. New connections create a cursor. */
export function clearChaiyaDebuff(debuff:ChaiyaDebuff|undefined,entityId:string):ChaiyaDebuff|undefined {
  return debuff && (debuff.monsterId===entityId || debuff.sourceId===entityId) ? undefined : debuff;
}
