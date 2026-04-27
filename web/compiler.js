/**
 * Compiler pipeline: lexer → parser → semantic analysis → TAC.
 * Pure JavaScript (no Python). Used by the browser and optionally by Node.
 */

const KEYWORDS = new Set(["int", "float", "char", "if", "else", "while"]);

/** Map keyword text → token type (must not collide with literal types). */
const KEYWORD_TYPES = {
  int: "KW_INT",
  float: "KW_FLOAT",
  char: "KW_CHAR",
  if: "KW_IF",
  else: "KW_ELSE",
  while: "KW_WHILE"
};

const TOKEN_SPEC = [
  ["WHITESPACE", /[ \t\r]+/y],
  ["NEWLINE", /\n/y],
  ["FLOAT_LITERAL", /\d+\.\d+/y],
  ["INT_LITERAL", /\d+/y],
  ["CHAR_LITERAL", /'[^']'/y],
  ["EQ", /==/y],
  ["NE", /!=/y],
  ["LE", /<=/y],
  ["GE", />=/y],
  ["ASSIGN", /=/y],
  ["LT", /</y],
  ["GT", />/y],
  ["PLUS", /\+/y],
  ["MINUS", /-/y],
  ["STAR", /\*/y],
  ["SLASH", /\//y],
  ["LPAREN", /\(/y],
  ["RPAREN", /\)/y],
  ["LBRACE", /\{/y],
  ["RBRACE", /\}/y],
  ["SEMI", /;/y],
  ["COMMA", /,/y],
  ["IDENT", /[A-Za-z_]\w*/y]
];

function lexSource(source) {
  const tokens = [];
  let line = 1;
  let idx = 0;

  while (idx < source.length) {
    if (source.startsWith("//", idx)) {
      const end = source.indexOf("\n", idx);
      if (end === -1) break;
      idx = end;
      continue;
    }
    if (source.startsWith("/*", idx)) {
      const end = source.indexOf("*/", idx + 2);
      if (end === -1) break;
      const chunk = source.slice(idx, end + 2);
      line += (chunk.match(/\n/g) || []).length;
      idx = end + 2;
      continue;
    }

    let matched = false;
    for (const [name, regex] of TOKEN_SPEC) {
      regex.lastIndex = idx;
      const m = regex.exec(source);
      if (m && m.index === idx) {
        matched = true;
        let kind = name;
        const val = m[0];
        idx = idx + val.length;

        if (kind === "WHITESPACE") break;
        if (kind === "NEWLINE") {
          line += 1;
          break;
        }
        if (kind === "IDENT" && KEYWORDS.has(val)) kind = KEYWORD_TYPES[val];
        tokens.push({ type: kind, value: val, line });
        break;
      }
    }

    if (!matched) {
      tokens.push({ type: "UNKNOWN", value: source[idx], line });
      idx += 1;
    }
  }

  tokens.push({ type: "EOF", value: "", line });
  return tokens;
}

class ParseError extends Error {
  constructor(message) {
    super(message);
    this.name = "ParseError";
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  LALR(1) Bottom-Up Shift-Reduce Parser
// ═══════════════════════════════════════════════════════════════════════
//
//  This replaces the previous recursive-descent (top-down) parser with a
//  table-driven LALR(1) bottom-up parser — the same class of parser used
//  by production tools like Yacc, Bison, and most real-world compilers.
//
//  Overview:
//    1.  Define a formal CFG (37 productions).
//    2.  Compute FIRST sets for every symbol.
//    3.  Build the canonical LR(1) item-set collection (closure + goto).
//    4.  Merge states that share the same LR(0) core → LALR(1).
//    5.  Construct ACTION / GOTO tables (shift-reduce conflict on the
//        dangling-else ambiguity is resolved by preferring SHIFT).
//    6.  At parse time, run the classic shift-reduce loop using the
//        precomputed tables.
//    7.  Semantic actions attached to each production build the same AST
//        structure the old parser produced.
//
//  Tables are built once when the module is first loaded.
// ═══════════════════════════════════════════════════════════════════════

/* ---------- Symbol sets ---------- */
const _TERMINALS = new Set([
  "KW_INT","KW_FLOAT","KW_CHAR","KW_IF","KW_ELSE","KW_WHILE",
  "IDENT","INT_LITERAL","FLOAT_LITERAL","CHAR_LITERAL",
  "ASSIGN","SEMI","LPAREN","RPAREN","LBRACE","RBRACE",
  "PLUS","MINUS","STAR","SLASH",
  "EQ","NE","LT","GT","LE","GE","EOF"
]);
const _NON_TERMINALS = new Set([
  "$S","Program","SL","Stmt","VarDecl","Asgn",
  "IfSt","WhSt","Blk","Typ","Expr","Add","Mul","Pri"
]);

/* ---------- Grammar productions  [lhs, rhs[]] ---------- */
const P = [
  ["$S",      ["Program"]],                                           //  0  augmented start
  ["Program", ["SL"]],                                                //  1
  ["SL",      ["SL","Stmt"]],                                         //  2
  ["SL",      []],                                                    //  3  ε
  ["Stmt",    ["VarDecl"]],                                           //  4
  ["Stmt",    ["Asgn"]],                                              //  5
  ["Stmt",    ["IfSt"]],                                              //  6
  ["Stmt",    ["WhSt"]],                                              //  7
  ["Stmt",    ["Blk"]],                                               //  8
  ["VarDecl", ["Typ","IDENT","SEMI"]],                                //  9
  ["VarDecl", ["Typ","IDENT","ASSIGN","Expr","SEMI"]],                // 10
  ["Typ",     ["KW_INT"]],                                            // 11
  ["Typ",     ["KW_FLOAT"]],                                         // 12
  ["Typ",     ["KW_CHAR"]],                                          // 13
  ["Asgn",    ["IDENT","ASSIGN","Expr","SEMI"]],                     // 14
  ["IfSt",    ["KW_IF","LPAREN","Expr","RPAREN","Stmt"]],            // 15
  ["IfSt",    ["KW_IF","LPAREN","Expr","RPAREN","Stmt","KW_ELSE","Stmt"]], // 16
  ["WhSt",    ["KW_WHILE","LPAREN","Expr","RPAREN","Stmt"]],         // 17
  ["Blk",     ["LBRACE","SL","RBRACE"]],                             // 18
  ["Expr",    ["Expr","EQ","Add"]],                                  // 19
  ["Expr",    ["Expr","NE","Add"]],                                  // 20
  ["Expr",    ["Expr","LT","Add"]],                                  // 21
  ["Expr",    ["Expr","GT","Add"]],                                  // 22
  ["Expr",    ["Expr","LE","Add"]],                                  // 23
  ["Expr",    ["Expr","GE","Add"]],                                  // 24
  ["Expr",    ["Add"]],                                               // 25
  ["Add",     ["Add","PLUS","Mul"]],                                 // 26
  ["Add",     ["Add","MINUS","Mul"]],                                // 27
  ["Add",     ["Mul"]],                                               // 28
  ["Mul",     ["Mul","STAR","Pri"]],                                 // 29
  ["Mul",     ["Mul","SLASH","Pri"]],                                // 30
  ["Mul",     ["Pri"]],                                               // 31
  ["Pri",     ["INT_LITERAL"]],                                      // 32
  ["Pri",     ["FLOAT_LITERAL"]],                                    // 33
  ["Pri",     ["CHAR_LITERAL"]],                                     // 34
  ["Pri",     ["IDENT"]],                                            // 35
  ["Pri",     ["LPAREN","Expr","RPAREN"]],                           // 36
];

/* ---------- Semantic actions (build AST nodes identical to the old parser) ---------- */
const SEM = [
  /*  0 */ (c)=>c[0],
  /*  1 */ (c)=>({type:"Program",body:c[0]}),
  /*  2 */ (c)=>{c[0].push(c[1]);return c[0];},
  /*  3 */ ()=>[],
  /*  4 */ (c)=>c[0],  /*  5 */ (c)=>c[0],  /*  6 */ (c)=>c[0],
  /*  7 */ (c)=>c[0],  /*  8 */ (c)=>c[0],
  /*  9 */ (c)=>({type:"VarDecl",line:c[1].line,varType:c[0],name:c[1].value,init:null}),
  /* 10 */ (c)=>({type:"VarDecl",line:c[1].line,varType:c[0],name:c[1].value,init:c[3]}),
  /* 11 */ (c)=>c[0].value, /* 12 */ (c)=>c[0].value, /* 13 */ (c)=>c[0].value,
  /* 14 */ (c)=>({type:"Assign",line:c[0].line,name:c[0].value,value:c[2]}),
  /* 15 */ (c)=>({type:"If",line:c[0].line,condition:c[2],then:c[4],else:null}),
  /* 16 */ (c)=>({type:"If",line:c[0].line,condition:c[2],then:c[4],else:c[6]}),
  /* 17 */ (c)=>({type:"While",line:c[0].line,condition:c[2],body:c[4]}),
  /* 18 */ (c)=>({type:"Block",line:c[0].line,body:c[1]}),
  /* 19 */ (c)=>({type:"Binary",line:c[1].line,op:c[1].value,left:c[0],right:c[2]}),
  /* 20 */ (c)=>({type:"Binary",line:c[1].line,op:c[1].value,left:c[0],right:c[2]}),
  /* 21 */ (c)=>({type:"Binary",line:c[1].line,op:c[1].value,left:c[0],right:c[2]}),
  /* 22 */ (c)=>({type:"Binary",line:c[1].line,op:c[1].value,left:c[0],right:c[2]}),
  /* 23 */ (c)=>({type:"Binary",line:c[1].line,op:c[1].value,left:c[0],right:c[2]}),
  /* 24 */ (c)=>({type:"Binary",line:c[1].line,op:c[1].value,left:c[0],right:c[2]}),
  /* 25 */ (c)=>c[0],
  /* 26 */ (c)=>({type:"Binary",line:c[1].line,op:c[1].value,left:c[0],right:c[2]}),
  /* 27 */ (c)=>({type:"Binary",line:c[1].line,op:c[1].value,left:c[0],right:c[2]}),
  /* 28 */ (c)=>c[0],
  /* 29 */ (c)=>({type:"Binary",line:c[1].line,op:c[1].value,left:c[0],right:c[2]}),
  /* 30 */ (c)=>({type:"Binary",line:c[1].line,op:c[1].value,left:c[0],right:c[2]}),
  /* 31 */ (c)=>c[0],
  /* 32 */ (c)=>({type:"IntLiteral",line:c[0].line,value:parseInt(c[0].value,10)}),
  /* 33 */ (c)=>({type:"FloatLiteral",line:c[0].line,value:parseFloat(c[0].value)}),
  /* 34 */ (c)=>({type:"CharLiteral",line:c[0].line,value:c[0].value}),
  /* 35 */ (c)=>({type:"Identifier",line:c[0].line,name:c[0].value}),
  /* 36 */ (c)=>c[1],
];

/* ================================================================
   LALR(1) Table Generator
   ================================================================ */

/** Compute FIRST sets for every grammar symbol. */
function _firstSets() {
  const f = {};
  for (const t of _TERMINALS) f[t] = new Set([t]);
  for (const n of _NON_TERMINALS) f[n] = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [lhs, rhs] of P) {
      const sz = f[lhs].size;
      if (rhs.length === 0) { f[lhs].add("ε"); }
      else {
        let allNull = true;
        for (const s of rhs) {
          for (const x of f[s]) if (x !== "ε") f[lhs].add(x);
          if (!f[s].has("ε")) { allNull = false; break; }
        }
        if (allNull) f[lhs].add("ε");
      }
      if (f[lhs].size > sz) changed = true;
    }
  }
  return f;
}

/** FIRST of a sequence of symbols followed by a lookahead terminal. */
function _firstSeq(seq, la, F) {
  const r = new Set();
  let allNull = true;
  for (const s of seq) {
    const fs = F[s] || new Set([s]);
    for (const x of fs) if (x !== "ε") r.add(x);
    if (!fs.has("ε")) { allNull = false; break; }
  }
  if (allNull) r.add(la);
  return r;
}

/* ---------- LR(1) item helpers ----------
   An item is encoded as  "prodIdx:dot:lookahead"  */

function _closure(items, F) {
  const res = new Set(items);
  const q = [...items];
  while (q.length) {
    const k = q.pop();
    const [pi, dp, la] = k.split(":");
    const pidx = +pi, dot = +dp;
    const rhs = P[pidx][1];
    if (dot >= rhs.length) continue;
    const B = rhs[dot];
    if (!_NON_TERMINALS.has(B)) continue;
    const beta = rhs.slice(dot + 1);
    const las = _firstSeq(beta, la, F);
    for (let i = 0; i < P.length; i++) {
      if (P[i][0] !== B) continue;
      for (const a of las) {
        const nk = `${i}:0:${a}`;
        if (!res.has(nk)) { res.add(nk); q.push(nk); }
      }
    }
  }
  return res;
}

function _goto(items, sym, F) {
  const seed = new Set();
  for (const k of items) {
    const [pi, dp, la] = k.split(":");
    const rhs = P[+pi][1];
    if (+dp < rhs.length && rhs[+dp] === sym) seed.add(`${pi}:${+dp+1}:${la}`);
  }
  return seed.size ? _closure(seed, F) : null;
}

function _serState(s) { const a=[...s]; a.sort(); return a.join("\n"); }
function _lr0core(s) {
  const c = new Set();
  for (const k of s) { const p = k.split(":"); c.add(p[0]+":"+p[1]); }
  return [...c].sort().join("|");
}

/** Build LALR(1) ACTION and GOTO tables. */
function _buildTables() {
  const F = _firstSets();

  /* 1. Canonical LR(1) collection */
  const I0 = _closure(new Set(["0:0:EOF"]), F);
  const states = [I0];
  const smap = new Map(); smap.set(_serState(I0), 0);
  const trans = [{}];
  const work = [0];
  while (work.length) {
    const si = work.shift();
    const st = states[si];
    const syms = new Set();
    for (const k of st) { const p=k.split(":"); const rhs=P[+p[0]][1]; if(+p[1]<rhs.length) syms.add(rhs[+p[1]]); }
    for (const sym of syms) {
      const ns = _goto(st, sym, F);
      if (!ns) continue;
      const key = _serState(ns);
      let ti;
      if (smap.has(key)) { ti = smap.get(key); }
      else { ti = states.length; states.push(ns); smap.set(key, ti); trans.push({}); work.push(ti); }
      trans[si][sym] = ti;
    }
  }

  /* 2. Merge states with same LR(0) core → LALR(1) */
  const coreMap = {};
  for (let i = 0; i < states.length; i++) {
    const c = _lr0core(states[i]);
    (coreMap[c] || (coreMap[c] = [])).push(i);
  }
  const oldToNew = new Array(states.length);
  const mStates = [], mTrans = [];
  for (const grp of Object.values(coreMap)) {
    const ni = mStates.length;
    const merged = new Set();
    for (const oi of grp) { for (const it of states[oi]) merged.add(it); oldToNew[oi] = ni; }
    mStates.push(merged);
    mTrans.push({});
  }
  for (let oi = 0; oi < trans.length; oi++) {
    const ni = oldToNew[oi];
    for (const [sym, ti] of Object.entries(trans[oi])) mTrans[ni][sym] = oldToNew[ti];
  }

  /* 3. Build ACTION / GOTO */
  const ACT = mStates.map(()=>({}));
  const GOT = mStates.map(()=>({}));
  for (let i = 0; i < mStates.length; i++) {
    for (const [sym, tgt] of Object.entries(mTrans[i])) {
      if (_TERMINALS.has(sym)) ACT[i][sym] = { t:"s", s:tgt };   // shift
      else GOT[i][sym] = tgt;
    }
    for (const k of mStates[i]) {
      const [pi,dp,la] = k.split(":");
      const pidx=+pi, dot=+dp;
      if (dot !== P[pidx][1].length) continue;           // not a complete item
      if (pidx === 0) { ACT[i][la] = { t:"a" }; continue; }  // accept
      const prev = ACT[i][la];
      if (prev) {
        if (prev.t === "s") continue;                     // shift wins (dangling else)
        if (prev.t === "r" && prev.p < pidx) continue;   // lower prod# wins
      }
      ACT[i][la] = { t:"r", p:pidx };
    }
  }
  return { ACT, GOT };
}

/* ---------- Build tables once at module load ---------- */
const { ACT: _ACT, GOT: _GOT } = _buildTables();

/* ================================================================
   Table-Driven Shift-Reduce Parser
   ================================================================ */
class Parser {
  constructor(tokens) { this.tokens = tokens; }

  parse() {
    const tokens = this.tokens;
    const ss = [0];          // state stack
    const vs = [];           // value stack
    let pos = 0;

    for (;;) {
      const state = ss[ss.length - 1];
      const tok = tokens[pos];
      const act = _ACT[state]?.[tok.type];

      if (!act) {
        const expected = Object.keys(_ACT[state] || {}).filter(k=>k!=="EOF").join(", ");
        throw new ParseError(
          `Unexpected '${tok.value}' at line ${tok.line}` +
          (expected ? `. Expected one of: ${expected}` : "")
        );
      }

      if (act.t === "s") {              // ── SHIFT ──
        vs.push(tok);
        ss.push(act.s);
        pos++;
      } else if (act.t === "r") {       // ── REDUCE ──
        const [lhs, rhs] = P[act.p];
        const len = rhs.length;
        const children = len > 0 ? vs.splice(-len, len) : [];
        if (len > 0) ss.splice(-len, len);
        const node = SEM[act.p](children);
        const topState = ss[ss.length - 1];
        vs.push(node);
        ss.push(_GOT[topState][lhs]);
      } else {                          // ── ACCEPT ──
        return vs[0];
      }
    }
  }
}

export function formatAst(node, indent = 0) {
  const pad = "  ".repeat(indent);
  const t = node.type;
  if (t === "Program") {
    const lines = [`${pad}Program`];
    for (const stmt of node.body) lines.push(formatAst(stmt, indent + 1));
    return lines.join("\n");
  }
  if (t === "VarDecl") {
    const head = `${pad}VarDecl(type=${node.varType}, name=${node.name})`;
    if (node.init == null) return head;
    return `${head}\n${formatAst(node.init, indent + 1)}`;
  }
  if (t === "Assign") {
    return `${pad}Assign(name=${node.name})\n${formatAst(node.value, indent + 1)}`;
  }
  if (t === "If") {
    const lines = [
      `${pad}If`,
      `${pad}  Condition:`,
      formatAst(node.condition, indent + 2),
      `${pad}  Then:`,
      formatAst(node.then, indent + 2)
    ];
    if (node.else != null) {
      lines.push(`${pad}  Else:`, formatAst(node.else, indent + 2));
    }
    return lines.join("\n");
  }
  if (t === "While") {
    return [
      `${pad}While`,
      `${pad}  Condition:`,
      formatAst(node.condition, indent + 2),
      `${pad}  Body:`,
      formatAst(node.body, indent + 2)
    ].join("\n");
  }
  if (t === "Block") {
    const lines = [`${pad}Block`];
    for (const stmt of node.body) lines.push(formatAst(stmt, indent + 1));
    return lines.join("\n");
  }
  if (t === "Binary") {
    return [`${pad}Binary(op=${node.op})`, formatAst(node.left, indent + 1), formatAst(node.right, indent + 1)].join(
      "\n"
    );
  }
  if (t === "Identifier") return `${pad}Identifier(${node.name})`;
  if (t === "IntLiteral") return `${pad}Int(${node.value})`;
  if (t === "FloatLiteral") return `${pad}Float(${node.value})`;
  if (t === "CharLiteral") return `${pad}Char(${node.value})`;
  return `${pad}${t}`;
}

const TYPE_ORDER = { char: 0, int: 1, float: 2 };

/* ================================================================
   Semantic Analysis  (+ symbol table export)
   ================================================================ */
function runSemanticChecks(ast) {
  const errors = [];
  const warnings = [];
  const scopes = [{}];
  const symbolTable = [];          // collects every declaration
  let scopeDepth = 0;

  function resolve(name) {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (Object.prototype.hasOwnProperty.call(scopes[i], name)) return scopes[i][name];
    }
    return null;
  }

  function inferExpr(expr) {
    const et = expr.type;
    if (et === "IntLiteral") return "int";
    if (et === "FloatLiteral") return "float";
    if (et === "CharLiteral") return "char";
    if (et === "Identifier") {
      const declared = resolve(expr.name);
      if (!declared) {
        errors.push({ line: expr.line, message: `Undeclared variable '${expr.name}'` });
        return "int";
      }
      return declared;
    }
    if (et === "Binary") {
      const lt = inferExpr(expr.left);
      const rt = inferExpr(expr.right);
      const dominant = TYPE_ORDER[lt] >= TYPE_ORDER[rt] ? lt : rt;
      if (lt !== rt) warnings.push({ line: expr.line, message: `Type promotion (${lt} → ${dominant})` });
      return dominant;
    }
    return "int";
  }

  function walkStmt(stmt) {
    const st = stmt.type;
    if (st === "VarDecl") {
      const currentScope = scopes[scopes.length - 1];
      if (Object.prototype.hasOwnProperty.call(currentScope, stmt.name)) {
        errors.push({ line: stmt.line, message: `Duplicate declaration of '${stmt.name}'` });
      }
      currentScope[stmt.name] = stmt.varType;
      symbolTable.push({
        name: stmt.name, type: stmt.varType, scope: scopeDepth,
        line: stmt.line, initialized: stmt.init != null
      });
      if (stmt.init != null) {
        const initType = inferExpr(stmt.init);
        const target = stmt.varType;
        if (TYPE_ORDER[initType] > TYPE_ORDER[target]) {
          errors.push({ line: stmt.line, message: `Cannot assign ${initType} to ${target}` });
        } else if (initType !== target) {
          warnings.push({ line: stmt.line, message: `Implicit conversion (${initType} → ${target})` });
        }
      }
    } else if (st === "Assign") {
      const declared = resolve(stmt.name);
      if (!declared) {
        errors.push({ line: stmt.line, message: `Undeclared variable '${stmt.name}'` });
        return;
      }
      const exprType = inferExpr(stmt.value);
      if (TYPE_ORDER[exprType] > TYPE_ORDER[declared]) {
        errors.push({ line: stmt.line, message: `Cannot assign ${exprType} to ${declared}` });
      } else if (exprType !== declared) {
        warnings.push({ line: stmt.line, message: `Implicit conversion (${exprType} → ${declared})` });
      }
    } else if (st === "If") {
      inferExpr(stmt.condition);
      walkStmt(stmt.then);
      if (stmt.else != null) walkStmt(stmt.else);
    } else if (st === "While") {
      inferExpr(stmt.condition);
      walkStmt(stmt.body);
    } else if (st === "Block") {
      scopeDepth++;
      scopes.push({});
      for (const inner of stmt.body) walkStmt(inner);
      scopes.pop();
      scopeDepth--;
    }
  }

  for (const statement of ast.body) walkStmt(statement);
  return { errors, warnings, symbolTable };
}

