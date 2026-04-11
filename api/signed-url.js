// api/signed-url.js
// GET /api/signed-url
// ElevenLabs の /v1/convai/conversation/get-signed-url エンドポイントから
// WebSocket接続用の signed URL を取得してフロントエンドに返す。
//
// ※ /v1/convai/conversation/token は LiveKit/WebRTC 用 JWT なので使わない。
//    WebSocket 接続には /v1/convai/conversation/get-signed-url を使う。

const https = require('https');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey  = process.env.ELEVENLABS_API_KEY  || '';
  const agentId = process.env.ELEVENLABS_AGENT_ID || '';

  if (!apiKey || !agentId) {
    return res.status(500).json({ error: 'ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID is not set' });
  }

  try {
    const signedUrl = await getSignedUrl(apiKey, agentId);
    res.status(200).json({ signedUrl });
  } catch (err) {
    console.error('[signed-url] error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

function getSignedUrl(apiKey, agentId) {
  return new Promise((resolve, reject) => {
    const url = `https://api.elevenlabs.io/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agentId)}`;

    const req = https.request(url, {
      method: 'GET',
      headers: { 'xi-api-key': apiKey },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.signed_url) {
            resolve(json.signed_url);
          } else {
            reject(new Error('signed_url not found: ' + data));
          }
        } catch (e) {
          reject(new Error('JSON parse error: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}
