# OSS貢献の自動更新と運用

## 調査結果と構成

2026-10-29の調査時、Pages APIの `build_type` は `legacy`、公開元は `main:/`。
Actions履歴の `pages build and deployment` はGitHub管理の自動生成ワークフローで、
リポジトリには編集可能なPagesワークフローがなかった。このため
`.github/workflows/deploy-pages.yml` を追加し、公開元をGitHub Actionsへ切り替える。

既存の `update-wordcloud.yml` は画像・Language Globeの生成とコミット用。
OSS更新とは分離して維持する。この既存処理のコミットを含め、次の定期実行でも
`main` の最新内容が公開される。`GITHUB_TOKEN` によるbotのpushは別のActionsを
起動しないため、画像生成完了直後の公開までは保証しない。すぐ反映する場合は
Pagesワークフローを手動実行する。

| ファイル | 役割 |
| --- | --- |
| `_data/oss.yml` | 共通データ。トップの `checked_at`、順序付き `projects`、各 `items` |
| `_includes/oss.html` | 日英共通のOSSセクション |
| `_includes/oss-project.html` | Stars・要約・件数・詳細トグル |
| `_includes/oss-item.html` | Issue/PRリンク、GitHub原題のツールチップ、状態バッジ |
| `_data/locales.yml` | 日英の状態ラベル |
| `_sass/portfolio/_oss.scss` | 状態の見た目（変更なし） |
| `scripts/update_oss.py` | GitHub REST APIで登録済み項目を取得・検証・更新 |
| `requirements-oss.txt` | 既存スクリプトと同じPyYAMLバージョン |
| `tests/test_update_oss.py` | 外部API不要のモック・YAML・ワークフローテスト |
| `.github/workflows/deploy-pages.yml` | API取得 → Jekyllビルド → artifact → Pages |

Jekyllは既存のGemfile/Gemfile.lock（Jekyll 4.4系・minima・jekyll-feed）を使用し、
`bundle exec jekyll build` で生成する。公開URLのサブパスは `configure-pages` の
`base_path` をビルドに渡す。管理用の `scripts/`・`tests/`・`docs/`・依存ファイルは
`_config.yml` で公開対象から除外。表示テンプレート・デザインは共通の既存実装を使用する。

## 初回導入

1. 変更を `main` に取り込む。
2. リポジトリの **Settings → Pages → Build and deployment → Source** を
   **Deploy from a branch** から **GitHub Actions** に変更する。
   従来方式の公開を停止し、Pagesの二重デプロイを避ける。設定変更とmain反映は
   同じ導入作業内で行う。初回pushの実行が切替前に失敗した場合は次の手順で再実行する。
3. **Actions → Deploy Pages with fresh OSS metadata → Run workflow** で
   ブランチ **main** を選んで実行する。
4. `build`・`deploy` の成功、Environment `github-pages` の公開URL、
   `/homepage/` と `/homepage/en/` のStars・状態バッジを確認する。

追加Secret・PATは不要。標準の `GITHUB_TOKEN` を取得ステップだけに渡す。
ビルドは `contents: read` と設定参照用の `pages: read`、デプロイは
`pages: write` と `id-token: write` に限定する。`contents: write` は使わない。
手動実行はmainのみ公開できる。Environmentに保護ルールがある場合はmainからの
デプロイを許可する。公開元設定は管理者が変更する（ワークフローは自動変更しない）。

## 更新頻度・公開経路

- `main` への通常push：パス制限なしで、必ずAPI取得後にビルドする。
- `workflow_dispatch`：同じ取得・ビルド・デプロイ経路で手動更新する。
- `schedule: 17 3 1-31/2 * *`：UTCの奇数日03:17、日本時間12:17。
  通常48時間間隔。31日ある月の31日→翌月1日と、うるう年の2月29日→3月1日は24時間間隔。
  30日ある月は29日→翌月1日が48時間、2月も28日なら27日→3月1日が48時間、
  うるう年なら29日→3月1日が24時間となる。厳密な48時間タイマーではない。
  GitHubの混雑による遅延・スキップや、公開リポジトリの長期無活動によるschedule無効化も
  あり得るため、必要時はActions画面から有効化・手動実行する。

すべて同じ `pages` concurrencyグループで直列化し、実行中のデプロイをキャンセルしない。
OSS YAMLはcheckoutしたrunner内でのみ更新する。Gitへのコミットやpushは行わない。
通常push時も取得を省略しないため、リポジトリに残る古いスナップショットがそのまま
本番サイトに戻ることはない。ローカルの通常ビルドは保存済みの値を使い、APIを呼ばない。

## 自動更新する情報

