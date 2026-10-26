# OSS貢献の確認・更新手順

このポートフォリオのOSS情報を更新するときの手順。今後「PRがマージされたので更新して」「OSSの掲載内容を確認して」と依頼されたら、この文書に沿って確認する。

## 仕組みと対象ファイル

情報はGitHubで確認して `_data/oss.yml` に保存する固定データ。ページ閲覧時・Jekyllビルド時の自動取得や、定期同期は行っていない。更新を公開するには、データ変更後に通常のビルド・公開が必要。

| ファイル | 役割 |
| --- | --- |
| `_data/oss.yml` | リポジトリ、star数、日英の要約、個別Issue・PRの情報 |
| `_includes/oss.html` | OSSセクション全体 |
| `_includes/oss-project.html` | プロジェクトごとの表示・件数集計・詳細トグル |
| `_includes/oss-item.html` | Issue・PRのURLとステータス表示 |
| `_data/locales.yml` の `oss` | 日英のステータス文言 |
| `_sass/portfolio/_oss.scss` | Open・Merged・Closedなどの見た目 |

この `docs/` は管理用で、Jekyllの公開対象から除外している。

## 1. 確認範囲を決める

- **特定のPR・Issueの更新**：依頼された項目を確認する。同じプロジェクトの要約に関係する項目も必要に応じて確認する。他のプロジェクトやstar数を一括更新する必要はない。
- **掲載済み情報の全件確認**：`_data/oss.yml` にあるすべてのIssue・PRと、各リポジトリのstar数を確認する。
- **新しい貢献の追加**：ユーザー `j341nono` の対象リポジトリへの貢献を探し、掲載候補の個別ページ・APIで内容と状態を確認してから追加する。

依頼されていない項目を推測で書き換えない。番号だけで照合せず、`repo`・`type`・`number` の組み合わせで識別する。

## 2. GitHubの一次情報を確認する

GitHubの個別ページ、またはREST APIの個別エンドポイントを使う。検索結果や手元のブランチ、PR本文の「修正した」という記述だけでマージ済みと判断しない。

GitHub CLIを使う場合の例（読み取りのみ）：

```sh
# PR：投稿者、リポジトリ、番号、原題、状態、マージ日時、URL
gh api repos/huggingface/sentence-transformers/pulls/4280 \
  --jq '{repo: .base.repo.full_name, author: .user.login, number, title, state, merged, merged_at, html_url}'

# Issue：PRと取り違えていないかも確認する
gh api repos/stanfordnlp/dspy/issues/10245 \
  --jq '{author: .user.login, number, title, state, html_url, is_pull_request: has("pull_request")}'

# star数：全件確認時やstar数更新を依頼されたときに取得する
gh api repos/huggingface/sentence-transformers \
  --jq '{full_name, stargazers_count}'
```

CLIが使えない場合は、次のURLをブラウザやHTTPクライアントで確認する。

- PRページ：`https://github.com/{owner}/{repo}/pull/{number}`
- Issueページ：`https://github.com/{owner}/{repo}/issues/{number}`
- PR API：`https://api.github.com/repos/{owner}/{repo}/pulls/{number}`
- Issue API：`https://api.github.com/repos/{owner}/{repo}/issues/{number}`
- リポジトリAPI：`https://api.github.com/repos/{owner}/{repo}`

APIの失敗・レート制限・404を、Closedや削除済みと読み替えない。確認できない項目は既存値を保持し、未確認として報告する。検索で候補を探す場合はページ送りも確認し、最終判定には個別APIか個別ページを使う。

## 3. ステータスを判定する

| 対象 | GitHubで確認できた状態 | YAMLの `status` |
| --- | --- | --- |
| PR | `merged_at` が存在し、`merged` が `true` | `merged` |
| PR | `merged_at` が `null`、`state` が `open` | `open` |
| PR | `merged_at` が `null`、`state` が `closed` | `closed` |
| Issue | `state` が `open` | `open` |
| Issue | `state` が `closed` | `closed` |

**PRの `state: closed` だけではマージ済みと判定できない。** マージ済みPRもAPIでは `state: closed` になる。Issueには `merged` を設定しない。関連PRがマージされても、対応するIssueが閉じたとは推測しない。

マージ済みでもリリース済みとは限らないため、リリースへの収録は別途確認できたときだけ記述する。

## 4. データを更新する

対象項目の `status` と確認済みの情報を変更する。タイトルが変わっていれば `github_title` も更新し、日英の要約・タイトルと矛盾しないか確認する。要約は簡潔にし、提案中と採用済みを区別する。

```yaml
- type: "pr"
  number: 4280
  status: "merged"
  checked_at: "2026-10-27"
  merged_at: "2026-10-26T16:52:58Z"
  title:
    ja: "ドキュメントのソースリンクをビルド時のコミットに固定"
    en: "[fix] Pin documentation source links to the build commit"
  github_title: "[fix] Pin documentation source links to the build commit"
```

- `checked_at` は確認日を `YYYY-MM-DD` の文字列で保存する。このプロジェクトでは日本時間の日付を使う。
- 特定項目だけを確認した場合は、その `items` 要素に `checked_at` を記録する。トップレベルの `checked_at` は更新しない。
- 全項目とstar数を確認できた場合だけ、トップレベルの `checked_at` を更新する。項目ごとの確認日も併せて揃える。
- `merged_at` はマージが確認できたPRに、APIのUTC日時をそのまま記録する。推測した日時を入れない。
- 確認日は管理用データとして残す。画面上には表示しない。
- Issue・PR件数は `items` から自動集計する。マージ後もPRの提出件数は減らさず、同じPRを重複追加しない。
- 複数のIssue・PRはトグルにまとめる。ライブラリ名にはリンクを付けず、リポジトリへのリンクは共通の `[GitHub]` 表示を維持する。
- プロジェクトの並び順やセクション位置は、更新依頼に含まれていなければ変更しない。

## 5. ビルド・表示を確認する

```sh
bundle exec jekyll build
git diff --check
bundle exec jekyll serve
```

日本語 `http://localhost:4000/homepage/` と英語 `http://localhost:4000/homepage/en/` を確認する。サーバーを別のポートで起動している場合は読み替える。

1. OSSセクションと対象プロジェクトの詳細トグルを開く。
2. 状態表示が確認結果と一致することを確認する。マージ済みPRなら `Merged / マージ済み`（英語は `Merged`）となり、Open項目と区別できることを確認する。
3. 対象リンクのリポジトリ・`issues` / `pull`・番号が正しく、別項目の状態を変えていないことを確認する。
4. 日英の要約、件数、スマホ表示、ダークモードを確認する。
5. 最終差分を確認する。確認日の画面表示を復活させない。

## 6. 更新結果を報告する

変更した項目・ステータス、確認元のGitHubリンク、変更したファイル、実施したビルド・表示確認を簡潔に報告する。確認範囲と、未確認の項目があれば明記する。自動同期や公開まで完了したとは、実施していなければ書かない。

依頼例：

> docs/oss-contributions.md に従って、掲載済みのOSS貢献のステータスとstar数を全件確認し、更新してください。

## 確認例：Sentence-Transformers #4280

2026-10-27に、[PR #4280](https://github.com/huggingface/sentence-transformers/pull/4280) の個別APIで `merged: true`、`merged_at: 2026-10-26T16:52:58Z` を確認し、`open` から `merged` に変更した。同じリポジトリの #4281・#4282 は個別APIでOpenを確認。今回はこの3件の確認で、他プロジェクトやstar数の再取得は行っていない。
