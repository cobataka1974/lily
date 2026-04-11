/**
 * gas/Code.gs
 * Google Apps Script – しずかアプリ マルチユーザー対応バックエンド
 *
 * スクリプトプロパティ:
 *   ANTHROPIC_API_KEY  : Anthropic API キー
 *   ELEVENLABS_API_KEY : ElevenLabs API キー
 *   SHEET_ID           : Google スプレッドシート ID
 *
 * シート構成:
 *   「ユーザー」シート: ユーザー管理
 *     A: userId | B: 名前 | C: agentId | D: voiceId | E: sessionSheetName | F: PIN | G: プロンプト
 *
 *   「セッション_<userId>」シート（ユーザーごと）:
 *     A: 日付 | B: 気分 | C: 気分理由 | D: ハイライト | E: 関心トピック | F: 懸念 | G: 次回ヒント | H: プロンプト追加文
 */

var USER_SHEET_NAME = 'ユーザー';
var USER_HEADER = ['userId', '名前', 'agentId', 'voiceId', 'sessionSheetName', 'PIN', 'プロンプト'];
var SESSION_HEADER = ['日付', '気分', '気分理由', 'ハイライト(JSON)', '関心トピック(JSON)', '懸念事項(JSON)', '次回ヒント(JSON)', 'プロンプト追加文'];

// ===== doGet =====
// GET ?action=memory&userId=xxx  → 直近3件の記憶
// GET ?action=user&userId=xxx    → ユーザー設定取得
// GET ?action=users              → 全ユーザー一覧
function doGet(e) {
  var params = e ? (e.parameter || {}) : {};
  var action = params.action || 'memory';
  var userId = params.userId || 'default';

  try {
    if (action === 'users') {
      return jsonResponse_(getUserList_());
    }
    if (action === 'user') {
      return jsonResponse_(getUserConfig_(userId));
    }
    // デフォルト: memory
    return jsonResponse_(getMemory_(userId));
  } catch(err) {
    Logger.log('doGet エラー: ' + err.message);
    return jsonResponse_({ status: 'error', message: err.message });
  }
}

// ===== doPost =====
// POST { action: 'analyze', userId, conversationId, sessionDate, transcript }
// POST { action: 'saveUser', userId, name, agentId, voiceId, pin, prompt }
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || 'analyze';

    if (action === 'saveUser') {
      return jsonResponse_(saveUser_(payload));
    }
    // デフォルト: analyze
    return jsonResponse_(analyzeAndSave_(payload));
  } catch(err) {
    Logger.log('doPost エラー: ' + err.message);
    return jsonResponse_({ status: 'error', message: err.message });
  }
}

// ===== ユーザー一覧取得 =====
function getUserList_() {
  var sheet = getUserSheet_();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { status: 'ok', users: [] };

  var users = data.slice(1).map(function(row) {
    return {
      userId:          row[0] || '',
      name:            row[1] || '',
      agentId:         row[2] || '',
      voiceId:         row[3] || '',
      sessionSheetName: row[4] || '',
      // PINは返さない
      prompt:          row[6] || '',
    };
  }).filter(function(u) { return u.userId; });

  return { status: 'ok', users: users };
}

// ===== ユーザー設定取得 =====
function getUserConfig_(userId) {
  var sheet = getUserSheet_();
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return { status: 'error', message: 'ユーザーが見つかりません' };

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      return {
        status: 'ok',
        userId:          data[i][0],
        name:            data[i][1],
        agentId:         data[i][2],
        voiceId:         data[i][3],
        sessionSheetName: data[i][4],
        pin:             String(data[i][5]),
        prompt:          data[i][6] || '',
      };
    }
  }
  return { status: 'error', message: 'ユーザーが見つかりません: ' + userId };
}

// ===== ユーザー保存（新規・更新） =====
function saveUser_(payload) {
  var sheet = getUserSheet_();
  var data = sheet.getDataRange().getValues();
  var userId = payload.userId;

  // 既存ユーザーを検索
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(userId)) {
      // 更新
      sheet.getRange(i + 1, 1, 1, 7).setValues([[
        userId,
        payload.name || data[i][1],
        payload.agentId || data[i][2],
        payload.voiceId || data[i][3],
        payload.sessionSheetName || data[i][4] || ('セッション_' + userId),
        payload.pin || data[i][5],
        payload.prompt || data[i][6],
      ]]);
      return { status: 'ok', action: 'updated', userId: userId };
    }
  }

  // 新規追加
  var sessionSheetName = payload.sessionSheetName || ('セッション_' + userId);
  sheet.appendRow([
    userId,
    payload.name || '',
    payload.agentId || '',
    payload.voiceId || '',
    sessionSheetName,
    payload.pin || '0000',
    payload.prompt || '',
  ]);
  return { status: 'ok', action: 'created', userId: userId };
}

