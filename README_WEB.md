# Web Compiler Frontend (HTML + CSS + JS + Node)

This replaces the previous Python/React setup with:

- **Frontend:** plain `index.html`, `style.css`, `app.js` (Monaco Editor from CDN)
- **Compiler logic:** `web/compiler.js` (lexer → AST → semantic checks → TAC)
- **Connection:** **Node.js + Express** serves the `web/` folder and exposes `POST /compile` (no Python)

## Run

```powershell
cd C:\E\placement\SemanticAnalyzer
npm install
npm start
```

Open **http://127.0.0.1:8000**

## API

`POST /compile` with JSON body `{ "code": "int a = 5;" }` returns:

- `tokens`, `ast`, `semantic.errors`, `semantic.warnings`, `tac`, `success`

## Offline / static only

If you open `web/index.html` directly (`file://`), the browser may block `fetch` to `/compile`. In that case, **Compile** falls back to running `compile()` locally in the browser (same `compiler.js`).

## Optional: your C++ `SemanticAnalyzer.exe`

The web pipeline is self-contained in JavaScript. To drive your existing C++ binary from Node instead, you could extend `server.js` with `child_process` and merge stdout into the response (separate small change).
