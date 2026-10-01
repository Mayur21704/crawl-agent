"""
Webfont Scraper & Localizer
Downloads custom webfonts (.woff2, .woff, .ttf, .otf, Google Fonts)
"""
import os
import re
import urllib.parse
from .common_utils import safe_download_file, sanitize_filename

def download_html_fonts(html_text, page_url, dest_dir):
    fonts_dir = os.path.join(dest_dir, 'fonts')
    os.makedirs(fonts_dir, exist_ok=True)
    downloaded = []

    font_pattern = re.compile(r'href=["\']([^"\']+\.(?:woff2|woff|ttf|otf))["\']', re.IGNORECASE)
    font_links = font_pattern.findall(html_text)
    for fl in set(font_links):
        abs_f = urllib.parse.urljoin(page_url, fl)
        fname = sanitize_filename(os.path.basename(urllib.parse.urlparse(abs_f).path))
        dest = os.path.join(fonts_dir, fname)
        ok, _ = safe_download_file(abs_f, dest)
        if ok:
            downloaded.append(dest)
            print(f"[FONT DOWNLOADER] Downloaded font: {fname}")

    return downloaded
