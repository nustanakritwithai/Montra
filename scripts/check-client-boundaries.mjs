import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareClient, clientRoot } from './build-client.mjs';

// Verification only: reuse the locked server-test parser. The builder and its
// check mode remain dependency-free and do not use TypeScript or a bundler.
const require = createRequire(join(clientRoot, 'combat-verify/package.json'));
const ts = require('typescript');
const text = prepareClient().toString('utf8');
const ast = ts.createSourceFile('main.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
assert.equal(ast.parseDiagnostics.length, 0, 'Client must parse without recovery');
assert.equal(ast.statements.length, 1, 'Preserve one outer IIFE statement');
const statement = ast.statements[0];
assert(ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression));
const expression = statement.expression.expression;
assert(ts.isParenthesizedExpression(expression) && ts.isArrowFunction(expression.expression));
const body = expression.expression.body;
assert(ts.isBlock(body), 'Expected original IIFE block');
const manifest = JSON.parse(readFileSync(join(clientRoot, 'src/client/manifest.json')));
let offset = 0;
for (let index = 0; index < manifest.fragments.length; index++) {
  if (index === 1) assert.equal(offset, body.getStart(ast) + 2, 'Opening fragment must end after the IIFE opening brace and newline');
  else if (index === manifest.fragments.length - 1) assert.equal(offset, body.end - 1, 'Closing fragment must start at the IIFE closing brace');
  else if (index > 1) {
    const next = body.statements.findIndex(node => node.getStart(ast) >= offset);
    assert(next > 0, `No next top-level statement for ${manifest.fragments[index]}`);
    assert(body.statements[next - 1].end <= offset, `Fragment splits a statement: ${manifest.fragments[index]}`);
    // A cut may include whole leading comments, but may not split a token/comment.
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);
    scanner.setTextPos(body.statements[next - 1].end);
    while (scanner.getTextPos() < offset) {
      scanner.scan();
      assert(scanner.getTextPos() <= offset, `Fragment splits trivia: ${manifest.fragments[index]}`);
    }
  }
  offset += readFileSync(join(clientRoot, 'src/client', manifest.fragments[index]), 'utf8').length;
}
assert.equal(offset, text.length);
console.log(`PASS ${manifest.fragments.length} fragments: all interior cuts are between ${body.statements.length} top-level IIFE statements (TypeScript ${ts.version})`);
