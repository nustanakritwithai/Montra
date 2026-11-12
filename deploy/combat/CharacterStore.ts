import {validateMixedSkillLoadouts,type MixedSkillLoadouts} from './SkillHotbar.js';
/**
 * MONTRA S2 — durable guest characters (server only).
 * Browser sends a 256-bit bearer token; ONLY a SHA-256 digest appears on disk.
 * No client-provided HP, position, levels, kills or experience are accepted.
 *
 * File-per-character snapshots keep the alpha self-contained on Windows VPS.
 * This store is single-process: multi-node deployment needs shared DB + leases.
 */
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeClassInventory, makeStarterInventory, grantStarterWeapons, validateInventory, type InventorySnapshot } from "./ItemRules.js";
import { DEFAULT_MAP_ID, getWorldMap } from "./WorldMaps.js";
import {CASTLE_ID} from "./CastlePilot.js";
import { emptyAllocations, PROGRESSION, validateAllocations, type Allocations } from "./Progression.js";
import { EconomyStore } from "./EconomyStore.js";
import { validateSwordTree, type SwordTree } from "./SkillCatalog.js";
import { validateMuayBook, validateMuayCooldowns, type MuayBook, type MuayCooldowns } from "./MuayRules.js";
import { MUAY_WRAP_ID } from "./MuayRules.js";
import { validateOccultBook, type OccultBook } from "./OccultRules.js";
import { validateBladeBook, type BladeBook } from "./BladeRules.js";
import { validateSentinelBook, type SentinelBook } from "./SentinelRules.js";

import { parseBuild, type CharacterBuild,type PathId } from "./CharacterBuilds.js";
import {validateMasteryVitals,type MasteryVitals} from "./RebirthCombat.js";
import {prepareRebirth} from "./RebirthTransition.js";
import { classLearningLevel, validateRebirthState, REBIRTH_SHRINE, type RebirthState } from "./Rebirth.js";
import { validateForestObjective, type ForestObjective } from "./ForestObjectives.js";

export const CHARACTER_SAVE_INTERVAL_MS = 15_000;
export const CHARACTER_SLOTS = [1, 2, 3] as const;
export type CharacterSlot = typeof CHARACTER_SLOTS[number];
export type SlotSummary = { slot: CharacterSlot; occupied: boolean; name: string; level: number; path?: string; unavailable?: boolean };
export type CharacterSetup = { name?: unknown; build?: unknown };
export type SpawnPoint = { x: number; z: number };
import {isPotGhost, type PotGhost} from "./LegacyGhostPot.js";
import {isGhostPool, type GhostPool} from "./GhostPool.js";

export type CharacterSnapshot = {
  version: 1;
  id: string;
  name: string;
  level: number;
  experience: number;
  pkKills: number;
  pkDeaths: number;
  x: number;
  y: number;
  z: number;
  hp: number;
  /** Missing only in pre-world-map saves; they belong to the village. */
  mapId?: string;
  castleLayout?: 2;
  statAllocations?: Allocations;
  build?: CharacterBuild;
  /** Absent in existing characters until the rebirth system is used. */
  rebirth?: RebirthState;
  masteryVitals?: MasteryVitals;
  forestObjective?: ForestObjective | null;
  /** Recent paid director event IDs prevent replay across reconnects. */
  directorClaims?: string[];
  classSkillReadyAt?: number;
  talismanReadyAt?: number;
  mixedSkillLoadouts?: MixedSkillLoadouts;
  swordTree?: SwordTree;
  muayWrapGranted?: boolean;
  muayCooldowns?: MuayCooldowns;
  muayBook?: MuayBook;
  occultBook?: OccultBook;
  bladeBook?: BladeBook;
  sentinelBook?: SentinelBook;
  stamina?: number;
  mana?: number;
  /** Undefined only when loading a legacy S2/three-slot snapshot for migration. */
  inventory?: InventorySnapshot;
  ghostPot?: PotGhost;
  ghostPool?: GhostPool;
  updatedAt: string;
};
const TOKEN_PATTERN = /^mt1_[0-9a-f]{64}$/;
const MAX_COUNTER = 1_000_000_000;
const activeCharacters = new Map<string, string>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function getGuestToken(options: unknown): string | null {
  if (!isRecord(options) || options.guestToken === undefined) return null;
  if (typeof options.guestToken !== "string" || !TOKEN_PATTERN.test(options.guestToken)) {
    throw new Error("invalid_character_token");
  }
  return options.guestToken;
}

