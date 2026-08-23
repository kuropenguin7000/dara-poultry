// Minimal static file server for local preview (no dependencies)
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = process.env.PORT || 4173;
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json",
  // Firebase Hosting sets these itself; they are here so local preview
  // behaves the same, since <video> rejects application/octet-stream.
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".webp": "image/webp",
};

http
  .createServer((req, res) => {
    let urlPath = decodeURIComponent(req.url.split("?")[0]);
    if (urlPath === "/") urlPath = "/index.html";
    const filePath = path.join(root, urlPath);
    if (!filePath.startsWith(root)) { res.writeHead(403); return res.end("Forbidden"); }
    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) { res.writeHead(404); return res.end("Not found"); }

      const type = types[path.extname(filePath)] || "application/octet-stream";
      const total = stat.size;

      /* Byte ranges matter for the background <video>. Without Content-Length
         and Accept-Ranges the response goes out chunked, Chrome decides the
         media is unseekable, and the loop stalls at readyState 0 — so local
         preview would show no video at all. Real Hosting handles this itself. */
      const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
      if (m && (m[1] || m[2])) {
        let start = m[1] ? parseInt(m[1], 10) : total - parseInt(m[2], 10);
        let end = m[1] && m[2] ? parseInt(m[2], 10) : total - 1;
        start = Math.max(0, start);
        end = Math.min(end, total - 1);
        if (start > end) {
          res.writeHead(416, { "Content-Range": `bytes */${total}` });
          return res.end();
        }
        res.writeHead(206, {
          "Content-Type": type,
          "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
        });
        return fs.createReadStream(filePath, { start, end }).pipe(res);
      }

      res.writeHead(200, { "Content-Type": type, "Content-Length": total, "Accept-Ranges": "bytes" });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(filePath).pipe(res);
    });
  })
  .listen(port, () => console.log(`Dara Poultry preview running at http://localhost:${port}`));
