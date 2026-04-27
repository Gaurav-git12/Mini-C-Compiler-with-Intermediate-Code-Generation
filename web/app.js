import { compile, formatAst } from "./compiler.js";

/* ═══════════════════════════════════════════════════════════════
   Configuration & State
   ═══════════════════════════════════════════════════════════════ */
const TABS = [
  "Tokens",
  "Abstract Syntax Tree (AST)",
  "Semantic Analysis",
  "Symbol Table",
  "TAC",
  "Optimized TAC",
  "Simulation"
];

const SAMPLES = [
  {
    name: "Basic Declarations",
    desc: "Variable declarations with types",
    code: `int a = 5;\nfloat b = 3.2;\nchar c = 'x';\n`
  },
  {
    name: "If-Else Control Flow",
    desc: "Conditional branching with expressions",
    code: `int a = 5;\nfloat b = 3.2;\nint c;\nc = a + 2;\nif (c > 4) {\n  b = b + c;\n} else {\n  c = c - 1;\n}\n`
  },
  {
    name: "While Loop",
    desc: "Loop with counter variable",
    code: `int i = 0;\nint sum = 0;\nwhile (i < 10) {\n  sum = sum + i;\n  i = i + 1;\n}\n`
  },
  {
    name: "Nested Scopes",
    desc: "Blocks with scoped variables",
    code: `int x = 10;\n{\n  int y = 20;\n  x = x + y;\n  {\n    int z = 5;\n    x = x * z;\n  }\n}\n`
  },
  {
    name: "Type Errors",
    desc: "Demonstrates semantic error detection",
    code: `int a = 5;\nfloat b = 3.14;\na = b;\nc = 10;\n`
  },
  {
    name: "Complex Expressions",
    desc: "Nested arithmetic with precedence",
    code: `int a = 2;\nint b = 3;\nint c = 4;\nint result;\nresult = a + b * c;\nresult = (a + b) * c;\n`
  }
];

let editor = null;
let activeTab = TABS[0];
let lastOutput = {
  tokens: [], ast: "", astTree: null,
  semantic: { errors: [], warnings: [], symbolTable: [] },
  tac: [], optimizedTac: [], optimizations: [],
  symbolTable: [], simulation: [], success: false
};
let simStep = -1;  // simulation current step

/* ═══════════════════════════════════════════════════════════════
   Theme
   ═══════════════════════════════════════════════════════════════ */
function getTheme() {
  return document.documentElement.getAttribute("data-theme") || "dark";
}
function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("compiler-theme", theme);
  document.getElementById("theme-icon-dark").style.display = theme === "dark" ? "block" : "none";
  document.getElementById("theme-icon-light").style.display = theme === "light" ? "block" : "none";
  if (editor && window.monaco) {
    const edTheme = theme === "dark" ? "compiler-dark" : "compiler-light";
    window.monaco.editor.setTheme(edTheme);
  }
}

/* ═══════════════════════════════════════════════════════════════
   Utilities
   ═══════════════════════════════════════════════════════════════ */
function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function setStatus(text, tone = "default") {
  const el = document.getElementById("status-text");
  if (!el) return;
  el.textContent = text;
  const bar = document.getElementById("status");
  bar.className = "statusbar";
  if (tone !== "default") bar.classList.add(`status-${tone}`);
}

function setMeta(text) {
  const el = document.getElementById("status-meta");
  if (el) el.textContent = text;
}

function applyMarkers(errors, warnings) {
  if (!editor || !window.monaco) return;
  const model = editor.getModel();
  if (!model) return;
  const markers = [
    ...errors.map(e => ({
      message: e.message, startLineNumber: Math.max(1, e.line),
      endLineNumber: Math.max(1, e.line), startColumn: 1, endColumn: 120,
      severity: window.monaco.MarkerSeverity.Error
    })),
    ...warnings.map(w => ({
      message: w.message, startLineNumber: Math.max(1, w.line),
      endLineNumber: Math.max(1, w.line), startColumn: 1, endColumn: 120,
      severity: window.monaco.MarkerSeverity.Warning
    }))
  ];
  window.monaco.editor.setModelMarkers(model, "semantic", markers);
}