export function parseCharacterSlot(options: unknown): CharacterSlot {
  const slot = isRecord(options) ? options.characterSlot : undefined;
  if (slot === undefined || slot === 1) return 1; // old S2 clients/saves stay in slot 1
  if (slot === 2 || slot === 3) return slot;
  throw new Error("invalid_character_slot");
}

/** Slot 1 preserves the exact S2 sha256(token) JSON filename. */
export function characterIdFromToken(token: string, slot: CharacterSlot = 1): string {
  if (!TOKEN_PATTERN.test(token)) throw new Error("invalid_character_token");
  if (!CHARACTER_SLOTS.includes(slot)) throw new Error("invalid_character_slot");
  const input = slot === 1 ? token : "MONTRA/CHARACTER-SLOT/v1/" + slot + "/" + token;
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function claimCharacter(id: string, sessionId: string): boolean {
  if (activeCharacters.has(id)) return false;
  activeCharacters.set(id, sessionId);
  return true;
}

export function releaseCharacter(id: string, sessionId: string): void {
  if (activeCharacters.get(id) === sessionId) activeCharacters.delete(id);
}

export function parseCharacterName(payload: unknown): string | null {
  if (!isRecord(payload) || Object.keys(payload).length !== 1 || typeof payload.name !== "string") return null;
  const name = payload.name.normalize("NFC").trim();
  const chars = Array.from(name);
  if (chars.length < 2 || chars.length > 20) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{M}\p{N} ._-]*$/u.test(name)) return null;
  return name;
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) &&
    value >= 0 && value <= MAX_COUNTER;
}
function isCoordinate(value: unknown, min=-100, max=100): value is number {
  return typeof value === "number" && Number.isFinite(value) && value>=min && value<=max;
}

