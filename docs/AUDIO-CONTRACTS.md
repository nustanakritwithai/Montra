# Audio contracts and confirmed recovery fixes

## Scope and prior evidence

The read-only audit used main `ba13f644b24db84e0e606f3ebde7e9b310eab6ca` and reproduced defects from exact source in isolated Node VM fixtures. This fix is based on reviewed class-panel PR #141 (`37bc429dad2bf5d59fa2595d95d9240dd790c063`). It preserves those UI changes and all server commands, game rules, saves and account state. No production connection or player data is used by these tests.

The existing seven speech/audio test scripts passed before these fixes. Their coverage did not establish mixer routing or full authoritative skill coverage. `audio-skills-test.cjs` previously checked fourteen text recipe declarations and repeated generic source substrings, while twelve of the twenty-four actual server core IDs had no recipe. Passing those tests was not evidence that every class had its intended sounds.

## Confirmed defects and changes

1. **Category mute bypass:** SFX, UI, ambience and music sent reverb directly to master, bypassing their own faders. Zero volume still left a wet signal. Each category now has a convolver using the same generated impulse. Both dry and wet returns, including current tails, pass through its category fader.
2. **Speech ignored active controls:** Muting or setting master/voice to zero only affected future speech. Current native/HTML audio kept its original volume. These controls now stop the owned session immediately. Nonzero changes update HTML media live; native speech is cancelled because browser engines may snapshot its initial volume. Neither cancellation nor unmute resynthesizes or replays text. A generation guard makes newer reentrant callback intent win, preventing orphan media or timers that mute could otherwise miss.
3. **Background speech:** Visibility suspension affected Web Audio but not TTS, and no-context speech skipped the handler entirely. Hiding now stops owned speech, and hidden-page requests fail before creating media or a provider request. Returning to the page does not replay speech.
4. **Missing skill/effect names:** Added procedural recipes and metadata for Blade, Sentinel and Mender core IDs, plus missing `bell` and `equip` calls. Added Mender accepted-event wiring and the separate unicast Blade invisibility confirmation. Muay aliases now retain their explicit recipe metadata/lifetimes. Generic action/impact sounds remain. The Chumphon and spirit-buffalo lifetimes also now cover their entire scheduled gong tails.
5. **Wrong-map sounds:** Muay core and occult skill messages lacked the same-map guard used by other class handlers. They now reject out-of-map casters before effects.
6. **Unaccepted skill shouts:** Hotbar clicks spoke even if they only selected a target or failed, for example Protect with no eligible party member. Shouts now follow authoritative accepted events for the local player only. They use the same fixed public phrases and providers. A low-priority skill shout does not interrupt guidance, NPC answers or voice previews already playing.

The client fragments and assembled bundle are explicitly pinned alongside PR #141. The historical extraction baseline is not refreshed. The audio script cache key changes with this engine update so a newly deployed client does not intentionally request the old audio URL.

## Actual provider and permission boundary

“Typhoon Voice” / “TYPHOON AI” remains the existing UI label, not evidence of a Typhoon speech endpoint. The guidance/callout text is fixed client text. The server uses Typhoon `/v1/chat/completions` for NPC intent and event selection; it builds authoritative NPC answers itself. Speech uses a Thai Web Speech voice or the existing Google Translate media fallback if there is no Thai voice. This fix adds no provider, credentials, or new category of text disclosure, and never retries a native synthesis failure through Google.

Fallback media still limits speech to the first 190 characters. Native and fallback persona behavior is not identical; fallback uses playback speed, not true voice/pitch cloning. The existing labels and these provider limitations are separate from the confirmed runtime fixes.

Web Audio gesture unlocking is separate from browser permission to speak or play a new media element. An asynchronous accepted skill event can be blocked by browser autoplay policy; the visual combat result still works. The existing NPC/test/guidance retry buttons remain direct user-gesture routes. No microphone access is requested or needed. These changes do not claim physical iOS/Android speech support or audible speaker verification.

## Verification contracts

- `audio-engine-contract-test.cjs` executes the shipped audio API with a graph-aware mock. It derives all 24 core IDs from the server catalogs, validates all literal client audio calls, and tests active dry/wet faders, tail routing, native/media ownership, pending and started speech, mute/zero, nonzero changes, stale callbacks and hidden/no-context operation.
- `audio-event-contract-test.cjs` executes the exact shipped event-handler bodies and voice helper. It tests every core ID, same-map/room filtering, remote-player silence, owned cloak confirmation, active-speech priority, no click announcement, and unknown IDs producing no new spoken text.
- Existing speech UI and guidance lifecycle suites remain. The browser fixture adds active mute/master/voice-zero, no automatic replay, live HTML-media volume changes, and delayed accepted-skill speech/rejection using a locally intercepted synthetic WAV, never a live TTS or game request.
- Run aggregate client/build/style checks and exact-head hosted CI before release. The browser fixture is synthetic desktop/mobile-emulated Chromium, not a full-game live-server or physical-device test. Graph mocks prove wiring, not acoustic quality or mobile performance. Four category convolvers may warrant representative-device profiling.

## Audit observations not changed here

Spatial pan uses a fixed world-X/right assumption while the camera can rotate, so it does not track current screen direction. Some expanded regions fall back to the original village audio profile. Neither observation is presented as solved by this patch.
