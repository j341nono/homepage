from __future__ import annotations

import unittest

from scripts.generate_wordcloud import ROOT, load_home_data, split_documents, tfidf_weights


class WordCloudCorpusTest(unittest.TestCase):
    def test_publications_only_include_titles(self) -> None:
        data = {
            "publications": {
                "groups": [{
                    "title": "国際会議",
                    "items": [{
                        "title": "Distinctive Research Title",
                        "authors": ["PRIVATE_AUTHOR_SENTINEL", "SECOND_AUTHOR_SENTINEL"],
                        "venue": "In Proceedings of a Conference.",
                    }],
                }],
            },
        }

        corpus = "\n".join(split_documents(data))

        self.assertIn("Distinctive Research Title", corpus)
        self.assertNotIn("PRIVATE_AUTHOR_SENTINEL", corpus)
        self.assertNotIn("SECOND_AUTHOR_SENTINEL", corpus)
        self.assertNotIn("Proceedings", corpus)

    def test_private_profile_facts_are_excluded(self) -> None:
        data = {
            "profile": {
                "facts": [
                    {"label": "所属", "value": "公開される所属"},
                    {"label": "Email", "value": "SECRET_MAIL_SENTINEL", "private": True},
                ],
            },
        }

        corpus = "\n".join(split_documents(data))

        self.assertIn("公開される所属", corpus)
        self.assertNotIn("SECRET_MAIL_SENTINEL", corpus)

    def test_each_activity_section_is_a_document(self) -> None:
        data = {
            "activities": [
                {"title": "ハッカソン", "items": [{"title": "作品甲", "description": "説明甲"}]},
                {"title": "インターン", "items": [{"title": "会社乙", "role": "Researcher"}]},
            ],
        }

        docs = split_documents(data)

        self.assertTrue(any("説明甲" in doc and "会社乙" not in doc for doc in docs))
        self.assertTrue(any("Researcher" in doc for doc in docs))

    def test_real_home_data_does_not_leak_coauthors(self) -> None:
        data, _ = load_home_data(ROOT / "_data" / "home")
        corpus = "\n".join(split_documents(data))
        coauthors = {
            author
            for group in data["publications"]["groups"]
            for item in group["items"]
            for author in item.get("authors", [])
            if author not in data["profile"]["author_names"]
        }

        self.assertTrue(coauthors)
        for author in coauthors:
            self.assertNotIn(author, corpus)

    def test_idf_downweights_a_term_present_in_every_document(self) -> None:
        weights = tfidf_weights([
            "sharedterm rareterm",
            "sharedterm differentterm",
        ])

        self.assertGreater(weights["rareterm"], weights["sharedterm"])
        self.assertGreater(weights["differentterm"], weights["sharedterm"])


if __name__ == "__main__":
    unittest.main()
