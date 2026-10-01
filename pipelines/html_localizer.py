"""
HTML Localizer and Link Rewriter
Converts absolute internal URLs to depth-aware relative offline links (./about/index.html, etc.)
"""
import os
import re
import urllib.parse
from .common_utils import is_same_domain

def url_to_local_rel_path(url, base_url):
    parsed = urllib.parse.urlparse(url)
    path = parsed.path.strip('/')
    if not path or path == '':
        return 'index.html'
    if path.endswith('.html') or path.endswith('.htm'):
        return path
    return f"{path}/index.html"

def get_relative_prefix(depth):
    return '../' * depth if depth > 0 else './'

def localize_html_links(html_text, page_url, base_url, page_rel_path):
    parts = [p for p in page_rel_path.split('/') if p and p != 'index.html']
    depth = len(parts)
    prefix = get_relative_prefix(depth)

    def replace_a(match):
        full = match.group(0)
        href = match.group(1)
        if not href or href.startswith(('javascript:', 'mailto:', 'tel:', '#', 'data:')):
            return full
        abs_url = urllib.parse.urljoin(page_url, href)
        if is_same_domain(abs_url, base_url):
            target_rel = url_to_local_rel_path(abs_url, base_url)
            new_href = prefix + target_rel
            return full.replace(f'href="{href}"', f'href="{new_href}"').replace(f"href='{href}'", f"href='{new_href}'")
        return full

    a_pattern = re.compile(r'<a\s+[^>]*?href=["\']([^"\']+)["\'][^>]*>', re.IGNORECASE)
    localized = a_pattern.sub(replace_a, html_text)

    # Rewrite base tag
    localized = re.sub(r'<base\s+[^>]*?>', '', localized, flags=re.IGNORECASE)

    # Ensure UTF-8 meta
    if '<meta charset' not in localized.lower():
        localized = localized.replace('<head>', '<head>\n  <meta charset="utf-8">')

    return localized
