import { Room, type Client, type CloseCode } from "colyseus";
import {
  CHARACTER_SAVE_INTERVAL_MS, characterStore, characterIdFromToken,
  claimCharacter, releaseCharacter, getGuestToken, parseCharacterName,
} from "./CharacterStore.js";
import { MyRoomState, Player, SummonedGuardian } from "./schema/MyRoomState.js";
import {
  RULES,
  CommandBucket,
  type Vec2,
  clampToMap,
  facingTo,
  parseMoveCommand,
  parseAttackCommand,
  parsePkTargetCommand,
  parseEmptyCommand,
  planarDistance,
  stepTowards,
} from "./GameRules.js";
import {
  FORT, distance3d, isOnPlatform, isOnGround, isOnTop, touchesWallBody,
  parseClimbRequest, progressClimb, step3d, wallBlocksShot,
  type WorldPoint,
} from "./HeightRules.js";
import {
  MonsterRRTNavigator, isMonsterSegmentClear,
} from "./MonsterRRT.js";

type Gates = {
  move: CommandBucket; attack: CommandBucket; summon: CommandBucket;
  climb: CommandBucket;
};

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
  private persistentCharacters = new Map<string, string>(); // session -> digest, never token
  private lastRenameMs = new Map<string, number>();
  private nextCharacterSaveMs = CHARACTER_SAVE_INTERVAL_MS;

  private monsterRespawnAt = 0;
  private lastMonsterAttackMs = -Infinity;
  private monsterReturning = false;
  // RRT only replaces NPC navigation. All AI intent/combat rules stay put.
  private monsterNavigator = new MonsterRRTNavigator();

  // All guardian state lives on the server; no client may select NPC stats.
  private lastSummonAt = new Map<string, number>();
  private lastSummonAttackAt = new Map<string, number>();
  private climbs = new Map<string, WorldPoint>();

  messages = {
    rename_character: (client: Client, message: unknown) => {
      const name = parseCharacterName(message);
      if (!name) return this.reject(client, "invalid_character_name");
      const id = client.sessionId;
      const player = this.state.players.get(id);
      if (!player || !this.persistentCharacters.has(id)) return this.reject(client, "character_not_persistent");
      if (this.simulatedMs - (this.lastRenameMs.get(id) ?? -Infinity) < 5_000) {
        return this.reject(client, "rename_cooldown");
      }
      if (player.characterName === name) return;
      this.lastRenameMs.set(id, this.simulatedMs);
      player.characterName = name;
      void this.saveCharacter(id);
    },
    move: (client: Client, message: unknown) => {
      const destination = parseMoveCommand(message);
      if (!destination) return this.reject(client, "invalid_move");
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      if (this.climbs.has(client.sessionId)) return this.reject(client, "climbing");
      if (isOnPlatform(player.y) && !isOnTop(destination.x, destination.z)) {
        return this.reject(client, "must_descend");
      }
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
      const pkOrder = monsterOrder ? null : parsePkTargetCommand(message);
      if (!monsterOrder && !pkOrder) return this.reject(client, "invalid_attack");

      const attackerId = client.sessionId;
      const attacker = this.state.players.get(attackerId);
      if (!attacker || !attacker.alive) return this.reject(client, "not_alive");
      if (this.climbs.has(attackerId)) return this.reject(client, "climbing");
      if (!this.gates.get(attackerId)?.attack.consume(this.simulatedMs)) {
        return this.reject(client, "attack_rate_limited");
      }

      // Only the server-issued session ID of ANOTHER live player in the
      // same room is eligible for PK. No duel agreement is required.
      const targetId = monsterOrder ? RULES.monsterId : pkOrder!.targetId;
      if (targetId === attackerId) return this.reject(client, "self_attack");
      const target = monsterOrder
        ? (this.state.monster.alive ? this.state.monster : undefined)
        : this.state.players.get(targetId);

      if (!target || !target.alive) {
        return this.reject(client, monsterOrder ? "monster_down" : "target_unavailable");
      }

      // Tap to attack: cancel manual travel, then follow the target each tick.
      this.destinations.delete(attackerId);
      this.attackTargets.set(attackerId, targetId);
      attacker.targetId = targetId;

      const attackRange = monsterOrder ? RULES.playerAttackRange : RULES.pkAttackRange;
      // Wall/vertical separation cannot be solved by a ground-only chase.
      if (Math.abs(attacker.y - target.y) > attackRange) {
        this.attackTargets.delete(attackerId);
        attacker.targetId = "";
        return this.reject(client, "melee_height_blocked");
      }
      if (distance3d(attacker, target) > attackRange) {
        attacker.combatState = "approaching";
        client.send("combat_notice", { reason: "approaching" });
      } else {
        attacker.combatState = "attacking";
      }
    },

    summon: (client: Client, message: unknown) => {
      const id = client.sessionId;
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_summon");
      const owner = this.state.players.get(id);
      if (!owner || !owner.alive) return this.reject(client, "not_alive");
      if (this.state.summons.has(id)) return this.reject(client, "summon_limit");
      if (!this.gates.get(id)?.summon.consume(this.simulatedMs)) {
        return this.reject(client, "summon_rate_limited");
      }
      const last = this.lastSummonAt.get(id) ?? -Infinity;
      if (this.simulatedMs - last < RULES.summonCooldownMs) {
        return this.reject(client, "summon_cooldown");
      }
      this.lastSummonAt.set(id, this.simulatedMs);

      const guardian = new SummonedGuardian({
        ownerId: id, kind: "guardian",
        x: clampToMap(owner.x - 1.1), y: owner.y, z: clampToMap(owner.z + 0.9),
        facing: owner.facing, action: "follow", targetId: "",
      });
      this.state.summons.set(id, guardian);
      this.lastSummonAttackAt.delete(id);
      this.broadcast("summon_spawn", { ownerId: id, kind: "guardian" },
        { afterNextPatch: true });
    },

    unsummon: (client: Client, message: unknown) => {
      const id = client.sessionId;
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_unsummon");
      if (!this.state.summons.has(id)) return this.reject(client, "no_summon");
      if (!this.gates.get(id)?.summon.consume(this.simulatedMs)) {
        return this.reject(client, "summon_rate_limited");
      }
      this.despawnSummon(id, "dismissed");
    },

    // The client never writes Y. A validated ladder is the only route
    // between ground y=0 and the watchwall top y=4.
    climb: (client: Client, message: unknown) => {
      const order = parseClimbRequest(message);
      if (!order) return this.reject(client, "invalid_climb");
      const id = client.sessionId;
      const player = this.state.players.get(id);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      if (this.climbs.has(id)) return this.reject(client, "already_climbing");
      if (!this.gates.get(id)?.climb.consume(this.simulatedMs)) {
        return this.reject(client, "climb_rate_limited");
      }

      const upward = order.direction === "up";
      if (upward && !isOnGround(player.y)) return this.reject(client, "not_on_ground");
      if (!upward && !isOnPlatform(player.y)) return this.reject(client, "not_on_wall");

      const ladderPosition = upward
        ? {x:FORT.ladderFootX,z:FORT.ladderFootZ}
        : {x:FORT.ladderTopX,z:FORT.ladderTopZ};
      const maxReach = upward ? FORT.climbTriggerRadius : FORT.descendTriggerRadius;
      if (planarDistance(player, ladderPosition) > maxReach) {
        return this.reject(client, "ladder_too_far");
      }

      this.attackTargets.delete(id);
      this.destinations.delete(id);
      player.targetId = "";
      player.combatState = "climbing";
      this.climbs.set(id, upward
        ? {x:FORT.ladderTopX,y:FORT.height,z:FORT.ladderTopZ}
        : {x:FORT.ladderFootX,y:0,z:FORT.ladderFootZ});
      this.broadcast("climb_started", { playerId:id, direction:order.direction },
        { afterNextPatch:true });
    },

    // One targeted magic projectile per valid click; server computes muzzle,
    // target body position, 3D range, line of sight, damage and cooldown.
    shoot: (client: Client, message: unknown) => {
      const monsterOrder = parseAttackCommand(message);
      const pkOrder = monsterOrder ? null : parsePkTargetCommand(message);
      if (!monsterOrder && !pkOrder) return this.reject(client, "invalid_shoot");
      const id = client.sessionId;
      const shooter = this.state.players.get(id);
      if (!shooter || !shooter.alive) return this.reject(client, "not_alive");
      if (this.climbs.has(id)) return this.reject(client, "climbing");
      if (!this.gates.get(id)?.attack.consume(this.simulatedMs)) {
        return this.reject(client, "attack_rate_limited");
      }

      const targetId = monsterOrder ? RULES.monsterId : pkOrder!.targetId;
      if (targetId === id) return this.reject(client, "self_attack");
      const target = monsterOrder
        ? this.state.monster
        : this.state.players.get(targetId);
      if (!target || !target.alive) return this.reject(client, "target_unavailable");

      const from = { x:shooter.x, y:shooter.y+FORT.shootOriginHeight, z:shooter.z };
      const to = { x:target.x, y:target.y + FORT.targetBodyHeight, z:target.z };
      if (distance3d(from,to) > FORT.rangedRange) {
        return this.reject(client, "shot_out_of_range");
      }
      if (wallBlocksShot(from,to)) {
        return this.reject(client, "shot_blocked");
      }

      const last = this.lastAttackMs.get(id) ?? -Infinity;
      if (this.simulatedMs-last < FORT.rangedCooldownMs) {
        return this.reject(client, "shot_cooldown");
      }
      this.lastAttackMs.set(id,this.simulatedMs);
      shooter.facing = facingTo(target.x-shooter.x, target.z-shooter.z);

      if (monsterOrder) {
        const ghost = this.state.monster;
        ghost.hp = Math.max(0,ghost.hp-FORT.rangedDamage);
        ghost.hitSeq += 1;
        this.broadcast("combat_hit", {
          attackerId:id,targetId,damage:FORT.rangedDamage,
          hp:ghost.hp,maxHp:ghost.maxHp,hitSeq:ghost.hitSeq,source:"ranged",
        }, { afterNextPatch:true });
        if (ghost.hp===0) this.killMonster();
      } else {
        const victim=target as Player;
        victim.hp=Math.max(0,victim.hp-FORT.rangedDamage);
        victim.hitSeq+=1;
        this.broadcast("pvp_hit", {
          attackerId:id,targetId,damage:FORT.rangedDamage,
          hp:victim.hp,maxHp:victim.maxHp,hitSeq:victim.hitSeq,source:"ranged",
        }, { afterNextPatch:true });
        if (victim.hp===0) {
          shooter.pkKills+=1;
          victim.pkDeaths+=1;
          this.knockoutPlayer(targetId,"pk",id);
          void this.saveCharacter(id);
          this.broadcast("pvp_kill", {
            winnerId:id,loserId:targetId,source:"ranged",
            kills:shooter.pkKills,deaths:victim.pkDeaths,
          }, { afterNextPatch:true });
        }
      }

      this.broadcast("ranged_hit", {
        attackerId:id,targetId,damage:FORT.rangedDamage,from,to,
      }, { afterNextPatch:true });
    },
  };

  private despawnSummon(ownerId: string, reason: string) {
    if (!this.state.summons.has(ownerId)) return;
    this.state.summons.delete(ownerId);
    this.lastSummonAttackAt.delete(ownerId);
    this.broadcast("summon_despawn", { ownerId, reason },
      { afterNextPatch: true });
  }

  private findSummonTarget(ownerId: string, owner: Player) {
    const intended = this.attackTargets.get(ownerId);
    const candidates: string[] = [];
    if (intended) candidates.push(intended);

    // A guardian defends its owner when another player is actively attacking.
    // It does not randomly attack neutral people in this Free PK world.
    for (const [otherId, targetId] of this.attackTargets) {
      if (otherId !== ownerId && targetId === ownerId) candidates.push(otherId);
    }
    if (this.state.monster.targetId === ownerId) candidates.push(RULES.monsterId);

    for (const targetId of candidates) {
      if (targetId === ownerId) continue;
      const target = targetId === RULES.monsterId
        ? this.state.monster : this.state.players.get(targetId);
      if (!target || !target.alive) continue;
      // Guard's combat tether prevents hits across the map even if another
      // client sends a valid but distant target ID.
      if (distance3d(owner, target) > RULES.summonEngageDistance) continue;
      return { targetId, target };
    }
    return null;
  }

  private updateSummons(dt: number) {
    for (const [ownerId, guardian] of [...this.state.summons]) {
      const owner = this.state.players.get(ownerId);
      if (!owner || !owner.alive) {
        this.despawnSummon(ownerId, "owner_unavailable");
        continue;
      }

      const distanceToOwner = distance3d(guardian, owner);
      const candidate = distanceToOwner <= RULES.summonLeashDistance
        ? this.findSummonTarget(ownerId, owner) : null;

      if (candidate) {
        const { targetId, target } = candidate;
        const dx = target.x - guardian.x;
        const dz = target.z - guardian.z;
        const distance = distance3d(guardian,target);
        guardian.targetId = targetId;
        if (distance > 0.001) guardian.facing = facingTo(dx, dz);

        if (distance <= RULES.summonAttackRange) {
          guardian.action = "attack";
          this.trySummonAttack(ownerId, guardian, targetId);
        } else {
          guardian.action = "chase";
          const next = step3d(
            guardian, target, RULES.summonMoveSpeed * dt
          );
          guardian.x = clampToMap(next.point.x);
          guardian.y = next.point.y;
          guardian.z = clampToMap(next.point.z);
        }
        continue;
      }

      // Follow the owner on the left side, rather than standing at spawn.
      // All positions and animation states are resolved by fixed server ticks.
      guardian.targetId = "";
      const desired = {
        x: clampToMap(owner.x - 1.0),
        y: owner.y,
        z: clampToMap(owner.z + 0.85),
      };
      const dx = desired.x - guardian.x;
      const dz = desired.z - guardian.z;
      const distance = distance3d(guardian,desired);
      guardian.action = "follow";
      if (distance > RULES.summonFollowDistance) {
        const next = step3d(
          guardian, desired, RULES.summonMoveSpeed * dt
        );
        guardian.x = clampToMap(next.point.x);
        guardian.y = next.point.y;
        guardian.z = clampToMap(next.point.z);
        if (next.moved) guardian.facing = facingTo(dx, dz);
      } else {
        guardian.facing = owner.facing;
      }
    }
  }

  private trySummonAttack(ownerId: string, guardian: SummonedGuardian, targetId: string) {
    const owner = this.state.players.get(ownerId);
    const sameGuardian = this.state.summons.get(ownerId) === guardian;
    if (!owner || !owner.alive || !sameGuardian) return;

    const isMonster = targetId === RULES.monsterId;
    const target = isMonster
      ? this.state.monster : this.state.players.get(targetId);
    if (!target || !target.alive || targetId === ownerId) return;
    if (distance3d(owner, target) > RULES.summonEngageDistance) return;
    if (distance3d(guardian, target) > RULES.summonAttackRange + 0.00001) return;

    const last = this.lastSummonAttackAt.get(ownerId) ?? -Infinity;
    if (this.simulatedMs - last < RULES.summonAttackCooldownMs) return;
    this.lastSummonAttackAt.set(ownerId, this.simulatedMs);
    guardian.hitSeq += 1;

    if (isMonster) {
      const monster = this.state.monster;
      monster.hp = Math.max(0, monster.hp - RULES.summonAttackDamage);
      monster.hitSeq += 1;
      this.broadcast("summon_hit", {
        ownerId, summonId: ownerId, targetId,
        damage: RULES.summonAttackDamage, hp: monster.hp,
        hitSeq: guardian.hitSeq,
      }, { afterNextPatch: true });
      if (monster.hp === 0) this.killMonster();
      return;
    }

    // Summon can help in Free PK only when its owner selected or was attacked
    // by this opponent. Damage/kill attribution belongs to the owner.
    const victim = target as Player;
    victim.hp = Math.max(0, victim.hp - RULES.summonAttackDamage);
    victim.hitSeq += 1;
    this.broadcast("pvp_hit", {
      attackerId: ownerId, source: "summon", summonOwnerId: ownerId,
      targetId, damage: RULES.summonAttackDamage,
      hp: victim.hp, maxHp: victim.maxHp, hitSeq: victim.hitSeq,
    }, { afterNextPatch: true });
    if (victim.hp === 0) {
      owner.pkKills += 1;
      victim.pkDeaths += 1;
      this.knockoutPlayer(targetId, "pk", ownerId);
      void this.saveCharacter(ownerId);
      this.broadcast("pvp_kill", {
        winnerId: ownerId, loserId: targetId,
        source: "summon",
        kills: owner.pkKills, deaths: victim.pkDeaths,
      }, { afterNextPatch: true });
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

    const fort = this.state.fortification;
    fort.id = FORT.id;
    fort.x = FORT.x;
    fort.z = FORT.z;
    fort.width = FORT.width;
    fort.length = FORT.length;
    fort.height = FORT.height;
    fort.ladderFootX = FORT.ladderFootX;
    fort.ladderFootZ = FORT.ladderFootZ;
    fort.ladderTopX = FORT.ladderTopX;
    fort.ladderTopZ = FORT.ladderTopZ;

    console.log("MONTRA Elevation Engine started:", this.roomId);
  }

  private tick(dt: number) {
    this.updateRespawns();
    this.updateClimbs(dt);
    this.updatePlayerMovement(dt);
    this.updateMonsterAI(dt);
    this.updatePlayerAttacks();
    this.updateSummons(dt);
    if (this.simulatedMs >= this.nextCharacterSaveMs) {
      this.nextCharacterSaveMs = this.simulatedMs + CHARACTER_SAVE_INTERVAL_MS;
      for (const id of this.persistentCharacters.keys()) void this.saveCharacter(id);
    }
  }

  private updateClimbs(dt: number) {
    for (const [id,destination] of [...this.climbs]) {
      const player = this.state.players.get(id);
      if (!player || !player.alive) {
        this.climbs.delete(id);
        continue;
      }
      const next = progressClimb(player, destination, dt);
      player.x = clampToMap(next.point.x);
      player.y = next.point.y;
      player.z = clampToMap(next.point.z);
      player.facing = facingTo(destination.x-player.x, destination.z-player.z);
      player.combatState = "climbing";
      if (next.arrived) {
        this.climbs.delete(id);
        player.combatState = "idle";
        this.broadcast("climb_finished", {
          playerId:id, height:player.y,
        }, { afterNextPatch:true });
      }
    }
  }

  private canOccupy(x: number, z: number, feetY: number): boolean {
    if (isOnPlatform(feetY)) return isOnTop(x,z);
    if (isOnGround(feetY)) return !touchesWallBody(x,z);
    return false; // Only the server's climb state can cross heights.
  }

  private updatePlayerMovement(dt: number) {
    const monster = this.state.monster;
    for (const [sessionId, player] of this.state.players) {
      if (!player.alive || this.climbs.has(sessionId)) continue;

      const targetId = this.attackTargets.get(sessionId);
      if (targetId) {
        const isMonster = targetId === RULES.monsterId;
        const target = isMonster
          ? (monster.alive ? monster : undefined)
          : this.state.players.get(targetId);

        if (!target || !target.alive || targetId === sessionId) {
          this.endAttack(sessionId, player);
          continue;
        }
        const dx = target.x - player.x;
        const dz = target.z - player.z;
        const distance = distance3d(player, target);
        player.targetId = targetId;
        player.facing = facingTo(dx, dz);

        const attackRange = isMonster ? RULES.playerAttackRange : RULES.pkAttackRange;
        if (Math.abs(player.y - target.y) > attackRange) {
          this.endAttack(sessionId, player);
          continue;
        }
        if (distance <= attackRange) {
          player.combatState = "attacking";
          continue;
        }

        // Recalculate every fixed tick so moving players can be chased.
        // Never teleport, regardless of where the client taps.
        const stopDistance = attackRange - 0.4;
        const ratio = Math.max(0, (distance - stopDistance) / distance);
        const approach = {
          x: clampToMap(player.x + dx * ratio),
          z: clampToMap(player.z + dz * ratio),
        };
        const next = stepTowards(player, approach, RULES.playerSpeed * dt);
        if (this.canOccupy(next.x,next.z,player.y)) {
          player.x=next.x; player.z=next.z;
          player.combatState = "approaching";
        } else {
          this.endAttack(sessionId,player);
        }
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
      if (this.canOccupy(next.x,next.z,player.y)) {
        player.x=next.x;
        player.z=next.z;
      } else {
        // Slide on the wall face if a legal axis exists; never tunnel through
        // solid geometry via client destinations or elevated edge tapping.
        if (this.canOccupy(next.x,player.z,player.y)) player.x=next.x;
        else if (this.canOccupy(player.x,next.z,player.y)) player.z=next.z;
        else {
          this.destinations.delete(sessionId);
          player.combatState = "idle";
          continue;
        }
      }
      const arrived = Math.hypot(target.x-player.x,target.z-player.z) < .035;
      player.combatState = arrived ? "idle" : "moving";
      if (arrived) this.destinations.delete(sessionId);
    }
  }

  private updatePlayerAttacks() {
    const monster = this.state.monster;
    for (const [attackerId, targetId] of [...this.attackTargets]) {
      const attacker = this.state.players.get(attackerId);
      if (!attacker || !attacker.alive) {
        this.attackTargets.delete(attackerId);
        continue;
      }

      const isMonster = targetId === RULES.monsterId;
      const target = isMonster
        ? (monster.alive ? monster : undefined)
        : this.state.players.get(targetId);
      if (!target || !target.alive || targetId === attackerId) {
        this.endAttack(attackerId, attacker);
        continue;
      }

      const range = isMonster ? RULES.playerAttackRange : RULES.pkAttackRange;
      if (distance3d(attacker,target) > range + 0.00001 ||
          wallBlocksShot(
            {x:attacker.x,y:attacker.y+1.1,z:attacker.z},
            {x:target.x,y:target.y+1.0,z:target.z}
          )) continue;
      attacker.facing = facingTo(target.x - attacker.x, target.z - attacker.z);
      attacker.combatState = "attacking";

      // Same cooldown clock for PvP and PvE. Switching targets cannot
      // bypass cooldown or borrow a timestamp supplied by the browser.
      const cooldown = isMonster ? RULES.playerAttackCooldownMs : RULES.pkCooldownMs;
      const last = this.lastAttackMs.get(attackerId) ?? -Infinity;
      if (this.simulatedMs - last < cooldown) continue;
      this.lastAttackMs.set(attackerId, this.simulatedMs);

      if (isMonster) {
        monster.hp = Math.max(0, monster.hp - RULES.playerAttackDamage);
        monster.hitSeq += 1;
        this.broadcast("combat_hit", {
          targetId: RULES.monsterId,
          attackerId, damage: RULES.playerAttackDamage,
          hp: monster.hp, maxHp: monster.maxHp, hitSeq: monster.hitSeq,
        }, { afterNextPatch: true });
        if (monster.hp === 0) this.killMonster();
        continue;
      }

      // FREE PK: health, range, damage, respawn and kill credit are wholly
      // server-owned. The client only submits another session's targetId.
      const victim = target as Player;
      victim.hp = Math.max(0, victim.hp - RULES.pkDamage);
      victim.hitSeq += 1;
      this.broadcast("pvp_hit", {
        attackerId, targetId, damage: RULES.pkDamage,
        hp: victim.hp, maxHp: victim.maxHp, hitSeq: victim.hitSeq,
      }, { afterNextPatch: true });

      if (victim.hp === 0) {
        attacker.pkKills += 1;
        victim.pkDeaths += 1;
        this.knockoutPlayer(targetId, "pk", attackerId);
        void this.saveCharacter(attackerId);
        this.broadcast("pvp_kill", {
          winnerId: attackerId, loserId: targetId,
          kills: attacker.pkKills, deaths: victim.pkDeaths,
        }, { afterNextPatch: true });
      }
    }
  }

  private knockoutPlayer(id: string, cause: "pk" | "monster", attackerId = "") {
    const victim = this.state.players.get(id);
    if (!victim || !victim.alive) return;
    victim.hp = 0;
    victim.alive = false;
    victim.combatState = "dead";
    victim.targetId = "";
    this.climbs.delete(id);
    this.despawnSummon(id, "owner_dead");
    this.destinations.delete(id);
    this.attackTargets.delete(id);
    this.playerRespawnAt.set(id, this.simulatedMs + RULES.playerRespawnMs);
    void this.saveCharacter(id);

    // Everyone chasing this human stops when the target dies. No
    // duplicated damage on a corpse, and no stale targets after respawn.
    for (const [otherId, targetId] of [...this.attackTargets]) {
      if (targetId !== id) continue;
      const other = this.state.players.get(otherId);
      if (other) this.endAttack(otherId, other);
      else this.attackTargets.delete(otherId);
    }
    if (this.state.monster.targetId === id) this.state.monster.targetId = "";
    this.broadcast("player_down", {
      playerId: id, source: cause, attackerId,
    }, { afterNextPatch: true });
  }

  private killMonster() {
    const monster = this.state.monster;
    monster.alive = false;
    monster.hp = 0;
    this.monsterNavigator.clear();
    monster.aiState = "dead";
    monster.targetId = "";
    this.monsterRespawnAt = this.simulatedMs + RULES.monsterRespawnMs;
    this.monsterReturning = false;

    // Only cancel PvE attacks on this monster. Concurrent Free PK fights
    // must continue even when someone else defeats the ghost.
    for (const [id, targetId] of [...this.attackTargets]) {
      if (targetId !== RULES.monsterId) continue;
      const player = this.state.players.get(id);
      if (player) this.endAttack(id, player);
      else this.attackTargets.delete(id);
    }
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
      this.moveMonster(spawn, RULES.monsterChaseSpeed * dt, "return");
      if (planarDistance(monster, spawn) < 0.2) this.monsterReturning = false;
      return;
    }

    // Keep an existing target if it is alive and remains in the combat area.
    let targetId = monster.targetId;
    let target = targetId ? this.state.players.get(targetId) : undefined;
    if (!target || !target.alive || !isOnGround(target.y) ||
        planarDistance(monster, target) > RULES.monsterGiveUpRadius) {
      target = undefined;
      targetId = "";
    }

    // No shared targeting oracle: this NPC sees only characters within aggro.
    if (!target) {
      let nearest: number = RULES.monsterAggroRadius;
      for (const [id, player] of this.state.players) {
        if (!player.alive || !isOnGround(player.y)) continue;
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
        this.moveMonster(target, RULES.monsterChaseSpeed * dt, "chase:" + targetId);
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
    this.moveMonster(destination, RULES.monsterPatrolSpeed * dt, "patrol");
  }

  /** RRT routes around obstacles; movement speed remains RULES-based.
   * Planning runs roughly once every 1.3 seconds for a moving target, while
   * the server still applies at most one legal movement step per 20Hz tick.
   */
  private moveMonster(target: Vec2, step: number, intent: string) {
    const monster = this.state.monster;
    const waypoint = this.monsterNavigator.nextWaypoint(
      monster, target, this.simulatedMs, intent
    );
    if (!waypoint) return; // Never fall back to walking through the wall.

    const dx = waypoint.x-monster.x;
    const dz = waypoint.z-monster.z;
    const next = stepTowards(monster, waypoint, step);
    if (!next.moved || !isMonsterSegmentClear(monster, next)) return;

    monster.facing = facingTo(dx,dz);
    monster.x = clampToMap(next.x);
    monster.z = clampToMap(next.z);
  }

  private monsterAttack(targetId: string, target: Player) {
    if (!target.alive) return;
    if (distance3d(this.state.monster, target) > RULES.monsterAttackRange) return;
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
      this.knockoutPlayer(targetId, "monster");
    }
  }

  private updateRespawns() {
    const monster = this.state.monster;
    if (!monster.alive && this.monsterRespawnAt &&
        this.simulatedMs >= this.monsterRespawnAt) {
      monster.hp = monster.maxHp;
      this.monsterNavigator.clear();
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
      player.y = 0;
      player.z = spawn.z;
      this.climbs.delete(id);
      player.facing = 0;
      player.combatState = "idle";
      player.targetId = "";
      this.lastAttackMs.delete(id);
      this.broadcast("player_respawn", { playerId: id });
      void this.saveCharacter(id);
    }
  }

  private endAttack(id: string, player: Player) {
    this.attackTargets.delete(id);
    player.targetId = "";
    player.combatState = "idle";
  }

  private async saveCharacter(id: string): Promise<void> {
    const characterId = this.persistentCharacters.get(id);
    const player = this.state.players.get(id);
    if (!characterId || !player) return;
    try {
      await characterStore.save({
        version: 1, id: characterId, name: player.characterName,
        level: player.level, experience: player.experience,
        pkKills: player.pkKills, pkDeaths: player.pkDeaths,
        x: player.x, y: player.y, z: player.z, hp: Math.max(0, Math.round(player.hp)),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("MONTRA S2 save failed for", id, error);
      this.clients.find((client) => client.sessionId === id)
        ?.send("character_save_error", { reason: "disk_write_failed" });
    }
  }

  async onJoin(client: Client, options?: unknown) {
    const spawnX = this.state.players.size * 2;
    const spawn = { x: spawnX, z: 0 };
    // Old smoke tests and clients without browser storage remain transient.
    // A valid guest token is a secret bearer credential, never sent in Schema.
    const token = getGuestToken(options);
    const characterId = token ? characterIdFromToken(token) : null;
    if (characterId && !claimCharacter(characterId, client.sessionId)) {
      throw new Error("character_already_online");
    }

    try {
      const saved = token ? (await characterStore.loadOrCreate(token, spawn)).character : null;
      // A saved location is restored only if the current server geometry allows it.
      const validPosition = saved && Math.abs(saved.x) <= RULES.mapLimit &&
        Math.abs(saved.z) <= RULES.mapLimit && this.canOccupy(saved.x, saved.z, saved.y);
      const player = new Player({
        x: validPosition ? saved.x : spawn.x,
        y: validPosition ? saved.y : 0,
        z: validPosition ? saved.z : spawn.z,
        facing: 0,
        hp: saved && saved.hp > 0 ? Math.min(saved.hp, RULES.playerMaxHp) : RULES.playerMaxHp,
        maxHp: RULES.playerMaxHp,
        alive: true, combatState: "idle", targetId: "",
        pkKills: saved?.pkKills ?? 0, pkDeaths: saved?.pkDeaths ?? 0,
        characterId: characterId ? characterId.slice(0, 12) : "",
        characterName: saved?.name ?? "นที",
        level: saved?.level ?? 1, experience: saved?.experience ?? 0,
        persistent: Boolean(saved),
      });

      this.state.players.set(client.sessionId, player);
      if (characterId) this.persistentCharacters.set(client.sessionId, characterId);
      this.playerSpawn.set(client.sessionId, spawn);
      this.gates.set(client.sessionId, {
        move: new CommandBucket(RULES.moveBurst, RULES.moveRatePerSecond, this.simulatedMs),
        attack: new CommandBucket(RULES.attackBurst, RULES.attackRatePerSecond, this.simulatedMs),
        summon: new CommandBucket(
          RULES.summonCommandBurst, RULES.summonCommandRatePerSecond, this.simulatedMs
        ),
        climb: new CommandBucket(3, 1, this.simulatedMs),
      });
      console.log("MONTRA S2 join:", client.sessionId, "room", this.roomId,
        saved ? "persistent" : "transient");
    } catch (error) {
      if (characterId) releaseCharacter(characterId, client.sessionId);
      throw error;
    }
  }

  async onLeave(client: Client, code: CloseCode) {
    const id = client.sessionId;
    const characterId = this.persistentCharacters.get(id);
    // Capture the snapshot BEFORE removing the player from server Schema.
    const saving = this.saveCharacter(id);
    this.despawnSummon(id, "owner_left");
    this.lastSummonAt.delete(id);
    this.climbs.delete(id);
    this.destinations.delete(id);
    this.attackTargets.delete(id);
    this.lastAttackMs.delete(id);
    this.playerRespawnAt.delete(id);
    this.playerSpawn.delete(id);
    this.gates.delete(id);
    this.lastRejectNoticeMs.delete(id);
    this.state.players.delete(id);
    this.lastRenameMs.delete(id);
    if (this.state.monster.targetId === id) this.state.monster.targetId = "";
    // Remote player targets cannot remain locked to disconnected sessions.
    for (const [otherId, targetId] of [...this.attackTargets]) {
      if (targetId !== id) continue;
      const attacker = this.state.players.get(otherId);
      if (attacker) this.endAttack(otherId, attacker);
      else this.attackTargets.delete(otherId);
    }
    try {
      await saving;
    } finally {
      this.persistentCharacters.delete(id);
      if (characterId) releaseCharacter(characterId, id);
    }
    console.log("MONTRA S2 leave:", id, code);
  }

  async onDispose() {
    const pending = [...this.persistentCharacters].map(async ([id, characterId]) => {
      try { await this.saveCharacter(id); }
      finally { releaseCharacter(characterId, id); }
    });
    await Promise.allSettled(pending);
    this.persistentCharacters.clear();
    this.lastRenameMs.clear();
    this.destinations.clear();
    this.attackTargets.clear();
    this.lastAttackMs.clear();
    this.playerRespawnAt.clear();
    this.playerSpawn.clear();
    this.gates.clear();
    this.lastRejectNoticeMs.clear();
    this.monsterNavigator.clear();
    this.lastSummonAt.clear();
    this.lastSummonAttackAt.clear();
    this.state.summons.clear();
    this.climbs.clear();
    console.log("MONTRA Elevation room disposed:", this.roomId);
  }
}
