/** Test-only transport, copied into combat-verify by the verification script. */
import type {Client} from "colyseus";
import {MyRoom,type PrototypeRoomTransport} from "./MyRoom.js";

export class PrototypeTestRoom extends MyRoom {
  private readonly testTransport:PrototypeRoomTransport = {
    ready:(client,nonce)=>client.send("prototype_protocol_v1_ready",{version:1,gameplayEnabled:nonce!==undefined,...(nonce?{nonce}:{})}),
    confirmed:client=>client.send("prototype_protocol_v1_confirmed",{version:1}),
    probeResult:(client,seq)=>client.send("prototype_protocol_v1_result",{version:1,seq,status:"reserved_no_effect"}),
    shadowState:(client,state)=>client.send("prototype_shadow_v1_state",state),
    occultState:(client,state)=>client.send("prototype_occult_v1_state",state),
    skill:notice=>this.broadcast("prototype_skill_v1",notice,{afterNextPatch:true}),
  };

  constructor(private readonly gameplay=false){
    super();
    Object.assign(this.messages,{
      prototype_protocol_v1:(client:Client,message:unknown)=>this.handlePrototypeProtocol(client,message),
    });
  }

  protected override prototypeTransport():PrototypeRoomTransport|undefined {
    if(process.env.NODE_ENV==="test" && process.env.MONTRA_ISOLATED_STAGING==="1" &&
      process.env.MONTRA_PROTOTYPE_PROTOCOL_V1==="1")return this.testTransport;
  }

  protected override prototypeGameplayEnabled():boolean {
    return this.gameplay && this.prototypeTransport()!==undefined && process.env.MONTRA_PROTOTYPE_GAMEPLAY==="1";
  }
}

export class PrototypeGameplayTestRoom extends PrototypeTestRoom {
  constructor(){super(true);}
}
