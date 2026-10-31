import test from "node:test";
import assert from "node:assert/strict";
import {
  RULES, CommandBucket, parseMoveCommand, parseAttackCommand,
  facingTo, planarDistance, stepTowards,
} from "./GameRules.js";

test("Only exact finite in-bounds tap destinations are accepted", () => {
  assert.deepEqual(parseMoveCommand({ x: 0, z: -20 }), { x: 0, z: -20 });
  for (const bad of [
    null, [], { x: 2 }, { z: 2 }, { x: "2", z: 1 },
    { x: Number.NaN, z: 1 }, { x: Number.POSITIVE_INFINITY, z: 1 },
    { x: 20.01, z: 0 }, { x: 1, z: -21 },
    { x: 1, z: 1, speed: 999 },
    { x: 1, z: 1, facing: 3.14159 },
  ]) assert.equal(parseMoveCommand(bad), null);
});

test("Attack requests cannot smuggle damage/HP or change target ID", () => {
  assert.deepEqual(
    parseAttackCommand({ targetId: RULES.monsterId }),
    { targetId: RULES.monsterId },
  );
  for (const bad of [
    {}, null, { targetId: 100 },
    { targetId: "other-monster" },
    { targetId: RULES.monsterId, damage: 100000 },
    { targetId: RULES.monsterId, hp: 0 },
    { targetId: RULES.monsterId, timestamp: -99999 },
  ]) assert.equal(parseAttackCommand(bad), null);
});

test("Server movement never exceeds the permitted distance for a step", () => {
  const start = { x: 0, z: 0 };
  const target = { x: 16, z: -12 };
  const step = RULES.playerSpeed * (1 / RULES.tickRate);
  const next = stepTowards(start, target, step);
  assert.ok(planarDistance(start, next) <= step + 1e-9);
  assert.ok(next.moved && !next.arrived);
  const final = stepTowards(start, { x: 0.05, z: 0 }, step);
  assert.ok(final.arrived);
  assert.equal(final.x, 0.05);
});

test("Server facing is derived from real movement, not client supplied yaw", () => {
  assert.ok(Math.abs(facingTo(1, 0) + Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(facingTo(0, -1)) < 1e-9);
  assert.ok(Math.abs(Math.abs(facingTo(0, 1)) - Math.PI) < 1e-9);
});

test("Rate limiting rejects bursts beyond the token budget", () => {
  const bucket = new CommandBucket(4, 4, 0);
  for (let i = 0; i < 4; i++) assert.equal(bucket.consume(0), true);
  assert.equal(bucket.consume(0), false);
  assert.equal(bucket.consume(200), false);
  assert.equal(bucket.consume(250), true);
  assert.equal(bucket.consume(251), false);
  assert.equal(bucket.consume(1251), true);
});
