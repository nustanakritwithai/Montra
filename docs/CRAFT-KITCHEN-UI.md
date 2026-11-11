# งานช่างและครัว

Client-only redesign of the existing artisan crafting drawer. The dark green/gold
panel has six recipe cards per page, category controls, recipe detail, material
cards and a single-item craft action. Native selects and all original crafting
IDs remain available. It is not a new economy or a database migration.

## Authoritative data and behavior

- Recipes, icons, stats, HP/MP recovery, level requirements and gold costs come
  from the received `personalItems` catalog (`item_catalog_page`), with the
  existing `workbenchGold` fallback. Counts use the current inventory snapshot;
  ingredient requirements count carried stacks, not forge stock or worn gear.
- The top-right level is explicitly the **character** level, not a cooking skill.
- A lock means the real character-level requirement is unmet. This server has
  no recipe-learning state, so the UI never claims a recipe is unlearned.
- Weapon, armor/accessory, consumable medicine, material, role, kiln and boss
  filters operate on real catalog entries. Potion recovery displays the server's
  `healHp` / `healMana`, not a reference-image percentage.
- The existing `craft_weapon` command sends exactly `recipeId` and `requestId`.
  Existing revalidation, mutation pending lock, result/error handling, inventory
  refreshes, shrine recipe and nested ingredient/back navigation remain intact.
- Material tracking uses the existing hunt buttons; it is not a new source list.

## Cooking

The catalog advertises the required cooking level and food and water restoration.
Herbal fish soup starts at level 1, grilled fish unlocks at level 2, and spirit
stew unlocks at level 3. The advanced recipes require a placed home kitchen.
Each successful serving grants one cooking XP. Levels 2 and 3 start at 5 and
15 XP respectively.

## Batch crafting

Choose up to ten items in the recipe dialog. The cost and required
materials update with the quantity. The server commits all outputs together.

## Timed crafting queue

`economy_state` advertises `craftQueueMax` (3 jobs per character, including
unclaimed jobs) and `craftQueueMsPerItem` (5000 ms). Jobs run in order, at
five seconds per item. Time continues while the player is offline.

- Send `get_craft_queue` with an empty object to receive `craft_queue` with
  `serverNow` and `jobs`. Each job has `id`, `recipeId`, `quantity`,
  `spentGold`, `startsAt`, `readyAt` and a status of `queued`,
  `crafting` or `ready`. All times are Unix milliseconds.
- Send `craft_enqueue` with the same recipe, quantity and request ID fields
  as `craft_weapon`. The server charges and saves the job together. The reply
  is `craft_queue` with `requestId` and `jobId`.
- Send `craft_claim` with `{jobId, requestId}` after the deadline. The
  `craft_queue` reply includes `requestId` and
  `claimed: {jobId, itemId, quantity, bankedQuantity}`. An inventory error
  leaves the whole job ready to retry after freeing space. Reusing the same
  request ID and payload returns the same job or claim receipt after restart.

Before rolling back to a build without these commands, finish and claim queued
jobs or retain a build that can deliver them. Paid jobs and inventory live in
the same SQLite database.

The crafting page shows the queue and enables the claim button when a job finishes.

## Private home and garden

Send `get_home` with an empty object to receive the active character's
`home_state` with ownership level, interior width, grid stride, furniture,
garden plots and cooking state. Open **เรือนส่วนตัว** from the player menu.
Buy and enter from a rest area in the ritual village. The server places each
owner in a separate map, saves their location, and hides other players in
that map. The return button leads back to the village.

The client advertises `homeVersion: 1` at join. It builds the private scene
from `worldDefinition.homeMap`, which is a shared geometry template rather
than a public destination. `enter_home` and `leave_home` accept empty objects
and use the standard warp confirmation. The server derives the destination
from the active character. Clients without that capability resume in the village.

Send `home_action` with `requestId` and one action. The reply is the latest
`home_state` with that request ID. Upgrade, furniture and garden actions require the owner
to be inside their home. Furniture crafting and advanced cooking also require
the home map.

- `buy` costs 100 gold and grants a 4×4 interior and two garden plots.
  `upgrade` costs 200 gold and expands the interior to 8×8 with four plots.
- `place` accepts `itemId` and `cell`. `move` accepts `from` and `cell`.
  `remove` accepts `cell` and returns the item to inventory. Cell numbers
  use a fixed stride of 8 at both house levels. The server rejects collisions.
- Craft plank floor, wood wall and doorway in the home. In the placement
  grid, choose **พื้น** or **ผนังและประตู**. Floors are a separate layer
  and can sit under furniture. A doorway is passable, while a wall blocks
  walking. Rotate a wall or doorway from its occupied cell.
- The `parts` array contains `cell`, `layer`, `itemId` and `rotation`.
  `place_part` accepts `itemId`, `cell` and `rotation`.
  `move_part` accepts `layer`, `from`, `cell` and `rotation`; the
  source and target may be the same cell for rotation. `remove_part`
  accepts `layer` and `cell`. Rotation is 0 for horizontal or 1 for vertical.
  The server sends the grid geometry in `worldDefinition.homeMap.buildGrid`.
- `plant`, `water` and `harvest` accept `plot`. Planting uses one tier-one
  herb. Watering uses one clean water and sets `readyAt` to two minutes
  later. Harvesting returns three herbs. A full bag preserves the harvest.

## Hunger and thirst

Send `get_needs` to read `needs_state`, which includes current food and
water, maximum 100, server time and depletion times. Food falls one point
per four minutes. Water falls one point per two minutes. Both continue
while the character is offline. If either meter is empty, stamina recovery
is 60% of its usual rate. Empty meters cause no HP loss.

`collect_water` accepts `{requestId}` while grounded within six units of
the ritual village plaza at (0, 0). It grants one clean water and replies
with `water_collected`. The collection cooldown is 15 seconds per
character. Use food and water with the normal `use_item` slot command.
The server persists the item, HP or mana recovery and both meters together.

## Client controls

The private home menu contains the furniture grid, garden actions, recipes,
hunger and thirst, and the return button. The live scene shows the furniture
and crops after server confirmation. The Food and Furniture tabs open this
menu on supported servers. A placed kitchen unlocks advanced station recipes
once the character reaches the required cooking level.

Back up character and economy data before releasing the recipe. Once an item is
crafted, a rollback build must also recognize its item ID in saved inventory.

## Verification

Run `npm run build:client` and `npm run build:styles` after editing fragments.
`main.js` is generated and ignored; `styles.css` remains checked in. The explicit
client/style baseline revisions describe this intentional visual/behavior change.

- `npm run test:client` includes `craft-kitchen-ui-test.cjs` (seven new regression
  groups) and the previous crafting/wallet tests with their real UI DOM fixtures.
- `npm run test:build`, `npm run build`, `npm run test:client-boundaries`
- `npm run prepare:combat`, then `cd combat-verify && npx tsc --noEmit`
- `node scripts/check-contract.mjs`

Local screenshot evidence is kept outside the repository in
`/workspace/craft-evidence/`. All `harness-*.png` images run real UI functions and
an exported real server catalog, but **mock character, wallet and inventory
state**. They are not logged-in client/gameplay evidence. No shared test server
restart, VPS/live access, real saves or test database changes are needed.