| 対象 | エンドポイント | 更新フィールド |
| --- | --- | --- |
| プロジェクト | `GET /repos/{owner}/{repo}` | `stars` ← `stargazers_count` |
| Issue | `GET /repos/{owner}/{repo}/issues/{number}` | `status`、`github_title`、`checked_at` |
| PR | `GET /repos/{owner}/{repo}/pulls/{number}` | 上記に加え `merged_at` |

Issueは `state` に従って `open` / `closed`。PRは `merged_at != null` なら `merged`、
それ以外は `state` の `open` / `closed`。`state: closed` だけでマージとは判定しない。
マージ日時の形式・実在日とstateの整合性も検証する。マージされていないPRやIssueに
以前の `merged_at` があれば削除する。関連Issueの状態はPRから推測せず個別取得する。
Issue番号が実はPRだった場合、未知のstateや必須フィールド欠落も失敗として扱う。

全件成功したときだけトップレベルと各項目の `checked_at` を日本時間の
`YYYY-MM-DD` 文字列に揃える。マージ日時はAPIのUTC文字列を保持する。
確認日・マージ日時は管理用で、既存どおり画面には表示しない。
GitHub原題は既存リンクのツールチップに反映される。

## 手動編集する情報

`summary.ja/en`、`title.ja/en`、プロジェクト名・repo・表示順・links、独自フィールドは
自動処理で上書きしない。更新対象のフィールドだけを明示的に変更する。
YAMLのコメント・引用符などの書式はrunner内の再シリアライズで変わり得るが、値を保持する。

要約には「マージ済み」「提案中」「クローズ」など将来変わる状態を書かず、貢献内容を書く。
導入時にSpinelとsentence-transformersの固定状態表現をこの方針へ修正した。
現在の状態は日英共通テンプレートのバッジが常にデータから表示する。
件数・リンク・折りたたみ・日英切替などの既存仕様は維持する。

新規Issue/PRは自動発見・追加しない。人が一次情報でリポジトリ・種類・番号・内容を確認し、
`projects[].items` に `type: issue/pr`、`number`、日英の `title` を追加する。
ローカル表示用の `status`、`github_title` も登録しておく。本番ではAPI値で置き換わる。
リポジトリは `owner/repo`。番号だけで照合せず `repo`・`type`・`number` の組で識別する。
マージはリリースへの収録を意味しないため、リリースに関する説明は別途確認する。

## 失敗時の挙動

全APIの取得と検証、YAMLの再読込検証が成功してから同じディレクトリの一時ファイルを
atomic replaceする。一件でも失敗すれば元のYAMLは変更しない。
通信障害・タイムアウト・5xxは最大3回（待機1秒・2秒、各通信30秒）試す。
403/429は認証・レート制限として即失敗し、404・その他のHTTPエラー・不正JSON・
不正メタデータも失敗する。404をclosedとみなさない。
リダイレクトは認証ヘッダーを転送せず失敗させるので、リポジトリ移転時は人がrepoを確認する。

失敗は非ゼロ終了となり、ビルド・artifact upload・deployへ進まない。
取得失敗時もビルド失敗時も、既存の公開サイトを維持する。
ログにAPIレスポンス本文・トークン・認証ヘッダーは出さず、公開ファイルには必要な
メタデータのみ保存する。失敗時はActionsログのHTTP種別を確認し、アクセス・登録番号・
GitHubの障害状況などを解決してから `Run workflow` で再実行する。

## 検証

```sh
python3 -m venv /tmp/homepage-tests
/tmp/homepage-tests/bin/pip install -r requirements-wordcloud.txt
bundle install
# 既存テストを含む全テスト（OSSテストは外部APIを使わない）
# Ruby/Bundler導入後は日英HTMLの統合ビルドテストも有効化できる
OSS_TEST_JEKYLL=1 /tmp/homepage-tests/bin/python -m unittest discover -s tests -v
# OSSだけなら requirements-oss.txt のインストールで十分
/tmp/homepage-tests/bin/python -m unittest discover -s tests -p 'test_update_oss.py' -v
JEKYLL_ENV=production bundle exec jekyll build
git diff --check
```

Stars、Issueのopen/closed、PRのopen/closed/merged、マージ日時の整合性と削除、
日英の手動フィールド・独自フィールド・順序の保持、全登録項目の取得、
404・レート制限・通信障害・不正JSON・不正YAML、失敗時の原本保持、
YAML round-trip、再実行の安定性、秘密値のログ抑止をモックで検証する。
push・schedule・手動の共通経路、API取得→ビルド→uploadの順序、成功時だけのdeploy、
最小権限・同時実行制御もワークフローの契約テストで確認する。
GitHub上の実際のイベント起動・権限・公開は初回手動実行で確認する。

参考：[GitHub Pagesのカスタムワークフロー](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、
[scheduleイベント](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)、
[PR API](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request)。
