---
layout: default
title: home
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

# 野々村 奏 (kanade nonomura)

<div style="display: flex; flex-wrap: wrap-reverse; justify-content: space-between; align-items: flex-start; gap: 20px; margin-bottom: 30px;">

  <div style="flex: 1 1 300px;">
    <div style="margin-top: 0; margin-bottom: 15px; padding-left: 0;">
      <strong>所属</strong>：愛媛大学 大学院理工学研究科理工学専攻 数理情報プログラム 自然言語処理研究室 修士1年<br>
      <strong>email</strong>：<span class="no-select">nonomura[at]ai.cs.ehime-u.ac.jp</span>
    </div>

    <p style="margin-bottom: 20px; line-height: 1.6; padding-left: 0;">
      現在、自然言語処理を専攻しています。特に、埋め込み表現の分野に注力しており、こうした技術の社会実装にも強い関心があります。また、情報科学の他にも、天文学や幾何学にも広く関心を寄せています。
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
    <span class="portfolio-item-title">mitigating language bias in multilingual sentence embeddings for cross-lingual similarity estimation</span><br>
    <u>kanade nonomura</u>, keita fukushima, risa kondo, tomoyuki kajiwara,
    in proceedings of the 15th joint conference on lexical and computational semantics
    (*sem 2026), pp.385–394, san diego, california, united states, july 2026.
    [<a href="https://aclanthology.org/2026.starsem-conference.26/">pdf</a>]

    <div class="portfolio-stats">
      <span class="portfolio-stat">採択：36 / 64（56.3%）</span>
    </div>
  </li>

  <li>
    <span class="portfolio-item-title">disentangling meaning and language components in diverse multilingual sentence embeddings</span><br>
    <u>kanade nonomura</u>, keita fukushima, risa kondo, tomoyuki kajiwara,
    in proceedings of the acl 2026 student research workshop (acl srw 2026),
    pp.1169–1176, san diego, california, united states, july 2026.
    [<a href="https://aclanthology.org/2026.acl-srw.102/">pdf</a>]

    <div class="portfolio-stats">
      <span class="portfolio-stat">採択：130 / 402（単純計算 32.3%）</span>
      <span class="portfolio-stat-note">公式文書記載の最終採択率：34.7%</span>
    </div>
  </li>

  <li>
    <span class="portfolio-item-title">hotate: a japanese dialogue corpus annotated with responses of private thoughts and public statements</span><br>
    yuko toda, daisuke maekawa, kota manabe, eito yoneyama,
    <u>kanade nonomura</u>, yuki fujiwara, tomoyuki kajiwara,
    in proceedings of the 15th international conference on language resources and evaluation
    (lrec 2026), pp.xxx-xxx, mallorca, spain, may 2026 (to appear)

    <div class="portfolio-stats">
      <span class="portfolio-stat portfolio-stat-unknown">採択率：不明</span>
    </div>
  </li>
</ul>

## 国内学会
{: .portfolio-section-title }

<ul class="portfolio-list">
  <li>
    <span class="portfolio-item-title">多様な多言語文埋め込みに対する意味要素と言語要素の分離</span><br>
    <u>野々村 奏</u>, 福島 啓太, 近藤 里咲, 梶原 智之,
    人工知能学会第40回年次大会, 4yin-b-54, june 2026
  </li>

  <li>
    <span class="portfolio-item-title">hotate：本音と建前の応答対からなる対話コーパスの構築</span><br>
    戸田 裕子, 前川 大輔, 眞鍋 光汰, 米山 瑛人,
    <u>野々村 奏</u>, 藤原 有希, 梶原 智之,
    言語処理学会第32回年次大会, pp.1748-1752, march 2026
  </li>

  <li>
    <span class="portfolio-item-title">多言語文埋め込みの意味と言語の分離のための損失関数の分析</span><br>
    <u>野々村 奏</u>, 福島 啓太, 近藤 里咲, 梶原 智之,
    言語処理学会第32回年次大会, pp.3842-3846, march 2026
  </li>

  <li>
    <span class="portfolio-item-title">日本語文埋め込み獲得のための大規模言語モデルのプロンプト設計</span><br>
    <u>野々村 奏</u>, 梶原 智之,
    情報処理学会第88回全国大会, pp.281-282, march 2026,
    <span class="award">学生奨励賞</span>

    <div class="portfolio-stats">
      <span class="portfolio-stat">受賞：2 / 7（28.6%）</span>
    </div>
  </li>
</ul>

## シンポジウム
{: .portfolio-section-title }

