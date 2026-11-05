/** Minimal isolated host for the unchanged production room and account routes. */
import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";

const rootInput = process.env.MONTRA_TEST_DIR;
assert(rootInput && path.isAbsolute(rootInput));
assert(path.basename(rootInput).startsWith("montra-craft-test-"));
const root = realpathSync(rootInput);
assert.equal(root, path.resolve(rootInput), "Isolated test directory must not be a symlink");
assert.equal(path.resolve(process.env.MONTRA_CHARACTER_DIR || ""), path.join(root, "characters"));
assert.equal(realpathSync(process.env.MONTRA_CHARACTER_DIR!), path.join(root, "characters"));
assert.equal(process.env.MONTRA_ECONOMY_ENABLED, "1");
assert.equal(process.env.MONTRA_WORLD_EXPANSION, "1");
assert.notEqual(process.env.MONTRA_ACCOUNTS_REQUIRED, "0");
const fixtureFile = path.join(root, "fixture.json");
assert.equal(realpathSync(fixtureFile), fixtureFile);
const fixture = JSON.parse(readFileSync(fixtureFile, "utf8"));
assert.equal(fixture.version, 1);
assert.equal(fixture.recipeId, "acc_ring_atk_1");
assert.equal(fixture.database.economy, path.join(root, "characters", "economy.sqlite"));
assert.equal(fixture.database.accounts, path.join(root, "characters", "player-accounts.sqlite"));
const port = Number(process.env.PORT);
assert(Number.isInteger(port) && port > 1024 && port <= 65535 && port !== 4108, "Use a dedicated local test port, never the normal game-server port");

const { defineServer, defineRoom } = await import("colyseus");
const { MyRoom } = await import("./rooms/MyRoom.js");
const { installAccountRoutes } = await import("./rooms/AccountRoutes.js");
const { accounts } = await import("./rooms/AccountService.js");
const { characterStore } = await import("./rooms/CharacterStore.js");
assert.equal(accounts().resolve(fixture.session)?.characterIds[0], fixture.characterId);
const server = defineServer({
  rooms: { my_room: defineRoom(MyRoom) },
  express: app => {
    installAccountRoutes(app);
    app.get("/health", (_req, res) => res.json({ ok: true, fixture: "real-crafting-room" }));
  },
});
// Colyseus flushes room saves before this callback runs on SIGTERM/SIGINT.
server.onShutdown(() => {
  characterStore.close();
  accounts().close();
});
await server.listen(port, "127.0.0.1");
server.transport.server?.on("upgrade", (request: import("node:http").IncomingMessage) => {
  console.log("Local crafting socket upgrade", JSON.stringify({
    path: new URL(request.url || "/", `http://127.0.0.1:${port}`).pathname,
    origin: request.headers.origin || "node-sdk",
  }));
});
console.log(`Real crafting test server listening on http://127.0.0.1:${port}`);
