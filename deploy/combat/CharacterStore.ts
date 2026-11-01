/**
 * MONTRA S2 — durable guest characters (server only).
 * Browser sends a 256-bit bearer token; ONLY a SHA-256 digest appears on disk.
 * No client-provided HP, position, levels, kills or experience are accepted.
 *
 * File-per-character snapshots keep the alpha self-contained on Windows VPS.
 * This store is single-process: multi-node deployment needs shared DB + leases.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeStarterInventory, grantStarterWeapons, validateInventory, type InventorySnapshot } from "./ItemRules.js";
import { DEFAULT_MAP_ID, getWorldMap } from "./WorldMaps.js";
import { emptyAllocations, PROGRESSION, validateAllocations, type Allocations } from "./Progression.js";
import { EconomyStore } from "./EconomyStore.js";

export const CHARACTER_SAVE_INTERVAL_MS = 15_000;
export const CHARACTER_SLOTS = [1, 2, 3] as const;
export type CharacterSlot = typeof CHARACTER_SLOTS[number];
export type SlotSummary = { slot: CharacterSlot; occupied: boolean; name: string; level: number; unavailable?: boolean };
export type SpawnPoint = { x: number; z: number };
export type CharacterSnapshot = {
  version: 1;
  id: string;
  name: string;
  level: number;
  experience: number;
  pkKills: number;
  pkDeaths: number;
  x: number;
  y: number;
  z: number;
  hp: number;
  /** Missing only in pre-world-map saves; they belong to the village. */
  mapId?: string;
  statAllocations?: Allocations;
  stamina?: number;
  /** Undefined only when loading a legacy S2/three-slot snapshot for migration. */
  inventory?: InventorySnapshot;
  updatedAt: string;
};
const TOKEN_PATTERN = /^mt1_[0-9a-f]{64}$/;
const MAX_COUNTER = 1_000_000_000;
const activeCharacters = new Map<string, string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function getGuestToken(options: unknown): string | null {
  if (!isRecord(options) || options.guestToken === undefined) return null;
  if (typeof options.guestToken !== "string" || !TOKEN_PATTERN.test(options.guestToken)) {
    throw new Error("invalid_character_token");
  }
  return options.guestToken;
}

export function parseCharacterSlot(options: unknown): CharacterSlot {
  const slot = isRecord(options) ? options.characterSlot : undefined;
  if (slot === undefined || slot === 1) return 1; // old S2 clients/saves stay in slot 1
  if (slot === 2 || slot === 3) return slot;
  throw new Error("invalid_character_slot");
}

/** Slot 1 preserves the exact S2 sha256(token) JSON filename. */
export function characterIdFromToken(token: string, slot: CharacterSlot = 1): string {
  if (!TOKEN_PATTERN.test(token)) throw new Error("invalid_character_token");
  if (!CHARACTER_SLOTS.includes(slot)) throw new Error("invalid_character_slot");
  const input = slot === 1 ? token : "MONTRA/CHARACTER-SLOT/v1/" + slot + "/" + token;
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function claimCharacter(id: string, sessionId: string): boolean {
  if (activeCharacters.has(id)) return false;
  activeCharacters.set(id, sessionId);
  return true;
}

export function releaseCharacter(id: string, sessionId: string): void {
  if (activeCharacters.get(id) === sessionId) activeCharacters.delete(id);
}

export function parseCharacterName(payload: unknown): string | null {
  if (!isRecord(payload) || Object.keys(payload).length !== 1 || typeof payload.name !== "string") return null;
  const name = payload.name.normalize("NFC").trim();
  const chars = Array.from(name);
  if (chars.length < 2 || chars.length > 20) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]*$/u.test(name)) return null;
  return name;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= 0 && value <= MAX_COUNTER;
}
function isCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= 100;
}

function validateSnapshot(value: unknown, id: string): CharacterSnapshot {
  if (!isRecord(value) || value.version !== 1 || value.id !== id ||
      typeof value.name !== "string" || parseCharacterName({ name: value.name }) !== value.name ||
      !isCount(value.level) || value.level < 1 || value.level > 1000 ||
      !isCount(value.experience) || !isCount(value.pkKills) || !isCount(value.pkDeaths) ||
      !isCoordinate(value.x) || !isCoordinate(value.y) || !isCoordinate(value.z) ||
      !isCount(value.hp) || value.hp > 100_000 ||
      typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new Error("character_record_invalid");
  }
  if (value.inventory !== undefined) validateInventory(value.inventory);
  const statAllocations = value.statAllocations === undefined ? emptyAllocations() :
    validateAllocations(value.statAllocations, value.level as number);
  if (value.stamina !== undefined && (typeof value.stamina !== "number" || !Number.isFinite(value.stamina) || value.stamina < 0 || value.stamina > PROGRESSION.maxStamina)) {
    throw new Error("invalid_character_stamina");
  }
  if (value.mapId !== undefined &&
      (typeof value.mapId !== "string" || !getWorldMap(value.mapId))) {
    throw new Error("unknown_character_map");
  }
  return { ...(value as CharacterSnapshot), mapId: (value.mapId as string | undefined) ?? DEFAULT_MAP_ID, statAllocations };
}

