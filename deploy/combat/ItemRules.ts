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

export type WeaponItemId = typeof STARTER_WEAPON_IDS[number];
export type ItemId = typeof POTION_ID | WeaponItemId;
export type InventoryStack = { itemId: ItemId; quantity: number };
export type InventorySnapshot = {
  version: 1;
  slots: Array<InventoryStack | null>;
  /** Missing only for a legacy V0.2.6 potion-only save; null = deliberately unequipped. */
  equippedWeaponSlot?: number | null;
};
export type ItemUseResult =
  | { ok: true; inventory: InventorySnapshot; healed: number; hp: number; itemId: typeof POTION_ID }
  | { ok: false; reason: "item_unavailable" | "hp_full" | "not_alive" | "not_consumable" };
export type EquipWeaponResult =
  | { ok: true; inventory: InventorySnapshot; weaponId: WeaponItemId | null }
  | { ok: false; reason: "item_unavailable" | "not_weapon" | "already_equipped" };

export const WEAPON_STATS: Readonly<Record<WeaponItemId, Readonly<{
  meleeBonus: number; rangedBonus: number;
}>>> = Object.freeze({
  [RITUAL_DAGGER_ID]: Object.freeze({ meleeBonus: 4, rangedBonus: 0 }),
  [ARCANE_SWORD_ID]: Object.freeze({ meleeBonus: 8, rangedBonus: 0 }),
  [SPIRIT_STAFF_ID]: Object.freeze({ meleeBonus: 0, rangedBonus: 6 }),
});

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isWeaponId(value: unknown): value is WeaponItemId {
  return STARTER_WEAPON_IDS.some(id => id === value);
}

export function makeStarterInventory(): InventorySnapshot {
  const slots: Array<InventoryStack | null> = Array.from(
    { length: INVENTORY_SLOT_COUNT }, () => null
  );
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
  if (keys.length !== (upgraded ? 3 : 2) ||
      keys.some(key => !["version", "slots", "equippedWeaponSlot"].includes(key))) {
    throw new Error("inventory_record_invalid");
  }
  const seenWeapons = new Set<WeaponItemId>();
  const slots = value.slots.map((entry: unknown): InventoryStack | null => {
    if (entry === null) return null;
    if (!record(entry) || Object.keys(entry).length !== 2 ||
        !Number.isSafeInteger(entry.quantity)) {
      throw new Error("inventory_record_invalid");
    }
    if (entry.itemId === POTION_ID) {
      if ((entry.quantity as number) < 1 ||
          (entry.quantity as number) > INVENTORY_STACK_LIMIT) {
        throw new Error("inventory_record_invalid");
      }
      return { itemId: POTION_ID, quantity: entry.quantity as number };
    }
    if (!upgraded || !isWeaponId(entry.itemId) ||
        entry.quantity !== 1 || seenWeapons.has(entry.itemId)) {
      throw new Error("inventory_record_invalid");
    }
    seenWeapons.add(entry.itemId);
    return { itemId: entry.itemId, quantity: 1 };
  });
  if (!upgraded) return { version: 1, slots };
  const selected = value.equippedWeaponSlot;
  if (selected !== null &&
      (!Number.isSafeInteger(selected) ||
       (selected as number) < 0 || (selected as number) >= INVENTORY_SLOT_COUNT ||
       !isWeaponId(slots[selected as number]?.itemId))) {
    throw new Error("inventory_record_invalid");
  }
  return { version: 1, slots, equippedWeaponSlot: selected as number | null };
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
  inventory: InventorySnapshot, slot: number | null,
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
  return {
    ok: true,
    inventory: { ...previous, equippedWeaponSlot: slot },
    weaponId: selected.itemId,
  };
}

export function equippedWeaponId(inventory: InventorySnapshot | undefined): WeaponItemId | null {
  if (!inventory || inventory.equippedWeaponSlot === undefined ||
      inventory.equippedWeaponSlot === null) return null;
  const item = inventory.slots[inventory.equippedWeaponSlot];
  return item && isWeaponId(item.itemId) ? item.itemId : null;
}
export function weaponBonuses(inventory: InventorySnapshot | undefined):
  {melee: number; ranged: number} {
  const id = equippedWeaponId(inventory);
  const stats = id ? WEAPON_STATS[id] : null;
  return { melee: stats?.meleeBonus ?? 0, ranged: stats?.rangedBonus ?? 0 };
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
  if (item.itemId !== POTION_ID) return { ok: false, reason: "not_consumable" };
  if (hp >= maxHp) return { ok: false, reason: "hp_full" };
  const healed = Math.min(POTION_HEAL, maxHp - hp);
  const slots = original.slots.slice();
  slots[slot] = item.quantity === 1
    ? null : { itemId: item.itemId, quantity: item.quantity - 1 };
  return {
    ok: true, healed, hp: hp + healed, itemId: POTION_ID,
    inventory: { ...original, slots },
  };
}
