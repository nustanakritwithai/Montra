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
import path from "node:path";

export const CHARACTER_SAVE_INTERVAL_MS = 15_000;
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

export function characterIdFromToken(token: string): string {
  if (!TOKEN_PATTERN.test(token)) throw new Error("invalid_character_token");
  return createHash("sha256").update(token, "utf8").digest("hex");
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
  return value as CharacterSnapshot;
}

export class CharacterStore {
  private readonly writes = new Map<string, Promise<void>>();
  constructor(readonly directory: string = process.env.MONTRA_CHARACTER_DIR ||
    path.resolve(process.cwd(), "data", "characters")) {}

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

  async loadOrCreate(token: string, spawn: SpawnPoint): Promise<{ character: CharacterSnapshot; created: boolean }> {
    const id = characterIdFromToken(token);
    try {
      const stored = JSON.parse(await readFile(this.location(id), "utf8")) as unknown;
      return { character: validateSnapshot(stored, id), created: false };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const fresh: CharacterSnapshot = {
      version: 1, id, name: "นักเดินทาง", level: 1, experience: 0,
      pkKills: 0, pkDeaths: 0, x: spawn.x, y: 0, z: spawn.z, hp: 100,
      updatedAt: new Date().toISOString(),
    };
    // A new character must already exist on disk before joining the world.
    // Never silently turn a read/corruption/disk error into a reset character.
    await this.atomicWrite(fresh);
    return { character: fresh, created: true };
  }

  async save(character: CharacterSnapshot): Promise<void> {
    const snapshot = validateSnapshot(character, character.id);
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

export const characterStore = new CharacterStore();
