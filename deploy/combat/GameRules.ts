/**
 * MONTRA S1 — authoritative world rules shared by the room.
 *
 * The browser is allowed to request destinations or target IDs only.
 * It NEVER supplies positions, HP, damage, speed, cooldowns or facing.
 */
export const RULES = Object.freeze({
  tickRate: 20,               // Colyseus fixed-step simulation: 50 ms
  mapLimit: 20,
  playerSpeed: 3,
  playerMaxHp: 100,
  playerAttackRange: 2.8,
  playerAttackDamage: 20,
  playerAttackCooldownMs: 1000,
  playerRespawnMs: 4000,
  monsterId: "possessed-1",
  monsterSpawnX: 1.1,
  monsterSpawnZ: 10.4,
  monsterMaxHp: 100,
  monsterRespawnMs: 6000,
  monsterAggroRadius: 6,
  monsterGiveUpRadius: 10,
  monsterLeashRadius: 8,
  monsterAttackRange: 1.65,
  monsterAttackDamage: 8,
  monsterAttackCooldownMs: 1500,
  monsterChaseSpeed: 1.9,
  monsterPatrolSpeed: 0.65,
  monsterPatrolRadius: 1.25,
  // Burst + refill limits. Valid taps remain responsive; packet floods do not.
  moveBurst: 8,
  moveRatePerSecond: 12,
  attackBurst: 4,
  attackRatePerSecond: 4,
  // Free PK alpha: tap any other living player in the same room to attack.
  pkAttackRange: 2.8,
  pkDamage: 12,
  pkCooldownMs: 1000,
  // First summon prototype: one server-owned spirit guardian per player.
  summonLimitPerPlayer: 1,
  summonCooldownMs: 2500,
  summonCommandBurst: 3,
  summonCommandRatePerSecond: 2,
  summonMoveSpeed: 3.8,
  summonFollowDistance: 1.35,
  summonLeashDistance: 7,
  summonEngageDistance: 8,
  summonAttackRange: 1.8,
  summonAttackDamage: 8,
  summonAttackCooldownMs: 1500,
});

export type Vec2 = { x: number; z: number };
export type AttackCommand = { targetId: typeof RULES.monsterId };
export type PkTargetCommand = { targetId: string };

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every(key => expected.includes(key));
}

export function parseMoveCommand(message: unknown): Vec2 | null {
  if (!hasExactKeys(message, ["x", "z"])) return null;
  const { x, z } = message;
  if (
    typeof x !== "number" || typeof z !== "number" ||
    !Number.isFinite(x) || !Number.isFinite(z) ||
    Math.abs(x) > RULES.mapLimit || Math.abs(z) > RULES.mapLimit
  ) return null;
  return { x, z };
}

export function parseAttackCommand(message: unknown): AttackCommand | null {
  if (!hasExactKeys(message, ["targetId"])) return null;
  return message.targetId === RULES.monsterId
    ? { targetId: RULES.monsterId }
    : null;
}

/**
 * Player IDs are server-issued per-room Colyseus session IDs. The Room must
 * verify membership, that the target is alive, and that attacker !== victim.
 * Exact keys prevent injected damage, HP, speed, position or cooldown fields.
 */
export function parsePkTargetCommand(message: unknown): PkTargetCommand | null {
  if (!hasExactKeys(message, ["targetId"])) return null;
  const id = message.targetId;
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{6,64}$/.test(id)) return null;
  if (id === RULES.monsterId) return null;
  return { targetId: id };
}

export function parseEmptyCommand(message: unknown): boolean {
  // Never accept client-selected summons, positions, speed, damage or owner IDs.
  return message !== null && typeof message === "object" &&
    !Array.isArray(message) && Object.keys(message).length === 0;
}

export function planarDistance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

// Matches the existing Babylon client: the character's forward is local -Z.
export function facingTo(dx: number, dz: number): number {
  return Math.atan2(-dx, -dz);
}

export function stepTowards(position: Vec2, destination: Vec2, maxStep: number):
  { x: number; z: number; moved: boolean; arrived: boolean } {
  const dx = destination.x - position.x;
  const dz = destination.z - position.z;
  const distance = Math.hypot(dx, dz);

  if (distance < 0.00001) {
    return { x: position.x, z: position.z, moved: false, arrived: true };
  }
  const step = Math.min(distance, Math.max(0, maxStep));
  if (step <= 0) {
    return { x: position.x, z: position.z, moved: false, arrived: false };
  }
  const ratio = step / distance;
  return {
    x: position.x + dx * ratio,
    z: position.z + dz * ratio,
    moved: true,
    arrived: step >= distance - 0.00001,
  };
}

export function clampToMap(value: number): number {
  return Math.max(-RULES.mapLimit, Math.min(RULES.mapLimit, value));
}

/**
 * Per-session, per-command token bucket. Time comes from the server room's
 * simulated monotonic clock, never the client's timestamps.
 */
export class CommandBucket {
  private tokens: number;
  private lastMs: number;

  constructor(private readonly burst: number, private readonly ratePerSec: number, nowMs = 0) {
    this.tokens = burst;
    this.lastMs = nowMs;
  }

  consume(nowMs: number): boolean {
    const elapsed = Math.max(0, nowMs - this.lastMs);
    this.lastMs = nowMs;
    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.ratePerSec / 1000);
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
