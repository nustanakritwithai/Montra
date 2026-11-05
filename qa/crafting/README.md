# Focused real crafting check

The full shipped client talks to an isolated unchanged MyRoom and SQLite server.
A disposable level-1 character clicks the actual rendered village smith, opens
its crafting panel, selects the native ring recipe, and creates one real item.
The recipe costs 3 metal, 2 fiber and 4 gold. No crafting handler, RNG, gameplay
state change, UI result or screenshot is mocked.

Assertions cover the persistent success status, new inventory item, consumed
materials, exact gold, 320/390px portrait layout, one idempotent receipt, unbound
item identity and durability after a real server restart. Catalog/wallet messages
are awaited independently. Existing external HTTP and exact-origin CSP guards
keep browser connections local; optional external AI services are disabled.

Only sanitized screenshots, source hashes, result report and server output are
artifacts. No account credentials, private fixture files or SQLite data are
uploaded. The existing broad game workflow is unchanged and is not run by this
crafting-only workflow. Product hashes must match the reviewed product commit.

The focused workflow also runs the crafting and shared item-display regressions.
Navigation-only checks compare settled thumbnail style and dimensions in the real
bag detail, forge preview and crafting output against the actual inventory slot.
Only finite CSS transitions on a measured thumbnail are finished before comparing
its final skin. No game state changes for measurement, and no enhancement, market,
trade or purchase action is sent by this check.
