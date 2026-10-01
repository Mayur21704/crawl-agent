"""
CSS Crawler & Resource Extractor
Downloads all external stylesheets, extracts @import rules,
finds background images, SVGs, and webfonts from url(...), downloads them and rewrites paths.
"""
import os
import re
import urllib.parse
from .common_utils import fetch_url, safe_download_file, sanitize_filename

CSS_URL_PATTERN = re.compile(r'url\(\s*["\']?([^"\'\)]+)["\']?\s*\)', re.IGNORECASE)
IMPORT_PATTERN = re.compile(r'@import\s+(?:url\()?\s*["\']?([^"\'\)\s;]+)["\']?\s*\)?;?', re.IGNORECASE)

def process_css_content(css_text, css_url, base_url, dest_dir):
    images_dir = os.path.join(dest_dir, 'images')
    fonts_dir = os.path.join(dest_dir, 'fonts')
    os.makedirs(images_dir, exist_ok=True)
    os.makedirs(fonts_dir, exist_ok=True)

    downloaded_assets = []

    def replace_resource(match):
        raw_res = match.group(1).strip()
        if raw_res.startswith(('data:', '#', 'chrome-extension:')):
            return match.group(0)

        abs_res_url = urllib.parse.urljoin(css_url, raw_res)
        filename = sanitize_filename(os.path.basename(urllib.parse.urlparse(abs_res_url).path))
        if not filename:
            filename = 'asset_' + str(abs(hash(abs_res_url)))[:8]

        ext = os.path.splitext(filename)[1].lower()
        if ext in ['.woff', '.woff2', '.ttf', '.eot', '.otf']:
            target_file = os.path.join(fonts_dir, filename)
            rel_path = f"../fonts/{filename}"
        else:
            target_file = os.path.join(images_dir, filename)
            rel_path = f"../images/{filename}"

        ok, _ = safe_download_file(abs_res_url, target_file)
        if ok:
            downloaded_assets.append((abs_res_url, target_file))

        return f'url("{rel_path}")'

    processed_css = CSS_URL_PATTERN.sub(replace_resource, css_text)

    for imp in IMPORT_PATTERN.findall(css_text):
        imp_url = imp.strip().strip("'\"")
        if not imp_url.startswith('data:'):
            abs_imp = urllib.parse.urljoin(css_url, imp_url)
            imp_name = sanitize_filename(os.path.basename(urllib.parse.urlparse(abs_imp).path))
            if not imp_name.endswith('.css'):
                imp_name += '.css'
            target_css = os.path.join(dest_dir, 'css', imp_name)
            sub_data, _ = fetch_url(abs_imp)
            if sub_data:
                sub_text = sub_data.decode('utf-8', errors='ignore')
                sub_processed, sub_assets = process_css_content(sub_text, abs_imp, base_url, dest_dir)
                with open(target_css, 'w', encoding='utf-8') as f:
                    f.write(sub_processed)
                downloaded_assets.extend(sub_assets)
                processed_css = processed_css.replace(imp, f"./{imp_name}")

    return processed_css, downloaded_assets

def crawl_stylesheets(html_text, page_url, base_url, dest_dir):
    css_dir = os.path.join(dest_dir, 'css')
    os.makedirs(css_dir, exist_ok=True)
    all_downloaded = []

    link_pattern = re.compile(r'<link\s+[^>]*?href=["\']([^"\']+)["\']', re.IGNORECASE)
    for href in link_pattern.findall(html_text):
        if '.css' not in href.lower() and 'stylesheet' not in html_text[max(0, html_text.find(href)-60):html_text.find(href)+len(href)+60].lower():
            continue
        abs_css_url = urllib.parse.urljoin(page_url, href)
        fname = sanitize_filename(os.path.basename(urllib.parse.urlparse(abs_css_url).path))
        if not fname or not fname.endswith('.css'):
            fname = f"style_{abs(hash(abs_css_url)) % 100000}.css"
        
        target_path = os.path.join(css_dir, fname)
        data, _ = fetch_url(abs_css_url)
        if data:
            try:
                css_text = data.decode('utf-8', errors='ignore')
                processed_css, assets = process_css_content(css_text, abs_css_url, base_url, dest_dir)
                with open(target_path, 'w', encoding='utf-8') as f:
                    f.write(processed_css)
                all_downloaded.append(target_path)
                all_downloaded.extend([a[1] for a in assets])
                print(f"[CSS CRAWLER] Saved & localized stylesheet: {fname} ({len(assets)} assets)")
            except Exception as e:
                print(f"[CSS CRAWLER] Error processing {abs_css_url}: {e}")

    return all_downloaded
