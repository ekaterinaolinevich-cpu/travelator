// Травелатор — мини-сервер: раздаёт статику из public/.
// Данные хранятся на телефоне (localStorage), сервер нужен только чтобы открыть приложение.
// Позже сюда можно добавить API (см. ИДЕИ.md).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

const TEXT = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt', '.md']);

// сжатые версии держим в памяти: файлы меняются редко
const gzipCache = new Map();

function gzipFor(filePath, buf, mtimeMs) {
  const key = filePath;
  const hit = gzipCache.get(key);
  if (hit && hit.mtimeMs === mtimeMs) return hit.buf;
  const bufGz = zlib.gzipSync(buf, { level: 6 });
  gzipCache.set(key, { mtimeMs, buf: bufGz });
  return bufGz;
}

function send(req, res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function serveFile(req, res, filePath, stat) {
  const ext = path.extname(filePath).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;

  const isAsset = ext === '.css' || ext === '.js' || ext === '.png' || ext === '.jpg' || ext === '.woff2';
  const cache = isAsset ? 'public, max-age=300' : 'no-cache';
  const baseHeaders = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': cache,
    ETag: etag,
    Vary: 'Accept-Encoding',
  };

  if (req.headers['if-none-match'] === etag) {
    return send(req, res, 304, baseHeaders);
  }

  fs.readFile(filePath, (err, data) => {
    if (err) return send(req, res, 500, { 'Content-Type': 'text/plain' }, 'Read error');

    const wantsGzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (wantsGzip && TEXT.has(ext) && data.length > 1024) {
      const gz = gzipFor(filePath, data, stat.mtimeMs);
      return send(req, res, 200, { ...baseHeaders, 'Content-Encoding': 'gzip' }, gz);
    }
    return send(req, res, 200, baseHeaders, data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(req, res, 405, { 'Content-Type': 'text/plain' }, 'Method not allowed');
  }

  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    return send(req, res, 400, { 'Content-Type': 'text/plain' }, 'Bad request');
  }

  if (urlPath === '/health') {
    return send(req, res, 200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, JSON.stringify({ ok: true, app: 'travelator' }));
  }

  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(PUBLIC, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC + path.sep) && filePath !== path.join(PUBLIC, 'index.html')) {
    return send(req, res, 403, { 'Content-Type': 'text/plain' }, 'Forbidden');
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      // SPA: любой неизвестный путь отдаём в index.html
      const index = path.join(PUBLIC, 'index.html');
      return fs.stat(index, (e2, st2) => {
        if (e2) return send(req, res, 404, { 'Content-Type': 'text/plain' }, 'Not found');
        serveFile(req, res, index, st2);
      });
    }
    serveFile(req, res, filePath, stat);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Травелатор — http://${HOST}:${PORT}\n`);
});
