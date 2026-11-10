import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..', 'dist');

const pfxPath = path.resolve(__dirname, '..', 'cert.pfx');
let pfx;
try {
  pfx = fs.readFileSync(pfxPath);
} catch (e) {
  console.warn('Could not read cert.pfx, HTTPS might not start:', e.message);
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.gpx': 'application/gpx+xml; charset=utf-8'
};

function handleRequest(req, res) {
  let reqPath = decodeURIComponent(req.url.split('?')[0]);
  if (reqPath === '/') reqPath = '/index.html';

  let filePath = path.join(rootDir, reqPath);

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

// 1. HTTP Server on 5500
const httpServer = http.createServer(handleRequest);
httpServer.listen(5500, '0.0.0.0', () => {
  console.log('HTTP server running at http://localhost:5500');
  console.log('Local Wi-Fi HTTP: http://192.168.0.44:5500');
});

// 2. HTTPS Server on 5501
if (pfx) {
  const httpsOptions = {
    pfx,
    passphrase: 'powderline'
  };
  const httpsServer = https.createServer(httpsOptions, handleRequest);
  httpsServer.listen(5501, '0.0.0.0', () => {
    console.log('HTTPS server running at https://localhost:5501');
    console.log('Local Wi-Fi HTTPS: https://192.168.0.44:5501');
  });
}
