#!/usr/bin/env python3
"""Generate the homepage's TF-IDF weighted word cloud."""

from __future__ import annotations

import argparse
import hashlib
import html
import math
import os
import re
from collections import Counter
from pathlib import Path

from janome.tokenizer import Tokenizer
from wordcloud import WordCloud


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "index.markdown"
DEFAULT_OUTPUT = ROOT / "assets" / "images" / "wordcloud" / "tfidf-wordcloud.png"

# Portfolio boilerplate, dates, venues, author names, and publication metadata are
# deliberately omitted so that the cloud describes the work rather than the CV format.
STOP_WORDS = {
    "こと", "ため", "もの", "これ", "それ", "現在", "分野", "研究", "開発", "回",
    "参加", "実施", "利用", "向け", "ホーム", "キーワード", "リンク", "コード",
    "学会", "大会", "年次", "シンポジウム", "ハッカソン", "コンテスト", "インターン", "若手",
    "受賞", "資格", "企画", "運営", "所属", "大学", "大学院", "工学", "専攻",
    "プログラム", "コース", "チーム", "学生", "年度", "株式会社", "情報", "内容",
    "地域", "タスク", "アプリ", "アプリケーション", "ライブラリ", "技術", "賞金", "不明",
    "合格", "国際", "国内", "最優秀", "サポーターズ", "受賞枠", "ページ", "セクション", "文書", "重み付け",
    "proceedings", "conference", "workshop", "united", "states", "california",
    "san", "diego", "july", "june", "march", "may", "august", "september", "vol", "pp",
    "pdf", "link", "code", "github", "qiita", "email", "line", "camp", "yans", "acl", "srw",
    "lrec", "sem", "international", "joint", "student", "resources", "evaluation", "japanese",
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into", "is", "of",
    "on", "or", "that", "the", "this", "to", "with", "th",
}

ASCII_WORD_RE = re.compile(r"[A-Za-z][A-Za-z0-9+.-]{1,}")


def visible_markdown(source: str) -> str:
    """Remove markup and content that is not visible on the homepage."""
    source = re.sub(r"\A---\s*\n.*?\n---\s*\n", "", source, flags=re.DOTALL)
    source = re.sub(r"<!--.*?-->", " ", source, flags=re.DOTALL)
    source = re.sub(r"<style\b.*?</style>", " ", source, flags=re.DOTALL | re.IGNORECASE)
    source = re.sub(r"<script\b.*?</script>", " ", source, flags=re.DOTALL | re.IGNORECASE)
    source = re.sub(
        r"<span\b[^>]*class=[\"'][^\"']*no-select[^\"']*[\"'][^>]*>.*?</span>",
        " ",
        source,
        flags=re.DOTALL | re.IGNORECASE,
    )
    source = re.sub(
        r"<div\b[^>]*class=[\"'][^\"']*portfolio-stats[^\"']*[\"'][^>]*>.*?</div>",
        " ",
        source,
        flags=re.DOTALL | re.IGNORECASE,
    )
    source = re.sub(
        r"<figure\b[^>]*class=[\"'][^\"']*wordcloud-card[^\"']*[\"'][^>]*>.*?</figure>",
        " ",
        source,
        flags=re.DOTALL | re.IGNORECASE,
    )
    source = re.sub(r"https?://\S+", " ", source)
    source = re.sub(r"(?m)^\s*#(?!#)\s+.*$", " ", source)
    source = re.sub(r"<[^>]+>", " ", source)
    source = re.sub(r"\{:\s*[^}]+}", " ", source)
    source = re.sub(r"[#*_`|>[\](){}]", " ", source)
    return html.unescape(source)


def split_documents(source: str) -> list[str]:
    """Treat each H2 section as a document, excluding structured author metadata."""
    parts = re.split(r"(?m)^##\s+(.+?)\s*$", source)
    docs: list[str] = []
    preamble = visible_markdown(parts[0]).strip()
    if preamble:
        docs.append(preamble)

    academic_sections = {"国際学会", "国内学会", "シンポジウム"}
    for heading, body in zip(parts[1::2], parts[2::2]):
        if heading.strip() in academic_sections:
            # In publication sections, only the marked-up work titles describe the
            # portfolio owner. Author and venue lines are metadata and may contain
            # third-party names, so they never enter the tokenizer.
            titles = re.findall(
                r"<span\b[^>]*class=[\"'][^\"']*portfolio-item-title[^\"']*[\"'][^>]*>(.*?)</span>",
                body,
                flags=re.DOTALL | re.IGNORECASE,
            )
            document = visible_markdown(heading + "\n" + "\n".join(titles)).strip()
        else:
            document = visible_markdown(heading + "\n" + body).strip()
        if document:
            docs.append(document)

    return docs or [visible_markdown(source)]


def useful(term: str) -> bool:
    folded = term.casefold().strip(".+-")
    return (
        len(folded) >= 2
        and folded not in STOP_WORDS
        and folded != "込み"
        and not folded.isdigit()
        and not re.fullmatch(r"(?:19|20)\d{2}", folded)
        and not re.fullmatch(r"\d+(?:\.\d+)?%?", folded)
        and not re.search(r"\d$", folded)
    )


