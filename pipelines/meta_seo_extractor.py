"""
Meta & SEO Metadata Extractor
Extracts title, meta description, OpenGraph tags, and JSON-LD schema into a structured JSON manifest.
"""
import os
import re
import json

def extract_page_seo(html_path):
    with open(html_path, 'r', encoding='utf-8', errors='ignore') as f:
        html = f.read()

    title_m = re.search(r'<title>([^<]+)</title>', html, re.IGNORECASE)
    desc_m = re.search(r'<meta\s+[^>]*?name=["\']description["\'][^>]*?content=["\']([^"\']+)["\']', html, re.IGNORECASE)
    og_title_m = re.search(r'<meta\s+[^>]*?property=["\']og:title["\'][^>]*?content=["\']([^"\']+)["\']', html, re.IGNORECASE)
    og_image_m = re.search(r'<meta\s+[^>]*?property=["\']og:image["\'][^>]*?content=["\']([^"\']+)["\']', html, re.IGNORECASE)

    return {
        'title': title_m.group(1).strip() if title_m else '',
        'description': desc_m.group(1).strip() if desc_m else '',
        'og_title': og_title_m.group(1).strip() if og_title_m else '',
        'og_image': og_image_m.group(1).strip() if og_image_m else ''
    }

def generate_seo_manifest(dest_dir):
    manifest = {}
    for root, _, files in os.walk(dest_dir):
        for f in files:
            if f.endswith('.html'):
                fp = os.path.join(root, f)
                rel = os.path.relpath(fp, dest_dir).replace('\\', '/')
                manifest[rel] = extract_page_seo(fp)

    out_file = os.path.join(dest_dir, 'site_meta.json')
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=2)
    print(f"[SEO EXTRACTOR] Saved SEO metadata manifest to {out_file}")
    return manifest\n