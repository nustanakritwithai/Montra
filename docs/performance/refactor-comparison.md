# Refactor performance evidence and remaining gates

## Scope and current result

Baseline: `e458cfd7ed8a7c8a4346dd723bac6e1efa2ad03d`.
Current candidate measured locally: `f471d65b5b68e85abbfc3edbe1fb5e0b6614f6ee` (ten client owners and three server owners, including `bf6e782`).
Its tree is `74abdcd754168f196427ac2e4c05c3e9836af186`. The coordinator reports verified remote PR126 head `45c8cac658cd37b08773aeb1fdd62e47f7916535` has the same tree. CI deliberately defaults to this remote commit, not the local-only merge SHA. The local clone did not contain the remote object during preparation; CI must check it out and verify its tree before recording evidence.
No runtime, protocol, Schema, gameplay rules, feature flags or saves are changed by this harness.

The committed `refactor-local-parse.json` contains the actual same-process Linux/Node 22.23.4 observations, script SHA-256 hashes, and all 30 samples per variant after four warm-up rounds. Order alternates to reduce order bias.

- Shipped local script files: 3 baseline, 13 candidate.
- Total uncompressed local script bytes: 1,455,790 baseline; 1,467,290 candidate (+11,500 bytes, approximately 0.79%). Includes account entry and audio, excludes CDN dependencies.
- Median compile measurement: 31.38 ms baseline; 31.71 ms candidate.
- p95: 38.77 ms baseline; 35.35 ms candidate.

These are a **parse-only microbenchmark**, not full-game performance, module call overhead, network timing, JIT execution, or startup. VM compile behavior, scheduling noise, GC and lazy compilation affect results. Unique trailing comments prevent identical-source compilation cache reuse but introduce a tiny synthetic source difference. No statistical significance or absence of regression is asserted. There is no invented timing pass threshold.

Earlier nine-client-owner candidate `b88467d22f74f713818f5509050166447f807418` is retained separately in `refactor-nine-owner-parse.json`: 12 local scripts, 1,466,762 bytes; median 36.24→36.38 ms, p95 52.85→53.94 ms. That is a different run and target, not evidence for the current release. Timing differences between these runs illustrate environmental variance and must not be treated as a performance improvement.

## Reproduce

Use two disposable checkouts of the full SHAs above and Node 22. In each checkout run `node scripts/build-client.mjs --prepare`. From the checkout containing the harness:

```
node --test scripts/performance/*.test.mjs
node scripts/performance/compare.mjs BASELINE_ROOT CANDIDATE_ROOT OUTPUT_DIR
node scripts/performance/browser.cjs BASELINE_ROOT CANDIDATE_ROOT OUTPUT_DIR
```

The browser step needs Playwright 1.56.1 and its Chromium. A narrowly path-filtered `pull_request` trigger enables draft-PR collection before this workflow exists on the default branch; it uses the pinned remote baseline/current candidate above. This avoids relying on dispatch availability for a new workflow. The token is read-only, checkout credentials are not persisted, no secrets are supplied, and no deployment job exists. For later runs, use the manual `Measure refactor performance (report only)` workflow on a reviewed commit containing this harness. Supply full remote SHAs; both variants run sequentially on **one job/runner**. The harness checkout is separate from both measured trees. Artifacts include revision IDs and hashes in `parse.json`, and observations in `browser.json`, including partial results on failure. Repeat at least twice before interpreting a timing difference; calibrate any acceptance limits from measured baseline variance and an agreed user-facing budget.

## Browser fixture and measurement boundaries

The browser fixture follows existing camera/HUD fixture conventions: local static site, stubbed account entry, headless Chromium/SwiftShader, reduced motion, mobile-sized 390×844 and desktop 1366×768 viewports. All WebSockets are closed and all nonlocal requests except approved public Babylon/Colyseus CDN GETs are blocked. No login, live server, or saved player data is used. The first CDN response is cached in memory and replayed to **both** variants; its hash and byte size are recorded. A warm-up observation for each variant/viewport is excluded from measured rounds (`round: -1`). Four measured rounds alternate variant order with fresh browser contexts and empty storage each time.

