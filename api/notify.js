// api/notify.js
// POST /api/notify
// エラー・懸念事項の通知（現在はスタブ実装）
// TODO: メール / LINE Notify / Slack 等への通知を実装

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ status: 'error', message: 'POST メソッドのみ受け付けます' });
  }

  try {
    const { type, detail, severity, sessionDate } = req.body || {};

    // ログ出力（スタブ）
    console.log(`[notify] 通知受信: type=${type}, severity=${severity}, date=${sessionDate}`);
    console.log(`[notify] 詳細: ${detail}`);

    // TODO: 重要度が「高」の場合は外部サービスへ通知
    if (severity === '高') {
      console.warn(`[notify] ⚠️  高重要度の懸念事項: ${detail}`);
      // 例: await sendLineNotify(`【リリー警告】${detail}`);
    }

    return res.status(200).json({ status: 'ok', message: '通知を受け取りました（現在スタブ実装）' });

  } catch (err) {
    console.error('[notify] 予期しないエラー:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};