<ul class="portfolio-list">
  <li>
    <span class="portfolio-item-title">多言語文埋め込みの意味要素と言語要素の分離に関する調査</span><br>
    <u>野々村 奏</u>, 近藤 里咲, 梶原 智之,
    nlp若手の会第20回シンポジウム (yans2025), september 2025
  </li>
</ul>

## ハッカソン・コンテスト
{: .portfolio-section-title }

<ul class="portfolio-list">
  <li>
    <span class="portfolio-item-title">【技育camp2026】ハッカソン vol.4</span>
    [<a href="https://talent.supporterz.jp/events/b96e07e6-6e17-4c2b-89c5-36e162b7ea20/">link</a>]
    [<a href="https://github.com/kren-team/michizure">成果物</a>]<br>
    約束を破ると、仲間に「スクワット負債」が発生する連帯責任型のモバイルアプリの開発，
    <span class="award">最優秀賞</span>

    <div class="portfolio-stats">
      <span class="portfolio-stat">最優秀賞：1 / 14（7.1%）</span>
      <span class="portfolio-stat">賞金：30,000円</span>
    </div>
  </li>

  <li>
    <span class="portfolio-item-title">【技育camp2026】ハッカソン vol.2</span>
    [<a href="https://talent.supporterz.jp/events/82c4c266-cde5-4b34-90fe-7c82d83a97dc/">link</a>]
    [<a href="https://github.com/jupiter-team13/zurenavi">成果物</a>]<br>
    ユーザーの作業状況を解析し、「集中しているかどうか」を判定・可視化・通知するデスクトップアプリケーションの開発，
    <span class="award">サポーターズ賞</span>

    <div class="portfolio-stats">
      <span class="portfolio-stat">受賞枠：5 / 14（35.7%）</span>
      <span class="portfolio-stat-note">内訳：最優秀賞1件、優秀賞1件、サポーターズ賞3件</span>
    </div>
  </li>

  <li>
    <span class="portfolio-item-title">第20回言語処理若手シンポジウム (yans2025) ハッカソン</span>
    [<a href="https://yans.anlp.jp/entry/yans2025hackathon">link</a>]<br>
    選好チューニングを用いた訓練により、数学問題の正答率を競う課題
  </li>

  <li>
    <span class="portfolio-item-title">【技育camp2025】ハッカソン vol.8</span>
    [<a href="https://talent.supporterz.jp/events/cbcbae79-19d7-4ae3-a45c-75b8bb80a562/">link</a>]
    [<a href="https://github.com/bakeryforhackathon/annotopia">成果物</a>]<br>
    複数人で楽にアノテーションを実施できるwebアプリの開発
  </li>

  <li>
    <span class="portfolio-item-title">ruby 合宿 2024 夏</span>
    [<a href="https://www.rubycamp.jp/reports/2024-08-31-2024-summer/">link</a>]
    [<a href="https://github.com/j341nono/rc2024su_team1">成果物</a>]<br>
    gosuライブラリを用いたカードゲームの開発
  </li>
</ul>

## インターン
{: .portfolio-section-title }

<ul class="portfolio-list">
  <li>
    <span class="portfolio-item-title">株式会社レトリバ</span>,
    february 9, 2026 to march 31, 2026
    [<a href="https://zenn.dev/retrieva_tech/articles/b5c21fe10e4ee9">link</a>]<br>
    テキスト埋め込みモデルに対する自動プロンプト最適化の研究
  </li>
</ul>

## 受賞・資格
{: .portfolio-section-title }

<ul class="portfolio-list">
  <li>
    <span class="portfolio-item-title">【技育camp2026】ハッカソン vol.4 最優秀賞</span>

    <div class="portfolio-stats">
      <span class="portfolio-stat">最優秀賞：1 / 14（7.1%）</span>
      <span class="portfolio-stat">賞金：30,000円</span>
    </div>
  </li>

  <li>
    <span class="portfolio-item-title">【技育camp2026】ハッカソン vol.2 サポーターズ賞</span>

    <div class="portfolio-stats">
      <span class="portfolio-stat">受賞枠：5 / 14（35.7%）</span>
      <span class="portfolio-stat-note">内訳：最優秀賞1件、優秀賞1件、サポーターズ賞3件</span>
    </div>
  </li>

  <li>
    <span class="portfolio-item-title">情報処理学会第88回全国大会 学生奨励賞（march 2026）</span>

    <div class="portfolio-stats">
      <span class="portfolio-stat">受賞：2 / 7（28.6%）</span>
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



