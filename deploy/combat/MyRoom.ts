import { Room, type Client, type CloseCode } from "colyseus";
import { MyRoomState, Player } from "./schema/MyRoomState.js";
import {
  RULES,
  CommandBucket,
  type Vec2,
  clampToMap,
  facingTo,
  parseMoveCommand,
  parseAttackCommand,
  parsePlayerTargetCommand,
  parseDuelReplyCommand,
  planarDistance,
  stepTowards,
} from "./GameRules.js";

type Gates = { move: CommandBucket; attack: CommandBucket; duel: CommandBucket };

/**
 * MONTRA S1: one 20-Hz authoritative simulation per room.
 *
 * Clients only send "move" {x,z} and "attack" {targetId}; no damage, position
 * updates, HP or timestamps are trusted. Server movements are speed-limited;
 * all combat/AI/respawn timers use the SERVER'S fixed-step simulation clock.
 *
 * Existing public contract retained:
 *   room type "my_room"; monster id "possessed-1";
 *   state.players, state.monster; "combat_hit"/"combat_notice"/"monster_respawn".
 */
export class MyRoom extends Room<{ state: MyRoomState }> {
  maxClients = 4;
  state = new MyRoomState();

  private simulatedMs = 0;
  private destinations = new Map<string, Vec2>();
  private attackTargets = new Map<string, string>();
  private lastAttackMs = new Map<string, number>();
  private playerRespawnAt = new Map<string, number>();
  private playerSpawn = new Map<string, Vec2>();
  private gates = new Map<string, Gates>();
  private lastRejectNoticeMs = new Map<string, number>();

  private monsterRespawnAt = 0;
  private lastMonsterAttackMs = -Infinity;
  private monsterReturning = false;
  private duelDeadlineMs = new Map<string, number>();

