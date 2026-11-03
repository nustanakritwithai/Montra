import { FORGE_CATALOG, forgeStamp, quoteForge, rollForge, birthForge, plainForge, rerollIngredient, type ForgeAction } from "./ForgeRules.js";
import { changeCardSocket, DRILL_COST, type SocketOrder } from "./CardSockets.js";
import {resourceNodes,resourceStock,rawResource,GATHER_DELAY,REFINE_INPUT,type ResourceNode,type ResourceStock} from "./WorldResources.js";
import {WORLD_MAPS} from "./WorldMaps.js";
/** Single-process transactional economy. This store must own inventories before it is wired to gameplay. */
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { personalItem, type BodySlot, type BodyItemId, type PersonalId } from "./PersonalItems.js";
import { SHRINE_RECIPE, bankForgeCopy, gearCounts, isSocketGear, isStackableItem, matchesGearStamp, validateInventory, type InventorySnapshot, type InventoryStack, type WeaponItemId } from "./ItemRules.js";
import type {SalvageOrder} from "./EconomyRules.js";

export const STARTER_GOLD = 1000;
const MAX_GOLD = 1_000_000_000;
type Account = { gold: number; inventory: InventorySnapshot };
type Listing = { id: string; seller: string; item: InventoryStack; price: number; state: string };
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

