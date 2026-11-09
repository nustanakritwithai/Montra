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

## Compact popup (follow-up)

The picker now stays separate from recipe details. Choosing a card, changing the recipe selector, or following a recipe shortcut opens a native modal dialog, limited to 480 px wide and 620 px high (and constrained by the viewport). The close button and the selected recipe's cost/craft action remain outside the scroll area. Used-for recipes are expandable to keep the first view small; ingredient inspection and back controls are unchanged.

Escape, close, and backdrop dismiss the popup without crafting and return keyboard focus to the selected recipe card. Native modal behavior blocks clicks behind the popup. Tab stays inside it. Reopening resets inspection; leaving the drawer, demo/disconnect, room changes and missing catalog close it. A stale craft handler is blocked while the popup is closed or inspecting another item. Close never cancels or replays an already submitted server request.

The browser suite also covers a short landscape viewport (844 × 390), popup size/overflow, keyboard containment, focus restoration, dismiss/reopen, closed-handler guards and room resets. The shared market/crafting regression and all prior catalog tests remain in place. No server code is changed.
