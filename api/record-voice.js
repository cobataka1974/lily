// api/record-voice.js
// POST /api/record-voice/start  : 録音セッション開始（sessionIdを返す）
// POST /api/record-voice/chunk  : 音声チャンク追記（multipart: sessionId + audio chunk）
// POST /api/record-voice/finish : 録音終了→声クローン作成→voiceId返却
// GET  /api/record-voice/status : 録音状態確認

const fs   = require('fs');
const path = require('path');
const https = require('https');

const RECORD_DIR = path.join(process.cwd(), 'data', 'recordings');
if (!fs.existsSync(RECORD_DIR)) fs.mkdirSync(RECORD_DIR, { recursive: true });

// インメモリセッション管理
const sessions = {};

function makeSessionId() {
  return 'rec_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = req.url.split('?')[0];

  // ===== POST /api/record-voice/start =====
  if (req.method === 'POST' && url.endsWith('/start')) {
    const { userId, aiName } = req.body || {};
    if (!userId) return res.status(400).json({ status: 'error', message: 'userId必須' });

    const sessionId = makeSessionId();
    const filePath = path.join(RECORD_DIR, sessionId + '.webm');
    sessions[sessionId] = {
      userId,
      aiName: aiName || 'voice',
      filePath,
      startedAt: Date.now(),
      bytesSaved: 0,
      status: 'recording',
    };

    // ファイル初期化
    fs.writeFileSync(filePath, Buffer.alloc(0));
    console.log('[record-voice] 録音開始:', sessionId, 'user:', userId);
    return res.status(200).json({ status: 'ok', sessionId });
  }

  // ===== POST /api/record-voice/chunk =====
  if (req.method === 'POST' && url.endsWith('/chunk')) {
    // ストリームからバイナリを直接読む
    const body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on('data', c => chunks.push(c));
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });

    const qs = new URLSearchParams(req.url.includes('?') ? req.url.split('?')[1] : '');
    const sessionId = qs.get('sessionId');

    if (!sessionId || !sessions[sessionId]) {
      return res.status(400).json({ status: 'error', message: 'sessionId不正' });
    }
    const sess = sessions[sessionId];
    if (sess.status !== 'recording') {
      return res.status(400).json({ status: 'error', message: '録音中でない' });
    }

    fs.appendFileSync(sess.filePath, body);
    sess.bytesSaved += body.length;
    return res.status(200).json({ status: 'ok', bytesSaved: sess.bytesSaved });
  }

  // ===== POST /api/record-voice/finish =====
  if (req.method === 'POST' && url.endsWith('/finish')) {
    const { sessionId } = req.body || {};
    if (!sessionId || !sessions[sessionId]) {
      return res.status(400).json({ status: 'error', message: 'sessionId不正' });
    }
    const sess = sessions[sessionId];
    sess.status = 'processing';

    const filePath = sess.filePath;
    const fileSizeMB = sess.bytesSaved / 1024 / 1024;
    console.log('[record-voice] 録音終了:', sessionId, fileSizeMB.toFixed(2), 'MB');

    if (fileSizeMB < 0.05) {
      sess.status = 'error';
      return res.status(400).json({ status: 'error', message: '音声が短すぎます（最低5秒以上必要）' });
    }

    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ status: 'error', message: 'API KEY未設定' });

    // ElevenLabsに音声ファイルを送信してクローン作成
    try {
      const voiceId = await cloneVoiceFromFile(filePath, sess.aiName + '_call_clone', apiKey);
      sess.status = 'done';
      sess.voiceId = voiceId;

      // ユーザー情報を更新
      const usersPath = path.join(process.cwd(), 'data', 'users.json');
      if (fs.existsSync(usersPath)) {
        const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
        const idx = users.findIndex(u => u.userId === sess.userId);
        if (idx >= 0) {
          users[idx].voiceId = voiceId;
          fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');
          console.log('[record-voice] voiceId更新:', sess.userId, '->', voiceId);
        }
      }

      // 一時ファイル削除
      try { fs.unlinkSync(filePath); } catch(e) {}

      return res.status(200).json({ status: 'ok', voiceId, message: '声クローンが完成しました' });
    } catch(e) {
      sess.status = 'error';
      console.error('[record-voice] クローン失敗:', e.message);
      return res.status(500).json({ status: 'error', message: e.message });
    }
  }

  // ===== GET /api/record-voice/status =====
  if (req.method === 'GET') {
    const qs = new URLSearchParams(req.url.includes('?') ? req.url.split('?')[1] : '');
    const sessionId = qs.get('sessionId');
    if (!sessionId || !sessions[sessionId]) {
      return res.status(404).json({ status: 'error', message: 'session not found' });
    }
    const sess = sessions[sessionId];
    return res.status(200).json({
      status: 'ok',
      recordStatus: sess.status,
      bytesSaved: sess.bytesSaved,
      voiceId: sess.voiceId || null,
    });
  }

  return res.status(404).json({ status: 'error', message: 'Not found' });
};

// ElevenLabs Voice Clone APIを呼び出す
function cloneVoiceFromFile(filePath, name, apiKey) {
  return new Promise((resolve, reject) => {
    const fileData = fs.readFileSync(filePath);
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);

    const formParts = [];
    // name フィールド
    formParts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\n${name}\r\n`)
    );
    // files フィールド
    formParts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="recording.webm"\r\nContent-Type: audio/webm\r\n\r\n`)
    );
    formParts.push(fileData);
    formParts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

    const body = Buffer.concat(formParts);

    const options = {
      hostname: 'api.elevenlabs.io',
      path: '/v1/voices/add',
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length,
      },
    };

    const req = https.request(options, (r) => {
      let data = '';
      r.on('data', c => { data += c; });
      r.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (r.statusCode === 200 && json.voice_id) {
            resolve(json.voice_id);
          } else {
            reject(new Error(json.detail?.message || JSON.stringify(json).slice(0, 200)));
          }
        } catch(e) {
          reject(new Error('レスポンス解析失敗: ' + data.slice(0, 100)));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
