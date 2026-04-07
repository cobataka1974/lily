// api/memory.js
// GET /api/memory
// data/sessions.json から直近3件の記憶を返す

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(process.cwd(), 'data', 'sessions.json');

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
    // sessions.json が存在しない場合は空のレスポンスを返す
    if (!fs.existsSync(DATA_FILE)) {
      console.log('[memory] sessions.json が見つかりません。初回起動として扱います');
      return res.status(200).json({
        status: 'ok',
        prompt_addition: '',
        recent_hints: [],
      });
    }

    let sessions = [];
    try {
      sessions = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.error('[memory] sessions.json の読み込みに失敗しました:', e.message);
      return res.status(200).json({
        status: 'ok',
        prompt_addition: '',
        recent_hints: [],
      });
    }

    if (!Array.isArray(sessions) || sessions.length === 0) {
      console.log('[memory] セッションデータが空です');
      return res.status(200).json({
        status: 'ok',
        prompt_addition: '',
        recent_hints: [],
      });
    }

    // 直近3件を取得
    const recent = sessions.slice(-3);
    console.log(`[memory] 直近 ${recent.length} 件のセッションを返します`);

    // prompt_addition を結合（空文字除外）
    const promptParts = recent
      .map((s) => (s.prompt_addition || '').trim())
      .filter((p) => p.length > 0);
    const promptAddition = promptParts.join(' ');

    // next_session_hints から priority:1 のヒントを収集
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
      recent_hints: recentHints.slice(0, 6), // 最大6件
    });

  } catch (err) {
    console.error('[memory] 予期しないエラー:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};
