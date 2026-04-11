# リリー 音声アプリ デバッグレポート

**作成日時**: 2026-04-09 00:15 JST

## 問題の症状

ユーザー報告:
- 「つながっています…」→「接続中…」となった後、接続されない
- VM環境だけでなく、他のPCでも同様のエラー
- ブラウザコンソールエラー: `Requested device not found`

## 根本原因の分析

### 1. agentId問題（✅ 解決済み）
- 初回: `/api/config`エンドポイントが存在せず、agentIdが取得できなかった
- 修正: agentIdをハードコード (`agent_2901kk4fbdaaeevsakrmknmp7jz4`)

### 2. マイクアクセス問題（🔧 修正中）
**問題点:**
- コードで`navigator.mediaDevices.getUserMedia({ audio: true })`を先に呼び出していた
- その後、`Conversation.startSession`がSDK内部で再度マイクにアクセスしようとして衝突
- 結果: `Requested device not found`エラー

**根拠:**
- ElevenLabs公式ドキュメント (https://elevenlabs.io/docs/eleven-agents/libraries/java-script) によれば、`getUserMedia`の事前呼び出しは「UIで説明するため」のオプションであり、必須ではない
- SDK (`Conversation.startSession`) が自動的にマイクへのアクセスと許可リクエストを処理する

**修正内容:**
```javascript
// Before (問題あり)
await navigator.mediaDevices.getUserMedia({ audio: true });
conversation = await Conversation.startSession({ agentId });

// After (修正後)
// getUserMedia を削除 - SDK に完全に任せる
conversation = await Conversation.startSession({ agentId });
```

### 3. PWAファイル404問題（⚠️ 軽微）
`/public/manifest.json`と`/public/sw.js`が404になっているが、これは動作に影響しない（PWA機能が無効になるのみ）

## デプロイ履歴

| コミット | 修正内容 | 結果 |
|---------|----------|------|
| `8a3de04` | vercel.json修正（ビルド設定） | デプロイ成功、しかしagentId問題 |
| `49aa7d6` | agentIdハードコード | agentId問題解決 |
| `63b7354` | getUserMedia削除 + エラーログ強化 | **現在デプロイ中** |

## 期待される結果

**修正後の動作フロー:**
1. ユーザーが「お話しする」ボタンをクリック
2. `Conversation.startSession` がマイク許可をリクエスト（ブラウザの標準ダイアログ）
3. ユーザーが「許可」をクリック
4. WebRTC接続が確立
5. `onConnect` が呼ばれ、「接続しました ✅」表示
6. 音声会話開始

## テスト手順

デプロイ完了後（約2〜3分後）:

1. https://lily-app-delta.vercel.app をスマートフォンで開く
2. 「準備完了」をタップ
3. 「お話しする」をタップ
4. ブラウザのマイク許可ダイアログで「許可」
5. 「接続しました ✅」と表示されることを確認
6. 実際に話して応答があることを確認

## ログ確認方法

デスクトップブラウザで:
1. https://lily-app-delta.vercel.app を開く
2. F12で開発者ツールを開く
3. Console タブを確認
4. 「お話しする」をクリック
5. 以下のログが出ることを確認:
   - `[startConversation] Calling Conversation.startSession with agentId: agent_2901kk4fbdaaeevsakrmknmp7jz4`
   - `[connect] conversationId: <id>`

エラーが出た場合:
- `[onError]` で始まるログを確認
- `[startConversation catch]` で始まるログを確認

## 追加の修正候補（必要に応じて）

1. **デバイス明示的指定**: ブラウザのデフォルトマイクが問題の場合
```javascript
const devices = await navigator.mediaDevices.enumerateDevices();
const audioInputs = devices.filter(d => d.kind === 'audioinput');
conversation = await Conversation.startSession({
  agentId: agentId,
  inputDeviceId: audioInputs[0]?.deviceId // デフォルトデバイス
});
```

2. **接続タイプ明示**: WebSocket vs WebRTC
```javascript
conversation = await Conversation.startSession({
  agentId: agentId,
  connectionType: 'websocket' // または 'webrtc'
});
```

3. **タイムアウト設定**: 接続が遅い場合
```javascript
conversation = await Conversation.startSession({
  agentId: agentId,
  timeout: 30000 // 30秒
});
```

## 参考リンク

- ElevenLabs JavaScript SDK公式ドキュメント: https://elevenlabs.io/docs/eleven-agents/libraries/java-script
- GitHubリポジトリ: https://github.com/cobataka1974/lily
- Vercelデプロイメント: https://vercel.com/takayoshis-projects-8af9c33a/lily-app

---

**次のアクション**: デプロイ完了を待って実機テスト
