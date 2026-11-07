// Nested player subscriptions and fallback polling, with a privately owned timer.
// Shell callbacks retain world/render ownership; live getters preserve callback-time reads.
"use strict";
globalThis.MontraRoomStateSync = Object.freeze({
  create({ getRoom, getActiveMapId, getWindow, getConsole, getSetInterval, getClearInterval, syncState, setOnlinePlayer, removeOnlinePlayer }) {
  let syncPoll = null;
  function clearSyncPoll() { if (syncPoll) getClearInterval()(syncPoll); syncPoll = null; }
  function observePlayers(joined) {
      // Colyseus 0.18 schema callbacks are the reliable way to subscribe to nested maps.
      try {
        const callbackApi = getWindow().Colyseus.Callbacks;
        if (callbackApi?.get) {
          const cb = callbackApi.get(joined);
          cb.onAdd("players", (p, id) => {
            const applyServerPlayer = () => {
              if ((p.mapId || "ritual_village") !== getActiveMapId()) { removeOnlinePlayer(id); return; }
              setOnlinePlayer(id, Number(p.x), Number(p.z),
                Number(p.facing), Number(p.hp), Number(p.maxHp), Number(p.y), p.equippedWeaponId, p.pathId);
            };
            applyServerPlayer();
            if (typeof cb.listen === "function") {
              cb.listen(p, "x", applyServerPlayer);
              cb.listen(p, "z", applyServerPlayer);
              cb.listen(p, "facing", applyServerPlayer);
              cb.listen(p, "hp", applyServerPlayer);
              cb.listen(p, "y", applyServerPlayer);
              cb.listen(p, "maxHp", applyServerPlayer);
              cb.listen(p, "equippedWeaponId", applyServerPlayer);
              cb.listen(p, "pathId", applyServerPlayer);
              cb.listen(p, "mapId", () => syncState(joined.state));
            }
          });
          cb.onRemove("players", (_,id) => removeOnlinePlayer(id));
        }
      } catch (err) { getConsole().warn("Callbacks fallback to state updates",err); }
      // Some SDK/room combinations expose the collection only after the first full state sync.
      clearSyncPoll(); syncPoll = getSetInterval()(() => { if (getRoom() === joined) syncState(joined.state); },350);
  }
    return Object.freeze({ clearSyncPoll, observePlayers });
  },
});
