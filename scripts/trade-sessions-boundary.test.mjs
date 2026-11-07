import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
const baseline=JSON.parse(read('deploy/combat/trade-sessions-baseline.json'));
const sections=s=>({methods:s.slice(s.indexOf('  private tradeFor('),s.indexOf('\n  private async enterTerritory')),handlers:s.slice(s.indexOf('    trade_request:'),s.indexOf('    chat:',s.indexOf('    trade_request:')))});
const restore=s=>{
 s=s.replaceAll("this.trades.leave(id,trade=>this.notifyTrade(trade,\"trade_cancelled\"));","for (const trade of this.trades.values()) if (trade.a===id || trade.b===id) { this.trades.remove(trade.id); this.notifyTrade(trade,\"trade_cancelled\"); }");
 s=s.replaceAll("this.trades.remove(trade.id);","this.trades.delete(trade.id);");
 s=s.replaceAll("this.trades.confirm(trade,client.sessionId);","trade.confirmed.add(client.sessionId);");
 s=s.replaceAll("this.trades.resetReadiness(trade);","trade.confirmed.clear();");
 s=s.replaceAll("this.trades.setOffer(trade,client.sessionId,stack ? {...stack,quantity:offer.amount} : null,offer);","trade.items[client.sessionId]=stack ? {...stack,quantity:offer.amount} : null;\n        trade.offers[client.sessionId]=offer; trade.confirmed.clear();");
 s=s.replaceAll("this.trades.setFingerprint(trade,client.sessionId,this.tradeSnapshot(client.sessionId,offer));","trade.fingerprints[client.sessionId]=this.tradeSnapshot(client.sessionId,offer);");
 s=s.replaceAll("const trade=this.trades.issue(randomUUID(),id,order.targetId,this.simulatedMs+60_000);","const trade:TradeSession={id:randomUUID(),a:id,b:order.targetId,expires:this.simulatedMs+60_000,offers:{},items:{},fingerprints:{},confirmed:new Set()};\n        this.trades.set(trade.id,trade);");
 s=s.replaceAll("this.trades.hasParticipant(id,order.targetId)","[...this.trades.values()].some(t=>[t.a,t.b].includes(id)||[t.a,t.b].includes(order.targetId))");
 s=s.replaceAll("this.trades.expire(()=>this.simulatedMs);","for (const [key,trade] of this.trades) if (this.simulatedMs>=trade.expires) this.trades.delete(key);");
 s=s.replaceAll("    return this.trades.lookup(client.sessionId,tradeId,()=>this.simulatedMs,reason=>this.reject(client,reason));","    const trade=this.trades.get(tradeId);\n    if (!trade || (trade.a!==client.sessionId && trade.b!==client.sessionId)) { this.reject(client,\"trade_unavailable\"); return null; }\n    if (this.simulatedMs >= trade.expires) { this.trades.delete(tradeId); this.reject(client,\"trade_expired\"); return null; }\n    return trade;");
 return s;
};
test('frozen trade methods and handlers fingerprints',()=>{
 const actual=sections(restore(read('deploy/combat/MyRoom.ts')));
 for(const key of Object.keys(baseline))assert.equal(hash(actual[key]),baseline[key],key);
});
test('oracle stays frozen and wire/save-order negative controls fail fingerprints',()=>{
 const oracle=read('deploy/combat/trade-sessions-oracle.ts');
 const methods=oracle.slice(oracle.indexOf('  private tradeFor('),oracle.indexOf('\n messages={'));
 const handlers=oracle.slice(oracle.indexOf('    trade_request:'),oracle.indexOf(' };\n}'));
 assert.equal(hash(methods),baseline.methods);assert.equal(hash(handlers),baseline.handlers);
 assert.notEqual(hash(handlers.replace('"trade_complete"','"trade_update"')),baseline.handlers);
 assert.notEqual(hash(handlers.replace('this.trades.delete(trade.id); this.syncEconomy(aClient,aId);','this.syncEconomy(aClient,aId); this.trades.delete(trade.id);')),baseline.handlers);
 const owner=read('deploy/combat/TradeSessions.ts');
 assert.doesNotMatch(owner,/from\s+["'](?:colyseus|\.\/MyRoom|\.\/CharacterStore)/);
 assert.match(owner,/private readonly sessions=new Map/);
 assert.doesNotMatch(read('deploy/combat/MyRoom.ts'),/trade\.confirmed\.(?:add|clear)|trade\.offers\[[^\]]+\]\s*=|private trades = new Map/);
});
