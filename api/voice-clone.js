// api/voice-clone.js
// POST /api/voice-clone  → ElevenLabs Voice Cloning API でクローン作成
// multipart/form-data: name, files

const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ status: 'error', message: 'POST only' });

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) return res.status(500).json({ status: 'error', message: 'ELEVENLABS_API_KEY未設定' });

  try {
    // multipart/form-data をそのままElevenLabsに転送
    const contentType = req.headers['content-type'] || '';
    if (!contentType.includes('multipart/form-data')) {
      return res.status(400).json({ status: 'error', message: 'multipart/form-data が必要です' });
    }

    // リクエストボディを収集
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    return new Promise((resolve) => {
      const options = {
        hostname: 'api.elevenlabs.io',
        path: '/v1/voices/add',
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'content-type': contentType,
          'content-length': body.length,
        },
      };

      const req2 = https.request(options, (r) => {
        let data = '';
        r.on('data', c => { data += c; });
        r.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (r.statusCode === 200 && json.voice_id) {
              res.status(200).json({ status: 'ok', voiceId: json.voice_id });
            } else {
              res.status(r.statusCode).json({ status: 'error', message: json.detail?.message || JSON.stringify(json) });
            }
          } catch(e) {
            res.status(500).json({ status: 'error', message: data.slice(0, 200) });
          }
          resolve();
        });
      });
      req2.on('error', (e) => {
        res.status(500).json({ status: 'error', message: e.message });
        resolve();
      });
      req2.write(body);
      req2.end();
    });
  } catch(e) {
    return res.status(500).json({ status: 'error', message: e.message });
  }
};
