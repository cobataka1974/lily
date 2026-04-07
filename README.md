# 🌸 リリー — みつこのお話し相手

認知症のみつこさん（78歳）のためのAI音声会話アプリです。  
ElevenLabs の Conversational AI を使い、過去の会話の記憶を引き継ぎながら自然なお話し相手になります。

---

## プロジェクト概要

| 項目 | 内容 |
|---|---|
| フロントエンド | `index.html`（バニラJS + ElevenLabs SDK） |
| バックエンド API | `api/memory.js`、`api/analyze.js`（Node.js / Vercel Functions） |
| データストア | `data/sessions.json`（ローカル）または Google Sheets（GAS） |
| 音声AI | ElevenLabs Conversational AI |
| 分析AI | Claude（Anthropic） |

---

## ローカル起動方法

### 1. リポジトリをクローン

```bash
git clone <repo-url>
cd lily-app
```

### 2. 環境変数を設定

プロジェクトルートに `.env.local` を作成：

```
ANTHROPIC_API_KEY=sk-ant-xxxxxx
ELEVENLABS_API_KEY=xxxxxx

# GASを使う場合（省略可）
GAS_WEB_APP_URL=https://script.google.com/macros/s/.../exec
```

### 3. サーバー起動

```bash
node server.js
```

ブラウザで `http://localhost:3000/` を開いてください。

> Node.js 18以上が必要です。npm install は不要です（依存パッケージなし）。

---

## 環境変数の説明

| 変数名 | 必須 | 説明 |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✅ | Anthropic APIキー。会話分析（analyze）に使用 |
| `ELEVENLABS_API_KEY` | ✅ | ElevenLabs APIキー。会話トランスクリプト取得に使用 |
| `GAS_WEB_APP_URL` | 任意 | Google Apps Script のWebアプリURL。設定するとSheetsにも保存 |

---

## GASセットアップ

Google Sheetsに会話メモリを保存したい場合は **[GAS_SETUP.md](./GAS_SETUP.md)** を参照してください。

---

## PWA（ホーム画面に追加）

このアプリはPWA対応しています。スマートフォンのブラウザから「ホーム画面に追加」することでアプリのようにご利用いただけます。

- iOS Safari：共有ボタン → 「ホーム画面に追加」
- Android Chrome：メニュー → 「ホーム画面に追加」

---

## デプロイ方法

### Vercel（推奨）

1. [Vercel](https://vercel.com) にリポジトリをインポート
2. Vercel ダッシュボードの **「Environment Variables」** に以下を設定：
   - `ANTHROPIC_API_KEY`
   - `ELEVENLABS_API_KEY`
3. デプロイボタンを押すだけで完了

`api/` ディレクトリ内のファイルが自動的にServerless Functionsとして認識されます。

### GitHub Pages

静的ファイル（`index.html`）のみ配信する場合は GitHub Pages が利用できます。  
ただし `api/` のServerless Functionsが動作しないため、バックエンドはGASを使用してください。

---

## ファイル構成

```
lily-app/
├── index.html          # メインUI
├── server.js           # ローカル開発用サーバー
├── package.json
├── vercel.json         # Vercel設定
├── .env.local          # 環境変数（Gitには含まれない）
├── api/
│   ├── memory.js       # GET /api/memory
│   ├── analyze.js      # POST /api/analyze
│   └── notify.js       # 通知用（将来実装）
├── gas/
│   └── Code.gs         # Google Apps Script
├── public/
│   ├── manifest.json   # PWAマニフェスト
│   ├── sw.js           # Service Worker
│   ├── icon-192.png    # アプリアイコン（別途用意）
│   └── icon-512.png    # アプリアイコン（別途用意）
├── data/               # セッションデータ（Gitには含まれない）
│   └── sessions.json
└── GAS_SETUP.md        # GASセットアップ手順書
```

---

*🌸 みつこさんが毎日楽しくお話しできますように*