Every observation waits for loading to hide and character HUD to become visible, asserts the entry startup callback ran, DEMO mode, no world-unavailable report, a populated scene with an active camera, and an initially closed drawer, then exercises 20 verified open/close drawer cycles. Snapshots at ready and after every five cycles record CDP document/node/listener counts, JS heap bytes, and 120 raw requestAnimationFrame intervals. The scene mesh count and camera type provide a basic scene sanity check. Runtime errors, failed CDN fetches and HTTP error responses fail the fixture. CDN redirects are rejected rather than allowing an unreviewed destination. Frame sampling keeps its 120-interval target and 15-second deadline. Every result records raw intervals, callback/interval counts, elapsed time, target, deadline and completion status, including partial or zero-frame samples. An incomplete sample stops that observation, not the comparison loop: the next paired variant still runs in a fresh context. Each observation has a 120-second watchdog and a 10-second context-cleanup deadline; any incomplete observation or runtime/resource error makes the aggregate workflow fail. Cleanup failure aborts further observations because isolation from the old context can no longer be assured. The 35-minute workflow timeout remains an outer bound and could prevent later rounds if many observations hit their watchdogs. Atomic checkpoints record each run and snapshot, downloaded CDN hashes, and revision/tree identities so a workflow timeout leaves partial evidence; only a final complete status is valid evidence. Failed observations are not valid comparisons.

Important interpretation limits:

- `observedReadyMs` is navigation-to-observed-HUD-ready time, including polling/instrumentation. It is not an engine first-frame timing.
- rAF intervals are a scheduling/frame-pacing proxy. They do not isolate CPU/GPU rendering cost or prove physical-device FPS. Compare median/p95 and full distributions per matching viewport, stage and measured round; do not pool warm-ups.
- Heap is sampled without forced GC. Listener/document/node counts include browser DOM bookkeeping and possibly detached objects awaiting GC. Persistent growth across cycles deserves investigation, not an automatic leak diagnosis.
- Fresh contexts reset the scene between observations. Drawer cycling does **not** exercise map warps or in-world scene teardown. No repeated-scene-transition claim is made.
- Game randomness/time are not overridden or seeded, preserving runtime behavior but limiting exact workload comparability. Scene counts alone do not establish equivalent world activity. Investigate differences before interpreting timings.
- CDN bytes are frozen within a run, not across workflow runs. Inspect hashes before comparing separate runs.
- Headless desktop Chromium at mobile viewport size is not physical mobile testing, thermal testing, touch latency, battery testing, or real mobile GPU evidence.
- The runner does not measure runtime module invocation overhead separately from whole DEMO observations.

## Pending gates

1. Review this fixture and run its draft-PR GitHub workflow (or manual dispatch after available on the default branch). Local Chromium startup is blocked by the known socket EPERM restriction; it was not retried or bypassed. Full browser comparison remains **incomplete/pending**, not passed. The first draft-PR CI attempt is described below. Seven harness unit tests cover fail-closed readiness, CDN policy, complete/partial/zero-frame sampling, paired continuation, final failure, watchdog and cleanup failures; they pass locally alongside JavaScript syntax checks. These tests do not substitute for browser execution.
2. Review paired browser raw results for startup/frame-pacing/heap/listener trends and rerun if noise, errors, differing scene activity or resource hashes make the comparison inconclusive.
3. Add a reproducible seeded map-transition workload before claiming scene-transition performance. Use real mobile hardware before claiming mobile performance.
4. Server tick time, process heap, concurrent-player latency and transport costs remain **unmeasured**. Existing `world-capacity-integration.mjs` verifies ten-client join/movement/chat/replication, regional occupancy and death/respawn using an isolated server; its wall-clock completion time is not a server tick benchmark. A future bounded adapter must start both revisions with identical temporary stores, feature flags, seed/workload and client counts, distinguish startup/join/replication latency from tick cost, and collect actual server-loop telemetry before comparing. This patch deliberately avoids timing assertion tests and labeling them server performance.
5. Re-run measurements for any later combined candidate. The current local parse evidence includes `bf6e782`, but browser evidence is still pending. This evidence cannot approve an unmeasured revision or deployment.

Passing this workflow proves only that the observations were collected and fixture correctness checks passed. It is **not a performance release gate** until baseline variance and accepted budgets are reviewed. No production/VPS/desktop state was accessed and no workflow was dispatched, pushed, merged or deployed during preparation.

## First draft-CI diagnostic result

PR 128 run `42349543937`, job `128334528604`, artifact `13564314984` verified the exact baseline and candidate identities. Its first observation was the candidate mobile-sized 390×844 warm-up (`round: -1`): DEMO readiness was observed at 11,137.5 ms, with the startup callback confirmed, 380 meshes, an ArcRotateCamera, and no recorded runtime errors or blocked URLs. It then failed to collect 120 rAF intervals within 15 seconds. The original sampler threw away partial intervals, so the artifact contains zero snapshots; neither the actual frame count nor the cause of slow/stalled callbacks can be determined from that evidence. Baseline was never attempted. This is **not evidence of a regression or a performance pass**.

The diagnostic follow-up preserves partial frame evidence and attempts subsequent observations even after a failed warm-up, while retaining the original frame target/deadline and failing the final job if any required observation is incomplete. It changes only the harness and its tests/documentation. No runtime settings were tuned, no local Chromium launch was attempted, and fresh paired CI evidence is still required before drawing conclusions.