/* ═══════════════════════════════════════════════════════════════
   Tabs
   ═══════════════════════════════════════════════════════════════ */
function buildTabs() {
  const nav = document.getElementById("tabs");
  if (!nav) return;
  nav.innerHTML = "";
  for (const tab of TABS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `tab${tab === activeTab ? " active" : ""}`;
    b.textContent = tab;
    b.setAttribute("role", "tab");
    b.addEventListener("click", () => { activeTab = tab; buildTabs(); renderOutput(); });
    nav.appendChild(b);
  }
}

/* ═══════════════════════════════════════════════════════════════
   Renderers
   ═══════════════════════════════════════════════════════════════ */

/* ── Token type styling ── */
function tokCls(type) {
  if (!type) return "";
  if (type.startsWith("KW_")) return "tok-cat-keyword";
  if (type.endsWith("_LITERAL")) return "tok-cat-literal";
  if (type === "IDENT") return "tok-cat-ident";
  if (["PLUS","MINUS","STAR","SLASH","ASSIGN","EQ","NE","LT","GT","LE","GE"].includes(type)) return "tok-cat-op";
  if (["LPAREN","RPAREN","LBRACE","RBRACE","SEMI","COMMA"].includes(type)) return "tok-cat-punct";
  if (type === "UNKNOWN") return "tok-cat-unknown";
  return "";
}

