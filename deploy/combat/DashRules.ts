/**
 * MONTRA: dash input validation and swept movement, exclusively server owned.
 * The client provides only a horizontal, near-unit direction. Distance, speed
 * and cooldown come from RULES, never from the browser.
 */
import { RULES, type Vec2 } from "./GameRules.js";

export type DashDirection = { dx: number; dz: number };
export const DASH_SWEEP_STEP = 0.10;

export function parseDashCommand(value: unknown): DashDirection | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).length !== 2 || !("dx" in data) || !("dz" in data)) return null;
  if (typeof data.dx !== "number" || typeof data.dz !== "number" ||
      !Number.isFinite(data.dx) || !Number.isFinite(data.dz)) return null;
  const magnitude = Math.hypot(data.dx, data.dz);
  // Reject zero vectors and giant vectors, instead of letting attackers
  // choose arbitrary dash power. Small float rounding is tolerated.
  if (magnitude < 0.98 || magnitude > 1.02) return null;
  return { dx: data.dx / magnitude, dz: data.dz / magnitude };
}

export function advanceDash(
  current: Vec2,
  direction: DashDirection,
  maxStep: number,
  canOccupy: (x: number, z: number) => boolean,
): { x: number; z: number; moved: number; blocked: boolean } {
  if (!Number.isFinite(maxStep) || maxStep <= 0 ||
      !Number.isFinite(current.x) || !Number.isFinite(current.z)) {
    return { ...current, moved: 0, blocked: true };
  }
  const distance = Math.min(RULES.dashDistance, maxStep);
  let x = current.x, z = current.z, moved = 0;
  // The watchwall is thicker than a step, and this sweep also handles future
  // thinner colliders. Stop BEFORE the first blocked micro-step, not beyond it.
  while (moved + 1e-8 < distance) {
    const step = Math.min(DASH_SWEEP_STEP, distance - moved);
    const nextX = x + direction.dx * step;
    const nextZ = z + direction.dz * step;
    if (Math.abs(nextX) > RULES.mapLimit || Math.abs(nextZ) > RULES.mapLimit ||
        !canOccupy(nextX, nextZ)) {
      return { x, z, moved, blocked: true };
    }
    x = nextX;
    z = nextZ;
    moved += step;
  }
  return { x, z, moved, blocked: false };
}
