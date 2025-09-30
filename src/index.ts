import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { getInstance, u8 } from './wasi-loader.js';
export * from './analyze.js';

type WasmExports = {
  memory: WebAssembly.Memory;
  alloc(size: number): number;
  dealloc(ptr: number, size: number): void;
  parse_source(inPtr: number, inLen: number, outPtrPtr: number, outLenPtr: number): number;
  parse_file(pathPtr: number, pathLen: number, outPtrPtr: number, outLenPtr: number): number;
};

function enc(str: string) { return new TextEncoder().encode(str); }
function dec(bytes: Uint8Array) { return new TextDecoder().decode(bytes); }

async function callParse(kind: 'source'|'file', payload: string): Promise<string> {
  const { instance, memory, workDir } = await getInstance();
  const exp = instance.exports as unknown as WasmExports;

  const input = enc(payload);
  const inPtr = exp.alloc(input.length);
  u8(inPtr, input.length, memory).set(input);

  const outBufPtr = exp.alloc(8); // two i32s: ptr + len

  let rc = 1;
  if (kind === 'source') {
    rc = exp.parse_source(inPtr, input.length, outBufPtr, outBufPtr + 4);
  } else {
    const p = join(workDir!, 'input.swift');
    await fs.writeFile(p, payload, 'utf8');
    const pathBytes = enc('/work/input.swift');
    const pPtr = exp.alloc(pathBytes.length);
    u8(pPtr, pathBytes.length, memory).set(pathBytes);
    rc = exp.parse_file(pPtr, pathBytes.length, outBufPtr, outBufPtr + 4);
    exp.dealloc(pPtr, pathBytes.length);
  }

  // Memory may have grown during parsing, which detaches previous ArrayBuffers.
  // Recreate views AFTER parse_* returns to avoid detached buffers.
  const dv = new DataView(memory.buffer);
  const outPtr = dv.getUint32(outBufPtr, true);
  const outLen = dv.getUint32(outBufPtr + 4, true);

  exp.dealloc(outBufPtr, 8);
  exp.dealloc(inPtr, input.length);

  if (rc !== 0) {
    const msg = outPtr && outLen ? dec(u8(outPtr, outLen, memory)) : `code=${rc}`;
    if (outPtr && outLen) exp.dealloc(outPtr, outLen);
    throw new Error(`swift-ast parse error: ${msg}`);
  }

  const json = dec(u8(outPtr, outLen, memory));
  exp.dealloc(outPtr, outLen);
  return json;
}

export async function parseSwiftAst(source: string): Promise<any> {
  try {
    const json = await callParse('source', source);
    return JSON.parse(json);
  } catch {
    const json = await callParse('file', source);
    return JSON.parse(json);
  }
}

export async function parseSwiftFile(filePath: string): Promise<any> {
  const content = await fs.readFile(filePath, 'utf8');
  const json = await callParse('file', content);
  return JSON.parse(json);
}
