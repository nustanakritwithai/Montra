# Skill learning anywhere

Learning new class skills and upgrading core or advanced ranks no longer require the village shrine, its radius, or ground height. This applies to sword, Muay, blade, sentinel, seer and mender.

The server still validates the character, class/school, level, prerequisite skills, practice and available points. It requires five seconds without combat, rejects active pursuit and unresolved attacks, and rejects climbing, flight transitions and dashes. Stationary airborne characters can learn. Existing transaction locks and save-before-activation ordering remain unchanged.

Resetting points and switching school retain their previous rules. Skill-slot assignment follows the hotbar rules. Point pools, cooldowns and held attack-range changes are untouched by learning-location changes.

Client book/help text, rejection feedback and training guidance match the new rule. Training goals no longer send the player back to the village solely to spend points.

## Verification requirements

- `skill-learning-location.test.ts`: six classes, core and advanced actions, every enabled map, distant village and stationary airborne positions, combat boundary, unresolved attacks, movement transitions, malformed input, progression budgets, concurrent writes and failed saves.
- `skill-learning-integration.mjs`: real local WebSocket, durable save, reconnect, inventory/level/XP preservation and unchanged field-reset rejection across six classes.
- Existing client, build, contract, boundary, rank, class and persistence suites remain required. Browser feedback is checked by the class-skills workflow.

The integration test only accepts a disposable class-rank test directory and a loopback server other than port 4108. Never run it against production accounts or data. Releasing the frontend does not install the server; stage and back up the VPS, verify restore/rollback, and verify the deployed revision before declaring this live.
