const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'../..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const manifest=JSON.parse(read('assets/items/manifest.json')),source=read('src/client/ui/030-item-art-and-comparison.js'),css=read('styles.css');
assert.equal(manifest.cells.length,144);assert.equal(new Set(manifest.cells.map(c=>c.key)).size,144);
const start=source.indexOf('  const itemSheetExact'),end=source.indexOf('  // One read-only item thumbnail');assert(start>=0&&end>start);
const art=vm.runInNewContext(source.slice(start,end)+'\ngetItemArtKey',{POTION_ITEM_ID:'health_potion',SHRINE_SHARD:'shrine_shard'});
let count=0;
for(const cell of manifest.cells){
  const bytes=fs.readFileSync(path.join(root,cell.file));assert.equal(bytes.length,cell.bytes);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),cell.sha256,cell.key);
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
  const sheet=manifest.sheets.find(s=>s.id===cell.sheet),[x,y,w,h]=cell.crop;
  assert([x,y,w,h].every(Number.isInteger));assert(x>=0&&y>=0&&w>0&&h>0&&x+w<=sheet.width&&y+h<=sheet.height);
  if(cell.status!=='canonical'){assert(!css.includes('data-item-art="sheet_'+cell.key+'"'));continue;}
  count++;assert(css.includes('data-item-art="sheet_'+cell.key+'"'));assert(css.includes('./'+cell.file+'?v='+cell.sha256.slice(0,12)));
  for(const id of cell.exactIds)assert.equal(art(id,null),'sheet_'+cell.key,id);
  for(const family of cell.families)assert.equal(art(family+'_1',{family,kind:'material'}),'sheet_'+cell.key,family);
}
assert.equal(count,118);
assert.equal(art('arm_field_seer_2',{family:'arm_cloth_head',path:'seer',kind:'head'}),'sheet_arm_cloth_head');
assert.equal(art('arm_field_seer_9',{family:'arm_cloth_legs',path:'seer',kind:'legs'}),'armor_legs');
assert.equal(art('health_potion',null),'sheet_use_herbal');
assert.equal(art('unrecognized',null),'');
assert.equal(art(null,null),'');
console.log('PASS 144 item cells, 118 reviewed mappings, exact hashes and class-equipment fallback');
