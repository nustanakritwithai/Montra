import { readForged, type Forged } from "./ForgeRules.js";
import { personalItem, startingWeapon, firstChest, fieldItem, isBodySlot, equipPositions, type BodyItemId, type BodySlot, SALVE_ID, withEquipmentStats, type ChestId, type PracticeWeapon, type PersonalId, type MaterialId } from "./PersonalItems.js";
import { PROGRESSION, type CombatStats } from "./Progression.js";
import { MUAY_WRAP_ID } from "./MuayRules.js";
/**
 * MONTRA V0.2.7 — authoritative permanent equipment.
 * Existing v0.2.6 inventory JSON (version:1, slots:[...]) stays readable.
 * The optional equippedWeaponSlot is a one-time upgrade marker. No client
 * supplies stats, weapon IDs, grants, damage, or inventory mutations.
 */
export const INVENTORY_SLOT_COUNT = 12;
export const INVENTORY_STACK_LIMIT = 99;
export const POTION_ID = "health_potion" as const;
export const POTION_HEAL = 30;
export const STARTER_POTION_COUNT = 3;
export const POTION_COOLDOWN_MS = 1_000;

export const RITUAL_DAGGER_ID = "ritual_dagger" as const;
export const ARCANE_SWORD_ID = "arcane_sword" as const;
export const SPIRIT_STAFF_ID = "spirit_staff" as const;
export const STARTER_WEAPON_IDS = [
  RITUAL_DAGGER_ID, ARCANE_SWORD_ID, SPIRIT_STAFF_ID,
] as const;

export const SHRINE_SHARD = "shrine_shard" as const;
export const SHRINE_GLAIVE = "shrine_glaive" as const;
export const SHRINE_RECIPE = Object.freeze({
  id: "shrine_glaive", ingredient: SHRINE_SHARD, quantity: 1, gold: 100, output: SHRINE_GLAIVE,
  itemLevel: 12, rarity: "rare", meleeBonus: 10, pvpMeleeBonus: 8,
});
type LegacyWeapon = typeof STARTER_WEAPON_IDS[number] | typeof SHRINE_GLAIVE | typeof MUAY_WRAP_ID;
export type WeaponItemId = LegacyWeapon | PracticeWeapon;
export type StackableId = typeof POTION_ID | typeof SHRINE_SHARD | typeof SALVE_ID | MaterialId;
export function isStackableItem(value: unknown): value is StackableId {
  return value === POTION_ID || value === SHRINE_SHARD || value===SALVE_ID || personalItem(value)?.kind==="material";
}
export type ItemId = StackableId | WeaponItemId | BodyItemId;
export type InventoryStack = { itemId: ItemId; quantity: number; forge?: Forged; bound?:true };
export type InventorySnapshot = {
  version: 1;
  slots: Array<InventoryStack | null>;
  /** Missing only for a legacy V0.2.6 potion-only save; null = deliberately unequipped. */
  equippedWeaponSlot?: number | null;
  equipment?: Partial<Record<BodySlot,BodyItemId>>;
  firstChestClaimed?:true;
};
export type ItemUseResult =
  | { ok: true; inventory: InventorySnapshot; healed: number; hp: number; itemId: typeof POTION_ID | typeof SALVE_ID }
  | { ok: false; reason: "item_unavailable" | "hp_full" | "not_alive" | "not_consumable" };
export type EquipWeaponResult =
  | { ok: true; inventory: InventorySnapshot; weaponId: WeaponItemId | null }
  | { ok: false; reason: "item_unavailable" | "not_weapon" | "already_equipped" | "wrong_item_class" };

