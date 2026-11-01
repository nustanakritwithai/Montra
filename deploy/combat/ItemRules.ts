/**
 * MONTRA V0.2.6 — strictly validated, server-owned item inventory.
 * Only Item ID and slot travel across the wire. The client can NEVER choose
 * item quantity, heal power, player HP, grant flag or an arbitrary item.
 */
export const INVENTORY_SLOT_COUNT = 12;
export const INVENTORY_STACK_LIMIT = 99;
export const POTION_ID = "health_potion" as const;
export const POTION_HEAL = 30;
export const STARTER_POTION_COUNT = 3;
export const POTION_COOLDOWN_MS = 1_000;

export type ItemId = typeof POTION_ID;
export type InventoryStack = { itemId: ItemId; quantity: number };
export type InventorySnapshot = { version: 1; slots: Array<InventoryStack | null> };
export type ItemUseResult =
  | { ok: true; inventory: InventorySnapshot; healed: number; hp: number; itemId: ItemId }
  | { ok: false; reason: "item_unavailable" | "hp_full" | "not_alive" };

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function makeStarterInventory(): InventorySnapshot {
  return {
    version: 1,
    slots: Array.from({ length: INVENTORY_SLOT_COUNT }, (_, slot) =>
      slot === 0 ? { itemId: POTION_ID, quantity: STARTER_POTION_COUNT } : null),
  };
}

/**
 * Validation never drops malformed item data. Corruption must reject the
 * entire login/write instead of restoring a free fresh starter inventory.
 */
export function validateInventory(value: unknown): InventorySnapshot {
  if (!record(value) || Object.keys(value).length !== 2 ||
      value.version !== 1 || !Array.isArray(value.slots) ||
      value.slots.length !== INVENTORY_SLOT_COUNT) {
    throw new Error("inventory_record_invalid");
  }
  const slots = value.slots.map((entry: unknown): InventoryStack | null => {
    if (entry === null) return null;
    if (!record(entry) || Object.keys(entry).length !== 2 ||
        entry.itemId !== POTION_ID ||
        !Number.isSafeInteger(entry.quantity) ||
        (entry.quantity as number) < 1 ||
        (entry.quantity as number) > INVENTORY_STACK_LIMIT) {
      throw new Error("inventory_record_invalid");
    }
    return { itemId: POTION_ID, quantity: entry.quantity as number };
  });
  return { version: 1, slots };
}

/** Browser sends {slot: 0}, not item grant, quantity, HP or heal amount. */
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
  // Always validate server-owned data before any mutation.
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
  if (hp >= maxHp) return { ok: false, reason: "hp_full" };
  const item = original.slots[slot]!;
  const healed = Math.min(POTION_HEAL, maxHp - hp);
  const slots = original.slots.slice();
  slots[slot] = item.quantity === 1
    ? null : { itemId: item.itemId, quantity: item.quantity - 1 };
  return {
    ok: true, healed, hp: hp + healed, itemId: item.itemId,
    inventory: { version: 1, slots },
  };
}
