import { readForged, birthForge, applyForgeRatings, forgeStamp, type Forged } from "./ForgeRules.js";
import { MAX_FORGE_COPIES, BOSS_GEAR_CHANCE, bossTreasure, personalItem, startingWeapon, firstChest, isBodySlot, equipPositions, isCardId, type CardId, type BodyItemId, type BodySlot, SALVE_ID, withEquipmentStats, type ChestId, type PracticeWeapon, type PersonalId, type MaterialId } from "./PersonalItems.js";
import {MAX_LOOT_MISSES,STARTER_HUNT,isStarterHuntMob,rollMonsterLoot} from "./MonsterLoot.js";
import {randomInt} from "node:crypto";
import { PROGRESSION, baseManaAtLevel, type CombatStats } from "./Progression.js";
import { MUAY_WRAP_ID } from "./MuayRules.js";
import { gearSchools, usesStaff, type CatalystId, type SalveId, type ForgeRating,type BrewId,type FieldToolId } from "./PersonalItems.js";
/**
 * MONTRA V0.2.7 — authoritative permanent equipment.
 * Existing v0.2.6 inventory JSON (version:1, slots:[...]) stays readable.
 * The optional equippedWeaponSlot is a one-time upgrade marker. No client
 * supplies stats, weapon IDs, grants, damage, or inventory mutations.
 */
export const INVENTORY_SLOT_COUNT = 12;
export const INVENTORY_STACK_LIMIT = 99;
export const POTION_ID = "health_potion" as const;
export const POTION_HEAL = 30;
export const STARTER_POTION_COUNT = 3;
export const POTION_COOLDOWN_MS = 1_000;

export const RITUAL_DAGGER_ID = "ritual_dagger" as const;
export const ARCANE_SWORD_ID = "arcane_sword" as const;
export const SPIRIT_STAFF_ID = "spirit_staff" as const;
export const STARTER_WEAPON_IDS = [
  RITUAL_DAGGER_ID, ARCANE_SWORD_ID, SPIRIT_STAFF_ID,
] as const;

export const SHRINE_SHARD = "shrine_shard" as const;
export const SHRINE_GLAIVE = "shrine_glaive" as const;
export const SHRINE_RECIPE = Object.freeze({
  id: "shrine_glaive", ingredient: SHRINE_SHARD, quantity: 1, gold: 100, output: SHRINE_GLAIVE,
  itemLevel: 12, rarity: "rare", meleeBonus: 10, pvpMeleeBonus: 8,
});
type LegacyWeapon = typeof STARTER_WEAPON_IDS[number] | typeof SHRINE_GLAIVE | typeof MUAY_WRAP_ID;
export type WeaponItemId = LegacyWeapon | PracticeWeapon;
export type StackableId = typeof POTION_ID | typeof SHRINE_SHARD | SalveId | BrewId | FieldToolId | MaterialId | CatalystId | CardId;
export function isStackableItem(value: unknown): value is StackableId {
  const kind=personalItem(value)?.kind;
  return value===POTION_ID || value===SHRINE_SHARD || kind==="consumable" || kind==="material" || kind==="catalyst" || kind==="card" || kind==="tool";
}
export type ItemId = StackableId | WeaponItemId | BodyItemId;
/** Missing socket = undrilled, null = drilled, ID = installed card. */
export type InventoryStack = { itemId: ItemId; quantity: number; forge?: Forged; bound?:true; socket?: CardId|null };
export type InventorySnapshot = {
  version: 1;
  slots: Array<InventoryStack | null>;
  /** Missing only for a legacy V0.2.6 potion-only save; null = deliberately unequipped. */
  equippedWeaponSlot?: number | null;
  equipment?: Partial<Record<BodySlot,BodyItemId>>;
  equipmentSockets?: Partial<Record<BodySlot,CardId|null>>;
  equipmentForges?: Partial<Record<BodySlot,Forged>>;
  firstChestClaimed?:true;
  lootMisses?:number;
  starterHuntKills?:number;
  forgeCopies?:Record<string,number>;
};
export type ItemUseResult =
  | { ok: true; inventory: InventorySnapshot; healed: number; restoredMana:number; hp: number; itemId: typeof POTION_ID | SalveId | BrewId }
  | { ok: false; reason: "item_unavailable" | "hp_full" | "mana_full" | "not_alive" | "not_consumable" | "item_level_required" };
