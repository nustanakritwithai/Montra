import { Room, Client, CloseCode } from "colyseus";
import { MyRoomState, Player } from "./schema/MyRoomState.js";

type Destination = { x: number; z: number };

const MAP_LIMIT = 20;
const MOVE_SPEED = 3;

// Alpha combat rules. Server-authoritative, identical for all connected clients.
const MONSTER_ID = "possessed-1";
const ATTACK_RANGE = 2.8;
const DAMAGE_PER_HIT = 20;
const ATTACK_COOLDOWN_MS = 1000;
const RESPAWN_MS = 6000;

export class MyRoom extends Room<{ state: MyRoomState }> {
  maxClients = 4;
  state = new MyRoomState();

  private destinations = new Map<string, Destination>();
  private attackTargets = new Map<string, string>();
  private lastAttackAt = new Map<string, number>();
  private respawnAt = 0;

  messages = {
    move: (client: Client, message: unknown) => {
      if (!message || typeof message !== "object" || Array.isArray(message)) return;
      const { x, z } = message as Record<string, unknown>;

      if (
        typeof x !== "number" || typeof z !== "number" ||
        !Number.isFinite(x) || !Number.isFinite(z) ||
        Math.abs(x) > MAP_LIMIT || Math.abs(z) > MAP_LIMIT
      ) return;

      if (!this.state.players.has(client.sessionId)) return;

      // Manual tap-to-move overrides auto-approach and auto-attack.
      this.attackTargets.delete(client.sessionId);
      this.destinations.set(client.sessionId, { x, z });
    },

    attack: (client: Client, message: unknown) => {
      if (!message || typeof message !== "object" || Array.isArray(message)) return;
      const { targetId } = message as Record<string, unknown>;
      if (targetId !== MONSTER_ID) return;

      const player = this.state.players.get(client.sessionId);
      const monster = this.state.monster;
      if (!player) return;

      if (!monster.alive) {
        client.send("combat_notice", { reason: "monster_down" });
        return;
      }

      // The client only chooses a target. It cannot choose damage or HP.
      this.attackTargets.set(client.sessionId, MONSTER_ID);
      const dx = monster.x - player.x;
      const dz = monster.z - player.z;
      const distance = Math.hypot(dx, dz);

      if (distance > ATTACK_RANGE) {
        // Approach the monster, stopping inside attack range.
        const desiredDistance = ATTACK_RANGE - 0.4;
        const ratio = (distance - desiredDistance) / distance;
        const x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, player.x + dx * ratio));
        const z = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, player.z + dz * ratio));
        this.destinations.set(client.sessionId, { x, z });
        client.send("combat_notice", { reason: "approaching" });
      } else {
        this.destinations.delete(client.sessionId);
        // Allow the very first hit immediately when already in range.
        this.tryAttack(client.sessionId);
      }
    },
  };

  private tryAttack(sessionId: string) {
    const monster = this.state.monster;
    const player = this.state.players.get(sessionId);

    if (!player || !monster.alive) {
      this.attackTargets.delete(sessionId);
      return;
    }

    // Reject damage attempts made from beyond the server-defined range.
    if (Math.hypot(monster.x - player.x, monster.z - player.z) > ATTACK_RANGE) {
      return;
    }

    const now = Date.now();
    if (now - (this.lastAttackAt.get(sessionId) ?? 0) < ATTACK_COOLDOWN_MS) {
      return;
    }

    this.lastAttackAt.set(sessionId, now);
    monster.hp = Math.max(0, monster.hp - DAMAGE_PER_HIT);
    monster.hitSeq += 1;

    // Cosmetic notification to all room members; Schema HP is the truth.
    this.broadcast("combat_hit", {
      targetId: MONSTER_ID,
      attackerId: sessionId,
      damage: DAMAGE_PER_HIT,
      hp: monster.hp,
      maxHp: monster.maxHp,
      hitSeq: monster.hitSeq,
    }, { afterNextPatch: true });

    console.log("MONTRA HIT", sessionId, "monsterHP", monster.hp);

    if (monster.hp <= 0) {
      monster.alive = false;
      this.respawnAt = now + RESPAWN_MS;

      // Stop auto-attacks and auto-approach for the defeated target.
      for (const session of this.attackTargets.keys()) {
        this.destinations.delete(session);
      }
      this.attackTargets.clear();
    }
  }

  onCreate() {
    console.log("MONTRA Combat Room created:", this.roomId);

    this.setTimestep((deltaTime) => {
      const dt = Math.max(0, Math.min(deltaTime, 100)) / 1000;
      const step = MOVE_SPEED * dt;
      const monster = this.state.monster;

      if (!monster.alive && this.respawnAt && Date.now() >= this.respawnAt) {
        monster.hp = monster.maxHp;
        monster.alive = true;
        this.respawnAt = 0;
        this.broadcast("monster_respawn", { targetId: MONSTER_ID });
      }

      for (const [id, destination] of this.destinations) {
        const player = this.state.players.get(id);
        if (!player) {
          this.destinations.delete(id);
          this.attackTargets.delete(id);
          continue;
        }

        if (this.attackTargets.has(id) && monster.alive &&
            Math.hypot(monster.x - player.x, monster.z - player.z) <= ATTACK_RANGE) {
          this.destinations.delete(id);
          continue;
        }

        const dx = destination.x - player.x;
        const dz = destination.z - player.z;
        const distance = Math.hypot(dx, dz);

        if (distance <= step) {
          player.x = destination.x;
          player.z = destination.z;
          this.destinations.delete(id);
        } else if (distance > 0) {
          player.x += (dx / distance) * step;
          player.z += (dz / distance) * step;
        }
      }

      // The server performs every attack, never trusting client damage values.
      for (const sessionId of this.attackTargets.keys()) {
        this.tryAttack(sessionId);
      }
    }, 50);
  }

  onJoin(client: Client) {
    const spawnX = this.state.players.size * 2;
    this.state.players.set(
      client.sessionId,
      new Player({ x: spawnX, y: 0, z: 0 })
    );
    console.log(client.sessionId, "joined MONTRA Combat Room");
  }

  onLeave(client: Client, code: CloseCode) {
    this.destinations.delete(client.sessionId);
    this.attackTargets.delete(client.sessionId);
    this.lastAttackAt.delete(client.sessionId);
    this.state.players.delete(client.sessionId);
    console.log(client.sessionId, "left", code);
  }

  onDispose() {
    console.log("MONTRA Combat Room disposed:", this.roomId);
  }
}
