struct Foo {
  let x: Int
  func bar(_ y: Int) -> Int { x + y }
}

func bar(_ n: Int) -> Int { n * 2 }

let a = Foo()
let b = bar(3)
let c = a.bar(4)
