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
import { makeClassInventory, makeStarterInventory, grantStarterWeapons, validateInventory, type InventorySnapshot } from "./ItemRules.js";
import { DEFAULT_MAP_ID, getWorldMap } from "./WorldMaps.js";
import {CASTLE_ID} from "./CastlePilot.js";
import { emptyAllocations, PROGRESSION, validateAllocations, type Allocations } from "./Progression.js";
import { EconomyStore } from "./EconomyStore.js";
import { validateSwordTree, type SwordTree } from "./SkillCatalog.js";
import { validateMuayBook, validateMuayCooldowns, type MuayBook, type MuayCooldowns } from "./MuayRules.js";
import { MUAY_WRAP_ID } from "./MuayRules.js";
import { validateOccultBook, type OccultBook } from "./OccultRules.js";
import { validateBladeBook, type BladeBook } from "./BladeRules.js";
import { validateSentinelBook, type SentinelBook } from "./SentinelRules.js";

import { parseBuild, type CharacterBuild } from "./CharacterBuilds.js";

export const CHARACTER_SAVE_INTERVAL_MS = 15_000;
export const CHARACTER_SLOTS = [1, 2, 3] as const;
export type CharacterSlot = typeof CHARACTER_SLOTS[number];
export type SlotSummary = { slot: CharacterSlot; occupied: boolean; name: string; level: number; path?: string; unavailable?: boolean };
export type CharacterSetup = { name?: unknown; build?: unknown };
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
  castleLayout?: 2;
  statAllocations?: Allocations;
  build?: CharacterBuild;
  classSkillReadyAt?: number;
  talismanReadyAt?: number;
  swordTree?: SwordTree;
  muayWrapGranted?: boolean;
  muayCooldowns?: MuayCooldowns;
  muayBook?: MuayBook;
  occultBook?: OccultBook;
  bladeBook?: BladeBook;
  sentinelBook?: SentinelBook;
  stamina?: number;
  mana?: number;
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
function isCoordinate(value: unknown, min=-100, max=100): value is number {
  return typeof value === "number" && Number.isFinite(value) && value>=min && value<=max;
}

