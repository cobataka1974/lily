// api/call-now.js
// POST /api/call-now  → 「今すぐ会話」コマンドをセット
// GET  /api/call-now  → コマンドを取得してクリア（リリー画面がポーリング）

const fs   = require('fs');
const path = require('path');

// userId別にフラグファイルを管理
function getFlagFile(userId) {
  return path.join(process.cwd(), 'data', 'call-now-' + (userId || 'default') + '.json');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // ===== POST: ダッシュボードから「今すぐ会話」 =====
  if (req.method === 'POST') {
    const body = req.body || {};
    const userId = body.userId || 'default';
    const flagFile = getFlagFile(userId);
    const payload = { requested: true, at: new Date().toISOString() };
    fs.writeFileSync(flagFile, JSON.stringify(payload), 'utf8');
    console.log('[call-now] コマンドをセットしました userId=' + userId + ':', payload.at);
    return res.status(200).json({ status: 'ok', message: '会話開始コマンドを送信しました' });
  }

  // ===== GET: リリー画面がポーリング（取得後クリア） =====
  if (req.method === 'GET') {
    const userId = new URL('http://x' + req.url).searchParams.get('userId') || 'default';
    const flagFile = getFlagFile(userId);
    if (!fs.existsSync(flagFile)) {
      return res.status(200).json({ status: 'ok', requested: false });
    }
    try {
      const data = JSON.parse(fs.readFileSync(flagFile, 'utf8'));
      fs.unlinkSync(flagFile);
      const age = Date.now() - new Date(data.at).getTime();
      if (age > 5 * 60 * 1000) {
        console.log('[call-now] コマンドが古いため無視 userId=' + userId);
        return res.status(200).json({ status: 'ok', requested: false });
      }
      console.log('[call-now] コマンドを返しました userId=' + userId);
      return res.status(200).json({ status: 'ok', requested: true });
    } catch(e) {
      return res.status(200).json({ status: 'ok', requested: false });
    }
  }

  return res.status(405).json({ status: 'error', message: 'Method not allowed' });
};
