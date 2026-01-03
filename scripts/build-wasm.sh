#!/usr/bin/env bash
set -euo pipefail

# Build SwiftSyntax+SwiftParser to WebAssembly (WASI Reactor)
# Prereqs (one-time): install Swift 6.x toolchain (see README.md for instructions)

SWIFT_SDK_ID=${SWIFT_SDK_ID:-"$(swift sdk list | grep '^swift-.*_wasm$' | head -n 1 | cut -d' ' -f1)"}
echo "Using Swift SDK: $SWIFT_SDK_ID"

pushd swift >/dev/null
swift build -c release \
  --swift-sdk "$SWIFT_SDK_ID" \
  -Xswiftc -Xclang-linker -Xswiftc -mexec-model=reactor
popd >/dev/null

mkdir -p wasm
# SwiftPM artifact path for wasm target
cp swift/.build/wasm32-unknown-wasip1/release/SwiftAstWasm.wasm wasm/swift_ast_wasi.wasm

# Compress for distribution (reduces ~83MB to ~26MB)
gzip -k -f -9 wasm/swift_ast_wasi.wasm

echo "Built wasm -> wasm/swift_ast_wasi.wasm ($(du -h wasm/swift_ast_wasi.wasm | cut -f1))"
echo "Compressed -> wasm/swift_ast_wasi.wasm.gz ($(du -h wasm/swift_ast_wasi.wasm.gz | cut -f1))"
