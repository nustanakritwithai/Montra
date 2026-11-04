const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('main.js','utf8'),start=source.indexOf('  function syncChatViewport(){'),end=source.indexOf('  window.visualViewport?.addEventListener',start);
assert.ok(start>=0&&end>start,'inline chat controls exist');
const classes=new Set(),styles={},attrs={},input={focus(){context.document.activeElement=input},blur(){context.document.activeElement=null}},target={blur(){}};
const context={chatBox:{el:{classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},style:{setProperty:(k,v)=>styles[k]=v}},
  input,target,toggle:{setAttribute:(k,v)=>attrs[k]=v,textContent:''}},document:{activeElement:null},window:{visualViewport:{offsetTop:0,height:500},innerHeight:844},
  $:id=>id==='game'?{getBoundingClientRect:()=>({bottom:844})}:null,ui:{drawer:{hidden:false}},closeDrawer(){context.ui.drawer.hidden=true},
  chatBoxUnread:{all:1},chatBoxTab:'all',chatUnread:{map:1,world:1},updateChatBadge(){},renderChatBox(){}};
const {openChat,closeChatComposer}=vm.runInNewContext(`(()=>{${source.slice(start,end)};return {openChat,closeChatComposer}})()`,context);
openChat();assert.ok(classes.has('composing'));assert.equal(context.document.activeElement,input);assert.equal(context.ui.drawer.hidden,true);
assert.equal(styles['--chat-keyboard-offset'],'344px');assert.equal(attrs['aria-expanded'],'true');assert.equal(context.chatUnread.world,0);
closeChatComposer();assert.equal(classes.has('composing'),false);assert.equal(context.document.activeElement,null);assert.equal(attrs['aria-expanded'],'false');
assert.ok(!source.includes('openDrawer("chat"'),'chat is not opened in a separate drawer');
console.log('PASS: inline chat opens with input focus and respects the mobile viewport');
