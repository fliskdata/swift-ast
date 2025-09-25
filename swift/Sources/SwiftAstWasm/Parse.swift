import Foundation
import SwiftSyntax
import SwiftParser

@_expose(wasm, "parse_source")
@_cdecl("parse_source")
public func parse_source(_ inPtr: UnsafePointer<UInt8>?,
                         _ inLen: Int32,
                         _ outPtrPtr: UnsafeMutablePointer<UInt32>?,
                         _ outLenPtr: UnsafeMutablePointer<UInt32>?) -> Int32 {
  guard let inPtr = inPtr, inLen > 0 else {
    return writeError("empty input", outPtrPtr, outLenPtr)
  }
  let text = String(decoding: UnsafeBufferPointer(start: inPtr, count: Int(inLen)), as: UTF8.self)
  do {
    let syntax = Parser.parse(source: text)
    let emitter = SyntaxJsonEmitter(tree: Syntax(syntax), sourceFileName: "<memory>")
    let json = emitter.emit()
    return writeResult(json, outPtrPtr, outLenPtr)
  }
}

@_expose(wasm, "parse_file")
@_cdecl("parse_file")
public func parse_file(_ pathPtr: UnsafePointer<UInt8>?,
                       _ pathLen: Int32,
                       _ outPtrPtr: UnsafeMutablePointer<UInt32>?,
                       _ outLenPtr: UnsafeMutablePointer<UInt32>?) -> Int32 {
  guard let pathPtr = pathPtr, pathLen > 0 else {
    return writeError("empty path", outPtrPtr, outLenPtr)
  }
  let path = String(decoding: UnsafeBufferPointer(start: pathPtr, count: Int(pathLen)), as: UTF8.self)
  do {
    let url = URL(fileURLWithPath: path)
    // SwiftParser provides file parsing via convenience on SyntaxParser as well; we parse via String for consistency
    let text = try String(contentsOf: url, encoding: .utf8)
    let syntax = Parser.parse(source: text)
    let emitter = SyntaxJsonEmitter(tree: Syntax(syntax), sourceFileName: url.lastPathComponent)
    let json = emitter.emit()
    return writeResult(json, outPtrPtr, outLenPtr)
  } catch {
    return writeError("parse error: \(error)", outPtrPtr, outLenPtr)
  }
}
