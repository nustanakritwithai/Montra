import { randomUUID } from "node:crypto";

type GuildInvitation = Readonly<{from:string;to:string;guildId:string;expires:number}>;

/** Room-local invitation lifetime, separate from durable guild membership.
 * MyRoom owns authority checks, membership commits and wire delivery. Acceptance
 * is two-phase: failed GuildStore.add must leave the invitation available.
 */
export class GuildInvitations {
  private readonly invitations = new Map<string,GuildInvitation>();

  issue(from:string,to:string,guildId:string,now:number):string {
    for(const [id,invite] of this.invitations) {
      if(invite.expires<=now || invite.to===to)this.invitations.delete(id);
    }
    const id=randomUUID();
    this.invitations.set(id,{from,to,guildId,expires:now+60000});
    return id;
  }

  prepareAccept(id:string,to:string,now:number,resolveInviter:(from:string)=>string|undefined):{invite:GuildInvitation;leader:string} {
    const invite=this.invitations.get(id),leader=invite && resolveInviter(invite.from);
    if(!invite || invite.to!==to || invite.expires<=now || !leader){
      if(invite && invite.expires<=now)this.invitations.delete(id);
      throw new Error("guild_invite_expired");
    }
    return {invite,leader};
  }

  complete(id:string):void {this.invitations.delete(id);}

  decline(id:string,to:string,now:number):GuildInvitation {
    const invite=this.invitations.get(id);
    // Unlike acceptance, a failed decline does not prune expired invitations.
    if(!invite || invite.to!==to || invite.expires<=now)throw new Error("guild_invite_expired");
    this.invitations.delete(id);
    return invite;
  }

  leave(id:string,closed:(to:string)=>void):void {
    // Delete and notify one at a time. Do not batch or swallow transport errors:
    // the original leave path stops here if delivery throws, before character save.
    for(const [inviteId,invite] of this.invitations)if(invite.from===id || invite.to===id){
      this.invitations.delete(inviteId);
      closed(invite.to);
    }
  }

  clear():void {this.invitations.clear();}
}
