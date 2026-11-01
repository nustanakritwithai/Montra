import { getWorldMap, isSafeWorldPoint, type WorldPoint, type WorldPortal } from "./WorldMaps.js";
export const WARP_RANGE = 2;
export const WARP_COOLDOWN_MS = 3000;
export const WARP_COMBAT_LOCK_MS = 5000;
export type WarpContext = Readonly<{
  mapId: string; position: WorldPoint; alive: boolean;
  flying: boolean; climbing: boolean; dashing: boolean; changingHeight: boolean;
  lastCombatMs: number; lastWarpMs: number; nowMs: number;
}>;
export type WarpResult =
  | { ok: true; portal: WorldPortal }
  | { ok: false; reason: string };
export function parseWarpCommand(payload: unknown): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = payload as Record<string, unknown>;
  if (Object.keys(value).length !== 1 || typeof value.portalId !== "string") return null;
  return /^[a-z][a-z0-9_]{0,63}$/.test(value.portalId) ? value.portalId : null;
}
export function checkWarp(payload: unknown, ctx: WarpContext): WarpResult {
  const id = parseWarpCommand(payload);
  if (!id) return { ok: false, reason: "invalid_portal_request" };
  const source = getWorldMap(ctx.mapId);
  if (!source) return { ok: false, reason: "unknown_source_map" };
  const portal = source.portals.find(p => p.id === id);
  if (!portal) return { ok: false, reason: "portal_not_in_map" };
  if (!ctx.alive) return { ok: false, reason: "not_alive" };
  if (ctx.flying || ctx.climbing || ctx.dashing || ctx.changingHeight) {
    return { ok: false, reason: "movement_busy" };
  }
  if (!Number.isFinite(ctx.nowMs) || !Number.isFinite(ctx.position.x) ||
      !Number.isFinite(ctx.position.z)) return { ok: false, reason: "invalid_position" };
  if (ctx.nowMs - ctx.lastWarpMs < WARP_COOLDOWN_MS) return { ok: false, reason: "warp_cooldown" };
  if (ctx.nowMs - ctx.lastCombatMs < WARP_COMBAT_LOCK_MS) return { ok: false, reason: "combat_locked" };
  if (Math.hypot(ctx.position.x - portal.x, ctx.position.z - portal.z) > WARP_RANGE) {
    return { ok: false, reason: "portal_too_far" };
  }
  const target = getWorldMap(portal.targetMapId);
  if (!target || !isSafeWorldPoint(target, portal.targetSpawn)) {
    return { ok: false, reason: "unsafe_destination" };
  }
  return { ok: true, portal };
}