function validateSnapshot(value: unknown, id: string): CharacterSnapshot {
  if (!isRecord(value))throw new Error("character_record_invalid");
  const bounds=typeof value.mapId==="string"?getWorldMap(value.mapId)?.bounds:undefined;
  // Existing snapshots used a symmetric envelope, including when the castle pilot is disabled.
  const legacy=value.mapId===CASTLE_ID ? (value.castleLayout===2?350:1000) : 100;
  if (value.version !== 1 || value.id !== id || (value.castleLayout!==undefined && value.castleLayout!==2) ||
      typeof value.name !== "string" || parseCharacterName({ name: value.name }) !== value.name ||
      !isCount(value.level) || value.level < 1 || value.level > 1000 ||
      !isCount(value.experience) || !isCount(value.pkKills) || !isCount(value.pkDeaths) ||
      !isCoordinate(value.x,Math.min(-legacy,bounds?.minX??0),Math.max(legacy,bounds?.maxX??0)) || !isCoordinate(value.y) ||
      !isCoordinate(value.z,Math.min(-legacy,bounds?.minZ??0),Math.max(legacy,bounds?.maxZ??0)) ||
      !isCount(value.hp) || value.hp > 100_000 ||
      typeof value.updatedAt !== "string" || !Number.isFinite(Date.parse(value.updatedAt))) {
    throw new Error("character_record_invalid");
  }
  if (value.ghostPot !== undefined && !isPotGhost(value.ghostPot)) throw new Error("invalid_ghost_pot");
  if (value.ghostPool !== undefined && !isGhostPool(value.ghostPool)) throw new Error("invalid_ghost_pool");
  if (value.build !== undefined && !parseBuild(value.build)) throw new Error("invalid_character_build");
  for (const readyAt of [value.classSkillReadyAt, value.talismanReadyAt]) {
    if (readyAt !== undefined && (typeof readyAt !== "number" || !Number.isSafeInteger(readyAt) || readyAt < 0)) throw new Error("invalid_skill_cooldown");
  }
  const rebirth=value.rebirth === undefined ? undefined : validateRebirthState(value.rebirth);
  validateMasteryVitals(value.masteryVitals,value.updatedAt as string,value.hp as number);
  if(value.forestObjective!==undefined && value.forestObjective!==null)validateForestObjective(value.forestObjective);
  if(value.directorClaims!==undefined && (!Array.isArray(value.directorClaims) || value.directorClaims.length>16 ||
     value.directorClaims.some(id=>typeof id!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)) ||
     new Set(value.directorClaims).size!==value.directorClaims.length))throw Error("invalid_director_claims");
  const learning=(path:CharacterBuild["path"])=>classLearningLevel(rebirth,path,value.level as number);
  const swordTree = value.swordTree === undefined ? undefined : validateSwordTree(value.swordTree, learning("phutthaisawan"));
  if (value.muayWrapGranted !== undefined && typeof value.muayWrapGranted !== "boolean") throw new Error("invalid_muay_grant");
  const muayCooldowns = value.muayCooldowns === undefined ? undefined : validateMuayCooldowns(value.muayCooldowns);
  const muayBook = value.muayBook === undefined ? undefined : validateMuayBook(value.muayBook,learning("muay_boran"));
  const occultBook = value.occultBook === undefined ? undefined : validateOccultBook(value.occultBook,Math.max(learning("seer"),learning("mender")));
  const bladeBook = value.bladeBook === undefined ? undefined : validateBladeBook(value.bladeBook,learning("blade"));
  const sentinelBook = value.sentinelBook === undefined ? undefined : validateSentinelBook(value.sentinelBook,learning("sentinel"));
  const mixedSkillLoadouts=value.mixedSkillLoadouts===undefined?undefined:validateMixedSkillLoadouts(value.mixedSkillLoadouts,{swordTree,muayBook,bladeBook,sentinelBook,occultBook});
  const inventory = value.inventory === undefined ? undefined : validateInventory(value.inventory);
  const statAllocations = value.statAllocations === undefined ? emptyAllocations() :
    validateAllocations(value.statAllocations, value.level as number);
  if (value.stamina !== undefined && (typeof value.stamina !== "number" || !Number.isFinite(value.stamina) || value.stamina < 0 || value.stamina > PROGRESSION.maxStamina)) {
    throw new Error("invalid_character_stamina");
  }
  if (value.mana !== undefined && (typeof value.mana !== "number" || !Number.isFinite(value.mana) || value.mana < 0 || value.mana > PROGRESSION.maxMana)) {
    throw new Error("invalid_character_mana");
  }
  if(value.mapId===CASTLE_ID && !getWorldMap(CASTLE_ID)){
    const exit=getWorldMap("fallen_city") ?? getWorldMap(DEFAULT_MAP_ID)!;
    return {...(value as CharacterSnapshot),...(inventory && {inventory}),...exit.spawn,mapId:exit.id,statAllocations,mixedSkillLoadouts,swordTree,muayCooldowns,muayBook,occultBook,bladeBook,sentinelBook};
  }
  if (value.mapId !== undefined &&
      (typeof value.mapId !== "string" || !getWorldMap(value.mapId))) {
    throw new Error("unknown_character_map");
  }
  // Only unmarked castle saves use the previous 2 km coordinate system.
  const location=value.mapId===CASTLE_ID && value.castleLayout===undefined
    ? {x:value.x*35/100,z:value.z*35/100,castleLayout:2 as const} : {};
  return { ...(value as CharacterSnapshot), ...(inventory && {inventory}), ...location, mapId: (value.mapId as string | undefined) ?? DEFAULT_MAP_ID, statAllocations, mixedSkillLoadouts, swordTree, muayCooldowns, muayBook, occultBook, bladeBook, sentinelBook };
}

export class CharacterStore {
  private readonly writes = new Map<string, Promise<void>>();
  private economyDb: EconomyStore | undefined;
  // Resolve from the module location, not process.cwd(): a Windows service
  // can start Node from an unexpected directory after a machine restart.
  constructor(readonly directory: string = process.env.MONTRA_CHARACTER_DIR ||
    fileURLToPath(new URL("../../data/characters", import.meta.url)), readonly economyEnabled = false) {}

  get economy(): EconomyStore {
    if (!this.economyEnabled) throw new Error("economy_disabled");
    if (!this.economyDb) {
      mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      this.economyDb = new EconomyStore(path.join(this.directory, "economy.sqlite"));
      this.economyDb.startAuctionSweeper();
    }
    return this.economyDb;
  }
  close(): void { this.economyDb?.close(); this.economyDb = undefined; }
  private guardLegacyMode(): void {
    if(this.economyEnabled)return;
    if(existsSync(path.join(this.directory,"economy.sqlite")))throw new Error("economy_database_requires_economy_mode");
    this.recoverTravelGroup();
  }

