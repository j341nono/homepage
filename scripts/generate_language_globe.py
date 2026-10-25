#!/usr/bin/env python3
"""Export the homepage's TF-IDF terms as data for the Language Globe.

The globe reuses the word cloud's corpus and weighting (generate_wordcloud.py),
so both visualisations always show the same terms. This script only adds what
the globe needs on top of the weights:

- category / link: the Home section whose document gave the term its weight,
- related:         other globe terms that co-occur in the same item
                   (one publication title, one activity, ...),
- variants / concepts: multilingual expressions and nearby concepts from the
                   hand-curated scripts/language_globe_lexicon.yml.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import yaml
from janome.tokenizer import Tokenizer

# Run as a script (scripts/ on sys.path) or imported from tests as scripts.*.
try:
    from generate_wordcloud import (
        ACTIVITY_FIELDS,
        DEFAULT_SOURCE,
        ROOT,
        item_text,
        labeled_documents,
        load_home_data,
        terms_for,
        tfidf_scores,
    )
except ModuleNotFoundError:
    from scripts.generate_wordcloud import (
        ACTIVITY_FIELDS,
        DEFAULT_SOURCE,
        ROOT,
        item_text,
        labeled_documents,
        load_home_data,
        terms_for,
        tfidf_scores,
    )


DEFAULT_LEXICON = ROOT / "scripts" / "language_globe_lexicon.yml"
DEFAULT_PRODUCTS = ROOT / "_data" / "products.yml"
DEFAULT_OUTPUT = ROOT / "_data" / "language_globe.json"

# Home section label (see labeled_documents) -> globe category. Colours for
# these categories are defined in assets/js/language-globe.js.
SECTION_CATEGORIES = {
    "profile": "research",
    "keywords": "research",
    "publications": "research",
    "hackathons": "products",
    "events": "events",
    "internships": "internships",
    "achievements": "achievements",
}
# Anchors on the Home page (ids are set in _includes/home.html).
SECTION_ANCHORS = {
    "profile": "research",
    "keywords": "research",
    "publications": "publications",
}

MAX_RELATED = 4
MAX_VARIANTS = 5
MAX_CONCEPTS = 3


def item_documents(data: dict[str, Any]) -> list[str]:
    """Finer-grained documents than labeled_documents, used for co-occurrence."""
    profile = data.get("profile") or {}
    docs = [str(profile.get("bio") or "")]
    docs += [str(keyword) for keyword in profile.get("research_keywords") or []]
    docs += [
        str(item["title"])
        for group in (data.get("publications") or {}).get("groups") or []
        for item in group.get("items") or []
        if item.get("title")
    ]
    docs += [
        item_text(item, ACTIVITY_FIELDS)
        for section in data.get("activities") or []
        for item in section.get("items") or []
    ]
    return [doc for doc in docs if doc.strip()]


def related_terms(terms: dict[str, float], data: dict[str, Any]) -> dict[str, list[str]]:
    tokenizer = Tokenizer()
    pairs: dict[str, Counter[str]] = defaultdict(Counter)
    for doc in item_documents(data):
        present = {term for term in terms_for(doc, tokenizer) if term in terms}
        for term in present:
            pairs[term].update(present - {term})
    return {
        term: [
            other
            for other, _ in sorted(counter.items(), key=lambda item: (-item[1], -terms[item[0]], item[0]))
        ][:MAX_RELATED]
        for term, counter in pairs.items()
    }


def load_lexicon(path: Path) -> dict[str, dict[str, Any]]:
    if not path.is_file():
        return {}
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    # Terms are matched case-insensitively, as terms_for() folds ASCII words.
    return {str(term).casefold(): entry or {} for term, entry in raw.items()}


def product_links(path: Path) -> dict[str, int]:
    """Map lower-cased product titles to their 1-based card index (#product-N)."""
    if not path.is_file():
        return {}
    products = yaml.safe_load(path.read_text(encoding="utf-8")) or []
    return {str(product["title"]).casefold(): index for index, product in enumerate(products, 1) if product.get("title")}


def build(source: Path, lexicon_path: Path, products_path: Path) -> dict[str, Any]:
    data, _ = load_home_data(source)
    labeled = labeled_documents(data)
    scored = tfidf_scores([doc for _, doc in labeled])
    if not scored:
        raise ValueError(f"No suitable words were extracted from {source}")

    weights = {term: score for term, score, _ in scored}
    related = related_terms(weights, data)
    lexicon = load_lexicon(lexicon_path)
    products = product_links(products_path)
    high = scored[0][1]
    low = scored[-1][1]

    terms = []
    for term, score, doc_index in scored:
        section = labeled[doc_index][0]
        entry = lexicon.get(term.casefold(), {})
        category = entry.get("category") or SECTION_CATEGORIES.get(section, "misc")
        if term.casefold() in products:
            link = {"page": "products", "hash": f"product-{products[term.casefold()]}"}
            category = "products"
        else:
            link = {"page": "home", "hash": SECTION_ANCHORS.get(section, section)}
        terms.append({
            "term": term,
            "score": round(score, 4),
            # sqrt of the min-max normalised score: the tiers stay distinct
            # without the top terms dwarfing the rest of the globe.
            "scale": round(math.sqrt((score - low) / (high - low)) if high > low else 1.0, 4),
            "category": category,
            "section": section,
            "link": link,
            "variants": [
                {"lang": str(lang), "text": str(text)}
                for lang, texts in (entry.get("variants") or {}).items()
                for text in (texts if isinstance(texts, list) else [texts])
            ][:MAX_VARIANTS],
            "concepts": [str(concept) for concept in entry.get("concepts") or []][:MAX_CONCEPTS],
            "related": related.get(term, []),
        })

    return {
        "source": "_data/home/*.yml (TF-IDF, see scripts/generate_wordcloud.py)",
        "terms": terms,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE, help="Directory containing the Home YAML files")
    parser.add_argument("--lexicon", type=Path, default=DEFAULT_LEXICON)
    parser.add_argument("--products", type=Path, default=DEFAULT_PRODUCTS)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    globe = build(args.source.resolve(), args.lexicon.resolve(), args.products.resolve())
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(globe, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")

    missing = [term["term"] for term in globe["terms"] if not term["variants"] and not term["concepts"]]
    print(f"Generated {output} with {len(globe['terms'])} terms")
    if missing:
        print("Terms without lexicon entries: " + ", ".join(missing))


if __name__ == "__main__":
    main()
