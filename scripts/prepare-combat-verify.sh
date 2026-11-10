#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/build-client.mjs --prepare
# Generated sandbox only; never points at the VPS or existing player files.
rm -rf combat-verify/src
mkdir -p combat-verify/src/rooms/schema
cp deploy/combat/MyRoom.ts deploy/combat/LegacyGhostPot.ts combat-verify/src/rooms/
cp deploy/combat/ghost-pot-integration.mjs combat-verify/
cp deploy/combat/SkillHotbar.ts deploy/combat/skill-hotbar.test.ts deploy/combat/skill-hotbar-disabled.test.ts deploy/combat/rebirth-hotbar-room.test.ts combat-verify/src/rooms/
cp deploy/combat/mixed-hotbar-integration.mjs combat-verify/
cp deploy/combat/AccountStore.ts deploy/combat/AccountService.ts deploy/combat/AccountRoutes.ts deploy/combat/account-store.test.ts combat-verify/src/rooms/
cp deploy/combat/account-integration.mjs combat-verify/account-integration.mjs
cp deploy/combat/hunting-rebirth-integration.mjs deploy/combat/mastery-save-integration.mjs combat-verify/
cp deploy/combat/learned-hotbar-integration.mjs deploy/combat/personal-equipment-integration.mjs combat-verify/
cp deploy/combat/guest-delete-integration.mjs combat-verify/guest-delete-integration.mjs
cp deploy/combat/mount-integration.mjs combat-verify/mount-integration.mjs
cp deploy/combat/gear-look-integration.mjs combat-verify/gear-look-integration.mjs
cp deploy/combat/MyRoomState.ts combat-verify/src/rooms/schema/MyRoomState.ts
cp deploy/combat/GameRules.ts combat-verify/src/rooms/GameRules.ts
cp deploy/combat/DashRules.ts combat-verify/src/rooms/DashRules.ts
cp deploy/combat/dash-rules.test.ts combat-verify/src/rooms/dash-rules.test.ts
cp deploy/combat/HeightRules.ts combat-verify/src/rooms/HeightRules.ts
cp deploy/combat/TempleMap.ts combat-verify/src/rooms/TempleMap.ts
cp deploy/combat/AtlasRelief.ts combat-verify/src/rooms/AtlasRelief.ts
cp deploy/combat/original-relief.test.ts combat-verify/src/rooms/original-relief.test.ts
cp deploy/combat/original-relief-integration.mjs combat-verify/original-relief-integration.mjs
cp deploy/combat/atlas-relief.test.ts combat-verify/src/rooms/atlas-relief.test.ts
cp deploy/combat/atlas-relief-integration.mjs combat-verify/atlas-relief-integration.mjs
cp deploy/combat/GroundTerrain.ts combat-verify/src/rooms/GroundTerrain.ts
cp deploy/combat/terrain.test.ts combat-verify/src/rooms/terrain.test.ts
cp deploy/combat/terrain-integration.mjs combat-verify/terrain-integration.mjs
cp deploy/combat/RiverCity.ts combat-verify/src/rooms/RiverCity.ts
cp deploy/combat/river-city.test.ts combat-verify/src/rooms/river-city.test.ts
cp deploy/combat/river-city-integration.mjs combat-verify/river-city-integration.mjs
cp deploy/combat/CastlePilot.ts combat-verify/src/rooms/CastlePilot.ts
cp deploy/combat/castle-pilot.test.ts combat-verify/src/rooms/castle-pilot.test.ts
cp deploy/combat/castle-pilot-integration.mjs combat-verify/castle-pilot-integration.mjs
cp deploy/combat/StrategicProvinces.ts combat-verify/src/rooms/StrategicProvinces.ts
cp deploy/combat/WorldAtlas.ts combat-verify/src/rooms/WorldAtlas.ts
cp deploy/combat/RegionalBosses.ts combat-verify/src/rooms/RegionalBosses.ts
cp deploy/combat/world-atlas.test.ts combat-verify/src/rooms/world-atlas.test.ts
cp deploy/combat/world-atlas-integration.mjs combat-verify/world-atlas-integration.mjs
cp deploy/combat/world-capacity-integration.mjs combat-verify/world-capacity-integration.mjs
cp deploy/combat/WorldMaps.ts combat-verify/src/rooms/WorldMaps.ts
cp deploy/combat/ForestEncounters.ts combat-verify/src/rooms/ForestEncounters.ts
cp deploy/combat/temple-map.test.ts combat-verify/src/rooms/temple-map.test.ts
cp deploy/combat/temple-integration.mjs combat-verify/temple-integration.mjs
cp deploy/combat/map-expansion.test.ts combat-verify/src/rooms/map-expansion.test.ts
cp deploy/combat/map-expansion-integration.mjs combat-verify/map-expansion-integration.mjs
cp deploy/combat/WarpRules.ts combat-verify/src/rooms/WarpRules.ts
cp deploy/combat/ChatRules.ts combat-verify/src/rooms/ChatRules.ts
cp deploy/combat/BugReports.ts combat-verify/src/rooms/BugReports.ts
cp deploy/combat/private-chat-integration.mjs combat-verify/private-chat-integration.mjs
cp deploy/combat/chat-rules.test.ts combat-verify/src/rooms/chat-rules.test.ts
cp deploy/combat/Progression.ts combat-verify/src/rooms/Progression.ts
cp deploy/combat/Buffs.ts combat-verify/src/rooms/Buffs.ts
cp deploy/combat/StatModifiers.ts combat-verify/src/rooms/StatModifiers.ts
cp deploy/combat/SkillCatalog.ts combat-verify/src/rooms/SkillCatalog.ts
cp deploy/combat/ForgeRules.ts combat-verify/src/rooms/ForgeRules.ts
cp deploy/combat/forge.test.ts combat-verify/src/rooms/forge.test.ts
cp deploy/combat/CharacterBuilds.ts combat-verify/src/rooms/CharacterBuilds.ts
cp deploy/combat/MuayRules.ts combat-verify/src/rooms/MuayRules.ts
cp deploy/combat/OccultRules.ts combat-verify/src/rooms/OccultRules.ts
cp deploy/combat/BladeRules.ts combat-verify/src/rooms/BladeRules.ts
cp deploy/combat/SentinelRules.ts combat-verify/src/rooms/SentinelRules.ts
cp deploy/combat/sentinel-rules.test.ts combat-verify/src/rooms/sentinel-rules.test.ts
cp deploy/combat/sentinel-integration.mjs combat-verify/sentinel-integration.mjs
cp deploy/combat/blade-rules.test.ts combat-verify/src/rooms/blade-rules.test.ts
cp deploy/combat/blade-book-integration.mjs combat-verify/blade-book-integration.mjs
cp deploy/combat/blade-depth-integration.mjs combat-verify/blade-depth-integration.mjs
cp deploy/combat/blade-core-check.mjs combat-verify/blade-core-check.mjs
cp deploy/combat/class-rank-integration.mjs combat-verify/class-rank-integration.mjs
cp deploy/combat/skill-learning-integration.mjs combat-verify/skill-learning-integration.mjs
cp deploy/combat/class-skills-contract-integration.mjs combat-verify/class-skills-contract-integration.mjs
cp deploy/combat/status-support-integration.mjs combat-verify/status-support-integration.mjs
cp deploy/combat/skill-ranks.test.ts combat-verify/src/rooms/skill-ranks.test.ts
cp deploy/combat/advanced-class-integration.mjs combat-verify/advanced-class-integration.mjs
cp deploy/combat/advanced-lessons.test.ts combat-verify/src/rooms/advanced-lessons.test.ts
cp deploy/combat/blade-advanced-integration.mjs combat-verify/blade-advanced-integration.mjs
cp deploy/combat/auto-attack.test.mjs combat-verify/auto-attack.test.mjs
cp deploy/combat/occult-rules.test.ts combat-verify/src/rooms/occult-rules.test.ts
cp deploy/combat/occult-integration.mjs combat-verify/occult-integration.mjs
cp deploy/combat/class-balance-integration.mjs combat-verify/class-balance-integration.mjs
cp deploy/combat/occult-depth-integration.mjs combat-verify/occult-depth-integration.mjs
cp deploy/combat/muay-combo.test.ts combat-verify/src/rooms/muay-combo.test.ts
cp deploy/combat/muay-mastery.test.ts combat-verify/src/rooms/muay-mastery.test.ts
cp deploy/combat/muay-integration.mjs combat-verify/muay-integration.mjs
cp deploy/combat/muay-book-integration.mjs combat-verify/muay-book-integration.mjs
cp deploy/combat/muay-schools-integration.mjs combat-verify/muay-schools-integration.mjs
cp deploy/combat/muay-combo-integration.mjs combat-verify/muay-combo-integration.mjs
cp deploy/combat/muay-pvp-integration.mjs combat-verify/muay-pvp-integration.mjs
cp deploy/combat/muay-grapple-integration.mjs combat-verify/muay-grapple-integration.mjs
cp deploy/combat/muay-followup-integration.mjs combat-verify/muay-followup-integration.mjs
cp deploy/combat/muay-defense-integration.mjs combat-verify/muay-defense-integration.mjs
cp deploy/combat/muay-schools-depth-integration.mjs combat-verify/muay-schools-depth-integration.mjs
cp deploy/combat/muay-grapple-response-integration.mjs combat-verify/muay-grapple-response-integration.mjs
cp deploy/combat/muay-mastery-integration.mjs combat-verify/muay-mastery-integration.mjs
cp deploy/combat/muay-territory-integration.mjs combat-verify/muay-territory-integration.mjs
cp deploy/combat/build-integration.mjs combat-verify/build-integration.mjs
cp deploy/combat/ward-integration.mjs combat-verify/ward-integration.mjs
cp deploy/combat/blade-integration.mjs combat-verify/blade-integration.mjs
cp deploy/combat/ritual-skills-integration.mjs combat-verify/ritual-skills-integration.mjs
cp deploy/combat/phutthaisawan-integration.mjs combat-verify/phutthaisawan-integration.mjs
cp deploy/combat/sword-tree-integration.mjs combat-verify/sword-tree-integration.mjs
cp deploy/combat/sword-tree-combat-integration.mjs combat-verify/sword-tree-combat-integration.mjs
cp deploy/combat/sword-tree-party-integration.mjs combat-verify/sword-tree-party-integration.mjs
cp deploy/combat/sword-tree-area-integration.mjs combat-verify/sword-tree-area-integration.mjs
cp deploy/combat/sword-tree-pvp-integration.mjs combat-verify/sword-tree-pvp-integration.mjs
cp deploy/combat/BuffLedger.ts combat-verify/src/rooms/BuffLedger.ts
cp deploy/combat/stat-modifiers.test.ts combat-verify/src/rooms/stat-modifiers.test.ts
cp deploy/combat/buff-ledger.test.ts combat-verify/src/rooms/buff-ledger.test.ts
cp deploy/combat/BalanceEstimates.ts combat-verify/src/rooms/BalanceEstimates.ts
cp deploy/combat/balance-estimates.test.ts combat-verify/src/rooms/balance-estimates.test.ts
cp deploy/combat/buffs.test.ts combat-verify/src/rooms/buffs.test.ts
cp deploy/combat/buff-integration.mjs combat-verify/buff-integration.mjs
cp deploy/combat/MonsterProfiles.ts combat-verify/src/rooms/MonsterProfiles.ts
cp deploy/combat/PartyMonsterRewards.ts combat-verify/src/rooms/PartyMonsterRewards.ts
cp deploy/combat/monster-profiles.test.ts combat-verify/src/rooms/monster-profiles.test.ts
cp deploy/combat/party-monster-rewards.test.ts combat-verify/src/rooms/party-monster-rewards.test.ts
cp deploy/combat/forest-monster-config.test.ts combat-verify/src/rooms/forest-monster-config.test.ts
cp deploy/combat/forest-guardian-integration.mjs combat-verify/forest-guardian-integration.mjs
cp deploy/combat/forest-party-monster-integration.mjs combat-verify/forest-party-monster-integration.mjs
cp deploy/combat/TerritoryGovernment.ts combat-verify/src/rooms/TerritoryGovernment.ts
cp deploy/combat/TerritoryWar.ts deploy/combat/WarSchedule.ts deploy/combat/WarRoutes.ts deploy/combat/WarMapProfiles.ts combat-verify/src/rooms/
cp deploy/combat/territory-war.test.ts deploy/combat/territory-gate-room.test.ts deploy/combat/scheduled-city-war.test.ts deploy/combat/all-map-war.test.ts combat-verify/src/rooms/
cp deploy/combat/war-entry-check.mjs combat-verify/war-entry-check.mjs
cp deploy/combat/forest-objective-check.mjs combat-verify/forest-objective-check.mjs
cp deploy/combat/service-npcs-check.mjs combat-verify/service-npcs-check.mjs
cp deploy/combat/territory-government.test.ts combat-verify/src/rooms/territory-government.test.ts
cp deploy/combat/territory-integration.mjs combat-verify/territory-integration.mjs
cp deploy/combat/province-fronts-integration.mjs combat-verify/province-fronts-integration.mjs
cp deploy/combat/GuildStore.ts combat-verify/src/rooms/GuildStore.ts
cp deploy/combat/guild-store.test.ts combat-verify/src/rooms/guild-store.test.ts
cp deploy/combat/guild-integration.mjs combat-verify/guild-integration.mjs
cp deploy/combat/PartyManager.ts combat-verify/src/rooms/PartyManager.ts
cp deploy/combat/party-manager.test.ts combat-verify/src/rooms/party-manager.test.ts
cp deploy/combat/party-experience.test.ts combat-verify/src/rooms/party-experience.test.ts
cp deploy/combat/party-integration.mjs combat-verify/party-integration.mjs
cp deploy/combat/EconomyStore.ts combat-verify/src/rooms/EconomyStore.ts
cp deploy/combat/CityProduction.ts deploy/combat/CityProductionRules.ts deploy/combat/city-production.test.ts combat-verify/src/rooms/
cp deploy/combat/Fishing.ts deploy/combat/fishing.test.ts combat-verify/src/rooms/
cp deploy/combat/central-market.test.ts combat-verify/src/rooms/central-market.test.ts
cp deploy/combat/central-market-integration.mjs combat-verify/central-market-integration.mjs
cp deploy/combat/EconomyRules.ts combat-verify/src/rooms/EconomyRules.ts
cp deploy/combat/economy-store.test.ts combat-verify/src/rooms/economy-store.test.ts
cp deploy/combat/economy-migration.test.ts combat-verify/src/rooms/economy-migration.test.ts
cp deploy/combat/economy-integration.mjs deploy/combat/lifestyle-integration.mjs combat-verify/
cp deploy/combat/progression.test.ts combat-verify/src/rooms/progression.test.ts
cp deploy/combat/progression-transaction.test.ts combat-verify/src/rooms/progression-transaction.test.ts
cp deploy/combat/world-warp-rules.test.ts combat-verify/src/rooms/world-warp-rules.test.ts
cp deploy/combat/MonsterRRT.ts combat-verify/src/rooms/MonsterRRT.ts
cp deploy/combat/CharacterStore.ts combat-verify/src/rooms/CharacterStore.ts
cp deploy/combat/Rebirth.ts combat-verify/src/rooms/Rebirth.ts
cp deploy/combat/RebirthCombat.ts deploy/combat/rebirth-combat.test.ts deploy/combat/mastery-runtime.test.ts combat-verify/src/rooms/
cp deploy/combat/RebirthTransition.ts combat-verify/src/rooms/RebirthTransition.ts
cp deploy/combat/ForestObjectives.ts combat-verify/src/rooms/ForestObjectives.ts
cp deploy/combat/WorldDirector.ts combat-verify/src/rooms/WorldDirector.ts
cp deploy/combat/DynamicBalance.ts deploy/combat/HuntEvents.ts deploy/combat/HuntEventStore.ts deploy/combat/HuntEventPage.ts deploy/combat/HuntEventRoutes.ts deploy/combat/hunt-events.test.ts combat-verify/src/rooms/
cp deploy/combat/TyphoonGuide.ts combat-verify/src/rooms/TyphoonGuide.ts
cp deploy/combat/QuestAdvisor.ts combat-verify/src/rooms/QuestAdvisor.ts
cp deploy/combat/GuideAnswers.ts combat-verify/src/rooms/GuideAnswers.ts
cp deploy/combat/typhoon-guide.test.ts combat-verify/src/rooms/typhoon-guide.test.ts
cp deploy/combat/npc-guide-room.test.ts combat-verify/src/rooms/npc-guide-room.test.ts
cp deploy/combat/world-director.test.ts combat-verify/src/rooms/world-director.test.ts
cp deploy/combat/director-reward.test.ts combat-verify/src/rooms/director-reward.test.ts
cp deploy/combat/director-accept.test.ts combat-verify/src/rooms/director-accept.test.ts
cp deploy/combat/director-deadline.test.ts combat-verify/src/rooms/director-deadline.test.ts
cp deploy/combat/ServiceNpcs.ts combat-verify/src/rooms/ServiceNpcs.ts
cp deploy/combat/forest-objectives.test.ts combat-verify/src/rooms/forest-objectives.test.ts
cp deploy/combat/quest-guidance-room.test.ts deploy/combat/quest-kill-progress-room.test.ts combat-verify/src/rooms/
cp deploy/combat/rebirth.test.ts combat-verify/src/rooms/rebirth.test.ts
cp deploy/combat/PersonalItems.ts combat-verify/src/rooms/PersonalItems.ts
cp deploy/combat/MonsterLoot.ts combat-verify/src/rooms/MonsterLoot.ts
cp deploy/combat/gear-progression.test.ts combat-verify/src/rooms/gear-progression.test.ts
cp deploy/combat/CardSockets.ts combat-verify/src/rooms/CardSockets.ts
cp deploy/combat/GearGuides.ts combat-verify/src/rooms/GearGuides.ts
cp deploy/combat/WorldResources.ts combat-verify/src/rooms/WorldResources.ts
cp deploy/combat/SceneryNodes.ts combat-verify/src/rooms/SceneryNodes.ts
cp deploy/combat/resource-gathering.test.ts combat-verify/src/rooms/resource-gathering.test.ts
cp deploy/combat/resource-gathering-integration.mjs combat-verify/resource-gathering-integration.mjs
cp deploy/combat/ItemRules.ts combat-verify/src/rooms/ItemRules.ts
cp deploy/combat/item-rules.test.ts combat-verify/src/rooms/item-rules.test.ts
cp deploy/combat/height-rules.test.ts combat-verify/src/rooms/height-rules.test.ts
cp deploy/combat/monster-rrt.test.ts combat-verify/src/rooms/monster-rrt.test.ts
cp deploy/combat/character-store.test.ts combat-verify/src/rooms/character-store.test.ts
cp deploy/combat/skill-learning-location.test.ts combat-verify/src/rooms/
cp deploy/combat/sword-tree-concurrency.test.ts combat-verify/src/rooms/sword-tree-concurrency.test.ts
cp deploy/combat/sword-gap-geometry.test.ts combat-verify/src/rooms/sword-gap-geometry.test.ts
cp deploy/combat/smoke-test.mjs combat-verify/smoke-test.mjs
cp deploy/combat/s1-integration.mjs combat-verify/s1-integration.mjs
cp deploy/combat/s1-monster-ai.mjs combat-verify/s1-monster-ai.mjs
cp deploy/combat/monster-rrt-integration.mjs combat-verify/monster-rrt-integration.mjs
cp deploy/combat/dash-integration.mjs combat-verify/dash-integration.mjs
cp deploy/combat/flight-integration.mjs combat-verify/flight-integration.mjs
cp deploy/combat/weapon-integration.mjs combat-verify/weapon-integration.mjs
cp deploy/combat/world-warp-integration.mjs combat-verify/world-warp-integration.mjs
cp deploy/combat/chat-integration.mjs combat-verify/chat-integration.mjs
cp deploy/combat/progression-integration.mjs combat-verify/progression-integration.mjs
cp deploy/combat/character-persistence-integration.mjs combat-verify/character-persistence-integration.mjs
cp deploy/combat/free-pk-integration.mjs combat-verify/free-pk-integration.mjs
cp deploy/combat/summon-integration.mjs combat-verify/summon-integration.mjs
cp deploy/combat/elevation-integration.mjs combat-verify/elevation-integration.mjs
cp deploy/combat/s1-rules.test.ts combat-verify/src/rooms/s1-rules.test.ts
cat > combat-verify/src/index.ts <<'EOF'
import { defineServer, defineRoom } from "colyseus";
import { MyRoom } from "./rooms/MyRoom.js";
import { installAccountRoutes } from "./rooms/AccountRoutes.js";
export const server = defineServer({ rooms: { my_room: defineRoom(MyRoom) }, express: app => installAccountRoutes(app) });
export const ready = server.listen(Number(process.env.PORT || 4108));
EOF
cp deploy/combat/verify/package.json deploy/combat/verify/package-lock.json deploy/combat/verify/tsconfig.json combat-verify/