// ===== 記憶取得（直近3件） =====
function getMemory_(userId) {
  var sheet = getSessionSheet_(userId);
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) {
    return { status: 'ok', sessions: [], prompt_addition: '', recent_hints: [] };
  }

  var rows = data.slice(1);
  var recent = rows.slice(-3);

  var sessions = recent.map(function(row) {
    return {
      session_date:       row[0] || '',
      overall_mood:       row[1] || '',
      mood_reason:        row[2] || '',
      highlight_moments:  safeParseJson_(row[3]),
      interest_topics:    safeParseJson_(row[4]),
      concerns:           safeParseJson_(row[5]),
      next_session_hints: safeParseJson_(row[6]),
      prompt_addition:    row[7] || '',
    };
  });

  var promptParts = sessions
    .map(function(s) { return (s.prompt_addition || '').trim(); })
    .filter(function(p) { return p.length > 0; });
  var promptAddition = promptParts.join(' ');

  var recentHints = [];
  sessions.forEach(function(s) {
    (s.next_session_hints || []).slice(0, 2).forEach(function(h) {
      if (h && h.hint && recentHints.indexOf(h.hint) === -1) recentHints.push(h.hint);
    });
  });

  return {
    status: 'ok',
    sessions: sessions,
    prompt_addition: promptAddition,
    recent_hints: recentHints.slice(0, 6),
  };
}

// ===== 会話分析＆保存 =====
function analyzeAndSave_(payload) {
  var userId = payload.userId || 'default';
  var conversationId = payload.conversationId || '';
  var sessionDate = payload.sessionDate || formatDate_(new Date());
  var transcript = payload.transcript || '';

  if (conversationId) {
    try {
      var fetched = fetchTranscriptFromElevenLabs_(conversationId);
      if (fetched) transcript = fetched;
    } catch(err) {
      Logger.log('ElevenLabs取得失敗: ' + err.message);
    }
  }
  if (!transcript) return { status: 'error', message: 'transcript が空です' };

  var analysis = analyzeWithClaude_(transcript, sessionDate);
  saveToSheet_(userId, analysis);

  return { status: 'ok', analysis: analysis };
}

// ===== ElevenLabsトランスクリプト取得 =====
function fetchTranscriptFromElevenLabs_(conversationId) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ELEVENLABS_API_KEY');
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY が設定されていません');

  var url = 'https://api.elevenlabs.io/v1/convai/conversations/' + conversationId;
  var response = UrlFetchApp.fetch(url, {
    method: 'get',
    headers: { 'xi-api-key': apiKey },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) throw new Error('ElevenLabs API エラー: ' + response.getResponseCode());

  var data = JSON.parse(response.getContentText());
  var turns = data.transcript || data.messages || [];
  if (turns.length === 0) return '';

  return turns.map(function(t) {
    return ((t.role === 'agent') ? 'エージェント' : 'ユーザー') + ': ' + (t.message || t.text || '');
  }).join('\n');
}

// ===== Claude分析 =====
function analyzeWithClaude_(transcript, sessionDate) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません');

  var prompt = '以下は認知症の方とAIの会話記録です。\n'
    + '以下のJSON形式で分析してください。\n\n'
    + '{"overall_mood":"良い／普通／悪い","mood_reason":"一言","highlight_moments":[{"topic":"","reaction":"","emotion":"","next_potential":""}],"interest_topics":[{"topic":"","evidence":"","category":""}],"concerns":[{"type":"","detail":"","severity":"低／中／高"}],"next_session_hints":[{"priority":1,"hint":"","reason":""}],"prompt_addition":"次回プロンプト追加文（100字以内）"}\n\n'
    + 'JSONのみ返してください。\n\n会話記録：\n' + transcript;

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: 'claude-haiku-4-5', max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
    muteHttpExceptions: true,
  });

  var result = JSON.parse(response.getContentText());
  var rawText = result.content[0].text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');
  var analysis = JSON.parse(rawText);
  analysis.session_date = sessionDate;
  return analysis;
}

// ===== シートへの保存 =====
function saveToSheet_(userId, analysis) {
  var sheet = getSessionSheet_(userId);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(SESSION_HEADER);
    sheet.getRange(1, 1, 1, SESSION_HEADER.length).setFontWeight('bold');
  }
  sheet.appendRow([
    analysis.session_date || '',
    analysis.overall_mood || '',
    analysis.mood_reason || '',
    JSON.stringify(analysis.highlight_moments || []),
    JSON.stringify(analysis.interest_topics || []),
    JSON.stringify(analysis.concerns || []),
    JSON.stringify(analysis.next_session_hints || []),
    analysis.prompt_addition || '',
  ]);
}

// ===== ユーティリティ =====

function getUserSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(USER_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(USER_SHEET_NAME);
    sheet.appendRow(USER_HEADER);
    sheet.getRange(1, 1, 1, USER_HEADER.length).setFontWeight('bold');
    // みつこさんのデータを初期値として追加
    sheet.appendRow([
      'default',
      'みつこ',
      PropertiesService.getScriptProperties().getProperty('ELEVENLABS_AGENT_ID') || '',
      '2JoPnaUSkgU9bMhXXOUP',
      'セッション_default',
      '1423',
      '',
    ]);
  }
  return sheet;
}

function getSessionSheet_(userId) {
  var sheetName = 'セッション_' + (userId || 'default');
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(sheetName);

  // 旧「セッション」シートからの移行
  if (!sheet) {
    var oldSheet = ss.getSheetByName('セッション');
    if (oldSheet && (userId === 'default' || !userId)) {
      oldSheet.setName(sheetName);
      sheet = oldSheet;
    } else {
      sheet = ss.insertSheet(sheetName);
    }
  }
  return sheet;
}

function getSpreadsheet_() {
  var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) throw new Error('SHEET_ID が設定されていません');
  return SpreadsheetApp.openById(sheetId);
}

function safeParseJson_(str) {
  if (!str) return [];
  try { return JSON.parse(str); } catch(e) { return []; }
}

function formatDate_(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
