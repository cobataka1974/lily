// api/create-agent.js
// POST /api/create-agent
// ユーザー用のElevenLabs Agentを新規作成してagentIdを返す

const https = require('https');

function elevenLabsRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.elevenlabs.io',
      path,
      method,
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'POST only' });

  const { name, voiceId, prompt, firstMessage } = req.body || {};
  if (!name) return res.status(400).json({ status: 'error', message: 'name は必須です' });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(500).json({ status: 'error', message: 'ELEVENLABS_API_KEY未設定' });

  // しずかのAgent設定をベースに新規作成
  const agentConfig = {
    name: name + '_agent',
    conversation_config: {
      asr: { quality: 'high', provider: 'scribe_realtime', user_input_audio_format: 'pcm_16000', keywords: [] },
      turn: {
        turn_timeout: 7.0,
        silence_end_call_timeout: 180.0,
        mode: 'turn',
        turn_eagerness: 'patient',
        speculative_turn: true,
      },
      tts: {
        model_id: 'eleven_v3_conversational',
        voice_id: voiceId || '2JoPnaUSkgU9bMhXXOUP',
        expressive_mode: true,
        stability: 0.5,
        speed: 0.8,
        similarity_boost: 0.95,
        optimize_streaming_latency: 3,
      },
      agent: {
        first_message: firstMessage || 'こんにちは。お話しましょう。',
        language: 'ja',
        prompt: {
          prompt: prompt || 'あなたは優しいお話し相手です。',
          llm: 'claude-3-7-sonnet',
          temperature: 0.5,
          max_tokens: 200,
        },
      },
      conversation: {
        max_duration_seconds: 600,
        client_events: ['audio', 'interruption', 'user_transcript', 'agent_response'],
      },
    },
    platform_settings: {
      overrides: {
        conversation_config_override: {
          tts: { voice_id: true, stability: true, similarity_boost: true, speed: true },
          agent: { prompt: { prompt: true } },
        },
      },
    },
  };

  try {
    const result = await elevenLabsRequest('POST', '/v1/convai/agents/create', agentConfig);
    if (result.status === 200 && result.body.agent_id) {
      console.log('[create-agent] Agent作成成功:', result.body.agent_id);
      return res.status(200).json({ status: 'ok', agentId: result.body.agent_id });
    } else {
      console.error('[create-agent] 失敗:', result.status, JSON.stringify(result.body).slice(0, 200));
      return res.status(result.status).json({ status: 'error', message: JSON.stringify(result.body).slice(0, 200) });
    }
  } catch(e) {
    return res.status(500).json({ status: 'error', message: e.message });
  }
};
