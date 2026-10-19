import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { createLayerApiMiddleware } from './server/layerApiMiddleware.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 80);
const DIST_DIR = path.join(__dirname, 'dist');
// Prefer public/data if mounted/present so edits persist directly on the source layer.Y.json files
const PUBLIC_DATA_DIR = path.join(__dirname, 'public', 'data');
const DIST_DATA_DIR = path.join(DIST_DIR, 'data');
const DATA_DIR = fs.existsSync(PUBLIC_DATA_DIR) ? PUBLIC_DATA_DIR : DIST_DATA_DIR;

const apiMiddleware = createLayerApiMiddleware(DATA_DIR);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp'
};

const server = http.createServer((req, res) => {
  apiMiddleware(req, res, () => {
    const urlObj = new URL(req.url, 'http://localhost');
    const cleanPath = decodeURIComponent(urlObj.pathname);

    // Prevent directory traversal
    if (cleanPath.includes('..')) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let filePath;
    if (cleanPath.startsWith('/data/')) {
      filePath = path.join(DATA_DIR, cleanPath.slice('/data/'.length));
    } else {
      filePath = path.join(DIST_DIR, cleanPath === '/' ? 'index.html' : cleanPath);
    }

    // SPA fallback to index.html if route doesn't match a static file
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      if (cleanPath.startsWith('/data/') || cleanPath.startsWith('/api/')) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
        return;
      }
      filePath = path.join(DIST_DIR, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isDataJson = cleanPath.startsWith('/data/');

    const headers = {
      'Content-Type': contentType,
      'Cache-Control': isDataJson ? 'no-store, no-cache, must-revalidate' : 'public, max-age=3600'
    };

    const acceptEncoding = req.headers['accept-encoding'] || '';
    const shouldGzip =
      acceptEncoding.includes('gzip') &&
      (ext === '.json' || ext === '.js' || ext === '.css' || ext === '.html');

    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500);
      }
      res.end('Internal Server Error');
    });

    if (shouldGzip) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      stream.pipe(zlib.createGzip()).pipe(res);
    } else {
      res.writeHead(200, headers);
      stream.pipe(res);
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Basgiath Live-Server & Layer-Sync API listening on port ${PORT} (DATA_DIR: ${DATA_DIR})`);
});