export type EquipWeaponResult =
  | { ok: true; inventory: InventorySnapshot; weaponId: WeaponItemId | null }
  | { ok: false; reason: "item_unavailable" | "not_weapon" | "already_equipped" | "wrong_item_class" | "item_level_required" };

export const WEAPON_STATS: Readonly<Record<LegacyWeapon, Readonly<{
  meleeBonus: number; rangedBonus: number;
}>>> = Object.freeze({
  [RITUAL_DAGGER_ID]: Object.freeze({ meleeBonus: 4, rangedBonus: 0 }),
  [ARCANE_SWORD_ID]: Object.freeze({ meleeBonus: 8, rangedBonus: 0 }),
  [SPIRIT_STAFF_ID]: Object.freeze({ meleeBonus: 0, rangedBonus: 6 }),
  [SHRINE_GLAIVE]: Object.freeze({ meleeBonus: SHRINE_RECIPE.meleeBonus, rangedBonus: 0 }),
  [MUAY_WRAP_ID]: Object.freeze({ meleeBonus: 4, rangedBonus: 0 }),
});

export function legacyWeaponStats(id:WeaponItemId) {
  return Object.hasOwn(WEAPON_STATS,id) ? WEAPON_STATS[id as LegacyWeapon] : {meleeBonus:0,rangedBonus:0};
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isWeaponId(value: unknown): value is WeaponItemId {
  return value === SHRINE_GLAIVE || value === MUAY_WRAP_ID || STARTER_WEAPON_IDS.some(id => id === value) || personalItem(value)?.kind==="mainHand";
}
export function isSocketGear(id:unknown):id is WeaponItemId|BodyItemId {
  return isWeaponId(id) || equipPositions(personalItem(id)?.kind).length>0;
}

export function makeClassInventory(path:string):InventorySnapshot {
  const slots = new Array<InventoryStack|null>(INVENTORY_SLOT_COUNT).fill(null);
  slots[0]={itemId:POTION_ID,quantity:STARTER_POTION_COUNT};
  slots[1]={itemId:startingWeapon(path),quantity:1,bound:true};
  return {version:1,slots,equippedWeaponSlot:1,equipment:{}};
}

export function makeStarterInventory(): InventorySnapshot {
  // A typed allocation avoids TS7011 on Windows builds configured with
  // noImplicitAny=true and strictNullChecks=false. Every slot starts empty.
  const slots: Array<InventoryStack | null> =
    new Array<InventoryStack | null>(INVENTORY_SLOT_COUNT).fill(null);
  slots[0] = { itemId: POTION_ID, quantity: STARTER_POTION_COUNT };
  STARTER_WEAPON_IDS.forEach((weaponId, index) => {
    slots[index + 1] = { itemId: weaponId, quantity: 1 };
  });
  return { version: 1, slots, equippedWeaponSlot: 1 };
}

/** Exact-key, whitelist-only validation; malformed data fails closed. */
export function validateInventory(value: unknown): InventorySnapshot {
  if (!record(value) || !Array.isArray(value.slots) ||
      value.version !== 1 || value.slots.length !== INVENTORY_SLOT_COUNT) {
    throw new Error("inventory_record_invalid");
  }
  const keys = Object.keys(value);
  const upgraded = Object.prototype.hasOwnProperty.call(value, "equippedWeaponSlot");
  if (keys.some(key=>!["version","slots","equippedWeaponSlot","equippedChestSlot","equipment","equipmentSockets","equipmentForges","firstChestClaimed","lootMisses","forgeCopies","starterHuntKills"].includes(key)) ||
      (Object.hasOwn(value,"starterHuntKills") && (!upgraded || !Number.isInteger(value.starterHuntKills) || (value.starterHuntKills as number)<0 || (value.starterHuntKills as number)>STARTER_HUNT.goal)) ||
      (!upgraded && Object.hasOwn(value,"forgeCopies")) ||
      (Object.hasOwn(value,"lootMisses") && (!upgraded || !Number.isInteger(value.lootMisses) || (value.lootMisses as number)<0 || (value.lootMisses as number)>MAX_LOOT_MISSES)) ||
      (!upgraded && (Object.hasOwn(value,"equippedChestSlot") || Object.hasOwn(value,"equipment") || Object.hasOwn(value,"equipmentSockets") || Object.hasOwn(value,"equipmentForges") || Object.hasOwn(value,"firstChestClaimed"))) ||
      (Object.hasOwn(value,"firstChestClaimed") && value.firstChestClaimed!==true)) {
    throw new Error("inventory_record_invalid");
  }
  const slots = value.slots.map((entry: unknown): InventoryStack | null => {
    if (entry === null) return null;
    if (!record(entry) || Object.keys(entry).some(key => !["itemId","quantity","forge","bound","socket"].includes(key)) ||
        !Number.isSafeInteger(entry.quantity)) {
      throw new Error("inventory_record_invalid");
    }
    if (isStackableItem(entry.itemId)) {
      if (Object.hasOwn(entry,"socket") || Object.hasOwn(entry,"bound") || Object.hasOwn(entry,"forge") || (entry.quantity as number) < 1 ||
          (entry.quantity as number) > INVENTORY_STACK_LIMIT) {
        throw new Error("inventory_record_invalid");
      }
      return { itemId: entry.itemId, quantity: entry.quantity as number };
    }
    const itemId=entry.itemId as ItemId;
    const body=equipPositions(personalItem(itemId)?.kind).length>0;
    if (!upgraded || (!isWeaponId(itemId) && !body) ||
        (Object.hasOwn(entry,"bound") && (entry.bound!==true || (!personalItem(itemId) && !Object.hasOwn(entry,"forge")))) ||
        entry.quantity!==1) throw Error("inventory_record_invalid");
    const socket=Object.hasOwn(entry,"socket")?entry.socket:undefined;
    if(socket!==undefined && socket!==null && !isCardId(socket))throw Error("inventory_record_invalid");
    return {itemId,quantity:1,...(entry.bound===true ? {bound:true as const} : {}), ...(Object.hasOwn(entry,"forge") ? {forge:readForged(entry.forge)} : {}),
      ...(socket!==undefined ? {socket:socket as CardId|null} : {})};
  });
  if (!upgraded) return { version: 1, slots };
  const selected = value.equippedWeaponSlot;
  if (selected !== null &&
      (!Number.isSafeInteger(selected) ||
       (selected as number) < 0 || (selected as number) >= INVENTORY_SLOT_COUNT ||
       !isWeaponId(slots[selected as number]?.itemId))) {
    throw new Error("inventory_record_invalid");
  }
  const result:InventorySnapshot={version:1,slots,equippedWeaponSlot:selected as number|null};
  if(Object.hasOwn(value,"forgeCopies")){
    if(!record(value.forgeCopies))throw Error("inventory_record_invalid");
    result.forgeCopies={};
    for(const [id,n] of Object.entries(value.forgeCopies)){
      if(!isSocketGear(id) || typeof n!=="number" || !Number.isSafeInteger(n) || n<1 || n>MAX_FORGE_COPIES)throw Error("inventory_record_invalid");
      result.forgeCopies[id]=n;
    }
  }
  if(value.lootMisses)result.lootMisses=value.lootMisses as number;
  if(value.starterHuntKills)result.starterHuntKills=value.starterHuntKills as number;
  if (Object.hasOwn(value,"equipment")) {
    if (!record(value.equipment))throw Error("inventory_record_invalid");
    result.equipment={};
    for (const [slot,id] of Object.entries(value.equipment)) {
      if (!isBodySlot(slot) || !equipPositions(personalItem(id)?.kind).includes(slot))throw Error("inventory_record_invalid");
      result.equipment[slot]=id as BodyItemId;
    }
  }
  // Read the chest-only trial snapshot once. Moving a worn piece frees its former bag slot.
  if (Object.hasOwn(value,"equippedChestSlot")) {
    const index=value.equippedChestSlot;
    if(index!==null){
      if (!Number.isSafeInteger(index) || personalItem(slots[index as number]?.itemId)?.kind!=="chest" || result.equipment?.chest)throw Error("inventory_record_invalid");
      result.equipment={...result.equipment,chest:slots[index as number]!.itemId as ChestId};
      slots[index as number]=null;
    }
  }
  if(value.firstChestClaimed===true)result.firstChestClaimed=true;
  if(Object.hasOwn(value,"equipmentForges")){
    if(!record(value.equipmentForges))throw Error("inventory_record_invalid");
    result.equipmentForges={};
    for(const [position,forge] of Object.entries(value.equipmentForges)){
      if(!isBodySlot(position) || !result.equipment?.[position])throw Error("inventory_record_invalid");
      result.equipmentForges[position]=readForged(forge);
    }
  }
  if(Object.hasOwn(value,"equipmentSockets")){
    if(!record(value.equipmentSockets))throw Error("inventory_record_invalid");
    result.equipmentSockets={};
    for(const [position,card] of Object.entries(value.equipmentSockets)){
      if(!isBodySlot(position) || !result.equipment?.[position] || (card!==null && !isCardId(card)))throw Error("inventory_record_invalid");
      result.equipmentSockets[position]=card as CardId|null;
    }
  }
  const counts=new Map<ItemId,number>(),identities=new Set<string>();
  function registerGear(id:ItemId,forge?:Forged){
    const count=(counts.get(id)??0)+1,identity=forge?.instanceId??id;
    if(count>(personalItem(id)?.copyLimit??1) || identities.has(identity))throw Error("inventory_record_invalid");
    counts.set(id,count);identities.add(identity);
  }
  for(const stack of slots)if(stack && !isStackableItem(stack.itemId))registerGear(stack.itemId,stack.forge);
  for(const [slot,id] of Object.entries(result.equipment??{}))registerGear(id,result.equipmentForges?.[slot as BodySlot]);
  return result;
}

/** Idempotent, one-time migration from a saved V0.2.6 potion-only bag. */
export function grantStarterWeapons(inventory: InventorySnapshot): InventorySnapshot {
  const original = validateInventory(inventory);
  if (original.equippedWeaponSlot !== undefined) return original;
  const slots = original.slots.slice();
  let firstSlot = -1;
  for (const weaponId of STARTER_WEAPON_IDS) {
    const free = slots.findIndex(slot => slot === null);
    if (free < 0) throw new Error("inventory_upgrade_no_space");
    slots[free] = { itemId: weaponId, quantity: 1 };
    if (firstSlot < 0) firstSlot = free;
  }
  return validateInventory({
    version: 1, slots, equippedWeaponSlot: firstSlot,
  });
}

/** Browser may only request a server-owned slot or null to unequip. */
export function parseEquipWeaponCommand(payload: unknown): {slot:number|null} | null {
  if (!record(payload) || Object.keys(payload).length !== 1) return null;
  if (payload.slot === null) return { slot: null };
  if (!Number.isSafeInteger(payload.slot)) return null;
  const slot = payload.slot as number;
  return slot >= 0 && slot < INVENTORY_SLOT_COUNT ? {slot} : null;
}
export function equipInventoryWeapon(
  inventory: InventorySnapshot, slot: number | null, path?:string, level=1,
): EquipWeaponResult {
  const previous = validateInventory(inventory);
  if (previous.equippedWeaponSlot === undefined) throw new Error("inventory_upgrade_required");
  if (slot === previous.equippedWeaponSlot) {
    return { ok: false, reason: "already_equipped" };
  }
  if (slot === null) return {
    ok: true, inventory: { ...previous, equippedWeaponSlot: null },
    weaponId: null,
  };
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= INVENTORY_SLOT_COUNT ||
      previous.slots[slot] === null) {
    return { ok: false, reason: "item_unavailable" };
  }
  const selected = previous.slots[slot]!;
  if (!isWeaponId(selected.itemId)) return { ok: false, reason: "not_weapon" };
  const definition=personalItem(selected.itemId);
  if (definition && definition.path!==path) return {ok:false,reason:"wrong_item_class"};
  if ((definition?.level??1)>level)return {ok:false,reason:"item_level_required"};
  if (definition) previous.slots[slot]={...selected,bound:true};
  return {
    ok: true,
    inventory: { ...previous, equippedWeaponSlot: slot },
    weaponId: selected.itemId,
  };
}

