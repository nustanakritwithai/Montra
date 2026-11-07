import type {TradeOffer} from "./EconomyStore.js";

type OfferedItem={itemId:string;quantity:number}|null;
type MutableSession={id:string;a:string;b:string;expires:number;offers:Record<string,TradeOffer>;items:Record<string,OfferedItem>;fingerprints:Record<string,string>;confirmed:Set<string>};
/** Live read model, deliberately not a copied snapshot. Payloads remain room-owned. */
export type TradeSession=Readonly<Omit<MutableSession,"offers"|"items"|"fingerprints"|"confirmed">>&{
 readonly offers:Readonly<Record<string,TradeOffer>>;
 readonly items:Readonly<Record<string,OfferedItem>>;
 readonly fingerprints:Readonly<Record<string,string>>;
 readonly confirmed:ReadonlySet<string>;
};

/** Transient session ownership only. No inventory, durable transaction or transport. */
export class TradeSessions {
 private readonly sessions=new Map<string,MutableSession>();
 issue(id:string,a:string,b:string,expires:number):TradeSession {
  const trade:MutableSession={id,a,b,expires,offers:{},items:{},fingerprints:{},confirmed:new Set()};
  this.sessions.set(trade.id,trade);return trade;
 }
 expire(now:()=>number):void {
  for(const [key,trade] of this.sessions)if(now()>=trade.expires)this.sessions.delete(key);
 }
 hasParticipant(a:string,b:string):boolean {
  return [...this.sessions.values()].some(t=>[t.a,t.b].includes(a)||[t.a,t.b].includes(b));
 }
 lookup(member:string,id:string,now:()=>number,reject:(reason:string)=>void):TradeSession|null {
  const trade=this.sessions.get(id);
  if(!trade || (trade.a!==member && trade.b!==member)){reject("trade_unavailable");return null;}
  if(now()>=trade.expires){this.sessions.delete(id);reject("trade_expired");return null;}
  return trade;
 }
 setFingerprint(trade:TradeSession,member:string,fingerprint:string):void {
  (trade as MutableSession).fingerprints[member]=fingerprint;
 }
 setOffer(trade:TradeSession,member:string,item:OfferedItem,offer:TradeOffer):void {
  const mutable=trade as MutableSession;
  mutable.items[member]=item;mutable.offers[member]=offer;mutable.confirmed.clear();
 }
 resetReadiness(trade:TradeSession):void {(trade as MutableSession).confirmed.clear();}
 confirm(trade:TradeSession,member:string):void {(trade as MutableSession).confirmed.add(member);}
 remove(id:string):void {this.sessions.delete(id);}
 leave(member:string,notify:(trade:TradeSession)=>void):void {
  for(const trade of this.sessions.values())if(trade.a===member || trade.b===member){this.sessions.delete(trade.id);notify(trade);}
 }
 clear():void {this.sessions.clear();}
}
