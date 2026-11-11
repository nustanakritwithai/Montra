const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source=readFileSync(join(__dirname,'../../src/client/ui/056-party-guild-and-rebirth.js'),'utf8');
const start=source.indexOf('  let guildRenderKey=');
const end=source.indexOf('  const cityProduct=',start);
assert.ok(start>=0 && end>start);

function fixture(rank='commander'){
  const calls=[],sends=[],nodes={};
  let focused=null;
  const element=(tag='div',attrs={})=>({
    tag,dataset:{},hidden:Object.hasOwn(attrs,'hidden'),tabIndex:Number(attrs.tabindex??0),checked:false,
    children:[],value:'',textContent:'',
    setAttribute(key,value){attrs[key]=value;},
    getAttribute(key){return attrs[key];},
    append(...nodes){this.children.push(...nodes);},
    replaceChildren(){this.children=[];},
    get options(){return this.children;},
    focus(){focused=this;},
    querySelectorAll(selector){
      if(selector==='[role=tab]')return this.children.filter(node=>node.getAttribute('role')==='tab');
      if(selector==='details[open]')return this.children.flatMap(row=>row.children.filter(node=>node.tag==='details' && node.open));
      throw Error('Unexpected selector '+selector);
    },
  });
  const moon='moon_pass',river='sam_lan_estuary',watch='river_watch';
  const roster=[
    {id:'chief',name:'ศิลา',online:true,rank:'commander',squad:1,specialty:'support'},
    {id:'scout',name:'นที',online:false,rank:'member',squad:1,specialty:'scout'},
    {id:'rider',name:'อรุณ',online:true,rank:'member',squad:2,specialty:'engineer'},
  ];
  const ctx={
    $:id=>nodes[id],document:{createElement:element},mode:'live',localId:'self',activeMapId:moon,
    ownServerCharacter:()=>({persistent:true}),cityRecoveryReady:()=>true,
    citySiteNames:{[moon]:'จันทรา',[river]:'สามลาน'},
    warPhase:phase=>({battle:'กำลังรบ',protected:'อยู่ในความคุ้มครอง'})[phase],
    marketText:(tag,className,text)=>Object.assign(element(tag),{className,textContent:text??''}),
    room:{state:{guildAvailable:true,guildRolesAvailable:true,worldMapsAvailable:true,cityMarketSupported:true,
      cityMissionSupported:true,cityProductionAvailable:true,cityWorkshopSupported:true,cityGovernanceAvailable:true,players:new Map()},
      send:(command,payload)=>sends.push([command,JSON.parse(JSON.stringify(payload))])},
    guildState:{id:'guild',name:'กิลด์ศิลา',ownId:rank==='commander'?'chief':'scout',leaderId:'chief',treasury:1240,members:roster},
    guildInvitation:null,guildDirectory:[],guildRecruitment:{pending:null,applications:[{id:'application',name:'พราน'}]},
    worldDefinitions:{[moon]:{name:'จันทรา'},[river]:{name:'สามลาน'},[watch]:{name:'ด่านริมน้ำ'}},
    territoryState:{owners:{[moon]:'กิลด์ศิลา',[river]:null,[watch]:'พันธมิตร'},
      engagements:[{site:moon,side:'defend'},{site:river,side:'attack'}],
      warTimes:{[moon]:{phase:'battle',phaseEndsAt:2000},[river]:{phase:'battle'},[watch]:{phase:'protected'}}},
    window:{confirm:()=>true},updatePartyBadge(){},
    openDrawer(drawer,title,html){
      ctx.drawerActive=drawer;
      for(const match of html.matchAll(/<([a-z][a-z0-9]*)\b([^<>]*\bid="([^"]+)"[^<>]*)>/g)){
        const attrs=Object.fromEntries([...match[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g)].map(([,key,value])=>[key,value??true]));
        nodes[match[3]]=element(match[1],attrs);
      }
      nodes.guildTabs.append(...['Overview','Territory','Members','Manage'].map(tab=>nodes['guild'+tab+'Tab']));
    },
  };
  for(const action of ['openParty','openCityProduction','openCityMarket','openCityMission','openCityGovernance','openWarPanel','openStrategicMap'])
    ctx[action]=(...args)=>calls.push([action,...args]);
  vm.createContext(ctx);
  vm.runInContext('let guildUnread=false;\n'+source.slice(start,end),ctx);
  return {ctx,nodes,calls,sends,focused:()=>focused,moon,river,watch};
}

