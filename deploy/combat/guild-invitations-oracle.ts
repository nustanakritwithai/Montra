/** Frozen invitation lifecycle from MyRoom.ts at 27924e7, before extraction.
 * Only transport/store surroundings removed. Keep deliberately asymmetric expiry.
 */
import { randomUUID } from "node:crypto";
export type Invite = {from:string;to:string;guildId:string;expires:number};
export class LegacyGuildInvitations {
  guildInvites = new Map<string,Invite>();
  issue(from:string,to:string,guildId:string,now:number):string {
        for(const [id,invite] of this.guildInvites)if(invite.expires<=now || invite.to===to)this.guildInvites.delete(id);
        const id=randomUUID();
        this.guildInvites.set(id,{from:from,to:to,guildId:guildId,expires:now+60000});
    return id;
  }
  accept(id:string,to:string,now:number,leaderAvailable:(from:string)=>boolean):Invite {
    const invite=this.guildInvites.get(id),leader=invite && leaderAvailable(invite.from);
    if(!invite || invite.to!==to || invite.expires<=now || !leader){
      if(invite && invite.expires<=now)this.guildInvites.delete(id);
      throw new Error("guild_invite_expired");
    }
    return invite;
  }
  complete(id:string):void {this.guildInvites.delete(id);}
  decline(id:string,to:string,now:number):Invite {
    const invite=this.guildInvites.get(id);
    if(!invite || invite.to!==to || invite.expires<=now)throw new Error("guild_invite_expired");
    this.guildInvites.delete(id);return invite;
  }
  leave(id:string,closed:(to:string)=>void):void {
    for(const [inviteId,invite] of this.guildInvites)if(invite.from===id || invite.to===id){
      this.guildInvites.delete(inviteId);
      closed(invite.to);
    }
  }
  clear():void {this.guildInvites.clear();}
}
