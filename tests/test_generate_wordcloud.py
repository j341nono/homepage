from __future__ import annotations

import unittest

from scripts.generate_wordcloud import split_documents, tfidf_weights


class WordCloudCorpusTest(unittest.TestCase):
    def test_publication_sections_only_include_marked_titles(self) -> None:
        source = """
## 国際学会
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

    def test_idf_downweights_a_term_present_in_every_document(self) -> None:
        weights = tfidf_weights([
            "sharedterm rareterm",
            "sharedterm differentterm",
        ])

        self.assertGreater(weights["rareterm"], weights["sharedterm"])
        self.assertGreater(weights["differentterm"], weights["sharedterm"])


if __name__ == "__main__":
    unittest.main()
