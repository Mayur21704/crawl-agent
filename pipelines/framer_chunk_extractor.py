"""
Framer Sites Dynamic Chunk & Vector Extractor
Detects and downloads framerusercontent.com assets, dynamic motion chunks, and react bundles.
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

FRAMER_ASSET_PATTERN = re.compile(r'https?://[a-zA-Z0-9_\-\.]*framerusercontent\.com/[a-zA-Z0-9_\-\.\/]+', re.IGNORECASE)

def extract_framer_assets(dest_dir):
    js_dir = os.path.join(dest_dir, 'js')
    images_dir = os.path.join(dest_dir, 'images')
    os.makedirs(js_dir, exist_ok=True)
    os.makedirs(images_dir, exist_ok=True)

    found_urls = set()
    for root, _, files in os.walk(dest_dir):
        for f in files:
            if f.endswith(('.html', '.js', '.css')):
                fp = os.path.join(root, f)
                with open(fp, 'r', encoding='utf-8', errors='ignore') as fl:
                    found_urls.update(FRAMER_ASSET_PATTERN.findall(fl.read()))

    downloaded = 0
    for url in found_urls:
        fname = sanitize_filename(os.path.basename(urllib.parse.urlparse(url).path))
        if not fname:
            continue
        ext = os.path.splitext(fname)[1].lower()
        target = os.path.join(js_dir if ext in ['.js', '.mjs'] else images_dir, fname)
        ok, _ = safe_download_file(url, target)
        if ok:
            downloaded += 1
    print(f"[FRAMER EXTRACTOR] Downloaded {downloaded} Framer assets.")
    return downloaded
