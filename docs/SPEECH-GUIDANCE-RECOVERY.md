# Speech guidance failure recovery

The current client labels its beginner guidance and tactical callouts “Typhoon
Voice” / “TYPHOON AI”. Those lines are fixed text in
`src/client/audio/002-voice-guidance.js`, played through `MontraAudio.speak`.
The existing speech engine chooses an installed Thai Web Speech voice, or its
existing Google Translate audio fallback when no Thai voice is available.
This change does not introduce a Typhoon speech endpoint or change providers.
The server's Typhoon integration uses `/v1/chat/completions` for NPC intent
classification and event selection, separate from client audio playback.

## Reproduced failure

Previously, guidance wrote `montra_vg_played_<milestone>` before playback started.
An autoplay rejection, mute setting, network error, or unavailable synthesis
engine therefore permanently consumed that milestone without sound. The error
callback did nothing. Existing speech tests exercised generic buttons and did
not catch this guidance-specific lifecycle defect.

## Latest-release compatibility

The recovery is ported onto main `0bdda6e`, retaining the Phase 14 elder,
warrior and spirit persona definitions, whisper effects, public MontraVoice API,
and Phase 13–18 callout text. Audio recipes and providers are unchanged.
Guidance, tactical speech and whispers share the guarded retry lifecycle while
retaining selected pitch/rate/icon and whisper styling. The sound test reads the
current persona at click time, rather than retaining the selection from when
the settings panel opened. Replay does not reset the selected persona.

## Recovery behavior

- Persist a milestone only on the speech engine's actual start callback, or when
  the player explicitly skips it. A start event does not prove audible output
  on a physical device.
- Expose a direct tap-to-retry button after failure. Repeated game events do not
  create an automatic retry loop.
- Keep callback ownership so canceling an older voice cannot hide or change the
  newer guidance banner.
- Stop owned guidance when its checkbox is turned off. A failed guidance banner
  does not own unrelated speech subsequently started by an NPC/test button.
- Allow the first tactical callout immediately, then enforce its existing
  cooldown. Previously a missing last-play timestamp was treated as page time zero.
- The sound-settings replay control clears only the seven known guidance flags
  and starts the welcome line. It leaves character saves, account identifiers,
  audio volume preferences, and server data untouched. This also gives players
  with flags consumed by the previous version an explicit recovery route.

## Verification

The focused regression covers pending/failure/start, five error types, retry,
stale callbacks, skip, post-start error, failure-banner timeout, repeated replay,
disabling pending playback, private-mode storage failure, and tactical recovery.
The old source fails the new start-only-consumption assertion.

The existing isolated speech browser fixture is extended to use the exact
shipped guidance/settings source and real HTMLAudioElement events with locally
intercepted synthetic WAV responses. It checks desktop and mobile-emulated
Chromium, retry, repeated-event suppression, newer banner ownership, replay,
storage isolation, skip, and horizontal overflow. It never contacts production
TTS or a game server. Actual browser execution must be verified in CI; fixture
code and a successful unit test are not browser evidence.

Physical Android/iOS, installed Thai voice behavior, audible speaker output,
full-game WebGL, and live server interaction remain separate verification.
