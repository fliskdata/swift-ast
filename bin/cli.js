#!/usr/bin/env node
import { parseSwiftAst } from '../dist/index.js';
import fs from 'node:fs';

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: @flisk/swift-ast <file.swift>');
    process.exit(1);
  }
  if (!fs.existsSync(file)) {
    console.error(`Error: The file "${file}" does not exist.`);
    process.exit(1);
  }
  try {
    const source = fs.readFileSync(file, 'utf8');
    const ast = await parseSwiftAst(source);
    console.log(JSON.stringify(ast, null, 2));
  } catch (err) {
    console.error(`Error parsing the file: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
