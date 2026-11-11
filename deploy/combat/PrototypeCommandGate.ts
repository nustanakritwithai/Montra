/**
 * Session-local, monotonically sequenced commands for the experimental skill
 * protocol. This module has no connection to the live command router by itself.
 * A reconnect creates a new session and must create a new gate.
 */
export class PrototypeCommandGate {
  private lastSequence = 0;

  /** Reserve before any game mutation. Older IDs remain rejected for the entire
   * session, without an unbounded replay cache. Gaps are allowed because a
   * rejected client-side action may have used a sequence number. */
  reserve(sequence: unknown): 'accepted' | 'invalid' | 'replayed' {
    if (typeof sequence !== 'number' || !Number.isSafeInteger(sequence) || sequence < 1)
      return 'invalid';
    if (sequence <= this.lastSequence) return 'replayed';
    this.lastSequence = sequence;
    return 'accepted';
  }
}
