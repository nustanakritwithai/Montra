# Early hunt and material guidance

## Requested behavior

The early journey alternates equipment preparation and EXP farming. Before the
Lv10 weapon route (including ภูตทวารบาล at `temple_forecourt_3`), it shows a
leveling-to-10 goal. Reaching the level resumes the equipment/material goal.
This is guidance only: warp/combat permissions, rewards, drop rates and saves
are unchanged. Explicit NPC objectives still have their existing priority.

## Authoritative sources

- `GearGuides.ts` builds ordinary early camps from `MonsterLoot.hunts`, using only
  open spawns at or below the player's level and no more than four levels below.
  It no longer suggests the hardcoded Lv15 temple practice target to Lv1–14.
- Catalog hunt targets include their existing level, map name and camp members.
  No new item or drop source is introduced. In mixed-level camps the client
  chooses an eligible living monster, or waits at an eligible respawning one.
- Equipment guidance follows the first missing recipe input, including kiln
  ingredients and materials reserved directly by the equipment recipe. A material
  receipt advances to the next missing supply; it does not keep sending players
  to the weapon's default drop camp. Starter-copy guidance persists across maps.
- Resource destinations match `WorldResources`: camp nodes use the first spawn's
  material tier. Forest camps starting below Lv10 have tier1 nodes even when
  their later monsters are Lv10–12, so the guide must not send a tier2 search there.
- Crafting a spare changes the starter step to forging. Crafting the target gear
  changes it to equipping. Equipping/skipping a gear goal returns to leveling.
  Existing training and optional boss choices remain available.

## Exact Lv10 case

Sword, blade and sentinel weapon routes name the Lv10 temple guardian, but their
recipes also require an ingot. The ingot needs additional metal and charcoal,
which needs raw wood. Blade additionally needs hides from the marsh. The guide
now walks those supplies rather than treating repeated guardian kills as the
whole recipe. Tests use the actual catalog, maps, resource nodes and all six
class guides, not an invented drop table.

## Local checks

Node 22.23.4: all 62 client fixtures plus 3 syntax checks, 26 deterministic build
checks, all 29 gear-progression tests, fragment boundaries and contract baseline
passed before integration. The focused actual-catalog regression covers every
class at levels 1–9 and its complete Lv10 recipe. Synthetic client coverage adds
cross-map continuity, inventory-triggered destination changes, EXP progress,
respawn, pinned targets and old-server fallback.

Browser QA was attempted with isolated synthetic state and external requests
blocked, but Chromium could not launch because the execution environment denied
its singleton socket. This is not a browser pass. Candidate CI, integrated
review and deployment verification remain release gates.