export const WEAPON_STATS: Readonly<Record<LegacyWeapon, Readonly<{
  meleeBonus: number; rangedBonus: number;
}>>> = Object.freeze({
  [RITUAL_DAGGER_ID]: Object.freeze({ meleeBonus: 4, rangedBonus: 0 }),
  [ARCANE_SWORD_ID]: Object.freeze({ meleeBonus: 8, rangedBonus: 0 }),
  [SPIRIT_STAFF_ID]: Object.freeze({ meleeBonus: 0, rangedBonus: 6 }),
  [SHRINE_GLAIVE]: Object.freeze({ meleeBonus: SHRINE_RECIPE.meleeBonus, rangedBonus: 0 }),
  [MUAY_WRAP_ID]: Object.freeze({ meleeBonus: 4, rangedBonus: 0 }),
});

export function legacyWeaponStats(id:WeaponItemId) {
  return Object.hasOwn(WEAPON_STATS,id) ? WEAPON_STATS[id as LegacyWeapon] : {meleeBonus:0,rangedBonus:0};
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isWeaponId(value: unknown): value is WeaponItemId {
  return value === SHRINE_GLAIVE || value === MUAY_WRAP_ID || STARTER_WEAPON_IDS.some(id => id === value) || personalItem(value)?.kind==="mainHand";
}

export function makeClassInventory(path:string):InventorySnapshot {
  const slots = new Array<InventoryStack|null>(INVENTORY_SLOT_COUNT).fill(null);
  slots[0]={itemId:POTION_ID,quantity:STARTER_POTION_COUNT};
  slots[1]={itemId:startingWeapon(path),quantity:1,bound:true};
  return {version:1,slots,equippedWeaponSlot:1,equipment:{}};
}

export function makeStarterInventory(): InventorySnapshot {
  // A typed allocation avoids TS7011 on Windows builds configured with
  // noImplicitAny=true and strictNullChecks=false. Every slot starts empty.
  const slots: Array<InventoryStack | null> =
    new Array<InventoryStack | null>(INVENTORY_SLOT_COUNT).fill(null);
  slots[0] = { itemId: POTION_ID, quantity: STARTER_POTION_COUNT };
  STARTER_WEAPON_IDS.forEach((weaponId, index) => {
    slots[index + 1] = { itemId: weaponId, quantity: 1 };
  });
  return { version: 1, slots, equippedWeaponSlot: 1 };
}

/** Exact-key, whitelist-only validation; malformed data fails closed. */
export function validateInventory(value: unknown): InventorySnapshot {
  if (!record(value) || !Array.isArray(value.slots) ||
      value.version !== 1 || value.slots.length !== INVENTORY_SLOT_COUNT) {
    throw new Error("inventory_record_invalid");
  }
  const keys = Object.keys(value);
  const upgraded = Object.prototype.hasOwnProperty.call(value, "equippedWeaponSlot");
  if (keys.some(key=>!["version","slots","equippedWeaponSlot","equippedChestSlot","equipment","firstChestClaimed"].includes(key)) ||
      (!upgraded && (Object.hasOwn(value,"equippedChestSlot") || Object.hasOwn(value,"equipment") || Object.hasOwn(value,"firstChestClaimed"))) ||
      (Object.hasOwn(value,"firstChestClaimed") && value.firstChestClaimed!==true)) {
    throw new Error("inventory_record_invalid");
  }
  const seenWeapons = new Set<ItemId>();
  const slots = value.slots.map((entry: unknown): InventoryStack | null => {
    if (entry === null) return null;
    if (!record(entry) || Object.keys(entry).some(key => !["itemId","quantity","forge","bound"].includes(key)) ||
        !Number.isSafeInteger(entry.quantity)) {
      throw new Error("inventory_record_invalid");
    }
    if (isStackableItem(entry.itemId)) {
      if (Object.hasOwn(entry,"bound") || Object.hasOwn(entry,"forge") || (entry.quantity as number) < 1 ||
          (entry.quantity as number) > INVENTORY_STACK_LIMIT) {
        throw new Error("inventory_record_invalid");
      }
      return { itemId: entry.itemId, quantity: entry.quantity as number };
    }
    const itemId=entry.itemId as ItemId;
    const body=equipPositions(personalItem(itemId)?.kind).length>0;
    if (!upgraded || (!isWeaponId(itemId) && !body) || (body && Object.hasOwn(entry,"forge")) ||
        (Object.hasOwn(entry,"bound") && (!personalItem(itemId) || entry.bound!==true)) ||
        entry.quantity!==1 || seenWeapons.has(itemId)) throw Error("inventory_record_invalid");
    seenWeapons.add(itemId);
    return {itemId,quantity:1,...(entry.bound===true ? {bound:true as const} : {}), ...(Object.hasOwn(entry,"forge") ? {forge:readForged(entry.forge)} : {})};
  });
  if (!upgraded) return { version: 1, slots };
  const selected = value.equippedWeaponSlot;
  if (selected !== null &&
      (!Number.isSafeInteger(selected) ||
       (selected as number) < 0 || (selected as number) >= INVENTORY_SLOT_COUNT ||
       !isWeaponId(slots[selected as number]?.itemId))) {
    throw new Error("inventory_record_invalid");
  }
  const result:InventorySnapshot={version:1,slots,equippedWeaponSlot:selected as number|null};
  if (Object.hasOwn(value,"equipment")) {
    if (!record(value.equipment))throw Error("inventory_record_invalid");
    result.equipment={};
    for (const [slot,id] of Object.entries(value.equipment)) {
      if (!isBodySlot(slot) || !equipPositions(personalItem(id)?.kind).includes(slot) ||
          seenWeapons.has(id as ItemId))throw Error("inventory_record_invalid");
      result.equipment[slot]=id as BodyItemId;
      seenWeapons.add(id as ItemId);
    }
  }
  // Read the chest-only trial snapshot once. Moving a worn piece frees its former bag slot.
  if (Object.hasOwn(value,"equippedChestSlot")) {
    const index=value.equippedChestSlot;
    if(index!==null){
      if (!Number.isSafeInteger(index) || personalItem(slots[index as number]?.itemId)?.kind!=="chest" || result.equipment?.chest)throw Error("inventory_record_invalid");
      result.equipment={...result.equipment,chest:slots[index as number]!.itemId as ChestId};
      slots[index as number]=null;
    }
  }
  if(value.firstChestClaimed===true)result.firstChestClaimed=true;
  return result;
}

/** Idempotent, one-time migration from a saved V0.2.6 potion-only bag. */
export function grantStarterWeapons(inventory: InventorySnapshot): InventorySnapshot {
  const original = validateInventory(inventory);
  if (original.equippedWeaponSlot !== undefined) return original;
  const slots = original.slots.slice();
  let firstSlot = -1;
  for (const weaponId of STARTER_WEAPON_IDS) {
    const free = slots.findIndex(slot => slot === null);
    if (free < 0) throw new Error("inventory_upgrade_no_space");
    slots[free] = { itemId: weaponId, quantity: 1 };
    if (firstSlot < 0) firstSlot = free;
  }
  return validateInventory({
    version: 1, slots, equippedWeaponSlot: firstSlot,
  });
}

/** Browser may only request a server-owned slot or null to unequip. */
export function parseEquipWeaponCommand(payload: unknown): {slot:number|null} | null {
  if (!record(payload) || Object.keys(payload).length !== 1) return null;
  if (payload.slot === null) return { slot: null };
  if (!Number.isSafeInteger(payload.slot)) return null;
  const slot = payload.slot as number;
  return slot >= 0 && slot < INVENTORY_SLOT_COUNT ? {slot} : null;
}
export function equipInventoryWeapon(
  inventory: InventorySnapshot, slot: number | null, path?:string,
): EquipWeaponResult {
  const previous = validateInventory(inventory);
  if (previous.equippedWeaponSlot === undefined) throw new Error("inventory_upgrade_required");
  if (slot === previous.equippedWeaponSlot) {
    return { ok: false, reason: "already_equipped" };
  }
  if (slot === null) return {
    ok: true, inventory: { ...previous, equippedWeaponSlot: null },
    weaponId: null,
  };
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= INVENTORY_SLOT_COUNT ||
      previous.slots[slot] === null) {
    return { ok: false, reason: "item_unavailable" };
  }
  const selected = previous.slots[slot]!;
  if (!isWeaponId(selected.itemId)) return { ok: false, reason: "not_weapon" };
  const definition=personalItem(selected.itemId);
  if (definition && definition.path!==path) return {ok:false,reason:"wrong_item_class"};
  if (definition) previous.slots[slot]={...selected,bound:true};
  return {
    ok: true,
    inventory: { ...previous, equippedWeaponSlot: slot },
    weaponId: selected.itemId,
  };
}

