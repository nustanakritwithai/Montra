import type { TradeOffer } from "./EconomyStore.js";
function keys(value: unknown, expected: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value,key));
}
const requestId=(v:unknown):v is string => typeof v === "string" && /^[a-zA-Z0-9_-]{16,64}$/.test(v);
const uuid=(v:unknown):v is string => typeof v === "string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
const amount=(v:unknown, max:number):v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= max;
export function parseMarketCreate(v:unknown): {requestId:string;slot:number;amount:number;price:number}|null {
  if (!keys(v,["requestId","slot","amount","price"]) || !requestId(v.requestId) || !amount(v.slot,11) || !amount(v.amount,99) || v.amount===0 || !amount(v.price,1_000_000_000) || v.price===0) return null;
  return {requestId:v.requestId,slot:v.slot,amount:v.amount,price:v.price};
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