export class CharacterStore {
  private readonly writes = new Map<string, Promise<void>>();
  private economyDb: EconomyStore | undefined;
  // Resolve from the module location, not process.cwd(): a Windows service
  // can start Node from an unexpected directory after a machine restart.
  constructor(readonly directory: string = process.env.MONTRA_CHARACTER_DIR ||
    fileURLToPath(new URL("../../data/characters", import.meta.url)), readonly economyEnabled = false) {}

  get economy(): EconomyStore {
    if (!this.economyEnabled) throw new Error("economy_disabled");
    if (!this.economyDb) {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      this.economyDb = new EconomyStore(path.join(this.directory, "economy.sqlite"));
    }
    return this.economyDb;
  }
  close(): void { this.economyDb?.close(); this.economyDb = undefined; }
  private guardLegacyMode(): void {
    if (!this.economyEnabled && existsSync(path.join(this.directory, "economy.sqlite"))) throw new Error("economy_database_requires_economy_mode");
  }

  private location(id: string): string {
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("invalid_character_id");
    return path.join(this.directory, id + ".json");
  }

  private async atomicWrite(character: CharacterSnapshot): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const destination = this.location(character.id);
    const temporary = path.join(this.directory, "." + character.id + "." + randomUUID() + ".tmp");
    try {
      await writeFile(temporary, JSON.stringify(character) + "\n", { flag: "wx", mode: 0o600 });
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  async loadOrCreate(token: string, spawn: SpawnPoint, slot: CharacterSlot = 1): Promise<{ character: CharacterSnapshot; created: boolean }> {
    const id = characterIdFromToken(token, slot);
    this.guardLegacyMode();
    if (this.economyEnabled) {
      const saved = this.economy.getCharacter(id);
      if (saved !== null) return { character: validateSnapshot(saved, id), created: false };
    }
    let contents: string | undefined;
    try {
      contents = await readFile(this.location(id), "utf8");
    } catch (error) {
      // Only a missing INPUT file creates a new character. Any later
      // migration write error, even ENOENT, must FAIL CLOSED.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (contents !== undefined) {
      const previous = validateSnapshot(JSON.parse(contents) as unknown, id);
      if (previous.inventory?.equippedWeaponSlot !== undefined) {
        if (this.economyEnabled) await this.save(previous);
        return { character: previous, created: false };
      }
      // Legacy S2/0.2.5 without inventory gets 3 potions + 3 weapons once.
      // Existing V0.2.6 inventories get ONLY the three weapons: preserve
      // the EXACT potion stock, including zero, without duplicate grants.
      const migrated: CharacterSnapshot = {
        ...previous,
        inventory: previous.inventory
          ? grantStarterWeapons(previous.inventory)
          : makeStarterInventory(),
        updatedAt: new Date().toISOString(),
      };
      // Persist BEFORE admitting the character: on disk error, fail closed.
      await this.save(migrated);
      return { character: migrated, created: false };
    }
    const fresh: CharacterSnapshot = {
      version: 1, id, name: "นักเดินทาง", level: 1, experience: 0,
      pkKills: 0, pkDeaths: 0, x: spawn.x, y: 0, z: spawn.z, hp: PROGRESSION.baseHp, mapId: DEFAULT_MAP_ID,
      statAllocations: emptyAllocations(), stamina: PROGRESSION.baseStamina,
      inventory: makeStarterInventory(),
      updatedAt: new Date().toISOString(),
    };
    // A new character must already exist on disk before joining the world.
    // Never silently turn a read/corruption/disk error into a reset character.
    if (this.economyEnabled) await this.save(fresh); else await this.atomicWrite(fresh);
    return { character: fresh, created: true };
  }

  /** Read-only slot previews. Never create/delete saves while listing. */
  async listSlots(ids: readonly string[]): Promise<SlotSummary[]> {
    if (ids.length !== CHARACTER_SLOTS.length) throw new Error("invalid_slot_ids");
    this.guardLegacyMode();
    return await Promise.all(CHARACTER_SLOTS.map(async (slot, index): Promise<SlotSummary> => {
      try {
        const id = ids[index];
        const current = this.economyEnabled ? this.economy.getCharacter(id) : null;
        const record = validateSnapshot(current ?? JSON.parse(await readFile(this.location(id), "utf8")) as unknown, id);
        return { slot, occupied: true, name: record.name, level: record.level };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { slot, occupied: false, name: "", level: 0 };
        }
        // If a slot has a corrupt record, hide its data; never overwrite it.
        return { slot, occupied: true, name: "", level: 0, unavailable: true };
      }
    }));
  }

  async save(character: CharacterSnapshot): Promise<void> {
    const snapshot = validateSnapshot(character, character.id);
    this.guardLegacyMode();
    // Upgraded servers must never overwrite a real inventory with a legacy
    // HP-only snapshot, which would re-grant starter potions on next login.
    if (snapshot.inventory === undefined) throw new Error("inventory_record_missing");
    if (this.economyEnabled) {
      this.economy.saveCharacter(snapshot.id, snapshot, snapshot.inventory);
      return;
    }
    const previous = this.writes.get(snapshot.id) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => this.atomicWrite(snapshot));
    this.writes.set(snapshot.id, next);
    try {
      await next;
    } finally {
      if (this.writes.get(snapshot.id) === next) this.writes.delete(snapshot.id);
    }
  }
}

export const characterStore = new CharacterStore(undefined, process.env.MONTRA_ECONOMY_ENABLED === "1");
