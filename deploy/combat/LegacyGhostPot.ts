import {spawn, type ChildProcessWithoutNullStreams} from "node:child_process";
import {randomInt} from "node:crypto";
import {existsSync} from "node:fs";
import {isAbsolute, join} from "node:path";
import {createInterface} from "node:readline";
import {pathToFileURL} from "node:url";

export type PotGhost = {instanceId: string; name: string; level: number};
type Position = {x: number; y: number; z: number};
type Command = {
  commandId: string; instanceId: string; zone: string; kind: "summon" | "recall";
  targetPoint?: Position; expectedActiveGeneration?: number;
};
type Result = {
  accepted: boolean; code: string; replay?: boolean;
  active?: (Position & {actorId: string; generation: number}) | null;
};
type Request = {owner: string; position: Position; ghost: PotGhost & {speciesId: string}; command: Command}
  | {owner: string; disconnect: true};
type Pending = {resolve: (result: Result) => void; reject: (error: Error) => void; timer: NodeJS.Timeout};

export const POT_CAPTURE_PROFILE = "MON_001";

export function isPotGhost(value: unknown): value is PotGhost {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ghost = value as Partial<PotGhost>;
  return Object.keys(ghost).length === 3 && typeof ghost.instanceId === "string" &&
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
    if (this.closed || this.pending.length >= 16) return Promise.reject(new Error("ghost_worker_unavailable"));
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
