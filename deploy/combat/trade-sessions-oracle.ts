import type {Client} from "colyseus";
import {randomUUID} from "node:crypto";
import {characterStore} from "./CharacterStore.js";
import type {TradeOffer} from "./EconomyStore.js";
import {parseTradeRequest,parseTradeOffer,parseTradeId} from "./EconomyRules.js";
import {distance3d} from "./HeightRules.js";
type TradeSession = { id:string; a:string; b:string; expires:number; offers:Record<string, TradeOffer>; items:Record<string,{itemId:string;quantity:number}|null>; fingerprints:Record<string,string>; confirmed:Set<string> };
/** Frozen trade methods and handlers verbatim from 899645f; fixture ports only. */
export class LegacyTradeRoom {
  trades=new Map<string,TradeSession>(); simulatedMs=0;
  clients:Client[]=[]; state={players:new Map<string,any>()}; inventories=new Map<string,any>();
  reject(_client:Client,_reason:string):void{}
  economyAction(_client:Client,action:(id:string)=>void):void{action(_client.sessionId);}
  economyId(client:Client):string|null{return client.sessionId;}
  bladeHiddenFrom(_a:string,_b:string):boolean{return false;}
  syncEconomy(_client:Client,_id:string):void{}
  private tradeFor(client: Client, tradeId:string): TradeSession | null {
    const trade=this.trades.get(tradeId);
    if (!trade || (trade.a!==client.sessionId && trade.b!==client.sessionId)) { this.reject(client,"trade_unavailable"); return null; }
    if (this.simulatedMs >= trade.expires) { this.trades.delete(tradeId); this.reject(client,"trade_expired"); return null; }
    return trade;
  }
  private tradeSnapshot(id:string, offer:TradeOffer): string {
    const bag=this.inventories.get(id);
    if (!bag) throw new Error("invalid_trade");
    if (offer.slot===null) return "no_item";
    const stack=bag.slots[offer.slot];
    if (!stack || stack.quantity<offer.amount || bag.equippedWeaponSlot===offer.slot) throw new Error("item_unavailable");
    return JSON.stringify({stack, equipped:bag.equippedWeaponSlot});
  }
  private notifyTrade(trade:TradeSession, event:string): void {
    for (const id of [trade.a,trade.b]) {
      const client=this.clients.find(c=>c.sessionId===id); if (!client) continue;
      const other=id===trade.a?trade.b:trade.a;
      const describe=(who:string)=>trade.offers[who] ? {...trade.offers[who],item:trade.items[who]} : null;
      try { client.send(event,{tradeId:trade.id,otherId:other,otherName:this.state.players.get(other)?.characterName ?? "",own:describe(id),other:describe(other),ownConfirmed:trade.confirmed.has(id),otherConfirmed:trade.confirmed.has(other)}); } catch { /* disconnected */ }
    }
  }

 messages={
    trade_request: (client:Client, message:unknown) => {
      const order=parseTradeRequest(message); if (!order) return this.reject(client,"invalid_trade");
      this.economyAction(client,()=>{
        const id=client.sessionId, target=this.clients.find(c=>c.sessionId===order.targetId), a=this.state.players.get(id), b=this.state.players.get(order.targetId);
        for (const [key,trade] of this.trades) if (this.simulatedMs>=trade.expires) this.trades.delete(key);
        if (!target || !a || !b || id===order.targetId || !this.economyId(target) || this.bladeHiddenFrom(id,order.targetId) || this.bladeHiddenFrom(order.targetId,id) || a.mapId!==b.mapId || distance3d(a,b)>5 || [...this.trades.values()].some(t=>[t.a,t.b].includes(id)||[t.a,t.b].includes(order.targetId))) throw new Error("invalid_trade");
        const trade:TradeSession={id:randomUUID(),a:id,b:order.targetId,expires:this.simulatedMs+60_000,offers:{},items:{},fingerprints:{},confirmed:new Set()};
        this.trades.set(trade.id,trade); this.notifyTrade(trade,"trade_update");
      });
    },
    trade_offer: (client:Client, message:unknown) => {
      const order=parseTradeOffer(message); if (!order) return this.reject(client,"invalid_trade");
      this.economyAction(client,id=>{
        const trade=this.tradeFor(client,order.tradeId); if (!trade) return;
        const offer:TradeOffer={slot:order.slot,amount:order.amount,gold:order.gold};
        if (characterStore.economy.getAccount(id).gold<offer.gold) throw new Error("insufficient_gold");
        trade.fingerprints[client.sessionId]=this.tradeSnapshot(client.sessionId,offer);
        const stack=offer.slot===null ? null : this.inventories.get(client.sessionId)?.slots[offer.slot];
        trade.items[client.sessionId]=stack ? {...stack,quantity:offer.amount} : null;
        trade.offers[client.sessionId]=offer; trade.confirmed.clear(); this.notifyTrade(trade,"trade_update");
      });
    },
    trade_confirm: (client:Client, message:unknown) => {
      const order=parseTradeId(message); if (!order) return this.reject(client,"invalid_trade");
      this.economyAction(client,()=>{
        const trade=this.tradeFor(client,order.tradeId); if (!trade) return;
        const aClient=this.clients.find(c=>c.sessionId===trade.a), bClient=this.clients.find(c=>c.sessionId===trade.b);
        const a=this.state.players.get(trade.a), b=this.state.players.get(trade.b);
        if (!aClient || !bClient || !a || !b || !trade.offers[trade.a] || !trade.offers[trade.b] || a.mapId!==b.mapId || distance3d(a,b)>5) throw new Error("invalid_trade");
        const aId=this.economyId(aClient), bId=this.economyId(bClient);
        if (!aId || !bId) throw new Error("invalid_trade");
        if ([trade.a,trade.b].some(id=>this.tradeSnapshot(id,trade.offers[id])!==trade.fingerprints[id])) { trade.confirmed.clear(); throw new Error("invalid_trade"); }
        trade.confirmed.add(client.sessionId);
        if (trade.confirmed.size<2) { this.notifyTrade(trade,"trade_update"); return; }
        characterStore.economy.trade(aId,bId,trade.id,trade.offers[trade.a],trade.offers[trade.b]);
        this.trades.delete(trade.id); this.syncEconomy(aClient,aId); this.syncEconomy(bClient,bId); this.notifyTrade(trade,"trade_complete");
      });
    },
    trade_cancel: (client:Client, message:unknown) => {
      const order=parseTradeId(message); if (!order) return this.reject(client,"invalid_trade");
      this.economyAction(client,()=>{const trade=this.tradeFor(client,order.tradeId); if (trade) { this.trades.delete(trade.id); this.notifyTrade(trade,"trade_cancelled"); }});
    },
 };
}
