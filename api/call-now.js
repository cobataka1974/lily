// api/call-now.js
// POST /api/call-now  → 「今すぐ会話」コマンドをセット
// GET  /api/call-now  → コマンドを取得してクリア（リリー画面がポーリング）

const fs   = require('fs');
const path = require('path');

const FLAG_FILE = path.join(process.cwd(), 'data', 'call-now.json');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const dataDir = path.dirname(FLAG_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // ===== POST: ダッシュボードから「今すぐ会話」 =====
  if (req.method === 'POST') {
    const payload = { requested: true, at: new Date().toISOString() };
    fs.writeFileSync(FLAG_FILE, JSON.stringify(payload), 'utf8');
    console.log('[call-now] コマンドをセットしました:', payload.at);
    return res.status(200).json({ status: 'ok', message: '会話開始コマンドを送信しました' });
  }

  // ===== GET: リリー画面がポーリング（取得後クリア） =====
  if (req.method === 'GET') {
    if (!fs.existsSync(FLAG_FILE)) {
      return res.status(200).json({ status: 'ok', requested: false });
    }
    try {
      const data = JSON.parse(fs.readFileSync(FLAG_FILE, 'utf8'));
      // 取得したらクリア
      fs.unlinkSync(FLAG_FILE);
      // 5分以上前のコマンドは無視
      const age = Date.now() - new Date(data.at).getTime();
      if (age > 5 * 60 * 1000) {
        console.log('[call-now] コマンドが古いため無視しました');
        return res.status(200).json({ status: 'ok', requested: false });
      }
      console.log('[call-now] コマンドを返しました（クリア済み）');
      return res.status(200).json({ status: 'ok', requested: true });
    } catch(e) {
      return res.status(200).json({ status: 'ok', requested: false });
    }
  }

  return res.status(405).json({ status: 'error', message: 'Method not allowed' });
};
