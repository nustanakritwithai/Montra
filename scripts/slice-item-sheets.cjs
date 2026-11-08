/** Deterministic slicing of user-supplied item sheets. Not part of the game runtime.
 * Usage: node scripts/slice-item-sheets.cjs SOURCE_DIRECTORY
 * Requires sharp 0.35.5. Original sheets remain outside the published game.
 * The checked-in manifest pins original bytes, exact crop boxes, and outputs.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const sharp = require('sharp');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function main() {
  const source = process.argv[2];
  assert(source && process.argv.length === 3, 'Pass the source sheet directory');
  assert.equal(sharp.versions.sharp, '0.35.5', 'Use the reviewed image encoder');
  const file = path.join(root, 'assets/items/manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const sheet of manifest.sheets) {
    const bytes = fs.readFileSync(path.join(source, sheet.filename));
    assert.equal(hash(bytes), sheet.sha256, 'Source sheet changed: ' + sheet.id);
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.width, sheet.width); assert.equal(metadata.height, sheet.height);
    for (const cell of manifest.cells.filter(cell => cell.sheet === sheet.id)) {
      const [left, top, width, height] = cell.crop;
      const output = await sharp(bytes).extract({left, top, width, height})
        .resize(240, 240, {fit:'contain', background:{r:0,g:0,b:0,alpha:0}})
        .extend({top:8,bottom:8,left:8,right:8,background:{r:0,g:0,b:0,alpha:0}})
        .webp({quality:90,alphaQuality:100,effort:6}).toBuffer();
      assert.equal(hash(output), cell.sha256, 'Output changed: ' + cell.key);
      fs.writeFileSync(path.join(root, cell.file), output);
    }
  }
  console.log('Verified and sliced ' + manifest.cells.length + ' item cells');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