  messages = {
    move: (client: Client, message: unknown) => {
      const destination = parseMoveCommand(message);
      if (!destination) return this.reject(client, "invalid_move");
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      if (!this.gates.get(client.sessionId)?.move.consume(this.simulatedMs)) {
        return this.reject(client, "move_rate_limited");
      }

      // A manual tap cancels auto-approach AND auto-attack (even if walking).
      this.attackTargets.delete(client.sessionId);
      player.targetId = "";
      player.combatState = "moving";
      this.destinations.set(client.sessionId, destination);
    },

    attack: (client: Client, message: unknown) => {
      const monsterOrder = parseAttackCommand(message);
      const playerOrder = monsterOrder ? null : parsePlayerTargetCommand(message);
      if (!monsterOrder && !playerOrder) return this.reject(client, "invalid_attack");

      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      if (!this.gates.get(client.sessionId)?.attack.consume(this.simulatedMs)) {
        return this.reject(client, "attack_rate_limited");
      }

      const targetId = monsterOrder ? RULES.monsterId : playerOrder!.targetId;
      let target: Vec2 | undefined;
      if (targetId === RULES.monsterId) {
        if (player.duelState === "active") return this.reject(client, "duel_in_progress");
        if (!this.state.monster.alive) {
          client.send("combat_notice", { reason: "monster_down" });
          return;
        }
        target = this.state.monster;
      } else {
        if (!this.isActiveDuel(client.sessionId, targetId)) {
          return this.reject(client, "duel_not_active");
        }
        const opponent = this.state.players.get(targetId);
        if (!opponent || !opponent.alive) return this.reject(client, "target_unavailable");
        target = opponent;
      }

      this.destinations.delete(client.sessionId);
      this.attackTargets.set(client.sessionId, targetId);
      player.targetId = targetId;

      if (planarDistance(player, target) > RULES.playerAttackRange) {
        player.combatState = "approaching";
        client.send("combat_notice", { reason: "approaching" });
      } else {
        player.combatState = "attacking";
      }
    },

    duel_request: (client: Client, message: unknown) => {
      const requested = parsePlayerTargetCommand(message);
      if (!requested) return this.reject(client, "invalid_duel_request");

      const fromId = client.sessionId;
      const toId = requested.targetId;
      const challenger = this.state.players.get(fromId);
      const challenged = this.state.players.get(toId);

      if (!challenger || !challenged || fromId === toId) {
        return this.reject(client, "invalid_duel_target");
      }
      if (!challenger.alive || !challenged.alive) return this.reject(client, "not_alive");
      if (challenger.duelState !== "none" || challenged.duelState !== "none") {
        return this.reject(client, "duel_busy");
      }
      if (planarDistance(challenger, challenged) > RULES.duelMaxInviteDistance) {
        return this.reject(client, "duel_too_far");
      }
      if (!this.gates.get(fromId)?.duel.consume(this.simulatedMs)) {
        return this.reject(client, "duel_rate_limited");
      }

      challenger.duelWith = toId;
      challenger.duelState = "outgoing";
      challenged.duelWith = fromId;
      challenged.duelState = "incoming";
      const expires = this.simulatedMs + RULES.duelInviteTimeoutMs;
      this.duelDeadlineMs.set(fromId, expires);
      this.duelDeadlineMs.set(toId, expires);

      client.send("duel_invite_sent", { targetId: toId });
      this.clients.find(c => c.sessionId === toId)?.send("duel_invite", { fromId });
    },

    duel_reply: (client: Client, message: unknown) => {
      const reply = parseDuelReplyCommand(message);
      if (!reply) return this.reject(client, "invalid_duel_reply");

      const defenderId = client.sessionId;
      const attackerId = reply.targetId;
      const defender = this.state.players.get(defenderId);
      const attacker = this.state.players.get(attackerId);
      if (!defender || !attacker ||
          defender.duelState !== "incoming" || defender.duelWith !== attackerId ||
          attacker.duelState !== "outgoing" || attacker.duelWith !== defenderId) {
        return this.reject(client, "duel_not_pending");
      }
      if ((this.duelDeadlineMs.get(defenderId) ?? 0) <= this.simulatedMs) {
        this.finishDuel(defenderId, "expired");
        return;
      }
      if (!reply.accept) {
        this.finishDuel(defenderId, "declined");
        return;
      }
      if (!defender.alive || !attacker.alive) {
        this.finishDuel(defenderId, "cancelled");
        return;
      }

      // Both players explicitly opted in. The Monster NPC ignores duelists.
      defender.duelState = "active";
      attacker.duelState = "active";
      defender.hp = defender.maxHp;
      attacker.hp = attacker.maxHp;
      this.cancelAutoCombat(defenderId);
      this.cancelAutoCombat(attackerId);
      const activeUntil = this.simulatedMs + RULES.duelDurationMs;
      this.duelDeadlineMs.set(defenderId, activeUntil);
      this.duelDeadlineMs.set(attackerId, activeUntil);
      if (this.state.monster.targetId === defenderId ||
          this.state.monster.targetId === attackerId) this.state.monster.targetId = "";
      this.broadcast("duel_started", { playerA: attackerId, playerB: defenderId },
        { afterNextPatch: true });
    },

    duel_cancel: (client: Client, message: unknown) => {
      const target = parsePlayerTargetCommand(message);
      if (!target) return this.reject(client, "invalid_duel_cancel");

      const player = this.state.players.get(client.sessionId);
      if (!player || player.duelState === "none" || player.duelWith !== target.targetId) {
        return this.reject(client, "duel_not_active");
      }
      const winnerId = player.duelState === "active" ? target.targetId : "";
      this.finishDuel(client.sessionId, "forfeit", winnerId);
    },
  };

  private isActiveDuel(aId: string, bId: string): boolean {
    if (aId === bId) return false;
    const a = this.state.players.get(aId);
    const b = this.state.players.get(bId);
    return Boolean(
      a?.alive && b?.alive &&
      a.duelState === "active" && b.duelState === "active" &&
      a.duelWith === bId && b.duelWith === aId
    );
  }

  private cancelAutoCombat(id: string) {
    this.attackTargets.delete(id);
    this.destinations.delete(id);
    const player = this.state.players.get(id);
    if (player && player.alive) {
      player.targetId = "";
      player.combatState = "idle";
    }
  }