/** A worn body piece owns its equipment slot; it no longer consumes a bag cell. */
export function equipBody(inventory:InventorySnapshot,position:BodySlot,slot:number|null,expected:BodyItemId,path:string):
  EquipWeaponResult | {ok:false;reason:"inventory_full"|"equipment_changed"} {
  const next=validateInventory(inventory);
  const worn=next.equipment?.[position];
  const def=personalItem(expected);
  if (!def || !equipPositions(def.kind).includes(position))return {ok:false,reason:"equipment_changed"};
  const equipment={...next.equipment};
  if (slot===null) {
    if (worn!==expected)return {ok:false,reason:"equipment_changed"};
    const empty=next.slots.indexOf(null);
    if(empty<0)return {ok:false,reason:"inventory_full"};
    next.slots[empty]={itemId:worn,quantity:1,bound:true};
    delete equipment[position];
  } else {
    if(next.slots[slot]?.itemId!==expected)return {ok:false,reason:"equipment_changed"};
    if(def.path!=="all" && def.path!==path)return {ok:false,reason:"wrong_item_class"};
    next.slots[slot]=worn ? {itemId:worn,quantity:1,bound:true} : null;
    equipment[position]=expected;
  }
  next.equipment=equipment;
  return {ok:true,inventory:next,weaponId:equippedWeaponId(next)};
}

