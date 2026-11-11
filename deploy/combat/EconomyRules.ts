import { MAX_FORGE_COPIES, personalItem, isBodySlot, isCardId, type CardId, type FurnitureId, type HomePartId, type PersonalId } from "./PersonalItems.js";
import { SHRINE_RECIPE, isSocketGear } from "./ItemRules.js";
import { isMarketItemId, MAX_CRAFT_QUANTITY, type TradeOffer, type MarketCategory, type StarterSupplyId } from "./EconomyStore.js";
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
const MARKET_STATS = ["atk", "def", "magicAtk", "magicDef", "hp", "stamina", "mana"] as const;
export type MarketFilters = {
  minStat?: {stat: typeof MARKET_STATS[number]; value: number};
  favoritesOnly?: boolean;
};

export function parseMarketBrowse(v: unknown) {
  const fields = ["market", "query", "category", "before", "ownOnly", "tag"];
  if (v && typeof v === "object" && Object.hasOwn(v, "minStat")) fields.push("minStat");
  if (v && typeof v === "object" && Object.hasOwn(v, "favoritesOnly")) fields.push("favoritesOnly");
  if (!keys(v, fields) || (v.market !== "fixed" && v.market !== "auction") || typeof v.query !== "string" || v.query.length > 60 ||
      typeof v.category !== "string" || !["all", "material", "equipment", "card", "consumable"].includes(v.category) ||
      !(v.before === null || (amount(v.before, Number.MAX_SAFE_INTEGER) && v.before > 0)) ||
      typeof v.ownOnly !== "boolean" || !amount(v.tag, Number.MAX_SAFE_INTEGER)) return null;

  const filters: MarketFilters = {};
  if (Object.hasOwn(v, "minStat")) {
    if (!keys(v.minStat, ["stat", "value"]) || !amount(v.minStat.value, 1_000_000) || v.minStat.value < 1) return null;
    const requestedStat = v.minStat.stat;
    const stat = MARKET_STATS.find(key => key === requestedStat);
    if (!stat) return null;
    filters.minStat = {stat, value: v.minStat.value};
  }
  if (Object.hasOwn(v, "favoritesOnly")) {
    if (typeof v.favoritesOnly !== "boolean") return null;
    filters.favoritesOnly = v.favoritesOnly;
  }
  return {market: v.market, query: v.query.normalize("NFC").trim(), category: v.category as MarketCategory,
    before: typeof v.before === "number" ? v.before : null, ownOnly: v.ownOnly, tag: v.tag, filters};
}

export function parseMarketHistory(v: unknown) {
  return keys(v, ["itemId", "tag"]) && isMarketItemId(v.itemId) && amount(v.tag, Number.MAX_SAFE_INTEGER)
    ? {itemId: v.itemId, tag: v.tag} : null;
}

export function parseMarketFavorite(v: unknown) {
  return keys(v, ["itemId", "favorite", "requestId"]) && isMarketItemId(v.itemId) &&
    typeof v.favorite === "boolean" && requestId(v.requestId)
    ? {itemId: v.itemId, favorite: v.favorite, requestId: v.requestId} : null;
}

