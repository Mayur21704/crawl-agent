"""
Master Autonomous Deep Website Crawler
Orchestrates:
1. Multi-page discovery & sitemap parsing
2. HTML downloading & link rewriting (depth-aware relative offline links)
3. CSS download, @import recursion & url(...) font/image extraction
4. JavaScript bundles, vendor libraries & dynamic Webflow/webpack chunk extraction
5. Deep image scraping (all srcset resolutions, background-images, inline styles, SVGs)
6. Media & self-hosted video downloading
7. Badge stripping, tracker removal & offline CSS hardening
8. Asset auditing & auto-healing
9. Offline health verification & clone reporting

Emits live JSON progress updates to stdout for interactive dashboards.
"""
import os
import sys

_pipelines_dir = os.path.dirname(os.path.abspath(__file__))
if _pipelines_dir not in sys.path:
    sys.path.insert(0, _pipelines_dir)

import os
import sys
import json
import time
import argparse
import urllib.parse

try:
    from .common_utils import sanitize_filename, fetch_url
except (ImportError, ValueError):
    from common_utils import sanitize_filename, fetch_url
try:
    from .page_spider import crawl_site_pages
except (ImportError, ValueError):
    from page_spider import crawl_site_pages
try:
    from .html_localizer import localize_html_links, url_to_local_rel_path
except (ImportError, ValueError):
    from html_localizer import localize_html_links, url_to_local_rel_path
try:
    from .css_crawler import crawl_stylesheets
except (ImportError, ValueError):
    from css_crawler import crawl_stylesheets
try:
    from .js_crawler import crawl_scripts
except (ImportError, ValueError):
    from js_crawler import crawl_scripts
try:
    from .chunk_extractor import extract_dynamic_chunks
except (ImportError, ValueError):
    from chunk_extractor import extract_dynamic_chunks
try:
    from .image_scraper import extract_all_image_urls, download_images
except (ImportError, ValueError):
    from image_scraper import extract_all_image_urls, download_images
try:
    from .font_downloader import download_html_fonts
except (ImportError, ValueError):
    from font_downloader import download_html_fonts
try:
    from .media_downloader import download_media
except (ImportError, ValueError):
    from media_downloader import download_media
try:
    from .badge_stripper import strip_promos_and_trackers
except (ImportError, ValueError):
    from badge_stripper import strip_promos_and_trackers
try:
    from .unquote_cleaner import clean_unquoted_files
except (ImportError, ValueError):
    from unquote_cleaner import clean_unquoted_files
try:
    from .asset_auditor import audit_and_heal_assets
except (ImportError, ValueError):
    from asset_auditor import audit_and_heal_assets
try:
    from .verify_clone import verify_clone_health
except (ImportError, ValueError):
    from verify_clone import verify_clone_health
try:
    from .lazyload_normalizer import normalize_all_pages
except (ImportError, ValueError):
    from lazyload_normalizer import normalize_all_pages
try:
    from .webflow_cleaner import clean_webflow_directory
except (ImportError, ValueError):
    from webflow_cleaner import clean_webflow_directory

def emit_progress(percent, stage, pages=0, assets=0):
    progress_info = {
        'percent': percent,
        'stage': stage,
        'pages': pages,
        'assets': assets,
        'timestamp': time.time()
    }
    # Print machine-readable JSON line prefixed with [PROGRESS]
    print(f"[PROGRESS] {json.dumps(progress_info)}", flush=True)

