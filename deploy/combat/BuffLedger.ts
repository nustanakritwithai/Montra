/** Server-owned active effect ledger; clients never submit modifier definitions. */
import { calculateModifiedStats, STACKING_RULES, type StatModifier } from "./StatModifiers.js";
const ZERO={maxHp:0,maxStamina:0,atk:0,def:0,magicAtk:0,magicDef:0};
type Entry={modifier:StatModifier; expiresAt:number};
export class BuffLedger {
  private owners=new Map<string,Map<string,Entry>>();
  grant(owner:string,modifier:StatModifier,expiresAt:number):void {
    if(typeof owner!=="string" || !owner || owner.length>100 || !Number.isFinite(expiresAt) || expiresAt<0)throw new Error("invalid_buff_instance");
    calculateModifiedStats(ZERO,[modifier]);
    const key=modifier.sourceId+":"+modifier.id, current=this.owners.get(owner)??new Map<string,Entry>();
    if(!current.has(key) && current.size>=STACKING_RULES.maxModifiers)throw new Error("invalid_modifier_count");
    current.set(key,{modifier:Object.freeze({...modifier,bonuses:Object.freeze({...modifier.bonuses})}),expiresAt});
    this.owners.set(owner,current);
  }
  remove(owner:string,id:string,sourceId:string):boolean {
    const entries=this.owners.get(owner);if(!entries)return false;
    const removed=entries.delete(sourceId+":"+id);if(!entries.size)this.owners.delete(owner);return removed;
  }
  modifiers(owner:string):readonly StatModifier[] {return [...(this.owners.get(owner)?.values()??[])].map(e=>e.modifier);}
  expire(now:number):string[] {
    if(!Number.isFinite(now) || now<0)throw new Error("invalid_buff_time");
    const changed:string[]=[];
    for(const [owner,entries] of this.owners) {
      let removed=false;for(const [key,entry] of entries)if(now>=entry.expiresAt){entries.delete(key);removed=true;}
      if(removed)changed.push(owner);if(!entries.size)this.owners.delete(owner);
    }
    return changed;
  }
  forget(owner:string):void {this.owners.delete(owner);}
  clear():void {this.owners.clear();}
}
