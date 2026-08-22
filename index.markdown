---
layout: default
title: Home
nav_exclude: true
---

<style>
/* ==================================================
   セクション見出し
   ================================================== */
.portfolio-section-title {
  font-size: 1.75rem !important;
  font-weight: 800 !important;
  line-height: 1.4;
  margin-top: 2.5rem !important;
  margin-bottom: 1.2rem !important;
  padding-bottom: 0.4rem;
  border-bottom: 2px solid currentColor;
}

/* ==================================================
   論文名・発表名・イベント名
   ================================================== */
.portfolio-item-title {
  /*
   inline-blockにすると、複数行になった際に
   箇条書きの点が2行目へ移動するためinlineにする
  */
  display: inline;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.5;
}

/* ==================================================
   発表・実績のリスト
   ================================================== */
.portfolio-list {
  padding-left: 1.8rem;
}

.portfolio-list li {
  margin-bottom: 1.4rem;
  line-height: 1.55;
}

/* ==================================================
   研究分野
   ================================================== */
.research-fields {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.7rem;
  margin: 0 0 1.5rem;
}

.research-field {
  display: inline-block;
  padding: 0.35rem 0.8rem;
  border: 1px solid rgba(127, 127, 127, 0.35);
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.08);
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
}

/* ==================================================
   採択率・受賞率など
   ================================================== */
.portfolio-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem 0.55rem;
  margin-top: 0.45rem;
}

.portfolio-stat {
  display: inline-block;
  padding: 0.2rem 0.65rem;
  border: 1px solid rgba(127, 127, 127, 0.35);
  border-radius: 999px;
  background: rgba(127, 127, 127, 0.08);
  font-size: 0.9rem;
  font-weight: 700;
  line-height: 1.4;
}

.portfolio-stat-note {
  font-size: 0.85rem;
  line-height: 1.5;
  opacity: 0.8;
}

.portfolio-stat-unknown {
  font-weight: 600;
  opacity: 0.75;
}

/* ==================================================
   受賞表示
   ================================================== */
.award {
  color: red;
  font-weight: 700;
}

/* ==================================================
   スマートフォン表示
   ================================================== */
@media (max-width: 600px) {
  .portfolio-section-title {
    font-size: 1.5rem !important;
  }

  .portfolio-item-title {
    font-size: 1.05rem;
  }

  .research-fields {
    gap: 0.4rem;
  }

  .research-field {
    padding: 0.3rem 0.65rem;
    font-size: 0.9rem;
  }

  .portfolio-stat {
    font-size: 0.85rem;
  }
}
</style>

# 野々村 奏 (Kanade Nonomura)

<div style="display: flex; flex-wrap: wrap-reverse; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 30px;">

  <div style="flex: 1 1 300px;">
    <div style="margin-top: 0; margin-bottom: 15px; padding-left: 0;">
      <strong>所属</strong>：愛媛大学 大学院理工学研究科理工学専攻 数理情報プログラム 自然言語処理研究室 修士1年<br>
      <strong>Email</strong>：<span class="no-select">nonomura[at]ai.cs.ehime-u.ac.jp</span>
    </div>

    <p style="margin-bottom: 20px; line-height: 1.6; padding-left: 0;">
      現在、自然言語処理を専攻しています。特に、埋め込み表現の分野に注力しており、こうした技術の社会実装にも強い関心があります。
    </p>

    <div style="display: flex; flex-wrap: wrap; gap: 10px;">
      <a href="https://github.com/j341nono" style="text-decoration: none;">
        <img
          src="https://img.shields.io/badge/github-repository-blue?logo=github&style=for-the-badge"
          alt="GitHub"
        >
      </a>

      <a href="https://qiita.com/j341nono" style="text-decoration: none;">
        <img
          src="https://img.shields.io/badge/qiita-profile-55c500?logo=qiita&style=for-the-badge"
          alt="Qiita"
        >
      </a>
    </div>
  </div>

  <div style="flex: 0 0 auto;">
    <img
      src="assets/images/profile/v1.jpg"
      width="200"
      alt="野々村 奏"
      style="border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);"
    >
  </div>

</div>

## 研究分野
{: .portfolio-section-title }

<div class="research-fields">
  <span class="research-field">自然言語処理</span>
  <span class="research-field">埋め込み表現</span>
  <span class="research-field">自動プロンプト最適化</span>
  <span class="research-field">テキスト平易化</span>
</div>

## 国際学会
{: .portfolio-section-title }

