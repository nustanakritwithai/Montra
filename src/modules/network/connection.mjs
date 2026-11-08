/** Connection helpers preserve the existing server protocol and slot checks. */
export function allowedEndpoint(endpoint,location){
  const isLocal=/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/i.test(endpoint)
    && location.protocol==='http:' && ['localhost','127.0.0.1'].includes(location.hostname);
  return /^https:\/\/[a-z0-9.-]+(?::\d+)?\/?$/i.test(endpoint) || isLocal;
}

export function buildJoinOptions(accountSession,characterSlot,characterSetup){
  return {accountSession,characterSlot,...(characterSetup?{characterSetup}:{}),worldVersion:1,templeVersion:1,atlasVersion:1,provinceVersion:1,warVersion:1,castleVersion:2,riverCityVersion:1,terrainVersion:1,atlasReliefVersion:1,originalReliefVersion:1,monsterAutoAttackVersion:1};
}

export async function joinWorld(client,opts,transfer,onTransferError=()=>{}){
  let joined=null,transferFailed=false;
  if(transfer?.roomId){
    try{joined=await client.joinById(transfer.roomId,{...opts,warTicket:transfer.ticket});}
    catch(error){onTransferError(error);transferFailed=true;}
  }
  if(!joined)joined=await client.joinOrCreate('my_room',opts);
  return {joined,transferFailed};
}

export async function verifyJoinedSlot(joined,desiredSlot,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))){
  for(let attempt=0;attempt<75;attempt++){
    const me=joined.state?.players?.get?.(joined.sessionId);
    if(me){
      if(!me.persistent || !me.pathId)throw new Error('เซิร์ฟเวอร์ยังไม่รองรับบัญชีและอาชีพถาวร กรุณาติดต่อผู้ดูแล');
      if(desiredSlot!==1 && (!me.persistent || Number(me.characterSlot)!==desiredSlot))throw new Error('VPS ยังไม่รองรับ 3 ช่องเซฟ · ต้องติดตั้งระบบใหม่ก่อนเข้าเซฟ '+desiredSlot);
      if(me.characterSlot!==undefined && Number(me.characterSlot)!==desiredSlot)throw new Error('เซิร์ฟเวอร์ส่งช่องเซฟไม่ตรงที่เลือก');
      return me;
    }
    await wait(80);
  }
  throw new Error('ไม่ได้รับข้อมูลตัวละครจากเซิร์ฟเวอร์');
}
