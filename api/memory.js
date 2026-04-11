// api/memory.js
// GET /api/memory
// Google Sheets (GAS) から直近3件の記憶を返す。GAS未設定時はローカル sessions.json にフォールバック

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_FILE = path.join(process.cwd(), 'data', 'sessions.json');

/**
 * GAS の doGet を叩いて直近セッションを取得する
 */
function fetchFromGAS(gasUrl) {
  return new Promise((resolve, reject) => {
    const url = new URL(gasUrl);
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    };

    function doRequest(opts) {
      const req = https.request(opts, (res) => {
        // GAS は GET でも 302 リダイレクトを返すことがある
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          const loc = res.headers.location;
          const redirectUrl = loc.startsWith('http') ? new URL(loc) : new URL('https://script.google.com' + loc);
          return doRequest({
            hostname: redirectUrl.hostname,
            path: redirectUrl.pathname + redirectUrl.search,
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });
        }
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error('GAS レスポンスの JSON パース失敗: ' + data.substring(0, 100)));
          }
        });
      });
      req.on('error', reject);
      req.end();
    }

    doRequest(options);
  });
}

module.exports = async function handler(req, res) {
  // CORS ヘッダー
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ status: 'error', message: 'GET メソッドのみ受け付けます' });
  }

  try {
    // userId をクエリパラメータから取得
    const userId = new URL('http://x' + req.url).searchParams.get('userId') || 'default';
    const gasUrl = process.env.GAS_WEB_APP_URL;

    // ===== GAS から取得（優先）=====
    if (gasUrl) {
      try {
        console.log('[memory] GAS からセッションデータを取得中... userId:', userId);
        const data = await fetchFromGAS(gasUrl + '?action=memory&userId=' + encodeURIComponent(userId));

        if (data.status === 'ok') {
          console.log('[memory] GAS から取得成功。prompt_addition:', data.prompt_addition);
          return res.status(200).json({
            status: 'ok',
            prompt_addition: data.prompt_addition || '',
            recent_hints: data.recent_hints || [],
          });
        } else {
          console.warn('[memory] GAS からエラー応答:', data.message);
          // フォールバックへ
        }
      } catch (gasErr) {
        console.warn('[memory] GAS 取得失敗（ローカルにフォールバック）:', gasErr.message);
        // フォールバックへ
      }
    }

    // ===== ローカル sessions.json にフォールバック =====
    console.log('[memory] ローカル sessions.json を使用します');

    if (!fs.existsSync(DATA_FILE)) {
      console.log('[memory] sessions.json が見つかりません。初回起動として扱います');
      return res.status(200).json({ status: 'ok', prompt_addition: '', recent_hints: [] });
    }

    let sessions = [];
    try {
      sessions = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.error('[memory] sessions.json の読み込みに失敗しました:', e.message);
      return res.status(200).json({ status: 'ok', prompt_addition: '', recent_hints: [] });
    }

    if (!Array.isArray(sessions) || sessions.length === 0) {
      console.log('[memory] セッションデータが空です');
      return res.status(200).json({ status: 'ok', prompt_addition: '', recent_hints: [] });
    }

    const recent = sessions.slice(-3);
    console.log(`[memory] 直近 ${recent.length} 件のセッションを返します`);

    const promptParts = recent
      .map((s) => (s.prompt_addition || '').trim())
      .filter((p) => p.length > 0);
    const promptAddition = promptParts.join(' ');

    const recentHints = [];
    recent.forEach((s) => {
      const hints = s.next_session_hints || [];
      hints
        .filter((h) => h.priority === 1 || hints.length <= 3)
        .slice(0, 2)
        .forEach((h) => {
          if (h.hint && !recentHints.includes(h.hint)) {
            recentHints.push(h.hint);
          }
        });
    });

    return res.status(200).json({
      status: 'ok',
      prompt_addition: promptAddition,
      recent_hints: recentHints.slice(0, 6),
    });

  } catch (err) {
    console.error('[memory] 予期しないエラー:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};