test('the guild drawer opens the overview and supports arrow, Home and End tab navigation',()=>{
  const {ctx,nodes,sends,focused}=fixture();
  ctx.openGuild();
  assert.deepEqual(sends,[['get_guild',{}],['get_territories',{}]]);
  assert.deepEqual(nodes.guildTabs.children.map(tab=>tab.getAttribute('data-guild-icon')),['banner','town','members','seal']);
  assert.equal(nodes.guildOverviewTab.getAttribute('aria-selected'),'true');
  assert.equal(nodes.guildTerritoryPage.hidden,true);
  nodes.guildOverviewTab.onkeydown({key:'ArrowRight',preventDefault(){}});
  assert.equal(focused(),nodes.guildTerritoryTab);
  assert.equal(nodes.guildOverviewTab.tabIndex,-1);
  assert.equal(nodes.guildTerritoryTab.tabIndex,0);
  assert.equal(nodes.guildTerritoryPage.hidden,false);
  assert.equal(nodes.guildOverviewPage.hidden,true);
  nodes.guildTerritoryTab.onkeydown({key:'End',preventDefault(){}});
  assert.equal(focused(),nodes.guildManageTab);
  nodes.guildManageTab.onkeydown({key:'Home',preventDefault(){}});
  assert.equal(focused(),nodes.guildOverviewTab);
  nodes.guildMembersTab.onclick();
  assert.equal(nodes.guildMembersPage.hidden,false);
});

test('war and ownership rows route to the local board or map without rebuilding the roster on a war tick',()=>{
  const {ctx,nodes,calls,river,moon}=fixture();
  ctx.openGuild();
  assert.equal(nodes.gxForts.textContent,'1');
  assert.equal(nodes.gdForts.children[0].children[0].children[0].textContent,'จันทรา');
  assert.equal(nodes.guildOtherSitesLabel.textContent,'ด่านอื่น (2)');
  nodes.gdBattles.children[0].children[1].onclick();
  nodes.gdBattles.children[1].children[1].onclick();
  assert.deepEqual(calls,[['openWarPanel'],['openStrategicMap',river]]);
  const roster=nodes.guildMembers.children[0],battle=nodes.gdBattles.children[0];
  ctx.territoryState.warTimes[moon].phaseEndsAt=2100;
  ctx.renderGuild();
  assert.equal(nodes.guildMembers.children[0],roster);
  assert.equal(nodes.gdBattles.children[0],battle);
  ctx.territoryState.engagements=[];
  ctx.territoryState.warTimes[moon].phase='protected';
  ctx.renderGuild();
  assert.equal(nodes.guildMembers.children[0],roster);
  assert.match(nodes.gdBattles.children[0].textContent,/ไม่มีศึก/);
  assert.match(nodes.gdForts.children[0].children[0].children[1].textContent,/คุ้มครอง/);
});

