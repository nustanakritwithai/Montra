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

## Unsupported features

No cooking recipes, cooking skill/EXP, recipe-learning system, cooking station
requirement, timed crafting, ST crafting cost, published quality distribution,
queue or batch-craft API exists in this repository's crafting contract. Food,
furniture and the skill/quality/time/ST/queue indicators say **เร็วๆ นี้**. No
probabilities, skill levels, timers or queue capacities are fabricated. The API
makes one item per request; there is no quantity selector or automatic repeats.
The decorative village houses and territory estate are not a player house/garden
system, so the seven house tabs and day/water/season strip are deliberately omitted.

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
