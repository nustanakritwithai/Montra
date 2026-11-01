/** Single-process transactional economy. This store must own inventories before it is wired to gameplay. */
import { DatabaseSync } from "node:sqlite";
import { createHash, randomUUID } from "node:crypto";
import { validateInventory, type InventorySnapshot, type InventoryStack } from "./ItemRules.js";

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
  const slots = original.slots.slice();
  slots[slot] = item.quantity === amount ? null : { ...item, quantity: item.quantity - amount };
  return { inventory: validateInventory({ ...original, slots }), item: { itemId: item.itemId, quantity: amount } };
}
function add(inventory: InventorySnapshot, item: InventoryStack): InventorySnapshot {
  const original = validateInventory(inventory), slots = original.slots.map(x => x ? { ...x } : null);
  let remaining = item.quantity;
  if (item.itemId === "health_potion") {
    for (const stack of slots) {
      if (stack?.itemId !== item.itemId || stack.quantity >= 99) continue;
      const amount = Math.min(remaining, 99 - stack.quantity);
      stack.quantity += amount; remaining -= amount;
      if (!remaining) break;
    }
  } else if (slots.some(stack => stack?.itemId === item.itemId)) {
    throw new Error("duplicate_weapon");
  }
  if (remaining) {
    const free = slots.findIndex(slot => slot === null);
    if (free < 0) throw new Error("inventory_full");
    slots[free] = { itemId: item.itemId, quantity: remaining };
  }
  return validateInventory({ ...original, slots });
}

export class EconomyStore {
  private readonly db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS accounts(id TEXT PRIMARY KEY, gold INTEGER NOT NULL, inventory TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY, seller TEXT NOT NULL REFERENCES accounts(id), item TEXT NOT NULL, price INTEGER NOT NULL, state TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(request_id TEXT PRIMARY KEY, actor TEXT NOT NULL, kind TEXT NOT NULL, intent TEXT NOT NULL, result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY, snapshot TEXT NOT NULL);
    `);
  }
  close(): void { this.db.close(); }
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
  listItem(id: string, request: string, slot: number, amount: number, price: number): { listingId: string } {
    positiveInteger(price, MAX_GOLD);
    return this.once(id, request, "list", { slot, amount, price }, () => {
      const count=this.db.prepare("SELECT COUNT(*) AS total FROM listings WHERE seller=? AND state='open'").get(id);
      if (typeof count?.total !== "number" || count.total>=20) throw new Error("listing_limit");
      const seller = this.account(id), removed = take(seller.inventory, slot, amount);
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
