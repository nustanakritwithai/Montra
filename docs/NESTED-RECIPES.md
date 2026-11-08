# Nested recipe browsing

The existing crafting page now shows **สร้างจาก** (created from) and **กลายเป็น** (used for) diagrams. Tap an ingredient/output picture to inspect that item. Back and return-to-selected-recipe controls preserve the original craft selection. Repeated/cyclic navigation is bounded; materials without recipes have an explicit empty state. Large used-for lists show six recipes per page.

The graph reads the existing server item catalog only:
- `recipe` describes existing workbench/kiln inputs and a one-item output.
- `refinesTo` and the server's `refineInput` describe existing bag refinement. Legacy catalyst conversion retains its one-to-two rule.

Browsing sends no crafting/refining command. The original craft controls are hidden and their stale handler is blocked while inspecting another item. **เปิดสูตรนี้เพื่อสร้าง** explicitly selects an existing recipe; the existing server-validated craft button still performs the action. Refinement stays in the bag. No costs, materials, rewards, queues, quality chances or server/save schema change.

Live inventory polling updates counts without replacing focused ingredient buttons. Catalog/room changes, manual filters and reopening clear obsolete navigation.

Verification:
- `npm run test:client`, `npm run test:build`, `npm run build`
- `node deploy/combat/nested-recipes-ui-test.cjs`
- With the locked verification `tsx` dependency: `node --import tsx deploy/combat/nested-recipes-catalog-test.ts nested-recipes-browser-evidence/catalog.json`
- With Playwright Chromium: `MONTRA_RECIPE_CATALOG=nested-recipes-browser-evidence/catalog.json node deploy/combat/nested-recipes-browser-test.cjs`

Browser fixtures render production functions/styles at 1366, 390 and 320 px, first with synthetic edge cases, then the real server catalog. They capture sends locally and do not connect to a live player account. Physical-device and live-account behavior are not claimed by these checks. The character HUD workflow runs these browser checks and retains the screenshots/report.
