"""
Webpack & Dynamic Runtime Chunks Extractor
Scans downloaded JS bundles for dynamic chunks, split code, and async workers
"""
import os
import re
import urllib.parse
from .common_utils import safe_download_file

CHUNK_PATTERNS = [
    re.compile(r'["\']([a-zA-Z0-9_\-\.\/]+(?:chunk|achunk|worker)[a-zA-Z0-9_\-\.]*\.js)["\']'),
    re.compile(r'["\'](webflow\.[a-zA-Z0-9_\-\.]+\.js)["\']'),
    re.compile(r'["\']([a-f0-9]{7,12}\.js)["\']')
]

def extract_dynamic_chunks(base_url, dest_dir):
    js_dir = os.path.join(dest_dir, 'js')
    if not os.path.exists(js_dir):
        return []

    found_chunks = set()
    for root, _, files in os.walk(js_dir):
        for f in files:
            if f.endswith('.js'):
                fp = os.path.join(root, f)
                try:
                    with open(fp, 'r', encoding='utf-8', errors='ignore') as jf:
                        code = jf.read()
                    for pat in CHUNK_PATTERNS:
                        for m in pat.findall(code):
                            if not m.startswith('http'):
                                m = urllib.parse.urljoin(base_url, m)
                            found_chunks.add(m)
                except Exception:
                    pass

    downloaded = []
    for chunk_url in found_chunks:
        fname = os.path.basename(urllib.parse.urlparse(chunk_url).path)
        if not fname or not fname.endswith('.js'):
            continue
        dest = os.path.join(js_dir, fname)
        ok, _ = safe_download_file(chunk_url, dest)
        if ok:
            downloaded.append(dest)
            print(f"[CHUNK EXTRACTOR] Downloaded dynamic chunk: {fname}")

    return downloaded
