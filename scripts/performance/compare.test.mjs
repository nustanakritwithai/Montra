import test from 'node:test';
import assert from 'node:assert/strict';
import {summary,scripts} from './compare.mjs';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('summary is deterministic and rejects missing evidence',()=>{assert.deepEqual(summary([4,1,3,2]),{n:4,min:1,median:3,p95:4,max:4});assert.throws(()=>summary([]));assert.throws(()=>summary([NaN]));});
test('only shipped local scripts are counted, query ignored',()=>{const dir=mkdtempSync(join(tmpdir(),'montra-perf-test-'));try{writeFileSync(join(dir,'index.html'),'<script src="https://example.com/a.js"></script><script defer src="./main.js?v=1"></script>');writeFileSync(join(dir,'main.js'),'void 0;');const list=scripts(dir);assert.equal(list.length,1);assert.equal(list[0].bytes,7);assert.equal(list[0].sha256.length,64);}finally{rmSync(dir,{recursive:true});}});