def deep_crawl_website(base_url, output_dir, max_pages=35, aggressive=False):
    print(f"=== [MASTER CRAWLER] Starting deep clone for {base_url} ===")
    print(f"=== Target Output: {output_dir} ===")
    if aggressive:
        print("[AGGRESSIVE CRAWLER] Purging previous output for clean slate high-fidelity clone...")
        import shutil
        if os.path.exists(output_dir):
            try:
                shutil.rmtree(output_dir, ignore_errors=True)
            except Exception as e:
                print(f"[AGGRESSIVE CRAWLER] Warning on wipe: {e}")
    os.makedirs(output_dir, exist_ok=True)
    os.makedirs(os.path.join(output_dir, 'css'), exist_ok=True)
    os.makedirs(os.path.join(output_dir, 'js'), exist_ok=True)
    os.makedirs(os.path.join(output_dir, 'images'), exist_ok=True)
    os.makedirs(os.path.join(output_dir, 'fonts'), exist_ok=True)

    emit_progress(5, "Discovering pages and sitemaps...", 0, 0)

    # 1. Discover and crawl all pages
    pages = crawl_site_pages(base_url, max_pages=max_pages)
    if not pages:
        # Fallback: at least fetch homepage
        data, _ = fetch_url(base_url)
        if data:
            pages[base_url] = data

    page_count = len(pages)
    emit_progress(20, f"Discovered {page_count} pages. Processing stylesheets and scripts...", page_count, 0)

    total_assets_count = 0
    all_image_urls = set()

    # 2. Process CSS & JS from all pages
    for page_url, raw_bytes in pages.items():
        html_str = raw_bytes.decode('utf-8', errors='ignore')
        
        # Stylesheets
        css_downloaded = crawl_stylesheets(html_str, page_url, base_url, output_dir)
        total_assets_count += len(css_downloaded)

        # JavaScript
        js_downloaded = crawl_scripts(html_str, page_url, output_dir)
        total_assets_count += len(js_downloaded)

        # Fonts
        font_downloaded = download_html_fonts(html_str, page_url, output_dir)
        total_assets_count += len(font_downloaded)

        # Videos / Media
        media_downloaded = download_media(html_str, page_url, output_dir)
        total_assets_count += len(media_downloaded)

        # Image URLs collection
        imgs = extract_all_image_urls(html_str, page_url)
        all_image_urls.update(imgs)

    emit_progress(45, f"Extracting dynamic chunks and libraries...", page_count, total_assets_count)

    # 3. Dynamic chunks
    chunks = extract_dynamic_chunks(base_url, output_dir)
    total_assets_count += len(chunks)

    emit_progress(60, f"Downloading {len(all_image_urls)} images, responsive srcset & vectors...", page_count, total_assets_count)

    # 4. Download all images concurrently
    downloaded_imgs = download_images(all_image_urls, base_url, output_dir, max_workers=10)
    total_assets_count += len(downloaded_imgs)

    emit_progress(75, "Localizing HTML links and removing badges...", page_count, total_assets_count)

    # 5. Localize HTML pages & write to disk
    for page_url, raw_bytes in pages.items():
        html_str = raw_bytes.decode('utf-8', errors='ignore')
        rel_path = url_to_local_rel_path(page_url, base_url)
        dest_html_file = os.path.join(output_dir, rel_path.replace('/', os.sep))
        os.makedirs(os.path.dirname(dest_html_file), exist_ok=True)

        # Strip promo badges & SRI hashes
        cleaned_html = strip_promos_and_trackers(html_str)

        # Localize links
        localized_html = localize_html_links(cleaned_html, page_url, base_url, rel_path)

        with open(dest_html_file, 'w', encoding='utf-8') as f:
            f.write(localized_html)

    # 6. Unquote filenames on disk
    clean_unquoted_files(output_dir)

    emit_progress(90, "Auditing assets and healing any missing files...", page_count, total_assets_count)

    # 6.5 Normalize Lazyload & Webflow interactions
    try:
        normalize_all_pages(output_dir)
        clean_webflow_directory(output_dir)
    except Exception as e:
        print(f"[POSTPROCESS] Normalization notice: {e}")

    # 7. Audit & Auto-Heal
    healed = audit_and_heal_assets(base_url, output_dir, retries=5 if aggressive else 3, timeout=35 if aggressive else 20)
    if aggressive:
        # Second pass in aggressive mode to resolve nested dependencies in newly downloaded CSS
        healed += audit_and_heal_assets(base_url, output_dir, retries=5, timeout=35)
    total_assets_count += healed

    emit_progress(98, "Running final offline verification...", page_count, total_assets_count)

    # 8. Verification
    report = verify_clone_health(output_dir)

    emit_progress(100, "Crawl complete! Offline clone 100% verified.", page_count, report['total_assets'])

    print(f"=== [MASTER CRAWLER] Successfully completed clone of {base_url} ===")
    return report

def main():
    parser = argparse.ArgumentParser(description="Master Autonomous Deep Website Crawler")
    parser.add_argument("url", help="Target website URL to clone")
    parser.add_argument("output", help="Destination folder for offline package")
    parser.add_argument("--max-pages", type=int, default=35, help="Maximum internal pages to crawl (default: 35)")
    parser.add_argument("--aggressive", action="store_true", help="Aggressive high-fidelity crawl: deep auto-heal, lazyload normalization, clean slate")
    args = parser.parse_args()

    deep_crawl_website(args.url, args.output, max_pages=args.max_pages, aggressive=args.aggressive)

if __name__ == '__main__':
    main()