  private get travelJournal() {return path.join(this.directory,"water-gate-arrival.json");}

  private writeTravelFile(file:string,value:unknown):void {
    const temp=path.join(this.directory,"."+randomUUID()+".tmp");
    try {
      writeFileSync(temp,JSON.stringify(value)+"\n",{flag:"wx",mode:0o600,flush:true});
      renameSync(temp,file);
    } finally {
      if(existsSync(temp))unlinkSync(temp);
    }
  }

  private recoverTravelGroup():void {
    if(!existsSync(this.travelJournal))return;
    const raw:unknown=JSON.parse(readFileSync(this.travelJournal,"utf8"));
    if(!Array.isArray(raw) || !raw.length)throw new Error("invalid_water_gate_journal");
    const snapshots=raw.map(value=>validateSnapshot(value,value?.id));
    for(const snapshot of snapshots)this.writeTravelFile(this.location(snapshot.id),snapshot);
    unlinkSync(this.travelJournal);
  }

  /** Save the whole crew before the room publishes the boat's new map. */
  saveTravelGroup(characters:readonly CharacterSnapshot[]):void {
    const records=characters.map(character=>{
      const snapshot=validateSnapshot(character.mapId===CASTLE_ID?{...character,castleLayout:2}:character,character.id);
      if(!snapshot.inventory)throw new Error("inventory_record_missing");
      return {id:snapshot.id,snapshot,inventory:snapshot.inventory};
    });
    this.guardLegacyMode();
    if(this.economyEnabled){this.economy.saveTravelGroup(records);return;}
    if(records.some(({id})=>this.writes.has(id) || existsSync(this.rewardPath(id))))throw new Error("character_write_pending");
    mkdirSync(this.directory,{recursive:true,mode:0o700});
    this.writeTravelFile(this.travelJournal,records.map(record=>record.snapshot));
    // The journal is the commit. Replaying it after a failed rename is idempotent.
    try {this.recoverTravelGroup();}
    catch(error){console.error("MONTRA water gate save recovery pending",error);}
  }

  private location(id: string): string {
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("invalid_character_id");
    return path.join(this.directory, id + ".json");
  }

  private rewardPath(id:string):string {
    return this.location(id)+".reward-pending";
  }

  private async atomicWrite(character:CharacterSnapshot,destination=this.location(character.id),flush=false):Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = path.join(this.directory, "." + character.id + "." + randomUUID() + ".tmp");
    try {
      await writeFile(temporary, JSON.stringify(character) + "\n", { flag: "wx", mode: 0o600, flush });
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  private async queueJsonWrite(id:string,write:()=>Promise<void>):Promise<void> {
    const previous=this.writes.get(id) ?? Promise.resolve();
    const next=previous.catch(()=>{}).then(write);
    this.writes.set(id,next);
    try{await next;}finally{if(this.writes.get(id)===next)this.writes.delete(id);}
  }

  private commitJsonMonsterReward(id:string):Promise<void> {
    return rename(this.rewardPath(id),this.location(id));
  }

  private commitSqlMonsterReward(id:string):void {
    this.economy.commitMonsterReward(id,record=>{
      const snapshot=validateSnapshot(record,id);
      if(!snapshot.inventory)throw new Error("inventory_record_missing");
      return {snapshot,inventory:snapshot.inventory};
    });
  }

  private async recoverMonsterReward(id:string):Promise<void> {
    if(this.economyEnabled){this.commitSqlMonsterReward(id);return;}
    const pending=this.rewardPath(id);
    if(!existsSync(pending))return;
    await this.queueJsonWrite(id,async()=>{
      let record:string;
      try{record=await readFile(pending,"utf8");}
      catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return;throw error;}
      const snapshot=validateSnapshot(JSON.parse(record) as unknown,id);
      if(!snapshot.inventory)throw new Error("inventory_record_missing");
      await this.commitJsonMonsterReward(id);
    });
  }

  async loadOrCreate(token: string, spawn: SpawnPoint, slot: CharacterSlot = 1): Promise<{ character: CharacterSnapshot; created: boolean }> {
    const id = characterIdFromToken(token, slot);
    return this.loadOrCreateById(id, spawn);
  }

