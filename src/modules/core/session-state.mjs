/** Mutable client session state, independent of persistent character saves. */
export function createSessionState() {
  return { activeCharacterSlot: null, syncPoll: null };
}
