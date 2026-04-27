/**
 * Static file server + REST API for compile & file upload (Node.js).
 * Serves ./web and:
 *   POST /compile   { "code": "..." }
 *   POST /upload    multipart file (.c only)
 */

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { compile } from "./web/compiler.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "web");

const app = express();
app.use(express.json({ limit: "512kb" }));

/* ── Compile endpoint ── */
app.post("/compile", (req, res) => {
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  try {
    const result = compile(code);
    res.json(result);
  } catch (err) {
    res.status(500).json({
      tokens: [], ast: String(err), astTree: null,
      semantic: { errors: [{ line: 1, message: String(err) }], warnings: [], symbolTable: [] },
      tac: [], optimizedTac: [], optimizations: [],
      symbolTable: [], simulation: [], success: false
    });
  }
});

/* ── File upload endpoint (raw body, validated in server) ── */
app.post("/upload", express.raw({ type: "*/*", limit: "1mb" }), (req, res) => {
  const filename = req.headers["x-filename"] || "";
  if (!filename.endsWith(".c")) {
    return res.status(400).json({ error: "Only .c files are allowed." });
  }
  try {
    const code = Buffer.isBuffer(req.body) ? req.body.toString("utf-8") : String(req.body);
    res.json({ code, filename });
  } catch (err) {
    res.status(500).json({ error: "Failed to read uploaded file." });
  }
});

app.use(express.static(webRoot));

const PORT = Number(process.env.PORT) || 8000;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Open http://127.0.0.1:${PORT}`);
});
