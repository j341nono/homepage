from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.generate_language_globe import DEFAULT_LEXICON, DEFAULT_PRODUCTS, build
from scripts.generate_wordcloud import DEFAULT_SOURCE, load_home_data, split_documents, tfidf_weights


class LanguageGlobeTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.globe = build(DEFAULT_SOURCE, DEFAULT_LEXICON, DEFAULT_PRODUCTS)
        cls.data, _ = load_home_data(DEFAULT_SOURCE)

    def test_terms_match_the_word_cloud(self) -> None:
        weights = tfidf_weights(split_documents(self.data))

        self.assertEqual([term["term"] for term in self.globe["terms"]], list(weights))

    def test_links_point_to_existing_anchors(self) -> None:
        home_anchors = {"research", "publications"} | {
            section["id"] for section in self.data["activities"] if section.get("id")
        }
        for term in self.globe["terms"]:
            link = term["link"]
            if link["page"] == "home":
                self.assertIn(link["hash"], home_anchors, term["term"])
            else:
                self.assertRegex(link["hash"], r"^product-\d+$", term["term"])

    def test_related_terms_are_other_globe_terms(self) -> None:
        names = {term["term"] for term in self.globe["terms"]}
        for term in self.globe["terms"]:
            self.assertNotIn(term["term"], term["related"])
            self.assertTrue(set(term["related"]) <= names, term["term"])

    def test_scale_is_normalised(self) -> None:
        scales = [term["scale"] for term in self.globe["terms"]]

        self.assertEqual(max(scales), 1.0)
        self.assertEqual(min(scales), 0.0)

    def test_lexicon_lists_become_separate_variants(self) -> None:
        top = self.globe["terms"][0]["term"]
        with tempfile.TemporaryDirectory() as directory:
            lexicon = Path(directory) / "lexicon.yml"
            lexicon.write_text(f"{top}:\n  variants:\n    en: [first, second]\n    zh: 第三\n", encoding="utf-8")
            globe = build(DEFAULT_SOURCE, lexicon, DEFAULT_PRODUCTS)

        self.assertEqual(globe["terms"][0]["variants"], [
            {"lang": "en", "text": "first"},
            {"lang": "en", "text": "second"},
            {"lang": "zh", "text": "第三"},
        ])


if __name__ == "__main__":
    unittest.main()
