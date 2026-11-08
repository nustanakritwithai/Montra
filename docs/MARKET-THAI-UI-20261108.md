# Thai market interface

## Scope

The current market shell still rendered English tabs, filters, headings, sorting,
selection prompts and purchase actions. This update renders them in Thai,
including accessible labels, placeholder text, result counts, known item kinds,
health/stamina labels and the shipped legacy shrine-glaive description.

Item IDs, rarity/category/sort values, request payloads, prices, quantities,
server rules, save data and unknown metadata are unchanged. Item and player
names remain inert text. Unsupported views remain unavailable and keep their
existing Thai coming-soon explanation. Buying still requires two clicks and
waits for the authoritative response. This is a Pages-only update, not a VPS
change.

The longer Thai sorting labels exposed a wrapped page counter. A narrowly
scoped no-wrap rule keeps it on one line without changing columns or controls.
Client and style pins cover the reviewed changes; historical extraction records
are not rewritten.

## Verification

Use Node 22.23.4 from `.nvmrc`, then:

- `npm run test:client`: 56 fixtures plus 3 syntax checks.
- `npm run test:build`: 26 deterministic/client/style packaging tests.
- `node deploy/combat/market-catalog-ui-test.cjs`: 21 groups, including Thai UI,
  dynamic states, unchanged protocol values and unknown/player-data fallback.
- `node --test scripts/check-contract.test.mjs`,
  `node scripts/check-contract.mjs`, and `npm run test:client-boundaries`.
- `node deploy/combat/release-ui-browser-test.cjs`: 114 layout/flow cases across
  1366×900, 390×844 and 320×640, including market details, loading, failed reads,
  empty results, all tabs, close/reopen, confirmation cancellation and crafting
  regression. Requires Playwright/Chromium.

Browser fixtures use production renderers and CSS, synthetic data and captured
sends. No account, live market transaction, player save or production backend is
used. Mobile tests are Chromium emulation, not physical-device tests. Exact-head
CI and deployed-byte verification remain publication gates.
