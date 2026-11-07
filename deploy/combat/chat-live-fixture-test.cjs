'use strict';
const assert=require('node:assert/strict');
const {parts}=require('./fixtures/chat-live-fixture.cjs');
const {fixture}=require('./fixtures/chat-controller-harness.cjs');
const f=fixture({
  state004:parts.controller+'\n'+parts.commandBindings,
  view042:parts.view,controls046:parts.controls,
  message044:parts.message,report044:parts.report,
});
f.env.drawerActive=null;
f.evaluate(parts.rejection);
f.tab('map');f.input('invalid\u0001control');f.submit();f.submit();
const sends=()=>f.trace.filter(entry=>entry[0]==='send');
assert.equal(sends().length,1,'Same-turn pending suppression');
f.handlers.get('command_rejected')({reason:'invalid_chat'});
assert.equal(f.nodes.get('cb-input').value,'invalid\u0001control');
assert(![...f.timers.values()].some(timer=>timer.ms===5000),'Rejection clears pending timer');
assert(f.trace.some(entry=>entry[0]==='toast'&&entry[1]==='ข้อความไม่ถูกต้องหรือยาวเกิน 200 ตัวอักษร'));
f.input('retry');f.submit();assert.equal(sends().length,2,'Immediate retry after rejection');
f.receive(f.message({senderId:'self',text:'retry'}));assert.equal(f.nodes.get('cb-input').value,'');
assert(![...f.timers.values()].some(timer=>timer.ms===5000),'Real-handler acknowledgement clears pending timer');
console.log('PASS live fixture unit contracts: exact rejection/ack bindings and pending reset (dependency-free synthetic unit test, no browser)');
