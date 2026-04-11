// api/token.js
// POST /api/token
// ElevenLabs Signed URL生成エンドポイント

const https = require('https');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  const AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

  if (!ELEVENLABS_API_KEY || !AGENT_ID) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.elevenlabs.io',
      path: `/v1/convai/conversation/get_signed_url?agent_id=${AGENT_ID}`,
      method: 'GET',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    };

    const req2 = https.request(options, (r) => {
      let data = '';
      r.on('data', (chunk) => { data += chunk; });
      r.on('end', () => {
        if (r.statusCode !== 200) {
          res.status(r.statusCode).json({ error: 'ElevenLabs API error', details: data });
          return resolve();
        }
        try {
          const json = JSON.parse(data);
          res.status(200).json({ signedUrl: json.signed_url });
        } catch(e) {
          res.status(500).json({ error: 'Parse error', details: data });
        }
        resolve();
      });
    });
    req2.on('error', (e) => {
      res.status(500).json({ error: e.message });
      resolve();
    });
    req2.end();
  });
};
