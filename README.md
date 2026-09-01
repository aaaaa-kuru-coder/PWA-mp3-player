# Local MP3 Player v2 (GitHub Pages / PWA)

端末内の音楽フォルダを登録し、そのフォルダ（サブフォルダ含む）のMP3を一覧表示・再生するPWAです。MP3本体をサーバーへアップロードする処理はありません。

## v2の主な機能

- `showDirectoryPicker()` による音楽フォルダ登録
- 登録した `FileSystemDirectoryHandle` を IndexedDB に保存
- 次回起動時、権限が残っていれば同じフォルダを自動走査
- 権限の再確認が必要な場合だけ「アクセスを許可」ボタンを表示
- 非対応ブラウザ向けに複数MP3ファイル選択をフォールバックとして維持
- フォルダのサブフォルダも再帰的に検索
- MP3のID3v2タグから曲名 / アーティスト / アルバム / APICアルバム画像を端末上で取得
- 一覧をファイル名 / 曲名 / アーティスト / アルバムでソート
- 再生 / 一時停止 / 前曲 / 次曲 / 10秒戻る / 進む / シーク
- ループは新規曲でデフォルトON、曲ごとに設定保存
- プレイヤー独自の音量倍率 1/3〜1.5倍（指数スライダー）、曲ごとに保存
- Web Audio API `DynamicsCompressorNode` のコンプレッサー（デフォルトOFF）
- コンプレッサーの threshold / ratio / knee / attack / release / makeup gain を曲ごとに保存
- Media Session API 対応
- Service Workerはアプリ本体のみキャッシュ。MP3はキャッシュしない

## GitHub Pagesへの配置

1. このフォルダの中身をGitHubリポジトリ直下へ置く。
2. Repository Settings → Pages → Deploy from a branch。
3. `main` / `(root)` を選択。
4. 発行されたHTTPS URLをAndroid Chromeで開く。
5. 「フォルダを登録」からMusicフォルダ等を一度選ぶ。
6. 必要なら「ホーム画面に追加」/「アプリをインストール」。

## フォルダ記憶について

Webアプリは端末の任意フォルダを無断で読み取れません。初回は必ずユーザーがフォルダを選択します。その後はディレクトリーハンドルをIndexedDBへ保存します。ブラウザが読み取り権限を維持していれば次回起動時に自動一覧化します。権限が `prompt` に戻っている場合は、ユーザー操作で再許可が必要です。

## ID3タグ / アルバム画像

外部ライブラリを使わず、アプリ内の小さなID3v2.3/v2.4パーサーで `TIT2` / `TPE1` / `TALB` / `APIC` を読みます。一般的なMP3では動作しますが、特殊なID3タグ、巨大なタグ、ID3v1のみのファイル等ではメタデータを取得できない場合があります。その場合はファイル名で表示します。

## コンプレッサー

音声経路は概ね以下です。

`MP3 -> Track Gain -> (Compressor -> Makeup Gain) -> Output`

コンプレッサーOFF時はCompressor経路をバイパスします。MP3ファイル自体を書き換えません。

## プライバシー / 通信

- MP3は `File` → `blob:` URLとして端末内で再生します。
- ID3タグ・アルバム画像の解析も端末内です。
- MP3アップロード用の `fetch` / XHR / WebSocket / Firebase / 外部APIはありません。
- CSPは `connect-src 'none'` です。
- 外部CDN、広告、アクセス解析、外部フォントは使っていません。
- GitHub Pagesから通信して取得するのはHTML/CSS/JS/manifest/icon等の「アプリ本体」です。
- Webページのコード自体が侵害・差し替えされた場合など、別レイヤーのリスクまでゼロにはできません。

## 注意

`showDirectoryPicker()` はブラウザ依存です。Android Chromeなど対応ブラウザを想定し、非対応環境では複数ファイル選択を使ってください。SDカードがOSのフォルダ選択画面に表示され、選択可能であれば同じ仕組みで利用できます。