  private finishDuel(id: string, reason: string, winnerId = "") {
    const origin = this.state.players.get(id);
    if (!origin || origin.duelState === "none") return;
    const opponentId = origin.duelWith;
    const opponent = this.state.players.get(opponentId);

    // Clear both directions atomically inside this fixed-step room.
    for (const [sessionId, otherId] of [[id, opponentId], [opponentId, id]]) {
      const player = this.state.players.get(sessionId);
      if (!player || player.duelWith !== otherId) continue;
      player.duelState = "none";
      player.duelWith = "";
      this.duelDeadlineMs.delete(sessionId);
      if (this.attackTargets.get(sessionId) === otherId) {
        this.cancelAutoCombat(sessionId);
      }
    }
    if (!opponent) this.duelDeadlineMs.delete(opponentId);

    this.broadcast("duel_end", {
      playerA: id, playerB: opponentId, reason, winnerId,
    }, { afterNextPatch: true });
  }

  private updateDuelDeadlines() {
    for (const [id, deadline] of [...this.duelDeadlineMs]) {
      if (this.simulatedMs < deadline) continue;
      const player = this.state.players.get(id);
      if (!player || player.duelState === "none") {
        this.duelDeadlineMs.delete(id);
      } else {
        this.finishDuel(id, player.duelState === "active" ? "timeout" : "expired");
      }
    }
  }

  private reject(client: Client, reason: string) {
    // Avoid amplifying floods with unlimited rejection responses.
    const previous = this.lastRejectNoticeMs.get(client.sessionId) ?? -Infinity;
    if (this.simulatedMs - previous >= 500) {
      this.lastRejectNoticeMs.set(client.sessionId, this.simulatedMs);
      client.send("command_rejected", { reason });
    }
  }

  onCreate() {
    this.state.monster.id = RULES.monsterId;
    this.state.monster.x = RULES.monsterSpawnX;
    this.state.monster.z = RULES.monsterSpawnZ;
    this.state.monster.hp = RULES.monsterMaxHp;
    this.state.monster.maxHp = RULES.monsterMaxHp;
    this.state.monster.alive = true;
    this.state.monster.aiState = "patrol";

    // Simulation time and collision/combat logic advance in exact 50ms steps,
    // independently of client FPS, render speed and message arrival cadence.
    this.setFixedTimestep((ctx) => {
      this.simulatedMs += ctx.dtMs;
      this.tick(ctx.dt);
    }, RULES.tickRate);

    console.log("MONTRA S1 Game Engine started:", this.roomId);
  }

  private tick(dt: number) {
    this.updateDuelDeadlines();
    this.updateRespawns();
    this.updatePlayerMovement(dt);
    this.updateMonsterAI(dt);
    this.updatePlayerAttacks();
  }

  private updatePlayerMovement(dt: number) {
    const monster = this.state.monster;
    for (const [sessionId, player] of this.state.players) {
      if (!player.alive) continue;

      if (this.attackTargets.has(sessionId)) {
        if (!monster.alive) {
          this.endAttack(sessionId, player);
          continue;
        }
        const dx = monster.x - player.x;
        const dz = monster.z - player.z;
        const distance = Math.hypot(dx, dz);
        player.targetId = RULES.monsterId;
        player.facing = facingTo(dx, dz);

        if (distance <= RULES.playerAttackRange) {
          player.combatState = "attacking";
          continue;
        }

        // Re-evaluate target position every server tick: monsters can move.
        const stopDistance = RULES.playerAttackRange - 0.4;
        const ratio = Math.max(0, (distance - stopDistance) / distance);
        const approach = {
          x: clampToMap(player.x + dx * ratio),
          z: clampToMap(player.z + dz * ratio),
        };
        const next = stepTowards(player, approach, RULES.playerSpeed * dt);
        player.x = next.x;
        player.z = next.z;
        player.combatState = "approaching";
        continue;
      }

      const target = this.destinations.get(sessionId);
      if (!target) {
        player.combatState = "idle";
        player.targetId = "";
        continue;
      }
      const dx = target.x - player.x;
      const dz = target.z - player.z;
      const next = stepTowards(player, target, RULES.playerSpeed * dt);
      if (next.moved) player.facing = facingTo(dx, dz);
      player.x = next.x;
      player.z = next.z;
      player.combatState = next.arrived ? "idle" : "moving";
      if (next.arrived) this.destinations.delete(sessionId);
    }
  }

