# Focused real marketplace browser QA

The harness runs the complete shipped HTML, JavaScript, CSS and 3D assets in Chromium against the unchanged production MyRoom, account routes and SQLite economy. It creates two disposable guest accounts in a fresh private `montra-market-test-*` directory. It never uses a production account, production store, or production endpoint.

## Transaction fixture

The synthetic seller has normal starter equipment/potions plus a wood stack, stone stack and unbound legacy sword. Both accounts start with the native 1,000 gold. All four initial listings are created through real browser input in My Shop:

- Two potions, total 200 gold.
- Three wood, total 210 gold.
- One stone, total 30 gold.
- One sword, total 400 gold.

The seller cancels stone through the real confirmation. The buyer opens the storefront, expands item details, tests Thai search and category filters, opens and dismisses buy confirmation with the explicit Back action, changes tabs, closes/reopens the market, then confirms buying all three wood. Rapid repeated native pointer input must still create exactly one buy receipt. The harness checks the visible inventory, buyer wallet 790, seller wallet 1,210, removed sale listing, returned stone, exact SQLite item quantities and receipt counts. It shuts down and restarts the actual server, reopens both accounts in fresh browser contexts, then verifies the visible persisted inventory/catalog and the same durable SQLite state again.

No browser function is invoked to open UI, list items, confirm, buy, cancel, grant items or manufacture a server result. `evaluate` is limited to passive DOM/viewport observations and disposable credential setup. The preliminary real SDK admission check makes no market mutations and cannot satisfy browser assertions.

## Catalog-only pagination fixture

Only after the full transaction and restart checks pass, a separate seeding stage fills the synthetic seller account's two unused character slots with 31 one-item herb listings using the native CharacterStore and EconomyStore. The seed action is explicitly setup, not a claimed browser listing flow. Alongside the two unsold initial offers, these produce 33 open products.

The buyer's actual UI must load the real first 30 and next 3 cursor results without duplicates, hide Load More at the end, reset pagination when filtering, and preserve the selected Thai/category filter after quick Auction → My Shop → Buy navigation. My Shop must not display other characters' listings. Exact transaction verification happens before these extra setup listings are added so catalog seeding cannot hide a failed purchase or change receipt expectations.

## Layout and evidence

The harness captures 320px, 390px and 1280px layouts and checks horizontal overflow, expanded details at 320px, the full-stack confirmation at 320px, and the real saved result after restart. Screenshots and synthetic-session browser videos are visual evidence, not substitutes for transaction assertions. This is a focused market test, not a castle test or a full gameplay/auction/trade test. Existing backend central-market and economy-store suites cover their established behavior separately.

The browser's exact-origin `connect-src` policy allows only the localhost static and game servers. The test fulfills official Babylon and Colyseus CDN script URLs from local copies, blocks all other external HTTP requests, and leaves the real localhost WebSocket native. Production connection attempts and browser security-policy violations fail the test. The account server URL is the only served-source substitution.

`seed.ts` rejects a non-temporary root, a different character-store location, symlinked character directories, disabled account/economy requirements and attempts to seed existing account data. Fixture credentials are mode-0600 and never included in artifacts. Only screenshots, synthetic browser videos, a report containing non-secret fixture transaction facts, and redacted server logs are uploaded. No fixture JSON, SQLite, save files, authorization headers, storage dumps, traces or network payloads are uploaded.

## Pinning and execution

Prepare on a separate QA branch based on the reviewed product commit. Before committing QA files, run from that checkout:

    node qa/market/pin-product.mjs .

This records the current product commit/tree and hashes the shipped client files and production server TypeScript dependencies. `run.mjs` refuses a PENDING pin and fails if any pinned source file changed. Product updates require a fresh pin. The QA branch may have its own newer commit, but the report retains the exact tested product identity.

The supported browser execution path here is `.github/workflows/verify-market-browser.yml`. It copies server sources into a temporary runtime, installs pinned dependencies and Chromium from official sources, runs focused client and real SQLite suites, then executes the browser flow. It triggers only on changes to this harness/workflow or manual dispatch. QA publication and artifact upload need the parent's authorization; preparing these local files does not publish or run CI.

Local browser execution was previously blocked by the environment (localhost refused in the connected browser; separate Chromium socket permission failure). Do not launch replacement browsers, change security settings, retry escalation, or use a data URL to evade those restrictions. Local syntax/fixture/store tests remain useful, but must never be described as completed browser/server end-to-end evidence.