/* ================================================================
   Three-Address Code Generation  (L-prefix labels)
   ================================================================ */
function generateTac(ast) {
  const output = [];
  let tempCounter = 1;
  let labelCounter = 1;

  function newTemp()  { return `t${tempCounter++}`; }
  function newLabel() { return `L${labelCounter++}`; }

  function emitExpr(expr) {
    const et = expr.type;
    if (et === "Identifier") return expr.name;
    if (et === "IntLiteral") return String(expr.value);
    if (et === "FloatLiteral") return String(expr.value);
    if (et === "CharLiteral") return expr.value;
    if (et === "Binary") {
      const left = emitExpr(expr.left);
      const right = emitExpr(expr.right);
      const tmp = newTemp();
      output.push(`${tmp} = ${left} ${expr.op} ${right}`);
      return tmp;
    }
    return "0";
  }

  function emitStmt(stmt) {
    const st = stmt.type;
    if (st === "VarDecl") {
      if (stmt.init != null) {
        const val = emitExpr(stmt.init);
        output.push(`${stmt.name} = ${val}`);
      }
    } else if (st === "Assign") {
      const val = emitExpr(stmt.value);
      output.push(`${stmt.name} = ${val}`);
    } else if (st === "Block") {
      for (const inner of stmt.body) emitStmt(inner);
    } else if (st === "If") {
      const cond = emitExpr(stmt.condition);
      const elseLabel = newLabel();
      const endLabel  = newLabel();
      output.push(`ifFalse ${cond} goto ${elseLabel}`);
      emitStmt(stmt.then);
      output.push(`goto ${endLabel}`);
      output.push(`${elseLabel}:`);
      if (stmt.else != null) emitStmt(stmt.else);
      output.push(`${endLabel}:`);
    } else if (st === "While") {
      const start = newLabel();
      const end   = newLabel();
      output.push(`${start}:`);
      const cond = emitExpr(stmt.condition);
      output.push(`ifFalse ${cond} goto ${end}`);
      emitStmt(stmt.body);
      output.push(`goto ${start}`);
      output.push(`${end}:`);
    }
  }

  for (const statement of ast.body) emitStmt(statement);
  return output;
}