function validateSnapshot(value: unknown, id: string): CharacterSnapshot {
  if (!isRecord(value))throw new Error("character_record_invalid");
  const bounds=typeof value.mapId==="string"?getWorldMap(value.mapId)?.bounds:undefined;
  // Existing snapshots used a symmetric envelope, including when the castle pilot is disabled.
  const legacy=value.mapId===CASTLE_ID ? (value.castleLayout===2?350:1000) : 100;
  if (value.version !== 1 || value.id !== id || (value.castleLayout!==undefined && value.castleLayout!==2) ||
      typeof value.name !== "string" || parseCharacterName({ name: value.name }) !== value.name ||
      !isCount(value.level) || value.level < 1 || value.level > 1000 ||
      !isCount(value.experience) || !isCount(value.pkKills) || !isCount(value.pkDeaths) ||
      !isCoordinate(value.x,Math.min(-legacy,bounds?.minX??0),Math.max(legacy,bounds?.maxX??0)) || !isCoordinate(value.y) ||
      !isCoordinate(value.z,Math.min(-legacy,bounds?.minZ??0),Math.max(legacy,bounds?.maxZ??0)) ||
      !isCount(value.hp) || value.hp > 100_000 ||
      typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new Error("character_record_invalid");
  }
  if (value.build !== undefined && !parseBuild(value.build)) throw new Error("invalid_character_build");
  for (const readyAt of [value.classSkillReadyAt, value.talismanReadyAt]) {
    if (readyAt !== undefined && (typeof readyAt !== "number" || !Number.isSafeInteger(readyAt) || readyAt < 0)) throw new Error("invalid_skill_cooldown");
  }
  const swordTree = value.swordTree === undefined ? undefined : validateSwordTree(value.swordTree, value.level as number);
  if (value.muayWrapGranted !== undefined && typeof value.muayWrapGranted !== "boolean") throw new Error("invalid_muay_grant");
  const muayCooldowns = value.muayCooldowns === undefined ? undefined : validateMuayCooldowns(value.muayCooldowns);
  const muayBook = value.muayBook === undefined ? undefined : validateMuayBook(value.muayBook,value.level as number);
  const occultBook = value.occultBook === undefined ? undefined : validateOccultBook(value.occultBook,value.level as number);
  const bladeBook = value.bladeBook === undefined ? undefined : validateBladeBook(value.bladeBook,value.level as number);
  const sentinelBook = value.sentinelBook === undefined ? undefined : validateSentinelBook(value.sentinelBook,value.level as number);
  if (value.inventory !== undefined) validateInventory(value.inventory);
  const statAllocations = value.statAllocations === undefined ? emptyAllocations() :
    validateAllocations(value.statAllocations, value.level as number);
  if (value.stamina !== undefined && (typeof value.stamina !== "number" || !Number.isFinite(value.stamina) || value.stamina < 0 || value.stamina > PROGRESSION.maxStamina)) {
    throw new Error("invalid_character_stamina");
  }
  if (value.mana !== undefined && (typeof value.mana !== "number" || !Number.isFinite(value.mana) || value.mana < 0 || value.mana > PROGRESSION.maxMana)) {
    throw new Error("invalid_character_mana");
  }
  if(value.mapId===CASTLE_ID && !getWorldMap(CASTLE_ID)){
    const exit=getWorldMap("fallen_city") ?? getWorldMap(DEFAULT_MAP_ID)!;
    return {...(value as CharacterSnapshot),...exit.spawn,mapId:exit.id,statAllocations,swordTree,muayCooldowns,muayBook,occultBook,bladeBook,sentinelBook};
  }
  if (value.mapId !== undefined &&
      (typeof value.mapId !== "string" || !getWorldMap(value.mapId))) {
    throw new Error("unknown_character_map");
  }
  // Only unmarked castle saves use the previous 2 km coordinate system.
  const location=value.mapId===CASTLE_ID && value.castleLayout===undefined
    ? {x:value.x*35/100,z:value.z*35/100,castleLayout:2 as const} : {};
  return { ...(value as CharacterSnapshot), ...location, mapId: (value.mapId as string | undefined) ?? DEFAULT_MAP_ID, statAllocations, swordTree, muayCooldowns, muayBook, occultBook, bladeBook, sentinelBook };
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
    return this.loadOrCreateById(id, spawn);
  }

  /** IDs belong to an authenticated account; never accept an arbitrary client-supplied ID. */
  async loadOrCreateById(id: string, spawn: SpawnPoint, setup?: CharacterSetup, requireBuild = false): Promise<{ character: CharacterSnapshot; created: boolean }> {
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("invalid_character_id");
    this.guardLegacyMode();
    if (this.economyEnabled) {
      const saved = this.economy.getCharacter(id);
      if (saved !== null) return { character: await this.prepareAdmission(validateSnapshot(saved, id), false, setup, requireBuild), created: false };
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
        return { character: await this.prepareAdmission(previous, false, setup, requireBuild), created: false };
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
      return { character: await this.prepareAdmission(migrated, false, setup, requireBuild), created: false };
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
    const prepared = await this.prepareAdmission(fresh, true, setup, requireBuild);
    if (this.economyEnabled) await this.save(prepared); else await this.atomicWrite(prepared);
    return { character: prepared, created: true };
  }

  private async prepareAdmission(character: CharacterSnapshot, fresh: boolean, setup: CharacterSetup | undefined, required: boolean): Promise<CharacterSnapshot> {
    if (!required) return character;
    // A legacy character may have chosen Muay while its bag was full. Retry
    // the one-time starter grant on a later login without replacing any item.
    if (character.build) {
      if (character.build.path !== "muay_boran" || character.muayWrapGranted || !character.inventory) return character;
      const slots = character.inventory.slots.slice(), existing = slots.findIndex(item => item?.itemId === MUAY_WRAP_ID);
      const index = existing >= 0 ? existing : slots.findIndex(item => item === null);
      if (index < 0) return character;
      if (existing < 0) slots[index] = {itemId:MUAY_WRAP_ID, quantity:1};
      const granted = {...character,inventory:{...character.inventory,slots},muayWrapGranted:true,updatedAt:new Date().toISOString()};
      await this.save(granted);
      return granted;
    }
    const build = parseBuild(setup?.build);
    const name = fresh ? parseCharacterName({name:setup?.name}) : character.name;
    if (!build || !name) throw new Error("character_setup_required");
    let inventory = character.inventory!;
    let muayWrapGranted = character.muayWrapGranted;
    if (fresh) {
      inventory=makeClassInventory(build.path);
      if (build.path==="muay_boran")muayWrapGranted=true;
    } else if (build.path === "muay_boran") {
      const slots = inventory.slots.slice(), existing = slots.findIndex(item => item?.itemId === MUAY_WRAP_ID);
      const index = existing >= 0 ? existing : slots.findIndex(item => item === null);
      if (index >= 0) {
        if (existing < 0) slots[index] = {itemId:MUAY_WRAP_ID, quantity:1};
        inventory = {...inventory, slots};
        muayWrapGranted = true;
      }
    }
    const prepared = {...character, name, build, inventory, ...(muayWrapGranted ? {muayWrapGranted:true} : {}), updatedAt:new Date().toISOString()};
    if (!fresh) await this.save(prepared);
    return prepared;
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
        return { slot, occupied: true, name: record.name, level: record.level, path: record.build?.path };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { slot, occupied: false, name: "", level: 0 };
        }
        // If a slot has a corrupt record, hide its data; never overwrite it.
        return { slot, occupied: true, name: "", level: 0, unavailable: true };
      }
    }));
  }

  /** Called only after the account mapping was retired while the account lease is held. */
  async eraseCharacter(id:string):Promise<void> {
    this.guardLegacyMode();
    if(this.economyEnabled)this.economy.eraseCharacter(id);
    try { await unlink(this.location(id)); }
    catch(error) { if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error; }
  }

  async save(character: CharacterSnapshot): Promise<void> {
    const snapshot = validateSnapshot(character.mapId===CASTLE_ID ? {...character,castleLayout:2} : character, character.id);
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
