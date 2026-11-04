import { readFile } from "node:fs/promises";

export type DynamicBalance = {
  version:1; generatedAt:number;
  resourceSeconds:{woodWoodland:number;woodOther:number;herbWoodland:number;herbOther:number;stoneMineral:number;stoneOther:number};
  dropPercent:{normal:number;strong:number;elite:number;boss:number;bossGear:number};
  cardPercent:Record<string,number>;
};
const resourceKeys=["woodWoodland","woodOther","herbWoodland","herbOther","stoneMineral","stoneOther"] as const;
const dropKeys=["normal","strong","elite","boss","bossGear"] as const;
let latest:DynamicBalance|undefined;
let requiredCards:string[]|undefined;
export function registerDynamicCards(ids:readonly string[]):void {requiredCards=[...ids].sort();}

function record(value:unknown):value is Record<string,unknown> {return !!value && typeof value==="object" && !Array.isArray(value);}
function exactKeys(value:Record<string,unknown>,keys:readonly string[]):boolean {return Object.keys(value).length===keys.length && keys.every(k=>Object.hasOwn(value,k));}
export function validateBalance(value:unknown,now=Date.now()):DynamicBalance|null {
  if(!record(value) || !exactKeys(value,["version","generatedAt","resourceSeconds","dropPercent","cardPercent"]) || value.version!==1 || !Number.isSafeInteger(value.generatedAt) || (value.generatedAt as number)>now+60_000 || (value.generatedAt as number)<=0 || !record(value.resourceSeconds) || !record(value.dropPercent) || !record(value.cardPercent))return null;
  const resources=value.resourceSeconds,drops=value.dropPercent;
  if(!exactKeys(resources,resourceKeys) || !exactKeys(drops,dropKeys))return null;
  if(resourceKeys.some(k=>!Number.isSafeInteger(resources[k]) || (resources[k] as number)<1 || (resources[k] as number)>86400))return null;
  if(dropKeys.some(k=>!Number.isInteger(drops[k]) || (drops[k] as number)<0 || (drops[k] as number)>100))return null;
  const cardValues=value.cardPercent,cards=Object.entries(cardValues);
  if(cards.length===0 || cards.length>100 || cards.some(([k,n])=>!/^card_[a-z0-9_]{1,70}$/.test(k) || !Number.isInteger(n) || (n as number)<0 || (n as number)>100))return null;
  if(requiredCards && (cards.length!==requiredCards.length || !requiredCards.every(id=>Object.hasOwn(cardValues,id))))return null;
  return value as DynamicBalance;
}
export function acceptBalance(value:unknown,now=Date.now()):boolean {
  const next=validateBalance(value,now);
  if(!next || (latest && next.generatedAt<=latest.generatedAt))return false;
  latest=next;return true;
}
export function dynamicResourcePeriodMs(mapId:string,kind:string,fallbackMs:number):number {
  if(!latest)return fallbackMs;
  const woodland=["forbidden_forest","bamboo_frontier","drowned_marsh","lotus_basin"].includes(mapId);
  const mineral=["naga_cavern","asura_peak","spirit_rift"].includes(mapId);
  const key=kind==="wood"?(woodland?"woodWoodland":"woodOther"):kind==="herb"?(woodland?"herbWoodland":"herbOther"):kind==="stone"?(mineral?"stoneMineral":"stoneOther"):null;
  return key ? latest.resourceSeconds[key]*1000 : fallbackMs;
}
export function dynamicDropChance(kind:string,fallback:number):number {
  if(!latest)return fallback;
  return Object.hasOwn(latest.dropPercent,kind)?latest.dropPercent[kind as keyof DynamicBalance["dropPercent"]]:fallback;
}
export function dynamicCardChance(id:string,fallback:number):number {
  return latest && Object.hasOwn(latest.cardPercent,id) ? latest.cardPercent[id] : fallback;
}
export function dynamicBalanceRevision():number {return latest?.generatedAt ?? 0;}

// Read policy asynchronously and retain the latest valid version on errors.
const policyPath=process.env.MONTRA_DYNAMIC_BALANCE_FILE;
if(policyPath) {
  let loading=false;
  const refresh=async()=>{if(loading)return;loading=true;try{const value:unknown=JSON.parse(await readFile(policyPath,"utf8"));if(acceptBalance(value))console.info("MONTRA dynamic balance policy loaded",latest!.generatedAt);}catch{/* missing, invalid or inaccessible: retain previous rules */}finally{loading=false;}};
  void refresh(); const timer=setInterval(()=>void refresh(),3000);timer.unref();
}
