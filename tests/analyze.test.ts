import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { parseSwiftAst, analyzeAst } from '../dist/index.js';

const FIX_DIR = join(process.cwd(), 'tests', 'fixtures');
const FILE = join(FIX_DIR, 'analyze.swift');

const SOURCE = `
struct Foo {
  let x: Int
  func bar(_ y: Int) -> Int { x + y }
}

func bar(_ n: Int) -> Int { n * 2 }

let a = Foo()
let b = bar(3)
let c = a.bar(4)
`;

await fs.mkdir(FIX_DIR, { recursive: true });
await fs.writeFile(FILE, SOURCE, 'utf8');

test('analyzeAst extracts symbols and calls', async () => {
  const ast = await parseSwiftAst(SOURCE);
  const analysis = analyzeAst(ast, SOURCE);

  // Symbols
  const names = Array.from(analysis.byName.keys());
  assert.ok(names.includes('Foo'));
  assert.ok(names.includes('bar'));

  // Calls
  const callsBar = analysis.findCallsByName('bar');
  assert.ok(callsBar.length >= 2);
  // At least one receiver-less and one with receiver
  assert.ok(callsBar.some(c => !c.receiver));
  assert.ok(callsBar.some(c => c.receiver === 'a'));
});