/* ================================================================
   Code Optimizer  (constant folding + dead-code elimination)
   ================================================================ */
function optimizeTac(tac) {
  const OPS = { "+": (a,b)=>a+b, "-": (a,b)=>a-b, "*": (a,b)=>a*b, "/": (a,b)=>b!==0?a/b:NaN };
  const applied = [];
  let lines = [...tac];

  // ── Pass 1: Constant folding ──
  const constMap = {};
  const folded = [];
  for (const ln of lines) {
    const m = ln.match(/^(\w+)\s*=\s*(-?\d+(?:\.\d+)?)\s*([+\-*/])\s*(-?\d+(?:\.\d+)?)$/);
    if (m) {
      const [, dst, a, op, b] = m;
      const va = parseFloat(a), vb = parseFloat(b);
      if (OPS[op] && !isNaN(va) && !isNaN(vb)) {
        const result = OPS[op](va, vb);
        if (isFinite(result)) {
          const rv = Number.isInteger(result) ? String(result) : result.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
          folded.push(`${dst} = ${rv}`);
          constMap[dst] = rv;
          applied.push(`Constant folding: ${a} ${op} ${b} → ${rv}`);
          continue;
        }
      }
    }
    // Propagate known constants into operands
    let out = ln;
    for (const [k, v] of Object.entries(constMap)) {
      const re = new RegExp(`\\b${k}\\b`, "g");
      const prev = out;
      out = out.replace(re, (match, offset) => {
        // Don't replace the LHS of an assignment
        const before = out.substring(0, offset);
        if (/^\s*$/.test(before)) return match; // this IS the lhs
        return v;
      });
    }
    // Invalidate if variable is reassigned
    const assign = ln.match(/^(\w+)\s*=/);
    if (assign) delete constMap[assign[1]];
    folded.push(out);
  }
  lines = folded;

  // ── Pass 2: Dead-code elimination (unused temporaries) ──
  const usedVars = new Set();
  for (const ln of lines) {
    const rhs = ln.includes("=") ? ln.split("=").slice(1).join("=") : ln;
    const ids = rhs.match(/\b[a-zA-Z_]\w*\b/g) || [];
    for (const id of ids) {
      if (!["ifFalse", "goto"].includes(id)) usedVars.add(id);
    }
    if (/^ifFalse\b/.test(ln)) {
      const parts = ln.match(/^ifFalse\s+(\w+)/);
      if (parts) usedVars.add(parts[1]);
    }
  }
  const cleaned = [];
  for (const ln of lines) {
    const m = ln.match(/^(t\d+)\s*=/);
    if (m && !usedVars.has(m[1])) {
      applied.push(`Dead-code elimination: removed unused ${m[1]}`);
      continue;
    }
    cleaned.push(ln);
  }
  lines = cleaned;

  return { optimized: lines, optimizations: applied };
}

