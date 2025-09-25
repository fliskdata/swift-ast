import Foundation
import SwiftSyntax

struct JSONScalar: ExpressibleByStringLiteral, ExpressibleByIntegerLiteral {
  var s: String
  init(stringLiteral value: String) { self.s = value }
  init(integerLiteral value: Int) { self.s = String(value) }
}

// Minimal JSON builder to avoid Foundation JSONEncoder complexities on WASI
struct J {
  static func quote(_ s: String) -> String {
    var out = "\""
    for ch in s.unicodeScalars {
      switch ch {
      case "\\": out += "\\\\"
      case "\"": out += "\\\""
      case "\n": out += "\\n"
      case "\r": out += "\\r"
      case "\t": out += "\\t"
      default:
        if ch.value < 0x20 { out += String(format: "\\u%04X", ch.value) }
        else { out.unicodeScalars.append(ch) }
      }
    }
    out += "\""
    return out
  }

  static func dict(_ kv: [(String, String)]) -> String {
    return "{" + kv.map { "\(quote($0)):\($1)" }.joined(separator: ",") + "}"
  }

  static func arr(_ items: [String]) -> String {
    return "[" + items.joined(separator: ",") + "]"
  }
}

struct RangeJSON {
  static func make(startLine: Int, startColumn: Int, startOffset: Int,
                   endLine: Int, endColumn: Int, endOffset: Int) -> String {
    let start = J.dict([
      ("line", String(startLine)),
      ("column", String(startColumn)),
      ("offset", String(startOffset))
    ])
    let end = J.dict([
      ("line", String(endLine)),
      ("column", String(endColumn)),
      ("offset", String(endOffset))
    ])
    return J.dict([
      ("start", start),
      ("end", end)
    ])
  }
}

final class SyntaxJsonEmitter {
  private let tree: Syntax
  private let converter: SourceLocationConverter

  init(tree: Syntax, sourceFileName: String) {
    self.tree = tree
    self.converter = SourceLocationConverter(fileName: sourceFileName, tree: tree)
  }

  func emit() -> String {
    var nodes: [String] = []
    var edges: [(Int, Int)] = []

    func addNode(_ node: Syntax) -> Int {
      let id = nodes.count
      let kind = node.kind.syntaxNodeType // a metatype
      let kindName = String(describing: kind)

      let start = node.positionAfterSkippingLeadingTrivia
      let end = node.endPositionBeforeTrailingTrivia
      let sl = converter.location(for: start)
      let el = converter.location(for: end)
      let range = RangeJSON.make(
        startLine: sl.line, startColumn: sl.column, startOffset: sl.offset,
        endLine: el.line, endColumn: el.column, endOffset: el.offset
      )

      var fields: [(String, String)] = [("kind", J.quote(kindName)), ("range", range)]

      if let tok = node.as(TokenSyntax.self) {
        fields.append(("tokenText", J.quote(tok.text)))
      }

      // name-ish extraction for common declarations (best-effort)
      if let decl = node.as(StructDeclSyntax.self) { fields.append(("name", J.quote(decl.name.text))) }
      if let decl = node.as(ClassDeclSyntax.self) { fields.append(("name", J.quote(decl.name.text))) }
      if let decl = node.as(EnumDeclSyntax.self) { fields.append(("name", J.quote(decl.name.text))) }
      if let decl = node.as(FunctionDeclSyntax.self) { fields.append(("name", J.quote(decl.name.text))) }
      if let decl = node.as(VariableDeclSyntax.self) {
        if let firstBinding = decl.bindings.first, let pat = firstBinding.pattern.as(IdentifierPatternSyntax.self) {
          fields.append(("name", J.quote(pat.identifier.text)))
        }
      }

      nodes.append(J.dict(fields))
      return id
    }

    func walk(_ node: Syntax, parent: Int?) {
      let my = addNode(node)
      if let p = parent { edges.append((p, my)) }
      for child in node.children(viewMode: .sourceAccurate) {
        walk(child, parent: my)
      }
    }

    walk(tree, parent: nil)

    let nodesJSON = J.arr(nodes)
    let edgesJSON = J.arr(edges.map { J.arr([String($0.0), String($0.1)]) })
    return J.dict([
      ("root", "0"),
      ("nodes", nodesJSON),
      ("edges", edgesJSON)
    ])
  }
}
