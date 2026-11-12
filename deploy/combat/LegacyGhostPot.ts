import {spawn, type ChildProcessWithoutNullStreams} from "node:child_process";
import {randomInt} from "node:crypto";
import {existsSync} from "node:fs";
import {isAbsolute, join} from "node:path";
import {createInterface} from "node:readline";
import {pathToFileURL} from "node:url";

export type GhostSource = {monsterId: string; mapId: string};
export type PotGhost = {instanceId: string; name: string; level: number; source?: GhostSource};
export type LegacyGhostSkill = {skillId: string; range: number; cooldownMs: number; maxUses: number};
type Position = {x: number; y: number; z: number};
type Command = {
  commandId: string; instanceId: string; zone: string; kind: "summon" | "recall" | "switch" | "skill";
  targetPoint?: Position; expectedActiveInstanceId?: string; expectedActiveGeneration?: number;
  skillId?: string; targetActorId?: string;
};
type SkillFrame = {origin: Position; targetId: string; targetPosition: Position;
  targetLevel: number; targetHp: number; targetMaxHp: number; targetDefenseScale: number};
type Result = {
  accepted: boolean; code: string; replay?: boolean;
  active?: (Position & {actorId: string; instanceId: string; generation: number;
    hpScale: number; defenseScale: number; magicDefenseScale: number; attackScale: number;
    basicRange: number; basicCooldownMs: number; skills: LegacyGhostSkill[]}) | null;
  skill?: {targetId: string; skillId: string; hit: boolean; critical: boolean; damageScale: number} | null;
};
type PartyGhost = Pick<PotGhost, "instanceId" | "level"> & {speciesId: string; slot: number};
type Request = {owner: string; position: Position; party: PartyGhost[]; command: Command; skill?: SkillFrame}
  | {owner: string; disconnect: true};
type Pending = {resolve: (result: Result) => void; reject: (error: Error) => void; timer: NodeJS.Timeout};

export class GhostWorkerBusy extends Error {}

export const POT_CAPTURE_PROFILE = "MON_001";

function isGhostSource(value: unknown): value is GhostSource {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 2) return false;
  const {monsterId,mapId} = value as Partial<GhostSource>;
  return typeof monsterId === "string" && /^[a-z0-9][a-z0-9_-]{0,95}$/.test(monsterId) &&
    typeof mapId === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(mapId);
}

export function isPotGhost(value: unknown): value is PotGhost {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ghost = value as Partial<PotGhost>;
  const keys = Object.keys(ghost).length;
  const validSource = Object.hasOwn(ghost,"source") ? keys === 4 && isGhostSource(ghost.source) : keys === 3;
  return validSource && typeof ghost.instanceId === "string" &&
    /^[0-9a-f-]{36}$/.test(ghost.instanceId) && typeof ghost.name === "string" &&
    ghost.name.length > 0 && ghost.name.length <= 80 && typeof ghost.level === "number" &&
    Number.isSafeInteger(ghost.level) && ghost.level >= 1 && ghost.level <= 60;
}

export function ghostPotConfig() {
  const worker = process.env.MONTRA_GHOST_WORKER;
  const source = process.env.MONTRA_POCKET_CAPTURE_SOURCE;
  if (!worker || !source || !isAbsolute(worker) || !isAbsolute(source)) return null;
  const capture = join(source, "balance-capture.mjs");
  return existsSync(worker) && existsSync(capture) ? {worker, capture} : null;
}

type Calculator = (input: object) => {ok: boolean; finalChancePct: number};
export async function rollPotCapture(capture: string, target: {hp: number; maxHp: number; level: number}, playerLevel: number) {
  const {resolveWorkbookCapture} = await import(pathToFileURL(capture).href) as {resolveWorkbookCapture: Calculator};
  const result = resolveWorkbookCapture({
    monsterId: POT_CAPTURE_PROFILE, currentHp: target.hp, maxHp: target.maxHp,
    targetLevel: target.level, referenceLevel: Math.min(100, playerLevel),
    activeStatusIds: [], ballClass: "Basic", variant: "Normal",
    ballQuantity: 1, targetAlive: true, projectileHit: true, ownedMonsterActive: false,
  });
  if (!result.ok || !Number.isFinite(result.finalChancePct)) throw new Error("ghost_capture_invalid");
  return randomInt(10000) < Math.round(result.finalChancePct * 100);
}

/** One private subprocess per room, with the original server's stateful command runtime. */
export class LegacyGhostWorker {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending: Pending[] = [];
  private closed = false;

  constructor(worker: string) {
    this.child = spawn("dotnet", [worker], {windowsHide: true});
    this.child.stderr.resume();
    const lines = createInterface({input: this.child.stdout, crlfDelay: Infinity});
    lines.on("line", line => {
      const pending = this.pending[0];
      try {
        const result = JSON.parse(line) as Result;
        if (!pending || typeof result.accepted !== "boolean" || typeof result.code !== "string") throw new Error("invalid response");
        this.pending.shift();
        clearTimeout(pending.timer);
        pending.resolve(result);
      } catch { this.close(); }
    });
    this.child.once("error", () => this.close());
    this.child.once("exit", () => this.close());
    this.child.stdin.on("error", () => this.close());
  }

  send(request: Request): Promise<Result> {
    if (this.closed) return Promise.reject(new Error("ghost_worker_unavailable"));
    if (!("disconnect" in request) && this.pending.length >= 16) return Promise.reject(new GhostWorkerBusy("ghost_worker_busy"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.close(), 5000);
      timer.unref();
      this.pending.push({resolve, reject, timer});
      this.child.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.child.kill();
    for (const pending of this.pending.splice(0)) {
      clearTimeout(pending.timer);
      pending.reject(new Error("ghost_worker_unavailable"));
    }
  }
}