export function parseBodyCommand(message:unknown) {
  if(!record(message) || Object.keys(message).length!==3 || !isBodySlot(message.position) ||
      !equipPositions(personalItem(message.expected)?.kind).includes(message.position) ||
      (message.slot!==null && (!Number.isInteger(message.slot) || (message.slot as number)<0 || (message.slot as number)>=INVENTORY_SLOT_COUNT)))return null;
  return {slot:message.slot as number|null,position:message.position,expected:message.expected as BodyItemId};
}

export function equippedStats(base:CombatStats,bag:InventorySnapshot|undefined):CombatStats {
  if(!bag)return base;
  const result=withEquipmentStats(base,[equippedWeaponId(bag),...Object.values(bag.equipment??{})]);
  result.maxHp=Math.min(PROGRESSION.maxHp,result.maxHp);
  result.maxStamina=Math.min(PROGRESSION.maxStamina,result.maxStamina);
  return result;
}

export function practiceLoot(bag:InventorySnapshot,path:string):{bag:InventorySnapshot;id:PersonalId|null} {
  if(!bag.firstChestClaimed){
    const id=firstChest(path);
    if(bag.equipment?.chest!==id && !bag.slots.some(s=>s?.itemId===id)){
      const index=bag.slots.indexOf(null);
      if(index<0)return {bag,id:null};
      const slots=bag.slots.slice();
      slots[index]={itemId:id,quantity:1,bound:true};
      return {bag:{...bag,slots,firstChestClaimed:true},id};
    }
    bag={...bag,firstChestClaimed:true};
  }
  const owned=new Set<string>([...Object.values(bag.equipment??{}),...bag.slots.flatMap(stack=>stack?[stack.itemId]:[])]);
  const id=fieldItem(path,owned);
  if(isStackableItem(id)){
    const next=grantStackReward(bag,id);
    return {bag:next??bag,id:next?id:null};
  }
  const index=bag.slots.indexOf(null);
  if(index<0)return {bag,id:null};
  const slots=bag.slots.slice();
  slots[index]={itemId:id,quantity:1};
  return {bag:{...bag,slots},id};
}

