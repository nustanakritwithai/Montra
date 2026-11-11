import {isPotGhost, type PotGhost} from "./LegacyGhostPot.js";

export const GHOST_POOL_CAPACITY = 100;
const SLOT_COUNT = 3;

export type GhostPool = {
  collection: PotGhost[];
  slots: Array<string | null>;
  selectedSlot: number;
  revision: number;
};

type Placement =
  | {action: "select"; slot: number; revision: number}
  | {action: "assign"; slot: number; instanceId: string; revision: number}
  | {action: "reserve"; instanceId: string; revision: number};
export type GhostCombatCommand =
  | {action: "attack"; combatId: string; targetId: string}
  | {action: "follow"; combatId: string};
export type GhostSkillCommand = {action: "skill"; combatId: string; targetId: string; skillId: string};
export type GhostCommand = Placement
  | GhostCombatCommand | GhostSkillCommand
  | {action: "read" | "summon" | "recall" | "switch"}
  | {action: "capture"; targetId: string};

function isSlot(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < SLOT_COUNT;
}
function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function isInstanceId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f-]{36}$/.test(value);
}
function isTargetId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 96;
}

export function parseGhostTargetCommand(message: unknown) {
  if (!message || typeof message !== "object" || Array.isArray(message) || Object.keys(message).length !== 1 ||
      !Object.hasOwn(message, "targetId")) return null;
  const {targetId} = message as {targetId?: unknown};
  return typeof targetId === "string" && /^ghost:[A-Za-z0-9_-]{6,64}:[0-9a-f-]{36}$/.test(targetId) ? {targetId} : null;
}

export function parseGhostCommand(message: unknown): GhostCommand | null {
  if (!message || typeof message !== "object" || Array.isArray(message)) return null;
  const input = message as Record<string, unknown>;
  const count = Object.keys(input).length;
  switch (input.action) {
    case "read": case "summon": case "recall": case "switch":
      return count === 1 ? {action: input.action} : null;
    case "capture":
      return count === 2 && isTargetId(input.targetId) ? {action: "capture", targetId: input.targetId} : null;
    case "attack":
      return count === 3 && isInstanceId(input.combatId) && isTargetId(input.targetId)
        ? {action: "attack", combatId: input.combatId, targetId: input.targetId} : null;
    case "skill":
      return count === 4 && isInstanceId(input.combatId) && isTargetId(input.targetId) &&
        typeof input.skillId === "string" && /^SK_[A-Z0-9_]{1,32}$/.test(input.skillId)
        ? {action: "skill", combatId: input.combatId, targetId: input.targetId, skillId: input.skillId} : null;
    case "follow":
      return count === 2 && isInstanceId(input.combatId) ? {action: "follow", combatId: input.combatId} : null;
    case "select":
      return count === 3 && isSlot(input.slot) && isRevision(input.revision)
        ? {action: "select", slot: input.slot, revision: input.revision} : null;
    case "assign":
      return count === 4 && isSlot(input.slot) && isInstanceId(input.instanceId) && isRevision(input.revision)
        ? {action: "assign", slot: input.slot, instanceId: input.instanceId, revision: input.revision} : null;
    case "reserve":
      return count === 3 && isInstanceId(input.instanceId) && isRevision(input.revision)
        ? {action: "reserve", instanceId: input.instanceId, revision: input.revision} : null;
    default: return null;
  }
}

export function isGhostPool(value: unknown): value is GhostPool {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const {collection, slots, selectedSlot, revision} = value as Partial<GhostPool>;
  if (Object.keys(value).length !== 4 || !isSlot(selectedSlot) || !isRevision(revision) ||
      !Array.isArray(collection) || collection.length > GHOST_POOL_CAPACITY || !collection.every(isPotGhost) ||
      !Array.isArray(slots) || slots.length !== SLOT_COUNT) return false;
  const owned = new Set(collection.map(ghost => ghost.instanceId));
  const assigned = slots.filter(id => id !== null);
  return owned.size === collection.length && new Set(assigned).size === assigned.length &&
    assigned.every(id => typeof id === "string" && owned.has(id));
}

export function makeGhostPool(legacy?: PotGhost): GhostPool {
  return {collection: legacy ? [legacy] : [], slots: [legacy?.instanceId ?? null, null, null], selectedSlot: 0, revision: 0};
}

export function findPoolGhost(pool: GhostPool, id: string | null | undefined) {
  return pool.collection.find(ghost => ghost.instanceId === id);
}

export function addCapturedGhost(pool: GhostPool, ghost: PotGhost): GhostPool {
  const slots = [...pool.slots];
  const free = slots.indexOf(null);
  if (free >= 0) slots[free] = ghost.instanceId;
  return {...pool, collection: [...pool.collection, ghost], slots, revision: pool.revision + 1};
}

export function placePoolGhost(pool: GhostPool, command: Placement, activeId?: string):
  {pool: GhostPool; status: "placed" | "selected" | "ready" | "stale" | "slot_empty" | "not_owned" | "active_locked"} {
  if (command.revision !== pool.revision) return {pool, status: "stale"};
  if (command.action === "select") {
    if (!pool.slots[command.slot]) return {pool, status: "slot_empty"};
    if (command.slot === pool.selectedSlot) return {pool, status: "ready"};
    return {pool: {...pool, selectedSlot: command.slot, revision: pool.revision + 1}, status: "selected"};
  }
  if (!findPoolGhost(pool, command.instanceId)) return {pool, status: "not_owned"};
  const oldSlot = pool.slots.indexOf(command.instanceId);
  const slots = [...pool.slots];
  let selectedSlot = pool.selectedSlot;
  if (command.action === "reserve") {
    if (oldSlot < 0) return {pool, status: "ready"};
    if (command.instanceId === activeId) return {pool, status: "active_locked"};
    slots[oldSlot] = null;
  } else {
    if (oldSlot === command.slot) return {pool, status: "ready"};
    if (slots[command.slot] === activeId) return {pool, status: "active_locked"};
    if (oldSlot >= 0) slots[oldSlot] = null;
    slots[command.slot] = command.instanceId;
    if (oldSlot === selectedSlot) selectedSlot = command.slot;
  }
  if (!slots[selectedSlot]) selectedSlot = Math.max(0, slots.findIndex(id => id !== null));
  return {pool: {...pool, slots, selectedSlot, revision: pool.revision + 1}, status: "placed"};
}