  private updatePlayerAttacks() {
    const monster = this.state.monster;
    if (!monster.alive) return;

    for (const [id] of this.attackTargets) {
      const player = this.state.players.get(id);
      if (!player || !player.alive) {
        this.attackTargets.delete(id);
        continue;
      }

      const distance = planarDistance(player, monster);
      if (distance > RULES.playerAttackRange + 0.00001) continue;
      player.facing = facingTo(monster.x - player.x, monster.z - player.z);
      player.combatState = "attacking";

      const last = this.lastAttackMs.get(id) ?? -Infinity;
      if (this.simulatedMs - last < RULES.playerAttackCooldownMs) continue;
      this.lastAttackMs.set(id, this.simulatedMs);

      monster.hp = Math.max(0, monster.hp - RULES.playerAttackDamage);
      monster.hitSeq += 1;

      this.broadcast("combat_hit", {
        targetId: RULES.monsterId,
        attackerId: id,
        damage: RULES.playerAttackDamage,
        hp: monster.hp,
        maxHp: monster.maxHp,
        hitSeq: monster.hitSeq,
      }, { afterNextPatch: true });

      if (monster.hp === 0) {
        this.killMonster();
        break;
      }
    }
  }

  private killMonster() {
    const monster = this.state.monster;
    monster.alive = false;
    monster.hp = 0;
    monster.aiState = "dead";
    monster.targetId = "";
    this.monsterRespawnAt = this.simulatedMs + RULES.monsterRespawnMs;
    this.monsterReturning = false;

    // A corpse should not keep moving, nor should clients autoattack it.
    for (const [id] of this.attackTargets) {
      const player = this.state.players.get(id);
      if (player && player.alive) {
        player.targetId = "";
        player.combatState = "idle";
      }
    }
    this.attackTargets.clear();
  }

  private updateMonsterAI(dt: number) {
    const monster = this.state.monster;
    if (!monster.alive) return;

    const spawn = { x: RULES.monsterSpawnX, z: RULES.monsterSpawnZ };
    if (planarDistance(monster, spawn) >= RULES.monsterLeashRadius) {
      this.monsterReturning = true;
    }
    if (this.monsterReturning) {
      monster.targetId = "";
      monster.aiState = "return";
      this.moveMonster(spawn, RULES.monsterChaseSpeed * dt);
      if (planarDistance(monster, spawn) < 0.2) this.monsterReturning = false;
      return;
    }

    // Keep an existing target if it is alive and remains in the combat area.
    let targetId = monster.targetId;
    let target = targetId ? this.state.players.get(targetId) : undefined;
    if (!target || !target.alive ||
        planarDistance(monster, target) > RULES.monsterGiveUpRadius) {
      target = undefined;
      targetId = "";
    }

    // No shared targeting oracle: this NPC sees only characters within aggro.
    if (!target) {
      let nearest: number = RULES.monsterAggroRadius;
      for (const [id, player] of this.state.players) {
        if (!player.alive) continue;
        const distance = planarDistance(monster, player);
        if (distance < nearest) {
          nearest = distance;
          target = player;
          targetId = id;
        }
      }
    }

    if (target) {
      monster.targetId = targetId;
      const distance = planarDistance(monster, target);
      monster.facing = facingTo(target.x - monster.x, target.z - monster.z);
      if (distance > RULES.monsterAttackRange) {
        monster.aiState = "chase";
        this.moveMonster(target, RULES.monsterChaseSpeed * dt);
      } else {
        monster.aiState = "attack";
        this.monsterAttack(targetId, target);
      }
      return;
    }

    monster.targetId = "";
    // Simple deterministic patrol around the spawn, controlled by server time.
    const phase = this.simulatedMs / 2500;
    const destination = {
      x: spawn.x + Math.cos(phase) * RULES.monsterPatrolRadius,
      z: spawn.z + Math.sin(phase) * RULES.monsterPatrolRadius,
    };
    monster.aiState = "patrol";
    this.moveMonster(destination, RULES.monsterPatrolSpeed * dt);
  }

  private moveMonster(target: Vec2, step: number) {
    const monster = this.state.monster;
    const dx = target.x - monster.x;
    const dz = target.z - monster.z;
    const next = stepTowards(monster, target, step);
    if (next.moved) monster.facing = facingTo(dx, dz);
    monster.x = clampToMap(next.x);
    monster.z = clampToMap(next.z);
  }

