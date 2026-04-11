// api/user-config.js
// GET  /api/user-config?userId=xxx  → ユーザー設定取得（agentId, voiceId, name, prompt）
// GET  /api/user-config?action=users → 全ユーザー一覧
// POST /api/user-config              → ユーザー新規作成・更新

const https = require('https');

function fetchFromGAS(gasUrl, params) {
  return new Promise((resolve, reject) => {
    const url = new URL(gasUrl);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    function doRequest(opts) {
      const req = https.request(opts, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          const loc = res.headers.location;
          const r = loc.startsWith('http') ? new URL(loc) : new URL('https://script.google.com' + loc);
          return doRequest({ hostname: r.hostname, path: r.pathname + r.search, method: 'GET', headers: {} });
        }
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(new Error('Parse error: ' + data.slice(0, 100))); } });
      });
      req.on('error', reject);
      req.end();
    }
    doRequest({ hostname: url.hostname, path: url.pathname + url.search, method: 'GET', headers: {} });
  });
}

function postToGAS(gasUrl, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(gasUrl);
    const payload = JSON.stringify(body);

    function doRequest(opts, data) {
      const req = https.request(opts, (res) => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          const loc = res.headers.location;
          const r = loc.startsWith('http') ? new URL(loc) : new URL('https://script.google.com' + loc);
          return doRequest({ hostname: r.hostname, path: r.pathname + r.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, data);
        }
        let d = '';
        res.on('data', c => { d += c; });
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(new Error('Parse error')); } });
      });
      req.on('error', reject);
      req.write(data);
      req.end();
    }
    doRequest({ hostname: url.hostname, path: url.pathname + url.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, payload);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gasUrl = process.env.GAS_WEB_APP_URL;
  if (!gasUrl) return res.status(500).json({ status: 'error', message: 'GAS_WEB_APP_URL未設定' });

  // GET: ユーザー設定取得
  if (req.method === 'GET') {
    const action = req.query?.action || (req.url.includes('action=users') ? 'users' : 'user');
    const userId = req.query?.userId || new URL('http://x' + req.url).searchParams.get('userId') || 'default';
    try {
      const data = await fetchFromGAS(gasUrl, action === 'users' ? { action: 'users' } : { action: 'user', userId });
      return res.status(200).json(data);
    } catch(e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }

  // POST: ユーザー保存
  if (req.method === 'POST') {
    const body = req.body || {};
    try {
      const data = await postToGAS(gasUrl, { action: 'saveUser', ...body });
      return res.status(200).json(data);
    } catch(e) {
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }

  return res.status(405).json({ status: 'error', message: 'Method not allowed' });
};
