/**
 * MONTRA V0.1.9 — server-owned 3D elevation and fortification geometry.
 * Coordinates: player.y = feet height, ground y=0, parapet top y=4.
 * IMPORTANT: these exact geometry values are synced through room.state.fortification;
 * the web client only renders the authoritative geometry.
 */
export const FORT = Object.freeze({
  id: "watchwall-1",
  x: 8,
  z: 4,
  width: 1.4,         // along world X
  length: 8,         // along world Z
  height: 4,
  ladderFootX: 6.1,
  ladderFootZ: 2.5,
  ladderTopX: 8,
  ladderTopZ: 2.5,
  climbTriggerRadius: 1.75,
  descendTriggerRadius: 1.4,
  climbSpeed: 2.3,    // world units per second (3D)
  capsuleRadius: 0.32,
  rangedRange: 15,
  rangedDamage: 10,
  rangedCooldownMs: 1200,
  shootOriginHeight: 1.55,
  targetBodyHeight: 1.0,
  topPadding: 0.16,
});

export type WorldPoint = { x: number; y: number; z: number };
export type GroundPoint = { x: number; z: number };
export type ClimbRequest = { structureId: "watchwall-1"; direction: "up" | "down" };

export function parseClimbRequest(value: unknown): ClimbRequest | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o);
  if (keys.length !== 2 || !keys.includes("structureId") || !keys.includes("direction")) return null;
  if (o.structureId !== FORT.id || (o.direction !== "up" && o.direction !== "down")) return null;
  return { structureId: FORT.id, direction: o.direction };
}

/** Limited 3D movement (e.g. climbing and floating spirit companions). */
export function step3d(from: WorldPoint, to: WorldPoint, maxStep: number):
  { point: WorldPoint; arrived: boolean; moved: boolean } {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const d = Math.hypot(dx, dy, dz);
  if (d < 0.00001) return { point:{ ...from }, arrived:true, moved:false };
  const step = Math.max(0, maxStep);
  if (step <= 0) return { point:{ ...from }, arrived:false, moved:false };
  if (step >= d) return { point:{ ...to }, arrived:true, moved:true };
  return { point:{
    x: from.x + dx / d * step,
    y: from.y + dy / d * step,
    z: from.z + dz / d * step,
  }, arrived:false, moved:true };
}

export function distance3d(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function isOnPlatform(y: number): boolean {
  return Math.abs(y - FORT.height) < 0.1;
}
export function isOnGround(y: number): boolean {
  return Math.abs(y) < 0.1;
}

export function isOnTop(x: number, z: number, padding = FORT.topPadding): boolean {
  const halfX = FORT.width / 2 - padding;
  const halfZ = FORT.length / 2 - padding;
  return Math.abs(x - FORT.x) <= halfX &&
    Math.abs(z - FORT.z) <= halfZ;
}

/**
 * Ground actors cannot traverse the physical wall body. The client may ask
 * for destinations across it; server physics, not client, blocks penetration.
 */
export function touchesWallBody(x: number, z: number, radius = FORT.capsuleRadius): boolean {
  return Math.abs(x - FORT.x) < FORT.width / 2 + radius &&
    Math.abs(z - FORT.z) < FORT.length / 2 + radius;
}

export function progressClimb(
  from: WorldPoint, to: WorldPoint, dt: number,
): { point: WorldPoint; arrived: boolean } {
  const next = step3d(from, to, FORT.climbSpeed * dt);
  return { point: next.point, arrived: next.arrived };
}

/** Ray (muzzle -> target torso) intersects the solid axis-aligned wall body.
 * No cheating via client-supplied heights or starting points.
 * This is a simple Alpha LoS model for THIS fortification; buildings and
 * foliage are decorative until their collision shapes join this model.
 */
export function wallBlocksShot(start: WorldPoint, end: WorldPoint): boolean {
  const min = { x: FORT.x - FORT.width/2, y: -0.1, z: FORT.z - FORT.length/2 };
  const max = { x: FORT.x + FORT.width/2, y: FORT.height, z: FORT.z + FORT.length/2 };
  let enter=0, exit=1;
  for (const dim of ["x","y","z"] as const) {
    const d = end[dim] - start[dim];
    if (Math.abs(d) < 1e-8) {
      if (start[dim] < min[dim] || start[dim] > max[dim]) return false;
      continue;
    }
    let near = (min[dim] - start[dim])/d;
    let far  = (max[dim] - start[dim])/d;
    if (near > far) [near, far] = [far, near];
    enter = Math.max(enter, near);
    exit = Math.min(exit, far);
    if (enter > exit) return false;
  }
  // Ignore contact at the muzzle and at the victim's torso endpoint.
  return exit > 0.005 && enter < 0.995;
}