export function gearCounts(bag:InventorySnapshot):Map<string,number>{
  const counts=new Map<string,number>();
  for(const id of [...Object.values(bag.equipment??{}),...bag.slots.flatMap(s=>s && !isStackableItem(s.itemId)?[s.itemId]:[])])
    counts.set(id,(counts.get(id)??0)+1);
  return counts;
}
export function bankForgeCopy(bag:InventorySnapshot,id:WeaponItemId|BodyItemId):InventorySnapshot|null{
  const count=bag.forgeCopies?.[id]??0;
  return count>=MAX_FORGE_COPIES?null:{...bag,forgeCopies:{...bag.forgeCopies,[id]:count+1}};
}
export function matchesGearStamp(bag:InventorySnapshot,id:string,forge:Forged|undefined,stamp:string|undefined){
  if(stamp!==undefined)return forgeStamp({itemId:id,forge})===stamp;
  return personalItem(id)?.copyLimit!==2 || (gearCounts(bag).get(id)??0)<2;
}
/** A worn body piece owns its equipment slot; it no longer consumes a bag cell. */
export function equipBody(inventory:InventorySnapshot,position:BodySlot,slot:number|null,expected:BodyItemId,path:string,level=1,stamp?:string):
  EquipWeaponResult | {ok:false;reason:"inventory_full"|"equipment_changed"} {
  const next=validateInventory(inventory);
  const worn=next.equipment?.[position];
  const def=personalItem(expected);
  if (!def || !equipPositions(def.kind).includes(position))return {ok:false,reason:"equipment_changed"};
  const targetForge=slot===null?next.equipmentForges?.[position]:next.slots[slot]?.forge;
  if(!matchesGearStamp(next,expected,targetForge,stamp))return {ok:false,reason:"equipment_changed"};
  const equipment={...next.equipment};
  const sockets={...next.equipmentSockets};
  const forges={...next.equipmentForges};
  const wornStack:InventoryStack|null=worn?{itemId:worn,quantity:1,bound:true,
    ...(forges[position]?{forge:forges[position]}:{}),
    ...(Object.hasOwn(sockets,position)?{socket:sockets[position]}:{})}:null;
  if (slot===null) {
    if (worn!==expected)return {ok:false,reason:"equipment_changed"};
    const empty=next.slots.indexOf(null);
    if(empty<0)return {ok:false,reason:"inventory_full"};
    next.slots[empty]=wornStack;
    delete equipment[position];
    delete sockets[position];
    delete forges[position];
  } else {
    if(next.slots[slot]?.itemId!==expected)return {ok:false,reason:"equipment_changed"};
    if(def.path!=="all" && def.path!==path)return {ok:false,reason:"wrong_item_class"};
    if((def.level??1)>level)return {ok:false,reason:"item_level_required"};
    const incomingForge=next.slots[slot]!.forge;
    if(incomingForge)forges[position]=incomingForge;else delete forges[position];
    const incomingSocket=next.slots[slot]!.socket;
    if(incomingSocket===undefined)delete sockets[position];else sockets[position]=incomingSocket;
    next.slots[slot]=wornStack;
    equipment[position]=expected;
  }
  next.equipment=equipment;
  if(Object.keys(forges).length)next.equipmentForges=forges;else delete next.equipmentForges;
  if(Object.keys(sockets).length)next.equipmentSockets=sockets;else delete next.equipmentSockets;
  return {ok:true,inventory:next,weaponId:equippedWeaponId(next)};
}

