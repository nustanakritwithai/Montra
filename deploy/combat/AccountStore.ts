/** Account identities are mapped to the existing character IDs, never to raw guest keys. */
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { CHARACTER_SLOTS, characterIdFromToken } from "./CharacterStore.js";

const SESSION_LIFETIME = 7 * 24 * 60 * 60 * 1000;
const USERNAME = /^[a-z0-9_]{3,24}$/;
const GUEST = /^mt1_[0-9a-f]{64}$/;
const SESSION = /^ms1_[0-9a-f]{64}$/;
const RECOVERY = /^mr1_[0-9a-f]{64}$/;
const hash = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const secret = (prefix: string) => prefix + randomBytes(32).toString("hex");

function usernameOf(value: unknown): string {
  if (typeof value !== "string") throw new Error("invalid_account_details");
  const username = value.trim().toLowerCase();
  if (!USERNAME.test(username)) throw new Error("invalid_account_details");
  return username;
}
function passwordOf(value: unknown): string {
  if (typeof value !== "string" || value.length < 15 || value.length > 128 || Buffer.byteLength(value, "utf8") > 256)
    throw new Error("invalid_account_details");
  return value;
}
async function passwordHash(password: string, salt: string): Promise<Buffer> {
  return await new Promise((resolve, reject) => scryptCallback(password, Buffer.from(salt, "hex"), 64,
    {N:32768, r:8, p:3, maxmem:64*1024*1024}, (error, value) => error ? reject(error) : resolve(value as Buffer)));
}

export type AccountIdentity = { accountId: string; characterIds: string[] };

/** SQLite store for a single MONTRA server; keep its database in the backed-up character directory. */
export class AccountStore {
  private readonly db: DatabaseSync;
  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE,
        salt TEXT NOT NULL, password_hash TEXT NOT NULL, recovery_hash TEXT NOT NULL UNIQUE);
      CREATE TABLE IF NOT EXISTS user_characters(user_id TEXT NOT NULL REFERENCES users(id),
        slot INTEGER NOT NULL CHECK(slot BETWEEN 1 AND 3), character_id TEXT NOT NULL UNIQUE,
        PRIMARY KEY(user_id, slot));
      CREATE TABLE IF NOT EXISTS sessions(session_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
        expires_at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);`);
  }
  close(): void { this.db.close(); }
  private transaction<T>(operation: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = operation(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  /** A supplied legacy key proves possession and preserves all existing IDs. */
  async register(user: unknown, pass: unknown, legacyKey?: unknown): Promise<{recoveryCode: string}> {
    const username = usernameOf(user), password = passwordOf(pass);
    if (legacyKey !== undefined && (typeof legacyKey !== "string" || !GUEST.test(legacyKey)))
      throw new Error("invalid_legacy_key");
    const guestKey = typeof legacyKey === "string" ? legacyKey : secret("mt1_");
    const characterIds = CHARACTER_SLOTS.map(slot => characterIdFromToken(guestKey, slot));
    const salt = randomBytes(16).toString("hex"), passwordDigest = (await passwordHash(password, salt)).toString("hex");
    const recoveryCode = secret("mr1_"), userId = randomUUID();
    this.transaction(() => {
      if (this.db.prepare("SELECT id FROM users WHERE username=?").get(username)) throw new Error("account_unavailable");
      for (const id of characterIds) {
        if (this.db.prepare("SELECT user_id FROM user_characters WHERE character_id=?").get(id))
          throw new Error("legacy_already_linked");
      }
      this.db.prepare("INSERT INTO users(id,username,salt,password_hash,recovery_hash) VALUES(?,?,?,?,?)")
        .run(userId, username, salt, passwordDigest, hash(recoveryCode));
      const insert = this.db.prepare("INSERT INTO user_characters(user_id,slot,character_id) VALUES(?,?,?)");
      characterIds.forEach((id, index) => insert.run(userId, index + 1, id));
    });
    return { recoveryCode };
  }

  async login(user: unknown, pass: unknown): Promise<{session: string; expiresAt: number}> {
    const username = usernameOf(user), password = passwordOf(pass);
    const row = this.db.prepare("SELECT id,salt,password_hash FROM users WHERE username=?").get(username);
    // Equal work for unknown accounts, without disclosing whether a name exists.
    const salt = typeof row?.salt === "string" ? row.salt : "00000000000000000000000000000000";
    const actual = await passwordHash(password, salt);
    const expected = typeof row?.password_hash === "string" && /^[a-f0-9]{128}$/.test(row.password_hash)
      ? Buffer.from(row.password_hash, "hex") : Buffer.alloc(64);
    if (!timingSafeEqual(actual, expected) || typeof row?.id !== "string") throw new Error("invalid_credentials");
    const session = secret("ms1_"), expiresAt = Date.now() + SESSION_LIFETIME;
    this.transaction(() => {
      // A password reset may have completed while the expensive hash was running.
      const current = this.db.prepare("SELECT password_hash FROM users WHERE id=?").get(row.id as string);
      if (current?.password_hash !== row.password_hash) throw new Error("invalid_credentials");
      this.db.prepare("DELETE FROM sessions WHERE expires_at<=?").run(Date.now());
      this.db.prepare("INSERT INTO sessions(session_hash,user_id,expires_at) VALUES(?,?,?)").run(hash(session), row.id as string, expiresAt);
    });
    return {session, expiresAt};
  }

  resolve(session: unknown): AccountIdentity | null {
    if (typeof session !== "string" || !SESSION.test(session)) return null;
    const row = this.db.prepare("SELECT user_id FROM sessions WHERE session_hash=? AND expires_at>?").get(hash(session), Date.now());
    if (typeof row?.user_id !== "string") return null;
    const ids = this.db.prepare("SELECT slot,character_id FROM user_characters WHERE user_id=? ORDER BY slot").all(row.user_id);
    if (ids.length !== 3 || ids.some((entry, index) => entry.slot !== index + 1 || typeof entry.character_id !== "string" || !/^[a-f0-9]{64}$/.test(entry.character_id)))
      throw new Error("account_record_invalid");
    return {accountId: row.user_id, characterIds: ids.map(entry => entry.character_id as string)};
  }
  logout(session: unknown): void {
    if (typeof session === "string" && SESSION.test(session)) this.db.prepare("DELETE FROM sessions WHERE session_hash=?").run(hash(session));
  }
  async resetPassword(user: unknown, recovery: unknown, newPass: unknown): Promise<{recoveryCode: string}> {
    const username = usernameOf(user), password = passwordOf(newPass);
    if (typeof recovery !== "string" || !RECOVERY.test(recovery)) throw new Error("invalid_recovery");
    const salt = randomBytes(16).toString("hex"), digest = (await passwordHash(password, salt)).toString("hex");
    const next = secret("mr1_");
    this.transaction(() => {
      const row = this.db.prepare("SELECT id FROM users WHERE username=? AND recovery_hash=?").get(username, hash(recovery));
      if (typeof row?.id !== "string") throw new Error("invalid_recovery");
      this.db.prepare("UPDATE users SET salt=?,password_hash=?,recovery_hash=? WHERE id=?").run(salt, digest, hash(next), row.id);
      this.db.prepare("DELETE FROM sessions WHERE user_id=?").run(row.id);
    });
    return {recoveryCode: next};
  }
}
