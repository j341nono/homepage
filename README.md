# Homepage

## Languages

Japanese pages are served at `/` and `/products/`; English pages at `/en/` and
`/en/products/` (all relative to the configured `baseurl`). The header switches
between the corresponding pages without JavaScript. Navigation stays in the
selected language.

Both languages use `_includes/home.html` and `_includes/products.html`.
When updating content, update both sets of data:

| Content | Japanese | English |
| --- | --- | --- |
| Profile, publications, activities | `_data/home/*.yml` | `_data/en/home/*.yml` |
| Products | `_data/products.yml` | `_data/en/products.yml` |
| Interface labels | `_data/locales.yml` → `ja` | `_data/locales.yml` → `en` |

Images and external links are shared. The Language Globe and the word cloud use
the Japanese source data in both languages. English translations of Japanese publication titles are
provided for readability; the linked papers remain in their original language.
Product periods begin with the four-digit year to support the year summary.

New translated page pairs need matching `translation_key` values and their own
`lang`, `locale`, and permalink in front matter. To verify both versions locally:

```sh
./scripts/build_cosmos.sh # Requires Go 1.25+; run again after changing cosmos/.
bundle exec jekyll serve
# Open http://localhost:4000/homepage/ and http://localhost:4000/homepage/en/
```

## Collapsible Home sections

Home sections start expanded. Their heading buttons hide or show each section
independently, using `_includes/section-heading.html` and `assets/js/site.js`.
Labels are translated in `_data/locales.yml`. Without JavaScript, all content
stays visible and the buttons stay hidden. Hash links and Language Globe links
reopen their destination section. Expansion state resets on page load.

Conference attendance is stored separately in the Tech Events section's
`attendance` list in both activity data files. Standard and Cosmos pages display
it in a native disclosure that starts closed, including without JavaScript.

## OSS contributions

Both homepages render `_includes/oss.html` from the shared `_data/oss.yml`.
The section follows Hackathons & Contests and uses the existing portfolio list
styles. Projects appear in data order without contribution categories.
Japanese and English summaries and item titles live together in this file.
Interface labels are under `oss` in `_data/locales.yml`.

Add contributions to `items` with `type: issue` or `type: pr`, `number`,
`status: open`, `merged`, or `closed`, and translated `title` values. Keep the
original GitHub title in `github_title` for link tooltips. Counts and GitHub
links are derived from these items; projects with multiple items use a
disclosure list for their issues and PRs. Repository links use the shared
`portfolio-links.html` include and each project’s `links` data.
The Pages workflow refreshes stars, statuses, original GitHub titles, merge
timestamps, and check dates before **every** production build. It runs on pushes
to `main`, manually, and at 03:17 UTC (12:17 JST) on odd-numbered days: usually
48 hours apart, with a 24-hour gap from the 31st (or February 29th) to the
next month's 1st.
The updated YAML exists only in the runner; no OSS update commits are created.
API or validation failures stop deployment and preserve the published site.
The browser receives static HTML and makes no GitHub API calls.

Translated summaries/titles, project order, links, and custom fields stay
hand-edited. Write summaries without changing state claims; the existing
localized badges show current status. New contributions still need manual
registration. Tracked metadata is a fallback for offline local builds; dates
remain internal and are not displayed on the site.

Setup requires **Settings → Pages → Build and deployment → Source → GitHub
Actions**, replacing the previous `main` branch publishing mode. Then run
**Actions → Deploy Pages with fresh OSS metadata → Run workflow → main**.
See [OSS maintenance and deployment](docs/oss-contributions.md) for tests,
failure handling, and contribution registration.

## Cosmos page