export function parseBodyCommand(message:unknown) {
  if(!record(message) || Object.keys(message).some(k=>!["position","expected","slot","stamp"].includes(k)) ||
    (Object.hasOwn(message,"stamp") && (typeof message.stamp!=="string" || message.stamp.length>100)) || !isBodySlot(message.position) ||
      !equipPositions(personalItem(message.expected)?.kind).includes(message.position) ||
      (message.slot!==null && (!Number.isInteger(message.slot) || (message.slot as number)<0 || (message.slot as number)>=INVENTORY_SLOT_COUNT)))return null;
  return {slot:message.slot as number|null,position:message.position,expected:message.expected as BodyItemId,...(typeof message.stamp==="string"?{stamp:message.stamp}:{})};
}

export function equippedStats(base:CombatStats,bag:InventorySnapshot|undefined):CombatStats {
  if(!bag)return base;
  const weapon=bag.slots[bag.equippedWeaponSlot??-1];
  const result=withEquipmentStats(base,[weapon?.itemId,weapon?.socket,...Object.values(bag.equipment??{}),...Object.values(bag.equipmentSockets??{})]);
  result.maxHp=Math.min(PROGRESSION.maxHp,result.maxHp);
  result.maxStamina=Math.min(PROGRESSION.maxStamina,result.maxStamina);
  return result;
}

