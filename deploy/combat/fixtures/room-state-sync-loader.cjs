const fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
module.exports=function load(reference){
 if(reference!==undefined)return reference+'\n;({clearSyncPoll,observePlayers});';
 const s=read('src/client/network/044-state-sync-and-connection.js');
 if(s.includes('  const roomStateSync ='))return read('src/client-modules/room-state-sync.js')+'\n'+s.slice(s.indexOf('  const roomStateSync ='),s.indexOf('  function stopOnline('))+'\n;({clearSyncPoll,observePlayers:roomStateSync.observePlayers});';
 const a=s.indexOf('      // Colyseus 0.18 schema'),b=s.indexOf('      joined.onLeave',a);
 return s.slice(s.indexOf('  let syncPoll ='),s.indexOf('  function stopOnline('))+'  function observePlayers(joined) {\n'+s.slice(a,b)+'  }\n;({clearSyncPoll,observePlayers});';
};
