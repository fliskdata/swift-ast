# WASI execution model

- Target: `wasm32-unknown-wasi` (Swift 6.x SDK). Reactor exec model to export functions.
- Exports:
  - `alloc(size) -> ptr`, `dealloc(ptr,size)` for passing strings.
  - `parse_source(ptr,len,out_ptr_ptr,out_len_ptr) -> int`.
  - `parse_file(path_ptr,path_len,out_ptr_ptr,out_len_ptr) -> int` using a preopened `/work` dir.

## Memory protocol

1. JS encodes UTF-8 source, calls `alloc(n)`, writes into Wasm memory.
2. JS calls `parse_source`.
3. Swift allocates a new UTF-8 JSON buffer and writes `(ptr,len)` into the out params.
4. JS copies JSON, then calls `dealloc` on the returned pointer.

## Locations

We include a compact `range` object with line/column/offset using `SourceLocationConverter`. Token nodes include `tokenText`.
