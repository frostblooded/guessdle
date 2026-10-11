// Dev static file server for the repo root. Serves only what the page loads.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

const ROOT = resolve(import.meta.dirname);
const PORT = process.env.PORT ?? 8080;

const ALLOWED = /^\/(index\.html|styles\.css|favicon\.ico|(dist|photos)\/.+)$/;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

// Absolute path of the file a URL may read, or null if the page may not load it
function allowedFile(urlPath) {
  try {
    const file = resolve(join(ROOT, urlPath === "/" ? "index.html" : decodeURIComponent(urlPath)));
    // Test the resolved path, so an encoded "..%2f" cannot escape the allowlist
    const path = "/" + relative(ROOT, file).split(sep).join("/");
    return ALLOWED.test(path) ? file : null;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const file = allowedFile(new URL(req.url, "http://localhost").pathname);
  const body = file === null ? null : await readFile(file).catch(() => null);
  if (body === null)
    return res
      .writeHead(404, { "Content-Type": TYPES[".html"] })
      .end(await readFile(join(ROOT, "404.html")));

  res.writeHead(200, { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream" });
  res.end(body);
}).listen(PORT, "127.0.0.1");
