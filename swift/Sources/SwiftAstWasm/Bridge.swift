import Foundation
#if canImport(WASILibc)
import WASILibc
#endif

@_expose(wasm, "alloc")
@_cdecl("alloc")
public func wasm_alloc(_ size: Int32) -> UnsafeMutablePointer<UInt8>? {
  guard size > 0 else { return nil }
  #if canImport(WASILibc)
  let raw = WASILibc.malloc(Int(size))
  #else
  let raw = malloc(Int(size))
  #endif
  return raw?.bindMemory(to: UInt8.self, capacity: Int(size))
}

@_expose(wasm, "dealloc")
@_cdecl("dealloc")
public func wasm_dealloc(_ ptr: UnsafeMutablePointer<UInt8>?, _ size: Int32) {
  guard let p = ptr else { return }
  #if canImport(WASILibc)
  WASILibc.free(UnsafeMutableRawPointer(p))
  #else
  free(UnsafeMutableRawPointer(p))
  #endif
}

func writeResult(_ text: String,
                 _ outPtrPtr: UnsafeMutablePointer<UInt32>?,
                 _ outLenPtr: UnsafeMutablePointer<UInt32>?) -> Int32 {
  let bytes = Array(text.utf8)
  let out = wasm_alloc(Int32(bytes.count))!
  out.initialize(from: bytes, count: bytes.count)
  outPtrPtr?.pointee = UInt32(UInt(bitPattern: out))
  outLenPtr?.pointee = UInt32(bytes.count)
  return 0
}

@discardableResult
func writeError(_ message: String,
                _ outPtrPtr: UnsafeMutablePointer<UInt32>?,
                _ outLenPtr: UnsafeMutablePointer<UInt32>?) -> Int32 {
  return writeResult(message, outPtrPtr, outLenPtr) | 1
}
