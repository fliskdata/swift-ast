# @flisk/swift-ast

Swift AST parsing in Node via WebAssembly (WASI), powered by SwiftSyntax + SwiftParser.

## Quick Start

Run without installation! Just use:

```bash
npx @flisk/swift-ast /path/to/file.swift
```

## Install

```bash
npm i @flisk/swift-ast
```

## Usage

```ts
import { parseSwiftAst } from '@flisk/swift-ast';

const ast = await parseSwiftAst(`
struct Foo {
  let x: Int
  func bar(_ y: Int) -> Int { x + y }
}
`);

console.dir(ast, { depth: null });
```

## Environment

- Node >= 18 (uses built-in `node:wasi`).
- No native Swift toolchain required at runtime; the Wasm binary ships with the npm package.

## Notes

- SwiftSyntax version is tied to the Swift toolchain used to build the Wasm. If you rebuild locally, ensure a matching `swift-syntax` tag for your toolchain.

## Development

1. Install Swift via [swiftly](https://www.swift.org/install)
2. Install Swift 6.2: `swiftly install 6.2`
3. Select Swift 6.2: `swiftly use 6.2`
4. Install Swift SDK for WASI: 
```bash
swift sdk install https://download.swift.org/swift-6.2-release/wasm/swift-6.2-RELEASE/swift-6.2-RELEASE_wasm.artifactbundle.tar.gz --checksum fe4e8648309fce86ea522e9e0d1dc48e82df6ba6e5743dbf0c53db8429fb5224
```
5. Run `swift sdk list` and ensure that `SWIFT_SDK_ID` is set to the appropriate SDK.
6. Build the WASM binary: `npm run build`
