import type { CharacterSnapshot } from "./CharacterStore.js";
import { PATHS, parseBuild, type PathId } from "./CharacterBuilds.js";
import { equipBody, validateInventory } from "./ItemRules.js";
import { isBodySlot, personalItem } from "./PersonalItems.js";
import { emptyAllocations, PROGRESSION } from "./Progression.js";
import { newRebirthState, startNextLife } from "./Rebirth.js";

/** Prepare one atomic save; the caller must lock mutations and commit before applying. */
export function prepareRebirth(snapshot: CharacterSnapshot, path: PathId): CharacterSnapshot {
  if (!snapshot.build || !Object.hasOwn(PATHS,path)) throw Error("invalid_rebirth_class");
  if (!snapshot.inventory) throw Error("rebirth_inventory_unavailable");
  const build=path===snapshot.build.path ? snapshot.build : parseBuild({path,ancestry:snapshot.build.ancestry});
  if (!build) throw Error("invalid_rebirth_class");
  const rebirth=startNextLife(snapshot.rebirth ?? newRebirthState(),snapshot.build.path,snapshot.level);
  let inventory=validateInventory(snapshot.inventory);
  const weaponSlot=inventory.equippedWeaponSlot;
  const weapon=weaponSlot!=null?personalItem(inventory.slots[weaponSlot]?.itemId):undefined;
  if(path!==snapshot.build.path || (weapon?.level??1)>1){
    inventory={...inventory,equippedWeaponSlot:null};
  }
  for(const [position,item] of Object.entries(inventory.equipment??{})){
    const definition=personalItem(item);
    if(!isBodySlot(position) || !definition)throw Error("rebirth_inventory_invalid");
    if((definition.level??1)<=1 && (definition.path==="all" || definition.path===path))continue;
    const result=equipBody(inventory,position,null,item,path,snapshot.level);
    if(result.ok===false)throw Error(result.reason==="inventory_full"?"rebirth_inventory_full":"rebirth_inventory_invalid");
    inventory=result.inventory;
  }
  return {...snapshot,level:1,experience:0,build,rebirth,inventory,statAllocations:emptyAllocations(),
    masteryVitals:{version:1,hpRemainder:0,pvpUntil:0},hp:PROGRESSION.baseHp,stamina:PROGRESSION.baseStamina,mana:PROGRESSION.baseMana,updatedAt:new Date().toISOString()};
}