type FieldDrop={bag:InventorySnapshot;id?:ItemId|null;quantity?:number;blockedId?:ItemId;missedQuantity?:number;banked?:boolean;starterCopy?:PracticeWeapon};
export function practiceLoot(bag:InventorySnapshot,path:string,monsterLevel=1,tier="normal",playerLevel=monsterLevel,monsterId="possessed-1",draw?:(max:number)=>number):FieldDrop {
  const drop=fieldLoot(bag,path,monsterLevel,tier,playerLevel,monsterId,draw);
  const previous=bag.starterHuntKills??0;
  if(playerLevel>STARTER_HUNT.maxLevel || previous===STARTER_HUNT.goal || !isStarterHuntMob(monsterId) || !Object.hasOwn(gearSchools,path))return drop;
  const weapon=startingWeapon(path);
  const hasCopy=(drop.bag.forgeCopies?.[weapon]??0)>0 || drop.bag.slots.some(s=>s?.itemId===weapon && (s.forge?.rank??0)>0);
  const kills=hasCopy?STARTER_HUNT.goal:previous+1;
  drop.bag={...drop.bag,starterHuntKills:kills};
  if(!hasCopy && kills===STARTER_HUNT.goal){
    drop.bag=bankForgeCopy(drop.bag,weapon)!;
    drop.starterCopy=weapon;
  }
  return drop;
}
function fieldLoot(bag:InventorySnapshot,path:string,monsterLevel:number,tier:string,playerLevel:number,monsterId:string,draw?: (max:number)=>number):FieldDrop {
  let pendingChest:BodyItemId|undefined;
  if(!bag.firstChestClaimed){
    const id=firstChest(path,Math.min(monsterLevel,playerLevel));
    if(bag.equipment?.chest!==id && !bag.slots.some(s=>s?.itemId===id)){
      const index=bag.slots.indexOf(null);
      if(index>=0){
        const slots=bag.slots.slice(),forge=birthForge(id);
        slots[index]={itemId:id,quantity:1,bound:true,...(forge?{forge}:{})};
        return {bag:{...bag,slots,firstChestClaimed:true},id};
      }
      pendingChest=id;
    }else bag={...bag,firstChestClaimed:true};
  }
  const owned=gearCounts(bag);
  const partialStacks=bag.slots.includes(null)?undefined:new Set(bag.slots.flatMap(s=>s && s.quantity<INVENTORY_STACK_LIMIT?[s.itemId]:[]));
  const worn=new Set<string>(Object.values(bag.equipment??{}));
  const weapon=bag.slots[bag.equippedWeaponSlot??-1];if(weapon)worn.add(weapon.itemId);
  const rank=weapon?.forge?.rank??0;
  const training=rank>=1 && rank<3 && playerLevel<=STARTER_HUNT.maxLevel && isStarterHuntMob(monsterId) && Object.hasOwn(gearSchools,path)?startingWeapon(path):undefined;
  const focus=training && training===weapon?.itemId && !bag.forgeCopies?.[training]?training:undefined;
  const roll=rollMonsterLoot(monsterId,path,owned,playerLevel,bag.lootMisses??0,tier,draw,partialStacks,bag.forgeCopies??{},worn,focus);
  const chestNotice=pendingChest?{bag,id:null as null,quantity:0,blockedId:pendingChest,missedQuantity:1}:null;
  if(!roll)return chestNotice??{bag};
  const {id}=roll;
  bag={...bag,lootMisses:roll.misses};
  if(!isStackableItem(id) && (owned.get(id)??0)>=(personalItem(id)?.copyLimit??1)){
    const bank=bankForgeCopy(bag,id);
    if(bank)return {bag:bank,id,banked:true};
  }
  if(isStackableItem(id)){
    // Retired starter weapons have no catalog recipe. The village ghost can drop matching smith copies for their owners.
    if(monsterId==="possessed-1"){
      const old=[...STARTER_WEAPON_IDS,MUAY_WRAP_ID].filter(key=>owned.has(key) && (bag.forgeCopies?.[key]??0)<MAX_FORGE_COPIES);
      const pick=draw??randomInt;
      if(old.length && pick(100)<25){
        const key=old[pick(old.length)];
        return {bag:bankForgeCopy(bag,key)!,id:key,banked:true};
      }
    }
    if(chestNotice)return chestNotice;
    let quantity=0;
    const limit=tier==="boss"?6:tier==="elite"?4:tier==="strong"?3:2;
    while(quantity<limit){
      const added=grantStackReward(bag,id);
      if(!added)break;
      bag=added;quantity++;
    }
    return {bag,id:quantity?id:null,quantity,...(quantity<limit?{blockedId:id,missedQuantity:limit-quantity}:{})};
  }
  const index=bag.slots.indexOf(null);
  if(index<0 && owned.has(id)){
    const bank=bankForgeCopy(bag,id);
    if(bank)return {bag:bank,id,banked:true};
  }
  if(chestNotice)return chestNotice;
  if(index<0)return {bag:roll.useful?{...bag,lootMisses:MAX_LOOT_MISSES}:bag,id:null,quantity:0,blockedId:id,missedQuantity:1};
  const slots=bag.slots.slice();
  const forge=birthForge(id);
  slots[index]={itemId:id,quantity:1,...(forge?{forge}:{})};
  return {bag:{...bag,slots},id};
}

