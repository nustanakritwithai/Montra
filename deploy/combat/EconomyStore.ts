import { FORGE_CATALOG, forgeStamp, quoteForge, rollForge, birthForge, plainForge, rerollIngredient, type ForgeAction } from "./ForgeRules.js";
import { changeCardSocket, DRILL_COST, type SocketOrder } from "./CardSockets.js";
import {resourceNodes,resourceStock,rawResource,GATHER_DELAY,REFINE_INPUT,type ResourceNode,type ResourceStock} from "./WorldResources.js";
import {WORLD_MAPS} from "./WorldMaps.js";
import {dynamicResourcePeriodMs} from "./DynamicBalance.js";
import type {FishItem} from "./Fishing.js";
/** Single-process transactional economy. This store must own inventories before it is wired to gameplay. */
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { PERSONAL_ITEMS, personalItem, type BodySlot, type BodyItemId, type FurnitureId, type HomePartId, type ItemStats, type PersonalId } from "./PersonalItems.js";
import { SHRINE_RECIPE, bankForgeCopy, gearCounts, isSocketGear, isStackableItem, matchesGearStamp, validateInventory, type InventorySnapshot, type InventoryStack, type WeaponItemId } from "./ItemRules.js";
import type {HomeAction, SalvageOrder} from "./EconomyRules.js";
import {CityProduction} from "./CityProduction.js";
import {type CityDisband, type CityFactoryOrder, type CityMember, type CityOrder, type CityOwnership} from "./CityProductionRules.js";

export const STARTER_GOLD = 1000;
const MAX_GOLD = 1_000_000_000;
const HUNGER_POINT_MS = 240_000;
const THIRST_POINT_MS = 120_000;
const GARDEN_GROWTH_MS = 120_000;
const HOME_PRICES = [0, 100, 200] as const;

function cookingLevel(xp: number) {
  return xp >= 15 ? 3 : xp >= 5 ? 2 : 1;
}
export const STARTER_SUPPLIES = Object.freeze({
  health_potion:{price:15,dailyLimit:20,worldLimit:500},
  mat_raw_wood_1:{price:10,dailyLimit:20,worldLimit:500},
  mat_raw_stone_1:{price:10,dailyLimit:20,worldLimit:500},
  mat_herb_1:{price:10,dailyLimit:20,worldLimit:500},
});
export type StarterSupplyId=keyof typeof STARTER_SUPPLIES;
export type MarketCategory="all"|"material"|"equipment"|"card"|"consumable";
const legacyMarketItems:Record<string,{name:string;kind:string}>={
  health_potion:{name:"ยาเลือดเล็ก ยาฟื้นพลัง",kind:"consumable"},shrine_shard:{name:"เศษตราผู้พิทักษ์",kind:"material"},
  ritual_dagger:{name:"มีดหมอ",kind:"mainHand"},arcane_sword:{name:"กระบี่อาคม",kind:"mainHand"},muay_wraps:{name:"ผ้าคาดเชือก",kind:"mainHand"},
  spirit_staff:{name:"คทาวิญญาณ",kind:"mainHand"},shrine_glaive:{name:"ง้าวจันทร์ผู้พิทักษ์",kind:"mainHand"},
};
function marketItemIds(query:string,category:MarketCategory):string[]|null {
  const word=query.normalize("NFC").trim().toLocaleLowerCase();
  if(!word && category==="all")return null;
  const catalog:Record<string,{name:string;kind:string}>={...legacyMarketItems,...PERSONAL_ITEMS};
  return Object.entries(catalog).filter(([id,item])=>{
    const kind=item.kind==="material" || item.kind==="catalyst"?"material":item.kind==="card"?"card":item.kind==="consumable"?"consumable":"equipment";
    return (category==="all" || kind===category) && (!word || id.toLocaleLowerCase().includes(word) || item.name.normalize("NFC").toLocaleLowerCase().includes(word));
  }).map(([id])=>id);
}
type Account = { gold: number; inventory: InventorySnapshot };
type Listing = { id: string; seller: string; sellerGuild?: string; item: InventoryStack; price: number; state: string };
export type TradeOffer = { slot: number | null; amount: number; gold: number };

function characterId(id: string): void { if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("invalid_character_id"); }
function positiveInteger(n: number, max: number): void {
  if (!Number.isSafeInteger(n) || n < 1 || n > max) throw new Error("invalid_amount");
}
function goldAmount(n: number): void {
  if (!Number.isSafeInteger(n) || n < 0 || n > MAX_GOLD) throw new Error("invalid_gold");
}
function take(inventory: InventorySnapshot, slot: number, amount: number): { inventory: InventorySnapshot; item: InventoryStack } {
  const original = validateInventory(inventory);
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= original.slots.length) throw new Error("invalid_slot");
  positiveInteger(amount, 99);
  const item = original.slots[slot];
  if (!item || item.quantity < amount) throw new Error("item_unavailable");
  if (original.equippedWeaponSlot === slot) throw new Error("item_equipped");
  if (item.bound)throw Error("item_bound");
  const slots = original.slots.slice();
  slots[slot] = item.quantity === amount ? null : { ...item, quantity: item.quantity - amount };
  return { inventory: validateInventory({ ...original, slots }), item: { ...item, quantity: amount } };
}
function add(inventory: InventorySnapshot, item: InventoryStack): InventorySnapshot {
  const original = validateInventory(inventory), slots = original.slots.map(x => x ? { ...x } : null);
  let remaining = item.quantity;
  if (isStackableItem(item.itemId)) {
    for (const stack of slots) {
      if (stack?.itemId !== item.itemId || stack.quantity >= 99) continue;
      const amount = Math.min(remaining, 99 - stack.quantity);
      stack.quantity += amount; remaining -= amount;
      if (!remaining) break;
    }
  } else {
    const limit=personalItem(item.itemId)?.copyLimit??1;
    if((gearCounts(original).get(item.itemId)??0)>=limit)throw Error(limit===2?"accessory_limit":"duplicate_weapon");
    if(limit===2 && !item.forge)item={...item,forge:plainForge()};
  }
  if (remaining) {
    const free = slots.findIndex(slot => slot === null);
    if (free < 0) throw new Error("inventory_full");
    slots[free] = { ...item, quantity: remaining };
  }
  return validateInventory({ ...original, slots });
}

function consume(account:Account,item:string,qty:number,missingMaterial="craft_missing_material"){
  for(const [slot,stack] of account.inventory.slots.entries()){
    if(stack?.itemId!==item)continue;
    const used=Math.min(qty,stack.quantity);
    account.inventory=take(account.inventory,slot,used).inventory;
    qty-=used;
    if(!qty)return;
  }
  throw Error(missingMaterial);
}

function receiveCraft(bag:InventorySnapshot,item:InventoryStack){
  const id=item.itemId;
  if(isSocketGear(id) && (gearCounts(bag).get(id)??0)>=(personalItem(id)?.copyLimit??1)){
    const inventory=bankForgeCopy(bag,id);
    if(!inventory)throw Error("forge_stock_full");
    return {inventory,banked:true};
  }
  return {inventory:add(bag,item),banked:false};
}

function spendForgeCopies(bag:InventorySnapshot,gear:string,qty:number){
  const stock=bag.forgeCopies?.[gear]??0;
  if(stock<qty)throw Error("forge_missing_copy");
  if(!qty)return;
  if(stock===qty)delete bag.forgeCopies![gear];
  else bag.forgeCopies![gear]=stock-qty;
}

