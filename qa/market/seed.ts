/** Disposable two-account fixture and read-only durable assertions. Never opens a live store. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
const rootInput = process.env.MONTRA_TEST_DIR;
assert(rootInput && path.isAbsolute(rootInput));
assert(path.basename(rootInput).startsWith('montra-market-test-'));
mkdirSync(rootInput, { recursive:true, mode:0o700 });
const root=realpathSync(rootInput), directory=path.join(root,'characters'), fixtureFile=path.join(root,'fixture.json');
assert.equal(path.resolve(process.env.MONTRA_CHARACTER_DIR||''), directory);
assert.equal(process.env.MONTRA_ECONOMY_ENABLED,'1');
assert.equal(process.env.MONTRA_WORLD_EXPANSION,'1');
assert.notEqual(process.env.MONTRA_ACCOUNTS_REQUIRED,'0');
const mode=process.argv[2]||'seed';
assert(['seed','inspect','verify','pagination'].includes(mode));
mkdirSync(directory,{recursive:true,mode:0o700});
assert.equal(realpathSync(directory),directory);
if(mode==='pagination') {
  // Additional catalog-only fixture after the browser sale has been verified.
  // Reuse the seller account's two unused character slots, never a real user.
  const f=JSON.parse(readFileSync(fixtureFile,'utf8'));
  const check=new DatabaseSync(f.database.economy,{readOnly:true});
  try{assert.equal(check.prepare('SELECT COUNT(*) AS n FROM listings').get()!.n,4);assert.equal(check.prepare("SELECT COUNT(*) AS n FROM receipts WHERE kind='buy'").get()!.n,1);}finally{check.close();}
  const {accounts}=await import('./rooms/AccountService.js');
  const {characterStore}=await import('./rooms/CharacterStore.js');
  const {makeClassInventory,equippedStats,gearMana}=await import('./rooms/ItemRules.js');
  const {calculateStats,emptyAllocations}=await import('./rooms/Progression.js');
  const {serviceNpcsFor}=await import('./rooms/ServiceNpcs.js');
  const {groundAt}=await import('./rooms/WorldMaps.js');
  const {randomUUID}=await import('node:crypto');
  try{
    const identity=accounts().resolve(f.actors.seller.session);assert(identity);
    const npc=serviceNpcsFor('ritual_village').find(n=>n.role==='smith');assert(npc);
    for(const [index,amount]of [[1,20],[2,11]]){
      const characterId=identity.characterIds[index],inventory=makeClassInventory('blade');
      inventory.slots[2]={itemId:'mat_herb_1',quantity:amount};
      const statAllocations=emptyAllocations(),stats=equippedStats(calculateStats(1,statAllocations),inventory);
      await characterStore.save({version:1,id:characterId,name:'Catalog QA '+index,level:1,experience:0,pkKills:0,pkDeaths:0,x:npc.x,y:groundAt('ritual_village',npc.x,npc.z),z:npc.z,mapId:'ritual_village',hp:stats.maxHp,stamina:stats.maxStamina,mana:gearMana(1,inventory).max,statAllocations,build:{path:'blade',ancestry:'woodland',bladeTalent:'steady'},inventory,updatedAt:new Date().toISOString()});
      for(let i=0;i<amount;i++)characterStore.economy.listItem(characterId,randomUUID(),2,1,10+index*20+i);
    }
    console.log(JSON.stringify({ok:true,stage:'pagination-fixture',addedSyntheticListings:31,expectedOpenListings:33}));
  }finally{characterStore.close();accounts().close();}
} else if(mode!=='seed') {
  const f=JSON.parse(readFileSync(fixtureFile,'utf8'));
  assert.equal(f.database.economy,path.join(directory,'economy.sqlite'));
  const db=new DatabaseSync(f.database.economy,{readOnly:true});
  try {
    const roleFor=(id:any)=>Object.keys(f.actors).find(role=>f.actors[role].characterId===id)||'unknown';
    const accounts=Object.fromEntries(Object.entries(f.actors).map(([role,actor]:[string,any])=>{
      const row=db.prepare('SELECT gold,inventory FROM accounts WHERE id=?').get(actor.characterId)!;
      assert(row);const inventory=JSON.parse(String(row.inventory));
      const quantities:any={};for(const stack of inventory.slots)if(stack)quantities[stack.itemId]=(quantities[stack.itemId]||0)+stack.quantity;
      return [role,{gold:row.gold,quantities,inventory}];
    }));
    const listings=db.prepare('SELECT id,seller,item,price,state FROM listings ORDER BY rowid').all().map(row=>({id:row.id,seller:roleFor(row.seller),item:JSON.parse(String(row.item)),price:row.price,state:row.state}));
    const receipts=db.prepare('SELECT actor,kind,result FROM receipts ORDER BY rowid').all().map(row=>({actor:roleFor(row.actor),kind:row.kind,result:JSON.parse(String(row.result))}));
    if(mode==='verify') {
      assert.equal(accounts.seller.gold,1210);assert.equal(accounts.buyer.gold,790);
      assert.equal(accounts.seller.quantities.health_potion,1);
      assert.equal(accounts.seller.quantities.mat_raw_wood_1,3);
      assert.equal(accounts.seller.quantities.mat_raw_stone_1,4);
      assert.equal(accounts.seller.quantities.arcane_sword,undefined);
      assert.equal(accounts.buyer.quantities.health_potion,3);
      assert.equal(accounts.buyer.quantities.mat_raw_wood_1,3);
      assert.equal(listings.length,4);
      assert.equal(listings.filter(x=>x.state==='sold').length,1);
      assert.equal(listings.find(x=>x.state==='sold')?.item.itemId,'mat_raw_wood_1');
      assert.equal(listings.find(x=>x.state==='sold')?.item.quantity,3);
      assert.equal(listings.filter(x=>x.state==='cancelled').length,1);
      assert.equal(listings.find(x=>x.state==='cancelled')?.item.itemId,'mat_raw_stone_1');
      assert.equal(listings.filter(x=>x.state==='open').length,2);
      assert.equal(receipts.filter(x=>x.kind==='list').length,4);
      assert.equal(receipts.filter(x=>x.kind==='buy').length,1);
      assert.equal(receipts.filter(x=>x.kind==='cancel').length,1);
      for(const [role,actor] of Object.entries(f.actors) as [string,any][]) {
        const snapshot=db.prepare('SELECT snapshot FROM characters WHERE id=?').get(actor.characterId)!;
        assert(snapshot);assert.deepEqual(JSON.parse(String(snapshot.snapshot)).inventory,accounts[role].inventory);
      }
    }
    // Only synthetic, non-credential transaction facts enter the report.
    console.log(JSON.stringify({ok:true,stage:mode,accounts,listings,receipts}));
  }finally{db.close();}
} else {
  assert(!existsSync(fixtureFile),'Refusing to overwrite fixture');
  assert.equal(readdirSync(directory).length,0,'Refusing to seed existing character data');
  const {accounts}=await import('./rooms/AccountService.js');
  const {characterStore}=await import('./rooms/CharacterStore.js');
  const {makeClassInventory,equippedStats,gearMana}=await import('./rooms/ItemRules.js');
  const {calculateStats,emptyAllocations}=await import('./rooms/Progression.js');
  const {serviceNpcsFor}=await import('./rooms/ServiceNpcs.js');
  const {groundAt}=await import('./rooms/WorldMaps.js');
  try {
    const fixture:any={version:1,actors:{},database:{economy:path.join(directory,'economy.sqlite'),accounts:path.join(directory,'player-accounts.sqlite')}};
    const npc=serviceNpcsFor('ritual_village').find(n=>n.role==='smith');assert(npc);
    for(const role of ['seller','buyer']) {
      const credentials=accounts().createGuest(),identity=accounts().resolve(credentials.session);assert(identity?.guest);
      const characterId=identity.characterIds[0],inventory=makeClassInventory('blade');
      if(role==='seller') {
        inventory.slots[2]={itemId:'mat_raw_wood_1',quantity:6};
        inventory.slots[3]={itemId:'mat_raw_stone_1',quantity:4};
        inventory.slots[4]={itemId:'arcane_sword',quantity:1};
      }
      const allocations=emptyAllocations(),stats=equippedStats(calculateStats(1,allocations),inventory),name=role==='seller'?'Market QA Seller':'Market QA Buyer';
      await characterStore.save({version:1,id:characterId,name,level:1,experience:0,pkKills:0,pkDeaths:0,
        x:npc.x,y:groundAt('ritual_village',npc.x,npc.z),z:npc.z,mapId:'ritual_village',hp:stats.maxHp,stamina:stats.maxStamina,mana:gearMana(1,inventory).max,
        statAllocations:allocations,build:{path:'blade',ancestry:'woodland',bladeTalent:'steady'},inventory,updatedAt:new Date().toISOString()});
      assert.equal(characterStore.economy.getAccount(characterId).gold,1000);
      fixture.actors[role]={...credentials,characterId,characterSlot:1,characterName:name};
    }
    fixture.orders=[{slot:0,itemId:'health_potion',amount:2,price:200},{slot:2,itemId:'mat_raw_wood_1',amount:3,price:210},{slot:3,itemId:'mat_raw_stone_1',amount:1,price:30},{slot:4,itemId:'arcane_sword',amount:1,price:400}];
    writeFileSync(fixtureFile,JSON.stringify(fixture,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log(JSON.stringify({ok:true,stage:'seeded',accounts:2,orders:fixture.orders}));
  }finally{characterStore.close();accounts().close();}
}
