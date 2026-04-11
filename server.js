// server.js
// ローカル開発用 Node.js HTTP サーバー（依存ゼロ）
// ポート 3000 で起動
// GET  /        → index.html
// GET  /api/memory  → api/memory.js
// POST /api/analyze → api/analyze.js
// GET  /public/* → public/ ディレクトリの静的ファイル

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;

// ===== .env.local を手動パース =====
function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) return;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // クォートを除去
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // .env.local を常に優先（システム環境変数より上書き）
    process.env[key] = val;
  });
  console.log('[env] .env.local を読み込みました');
}
loadEnvLocal();

// ===== data/ ディレクトリが無ければ作成 =====
const dataDir = path.join(ROOT, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('[init] data/ ディレクトリを作成しました');
}

// ===== MIME タイプ =====
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.webp': 'image/webp',
  '.woff2':'font/woff2',
  '.woff': 'font/woff',
  '.txt':  'text/plain; charset=utf-8',
};

// ===== req.body を JSON として読み込む =====
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); }
      catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

// ===== Vercel 風の res ラッパー =====
function makeResWrapper(res) {
  const wrapper = {
    _status: 200,
    _headers: {},
    status(code) { this._status = code; return this; },
    setHeader(k, v) { this._headers[k] = v; return this; },
    end() {
      res.writeHead(this._status, this._headers);
      res.end();
    },
    json(obj) {
      this._headers['Content-Type'] = this._headers['Content-Type'] || 'application/json; charset=utf-8';
      res.writeHead(this._status, this._headers);
      res.end(JSON.stringify(obj));
    },
  };
  return wrapper;
}

// ===== API ハンドラのキャッシュ =====
const configHandler     = require('./api/config.js');
const memoryHandler     = require('./api/memory.js');
const analyzeHandler    = require('./api/analyze.js');
const signedUrlHandler  = require('./api/signed-url.js');

// ===== HTTP サーバー =====
const server = http.createServer(async (req, res) => {
  // /lily プレフィックスを除去（Caddy経由でも直接アクセスでも動く）
  const rawUrl = req.url.split('?')[0];
  const url = rawUrl.startsWith('/lily') ? rawUrl.slice(5) || '/' : rawUrl;
  const method = req.method.toUpperCase();

  console.log(`[${method}] ${url}`);

  // OPTIONS プリフライト共通処理
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // ===== GET / → index.html =====
  if (method === 'GET' && (url === '/' || url === '/index.html')) {
    const filePath = path.join(ROOT, 'public', 'index.html');
    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    } catch (e) {
      res.writeHead(404); res.end('index.html not found');
    }
    return;
  }

  // ===== GET /api/config =====
  if (method === 'GET' && url === '/api/config') {
    const wrapped = makeResWrapper(res);
    const req2 = Object.assign(req, { method: 'GET', body: {} });
    await configHandler(req2, wrapped);
    return;
  }

  // ===== GET /api/signed-url =====
  if (method === 'GET' && url === '/api/signed-url') {
    const wrapped = makeResWrapper(res);
    const req2 = Object.assign(req, { method: 'GET', body: {} });
    await signedUrlHandler(req2, wrapped);
    return;
  }

  // ===== GET /api/memory =====
  if (method === 'GET' && url === '/api/memory') {
    const wrapped = makeResWrapper(res);
    const req2 = Object.assign(req, { method: 'GET', body: {} });
    await memoryHandler(req2, wrapped);
    return;
  }

  // ===== POST /api/analyze =====
  if (method === 'POST' && url === '/api/analyze') {
    const body = await readBody(req);
    const req2 = Object.assign(req, { method: 'POST', body });
    const wrapped = makeResWrapper(res);
    await analyzeHandler(req2, wrapped);
    return;
  }

  // ===== 静的ファイル /public/* =====
  if (method === 'GET' && url.startsWith('/public/')) {
    const filePath = path.join(ROOT, url);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext  = path.extname(filePath).toLowerCase();
      const mime = MIME[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404); res.end('Not Found');
    }
    return;
  }

  // ===== 404 =====
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('404 Not Found: ' + url);
});

server.listen(PORT, () => {
  console.log(`\n🌸 リリーサーバー起動中`);
  console.log(`   http://localhost:${PORT}/\n`);
});
