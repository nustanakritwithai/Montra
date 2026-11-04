import type { CharacterSnapshot } from "./CharacterStore.js";
import { PATHS, parseBuild, type PathId } from "./CharacterBuilds.js";
import { equipBody, validateInventory } from "./ItemRules.js";
import { isBodySlot, personalItem, startingWeapon } from "./PersonalItems.js";
import { emptyAllocations, PROGRESSION } from "./Progression.js";
import { newRebirthState, startNextLife } from "./Rebirth.js";
import { forgeStamp } from "./ForgeRules.js";

/** Prepare one atomic save; the caller must lock mutations and commit before applying. */
export function prepareRebirth(snapshot: CharacterSnapshot, path: PathId): CharacterSnapshot {
  if (!snapshot.build || !Object.hasOwn(PATHS,path)) throw Error("invalid_rebirth_class");
  if (!snapshot.inventory) throw Error("rebirth_inventory_unavailable");
  const build=path===snapshot.build.path ? snapshot.build : parseBuild({path,ancestry:snapshot.build.ancestry});
  if (!build) throw Error("invalid_rebirth_class");
  const rebirth=startNextLife(snapshot.rebirth ?? newRebirthState(),snapshot.build.path,snapshot.level);
  let inventory=validateInventory(snapshot.inventory);
  {
    // Weapons already occupy a bag cell, so deselecting cannot lose one.
    const weapon=inventory.slots[inventory.equippedWeaponSlot ?? -1];
    const weaponDefinition=weapon && personalItem(weapon.itemId);
    if (weapon && (path!==snapshot.build.path || (weaponDefinition?.level ?? 1)>1))
      inventory={...inventory,equippedWeaponSlot:null};
    for (const [position,item] of Object.entries(inventory.equipment ?? {})) {
      const definition=personalItem(item);
      if (!definition) throw Error("rebirth_inventory_invalid");
      if ((definition.path==="all" || definition.path===path) && (definition.level ?? 1)<=1) continue;
      if (!isBodySlot(position)) throw Error("rebirth_inventory_invalid");
      const result=equipBody(inventory,position,null,item,path,snapshot.level,forgeStamp({itemId:item,forge:inventory.equipmentForges?.[position]}));
      if (result.ok === false) throw Error(result.reason==="inventory_full" ? "rebirth_inventory_full" : "rebirth_inventory_invalid");
      inventory=result.inventory;
    }
    if(inventory.equippedWeaponSlot===null){
      const starter=startingWeapon(path),slots=inventory.slots.slice();
      let slot=slots.findIndex(item=>item?.itemId===starter);
      if(slot<0){
        slot=slots.findIndex(item=>item===null);
        if(slot<0)throw Error("rebirth_inventory_full");
        slots[slot]={itemId:starter,quantity:1,bound:true};
      }
      inventory=validateInventory({...inventory,slots,equippedWeaponSlot:slot});
    }
  }
  return {...snapshot,level:1,experience:0,build,rebirth,inventory,
    ...(path==="muay_boran"?{muayWrapGranted:true}:{}),statAllocations:emptyAllocations(),
    hp:PROGRESSION.baseHp,stamina:PROGRESSION.baseStamina,mana:PROGRESSION.baseMana,updatedAt:new Date().toISOString()};
}