`/cosmos/` and `/en/cosmos/` (the header's **Cosmos** tab) show the Home and
Products data as a journey through space. A fixed WebGL2 canvas sits behind the
page, and the scroll position drives the camera along a path:

1. **Big Bang** – the hero is a singularity. Scrolling sets it off, and the
   particles swirl into a spiral galaxy while the cosmic-time HUD advances.
2. **Star systems** – every section is a star system in that galaxy. While a
   section's panel is on screen, the camera orbits its star; the gaps between
   panels are flights to the next system. Each item marked `data-cosmos-body` is
   a planet (nested `items` are its moons); hovering or focusing an item lights
   up its planet and orbit.
3. **Flight log** – the footer rises above the galaxy and traces the route.

| Part | File |
| --- | --- |
| Markup | `_includes/cosmos.html`, `cosmos-heading.html`, `cosmos-items.html` |
| Layout | `_layouts/cosmos.html` |
| Simulation (Go, compiled to WebAssembly) | `cosmos/scene.go`, `camera.go`, `particles.go`, `math.go` |
| Browser bridge (Go → JavaScript) | `cosmos/main_js.go` |
| Rendering (WebGL2 and GLSL) and DOM events | `assets/js/cosmos.js` |
| Styles | `_sass/portfolio/_cosmos.scss` |
| Labels and cosmic epochs | `_data/locales.yml` → `cosmos` |

Star types per section live in `systemStyles` in `cosmos/config.json`; a section with an
unknown `id` gets a star from `fallbackStars`, so new activity sections work
without code changes. The scene renders in HDR with bloom, lowers its resolution
on slow devices, and pauses while the tab is hidden. With
`prefers-reduced-motion`, the camera cuts between still shots instead of flying.
Without WebGL2 or if Wasm fails to load, the page shows a CSS starfield and all content stays readable.
The old `/ascii/` URLs redirect to the Cosmos pages.

Go generates the systems, seeded particle distributions, orbital positions,
camera paths and orbit/route geometry. JavaScript measures the page, forwards
input and submits WebGL draws; GPU shaders remain GLSL. Static geometry crosses
the Wasm boundary once as packed Float32 buffers, and body positions cross once
per frame as a packed Float64 buffer. No Go server is needed on GitHub Pages.

Build and verify the simulation before serving or building Jekyll:

```sh
(cd cosmos && go test ./...)
./scripts/build_cosmos.sh
node tests/test_cosmos_wasm.cjs
bundle exec jekyll build
```

The build script generates `assets/wasm/cosmos.wasm` and copies the matching
compiler's `wasm_exec.js`; both are ignored by Git. Pages CI tests and builds
them before Jekyll. Deploy the generated Wasm and support script together to
avoid runtime/compiler mismatches. The standard Go runtime adds about 3.1 MiB
before compression. Go sources and reference fixtures are excluded from the site.

`cosmos/testdata/javascript.json` contains reference results captured from
`assets/js/cosmos.js` at commit `78fe3ea`, covering all star styles, Unicode IDs,
moons, the planet limit, cameras and samples across particle buffers. Go tests
check numerical parity. The Node integration tests execute the actual Wasm,
exercise the renderer against DOM/WebGL stubs, and check reduced motion and
load failures; they do not validate GPU output or visual appearance.

## Language Globe

The top of the Home page shows the **Language Globe**: a rotatable sphere made of
the TF-IDF terms described below. Size reflects each term's weight and colour the
Home section it was weighted in. Hovering (or tapping) a term pushes nearby words
aside, floats multilingual expressions and related concepts around it, and draws
lines to the terms it co-occurs with. Clicking (or tapping again) jumps to the
section the term came from. Clicking or tapping an empty spot sends a ripple
across the globe that warps the words it passes.

| Part | File |
| --- | --- |
| Data generator | `scripts/generate_language_globe.py` → `_data/language_globe.json` |
| Multilingual expressions / concepts (hand-curated) | `scripts/language_globe_lexicon.yml` |
| Markup and inline data | `_includes/home.html` |
| Rendering (Canvas 2D, no dependencies) | `assets/js/language-globe.js` |
| Styles | `_sass/portfolio/_home.scss` |

The generator reuses `generate_wordcloud.py`'s corpus and weighting, so the globe
always shows the same terms as the word cloud; it does not pick words itself.
On top of the weights it records, for each term, the section that gave it its
weight (used for the category colour and the link; activity sections need an
`id:` in `_data/*/home/activities.yml`), other globe terms that appear in the same
item, and entries from the lexicon. Terms that match a product title link to that
product's card instead. Adding a lexicon entry only enriches the hover effect —
it never adds a word to the globe. The generator prints the terms that have no
entry yet.

The globe respects `prefers-reduced-motion` (no auto-rotation, inertia, ripples,
or spread animation), stops drawing while off-screen, and can be operated from the keyboard
(Tab to the globe, ←/→ to choose a term, Enter to jump). Without JavaScript the
word cloud image is shown instead; if Canvas is unavailable, the term list is.

```sh
.venv/bin/python scripts/generate_language_globe.py
```

## TF-IDF word cloud

The image at `assets/images/wordcloud/tfidf-wordcloud.png` is generated from the
Home page's data in `_data/home/` (`profile.yml`, `publications.yml`,
`activities.yml`). Each section is treated as a document, Japanese nouns are
extracted with Janome, and the terms are weighted with TF-IDF before rendering.
The maximum section-level TF-IDF is used as each word's final weight, so summing
sections does not undo IDF's suppression of broadly repeated terms. From
publications, only titles are used; author and venue metadata never enters the
tokenizer. Profile facts marked `private: true` are excluded as well.

GitHub Actions regenerates and commits the image and `_data/language_globe.json`
whenever the Home data, the products, the lexicon, or a generator changes. To regenerate it locally:

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
