import type { CombatStats } from "./Progression.js";

/** Trial tuning: change here after live playtesting, never from client payloads. */
export const POSSESSION_BUFF = Object.freeze({id:"possession",durationMs:60_000,cooldownMs:30_000,statMultiplier:1.2});
export type BuffId = typeof POSSESSION_BUFF.id;
/** Always recalculate from unbuffed stats so refreshes and level-ups cannot stack. */
export function applyBuffs(base:CombatStats, active:readonly BuffId[]):CombatStats {
  const ids=new Set(active);
  if(active.some(id=>id!==POSSESSION_BUFF.id)) throw new Error("invalid_buff_id");
  const multiplier=ids.has(POSSESSION_BUFF.id)?POSSESSION_BUFF.statMultiplier:1;
  return {...base,atk:Math.round(base.atk*multiplier),def:Math.round(base.def*multiplier),
    magicAtk:Math.round(base.magicAtk*multiplier),magicDef:Math.round(base.magicDef*multiplier)};
}
/** Server simulation time only; never trusts client duration or bonuses. */
export class BuffBook {
  private active=new Map<string,number>();
  private cooldown=new Map<string,number>();
  activate(id:string,now:number):"ok"|"active"|"cooldown" {
    if(this.active.has(id))return "active";
    if(now<(this.cooldown.get(id)??0))return "cooldown";
    this.cooldown.delete(id);this.active.set(id,now+POSSESSION_BUFF.durationMs);return "ok";
  }
  end(id:string,now:number):boolean {
    if(!this.active.delete(id))return false;
    this.cooldown.set(id,now+POSSESSION_BUFF.cooldownMs);return true;
  }
  expired(now:number):string[] {return [...this.active].filter(([,at])=>now>=at).map(([id])=>id);}
  forget(id:string):void {this.active.delete(id);this.cooldown.delete(id);}
  clear():void {this.active.clear();this.cooldown.clear();}
}

/** Preserve the cooldown across rooms/reconnections while this Node process lives. */
const reconnectCooldown=new Map<string,number>();
export function possessionCoolingDown(characterId:string|undefined,now=Date.now()):boolean {
  if(!characterId)return false;
  const until=reconnectCooldown.get(characterId)??0;
  if(now>=until){reconnectCooldown.delete(characterId);return false;}
  return true;
}
export function rememberPossessionCooldown(characterId:string|undefined,now=Date.now()):void {
  if(!characterId)return;
  const until=now+POSSESSION_BUFF.cooldownMs;reconnectCooldown.set(characterId,until);
  const timer=setTimeout(()=>{if(reconnectCooldown.get(characterId)===until)reconnectCooldown.delete(characterId);},POSSESSION_BUFF.cooldownMs);
  timer.unref();
}
