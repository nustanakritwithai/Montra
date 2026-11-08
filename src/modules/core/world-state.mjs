/** Mutable client-side world state; authoritative positions arrive from the server. */
export function createWorldState() {
  return { onlinePlayers: new Map() };
}
