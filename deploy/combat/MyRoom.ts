import { FORGE } from "./ForgeRules.js";
import { Room, matchMaker, type Client, type CloseCode } from "colyseus";
import { WAR_SIDE_SIZE, WAR_HOLD, warSites, type Battlefield, type WarSide } from "./TerritoryWar.js";
import { Encoder } from "@colyseus/schema";
import { randomUUID } from "node:crypto";
import {
  CHARACTER_SAVE_INTERVAL_MS, characterStore, characterIdFromToken,
  claimCharacter, releaseCharacter, getGuestToken, parseCharacterName,
  parseCharacterSlot, CHARACTER_SLOTS,
} from "./CharacterStore.js";
import { MyRoomState, Player, SummonedGuardian, type Monster } from "./schema/MyRoomState.js";
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
  FLIGHT, isFlightAltitude, flightLandingHeight, progressFlightHeight,
  type WorldPoint,
} from "./HeightRules.js";
import {
  MonsterRRTNavigator, isMonsterSegmentClear,
} from "./MonsterRRT.js";
import { parseDashCommand, advanceDash, type DashDirection } from "./DashRules.js";
import type { CharacterSnapshot } from "./CharacterStore.js";
import { isAtlasMap } from "./WorldAtlas.js";
import { TEMPLE_ID } from "./TempleMap.js";
import { SHRINE_GUARDIAN, DEFAULT_MAP_ID, getWorldMap, getSafeMapSpawn, isSafeWorldPoint, isRestArea, isWorldSegmentClear, VILLAGE_ARRIVALS, WORLD_ROOM_CAPACITY, WORLD_MAPS, WORLD_EXPANSION } from "./WorldMaps.js";
import { provinceShotClear, segmentIntersectsExpandedWall } from "./WorldMaps.js";
import { crestCorners, onRampart } from "./StrategicProvinces.js";
import { checkWarp, WARP_COMBAT_LOCK_MS } from "./WarpRules.js";
import { parseChatMessage } from "./ChatRules.js";
import { saveBugReport } from "./BugReports.js";
import { BuffBook, POSSESSION_BUFF, possessionCoolingDown, rememberPossessionCooldown } from "./Buffs.js";
import { BUILD_CATALOG, DEFAULT_WARD_TALENT, DUAL_SWORD, talentGroup, classSkill, parseBuild, type CharacterBuild } from "./CharacterBuilds.js";
import { BuffLedger } from "./BuffLedger.js";
import { calculateModifiedStats, STACKING_RULES } from "./StatModifiers.js";
import { POSSESSION_MODIFIER, TALISMAN, SWORD_SCHOOLS, SWORD_NODES, newSwordTree, emptySwordLoadouts, swordPoints, type SwordTree, type SwordSchool } from "./SkillCatalog.js";
import { MUAY_BASE_SKILLS, MUAY_COMBOS, MUAY_COMBO_MOVES, MUAY_COMBO_MULTIPLIER, MUAY_COMBO_WINDOW_MS, MUAY_FOLLOWUPS, MUAY_FOLLOWUP_WINDOW_MS, MUAY_MASTERY_GUIDES, MUAY_MASTERY_LABELS, MUAY_MASTERY_REQUIREMENTS, MUAY_INTERRUPT_MS, MUAY_INTERRUPT_IMMUNITY_MS, MUAY_GRAPPLE_HOLD_MS, MUAY_GRAPPLE_ESCAPE_STAMINA, MUAY_GRAPPLE_COUNTER_STAMINA, MUAY_GRAPPLE_COUNTER_WINDOW_MS, MUAY_GRAPPLE_COUNTER_RANGE, MUAY_PVP_COMBO_MULTIPLIER, MUAY_PVP_DAMAGE_MULTIPLIER, MUAY_LESSONS, MUAY_SCHOOLS, MUAY_SKILLS, MUAY_WRAP_ID, advanceMuayCombo, countsMuayTechnique, muayPoints, newMuayBook, newMuayLoadouts, type MuayBook, type MuaySchool, type MuayComboState, type MuayLessonId, type MuaySkillId, type MuayCooldowns } from "./MuayRules.js";
import { parseCraft, parseForge, parseMarketCreate, parseMarketAction, parseTradeRequest, parseTradeId, parseTradeOffer } from "./EconomyRules.js";
import type { TradeOffer } from "./EconomyStore.js";
import { guildStore, guildOnline, notifyGuilds, subscribeGuild, parseGuildName, GUILD_MAX_MEMBERS } from "./GuildStore.js";
import { PartyManager, PARTY_XP_RADIUS, type Party } from "./PartyManager.js";
import { partyMonsterShares, type PartyRewardMember } from "./PartyMonsterRewards.js";
import type { MonsterTier } from "./MonsterProfiles.js";
import { PROGRESSION, addExperience, calculateDamage, calculateStats, emptyAllocations,
  monsterExperience, pointsAvailable, xpForNextLevel, type Allocations } from "./Progression.js";
import {
  POTION_ID, POTION_COOLDOWN_MS, grantRewardPotion, grantStackReward, SHRINE_RECIPE, SHRINE_SHARD, parseUseItemCommand,
  useInventoryItem, parseEquipWeaponCommand, equipInventoryWeapon,
  equippedWeaponId, weaponBonuses, type InventorySnapshot,
} from "./ItemRules.js";

import { ForestEncounters } from "./ForestEncounters.js";

// A full world snapshot spans up to 48 KiB with ten occupied maps, before summons.
Encoder.BUFFER_SIZE = Math.max(Encoder.BUFFER_SIZE, 64 * 1024);

const warRoomKey=randomUUID();
const battleRooms=new Map<number,Promise<string>>();
const admissions=new Map<string,{roomId:string;ticket:string;guild:string;side:WarSide;expires:number}>();
async function battleRoom(field:Battlefield):Promise<string>{
  let room=battleRooms.get(field.seq);
  if(!room){
    room=matchMaker.createRoom("my_room",{warRoomKey,field}).then(r=>r.roomId);
    battleRooms.set(field.seq,room);
    try{await room;}catch(e){if(battleRooms.get(field.seq)===room)battleRooms.delete(field.seq);throw e;}
  }
  return room;
}
type Gates = {
  move: CommandBucket; attack: CommandBucket; summon: CommandBucket;
  climb: CommandBucket; dash: CommandBucket; flight: CommandBucket;
  chat: CommandBucket; bugReport: CommandBucket; possession: CommandBucket; build: CommandBucket; swordTree: CommandBucket; economy: CommandBucket; party: CommandBucket; guild: CommandBucket;
};

