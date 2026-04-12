// api/update-agent-voice.js
// POST /api/update-agent-voice
// ElevenLabs AgentのvoiceIdを更新する

const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'POST only' });

  const { agentId, voiceId } = req.body || {};
  if (!agentId || !voiceId) return res.status(400).json({ status: 'error', message: 'agentId と voiceId が必要です' });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(500).json({ status: 'error', message: 'ELEVENLABS_API_KEY が未設定' });

  const body = JSON.stringify({
    conversation_config: {
      tts: { voice_id: voiceId, speed: 0.8 }
    }
  });

  try {
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.elevenlabs.io',
        path: `/v1/convai/agents/${agentId}`,
        method: 'PATCH',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      };
      const req2 = https.request(options, (r) => {
        let data = '';
        r.on('data', chunk => { data += chunk; });
        r.on('end', () => resolve({ statusCode: r.statusCode, body: data }));
      });
      req2.on('error', reject);
      req2.write(body);
      req2.end();
    });

    if (result.statusCode === 200) {
      console.log(`[update-agent-voice] Agent ${agentId} の voice を ${voiceId} に更新`);
      return res.status(200).json({ status: 'ok' });
    } else {
      return res.status(500).json({ status: 'error', message: result.body.substring(0, 200) });
    }
  } catch (e) {
    return res.status(500).json({ status: 'error', message: e.message });
  }
};
