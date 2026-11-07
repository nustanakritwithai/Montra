/** Bind existing chat behavior to the current room and the legacy UI bridge. */
export function createChatMessageHandler({joined,getRoom,getLocalId,getMapId,state,pushChatFeed,getPending,getBox,getTab,finishPending,updateBadge}) {
  return message => {
    if (getRoom() !== joined || !message || !['map','world','party','private'].includes(message.channel) ||
        typeof message.text !== 'string' || typeof message.name !== 'string' ||
        typeof message.senderId !== 'string' ||
        (message.channel === 'map' && message.mapId !== getMapId())) return;
    const channel=message.channel, own=message.senderId===getLocalId();
    const {history,unread,draft}=state;
    history[channel].push({name:(channel==='private' && own ? 'ถึง '+String(message.targetName || 'ผู้เล่น') : message.name).slice(0,80),text:message.text.slice(0,400),own});
    if(history[channel].length>100)history[channel].shift();
    pushChatFeed(channel,history[channel].at(-1).name,message.text.slice(0,400),own);
    const pending=getPending(),box=getBox(),tab=getTab();
    if(own && pending && pending.channel===channel && pending.text===message.text && (channel!=='private' || pending.targetId===message.targetId)){
      if(draft[channel].normalize('NFC').trim()===message.text){
        draft[channel]='';
        if((tab==='all' ? 'map' : tab)===channel && box?.input.value.normalize('NFC').trim()===message.text)box.input.value='';
      }
      finishPending();
    }else if(!own && !(box?.el.classList.contains('composing') && (tab==='all' || tab===channel))){
      unread[channel]=Math.min(99,unread[channel]+1);
    }
    updateBadge();
  };
}

/** Validate the authoritative party snapshot before updating client UI state. */
export function createPartyStateHandler({joined,getRoom,setParty,clearInvitation,updateBadge,render}) {
  return message => {
    if(getRoom()!==joined || !Array.isArray(message?.members) || message.members.length>4)return;
    const party=typeof message.partyId==='string' ? {partyId:message.partyId,leaderId:message.leaderId,members:message.members.filter(m=>m && typeof m.sessionId==='string' && typeof m.name==='string')} : null;
    setParty(party);
    if(party){clearInvitation();updateBadge();}
    render();
  };
}
