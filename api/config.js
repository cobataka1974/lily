// api/config.js
// GET /api/config
// ELEVENLABS_AGENT_ID を環境変数から返す

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const agentId = process.env.ELEVENLABS_AGENT_ID || '';

  if (!agentId) {
    return res.status(500).json({ error: 'ELEVENLABS_AGENT_ID is not set' });
  }

  res.status(200).json({ agentId });
};
