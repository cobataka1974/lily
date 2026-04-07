/**
 * gas/Code.gs
 * Google Apps Script – リリーアプリ バックエンド
 *
 * スクリプトプロパティ（ファイル > プロジェクトのプロパティ > スクリプトプロパティ）に設定:
 *   ANTHROPIC_API_KEY  : Anthropic API キー
 *   ELEVENLABS_API_KEY : ElevenLabs API キー
 *   SHEET_ID           : Google スプレッドシート ID
 *
 * スプレッドシートのカラム（1行目ヘッダー）:
 *   A: 日付
 *   B: 気分
 *   C: 気分理由
 *   D: ハイライト(JSON)
 *   E: 関心トピック(JSON)
 *   F: 懸念事項(JSON)
 *   G: 次回ヒント(JSON)
 *   H: プロンプト追加文
 *
 * デプロイ方法:
 *   「デプロイ」>「新しいデプロイ」>「ウェブアプリ」
 *   - 実行: 自分
 *   - アクセス: 全員（匿名含む）
 */

// ===== 定数 =====
var SHEET_NAME = 'セッション';
var HEADER_ROW = ['日付', '気分', '気分理由', 'ハイライト(JSON)', '関心トピック(JSON)', '懸念事項(JSON)', '次回ヒント(JSON)', 'プロンプト追加文'];

// ===== doGet: 直近3件のセッションデータを返す =====
function doGet(e) {
  try {
    var sheet = getSheet_();
    var data = sheet.getDataRange().getValues();

    if (data.length <= 1) {
      // ヘッダーのみ or 空
      return jsonResponse_({ status: 'ok', sessions: [], prompt_addition: '', recent_hints: [] });
    }

    // ヘッダー行を除いた直近3件（最下行から）
    var rows = data.slice(1); // ヘッダー除く
    var recent = rows.slice(-3);

    var sessions = recent.map(function(row) {
      return {
        session_date:      row[0] || '',
        overall_mood:      row[1] || '',
        mood_reason:       row[2] || '',
        highlight_moments: safeParseJson_(row[3]),
        interest_topics:   safeParseJson_(row[4]),
        concerns:          safeParseJson_(row[5]),
        next_session_hints: safeParseJson_(row[6]),
        prompt_addition:   row[7] || '',
      };
    });

    // prompt_addition を結合
    var promptParts = sessions
      .map(function(s) { return (s.prompt_addition || '').trim(); })
      .filter(function(p) { return p.length > 0; });
    var promptAddition = promptParts.join(' ');

    // 次回ヒントを収集
    var recentHints = [];
    sessions.forEach(function(s) {
      var hints = s.next_session_hints || [];
      hints.slice(0, 2).forEach(function(h) {
        if (h && h.hint && recentHints.indexOf(h.hint) === -1) {
          recentHints.push(h.hint);
        }
      });
    });

    return jsonResponse_({
      status: 'ok',
      sessions: sessions,
      prompt_addition: promptAddition,
      recent_hints: recentHints.slice(0, 6),
    });

  } catch (err) {
    Logger.log('doGet エラー: ' + err.message);
    return jsonResponse_({ status: 'error', message: err.message });
  }
}

// ===== doPost: トランスクリプト受信→Claude分析→Sheetsに保存 =====
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var conversationId = payload.conversationId || '';
    var sessionDate     = payload.sessionDate || formatDate_(new Date());
    var transcript      = payload.transcript  || '';

    // conversationId があれば ElevenLabs からトランスクリプト取得
    if (conversationId) {
      try {
        var fetched = fetchTranscriptFromElevenLabs_(conversationId);
        if (fetched) {
          transcript = fetched;
          Logger.log('ElevenLabs からトランスクリプト取得完了: ' + transcript.length + ' 文字');
        }
      } catch (fetchErr) {
        Logger.log('ElevenLabs 取得失敗（rawTranscript を使用）: ' + fetchErr.message);
      }
    }

    if (!transcript) {
      return jsonResponse_({ status: 'error', message: 'transcript が空です' });
    }

    // Claude で分析
    var analysis = analyzeWithClaude_(transcript, sessionDate);

    // Sheets に保存
    saveToSheet_(analysis);

    Logger.log('分析・保存完了: ' + sessionDate + ' 気分: ' + analysis.overall_mood);
    return jsonResponse_({ status: 'ok', analysis: analysis });

  } catch (err) {
    Logger.log('doPost エラー: ' + err.message);
    return jsonResponse_({ status: 'error', message: err.message });
  }
}

