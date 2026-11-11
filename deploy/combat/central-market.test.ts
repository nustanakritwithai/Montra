import test from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {DatabaseSync} from "node:sqlite";
import {EconomyStore,MARKET_FAVORITE_LIMIT,STARTER_SUPPLIES} from "./EconomyStore.js";
import {makeClassInventory} from "./ItemRules.js";
import {PERSONAL_ITEMS,personalItem} from "./PersonalItems.js";
import {parseAuctionBid,parseMarketBrowse,parseMarketFavorite,parseMarketHistory,parseStarterSupply} from "./EconomyRules.js";

const a="a".repeat(64),b="b".repeat(64),c="c".repeat(64),req=(n:number)=>"market_test_"+String(n).padStart(16,"0");

test("auction escrows bids, refunds outbid players, settles once and delivers on claim",()=>{
  const store=new EconomyStore(":memory:"),now=1_900_000_000_000;
  try{
    for(const id of [a,b,c])store.register(id,makeClassInventory("seer"));
    const created=store.createAuction(a,req(1),0,1,100,1,undefined,now);
    assert.deepEqual(store.createAuction(a,req(1),0,1,100,1,undefined,now+1),created);
    assert.equal(store.getAccount(a).inventory.slots[0]?.quantity,2);
    assert.throws(()=>store.bidAuction(a,req(2),created.auctionId,100,now),/cannot_bid_own_auction/);
    store.bidAuction(b,req(3),created.auctionId,100,now);
    assert.equal(store.getAccount(b).gold,900);
    assert.throws(()=>store.bidAuction(c,req(4),created.auctionId,100,now),/auction_bid_too_low/);
    store.bidAuction(c,req(5),created.auctionId,150,now);
    assert.equal(store.getAccount(b).gold,1000);assert.equal(store.getAccount(c).gold,850);
    store.bidAuction(c,req(6),created.auctionId,200,now);
    store.bidAuction(c,req(6),created.auctionId,200,now);
    assert.equal(store.getAccount(c).gold,800);
    assert.throws(()=>store.cancelAuction(a,req(7),created.auctionId,now),/auction_cancel_unavailable/);
    assert.equal(store.hasOpenListings(a),true);assert.equal(store.hasOpenListings(c),true);
    assert.throws(()=>store.bidAuction(b,req(8),created.auctionId,250,created.endsAt),/auction_unavailable/);
    assert.equal(store.settleExpiredAuctions(created.endsAt),1);assert.equal(store.settleExpiredAuctions(created.endsAt),0);
    assert.equal(store.getAccount(a).gold,1200);assert.equal(store.myAuctions(c).auctions[0]?.canClaim,true);
    assert.throws(()=>store.claimAuctionItem(b,req(9),created.auctionId),/auction_claim_unavailable/);
    const claimed=store.claimAuctionItem(c,req(10),created.auctionId);
    assert.deepEqual(store.claimAuctionItem(c,req(10),created.auctionId),claimed);
    assert.equal(store.getAccount(c).inventory.slots[0]?.quantity,4);
    assert.equal(store.hasOpenListings(c),false);
  }finally{store.close();}
});