def japanese_terms(text: str, tokenizer: Tokenizer) -> list[str]:
    terms: list[str] = []

    # Whitespace (including removed HTML tags) is a hard compound boundary.
    for segment in re.split(r"\s+", text):
        compound: list[str] = []

        def flush() -> None:
            while compound and compound[0].casefold() in STOP_WORDS:
                compound.pop(0)
            while compound and compound[-1].casefold() in STOP_WORDS:
                compound.pop()
            if compound:
                value = "".join(compound)
                if useful(value):
                    terms.append(value)
            compound.clear()

        tokens = list(tokenizer.tokenize(segment))
        for index, token in enumerate(tokens):
            surface = token.surface.strip()
            pos = token.part_of_speech.split(",")
            is_japanese = bool(re.search(r"[ぁ-んァ-ヶ一-龠々]", surface))
            is_content_noun = pos[0] == "名詞" and pos[1] not in {"代名詞", "数", "非自立"}
            is_noun_prefix = pos[0] == "接頭詞" and pos[1] == "名詞接続"
            next_is_noun = (
                index + 1 < len(tokens)
                and tokens[index + 1].part_of_speech.split(",")[0] == "名詞"
            )
            is_compound_verb_stem = (
                pos[0] == "動詞" and token.infl_form == "連用形" and next_is_noun
            )
            is_person = "人名" in pos
            if is_japanese and (is_content_noun or is_noun_prefix or is_compound_verb_stem) and not is_person:
                compound.append(surface)
            else:
                flush()
        flush()
    return terms


def terms_for(text: str, tokenizer: Tokenizer) -> list[str]:
    terms = japanese_terms(text, tokenizer)
    for match in ASCII_WORD_RE.finditer(text):
        term = match.group(0).casefold().strip(".+-")
        if useful(term):
            terms.append(term)
    return terms


def tfidf_weights(documents: list[str]) -> dict[str, float]:
    tokenizer = Tokenizer()
    counts = [Counter(terms_for(document, tokenizer)) for document in documents]
    document_frequency = Counter(term for counter in counts for term in counter)
    number_of_documents = len(counts)
    scores: dict[str, float] = {}

    for counter in counts:
        for term, count in counter.items():
            # Sublinear TF keeps repeated CV metadata from overwhelming meaningful terms.
            tf = 1.0 + math.log(count)
            idf = math.log((1.0 + number_of_documents) / (1.0 + document_frequency[term])) + 1.0
            # A cloud needs one corpus-level weight per word. Taking the maximum
            # section score preserves IDF's suppression of broadly repeated words;
            # summing sections would partially undo that suppression.
            scores[term] = max(scores.get(term, 0.0), tf * idf)

    return dict(sorted(scores.items(), key=lambda item: (-item[1], item[0]))[:100])


def find_font(explicit_font: str | None) -> str:
    candidates = [
        explicit_font,
        os.environ.get("WORDCLOUD_FONT_PATH"),
        "/tmp/LINESeedJP-Bold.ttf",
        "/private/tmp/LINESeedJP-Bold.ttf",
        str(Path.home() / "Library/Fonts/LINESeedJP-Bold.ttf"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    raise FileNotFoundError(
        "LINE Seed JP Bold was not found. Pass it with --font or set WORDCLOUD_FONT_PATH."
    )


def color_for_word(word: str, **_: object) -> str:
    colors = ("#153e75", "#245ca6", "#4c51bf", "#6b46c1", "#087f8c", "#c05621")
    return colors[int(hashlib.sha256(word.encode()).hexdigest()[:8], 16) % len(colors)]


def generate(source_path: Path, output_path: Path, font_path: str | None) -> None:
    source = source_path.read_text(encoding="utf-8")
    weights = tfidf_weights(split_documents(source))
    if not weights:
        raise ValueError(f"No suitable words were extracted from {source_path}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    seed = int(hashlib.sha256(source.encode()).hexdigest()[:8], 16)
    cloud = WordCloud(
        width=1600,
        height=700,
        background_color=None,
        mode="RGBA",
        font_path=find_font(font_path),
        max_words=70,
        min_font_size=16,
        max_font_size=190,
        margin=8,
        prefer_horizontal=0.88,
        relative_scaling=0.45,
        random_state=seed,
        collocations=False,
    ).generate_from_frequencies(weights)
    cloud.recolor(color_func=color_for_word, random_state=seed)
    cloud.to_file(str(output_path))
    print(f"Generated {output_path.relative_to(ROOT)} from {len(weights)} weighted terms")
    print("Top terms: " + ", ".join(list(weights)[:12]))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--font", help="Path to a font containing Japanese glyphs")
    args = parser.parse_args()
    generate(args.source.resolve(), args.output.resolve(), args.font)


if __name__ == "__main__":
    main()