export function bossAccessoryReward(bag:InventorySnapshot,monsterId:string,playerLevel:number,draw=()=>randomInt(100)){
  const treasure=bossTreasure(monsterId);
  if(!treasure || playerLevel<treasure.level || draw()>=BOSS_GEAR_CHANCE)return null;
  if(gearCounts(bag).has(treasure.gear)){
    const bank=bankForgeCopy(bag,treasure.gear);
    return bank?{id:treasure.gear,bag:bank,granted:true,banked:true}:null;
  }
  const slot=bag.slots.indexOf(null);
  if(slot<0)return {id:treasure.gear,bag,granted:false};
  const slots=bag.slots.slice(),forge=birthForge(treasure.gear);
  slots[slot]={itemId:treasure.gear,quantity:1,...(forge?{forge}:{})};
  return {id:treasure.gear,bag:{...bag,slots},granted:true};
}

/** Add a single reward, preferring an existing stack. A full bag is left intact. */
export function grantStackReward(inventory: InventorySnapshot, itemId: StackableId): InventorySnapshot | null {
  const slots = inventory.slots.slice();
  let index = slots.findIndex(stack => stack?.itemId === itemId && stack.quantity < INVENTORY_STACK_LIMIT);
  if (index < 0) index = slots.indexOf(null);
  if (index < 0) return null;
  slots[index] = {itemId, quantity: (slots[index]?.quantity ?? 0) + 1};
  return {...inventory, slots};
}
export function grantRewardPotion(inventory: InventorySnapshot): InventorySnapshot | null {
  return grantStackReward(inventory, POTION_ID);
}

