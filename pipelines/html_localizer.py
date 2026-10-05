"""
HTML Localizer and Link Rewriter
Converts absolute internal URLs, stylesheets, scripts, images, and fonts
into 100% self-contained relative offline paths (./css/..., ./js/..., ./images/..., ./fonts/...)
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
    from .common_utils import is_same_domain, sanitize_filename
except (ImportError, ValueError):
    from common_utils import is_same_domain, sanitize_filename

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

def clean_asset_filename(raw_url, default_ext='.jpg'):
    parsed = urllib.parse.urlparse(raw_url)
    clean_path = parsed.path.split('?')[0].split('#')[0]
    base = os.path.basename(clean_path)
    fname = sanitize_filename(base)
    if not fname:
        fname = f"asset_{abs(hash(raw_url)) % 100000}{default_ext}"
    return fname

def localize_html_links(html_text, page_url, base_url, page_rel_path):
    parts = [p for p in page_rel_path.split('/') if p and p != 'index.html']
    depth = len(parts)
    prefix = get_relative_prefix(depth)

    # 1. Localize internal hyperlinks <a href="...">
    def replace_a(match):
        full = match.group(0)
        href = match.group(1).strip()
        if not href or href.startswith(('javascript:', 'mailto:', 'tel:', '#', 'data:')):
            return full
        abs_url = urllib.parse.urljoin(page_url, href)
        if is_same_domain(abs_url, base_url):
            target_rel = url_to_local_rel_path(abs_url, base_url)
            new_href = prefix + target_rel
            return full.replace('href="' + href + '"', 'href="' + new_href + '"').replace("href='" + href + "'", "href='" + new_href + "'")
        return full

    a_pattern = re.compile(r'<a\s+[^>]*?href=["\']([^"\']+)["\'][^>]*>', re.IGNORECASE)
    localized = a_pattern.sub(replace_a, html_text)

    # 2. Localize stylesheets <link rel="stylesheet" href="..."> and icons
    def replace_link(match):
        full = match.group(0)
        href = match.group(1).strip()
        if not href or href.startswith(('data:', 'javascript:')):
            return full
        lower_full = full.lower()
        if 'stylesheet' in lower_full or '.css' in href.lower():
            abs_css = urllib.parse.urljoin(page_url, href)
            fname = clean_asset_filename(abs_css, default_ext='.css')
            if not fname.endswith('.css'):
                fname += '.css'
            new_href = f"{prefix}css/{fname}"
            cleaned_tag = re.sub(r'\s+(?:integrity|crossorigin)=["\'][^"\']*["\']', '', full, flags=re.IGNORECASE)
            return cleaned_tag.replace('href="' + href + '"', 'href="' + new_href + '"').replace("href='" + href + "'", "href='" + new_href + "'")
        elif any(ic in lower_full for ic in ['icon', 'apple-touch-icon', 'shortcut icon']):
            abs_ic = urllib.parse.urljoin(page_url, href)
            fname = clean_asset_filename(abs_ic, default_ext='.png')
            new_href = f"{prefix}images/{fname}"
            return full.replace('href="' + href + '"', 'href="' + new_href + '"').replace("href='" + href + "'", "href='" + new_href + "'")
        return full

    link_pattern = re.compile(r'<link\s+[^>]*?href=["\']([^"\']+)["\'][^>]*>', re.IGNORECASE)
    localized = link_pattern.sub(replace_link, localized)

    # 3. Localize scripts <script src="...">
    def replace_script(match):
        full = match.group(0)
        src = match.group(1).strip()
        if not src or src.startswith(('data:', 'chrome-extension:')):
            return full
        if any(tr in src.lower() for tr in ['google-analytics', 'googletagmanager', 'connect.facebook', 'hotjar', 'clarity.ms', 'doubleclick']):
            return '<!-- tracker removed -->'
        abs_js = urllib.parse.urljoin(page_url, src)
        fname = clean_asset_filename(abs_js, default_ext='.js')
        if not fname.endswith('.js'):
            fname += '.js'
        new_src = f"{prefix}js/{fname}"
        cleaned_tag = re.sub(r'\s+(?:integrity|crossorigin)=["\'][^"\']*["\']', '', full, flags=re.IGNORECASE)
        return cleaned_tag.replace('src="' + src + '"', 'src="' + new_src + '"').replace("src='" + src + "'", "src='" + new_src + "'")

    script_pattern = re.compile(r'<script\s+[^>]*?src=["\']([^"\']+)["\'][^>]*>', re.IGNORECASE)
    localized = script_pattern.sub(replace_script, localized)

    # 4. Localize images & sources: src, data-src, srcset
    def map_img_url(url_val):
        if not url_val or url_val.startswith(('data:', 'javascript:', 'blob:')):
            return url_val
        abs_img = urllib.parse.urljoin(page_url, url_val)
        fname = clean_asset_filename(abs_img, default_ext='.jpg')
        return f"{prefix}images/{fname}"

    def replace_img_tag(match):
        full = match.group(0)
        data_src_m = re.search(r'(?:data-src|data-original|data-lazy-src)=["\']([^"\']+)["\']', full, re.IGNORECASE)
        src_m = re.search(r'\bsrc=["\']([^"\']+)["\']', full, re.IGNORECASE)

        target_img_url = None
        if data_src_m and ('data:image' in (src_m.group(1) if src_m else '') or not src_m):
            target_img_url = data_src_m.group(1)
        elif src_m:
            target_img_url = src_m.group(1)

        if target_img_url:
            new_src = map_img_url(target_img_url)
            if src_m:
                full = full.replace(src_m.group(0), f'src="{new_src}"')
            else:
                full = full.replace('<img', f'<img src="{new_src}"')

        def rewrite_srcset(ss):
            items = []
            for entry in ss.split(','):
                tokens = entry.strip().split()
                if tokens:
                    mapped = map_img_url(tokens[0])
                    desc = (' ' + tokens[1]) if len(tokens) > 1 else ''
                    items.append(f"{mapped}{desc}")
            return ', '.join(items)

        srcset_m = re.search(r'(?:data-)?srcset=["\']([^"\']+)["\']', full, re.IGNORECASE)
        if srcset_m:
            new_ss = rewrite_srcset(srcset_m.group(1))
            full = full.replace(srcset_m.group(0), f'srcset="{new_ss}"')

        return full

    img_pattern = re.compile(r'<(?:img|source)\s+[^>]*?>', re.IGNORECASE)
    localized = img_pattern.sub(replace_img_tag, localized)

    # 5. Localize inline style background images: style="... url(...) ..."
    def replace_inline_bg(match):
        full = match.group(0)
        def fix_url(m):
            raw_url = m.group(1).strip('\'"')
            if raw_url.startswith(('data:', '#')):
                return m.group(0)
            mapped = map_img_url(raw_url)
            return f'url("{mapped}")'
        return re.sub(r'url\(\s*["\']?([^"\'\)]+)["\']?\s*\)', fix_url, full, flags=re.IGNORECASE)

    localized = re.sub(r'style=["\'][^"\']*url\([^"\']*["\']', replace_inline_bg, localized, flags=re.IGNORECASE)

    # 6. Remove <base> tag to prevent breaking offline relative paths
    localized = re.sub(r'<base\s+[^>]*?>', '', localized, flags=re.IGNORECASE)

    # 7. Ensure UTF-8 charset
    if '<meta charset' not in localized.lower():
        localized = localized.replace('<head>', '<head>\n  <meta charset="utf-8">')

    return localized