test('the selected city opens matching services and the back action restores the territory tab and focus',()=>{
  const {ctx,nodes,calls,focused,moon,river}=fixture();
  ctx.openGuild();
  nodes.guildBrowseCities.onclick();
  assert.equal(focused(),nodes.guildTerritoryTab);
  assert.equal(nodes.guildSitePanel.hidden,true);
  nodes.gdForts.children[0].children[1].onclick();
  assert.equal(nodes.guildSitePanel.hidden,false);
  assert.equal(nodes.guildSiteName.textContent,'จันทรา');
  assert.equal(nodes.guildSitePhase.textContent,'กำลังรบ');
  assert.equal(nodes.guildSiteOwner.textContent,'ผู้ครอง · กิลด์ศิลา');
  assert.equal(focused(),nodes.guildSiteName);
  assert.equal(nodes.gdForts.children[0].children[1].getAttribute('aria-pressed'),'true');
  for(const [id,action,target] of [
    ['guildSiteWarehouse','openCityProduction','warehouse'],
    ['guildSiteFactory','openCityProduction','factory'],
    ['guildSiteMarket','openCityMarket'],
    ['guildSiteMissions','openCityMission'],
    ['guildSiteHall','openCityGovernance'],
  ]){
    assert.equal(nodes[id].hidden,false,id);
    nodes[id].onclick();
    const [method,...args]=calls.at(-1),navigation=args.at(-1);
    assert.equal(method,action);
    assert.equal(navigation.site,moon);
    if(target)assert.equal(args[0],target);
    navigation.back();
    assert.equal(nodes.guildTerritoryTab.getAttribute('aria-selected'),'true');
    assert.equal(nodes.guildSitePanel.dataset.site,moon);
    assert.equal(focused(),nodes.guildSiteName);
  }
  nodes.guildSiteTravel.onclick();
  assert.equal(calls.at(-1)[0],'openWarPanel');
  calls.at(-1)[1]();
  nodes.gdOtherForts.children[0].children[1].onclick();
  assert.equal(nodes.guildSitePanel.dataset.site,river);
  assert.equal(nodes.guildSiteWarehouse.hidden,true);
  assert.equal(nodes.guildSiteFactory.hidden,true);
  assert.equal(nodes.guildSiteLocation.hidden,false);
  assert.equal(nodes.guildSiteHall.hidden,true);
  assert.equal(nodes.guildSiteMissions.textContent,'งานระหว่างเมือง');
  nodes.guildSiteTravel.onclick();
  assert.deepEqual(calls.at(-1).slice(0,2),['openStrategicMap',river]);
  calls.at(-1)[2]();
  assert.equal(nodes.guildOtherSites.open,true);
  assert.equal(nodes.guildSitePanel.dataset.site,river);
});

test('roster search, recruitment permissions and city access follow live guild state',()=>{
  const {ctx,nodes,sends,moon}=fixture('member');
  ctx.openGuild();
  assert.equal(nodes.guildApplicationBadge.hidden,true);
  assert.equal(nodes.guildApplicationsArea.hidden,true);
  nodes.guildTerritoryTab.onclick();
  nodes.gdForts.children[0].children[1].onclick();
  assert.equal(nodes.guildSiteHall.hidden,true);
  assert.equal(nodes.guildSiteMarket.hidden,false);
  assert.equal(nodes.guildSiteMissions.hidden,false);
  nodes.guildMemberSearch.value='นที';
  nodes.guildMemberSearch.oninput();
  assert.equal(nodes.guildMembers.children.filter(row=>!row.hidden).length,1);
  nodes.guildOnlineOnly.checked=true;
  nodes.guildOnlineOnly.onchange();
  assert.equal(nodes.guildRosterEmpty.hidden,false);
  ctx.guildState.ownId='chief';
  ctx.renderGuild();
  assert.equal(nodes.guildSiteHall.hidden,false);
  assert.equal(nodes.guildApplicationBadge.textContent,'1');
  assert.equal(nodes.guildApplicationBadge.hidden,false);
  nodes.guildApplications.children[0].children[1].children[0].onclick();
  assert.deepEqual(sends.at(-1),['guild_application_decide',{id:'application',accept:true}]);
  ctx.territoryState.owners[moon]='กิลด์คู่แข่ง';
  ctx.room.state.cityMarketSupported=false;
  ctx.renderGuild();
  assert.equal(nodes.guildSitePanel.dataset.site,moon);
  assert.equal(nodes.guildSiteOwner.textContent,'ผู้ครอง · กิลด์คู่แข่ง');
  assert.equal(nodes.guildSiteHall.hidden,true);
  assert.equal(nodes.guildSiteMarket.hidden,true);
  assert.equal(nodes.guildTerritoryTab.getAttribute('aria-selected'),'true');
  ctx.guildState=null;
  ctx.renderGuild();
  assert.equal(nodes.guildMemberArea.hidden,true);
  assert.equal(nodes.guildCreateArea.hidden,false);
  assert.equal(nodes.guildCityRecovery.hidden,false);
  nodes.guildName.value=' กิลด์ใหม่ ';
  nodes.guildCreate.onclick();
  assert.deepEqual(sends.at(-1),['guild_create',{name:'กิลด์ใหม่'}]);
});
