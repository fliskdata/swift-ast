import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WASI } from 'node:wasi';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const WASM_PATH = process.env.SWIFT_AST_WASM_PATH ??
  require.resolve('../wasm/swift_ast_wasi.wasm');

let _instance: WebAssembly.Instance | null = null;
let _memory: WebAssembly.Memory | null = null;
let _wasi: WASI | null = null;
let _workDir: string | null = null;

export async function getInstance() {
  if (_instance) {
    return { instance: _instance, memory: _memory!, wasi: _wasi!, workDir: _workDir! };
  }

  _workDir = await fs.mkdtemp(join(tmpdir(), 'swift-ast-'));
  _wasi = new WASI({
    version: 'preview1',
    preopens: { '/work': _workDir },
    env: {}
  });

  const wasmBytes = await fs.readFile(WASM_PATH);
  const imports = { wasi_snapshot_preview1: _wasi.wasiImport } as any;

  const module = await WebAssembly.compile(wasmBytes as unknown as BufferSource);
  _instance = await WebAssembly.instantiate(module, imports);

  // Reactor-friendly: initialize runtime components (TLS/heap). Safe to call once.
  _wasi.initialize(_instance);

  const exp = _instance.exports as any;
  _memory = exp.memory as WebAssembly.Memory;

  return { instance: _instance, memory: _memory!, wasi: _wasi!, workDir: _workDir! };
}

export function u8(ptr: number, len: number, memory: WebAssembly.Memory) {
  return new Uint8Array(memory.buffer, ptr, len);
}
