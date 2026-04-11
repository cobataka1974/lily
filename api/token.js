// Vercel Serverless Function: /api/token.js
// ElevenLabs Signed URL生成エンドポイント

export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  const AGENT_ID = process.env.ELEVENLABS_AGENT_ID;

  if (!ELEVENLABS_API_KEY || !AGENT_ID) {
    console.error('[token] Missing ELEVENLABS_API_KEY or ELEVENLABS_AGENT_ID');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // ElevenLabs API: Signed URL生成
    const response = await fetch(
      `https://api.elevenlabs.io/v1/convai/conversation/get_signed_url?agent_id=${AGENT_ID}`,
      {
        method: 'GET',
        headers: {
          'xi-api-key': ELEVENLABS_API_KEY,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[token] ElevenLabs API error:', response.status, errorText);
      return res.status(response.status).json({
        error: 'Failed to get signed URL',
        details: errorText,
      });
    }

    const data = await response.json();
    console.log('[token] Signed URL generated successfully');

    return res.status(200).json({
      signedUrl: data.signed_url,
    });
  } catch (error) {
    console.error('[token] Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
