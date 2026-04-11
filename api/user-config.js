// api/user-config.js
// GASが利用可能ならGAS優先、利用不可ならローカルJSON(data/users.json)で管理

const https = require('https');
const fs = require('fs');
const path = require('path');

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

// ===== ローカルJSON操作 =====
function loadUsers() {
  if (!fs.existsSync(USERS_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); } catch(e) { return []; }
}

function saveUsers(users) {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function getLocalUser(userId) {
  return loadUsers().find(u => u.userId === userId) || null;
}

function saveLocalUser(payload) {
  const users = loadUsers();
  const idx = users.findIndex(u => u.userId === payload.userId);
  const entry = {
    userId:           payload.userId,
    name:             payload.name || '',
    agentId:          payload.agentId || '',
    voiceId:          payload.voiceId || '',
    sessionSheetName: payload.sessionSheetName || ('セッション_' + payload.userId),
    pin:              payload.pin || '1234',
    prompt:           payload.prompt || '',
  };
  if (idx >= 0) { users[idx] = entry; } else { users.push(entry); }
  saveUsers(users);
  return { status: 'ok', action: idx >= 0 ? 'updated' : 'created', userId: payload.userId };
}

// ===== GAS通信 =====
function fetchFromGAS(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    function doReq(opts) {
      const req = https.request(opts, res => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          const loc = res.headers.location;
          const r = loc.startsWith('http') ? new URL(loc) : new URL('https://script.google.com' + loc);
          return doReq({ hostname: r.hostname, path: r.pathname + r.search, method: 'GET', headers: {} });
        }
        let d = '';
        res.on('data', c => { d += c; });
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(new Error('GAS parse error')); } });
      });
      req.on('error', reject);
      req.end();
    }
    doReq({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers: {} });
  });
}

function postToGAS(gasUrl, body) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body);
    const u = new URL(gasUrl);
    function doReq(opts, data) {
      const req = https.request(opts, res => {
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          const loc = res.headers.location;
          const r = loc.startsWith('http') ? new URL(loc) : new URL('https://script.google.com' + loc);
          return doReq({ hostname: r.hostname, path: r.pathname + r.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, data);
        }
        let d = '';
        res.on('data', c => { d += c; });
        res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(new Error('GAS parse error')); } });
      });
      req.on('error', reject);
      req.write(data); req.end();
    }
    doReq({ hostname: u.hostname, path: u.pathname + u.search, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } }, payload);
  });
}

// ===== メインハンドラ =====
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const gasUrl = process.env.GAS_WEB_APP_URL;

  // ===== GET =====
  if (req.method === 'GET') {
    const params = new URL('http://x' + req.url).searchParams;
    const action = params.get('action') || 'user';
    const userId = params.get('userId') || 'default';

    // 全ユーザー一覧
    if (action === 'users') {
      const users = loadUsers();
      return res.status(200).json({ status: 'ok', users });
    }

    // ユーザー設定取得：ローカル優先
    const local = getLocalUser(userId);
    if (local) return res.status(200).json({ status: 'ok', ...local });

    // GASから試みる
    if (gasUrl) {
      try {
        const data = await fetchFromGAS(gasUrl + '?action=user&userId=' + encodeURIComponent(userId));
        if (data.status === 'ok') return res.status(200).json(data);
      } catch(e) { /* フォールバック */ }
    }
    return res.status(200).json({ status: 'error', message: 'ユーザーが見つかりません' });
  }

  // ===== POST =====
  if (req.method === 'POST') {
    const body = req.body || {};
    // ローカルに必ず保存
    const result = saveLocalUser(body);
    console.log('[user-config] ローカル保存:', body.userId, result.action);

    // GASにも非同期で保存（失敗しても無視）
    if (gasUrl) {
      postToGAS(gasUrl, { action: 'saveUser', ...body })
        .then(d => console.log('[user-config] GAS保存:', d.status))
        .catch(e => console.warn('[user-config] GAS保存失敗（ローカルは保存済み）:', e.message));
    }

    return res.status(200).json(result);
  }

  return res.status(405).json({ status: 'error', message: 'Method not allowed' });
};
