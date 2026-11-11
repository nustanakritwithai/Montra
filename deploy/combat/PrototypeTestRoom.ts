/** Strict opt-in rooms used by the isolated protocol and gameplay fixtures. */
import {MyRoom,type PrototypeRoomTransport} from "./MyRoom.js";

export class PrototypeTestRoom extends MyRoom {
  constructor(private readonly gameplay=false){ super(); }

  protected override requireAllPrototypeClients():boolean { return true; }

  protected override publishReplacementSkill(notice:Parameters<PrototypeRoomTransport["skill"]>[0]):void {
    this.broadcast("prototype_skill_v1",notice,{afterNextPatch:true});
  }

  protected override prototypeTransport():PrototypeRoomTransport|undefined {
    if(process.env.NODE_ENV==="test" && process.env.MONTRA_ISOLATED_STAGING==="1" &&
      process.env.MONTRA_PROTOTYPE_PROTOCOL_V1==="1")return this.replacementSkillTransport;
  }

  protected override prototypeGameplayEnabled():boolean {
    return this.gameplay && this.prototypeTransport()!==undefined && process.env.MONTRA_PROTOTYPE_GAMEPLAY==="1";
  }
}

export class PrototypeGameplayTestRoom extends PrototypeTestRoom {
  constructor(){super(true);}
}
