# MONTRA item sheet integration

This is a client artwork change. It does not change server definitions, item stats,
recipes, rarity, drops, save data, or item IDs.

## Source and coverage

Ten user-requested MONTRA artwork sheets from 8 November 2026 were inspected against
the current `PersonalItems.ts`, `ItemRules.ts`, and `RegionalBosses.ts` definitions.
The supplied older planning spreadsheet listed 1,125 IDs; the live source now has
1,183 personal item IDs, plus six distinct legacy items outside that catalog.

- 144 cells are sliced to transparent 256×256 WebP images.
- 118 cells are canonical matches, used by 1,072 personal IDs plus six legacy IDs.
- 14 alternate designs are retained as unassigned assets.
- 11 designs have no matching current item. They are not assigned by guesswork.
- One fish design resembles carp rather than the named snakehead. It is unassigned.
- 111 personal IDs retain existing fallback artwork/symbols. This is partial artwork
  coverage, not 1,189 unique new paintings.

The exact coverage and gaps are in `item-art-coverage.json`. Missing families include
four kinds of trousers, hunter earrings, two refining materials, the rift fragment,
six regional boss fragments, and common fish. The repeated boot row is deliberately
not used as trousers. All 16 named monster cards have matching artwork.

## Slicing and mapping

`assets/items/manifest.json` records source filenames, dimensions and SHA-256 hashes,
reviewed per-cell crop rectangles, output hashes, and canonical/alternate/unmatched
status. The sheets are visually aligned grids, not mathematically uniform grids.
Independent review corrected boundaries to avoid clipped crowns and neighboring
weapons or armor. The original sheets are not included in the published payload.
Some source glows touch neighboring motifs. Their small boundary intersections are
recorded in the manifest; cropping does not invent or repaint missing pixels.

`scripts/slice-item-sheets.cjs SOURCE_DIRECTORY` reproduces the outputs with the
reviewed Sharp 0.35.5 encoder and refuses altered source/output hashes. This optional
asset-preparation tool is not a browser dependency. The game uses ordinary CSS image
URLs, loaded only for displayed item types. Output filenames have content hash cache
keys in the stylesheet.

Exact item IDs take precedence over the server's actual `family`. A numeric tier
suffix is considered only for a reviewed family and known metadata. Class-specific
field equipment uses its real armor/accessory family, never just its class path.
This also fixes old class-armor thumbnails being mistaken for class weapons.

Existing inventory, paperdoll, equipment candidates, market/trade/forge previews,
and item details share `getItemArtKey`. Empty or capacity-locked inventory slots clear
both artwork and rarity attributes so recycled slots cannot retain an old icon.

## Verification

- `item-art-test.cjs`: 144 output byte hashes and crop bounds, 118 CSS mappings,
  exact/family resolution, and unknown/armor fallbacks.
- `check-item-art-catalog.ts`: imports the current server catalog and checks all
  1,183 IDs, six legacy IDs, explicit gaps, and no catalog mutation.
- `item-art-browser-test.cjs`: production item rendering functions and CSS in an
  isolated Chromium page at 1366, 390 and 320 px. All 118 canonical images decode
  at 256×256 across four item-class contexts. Real inventory-loop checks cover
  filled→empty→capacity-locked slots. Replacement and preview clearing are checked.
- Aggregate client fixtures, deterministic build checks, boundary/contract checks,
  and existing skill artwork browser checks are required before publication.

The browser fixture uses the real catalog and production functions but is not a
logged-in full-game or physical-phone test. CI must pass on the final commit, and
the deployed build manifest plus image/CSS/client hashes must be verified separately.