/* ================================================================
   TAC Step-by-Step Simulator
   ================================================================ */
function simulateTac(tac) {
  const steps = [];
  const vars = {};
  const labelMap = {};

  // Pre-scan labels
  for (let i = 0; i < tac.length; i++) {
    const m = tac[i].match(/^(\w+):$/);
    if (m) labelMap[m[1]] = i;
  }

  let pc = 0;
  let safety = 0;
  const MAX_STEPS = 500;

  while (pc < tac.length && safety++ < MAX_STEPS) {
    const instr = tac[pc];

    // Label line — skip
    if (/^\w+:$/.test(instr)) { pc++; continue; }

    // goto
    const gotoM = instr.match(/^goto\s+(\w+)$/);
    if (gotoM) {
      steps.push({ pc, instr, vars: { ...vars }, action: `Jump → ${gotoM[1]}` });
      pc = labelMap[gotoM[1]] !== undefined ? labelMap[gotoM[1]] : pc + 1;
      continue;
    }

    // ifFalse
    const ifM = instr.match(/^ifFalse\s+(\w+)\s+goto\s+(\w+)$/);
    if (ifM) {
      const val = vars[ifM[1]] !== undefined ? vars[ifM[1]] : parseFloat(ifM[1]);
      const jump = !val || val === 0;
      steps.push({ pc, instr, vars: { ...vars }, action: jump ? `Condition false → jump ${ifM[2]}` : `Condition true → fall through` });
      pc = jump && labelMap[ifM[2]] !== undefined ? labelMap[ifM[2]] : pc + 1;
      continue;
    }

    // Assignment: x = expr
    const aM = instr.match(/^(\w+)\s*=\s*(.+)$/);
    if (aM) {
      const [, dst, rhs] = aM;
      const binM = rhs.match(/^(\S+)\s+([+\-*/><]=?|[!=]=)\s+(\S+)$/);
      let val;
      if (binM) {
        const lv = vars[binM[1]] !== undefined ? vars[binM[1]] : parseFloat(binM[1]);
        const rv = vars[binM[3]] !== undefined ? vars[binM[3]] : parseFloat(binM[3]);
        const op = binM[2];
        if (op === "+") val = lv + rv;
        else if (op === "-") val = lv - rv;
        else if (op === "*") val = lv * rv;
        else if (op === "/") val = rv !== 0 ? lv / rv : NaN;
        else if (op === ">") val = lv > rv ? 1 : 0;
        else if (op === "<") val = lv < rv ? 1 : 0;
        else if (op === ">=") val = lv >= rv ? 1 : 0;
        else if (op === "<=") val = lv <= rv ? 1 : 0;
        else if (op === "==") val = lv === rv ? 1 : 0;
        else if (op === "!=") val = lv !== rv ? 1 : 0;
        else val = 0;
      } else {
        const rv = rhs.trim();
        val = vars[rv] !== undefined ? vars[rv] : parseFloat(rv);
      }
      vars[dst] = isNaN(val) ? 0 : val;
      steps.push({ pc, instr, vars: { ...vars }, action: `${dst} ← ${vars[dst]}` });
      pc++;
      continue;
    }

    pc++;
  }

  return steps;
}

/* ================================================================
   Main compile() — returns all compilation artifacts
   ================================================================ */
export function compile(source) {
  const tokens = lexSource(source);
  const serialTokens = tokens.filter((t) => t.type !== "EOF").map((t) => ({ type: t.type, value: t.value, line: t.line }));

  let astJson;
  try {
    astJson = new Parser(tokens).parse();
  } catch (e) {
    if (e instanceof ParseError) {
      return {
        tokens: serialTokens, ast: `ParseError: ${e.message}`, astTree: null,
        semantic: { errors: [{ line: 1, message: e.message }], warnings: [], symbolTable: [] },
        tac: [], optimizedTac: [], optimizations: [],
        symbolTable: [], simulation: [], success: false
      };
    }
    throw e;
  }

  const astText = formatAst(astJson);
  const semantic = runSemanticChecks(astJson);
  const tac = generateTac(astJson);
  const { optimized: optimizedTac, optimizations } = optimizeTac(tac);
  const simulation = simulateTac(tac);
  const success = semantic.errors.length === 0;

  return {
    tokens: serialTokens,
    ast: astText,
    astTree: astJson,
    semantic,
    tac,
    optimizedTac,
    optimizations,
    symbolTable: semantic.symbolTable,
    simulation,
    success
  };
}