/** Add a single reward, preferring an existing stack. A full bag is left intact. */
export function grantStackReward(inventory: InventorySnapshot, itemId: StackableId): InventorySnapshot | null {
  const slots = inventory.slots.slice();
  let index = slots.findIndex(stack => stack?.itemId === itemId && stack.quantity < INVENTORY_STACK_LIMIT);
  if (index < 0) index = slots.indexOf(null);
  if (index < 0) return null;
  slots[index] = {itemId, quantity: (slots[index]?.quantity ?? 0) + 1};
  return {...inventory, slots};
}
export function grantRewardPotion(inventory: InventorySnapshot): InventorySnapshot | null {
  return grantStackReward(inventory, POTION_ID);
}

export function equippedWeaponId(inventory: InventorySnapshot | undefined): WeaponItemId | null {
  if (!inventory || inventory.equippedWeaponSlot === undefined ||
      inventory.equippedWeaponSlot === null) return null;
  const item = inventory.slots[inventory.equippedWeaponSlot];
  return item && isWeaponId(item.itemId) ? item.itemId : null;
}
export function weaponBonuses(inventory: InventorySnapshot | undefined, mode: "pve" | "pvp" = "pve"):
  {melee: number; ranged: number} {
  const id = equippedWeaponId(inventory);
  const stats = id ? legacyWeaponStats(id) : null;
  const staff=id===SPIRIT_STAFF_ID || id==="wp_wand_1" || id==="wp_crook_1";
  const forge = mode === "pve" ? inventory?.slots[inventory.equippedWeaponSlot ?? -1]?.forge : undefined;
  const extra = forge?.rank ?? 0, affix = forge?.affix;
  const meleeBase = mode === "pvp" && id === SHRINE_GLAIVE ? SHRINE_RECIPE.pvpMeleeBonus : (stats?.meleeBonus ?? 0);
  return {
    melee: meleeBase + (id && !staff ? extra : 0) + (affix?.stat === "melee" ? affix.tier : 0),
    ranged: (stats?.rangedBonus ?? 0) + (staff ? extra : 0) + (affix?.stat === "ranged" ? affix.tier : 0),
  };
}

/** Browser sends {slot: 0}, not item ID, quantity, HP or heal amount. */
export function parseUseItemCommand(payload: unknown): number | null {
  if (!record(payload) || Object.keys(payload).length !== 1 ||
      !Number.isSafeInteger(payload.slot)) return null;
  const slot = payload.slot as number;
  return slot >= 0 && slot < INVENTORY_SLOT_COUNT ? slot : null;
}
export function useInventoryItem(
  inventory: InventorySnapshot, slot: number, hp: number,
  maxHp: number, alive: boolean,
): ItemUseResult {
  const original = validateInventory(inventory);
  if (!alive || hp <= 0 || !Number.isFinite(hp)) {
    return { ok: false, reason: "not_alive" };
  }
  if (!Number.isFinite(maxHp) || maxHp <= 0 || hp > maxHp) {
    throw new Error("invalid_authoritative_hp");
  }
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= INVENTORY_SLOT_COUNT ||
      original.slots[slot] === null) {
    return { ok: false, reason: "item_unavailable" };
  }
  const item = original.slots[slot]!;
  if (item.itemId !== POTION_ID && item.itemId!==SALVE_ID) return { ok: false, reason: "not_consumable" };
  if (hp >= maxHp) return { ok: false, reason: "hp_full" };
  const healed = Math.min(item.itemId===SALVE_ID ? 22 : POTION_HEAL, maxHp - hp);
  const slots = original.slots.slice();
  slots[slot] = item.quantity === 1
    ? null : { itemId: item.itemId, quantity: item.quantity - 1 };
  return {
    ok: true, healed, hp: hp + healed, itemId: item.itemId,
    inventory: { ...original, slots },
  };
}
