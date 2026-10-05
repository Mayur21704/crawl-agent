"""
Shopify CDN Asset Scraper
Identifies cdn.shopify.com stylesheets, product images, and theme scripts and localizes them.
"""
import os
import sys

_pipelines_dir = os.path.dirname(os.path.abspath(__file__))
if _pipelines_dir not in sys.path:
    sys.path.insert(0, _pipelines_dir)

import os
import re
import urllib.parse
try:
    from .common_utils import safe_download_file, sanitize_filename
except (ImportError, ValueError):
    from common_utils import safe_download_file, sanitize_filename

SHOPIFY_CDN_PATTERN = re.compile(r'https?://cdn\.shopify\.com/[a-zA-Z0-9_\-\.\/]+', re.IGNORECASE)

def scrape_shopify_assets(dest_dir):
    images_dir = os.path.join(dest_dir, 'images')
    os.makedirs(images_dir, exist_ok=True)
    found_urls = set()

    for root, _, files in os.walk(dest_dir):
        for f in files:
            if f.endswith(('.html', '.css', '.js')):
                with open(os.path.join(root, f), 'r', encoding='utf-8', errors='ignore') as fl:
                    found_urls.update(SHOPIFY_CDN_PATTERN.findall(fl.read()))

    downloaded = 0
    for u in found_urls:
        fname = sanitize_filename(os.path.basename(urllib.parse.urlparse(u).path))
        if fname:
            target = os.path.join(images_dir, fname)
            ok, _ = safe_download_file(u, target)
            if ok:
                downloaded += 1
    print(f"[SHOPIFY SCRAPER] Localized {downloaded} Shopify CDN files.")
    return downloaded
