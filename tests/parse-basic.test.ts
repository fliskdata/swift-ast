import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { parseSwiftAst } from '../dist/index.js';

const FIX_DIR = join(process.cwd(), 'tests', 'fixtures');
const SIMPLE_FILE = join(FIX_DIR, 'simple.swift');
const SIMPLE_SWIFT = await fs.readFile(SIMPLE_FILE, 'utf8');

test('parseSwiftAst parses inline source', async () => {
  const ast = await parseSwiftAst(SIMPLE_SWIFT);
  assert.ok(ast);
  assert.ok(Array.isArray(ast.nodes));
  assert.ok(ast.nodes.length > 0);
});

test('parseSwiftAst parses file contents', async () => {
  const src = await fs.readFile(SIMPLE_FILE, 'utf8');
  const ast = await parseSwiftAst(src);
  assert.ok(ast);
  assert.ok(Array.isArray(ast.nodes));
  assert.ok(ast.nodes.some((n: any) => n.kind === 'StructDeclSyntax'));
});