<ul class="portfolio-list">
  <li>
    <span class="portfolio-item-title">Mitigating Language Bias in Multilingual Sentence Embeddings for Cross-lingual Similarity Estimation</span><br>
    <u>Kanade Nonomura</u>, Keita Fukushima, Risa Kondo, Tomoyuki Kajiwara,
    In Proceedings of the 15th Joint Conference on Lexical and Computational Semantics
    (*SEM 2026), pp.385–394, San Diego, California, United States, July 2026.
    [<a href="https://aclanthology.org/2026.starsem-conference.26/">PDF</a>]

    <!--
    <div class="portfolio-stats">
      <span class="portfolio-stat">採択：36 / 64（56.3%）</span>
    </div>
    -->
  </li>

  <li>
    <span class="portfolio-item-title">Disentangling Meaning and Language Components in Diverse Multilingual Sentence Embeddings</span><br>
    <u>Kanade Nonomura</u>, Keita Fukushima, Risa Kondo, Tomoyuki Kajiwara,
    In Proceedings of the ACL 2026 Student Research Workshop (ACL SRW 2026),
    pp.1169–1176, San Diego, California, United States, July 2026.
    [<a href="https://aclanthology.org/2026.acl-srw.102/">PDF</a>]

    <!--
    <div class="portfolio-stats">
      <span class="portfolio-stat">採択：130 / 402（公式の最終採択率 34.7%）</span>
    </div>
    -->
  </li>

  <li>
    <span class="portfolio-item-title">HOTATE: A Japanese Dialogue Corpus Annotated with Responses of Private Thoughts and Public Statements</span><br>
    Yuko Toda, Daisuke Maekawa, Kota Manabe, Eito Yoneyama,
    <u>Kanade Nonomura</u>, Yuki Fujiwara, Tomoyuki Kajiwara,
    In Proceedings of the 15th International Conference on Language Resources and Evaluation
    (LREC 2026), pp.2987–2995, Mallorca, Spain, May 2026.
    [<a href="https://aclanthology.org/2026.lrec-1.233/">PDF</a>]

    <!--
    <div class="portfolio-stats">
      <span class="portfolio-stat portfolio-stat-unknown">採択：944 / 1,786（52.85%）</span>
    </div>
    -->
  </li>
</ul>

## 国内学会
{: .portfolio-section-title }

<ul class="portfolio-list">
  <li>
    <span class="portfolio-item-title">多様な多言語文埋め込みに対する意味要素と言語要素の分離</span><br>
    <u>野々村 奏</u>, 福島 啓太, 近藤 里咲, 梶原 智之,
    人工知能学会第40回年次大会, 4yin-b-54, June 2026
  </li>

  <li>
    <span class="portfolio-item-title">HOTATE：本音と建前の応答対からなる対話コーパスの構築</span><br>
    戸田 裕子, 前川 大輔, 眞鍋 光汰, 米山 瑛人,
    <u>野々村 奏</u>, 藤原 有希, 梶原 智之,
    言語処理学会第32回年次大会, pp.1748-1752, March 2026
  </li>

  <li>
    <span class="portfolio-item-title">多言語文埋め込みの意味と言語の分離のための損失関数の分析</span><br>
    <u>野々村 奏</u>, 福島 啓太, 近藤 里咲, 梶原 智之,
    言語処理学会第32回年次大会, pp.3842-3846, March 2026
  </li>

  <li>
    <span class="portfolio-item-title">日本語文埋め込み獲得のための大規模言語モデルのプロンプト設計</span><br>
    <u>野々村 奏</u>, 梶原 智之,
    情報処理学会第88回全国大会, pp.281-282, March 2026,
    <span class="award">学生奨励賞</span>

  </li>
</ul>

## シンポジウム
{: .portfolio-section-title }

<ul class="portfolio-list">
  <li>
    <span class="portfolio-item-title">大規模言語モデルの埋め込みノルムに基づく連続的な文難易度制御に向けて</span><br>
    <u>野々村 奏</u>, 梶原 智之, 荒瀬 由紀,
    第21回言語処理若手シンポジウム (YANS2026), August 2026
  </li>
  <li>
    <span class="portfolio-item-title">多言語文埋め込みの意味要素と言語要素の分離に関する調査</span><br>
    <u>野々村 奏</u>, 近藤 里咲, 梶原 智之,
    第20回言語処理若手シンポジウム(YANS2025), September 2025
  </li>
</ul>

## ハッカソン・コンテスト
{: .portfolio-section-title }

