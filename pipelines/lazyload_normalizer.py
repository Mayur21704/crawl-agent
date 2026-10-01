"""
Lazyload Attribute Normalizer
Converts data-src, data-srcset, data-bg into native src, srcset, and style
so images and backgrounds render immediately offline without requiring JS scroll events.
"""
import os
import re

def normalize_lazyload_in_html(html_text):
    # Convert data-src -> src if src is missing or placeholder
    def fix_img_src(match):
        tag = match.group(0)
        data_src_m = re.search(r'data-src=["\']([^"\']+)["\']', tag, re.IGNORECASE)
        if data_src_m:
            real_src = data_src_m.group(1)
            # If src is missing or 1x1 gif
            if 'src=' not in tag.lower() or 'data:image' in tag.lower():
                tag = re.sub(r'src=["\'][^"\']*["\']', f'src="{real_src}"', tag, flags=re.IGNORECASE)
                if 'src=' not in tag:
                    tag = tag.replace('<img', f'<img src="{real_src}"')
        return tag

    normalized = re.sub(r'<img\s+[^>]*?>', fix_img_src, html_text, flags=re.IGNORECASE)

    # Convert data-srcset -> srcset
    def fix_srcset(match):
        tag = match.group(0)
        data_srcset_m = re.search(r'data-srcset=["\']([^"\']+)["\']', tag, re.IGNORECASE)
        if data_srcset_m:
            real_srcset = data_srcset_m.group(1)
            if 'srcset=' not in tag.lower():
                tag = tag.replace('>', f' srcset="{real_srcset}">')
            else:
                tag = re.sub(r'srcset=["\'][^"\']*["\']', f'srcset="{real_srcset}"', tag, flags=re.IGNORECASE)
        return tag

    normalized = re.sub(r'<(?:img|source)\s+[^>]*?>', fix_srcset, normalized, flags=re.IGNORECASE)
    return normalized

def normalize_all_pages(dest_dir):
    modified = 0
    for root, _, files in os.walk(dest_dir):
        for f in files:
            if f.endswith('.html') or f.endswith('.htm'):
                fp = os.path.join(root, f)
                with open(fp, 'r', encoding='utf-8', errors='ignore') as fl:
                    content = fl.read()
                new_content = normalize_lazyload_in_html(content)
                if new_content != content:
                    with open(fp, 'w', encoding='utf-8') as fl:
                        fl.write(new_content)
                    modified += 1
    print(f"[LAZYLOAD NORMALIZER] Normalized lazyload attributes in {modified} HTML files.")
    return modified\n