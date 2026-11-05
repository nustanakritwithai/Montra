/** Pin the exact product bytes reviewed for the separate QA branch. Run before adding QA-only files. */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
const root=path.resolve(process.argv[2]||'.');
const productCommit=execFileSync('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
const productTree=execFileSync('git',['-C',root,'rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim();
const files=['main.js','styles.css','index.html','account-entry.js','audio.js',...(await readdir(path.join(root,'deploy/combat'))).filter(x=>x.endsWith('.ts')&&!x.endsWith('.test.ts')).map(x=>'deploy/combat/'+x)];
execFileSync('git',['-C',root,'diff','--quiet','HEAD','--',...files]);
const sha256={};for(const name of files)sha256[name]=createHash('sha256').update(await readFile(path.join(root,name))).digest('hex');
await writeFile(path.join(import.meta.dirname,'product.json'),JSON.stringify({productCommit,productTree,sha256},null,2)+'\n');
console.log('Pinned',productCommit,files.length,'source files');