type ActiveDash = DashDirection & { remaining: number };
type TradeSession = { id:string; a:string; b:string; expires:number; offers:Record<string, TradeOffer>; items:Record<string,{itemId:string;quantity:number}|null>; fingerprints:Record<string,string>; confirmed:Set<string> };

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
  maxClients = WORLD_ROOM_CAPACITY;
  state = new MyRoomState();

  private forest = new ForestEncounters(this.state.monsters);
  private getMonster(id:string): Monster | undefined { return id === RULES.monsterId ? this.state.monster : this.state.monsters.get(id); }
  private simulatedMs = 0;
  private field?:Battlefield;
  private warSeats=new Map<string,{guild:string;side:WarSide}>();
  private warClients=new Set<string>();
  private warSent=new Map<string,string>();
  private nextWarSample=0;
  private gateClosed=false;
  private gateActions=new Map<string,number>();
  private battleActive=false;
  private destinations = new Map<string, Vec2>();
  private crestTurns=new Map<string,Vec2[]>();
  private activeDashes = new Map<string, ActiveDash>();
  private lastDashMs = new Map<string, number>();
  private attackTargets = new Map<string, string>();
  private lastAttackMs = new Map<string, number>();
  private lastCombatMs = new Map<string, number>();
  private lastWarpMs = new Map<string, number>();
  private provinceClients = new Set<string>();
  private atlasClients = new Set<string>();
  private templeClients = new Set<string>();
  private pendingWarps = new Set<string>();
  private statAllocations = new Map<string, Allocations>();
  private pendingRewards = new Map<string, Promise<void>>();
  private hpRegenRemainder = new Map<string, number>();
  private playerRespawnAt = new Map<string, number>();
  private playerSpawn = new Map<string, Vec2>();
  private gates = new Map<string, Gates>();
  private lastRejectNoticeMs = new Map<string, number>();
  private persistentCharacters = new Map<string, string>(); // session -> selected slot digest
  private activeGuestAccounts = new Map<string, string>(); // session -> legacy account digest
  private pendingCharacterLeaves = new Map<string, Promise<void>>(); // do not release before disk save
  private guestSlotIds = new Map<string, readonly string[]>(); // 3 derived IDs, never raw token
  private lastSlotListMs = new Map<string, number>();
  private lastRenameMs = new Map<string, number>();
  private nextCharacterSaveMs = CHARACTER_SAVE_INTERVAL_MS;
  // Inventory remains private per character, never broadcasts via Room Schema.
  private inventories = new Map<string, InventorySnapshot>();
  private pendingItemUses = new Map<string, Promise<void>>();
  private lastItemUseMs = new Map<string, number>();
  private lastInventoryReadMs = new Map<string, number>();
  private lastWeaponEquipMs = new Map<string, number>();
  private trades = new Map<string, TradeSession>();
  private parties = new PartyManager();
  private buffs = new BuffBook();
  private effects = new BuffLedger();
  private swordTrees = new Map<string, SwordTree>();
  private muayCooldowns = new Map<string, MuayCooldowns>();
  private muayCombos = new Map<string,MuayComboState>();
  private muayFollowups = new Map<string,{school:MuaySchool;targetId:string;until:number}>();
  private muayDefenseWindows = new Map<string,{kind:"parry"|"evade";until:number}>();
  private muayGrapples = new Map<string,{targetId:string;until:number}>();
  private muayHeldBy = new Map<string,string>();
  private muayGrappleImmunity = new Map<string,number>();
  private muayGrappleCounters = new Map<string,{targetId:string;until:number}>();
  private muayBooks = new Map<string, MuayBook>();
  private muayWrapGranted = new Set<string>();
  private swordCombos = new Map<string, {count:number; until:number}>();
  private swordGuards = new Map<string, {until:number; factor:number; direction:boolean; counterUntil:number}>();
  private guildSubscriptions = new Map<string,()=>void>();
  private guildInvites = new Map<string,{from:string;to:string;guildId:string;expires:number}>();

  private monsterRespawnAt = 0;
  private lastMonsterAttackMs = -Infinity;
  private monsterInterruptUntil = 0;
  private monsterInterruptResistUntil = 0;
  private monsterReturning = false;
  // RRT only replaces NPC navigation. All AI intent/combat rules stay put.
  private monsterNavigator = new MonsterRRTNavigator();

  // All guardian state lives on the server; no client may select NPC stats.
  private lastSummonAt = new Map<string, number>();
  private lastSummonAttackAt = new Map<string, number>();
  private climbs = new Map<string, WorldPoint>();
  private flightTransitions = new Map<string, { targetY: number; landing: boolean }>();

  private sameCombatMap(ownerId: string, targetId: string): boolean {
    const owner = this.state.players.get(ownerId);
    if (!owner || this.pendingWarps.has(ownerId) || this.pendingWarps.has(targetId)) return false;
    if (isRestArea(owner.mapId, owner)) return false;
    const monster = this.getMonster(targetId);
    if (monster) return owner.mapId === monster.mapId && !isRestArea(monster.mapId, monster);
    if(this.field && (!this.battleActive || this.warSeats.get(ownerId)?.side===this.warSeats.get(targetId)?.side))return false;
    if (!this.field && this.parties.get(ownerId)?.members.includes(targetId)) return false;
    const target = this.state.players.get(targetId);
    return Boolean(target && target.mapId === owner.mapId && !isRestArea(target.mapId,target));
  }

  private buildPlayer(client: Client, gate: "build" | "swordTree" = "build"): Player | undefined {
    const id = client.sessionId, player = this.state.players.get(id);
    if(this.muayControlled(id)) { this.reject(client,"muay_controlled"); return; }
    if (!this.gates.get(id)?.[gate].consume(this.simulatedMs)) {
      this.reject(client, gate === "swordTree" ? "sword_tree_rate_limited" : "build_rate_limited");
    } else if (!player?.alive || !this.persistentCharacters.has(id)) {
      this.reject(client, "build_unavailable");
    } else if (this.pendingWarps.has(id) || this.pendingItemUses.has(id) || this.pendingCharacterLeaves.has(id) || this.pendingRewards.has(id)) {
      this.reject(client, "character_busy");
    } else {
      return player;
    }
  }

  private playerBuild(player: Player): CharacterBuild | null {
    const base = {path: player.pathId, ancestry: player.ancestryId};
    // Keep default talents readable by builds predating the selection.
    const group = player.pathId === "blade" || player.pathId === "sentinel" ? talentGroup(player.pathId) : undefined;
    const id = player.bladeTalentId || player.wardTalentId;
    return parseBuild(group && id && id !== group.defaultId ? {...base, [group.field]:id} : base);
  }

  private selectBuild(client: Client, build: CharacterBuild): void {
    const id = client.sessionId, player = this.buildPlayer(client);
    if (!player) return;
    const atShrine = player.mapId === DEFAULT_MAP_ID && isOnGround(player.y) && Math.hypot(player.x, player.z) <= 6;
    if (!atShrine || this.simulatedMs - (this.lastCombatMs.get(id) ?? -Infinity) < PROGRESSION.combatQuietMs)
      return this.reject(client, "build_needs_shrine");
    if (player.classSkillReadyAt > Date.now()) return this.reject(client, "class_skill_cooldown");
    // An older client may send only path and ancestry when editing an existing build.
    const group = talentGroup(build.path);
    const previous = player.pathId === build.path ? this.playerBuild(player) : null;
    const talent = group ? build[group.field] ?? previous?.[group.field] ?? group.defaultId : "";
    const currentTalent = player.bladeTalentId || player.wardTalentId;
    if (player.pathId === build.path && player.ancestryId === build.ancestry && currentTalent === talent) return;
    const base = {path:build.path, ancestry:build.ancestry};
    const selection = group && talent !== group.defaultId ? {...base, [group.field]:talent} : base;
    const snapshot = this.captureCharacterSnapshot(id);
    if (!snapshot) return;
    let grantedInventory: InventorySnapshot | undefined;
    if (build.path === "muay_boran" && !this.muayWrapGranted.has(id)) {
      const inventory = this.inventories.get(id);
      if (!inventory) return this.reject(client,"build_unavailable");
      const slots = inventory.slots.slice(), existing = slots.findIndex(slot => slot?.itemId === MUAY_WRAP_ID);
      const slot = existing >= 0 ? existing : slots.findIndex(item => item === null);
      if (slot < 0) return this.reject(client,"muay_inventory_full");
      if (existing < 0) slots[slot] = {itemId:MUAY_WRAP_ID,quantity:1};
      grantedInventory = {...inventory, slots, equippedWeaponSlot:slot};
    }
    this.pendingWarps.add(id);
    const task = characterStore.save({ ...snapshot, build: selection, ...(grantedInventory ? {inventory:grantedInventory, muayWrapGranted:true} : {}) }).then(() => {
      player.pathId = build.path;
      player.ancestryId = build.ancestry;
      this.swordGuards.delete(id);
      this.clearMuayDefense(id,"cancelled");
      this.swordCombos.delete(id);
      this.clearMuayCombo(id);
      if (grantedInventory) {
        this.muayWrapGranted.add(id);
        this.inventories.set(id,grantedInventory);
        player.equippedWeaponId=MUAY_WRAP_ID;
        try { client.send("inventory_state",grantedInventory); } catch (error) { console.warn("MONTRA inventory notice was not delivered",error); }
      }
      player.wardTalentId = build.path === "sentinel" ? talent : "";
      player.bladeTalentId = build.path === "blade" ? talent : "";
      client.send("build_selected", selection);
    }, error => {
      console.error("MONTRA build save failed", error);
      this.reject(client, "build_save_failed");
    }).finally(() => {
      this.pendingWarps.delete(id);
      this.pendingItemUses.delete(id);
    });
    this.pendingItemUses.set(id, task);
  }

  private castClassSkill(client: Client): void {
    const id = client.sessionId, player = this.buildPlayer(client);
    if (!player) return;
    const build = this.playerBuild(player);
    if (!build) return this.reject(client, "build_required");
    const skill = classSkill(build.path, build.bladeTalent ?? build.wardTalent), now = Date.now();
    if (now < player.classSkillReadyAt) return this.reject(client, "class_skill_cooldown");
    if (player.stamina < skill.stamina) return this.reject(client, "insufficient_stamina");
    const members = skill.targets === "party" ? this.parties.get(id)?.members ?? [id] : [id];
    const targets: [string, Player][] = [];
    for (const member of members) {
      const target = this.state.players.get(member);
      if (!target?.alive || target.mapId !== player.mapId || distance3d(player, target) > skill.radius ||
          this.pendingWarps.has(member) || this.pendingItemUses.has(member) || this.pendingCharacterLeaves.has(member)) continue;
      if (member !== id && !isWorldSegmentClear(player.mapId, player, target)) continue;
      if (skill.effect.kind !== "heal" || target.hp < target.maxHp) targets.push([member, target]);
    }
    if (!targets.length) return this.reject(client, "class_skill_no_target");
    player.stamina -= skill.stamina;
    player.classSkillReadyAt = now + skill.cooldownMs;
    for (const [member, target] of targets) {
      if (skill.effect.kind === "heal") {
        target.hp = Math.min(target.maxHp, target.hp + Math.round(target.maxHp * skill.effect.fraction));
      } else {
        this.effects.grant(member, {id: build.path, sourceId: id, group: "class_skill", bonuses: skill.effect.bonuses}, this.simulatedMs + skill.effect.durationMs);
        this.applyStats(member, target, this.statAllocations.get(member) ?? emptyAllocations());
      }
    }
    client.send("class_skill_used", {skill: skill.skill, targets: targets.length});
  }


  private changeSwordTree(client: Client, message: unknown, action: "learn" | "school" | "reset" | "equip"): void {
    if (!message || typeof message !== "object" || Array.isArray(message)) return this.reject(client, "invalid_sword_tree");
    const field = action === "learn" ? "skillId" : "school";
    const input = message as Record<string, unknown>;
    const keys=Object.keys(input);
    if (action === "equip") {
      if (keys.length!==2 || !Number.isInteger(input.slot) || (input.slot as number)<0 || (input.slot as number)>2 ||
          (input.skillId!==null && typeof input.skillId!=="string")) return this.reject(client,"invalid_sword_tree");
    } else if (action === "reset") {
      if (keys.length!==0) return this.reject(client,"invalid_sword_tree");
    } else if (keys.length!==1 || typeof input[field]!=="string") {
      return this.reject(client,"invalid_sword_tree");
    }
    const id=client.sessionId, player=this.buildPlayer(client,"swordTree"), tree=this.swordTrees.get(id);
    if (!player || !tree) return;
    if (player.pathId !== "phutthaisawan") return this.reject(client, "sword_class_required");
    if (action !== "equip" && (player.mapId !== DEFAULT_MAP_ID || !isOnGround(player.y) || Math.hypot(player.x,player.z)>6 ||
        this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs)) {
      return this.reject(client,"sword_tree_needs_shrine");
    }
    const next: SwordTree={school:tree.school,learned:[...tree.learned],cooldowns:{...tree.cooldowns},training:{...tree.training},
      loadouts:{phutthaisawan:[...tree.loadouts.phutthaisawan],sritrairat:[...tree.loadouts.sritrairat],atamat:[...tree.loadouts.atamat],chumphon:[...tree.loadouts.chumphon]}};
    const value=action === "equip" ? input.skillId as string|null : action === "reset" ? "" : input[field] as string;
    if (action === "equip") {
      const skillId=input.skillId as string|null, slots=next.loadouts[next.school];
      if (skillId!==null && (!Object.hasOwn(SWORD_NODES,skillId) || !next.learned.includes(skillId) || SWORD_NODES[skillId].effect==="passive" || (SWORD_NODES[skillId].school!=="common" && SWORD_NODES[skillId].school!==next.school))) return this.reject(client,"sword_skill_locked");
      for (let i=0;i<slots.length;i++) if (skillId!==null && slots[i]===skillId) slots[i]=null;
      slots[input.slot as number]=skillId;
    } else if (action === "reset") {
      if (!next.learned.length) return this.reject(client,"sword_tree_empty");
      next.learned=[];
      next.loadouts=emptySwordLoadouts();
    } else if (action === "school") {
      if (typeof value!=="string" || !Object.hasOwn(SWORD_SCHOOLS,value)) return this.reject(client,"invalid_sword_tree");
      const school=value as SwordSchool;
      if (player.level < SWORD_SCHOOLS[school].level) return this.reject(client,"sword_tree_level");
      if (school!=="phutthaisawan" && (tree.training.strikes<10 || tree.training.blocks<1)) return this.reject(client,"sword_trial_incomplete");
      if (next.school === school) return this.reject(client,"sword_tree_already_selected");
      next.school=school;
    } else {
      if (typeof value!=="string" || !Object.hasOwn(SWORD_NODES,value)) return this.reject(client,"invalid_sword_tree");
      const skill=SWORD_NODES[value];
      if (next.learned.includes(value)) return this.reject(client,"sword_tree_already_learned");
      if (player.level < skill.level) return this.reject(client,"sword_tree_level");
      if (skill.school !== "common" && skill.school !== next.school) return this.reject(client,"sword_tree_wrong_school");
      if (skill.requires.some(required=>!next.learned.includes(required))) return this.reject(client,"sword_tree_prerequisite");
      if (skill.training && tree.training[skill.training.id]<skill.training.count) return this.reject(client,"sword_trial_incomplete");
      if (next.learned.length >= swordPoints(player.level)) return this.reject(client,"sword_tree_no_points");
      next.learned.push(value);
    }
    const snapshot=this.captureCharacterSnapshot(id);
    if (!snapshot) return this.reject(client,"build_unavailable");
    const freezesPlayer=action!=="equip";
    if (freezesPlayer) this.pendingWarps.add(id);
    const task=characterStore.save({...snapshot,swordTree:next}).then(()=>{
      // Shortcut assignments are allowed in combat. Preserve training and
      // cooldown changes that happened while the save was in flight.
      const committed=action==="equip" ? this.swordTrees.get(id) : next;
      if (!committed) return;
      if (action==="equip") committed.loadouts=next.loadouts;
      this.swordTrees.set(id,committed);
      if (action === "school" || action === "reset") { this.swordGuards.delete(id); this.swordCombos.delete(id); }
      player.swordTreeData=JSON.stringify(committed);
      try {
        client.send("sword_tree_changed",{action,id:value});
      } catch (error) {
        // A disconnected client must not make a committed save look like a disk failure.
        console.warn("MONTRA sword tree confirmation was not delivered",error);
      }
    }).catch(error=>{
      console.error("MONTRA sword tree save failed",error);
      this.reject(client,"sword_tree_save_failed");
    }).finally(()=>{
      if (freezesPlayer) this.pendingWarps.delete(id);
      this.pendingItemUses.delete(id);
    });
    this.pendingItemUses.set(id,task);
  }


  private recordSwordTraining(id:string, field:"strikes"|"blocks"|"finishes"):void {
    const player=this.state.players.get(id),tree=this.swordTrees.get(id);
    if (!player || player.pathId!=="phutthaisawan" || !tree) return;
    tree.training[field]=Math.min(1_000_000,tree.training[field]+1);
    player.swordTreeData=JSON.stringify(tree);
  }

  private recordMuayTraining(id:string, field:"strikes"|"blocks"):void {
    const player=this.state.players.get(id), book=this.muayBooks.get(id);
    if (!player || player.pathId!=="muay_boran" || !book) return;
    book.training[field]=Math.min(1_000_000,book.training[field]+1);
    player.muayBookData=JSON.stringify(book);
  }
  private recordMuayMastery(id:string,school:MuaySchool,technique:boolean,sequence:boolean):void {
    const player=this.state.players.get(id),book=this.muayBooks.get(id);
    if(!player || player.pathId!=="muay_boran" || !book || book.school!==school || (!technique && !sequence))return;
    const mastery=book.mastery[school];
    if(technique)mastery.technique=Math.min(1_000_000,mastery.technique+1);
    if(sequence)mastery.sequences=Math.min(1_000_000,mastery.sequences+1);
    player.muayBookData=JSON.stringify(book);
  }

  private clearMuayCombo(id:string):void {
    if(this.muayCombos.delete(id))this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"muay_combo",{count:0});
    this.clearMuayFollowup(id);
  }
  private clearMuayFollowup(id:string):void {
    if(this.muayFollowups.delete(id))this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"muay_followup",{active:false});
  }
  private clearMuayCombosForTarget(targetId:string):void {
    for(const [id,combo] of this.muayCombos)if(combo.targetId===targetId)this.clearMuayCombo(id);
    for(const [id,opening] of this.muayFollowups)if(opening.targetId===targetId)this.clearMuayFollowup(id);
  }
  private advanceMuaySkillCombo(id:string,school:MuaySchool,targetId:string,skillId:Exclude<MuaySkillId,"guard"|"parry"|"evade"|"grapple"|"chaiya_cover">,pvp:boolean):number {
    const previous=this.muayCombos.get(id);
    const result=advanceMuayCombo(previous,school,targetId,MUAY_COMBO_MOVES[skillId],this.simulatedMs);
    if(result.state)this.muayCombos.set(id,result.state);else this.muayCombos.delete(id);
    const bonus=pvp ? MUAY_PVP_COMBO_MULTIPLIER : MUAY_COMBO_MULTIPLIER;
    if(result.count || previous)this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"muay_combo",
      {count:result.count,completed:result.completed,next:result.next ?? "",durationMs:MUAY_COMBO_WINDOW_MS,bonusPercent:Math.round((bonus-1)*100)});
    return result.completed ? bonus : 1;
  }
  private interruptMuayTarget(target:Monster,durationMs=MUAY_INTERRUPT_MS):"applied"|"immune"|"resisted"|"unavailable" {
    if(!target.alive)return "unavailable";
    if(target.id!==RULES.monsterId)return this.forest.interrupt(target.id,this.simulatedMs,durationMs,MUAY_INTERRUPT_IMMUNITY_MS);
    if(target.tier==="elite" || target.tier==="boss")return "immune";
    if(this.simulatedMs<this.monsterInterruptResistUntil)return "resisted";
    this.monsterInterruptUntil=this.simulatedMs+durationMs;
    this.monsterInterruptResistUntil=this.simulatedMs+MUAY_INTERRUPT_IMMUNITY_MS;
    this.monsterNavigator.clear();target.aiState="stagger";
    return "applied";
  }

  private muayControlled(id:string):boolean { return this.muayGrapples.has(id) || this.muayHeldBy.has(id); }
  private releaseMuayGrapple(holderId:string,reason:string):void {
    const hold=this.muayGrapples.get(holderId); if(!hold)return;
    this.muayGrapples.delete(holderId);this.muayHeldBy.delete(hold.targetId);
    if(hold.targetId===RULES.monsterId)this.monsterInterruptUntil=Math.min(this.monsterInterruptUntil,this.simulatedMs);
    else if(this.getMonster(hold.targetId))this.forest.endInterrupt(hold.targetId,this.simulatedMs);
    for(const id of [holderId,hold.targetId])this.sendSwordNotice(this.clients.find(c=>c.sessionId===id),"muay_grapple",{phase:"released",reason});
  }
  private releaseMuayFor(id:string,reason:string):void {
    this.releaseMuayGrapple(id,reason);
    const holder=this.muayHeldBy.get(id); if(holder)this.releaseMuayGrapple(holder,reason);
  }
  private clearGrappleCounter(id:string,reason:string):void {
    if(this.muayGrappleCounters.delete(id))this.sendSwordNotice(this.clients.find(c=>c.sessionId===id),"muay_grapple_counter",{active:false,reason});
  }
  private clearGrappleCountersFor(id:string,reason:string):void {
    this.clearGrappleCounter(id,reason);
    for(const [owner,window] of this.muayGrappleCounters)if(window.targetId===id)this.clearGrappleCounter(owner,reason);
  }
  private updateMuayGrapples():void {
    for(const [id,hold] of this.muayGrapples) {
      const actor=this.state.players.get(id), target=this.getMonster(hold.targetId) ?? this.state.players.get(hold.targetId);
      if(this.simulatedMs>=hold.until || !actor?.alive || !target?.alive || !this.sameCombatMap(id,hold.targetId) ||
        distance3d(actor,target)>2.1 || equippedWeaponId(this.inventories.get(id))!==MUAY_WRAP_ID || actor.pathId!=="muay_boran")
        this.releaseMuayGrapple(id,"ended");
    }
    for(const [id,until] of this.muayGrappleImmunity)if(this.simulatedMs>=until)this.muayGrappleImmunity.delete(id);
    for(const [id,window] of this.muayGrappleCounters) {
      const owner=this.state.players.get(id), target=this.state.players.get(window.targetId);
      if(this.simulatedMs>=window.until || !owner?.alive || !target?.alive || !this.sameCombatMap(id,window.targetId))this.clearGrappleCounter(id,"ended");
    }
  }

  private startMuayGrapple(client:Client,player:Player,target:Monster|Player,monster:Monster|undefined,targetId:string):boolean {
    const id=client.sessionId;
    if(this.muayControlled(targetId) || this.muayHeldBy.has(targetId)) { this.reject(client,"muay_grapple_busy"); return false; }
    if(!monster && ((target as Player).flying || !isOnGround(target.y) || this.activeDashes.has(targetId) || this.climbs.has(targetId) || this.flightTransitions.has(targetId))) {
      this.reject(client,"target_unavailable");return false;
    }
    if(monster) {
      const result=this.interruptMuayTarget(monster,MUAY_GRAPPLE_HOLD_MS);
      if(result!=="applied") {this.reject(client,result==="immune" ? "muay_grapple_immune" : "muay_grapple_resisted");return false;}
    } else {
      const immunityKey=this.persistentCharacters.get(targetId) ?? targetId;
      if(this.simulatedMs<(this.muayGrappleImmunity.get(immunityKey) ?? 0)) {this.reject(client,"muay_grapple_resisted");return false;}
      this.muayGrappleImmunity.set(immunityKey,this.simulatedMs+MUAY_INTERRUPT_IMMUNITY_MS);
      if(this.muayDefenseWindows.has(targetId)){this.swordGuards.delete(targetId);this.clearMuayDefense(targetId,"cancelled");}
      this.destinations.delete(targetId);this.attackTargets.delete(targetId);
      target.targetId="";(target as Player).combatState="idle";
    }
    if(this.muayDefenseWindows.has(id)){this.swordGuards.delete(id);this.clearMuayDefense(id,"cancelled");}
    this.destinations.delete(id);this.attackTargets.delete(id);player.targetId="";player.combatState="idle";
    this.clearMuayCombo(id);this.clearGrappleCounter(id,"new_hold");this.clearGrappleCounter(targetId,"new_hold");this.recordCombat(id,targetId);
    this.muayGrapples.set(id,{targetId,until:this.simulatedMs+MUAY_GRAPPLE_HOLD_MS});this.muayHeldBy.set(targetId,id);
    this.sendSwordNotice(client,"muay_grapple",{phase:"held",role:"holder",targetId,durationMs:MUAY_GRAPPLE_HOLD_MS});
    this.sendSwordNotice(this.clients.find(c=>c.sessionId===targetId),"muay_grapple",{phase:"held",role:"victim",durationMs:MUAY_GRAPPLE_HOLD_MS,escapeStamina:MUAY_GRAPPLE_ESCAPE_STAMINA});
    return true;
  }
  private escapeMuayGrapple(client:Client,message:unknown):void {
    if(!parseEmptyCommand(message))return this.reject(client,"invalid_grapple_response");
    const id=client.sessionId,holderId=this.muayHeldBy.get(id),hold=holderId ? this.muayGrapples.get(holderId) : undefined;
    const player=this.state.players.get(id),holder=holderId ? this.state.players.get(holderId) : undefined;
    if(!holderId || !hold || hold.targetId!==id || this.simulatedMs>=hold.until || !player?.alive || !holder?.alive) {
      if(holderId)this.releaseMuayGrapple(holderId,"ended");return this.reject(client,"muay_grapple_ended");
    }
    if(!this.sameCombatMap(holderId,id) || distance3d(holder,player)>2.1 || holder.pathId!=="muay_boran" || equippedWeaponId(this.inventories.get(holderId))!==MUAY_WRAP_ID) {
      this.releaseMuayGrapple(holderId,"ended");return this.reject(client,"muay_grapple_ended");
    }
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id) ||
      this.pendingItemUses.has(holderId) || this.pendingRewards.has(holderId) || this.pendingCharacterLeaves.has(holderId))return this.reject(client,"character_busy");
    if(!this.gates.get(id)?.attack.consume(this.simulatedMs))return this.reject(client,"attack_rate_limited");
    if(player.stamina<MUAY_GRAPPLE_ESCAPE_STAMINA)return this.reject(client,"insufficient_stamina");
    player.stamina-=MUAY_GRAPPLE_ESCAPE_STAMINA;
    this.releaseMuayGrapple(holderId,"escaped");
    this.clearGrappleCounter(id,"replaced");
    this.muayGrappleCounters.set(id,{targetId:holderId,until:this.simulatedMs+MUAY_GRAPPLE_COUNTER_WINDOW_MS});
    this.sendSwordNotice(client,"muay_grapple_counter",{active:true,durationMs:MUAY_GRAPPLE_COUNTER_WINDOW_MS,stamina:MUAY_GRAPPLE_COUNTER_STAMINA});
    void this.saveCharacter(id);
  }
  private counterMuayGrapple(client:Client,message:unknown):void {
    if(!parseEmptyCommand(message))return this.reject(client,"invalid_grapple_response");
    const id=client.sessionId,window=this.muayGrappleCounters.get(id);
    if(!window || this.simulatedMs>=window.until) {this.clearGrappleCounter(id,"ended");return this.reject(client,"muay_grapple_counter_ended");}
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))return this.reject(client,"character_busy");
    const player=this.spellCaster(client),opponent=this.state.players.get(window.targetId);
    if(!player)return;
    if(!opponent?.alive || !this.sameCombatMap(id,window.targetId) || this.pendingItemUses.has(window.targetId) ||
      this.pendingRewards.has(window.targetId) || this.pendingCharacterLeaves.has(window.targetId))return this.reject(client,"target_unavailable");
    if(player.flying || !isOnGround(player.y) || distance3d(player,opponent)>MUAY_GRAPPLE_COUNTER_RANGE || Math.abs(player.y-opponent.y)>1.1)return this.reject(client,"muay_out_of_range");
    if(!this.bodyPathClear(player.mapId,player,opponent))return this.reject(client,"muay_blocked");
    if(player.stamina<MUAY_GRAPPLE_COUNTER_STAMINA)return this.reject(client,"insufficient_stamina");
    player.stamina-=MUAY_GRAPPLE_COUNTER_STAMINA;this.clearGrappleCounter(id,"used");
    player.facing=facingTo(opponent.x-player.x,opponent.z-player.z);this.recordCombat(id,window.targetId);
    const attack=(player.atk+weaponBonuses(this.inventories.get(id),"pvp").melee)*MUAY_PVP_DAMAGE_MULTIPLIER;
    const damage=this.swordGuardDamage(window.targetId,player,calculateDamage(attack,opponent.def,opponent.level));
    opponent.hp=Math.max(0,opponent.hp-damage);opponent.hitSeq++;
    this.broadcast("pvp_hit",{attackerId:id,targetId:window.targetId,damage,hp:opponent.hp,maxHp:opponent.maxHp,hitSeq:opponent.hitSeq,source:"grapple_counter"},{afterNextPatch:true});
    if(opponent.hp===0){player.pkKills++;opponent.pkDeaths++;this.knockoutPlayer(window.targetId,"pk",id);this.broadcast("pvp_kill",{winnerId:id,loserId:window.targetId,source:"grapple_counter",kills:player.pkKills,deaths:opponent.pkDeaths},{afterNextPatch:true});}
    void this.saveCharacter(id);
  }
  private finishMuayGrapple(client:Client,targetId:unknown):void {
    const id=client.sessionId,hold=this.muayGrapples.get(id),player=this.state.players.get(id);
    if(!hold || targetId!==hold.targetId || this.simulatedMs>=hold.until || !player?.alive) {this.releaseMuayGrapple(id,"ended");return this.reject(client,"muay_grapple_ended");}
    const monster=this.getMonster(hold.targetId),target=monster ?? this.state.players.get(hold.targetId);
    if(!target?.alive || !this.sameCombatMap(id,hold.targetId) || distance3d(player,target)>2.1 || equippedWeaponId(this.inventories.get(id))!==MUAY_WRAP_ID ||
      this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id) ||
      (!monster && (this.pendingItemUses.has(hold.targetId) || this.pendingRewards.has(hold.targetId) || this.pendingCharacterLeaves.has(hold.targetId)))) {
      this.releaseMuayGrapple(id,"ended");return this.reject(client,"muay_grapple_ended");
    }
    const dx=target.x-player.x,dz=target.z-player.z,length=Math.hypot(dx,dz), nx=length>0.001 ? dx/length : -Math.sin(player.facing),nz=length>0.001 ? dz/length : -Math.cos(player.facing);
    const next={x:target.x+nx*1.5,y:target.y,z:target.z+nz*1.5},map=getWorldMap(target.mapId);
    if(!map || !this.canOccupy(next.x,next.z,next.y,false,target.mapId) || isRestArea(target.mapId,next) || !this.bodyPathClear(target.mapId,target,next) ||
      (monster && (monster.id===RULES.monsterId ? !isMonsterSegmentClear(monster,next) : !this.forest.canDisplace(monster.id,next))))return this.reject(client,"muay_throw_blocked");
    const sweep=advanceDash(target,{dx:nx,dz:nz},1.5,(x,z)=>this.canOccupy(x,z,target.y,false,target.mapId) && !isRestArea(target.mapId,{x,z}),map.bounds);
    if(sweep.blocked || sweep.moved<1.4999)return this.reject(client,"muay_throw_blocked");
    target.x=next.x;target.z=next.z;
    this.releaseMuayGrapple(id,"thrown");this.recordCombat(id,hold.targetId);this.recordMuayTraining(id,"strikes");
    const pvp=!monster,attack=(player.atk+weaponBonuses(this.inventories.get(id),pvp?"pvp":"pve").melee)*MUAY_SKILLS.grapple.power*(pvp?MUAY_PVP_DAMAGE_MULTIPLIER:1);
    if(monster)this.hitMonsterWithSpell(id,monster,calculateDamage(attack,monster.defense,monster.level),"muay");
    else {
      const opponent=target as Player,damage=this.swordGuardDamage(hold.targetId,player,calculateDamage(attack,opponent.def,opponent.level));
      opponent.hp=Math.max(0,opponent.hp-damage);opponent.hitSeq++;
      this.broadcast("pvp_hit",{attackerId:id,targetId:hold.targetId,damage,hp:opponent.hp,maxHp:opponent.maxHp,hitSeq:opponent.hitSeq,source:"muay"},{afterNextPatch:true});
      if(opponent.hp===0){player.pkKills++;opponent.pkDeaths++;this.knockoutPlayer(hold.targetId,"pk",id);this.broadcast("pvp_kill",{winnerId:id,loserId:hold.targetId,source:"muay",kills:player.pkKills,deaths:opponent.pkDeaths},{afterNextPatch:true});}
    }
    this.broadcast("muay_skill_used",{playerId:id,skillId:"grapple",targetId:hold.targetId},{afterNextPatch:true});void this.saveCharacter(id);
  }

  private changeMuayBook(client:Client,message:unknown):void {
    if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"invalid_muay_book");
    const input=message as Record<string,unknown>, keys=Object.keys(input), action=input.action;
    if(action==="learn") {
      if(keys.length!==2 || typeof input.skillId!=="string")return this.reject(client,"invalid_muay_book");
    } else if(action==="school") {
      if(keys.length!==2 || typeof input.school!=="string")return this.reject(client,"invalid_muay_book");
    } else if(action==="equip") {
      if(keys.length!==3 || !Number.isInteger(input.slot) || (input.slot as number)<0 || (input.slot as number)>3 || (input.skillId!==null && typeof input.skillId!=="string"))return this.reject(client,"invalid_muay_book");
    } else if(action==="reset") {
      if(keys.length!==1)return this.reject(client,"invalid_muay_book");
    } else return this.reject(client,"invalid_muay_book");
    const id=client.sessionId, player=this.buildPlayer(client), book=this.muayBooks.get(id);
    if(!player || !book)return;
    if(player.pathId!=="muay_boran")return this.reject(client,"muay_class_required");
    if(player.mapId!==DEFAULT_MAP_ID || !isOnGround(player.y) || Math.hypot(player.x,player.z)>6 ||
      this.simulatedMs-(this.lastCombatMs.get(id) ?? -Infinity)<PROGRESSION.combatQuietMs)return this.reject(client,"muay_book_needs_shrine");
    const next:MuayBook={learned:[...book.learned],training:{...book.training},mastery:{chaiya:{...book.mastery.chaiya},korat:{...book.mastery.korat},lopburi:{...book.mastery.lopburi},thasao:{...book.mastery.thasao}},school:book.school,slots:[...book.slots],
      loadouts:{chaiya:[...book.loadouts.chaiya],korat:[...book.loadouts.korat],lopburi:[...book.loadouts.lopburi],thasao:[...book.loadouts.thasao]}};
    if(action==="learn") {
      const skillId=input.skillId as string;
      if(!Object.hasOwn(MUAY_LESSONS,skillId))return this.reject(client,"invalid_muay_book");
      const lesson=MUAY_LESSONS[skillId as MuayLessonId];
      if(lesson.school!==next.school)return this.reject(client,"muay_wrong_school");
      if(next.learned.includes(skillId as MuayLessonId))return this.reject(client,"muay_book_already_learned");
      if(player.level<lesson.level)return this.reject(client,"muay_book_level");
      if(next.learned.length>=muayPoints(player.level))return this.reject(client,"muay_book_no_points");
      if((lesson.requires as readonly string[]).some(req=>!next.learned.includes(req as MuayLessonId)))return this.reject(client,"muay_book_prerequisite");
      if(next.training.strikes<lesson.training.strikes || next.training.blocks<lesson.training.blocks)return this.reject(client,"muay_book_training");
      const mastery=MUAY_MASTERY_REQUIREMENTS[skillId as MuayLessonId],progress=next.mastery[lesson.school];
      if(mastery && (progress.technique<mastery.technique || progress.sequences<mastery.sequences))return this.reject(client,"muay_book_mastery");
      next.learned.push(skillId as MuayLessonId);
    } else if(action==="school") {
      const school=input.school as string;
      if(!Object.hasOwn(MUAY_SCHOOLS,school))return this.reject(client,"invalid_muay_book");
      const selected=school as MuaySchool, requirements=MUAY_SCHOOLS[selected];
      if(next.school===selected)return this.reject(client,"muay_school_selected");
      if(player.level<requirements.level)return this.reject(client,"muay_book_level");
      if(next.training.strikes<requirements.strikes || next.training.blocks<requirements.blocks)return this.reject(client,"muay_book_training");
      next.school=selected;next.slots=[...next.loadouts[selected]];
    } else if(action==="equip") {
      const skillId=input.skillId as MuaySkillId|null;
      if(skillId!==null && (!Object.hasOwn(MUAY_SKILLS,skillId) || (!MUAY_BASE_SKILLS.some(skill=>skill===skillId) &&
        (!next.learned.includes(skillId as MuayLessonId) || MUAY_LESSONS[skillId as MuayLessonId].school!==next.school))))return this.reject(client,"muay_skill_locked");
      for(let i=0;i<next.slots.length;i++)if(skillId!==null && next.slots[i]===skillId)next.slots[i]=null;
      next.slots[input.slot as number]=skillId;
      next.loadouts[next.school]=[...next.slots];
    } else {
      if(!next.learned.length)return this.reject(client,"muay_book_empty");
      next.learned=[];next.loadouts=newMuayLoadouts();next.slots=[...next.loadouts[next.school]];
    }
    const snapshot=this.captureCharacterSnapshot(id);
    if(!snapshot)return this.reject(client,"build_unavailable");
    this.pendingWarps.add(id);
    const task=characterStore.save({...snapshot,muayBook:next}).then(()=>{
      this.muayBooks.set(id,next);player.muayBookData=JSON.stringify(next);
      if(action==="school" || action==="reset") {this.swordGuards.delete(id);this.clearMuayDefense(id,"cancelled");this.clearMuayCombo(id);this.sendSwordNotice(client,"muay_counter_cleared",{});}
      try {client.send("muay_book_changed",{action});} catch(error) {console.warn("MONTRA Muay book confirmation was not delivered",error);}
    },error=>{console.error("MONTRA Muay book save failed",error);this.reject(client,"muay_book_save_failed");}).finally(()=>{this.pendingWarps.delete(id);this.pendingItemUses.delete(id);});
    this.pendingItemUses.set(id,task);
  }


  private sendSwordNotice(client:Client|undefined, type:string, payload:Record<string,unknown>):void {
    if (!client) return;
    try {
      client.send(type,payload);
    } catch (error) {
      // Notices are optional. A disconnect must not interrupt combat resolution.
      console.warn("MONTRA sword notice was not delivered",error);
    }
  }

  private clearMuayDefense(id:string,phase:"cancelled"|"miss"|"success"):void {
    const window=this.muayDefenseWindows.get(id);if(!window)return;
    this.muayDefenseWindows.delete(id);
    this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),"muay_defense",{kind:window.kind,phase});
  }
  private updateMuayDefense():void {
    for(const [id,window] of this.muayDefenseWindows) {
      if(this.swordGuards.get(id)?.until!==window.until)this.clearMuayDefense(id,"cancelled");
      else if(this.simulatedMs>=window.until)this.clearMuayDefense(id,"miss");
    }
  }

  private swordGuardDamage(id:string, attacker:{x:number;z:number}, damage:number,guardPierce=0):number {
    const guard=this.swordGuards.get(id), player=this.state.players.get(id);
    if (!guard || !player || this.simulatedMs>=guard.until) return damage;
    const dx=attacker.x-player.x, dz=attacker.z-player.z, length=Math.hypot(dx,dz);
    const front=length<0.001 || (-Math.sin(player.facing)*dx-Math.cos(player.facing)*dz)/length>=0;
    if (guard.direction && !front) return damage;
    const defense=this.muayDefenseWindows.get(id);
    const kind=defense && defense.until===guard.until && this.simulatedMs<defense.until ? defense.kind : undefined;
    guard.counterUntil=this.simulatedMs+3000;
    this.recordSwordTraining(id,"blocks");
    if(kind!=="evade")this.recordMuayTraining(id,"blocks");
    if(kind) {guard.until=this.simulatedMs;this.clearMuayDefense(id,"success");}
    this.sendSwordNotice(this.clients.find(client=>client.sessionId===id),player.pathId === "muay_boran" ? "muay_guarded" : "sword_guarded",{until:guard.counterUntil,kind:kind ?? "guard"});
    return Math.max(1,Math.round(damage*(guard.factor+(1-guard.factor)*guardPierce)));
  }

  private castMuaySkill(client:Client, message:unknown):void {
    if (!message || typeof message!=="object" || Array.isArray(message)) return this.reject(client,"invalid_muay_skill");
    const input=message as Record<string,unknown>;
    if (typeof input.skillId!=="string" || !Object.hasOwn(MUAY_SKILLS,input.skillId) ||
        Object.keys(input).some(key=>key!=="skillId" && key!=="targetId") ||
        (input.targetId!==undefined && typeof input.targetId!=="string")) return this.reject(client,"invalid_muay_skill");
    const id=client.sessionId, skillId=input.skillId as MuaySkillId, skill=MUAY_SKILLS[skillId];
    if(this.muayHeldBy.has(id))return this.reject(client,"muay_controlled");
    if(this.muayGrapples.has(id)) {
      if(skillId!=="grapple")return this.reject(client,"muay_controlled");
      return this.finishMuayGrapple(client,input.targetId);
    }
    if(this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id))return this.reject(client,"character_busy");
    const player=this.spellCaster(client), cooldowns=this.muayCooldowns.get(id);
    if (!player || !cooldowns) return;
    if (player.pathId!=="muay_boran") return this.reject(client,"muay_class_required");
    if (equippedWeaponId(this.inventories.get(id))!==MUAY_WRAP_ID) return this.reject(client,"muay_wrap_required");
    const book=this.muayBooks.get(id);
    if (!book) return this.reject(client,"muay_class_required");
    if (Object.hasOwn(MUAY_LESSONS,skillId) && (!book?.learned.includes(skillId as MuayLessonId) || MUAY_LESSONS[skillId as MuayLessonId].school!==book.school)) return this.reject(client,"muay_skill_locked");
    if (player.flying || !isOnGround(player.y)) return this.reject(client,"flying");
    if (isRestArea(player.mapId,player)) return this.reject(client,"muay_safe_area");
    const now=Date.now();
    if (now<(cooldowns[skillId] ?? 0)) return this.reject(client,"muay_cooldown");
    if (player.stamina<skill.stamina) return this.reject(client,"insufficient_stamina");
    const guard=this.swordGuards.get(id);
    const isCounter=skill.effect==="counter" || skill.effect==="counter_sidestep";
    if (isCounter && (!guard || this.simulatedMs>=guard.counterUntil)) return this.reject(client,"muay_counter_required");
    let target:Monster|Player|undefined, monster:Monster|undefined, targetId="";
    if (skill.effect!=="guard" && skill.effect!=="parry" && skill.effect!=="evade") {
      const order=parseAttackCommand({targetId:input.targetId}) ?? parsePkTargetCommand({targetId:input.targetId});
      if (!order) return this.reject(client,"invalid_muay_target");
      targetId=order.targetId;monster=this.getMonster(targetId);
      target=monster ?? this.state.players.get(targetId);
      if (!target?.alive || targetId===id || !this.sameCombatMap(id,targetId)) { this.clearMuayCombo(id); return this.reject(client,"target_unavailable"); }
      if (!monster && (this.pendingItemUses.has(targetId) || this.pendingRewards.has(targetId) || this.pendingCharacterLeaves.has(targetId))) return this.reject(client,"target_unavailable");
      if (distance3d(player,target)>skill.range || Math.abs(player.y-target.y)>1.1) return this.reject(client,"muay_out_of_range");
      if (!this.bodyPathClear(player.mapId,player,target)) return this.reject(client,"muay_blocked");
    }
    const followup=MUAY_FOLLOWUPS[book.school],opening=this.muayFollowups.get(id);
    if(skillId===followup.finisher && (!opening || opening.school!==book.school || opening.targetId!==targetId || this.simulatedMs>=opening.until))
      return this.reject(client,"muay_followup_required");
    if(skill.effect==="evade") {
      const dx=Math.sin(player.facing),dz=Math.cos(player.facing),distance=1.2;
      const next={x:player.x+dx*distance,y:player.y,z:player.z+dz*distance},map=getWorldMap(player.mapId);
      if(!map || !this.canOccupy(next.x,next.z,next.y,false,player.mapId) || isRestArea(player.mapId,next) || !this.bodyPathClear(player.mapId,player,next))return this.reject(client,"muay_blocked");
      const sweep=advanceDash(player,{dx,dz},distance,(x,z)=>this.canOccupy(x,z,player.y,false,player.mapId) && !isRestArea(player.mapId,{x,z}),map.bounds);
      if(sweep.blocked || sweep.moved+0.00001<distance)return this.reject(client,"muay_blocked");
      this.destinations.delete(id);this.attackTargets.delete(id);player.targetId="";player.combatState="idle";
      player.x=next.x;player.z=next.z;
    }
    let retreatPoint:{x:number;y:number;z:number}|undefined,muayMoved=false;
    if(skill.effect==="retreat_strike" && target) {
      const dx=player.x-target.x,dz=player.z-target.z,length=Math.hypot(dx,dz),vx=length>0.001?dx/length:Math.sin(player.facing),vz=length>0.001?dz/length:Math.cos(player.facing),travel=1.2;
      const next={x:player.x+vx*travel,y:player.y,z:player.z+vz*travel},map=getWorldMap(player.mapId);
      if(!map || !this.canOccupy(next.x,next.z,next.y,false,player.mapId) || isRestArea(player.mapId,next) || !this.bodyPathClear(player.mapId,player,next))return this.reject(client,"muay_blocked");
      const sweep=advanceDash(player,{dx:vx,dz:vz},travel,(x,z)=>this.canOccupy(x,z,player.y,false,player.mapId) && !isRestArea(player.mapId,{x,z}),map.bounds);
      if(sweep.blocked || sweep.moved+0.00001<travel)return this.reject(client,"muay_blocked");
      retreatPoint=next;
    }
    if ((skill.effect==="step" || skill.effect==="sidestep" || skill.effect==="step_flurry" || skill.effect==="counter_sidestep") && target) {
      const dx=target.x-player.x,dz=target.z-player.z,distance=Math.hypot(dx,dz),move=Math.max(0,distance-1.7);
      const side=skill.effect==="sidestep" || skill.effect==="counter_sidestep" ? (skillId==="lopburi_reverse" ? -0.8 : 0.8) : 0, divisor=Math.max(distance,0.001);
      const next={x:player.x+(dx*move-dz*side)/divisor,y:player.y,z:player.z+(dz*move+dx*side)/divisor};
      if (!this.canOccupy(next.x,next.z,next.y,false,player.mapId) || isRestArea(player.mapId,next) || !this.bodyPathClear(player.mapId,player,next)) return this.reject(client,"muay_blocked");
      const vx=next.x-player.x,vz=next.z-player.z,travel=Math.hypot(vx,vz);
      if (travel>0.00001) {
        const sweep=advanceDash(player,{dx:vx/travel,dz:vz/travel},travel,
          (x,z)=>this.canOccupy(x,z,player.y,false,player.mapId) && !isRestArea(player.mapId,{x,z}),getWorldMap(player.mapId)!.bounds);
        if (sweep.blocked || sweep.moved+0.00001<travel) return this.reject(client,"muay_blocked");
      }
      muayMoved=travel>0.1;
      this.destinations.delete(id); player.x=next.x; player.z=next.z;
    }
    if(skill.effect==="grapple" && target && !this.startMuayGrapple(client,player,target,monster,targetId))return;
    if(opening && (skillId===followup.finisher || (targetId && opening.targetId!==targetId)))this.clearMuayFollowup(id);
    player.stamina-=skill.stamina;
    cooldowns[skillId]=now+skill.cooldownMs;
    player.muayData=JSON.stringify(cooldowns);
    if (skill.effect==="guard" || skill.effect==="parry" || skill.effect==="evade") {
      this.clearMuayDefense(id,"cancelled");
      const duration=skill.effect==="guard" ? (skillId==="chaiya_cover" ? 1800 : 1200) : skill.effect==="parry" ? 600 : 450;
      const until=this.simulatedMs+duration;
      this.swordGuards.set(id,{until,factor:skill.power,direction:true,counterUntil:0});
      if(skill.effect!=="guard") {
        this.muayDefenseWindows.set(id,{kind:skill.effect,until});
        this.sendSwordNotice(client,"muay_defense",{kind:skill.effect,phase:"start",durationMs:duration});
      }
      this.sendSwordNotice(client,"muay_counter_cleared",{});
    } else if (target && skill.effect!=="grapple") {
      player.facing=facingTo(target.x-player.x,target.z-player.z);
      if (isCounter && guard) { guard.counterUntil=0; this.sendSwordNotice(client,"muay_counter_cleared",{}); }
      this.recordCombat(id,targetId);
      this.recordMuayTraining(id,"strikes");
      const pvp=!monster,comboMultiplier=this.advanceMuaySkillCombo(id,book.school,targetId,skillId as Exclude<MuaySkillId,"guard"|"parry"|"evade"|"grapple"|"chaiya_cover">,pvp);
      const attack=(player.atk+weaponBonuses(this.inventories.get(id),pvp?"pvp":"pve").melee)*skill.power*comboMultiplier*(pvp?MUAY_PVP_DAMAGE_MULTIPLIER:1);
      const hits=skill.effect==="flurry" || skill.effect==="step_flurry" ? 2 : 1;
      for(let hit=0;hit<hits && target.alive;hit++) {
        if(monster) {
          const damage=calculateDamage(attack,monster.defense,monster.level);
          this.hitMonsterWithSpell(id,monster,damage,"muay");
        } else {
          const opponent=target as Player;
          const damage=this.swordGuardDamage(targetId,player,calculateDamage(attack,opponent.def,opponent.level),skillId==="korat_pierce" ? 0.25 : 0);
          opponent.hp=Math.max(0,opponent.hp-damage);opponent.hitSeq++;
          this.broadcast("pvp_hit",{attackerId:id,targetId,damage,hp:opponent.hp,maxHp:opponent.maxHp,hitSeq:opponent.hitSeq,source:"muay"},{afterNextPatch:true});
          if(opponent.hp===0) {
            player.pkKills++;opponent.pkDeaths++;this.knockoutPlayer(targetId,"pk",id);this.clearMuayCombo(id);
            this.broadcast("pvp_kill",{winnerId:id,loserId:targetId,source:"muay",kills:player.pkKills,deaths:opponent.pkDeaths},{afterNextPatch:true});
          }
        }
      }
      if(skill.effect==="teep" && target.alive)this.sendSwordNotice(client,"muay_interrupt",{result:monster ? this.interruptMuayTarget(monster) : "pvp_no_interrupt"});
      if(skillId==="chaiya_finish")player.stamina=Math.min(player.maxStamina,player.stamina+10);
      if(skillId==="chaiya_return")player.stamina=Math.min(player.maxStamina,player.stamina+8);
      if(skillId==="korat_finish" && monster && target.alive)this.sendSwordNotice(client,"muay_interrupt",{result:this.interruptMuayTarget(monster,500),source:"korat_finish"});
      if(skillId==="korat_press" && monster && target.alive)this.sendSwordNotice(client,"muay_interrupt",{result:this.interruptMuayTarget(monster,600),source:"korat_press"});
      if(retreatPoint){this.destinations.delete(id);this.attackTargets.delete(id);player.targetId="";player.combatState="idle";player.x=retreatPoint.x;player.z=retreatPoint.z;muayMoved=true;}
      if(monster)this.recordMuayMastery(id,book.school,countsMuayTechnique(book.school,skillId,muayMoved),comboMultiplier>1 || skillId===followup.finisher);
      if(skillId===followup.opener && target.alive && book.learned.includes(followup.finisher)) {
        this.muayFollowups.set(id,{school:book.school,targetId,until:this.simulatedMs+MUAY_FOLLOWUP_WINDOW_MS});
        this.sendSwordNotice(client,"muay_followup",{active:true,skillId:followup.finisher,targetId,durationMs:MUAY_FOLLOWUP_WINDOW_MS});
      }
    }
    this.broadcast("muay_skill_used",{playerId:id,skillId,targetId},{afterNextPatch:true});
    void this.saveCharacter(id);
  }

  private castSwordSkill(client:Client, message:unknown):void {
    if (!message || typeof message!=="object" || Array.isArray(message)) return this.reject(client,"invalid_sword_skill");
    const input=message as Record<string,unknown>, keys=Object.keys(input);
    if (typeof input.skillId!=="string" || !Object.hasOwn(SWORD_NODES,input.skillId) ||
        keys.some(key=>key!=="skillId" && key!=="targetId") ||
        (input.targetId!==undefined && typeof input.targetId!=="string")) return this.reject(client,"invalid_sword_skill");
    const id=client.sessionId, skillId=input.skillId, skill=SWORD_NODES[skillId];
    const player=this.spellCaster(client), tree=this.swordTrees.get(id);
    if (!player || !tree) return;
    if (player.pathId!=="phutthaisawan" || equippedWeaponId(this.inventories.get(id))!==DUAL_SWORD.weaponId)
      return this.reject(client,"sword_weapon_required");
    if (!tree.learned.includes(skillId) || (skill.school!=="common" && skill.school!==tree.school) || skill.effect==="passive")
      return this.reject(client,"sword_skill_locked");
    if (player.flying) return this.reject(client,"flying");
    const now=Date.now();
    if (now<(tree.cooldowns[skillId] ?? 0)) return this.reject(client,"sword_skill_cooldown");
    if (player.stamina<skill.stamina) return this.reject(client,"insufficient_stamina");
    const guard=this.swordGuards.get(id);
    if (skill.effect==="counter" && (!guard || this.simulatedMs>=guard.counterUntil)) return this.reject(client,"sword_counter_required");
    const combo=this.swordCombos.get(id);
    if (skillId==="twin_finale" && (!combo || combo.count<3 || this.simulatedMs>=combo.until)) return this.reject(client,"sword_combo_required");

    let targetId="", target:Monster|Player|undefined, monster:Monster|undefined;
    if (skill.effect!=="guard" && skill.effect!=="support") {
      const order=parseAttackCommand({targetId:input.targetId}) ?? parsePkTargetCommand({targetId:input.targetId});
      if (!order) return this.reject(client,"invalid_sword_target");
      targetId=order.targetId;
      monster=this.getMonster(targetId);
      target=monster ?? this.state.players.get(targetId);
      if (!target?.alive || targetId===id || !this.sameCombatMap(id,targetId)) return this.reject(client,"target_unavailable");
      if (skill.effect==="area" && !monster) return this.reject(client,"invalid_sword_target");
      if (distance3d(player,target)>skill.range || Math.abs(player.y-target.y)>1.1) return this.reject(client,"sword_out_of_range");
      if (!this.bodyPathClear(player.mapId,player,target)) return this.reject(client,"sword_blocked");
    }
    if ((skill.effect==="step" || skillId==="riposte") && target) {
      const dx=target.x-player.x,dz=target.z-player.z,distance=Math.hypot(dx,dz);
      const move=Math.max(0,distance-1.7);
      const side=skillId==="circle_step" || skillId==="riposte" ? 0.8 : 0;
      const next={x:player.x+(dx*move-dz*side)/Math.max(distance,0.001),y:player.y,z:player.z+(dz*move+dx*side)/Math.max(distance,0.001)};
      if (!this.canOccupy(next.x,next.z,next.y,false,player.mapId) || isRestArea(player.mapId,next) ||
          !this.bodyPathClear(player.mapId,player,next)) return this.reject(client,"sword_blocked");
      const travelX=next.x-player.x, travelZ=next.z-player.z, travel=Math.hypot(travelX,travelZ);
      if (travel>0.00001) {
        const sweep=advanceDash(player,{dx:travelX/travel,dz:travelZ/travel},travel,
          (x,z)=>this.canOccupy(x,z,player.y,false,player.mapId) && !isRestArea(player.mapId,{x,z}),
          getWorldMap(player.mapId)!.bounds);
        if (sweep.blocked || sweep.moved+0.00001<travel) return this.reject(client,"sword_blocked");
      }
      this.destinations.delete(id);
      player.x=next.x; player.z=next.z;
    }
    player.stamina-=skill.stamina;
    tree.cooldowns[skillId]=now+skill.cooldownMs;
    player.swordTreeData=JSON.stringify(tree);
    if (skill.effect==="guard") {
      this.swordGuards.set(id,{until:this.simulatedMs+1200,factor:skill.power,direction:skillId!=="circle_guard",counterUntil:0});
      this.sendSwordNotice(client,"sword_counter_cleared",{});
    } else if (skill.effect==="support") {
      const members=this.parties.get(id)?.members ?? [id];
      for (const memberId of members) {
        const member=this.state.players.get(memberId);
        if (!member?.alive || member.mapId!==player.mapId || this.pendingWarps.has(memberId) ||
            distance3d(player,member)>skill.range || !this.bodyPathClear(player.mapId,player,member)) continue;
        const active=this.effects.modifiers(memberId);
        if (active.length>=STACKING_RULES.maxModifiers && !active.some(effect=>effect.id===skillId && effect.sourceId===id)) continue;
        this.effects.grant(memberId,{id:skillId,sourceId:id,group:"sword_support",bonuses:{def:skill.power}},this.simulatedMs+8000);
        this.applyStats(memberId,member,this.statAllocations.get(memberId) ?? emptyAllocations());
      }
    } else if (target) {
      player.facing=facingTo(target.x-player.x,target.z-player.z);
      const base=(player.atk+weaponBonuses(this.inventories.get(id),monster?"pve":"pvp").melee) *
        (tree.learned.includes("rhythm") ? 1.05 : 1);
      const victims: {id:string; target:Monster|Player; monster:boolean}[]=[{id:targetId,target,monster:Boolean(monster)}];
      if (skill.effect==="area") {
        const dx=target.x-player.x,dz=target.z-player.z,length=Math.max(0.001,Math.hypot(dx,dz));
        const consider=(candidate:Monster) => {
          const vx=candidate.x-player.x,vz=candidate.z-player.z,d=Math.hypot(vx,vz);
          if (candidate.id!==targetId && candidate.alive && d<=skill.range && Math.abs(candidate.y-player.y)<=1.1 &&
              (d<0.001 || (dx*vx+dz*vz)/(length*d)>=0.5) && this.sameCombatMap(id,candidate.id) &&
              this.bodyPathClear(player.mapId,player,candidate)) victims.push({id:candidate.id,target:candidate,monster:true});
        };
        consider(this.state.monster);
        this.state.monsters.forEach(consider);
      }
      const hits=skill.effect==="flurry" ? (skillId==="twin_finale"?3:2) : 1;
      if (skill.effect==="counter" && guard) {
        guard.counterUntil=0;
        this.sendSwordNotice(client,"sword_counter_cleared",{});
      }
      if (skillId==="twin_finale") { this.swordCombos.delete(id); this.sendSwordNotice(client,"sword_combo",{count:0}); }
      for (const victim of victims.slice(0,5)) {
        for (let count=0;count<hits && victim.target.alive;count++) {
          this.recordCombat(id,victim.id);
          const defense=victim.monster ? (victim.target as Monster).defense : (victim.target as Player).def;
          let damage=calculateDamage(base*skill.power,defense,victim.target.level);
          if (victim.monster) this.hitMonsterWithSpell(id,victim.target as Monster,damage,"sword");
          else {
            const opponent=victim.target as Player;
            damage=this.swordGuardDamage(victim.id,player,damage);
            opponent.hp=Math.max(0,opponent.hp-damage); opponent.hitSeq++;
            this.broadcast("pvp_hit",{attackerId:id,targetId:victim.id,damage,hp:opponent.hp,maxHp:opponent.maxHp,hitSeq:opponent.hitSeq,source:"sword"},{afterNextPatch:true});
            if (opponent.hp===0) {
              player.pkKills++; opponent.pkDeaths++; this.knockoutPlayer(victim.id,"pk",id);
              void this.saveCharacter(id);
              this.broadcast("pvp_kill",{winnerId:id,loserId:victim.id,source:"sword",kills:player.pkKills,deaths:opponent.pkDeaths},{afterNextPatch:true});
            }
          }
        }
      }
    }
    this.broadcast("sword_skill_used",{playerId:id,skillId,targetId},{afterNextPatch:true});
    void this.saveCharacter(id);
  }

  private recordCombat(ownerId: string, targetId: string): void {
    this.lastCombatMs.set(ownerId, this.simulatedMs);
    if (!this.getMonster(targetId)) this.lastCombatMs.set(targetId, this.simulatedMs);
  }

  private applyStats(id:string, player: Player, allocations: Allocations): void {
    const stats = calculateModifiedStats(calculateStats(player.level, allocations),this.effects.modifiers(id));
    player.maxHp = stats.maxHp; player.atk = stats.atk; player.def = stats.def;
    player.magicAtk = stats.magicAtk; player.magicDef = stats.magicDef;
    player.maxStamina = stats.maxStamina;
    player.hp = Math.min(player.hp, stats.maxHp);
    player.stamina = Math.min(player.stamina, stats.maxStamina);
    player.statPoints = pointsAvailable(player.level, allocations);
    player.xpToNext = player.level >= PROGRESSION.maxLevel ? 0 : xpForNextLevel(player.level);
  }

  private endPossession(id:string, reason:string):void {
    if(!this.buffs.end(id,this.simulatedMs))return;
    rememberPossessionCooldown(this.persistentCharacters.get(id));
    this.effects.remove(id,POSSESSION_MODIFIER.id,POSSESSION_MODIFIER.sourceId);
    const player=this.state.players.get(id);
    if(player){player.possessionActive=false;this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());}
    this.broadcast("possession_changed",{playerId:id,active:false,reason},{afterNextPatch:true});
  }

  private grantMonsterExperience(id: string, sharedAmount?: number, monsterLevel: number = PROGRESSION.monsterLevel, tier:MonsterTier = "normal", shrineLoot = false): void {
    const player = this.state.players.get(id);
    const priorReward=this.pendingRewards.get(id);
    if (!player || !this.persistentCharacters.has(id) || (this.pendingWarps.has(id) && !priorReward)) return;
    // Freeze the winner while the previous item mutation and EXP write finish;
    // onLeave/saveCharacter await this task before capturing the final snapshot.
    this.pendingWarps.add(id);
    const priorItem = this.pendingItemUses.get(id);
    let task: Promise<void>;
    task = Promise.resolve().then(async () => {
      try {
        if (priorReward) await priorReward.catch(() => {});
        if (priorItem) await priorItem.catch(() => {});
        const current = this.state.players.get(id), snapshot = this.captureCharacterSnapshot(id);
        if (!current || !snapshot) return;
        const amount = current.level >= PROGRESSION.maxLevel ? 0 : (sharedAmount ?? monsterExperience(current.level, monsterLevel, tier));
        if (amount <= 0 && tier !== "boss" && !shrineLoot) return;
        const next = addExperience(current.level, current.experience, amount);
        const dropsPotion = (tier === "elite" && amount > 0) || tier === "boss";
        const prize = dropsPotion && snapshot.inventory ? grantRewardPotion(snapshot.inventory) : null;
        const afterPotion = prize ?? snapshot.inventory;
        const shard = shrineLoot && afterPotion ? grantStackReward(afterPotion, SHRINE_SHARD) : null;
        const loot = shard ?? prize;
        await characterStore.save({ ...snapshot, ...next, inventory:loot ?? snapshot.inventory, updatedAt: new Date().toISOString() });
        if (loot) this.inventories.set(id,loot);
        current.level = next.level; current.experience = next.experience;
        this.applyStats(id,current, this.statAllocations.get(id) ?? emptyAllocations());
        try {
          const recipient = this.clients.find(client => client.sessionId === id);
          if (loot) recipient?.send("inventory_state",loot);
          recipient?.send("experience_gained", {amount,level:next.level,experience:next.experience,
            ...(shrineLoot ? {shrineShard:shard ? "granted" : "bag_full"} : {}),
            ...(tier === "boss" ? {riftVictory:true} : {}),
            ...(dropsPotion ? {elitePotion:prize ? "granted" : "bag_full"} : {})});
        } catch { /* The committed reward remains available on reconnect. */ }
      } catch (error) {
        console.error("MONTRA EXP save failed:", id, error);
        this.clients.find(client => client.sessionId === id)?.send("character_save_error", { reason: "disk_write_failed" });
      } finally {
        if (this.pendingRewards.get(id)===task) { this.pendingWarps.delete(id); this.pendingRewards.delete(id); }
      }
    });
    this.pendingRewards.set(id, task);
  }

  private awardMonsterExperience(winnerId:string, monster:Monster = this.state.monster, tier:MonsterTier = "normal"): void {
    const winner=this.state.players.get(winnerId), party=this.parties.get(winnerId);
    const shrineLoot = characterStore.economyEnabled && monster.mapId === "forbidden_forest" && monster.id === SHRINE_GUARDIAN.id && tier === "elite";
    if (!winner) return;
    if (!party) {
      this.grantMonsterExperience(winnerId, undefined, monster.level, tier,
        shrineLoot && winner.alive && winner.mapId === monster.mapId && distance3d(winner,monster) <= PARTY_XP_RADIUS);
      return;
    }
    const members:PartyRewardMember[]=[];
    for(const id of party.members){
      const player=this.state.players.get(id);
      if(player)members.push({sessionId:id,mapId:player.mapId,x:player.x,y:player.y,z:player.z,alive:player.alive,
        persistent:this.persistentCharacters.has(id),level:player.level,
        inTransit:this.pendingWarps.has(id) && !this.pendingRewards.has(id)});
    }
    const shares=partyMonsterShares(winner.level,{mapId:monster.mapId,level:monster.level,tier,x:monster.x,y:monster.y,z:monster.z},members,PARTY_XP_RADIUS,shrineLoot);
    for(const share of shares)this.grantMonsterExperience(share.sessionId,share.amount,monster.level,tier,shrineLoot);
  }

  private guildAction(client:Client, action:(character:string)=>void):void {
    const character=this.persistentCharacters.get(client.sessionId);
    if(!character || this.pendingCharacterLeaves.has(client.sessionId))return this.reject(client,"guild_unavailable");
    if(!this.gates.get(client.sessionId)?.guild.consume(this.simulatedMs))return this.reject(client,"guild_rate_limited");
    try { action(character); }
    catch(error){
      const reasons=["guild_already_member","guild_name_taken","guild_leader_only","guild_full",
        "guild_not_member","guild_transfer_first","guild_invalid_member","guild_invite_expired","guild_invalid_target",
        "guild_officer_required","guild_invalid_assignment","guild_squad_required","guild_squad_full","guild_squad_leader_exists"];
      const reason=error instanceof Error && reasons.includes(error.message)?error.message:"guild_error";
      if(reason==="guild_error")console.error("MONTRA guild action failed",error);
      client.send("guild_error",{reason});
    }
  }
  private sendGuild(client:Client,character:string):void {
    client.send("guild_state",guildStore().view(character,guildOnline));
  }

  private partyAction(client:Client, action:()=>void): void {
    if (!this.gates.get(client.sessionId)?.party.consume(this.simulatedMs)) return this.reject(client,"party_rate_limited");
    if (!this.persistentCharacters.has(client.sessionId) || this.pendingCharacterLeaves.has(client.sessionId)) return this.reject(client,"party_unavailable");
    try { action(); } catch(error) {
      const reasons=["party_invalid_target","party_leader_only","party_full","party_target_joined","party_invite_expired"];
      const reason=error instanceof Error && reasons.includes(error.message) ? error.message : "party_error";
      if (reason==="party_error") console.error("MONTRA party error",error);
      client.send("party_error",{reason});
    }
  }
  private sendPartyState(party:Party): void {
    const members=party.members.map(sessionId=>({sessionId,name:this.state.players.get(sessionId)?.characterName ?? "ผู้เล่น"}));
    for(const id of party.members) {
      const client=this.clients.find(c=>c.sessionId===id);
      try { client?.send("party_state",{partyId:party.id,leaderId:party.leader,members,xpRadius:PARTY_XP_RADIUS}); } catch { /* disconnected */ }
    }
  }
  private leaveParty(id:string):void {
    const result=this.parties.leave(id); if(!result) return;
    const client=this.clients.find(c=>c.sessionId===id);
    try { client?.send("party_state",{partyId:null,leaderId:null,members:[]}); } catch { /* disconnected */ }
    if (result.current) this.sendPartyState(result.current);
  }
  private parsePartyInvitation(message:unknown):string|null {
    if (!message || typeof message!=="object" || Array.isArray(message)) return null;
    const value=message as Record<string,unknown>;
    return Object.keys(value).length===1 && typeof value.inviteId==="string" && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.inviteId) ? value.inviteId : null;
  }

  private economyId(client: Client): string | null {
    const id=client.sessionId, player=this.state.players.get(id), characterId=this.persistentCharacters.get(id);
    if (!characterStore.economyEnabled || !player || !player.alive || !characterId) { this.reject(client,"economy_unavailable"); return null; }
    if (this.pendingWarps.has(id) || this.pendingItemUses.has(id) || this.pendingRewards.has(id) || this.pendingCharacterLeaves.has(id)) { this.reject(client,"character_busy"); return null; }
    return characterId;
  }
  private economyAction(client: Client, action: (id:string)=>void): void {
    if (!this.gates.get(client.sessionId)?.economy.consume(this.simulatedMs)) return this.reject(client,"economy_rate_limited");
    const id=this.economyId(client); if (!id) return;
    try { action(id); } catch (error) {
      const allowed=["invalid_amount","invalid_slot","item_unavailable","item_equipped","inventory_full","duplicate_weapon","listing_unavailable","listing_limit","cannot_buy_own_listing","insufficient_gold","invalid_trade","invalid_gold","invalid_request_id","request_id_conflict","forge_max_rank","forge_item_changed","craft_missing_shard"];
      const reason=error instanceof Error && allowed.includes(error.message) ? error.message : "economy_failed";
      if (reason==="economy_failed") console.error("MONTRA economy failed",error);
      client.send("economy_error",{reason});
    }
  }
  private syncEconomy(client: Client, id: string): void {
    const account=characterStore.economy.getAccount(id), player=this.state.players.get(client.sessionId);
    if (!player) return;
    this.inventories.set(client.sessionId,account.inventory);
    player.equippedWeaponId=equippedWeaponId(account.inventory) ?? "";
    try { client.send("inventory_state",account.inventory); client.send("economy_state",{gold:account.gold}); } catch { /* disconnect does not roll back committed assets */ }
  }
  private tradeFor(client: Client, tradeId:string): TradeSession | null {
    const trade=this.trades.get(tradeId);
    if (!trade || (trade.a!==client.sessionId && trade.b!==client.sessionId)) { this.reject(client,"trade_unavailable"); return null; }
    if (this.simulatedMs >= trade.expires) { this.trades.delete(tradeId); this.reject(client,"trade_expired"); return null; }
    return trade;
  }
  private tradeSnapshot(id:string, offer:TradeOffer): string {
    const bag=this.inventories.get(id);
    if (!bag) throw new Error("invalid_trade");
    if (offer.slot===null) return "no_item";
    const stack=bag.slots[offer.slot];
    if (!stack || stack.quantity<offer.amount || bag.equippedWeaponSlot===offer.slot) throw new Error("item_unavailable");
    return JSON.stringify({stack, equipped:bag.equippedWeaponSlot});
  }
  private notifyTrade(trade:TradeSession, event:string): void {
    for (const id of [trade.a,trade.b]) {
      const client=this.clients.find(c=>c.sessionId===id); if (!client) continue;
      const other=id===trade.a?trade.b:trade.a;
      const describe=(who:string)=>trade.offers[who] ? {...trade.offers[who],item:trade.items[who]} : null;
      try { client.send(event,{tradeId:trade.id,otherId:other,otherName:this.state.players.get(other)?.characterName ?? "",own:describe(id),other:describe(other),ownConfirmed:trade.confirmed.has(id),otherConfirmed:trade.confirmed.has(other)}); } catch { /* disconnected */ }
    }
  }

  private async enterTerritory(client:Client,start:boolean){
    const id=client.sessionId,p=this.state.players.get(id),character=this.persistentCharacters.get(id);
    if(!p || !character || !WORLD_EXPANSION || this.field || !this.warClients.has(id) ||
       !this.gates.get(id)?.guild.consume(this.simulatedMs))return;
    const fort=warSites[p.mapId];
    if(!fort || !p.alive || p.flying || this.pendingWarps.has(id) || this.pendingCharacterLeaves.has(id) ||
       this.attackTargets.has(id) || [...this.attackTargets.values()].includes(id) ||
       this.simulatedMs-(this.lastCombatMs.get(id)??-Infinity)<WARP_COMBAT_LOCK_MS)
      return client.send("territory_error",{reason:"war_busy"});
    try{
      const war=guildStore().war,member=war.member(character);
      if(!member)throw Error("war_guild");
      if(start && planarDistance(p,fort)>5)throw Error("war_flag");
      const now=Date.now(),field=start?war.start(p.mapId,member,now):{site:p.mapId,seq:war.inspect(p.mapId,now).seq};
      const side=war.side(field,member,now);
      const roomId=await battleRoom(field);
      if(!this.clients.includes(client) || !p.alive || p.mapId!==field.site)return;
      const ticket=randomUUID();
      for(const [who,entry] of admissions)if(entry.expires<=Date.now())admissions.delete(who);
      const target=matchMaker.getLocalRoomById(roomId);
      if(!(target instanceof MyRoom))throw Error("war_unavailable");
      const occupied=[...target.warSeats.values()].filter(s=>s.side===side).length;
      const reserved=[...admissions].filter(([who,s])=>who!==character && s.roomId===roomId && s.side===side).length;
      if(occupied+reserved>=WAR_SIDE_SIZE)throw Error("war_side_full");
      admissions.set(character,{roomId,ticket,side,guild:member.id,expires:Date.now()+30_000});
      client.send("territory_transfer",{roomId,ticket});
    }catch(error){
      const reason=error instanceof Error?error.message:"";
      if(!reason.startsWith("war_"))console.error("MONTRA territory entry",error);
      client.send("territory_error",{reason:reason.startsWith("war_")?reason:"war_unavailable"});
    }
  }
  private useCityGate(client:Client,message:unknown){
    if(!this.field || !parseEmptyCommand(message))return;
    const id=client.sessionId,p=this.state.players.get(id),seat=this.warSeats.get(id),character=this.persistentCharacters.get(id);
    if(!p?.alive || !seat || !character || !isOnGround(p.y) || this.climbs.has(id) || this.pendingCharacterLeaves.has(id))return;
    const now=Date.now();
    if(now-(this.gateActions.get(id)??-Infinity)<1000)return;
    const war=guildStore().war,gate=WORLD_MAPS[this.field.site].strategic!.rampart!.gates[0].box;
    if(war.member(character)?.id!==seat.guild || !segmentIntersectsExpandedWall(p,p,gate,2.5) ||
      (seat.side==="defend" && p.z>=gate.z+gate.length/2))return client.send("territory_error",{reason:"war_gate_near"});
    const occupied=[...this.state.players.values()].some(peer=>peer.alive && isOnGround(peer.y) && segmentIntersectsExpandedWall(peer,peer,gate,.4));
    this.gateActions.set(id,now);
    try{war.gate(this.field,seat.side,occupied,now);this.gateClosed=war.inspect(this.field.site,now).gateClosed;this.nextWarSample=0;}
    catch(e){const reason=e instanceof Error ? e.message:"";if(!reason.startsWith("war_"))console.error("MONTRA gate",e);client.send("territory_error",{reason:reason.startsWith("war_")?reason:"war_unavailable"});}
  }
  private updateTerritory(){
    if(!WORLD_EXPANSION || (!this.warClients.size && !this.field) || this.simulatedMs<this.nextWarSample)return;
    this.nextWarSample=this.simulatedMs+1000;
    const now=Date.now(),war=guildStore().war;
    let attack=0,defend=0;
    if(this.field){
      const fort=warSites[this.field.site];
      for(const [id,seat] of this.warSeats){
        const p=this.state.players.get(id),character=this.persistentCharacters.get(id);
        if(!p || !character || this.pendingCharacterLeaves.has(id))continue;
        if(war.member(character)?.id!==seat.guild){this.clients.find(c=>c.sessionId===id)?.leave(4000,"war_membership_changed");continue;}
        if(p.alive && isOnGround(p.y) && !p.flying && p.mapId===this.field.site && planarDistance(p,fort)<=5){
          if(seat.side==="attack")attack++;else defend++;
        }
      }
      war.advance(this.field,now,attack,defend);
    }
    const states=Object.fromEntries(Object.keys(warSites).map(site=>[site,war.inspect(site,now)]));
    if(this.field){const s=states[this.field.site];this.battleActive=s.seq===this.field.seq && s.phase==="battle";this.gateClosed=this.battleActive && s.gateClosed;}
    const owners=Object.fromEntries(Object.entries(states).map(([site,s])=>[site,s.owner]));
    const teams=this.field?Object.fromEntries([...this.warSeats].map(([id,seat])=>[id,seat.side])):undefined;
    for(const c of this.clients){
      if(!this.warClients.has(c.sessionId))continue;
      const p=this.state.players.get(c.sessionId);if(!p)continue;
      const s=states[p.mapId],character=this.persistentCharacters.get(c.sessionId),member=s&&character?war.member(character):null;
      const inField=Boolean(this.field),ownBattle=!inField || this.field?.seq===s?.seq;
      const local=s?{site:p.mapId,phase:ownBattle?s.phase:"finished",owner:s.owner,attackName:s.attackName,defendName:s.defendName,
        progress:Math.trunc(s.progress),goal:WAR_HOLD,seconds:s.seconds,attack,defend,inField,side:this.warSeats.get(c.sessionId)?.side,
        gateHp:s.gateHp,gateClosed:inField && this.gateClosed,
        canStart:!inField && s.phase==="open" && member?.officer===true && member.id!==s.ownerId,
        canJoin:!inField && s.phase==="battle" && !!member && (member.id===s.attacker || member.id===s.defender || (!s.owner && !s.defendName && member.officer))}:null;
      const payload={owners,local,teams},signature=JSON.stringify(payload);
      if(signature!==this.warSent.get(c.sessionId)){c.send("territory_state",payload);this.warSent.set(c.sessionId,signature);}
    }
  }
  messages = {
    territory_gate:(client:Client,message:unknown)=>this.useCityGate(client,message),
    get_territories:(client:Client,message:unknown)=>{
      if(parseEmptyCommand(message) && this.warClients.has(client.sessionId) && this.gates.get(client.sessionId)?.guild.consume(this.simulatedMs))this.warSent.delete(client.sessionId);
    },
    territory_start:(client:Client,message:unknown)=>{if(parseEmptyCommand(message))void this.enterTerritory(client,true);},
    territory_join:(client:Client,message:unknown)=>{if(parseEmptyCommand(message))void this.enterTerritory(client,false);},
    get_guild: (client:Client,message:unknown) => {
      if(!parseEmptyCommand(message))return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>this.sendGuild(client,character));
    },
    guild_create: (client:Client,message:unknown) => {
      const name=parseGuildName(message);if(!name)return this.reject(client,"guild_invalid_name");
      this.guildAction(client,character=>{
        const player=this.state.players.get(client.sessionId);if(!player)throw new Error("guild_invalid_target");
        guildStore().create(character,player.characterName,name);notifyGuilds();
      });
    },
    guild_invite: (client:Client,message:unknown) => {
      const request=parseTradeRequest(message);if(!request)return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>{
        const guild=guildStore().view(character,guildOnline),target=this.clients.find(c=>c.sessionId===request.targetId);
        const targetCharacter=this.persistentCharacters.get(request.targetId);
        const actor=guild?.members.find(m=>m.id===guild.ownId);
        if(!guild || !actor || (actor.rank!=="commander" && actor.rank!=="officer"))throw new Error("guild_officer_required");
        if(guild.members.length>=GUILD_MAX_MEMBERS)throw new Error("guild_full");
        if(!target || !targetCharacter || request.targetId===client.sessionId || this.pendingCharacterLeaves.has(request.targetId))throw new Error("guild_invalid_target");
        if(guildStore().view(targetCharacter,guildOnline))throw new Error("guild_already_member");
        for(const [id,invite] of this.guildInvites)if(invite.expires<=this.simulatedMs || invite.to===request.targetId)this.guildInvites.delete(id);
        const id=randomUUID();
        this.guildInvites.set(id,{from:client.sessionId,to:request.targetId,guildId:guild.id,expires:this.simulatedMs+60000});
        target.send("guild_invitation",{inviteId:id,guildName:guild.name,fromName:this.state.players.get(client.sessionId)?.characterName ?? "",expiresIn:60});
        client.send("guild_notice",{reason:"invitation_sent"});
      });
    },
    guild_accept: (client:Client,message:unknown) => {
      const inviteId=this.parsePartyInvitation(message);if(!inviteId)return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>{
        const invite=this.guildInvites.get(inviteId),leader=invite && this.persistentCharacters.get(invite.from);
        if(!invite || invite.to!==client.sessionId || invite.expires<=this.simulatedMs || !leader || this.pendingCharacterLeaves.has(invite.from)){
          if(invite && invite.expires<=this.simulatedMs)this.guildInvites.delete(inviteId);
          throw new Error("guild_invite_expired");
        }
        const player=this.state.players.get(client.sessionId);if(!player)throw new Error("guild_invalid_target");
        const inviter=guildStore().view(leader,guildOnline);
        const inviterRank=inviter?.members.find(m=>m.id===inviter.ownId)?.rank;
        if(inviter?.id!==invite.guildId || (inviterRank!=="commander" && inviterRank!=="officer"))throw new Error("guild_invite_expired");
        guildStore().add(leader,character,player.characterName);
        this.guildInvites.delete(inviteId);client.send("guild_invitation_closed",{});notifyGuilds();
      });
    },
    guild_decline: (client:Client,message:unknown) => {
      const inviteId=this.parsePartyInvitation(message);if(!inviteId)return this.reject(client,"guild_invalid_request");
      this.guildAction(client,()=>{
        const invite=this.guildInvites.get(inviteId);
        if(!invite || invite.to!==client.sessionId || invite.expires<=this.simulatedMs)throw new Error("guild_invite_expired");
        this.guildInvites.delete(inviteId);client.send("guild_invitation_closed",{});
        this.clients.find(c=>c.sessionId===invite.from)?.send("guild_notice",{reason:"invitation_declined"});
      });
    },
    guild_leave: (client:Client,message:unknown) => {
      if(!parseEmptyCommand(message))return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>{guildStore().leave(character);notifyGuilds();});
    },
    guild_assign: (client:Client,message:unknown) => {
      if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"guild_invalid_request");
      const value=message as Record<string,unknown>;
      if(Object.keys(value).length!==3 || typeof value.memberId!=="string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.memberId) ||
        (value.kind!=="rank" && value.kind!=="squad" && value.kind!=="specialty"))return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>{
        guildStore().assign(character,value.memberId as string,value.kind as "rank"|"squad"|"specialty",value.value);
        notifyGuilds();
      });
    },
    guild_manage: (client:Client,message:unknown) => {
      if(!message || typeof message!=="object" || Array.isArray(message))return this.reject(client,"guild_invalid_request");
      const value=message as Record<string,unknown>;
      if(Object.keys(value).length!==2 || typeof value.memberId!=="string" ||
         !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value.memberId) ||
         (value.action!=="kick" && value.action!=="transfer"))return this.reject(client,"guild_invalid_request");
      this.guildAction(client,character=>{guildStore().manage(character,value.memberId as string,value.action as "kick"|"transfer");notifyGuilds();});
    },
    get_party: (client:Client,message:unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client,"party_invalid_request");
      this.partyAction(client,()=>{const party=this.parties.get(client.sessionId);if(party)this.sendPartyState(party);else client.send("party_state",{partyId:null,leaderId:null,members:[]});});
    },
    party_invite: (client:Client,message:unknown) => {
      const request=parseTradeRequest(message); if(!request) return this.reject(client,"party_invalid_request");
      this.partyAction(client,()=>{
        const target=this.clients.find(c=>c.sessionId===request.targetId), player=this.state.players.get(client.sessionId);
        if(!target || !player || !this.persistentCharacters.has(request.targetId) || this.pendingCharacterLeaves.has(request.targetId)) throw new Error("party_invalid_target");
        if(this.field && this.warSeats.get(client.sessionId)?.side!==this.warSeats.get(request.targetId)?.side)throw Error("party_invalid_target");
        const invite=this.parties.invite(client.sessionId,request.targetId,this.simulatedMs);
        target.send("party_invitation",{inviteId:invite.id,fromId:client.sessionId,fromName:player.characterName,expiresIn:60});
        client.send("party_notice",{reason:"invitation_sent"});
      });
    },
    party_accept: (client:Client,message:unknown) => {
      const inviteId=this.parsePartyInvitation(message); if(!inviteId) return this.reject(client,"party_invalid_request");
      this.partyAction(client,()=>{
        const invite=this.parties.invitation(client.sessionId,inviteId,this.simulatedMs);
        if(!this.state.players.has(invite.from) || !this.persistentCharacters.has(invite.from) || this.pendingCharacterLeaves.has(invite.from)) throw new Error("party_invite_expired");
        this.sendPartyState(this.parties.accept(client.sessionId,inviteId,this.simulatedMs));
      });
    },
    party_decline: (client:Client,message:unknown) => {
      const inviteId=this.parsePartyInvitation(message); if(!inviteId) return this.reject(client,"party_invalid_request");
      this.partyAction(client,()=>{const invite=this.parties.decline(client.sessionId,inviteId,this.simulatedMs);this.clients.find(c=>c.sessionId===invite.from)?.send("party_notice",{reason:"invitation_declined"});client.send("party_invitation_closed",{});});
    },
    party_leave: (client:Client,message:unknown) => {
      if(!parseEmptyCommand(message)) return this.reject(client,"party_invalid_request");
      this.partyAction(client,()=>this.leaveParty(client.sessionId));
    },
    get_economy: (client:Client, message:unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>this.syncEconomy(client,id));
    },
    market_list: (client:Client, message:unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>client.send("market_state",{listings:characterStore.economy.list(id).map(x=>({id:x.id,seller:x.seller.slice(0,12),item:x.item,price:x.price}))}));
    },
    market_create: (client:Client, message:unknown) => {
      const order=parseMarketCreate(message); if (!order) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{const result=characterStore.economy.listItem(id,order.requestId,order.slot,order.amount,order.price); this.syncEconomy(client,id); client.send("market_result",{action:"create",...result,requestId:order.requestId});});
    },
    market_buy: (client:Client, message:unknown) => {
      const order=parseMarketAction(message); if (!order) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{const result=characterStore.economy.buy(id,order.requestId,order.listingId); this.syncEconomy(client,id); client.send("market_result",{action:"buy",...result,requestId:order.requestId});});
    },
    market_cancel: (client:Client, message:unknown) => {
      const order=parseMarketAction(message); if (!order) return this.reject(client,"invalid_economy_request");
      this.economyAction(client,id=>{const result=characterStore.economy.cancel(id,order.requestId,order.listingId); this.syncEconomy(client,id); client.send("market_result",{action:"cancel",...result,requestId:order.requestId});});
    },
    trade_request: (client:Client, message:unknown) => {
      const order=parseTradeRequest(message); if (!order) return this.reject(client,"invalid_trade");
      this.economyAction(client,()=>{
        const id=client.sessionId, target=this.clients.find(c=>c.sessionId===order.targetId), a=this.state.players.get(id), b=this.state.players.get(order.targetId);
        for (const [key,trade] of this.trades) if (this.simulatedMs>=trade.expires) this.trades.delete(key);
        if (!target || !a || !b || id===order.targetId || !this.economyId(target) || a.mapId!==b.mapId || distance3d(a,b)>5 || [...this.trades.values()].some(t=>[t.a,t.b].includes(id)||[t.a,t.b].includes(order.targetId))) throw new Error("invalid_trade");
        const trade:TradeSession={id:randomUUID(),a:id,b:order.targetId,expires:this.simulatedMs+60_000,offers:{},items:{},fingerprints:{},confirmed:new Set()};
        this.trades.set(trade.id,trade); this.notifyTrade(trade,"trade_update");
      });
    },
    trade_offer: (client:Client, message:unknown) => {
      const order=parseTradeOffer(message); if (!order) return this.reject(client,"invalid_trade");
      this.economyAction(client,id=>{
        const trade=this.tradeFor(client,order.tradeId); if (!trade) return;
        const offer:TradeOffer={slot:order.slot,amount:order.amount,gold:order.gold};
        if (characterStore.economy.getAccount(id).gold<offer.gold) throw new Error("insufficient_gold");
        trade.fingerprints[client.sessionId]=this.tradeSnapshot(client.sessionId,offer);
        const stack=offer.slot===null ? null : this.inventories.get(client.sessionId)?.slots[offer.slot];
        trade.items[client.sessionId]=stack ? {...stack,quantity:offer.amount} : null;
        trade.offers[client.sessionId]=offer; trade.confirmed.clear(); this.notifyTrade(trade,"trade_update");
      });
    },
    trade_confirm: (client:Client, message:unknown) => {
      const order=parseTradeId(message); if (!order) return this.reject(client,"invalid_trade");
      this.economyAction(client,()=>{
        const trade=this.tradeFor(client,order.tradeId); if (!trade) return;
        const aClient=this.clients.find(c=>c.sessionId===trade.a), bClient=this.clients.find(c=>c.sessionId===trade.b);
        const a=this.state.players.get(trade.a), b=this.state.players.get(trade.b);
        if (!aClient || !bClient || !a || !b || !trade.offers[trade.a] || !trade.offers[trade.b] || a.mapId!==b.mapId || distance3d(a,b)>5) throw new Error("invalid_trade");
        const aId=this.economyId(aClient), bId=this.economyId(bClient);
        if (!aId || !bId) throw new Error("invalid_trade");
        if ([trade.a,trade.b].some(id=>this.tradeSnapshot(id,trade.offers[id])!==trade.fingerprints[id])) { trade.confirmed.clear(); throw new Error("invalid_trade"); }
        trade.confirmed.add(client.sessionId);
        if (trade.confirmed.size<2) { this.notifyTrade(trade,"trade_update"); return; }
        characterStore.economy.trade(aId,bId,trade.id,trade.offers[trade.a],trade.offers[trade.b]);
        this.trades.delete(trade.id); this.syncEconomy(aClient,aId); this.syncEconomy(bClient,bId); this.notifyTrade(trade,"trade_complete");
      });
    },
    trade_cancel: (client:Client, message:unknown) => {
      const order=parseTradeId(message); if (!order) return this.reject(client,"invalid_trade");
      this.economyAction(client,()=>{const trade=this.tradeFor(client,order.tradeId); if (trade) { this.trades.delete(trade.id); this.notifyTrade(trade,"trade_cancelled"); }});
    },
    chat: (client: Client, message: unknown) => {
      const command=parseChatMessage(message);
      if(!command) return this.reject(client,"invalid_chat");
      const id=client.sessionId, player=this.state.players.get(id);
      if(!player || this.pendingWarps.has(id)) return this.reject(client,"chat_unavailable");
      if(!this.gates.get(id)?.chat.consume(this.simulatedMs)) return this.reject(client,"chat_rate_limited");
      if(command.channel==="bug") {
        if(!this.gates.get(id)?.bugReport.consume(this.simulatedMs)) return this.reject(client,"chat_bug_rate_limited");
        const entry={name:player.characterName,mapId:player.mapId,x:player.x,y:player.y,z:player.z,text:command.text};
        void saveBugReport(characterStore.directory,entry).then(reportId=>client.send("chat_report_result",{ok:true,reportId}))
          .catch(error=>{console.error("MONTRA bug report save failed",error);try {client.send("chat_report_result",{ok:false});} catch { /* disconnected */ }});
        return;
      }
      const party=command.channel==="party" ? this.parties.get(id) : null;
      if(command.channel==="party" && !party) return this.reject(client,"chat_party_unavailable");
      let target:Client | undefined;
      if(command.channel==="private") {
        target=this.clients.find(peer=>peer.sessionId===command.targetId);
        if(!target || target.sessionId===id || !this.state.players.has(target.sessionId) || this.pendingWarps.has(target.sessionId)) return this.reject(client,"chat_target_unavailable");
      }
      const event={senderId:id,name:player.characterName,mapId:player.mapId,channel:command.channel,text:command.text,
        ...(target ? {targetId:target.sessionId,targetName:this.state.players.get(target.sessionId)!.characterName} : {})};
      for(const peer of this.clients) {
        const recipient=this.state.players.get(peer.sessionId);
        if(!recipient || this.pendingWarps.has(peer.sessionId)) continue;
        const deliver=command.channel==="world" || (command.channel==="map" && recipient.mapId===player.mapId) ||
          (command.channel==="party" && party!.members.includes(peer.sessionId)) ||
          (command.channel==="private" && (peer.sessionId===id || peer.sessionId===target!.sessionId));
        if(deliver) peer.send("chat_message",event);
      }
    },
    craft_weapon: (client: Client, message: unknown) => {
      const order = parseCraft(message);
      if (!order) return this.reject(client, "invalid_economy_request");
      this.economyAction(client, id => {
        const result = characterStore.economy.craftShrineGlaive(id, order.requestId);
        this.syncEconomy(client, id);
        client.send("craft_result", {requestId: order.requestId, ...result});
      });
    },
    forge_weapon: (client: Client, message: unknown) => {
      const order = parseForge(message);
      if (!order) return this.reject(client, "invalid_economy_request");
      this.economyAction(client, id => {
        const result = characterStore.economy.forgeWeapon(id, order.requestId, order.slot, order.stamp, order.action);
        this.syncEconomy(client, id);
        client.send("forge_result", { requestId: order.requestId, action: order.action, ...result });
      });
    },
    select_build: (client: Client, message: unknown) => {
      const build = parseBuild(message);
      if (!build) return this.reject(client, "invalid_build");
      this.selectBuild(client, build);
    },
    sword_tree_learn: (client: Client, message: unknown) => this.changeSwordTree(client, message, "learn"),
    sword_tree_school: (client: Client, message: unknown) => this.changeSwordTree(client, message, "school"),
    sword_tree_reset: (client: Client, message: unknown) => this.changeSwordTree(client, message, "reset"),
    sword_tree_equip: (client: Client, message: unknown) => this.changeSwordTree(client, message, "equip"),
    sword_skill: (client: Client, message: unknown) => this.castSwordSkill(client, message),
    muay_skill: (client: Client, message: unknown) => this.castMuaySkill(client, message),
    grapple_escape: (client: Client, message: unknown) => this.escapeMuayGrapple(client, message),
    grapple_counter: (client: Client, message: unknown) => this.counterMuayGrapple(client, message),
    muay_book: (client: Client, message: unknown) => this.changeMuayBook(client, message),
    cast_class_skill: (client: Client, message: unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_build");
      this.castClassSkill(client);
    },
    allocate_stat: (client: Client, _message: unknown) => this.reject(client, "automatic_stats"),
    warp: (client: Client, message: unknown) => {
      if(this.field)return client.send("territory_error",{reason:"war_exit"});
      const id = client.sessionId;
      if(this.muayControlled(id))return this.reject(client,"muay_controlled");
      const player = this.state.players.get(id);
      if (!player || !this.persistentCharacters.has(id)) return this.reject(client, "character_not_persistent");
      if (this.pendingItemUses.has(id) || this.pendingWarps.has(id)) return this.reject(client, "character_busy");
      const engaged = this.attackTargets.has(id) || this.state.monster.targetId === id || this.forest.engaged(id) ||
        [...this.attackTargets.values()].includes(id);
      const result = checkWarp(message, {
        mapId: player.mapId, position: player, alive: player.alive,
        flying: player.flying, climbing: this.climbs.has(id),
        dashing: this.activeDashes.has(id), changingHeight: this.flightTransitions.has(id),
        lastCombatMs: engaged ? this.simulatedMs : (this.lastCombatMs.get(id) ?? -Infinity),
        lastWarpMs: this.lastWarpMs.get(id) ?? -Infinity, nowMs: this.simulatedMs,
      });
      if ("reason" in result) return this.reject(client, result.reason);
      const snapshot = this.captureCharacterSnapshot(id);
      if (!snapshot) return this.reject(client, "character_not_persistent");
      const portal = result.portal;
      if(getWorldMap(portal.targetMapId)?.strategic && !this.provinceClients.has(id))return this.reject(client,"world_client_update_required");
      if(isAtlasMap(portal.targetMapId) && !this.atlasClients.has(id))return this.reject(client,"world_client_update_required");
      if(portal.targetMapId===TEMPLE_ID && !this.templeClients.has(id))return this.reject(client,"world_client_update_required");
      const destination = { ...snapshot, mapId: portal.targetMapId, ...portal.targetSpawn,
        updatedAt: new Date().toISOString() };
      // Freeze the actor during disk I/O. All other save paths wait for this
      // shared item/character mutation lock before taking their snapshots.
      this.pendingWarps.add(id);
      const task = (async () => {
        try {
          try {
            await characterStore.save(destination);
          } catch (error) {
            console.error("MONTRA warp save failed:", id, error);
            try { client.send("warp_failed", { reason: "disk_write_failed" }); } catch { /* disconnected */ }
            return;
          }
          const current = this.state.players.get(id);
          if (!current) return;
          // Once the durable write succeeds, commit the destination before
          // any optional notifications so a disconnected client cannot turn
          // a committed warp into a misleading disk-failure result.
          current.mapId = portal.targetMapId;
          current.x = portal.targetSpawn.x; current.y = portal.targetSpawn.y; current.z = portal.targetSpawn.z;
          current.targetId = ""; current.combatState = "idle"; current.flying = false;
          if(current.pathId==="muay_boran"){this.swordGuards.delete(id);this.clearMuayDefense(id,"cancelled");this.sendSwordNotice(client,"muay_counter_cleared",{});}
          this.clearMuayCombo(id);
          this.clearMuayCombosForTarget(id);
          this.clearGrappleCountersFor(id,"warp");
          this.destinations.delete(id);
          this.attackTargets.delete(id);
          for (const [otherId, targetId] of this.attackTargets) {
            if (targetId === id) {
              const other = this.state.players.get(otherId);
              if (other) this.endAttack(otherId, other);
            }
          }
          if (this.state.monster.targetId === id) this.state.monster.targetId = "";
          this.forest.clearTarget(id);
          this.despawnSummon(id, "warp");
          this.playerSpawn.set(id, getSafeMapSpawn(portal.targetMapId));
          this.lastWarpMs.set(id, this.simulatedMs);
          try { client.send("warp_complete", { mapId: current.mapId }); } catch { /* disconnected */ }
        } finally {
          this.pendingWarps.delete(id);
          this.pendingItemUses.delete(id);
        }
      })();
      this.pendingItemUses.set(id, task);
    },
    equip_weapon: (client: Client, message: unknown) => {
      const order = parseEquipWeaponCommand(message);
      if (!order) return this.reject(client, "invalid_weapon_equip");
      const id = client.sessionId;
      const player = this.state.players.get(id);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      if (this.pendingWarps.has(id)) return this.reject(client, "character_busy");
      if (this.climbs.has(id) || this.flightTransitions.has(id) ||
          this.activeDashes.has(id)) return this.reject(client, "equipment_busy");
      const inventory = this.inventories.get(id);
      if (!inventory || !this.persistentCharacters.has(id)) {
        return this.reject(client, "inventory_unavailable");
      }
      if (this.pendingItemUses.has(id)) return this.reject(client, "item_busy");
      if (this.simulatedMs - (this.lastWeaponEquipMs.get(id) ?? -Infinity) < 700) {
        return this.reject(client, "equipment_cooldown");
      }
      const change = equipInventoryWeapon(inventory, order.slot);
      // Explicit guard works under both strict and non-strict Windows TS.
      if ("reason" in change) return this.reject(client, change.reason);
      const snapshot = this.captureCharacterSnapshot(id, change.inventory);
      if (!snapshot) return this.reject(client, "inventory_unavailable");

      // Save before activating the combat bonus or acknowledging equipment.
      // Weapon equip and potion use share one private mutation lock.
      const task = (async () => {
        try {
          await characterStore.save(snapshot);
          const current = this.state.players.get(id);
          if (!current || this.inventories.get(id) !== inventory) return;
          this.inventories.set(id, change.inventory);
          current.equippedWeaponId = change.weaponId ?? "";
          if (current.pathId === "muay_boran" && change.weaponId !== MUAY_WRAP_ID) {
            this.swordGuards.delete(id);
            this.clearMuayDefense(id,"cancelled");
            this.clearMuayCombo(id);
            this.sendSwordNotice(client,"muay_counter_cleared",{});
          }
          this.lastWeaponEquipMs.set(id, this.simulatedMs);
          client.send("inventory_state", change.inventory);
          client.send("weapon_equipped", {
            slot: order.slot, weaponId: change.weaponId,
          });
        } catch (error) {
          console.error("MONTRA weapon equip write failed:", id, error);
          client.send("item_use_failed", { reason: "disk_write_failed" });
        } finally {
          this.pendingItemUses.delete(id);
        }
      })();
      this.pendingItemUses.set(id, task);
    },
    get_inventory: (client: Client, message: unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_inventory_request");
      const id = client.sessionId;
      const inventory = this.inventories.get(id);
      if (!inventory) return this.reject(client, "inventory_unavailable");
      const last = this.lastInventoryReadMs.get(id) ?? -Infinity;
      if (this.simulatedMs - last < 1_000) return;
      this.lastInventoryReadMs.set(id, this.simulatedMs);
      client.send("inventory_state", inventory);
    },
    use_item: (client: Client, message: unknown) => {
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
      const slot = parseUseItemCommand(message);
      if (slot === null) return this.reject(client, "invalid_item_use");
      const id = client.sessionId;
      const player = this.state.players.get(id);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      const inventory = this.inventories.get(id);
      if (!inventory || !this.persistentCharacters.has(id)) {
        return this.reject(client, "inventory_unavailable");
      }
      if (this.pendingItemUses.has(id)) return this.reject(client, "item_busy");
      if (this.simulatedMs - (this.lastItemUseMs.get(id) ?? -Infinity) <
          POTION_COOLDOWN_MS) return this.reject(client, "item_cooldown");
      const result = useInventoryItem(
        inventory, slot, player.hp, player.maxHp, player.alive);
      // The Windows VPS build uses different TS strictness from CI.
      // An explicit property guard narrows ItemUseResult in both modes.
      if ("reason" in result) return this.reject(client, result.reason);
      const snapshot = this.captureCharacterSnapshot(id, result.inventory, result.hp);
      if (!snapshot) return this.reject(client, "inventory_unavailable");

      // Durability-first transaction: the server writes the decremented stack
      // atomically BEFORE updating HP or acknowledging the potion. If disk is
      // full, neither HP nor potion count changes for the player.
      const task = (async () => {
        try {
          await characterStore.save(snapshot);
          const current = this.state.players.get(id);
          if (!current || this.inventories.get(id) !== inventory) return;
          this.inventories.set(id, result.inventory);
          const beforeHp = current.hp;
          if (current.alive) {
            // Apply the heal on top of any damage that occurred DURING I/O.
            // Never resurrect a player killed while a save was pending.
            current.hp = Math.min(current.maxHp, current.hp + result.healed);
          }
          this.lastItemUseMs.set(id, this.simulatedMs);
          client.send("inventory_state", result.inventory);
          client.send("item_used", {
            slot, itemId: POTION_ID,
            healed: Math.max(0, current.hp - beforeHp),
            hp: current.hp,
          });
        } catch (error) {
          console.error("MONTRA item use persistence failed:", id, error);
          client.send("item_use_failed", { reason: "disk_write_failed" });
        } finally {
          this.pendingItemUses.delete(id);
        }
      })();
      this.pendingItemUses.set(id, task);
    },
    fly: (client: Client, message: unknown) => {
      if(this.muayControlled(client.sessionId))return this.reject(client,"muay_controlled");
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_flight");
      const id = client.sessionId;
      const player = this.state.players.get(id);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      if (this.climbs.has(id)) return this.reject(client, "climbing");
      if (this.activeDashes.has(id)) return this.reject(client, "dashing");
      if (this.flightTransitions.has(id)) return this.reject(client, "flight_in_progress");
      const flightMap=getWorldMap(player.mapId);
      if (!player.flying && (flightMap?.region?.noFlight || flightMap?.strategic?.kind==="territory")) return this.reject(client, "flight_forbidden");
      if (!this.gates.get(id)?.flight.consume(this.simulatedMs)) {
        return this.reject(client, "flight_rate_limited");
      }
      const landing = player.flying;
      // Do NOT allow a landing into the wall's solid body or off map.
      const landingY = landing ? (player.mapId === DEFAULT_MAP_ID
        ? flightLandingHeight(player.x, player.z) : 0) : null;
      if (landing && (landingY === null ||
          !this.canOccupy(player.x, player.z, landingY, false, player.mapId))) {
        return this.reject(client, "landing_blocked");
      }
      if (!landing && !isOnGround(player.y) && !isOnPlatform(player.y)) {
        return this.reject(client, "flight_unavailable");
      }
      const targetY = landing ? landingY! : FLIGHT.altitude;
      this.attackTargets.delete(id);
      this.destinations.delete(id);
      player.targetId = "";
      player.combatState = landing ? "descending" : "ascending";
      // Flying stays true during descent so its state is never persisted as
      // a partial/in-between height; only completion returns ground/wall mode.
      player.flying = true;
      this.flightTransitions.set(id, { targetY, landing });
      this.broadcast("flight_started", {
        playerId: id, direction: landing ? "down" : "up", targetY,
      }, { afterNextPatch: true });
    },
    dash: (client: Client, message: unknown) => {
      if(this.muayControlled(client.sessionId))return this.reject(client,"muay_controlled");
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
      const direction = parseDashCommand(message);
      if (!direction) return this.reject(client, "invalid_dash");
      const id = client.sessionId;
      const player = this.state.players.get(id);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      if (this.climbs.has(id)) return this.reject(client, "climbing");
      if (player.flying || this.flightTransitions.has(id)) return this.reject(client, "flying");
      if (this.activeDashes.has(id)) return this.reject(client, "dash_in_progress");
      if (this.simulatedMs - (this.lastDashMs.get(id) ?? -Infinity) < RULES.dashCooldownMs) {
        return this.reject(client, "dash_cooldown");
      }
      if (!this.gates.get(id)?.dash.consume(this.simulatedMs)) {
        return this.reject(client, "dash_rate_limited");
      }
      if (player.stamina < PROGRESSION.dashCost) return this.reject(client, "insufficient_stamina");
      player.stamina -= PROGRESSION.dashCost;

      // Dash replaces an attack approach or tap-to-move order; the client
      // cannot set the start point, height, distance, elapsed time or speed.
      this.attackTargets.delete(id);
      this.destinations.delete(id);
      player.targetId = "";
      player.facing = facingTo(direction.dx, direction.dz);
      player.combatState = "dashing";
      this.activeDashes.set(id, { ...direction, remaining: RULES.dashDistance });
      this.lastDashMs.set(id, this.simulatedMs);
      this.broadcast("dash_started", { playerId: id }, { afterNextPatch: true });
    },
    get_character_slots: (client: Client, message: unknown) => {
      if (!parseEmptyCommand(message)) return this.reject(client, "invalid_slot_request");
      const id = client.sessionId;
      const ids = this.guestSlotIds.get(id);
      if (!ids) return this.reject(client, "character_not_persistent");
      const previous = this.lastSlotListMs.get(id) ?? -Infinity;
      if (this.simulatedMs - previous < 2_000) return;
      this.lastSlotListMs.set(id, this.simulatedMs);
      void characterStore.listSlots(ids).then(slots => {
        if (this.guestSlotIds.get(id) === ids) client.send("character_slots", { slots });
      }).catch(error => console.error("MONTRA slot list failed", error));
    },
    rename_character: (client: Client, message: unknown) => {
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
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
      const party=this.parties.get(id); if(party) this.sendPartyState(party);
      const guildCharacter=this.persistentCharacters.get(id);
      if(guildCharacter){try{if(guildStore().rename(guildCharacter,name))notifyGuilds();}catch(error){console.error("MONTRA guild rename failed",error);}}
      void this.saveCharacter(id);
    },
    move: (client: Client, message: unknown) => {
      if(this.muayControlled(client.sessionId))return this.reject(client,"muay_controlled");
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
      const destination = parseMoveCommand(message, getWorldMap(this.state.players.get(client.sessionId)?.mapId ?? DEFAULT_MAP_ID)?.bounds);
      if (!destination) return this.reject(client, "invalid_move");
      const player = this.state.players.get(client.sessionId);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      if (this.climbs.has(client.sessionId)) return this.reject(client, "climbing");
      if (this.activeDashes.has(client.sessionId)) return this.reject(client, "dashing");
      if (this.flightTransitions.has(client.sessionId)) return this.reject(client, "flight_in_progress");
      if (!player.flying && isOnPlatform(player.y) && !this.canOccupy(destination.x,destination.z,player.y,false,player.mapId)) {
        return this.reject(client, "must_descend");
      }
      if (!this.gates.get(client.sessionId)?.move.consume(this.simulatedMs)) {
        return this.reject(client, "move_rate_limited");
      }

      // A manual tap cancels auto-approach AND auto-attack (even if walking).
      this.attackTargets.delete(client.sessionId);
      player.targetId = "";
      player.combatState = "moving";
      const r=getWorldMap(player.mapId)?.strategic?.rampart;
      if(r && isOnPlatform(player.y))this.crestTurns.set(client.sessionId,crestCorners(r,player,destination));
      else this.crestTurns.delete(client.sessionId);
      this.destinations.set(client.sessionId, destination);
    },

    attack: (client: Client, message: unknown) => {
      if(this.muayControlled(client.sessionId))return this.reject(client,"muay_controlled");
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
      const monsterOrder = parseAttackCommand(message);
      const pkOrder = monsterOrder ? null : parsePkTargetCommand(message);
      if (!monsterOrder && !pkOrder) return this.reject(client, "invalid_attack");

      const attackerId = client.sessionId;
      const attacker = this.state.players.get(attackerId);
      if (!attacker || !attacker.alive) return this.reject(client, "not_alive");
      if (this.climbs.has(attackerId)) return this.reject(client, "climbing");
      if (this.activeDashes.has(attackerId)) return this.reject(client, "dashing");
      if (this.flightTransitions.has(attackerId)) return this.reject(client, "flight_in_progress");
      if (!this.gates.get(attackerId)?.attack.consume(this.simulatedMs)) {
        return this.reject(client, "attack_rate_limited");
      }

      // Only the server-issued session ID of ANOTHER live player in the
      // same room is eligible for PK. No duel agreement is required.
      const targetId = monsterOrder ? monsterOrder.targetId : pkOrder!.targetId;
      if (targetId === attackerId) return this.reject(client, "self_attack");
      if (!this.sameCombatMap(attackerId, targetId)) return this.reject(client, "target_unavailable");
      const target = monsterOrder
        ? this.getMonster(targetId)
        : this.state.players.get(targetId);

      if (!target || !target.alive) {
        return this.reject(client, monsterOrder ? "monster_down" : "target_unavailable");
      }

      // Tap to attack: cancel manual travel, then follow the target each tick.
      this.destinations.delete(attackerId);
      this.attackTargets.set(attackerId, targetId);
      this.lastCombatMs.set(attackerId, this.simulatedMs);
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

    summon: (client: Client, message: unknown) => this.summonSpirit(client, message, "guardian"),
    pot_summon: (client: Client, message: unknown) => this.summonSpirit(client, message, "pot_spirit"),

    possess: (client:Client,message:unknown) => {
      const id=client.sessionId;
      if(!parseEmptyCommand(message))return this.reject(client,"invalid_possession");
      if(this.pendingWarps.has(id))return this.reject(client,"character_busy");
      const player=this.state.players.get(id);
      if(!player || !player.alive)return this.reject(client,"not_alive");
      if(!this.gates.get(id)?.possession.consume(this.simulatedMs))return this.reject(client,"possession_rate_limited");
      if(player.possessionActive){this.endPossession(id,"cancelled");return;}
      if(POSSESSION_BUFF.requiresSummon && !this.state.summons.has(id))return this.reject(client,"possession_needs_summon");
      if(possessionCoolingDown(this.persistentCharacters.get(id)))return this.reject(client,"possession_cooldown");
      const result=this.buffs.activate(id,this.simulatedMs);
      if(result!=="ok")return this.reject(client,result==="cooldown" ? "possession_cooldown" : "possession_active");
      this.effects.grant(id,POSSESSION_MODIFIER,this.simulatedMs+POSSESSION_BUFF.durationMs);
      this.despawnSummon(id,"possessed");
      player.possessionActive=true;this.applyStats(id,player,this.statAllocations.get(id) ?? emptyAllocations());
      this.broadcast("possession_changed",{playerId:id,active:true,durationMs:POSSESSION_BUFF.durationMs},{afterNextPatch:true});
    },

    unsummon: (client: Client, message: unknown) => {
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
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
      if(this.muayControlled(client.sessionId))return this.reject(client,"muay_controlled");
      if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
      const villageOrder=parseClimbRequest(message);
      const id = client.sessionId;
      const player = this.state.players.get(id);
      if (!player || !player.alive) return this.reject(client, "not_alive");
      const rampart=getWorldMap(player.mapId)?.strategic?.rampart;
      const msg=message as Record<string,unknown>|null;
      const stair=msg && typeof msg==="object" && Object.keys(msg).length===2 && (msg.direction==="up" || msg.direction==="down")
        ? rampart?.stairs.find(s=>s.id===msg.structureId):undefined;
      if(player.mapId!==DEFAULT_MAP_ID && !stair)return this.reject(client,"no_ladder_in_map");
      if(!stair && !villageOrder)return this.reject(client,"invalid_climb");
      const direction=stair?msg!.direction:villageOrder!.direction;
      if (this.climbs.has(id)) return this.reject(client, "already_climbing");
      if (this.activeDashes.has(id)) return this.reject(client, "dashing");
      if (player.flying || this.flightTransitions.has(id)) return this.reject(client, "flying");
      if (!this.gates.get(id)?.climb.consume(this.simulatedMs)) {
        return this.reject(client, "climb_rate_limited");
      }

      const upward = direction === "up";
      if (upward && !isOnGround(player.y)) return this.reject(client, "not_on_ground");
      if (!upward && !isOnPlatform(player.y)) return this.reject(client, "not_on_wall");

      const foot=stair?.foot ?? {x:FORT.ladderFootX,z:FORT.ladderFootZ},top=stair?.top ?? {x:FORT.ladderTopX,z:FORT.ladderTopZ};
      const ladderPosition=upward?foot:top;
      const maxReach = upward ? FORT.climbTriggerRadius : FORT.descendTriggerRadius;
      if (planarDistance(player, ladderPosition) > maxReach) {
        return this.reject(client, "ladder_too_far");
      }

      this.attackTargets.delete(id);
      this.destinations.delete(id);
      player.targetId = "";
      player.combatState = "climbing";
      this.climbs.set(id, upward
        ? {...top,y:FORT.height}
        : {...foot,y:0});
      this.broadcast("climb_started", { playerId:id, direction },
        { afterNextPatch:true });
    },

    shoot: (client: Client, message: unknown) => this.castBlessedRice(client, message),
    blessed_rice: (client: Client, message: unknown) => this.castBlessedRice(client, message),
    apply_talisman: (client: Client, message: unknown) => this.applyTalisman(client, message),
  };

  private spellCaster(client: Client) {
    const id = client.sessionId;
    if(this.muayControlled(id))return this.reject(client,"muay_controlled");
    const player = this.state.players.get(id);
    if (this.pendingWarps.has(id)) return this.reject(client, "character_busy");
    if (!player?.alive) return this.reject(client, "not_alive");
    if (this.climbs.has(id)) return this.reject(client, "climbing");
    if (this.activeDashes.has(id)) return this.reject(client, "dashing");
    if (this.flightTransitions.has(id)) return this.reject(client, "flight_in_progress");
    if (!this.gates.get(id)?.attack.consume(this.simulatedMs)) return this.reject(client, "attack_rate_limited");
    return player;
  }

  private hitMonsterWithSpell(id: string, target: Monster, damage: number, source: "ranged" | "talisman" | "sword" | "muay") {
    target.hp = Math.max(0, target.hp - damage);
    target.hitSeq++;
    this.broadcast("combat_hit", {attackerId:id, targetId:target.id, damage, hp:target.hp,
      maxHp:target.maxHp, hitSeq:target.hitSeq, source}, {afterNextPatch:true});
    if (target.hp === 0) this.killMonster(id, target.id);
  }

  private applyTalisman(client: Client, message: unknown) {
    const order = parseAttackCommand(message);
    if (!order) return this.reject(client, "invalid_talisman_target");
    const id = client.sessionId, caster = this.spellCaster(client);
    if (!caster) return;
    const target = this.getMonster(order.targetId);
    if (!target?.alive || !this.sameCombatMap(id, target.id)) return this.reject(client, "target_unavailable");
    if (distance3d(caster, target) > TALISMAN.range) return this.reject(client, "talisman_out_of_range");
    if (!this.bodyPathClear(caster.mapId, caster, target)) return this.reject(client, "talisman_blocked");
    const now = Date.now();
    if (now < caster.talismanReadyAt) return this.reject(client, "talisman_cooldown");

    caster.talismanReadyAt = now + TALISMAN.cooldownMs;
    caster.facing = facingTo(target.x - caster.x, target.z - caster.z);
    this.recordCombat(id, target.id);
    const magic = caster.magicAtk + weaponBonuses(this.inventories.get(id), "pve").ranged;
    const damage = calculateDamage(magic * TALISMAN.magicMultiplier, target.defense, target.level);
    this.hitMonsterWithSpell(id, target, damage, "talisman");
  }

  private castBlessedRice(client: Client, message: unknown) {
    const monsterOrder = parseAttackCommand(message);
    const pkOrder = monsterOrder ? null : parsePkTargetCommand(message);
    if (!monsterOrder && !pkOrder) return this.reject(client, "invalid_shoot");
    const id = client.sessionId, shooter = this.spellCaster(client);
    if (!shooter) return;
    const targetId = monsterOrder ? monsterOrder.targetId : pkOrder!.targetId;
    if (targetId === id) return this.reject(client, "self_attack");
    if (!this.sameCombatMap(id, targetId)) return this.reject(client, "target_unavailable");
    const target = monsterOrder
      ? this.getMonster(targetId)
      : this.state.players.get(targetId);
    if (!target || !target.alive) return this.reject(client, "target_unavailable");

    const from = { x:shooter.x, y:shooter.y+FORT.shootOriginHeight, z:shooter.z };
    const to = { x:target.x, y:target.y + FORT.targetBodyHeight, z:target.z };
    const map=getWorldMap(shooter.mapId),downhill=map?.strategic?.rampart && isOnPlatform(shooter.y) && isOnGround(target.y);
    if (distance3d(from,to) > FORT.rangedRange+(downhill?3:0)) {
      return this.reject(client, "shot_out_of_range");
    }
    if (!map || (shooter.mapId === DEFAULT_MAP_ID && wallBlocksShot(from,to)) || !provinceShotClear(map,from,to,this.gateClosed)) {
      return this.reject(client, "shot_blocked");
    }

    const last = this.lastAttackMs.get(id) ?? -Infinity;
    if (this.simulatedMs-last < FORT.rangedCooldownMs) {
      return this.reject(client, "shot_cooldown");
    }
    this.lastAttackMs.set(id,this.simulatedMs);
    this.recordCombat(id, targetId);
    shooter.facing = facingTo(target.x-shooter.x, target.z-shooter.z);
    const rangedAttack = shooter.magicAtk + weaponBonuses(this.inventories.get(id), monsterOrder ? "pve" : "pvp").ranged;
    let rangedDamage = monsterOrder ? calculateDamage(rangedAttack, (target as Monster).defense, (target as Monster).level) :
      calculateDamage(rangedAttack, (target as Player).magicDef, (target as Player).level);

    if (monsterOrder) {
      this.hitMonsterWithSpell(id, target as Monster, rangedDamage, "ranged");
    } else {
      const victim=target as Player;
      rangedDamage=this.swordGuardDamage(targetId,shooter,rangedDamage);
      victim.hp=Math.max(0,victim.hp-rangedDamage);
      victim.hitSeq+=1;
      this.broadcast("pvp_hit", {
        attackerId:id,targetId,damage:rangedDamage,
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
      attackerId:id,targetId,damage:rangedDamage,from,to,skill:"blessed_rice",
    }, { afterNextPatch:true });
  }

  private summonSpirit(client: Client, message: unknown, kind: "guardian" | "pot_spirit") {
    if (this.pendingWarps.has(client.sessionId)) return this.reject(client, "character_busy");
    const id = client.sessionId;
    if (!parseEmptyCommand(message)) return this.reject(client, "invalid_summon");
    const owner = this.state.players.get(id);
    if (!owner || !owner.alive) return this.reject(client, "not_alive");
    if (owner.possessionActive) return this.reject(client, "possession_active");
    if (this.state.summons.has(id)) return this.reject(client, "summon_limit");
    if (!this.gates.get(id)?.summon.consume(this.simulatedMs)) {
      return this.reject(client, "summon_rate_limited");
    }
    const last = this.lastSummonAt.get(id) ?? -Infinity;
    if (this.simulatedMs - last < RULES.summonCooldownMs) {
      return this.reject(client, "summon_cooldown");
    }
    this.lastSummonAt.set(id, this.simulatedMs);

    const map = getWorldMap(owner.mapId)!;
    const besideOwner = {x:clampToMap(owner.x - 1.1, map.bounds, "x"), y:owner.y, z:clampToMap(owner.z + 0.9, map.bounds, "z")};
    const blocked = kind === "pot_spirit" && (!isSafeWorldPoint(map, besideOwner) || !this.bodyPathClear(map.id, owner, besideOwner));
    const spawn = blocked ? owner : besideOwner;
    const guardian = new SummonedGuardian({
      ownerId: id, kind, x:spawn.x, y:spawn.y, z:spawn.z,
      facing: owner.facing, action: "follow", targetId: "",
    });
    this.state.summons.set(id, guardian);
    this.lastSummonAttackAt.delete(id);
    this.broadcast("summon_spawn", { ownerId: id, kind },
      { afterNextPatch: true });
  }

  private despawnSummon(ownerId: string, reason: string) {
    if (!this.state.summons.has(ownerId)) return;
    this.state.summons.delete(ownerId);
    this.lastSummonAttackAt.delete(ownerId);
    this.broadcast("summon_despawn", { ownerId, reason },
      { afterNextPatch: true });
  }

  private findSummonTarget(ownerId: string, owner: Player, guardian: SummonedGuardian) {
    const intended = this.attackTargets.get(ownerId);
    const candidates: string[] = [];
    if (intended) candidates.push(intended);

    // A guardian defends its owner when another player is actively attacking.
    // It does not randomly attack neutral people in this Free PK world.
    for (const [otherId, targetId] of this.attackTargets) {
      if (otherId !== ownerId && targetId === ownerId) candidates.push(otherId);
    }
    if (this.state.monster.targetId === ownerId) candidates.push(RULES.monsterId);
    for (const m of this.state.monsters.values()) if (m.targetId === ownerId) candidates.push(m.id);

    const fromPot = guardian.kind === "pot_spirit";
    const reachable = (target: WorldPoint) => this.bodyPathClear(owner.mapId, owner, target) && this.bodyPathClear(owner.mapId, guardian, target);
    for (const targetId of candidates) {
      if (targetId === ownerId) continue;
      if (!this.sameCombatMap(ownerId, targetId)) continue;
      const target = this.getMonster(targetId) ?? this.state.players.get(targetId);
      if (!target || !target.alive) continue;
      // Guard's combat tether prevents hits across the map even if another
      // client sends a valid but distant target ID.
      if (distance3d(owner, target) > RULES.summonEngageDistance) continue;
      if(getWorldMap(owner.mapId)?.walls?.length && !isWorldSegmentClear(owner.mapId,owner,target))continue;
      if (fromPot && !reachable(target)) continue;
      return { targetId, target };
    }
    if (!fromPot || isRestArea(owner.mapId, owner)) return null;

    // With no combat order the pot spirit hunts the nearest reachable monster.
    let nearest: Monster | undefined;
    let bestDistance: number = RULES.summonEngageDistance;
    const consider = (monster: Monster) => {
      if (!monster.alive || !this.sameCombatMap(ownerId, monster.id)) return;
      const distance = distance3d(owner, monster);
      if (distance > bestDistance || !reachable(monster)) return;
      nearest = monster;
      bestDistance = distance;
    };
    consider(this.state.monster);
    this.state.monsters.forEach(consider);
    return nearest ? { targetId: nearest.id, target: nearest } : null;
  }

  private bodyPathClear(mapId: string, from: WorldPoint, target: WorldPoint) {
    return mapId === DEFAULT_MAP_ID
      ? !wallBlocksShot({ x: from.x, y: from.y + FORT.targetBodyHeight, z: from.z },
          { x: target.x, y: target.y + FORT.targetBodyHeight, z: target.z })
      : provinceShotClear(WORLD_MAPS[mapId],{x:from.x,y:from.y+1,z:from.z},{x:target.x,y:target.y+1,z:target.z},this.gateClosed);
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
        ? this.findSummonTarget(ownerId, owner, guardian) : null;

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
          guardian.x = clampToMap(next.point.x, getWorldMap(owner.mapId)!.bounds, "x");
          guardian.y = next.point.y;
          guardian.z = clampToMap(next.point.z, getWorldMap(owner.mapId)!.bounds, "z");
        }
        continue;
      }

      // Follow the owner on the left side, rather than standing at spawn.
      // All positions and animation states are resolved by fixed server ticks.
      guardian.targetId = "";
      const desired = {
        x: clampToMap(owner.x - 1.0, getWorldMap(owner.mapId)!.bounds, "x"),
        y: owner.y,
        z: clampToMap(owner.z + 0.85, getWorldMap(owner.mapId)!.bounds, "z"),
      };
      const dx = desired.x - guardian.x;
      const dz = desired.z - guardian.z;
      const distance = distance3d(guardian,desired);
      guardian.action = "follow";
      // The horizontal comfort radius must not leave a spirit floating >1m
      // above a guardian who just descended from the watchwall.
      if (distance > RULES.summonFollowDistance || Math.abs(guardian.y - owner.y) > 0.18) {
        const next = step3d(
          guardian, desired, RULES.summonMoveSpeed * dt
        );
        guardian.x = clampToMap(next.point.x, getWorldMap(owner.mapId)!.bounds, "x");
        guardian.y = next.point.y;
        guardian.z = clampToMap(next.point.z, getWorldMap(owner.mapId)!.bounds, "z");
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

    const monster = this.getMonster(targetId);
    if (!this.sameCombatMap(ownerId, targetId)) return;
    const target = monster ?? this.state.players.get(targetId);
    if (!target || !target.alive || targetId === ownerId) return;
    if (distance3d(owner, target) > RULES.summonEngageDistance) return;
    if (distance3d(guardian, target) > RULES.summonAttackRange + 0.00001 || !isWorldSegmentClear(owner.mapId,guardian,target)) return;

    const last = this.lastSummonAttackAt.get(ownerId) ?? -Infinity;
    if (this.simulatedMs - last < RULES.summonAttackCooldownMs) return;
    this.lastSummonAttackAt.set(ownerId, this.simulatedMs);
    this.recordCombat(ownerId, targetId);
    guardian.hitSeq += 1;

    if (monster) {
      const damage = calculateDamage(RULES.summonAttackDamage, monster.defense, monster.level);
      monster.hp = Math.max(0, monster.hp - damage);
      monster.hitSeq += 1;
      this.broadcast("summon_hit", {
        ownerId, summonId: ownerId, targetId,
        damage, hp: monster.hp,
        hitSeq: guardian.hitSeq,
      }, { afterNextPatch: true });
      if (monster.hp === 0) this.killMonster(ownerId, targetId);
      return;
    }

    // Summon can help in Free PK only when its owner selected or was attacked
    // by this opponent. Damage/kill attribution belongs to the owner.
    const victim = target as Player;
    const damage = this.swordGuardDamage(targetId,guardian,calculateDamage(RULES.summonAttackDamage, victim.magicDef, victim.level));
    victim.hp = Math.max(0, victim.hp - damage);
    victim.hitSeq += 1;
    this.broadcast("pvp_hit", {
      attackerId: ownerId, source: "summon", summonOwnerId: ownerId,
      targetId, damage,
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

  async onCreate(options?:{warRoomKey?:string;field?:Battlefield}) {
    if(options?.warRoomKey===warRoomKey && options.field){
      this.field=options.field;
      await this.setPrivate(true);
    }
    this.state.territoryWarAvailable=WORLD_EXPANSION;
    if (characterStore.economyEnabled) this.state.craftRecipe = JSON.stringify(SHRINE_RECIPE);
    this.state.forgeCatalog = JSON.stringify(FORGE);
    this.state.buildCatalog = BUILD_CATALOG;
    this.state.economyAvailable = characterStore.economyEnabled;
    this.forest.initialize();
    this.state.worldDefinition = WORLD_EXPANSION ? JSON.stringify({version:1,maps:WORLD_MAPS}) : "";
    this.state.swordTreeCatalog = JSON.stringify({schools:SWORD_SCHOOLS,nodes:SWORD_NODES});
    this.state.muayBookCatalog = JSON.stringify({skills:MUAY_SKILLS,lessons:MUAY_LESSONS,base:MUAY_BASE_SKILLS,schools:MUAY_SCHOOLS,combos:MUAY_COMBOS,followups:MUAY_FOLLOWUPS,masteryGuides:MUAY_MASTERY_GUIDES,masteryLabels:MUAY_MASTERY_LABELS,masteryRequirements:MUAY_MASTERY_REQUIREMENTS,pvpDamage:MUAY_PVP_DAMAGE_MULTIPLIER,pvpCombo:MUAY_PVP_COMBO_MULTIPLIER});
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
    this.updateTerritory();
    this.updateMuayGrapples();
    this.updateMuayDefense();
    for(const id of this.buffs.expired(this.simulatedMs))this.endPossession(id,"expired");
    for(const id of this.effects.expire(this.simulatedMs)) {const p=this.state.players.get(id);if(p)this.applyStats(id,p,this.statAllocations.get(id) ?? emptyAllocations());}
    this.updateRespawns();
    this.updateClimbs(dt);
    this.updateFlights(dt);
    this.updatePlayerMovement(dt);
    this.updateMonsterAI(dt);
    this.forest.update(this.simulatedMs, dt, this.state.players, this.pendingWarps, (id,m,force=1) => {
      const p=this.state.players.get(id);
      if (!p || !this.sameCombatMap(id,m.id)) return;
      const profile=this.forest.profile(m.id); if(!profile)return;
      const damage=this.swordGuardDamage(id,m,calculateDamage(profile.attack*force,p.def,p.level));
      p.hp=Math.max(0,p.hp-damage);p.hitSeq++;this.lastCombatMs.set(id,this.simulatedMs);
      this.broadcast("monster_hit",{targetId:id,attackerId:m.id,damage,hp:p.hp,maxHp:p.maxHp,hitSeq:p.hitSeq},{afterNextPatch:true});
      if(p.hp===0)this.knockoutPlayer(id,"monster",m.id);
    }, id => this.broadcast("monster_respawn",{targetId:id}));
    this.updatePlayerAttacks();
    this.updateSummons(dt);
    this.updateResources(dt);
    if (this.simulatedMs >= this.nextCharacterSaveMs) {
      this.nextCharacterSaveMs = this.simulatedMs + CHARACTER_SAVE_INTERVAL_MS;
      for (const id of this.persistentCharacters.keys()) void this.saveCharacter(id);
    }
  }

  private updateResources(dt: number): void {
    for (const [id, player] of this.state.players) {
      if (!player.alive || this.pendingWarps.has(id)) continue;
      const fighting = this.attackTargets.has(id) || this.state.monster.targetId === id || this.forest.engaged(id) ||
        this.simulatedMs - (this.lastCombatMs.get(id) ?? -Infinity) < PROGRESSION.combatQuietMs;
      // HP saves are integer-valued in legacy snapshots. Keep fractional regen
      // in a transient accumulator instead of rounding up on each save/rejoin.
      const pending = (this.hpRegenRemainder.get(id) ?? 0) + (fighting ? PROGRESSION.hpRegenIn : PROGRESSION.hpRegenOut) * dt;
      const healed = Math.floor(pending + 1e-9);
      player.hp = Math.min(player.maxHp, player.hp + healed);
      this.hpRegenRemainder.set(id, player.hp >= player.maxHp ? 0 : pending - healed);
      player.stamina = Math.min(player.maxStamina, player.stamina + (fighting ? PROGRESSION.staminaRegenIn : PROGRESSION.staminaRegenOut) * dt);
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
      player.x = clampToMap(next.point.x, getWorldMap(player.mapId)!.bounds, "x");
      player.y = next.point.y;
      player.z = clampToMap(next.point.z, getWorldMap(player.mapId)!.bounds, "z");
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

  /** Flight transitions are vertical only; horizontal movement begins on arrival. */
  private updateFlights(dt: number) {
    for (const [id, transition] of [...this.flightTransitions]) {
      const player = this.state.players.get(id);
      if (!player || !player.alive) {
        this.flightTransitions.delete(id);
        continue;
      }
      const next = progressFlightHeight(player.y, transition.targetY, dt);
      player.y = next.y;
      player.combatState = transition.landing ? "descending" : "ascending";
      if (!next.arrived) continue;
      this.flightTransitions.delete(id);
      player.flying = !transition.landing;
      player.combatState = "idle";
      this.broadcast("flight_finished", {
        playerId: id, altitude: player.y, flying: player.flying,
      }, { afterNextPatch: true });
      void this.saveCharacter(id);
    }
  }

  private canOccupy(x: number, z: number, feetY: number, flying = false, mapId = DEFAULT_MAP_ID): boolean {
    if (mapId !== DEFAULT_MAP_ID) {
      const map = getWorldMap(mapId);
      const r=map?.strategic?.rampart;
      if(r && isOnPlatform(feetY))return onRampart(r,x,z);
      if(r && this.gateClosed && segmentIntersectsExpandedWall({x,z},{x,z},r.gates[0].box,.4))return false;
      return Boolean(map && (isOnGround(feetY) || (flying && isFlightAltitude(feetY))) &&
        isSafeWorldPoint(map, { x, y: feetY, z }));
    }
    if (!Number.isFinite(x) || !Number.isFinite(z) ||
        Math.abs(x) > RULES.mapLimit || Math.abs(z) > RULES.mapLimit) return false;
    if (flying && isFlightAltitude(feetY)) return true; // 6m flight lane
    if (isOnPlatform(feetY)) return isOnTop(x,z); // solid wall crest (4m)
    if (isOnGround(feetY)) return !touchesWallBody(x,z); // ground 0m
    return false; // Never trust arbitrary Y from a client/save.
  }

  private updatePlayerMovement(dt: number) {
    for (const [sessionId, player] of this.state.players) {
      if (!player.alive || this.pendingWarps.has(sessionId) || this.climbs.has(sessionId) || this.flightTransitions.has(sessionId)) {
        this.activeDashes.delete(sessionId);
        continue;
      }

      const dash = this.activeDashes.get(sessionId);
      if (dash) {
        const move = advanceDash(
          player, dash,
          Math.min(dash.remaining, RULES.dashSpeed * dt),
          (x, z) => this.canOccupy(x, z, player.y, player.flying, player.mapId),
          getWorldMap(player.mapId)!.bounds,
        );
        player.x = move.x;
        player.z = move.z;
        player.facing = facingTo(dash.dx, dash.dz);
        dash.remaining = Math.max(0, dash.remaining - move.moved);
        if (move.blocked || dash.remaining < 0.0001) {
          this.activeDashes.delete(sessionId);
          player.combatState = "idle";
          this.broadcast("dash_finished", {
            playerId: sessionId, blocked: move.blocked,
          }, { afterNextPatch: true });
        } else {
          player.combatState = "dashing";
        }
        continue;
      }

      const targetId = this.attackTargets.get(sessionId);
      if (targetId) {
        const monster = this.getMonster(targetId);
        const isMonster = Boolean(monster);
        const target = isMonster
          ? (monster?.alive ? monster : undefined)
          : this.state.players.get(targetId);

        if (!target || !target.alive || targetId === sessionId || !this.sameCombatMap(sessionId, targetId)) {
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
          x: clampToMap(player.x + dx * ratio, getWorldMap(player.mapId)!.bounds, "x"),
          z: clampToMap(player.z + dz * ratio, getWorldMap(player.mapId)!.bounds, "z"),
        };
        const next = stepTowards(player, approach,
          (player.flying ? FLIGHT.horizontalSpeed : RULES.playerSpeed) * dt);
        if (this.canOccupy(next.x,next.z,player.y,player.flying,player.mapId)) {
          player.x=next.x; player.z=next.z;
          player.combatState = "approaching";
        } else {
          this.endAttack(sessionId,player);
        }
        continue;
      }

      const destination=this.destinations.get(sessionId);
      const turns=destination && isOnPlatform(player.y)?this.crestTurns.get(sessionId):undefined;
      const target=turns?.[0] ?? destination;
      if (!target) {
        player.combatState = "idle";
        player.targetId = "";
        continue;
      }
      const dx = target.x - player.x;
      const dz = target.z - player.z;
      const next = stepTowards(player, target,
        (player.flying ? FLIGHT.horizontalSpeed : RULES.playerSpeed) * dt);
      if (next.moved) player.facing = facingTo(dx, dz);
      if (this.canOccupy(next.x,next.z,player.y,player.flying,player.mapId)) {
        player.x=next.x;
        player.z=next.z;
      } else {
        // Slide on the wall face if a legal axis exists; never tunnel through
        // solid geometry via client destinations or elevated edge tapping.
        if (this.canOccupy(next.x,player.z,player.y,player.flying,player.mapId)) player.x=next.x;
        else if (this.canOccupy(player.x,next.z,player.y,player.flying,player.mapId)) player.z=next.z;
        else {
          this.destinations.delete(sessionId);
          player.combatState = "idle";
          continue;
        }
      }
      const arrived = Math.hypot(target.x-player.x,target.z-player.z) < .035;
      player.combatState = arrived ? "idle" : "moving";
      if(arrived){if(turns?.length)turns.shift();else this.destinations.delete(sessionId);}
    }
  }

  private updatePlayerAttacks() {
    for (const [attackerId, targetId] of [...this.attackTargets]) {
      const attacker = this.state.players.get(attackerId);
      if (!attacker || !attacker.alive) {
        this.attackTargets.delete(attackerId);
        continue;
      }

      const monster = this.getMonster(targetId);
      const isMonster = Boolean(monster);
      const target = isMonster
        ? (monster?.alive ? monster : undefined)
        : this.state.players.get(targetId);
      if (!target || !target.alive || targetId === attackerId || !this.sameCombatMap(attackerId, targetId)) {
        this.endAttack(attackerId, attacker);
        continue;
      }

      const range = isMonster ? RULES.playerAttackRange : RULES.pkAttackRange;
      if (!isWorldSegmentClear(attacker.mapId,attacker,target) || distance3d(attacker,target) > range + 0.00001 ||
          (attacker.mapId === DEFAULT_MAP_ID && wallBlocksShot(
            {x:attacker.x,y:attacker.y+1.1,z:attacker.z},
            {x:target.x,y:target.y+1.0,z:target.z}
          ))) continue;
      attacker.facing = facingTo(target.x - attacker.x, target.z - attacker.z);
      attacker.combatState = "attacking";

      // Same cooldown clock for PvP and PvE. Switching targets cannot
      // bypass cooldown or borrow a timestamp supplied by the browser.
      const dualSword = attacker.pathId === "phutthaisawan" && equippedWeaponId(this.inventories.get(attackerId)) === DUAL_SWORD.weaponId;
      const cooldown = dualSword ? DUAL_SWORD.attackIntervalMs : (isMonster ? RULES.playerAttackCooldownMs : RULES.pkCooldownMs);
      const last = this.lastAttackMs.get(attackerId) ?? -Infinity;
      if (this.simulatedMs - last < cooldown) continue;
      this.lastAttackMs.set(attackerId, this.simulatedMs);
      this.recordCombat(attackerId, targetId);
      if (dualSword) {
        const previous=this.swordCombos.get(attackerId);
        const previousCount=previous && previous.until>=this.simulatedMs ? previous.count : 0;
        const count=Math.min(3,previousCount+1);
        this.swordCombos.set(attackerId,{count,until:this.simulatedMs+3500});
        this.recordSwordTraining(attackerId,"strikes");
        if (previousCount===2) this.recordSwordTraining(attackerId,"finishes");
        this.sendSwordNotice(this.clients.find(client=>client.sessionId===attackerId),"sword_combo",{count});
      }
      if (attacker.pathId === "muay_boran" && equippedWeaponId(this.inventories.get(attackerId)) === MUAY_WRAP_ID) this.recordMuayTraining(attackerId,"strikes");

      const meleeBonus = weaponBonuses(this.inventories.get(attackerId), monster ? "pve" : "pvp").melee;
      const swordMastery = dualSword && this.swordTrees.get(attackerId)?.learned.includes("rhythm") ? 1.05 : 1;
      if (monster) {
        const meleeDamage = calculateDamage((attacker.atk + meleeBonus) * (dualSword ? DUAL_SWORD.damageMultiplier : 1) * swordMastery, monster.defense, monster.level);
        monster.hp = Math.max(0, monster.hp - meleeDamage);
        monster.hitSeq += 1;
        this.broadcast("combat_hit", {
          targetId,
          attackerId, damage: meleeDamage,
          hp: monster.hp, maxHp: monster.maxHp, hitSeq: monster.hitSeq,
        }, { afterNextPatch: true });
        if (monster.hp === 0) this.killMonster(attackerId, targetId);
        continue;
      }

      // FREE PK: health, range, damage, respawn and kill credit are wholly
      // server-owned. The client only submits another session's targetId.
      const victim = target as Player;
      const meleeDamage = this.swordGuardDamage(targetId,attacker,calculateDamage((attacker.atk + meleeBonus) * (dualSword ? DUAL_SWORD.damageMultiplier : 1) * swordMastery, victim.def, victim.level));
      victim.hp = Math.max(0, victim.hp - meleeDamage);
      victim.hitSeq += 1;
      this.broadcast("pvp_hit", {
        attackerId, targetId, damage: meleeDamage,
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
    this.releaseMuayFor(id,"knockout");
    this.clearGrappleCountersFor(id,"knockout");
    this.swordCombos.delete(id);
    this.swordGuards.delete(id);
    this.clearMuayDefense(id,"cancelled");
    this.clearMuayCombo(id);
    this.clearMuayCombosForTarget(id);
    const victim = this.state.players.get(id);
    if (!victim || !victim.alive) return;
    this.endPossession(id,"owner_dead");
    this.effects.forget(id);
    this.applyStats(id, victim, this.statAllocations.get(id) ?? emptyAllocations());
    victim.hp = 0;
    this.hpRegenRemainder.delete(id);
    victim.alive = false;
    victim.combatState = "dead";
    victim.targetId = "";
    this.climbs.delete(id);
    this.flightTransitions.delete(id);
    victim.flying = false;
    this.activeDashes.delete(id);
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
    this.forest.clearTarget(id);
    this.broadcast("player_down", {
      playerId: id, source: cause, attackerId,
    }, { afterNextPatch: true });
  }

  private killMonster(winnerId: string, targetId: string = RULES.monsterId) {
    this.releaseMuayFor(targetId,"knockout");
    if (targetId !== RULES.monsterId) {
      const m=this.state.monsters.get(targetId);
      const profile=this.forest.profile(targetId);
      if(!m || !profile || !this.forest.kill(targetId,this.simulatedMs,this.state.players,this.pendingWarps))return;
      this.clearMuayCombosForTarget(targetId);
      this.awardMonsterExperience(winnerId,m,profile.tier);
      for(const [id,target] of this.attackTargets) if(target===targetId){const p=this.state.players.get(id);if(p)this.endAttack(id,p);}
      return;
    }
    const monster = this.state.monster;
    this.clearMuayCombosForTarget(targetId);
    this.monsterInterruptUntil=0;this.monsterInterruptResistUntil=0;
    monster.alive = false;
    monster.hp = 0;
    this.monsterNavigator.clear();
    monster.aiState = "dead";
    monster.targetId = "";
    this.monsterRespawnAt = this.simulatedMs + RULES.monsterRespawnMs;
    this.monsterReturning = false;
    this.awardMonsterExperience(winnerId);

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
    if(this.simulatedMs<this.monsterInterruptUntil){monster.aiState="stagger";return;}

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
    if (!target || !target.alive || this.pendingWarps.has(targetId) || target.mapId !== DEFAULT_MAP_ID || isRestArea(target.mapId,target) || !isOnGround(target.y) ||
        planarDistance(monster, target) > RULES.monsterGiveUpRadius) {
      target = undefined;
      targetId = "";
    }

    // No shared targeting oracle: this NPC sees only characters within aggro.
    if (!target) {
      let nearest: number = RULES.monsterAggroRadius;
      for (const [id, player] of this.state.players) {
        if (!player.alive || this.pendingWarps.has(id) || player.mapId !== DEFAULT_MAP_ID || isRestArea(player.mapId,player) || !isOnGround(player.y)) continue;
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
    if (!next.moved || isRestArea(DEFAULT_MAP_ID,next) || !isMonsterSegmentClear(monster, next)) return;

    monster.facing = facingTo(dx,dz);
    monster.x = clampToMap(next.x);
    monster.z = clampToMap(next.z);
  }

  private monsterAttack(targetId: string, target: Player) {
    if (isRestArea(DEFAULT_MAP_ID,this.state.monster)) return;
    if (!target.alive || this.pendingWarps.has(targetId) || target.mapId !== DEFAULT_MAP_ID || isRestArea(target.mapId,target)) return;
    if (distance3d(this.state.monster, target) > RULES.monsterAttackRange) return;
    if (this.simulatedMs - this.lastMonsterAttackMs < RULES.monsterAttackCooldownMs) return;
    this.lastMonsterAttackMs = this.simulatedMs;
    this.lastCombatMs.set(targetId, this.simulatedMs);

    const damage = this.swordGuardDamage(targetId,this.state.monster,calculateDamage(RULES.monsterAttackDamage, target.def, target.level));
    target.hp = Math.max(0, target.hp - damage);
    target.hitSeq += 1;
    this.broadcast("monster_hit", {
      targetId,
      attackerId: RULES.monsterId,
      damage,
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
      this.flightTransitions.delete(id);
      player.flying = false;
      this.activeDashes.delete(id);
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

  private captureCharacterSnapshot(
    id: string, inventoryOverride?: InventorySnapshot, hpOverride?: number,
  ): CharacterSnapshot | null {
    const characterId = this.persistentCharacters.get(id);
    const player = this.state.players.get(id);
    const inventory = inventoryOverride ?? this.inventories.get(id);
    if (!characterId || !player || !inventory) return null;
    return {
      version: 1, id: characterId, name: player.characterName,
      level: player.level, experience: player.experience,
      pkKills: player.pkKills, pkDeaths: player.pkDeaths,
      mapId: player.mapId,
      statAllocations: this.statAllocations.get(id) ?? emptyAllocations(),
      build: this.playerBuild(player) ?? undefined,
      classSkillReadyAt: player.classSkillReadyAt,
      talismanReadyAt: player.talismanReadyAt,
      swordTree: this.swordTrees.get(id),
      muayCooldowns: this.muayCooldowns.get(id),
      muayBook: this.muayBooks.get(id),
      muayWrapGranted: this.muayWrapGranted.has(id),
      stamina: player.stamina,
      x: player.x,
      // Keep stable flight altitude when a transition is mid-flight.
      y: player.flying ? FLIGHT.altitude : player.y,
      z: player.z,
      hp: Math.max(0, Math.round(hpOverride ?? player.hp)),
      inventory, updatedAt: new Date().toISOString(),
    };
  }

  private async saveCharacter(id: string): Promise<void> {
    try {
      // Do not snapshot old potion counts while a disk-backed item use is
      // pending. OnLeave/onDispose also wait so no final write can re-grant it.
      const itemTask = this.pendingItemUses.get(id);
      if (itemTask) await itemTask.catch(() => {});
      const rewardTask = this.pendingRewards.get(id);
      if (rewardTask) await rewardTask.catch(() => {});
      const snapshot = this.captureCharacterSnapshot(id);
      if (snapshot) await characterStore.save(snapshot);
    } catch (error) {
      console.error("MONTRA S2+inventory save failed for", id, error);
      this.clients.find((client) => client.sessionId === id)
        ?.send("character_save_error", { reason: "disk_write_failed" });
    }
  }

  async onJoin(client: Client, options?: unknown) {
    if (WORLD_EXPANSION && (!options || typeof options !== "object" || Array.isArray(options) || (options as Record<string,unknown>).worldVersion !== 1)) throw new Error("world_client_update_required");
    // Old smoke tests and clients without browser storage remain transient.
    // A valid guest token is a secret bearer credential, never sent in Schema.
    const token = getGuestToken(options);
    const slot = parseCharacterSlot(options);
    if (!token && slot !== 1) throw new Error("guest_token_required");
    const accountId = token ? characterIdFromToken(token, 1) : null;
    const characterId = token ? characterIdFromToken(token, slot) : null;
    // A single Guest ID may own three saves but can play only ONE at a time.
    if (accountId && !claimCharacter(accountId, client.sessionId)) {
      throw new Error("character_already_online");
    }

    try {
      // Reserve before the asynchronous save lookup so simultaneous arrivals get different starts.
      const reserved = [...this.playerSpawn.values()];
      const spawn = VILLAGE_ARRIVALS.find(p => !reserved.some(other => other.x === p.x && other.z === p.z));
      if (!spawn) throw new Error("world_room_full");
      this.playerSpawn.set(client.sessionId, spawn);
      const saved = token ? (await characterStore.loadOrCreate(token, spawn, slot)).character : null;
      const allocations = saved?.statAllocations ?? emptyAllocations();
      const initialStats = calculateStats(saved?.level ?? 1, allocations);
      const mapId = saved?.mapId ?? DEFAULT_MAP_ID;
      const provinceReady=(options as {provinceVersion?:unknown}|undefined)?.provinceVersion===1;
      if(getWorldMap(mapId)?.strategic && !provinceReady)throw new Error("world_client_update_required");
      const atlasReady=(options as {atlasVersion?:unknown}|undefined)?.atlasVersion===1;
      if(isAtlasMap(mapId) && !atlasReady)throw new Error("world_client_update_required");
      const templeReady=(options as {templeVersion?:unknown}|undefined)?.templeVersion===1;
      if(mapId===TEMPLE_ID && !templeReady)throw new Error("world_client_update_required");
      const map = getWorldMap(mapId);
      if (!map) throw new Error("unknown_character_map");
      // A saved location is restored only if the current server geometry allows it.
      const restoreFlight = Boolean(saved && isFlightAltitude(saved.y));
      let validPosition = saved && this.canOccupy(
        saved.x, saved.z, saved.y, restoreFlight, mapId);
      let safeSpawn = mapId === DEFAULT_MAP_ID ? { ...spawn, y: 0 } : getSafeMapSpawn(mapId);
      if(this.field){
        const credential=characterId && admissions.get(characterId),war=guildStore().war,member=characterId && war.member(characterId);
        if(!credential || credential.roomId!==this.roomId || credential.expires<=Date.now() ||
           credential.ticket!==(options as Record<string,unknown>)?.warTicket || !member || mapId!==this.field.site)throw Error("war_admission");
        const side=war.side(this.field,member,Date.now());
        if(side!==credential.side || member.id!==credential.guild)throw Error("war_admission");
        if([...this.warSeats.values()].filter(s=>s.side===side).length>=WAR_SIDE_SIZE)throw Error("war_side_full");
        war.side(this.field,member,Date.now(),true);admissions.delete(characterId!);
        this.warSeats.set(client.sessionId,{guild:member.id,side});
        const gate=WORLD_MAPS[mapId].portals.find(p=>p.z===(side==="attack"?26:-58))!;
        safeSpawn={x:gate.x,y:0,z:gate.z};validPosition=false;
      }
      const player = new Player({
        ...(validPosition && saved ? {x:saved.x,y:saved.y,z:saved.z} : safeSpawn),
        facing: 0,
        hp: saved && saved.hp > 0 ? Math.min(saved.hp, initialStats.maxHp) : initialStats.maxHp,
        maxHp: initialStats.maxHp,
        alive: true, combatState: "idle", targetId: "",
        pkKills: saved?.pkKills ?? 0, pkDeaths: saved?.pkDeaths ?? 0,
        characterId: characterId ? characterId.slice(0, 12) : "",
        characterName: saved?.name ?? "นที",
        level: saved?.level ?? 1, experience: saved?.experience ?? 0,
        pathId: saved?.build?.path ?? "", ancestryId: saved?.build?.ancestry ?? "",
        classSkillReadyAt: saved?.classSkillReadyAt ?? 0,
        talismanReadyAt: saved?.talismanReadyAt ?? 0,
        swordTreeData: JSON.stringify(saved?.swordTree ?? newSwordTree()),
        muayData: JSON.stringify(saved?.muayCooldowns ?? {}),
        muayBookData: JSON.stringify(saved?.muayBook ?? newMuayBook()),
        bladeTalentId: saved?.build?.path === "blade" ? saved.build.bladeTalent ?? talentGroup("blade")!.defaultId : "",
        wardTalentId: saved?.build?.path === "sentinel" ? saved.build.wardTalent ?? DEFAULT_WARD_TALENT : "",
        persistent: Boolean(saved), characterSlot: slot,
        flying: Boolean(validPosition && restoreFlight),
        equippedWeaponId: equippedWeaponId(saved?.inventory) ?? "",
        mapId,
        stamina: Math.min(saved?.stamina ?? initialStats.maxStamina, initialStats.maxStamina),
      });

      this.swordTrees.set(client.sessionId, saved?.swordTree ?? newSwordTree());
      this.muayCooldowns.set(client.sessionId, saved?.muayCooldowns ?? {});
      this.muayBooks.set(client.sessionId, saved?.muayBook ?? newMuayBook());
      if (saved?.muayWrapGranted) this.muayWrapGranted.add(client.sessionId);
      this.statAllocations.set(client.sessionId, allocations);
      this.applyStats(client.sessionId,player, allocations);
      this.state.players.set(client.sessionId, player);
      if((options as Record<string,unknown>)?.warVersion===1)this.warClients.add(client.sessionId);
      if(provinceReady)this.provinceClients.add(client.sessionId);
      if(atlasReady)this.atlasClients.add(client.sessionId);
      if(templeReady)this.templeClients.add(client.sessionId);
      if (characterId && accountId && token) {
        if (!saved?.inventory) throw new Error("inventory_migration_missing");
        this.persistentCharacters.set(client.sessionId, characterId);
        this.guildSubscriptions.set(client.sessionId,subscribeGuild(characterId,()=>this.sendGuild(client,characterId)));
        this.inventories.set(client.sessionId, saved.inventory);
        this.activeGuestAccounts.set(client.sessionId, accountId);
        this.guestSlotIds.set(client.sessionId,
          CHARACTER_SLOTS.map(candidate => characterIdFromToken(token, candidate)));
      }
      this.playerSpawn.set(client.sessionId, safeSpawn);
      this.gates.set(client.sessionId, {
        move: new CommandBucket(RULES.moveBurst, RULES.moveRatePerSecond, this.simulatedMs),
        attack: new CommandBucket(RULES.attackBurst, RULES.attackRatePerSecond, this.simulatedMs),
        summon: new CommandBucket(
          RULES.summonCommandBurst, RULES.summonCommandRatePerSecond, this.simulatedMs
        ),
        climb: new CommandBucket(3, 1, this.simulatedMs),
        dash: new CommandBucket(RULES.dashCommandBurst,
          RULES.dashCommandRatePerSecond, this.simulatedMs),
        flight: new CommandBucket(3, 2, this.simulatedMs),
        chat: new CommandBucket(3, 0.5, this.simulatedMs),
        bugReport: new CommandBucket(1, 1 / 30, this.simulatedMs),
        build: new CommandBucket(3, 1, this.simulatedMs),
        swordTree: new CommandBucket(6, 2, this.simulatedMs),
        possession: new CommandBucket(2, 0.5, this.simulatedMs),
        economy: new CommandBucket(8, 3, this.simulatedMs),
        party: new CommandBucket(6, 2, this.simulatedMs),
        guild: new CommandBucket(6, 2, this.simulatedMs),
      });
      if(characterId){try{guildStore().rename(characterId,player.characterName);notifyGuilds();}catch(error){console.error("MONTRA guild join failed",error);}}
      console.log("MONTRA 3-slot join:", client.sessionId, "room", this.roomId,
        saved ? "persistent" : "transient", "slot", slot);
    } catch (error) {
      this.warSeats.delete(client.sessionId);this.warClients.delete(client.sessionId);
      this.playerSpawn.delete(client.sessionId);
      if (accountId) releaseCharacter(accountId, client.sessionId);
      throw error;
    }
  }

  async onLeave(client: Client, code: CloseCode) {
    const id = client.sessionId;
    this.clearGrappleCountersFor(id,"disconnect");
    this.clearMuayDefense(id,"cancelled");
    this.releaseMuayFor(id,"disconnect");this.muayGrappleImmunity.delete(id);
    this.clearMuayCombosForTarget(id);
    this.endPossession(id,"owner_left");
    this.buffs.forget(id);
    this.effects.forget(id);
    this.templeClients.delete(id);
    this.atlasClients.delete(id);
    this.crestTurns.delete(id);this.gateActions.delete(id);this.warSeats.delete(id);this.warClients.delete(id);this.warSent.delete(id);
    this.provinceClients.delete(id);
    this.leaveParty(id);
    const guildCharacter=this.persistentCharacters.get(id);
    if(guildCharacter){this.guildSubscriptions.get(id)?.();this.guildSubscriptions.delete(id);notifyGuilds();}
    for(const [inviteId,invite] of this.guildInvites)if(invite.from===id || invite.to===id){
      this.guildInvites.delete(inviteId);
      this.clients.find(c=>c.sessionId===invite.to)?.send("guild_invitation_closed",{});
    }
    for (const trade of this.trades.values()) if (trade.a===id || trade.b===id) { this.trades.delete(trade.id); this.notifyTrade(trade,"trade_cancelled"); }
    const accountId = this.activeGuestAccounts.get(id);
    // Capture the snapshot BEFORE removing the player from server Schema.
    const saving = this.saveCharacter(id);
    this.pendingCharacterLeaves.set(id, saving);
    this.despawnSummon(id, "owner_left");
    this.lastSummonAt.delete(id);
    this.climbs.delete(id);
    this.flightTransitions.delete(id);
    this.activeDashes.delete(id);
    this.lastDashMs.delete(id);
    this.destinations.delete(id);
    this.attackTargets.delete(id);
    this.lastAttackMs.delete(id);
    this.lastCombatMs.delete(id);
    this.lastWarpMs.delete(id);
    this.playerRespawnAt.delete(id);
    this.playerSpawn.delete(id);
    this.gates.delete(id);
    this.lastRejectNoticeMs.delete(id);
    // Keep the player and inventory readable until an in-flight potion write
    // and the final save have completed; otherwise the final snapshot is lost.
    this.lastRenameMs.delete(id);
    this.lastSlotListMs.delete(id);
    if (this.state.monster.targetId === id) this.state.monster.targetId = "";
    this.forest.clearTarget(id);
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
      this.state.players.delete(id);
      this.pendingItemUses.delete(id);
      this.pendingRewards.delete(id);
      this.statAllocations.delete(id);
      this.swordTrees.delete(id);
      this.muayCooldowns.delete(id);
      this.muayCombos.delete(id);
      this.muayFollowups.delete(id);
      this.muayBooks.delete(id);
      this.muayWrapGranted.delete(id);
      this.swordCombos.delete(id);
      this.swordGuards.delete(id);
      this.hpRegenRemainder.delete(id);
      this.inventories.delete(id);
      this.lastItemUseMs.delete(id);
      this.lastInventoryReadMs.delete(id);
      this.lastWeaponEquipMs.delete(id);
      this.playerSpawn.delete(id);
      this.pendingCharacterLeaves.delete(id);
      this.persistentCharacters.delete(id);
      this.guestSlotIds.delete(id);
      this.activeGuestAccounts.delete(id);
      if (accountId) releaseCharacter(accountId, id);
    }
    console.log("MONTRA S2 leave:", id, code);
  }

  async onDispose() {
    if(this.field)battleRooms.delete(this.field.seq);
    this.buffs.clear();
    this.effects.clear();
    this.trades.clear();
    this.parties.clear();
    this.guildInvites.clear();
    for(const unsubscribe of this.guildSubscriptions.values())unsubscribe();
    this.guildSubscriptions.clear();
    notifyGuilds();
    const pending = [...this.persistentCharacters.keys()].map(async id => {
      try { await (this.pendingCharacterLeaves.get(id) ?? this.saveCharacter(id)); }
      finally {
        const accountId = this.activeGuestAccounts.get(id);
        if (accountId) releaseCharacter(accountId, id);
      }
    });
    await Promise.allSettled(pending);
    this.persistentCharacters.clear();
    this.inventories.clear();
    this.pendingItemUses.clear();
    this.pendingRewards.clear();
    this.statAllocations.clear();
    this.muayCooldowns.clear();
    this.muayCombos.clear();
    this.muayFollowups.clear();
    this.muayDefenseWindows.clear();
    this.muayGrappleCounters.clear();
    this.muayBooks.clear();
    this.muayWrapGranted.clear();
    this.hpRegenRemainder.clear();
    this.lastItemUseMs.clear();
    this.lastInventoryReadMs.clear();
    this.lastWeaponEquipMs.clear();
    this.activeGuestAccounts.clear();
    this.pendingCharacterLeaves.clear();
    this.guestSlotIds.clear();
    this.lastSlotListMs.clear();
    this.lastRenameMs.clear();
    this.destinations.clear();
    this.attackTargets.clear();
    this.lastAttackMs.clear();
    this.lastCombatMs.clear();
    this.lastWarpMs.clear();
    this.pendingWarps.clear();
    this.playerRespawnAt.clear();
    this.playerSpawn.clear();
    this.gates.clear();
    this.lastRejectNoticeMs.clear();
    this.monsterNavigator.clear();
    this.lastSummonAt.clear();
    this.lastSummonAttackAt.clear();
    this.state.summons.clear();
    this.climbs.clear();
    this.flightTransitions.clear();
    this.activeDashes.clear();
    this.lastDashMs.clear();
    console.log("MONTRA Elevation room disposed:", this.roomId);
  }
}
