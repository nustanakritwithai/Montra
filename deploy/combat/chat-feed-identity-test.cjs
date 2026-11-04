const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('main.js','utf8');
const start=source.indexOf('  function clearChatHistory(all) {'),end=source.indexOf('  function syncChatViewport()',start);
assert.ok(start>=0 && end>start,'chat reset function exists');
const context={chatHistory:{map:[{text:'map'}],world:[{text:'world'}],party:[],private:[{text:'secret'}],bug:[]},
  chatFeed:[{channel:'map',text:'map'},{channel:'world',text:'world'},{channel:'private',text:'secret'}],
  chatUnread:{map:1,world:1,party:0,private:1,bug:0},chatBoxUnread:{all:3,map:1,world:1,party:0,private:1,bug:0},
  chatDraft:{map:'',world:'',party:'',private:'typed secret',bug:''},chatTargetId:'player-b',chatChannel:'private',chatBoxTab:'private',
  chatBox:{input:{value:'typed secret'},target:{value:'player-b'}},drawerActive:null,
  updateChatBadge(){},renderChat(){},renderChatBox(){},closeChatComposer(){},finishChatPending(){}};
const clear=vm.runInNewContext(`(${source.slice(start,end)})`,context);
clear(false);
assert.deepEqual(context.chatFeed.map(x=>x.channel),['world','private'],'map change removes the previous map feed');
assert.equal(context.chatHistory.private[0].text,'secret','same identity retains private chat across maps');
clear(true);
assert.equal(context.chatFeed.length,0,'switching identity removes the old character feed');
assert.equal(context.chatHistory.private.length,0);assert.equal(context.chatBox.input.value,'');
assert.equal(context.chatBox.target.value,'');assert.equal(context.chatBoxTab,'all');
console.log('PASS: chat feed and unsent private text are isolated across character changes');
