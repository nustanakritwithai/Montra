/** Retain initial snapshots until their existing handlers have been attached. */
export function createEarlyMessageBuffer(joined) {
  const messages=new Map(),handlers=new Map();
  for(const type of ['guild_state','guild_recruitment','territory_state']) {
    joined.onMessage(type,message=>{if(!handlers.has(type))messages.set(type,message)});
  }
  return {
    setHandler(type,handler){handlers.set(type,handler)},
    replay(){for(const [type,message] of messages)handlers.get(type)?.(message);messages.clear()}
  };
}