test("unclaimed items and bids survive store restart",()=>{
  const dir=mkdtempSync(join(tmpdir(),"montra-market-test-")),file=join(dir,"economy.sqlite"),now=1_900_000_000_000;
  let store=new EconomyStore(file);
  try{
    store.register(a,makeClassInventory("seer"));store.register(b,makeClassInventory("seer"));
    const auction=store.createAuction(a,req(20),0,1,200,1,undefined,now);store.bidAuction(b,req(21),auction.auctionId,200,now);store.close();
    store=new EconomyStore(file);assert.equal(store.getAccount(b).gold,800);
    assert.equal(store.settleExpiredAuctions(auction.endsAt),1);assert.equal(store.getAccount(a).gold,1200);
    store.close();store=new EconomyStore(file);assert.equal(store.myAuctions(b).auctions[0]?.canClaim,true);
    store.claimAuctionItem(b,req(22),auction.auctionId);assert.equal(store.getAccount(b).inventory.slots[0]?.quantity,4);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test("full inventory keeps an expired unsold auction in escrow until claimed",()=>{
  const store=new EconomyStore(":memory:"),bag=makeClassInventory("seer"),now=1_900_000_000_000;
  bag.slots=bag.slots.map(()=>({itemId:"health_potion",quantity:99}));bag.equippedWeaponSlot=null;
  try{
    store.register(a,bag);const auction=store.createAuction(a,req(30),0,1,10,1,undefined,now);
    store.buyStarterSupply(a,req(31),"health_potion",1,now);
    store.settleExpiredAuctions(auction.endsAt);
    assert.throws(()=>store.claimAuctionItem(a,req(32),auction.auctionId),/inventory_full/);
    assert.equal(store.myAuctions(a).auctions[0]?.canClaim,true);
    store.listItem(a,req(33),0,1,10);store.claimAuctionItem(a,req(32),auction.auctionId);
    assert.equal(store.getAccount(a).inventory.slots[0]?.quantity,99);
  }finally{store.close();}
});

test("overflowing refunds remain claimable without minting or losing gold",()=>{
  const dir=mkdtempSync(join(tmpdir(),"montra-market-credit-")),file=join(dir,"economy.sqlite"),now=1_900_000_000_000;
  const store=new EconomyStore(file),db=new DatabaseSync(file);
  try{
    for(const id of [a,b,c])store.register(id,makeClassInventory("seer"));
    const auction=store.createAuction(a,req(40),0,1,100,1,undefined,now);store.bidAuction(b,req(41),auction.auctionId,100,now);
    db.prepare("UPDATE accounts SET gold=? WHERE id=?").run(1_000_000_000,b);
    store.bidAuction(c,req(42),auction.auctionId,150,now);
    assert.equal(store.getAccount(b).gold,1_000_000_000);assert.equal(store.auctionCredit(b),100);
    assert.throws(()=>store.claimAuctionCredit(b,req(43)),/auction_credit_unavailable/);
    store.buyStarterSupply(b,req(44),"health_potion",1,now);const claim=store.claimAuctionCredit(b,req(43));
    assert.deepEqual(claim,{amount:15,remaining:85});assert.equal(store.getAccount(b).gold,1_000_000_000);assert.equal(store.auctionCredit(b),85);
    assert.equal(store.hasOpenListings(b),true);
  }finally{db.close();store.close();rmSync(dir,{recursive:true,force:true});}
});

test("starter reserve is bounded, transactional, resettable, and idempotent",()=>{
  const store=new EconomyStore(":memory:"),now=1_900_000_000_000;
  try{
    store.register(a,makeClassInventory("seer"));
    const purchase=store.buyStarterSupply(a,req(50),"mat_raw_wood_1",20,now);
    assert.deepEqual(store.buyStarterSupply(a,req(50),"mat_raw_wood_1",20,now),purchase);
    assert.equal(store.getAccount(a).gold,800);
    assert.throws(()=>store.buyStarterSupply(a,req(51),"mat_raw_wood_1",1,now),/starter_supply_limit/);
    assert.equal(store.starterSupplyStatus(a,now).items.find(x=>x.item==="mat_raw_wood_1")?.remaining,0);
    assert.equal(store.starterSupplyStatus(a,now+86400000).items.find(x=>x.item==="mat_raw_wood_1")?.personalRemaining,20);
    assert.throws(()=>store.buyStarterSupply(a,req(52),"mat_raw_wood_1",21,now),/invalid_amount/);
    for(const [item,config] of Object.entries(STARTER_SUPPLIES))assert.ok((personalItem(item)?.sellGold??0)<config.price,"reserve price must exceed direct NPC resale");
  }finally{store.close();}
});

test("starter stock is shared between characters and a failed buy does not spend gold",()=>{
  const dir=mkdtempSync(join(tmpdir(),"montra-market-reserve-")),file=join(dir,"economy.sqlite"),now=1_900_000_000_000;
  const store=new EconomyStore(file),db=new DatabaseSync(file),day=new Date(now).toISOString().slice(0,10);
  try{
    store.register(a,makeClassInventory("seer"));store.register(b,makeClassInventory("seer"));
    db.prepare("INSERT INTO starter_supply_world(day,item,quantity) VALUES(?,?,?)").run(day,"mat_raw_stone_1",499);
    store.buyStarterSupply(a,req(60),"mat_raw_stone_1",1,now);
    assert.equal(store.starterSupplyStatus(b,now).items.find(x=>x.item==="mat_raw_stone_1")?.remaining,0);
    assert.throws(()=>store.buyStarterSupply(b,req(61),"mat_raw_stone_1",1,now),/starter_supply_limit/);
    assert.equal(store.getAccount(b).gold,1000);
  }finally{db.close();store.close();rmSync(dir,{recursive:true,force:true});}
});

test("an unsold auction can be cancelled once and returns the escrowed item",()=>{
  const store=new EconomyStore(":memory:"),now=1_900_000_000_000;
  try{
    store.register(a,makeClassInventory("seer"));
    const auction=store.createAuction(a,req(70),0,1,10,1,undefined,now);
    const result=store.cancelAuction(a,req(71),auction.auctionId,now);
    assert.deepEqual(store.cancelAuction(a,req(71),auction.auctionId,now),result);
    assert.equal(store.getAccount(a).inventory.slots[0]?.quantity,3);
    assert.throws(()=>store.cancelAuction(a,req(72),auction.auctionId,now),/auction_cancel_unavailable/);
    assert.equal(store.hasOpenListings(a),false);
  }finally{store.close();}
});

test("central listing search supports Thai names and cursor pagination",()=>{
  const store=new EconomyStore(":memory:");
  try{
    for(const [i,id] of [a,b,c].entries()){
      const bag=makeClassInventory("seer");bag.slots[0]={itemId:"health_potion",quantity:50};store.register(id,bag);
      for(let n=0;n<15;n++)store.listItem(id,req(100+i*20+n),0,1,n+1);
    }
    const first=store.browseMarket(a,"ยา","consumable",null),second=store.browseMarket(a,"ยา","consumable",first.nextCursor);
    assert.equal(first.listings.length,30);assert.equal(second.listings.length,15);assert.equal(second.nextCursor,null);
    assert.equal(new Set([...first.listings,...second.listings].map(x=>x.id)).size,45);
    assert.equal(store.browseMarket(a,"ยา","material",null).listings.length,0);
    assert.equal(store.browseMarket(a,"' OR 1=1 --","all",null).listings.length,0);
    assert.equal(store.browseMarket(a,"","all",null,true).listings.length,15);
    assert.equal(parseMarketBrowse({market:"fixed",query:"x".repeat(61),category:"all",before:null,ownOnly:false,tag:1}),null);
    assert.equal(parseAuctionBid({requestId:req(1),auctionId:"invalid",amount:1}),null);
    assert.equal(parseStarterSupply({requestId:req(1),item:"arcane_sword",quantity:1}),null);
  }finally{store.close();}
});

test("market history records only committed fixed and auction sales, once each across restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "montra-market-history-")), file = join(dir, "economy.sqlite");
  let store = new EconomyStore(file);
  try {
    const seller = makeClassInventory("seer");
    seller.slots[0] = {itemId: "health_potion", quantity: 10};
    store.register(a, seller);
    store.register(b, makeClassInventory("seer"));
    const itemId = "health_potion";
    const listed = store.listItem(a, req(200), 0, 2, 100);
    const cancelled = store.listItem(a, req(201), 0, 1, 5000);
    assert.throws(() => store.buy(b, req(202), cancelled.listingId), /insufficient_gold/);
    store.cancel(a, req(203), cancelled.listingId);
    const now = Date.now();
    const auction = store.createAuction(a, req(204), 0, 3, 150, 1, undefined, now);
    store.createAuction(a, req(205), 0, 1, 150, 1, undefined, now);
    store.bidAuction(b, req(206), auction.auctionId, 160, now);
    assert.deepEqual(store.marketHistory(itemId), []);
    store.buy(b, req(207), listed.listingId);
    assert.equal(store.settleExpiredAuctions(auction.endsAt), 2);
    store.close();
    store = new EconomyStore(file);
    store.buy(b, req(207), listed.listingId);
    assert.equal(store.settleExpiredAuctions(auction.endsAt), 0);
    const history = store.marketHistory(itemId);
    assert.deepEqual(history.map(({soldAt, ...sale}) => sale), [
      {market: "auction", quantity: 3, total: 160},
      {market: "fixed", quantity: 2, total: 100},
    ]);
    assert.equal(history[0].soldAt, auction.endsAt);
    assert(history[1].soldAt >= now);
    assert.deepEqual(store.marketHistory("mat_herb_1"), []);
    assert.equal(parseMarketHistory({itemId: "__proto__", tag: 1}), null);
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test("private favorites persist, stay bounded, and filter listings together with catalog stats", () => {
  const dir = mkdtempSync(join(tmpdir(), "montra-market-favorites-")), file = join(dir, "economy.sqlite");
  let store = new EconomyStore(file);
  try {
    const gear = "arm_cloth_chest_1", magicDef = personalItem(gear)?.stats.magicDef ?? 0;
    assert(magicDef > 0);
    const bag = makeClassInventory("seer");
    bag.slots[2] = {itemId: gear, quantity: 1};
    store.register(a, bag);
    store.register(b, makeClassInventory("seer"));
    const listing = store.listItem(a, req(300), 2, 1, 100);
    store.listItem(a, req(301), 0, 1, 100);
    const order = {itemId: gear, favorite: true, requestId: req(302)};
    assert.deepEqual(parseMarketFavorite(order), order);
    store.setMarketFavorite(b, order.requestId, gear, true);
    store.close();
    store = new EconomyStore(file);
    assert.deepEqual(store.marketFavorites(a), []);
    assert.deepEqual(store.marketFavorites(b), [gear]);
    const browse = {market: "fixed", query: "", category: "all", before: null, ownOnly: false, tag: 1};
    const filters = {favoritesOnly: true, minStat: {stat: "magicDef" as const, value: magicDef}};
    assert.deepEqual(parseMarketBrowse({...browse, ...filters})?.filters, filters);
    assert.equal(parseMarketBrowse({...browse,minStat:{stat:"__proto__",value:1}}), null);
    assert.equal(parseMarketBrowse({...browse,minStat:{stat:"hp",value:0}}), null);
    assert.equal(parseMarketBrowse({...browse,favoritesOnly:"true"}), null);
    assert.deepEqual(store.browseMarket(b, "", "all", null, false, filters).listings.map(x => x.id), [listing.listingId]);
    assert.deepEqual(store.browseMarket(a, "", "all", null, false, filters).listings, []);
    assert.deepEqual(store.browseMarket(b, "", "all", null, false, {minStat: {stat: "magicDef", value: magicDef + 1}}).listings, []);
    store.cancel(a, req(303), listing.listingId);
    const slot = store.getAccount(a).inventory.slots.findIndex(stack => stack?.itemId === gear);
    const auction = store.createAuction(a, req(304), slot, 1, 100, 1);
    assert.deepEqual(store.browseAuctions(b, "", "all", null, filters).auctions.map(x => x.id), [auction.auctionId]);
    assert.deepEqual(store.browseAuctions(a, "", "all", null, filters).auctions, []);
    const otherItems = Object.keys(PERSONAL_ITEMS).filter(id => id !== gear).slice(0, MARKET_FAVORITE_LIMIT);
    for (const [index, id] of otherItems.slice(0, -1).entries()) store.setMarketFavorite(b, req(310 + index), id, true);
    assert.throws(() => store.setMarketFavorite(b, req(399), otherItems.at(-1)!, true), /market_favorite_limit/);
    assert.equal(store.marketFavorites(b).length, MARKET_FAVORITE_LIMIT);
    store.setMarketFavorite(b, req(400), gear, false);
    store.setMarketFavorite(b, order.requestId, gear, true);
    assert(!store.marketFavorites(b).includes(gear), "replaying an earlier favorite does not undo removal");
    assert.equal(store.marketFavorites(b).length, MARKET_FAVORITE_LIMIT - 1);
  } finally {
    store.close();
    rmSync(dir, {recursive: true, force: true});
  }
});

test("fish gathered by players can be found and traded as material",()=>{
  const store=new EconomyStore(":memory:");
  try{
    store.register(a,makeClassInventory("seer"));store.register(b,makeClassInventory("seer"));
    store.catchFish(a,req(200),"mat_fish_common");
    const slot=store.getAccount(a).inventory.slots.findIndex(item=>item?.itemId==="mat_fish_common");assert.ok(slot>=0);
    const listing=store.listItem(a,req(201),slot,1,15);
    assert.ok(store.browseMarket(b,"ปลาช่อน","material",null).listings.some(item=>item.id===listing.listingId));
    store.buy(b,req(202),listing.listingId);
    assert.ok(store.getAccount(b).inventory.slots.some(item=>item?.itemId==="mat_fish_common"));
  }finally{store.close();}
});