function renderTokens(tokens) {
  const list = Array.isArray(tokens) ? tokens : [];
  if (!list.length) return `<div class="empty-state"><p>No tokens yet. Click <strong>Compile</strong> to run lexical analysis.</p></div>`;
  const rows = list.map((t, i) =>
    `<tr><td class="col-idx">${i+1}</td><td class="col-line">${t.line ?? "—"}</td><td class="col-type"><span class="token-type-pill ${tokCls(t.type)}">${esc(t.type)}</span></td><td class="col-lexeme"><code class="token-lexeme">${esc(t.value)}</code></td></tr>`
  ).join("");
  return `<div class="token-table-wrap"><table class="token-table"><thead><tr><th>#</th><th>Line</th><th>Type</th><th>Lexeme</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ── AST Tree ── */
function astLabel(node) {
  if (!node || typeof node !== "object") return "?";
  const t = node.type;
  switch (t) {
    case "Program": return "Program";
    case "VarDecl": return `VarDecl (${node.varType} ${node.name})`;
    case "Assign": return `Assign → ${node.name}`;
    case "If": return "If";
    case "While": return "While";
    case "Block": return "Block";
    case "Binary": return node.op;
    case "Identifier": return `${node.name}`;
    case "IntLiteral": return `${node.value}`;
    case "FloatLiteral": return `${node.value}`;
    case "CharLiteral": return `${node.value}`;
    default: return t || "?";
  }
}

function isOperator(node) {
  return node && node.type === "Binary";
}

function astToSym(node, edge) {
  if (node == null) {
    const e = edge ? `<span class="sedge">${esc(edge)}</span>` : "";
    return `<li>${e}<span class="snd snd-null">null</span></li>`;
  }
  const t = node.type;
  const label = astLabel(node);
  const edgeHtml = edge ? `<span class="sedge">${esc(edge)}</span>` : "";

  // Determine visual class
  let cls = "snd";
  if (t === "Program") cls += " snd-root";
  else if (t === "Binary") cls += " snd-op";
  else if (["Identifier","IntLiteral","FloatLiteral","CharLiteral"].includes(t)) cls += " snd-leaf";
  else if (["If","While"].includes(t)) cls += " snd-ctrl";
  else if (["VarDecl","Assign"].includes(t)) cls += " snd-stmt";
  else if (t === "Block") cls += " snd-block";

  // Leaf nodes — no children
  if (["Identifier","IntLiteral","FloatLiteral","CharLiteral"].includes(t)) {
    return `<li>${edgeHtml}<span class="${cls}">${esc(label)}</span></li>`;
  }

  // Build children by node type
  let ch = "";
  if (t === "Program") {
    ch = node.body.map((s, i) => astToSym(s, `BODY[${i}]`)).join("");
  } else if (t === "VarDecl") {
    if (!node.init) return `<li>${edgeHtml}<span class="${cls}">${esc(label)}</span></li>`;
    ch = astToSym(node.init, "INIT");
  } else if (t === "Assign") {
    ch = astToSym(node.value, "VALUE");
  } else if (t === "Binary") {
    ch = astToSym(node.left, "LEFT") + astToSym(node.right, "RIGHT");
  } else if (t === "If") {
    ch = astToSym(node.condition, "COND") + astToSym(node.then, "THEN");
    if (node.else) ch += astToSym(node.else, "ELSE");
  } else if (t === "While") {
    ch = astToSym(node.condition, "COND") + astToSym(node.body, "BODY");
  } else if (t === "Block") {
    ch = node.body.map((s, i) => astToSym(s, `[${i}]`)).join("");
  }

  if (!ch) return `<li>${edgeHtml}<span class="${cls}">${esc(label)}</span></li>`;
  return `<li>${edgeHtml}<span class="${cls}">${esc(label)}</span><ul>${ch}</ul></li>`;
}

function renderAst(tree, fallback) {
  if (!tree) {
    const isErr = /^ParseError/i.test(fallback || "");
    return `<div class="ast-parse-hint ${isErr ? "ast-parse-error" : "ast-parse-info"}"><pre>${esc(fallback || "No AST available.")}</pre></div>`;
  }
  return `<div class="stree-wrap"><ul class="stree">${astToSym(tree)}</ul></div>`;
}

/* ── Semantic ── */
function renderSemantic(sem) {
  const errs = sem.errors || [], warns = sem.warnings || [];
  let html = "";
  if (errs.length) {
    html += `<div class="semantic-section"><div class="semantic-section-title">Errors (${errs.length})</div>`;
    errs.forEach(e => {
      html += `<div class="semantic-item semantic-item-error"><span class="semantic-icon">❌</span><span class="semantic-line">Line ${e.line}</span><span class="semantic-msg">${esc(e.message)}</span></div>`;
    });
    html += `</div>`;
  }
  if (warns.length) {
    html += `<div class="semantic-section"><div class="semantic-section-title">Warnings (${warns.length})</div>`;
    warns.forEach(w => {
      html += `<div class="semantic-item semantic-item-warn"><span class="semantic-icon">⚠️</span><span class="semantic-line">Line ${w.line}</span><span class="semantic-msg">${esc(w.message)}</span></div>`;
    });
    html += `</div>`;
  }
  if (!errs.length && !warns.length) {
    html = `<div class="semantic-item semantic-item-ok"><span class="semantic-icon">✅</span><span class="semantic-msg">No semantic issues detected.</span></div>`;
  }
  return html;
}

/* ── Symbol Table ── */
function renderSymbolTable(table) {
  const list = Array.isArray(table) ? table : [];
  if (!list.length) return `<div class="empty-state"><p>No symbols found. Compile code with variable declarations.</p></div>`;
  const rows = list.map(s =>
    `<tr><td><code>${esc(s.name)}</code></td><td><span class="token-type-pill tok-cat-keyword">${esc(s.type)}</span></td><td><span class="scope-badge scope-${Math.min(s.scope,3)}">${s.scope === 0 ? "Global" : `Scope ${s.scope}`}</span></td><td>${s.line}</td><td class="${s.initialized ? "init-yes" : "init-no"}">${s.initialized ? "✓ Yes" : "— No"}</td></tr>`
  ).join("");
  return `<table class="symtab-table"><thead><tr><th>Name</th><th>Type</th><th>Scope</th><th>Line</th><th>Initialized</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ── TAC ── */
function formatTacLine(line) {
  if (/^\w+:$/.test(line)) return `<span class="tac-label">${esc(line)}</span>`;
  if (/^(ifFalse|goto)\b/.test(line)) {
    return line.replace(/(ifFalse|goto)/g, '<span class="tac-keyword">$1</span>')
               .replace(/(\b[A-Z]\w*\b)/g, '<span class="tac-label">$1</span>');
  }
  return `<span class="tac-assign">${esc(line)}</span>`;
}

function renderTac(tac, title = "Three-Address Code") {
  const list = Array.isArray(tac) ? tac : [];
  if (!list.length) return `<div class="empty-state"><p>No TAC generated.</p></div>`;
  const lines = list.map((ln, i) =>
    `<div class="tac-line"><span class="tac-num">${i+1}</span><span class="tac-instr">${formatTacLine(ln)}</span></div>`
  ).join("");
  return `<div class="tac-container">${lines}</div>`;
}

function renderOptimizedTac(tac, optimizations) {
  let html = renderTac(tac, "Optimized TAC");
  if (optimizations && optimizations.length) {
    html += `<div class="opt-section"><div class="opt-title">Optimizations Applied <span class="opt-badge">${optimizations.length}</span></div>`;
    optimizations.forEach(o => { html += `<div class="opt-item">⚡ ${esc(o)}</div>`; });
    html += `</div>`;
  } else {
    html += `<div class="opt-section"><div class="opt-title">No optimizations possible</div></div>`;
  }
  return html;
}

/* ── Simulation ── */
function renderSimulation(steps) {
  const list = Array.isArray(steps) ? steps : [];
  if (!list.length) return `<div class="empty-state"><p>No simulation data. Compile code first.</p></div>`;

  const step = simStep >= 0 && simStep < list.length ? list[simStep] : null;
  const varsHtml = step ? Object.entries(step.vars).map(([k,v]) =>
    `<span class="sim-var"><span class="sim-var-name">${esc(k)}</span> = <span class="sim-var-val">${v}</span></span>`
  ).join("") : "";

  let html = `<div class="sim-controls">
    <button class="btn btn-ghost" id="sim-reset" title="Reset">⏮ Reset</button>
    <button class="btn btn-primary" id="sim-step" title="Step forward">⏭ Step</button>
    <button class="btn btn-accent" id="sim-play" title="Auto-play">▶ Play</button>
    <span class="sim-step-display">Step ${simStep + 1} / ${list.length}</span>
  </div>`;
  
  if (varsHtml) html += `<div class="sim-vars">${varsHtml}</div>`;

  html += `<table class="sim-table"><thead><tr><th>PC</th><th>Instruction</th><th>Action</th></tr></thead><tbody>`;
  list.forEach((s, i) => {
    const active = i === simStep ? " sim-row-active" : "";
    html += `<tr class="${active}"><td>${s.pc}</td><td>${esc(s.instr)}</td><td class="sim-action">${esc(s.action)}</td></tr>`;
  });
  html += `</tbody></table>`;
  return html;
}

/* ═══════════════════════════════════════════════════════════════
   Main Render
   ═══════════════════════════════════════════════════════════════ */
function renderOutput() {
  const body = document.getElementById("output-body");
  if (!body) return;
  body.classList.remove("fade-in");
  void body.offsetWidth;
  body.classList.add("fade-in");

  switch (activeTab) {
    case "Tokens":
      body.innerHTML = renderTokens(lastOutput.tokens); break;
    case "Abstract Syntax Tree (AST)":
      body.innerHTML = renderAst(lastOutput.astTree, lastOutput.ast); break;
    case "Semantic Analysis":
      body.innerHTML = renderSemantic(lastOutput.semantic); break;
    case "Symbol Table":
      body.innerHTML = renderSymbolTable(lastOutput.symbolTable); break;
    case "TAC":
      body.innerHTML = renderTac(lastOutput.tac); break;
    case "Optimized TAC":
      body.innerHTML = renderOptimizedTac(lastOutput.optimizedTac, lastOutput.optimizations); break;
    case "Simulation":
      body.innerHTML = renderSimulation(lastOutput.simulation);
      attachSimHandlers();
      break;
  }
}

/* ═══════════════════════════════════════════════════════════════
   Simulation Controls
   ═══════════════════════════════════════════════════════════════ */
let simInterval = null;

function attachSimHandlers() {
  document.getElementById("sim-reset")?.addEventListener("click", () => {
    simStep = -1; if (simInterval) { clearInterval(simInterval); simInterval = null; }
    renderOutput();
  });
  document.getElementById("sim-step")?.addEventListener("click", () => {
    const max = (lastOutput.simulation || []).length;
    if (simStep < max - 1) { simStep++; renderOutput(); }
  });
  document.getElementById("sim-play")?.addEventListener("click", () => {
    if (simInterval) { clearInterval(simInterval); simInterval = null; return; }
    const max = (lastOutput.simulation || []).length;
    simInterval = setInterval(() => {
      if (simStep < max - 1) { simStep++; renderOutput(); }
      else { clearInterval(simInterval); simInterval = null; }
    }, 400);
  });
}

/* ═══════════════════════════════════════════════════════════════
   Compile
   ═══════════════════════════════════════════════════════════════ */
async function runCompile() {
  const code = editor ? editor.getValue() : "";
  if (!code.trim()) { setStatus("Nothing to compile.", "warn"); return; }
  setStatus("Compiling…", "busy");
  const t0 = performance.now();

  try {
    const res = await fetch("/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    if (!res.ok) throw new Error("Server error");
    lastOutput = await res.json();
  } catch {
    const data = compile(code);
    lastOutput = data;
  }

  const elapsed = (performance.now() - t0).toFixed(0);
  simStep = -1;
  setStatus(
    lastOutput.success ? "Compilation successful" : "Compilation finished with errors",
    lastOutput.success ? "success" : "error"
  );
  setMeta(`${elapsed}ms · ${lastOutput.tokens?.length || 0} tokens · LALR(1)`);
  applyMarkers(lastOutput.semantic?.errors || [], lastOutput.semantic?.warnings || []);
  renderOutput();
}

/* ═══════════════════════════════════════════════════════════════
   File Upload
   ═══════════════════════════════════════════════════════════════ */
function handleFileUpload(file) {
  if (!file) return;
  if (!file.name.endsWith(".c")) {
    setStatus("Invalid file type. Only .c files are allowed.", "error");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    if (editor) editor.setValue(reader.result);
    const badge = document.getElementById("file-badge");
    if (badge) { badge.textContent = file.name; badge.classList.add("visible"); }
    setStatus(`Loaded: ${file.name}`, "success");
  };
  reader.onerror = () => setStatus("Failed to read file.", "error");
  reader.readAsText(file);
}

/* ═══════════════════════════════════════════════════════════════
   Download
   ═══════════════════════════════════════════════════════════════ */
function downloadOutputs() {
  const sections = [];
  sections.push("=== TOKENS ===");
  (lastOutput.tokens || []).forEach((t,i) => sections.push(`${i+1}. [Line ${t.line}] ${t.type}: ${t.value}`));
  sections.push("\n=== AST ===");
  sections.push(lastOutput.ast || "No AST");
  sections.push("\n=== SEMANTIC ANALYSIS ===");
  (lastOutput.semantic?.errors || []).forEach(e => sections.push(`ERROR [Line ${e.line}]: ${e.message}`));
  (lastOutput.semantic?.warnings || []).forEach(w => sections.push(`WARNING [Line ${w.line}]: ${w.message}`));
  sections.push("\n=== SYMBOL TABLE ===");
  (lastOutput.symbolTable || []).forEach(s => sections.push(`${s.name} : ${s.type} (scope=${s.scope}, line=${s.line})`));
  sections.push("\n=== THREE-ADDRESS CODE ===");
  (lastOutput.tac || []).forEach((l,i) => sections.push(`${i+1}: ${l}`));
  sections.push("\n=== OPTIMIZED TAC ===");
  (lastOutput.optimizedTac || []).forEach((l,i) => sections.push(`${i+1}: ${l}`));
  if (lastOutput.optimizations?.length) {
    sections.push("\n=== OPTIMIZATIONS ===");
    lastOutput.optimizations.forEach(o => sections.push(`- ${o}`));
  }

  const blob = new Blob([sections.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "compiler-output.txt";
  a.click();
  URL.revokeObjectURL(url);
  setStatus("Output downloaded", "success");
}

/* ═══════════════════════════════════════════════════════════════
   Copy
   ═══════════════════════════════════════════════════════════════ */
async function copyOutput() {
  let text = "";
  if (activeTab === "Tokens") {
    text = (lastOutput.tokens || []).map((t,i) => `${i+1}\t${t.line}\t${t.type}\t${t.value}`).join("\n");
  } else if (activeTab === "Abstract Syntax Tree (AST)") {
    text = lastOutput.astTree ? formatAst(lastOutput.astTree) : (lastOutput.ast || "");
  } else if (activeTab === "Semantic Analysis") {
    const lines = [];
    (lastOutput.semantic?.errors || []).forEach(e => lines.push(`ERROR [Line ${e.line}]: ${e.message}`));
    (lastOutput.semantic?.warnings || []).forEach(w => lines.push(`WARNING [Line ${w.line}]: ${w.message}`));
    text = lines.length ? lines.join("\n") : "No semantic issues.";
  } else if (activeTab === "Symbol Table") {
    text = (lastOutput.symbolTable || []).map(s => `${s.name}\t${s.type}\tScope ${s.scope}\tLine ${s.line}`).join("\n");
  } else if (activeTab === "TAC") {
    text = (lastOutput.tac || []).join("\n");
  } else if (activeTab === "Optimized TAC") {
    text = (lastOutput.optimizedTac || []).join("\n");
  }
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Copied to clipboard", "success");
  } catch { setStatus("Copy failed", "error"); }
}

/* ═══════════════════════════════════════════════════════════════
   Sample Dropdown
   ═══════════════════════════════════════════════════════════════ */
function buildSampleMenu() {
  const menu = document.getElementById("sample-menu");
  if (!menu) return;
  menu.innerHTML = "";
  SAMPLES.forEach(s => {
    const btn = document.createElement("button");
    btn.className = "dropdown-item";
    btn.innerHTML = `${esc(s.name)}<span class="dropdown-item-desc">${esc(s.desc)}</span>`;
    btn.addEventListener("click", () => {
      if (editor) editor.setValue(s.code);
      document.getElementById("sample-dropdown")?.classList.remove("open");
      setStatus(`Loaded: ${s.name}`, "success");
    });
    menu.appendChild(btn);
  });
}

/* ═══════════════════════════════════════════════════════════════
   Resize Handle
   ═══════════════════════════════════════════════════════════════ */
function setupResize() {
  const handle = document.getElementById("resize-handle");
  const editorPanel = document.getElementById("editor-panel");
  const outputPanel = document.getElementById("output-panel");
  if (!handle || !editorPanel || !outputPanel) return;

  let dragging = false;
  handle.addEventListener("mousedown", (e) => {
    dragging = true;
    handle.classList.add("dragging");
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const layout = document.getElementById("layout");
    const rect = layout.getBoundingClientRect();
    const pct = ((e.clientX - rect.left) / rect.width) * 100;
    const clamped = Math.max(20, Math.min(80, pct));
    editorPanel.style.flex = `0 0 ${clamped}%`;
    outputPanel.style.flex = `0 0 ${100 - clamped}%`;
  });
  document.addEventListener("mouseup", () => {
    if (dragging) { dragging = false; handle.classList.remove("dragging"); }
  });
}

/* ═══════════════════════════════════════════════════════════════
   Editor Init
   ═══════════════════════════════════════════════════════════════ */
function initEditor() {
  const host = document.getElementById("editor-host");

  // Dark theme
  window.monaco.editor.defineTheme("compiler-dark", {
    base: "vs-dark", inherit: true,
    rules: [
      { token: "comment", foreground: "6ee7b7", fontStyle: "italic" },
      { token: "keyword", foreground: "c4b5fd" },
      { token: "number", foreground: "67e8f9" },
      { token: "string", foreground: "f9a8d4" }
    ],
    colors: {
      "editor.background": "#0e0e1a",
      "editor.foreground": "#e2e8f0",
      "editorLineNumber.foreground": "#4a4a6a",
      "editorLineNumber.activeForeground": "#a78bfa",
      "editorCursor.foreground": "#22d3ee",
      "editor.selectionBackground": "#7c3aed44",
      "editorLineHighlightBackground": "#1a1a2eaa",
      "editorWidget.background": "#16162a",
      "editorIndentGuide.background": "#22223a"
    }
  });

  // Light theme
  window.monaco.editor.defineTheme("compiler-light", {
    base: "vs", inherit: true,
    rules: [
      { token: "comment", foreground: "059669", fontStyle: "italic" },
      { token: "keyword", foreground: "7c3aed" },
      { token: "number", foreground: "0891b2" },
      { token: "string", foreground: "db2777" }
    ],
    colors: {
      "editor.background": "#fafafe",
      "editor.foreground": "#1a1a2e",
      "editorLineNumber.foreground": "#999",
      "editorLineNumber.activeForeground": "#7c3aed",
      "editorCursor.foreground": "#7c3aed",
      "editor.selectionBackground": "#7c3aed22",
      "editorLineHighlightBackground": "#f0f0f6",
      "editorWidget.background": "#fff"
    }
  });

  const theme = getTheme() === "dark" ? "compiler-dark" : "compiler-light";
  editor = window.monaco.editor.create(host, {
    value: SAMPLES[1].code,
    language: "cpp",
    theme,
    fontFamily: "'JetBrains Mono', Consolas, monospace",
    fontSize: 14,
    minimap: { enabled: false },
    automaticLayout: true,
    scrollBeyondLastLine: false,
    padding: { top: 12, bottom: 12 },
    smoothScrolling: true,
    cursorBlinking: "smooth",
    renderLineHighlight: "all",
    bracketPairColorization: { enabled: true }
  });

  // Ctrl+Enter to compile
  editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Enter, () => runCompile());
}

/* ═══════════════════════════════════════════════════════════════
   Event Wiring
   ═══════════════════════════════════════════════════════════════ */
document.getElementById("btn-compile")?.addEventListener("click", () => runCompile());
document.getElementById("btn-clear")?.addEventListener("click", () => {
  if (editor) editor.setValue("");
  lastOutput = { tokens:[], ast:"", astTree:null, semantic:{errors:[],warnings:[],symbolTable:[]}, tac:[], optimizedTac:[], optimizations:[], symbolTable:[], simulation:[], success:false };
  applyMarkers([], []);
  simStep = -1;
  setStatus("Cleared", "default");
  renderOutput();
  const badge = document.getElementById("file-badge");
  if (badge) badge.classList.remove("visible");
});
document.getElementById("btn-copy")?.addEventListener("click", () => copyOutput());
document.getElementById("btn-download")?.addEventListener("click", () => downloadOutputs());

// File upload
document.getElementById("file-upload")?.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (file) handleFileUpload(file);
  e.target.value = "";
});

// Sample dropdown toggle
document.getElementById("btn-sample")?.addEventListener("click", (e) => {
  e.stopPropagation();
  document.getElementById("sample-dropdown")?.classList.toggle("open");
});
document.addEventListener("click", () => {
  document.getElementById("sample-dropdown")?.classList.remove("open");
});

// Theme toggle
document.getElementById("btn-theme")?.addEventListener("click", () => {
  setTheme(getTheme() === "dark" ? "light" : "dark");
});

/* ═══════════════════════════════════════════════════════════════
   Init
   ═══════════════════════════════════════════════════════════════ */
const savedTheme = localStorage.getItem("compiler-theme") || "dark";
setTheme(savedTheme);
buildTabs();
buildSampleMenu();
initEditor();
setupResize();
renderOutput();
