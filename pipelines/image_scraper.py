"""
Deep Image & Media Asset Scraper
Extracts:
- img src & data-src
- srcset & data-srcset (all responsive resolutions 500w, 800w, 1080w, 2000w, 2x)
- <picture><source srcset="...">
- Inline background-image url(...)
- SVG <image href="...">
- Favicons, touch icons, manifest icons
"""
import os
import sys

_pipelines_dir = os.path.dirname(os.path.abspath(__file__))
if _pipelines_dir not in sys.path:
    sys.path.insert(0, _pipelines_dir)

import os
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
try:
    from .common_utils import safe_download_file, sanitize_filename
except (ImportError, ValueError):
    from common_utils import safe_download_file, sanitize_filename

def extract_all_image_urls(html_text, page_url):
    urls = set()

    src_patterns = [
        re.compile(r'(?:src|data-src|data-lazy-src|data-original)=["\']([^"\']+)["\']', re.IGNORECASE),
        re.compile(r'data-bg=["\']([^"\']+)["\']', re.IGNORECASE),
        re.compile(r'data-background=["\']([^"\']+)["\']', re.IGNORECASE),
    ]
    for pat in src_patterns:
        for match in pat.findall(html_text):
            m = match.strip()
            if m and not m.startswith(('data:', 'javascript:')):
                urls.add(urllib.parse.urljoin(page_url, m))

    srcset_pattern = re.compile(r'(?:srcset|data-srcset)=["\']([^"\']+)["\']', re.IGNORECASE)
    for match in srcset_pattern.findall(html_text):
        entries = match.split(',')
        for entry in entries:
            parts = entry.strip().split()
            if parts:
                u = parts[0].strip()
                if u and not u.startswith('data:'):
                    urls.add(urllib.parse.urljoin(page_url, u))

    bg_matches = re.findall(r'url\(\s*["\']?([^"\'\)]+)["\']?\s*\)', html_text, re.IGNORECASE)
    for bg in bg_matches:
        b = bg.strip()
        if b and not b.startswith('data:'):
            if any(b.lower().endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif']):
                urls.add(urllib.parse.urljoin(page_url, b))

    icon_matches = re.findall(r'<link\s+[^>]*?href=["\']([^"\']+)["\']', html_text, re.IGNORECASE)
    for icon in icon_matches:
        if any(icon.lower().endswith(ext) for ext in ['.ico', '.png', '.svg']):
            urls.add(urllib.parse.urljoin(page_url, icon.strip()))

    return urls

def download_images(urls, page_url, dest_dir, max_workers=8):
    images_dir = os.path.join(dest_dir, 'images')
    os.makedirs(images_dir, exist_ok=True)
    downloaded = []

    def task(img_url):
        parsed = urllib.parse.urlparse(img_url)
        path = parsed.path
        fname = sanitize_filename(os.path.basename(path))
        if not fname:
            fname = f"img_{abs(hash(img_url)) % 100000}.jpg"

        subpath_match = re.search(r'/(?:images|img|assets|upload|static)/(.*)', path, re.IGNORECASE)
        if subpath_match:
            sub = subpath_match.group(1).lstrip('/')
            sub_parts = [sanitize_filename(p) for p in sub.split('/') if p]
            nested_dest = os.path.join(images_dir, *sub_parts)
        else:
            nested_dest = os.path.join(images_dir, fname)

        flat_dest = os.path.join(images_dir, fname)

        ok, msg = safe_download_file(img_url, nested_dest)
        if ok:
            if nested_dest != flat_dest and not os.path.exists(flat_dest):
                try:
                    import shutil
                    shutil.copy2(nested_dest, flat_dest)
                except Exception:
                    pass
            return img_url, nested_dest, True
        return img_url, None, False

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(task, u): u for u in urls}
        for future in as_completed(futures):
            u, dest, ok = future.result()
            if ok:
                downloaded.append(dest)

    print(f"[IMAGE SCRAPER] Successfully downloaded {len(downloaded)}/{len(urls)} image files.")
    return downloaded
