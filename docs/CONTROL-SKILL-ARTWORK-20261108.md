# Control-panel skill artwork

The field controls are a separate rendering surface from the skill book. On main
21ab886, the four Seer controls used a radial gradient instead of their SVG artwork.
The ID selector on the occult fallback background outranked the per-skill artwork.
Mender and Sentinel artwork already used important declarations and were unaffected.

Reduce only the occult fallback's specificity with `:where(#occultHotbar)`. Keep
its fallback, the existing artwork, action handlers, server state and other classes
unchanged. Rebuild the stylesheet and update its explicit snapshot/cache tag.

## Regression coverage

`class-skills-hotbar-browser-test.cjs` mounts the shipped field-dock HTML, calls
actual `syncSwordHotbar`, `syncMuayHotbar`, `syncBladeUI`, `syncSentinelUI` and
`syncOccultUI`, and uses the shipped vital-orb/arc layout. Catalog names and costs
are extracted from the checked-in server definitions. Character snapshots remain
synthetic, with no production account or backend access.

It covers six classes, ready/ranked/cooldown/insufficient-mana/dead states, repeated
sync, class changes, demo dismissal, action dispatch, exact artwork consistency
with the book and SVG decoding at 1366x768, 390x844, 320x640 and 844x390. This is
120 states / 480 actual buttons, plus 24 captured action dispatches. Phone sizes
are Chromium touch emulation, not a physical phone or logged-in gameplay test.

The prior standalone glyph fixture did not mount the actual bar ancestors. The
extra audit also treated any non-none background as an image, including gradients.
The new test rejects gradients. It fails against the public stylesheet served at
21ab886 (SHA256 4c3fc8a8ed2a2d54cdc68f00cf9ab24b067a593e140f40bef8ee663e7c7593af)
with `seer seer_pot actual hotbar must decode artwork, not a gradient`, and passes
with the targeted CSS fix. Screenshots and JSON go into the class-browser CI
artifact under `hotbar/`.

No production player data, combat behavior or artwork bytes were changed.