export function equippedWeaponId(inventory: InventorySnapshot | undefined): WeaponItemId | null {
  if (!inventory || inventory.equippedWeaponSlot === undefined ||
      inventory.equippedWeaponSlot === null) return null;
  const item = inventory.slots[inventory.equippedWeaponSlot];
  return item && isWeaponId(item.itemId) ? item.itemId : null;
}
export function equipmentRatings(bag:InventorySnapshot|undefined):Record<ForgeRating,number> {
  const total={melee:0,ranged:0,guard:0,healing:0};
  if(!bag)return total;
  const main=bag.slots[bag.equippedWeaponSlot??-1];
  if(main)applyForgeRatings(total,main.itemId,main.forge);
  for(const [slot,id] of Object.entries(bag.equipment??{}))applyForgeRatings(total,id,bag.equipmentForges?.[slot as BodySlot]);
  return total;
}
export function overflowStaminaRegen(base:CombatStats,bag:InventorySnapshot|undefined):number {
  if(!bag)return 0;
  const main=bag.slots[bag.equippedWeaponSlot??-1];
  const raw=withEquipmentStats(base,[main?.itemId,main?.socket,...Object.values(bag.equipment??{}),...Object.values(bag.equipmentSockets??{})]);
  return Math.min(2,Math.max(0,raw.maxStamina-PROGRESSION.maxStamina)/25);
}
export function gearMana(level:number,bag:InventorySnapshot|undefined){
  let raw=baseManaAtLevel(level);
  if(bag){
    const main=bag.slots[bag.equippedWeaponSlot??-1];
    for(const id of [main?.itemId,main?.socket,...Object.values(bag.equipment??{}),...Object.values(bag.equipmentSockets??{})])
      raw+=personalItem(id)?.stats.mana??0;
  }
  return {max:Math.min(PROGRESSION.maxMana,raw),restRegen:Math.min(1,Math.max(0,raw-PROGRESSION.maxMana)/30)};
}
export function gearHealing(bag:InventorySnapshot|undefined,baseHeal:number):number {
  if(!bag)return 0;
  const stats=equippedStats({atk:0,magicAtk:0,def:0,magicDef:0,maxHp:0,maxStamina:0},bag);
  return Math.min(Math.round(baseHeal*.20),Math.round(stats.magicAtk*.15+equipmentRatings(bag).healing));
}
export function spiritGearPower(bag:InventorySnapshot|undefined):number {
  if(!bag)return 0;
  const main=bag.slots[bag.equippedWeaponSlot??-1];
  const gear=withEquipmentStats({atk:0,magicAtk:0,def:0,magicDef:0,maxHp:0,maxStamina:0},[main?.itemId,main?.socket,...Object.values(bag.equipment??{}),...Object.values(bag.equipmentSockets??{})]);
  return gear.magicAtk*.20+equipmentRatings(bag).ranged*.35;
}
export function weaponBonuses(inventory: InventorySnapshot | undefined, mode: "pve" | "pvp" = "pve"):
  {melee: number; ranged: number} {
  const id = equippedWeaponId(inventory);
  const stats = id ? legacyWeaponStats(id) : null;
  const staff=usesStaff(id);
  const ratings=mode==="pve"?equipmentRatings(inventory):{melee:0,ranged:0};
  const forge = mode === "pve" && !personalItem(id) ? inventory?.slots[inventory.equippedWeaponSlot ?? -1]?.forge : undefined;
  const extra = forge?.rank ?? 0, affix = forge?.affix;
  const meleeBase = mode === "pvp" && id === SHRINE_GLAIVE ? SHRINE_RECIPE.pvpMeleeBonus : (stats?.meleeBonus ?? 0);
  return {
    melee: meleeBase + ratings.melee + (id && !staff ? extra : 0) + (affix?.stat === "melee" ? affix.tier : 0),
    ranged: (stats?.rangedBonus ?? 0) + ratings.ranged + (staff ? extra : 0) + (affix?.stat === "ranged" ? affix.tier : 0),
  };
}

