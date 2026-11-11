import test from 'node:test';
import assert from 'node:assert/strict';
import {PrototypeCommandGate} from './PrototypeCommandGate.js';

test('only strictly increasing safe integer commands can reserve a session', () => {
  const gate = new PrototypeCommandGate();
  for (const invalid of [undefined, null, '1', 0, -1, 1.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.equal(gate.reserve(invalid), 'invalid');
  assert.equal(gate.reserve(1), 'accepted');
  assert.equal(gate.reserve(1), 'replayed');
  assert.equal(gate.reserve(3), 'accepted');
  assert.equal(gate.reserve(2), 'replayed');
  assert.equal(gate.reserve(1), 'replayed');
});

test('a failed action remains reserved and separate connections do not share sequence', () => {
  const first = new PrototypeCommandGate(), second = new PrototypeCommandGate();
  let mutations = 0;
  const act = (sequence: number) => {
    if (first.reserve(sequence) !== 'accepted') return;
    mutations++;
    throw new Error('uncertain outcome');
  };
  assert.throws(() => act(42));
  assert.doesNotThrow(() => act(42));
  assert.equal(mutations, 1);
  assert.equal(second.reserve(1), 'accepted');
});
