import { personalItem, isBodySlot, isCardId, type CardId, type PersonalId } from "./PersonalItems.js";
import { SHRINE_RECIPE } from "./ItemRules.js";
import type { TradeOffer } from "./EconomyStore.js";
function keys(value: unknown, expected: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value,key));
}
const requestId=(v:unknown):v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{16,64}$/.test(v);
const uuid=(v:unknown):v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const amount=(v:unknown, max:number):v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
export function parseMarketCreate(v:unknown): {requestId:string;slot:number;amount:number;price:number;stamp?:string}|null {
  const fields=["requestId","slot","amount","price"];
  if ((!keys(v,fields) && !keys(v,[...fields,"stamp"])) || (Object.hasOwn(v,"stamp") && (typeof v.stamp!=="string" || v.stamp.length>100)) ||
      !requestId(v.requestId) || !amount(v.slot,11) || !amount(v.amount,99) || v.amount===0 || !amount(v.price,1_000_000_000) || v.price===0) return null;
  return {requestId:v.requestId,slot:v.slot,amount:v.amount,price:v.price,...(typeof v.stamp==="string"?{stamp:v.stamp}:{})};
}
export function parseMarketAction(v:unknown): {requestId:string;listingId:string}|null {
  if (!keys(v,["requestId","listingId"]) || !requestId(v.requestId) || !uuid(v.listingId)) return null;
  return {requestId:v.requestId,listingId:v.listingId};
}
export function parseTradeRequest(v:unknown): {targetId:string}|null {
  if (!keys(v,["targetId"]) || typeof v.targetId!=="string" || !/^[A-Za-z0-9_-]{6,64}$/.test(v.targetId)) return null;
  return {targetId:v.targetId};
}
export function parseTradeId(v:unknown): {tradeId:string}|null {
  if (!keys(v,["tradeId"]) || !uuid(v.tradeId)) return null;
  return {tradeId:v.tradeId};
}
export function parseTradeOffer(v:unknown): ({tradeId:string}&TradeOffer)|null {
  if (!keys(v,["tradeId","slot","amount","gold"]) || !uuid(v.tradeId) || !(v.slot===null || amount(v.slot,11)) || !amount(v.amount,99) || !amount(v.gold,1_000_000_000)) return null;
  if ((v.slot===null)!==(v.amount===0)) return null;
  return {tradeId:v.tradeId,slot:v.slot as number | null,amount:v.amount,gold:v.gold};
}

export function parseForge(v: unknown) {
  const fields=["requestId","slot","stamp","action"];
  if(v && typeof v==="object" && Object.hasOwn(v,"donor"))fields.push("donor");
  if(v && typeof v==="object" && Object.hasOwn(v,"acceptBreak"))fields.push("acceptBreak");
  if (!keys(v,fields) && !keys(v,[...fields,"copies"]))return null;
  if(!requestId(v.requestId) || !(amount(v.slot,11)||isBodySlot(v.slot)) ||
      typeof v.stamp!=="string" || !/^[a-zA-Z0-9_.-]{1,64}$/.test(v.stamp) ||
      (v.action!=="enhance" && v.action!=="reroll") ||
      (v.action==="enhance" ? !amount(v.copies,4) : Object.hasOwn(v,"copies")))return null;
  if(Object.hasOwn(v,"acceptBreak") && (v.action!=="enhance" || v.acceptBreak!==true))return null;
  let donor:{slot:number;stamp:string}|undefined;
  if(Object.hasOwn(v,"donor")){
    const d=v.donor;
    if(v.action!=="enhance" || !keys(d,["slot","stamp"]) || !amount(d.slot,11) || typeof d.stamp!=="string" || !/^[a-zA-Z0-9_.-]{1,64}$/.test(d.stamp))return null;
    donor={slot:d.slot,stamp:d.stamp};
  }
  return {requestId:v.requestId, slot:v.slot, stamp:v.stamp, action:v.action as "enhance" | "reroll",donor,copies:v.copies as number|undefined,acceptBreak:v.acceptBreak===true};
}

export function parseSellMaterial(v:unknown){
  if(!keys(v,["requestId","slot","expected","quantity"]) || !requestId(v.requestId) || !amount(v.slot,11) ||
      typeof v.expected!=="string" || !personalItem(v.expected)?.sellGold || !amount(v.quantity,99) || v.quantity<1)return null;
  return {requestId:v.requestId,slot:v.slot,expected:v.expected,quantity:v.quantity};
}
export type SalvageOrder={requestId:string;slot:number;gear:PersonalId;stamp:string;bound:boolean;socket:"sealed"|"empty"|CardId};
export function parseSalvage(v:unknown):SalvageOrder|null{
  if(!keys(v,["requestId","slot","gear","stamp","bound","socket"]) || !requestId(v.requestId) || !amount(v.slot,11) || typeof v.bound!=="boolean" ||
     !personalItem(v.gear)?.salvage || typeof v.stamp!=="string" || !/^[a-zA-Z0-9_.-]{1,64}$/.test(v.stamp) ||
     (v.socket!=="sealed" && v.socket!=="empty" && !isCardId(v.socket)))return null;
  return {requestId:v.requestId,slot:v.slot,gear:v.gear as PersonalId,stamp:v.stamp,bound:v.bound,socket:v.socket};
}
export function parseCraft(v: unknown): {requestId:string; recipeId:PersonalId|typeof SHRINE_RECIPE.id} | null {
  if (!keys(v,["recipeId","requestId"]) || !requestId(v.requestId) ||
      (v.recipeId!==SHRINE_RECIPE.id && !personalItem(v.recipeId)?.recipe))return null;
  return {requestId:v.requestId, recipeId:v.recipeId as PersonalId|typeof SHRINE_RECIPE.id};
}
