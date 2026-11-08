/** Mutable client-only chat state; each client receives independent collections. */
export function createChatState() {
  return {
    history: { map: [], world: [], party: [], private: [], bug: [] },
    unread: { map: 0, world: 0, party: 0, private: 0, bug: 0 },
    draft: { map: '', world: '', party: '', private: '', bug: '' }
  };
}
