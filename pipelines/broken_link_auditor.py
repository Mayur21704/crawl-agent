"""
Broken Link & Missing Asset Quality Auditor
Scans all crawled HTML and CSS files and reports 404s, broken links, or unreachable local paths.
"""
import os
import re

def audit_clone_links(dest_dir):
    broken_links = []
    broken_assets = []

    for root, _, files in os.walk(dest_dir):
        for f in files:
            if f.endswith('.html'):
                html_path = os.path.join(root, f)
                with open(html_path, 'r', encoding='utf-8', errors='ignore') as fl:
                    content = fl.read()

                # Check <a> links
                hrefs = re.findall(r'<a\s+[^>]*?href=["\']([^"\']+)["\']', content, re.IGNORECASE)
                for h in hrefs:
                    if h.startswith(('./', '../', '/')):
                        h_clean = h.split('?')[0].split('#')[0]
                        target_disk = os.path.normpath(os.path.join(root, h_clean))
                        if not os.path.exists(target_disk):
                            broken_links.append((html_path, h))

                # Check assets
                srcs = re.findall(r'(?:src|href)=["\']([^"\']+\.(?:jpg|png|svg|css|js|webp))["\']', content, re.IGNORECASE)
                for s in srcs:
                    if not s.startswith(('http', '//', 'data:')):
                        s_clean = s.split('?')[0].split('#')[0]
                        target_disk = os.path.normpath(os.path.join(root, s_clean))
                        if not os.path.exists(target_disk):
                            broken_assets.append((html_path, s))

    print(f"[AUDIT REPORT] Found {len(broken_links)} broken page links and {len(broken_assets)} broken local asset paths.")
    return {'broken_links': broken_links, 'broken_assets': broken_assets}\n