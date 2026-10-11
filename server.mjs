// Dev static file server: serves the repo root on 127.0.0.1:8080.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname);
const PORT = 8080;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  let file = resolve(join(ROOT, decoded));
  if (file !== ROOT && !file.startsWith(ROOT + sep))
    return null;
  // Hidden files (.git, .env) are never served
  if (file.slice(ROOT.length).split(sep).some((part) => part.startsWith(".")))
    return null;
  if ((await stat(file)).isDirectory())
    file = join(file, "index.html");
  return file;
}

createServer(async (req, res) => {
  try {
    const file = await resolveFile(new URL(req.url, "http://localhost").pathname);
    if (file === null)
      return res.writeHead(403).end("Forbidden");
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(PORT, "127.0.0.1");