  private monsterAttack(targetId: string, target: Player) {
    if (!target.alive) return;
    if (planarDistance(this.state.monster, target) > RULES.monsterAttackRange) return;
    if (this.simulatedMs - this.lastMonsterAttackMs < RULES.monsterAttackCooldownMs) return;
    this.lastMonsterAttackMs = this.simulatedMs;

    target.hp = Math.max(0, target.hp - RULES.monsterAttackDamage);
    target.hitSeq += 1;
    this.broadcast("monster_hit", {
      targetId,
      attackerId: RULES.monsterId,
      damage: RULES.monsterAttackDamage,
      hp: target.hp,
      maxHp: target.maxHp,
      hitSeq: target.hitSeq,
    }, { afterNextPatch: true });

    if (target.hp === 0) {
      target.alive = false;
      target.combatState = "dead";
      target.targetId = "";
      this.destinations.delete(targetId);
      this.attackTargets.delete(targetId);
      this.playerRespawnAt.set(targetId, this.simulatedMs + RULES.playerRespawnMs);
      this.state.monster.targetId = "";
      this.broadcast("player_down", { playerId: targetId });
    }
  }

  private updateRespawns() {
    const monster = this.state.monster;
    if (!monster.alive && this.monsterRespawnAt &&
        this.simulatedMs >= this.monsterRespawnAt) {
      monster.hp = monster.maxHp;
      monster.x = RULES.monsterSpawnX;
      monster.z = RULES.monsterSpawnZ;
      monster.facing = 0;
      monster.alive = true;
      monster.aiState = "patrol";
      monster.targetId = "";
      this.monsterRespawnAt = 0;
      this.lastMonsterAttackMs = -Infinity;
      this.broadcast("monster_respawn", { targetId: RULES.monsterId });
    }

    for (const [id, atMs] of this.playerRespawnAt) {
      if (this.simulatedMs < atMs) continue;
      this.playerRespawnAt.delete(id);
      const player = this.state.players.get(id);
      if (!player) continue;
      const spawn = this.playerSpawn.get(id) ?? { x: 0, z: 0 };
      player.hp = player.maxHp;
      player.alive = true;
      player.x = spawn.x;
      player.z = spawn.z;
      player.facing = 0;
      player.combatState = "idle";
      player.targetId = "";
      this.lastAttackMs.delete(id);
      this.broadcast("player_respawn", { playerId: id });
    }
  }

  private endAttack(id: string, player: Player) {
    this.attackTargets.delete(id);
    player.targetId = "";
    player.combatState = "idle";
  }

  onJoin(client: Client) {
    const spawnX = this.state.players.size * 2;
    const spawn = { x: spawnX, z: 0 };
    const player = new Player({
      x: spawnX, y: 0, z: 0,
      facing: 0, hp: RULES.playerMaxHp, maxHp: RULES.playerMaxHp,
      alive: true, combatState: "idle", targetId: "",
    });

    this.state.players.set(client.sessionId, player);
    this.playerSpawn.set(client.sessionId, spawn);
    this.gates.set(client.sessionId, {
      move: new CommandBucket(RULES.moveBurst, RULES.moveRatePerSecond, this.simulatedMs),
      attack: new CommandBucket(RULES.attackBurst, RULES.attackRatePerSecond, this.simulatedMs),
    });
    console.log("MONTRA S1 join:", client.sessionId, "room", this.roomId);
  }

  onLeave(client: Client, code: CloseCode) {
    const id = client.sessionId;
    this.destinations.delete(id);
    this.attackTargets.delete(id);
    this.lastAttackMs.delete(id);
    this.playerRespawnAt.delete(id);
    this.playerSpawn.delete(id);
    this.gates.delete(id);
    this.lastRejectNoticeMs.delete(id);
    this.state.players.delete(id);
    if (this.state.monster.targetId === id) this.state.monster.targetId = "";
    console.log("MONTRA S1 leave:", id, code);
  }

  onDispose() {
    this.destinations.clear();
    this.attackTargets.clear();
    this.lastAttackMs.clear();
    this.playerRespawnAt.clear();
    this.playerSpawn.clear();
    this.gates.clear();
    this.lastRejectNoticeMs.clear();
    console.log("MONTRA S1 room disposed:", this.roomId);
  }
}