// ===== ElevenLabs からトランスクリプト取得 =====
function fetchTranscriptFromElevenLabs_(conversationId) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ELEVENLABS_API_KEY');
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY が設定されていません');

  var url = 'https://api.elevenlabs.io/v1/convai/conversations/' + conversationId;
  var options = {
    method: 'get',
    headers: { 'xi-api-key': apiKey },
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch(url, options);
  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('ElevenLabs API エラー: ' + code + ' - ' + response.getContentText());
  }

  var data = JSON.parse(response.getContentText());
  var turns = data.transcript || data.messages || [];
  if (turns.length === 0) return '';

  return turns.map(function(t) {
    var role = (t.role === 'agent') ? 'エージェント' : 'ユーザー';
    return role + ': ' + (t.message || t.text || '');
  }).join('\n');
}

// ===== Claude API で分析 =====
function analyzeWithClaude_(transcript, sessionDate) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('ANTHROPIC_API_KEY');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が設定されていません');

  var prompt = '以下は認知症のみつこさん（78歳）とAIリリーの会話記録です。\n'
    + '以下のJSON形式で分析してください。\n\n'
    + '{\n'
    + '  "session_date": "YYYY-MM-DD",\n'
    + '  "overall_mood": "良い／普通／悪い",\n'
    + '  "mood_reason": "一言説明",\n'
    + '  "highlight_moments": [\n'
    + '    { "topic": "話題", "reaction": "反応", "emotion": "感情", "next_potential": "次回の質問案" }\n'
    + '  ],\n'
    + '  "interest_topics": [\n'
    + '    { "topic": "話題", "evidence": "根拠発言", "category": "カテゴリ" }\n'
    + '  ],\n'
    + '  "concerns": [\n'
    + '    { "type": "種類", "detail": "詳細", "severity": "低／中／高" }\n'
    + '  ],\n'
    + '  "next_session_hints": [\n'
    + '    { "priority": 1, "hint": "次回試す話題", "reason": "理由" }\n'
    + '  ],\n'
    + '  "prompt_addition": "次回セッションのシステムプロンプトに追加する一文（100字以内）"\n'
    + '}\n\n'
    + 'JSONのみを返してください。マークダウンのコードブロックは不要です。\n\n'
    + '会話記録：\n'
    + transcript;

  var requestBody = JSON.stringify({
    model: 'claude-haiku-4-5',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  });

  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    payload: requestBody,
    muteHttpExceptions: true,
  };

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
  var code = response.getResponseCode();
  if (code !== 200) {
    throw new Error('Claude API エラー: ' + code + ' - ' + response.getContentText());
  }

  var result = JSON.parse(response.getContentText());
  var rawText = result.content[0].text.trim();
  // コードブロック除去
  var jsonText = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '');

  var analysis = JSON.parse(jsonText);
  analysis.session_date = analysis.session_date || sessionDate;
  return analysis;
}

// ===== Sheets への保存 =====
function saveToSheet_(analysis) {
  var sheet = getSheet_();

  // ヘッダーが無ければ追加
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER_ROW);
    sheet.getRange(1, 1, 1, HEADER_ROW.length).setFontWeight('bold');
  }

  var row = [
    analysis.session_date || '',
    analysis.overall_mood || '',
    analysis.mood_reason || '',
    JSON.stringify(analysis.highlight_moments || []),
    JSON.stringify(analysis.interest_topics || []),
    JSON.stringify(analysis.concerns || []),
    JSON.stringify(analysis.next_session_hints || []),
    analysis.prompt_addition || '',
  ];

  sheet.appendRow(row);
  Logger.log('Sheets に保存しました: ' + analysis.session_date);
}

// ===== ユーティリティ =====

function getSheet_() {
  var sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) throw new Error('SHEET_ID が設定されていません');

  var ss = SpreadsheetApp.openById(sheetId);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    Logger.log('シート「' + SHEET_NAME + '」を新規作成しました');
  }
  return sheet;
}

function safeParseJson_(str) {
  if (!str) return [];
  try { return JSON.parse(str); }
  catch (e) { return []; }
}

function formatDate_(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

function jsonResponse_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
