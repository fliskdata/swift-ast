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
  calleeChain?: string[];
  baseIdentifier?: string;
};

export type RefInfo = {
  id: number;
  name: string;
  range: Range;
  refersToId?: number;
};

export type CallArg = { label?: string; text: string; range: Range; nodeId: number };

export type Analysis = {
  symbols: Map<number, SymbolInfo>;
  calls: CallInfo[];
  refs: RefInfo[];
  byName: Map<string, number[]>;
  getNode: (id: number) => AstNode | undefined;
  getChildren: (id: number) => number[];
  getParent: (id: number) => number | undefined;
  getCalleeText: (callId: number) => string | undefined;
  getStringLiteralValue: (nodeId: number) => string | undefined;
  getCallArgs: (callId: number) => CallArg[];
  extractDictionary: (nodeId: number) => any;
  findEnclosing: (nodeId: number, kinds?: string[]) => SymbolInfo | undefined;
  collectConstStrings: () => Map<string, string>;
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
  const constStrings = new Map<string, string>();

  const nodeAt = (id: number) => ast.nodes[id];
  const kidsOf = (id: number) => children.get(id) ?? [];
  const parentOf = (id: number) => parent.get(id);

  function findDirectChildToken(id: number, token: string): number | undefined {
    for (const k of kidsOf(id)) {
      const n = nodeAt(k);
      if (n && n.kind === 'TokenSyntax' && n.tokenText === token) return k;
    }
    return undefined;
  }

  function calleeTextForCall(id: number): string | undefined {
    const node = nodeAt(id);
    if (!node) return undefined;
    const lparenId = findDirectChildToken(id, '(');
    if (!lparenId) return undefined;
    const lp = nodeAt(lparenId)!;
    const start = node.range.start.offset;
    const end = lp.range.start.offset; // up to the '(' that begins this call's arg list
    return source.slice(start, end).trim();
  }

  function calleeChainParts(text: string): string[] {
    if (!text) return [];
    // Split on member separators, handling optional/force chaining
    return text.split(/(?:\?\.|!\.|\.)/).map(s => s.trim()).filter(Boolean);
  }

  function baseIdentifierFromChain(chain: string[]): string | undefined {
    if (!chain.length) return undefined;
    const base = chain[0];
    return base.replace(/[!?]+$/g, '').replace(/\(\)$/, '');
  }

  function splitTopLevel(input: string, sep: string): string[] {
    const out: string[] = [];
    let depthPar = 0, depthBr = 0, depthBr2 = 0;
    let inStr = false, esc = false;
    let acc = '';
    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (inStr) {
        acc += ch;
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') { inStr = false; }
        continue;
      }
      if (ch === '"') { inStr = true; acc += ch; continue; }
      if (ch === '(') depthPar++;
      else if (ch === ')') depthPar = Math.max(0, depthPar - 1);
      else if (ch === '[') depthBr++;
      else if (ch === ']') depthBr = Math.max(0, depthBr - 1);
      else if (ch === '{') depthBr2++;
      else if (ch === '}') depthBr2 = Math.max(0, depthBr2 - 1);

      if (ch === sep && depthPar === 0 && depthBr === 0 && depthBr2 === 0) {
        out.push(acc);
        acc = '';
      } else {
        acc += ch;
      }
    }
    if (acc.trim() !== '') out.push(acc);
    return out.map(s => s.trim());
  }

  function unquote(s: string): string {
    if (s.startsWith('"') && s.endsWith('"')) {
      const body = s.slice(1, -1);
      return body.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\\\/g, '\\');
    }
    return s;
  }

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
      const fullText = slice(source, node.range);
      const c = extractCallFromText(fullText);
      let calleeText = calleeTextForCall(id);
      const chain = calleeText ? calleeChainParts(calleeText) : undefined;
      const baseId = chain ? baseIdentifierFromChain(chain) : undefined;
      if (c) {
        const refersToId = resolveName(c.name);
        calls.push({ id, name: c.name, receiver: c.receiver, argsCount: c.argsCount, range: node.range, refersToId, calleeChain: chain, baseIdentifier: baseId });
      }
    }
    if (kind === 'DeclReferenceExprSyntax') {
      const text = slice(source, node.range);
      const m = text.match(/[A-Za-z_][A-Za-z0-9_]*/);
      const name = m ? m[0] : (node.name ?? '');
      const refersToId = name ? resolveName(name) : undefined;
      refs.push({ id, name, range: node.range, refersToId });
    }

    // Best-effort const strings: let NAME = "..."
    if (kind === 'VariableDeclSyntax') {
      const text = slice(source, node.range);
      const m = text.match(/\blet\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=\s*("(?:[^"\\]|\\.)*")/s);
      if (m) {
        constStrings.set(m[1], unquote(m[2]));
      }
    }

    for (const k of kids) walk(k);

    if (isScope(kind)) scopeStack.pop();
  }

  walk(ast.root);

  function getCallArgs(callId: number): CallArg[] {
    const call = nodeAt(callId);
    if (!call || call.kind !== 'FunctionCallExprSyntax') return [];
    const out: CallArg[] = [];
    // Search shallow descendants up to depth 2 for labeled exprs
    const level1 = kidsOf(callId);
    const level2 = level1.flatMap(k => kidsOf(k));
    const candidateIds = [...level1, ...level2];
    for (const id of candidateIds) {
      const n = nodeAt(id);
      if (!n) continue;
      if (n.kind === 'LabeledExprSyntax' || n.kind === 'TupleExprElementSyntax') {
        const txt = slice(source, n.range);
        const m = txt.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*/);
        let label: string | undefined;
        let valueStart = n.range.start.offset;
        if (m) { label = m[1]; valueStart += m[0].length; }
        const valueRange: Range = { start: { ...n.range.start, offset: valueStart }, end: n.range.end };
        const valueText = source.slice(valueStart, n.range.end.offset).trim();
        out.push({ label, text: valueText, range: valueRange, nodeId: id });
      }
    }
    return out;
  }

  function parseValue(text: string): any {
    const t = text.trim();
    if (t.startsWith('"') && t.endsWith('"')) return unquote(t);
    if (t === 'true') return true;
    if (t === 'false') return false;
    if (t === 'nil' || t === 'null') return null;
    if (/^-?\d+(?:\.\d+)?$/.test(t)) return Number(t);
    if (t.startsWith("[") && t.endsWith("]")) {
      const inner = t.slice(1, -1);
      const parts = splitTopLevel(inner, ',');
      return parts.map(p => parseValue(p));
    }
    if (t.startsWith("[") && t.includes(":")) {
      // dictionary fallback when we can't rely on kind
      return parseDict(text);
    }
    return t; // fallback raw
  }

  function parseDict(text: string): any {
    const body = text.trim().replace(/^\[/, '').replace(/\]$/, '');
    const parts = splitTopLevel(body, ',');
    const obj: any = {};
    for (const part of parts) {
      if (!part) continue;
      const m = part.match(/^\s*("(?:[^"\\]|\\.)*")\s*:\s*([\s\S]*)$/);
      if (!m) continue;
      const key = unquote(m[1]);
      const val = parseValue(m[2]);
      obj[key] = val;
    }
    return obj;
  }

  function extractDictionary(nodeId: number): any {
    const n = nodeAt(nodeId);
    if (!n) return undefined;
    const text = slice(source, n.range);
    return parseDict(text);
  }

  function findEnclosing(nodeId: number, kinds?: string[]): SymbolInfo | undefined {
    const set = new Set(kinds && kinds.length ? kinds : ['FunctionDeclSyntax','ClassDeclSyntax','StructDeclSyntax']);
    let cur = parentOf(nodeId);
    while (cur !== undefined) {
      const n = nodeAt(cur);
      if (n && set.has(n.kind)) {
        const ids = byName.get(n.name ?? '') ?? [];
        for (const id of ids) {
          const s = symbols.get(id);
          if (s && s.id === cur) return s;
        }
        // fallback if symbol map missed it
        const k = classifyDeclKind(n.kind);
        if (k && n.name) {
          return { id: cur, kind: k, name: n.name, range: n.range, parentId: parentOf(cur) };
        }
      }
      cur = parentOf(cur!);
    }
    return undefined;
  }

  function getStringLiteralValue(nodeId: number): string | undefined {
    const n = nodeAt(nodeId);
    if (!n) return undefined;
    const t = slice(source, n.range).trim();
    if (t.startsWith('"') && t.endsWith('"')) return unquote(t);
    return undefined;
  }

  return {
    symbols,
    calls,
    refs,
    byName,
    getNode: (id: number) => nodeAt(id),
    getChildren: (id: number) => kidsOf(id),
    getParent: (id: number) => parentOf(id),
    getCalleeText: (callId: number) => calleeTextForCall(callId),
    getStringLiteralValue,
    getCallArgs,
    extractDictionary,
    findEnclosing,
    collectConstStrings: () => constStrings,
    findCallsByName: (name: string) => calls.filter(c => c.name === name),
    resolveNameAt: (name: string, _offset: number) => {
      const ids = byName.get(name);
      return ids && ids[0] !== undefined ? symbols.get(ids[0]) : undefined;
    }
  };
}
