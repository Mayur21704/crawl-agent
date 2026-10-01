# Autonomous Website Crawler Pipelines Suite

This directory contains the modular Python deep crawler pipelines designed for 100% offline, self-contained website cloning with zero broken assets.

## Pipeline Modules

1. **`master_crawler.py`**: Master orchestrator that executes the full deep crawl workflow and emits JSON progress for the UI dashboard.
2. **`sitemap_parser.py`**: Discovers pages via `robots.txt`, `sitemap.xml`, and nested XML sitemaps.
3. **`page_spider.py`**: Multi-page recursive crawler spider that discovers all subpages (`/about`, `/services`, `/contact`, `/pricing`, `/gallery`, `/faq`).
4. **`html_localizer.py`**: Rewrites root-relative links to depth-aware local relative paths (`./about/index.html`, `../contact/index.html`).
5. **`css_crawler.py`**: Downloads stylesheets, recursively extracts `@import` rules, downloads `url(...)` webfonts and background images, and rewrites CSS to `./fonts/` and `./images/`.
6. **`js_crawler.py`**: Downloads external JavaScript bundles and vendor libraries (jQuery, Webflow runtime, GSAP, Lenis).
7. **`chunk_extractor.py`**: Discovers and downloads dynamic webpack runtime chunks and async workers.
8. **`image_scraper.py`**: Deeply extracts all images: `src`, `data-src`, full `srcset` responsive variant arrays, inline styles, SVGs, and favicons.
9. **`font_downloader.py`**: Downloads `@font-face` webfonts (`.woff2`, `.woff`, `.ttf`, Google Fonts).
10. **`media_downloader.py`**: Downloads self-hosted videos (`.mp4`, `.webm`) and audio files.
11. **`badge_stripper.py`**: Strips Webflow promo badges, SRI integrity hashes, and blocking analytics beacons.
12. **`unquote_cleaner.py`**: Decodes percent-encoded filenames and cleans up Windows filesystem paths.
13. **`asset_auditor.py`**: Scans all crawled HTML & CSS files, tests references against disk, and auto-heals any missing assets from origin.
14. **`verify_clone.py`**: Runs health verification on the offline clone and outputs a detailed score.
15. **`common_utils.py`**: Core HTTP fetching, SSL handling, thread pooling, and path utilities.

## How to Run via CLI

```bash
python -m pipelines.master_crawler <TARGET_URL> <OUTPUT_DIRECTORY> [--max-pages 35]
```

Example:
```bash
python -m pipelines.master_crawler https://wonderkin.michael-aust.com/ output/tattoo-studio/website-1
```

## Adding New .py Scripts

Whenever you encounter new frameworks or specialized requirements (e.g. `shopify_asset_scraper.py`, `framer_chunk_extractor.py`, `strapi_api_mock.py`), simply drop the new `.py` module in this `pipelines/` folder and import it into `master_crawler.py`.
