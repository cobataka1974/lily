// api/analyze.js
// POST /api/analyze
// トランスクリプト受信 → Claude分析 → data/sessions.json に保存

const https = require('https');
const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(process.cwd(), 'data', 'sessions.json');

// ===== ユーティリティ =====

/**
 * HTTPSリクエストを Promise でラップ
 */
function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      // 301/302リダイレクトを追跡（GASはPOSTでも302を返す）
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        const loc = res.headers.location;
        const url = loc.startsWith('http') ? new URL(loc) : new URL('https://script.google.com' + loc);
        const redirectOptions = {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: options.method || 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
        };
        if (body) {
          redirectOptions.headers['Content-Length'] = Buffer.byteLength(body);
        }
        return httpsRequest(redirectOptions, body).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

/**
 * ElevenLabs からトランスクリプトを取得する
 * @param {string} conversationId
 * @returns {string} transcript テキスト
 */
async function fetchTranscriptFromElevenLabs(conversationId) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY が設定されていません');

  console.log(`[analyze] ElevenLabs からトランスクリプト取得中: ${conversationId}`);

  const options = {
    hostname: 'api.elevenlabs.io',
    path: `/v1/convai/conversations/${conversationId}`,
    method: 'GET',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
    },
  };

  const result = await httpsRequest(options);
  if (result.statusCode !== 200) {
    throw new Error(`ElevenLabs API エラー: ${result.statusCode} - ${JSON.stringify(result.body)}`);
  }

  const convData = result.body;
  // transcript は発話の配列。テキストに変換する
  const turns = convData.transcript || convData.messages || [];
  if (turns.length === 0) {
    console.warn('[analyze] ElevenLabs からのトランスクリプトが空です');
    return '';
  }

  const lines = turns.map((t) => {
    const role = t.role === 'agent' ? 'エージェント' : 'ユーザー';
    return `${role}: ${t.message || t.text || ''}`;
  });
  return lines.join('\n');
}

/**
 * Claude API でトランスクリプトを分析する
 * @param {string} transcript
 * @param {string} sessionDate
 * @returns {Object} 分析結果 JSON
 */
async function analyzeWithClaude(transcript, sessionDate) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません');

  console.log('[analyze] Claude API で分析中...');

  const prompt = `以下は認知症のみつこさん（78歳）とAIリリーの会話記録です。
以下のJSON形式で分析してください。

{
  "session_date": "YYYY-MM-DD",
  "overall_mood": "良い／普通／悪い",
  "mood_reason": "一言説明",
  "highlight_moments": [
    { "topic": "話題", "reaction": "反応", "emotion": "感情", "next_potential": "次回の質問案" }
  ],
  "interest_topics": [
    { "topic": "話題", "evidence": "根拠発言", "category": "カテゴリ" }
  ],
  "concerns": [
    { "type": "種類", "detail": "詳細", "severity": "低／中／高" }
  ],
  "next_session_hints": [
    { "priority": 1, "hint": "次回試す話題", "reason": "理由" }
  ],
  "prompt_addition": "次回セッションのシステムプロンプトに追加する一文（100字以内）"
}

JSONのみを返してください。マークダウンのコードブロックは不要です。

会話記録：
${transcript}`;

  const requestBody = JSON.stringify({
    model: 'claude-haiku-4-5',
    max_tokens: 1500,
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  });

  const options = {
    hostname: 'api.anthropic.com',
    path: '/v1/messages',
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(requestBody),
    },
  };

  const result = await httpsRequest(options, requestBody);
  if (result.statusCode !== 200) {
    throw new Error(`Claude API エラー: ${result.statusCode} - ${JSON.stringify(result.body)}`);
  }

  const rawText = result.body.content[0].text.trim();
  // コードブロックが含まれる場合は除去
  const jsonText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');

  try {
    const analysis = JSON.parse(jsonText);
    // session_date を確実にセット
    analysis.session_date = analysis.session_date || sessionDate;
    return analysis;
  } catch (e) {
    console.error('[analyze] JSON パース失敗:', jsonText);
    throw new Error(`Claude の応答を JSON としてパースできませんでした: ${e.message}`);
  }
}

/**
 * data/sessions.json に分析結果を追記保存する（最新50件を保持）
 * @param {Object} analysis
 */
function saveSession(analysis) {
  // data ディレクトリが無ければ作成
  const dataDir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
    console.log('[analyze] data ディレクトリを作成しました');
  }

  let sessions = [];
  if (fs.existsSync(DATA_FILE)) {
    try {
      sessions = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    } catch (e) {
      console.warn('[analyze] sessions.json の読み込み失敗。新規作成します');
    }
  }

  sessions.push({ ...analysis, saved_at: new Date().toISOString() });

  // 最新50件のみ保持
  if (sessions.length > 50) {
    sessions = sessions.slice(sessions.length - 50);
  }

  fs.writeFileSync(DATA_FILE, JSON.stringify(sessions, null, 2), 'utf8');
  console.log(`[analyze] sessions.json に保存しました（合計 ${sessions.length} 件）`);
}

/**
 * Google Apps Script経由でスプレッドシートに保存する
 * @param {Object} analysis
 * @param {string} transcript
 */
async function saveToSpreadsheet(analysis, transcript) {
  const gasUrl = process.env.GAS_WEB_APP_URL;
  if (!gasUrl) {
    console.warn('[analyze] GAS_WEB_APP_URL が設定されていないため、スプレッドシート保存をスキップします');
    return;
  }

  try {
    const payload = JSON.stringify({
      sessionDate: analysis.session_date,
      transcript: transcript,
    });

    console.log('[analyze] スプレッドシートに保存中...');
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      redirect: 'follow',
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = text; }

    if (res.ok) {
      console.log('[analyze] スプレッドシート保存成功:', JSON.stringify(data).substring(0, 80));
    } else {
      console.error(`[analyze] スプレッドシート保存失敗: ${res.status} - ${String(text).substring(0, 200)}`);
    }
  } catch (err) {
    console.error('[analyze] スプレッドシート保存エラー:', err.message);
  }
}

// ===== メインハンドラ =====

module.exports = async function handler(req, res) {
  // CORS ヘッダー
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
    const { conversationId, sessionDate, transcript: rawTranscript } = req.body || {};
    const today = new Date().toISOString().slice(0, 10);
    const date = sessionDate || today;

    let transcript = rawTranscript || '';

    // conversationId があれば ElevenLabs からトランスクリプトを取得
    if (conversationId) {
      try {
        const fetched = await fetchTranscriptFromElevenLabs(conversationId);
        if (fetched) {
          transcript = fetched;
          console.log(`[analyze] ElevenLabs から ${transcript.split('\n').length} 行のトランスクリプトを取得`);
        }
      } catch (err) {
        console.warn(`[analyze] ElevenLabs 取得失敗（rawTranscript を使用）: ${err.message}`);
        // フォールバックとして rawTranscript を使用
      }
    }

    if (!transcript) {
      return res.status(400).json({ status: 'error', message: 'transcript が空です。conversationId または transcript を指定してください' });
    }

    // Claude で分析
    const analysis = await analyzeWithClaude(transcript, date);

    // ローカルJSONに保存
    saveSession(analysis);

    // スプレッドシートに保存
    await saveToSpreadsheet(analysis, transcript);

    console.log(`[analyze] 分析完了: ${date} / 気分: ${analysis.overall_mood}`);
    return res.status(200).json({ status: 'ok', analysis });

  } catch (err) {
    console.error('[analyze] 予期しないエラー:', err.message);
    return res.status(500).json({ status: 'error', message: err.message });
  }
};
