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

def audit_and_heal_assets(base_url, dest_dir):
    print(f"[ASSET AUDITOR] Scanning {dest_dir} for missing assets...")
    missing_healed = 0

    ref_pattern = re.compile(r'(?:src|href)=["\']([^"\']+\.(?:jpg|jpeg|png|svg|webp|gif|css|js|woff2|woff|ttf))["\']', re.IGNORECASE)

    for root, _, files in os.walk(dest_dir):
        for f in files:
            if f.endswith('.html') or f.endswith('.htm'):
                html_path = os.path.join(root, f)
                with open(html_path, 'r', encoding='utf-8', errors='ignore') as hf:
                    html_content = hf.read()

                refs = ref_pattern.findall(html_content)
                for r in refs:
                    if r.startswith(('http://', 'https://')):
                        target_url = r
                    elif r.startswith('//'):
                        target_url = 'https:' + r
                    else:
                        target_url = urllib.parse.urljoin(base_url, r)

                    fname = sanitize_filename(os.path.basename(urllib.parse.urlparse(target_url).path))
                    ext = os.path.splitext(fname)[1].lower()
                    if ext in ['.css']:
                        check_path = os.path.join(dest_dir, 'css', fname)
                    elif ext in ['.js']:
                        check_path = os.path.join(dest_dir, 'js', fname)
                    elif ext in ['.woff', '.woff2', '.ttf']:
                        check_path = os.path.join(dest_dir, 'fonts', fname)
                    else:
                        check_path = os.path.join(dest_dir, 'images', fname)

                    if not os.path.exists(check_path) or os.path.getsize(check_path) == 0:
                        ok, _ = safe_download_file(target_url, check_path)
                        if ok:
                            missing_healed += 1
                            print(f"[ASSET AUDITOR] Auto-healed missing file: {fname}")

    print(f"[ASSET AUDITOR] Audit complete. Healed {missing_healed} missing assets.")
    return missing_healed
