from __future__ import annotations

import unittest

from scripts.generate_wordcloud import split_documents, tfidf_weights


class WordCloudCorpusTest(unittest.TestCase):
    def test_publication_sections_only_include_marked_titles(self) -> None:
        source = """
## Publications
### International Conferences
<ul><li>
<span class="portfolio-item-title">Distinctive Research Title</span><br>
<u>PRIVATE_AUTHOR_SENTINEL</u>, SECOND_AUTHOR_SENTINEL,
In Proceedings of a Conference.
</li></ul>
"""

        document = split_documents(source)[0]

        self.assertIn("Distinctive Research Title", document)
        self.assertNotIn("PRIVATE_AUTHOR_SENTINEL", document)
        self.assertNotIn("SECOND_AUTHOR_SENTINEL", document)
        self.assertNotIn("Proceedings", document)

    def test_legacy_academic_heading_still_excludes_author_metadata(self) -> None:
        source = """
## 国内学会
<span class="portfolio-item-title">固有な論文題目</span><br>
架空著者甲, 架空著者乙
"""

        document = split_documents(source)[0]

        self.assertIn("固有な論文題目", document)
        self.assertNotIn("架空著者", document)

    def test_idf_downweights_a_term_present_in_every_document(self) -> None:
        weights = tfidf_weights([
            "sharedterm rareterm",
            "sharedterm differentterm",
        ])

        self.assertGreater(weights["rareterm"], weights["sharedterm"])
        self.assertGreater(weights["differentterm"], weights["sharedterm"])


if __name__ == "__main__":
    unittest.main()
