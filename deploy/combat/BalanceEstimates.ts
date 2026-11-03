import { classSkill, type WardTalentId, type BladeTalentId, type PathId } from "./CharacterBuilds.js";
import { calculateModifiedStats } from "./StatModifiers.js";
/** Deterministic arithmetic estimate, not a combat simulator or playtest. */
import { calculateStats, calculateDamage, emptyAllocations } from "./Progression.js";
import { applyBuffs } from "./Buffs.js";
import { monsterProfile } from "./MonsterProfiles.js";
import { personalItem, withEquipmentStats } from "./PersonalItems.js";
import { SHRINE_GLAIVE, SHRINE_RECIPE, WEAPON_STATS, legacyWeaponStats, type WeaponItemId } from "./ItemRules.js";
import { RULES } from "./GameRules.js";
import { FORT } from "./HeightRules.js";

export function estimateEncounter(level:number, weapon:WeaponItemId, possession:boolean) {
  if(!Number.isSafeInteger(level) || level<1 || level>100)throw new Error("invalid_estimate_level");
  if(!Object.hasOwn(WEAPON_STATS,weapon) && personalItem(weapon)?.kind!=="mainHand")throw new Error("invalid_estimate_weapon");
  if(typeof possession!=="boolean")throw new Error("invalid_estimate_buff");
  const player=applyBuffs(withEquipmentStats(calculateStats(level,emptyAllocations()),[weapon]),possession?["possession"]:[]);
  const mob=monsterProfile(level,"normal"), bonuses=legacyWeaponStats(weapon);
  // Staff fixture uses the existing ranged action; other starter weapons use melee.
  const ranged=["spirit_staff","wp_wand_1","wp_crook_1"].includes(weapon),attack=ranged?player.magicAtk+bonuses.rangedBonus:player.atk+bonuses.meleeBonus;
  const cooldownMs=ranged?FORT.rangedCooldownMs:RULES.playerAttackCooldownMs;
  const damagePerHit=calculateDamage(attack,mob.defense,mob.level), hits=Math.ceil(mob.maxHp/damagePerHit);
  const incoming=calculateDamage(mob.attack,player.def,level);
  return {level,weapon,possession,playerHp:player.maxHp,monsterHp:mob.maxHp,damagePerHit,
    dps:Number((damagePerHit*1000/cooldownMs).toFixed(2)),hitsToDefeat:hits,
    secondsBetweenFirstAndLastHit:(hits-1)*cooldownMs/1000,
    enemyDamagePerHit:incoming,enemyHitsToDown:Math.ceil(player.maxHp/incoming)};
}

/** Equal-level solo fixture at the instant the chosen class skill activates. */
export function compareBuild(level: number, weapon: WeaponItemId, path: PathId, talent?: WardTalentId | BladeTalentId) {
  const baseline = estimateEncounter(level, weapon, false);
  const base = withEquipmentStats(calculateStats(level, emptyAllocations()),[weapon]);
  const skill = classSkill(path, talent), monster = monsterProfile(level, "normal");
  const stats = skill.effect.kind === "buff"
    ? calculateModifiedStats(base, [{id: path, sourceId: "self", group: "class_skill", bonuses: skill.effect.bonuses}]) : base;
  const ranged = ["spirit_staff","wp_wand_1","wp_crook_1"].includes(weapon);
  const power = ranged ? stats.magicAtk + legacyWeaponStats(weapon).rangedBonus : stats.atk + legacyWeaponStats(weapon).meleeBonus;
  const pveHit = calculateDamage(power, monster.defense, level);
  const pvpPower = weapon === SHRINE_GLAIVE ? stats.atk + SHRINE_RECIPE.pvpMeleeBonus : power;
  const pvpHit = calculateDamage(pvpPower, ranged ? base.magicDef : base.def, level);
  return {path, weapon, level, supportRadius: skill.radius, pveHitBeforeCast: baseline.damagePerHit, pveHitWhileActive: pveHit,
    pvpHitAgainstUnbuffedPeer: pvpHit, hitsToDefeatIfEffectLasted: Math.ceil(monster.maxHp / pveHit),
    incomingPhysicalDamage: calculateDamage(monster.attack, stats.def, level),
    healPerInjuredMember: skill.effect.kind === "heal" ? Math.round(stats.maxHp * skill.effect.fraction) : 0,
    durationSeconds: skill.effect.kind === "buff" ? skill.effect.durationMs / 1000 : 0,
    cooldownSeconds: skill.cooldownMs / 1000, stamina: skill.stamina};
}
