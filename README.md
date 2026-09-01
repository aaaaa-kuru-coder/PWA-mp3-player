# Local MP3 Player (GitHub Pages / PWA)

スマホ上のMP3をユーザーが選択し、ブラウザ内で `blob:` URLとして再生する最小構成のPWAです。

## 主な機能

- 端末内MP3を `<input type="file">` で選択
- 再生 / 一時停止
- 10秒戻る / 進む
- シーク
- ループ
- プレイヤー独自の音量倍率 1/3〜1.5倍（指数スライダー）
- 曲ごとの倍率・ループ設定を localStorage に保存
- Media Session API が使える環境では、OS側の再生/停止/シーク操作にも対応
- PWAとしてホーム画面追加
- Service Workerはアプリ本体だけをキャッシュし、MP3はキャッシュしない

## GitHub Pagesへの配置

1. GitHubで新しいリポジトリを作る。
2. このフォルダの中身をリポジトリ直下へアップロードする。
3. Repository Settings → Pages を開く。
4. Deploy from a branch を選び、`main` / `(root)` を指定する。
5. 発行された `https://<ユーザー名>.github.io/<リポジトリ名>/` をスマホChromeで開く。
6. Chromeメニューから「ホーム画面に追加」または「アプリをインストール」。

## MP3データの通信について

### このコード自身がMP3を送信する処理

ありません。

ファイル選択後は `URL.createObjectURL(file)` でブラウザ内の一時的な `blob:` URLを作り、そのURLを `<audio>` に渡します。`fetch()`、`XMLHttpRequest`、Firebase、外部API、CDN、アクセス解析コードなどはMP3処理に使っていません。

### GitHubへ通信するもの

最初にページを開く際、HTML/CSS/JavaScript/manifest/iconなど「プレイヤー本体」はGitHub PagesからHTTPSで取得されます。Service Worker登録後は、それらのアプリファイルをブラウザキャッシュから使える場合があります。

### MP3設定として端末内に保存されるもの

localStorageに以下だけを保存します。

- ファイル名
- ファイルサイズ
- 最終更新日時を組み合わせた識別キー
- 音量倍率
- ループON/OFF

MP3の音声内容はlocalStorageへ保存しません。

### 注意

WebページのJavaScriptは、ユーザーが選択したFileオブジェクトの内容を読むこと自体は可能です。つまり、悪意あるコードに差し替えられれば理論上アップロード処理を追加できます。この版ではCSPで `connect-src 'none'` を指定し、ページからの一般的なHTTP/WebSocket通信を禁止しています。ただし、GitHubアカウントやリポジトリ自体が侵害されてページコードを丸ごと差し替えられるリスクまではゼロにはできません。

より厳密にしたければ、この同じファイル群を端末内だけでホストする/ローカル環境で使う方法もあります。
