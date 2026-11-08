# Skill artwork and readable status badges

This visual-only follow-up restores the embedded SVG art to skill-book icon selectors, including the eight blank slots in the current Muay and Seer books. Sword graph art and all hotbar IDs remain unchanged. Existing glyph artwork is reused; no new external assets or services are introduced.

The sword detail modal now places the unlearned/learned status beside the skill name instead of over the art. Both existing CSS definitions are updated without reordering the stylesheet. The stylesheet URL is versioned so returning clients fetch the corrected CSS.

## Verification

- Node 22.23.4: all 54 non-browser client fixtures and three syntax checks pass.
- Deterministic client/style/site build: all 26 tests pass; packaging succeeds.
- Real Chromium production-source fixture: 96 cases across 1366×900, 390×844 and 320×640; zero page errors or external requests.
- All 24 core skills have the same decodable SVG on book, graph, modal and hotbar surfaces (96 mappings), including aliases. Actual class-book DOM has no empty artwork.
- The four sword modal skills are inspected at unlearned rank. Learned and max-rank status are also tested; badge/image overlap is zero and the badge remains in view. Existing navigation, repeated opening, stale-handler and server-authoritative rank tests remain in place.
- The reviewed stylesheet byte/hash inventory is intentionally updated for these CSS changes; generated output still must match source concatenation exactly.

The browser fixture uses synthetic room snapshots and does not connect to production accounts or mutate player saves. Mobile checks are Chromium emulation, not physical-device Safari/Android tests. There are no server, combat, audio, persistence or VFX changes. Full remote CI and deployed manifest/CSS hash verification remain release gates.

The artwork portion supersedes the corresponding selector repair in draft PR113. This change does not import that old branch’s unrelated integration/workflow edits or close the PR automatically.
