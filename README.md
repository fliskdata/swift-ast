# @flisk/swift-ast

Swift AST parsing in JavaScript via WebAssembly (WASM), powered by SwiftSyntax + SwiftParser.

[![NPM version](https://img.shields.io/npm/v/@flisk/swift-ast.svg)](https://www.npmjs.com/package/@flisk/swift-ast) [![Tests](https://github.com/fliskdata/swift-ast/actions/workflows/checks.yml/badge.svg?branch=main)](https://github.com/fliskdata/swift-ast/actions/workflows/checks.yml)

## Introduction

This package compiles SwiftSyntax + SwiftParser to a WASI module and exposes a simple JavaScript API to parse Swift source into a compact JSON AST. On top of that, it provides a lightweight analyzer (inspired by Ruby Prism’s ergonomics) to:

- extract declarations (functions, methods, classes, structs, enums, variables)
- find and inspect function/method calls
- follow simple identifier references within lexical scope
- surface naive type hints where present (e.g., `let x: Int`)

It’s designed for program analysis pipelines like `fliskdata/analyze-tracking` and can also be used as a CLI with `npx`.

## Quick Start (CLI)

Run without installing:

```bash
npx @flisk/swift-ast /path/to/file.swift
```

This prints the parsed AST JSON to stdout.

## Install

```bash
npm i @flisk/swift-ast
```

## Programmatic API

### Parse to JSON AST

```ts
import { parseSwiftAst } from '@flisk/swift-ast';

const source = `
struct Foo {
  let x: Int
  func bar(_ y: Int) -> Int { x + y }
}
`;

const ast = await parseSwiftAst(source);
console.dir(ast, { depth: null });
```

AST shape (simplified):

```json
{
  "root": 0,
  "nodes": [
    { "kind": "SourceFileSyntax", "range": { "start": {"offset":0}, "end": {"offset":123} } },
    { "kind": "StructDeclSyntax", "name": "Foo", "range": { /* ... */ } },
    { "kind": "FunctionDeclSyntax", "name": "bar", "range": { /* ... */ } }
  ],
  "edges": [[0,1],[1,2]]
}
```

There’s also a convenience for file-based parsing:

```ts
import { parseSwiftFile } from '@flisk/swift-ast';
const astFromFile = await parseSwiftFile('path/to/file.swift');
```

### AST analyzer

```ts
import { analyzeAst } from '@flisk/swift-ast';

const analysis = analyzeAst(ast, source);

// All declarations by name
console.log([...analysis.byName.keys()]);

// All calls to a function/method named "track"
const calls = analysis.findCallsByName('track');
for (const c of calls) {
  console.log({ name: c.name, receiver: c.receiver, args: c.argsCount, at: c.range.start });
}

// Resolve a simple name to its symbol (best-effort)
const symbol = analysis.resolveNameAt('bar', /*offset*/ 0);
console.log(symbol?.kind, symbol?.name);
```

Analyzer return type (high-level):

```ts
type Analysis = {
  symbols: Map<number, SymbolInfo>;
  calls: CallInfo[];
  refs: RefInfo[];
  byName: Map<string, number[]>;
  findCallsByName(name: string): CallInfo[];
  resolveNameAt(name: string, offset: number): SymbolInfo | undefined;
}
```

Notes:
- The analyzer is syntax-driven (no full type-checker). Name resolution is lexical and best-effort.
- Variable type annotations (e.g., `let x: Int`) are extracted where present; inferred types are not computed.

## CLI usage

```bash
# Print AST JSON
npx @flisk/swift-ast /path/to/file.swift

# With a local install
swift-ast /path/to/file.swift > ast.json
```

## Recipes

- **List all class/struct names**

```ts
const decls = [...analysis.symbols.values()].filter(s => s.kind === 'class' || s.kind === 'struct');
console.log(decls.map(d => d.name));
```

- **Find all callsites of a specific API (e.g., analytics)**

```ts
const hits = analysis.findCallsByName('track');
for (const call of hits) {
  // receiver could be an instance, a type, or omitted
  console.log(`${call.receiver ? call.receiver + '.' : ''}${call.name} at ${call.range.start.line}:${call.range.start.column}`);
}
```

- **Get naive type info for variables**

```ts
const vars = [...analysis.symbols.values()].filter(s => s.kind === 'variable');
for (const v of vars) {
  console.log(v.name, '::', v.typeAnnotation ?? '(inferred)');
}
```

## Environment

- Node >= 18 (uses built-in `node:wasi`).
- No native Swift toolchain required at runtime; the Wasm binary ships with the npm package.

## Development (for contributors)

1. Install Swift via [swiftly](https://www.swift.org/install)
2. Install Swift 6.2: `swiftly install 6.2`
3. Select Swift 6.2: `swiftly use 6.2`
4. Install Swift SDK for WASI: 
```bash
swift sdk install https://download.swift.org/swift-6.2-release/wasm/swift-6.2-RELEASE/swift-6.2-RELEASE_wasm.artifactbundle.tar.gz --checksum fe4e8648309fce86ea522e9e0d1dc48e82df6ba6e5743dbf0c53db8429fb5224
```
5. Run `swift sdk list` and ensure that `SWIFT_SDK_ID` is set to the appropriate SDK.
6. Build the WASM binary: `npm run build`
7. Run tests: `npm test`

Note: SwiftSyntax version is tied to the Swift toolchain used to build the WASM. If you rebuild locally, ensure a matching `swift-syntax` tag for your toolchain.
