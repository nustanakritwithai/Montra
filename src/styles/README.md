# Ordered stylesheet sources

`manifest.json` is the only assembly order for the 45 CSS fragments. Edit these
sources, then run `node scripts/build-styles.mjs` and commit the regenerated root
`styles.css`. Run `node scripts/build-styles.mjs --check` and
`node --test scripts/build-styles.test.mjs` before submitting the change.

## Contract

- The deployed path remains `styles.css`, at the same URL and HTML position.
  Raw concatenation adds no separators, requests, `@import`, selector prefixes,
  cascade layers, minification, URL rewriting, or dependency packages.
- The numeric prefix is the original global cascade position, not a priority
  within a folder. Do not concatenate by folder or move a later override beside
  an earlier rule just because they share a selector. Responsive and animation
  rules stay with their surrounding source, in their original order.
- The folders are ownership/navigation boundaries, not CSS Modules or isolated
  namespaces. Selectors and custom properties still participate in the existing
  global cascade. Search all fragments before changing a shared selector.
- Each file ends at a complete structural boundary. The builder checks balanced
  blocks, brackets, parentheses, comments, strings and complete top-level rules.
  This is **not** a complete CSS validator or proof that every declaration is
  valid. Existing browser error recovery is deliberately unchanged.
- The builder rejects stale output, duplicate/missing/unlisted fragments, altered
  manifest order, unsafe paths, invalid UTF-8 and source/output symlinks. Git
  attributes retain the raw CSS bytes on Windows as well as Unix.
- Relative asset URLs are interpreted relative to the generated root stylesheet,
  not the source fragment's folder. Keep that convention for later edits.

## Where to edit

- `base`: common elements, the initial HUD, controls and drawers.
- `hud`: target/player information, field layouts, chat, vitals and map controls.
- `character` and `inventory`: character selection, paperdoll, bags, details,
  equipment, seals and medallion.
- `skills`: skill details, trees, graphs and later overrides.
- `combat`: floating feedback, labels, targets, combo and boss encounters.
- `social`, `world`, `market`, `forge`, `audio`: the corresponding feature UI.
- `icons`: embedded artwork, skill books and class artwork.

Some historical sections mix features; their filenames say so. Splitting them
more finely is safe only at complete rule boundaries and in the same global
order. Add a new fragment to the manifest and keep all numeric prefixes aligned.

## Extraction evidence and existing debt

The initial split preserves all **338,554 bytes / 5,134 lines**, SHA-256
`b611ba0b9bd2d5e9511fe403ea43ad2f06ca989e3ac32c4cc5dc94c2b6db3c5f`.
`extraction-baseline.json` records original line ranges, byte counts and per-file
hashes. The tests pin that starting point for this refactor. A later intentional
visual change must revise the relevant regression coverage deliberately rather
than silently treating the historical snapshot as a new baseline.

Repeated skill modal/tree/graph definitions and the malformed legacy comment
heading before the repeated modal remain byte-for-byte intact. Deduplicating,
repairing, reordering or scoping them could change the cascade/browser recovery
and belongs in a separately reviewed visual change. This split does not claim
completed style encapsulation or visual cleanup.

## Skill artwork and status follow-up

The reviewed snapshot now includes the intentional skill-book selector additions
and moves the skill-detail status badge beside the name, outside the artwork orb.
`extraction-baseline.json` and the byte pins in `build-styles.test.mjs` track this
reviewed stylesheet, not a claim that later visual changes are extraction-only.
The original extraction metrics above remain historical context. The artwork
fixture checks all 24 core skills on four surfaces; the class browser suite checks
image decoding, real book rendering and non-overlapping unlearned/learned/max-rank
status badges at desktop and mobile widths.

## Radial graph restoration

The reviewed snapshot also includes the four-direction core graph's narrow-screen
button layout and reduced-motion rules in `skills/033-radial-graph.css`. See
`docs/RADIAL-SKILL-GRAPH-20261108.md` for historical references and verification.