export function parseAuctionCreate(v:unknown):{requestId:string;slot:number;amount:number;opening:number;durationHours:number;stamp?:string}|null {
  const fields=["requestId","slot","amount","opening","durationHours"];
  if((!keys(v,fields) && !keys(v,[...fields,"stamp"])) || (Object.hasOwn(v,"stamp") && (typeof v.stamp!=="string" || v.stamp.length>100)) ||
    !requestId(v.requestId) || !amount(v.slot,11) || !amount(v.amount,99) || v.amount===0 || !amount(v.opening,1_000_000_000) || v.opening===0 || ![1,6,24].includes(Number(v.durationHours)) || typeof v.durationHours!=="number")return null;
  return {requestId:v.requestId,slot:v.slot,amount:v.amount,opening:v.opening,durationHours:v.durationHours,...(typeof v.stamp==="string"?{stamp:v.stamp}:{})};
}
export function parseAuctionBid(v:unknown):{requestId:string;auctionId:string;amount:number}|null {
  if(!keys(v,["requestId","auctionId","amount"]) || !requestId(v.requestId) || !uuid(v.auctionId) || !amount(v.amount,1_000_000_000) || v.amount===0)return null;
  return {requestId:v.requestId,auctionId:v.auctionId,amount:v.amount};
}
export function parseAuctionAction(v:unknown):{requestId:string;auctionId:string}|null {
  if(!keys(v,["requestId","auctionId"]) || !requestId(v.requestId) || !uuid(v.auctionId))return null;
  return {requestId:v.requestId,auctionId:v.auctionId};
}
export function parseAuctionCredit(v:unknown):{requestId:string}|null {
  if(!keys(v,["requestId"]) || !requestId(v.requestId))return null;return {requestId:v.requestId};
}
export function parseStarterSupply(v:unknown):{requestId:string;item:StarterSupplyId;quantity:number}|null {
  if(!keys(v,["requestId","item","quantity"]) || !requestId(v.requestId) || typeof v.item!=="string" ||
    !["health_potion","mat_raw_wood_1","mat_raw_stone_1","mat_herb_1"].includes(v.item) || !amount(v.quantity,20) || v.quantity===0)return null;
  return {requestId:v.requestId,item:v.item as StarterSupplyId,quantity:v.quantity};
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

export function parseClaimForgeCopy(v:unknown) {
  if(!keys(v,["requestId","gear","expectedStock"]) || !requestId(v.requestId) ||
     !isSocketGear(v.gear) || !amount(v.expectedStock,MAX_FORGE_COPIES) || v.expectedStock<1)return null;
  return {requestId:v.requestId,gear:v.gear,expectedStock:v.expectedStock};
}

export function parseForge(v: unknown) {
  const fields=["requestId","slot","stamp","action"];
  if(v && typeof v==="object" && Object.hasOwn(v,"donor"))fields.push("donor");
  if(v && typeof v==="object" && Object.hasOwn(v,"acceptBreak"))fields.push("acceptBreak");
  if(v && typeof v==="object" && Object.hasOwn(v,"acceptDowngrade"))fields.push("acceptDowngrade");
  if (!keys(v,fields) && !keys(v,[...fields,"copies"]))return null;
  if(!requestId(v.requestId) || !(amount(v.slot,11)||isBodySlot(v.slot)) ||
      typeof v.stamp!=="string" || !/^[a-zA-Z0-9_.-]{1,64}$/.test(v.stamp) ||
      (v.action!=="enhance" && v.action!=="reroll") ||
      (v.action==="enhance" ? !amount(v.copies,4) : Object.hasOwn(v,"copies")))return null;
  if(Object.hasOwn(v,"acceptBreak") && (v.action!=="enhance" || v.acceptBreak!==true))return null;
  if(Object.hasOwn(v,"acceptDowngrade") && (v.action!=="enhance" || v.acceptDowngrade!==true))return null;
  let donor:{slot:number;stamp:string}|undefined;
  if(Object.hasOwn(v,"donor")){
    const d=v.donor;
    if(v.action!=="enhance" || !keys(d,["slot","stamp"]) || !amount(d.slot,11) || typeof d.stamp!=="string" || !/^[a-zA-Z0-9_.-]{1,64}$/.test(d.stamp))return null;
    donor={slot:d.slot,stamp:d.stamp};
  }
  return {requestId:v.requestId, slot:v.slot, stamp:v.stamp, action:v.action as "enhance" | "reroll",donor,copies:v.copies as number|undefined,acceptBreak:v.acceptBreak===true,acceptDowngrade:v.acceptDowngrade===true};
}

export type HomeLayer = "floor" | "structure";
const isHomeLayer = (value: unknown): value is HomeLayer => value === "floor" || value === "structure";
const isHomeRotation = (value: unknown): value is 0 | 1 => value === 0 || value === 1;

export type HomeAction = {requestId: string} & (
  {action: "buy" | "upgrade"} |
  {action: "place"; itemId: FurnitureId; cell: number} |
  {action: "move"; from: number; cell: number} |
  {action: "remove"; cell: number} |
  {action: "place_part"; itemId: HomePartId; cell: number; rotation: 0 | 1} |
  {action: "move_part"; layer: HomeLayer; from: number; cell: number; rotation: 0 | 1} |
  {action: "remove_part"; layer: HomeLayer; cell: number} |
  {action: "plant" | "water" | "harvest"; plot: number}
);

export function parseHomeAction(v: unknown): HomeAction | null {
  const common = ["requestId", "action"];
  if (!v || typeof v !== "object") return null;
  const action = (v as Record<string, unknown>).action;
  if ((action === "buy" || action === "upgrade") && keys(v, common) && requestId(v.requestId)) {
    return {action, requestId: v.requestId};
  }
  if (action === "place" && keys(v, [...common, "itemId", "cell"]) && requestId(v.requestId) &&
      personalItem(v.itemId)?.furniture && !personalItem(v.itemId)?.homeLayer && amount(v.cell, 63)) {
    return {action, requestId: v.requestId, itemId: v.itemId as FurnitureId, cell: v.cell};
  }
  if (action === "move" && keys(v, [...common, "from", "cell"]) && requestId(v.requestId) &&
      amount(v.cell, 63) && amount(v.from, 63)) return {action, requestId: v.requestId, from: v.from, cell: v.cell};
  if (action === "remove" && keys(v, [...common, "cell"]) && requestId(v.requestId) && amount(v.cell, 63)) {
    return {action, requestId: v.requestId, cell: v.cell};
  }
  if (action === "place_part" && keys(v, [...common,"itemId","cell","rotation"]) &&
      requestId(v.requestId) && personalItem(v.itemId)?.homeLayer && amount(v.cell,63) && isHomeRotation(v.rotation)) {
    return {action,requestId:v.requestId,itemId:v.itemId as HomePartId,cell:v.cell,rotation:v.rotation};
  }
  if (action === "move_part" && keys(v, [...common,"layer","from","cell","rotation"]) &&
      requestId(v.requestId) && isHomeLayer(v.layer) && amount(v.from,63) && amount(v.cell,63) && isHomeRotation(v.rotation)) {
    return {action,requestId:v.requestId,layer:v.layer,from:v.from,cell:v.cell,rotation:v.rotation};
  }
  if (action === "remove_part" && keys(v, [...common,"layer","cell"]) &&
      requestId(v.requestId) && isHomeLayer(v.layer) && amount(v.cell,63)) {
    return {action,requestId:v.requestId,layer:v.layer,cell:v.cell};
  }
  if ((action === "plant" || action === "water" || action === "harvest") && keys(v, [...common, "plot"]) &&
      requestId(v.requestId) && amount(v.plot, 3)) return {action, requestId: v.requestId, plot: v.plot};
  return null;
}

export function parseEconomyRequest(v: unknown) {
  return keys(v, ["requestId"]) && requestId(v.requestId) ? v.requestId : null;
}

export function parseCraftClaim(v: unknown) {
  return keys(v, ["requestId", "jobId"]) && requestId(v.requestId) && uuid(v.jobId)
    ? {requestId: v.requestId, jobId: v.jobId} : null;
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
export function parseCraft(v: unknown) {
  const fields = ["recipeId", "requestId"];
  if ((!keys(v, fields) && !keys(v, [...fields, "quantity"])) || !requestId(v.requestId) ||
      (v.recipeId !== SHRINE_RECIPE.id && !personalItem(v.recipeId)?.recipe)) return null;
  const quantity = Object.hasOwn(v, "quantity") ? v.quantity : 1;
  if (!amount(quantity, MAX_CRAFT_QUANTITY) || quantity < 1) return null;
  return { requestId: v.requestId, recipeId: v.recipeId as PersonalId | typeof SHRINE_RECIPE.id, quantity };
}
