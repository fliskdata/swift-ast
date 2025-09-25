// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "SwiftAstWasmHost",
  products: [
    .executable(name: "SwiftAstWasm", targets: ["SwiftAstWasm"])
  ],
  dependencies: [
    // Pin to a SwiftSyntax version matching your Swift toolchain (e.g., 600.x for Swift 6.0/6.1/6.2)
    .package(url: "https://github.com/apple/swift-syntax.git", from: "600.0.0")
  ],
  targets: [
    .executableTarget(
      name: "SwiftAstWasm",
      dependencies: [
        .product(name: "SwiftSyntax", package: "swift-syntax"),
        .product(name: "SwiftParser", package: "swift-syntax"),
      ],
      path: "Sources/SwiftAstWasm"
    )
  ]
)