  /** IDs belong to an authenticated account; never accept an arbitrary client-supplied ID. */
  async loadOrCreateById(id: string, spawn: SpawnPoint, setup?: CharacterSetup, requireBuild = false): Promise<{ character: CharacterSnapshot; created: boolean }> {
    if (!/^[0-9a-f]{64}$/.test(id)) throw new Error("invalid_character_id");
    this.guardLegacyMode();
    await this.recoverMonsterReward(id);
    if (this.economyEnabled) {
      const saved = this.economy.getCharacter(id);
      if (saved !== null) return { character: await this.prepareAdmission(validateSnapshot(saved, id), false, setup, requireBuild), created: false };
    }
    let contents: string | undefined;
    try {
      contents = await readFile(this.location(id), "utf8");
    } catch (error) {
      // Only a missing INPUT file creates a new character. Any later
      // migration write error, even ENOENT, must FAIL CLOSED.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (contents !== undefined) {
      const previous = validateSnapshot(JSON.parse(contents) as unknown, id);
      if (previous.inventory?.equippedWeaponSlot !== undefined) {
        if (this.economyEnabled) await this.save(previous);
        return { character: await this.prepareAdmission(previous, false, setup, requireBuild), created: false };
      }
      // Legacy S2/0.2.5 without inventory gets 3 potions + 3 weapons once.
      // Existing V0.2.6 inventories get ONLY the three weapons: preserve
      // the EXACT potion stock, including zero, without duplicate grants.
      const migrated: CharacterSnapshot = {
        ...previous,
        inventory: previous.inventory
          ? grantStarterWeapons(previous.inventory)
          : makeStarterInventory(),
        updatedAt: new Date().toISOString(),
      };
      // Persist BEFORE admitting the character: on disk error, fail closed.
      await this.save(migrated);
      return { character: await this.prepareAdmission(migrated, false, setup, requireBuild), created: false };
    }
    const fresh: CharacterSnapshot = {
      version: 1, id, name: "นักเดินทาง", level: 1, experience: 0,
      pkKills: 0, pkDeaths: 0, x: spawn.x, y: 0, z: spawn.z, hp: PROGRESSION.baseHp, mapId: DEFAULT_MAP_ID,
      statAllocations: emptyAllocations(), stamina: PROGRESSION.baseStamina,
      inventory: makeStarterInventory(),
      updatedAt: new Date().toISOString(),
    };
    // A new character must already exist on disk before joining the world.
    // Never silently turn a read/corruption/disk error into a reset character.
    const prepared = await this.prepareAdmission(fresh, true, setup, requireBuild);
    if (this.economyEnabled) await this.save(prepared); else await this.atomicWrite(prepared);
    return { character: prepared, created: true };
  }

  private async prepareAdmission(character: CharacterSnapshot, fresh: boolean, setup: CharacterSetup | undefined, required: boolean): Promise<CharacterSnapshot> {
    if (!required) return character;
    // A legacy character may have chosen Muay while its bag was full. Retry
    // the one-time starter grant on a later login without replacing any item.
    if (character.build) {
      if (character.build.path !== "muay_boran" || character.muayWrapGranted || !character.inventory) return character;
      const slots = character.inventory.slots.slice(), existing = slots.findIndex(item => item?.itemId === MUAY_WRAP_ID);
      const index = existing >= 0 ? existing : slots.findIndex(item => item === null);
      if (index < 0) return character;
      if (existing < 0) slots[index] = {itemId:MUAY_WRAP_ID, quantity:1};
      const granted = {...character,inventory:{...character.inventory,slots},muayWrapGranted:true,updatedAt:new Date().toISOString()};
      await this.save(granted);
      return granted;
    }
    const build = parseBuild(setup?.build);
    const name = fresh ? parseCharacterName({name:setup?.name}) : character.name;
    if (!build || !name) throw new Error("character_setup_required");
    let inventory = character.inventory!;
    let muayWrapGranted = character.muayWrapGranted;
    if (fresh) {
      inventory=makeClassInventory(build.path);
      if (build.path==="muay_boran")muayWrapGranted=true;
    } else if (build.path === "muay_boran") {
      const slots = inventory.slots.slice(), existing = slots.findIndex(item => item?.itemId === MUAY_WRAP_ID);
      const index = existing >= 0 ? existing : slots.findIndex(item => item === null);
      if (index >= 0) {
        if (existing < 0) slots[index] = {itemId:MUAY_WRAP_ID, quantity:1};
        inventory = {...inventory, slots};
        muayWrapGranted = true;
      }
    }
    const prepared = {...character, name, build, inventory, ...(muayWrapGranted ? {muayWrapGranted:true} : {}), updatedAt:new Date().toISOString()};
    if (!fresh) await this.save(prepared);
    return prepared;
  }

