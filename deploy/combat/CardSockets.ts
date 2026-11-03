import { INVENTORY_SLOT_COUNT, grantStackReward, isSocketGear, validateInventory, type InventorySnapshot, type WeaponItemId } from "./ItemRules.js";
import { isBodySlot, isCardId, personalItem, type BodyItemId, type BodySlot, type CardId } from "./PersonalItems.js";

export const DRILL_COST={gold:20,itemId:"mat_metal_1",quantity:1} as const;
export type SocketOrder={
  requestId:string; target:number|BodySlot; gear:WeaponItemId|BodyItemId;
  action:"drill"|"insert"|"remove"; expected:"sealed"|"empty"|CardId; card:CardId|null;
};

export function parseSocketOrder(value:unknown):SocketOrder|null {
  if(!value || typeof value!=="object" || Array.isArray(value))return null;
  const v=value as Record<string,unknown>;
  if(Object.keys(v).length!==6 || !["requestId","target","gear","action","expected","card"].every(key=>Object.hasOwn(v,key)) ||
      typeof v.requestId!=="string" || !/^[a-zA-Z0-9_-]{16,64}$/.test(v.requestId) || !isSocketGear(v.gear))return null;
  const validTarget=isBodySlot(v.target) || (Number.isInteger(v.target) && (v.target as number)>=0 && (v.target as number)<INVENTORY_SLOT_COUNT);
  if(!validTarget)return null;
  const validAction=(v.action==="drill" && v.expected==="sealed" && v.card===null)
    || (v.action==="insert" && v.expected==="empty" && isCardId(v.card))
    || (v.action==="remove" && isCardId(v.expected) && v.card===null);
  return validAction?v as SocketOrder:null;
}

function spend(bag:InventorySnapshot,id:CardId|typeof DRILL_COST.itemId,quantity:number,reason:string):void {
  for(const [slot,stack] of bag.slots.entries()){
    if(stack?.itemId!==id)continue;
    const used=Math.min(stack.quantity,quantity);
    bag.slots[slot]=stack.quantity===used?null:{...stack,quantity:stack.quantity-used};
    quantity-=used;
    if(quantity===0)return;
  }
  throw Error(reason);
}

export function changeCardSocket(inventory:InventorySnapshot,order:SocketOrder) {
  let bag=validateInventory(inventory);
  const {target,gear}=order;
  const currentGear=typeof target==="number"?bag.slots[target]?.itemId:bag.equipment?.[target];
  const current=typeof target==="number"?bag.slots[target]?.socket:bag.equipmentSockets?.[target];
  const state=current===undefined?"sealed":current===null?"empty":current;
  if(currentGear!==gear || state!==order.expected)throw Error("socket_changed");
  let next:CardId|null=null;
  if(order.action==="drill"){
    if(current!==undefined)throw Error("socket_changed");
    spend(bag,DRILL_COST.itemId,DRILL_COST.quantity,"drill_missing_metal");
  }else if(order.action==="insert"){
    if(current!==null)throw Error("socket_changed");
    if(!isCardId(order.card))throw Error("card_unavailable");
    if((personalItem(order.card)?.level??1)>(personalItem(gear)?.level??(gear==="shrine_glaive"?12:1)))throw Error("card_gear_level");
    spend(bag,order.card,1,"card_unavailable");
    next=order.card;
  }else{
    if(!isCardId(current))throw Error("socket_changed");
    const returned=grantStackReward(bag,current);
    if(!returned)throw Error("inventory_full");
    bag=returned;
  }
  if(typeof target==="number")bag.slots[target]={...bag.slots[target]!,socket:next};
  else bag.equipmentSockets={...bag.equipmentSockets,[target]:next};
  return {bag:validateInventory(bag),socket:next};
}
