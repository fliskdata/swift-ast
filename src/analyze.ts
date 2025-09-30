type Range = {
  start: { line: number, column: number, offset: number },
  end: { line: number, column: number, offset: number }
};

type AstNode = {
  kind: string;
  range: Range;
  name?: string;
  tokenText?: string;
};

type Ast = {
  root: number;
  nodes: AstNode[];
  edges: [number, number][];
};

export type SymbolInfo = {
  id: number;
  kind: 'function'|'method'|'class'|'struct'|'enum'|'variable';
  name: string;
  range: Range;
  parentId?: number;
  typeAnnotation?: string;
};

export type CallInfo = {
  id: number;
  name: string;
  receiver?: string;
  argsCount: number;
  range: Range;
  refersToId?: number;
};

export type RefInfo = {
  id: number;
  name: string;
  range: Range;
  refersToId?: number;
};

export type Analysis = {
  symbols: Map<number, SymbolInfo>;
  calls: CallInfo[];
  refs: RefInfo[];
  byName: Map<string, number[]>;
  findCallsByName: (name: string) => CallInfo[];
  resolveNameAt: (name: string, offset: number) => SymbolInfo | undefined;
};

function slice(source: string, r: Range): string {
  return source.slice(r.start.offset, r.end.offset);
}

function isScope(kind: string): boolean {
  return kind === 'FunctionDeclSyntax' || kind === 'ClassDeclSyntax' || kind === 'StructDeclSyntax' || kind === 'EnumDeclSyntax';
}

function classifyDeclKind(kind: string): SymbolInfo['kind'] | undefined {
  if (kind === 'FunctionDeclSyntax') return 'function';
  if (kind === 'ClassDeclSyntax') return 'class';
  if (kind === 'StructDeclSyntax') return 'struct';
  if (kind === 'EnumDeclSyntax') return 'enum';
  if (kind === 'VariableDeclSyntax') return 'variable';
  return undefined;
}

function extractTypeAnnotation(text: string): string | undefined {
  // naive: capture text after ':' up to '=' or end of declaration
  const m = text.match(/:\s*([^=\n\r\{]+?)(?=\s*(=|$|\n|\r|\{))/);
  return m ? m[1].trim() : undefined;
}

function extractCallFromText(text: string): { name: string, receiver?: string, argsCount: number } | undefined {
  // naive: match receiver.optional + dotted path or identifier then '('
  const m = text.match(/([A-Za-z_][A-Za-z0-9_\.]*?)\s*\(/);
  if (!m) return undefined;
  const full = m[1];
  const parts = full.split('.');
  const name = parts.pop() || full;
  const receiver = parts.length ? parts.join('.') : undefined;
  // count arguments by commas at top level inside the first (...) pair
  const open = text.indexOf('(');
  if (open === -1) return { name, receiver, argsCount: 0 };
  let depth = 0, i = open, end = -1;
  for (; i < text.length; i++) {
    const ch = text[i];
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) { end = i; break; } }
  }
  const inside = end !== -1 ? text.slice(open + 1, end) : '';
  const argsCount = inside.trim() === '' ? 0 : inside.split(',').length;
  return { name, receiver, argsCount };
}

export function analyzeAst(ast: Ast, source: string): Analysis {
  const children = new Map<number, number[]>();
  const parent = new Map<number, number>();
  for (const [p, c] of ast.edges) {
    const arr = children.get(p) ?? [];
    arr.push(c);
    children.set(p, arr);
    parent.set(c, p);
  }

  const symbols = new Map<number, SymbolInfo>();
  const byName = new Map<string, number[]>();
  const calls: CallInfo[] = [];
  const refs: RefInfo[] = [];

  // DFS with scope stack of maps: name -> symbolId
  const scopeStack: Array<Map<string, number>> = [new Map()];

  function addSymbol(id: number, info: SymbolInfo) {
    symbols.set(id, info);
    const ids = byName.get(info.name) ?? [];
    ids.push(id);
    byName.set(info.name, ids);
    const top = scopeStack[scopeStack.length - 1];
    top.set(info.name, id);
  }

  function resolveName(name: string): number | undefined {
    for (let i = scopeStack.length - 1; i >= 0; i--) {
      const id = scopeStack[i].get(name);
      if (id !== undefined) return id;
    }
    const global = byName.get(name);
    return global && global.length ? global[0] : undefined;
  }

  function walk(id: number) {
    const node = ast.nodes[id];
    const kind = node.kind;
    const kids = children.get(id) ?? [];

    // Declarations
    const declKind = classifyDeclKind(kind);
    if (declKind) {
      const info: SymbolInfo = {
        id,
        kind: declKind,
        name: node.name ?? '',
        range: node.range,
        parentId: parent.get(id)
      };
      if (declKind === 'variable') {
        const text = slice(source, node.range);
        info.typeAnnotation = extractTypeAnnotation(text);
      }
      addSymbol(id, info);
    }

    // Push scope for scope-introducing nodes
    if (isScope(kind)) scopeStack.push(new Map());

    // Calls and references
    if (kind === 'FunctionCallExprSyntax') {
      const text = slice(source, node.range);
      const c = extractCallFromText(text);
      if (c) {
        const refersToId = resolveName(c.name);
        calls.push({ id, name: c.name, receiver: c.receiver, argsCount: c.argsCount, range: node.range, refersToId });
      }
    }
    if (kind === 'DeclReferenceExprSyntax') {
      const text = slice(source, node.range);
      const m = text.match(/[A-Za-z_][A-Za-z0-9_]*/);
      const name = m ? m[0] : (node.name ?? '');
      const refersToId = name ? resolveName(name) : undefined;
      refs.push({ id, name, range: node.range, refersToId });
    }

    for (const k of kids) walk(k);

    if (isScope(kind)) scopeStack.pop();
  }

  walk(ast.root);

  return {
    symbols,
    calls,
    refs,
    byName,
    findCallsByName: (name: string) => calls.filter(c => c.name === name),
    resolveNameAt: (name: string, _offset: number) => {
      const ids = byName.get(name);
      return ids && ids[0] !== undefined ? symbols.get(ids[0]) : undefined;
    }
  };
}
