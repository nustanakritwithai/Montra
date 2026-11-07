/** Tracks one connection attempt and rejects events from a room no longer active. */
export function createConnectionLifecycle(currentRoom) {
  let pending=false;
  return {
    isPending:()=>pending,
    begin(){if(pending)return false;pending=true;return true;},
    finish(){pending=false;},
    guard(candidate,callback){
      return (...args)=>{if(candidate && currentRoom()===candidate)return callback(...args);};
    },
  };
}
