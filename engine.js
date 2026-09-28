// engine.js：模式校验、顶层分支与左端最长匹配
const META_CHARS = [".", "*", "+", "?", "|", "(", ")", "[", "]", "^", "$", "\\"];
const META = new Set(META_CHARS);

function fail(code) {
  const error = new Error(code);
  error.code = code;
  throw error;
}

// 递归下降解析器；不合法直接抛对应错误码
class Parser {
  constructor(pattern) {
    this.s = pattern;
    this.i = 0;
  }

  parseAlt(depth) {
    const branches = [this.parseSeq(depth)];
    while (this.i < this.s.length && this.s[this.i] === "|") {
      this.i += 1;
      branches.push(this.parseSeq(depth));
    }
    if (branches.length > 1) {
      for (const branch of branches) {
        if (branch.items.length === 0) { fail("E_BAD_PATTERN"); }
      }
    }
    return { t: "alt", branches: branches };
  }

  parseSeq(depth) {
    const items = [];
    while (this.i < this.s.length) {
      const ch = this.s[this.i];
      if (ch === "|") { break; }
      if (ch === ")") {
        if (depth === 0) { fail("E_BAD_PATTERN"); }
        break;
      }
      let atom;
      if (ch === "(") {
        this.i += 1;
        atom = this.parseAlt(1);
        if (this.i >= this.s.length || this.s[this.i] !== ")") { fail("E_BAD_PATTERN"); }
        this.i += 1;
      } else if (ch === "[") {
        this.i += 1;
        atom = this.parseClass();
      } else if (ch === ".") {
        this.i += 1;
        atom = { t: "any" };
      } else if (ch === "\\") {
        this.i += 1;
        if (this.i >= this.s.length || !META.has(this.s[this.i])) { fail("E_BAD_PATTERN"); }
        atom = { t: "lit", ch: this.s[this.i] };
        this.i += 1;
      } else if (ch === "^") {
        if (this.i !== 0) { fail("E_ANCHOR"); }
        this.i += 1;
        atom = { t: "start" };
      } else if (ch === "$") {
        if (this.i !== this.s.length - 1) { fail("E_ANCHOR"); }
        this.i += 1;
        atom = { t: "end" };
      } else if (ch === "*" || ch === "+" || ch === "?") {
        fail("E_BAD_QUANT");
      } else {
        this.i += 1;
        atom = { t: "lit", ch: ch };
      }
      if (this.i < this.s.length) {
        const q = this.s[this.i];
        if (q === "*" || q === "+" || q === "?") {
          this.i += 1;
          if (atom.t === "rep") { fail("E_BAD_QUANT"); }
          atom = { t: "rep", kind: q, atom: atom };
        }
      }
      items.push(atom);
    }
    return { t: "seq", items: items };
  }

  classChar() {
    const ch = this.s[this.i];
    if (ch === "\\") {
      this.i += 1;
      if (this.i >= this.s.length) { fail("E_BAD_PATTERN"); }
      const e = this.s[this.i];
      if (e !== "-" && !META.has(e)) { fail("E_BAD_PATTERN"); }
      this.i += 1;
      return e;
    }
    this.i += 1;
    return ch;
  }

  parseClass() {
    const negate = this.i < this.s.length && this.s[this.i] === "^";
    if (negate) { this.i += 1; }
    const items = [];
    let hasItem = false;
    while (true) {
      if (this.i >= this.s.length) { fail("E_BAD_PATTERN"); }
      const ch = this.s[this.i];
      if (ch === "]") {
        this.i += 1;
        if (!hasItem) { fail("E_BAD_PATTERN"); }
        return { t: "cls", negate: negate, items: items };
      }
      if (ch === "-") { fail("E_BAD_PATTERN"); }
      const lo = this.classChar();
      if (this.i >= this.s.length || this.s[this.i] !== "-") {
        items.push({ t: "one", ch: lo });
        hasItem = true;
        continue;
      }
      this.i += 1;
      if (this.i >= this.s.length || this.s[this.i] === "]") { fail("E_BAD_PATTERN"); }
      const hi = this.classChar();
      if (lo.charCodeAt(0) > hi.charCodeAt(0)) { fail("E_BAD_RANGE"); }
      items.push({ t: "range", lo: lo, hi: hi });
      hasItem = true;
    }
  }
}

function compile(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) { fail("E_BAD_PATTERN"); }
  const parser = new Parser(pattern);
  const ast = parser.parseAlt();
  if (parser.i !== pattern.length) { fail("E_BAD_PATTERN"); }
  return ast;
}

// splitTop：先校验整条模式，再按最外层竖线切开
export function splitTop(pattern) {
  compile(pattern);
  const parts = [];
  let depth = 0;
  let inClass = false;
  let start = 0;
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "\\") {
      i += 1;
      continue;
    }
    if (inClass) {
      if (ch === "]") { inClass = false; }
    } else if (ch === "[") {
      inClass = true;
    } else if (ch === "(") {
      depth += 1;
    } else if (ch === ")") {
      depth -= 1;
    } else if (ch === "|" && depth === 0) {
      parts.push(pattern.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(pattern.slice(start));
  return parts;
}

function classContains(node, ch) {
  const code = ch.charCodeAt(0);
  let inside = false;
  for (const item of node.items) {
    if (item.t === "one") {
      if (ch === item.ch) { inside = true; }
    } else if (code >= item.lo.charCodeAt(0) && code <= item.hi.charCodeAt(0)) {
      inside = true;
    }
  }
  return node.negate ? !inside : inside;
}

// 返回收尾位置集合（同一位置只保留一次）
function reach(node, pos, text, out) {
  if (node.t === "lit") {
    if (pos < text.length && text[pos] === node.ch) { out.add(pos + 1); }
  } else if (node.t === "any") {
    if (pos < text.length) { out.add(pos + 1); }
  } else if (node.t === "cls") {
    if (pos < text.length && classContains(node, text[pos])) { out.add(pos + 1); }
  } else if (node.t === "start") {
    if (pos === 0) { out.add(pos); }
  } else if (node.t === "end") {
    if (pos === text.length) { out.add(pos); }
  } else if (node.t === "seq") {
    let cur = new Set([pos]);
    for (const item of node.items) {
      const nxt = new Set();
      for (const p of cur) { reach(item, p, text, nxt); }
      cur = nxt;
    }
    for (const p of cur) { out.add(p); }
  } else if (node.t === "alt") {
    for (const branch of node.branches) { reach(branch, pos, text, out); }
  } else if (node.t === "rep") {
    let cur = new Set([pos]);
    if (node.kind === "?" || node.kind === "*") {
      for (const p of cur) { out.add(p); }
    }
    for (let guard = 0; guard <= text.length + 1; guard += 1) {
      const nxt = new Set();
      for (const p of cur) { reach(node.atom, p, text, nxt); }
      let grew = false;
      for (const p of nxt) {
        if (!out.has(p)) { grew = true; }
        out.add(p);
      }
      if (!grew) { break; }
      cur = nxt;
    }
  }
}

// spanOf：左端最长匹配，未命中给空
export function spanOf(pattern, text) {
  const ast = compile(pattern);
  for (let startPos = 0; startPos <= text.length; startPos += 1) {
    const ends = new Set();
    reach(ast, startPos, text, ends);
    if (ends.size > 0) {
      let endPos = startPos;
      for (const p of ends) { if (p > endPos) { endPos = p; } }
      return [startPos, endPos];
    }
  }
  return null;
}

export function hitOf(pattern, text) {
  return spanOf(pattern, text) !== null;
}