export class EconomyStore {
  private readonly db: DatabaseSync;
  private readonly city: CityProduction;
  private auctionTimer:ReturnType<typeof setInterval>|undefined;
  private cityTimer:ReturnType<typeof setInterval>|undefined;
  constructor(file:string,private readonly forgeDraw?:()=>number) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, gold INTEGER NOT NULL, inventory TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(request_id TEXT PRIMARY KEY, actor TEXT NOT NULL, kind TEXT NOT NULL, intent TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS resource_stock(map TEXT NOT NULL,node TEXT NOT NULL,stock INTEGER NOT NULL,nextAt INTEGER NOT NULL,PRIMARY KEY(map,node));
      CREATE TABLE IF NOT EXISTS resource_periods(map TEXT NOT NULL,node TEXT NOT NULL,periodMs INTEGER NOT NULL,PRIMARY KEY(map,node));
      CREATE TABLE IF NOT EXISTS resource_workers(actor TEXT PRIMARY KEY,lastAt INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS fishing_pending(actor TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,request TEXT NOT NULL UNIQUE,item TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS auctions(id TEXT PRIMARY KEY,seller TEXT NOT NULL,item TEXT NOT NULL,opening INTEGER NOT NULL,bidder TEXT,bid INTEGER NOT NULL DEFAULT 0,ends_at INTEGER NOT NULL,state TEXT NOT NULL,claimant TEXT,claimed INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS auctions_due ON auctions(state,ends_at);
      CREATE INDEX IF NOT EXISTS auctions_seller ON auctions(seller,state);
      CREATE INDEX IF NOT EXISTS auctions_bidder ON auctions(bidder,state);
      CREATE TABLE IF NOT EXISTS auction_credits(actor TEXT PRIMARY KEY,amount INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS starter_supply_used(actor TEXT NOT NULL,day TEXT NOT NULL,item TEXT NOT NULL,quantity INTEGER NOT NULL,PRIMARY KEY(actor,day,item));
      CREATE TABLE IF NOT EXISTS starter_supply_world(day TEXT NOT NULL,item TEXT NOT NULL,quantity INTEGER NOT NULL,PRIMARY KEY(day,item));
      CREATE TABLE IF NOT EXISTS cooking(
        actor TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, xp INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS needs(
        actor TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
        food REAL NOT NULL, water REAL NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS homes(
        actor TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, level INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS furniture(
        actor TEXT NOT NULL REFERENCES homes(actor) ON DELETE CASCADE,
        cell INTEGER NOT NULL, item TEXT NOT NULL, PRIMARY KEY(actor,cell));
      CREATE TABLE IF NOT EXISTS home_parts(
        actor TEXT NOT NULL REFERENCES homes(actor) ON DELETE CASCADE, cell INTEGER NOT NULL,
        layer TEXT NOT NULL, item TEXT NOT NULL, rotation INTEGER NOT NULL, PRIMARY KEY(actor,cell,layer));
      CREATE TABLE IF NOT EXISTS garden(
        actor TEXT NOT NULL REFERENCES homes(actor) ON DELETE CASCADE,
        plot INTEGER NOT NULL, ready_at INTEGER, PRIMARY KEY(actor,plot));
      CREATE TABLE IF NOT EXISTS water_supply(
        actor TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, ready_at INTEGER NOT NULL);
    `);
    this.initListings();
    this.city = new CityProduction(this.db);
  }
  private initListings(): void {
    const schema = `CREATE TABLE IF NOT EXISTS listings (
      id TEXT PRIMARY KEY, seller TEXT REFERENCES accounts(id), item TEXT NOT NULL, price INTEGER NOT NULL, state TEXT NOT NULL,
      seller_guild TEXT, seller_name TEXT, city_epoch INTEGER,
      CHECK((seller IS NOT NULL AND seller_guild IS NULL AND seller_name IS NULL AND city_epoch IS NULL)
        OR (seller IS NULL AND seller_guild IS NOT NULL AND seller_name IS NOT NULL AND city_epoch IS NOT NULL)));`;
    this.transaction(() => {
      const columns = this.db.prepare("PRAGMA table_info(listings)").all();
      if (columns.length && !columns.some(column => column.name === "seller_guild")) {
        this.db.exec("ALTER TABLE listings RENAME TO listings_legacy");
        this.db.exec(schema);
        this.db.exec(`INSERT INTO listings(rowid,id,seller,item,price,state)
          SELECT rowid,id,seller,item,price,state FROM listings_legacy;
          DROP TABLE listings_legacy;`);
      } else this.db.exec(schema);
      this.db.exec(`CREATE INDEX IF NOT EXISTS listings_state ON listings(state);
        CREATE INDEX IF NOT EXISTS listings_seller_state ON listings(seller,state);
        CREATE INDEX IF NOT EXISTS listings_guild_state ON listings(seller_guild,state) WHERE seller_guild IS NOT NULL;
        CREATE INDEX IF NOT EXISTS listings_city_open ON listings(city_epoch) WHERE state='open' AND city_epoch IS NOT NULL;`);
    });
  }
  startAuctionSweeper():void {
    if(this.auctionTimer)return;
    try{this.settleExpiredAuctions();}catch(error){console.error("MONTRA auction settlement failed",error);}
    this.auctionTimer=setInterval(()=>{try{this.settleExpiredAuctions();}catch(error){console.error("MONTRA auction settlement failed",error);}},15000);
    this.auctionTimer.unref();
  }
  close(): void {
    if (this.auctionTimer) clearInterval(this.auctionTimer);
    if (this.cityTimer) clearInterval(this.cityTimer);
    this.auctionTimer = this.cityTimer = undefined;
    this.db.close();
  }
  startCityProductionSweeper(sweepCity: (now: number) => void): void {
    if (this.cityTimer) return;
    const sweep = () => {
      const now = Date.now();
      try { sweepCity(now); }
      catch (error) { console.error("MONTRA city production settlement failed", error); }
    };
    sweep();
    this.cityTimer = setInterval(sweep, 5000);
    this.cityTimer.unref();
  }
  syncCity(readOwnership: (previous: number | null, now: number) => CityOwnership, now: number): CityOwnership {
    const ownership = readOwnership(this.city.epoch(), now);
    this.transaction(() => this.city.reconcile(ownership, now));
    return ownership;
  }
  viewCity(member: CityMember, ownership: CityOwnership) {
    return this.city.view(member, ownership);
  }
  hasCityAssets(guild: string): boolean {
    return this.city.hasAssets(guild);
  }
  cityDisbandClosed(actor: string, guild: string): boolean {
    return this.city.closureActor(guild) === actor;
  }
  closeCityGuild(disband: CityDisband, readOwnership: (previous: number | null) => CityOwnership): void {
    const ownership = readOwnership(this.city.epoch());
    this.transaction(() => {
      this.account(disband.actor);
      this.city.disband(disband, ownership);
    });
  }
  cityDisbandClaims(actor: string) {
    return this.city.claims(actor);
  }
  hasCityDisbandClaims(actor: string): boolean {
    return this.city.hasClaims(actor);
  }
  claimCityDisband(actor: string, order: Extract<CityOrder, {action: "claim_disband"}>) {
    const {requestId, guildId, item, amount} = order;
    return this.once(actor, requestId, "city_disband_claim", {guildId, item, amount}, () => {
      const account = this.account(actor);
      this.city.claim(actor, guildId, item, amount);
      if (item === "gold") {
        if (account.gold + amount > MAX_GOLD) throw Error("city_wallet_full");
        account.gold += amount;
      } else account.inventory = add(account.inventory, {itemId: item, quantity: amount});
      this.put(actor, account);
      return {guildId, item, amount};
    });
  }
  cityOrder(actor: string, member: CityMember, order: CityFactoryOrder, ownership: CityOwnership, now: number) {
    const intent = Object.entries(order).sort(([a], [b]) => a.localeCompare(b));
    return this.once<Record<string, number | string>>(actor, order.requestId, "city_production", intent, () => {
      if (this.city.closureActor(member.id)) throw Error("city_disband_pending");
      if (order.action === "cancel") return this.city.cancel(member, order.listingId);
      if (order.action === "reclaim") {
        const account = this.account(actor);
        this.city.reclaim(order.epoch, member, order.item, order.amount);
        account.inventory = add(account.inventory, {itemId: order.item, quantity: order.amount});
        this.put(actor, account);
        return {quantity: order.amount};
      }
      this.city.requireCity(member, order.epoch, ownership);
      switch (order.action) {
        case "build": return this.city.build(order.epoch, member);
        case "start":
        case "start_fast": return this.city.start(order.epoch, member, now, order.action === "start_fast");
        case "list": return this.city.list(order.epoch, member, order.amount, order.price);
        case "deposit": {
          const account = this.account(actor);
          if (account.inventory.slots[order.slot]?.itemId !== order.item) throw Error("item_unavailable");
          const removed = take(account.inventory, order.slot, order.amount);
          this.city.deposit(order.epoch, member, order.item, order.amount);
          account.inventory = removed.inventory;
          this.put(actor, account);
          return {quantity: order.amount};
        }
      }
    });
  }
  catchFish(actor:string,request:string,item:FishItem){
    return this.once(actor,request,"fish",{item},()=>{
      const account=this.account(actor);
      if(this.pendingFish(actor))throw Error("fish_pending");
      try{account.inventory=add(account.inventory,{itemId:item,quantity:1});}
      catch(error){
        if(!(error instanceof Error) || error.message!=="inventory_full")throw error;
        this.db.prepare("INSERT INTO fishing_pending(actor,request,item) VALUES(?,?,?)").run(actor,request,item);
        return {item,quantity:1,pending:true};
      }
      this.put(actor,account);return {item,quantity:1,pending:false};
    });
  }
  pendingFish(actor:string):FishItem|null{
    const row=this.db.prepare("SELECT item FROM fishing_pending WHERE actor=?").get(actor);
    return row?String(row.item) as FishItem:null;
  }
  claimFish(actor:string){
    characterId(actor);
    return this.transaction(()=>{
      const item=this.pendingFish(actor);if(!item)throw Error("fish_no_pending");
      const account=this.account(actor);account.inventory=add(account.inventory,{itemId:item,quantity:1});
      this.put(actor,account);this.db.prepare("DELETE FROM fishing_pending WHERE actor=?").run(actor);
      return {item,quantity:1};
    });
  }
  resourceMap(mapId:string,now=Date.now()){
    const rows=this.db.prepare("SELECT s.node,s.stock,s.nextAt,p.periodMs FROM resource_stock s LEFT JOIN resource_periods p ON p.map=s.map AND p.node=s.node WHERE s.map=?").all(mapId);
    const stocks=new Map(rows.map(row=>[String(row.node),{stock:Number(row.stock),nextAt:Number(row.nextAt),...(row.periodMs==null?{}:{periodMs:Number(row.periodMs)})}]));
    const nodes=resourceNodes(mapId).map(n=>{
      const s=resourceStock(n,stocks.get(n.id),now);
      return {id:n.id,x:n.x,z:n.z,kind:n.kind,radius:n.radius,tier:n.tier,capacity:n.capacity,existing:n.existing,stock:s.stock,
        nextIn:Math.max(0,s.nextAt-now)};
    });
    const capacity=nodes.reduce((sum,n)=>sum+n.capacity,0),available=nodes.reduce((sum,n)=>sum+n.stock,0);
    return {mapId,nodes,capacity,available};
  }
  resourceAtlas(now=Date.now()){
    return Object.values(WORLD_MAPS).filter(map=>resourceNodes(map.id).length).map(map=>{
      const {nodes,capacity,available}=this.resourceMap(map.id,now);
      return {name:map.name,mapId:map.id,capacity,available,wood:nodes.filter(n=>n.kind==="wood").reduce((s,n)=>s+n.stock,0),
        stone:nodes.filter(n=>n.kind==="stone").reduce((s,n)=>s+n.stock,0),herb:nodes.filter(n=>n.kind==="herb").reduce((s,n)=>s+n.stock,0),tier:Math.max(...nodes.map(n=>n.tier))};
    });
  }
  harvest(actor:string,request:string,n:ResourceNode,now=Date.now(),playerLevel=1){
    return this.once(actor,request,"harvest",{node:n.id},()=>{
      const worker=this.db.prepare("SELECT lastAt FROM resource_workers WHERE actor=?").get(actor);
      if(worker && now-Number(worker.lastAt)<GATHER_DELAY)throw Error("resource_cooldown");
      const row=this.db.prepare("SELECT s.stock,s.nextAt,p.periodMs FROM resource_stock s LEFT JOIN resource_periods p ON p.map=s.map AND p.node=s.node WHERE s.map=? AND s.node=?").get(n.mapId,n.id);
      const s=resourceStock(n,row as ResourceStock|undefined,now);
      if(!s.stock)throw Error("resource_empty");
      const account=this.account(actor),item=rawResource(n);
      const tools=account.inventory.slots.map(s=>personalItem(s?.itemId));
      const equipped=tools.find(t=>t?.harvestKind===n.kind && t.level!<=playerLevel && t.toolTier!>=n.tier);
      const space=account.inventory.slots.reduce((sum,s)=>sum+(s===null?99:s.itemId===item?99-s.quantity:0),0);
      if(!space)throw Error("inventory_full");
      const quantity=Math.min(equipped?2:1,s.stock,space);
      account.inventory=add(account.inventory,{itemId:item,quantity});this.put(actor,account);
      const period=s.nextAt && Number.isSafeInteger(row?.periodMs) && Number(row?.periodMs)>0 ? Number(row!.periodMs) : s.nextAt ? n.period : dynamicResourcePeriodMs(n.mapId,n.kind,n.period);
      let nextAt=s.nextAt||now+period;
      if(s.stock===quantity){
        const region=this.resourceMap(n.mapId,now);
        if((region.available-quantity)*4<=region.capacity)nextAt+=Math.round(period*.25);
      }
      this.db.prepare("INSERT OR REPLACE INTO resource_stock VALUES(?,?,?,?)").run(n.mapId,n.id,s.stock-quantity,nextAt);
      this.db.prepare("INSERT OR REPLACE INTO resource_periods VALUES(?,?,?)").run(n.mapId,n.id,period);
      this.db.prepare("INSERT OR REPLACE INTO resource_workers VALUES(?,?)").run(actor,now);
      return {item,quantity,...(equipped?{tool:equipped.name}:{})};
    });
  }
  refine(actor:string,request:string,expected:string,level:number){
    return this.once(actor,request,"refine",{expected},()=>{
      const raw=personalItem(expected);
      if(!raw?.refinesTo)throw Error("item_unavailable");
      if(level<raw.level!)throw Error("item_level_required");
      const account=this.account(actor);
      const oldCatalyst=raw.kind==="catalyst",quantity=oldCatalyst?2:1;
      consume(account,expected,oldCatalyst?1:REFINE_INPUT);
      account.inventory=add(account.inventory,{itemId:raw.refinesTo,quantity});this.put(actor,account);
      return {item:raw.refinesTo,quantity};
    });
  }
  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }
  private account(id: string): Account {
    characterId(id);
    const row = this.db.prepare("SELECT gold, inventory FROM accounts WHERE id=?").get(id);
    if (!row || typeof row.gold !== "number" || typeof row.inventory !== "string") throw new Error("economy_account_missing");
    goldAmount(row.gold);
    return { gold: row.gold, inventory: validateInventory(JSON.parse(row.inventory) as unknown) };
  }
  private put(id: string, account: Account, health?: {hp: number; mana: number}): void {
    goldAmount(account.gold);
    this.db.prepare("UPDATE accounts SET gold=?, inventory=? WHERE id=?").run(account.gold, JSON.stringify(validateInventory(account.inventory)), id);
    const row = this.db.prepare("SELECT snapshot FROM characters WHERE id=?").get(id);
    if (row && typeof row.snapshot === "string") {
      const snapshot = JSON.parse(row.snapshot) as Record<string, unknown>;
      snapshot.inventory = account.inventory;
      if (health) Object.assign(snapshot, health);
      this.db.prepare("UPDATE characters SET snapshot=? WHERE id=?").run(JSON.stringify(snapshot), id);
    }
  }
  getCharacter(id: string): unknown | null {
    characterId(id);
    const row=this.db.prepare("SELECT snapshot FROM characters WHERE id=?").get(id);
    return row && typeof row.snapshot === "string" ? JSON.parse(row.snapshot) as unknown : null;
  }
  /** Commit the entire character and its inventory together with the wallet. */
  saveCharacter(id: string, snapshot: object, inventory: InventorySnapshot): void {
    characterId(id); const bag = validateInventory(inventory);
    this.transaction(() => {
      this.db.prepare("INSERT OR IGNORE INTO accounts(id,gold,inventory) VALUES(?,?,?)").run(id,STARTER_GOLD,JSON.stringify(bag));
      this.db.prepare("INSERT INTO characters(id,snapshot) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET snapshot=excluded.snapshot").run(id,JSON.stringify(snapshot));
      this.db.prepare("UPDATE accounts SET inventory=? WHERE id=?").run(JSON.stringify(bag),id);
    });
  }
  private once<T>(actor: string, request: string, kind: string, args: unknown, operation: () => T): T {
    characterId(actor);
    if (!/^[a-zA-Z0-9_-]{16,64}$/.test(request)) throw new Error("invalid_request_id");
    const intent = createHash("sha256").update(JSON.stringify(args)).digest("hex");
    return this.transaction(() => {
      const old = this.db.prepare("SELECT actor, kind, intent, result FROM receipts WHERE request_id=?").get(request);
      if (old) {
        if (old.actor !== actor || old.kind !== kind || old.intent !== intent || typeof old.result !== "string") throw new Error("request_id_conflict");
        return JSON.parse(old.result) as T;
      }
      const result = operation();
      this.db.prepare("INSERT INTO receipts(request_id,actor,kind,intent,result) VALUES(?,?,?,?,?)").run(request, actor, kind, intent, JSON.stringify(result));
      return result;
    });
  }
  /** One-time import; reconnects cannot re-grant gold or replace inventory. */
  register(id: string, inventory: InventorySnapshot): Account {
    characterId(id);
    const data = JSON.stringify(validateInventory(inventory));
    this.db.prepare("INSERT OR IGNORE INTO accounts(id,gold,inventory) VALUES(?,?,?)").run(id, STARTER_GOLD, data);
    return this.account(id);
  }
  getAccount(id: string): Account { return this.account(id); }
  hasOpenListings(id:string):boolean {
    characterId(id);
    return Boolean(this.db.prepare("SELECT 1 FROM listings WHERE seller=? AND state='open' LIMIT 1").get(id) ||
      this.db.prepare("SELECT 1 FROM auctions WHERE (state='open' AND (seller=? OR bidder=?)) OR (state='settled' AND claimant=? AND claimed=0) LIMIT 1").get(id,id,id) ||
      this.db.prepare("SELECT 1 FROM auction_credits WHERE actor=? AND amount>0 LIMIT 1").get(id));
  }
  /** A character cannot be retired while another player can buy its listings. */
  eraseCharacter(id:string):void {
    characterId(id);
    this.transaction(()=>{
      if(this.hasOpenListings(id))throw new Error("character_has_listings");
      if(this.hasCityDisbandClaims(id))throw new Error("character_has_city_claims");
      this.db.prepare("DELETE FROM listings WHERE seller=?").run(id);
      this.db.prepare("DELETE FROM auction_credits WHERE actor=?").run(id);
      this.db.prepare("DELETE FROM starter_supply_used WHERE actor=?").run(id);
      this.db.prepare("DELETE FROM receipts WHERE actor=?").run(id);
      this.db.prepare("DELETE FROM characters WHERE id=?").run(id);
      this.db.prepare("DELETE FROM accounts WHERE id=?").run(id);
    });
  }
  list(id?: string): Listing[] {
    if (id !== undefined) characterId(id);
    const latest=this.db.prepare("SELECT id,seller,seller_guild,seller_name,item,price,state FROM listings WHERE state='open' ORDER BY rowid DESC LIMIT 100").all();
    const own=id ? this.db.prepare("SELECT id,seller,seller_guild,seller_name,item,price,state FROM listings WHERE state='open' AND seller=? ORDER BY rowid DESC").all(id) : [];
    const seen=new Set<string>();
    return [...own,...latest].filter(row=>{const key=String(row.id); if (seen.has(key)) return false; seen.add(key); return true;}).map(row => ({
      id: String(row.id), seller: String(row.seller_name ?? row.seller), item: JSON.parse(String(row.item)) as InventoryStack,
      ...(typeof row.seller_guild === "string" ? {sellerGuild: row.seller_guild} : {}),
      price: Number(row.price), state: String(row.state),
    }));
  }
  browseMarket(id:string,query:string,category:MarketCategory,before:number|null,ownOnly=false){
    characterId(id);const ids=marketItemIds(query,category);if(ids && !ids.length)return {listings:[],nextCursor:null};
    const where=["state='open'"],args:(string|number)[]=[];
    if(before!==null){where.push("rowid<?");args.push(before);}
    if(ownOnly){where.push("seller=?");args.push(id);}
    if(ids){where.push(`json_extract(item,'$.itemId') IN (${ids.map(()=>"?").join(",")})`);args.push(...ids);}
    const rows=this.db.prepare(`SELECT rowid AS seq,id,seller,seller_guild,seller_name,item,price FROM listings WHERE ${where.join(" AND ")} ORDER BY rowid DESC LIMIT 31`).all(...args);
    const page=rows.slice(0,30);
    return {listings:page.map(row=>({id:String(row.id),seller:typeof row.seller_name==="string"?row.seller_name:String(row.seller).slice(0,12),
      ...(typeof row.seller_guild==="string"?{sellerGuild:row.seller_guild}:{}),
      isMine:row.seller===id,item:JSON.parse(String(row.item)) as InventoryStack,price:Number(row.price)})),nextCursor:rows.length>30?Number(page[page.length-1].seq):null};
  }

  /** NPC reserve has both a per-character and a shared daily limit; resets at 00:00 UTC. */
  starterSupplyStatus(id:string,now=Date.now()){
    characterId(id);const day=new Date(now).toISOString().slice(0,10);
    return {resetAt:(Math.floor(now/86400000)+1)*86400000,items:Object.entries(STARTER_SUPPLIES).map(([item,config])=>{
      const used=Number(this.db.prepare("SELECT quantity FROM starter_supply_used WHERE actor=? AND day=? AND item=?").get(id,day,item)?.quantity??0);
      const world=Number(this.db.prepare("SELECT quantity FROM starter_supply_world WHERE day=? AND item=?").get(day,item)?.quantity??0);
      return {item,price:config.price,remaining:Math.max(0,Math.min(config.dailyLimit-used,config.worldLimit-world)),personalRemaining:Math.max(0,config.dailyLimit-used),worldRemaining:Math.max(0,config.worldLimit-world)};
    })};
  }
  buyStarterSupply(id:string,request:string,item:StarterSupplyId,quantity:number,now=Date.now()){
    if(!Object.hasOwn(STARTER_SUPPLIES,item))throw Error("item_unavailable");
    positiveInteger(quantity,20);
    return this.once(id,request,"starter_supply",{item,quantity},()=>{
      const status=this.starterSupplyStatus(id,now).items.find(x=>x.item===item)!;
      if(quantity>status.remaining)throw Error("starter_supply_limit");
      const account=this.account(id),cost=status.price*quantity;if(account.gold<cost)throw Error("insufficient_gold");
      account.inventory=add(account.inventory,{itemId:item,quantity});account.gold-=cost;this.put(id,account);
      const day=new Date(now).toISOString().slice(0,10);
      this.db.prepare("INSERT INTO starter_supply_used VALUES(?,?,?,?) ON CONFLICT(actor,day,item) DO UPDATE SET quantity=quantity+excluded.quantity").run(id,day,item,quantity);
      this.db.prepare("INSERT INTO starter_supply_world VALUES(?,?,?) ON CONFLICT(day,item) DO UPDATE SET quantity=quantity+excluded.quantity").run(day,item,quantity);
      return {item,quantity,cost};
    });
  }

  private creditOrHold(id:string,amount:number):void {
    positiveInteger(amount,MAX_GOLD);const account=this.account(id);
    if(account.gold+amount<=MAX_GOLD){account.gold+=amount;this.put(id,account);return;}
    const pending=Number(this.db.prepare("SELECT amount FROM auction_credits WHERE actor=?").get(id)?.amount??0);
    if(!Number.isSafeInteger(pending) || !Number.isSafeInteger(pending+amount))throw Error("auction_credit_overflow");
    this.db.prepare("INSERT INTO auction_credits VALUES(?,?) ON CONFLICT(actor) DO UPDATE SET amount=excluded.amount").run(id,pending+amount);
  }
  auctionCredit(id:string):number { characterId(id);return Number(this.db.prepare("SELECT amount FROM auction_credits WHERE actor=?").get(id)?.amount??0); }
  claimAuctionCredit(id:string,request:string){
    return this.once(id,request,"auction_credit",{},()=>{
      const pending=this.auctionCredit(id),account=this.account(id),amount=Math.min(pending,MAX_GOLD-account.gold);
      if(!Number.isSafeInteger(pending) || amount<=0)throw Error("auction_credit_unavailable");
      account.gold+=amount;this.put(id,account);
      if(amount===pending)this.db.prepare("DELETE FROM auction_credits WHERE actor=?").run(id);
      else this.db.prepare("UPDATE auction_credits SET amount=? WHERE actor=?").run(pending-amount,id);
      return {amount,remaining:pending-amount};
    });
  }
  createAuction(id:string,request:string,slot:number,amount:number,opening:number,durationHours:number,stamp?:string,now=Date.now()){
    positiveInteger(opening,MAX_GOLD);if(![1,6,24].includes(durationHours))throw Error("invalid_auction_duration");
    return this.once(id,request,"auction_create",{slot,amount,opening,durationHours,...(stamp===undefined?{}:{stamp})},()=>{
      const count=Number(this.db.prepare("SELECT COUNT(*) AS total FROM auctions WHERE seller=? AND (state='open' OR (state='settled' AND claimant=? AND claimed=0))").get(id,id)?.total??0);
      if(count>=20)throw Error("auction_limit");
      const seller=this.account(id),item=seller.inventory.slots[slot];
      if(item && !matchesGearStamp(seller.inventory,item.itemId,item.forge,stamp))throw Error("item_unavailable");
      const removed=take(seller.inventory,slot,amount);seller.inventory=removed.inventory;this.put(id,seller);
      const auctionId=randomUUID(),endsAt=now+durationHours*3600000;
      this.db.prepare("INSERT INTO auctions(id,seller,item,opening,ends_at,state) VALUES(?,?,?,?,?,'open')").run(auctionId,id,JSON.stringify(removed.item),opening,endsAt);
      return {auctionId,endsAt};
    });
  }
  bidAuction(id:string,request:string,auctionId:string,amount:number,now=Date.now()){
    positiveInteger(amount,MAX_GOLD);
    return this.once(id,request,"auction_bid",{auctionId,amount},()=>{
      const row=this.db.prepare("SELECT seller,bidder,bid,opening,ends_at,state FROM auctions WHERE id=?").get(auctionId);
      if(!row || row.state!=="open" || Number(row.ends_at)<=now)throw Error("auction_unavailable");
      if(row.seller===id)throw Error("cannot_bid_own_auction");
      const previous=Number(row.bid),minimum=previous?previous+1:Number(row.opening);
      if(amount<minimum)throw Error("auction_bid_too_low");
      const bidder=this.account(id),oldBidder=typeof row.bidder==="string"?row.bidder:null;
      if(oldBidder!==id){
        const pending=Number(this.db.prepare("SELECT COUNT(*) AS total FROM auctions WHERE (state='open' AND bidder=?) OR (state='settled' AND claimant=? AND bidder=? AND claimed=0)").get(id,id,id)?.total??0);
        if(pending>=20)throw Error("auction_bid_limit");
      }
      const debit=oldBidder===id?amount-previous:amount;if(bidder.gold<debit)throw Error("insufficient_gold");
      bidder.gold-=debit;this.put(id,bidder);
      if(oldBidder && oldBidder!==id)this.creditOrHold(oldBidder,previous);
      this.db.prepare("UPDATE auctions SET bidder=?,bid=? WHERE id=?").run(id,amount,auctionId);
      return {auctionId,amount};
    });
  }
  settleExpiredAuctions(now=Date.now()):number {
    return this.transaction(()=>{
      const rows=this.db.prepare("SELECT id,seller,bidder,bid FROM auctions WHERE state='open' AND ends_at<=? ORDER BY ends_at LIMIT 50").all(now);
      for(const row of rows){
        const bidder=typeof row.bidder==="string"?row.bidder:null,seller=String(row.seller);
        if(bidder)this.creditOrHold(seller,Number(row.bid));
        this.db.prepare("UPDATE auctions SET state='settled',claimant=? WHERE id=? AND state='open'").run(bidder??seller,String(row.id));
      }
      return rows.length;
    });
  }
  claimAuctionItem(id:string,request:string,auctionId:string){
    return this.once(id,request,"auction_item",{auctionId},()=>{
      const row=this.db.prepare("SELECT claimant,item,state,claimed FROM auctions WHERE id=?").get(auctionId);
      if(!row || row.state!=="settled" || row.claimant!==id || Number(row.claimed)!==0)throw Error("auction_claim_unavailable");
      const account=this.account(id);account.inventory=add(account.inventory,JSON.parse(String(row.item)) as InventoryStack);this.put(id,account);
      this.db.prepare("UPDATE auctions SET claimed=1 WHERE id=?").run(auctionId);return {auctionId};
    });
  }
  cancelAuction(id:string,request:string,auctionId:string,now=Date.now()){
    return this.once(id,request,"auction_cancel",{auctionId},()=>{
      const row=this.db.prepare("SELECT seller,item,bidder,ends_at,state FROM auctions WHERE id=?").get(auctionId);
      if(!row || row.seller!==id || row.state!=="open" || Number(row.ends_at)<=now || row.bidder)throw Error("auction_cancel_unavailable");
      const seller=this.account(id);seller.inventory=add(seller.inventory,JSON.parse(String(row.item)) as InventoryStack);this.put(id,seller);
      this.db.prepare("UPDATE auctions SET state='cancelled',claimed=1 WHERE id=?").run(auctionId);return {auctionId};
    });
  }
  browseAuctions(id:string,query:string,category:MarketCategory,before:number|null){
    characterId(id);const ids=marketItemIds(query,category);if(ids && !ids.length)return {auctions:[],nextCursor:null};
    const where=["state='open'","ends_at>?"],args:(string|number)[]=[Date.now()];
    if(before!==null){where.push("rowid<?");args.push(before);}
    if(ids){where.push(`json_extract(item,'$.itemId') IN (${ids.map(()=>"?").join(",")})`);args.push(...ids);}
    const rows=this.db.prepare(`SELECT rowid AS seq,id,seller,item,opening,bidder,bid,ends_at FROM auctions WHERE ${where.join(" AND ")} ORDER BY rowid DESC LIMIT 31`).all(...args);
    const page=rows.slice(0,30);
    return {auctions:page.map(row=>({id:String(row.id),seller:String(row.seller).slice(0,12),isMine:row.seller===id,isBidder:row.bidder===id,item:JSON.parse(String(row.item)) as InventoryStack,opening:Number(row.opening),bid:Number(row.bid),bidder:typeof row.bidder==="string"?row.bidder.slice(0,12):null,endsAt:Number(row.ends_at)})),nextCursor:rows.length>30?Number(page[page.length-1].seq):null};
  }
  myAuctions(id:string){
    characterId(id);
    const fields="id,seller,item,opening,bidder,bid,ends_at,state,claimant,claimed";
    const pending=this.db.prepare(`SELECT ${fields} FROM auctions WHERE (state='open' AND (seller=? OR bidder=?)) OR (state='settled' AND claimant=? AND claimed=0) ORDER BY rowid DESC LIMIT 100`).all(id,id,id);
    const history=this.db.prepare(`SELECT ${fields} FROM auctions WHERE state='settled' AND ((seller=? AND bidder IS NOT NULL) OR (claimant=? AND claimed=1)) ORDER BY rowid DESC LIMIT 15`).all(id,id);
    const seen=new Set<string>(),rows=[...pending,...history].filter(row=>{const key=String(row.id);if(seen.has(key))return false;seen.add(key);return true;});
    return {auctions:rows.map(row=>({id:String(row.id),seller:String(row.seller).slice(0,12),isMine:row.seller===id,isBidder:row.bidder===id,item:JSON.parse(String(row.item)) as InventoryStack,opening:Number(row.opening),bid:Number(row.bid),bidder:typeof row.bidder==="string"?row.bidder.slice(0,12):null,endsAt:Number(row.ends_at),state:String(row.state),canClaim:row.state==="settled" && row.claimant===id && Number(row.claimed)===0})),credit:this.auctionCredit(id)};
  }
  craftShrineGlaive(id: string, request: string) {
    const recipe = SHRINE_RECIPE;
    return this.once(id, request, "craft", {recipe: recipe.id}, () => {
      const account = this.account(id);
      if (account.gold < recipe.gold) throw Error("insufficient_gold");
      let remaining = recipe.quantity;
      for (const [index, stack] of account.inventory.slots.entries()) {
        if (stack?.itemId !== recipe.ingredient) continue;
        const used = Math.min(remaining, stack.quantity);
        account.inventory = take(account.inventory, index, used).inventory;
        remaining -= used;
        if (remaining === 0) break;
      }
      if (remaining > 0) throw Error("craft_missing_shard");
      const received=receiveCraft(account.inventory,{itemId:recipe.output,quantity:1});
      account.inventory=received.inventory;
      account.gold -= recipe.gold;
      this.put(id, account);
      return {itemId: recipe.output, spentGold: recipe.gold,banked:received.banked};
    });
  }

  craftPersonal(id:string,request:string,output:PersonalId,level=1) {
    const def=personalItem(output);
    if(!def?.recipe)throw Error("invalid_recipe");
    return this.once(id,request,"craft",{recipe:output},()=>{
      if(level<(def.level??1))throw Error("item_level_required");
      this.checkCooking(id, output);
      const account=this.account(id),cost=def.craftGold!;
      if(account.gold<cost)throw Error("insufficient_gold");
      for(const ingredient of def.recipe!)consume(account,ingredient.item,ingredient.qty);
      const forge=birthForge(output);
      const received=receiveCraft(account.inventory,{itemId:output,quantity:1,...(forge?{forge}:{})});
      account.inventory=received.inventory;
      account.gold-=cost;
      this.put(id,account);
      this.creditCooking(id, output);
      return {itemId:output,spentGold:cost,banked:received.banked};
    });
  }

  cookingState(id: string) {
    characterId(id);
    const xp = Number(this.db.prepare("SELECT xp FROM cooking WHERE actor=?").get(id)?.xp ?? 0);
    return {xp, level: cookingLevel(xp), kitchen: Boolean(this.db.prepare(
      "SELECT 1 FROM furniture WHERE actor=? AND item='furniture_kitchen' LIMIT 1",
    ).get(id))};
  }

  private checkCooking(id: string, itemId: string) {
    const required = personalItem(itemId)?.cookingLevel;
    if (!required || required === 1) return;
    const state = this.cookingState(id);
    if (state.level < required) throw Error("cooking_level_required");
    if (!state.kitchen) throw Error("cooking_kitchen_required");
  }

  private creditCooking(id: string, itemId: string) {
    if (!personalItem(itemId)?.food) return;
    this.db.prepare(
      "INSERT INTO cooking VALUES(?,1) ON CONFLICT(actor) DO UPDATE SET xp=MIN(15,cooking.xp+1)",
    ).run(id);
  }

  private needValues(id: string, now: number) {
    characterId(id);
    const row = this.db.prepare("SELECT food,water,updated_at FROM needs WHERE actor=?").get(id);
    if (!row) {
      this.db.prepare("INSERT INTO needs VALUES(?,100,100,?)").run(id, now);
      return {food: 100, water: 100, updatedAt: now};
    }
    const updatedAt = Number(row.updated_at), elapsed = Math.max(0, now - updatedAt);
    return {food: Math.max(0, Number(row.food) - elapsed / HUNGER_POINT_MS),
      water: Math.max(0, Number(row.water) - elapsed / THIRST_POINT_MS), updatedAt: Math.max(now, updatedAt)};
  }

  needsState(id: string, now = Date.now()) {
    const {food, water, updatedAt} = this.needValues(id, now);
    return {food: Math.ceil(food), water: Math.ceil(water), max: 100, serverNow: now,
      hungryAt: Math.round(updatedAt + food * HUNGER_POINT_MS), thirstyAt: Math.round(updatedAt + water * THIRST_POINT_MS)};
  }

  consumeNutrition(id: string, slot: number, expected: string, health: {hp: number; mana: number},
                   recovered: boolean, now = Date.now()) {
    return this.transaction(() => {
      const account = this.account(id), item = account.inventory.slots[slot];
      const nutrition = personalItem(expected)?.nutrition;
      if (!nutrition || item?.itemId !== expected) throw Error("item_unavailable");
      const current = this.needValues(id, now);
      const food = Math.min(100, current.food + (nutrition.food ?? 0));
      const water = Math.min(100, current.water + (nutrition.water ?? 0));
      if (Math.ceil(food) === Math.ceil(current.food) && Math.ceil(water) === Math.ceil(current.water) && !recovered) throw Error("needs_full");
      account.inventory = take(account.inventory, slot, 1).inventory;
      this.put(id, account, health);
      this.db.prepare("UPDATE needs SET food=?,water=?,updated_at=? WHERE actor=?")
        .run(food, water, current.updatedAt, id);
      return this.needsState(id, now);
    });
  }

  collectWater(id: string, request: string, now = Date.now()) {
    return this.once(id, request, "collect_water", {}, () => {
      const prior = Number(this.db.prepare("SELECT ready_at FROM water_supply WHERE actor=?").get(id)?.ready_at ?? 0);
      if (now < prior) throw Error("water_cooldown");
      const account = this.account(id), readyAt = now + 15_000, itemId = "drink_clean_water";
      account.inventory = add(account.inventory, {itemId, quantity: 1});
      this.put(id, account);
      this.db.prepare("INSERT INTO water_supply VALUES(?,?) ON CONFLICT(actor) DO UPDATE SET ready_at=excluded.ready_at")
        .run(id, readyAt);
      return {itemId, quantity: 1, readyAt};
    });
  }

  homeState(id: string, now = Date.now()) {
    characterId(id);
    const level = Number(this.db.prepare("SELECT level FROM homes WHERE actor=?").get(id)?.level ?? 0);
    const furniture = this.db.prepare("SELECT cell,item AS itemId FROM furniture WHERE actor=? ORDER BY cell").all(id);
    const parts = this.db.prepare("SELECT cell,layer,item AS itemId,rotation FROM home_parts WHERE actor=? ORDER BY cell,layer")
      .all(id).map(row=>({cell:Number(row.cell),layer:row.layer as "floor" | "structure",
        itemId:String(row.itemId),rotation:Number(row.rotation) as 0 | 1}));
    const garden = this.db.prepare("SELECT plot,ready_at AS readyAt FROM garden WHERE actor=? ORDER BY plot").all(id);
    return {level, width: level === 2 ? 8 : level === 1 ? 4 : 0, stride: 8, plotCount: level * 2,
      furniture, parts, garden, serverNow: now, cooking: this.cookingState(id)};
  }

  homeAction(id: string, order: HomeAction, now = Date.now(), mayPlaceWall?: (cell:number,rotation:0|1)=>boolean) {
    const {requestId, ...intent} = order;
    return this.once(id, requestId, "home_action", intent, () => {
      const account = this.account(id), level = Number(this.db.prepare("SELECT level FROM homes WHERE actor=?").get(id)?.level ?? 0);
      if (order.action === "buy" || order.action === "upgrade") {
        const targetLevel = order.action === "buy" ? 1 : 2;
        if (level !== targetLevel - 1) throw Error("home_level_unavailable");
        const cost = HOME_PRICES[targetLevel];
        if (account.gold < cost) throw Error("insufficient_gold");
        account.gold -= cost;
        this.put(id, account);
        this.db.prepare("INSERT INTO homes VALUES(?,?) ON CONFLICT(actor) DO UPDATE SET level=excluded.level").run(id,targetLevel);
      } else {
        if (level === 0) throw Error("home_required");
        if ("plot" in order) this.tendGarden(id, order, level, account, now);
        else if (order.action === "place_part" || order.action === "move_part" || order.action === "remove_part") {
          this.arrangeHomePart(id,order,level,account,mayPlaceWall);
        } else if ("cell" in order) this.arrangeFurniture(id, order, level, account);
      }
      return {action: order.action};
    });
  }

  private requireHomeCell(cell: number, level: number) {
    const width = level === 1 ? 4 : 8;
    if (!Number.isInteger(cell) || cell < 0 || cell % 8 >= width || Math.floor(cell / 8) >= width) throw Error("home_cell_invalid");
  }

  private arrangeFurniture(id: string, order: Extract<HomeAction,{action:"place"|"move"|"remove"}>, level: number, account: Account) {
    const {cell} = order;
    this.requireHomeCell(cell,level);
    const furnitureAt = (index: number) => this.db.prepare("SELECT item FROM furniture WHERE actor=? AND cell=?").get(id,index)?.item;
    if (order.action === "remove") {
      const itemId = furnitureAt(cell);
      if (typeof itemId !== "string" || !personalItem(itemId)?.furniture) throw Error("home_furniture_unavailable");
      account.inventory = add(account.inventory, {itemId: itemId as FurnitureId, quantity: 1});
      this.put(id, account);
      this.db.prepare("DELETE FROM furniture WHERE actor=? AND cell=?").run(id,cell);
      return;
    }
    if (furnitureAt(cell) || this.db.prepare("SELECT 1 FROM home_parts WHERE actor=? AND cell=? AND layer='structure'").get(id,cell)) {
      throw Error("home_cell_occupied");
    }
    if (order.action === "move") {
      if (!furnitureAt(order.from)) throw Error("home_furniture_unavailable");
      this.db.prepare("UPDATE furniture SET cell=? WHERE actor=? AND cell=?").run(cell,id,order.from);
      return;
    }
    if (!personalItem(order.itemId)?.furniture || personalItem(order.itemId)?.homeLayer) throw Error("home_furniture_unavailable");
    consume(account, order.itemId, 1, "home_furniture_unavailable");
    this.put(id, account);
    this.db.prepare("INSERT INTO furniture VALUES(?,?,?)").run(id,cell,order.itemId);
  }

  private arrangeHomePart(id: string, order: Extract<HomeAction,{action:"place_part"|"move_part"|"remove_part"}>,
                          level: number, account: Account, mayPlaceWall?: (cell:number,rotation:0|1)=>boolean) {
    const {cell} = order;
    this.requireHomeCell(cell,level);
    const layer = order.action === "place_part" ? personalItem(order.itemId)?.homeLayer : order.layer;
    if (!layer) throw Error("home_furniture_unavailable");
    const at = (index:number) => this.db.prepare("SELECT item FROM home_parts WHERE actor=? AND cell=? AND layer=?")
      .get(id,index,layer)?.item;
    if (order.action === "remove_part") {
      const itemId = at(cell);
      if (typeof itemId !== "string" || personalItem(itemId)?.homeLayer !== layer) throw Error("home_furniture_unavailable");
      account.inventory = add(account.inventory,{itemId:itemId as HomePartId,quantity:1});
      this.put(id,account);
      this.db.prepare("DELETE FROM home_parts WHERE actor=? AND cell=? AND layer=?").run(id,cell,layer);
      return;
    }
    if (order.action === "place_part" || order.from !== cell) {
      if (at(cell) || (layer === "structure" &&
          this.db.prepare("SELECT 1 FROM furniture WHERE actor=? AND cell=?").get(id,cell))) throw Error("home_cell_occupied");
    }
    const itemId = order.action === "place_part" ? order.itemId : at(order.from);
    if (typeof itemId !== "string" || personalItem(itemId)?.homeLayer !== layer) throw Error("home_furniture_unavailable");
    const rotation = layer === "structure" ? order.rotation : 0;
    if (itemId === "furniture_wood_wall" && mayPlaceWall && !mayPlaceWall(cell,rotation)) throw Error("home_wall_blocked");
    if (order.action === "move_part") {
      this.db.prepare("UPDATE home_parts SET cell=?,rotation=? WHERE actor=? AND cell=? AND layer=?")
        .run(cell,rotation,id,order.from,layer);
      return;
    }
    consume(account,itemId,1,"home_furniture_unavailable");
    this.put(id,account);
    this.db.prepare("INSERT INTO home_parts VALUES(?,?,?,?,?)").run(id,cell,layer,itemId,rotation);
  }

  private tendGarden(id: string, order: Extract<HomeAction,{plot:number}>, level: number, account: Account, now: number) {
    const {plot} = order;
    if (!Number.isInteger(plot) || plot < 0 || plot >= level * 2) throw Error("garden_plot_invalid");
    const crop = this.db.prepare("SELECT ready_at FROM garden WHERE actor=? AND plot=?").get(id,plot);
    if (order.action === "plant") {
      if (crop) throw Error("garden_occupied");
      consume(account, "mat_herb_1", 1);
      this.put(id, account);
      this.db.prepare("INSERT INTO garden VALUES(?,?,NULL)").run(id,plot);
    } else if (order.action === "water") {
      if (!crop || crop.ready_at !== null) throw Error("garden_water_unavailable");
      consume(account, "drink_clean_water", 1);
      this.put(id, account);
      this.db.prepare("UPDATE garden SET ready_at=? WHERE actor=? AND plot=?").run(now + GARDEN_GROWTH_MS,id,plot);
    } else {
      if (!crop || crop.ready_at === null || now < Number(crop.ready_at)) throw Error("garden_not_ready");
      account.inventory = add(account.inventory, {itemId: "mat_herb_1", quantity: 3});
      this.put(id, account);
      this.db.prepare("DELETE FROM garden WHERE actor=? AND plot=?").run(id,plot);
    }
  }

  sellMaterial(id:string,request:string,slot:number,expected:string,quantity:number){
    return this.once(id,request,"sell_material",{slot,expected,quantity},()=>{
      const account=this.account(id),stack=account.inventory.slots[slot],unit=personalItem(expected)?.sellGold;
      if(!unit || stack?.itemId!==expected || !Number.isInteger(quantity) || quantity<1 || quantity>99)throw Error("item_unavailable");
      account.inventory=take(account.inventory,slot,quantity).inventory;
      account.gold+=unit*quantity;
      this.put(id,account);
      return {itemId:expected,quantity,receivedGold:unit*quantity};
    });
  }

  salvageGear(id:string,order:SalvageOrder){
    const {requestId,...intent}=order;
    return this.once(id,requestId,"salvage_gear",intent,()=>{
      const account=this.account(id),bag=account.inventory,stack=bag.slots[order.slot];
      const yieldItem=personalItem(order.gear)?.salvage;
      if(!stack || stack.itemId!==order.gear || !yieldItem || forgeStamp(stack)!==order.stamp || Boolean(stack.bound)!==order.bound ||
         (stack.socket===undefined?"sealed":stack.socket??"empty")!==order.socket)throw Error("salvage_changed");
      if(bag.equippedWeaponSlot===order.slot)throw Error("item_equipped");
      // Bound gear may be recycled by its owner. Trading still requires an unbound item.
      const slots=bag.slots.slice();slots[order.slot]=null;
      let next=add({...bag,slots},{itemId:yieldItem.item,quantity:yieldItem.quantity});
      if(stack.socket)next=add(next,{itemId:stack.socket,quantity:1});
      account.inventory=next;this.put(id,account);
      return {gear:order.gear,material:yieldItem.item,quantity:yieldItem.quantity,card:stack.socket??null};
    });
  }

  socketItem(id:string,order:SocketOrder) {
    const {requestId,...intent}=order;
    return this.once(id,requestId,"card_socket",intent,()=>{
      const account=this.account(id);
      const cost=order.action==="drill"?DRILL_COST.gold:0;
      if(account.gold<cost)throw Error("insufficient_gold");
      const result=changeCardSocket(account.inventory,order);
      account.gold-=cost;
      account.inventory=result.bag;
      this.put(id,account);
      return {action:order.action,gear:order.gear,socket:result.socket,spentGold:cost};
    });
  }

  claimForgeCopy(id:string,request:string,gear:WeaponItemId|BodyItemId,expectedStock:number){
    return this.once(id,request,"claim_forge_copy",{gear,expectedStock},()=>{
      const account=this.account(id),stock=account.inventory.forgeCopies?.[gear]??0;
      if(!isSocketGear(gear) || !stock || stock!==expectedStock)throw Error("forge_stock_changed");
      // Stock stores only a model and count. Claim a fresh bound base without the old piece's upgrades.
      const forge=plainForge();
      account.inventory=add(account.inventory,{itemId:gear,quantity:1,bound:true,forge});
      spendForgeCopies(account.inventory,gear,1);
      this.put(id,account);
      return {gear,instanceId:forge.instanceId,remaining:stock-1};
    });
  }

  forgeWeapon(id:string,request:string,slot:number|BodySlot,stamp:string,action:ForgeAction,level=1,donor?:{slot:number;stamp:string},expectedCopies?:number,risks:{acceptBreak?:boolean;acceptDowngrade?:boolean}={}) {
    const {acceptBreak,acceptDowngrade}=risks;
    return this.once(id,request,"forge",{slot,stamp,action,...(donor?{donor}:{}),...(expectedCopies!==undefined?{copies:expectedCopies}:{}),...(acceptBreak?{acceptBreak}:{}),...(acceptDowngrade?{acceptDowngrade}:{})},()=>{
      const account=this.account(id), bag=account.inventory;
      const worn=typeof slot==="string"?bag.equipment?.[slot]:undefined;
      const stack=typeof slot==="number"?bag.slots[slot]:worn?{itemId:worn,forge:bag.equipmentForges?.[slot]}:undefined;
      if(!stack || isStackableItem(stack.itemId) || forgeStamp(stack)!==stamp)throw Error("forge_item_changed");
      const def=personalItem(stack.itemId);
      if(level<(def?.level??1))throw Error("item_level_required");
      const {cost}=quoteForge(stack.forge,action,def?.level);
      if(account.gold<cost)throw Error("insufficient_gold");
      if(action==="enhance"){
        const {copies,breakOnFailure,downgradeChance}=FORGE_CATALOG.enhanceSteps[stack.forge?.rank??0];
        if(breakOnFailure && !acceptBreak)throw Error("forge_risk_unconfirmed");
        if(downgradeChance && !acceptDowngrade)throw Error("forge_downgrade_unconfirmed");
        const card=typeof slot==="number"?bag.slots[slot]?.socket:bag.equipmentSockets?.[slot];
        if(breakOnFailure && card)throw Error("forge_remove_card");
        if(expectedCopies!==undefined && expectedCopies!==copies)throw Error("forge_item_changed");
        if(donor){
          const spare=bag.slots[donor.slot];
          if(!copies || donor.slot===slot || donor.slot===bag.equippedWeaponSlot || spare?.itemId!==stack.itemId ||
             forgeStamp(spare)!==donor.stamp || spare.socket!==undefined || spare.forge?.rank || spare.forge?.misses)throw Error("forge_donor_changed");
        }
        spendForgeCopies(bag,stack.itemId,copies-Number(Boolean(donor)));
        if(donor)bag.slots[donor.slot]=null;
      }else{
        if(donor)throw Error("forge_donor_changed");
        const ingredient=rerollIngredient(def);
        if(ingredient)consume(account,ingredient.item,ingredient.qty);
      }
      const result=rollForge(stack.forge,action,this.forgeDraw,def);
      account.gold-=cost;
      if(result.broken){
        if(typeof slot==="number"){
          bag.slots[slot]=null;
          if(bag.equippedWeaponSlot===slot)bag.equippedWeaponSlot=null;
        }else{
          delete bag.equipment![slot];
          if(bag.equipmentForges)delete bag.equipmentForges[slot];
          if(bag.equipmentSockets)delete bag.equipmentSockets[slot];
        }
      }else if(typeof slot==="number")account.inventory.slots[slot]={...account.inventory.slots[slot]!,forge:result.forge};
      else account.inventory.equipmentForges={...account.inventory.equipmentForges,[slot]:result.forge};
      this.put(id,account);
      return {...result,itemId:stack.itemId};
    });
  }
  listItem(id: string, request: string, slot: number, amount: number, price: number, stamp?:string): { listingId: string } {
    positiveInteger(price, MAX_GOLD);
    return this.once(id, request, "list", { slot, amount, price, ...(stamp===undefined?{}:{stamp}) }, () => {
      const count=this.db.prepare("SELECT COUNT(*) AS total FROM listings WHERE seller=? AND state='open'").get(id);
      if (typeof count?.total !== "number" || count.total>=20) throw new Error("listing_limit");
      const seller=this.account(id),item=seller.inventory.slots[slot];
      if(item && !matchesGearStamp(seller.inventory,item.itemId,item.forge,stamp))throw Error("item_unavailable");
      const removed=take(seller.inventory,slot,amount);
      seller.inventory = removed.inventory; this.put(id, seller);
      const listingId = randomUUID();
      this.db.prepare("INSERT INTO listings(id,seller,item,price,state) VALUES(?,?,?,?,?)").run(listingId,id,JSON.stringify(removed.item),price,"open");
      return { listingId };
    });
  }
  cancel(id: string, request: string, listingId: string): { listingId: string } {
    return this.once(id, request, "cancel", { listingId }, () => {
      const row = this.db.prepare("SELECT seller,item,state FROM listings WHERE id=?").get(listingId);
      if (!row || row.seller !== id || row.state !== "open") throw new Error("listing_unavailable");
      const seller = this.account(id);
      seller.inventory = add(seller.inventory, JSON.parse(String(row.item)) as InventoryStack);
      this.put(id, seller); this.db.prepare("UPDATE listings SET state='cancelled' WHERE id=?").run(listingId);
      return { listingId };
    });
  }
  buy(id: string, request: string, listingId: string): { listingId: string } {
    return this.once(id, request, "buy", { listingId }, () => {
      const row = this.db.prepare("SELECT seller,seller_guild,item,price,state FROM listings WHERE id=?").get(listingId);
      if (!row || row.state !== "open" || typeof row.price !== "number") throw new Error("listing_unavailable");
      if (row.seller === id) throw new Error("cannot_buy_own_listing");
      const buyer = this.account(id);
      if (buyer.gold < row.price) throw new Error("insufficient_gold");
      buyer.inventory = add(buyer.inventory, JSON.parse(String(row.item)) as InventoryStack);
      buyer.gold -= row.price;
      this.put(id,buyer);
      if (typeof row.seller === "string") {
        const seller = this.account(row.seller);
        seller.gold += row.price;
        this.put(row.seller,seller);
      } else if (typeof row.seller_guild === "string") this.city.creditSale(listingId, row.seller_guild, row.price);
      else throw Error("listing_unavailable");
      this.db.prepare("UPDATE listings SET state='sold' WHERE id=?").run(listingId);
      return { listingId };
    });
  }
  /** Caller must first establish consent from both parties and freeze both actors. */
  trade(a: string, b: string, request: string, offerA: TradeOffer, offerB: TradeOffer): { request: string } {
    if (a === b) throw new Error("invalid_trade");
    characterId(b); goldAmount(offerA.gold); goldAmount(offerB.gold);
    return this.once(a, request, "trade", { b, offerA, offerB }, () => {
      const left = this.account(a), right = this.account(b);
      if (left.gold < offerA.gold || right.gold < offerB.gold) throw new Error("insufficient_gold");
      if ((offerA.slot === null) !== (offerA.amount === 0) || (offerB.slot === null) !== (offerB.amount === 0)) throw new Error("invalid_trade");
      const aItem=offerA.slot === null ? null : take(left.inventory,offerA.slot,offerA.amount);
      const bItem=offerB.slot === null ? null : take(right.inventory,offerB.slot,offerB.amount);
      if (aItem) left.inventory=aItem.inventory;
      if (bItem) right.inventory=bItem.inventory;
      if (aItem) right.inventory=add(right.inventory,aItem.item);
      if (bItem) left.inventory=add(left.inventory,bItem.item);
      left.gold = left.gold - offerA.gold + offerB.gold;
      right.gold = right.gold - offerB.gold + offerA.gold;
      this.put(a,left); this.put(b,right);
      return { request };
    });
  }
}