/** Browser sends {slot: 0}, not item ID, quantity, HP or heal amount. */
export function parseUseItemCommand(payload: unknown): number | null {
  if (!record(payload) || Object.keys(payload).length !== 1 ||
      !Number.isSafeInteger(payload.slot)) return null;
  const slot = payload.slot as number;
  return slot >= 0 && slot < INVENTORY_SLOT_COUNT ? slot : null;
}
export function useInventoryItem(
  inventory: InventorySnapshot, slot: number, hp: number,
  maxHp: number, alive: boolean,level=1,mana=0,maxMana=0,
): ItemUseResult {
  const original = validateInventory(inventory);
  if (!alive || hp <= 0 || !Number.isFinite(hp)) {
    return { ok: false, reason: "not_alive" };
  }
  if (!Number.isFinite(maxHp) || maxHp <= 0 || hp > maxHp) {
    throw new Error("invalid_authoritative_hp");
  }
  if (!Number.isSafeInteger(slot) || slot < 0 || slot >= INVENTORY_SLOT_COUNT ||
      original.slots[slot] === null) {
    return { ok: false, reason: "item_unavailable" };
  }
  const item = original.slots[slot]!;
  const def=personalItem(item.itemId);
  if(item.itemId!==POTION_ID && def?.kind!=="consumable")return {ok:false,reason:"not_consumable"};
  if((def?.level??1)>level)return {ok:false,reason:"item_level_required"};
  if(def?.healMana && mana>=maxMana)return {ok:false,reason:"mana_full"};
  if(!def?.healMana && hp>=maxHp)return {ok:false,reason:"hp_full"};
  const healed=def?.healMana?0:Math.min(def?.healHp??POTION_HEAL,maxHp-hp);
  const restoredMana=def?.healMana?Math.min(def.healMana,maxMana-mana):0;
  const slots = original.slots.slice();
  slots[slot] = item.quantity === 1
    ? null : { itemId: item.itemId, quantity: item.quantity - 1 };
  return {
    ok: true, healed,restoredMana,hp: hp + healed, itemId: item.itemId as SalveId|BrewId|typeof POTION_ID,
    inventory: { ...original, slots },
  };
}
