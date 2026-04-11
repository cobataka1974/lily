// api/schedule.js
// GET  /api/schedule → スケジュール一覧取得
// POST /api/schedule → スケジュール保存

const fs   = require('fs');
const path = require('path');

const SCHEDULE_FILE = path.join(process.cwd(), 'data', 'schedule.json');

function loadSchedule() {
  if (!fs.existsSync(SCHEDULE_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8')); }
  catch (e) { return []; }
}

function saveSchedule(data) {
  const dir = path.dirname(SCHEDULE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({ status: 'ok', schedules: loadSchedule() });
  }

  if (req.method === 'POST') {
    const body = req.body || {};
    // body.schedules = [{ id, days:[0-6], hour, minute, enabled, label }]
    if (!Array.isArray(body.schedules)) {
      return res.status(400).json({ status: 'error', message: 'schedules array required' });
    }
    saveSchedule(body.schedules);
    return res.status(200).json({ status: 'ok', saved: body.schedules.length });
  }

  return res.status(405).json({ status: 'error', message: 'Method not allowed' });
};
