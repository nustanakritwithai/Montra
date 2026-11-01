/** Room-local transient parties. The room validates that sessions are online. */
import { randomUUID } from "node:crypto";
export const PARTY_MAX_MEMBERS = 4;
export const PARTY_XP_RADIUS = 20;
const INVITE_TTL_MS = 60_000;
export type Party = { id:string; leader:string; members:string[] };
type Invitation = { id:string; from:string; to:string; expires:number };

export class PartyManager {
  private parties = new Map<string,Party>();
  private membership = new Map<string,string>();
  private invitations = new Map<string,Invitation>();

  get(session:string): Party | null {
    const id=this.membership.get(session), party=id ? this.parties.get(id) : undefined;
    return party ? {id:party.id,leader:party.leader,members:[...party.members]} : null;
  }
  invite(from:string,to:string,now:number): Invitation {
    if (from===to) throw new Error("party_invalid_target");
    const party=this.get(from);
    if (party && party.leader!==from) throw new Error("party_leader_only");
    if (party && party.members.length>=PARTY_MAX_MEMBERS) throw new Error("party_full");
    if (this.membership.has(to)) throw new Error("party_target_joined");
    for (const [id,entry] of this.invitations) if (entry.expires<=now || entry.to===to) this.invitations.delete(id);
    const result={id:randomUUID(),from,to,expires:now+INVITE_TTL_MS};
    this.invitations.set(result.id,result); return {...result};
  }
  invitation(to:string,id:string,now:number): Invitation {
    const invite=this.invitations.get(id);
    if (!invite || invite.to!==to || invite.expires<=now) { if(invite && invite.expires<=now) this.invitations.delete(id); throw new Error("party_invite_expired"); }
    return {...invite};
  }
  accept(to:string,id:string,now:number): Party {
    const invite=this.invitation(to,id,now);
    if (this.membership.has(to)) throw new Error("party_target_joined");
    let party=this.get(invite.from);
    if (party && party.leader!==invite.from) throw new Error("party_leader_only");
    if (party && party.members.length>=PARTY_MAX_MEMBERS) throw new Error("party_full");
    if (!party) { party={id:randomUUID(),leader:invite.from,members:[invite.from]}; this.parties.set(party.id,party); this.membership.set(invite.from,party.id); }
    const original=this.parties.get(party.id)!;
    original.members.push(to); this.membership.set(to,original.id);
    for (const [key,entry] of this.invitations) if (entry.to===to || entry.from===to) this.invitations.delete(key);
    return this.get(to)!;
  }
  decline(to:string,id:string,now:number): Invitation {
    const invite=this.invitation(to,id,now); this.invitations.delete(id); return invite;
  }
  leave(session:string): {former:Party; current:Party|null}|null {
    for (const [id,entry] of this.invitations) if (entry.from===session || entry.to===session) this.invitations.delete(id);
    const former=this.get(session); if (!former) return null;
    this.membership.delete(session);
    const party=this.parties.get(former.id)!; party.members=party.members.filter(id=>id!==session);
    if (!party.members.length) { this.parties.delete(party.id); return {former,current:null}; }
    if (party.leader===session) party.leader=party.members[0];
    return {former,current:this.get(party.leader)};
  }
  clear():void { this.parties.clear(); this.membership.clear(); this.invitations.clear(); }
}