<ul class="portfolio-list">

  <li>
    <span class="portfolio-item-title">第21回言語処理若手シンポジウム (YANS2026) ハッカソン</span><br>
    2026年8月，
    論文中の引用が引用先の内容と整合しているかを判定し、引用ハルシネーションを検出するタスク
    [<a href="https://yans.anlp.jp/entry/yans2026hackathon">Link</a>]
  </li>

  <li>
    <span class="portfolio-item-title">【技育CAMP2026】ハッカソン Vol.4</span><br>
    2026年7月〜8月，
    約束を破ると、仲間に「スクワット負債」が発生する連帯責任型のモバイルアプリの開発，
    <span class="award">最優秀賞</span>
    [<a href="https://talent.supporterz.jp/events/b96e07e6-6e17-4c2b-89c5-36e162b7ea20/">Link</a>]
    [<a href="https://github.com/kren-team/michizure">Code</a>]

    <div class="portfolio-stats">
      <span class="portfolio-stat">受賞枠：1 / 14（7.1%）</span>
      <span class="portfolio-stat">賞金：30,000円</span>
    </div>
  </li>

  <li>
    <span class="portfolio-item-title">【技育CAMP2026】ハッカソン Vol.2</span><br>
    2026年4月，
    ユーザーの作業状況を解析し、「集中しているかどうか」を判定・可視化・通知するデスクトップアプリケーションの開発，
    <span class="award">サポーターズ賞</span>
    [<a href="https://talent.supporterz.jp/events/82c4c266-cde5-4b34-90fe-7c82d83a97dc/">Link</a>]
    [<a href="https://github.com/jupiter-team13/zurenavi">Code</a>]

    <div class="portfolio-stats">
      <span class="portfolio-stat">受賞枠：5 / 12（41.7%）</span>
      <span class="portfolio-stat">賞金：5,000円</span>
    </div>
  </li>

  <li>
    <span class="portfolio-item-title">第20回言語処理若手シンポジウム (YANS2025) ハッカソン</span><br>
    2025年9月，
    選好チューニングを用いた訓練により、数学問題の正答率を競う課題
    [<a href="https://yans.anlp.jp/entry/yans2025hackathon">Link</a>]
  </li>

  <li>
    <span class="portfolio-item-title">【技育CAMP2025】ハッカソン Vol.8</span><br>
    2025年7月，
    複数人で楽にアノテーションを実施できるWebアプリの開発
    [<a href="https://talent.supporterz.jp/events/cbcbae79-19d7-4ae3-a45c-75b8bb80a562/">Link</a>]
    [<a href="https://github.com/bakeryforhackathon/annotopia">Code</a>]
  </li>

  <li>
    <span class="portfolio-item-title">Ruby 合宿 2024 夏</span><br>
    2024年8月，
    GOSUライブラリを用いたカードゲームの開発
    [<a href="https://www.rubycamp.jp/reports/2024-08-31-2024-summer/">Link</a>]
    [<a href="https://github.com/j341nono/rc2024su_team1">Code</a>]
  </li>
</ul>

## インターン
{: .portfolio-section-title }

<ul class="portfolio-list">
  <li>
    <span class="portfolio-item-title">LINEヤフー株式会社</span><br>
    2026年8月〜現在
  </li>

  <li>
    <span class="portfolio-item-title">株式会社レトリバ</span><br>
    2026年2月〜3月，
    テキスト埋め込みモデルに対する自動プロンプト最適化の研究
    [<a href="https://zenn.dev/retrieva_tech/articles/b5c21fe10e4ee9">Link</a>]
  </li>
</ul>

## 活動
{: .portfolio-section-title }

<ul class="portfolio-list">
  <li>
    <span class="portfolio-item-title">令和8年度 外国人材地域体験・交流モデル事業 大学生企画運営チーム</span><br>
    2026年5月〜現在，
    愛媛県中予地方局の若手職員・県内大学生とともに、外国人材の地域定着に向けた交流イベントの企画・運営に参加
    [<a href="https://www.pref.ehime.jp/site/chuyo/147431.html?utm_source=chatgpt.com">事業内容</a>]
  </li>
</ul>

## 受賞・資格
{: .portfolio-section-title }

<ul class="portfolio-list">
  <li>
    <span class="portfolio-item-title">【技育CAMP2026】ハッカソン Vol.4 最優秀賞</span>

    <div class="portfolio-stats">
      <span class="portfolio-stat">受賞枠：1 / 14（7.1%）</span>
      <span class="portfolio-stat">賞金：30,000円</span>
    </div>
  </li>

  <li>
    <span class="portfolio-item-title">【技育CAMP2026】ハッカソン Vol.2 サポーターズ賞</span>

    <div class="portfolio-stats">
      <span class="portfolio-stat">受賞枠：5 / 12（41.7%）</span>
      <span class="portfolio-stat">賞金：5,000円</span>
    </div>
  </li>

  <li>
    <span class="portfolio-item-title">情報処理学会第88回全国大会 学生奨励賞（March 2026）</span>

    <div class="portfolio-stats">
      <span class="portfolio-stat">セッション内の受賞枠：2 / 7（28.6%）</span>
    </div>
  </li>

  <li>
    <span class="portfolio-item-title">愛媛大学工学部工学科応用情報工学コース優秀学生（3年次）</span>

    <div class="portfolio-stats">
      <span class="portfolio-stat portfolio-stat-unknown">選考率：不明</span>
    </div>
  </li>

  <li>
    <span class="portfolio-item-title">応用情報技術者試験 合格</span>

    <div class="portfolio-stats">
      <span class="portfolio-stat portfolio-stat-unknown">合格率：不明</span>
    </div>
  </li>
</ul>


