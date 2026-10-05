"""
Asset Auditor & Auto-Healer
Reads all crawled HTML & CSS files, tests every asset reference against disk,
and auto-downloads any missing files directly from origin.
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

def audit_and_heal_assets(base_url, dest_dir, retries=4, timeout=30):
    print(f"[ASSET AUDITOR] Scanning {dest_dir} for missing assets (base: {base_url})...")
    missing_healed = 0

    attr_pattern = re.compile(r'(?:src|href|data-src)=[\"\']([^\"\']+)[\"\']', re.IGNORECASE)
    url_func_pattern = re.compile(r'url\(\s*[\"\']?([^\"\'\)]+)[\"\']?\s*\)', re.IGNORECASE)

    for root, _, files in os.walk(dest_dir):
        for f in files:
            ext = os.path.splitext(f)[1].lower()
            if ext not in ['.html', '.htm', '.css']:
                continue

            file_path = os.path.join(root, f)
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as fl:
                content = fl.read()

            raw_refs = set(attr_pattern.findall(content))
            for u in url_func_pattern.findall(content):
                raw_refs.add(u.strip('\'"'))

            for r in raw_refs:
                r_clean = r.strip()
                if not r_clean or r_clean.startswith(('data:', 'javascript:', 'mailto:', 'tel:', '#', 'blob:')):
                    continue

                parsed = urllib.parse.urlparse(r_clean)
                clean_path = parsed.path
                fname = sanitize_filename(os.path.basename(clean_path))
                if not fname:
                    continue

                f_ext = os.path.splitext(fname)[1].lower()
                if f_ext not in ['.css', '.js', '.woff', '.woff2', '.ttf', '.eot', '.otf',
                                '.jpg', '.jpeg', '.png', '.svg', '.webp', '.gif', '.ico', '.avif', '.mp4']:
                    continue

                if f_ext in ['.css']:
                    target_disk_path = os.path.join(dest_dir, 'css', fname)
                elif f_ext in ['.js']:
                    target_disk_path = os.path.join(dest_dir, 'js', fname)
                elif f_ext in ['.woff', '.woff2', '.ttf', '.eot', '.otf']:
                    target_disk_path = os.path.join(dest_dir, 'fonts', fname)
                else:
                    target_disk_path = os.path.join(dest_dir, 'images', fname)

                if not os.path.exists(target_disk_path) or os.path.getsize(target_disk_path) == 0:
                    if r_clean.startswith(('http://', 'https://')):
                        download_url = r_clean
                    elif r_clean.startswith('//'):
                        download_url = 'https:' + r_clean
                    elif r_clean.startswith(('../', './', '/')):
                        download_url = urllib.parse.urljoin(base_url, clean_path)
                    else:
                        download_url = urllib.parse.urljoin(base_url, r_clean)

                    ok, msg = safe_download_file(download_url, target_disk_path, retries=retries, timeout=timeout)
                    if ok:
                        missing_healed += 1
                        print(f"[ASSET AUDITOR] Auto-healed: {fname} from {download_url}")

    print(f"[ASSET AUDITOR] Audit complete. Healed {missing_healed} missing assets.")
    return missing_healed
