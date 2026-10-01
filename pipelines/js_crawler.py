"""
JavaScript Bundle & Vendor Library Crawler
Downloads all scripts (custom, framework, jQuery, GSAP, Webflow runtime, Lenis) into js/
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

def crawl_scripts(html_text, page_url, dest_dir):
    js_dir = os.path.join(dest_dir, 'js')
    os.makedirs(js_dir, exist_ok=True)
    downloaded = []

    script_pattern = re.compile(r'<script\s+[^>]*?src=["\']([^"\']+)["\']', re.IGNORECASE)
    srcs = script_pattern.findall(html_text)

    for src in set(srcs):
        if src.startswith(('data:', 'chrome-extension:')):
            continue
        if any(tracker in src.lower() for tracker in ['google-analytics', 'googletagmanager', 'connect.facebook', 'hotjar', 'clarity.ms']):
            continue

        abs_url = urllib.parse.urljoin(page_url, src)
        fname = sanitize_filename(os.path.basename(urllib.parse.urlparse(abs_url).path))
        if not fname or not fname.endswith('.js'):
            fname = f"script_{abs(hash(abs_url)) % 100000}.js"

        dest_file = os.path.join(js_dir, fname)
        ok, msg = safe_download_file(abs_url, dest_file)
        if ok:
            downloaded.append(dest_file)
            print(f"[JS CRAWLER] Downloaded script: {fname}")

    return downloaded
