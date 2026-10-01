"""
Self-hosted Media & Video Downloader
Finds <video>, <source>, <audio> files (.mp4, .webm, .mp3) and downloads them locally
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

def download_media(html_text, page_url, dest_dir):
    media_dir = os.path.join(dest_dir, 'media')
    downloaded = []

    media_pattern = re.compile(r'src=["\']([^"\']+\.(?:mp4|webm|ogv|mp3))["\']', re.IGNORECASE)
    media_links = media_pattern.findall(html_text)
    if media_links:
        os.makedirs(media_dir, exist_ok=True)
        for ml in set(media_links):
            abs_m = urllib.parse.urljoin(page_url, ml)
            fname = sanitize_filename(os.path.basename(urllib.parse.urlparse(abs_m).path))
            dest = os.path.join(media_dir, fname)
            ok, _ = safe_download_file(abs_m, dest, timeout=40)
            if ok:
                downloaded.append(dest)
                print(f"[MEDIA DOWNLOADER] Downloaded video/media: {fname}")

    return downloaded
