// api/sessions.js
// GET /api/sessions
// GAS または sessions.json から全セッションデータを返す（ダッシュボード用）

const https = require('https');
const fs    = require('fs');
const path  = require('path');

const DATA_FILE = path.join(process.cwd(), 'data', 'sessions.json');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'error', message: 'GET only' });
  }

  // userIdをURLパラメータから取得
  const userId = new URL('http://x' + req.url).searchParams.get('userId') || 'default';

  // GAS が設定されていれば GAS から取得（最新データ）
  const gasUrl = process.env.GAS_WEB_APP_URL;
  if (gasUrl) {
    try {
      const sessions = await fetchFromGas(gasUrl, userId);
      return res.status(200).json({ status: 'ok', sessions });
    } catch (err) {
      console.warn('[sessions] GAS取得失敗、sessions.json にフォールバック:', err.message);
    }
  }

  // フォールバック: sessions.json
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return res.status(200).json({ status: 'ok', sessions: [] });
    }
    const sessions = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return res.status(200).json({ status: 'ok', sessions: Array.isArray(sessions) ? sessions : [] });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
};

function fetchFromGas(gasUrl, userId) {
  return new Promise((resolve, reject) => {
    const url = new URL(gasUrl);
    // userIdをGASに渡す
    url.searchParams.set('action', 'memory');
    url.searchParams.set('userId', userId || 'default');
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
    };

    function doRequest(opts) {
      const req = https.request(opts, (res) => {
        // リダイレクト追跡
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          const loc = res.headers.location;
          const newUrl = loc.startsWith('http') ? new URL(loc) : new URL('https://script.google.com' + loc);
          return doRequest({
            hostname: newUrl.hostname,
            path: newUrl.pathname + newUrl.search,
            method: 'GET',
          });
        }
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.status === 'ok') {
              // GASのmemoryレスポンス形式: { sessions: [...] }
              if (Array.isArray(json.sessions)) {
                resolve(json.sessions);
              } else {
                resolve([]);
              }
            } else {
              reject(new Error('GAS response: ' + JSON.stringify(json).substring(0, 100)));
            }
          } catch (e) {
            reject(new Error('JSON parse error: ' + data.substring(0, 100)));
          }
        });
      });
      req.on('error', reject);
      req.end();
    }

    doRequest(options);
  });
}
