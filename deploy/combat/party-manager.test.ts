import test from "node:test";
import assert from "node:assert/strict";
import { PartyManager } from "./PartyManager.js";

test("invitations are addressed, expire, respect leader and capacity, and promote on leave",()=>{
  const p=new PartyManager(), first=p.invite("a","b",0);
  assert.throws(()=>p.accept("c",first.id,1),/party_invite_expired/);
  assert.deepEqual(p.accept("b",first.id,1).members,["a","b"]);
  assert.throws(()=>p.invite("b","c",2),/party_leader_only/);
  for (const person of ["c","d"]) {const invite=p.invite("a",person,2);p.accept(person,invite.id,3);}
  assert.throws(()=>p.invite("a","e",4),/party_full/);
  const left=p.leave("a"); assert.equal(left?.current?.leader,"b");
  const invite=p.invite("b","e",10);assert.throws(()=>p.accept("e",invite.id,60010),/party_invite_expired/);
  assert.deepEqual(p.get("b")?.members,["b","c","d"]);
});