  /** Called after the online room finishes its final save and the account lease is claimed. */
  async rebirthAtShrine(id:string,path:PathId,fromPath:PathId,cycle:number){
    this.guardLegacyMode();
    await this.recoverMonsterReward(id);
    const record=this.economyEnabled?this.economy.getCharacter(id):JSON.parse(await readFile(this.location(id),"utf8"));
    if(!record)throw Error("slot_changed");
    const saved=validateSnapshot(record,id);
    if(saved.build?.path!==fromPath || (saved.rebirth?.count??0)!==cycle)throw Error("rebirth_changed");
    const shrine=REBIRTH_SHRINE;
    if(saved.hp+(saved.masteryVitals?.hpRemainder??0)<=0 || saved.mapId!==shrine.mapId || Math.hypot(saved.x-shrine.x,saved.z-shrine.z)>shrine.radius || Math.abs(saved.y)>0.5){
      throw Error("rebirth_shrine_required");
    }
    const next=prepareRebirth(saved,path);
    await this.save({...next,x:shrine.x,y:0,z:shrine.z,mapId:shrine.mapId});
    return {level:next.level,path,cycle:next.rebirth!.count};
  }

  /** Read-only slot previews. Never create/delete saves while listing. */
  async listSlots(ids: readonly string[]): Promise<SlotSummary[]> {
    if (ids.length !== CHARACTER_SLOTS.length) throw new Error("invalid_slot_ids");
    this.guardLegacyMode();
    return await Promise.all(CHARACTER_SLOTS.map(async (slot, index): Promise<SlotSummary> => {
      try {
        const id = ids[index];
        const current = this.economyEnabled ? this.economy.getCharacter(id) : null;
        const record = validateSnapshot(current ?? JSON.parse(await readFile(this.location(id), "utf8")) as unknown, id);
        return { slot, occupied: true, name: record.name, level: record.level, path: record.build?.path };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          return { slot, occupied: false, name: "", level: 0 };
        }
        // If a slot has a corrupt record, hide its data; never overwrite it.
        return { slot, occupied: true, name: "", level: 0, unavailable: true };
      }
    }));
  }

  /** Called only after the account mapping was retired while the account lease is held. */
  async eraseCharacter(id:string):Promise<void> {
    this.guardLegacyMode();
    if(this.economyEnabled)this.economy.eraseCharacter(id);
    else if(existsSync(this.rewardPath(id)))throw new Error("monster_reward_pending");
    try { await unlink(this.location(id)); }
    catch(error) { if((error as NodeJS.ErrnoException).code!=="ENOENT")throw error; }
  }

  async save(character:CharacterSnapshot,kind?:"monster_reward"):Promise<void> {
    const snapshot = validateSnapshot(character.mapId===CASTLE_ID ? {...character,castleLayout:2} : character, character.id);
    this.guardLegacyMode();
    // Upgraded servers must never overwrite a real inventory with a legacy
    // HP-only snapshot, which would re-grant starter potions on next login.
    if (snapshot.inventory === undefined) throw new Error("inventory_record_missing");
    const {id}=snapshot;
    if(this.economyEnabled){
      if(kind==="monster_reward"){
        this.economy.stageMonsterReward(id,snapshot);
        this.commitSqlMonsterReward(id);
      }else this.economy.saveCharacter(id,snapshot,snapshot.inventory);
      return;
    }
    await this.queueJsonWrite(id,async()=>{
      const pending=this.rewardPath(id);
      if(existsSync(pending))throw new Error("monster_reward_pending");
      if(kind==="monster_reward"){
        await this.atomicWrite(snapshot,pending,true);
        await this.commitJsonMonsterReward(id);
      }else await this.atomicWrite(snapshot);
    });
  }
}

export const characterStore = new CharacterStore(undefined, process.env.MONTRA_ECONOMY_ENABLED === "1");
