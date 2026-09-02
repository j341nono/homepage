# Homepage

## TF-IDF word cloud

The image at `assets/images/wordcloud/tfidf-wordcloud.png` is generated from the
content in `index.markdown`. Each H2 section is treated as a document, Japanese
nouns are extracted with Janome, and the terms are weighted with TF-IDF before
rendering. The maximum section-level TF-IDF is used as each word's final weight,
so summing sections does not undo IDF's suppression of broadly repeated terms.
In publication sections, only `.portfolio-item-title` text is used; author and
venue metadata never enters the tokenizer.

GitHub Actions regenerates and commits the image whenever the homepage source
or generator changes. To regenerate it locally:

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-wordcloud.txt
curl --fail --location \
  --output /tmp/LINESeedJP-Bold.ttf \
  https://raw.githubusercontent.com/google/fonts/main/ofl/lineseedjp/LINESeedJP-Bold.ttf
.venv/bin/python scripts/generate_wordcloud.py --font /tmp/LINESeedJP-Bold.ttf
```

The workflow downloads LINE Seed JP from the Google Fonts repository and uses
the same font as the homepage. You can also set `WORDCLOUD_FONT_PATH` instead of
passing `--font`. LINE Seed JP is distributed under the SIL Open Font License 1.1.