function consume(account:Account,item:string,qty:number){
  for(const [slot,stack] of account.inventory.slots.entries()){
    if(stack?.itemId!==item)continue;
    const used=Math.min(qty,stack.quantity);
    account.inventory=take(account.inventory,slot,used).inventory;
    qty-=used;
    if(!qty)return;
  }
  throw Error("craft_missing_material");
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
  constructor(file:string,private readonly forgeDraw?:()=>number) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, gold INTEGER NOT NULL, inventory TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY, seller TEXT NOT NULL REFERENCES accounts(id), item TEXT NOT NULL, price INTEGER NOT NULL, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(request_id TEXT PRIMARY KEY, actor TEXT NOT NULL, kind TEXT NOT NULL, intent TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS resource_stock(map TEXT NOT NULL,node TEXT NOT NULL,stock INTEGER NOT NULL,nextAt INTEGER NOT NULL,PRIMARY KEY(map,node));
      CREATE TABLE IF NOT EXISTS resource_workers(actor TEXT PRIMARY KEY,lastAt INTEGER NOT NULL);
    `);
  }
  close(): void { this.db.close(); }
  resourceMap(mapId:string,now=Date.now()){
    const rows=this.db.prepare("SELECT node,stock,nextAt FROM resource_stock WHERE map=?").all(mapId);
    const stocks=new Map(rows.map(row=>[String(row.node),{stock:Number(row.stock),nextAt:Number(row.nextAt)}]));
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
      const row=this.db.prepare("SELECT stock,nextAt FROM resource_stock WHERE map=? AND node=?").get(n.mapId,n.id);
      const s=resourceStock(n,row as ResourceStock|undefined,now);
      if(!s.stock)throw Error("resource_empty");
      const account=this.account(actor),item=rawResource(n);
      const tools=account.inventory.slots.map(s=>personalItem(s?.itemId));
      const equipped=tools.find(t=>t?.harvestKind===n.kind && t.level!<=playerLevel && t.toolTier!>=n.tier);
      const space=account.inventory.slots.reduce((sum,s)=>sum+(s===null?99:s.itemId===item?99-s.quantity:0),0);
      if(!space)throw Error("inventory_full");
      const quantity=Math.min(equipped?2:1,s.stock,space);
      account.inventory=add(account.inventory,{itemId:item,quantity});this.put(actor,account);
      let nextAt=s.nextAt||now+n.period;
      if(s.stock===quantity){
        const region=this.resourceMap(n.mapId,now);
        if((region.available-quantity)*4<=region.capacity)nextAt+=Math.round(n.period*.25);
      }
      this.db.prepare("INSERT OR REPLACE INTO resource_stock VALUES(?,?,?,?)").run(n.mapId,n.id,s.stock-quantity,nextAt);
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
  private put(id: string, account: Account): void {
    goldAmount(account.gold);
    this.db.prepare("UPDATE accounts SET gold=?, inventory=? WHERE id=?").run(account.gold, JSON.stringify(validateInventory(account.inventory)), id);
    const row = this.db.prepare("SELECT snapshot FROM characters WHERE id=?").get(id);
    if (row && typeof row.snapshot === "string") {
      const snapshot = JSON.parse(row.snapshot) as Record<string, unknown>;
      snapshot.inventory = account.inventory;
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
    return Boolean(this.db.prepare("SELECT 1 FROM listings WHERE seller=? AND state='open' LIMIT 1").get(id));
  }
  /** A character cannot be retired while another player can buy its listings. */
  eraseCharacter(id:string):void {
    characterId(id);
    this.transaction(()=>{
      if(this.hasOpenListings(id))throw new Error("character_has_listings");
      this.db.prepare("DELETE FROM listings WHERE seller=?").run(id);
      this.db.prepare("DELETE FROM receipts WHERE actor=?").run(id);
      this.db.prepare("DELETE FROM characters WHERE id=?").run(id);
      this.db.prepare("DELETE FROM accounts WHERE id=?").run(id);
    });
  }
  list(id?: string): Listing[] {
    if (id !== undefined) characterId(id);
    const latest=this.db.prepare("SELECT id,seller,item,price,state FROM listings WHERE state='open' ORDER BY rowid DESC LIMIT 100").all();
    const own=id ? this.db.prepare("SELECT id,seller,item,price,state FROM listings WHERE state='open' AND seller=? ORDER BY rowid DESC").all(id) : [];
    const seen=new Set<string>();
    return [...own,...latest].filter(row=>{const key=String(row.id); if (seen.has(key)) return false; seen.add(key); return true;}).map(row => ({
      id: String(row.id), seller: String(row.seller), item: JSON.parse(String(row.item)) as InventoryStack,
      price: Number(row.price), state: String(row.state),
    }));
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
      const account=this.account(id),cost=def.craftGold!;
      if(account.gold<cost)throw Error("insufficient_gold");
      for(const ingredient of def.recipe!)consume(account,ingredient.item,ingredient.qty);
      const forge=birthForge(output);
      const received=receiveCraft(account.inventory,{itemId:output,quantity:1,...(forge?{forge}:{})});
      account.inventory=received.inventory;
      account.gold-=cost;
      this.put(id,account);
      return {itemId:output,spentGold:cost,banked:received.banked};
    });
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

  forgeWeapon(id:string,request:string,slot:number|BodySlot,stamp:string,action:ForgeAction,level=1,donor?:{slot:number;stamp:string},expectedCopies?:number,acceptBreak=false) {
    return this.once(id,request,"forge",{slot,stamp,action,...(donor?{donor}:{}),...(expectedCopies!==undefined?{copies:expectedCopies}:{}),...(acceptBreak?{acceptBreak}:{})},()=>{
      const account=this.account(id), bag=account.inventory;
      const worn=typeof slot==="string"?bag.equipment?.[slot]:undefined;
      const stack=typeof slot==="number"?bag.slots[slot]:worn?{itemId:worn,forge:bag.equipmentForges?.[slot]}:undefined;
      if(!stack || isStackableItem(stack.itemId) || forgeStamp(stack)!==stamp)throw Error("forge_item_changed");
      const def=personalItem(stack.itemId);
      if(level<(def?.level??1))throw Error("item_level_required");
      const {cost}=quoteForge(stack.forge,action,def?.level);
      if(account.gold<cost)throw Error("insufficient_gold");
      if(action==="enhance"){
        const {copies,breakOnFailure}=FORGE_CATALOG.enhanceSteps[stack.forge?.rank??0];
        if(breakOnFailure && !acceptBreak)throw Error("forge_risk_unconfirmed");
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
      const row = this.db.prepare("SELECT seller,item,price,state FROM listings WHERE id=?").get(listingId);
      if (!row || row.state !== "open" || typeof row.seller !== "string" || typeof row.price !== "number") throw new Error("listing_unavailable");
      if (row.seller === id) throw new Error("cannot_buy_own_listing");
      const buyer = this.account(id), seller = this.account(row.seller);
      if (buyer.gold < row.price) throw new Error("insufficient_gold");
      buyer.inventory = add(buyer.inventory, JSON.parse(String(row.item)) as InventoryStack);
      buyer.gold -= row.price; seller.gold += row.price;
      this.put(id,buyer); this.put(row.seller,seller);
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
