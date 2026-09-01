# Local MP3 Player PWA v3

GitHub Pages などの HTTPS 上で動作する、端末内MP3向けのローカル再生PWAです。

## 主な機能
- フォルダ登録と FileSystemDirectoryHandle の IndexedDB 保存
- 登録フォルダ以下のMP3を再帰的に探索
- 全曲 / フォルダ / アーティスト / アルバムの4表示モード
- フォルダ表示はエクスプローラー風の階層移動
- アーティスト表示は「アーティスト → アルバム → 曲」の仮想階層
- アルバム表示は「アルバム → 曲」の仮想階層
- ID3v2から曲名・アーティスト・アルバム・埋め込み画像を端末内解析
- 読み込み中スピナーと進捗表示
- 再生 / 一時停止 / 前後曲 / 10秒送り戻し / シーク
- ループは新規曲で既定ON、曲ごとに保存
- 1/3〜1.5倍の指数型Gain、曲ごとに保存
- DynamicsCompressorNodeによるコンプレッサー、既定OFF、曲ごとに保存
- Media Session対応
- 外部CDN/API/解析/アップロード処理なし

## 権限について
File System Access API の権限挙動はChrome/OSに依存します。対応するChromeでは、インストール済みPWAは一度許可したファイル/フォルダ権限が永続化される挙動があります。それでも権限が `granted` でない場合に備え、本アプリは再許可UIを残しています。

## GitHub Pages
リポジトリ直下にこのフォルダ内のファイルを配置し、Settings → Pages から main / root を公開してください。
