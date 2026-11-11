/** Production marketplace rendering and protocol adapters; no external connections. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../main.js'),'utf8'),css=fs.readFileSync(path.join(__dirname,'../../styles.css'),'utf8');
const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`missing source boundary ${start}`);return source.slice(a,b);};
const plain=value=>JSON.parse(JSON.stringify(value));let groups=0;
function test(name,body){try{body();groups++;console.log('PASS '+name);}catch(error){error.message=name+': '+error.message;throw error;}}
function node(tag='div'){
  let value='',text='';const classes=new Set();
  const el={tagName:tag.toUpperCase(),hidden:false,disabled:false,checked:false,open:false,dataset:{},attributes:{},children:[],
    classList:{contains:k=>classes.has(k),toggle(k,on){if(on)classes.add(k);else classes.delete(k);}},
    setAttribute(k,v){this.attributes[k]=String(v);},getAttribute(k){return this.attributes[k];},
    append(...children){for(const child of children)this.appendChild(child);},
    appendChild(child){this.children.push(child);if(this.tagName==='SELECT'&&this.children.length===1)value=String(child.value);return child;},
    replaceChildren(...children){this.children=[];text='';if(this.tagName==='SELECT')value='';this.append(...children);},
    click(){if(!this.disabled)this.onclick?.();},focus(){this.focused=true;}};
  Object.defineProperties(el,{
    className:{get(){return [...classes].join(' ');},set(v){classes.clear();for(const c of String(v).split(/\s+/).filter(Boolean))classes.add(c);}},
    textContent:{get(){return text+this.children.map(c=>c.textContent).join('');},set(v){this.replaceChildren();text=String(v);}},
    options:{get(){return this.children;}},childElementCount:{get(){return this.children.length;}},
    value:{get(){return value;},set(v){v=String(v);value=this.tagName==='SELECT'&&!this.children.some(c=>c.value===v)?'':v;}},
    innerHTML:{set(){assert.fail('dynamic product data must stay inert text');}},
  });return el;
}
const find=(el,cls)=>el.children.flatMap(c=>[c,...desc(c)]).find(c=>c.classList.contains(cls));
const desc=el=>el.children.flatMap(c=>[c,...desc(c)]);
const uuid=n=>`${String(n).padStart(8,'0')}-1111-4111-a111-111111111111`;
function fixture({central=true}={}){
  const elements=new Map(),wire=[],callbacks={},timers=new Map(),toasts=[];let seq=0;
  const $=id=>elements.get(id)||null,player={persistent:true,alive:true,characterId:'aaaaaaaaaaaa',level:25,pathId:'blade',mapId:'village',x:0,y:0,z:0};
  const items={wood:{name:'ไม้ดิบ',kind:'material',level:1},stone:{name:'หิน',kind:'material'},weapon:{name:'ดาบคู่',kind:'mainHand',path:'blade',level:25,rarity:'rare',stats:{atk:5},forge:{primary:'melee',enhanceMax:10,affixMax:6}},ring:{name:'แหวน',kind:'ring',copyLimit:2,level:25},card:{name:'การ์ดทดสอบ',kind:'card',stats:{atk:2}}};
  const inventory={slots:[{itemId:'wood',quantity:9},{itemId:'weapon',quantity:1,forge:{rank:3,instanceId:'same',revision:2}},{itemId:'stone',quantity:1,bound:true},{itemId:'ring',quantity:1,forge:{rank:1,instanceId:'ring1',revision:4}}],equippedWeaponSlot:1};
  const ctx={$,document:{createElement:node},Date,mode:'live',room:null,localId:'me',personalItems:items,WEAPON_META:{},POTION_ITEM_ID:'health_potion',SHRINE_SHARD:'shrine_shard',shardName:'เศษตรา',catalogRevision:1,
    bodyLabels:{leftRing:'แหวนซ้าย',rightRing:'แหวนขวา'},inventoryState:inventory,ownServerCharacter:()=>player,currentBagSlots:()=>inventory.slots,
    updateTradeBadge(){},renderBag(){},toast:message=>toasts.push(message),fishingPending:false,itemUsePending:false,
    setTimeout:fn=>{timers.set(++seq,fn);return seq;},clearTimeout:id=>timers.delete(id),
    window:{crypto:{getRandomValues(bytes){bytes.fill(++seq);}}},
    openDrawer(name,title,html){ctx.drawerActive=name;ctx.html=html;elements.clear();
      for(const m of html.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)){const el=node(m[1]);el.hidden=/\bhidden\b/.test(m[2]);el.disabled=/\bdisabled\b/.test(m[2]);const v=m[2].match(/\bvalue="([^"]*)"/);if(v)el.value=v[1];elements.set(m[3],el);}
      for(const m of html.matchAll(/<select\b[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g))for(const o of m[2].matchAll(/<option value="([^"]*)">([^<]*)<\/option>/g)){const option=node('option');option.value=o[1];option.textContent=o[2];$(m[1]).append(option);}
    },
  };
  vm.createContext(ctx);const run=code=>vm.runInContext(code,ctx);
  run(slice('  const rarityNames=','  const practiceModels =')+slice('  function statLine(','  const bodyLabels=')+
    slice('  const gearSymbols=','  let inspectingGear=')+slice('  function wearPositions(','  function gearDestination(')+
    slice('  function bagMeta(','  function wornGearAt(')+slice('  function pieceForgeRatings(','  function forgeComparison(')+
    slice('  let economyGold =','  let partyState =')+slice('  function gearStamp(','  function salvageSelectedGear(')+
    slice('  let economyPendingRequest=','  function updatePartyBadge()'));
  ctx.room={state:{economyAvailable:true,players:new Map([['me',player],['near',{persistent:true,alive:true,characterName:'เพื่อน',mapId:'village',x:2,y:0,z:0}]])},send:(command,payload)=>wire.push({command,payload:plain(payload)})};
  ctx.joined=ctx.room;ctx.joined.onMessage=(name,handler)=>callbacks[name]=handler;
  ctx.applyCraftCapabilities=()=>{};
  run(slice('      joined.onMessage("economy_state",','      joined.onMessage("craft_result",')+
    slice('      joined.onMessage("market_result",','      let resourcePage=null;')+
    slice('      joined.onMessage("economy_error",','      joined.onMessage("combat_hit",'));
  run(`centralMarketVersion=${central?1:0};economyGold=1000;openEconomy()`);
  const lastBrowse=()=>wire.filter(x=>x.command==='market_browse').at(-1);
  const page=(entries,nextCursor=null,override={})=>{const request=lastBrowse();callbacks.market_page({tag:request.payload.tag,market:request.payload.market,[request.payload.market==='fixed'?'listings':'auctions']:entries,nextCursor,...override});};
  const row=(n,item='wood',mine=false)=>({id:uuid(n),seller:mine?player.characterId:'bbbbbbbbbbbb',item:{itemId:item,quantity:3},price:210,isMine:mine});
  const status=()=>plain(run('({economyPending,economyGold,economyTab,marketPageRequest,marketNextCursor,economyListings,centralAuctions,marketFilters,marketPageError})'));
  return {ctx,run,$,wire,callbacks,timers,player,items,inventory,lastBrowse,page,row,status,toasts};
}

test('catalog uses accessible 50px inventory tiles, exact item metadata and inert product text',()=>{
  const f=fixture(),piece={itemId:'weapon',quantity:1,forge:{rank:3,affix:{stat:'melee',tier:2}},socket:'card',bound:false},before=JSON.stringify(piece);
  const card=f.ctx.createMarketProduct(piece,{price:1234,badge:'ซื้อทันที',id:uuid(1)});
  assert.equal(card.tagName,'ARTICLE');assert.equal(card.dataset.listingId,uuid(1));
  const tile=find(card,'item-slot');assert(tile.classList.contains('bag-slot'));assert.equal(tile.getAttribute('role'),'img');assert.equal(tile.onclick,undefined);
  assert.match(card.textContent,/ดาบคู่ \+3/);assert.match(card.textContent,/หายาก.*เลเวล 25/);assert.match(card.textContent,/ออปชัน.*ขั้น 2/);assert.match(card.textContent,/การ์ดทดสอบ/);assert.match(card.textContent,/ผูกกับตัวละครเมื่อสวม/);assert.match(card.textContent,/1,234 ทอง/);
  assert.equal(JSON.stringify(piece),before);
  f.items.unsafe={name:'<img src=x onerror=alert(1)>',kind:'material'};
  assert.match(f.ctx.createMarketProduct({itemId:'unsafe',quantity:1}).textContent,/<img src=x/);
  assert.match(css,/\.market-products\s*\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/--item-slot-size\s*:\s*50px/);assert.doesNotMatch(css,/\.market-products\s*\{[^}]*overflow-y/);
});

test('new catalog revisions refresh a product label without replacing its listing identity',()=>{
  const f=fixture();f.page([f.row(1)]);f.items.wood.name='ไม้ชื่อใหม่';f.ctx.catalogRevision++;f.ctx.renderEconomy();
  assert.match(f.$('marketListings').textContent,/ไม้ชื่อใหม่/);assert.equal(f.$('marketListings').children[0].dataset.listingId,uuid(1));
});

test('guild sales use the same market and keep the guild name, not the player cancellation action',()=>{
  const f=fixture(), guildId=uuid(900);
  const guild={...f.row(6),seller:"ช่างสามลาน",sellerGuild:guildId};
  const malformed={...f.row(7),seller:"ชื่อกิลด์",sellerGuild:"invalid"};
  f.page([guild,malformed,f.row(8)]);
  assert.deepEqual(f.status().economyListings.map(x=>x.id),[guild.id,uuid(8)]);
  assert.match(f.$('wmRowsBody').textContent,/กิลด์ ช่างสามลาน/);
  f.$('wmRowsBody').children[0].click();f.$('wmBuy').click();f.$('wmBuy').click();
  assert.equal(f.wire.filter(x=>x.command==="market_buy").at(-1).payload.listingId,guild.id);
  const legacy=fixture({central:false});
  const namedLikePlayer={...legacy.row(9),seller:legacy.player.characterId,sellerGuild:guildId,isMine:undefined};
  legacy.callbacks.market_state({listings:[namedLikePlayer,malformed]});
  assert.deepEqual(legacy.status().economyListings.map(x=>x.id),[namedLikePlayer.id]);
  assert.equal(legacy.run("ownsMarketListing(economyListings[0], ownServerCharacter().characterId)"),false);
});

test('fixed whole-listing purchase has review, cancellation and one pending durable mutation',()=>{
  const f=fixture();f.page([f.row(1)]);const card=f.$('marketListings').children[0],button=find(card,'market-product-action'),cancel=find(card,'market-product-cancel');
  assert.match(card.textContent,/210 ทอง/);assert.match(card.textContent,/70 ทอง\/ชิ้น/);
  button.click();assert(!f.wire.some(x=>x.command==='market_buy'));assert.equal(cancel.hidden,false);assert.match(find(card,'market-product-confirm').textContent,/×3.*210/);
  cancel.click();assert.equal(cancel.hidden,true);button.click();button.click();button.click();
  const sent=f.wire.filter(x=>x.command==='market_buy');assert.equal(sent.length,1);assert.deepEqual(Object.keys(sent[0].payload).sort(),['listingId','requestId']);assert.equal(sent[0].payload.listingId,uuid(1));
  assert.equal(f.status().economyPending,true);assert.equal(find(f.$('marketListings').children[0],'market-product-action').disabled,true);assert.equal(f.status().economyGold,1000);
});

test('search and paging remain server-authoritative with stale tags and repeat More guarded',()=>{
  const f=fixture();f.$('marketQuery').value='ไม้';f.$('marketCategory').value='material';f.$('marketFilters').onsubmit({preventDefault(){}});
  assert.deepEqual({...f.lastBrowse().payload,tag:0},{market:'fixed',query:'ไม้',category:'material',before:null,ownOnly:false,tag:0});
  const tag=f.lastBrowse().payload.tag;f.page([f.row(9)],9);assert.match(f.$('marketResultStatus').textContent,/1 รายการที่โหลดแล้ว/);
  f.$('marketMore').click();f.$('marketMore').click();assert.equal(f.wire.filter(x=>x.command==='market_browse'&&x.payload.before===9).length,1);
  f.page([f.row(8)],8);assert.equal(f.$('marketListings').children.length,2);
  f.callbacks.market_page({market:'fixed',tag,listings:[f.row(99)],nextCursor:99});assert.equal(f.$('marketListings').children.length,2);
  f.$('economyShopTab').click();assert.equal(f.lastBrowse().payload.ownOnly,true);assert.equal(f.lastBrowse().payload.query,'');assert.equal(f.lastBrowse().payload.before,null);
  f.page([f.row(7,'wood',true)]);assert.equal(f.$('marketOwnListings').children.length,1);assert.match(f.$('marketOwnListings').textContent,/ยกเลิกฝากขาย/);
  f.$('economyMarketTab').click();assert.equal(f.lastBrowse().payload.query,'ไม้');assert.equal(f.lastBrowse().payload.ownOnly,false);
});

test('late responses cannot replace a newer search or a different market view',()=>{
  const f=fixture(),first=f.lastBrowse().payload;
  f.$('marketQuery').value='หิน';f.$('marketFilters').onsubmit({preventDefault(){}});const second=f.lastBrowse().payload;
  f.callbacks.market_page({market:'fixed',tag:first.tag,listings:[f.row(1)],nextCursor:1});assert.equal(f.status().marketPageRequest.tag,second.tag);assert.equal(f.status().economyListings.length,0);
  f.callbacks.market_page({market:'auction',tag:second.tag,auctions:[{...f.row(2),opening:100,bid:0,endsAt:Date.now()+60000}],nextCursor:2});assert.equal(f.status().marketPageRequest.tag,second.tag);
  f.page([f.row(3,'stone')]);assert.equal(f.status().economyListings[0].id,uuid(3));
  f.$('marketMore').click();assert.equal(f.lastBrowse().payload.tag,second.tag);
  f.$('economyAuctionTab').click();const auction=f.lastBrowse().payload;
  f.callbacks.market_page({market:'fixed',tag:second.tag,listings:[f.row(4)],nextCursor:4});assert.equal(f.status().marketPageRequest.tag,auction.tag);assert.equal(f.status().marketNextCursor,null);
});

test('read failure is distinct from empty, allows refresh and never repeats a mutation',()=>{
  const f=fixture(),pending=f.status().marketPageRequest;assert(pending);[...f.timers.values()].at(-1)();
  assert.equal(f.status().marketPageRequest,null);assert.match(f.$('marketResultStatus').textContent,/โหลดรายการไม่สำเร็จ/);assert.equal(f.$('marketRefresh').disabled,false);
  const before=f.wire.length;f.$('marketRefresh').click();assert(f.wire.length>before);assert(f.status().marketPageRequest);f.page([]);assert.match(f.$('marketListings').textContent,/ไม่พบสินค้า/);
  f.page([],null,{tag:0});assert(!f.wire.some(x=>/^market_(buy|create|cancel)$/.test(x.command)));
});

test('own-only filters still combine with name/category and remain separate from My Shop',()=>{
  const f=fixture();f.$('marketQuery').value='ไม้';f.$('marketCategory').value='material';f.$('marketOwnOnly').checked=true;
  f.$('marketFilters').onsubmit({preventDefault(){}});assert.equal(f.lastBrowse().payload.ownOnly,true);assert.equal(f.lastBrowse().payload.query,'ไม้');assert.equal(f.lastBrowse().payload.category,'material');
  f.$('economyShopTab').click();assert.equal(f.lastBrowse().payload.query,'');f.$('economyMarketTab').click();assert.equal(f.lastBrowse().payload.ownOnly,true);assert.equal(f.lastBrowse().payload.category,'material');
});

test('tab changes and reopen clear purchase/claim confirmations without sending',()=>{
  const f=fixture();f.callbacks.market_overview({credit:0,auctions:[{...f.row(2),opening:100,bid:0,isMine:true,state:'open'}],supply:{items:[{item:'wood',price:10,remaining:3}]}});
  f.$('economySupplyTab').click();let button=find(f.$('starterSupplyRows').children[0],'market-product-action');button.click();assert.match(button.getAttribute('aria-label'),/^ยืนยัน/);
  f.$('economyShopTab').click();f.$('economySupplyTab').click();button=find(f.$('starterSupplyRows').children[0],'market-product-action');assert.notEqual(button.dataset.confirm,'yes');
  button.click();f.ctx.openEconomy();button=find(f.$('starterSupplyRows').children[0],'market-product-action');assert.notEqual(button.dataset.confirm,'yes');
  f.$('economyShopTab').click();button=find(f.$('auctionMine').children[0],'market-product-action');button.click();f.$('economySupplyTab').click();f.$('economyShopTab').click();button=find(f.$('auctionMine').children[0],'market-product-action');assert.notEqual(button.dataset.confirm,'yes');
  assert(!f.wire.some(x=>['starter_supply_buy','auction_cancel'].includes(x.command)));
});

test('rejected sales remain authoritative and clear pending without automatic retry',()=>{
  const f=fixture();f.page([f.row(1)]);const button=find(f.$('marketListings').children[0],'market-product-action');button.click();button.click();
  f.callbacks.economy_error({reason:'listing_unavailable'});assert.equal(f.status().economyPending,false);assert.equal(f.status().economyGold,1000);assert.match(f.toasts.at(-1),/ขายหรือยกเลิก/);assert.equal(f.wire.filter(x=>x.command==='market_buy').length,1);
  f.callbacks.economy_state({gold:790});assert.equal(f.status().economyGold,790);assert.match(f.$('economyStatus').textContent,/790/);
});

test('seller forms retain accessory stamp, quantity and authoritative listing cancellation',()=>{
  const f=fixture();f.$('economyShopTab').click();f.page([f.row(1,'wood',true)]);
  assert.deepEqual(f.$('marketItem').options.map(o=>o.value),['0','3']);
  f.$('marketItem').value='3';f.$('marketAmount').value='1';f.$('marketPrice').value='250';f.$('marketSell').click();
  const sale=f.wire.find(x=>x.command==='market_create');assert.equal(sale.payload.stamp,'ring1.4');assert.equal(sale.payload.price,250);assert.equal(sale.payload.amount,1);
  f.callbacks.market_result({action:'create'});f.page([f.row(1,'wood',true)]);
  const cancel=find(f.$('marketOwnListings').children[0],'market-product-action');cancel.click();cancel.click();assert(f.wire.some(x=>x.command==='market_cancel'));
});

test('auction bid, own claims, pending credit and NPC reserve remain reachable',()=>{
  const f=fixture();f.$('economyAuctionTab').click();
  f.page([{...f.row(1),opening:100,bid:150,endsAt:Date.now()+60000,isBidder:true}]);
  let card=f.$('auctionListings').children[0],controls=find(card,'auction-bid-controls'),input=controls.children[0],button=find(card,'market-product-action');
  assert.equal(input.min,'151');input.value='200';button.click();input.value='201';input.oninput();button.click();assert(!f.wire.some(x=>x.command==='auction_bid'));button.click();
  assert.equal(f.wire.find(x=>x.command==='auction_bid').payload.amount,201);
  f.callbacks.market_action_result({action:'auction_bid'});
  f.callbacks.market_overview({credit:99,auctions:[{...f.row(2),opening:100,bid:200,isBidder:true,canClaim:true}],supply:{items:[{item:'wood',price:10,remaining:0},{item:'stone',price:15,remaining:5}]}});
  f.$('economyShopTab').click();assert.equal(f.$('auctionCredit').hidden,false);assert.match(f.$('auctionMine').textContent,/ชนะประมูล/);
  f.$('auctionCredit').click();assert(f.wire.some(x=>x.command==='auction_credit'));
  f.callbacks.market_action_result({action:'auction_credit'});const claim=find(f.$('auctionMine').children[0],'market-product-action');claim.click();claim.click();assert(f.wire.some(x=>x.command==='auction_claim'));
  f.callbacks.market_action_result({action:'auction_claim'});f.$('economySupplyTab').click();const products=f.$('starterSupplyRows').children;
  assert.equal(find(products[0],'market-product-action').disabled,true);const buy=find(products[1],'market-product-action');buy.click();buy.click();assert.equal(f.wire.find(x=>x.command==='starter_supply_buy').payload.quantity,1);
});

test('legacy feature fallback and unavailable connections do not fabricate listings',()=>{
  const f=fixture({central:false});assert(f.wire.some(x=>x.command==='market_list'));assert(!f.lastBrowse());assert.equal(f.$('economyAuctionTab').disabled,true);assert.equal(f.$('marketFilters').hidden,true);
  f.callbacks.market_state({listings:[f.row(1),f.row(2,'wood',true)]});f.$('economyShopTab').click();assert.equal(f.$('marketOwnListings').children.length,1);
  f.run('mode="demo";renderEconomy()');assert.equal(find(f.$('marketOwnListings').children[0],'market-product-action').disabled,true);assert.match(f.$('economyStatus').textContent,/เข้าเล่นออนไลน์/);
});

test('nearby trading, no-item offer, both confirmations and cancellation stay intact',()=>{
  const f=fixture();f.$('economyTradeTab').click();f.$('tradeInvite').click();assert.equal(f.wire.at(-1).command,'trade_request');assert.equal(f.wire.at(-1).payload.targetId,'near');
  f.callbacks.trade_update({tradeId:'trade-1',otherName:'เพื่อน',own:{item:null,gold:10},other:{item:{itemId:'wood',quantity:1},gold:0},ownConfirmed:false});
  f.$('tradeItem').value='none';f.$('tradeGold').value='15';f.$('tradeSetOffer').click();assert.deepEqual(f.wire.at(-1).payload,{tradeId:'trade-1',slot:null,amount:0,gold:15});
  f.$('tradeConfirm').click();assert.equal(f.wire.at(-1).command,'trade_confirm');f.$('tradeCancel').click();assert.equal(f.wire.at(-1).command,'trade_cancel');
});

test('timeout recovery, reconnect reset and old room replies never replay purchase',()=>{
  const f=fixture();f.page([f.row(1)]);const button=find(f.$('marketListings').children[0],'market-product-action');button.click();button.click();
  [...f.timers.values()].at(-1)();assert.equal(f.wire.filter(x=>x.command==='market_buy').length,1);assert.equal(f.status().economyPending,false);assert(f.wire.some(x=>x.command==='get_economy'));
  const oldReply=f.callbacks.market_page,tag=f.lastBrowse().payload.tag;f.run('resetCentralMarket()');assert.equal(f.status().marketPageRequest,null);assert.equal(f.status().marketNextCursor,null);assert.equal(f.timers.size,0);
  f.ctx.room={state:{economyAvailable:false}};oldReply({tag,market:'fixed',listings:[f.row(88)],nextCursor:88});assert.equal(f.status().economyListings.length,0);
});

test('World Market shell: tabs, row table, client filters, sort, two-step Buy and coming-soon views',()=>{
  const f=fixture();assert.match(f.ctx.html,/<h2>ตลาดกลาง<\/h2>/);
  for(const v of ['search','price','wish','sell','orders','auction','rules'])assert(f.$('wmTab-'+v),'tab '+v);
  assert.equal(f.$('wmTab-search').getAttribute('aria-pressed'),'true');assert.equal(f.$('wmCoins').textContent,'1,000');
  const a={...f.row(1,'weapon'),price:900},b={...f.row(2),price:50},c={...f.row(3,'stone'),price:300};
  f.page([a,b,c]);const rows=()=>f.$('wmRowsBody').children.map(r=>r.dataset.listingId);
  assert.deepEqual(rows(),[uuid(2),uuid(3),uuid(1)]);assert.match(f.$('wmShown').textContent,/^แสดง 3 รายการ/);
  assert.match(f.$('wmRowsBody').children[2].textContent,/ดาบคู่/);assert.match(f.$('wmRowsBody').children[2].textContent,/ไม่หมดอายุ/);
  f.$('wmSort').value='price-desc';f.$('wmSort').onchange();assert.deepEqual(rows(),[uuid(1),uuid(3),uuid(2)]);
  f.$('wmPriceMin').value='100';f.$('wmFilterForm').onsubmit({preventDefault(){}});assert.deepEqual(rows(),[uuid(1),uuid(3)]);
  f.$('wmRarity').value='rare';f.$('wmFilterForm').onsubmit({preventDefault(){}});assert.deepEqual(rows(),[uuid(1)]);
  assert.equal(f.$('wmBuy').disabled,true);assert.equal(f.$('wmPick').textContent,'เลือกไอเท็มในรายการ');
  f.$('wmRowsBody').children[0].click();assert.equal(f.$('wmBuy').disabled,false);
  f.$('wmBuy').click();assert.equal(f.wire.filter(x=>x.command==='market_buy').length,0);assert.match(f.$('wmPick').textContent,/ยืนยันซื้อ/);
  f.$('wmBuy').click();const buy=f.wire.filter(x=>x.command==='market_buy');assert.equal(buy.length,1);assert.equal(buy[0].payload.listingId,uuid(1));
  f.$('wmTab-price').click();assert.equal(f.$('wmSoon').hidden,false);assert.equal(f.$('wmSearch').hidden,true);
  f.$('wmTab-rules').click();assert.equal(f.$('wmRules').hidden,false);assert.match(f.ctx.html,/ภาษีขาย 0%/);
  f.$('wmTab-auction').click();assert.equal(f.status().economyTab,'auction');assert.equal(f.lastBrowse().payload.market,'auction');
  f.$('wmTab-sell').click();assert.equal(f.status().economyTab,'shop');assert.equal(f.$('marketSellForm').open,true);
});
test('World Market shell follows active trades and exposes trade/NPC navigation',()=>{
  const f=fixture();f.run('activeTrade={tradeId:"t",own:null,other:null};openEconomy()');
  assert.equal(f.status().economyTab,'trade');assert.equal(f.$('worldMarket').dataset.view,'trade');
  assert.equal(f.$('wmSearch').hidden,true);assert.equal(f.$('economyTradePanel').hidden,false);
  f.run('activeTrade=null');f.$('wmTab-search').click();assert.equal(f.$('worldMarket').dataset.view,'search');
  f.$('wmTab-trade').click();assert.equal(f.$('economyTradePanel').hidden,false);
  f.$('wmTab-supply').click();assert.equal(f.$('economySupplyPanel').hidden,false);
  f.$('wmTab-search').click();f.run('economyTab="trade";renderEconomy()');
  assert.equal(f.$('worldMarket').dataset.view,'trade','incoming trade while drawer is open');
  assert.match(css,/\.world-market \[hidden\]\s*\{\s*display:none !important/,'author grid/flex styles must respect hidden');
});
test('World Market repeated reopen restores filters, sort and tab without retaining confirmation',()=>{
  const f=fixture({central:false});f.callbacks.market_state({listings:[f.row(1)]});
  f.$('wmRowsBody').children[0].click();f.$('wmBuy').click();f.run('openEconomy()');
  assert.doesNotMatch(f.$('wmPick').textContent,/ยืนยันซื้อ/);f.$('wmBuy').click();assert(!f.wire.some(x=>x.command==='market_buy'));
  f.$('wmPriceMin').value='100';f.$('wmMyLevel').checked=true;f.$('wmFilterForm').onsubmit({preventDefault(){}});
  f.$('wmSort').value='price-desc';f.$('wmSort').onchange();
  for(const view of ['sell','orders','auction','price','wish','rules','search']){
    f.$('wmTab-'+view).click();f.run('openEconomy()');
    assert.equal(f.$('worldMarket').dataset.view,view);assert.equal(f.$('wmPriceMin').value,'100');
    assert.equal(f.$('wmMyLevel').checked,true);assert.equal(f.$('wmSort').value,'price-desc');
  }
});
test('World Market search refresh recovers failed browse without replaying mutations',()=>{
  const f=fixture();const old=f.lastBrowse();[...f.timers.values()].at(-1)();
  assert.equal(f.$('wmRefresh').disabled,false);f.$('wmRefresh').click();
  assert(f.lastBrowse().payload.tag>old.payload.tag);f.page([f.row(1)]);
  assert.equal(f.$('wmRowsBody').children.length,1);assert(!f.wire.some(x=>x.command==='market_buy'));
});

test('market interface text, labels and options are Thai without changing wire values',()=>{
  const f=fixture(),html=f.ctx.html;
  const visible=html.replace(/<[^>]*>/g,' ').replace(/MONTRA|Montra/g,'');
  assert.doesNotMatch(visible,/[A-Za-z]/,'static player-facing market text must be Thai');
  for(const [,label] of html.matchAll(/(?:aria-label|title|placeholder)="([^"]*)"/g))assert.doesNotMatch(label,/[A-Za-z]/);
  for(const label of ['ตลาดกลาง','ค้นหา','ราคาตลาด','รายการที่อยากได้','รายการของฉัน','ประมูล','กฎตลาด','ชนิดสินค้า','ความหายาก','ตีบวกขั้นต่ำ','ตรงเลเวลและอาชีพของฉัน','มีการ์ดใส่ในรู','ต้องตรงทุกเงื่อนไข','ราคา ต่ำ→สูง','ราคา สูง→ต่ำ','เลเวล สูง→ต่ำ','ใหม่ล่าสุด','รายละเอียด','อยากได้'])assert(html.includes(label),label);
  assert.deepEqual(f.$('wmRarity').options.map(x=>x.value),['all','common','uncommon','rare','epic','legendary']);
  assert.deepEqual(f.$('wmSort').options.map(x=>x.value),['price-asc','price-desc','level-desc','newest']);
  assert.equal(f.$('wmPick').textContent,'เลือกไอเท็มในรายการ');assert.equal(f.$('wmBuy').textContent,'ซื้อ');
  f.page([f.row(1)],2);assert.equal(f.$('wmShown').textContent,'แสดง 1 รายการ · ยังมีบนเซิร์ฟเวอร์');
  f.$('wmRowsBody').children[0].click();assert.equal(f.$('wmBuy').textContent,'ซื้อ');
  f.$('wmBuy').click();assert.equal(f.$('wmBuy').textContent,'ยืนยันซื้อ');assert(!f.wire.some(x=>x.command==='market_buy'));
  f.$('wmTab-search').click();f.page([f.row(2,'ring',true)]);f.$('wmRowsBody').children[0].click();
  assert.equal(f.$('wmBuy').textContent,'ยกเลิกฝากขาย');f.$('wmBuy').click();assert.equal(f.$('wmBuy').textContent,'ยืนยันยกเลิก');
});
test('market item kinds and status details are Thai while unknown metadata and user content stay intact',()=>{
  const f=fixture();
  for(const [kind,label] of Object.entries({mainHand:'อาวุธ',material:'วัตถุดิบ',catalyst:'ตัวเร่ง',consumable:'ของใช้',card:'การ์ด',tool:'เครื่องมือ',ring:'แหวน',earring:'ตุ้มหู',leftRing:'แหวนซ้าย',rightRing:'แหวนขวา'})){
    f.items.sample={name:'Custom item 名',kind,stats:{hp:10,stamina:2}};
    assert.equal(f.ctx.wmSubline({itemId:'sample',quantity:3}),label+' · พลังชีวิต +10 · พลังกาย +2 · ×3');
    assert.equal(f.ctx.wmName({itemId:'sample',quantity:3}),'Custom item 名');assert.equal(f.items.sample.kind,kind);
  }
  f.items.sample={name:'Custom item 名',kind:'future_kind',path:'future_path',rarity:'future_rarity'};
  assert.equal(f.ctx.wmSubline({itemId:'sample',quantity:1}),'future_kind · ×1');
  assert.equal(f.ctx.wmName({itemId:'unknown_item_v2',quantity:1}),'unknown_item_v2');
  assert(f.ctx.marketItemDetails({itemId:'sample',quantity:1}).includes('อาชีพ future_path'));
  assert(f.ctx.marketItemDetails({itemId:'unknown_item_v2',quantity:1}).includes('รหัสสินค้า unknown_item_v2'));
  const shippedBonus='หายาก · iLv 12 · ประชิด +10 เมื่อสู้มอนสเตอร์ / +8 ใน PvP';
  assert(source.includes('bonus: "'+shippedBonus+'"'),'review translations when shipped legacy stats change');
  f.ctx.WEAPON_META.shrine_glaive={name:'ง้าวจันทร์ผู้พิทักษ์',bonus:shippedBonus};
  assert.match(f.ctx.wmSubline({itemId:'shrine_glaive',quantity:1}),/เลเวลไอเท็ม 12.*\+8 เมื่อสู้ผู้เล่น/);
  assert.doesNotMatch(f.ctx.marketItemDetails({itemId:'shrine_glaive',quantity:1}).slice(0,-1).join(' '),/[A-Za-z]/);
  assert.equal(f.ctx.WEAPON_META.shrine_glaive.bonus,shippedBonus);
  f.ctx.WEAPON_META.shrine_glaive.bonus='Future balance description';
  assert.match(f.ctx.wmSubline({itemId:'shrine_glaive',quantity:1}),/Future balance description/);
  f.items.tonic={kind:'consumable',stats:{hp:3,stamina:2},healHp:15,healMana:10};
  const details=f.ctx.marketItemDetails({itemId:'tonic',quantity:1}).join(' ');
  assert.match(details,/พลังชีวิต \+3 · พลังกาย \+2/);assert.match(details,/ฟื้น 15 พลังชีวิต/);assert.match(details,/ฟื้น 10 มานา/);
  f.callbacks.trade_update({tradeId:'trade-english',otherName:'Alice <b>Example</b>',own:null,other:null});
  assert.equal(f.$('tradePartner').textContent,'Alice <b>Example</b>');
});
test('market loading, empty, offline, timeout and rejection messages stay Thai',()=>{
  const f=fixture();assert.match(f.$('wmRowsBody').textContent,/กำลังโหลดสินค้า/);
  [...f.timers.values()].at(-1)();assert.match(f.$('wmRowsBody').textContent,/โหลดรายการไม่สำเร็จ/);
  f.$('wmRefresh').click();f.page([]);assert.match(f.$('wmRowsBody').textContent,/ไม่พบสินค้า/);
  for(const reason of ['listing_unavailable','insufficient_gold','inventory_full','auction_unavailable','auction_bid_too_low','auction_cancel_unavailable','starter_supply_limit','unknown_server_error']){
    f.callbacks.economy_error({reason});assert.match(f.toasts.at(-1),/[ก-๙]/);assert.doesNotMatch(f.toasts.at(-1),/[A-Za-z]/);
  }
  f.run('mode="demo";renderEconomy()');assert.match(f.$('economyStatus').textContent,/เข้าเล่นออนไลน์/);assert.match(f.$('wmRowsBody').textContent,/รายการจะแสดงเมื่อเชื่อมต่อ/);
  assert(!f.wire.some(x=>/^(market_buy|market_create|market_cancel|auction_bid|starter_supply_buy)$/.test(x.command)));
});

console.log(`PASS marketplace catalog: ${groups} regression groups`);

test('advanced market sends base-stat filters and ignores a superseded history reply',()=>{
  const f=fixture();
  f.callbacks.market_features({version:1,history:true,baseStatFilter:true,favoriteLimit:50});
  f.callbacks.market_favorites({items:['wood']});
  f.$('wmBaseStat').value='atk';f.$('wmBaseValue').value='5';f.$('wmFavoritesOnly').checked=true;
  f.$('wmFilterForm').onsubmit({preventDefault(){}});
  assert.deepEqual(f.lastBrowse().payload.minStat,{stat:'atk',value:5});
  assert.equal(f.lastBrowse().payload.favoritesOnly,true);
  f.run('requestMarketHistory("wood");requestMarketHistory("weapon");');
  const requests=f.wire.filter(msg=>msg.command==='market_history');
  f.callbacks.market_history({itemId:'wood',tag:requests[0].payload.tag,sales:[]});
  assert.equal(f.run('marketPriceState.sales'),null);
  f.callbacks.market_history({itemId:'weapon',tag:requests[1].payload.tag,sales:[]});
  assert.equal(f.run('marketPriceState.sales.length'),0);
});
