/** Local synthetic-test child lifecycle helpers. Never targets an existing process. */
export function childEnded(child) {
  return child.exitCode !== null || child.signalCode !== null;
}

/** Fail readiness polling immediately on a failed spawn or an exited child. */
export function assertTestChildRunning(child,spawnError,output='') {
  if(spawnError)throw spawnError;
  if(childEnded(child))throw new Error('Test child exited: '+output);
}

/** Attach listeners before checking state, then bound both TERM and KILL waits. */
export function stopTestChild(child, {graceMs=4000,killWaitMs=4000}={}) {
  return new Promise((resolve,reject)=>{
    let graceTimer,killTimer,settled=false;
    const finish=(error)=>{
      if(settled)return;settled=true;
      clearTimeout(graceTimer);clearTimeout(killTimer);
      child.removeListener('exit',onExit);child.removeListener('error',onError);
      if(error)reject(error);else resolve();
    };
    const onExit=()=>finish();
    const onError=error=>finish(error);
    child.once('exit',onExit);child.once('error',onError);
    if(childEnded(child) || !child.pid){finish();return;}
    graceTimer=setTimeout(()=>{
      if(childEnded(child)){finish();return;}
      try {child.kill('SIGKILL');}catch(error){finish(error);return;}
      killTimer=setTimeout(()=>childEnded(child)?finish():finish(new Error('test child did not exit after SIGKILL')),killWaitMs);
    },graceMs);
    try {child.kill('SIGTERM');}catch(error){finish(error);return;}
    if(childEnded(child))finish();
  });
}

/** Bound SDK leave so child termination is not held hostage by a stuck socket. */
export async function leaveTestRoom(room,timeoutMs=2000) {
  let timer;
  try {
    await Promise.race([
      Promise.resolve().then(()=>room.leave()),
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('test room leave timed out')),timeoutMs);}),
    ]);
  } finally {clearTimeout(timer);}
}

/** Bound SDK create/join; dispose a room that resolves after the deadline. */
export async function joinTestRoom(operation,timeoutMs=10000) {
  let timer,expired=false;
  const joining=Promise.resolve().then(operation);
  // Handle a late success or rejection without leaking a room or unhandled promise.
  joining.then(room=>{if(expired && room)void leaveTestRoom(room).catch(()=>{});},()=>{});
  try {
    return await Promise.race([joining,new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('test room join timed out'));},timeoutMs);})]);
  } finally {clearTimeout(timer);}
}

/** Unref'ed watchdog fires only if a leaked SDK socket or other handle keeps
 * the synthetic test process alive. The SDK has no join-abort API here. */
export function armTestDeadline(timeoutMs=90000) {
  const timer=setTimeout(()=>{console.error('synthetic test exceeded its process deadline');process.exit(1);},timeoutMs);
  timer.unref();
}

/** Only the server's explicit incompatibility response satisfies this test. */
export function isPrototypeAdmissionRejection(error) {
  return !!error && error.name==='MatchMakeError' && error.code===526 && error.message==='prototype_client_required';
}
