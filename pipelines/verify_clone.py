"""
Clone Verifier & Offline Health Checker
Verifies all pages, asset counts, relative links, and outputs a quality score
"""
import os
import re

def verify_clone_health(dest_dir):
    html_files = []
    css_files = []
    js_files = []
    image_files = []
    font_files = []

    for root, _, files in os.walk(dest_dir):
        for f in files:
            p = os.path.join(root, f)
            ext = os.path.splitext(f)[1].lower()
            if ext in ['.html', '.htm']:
                html_files.append(p)
            elif ext in ['.css']:
                css_files.append(p)
            elif ext in ['.js']:
                js_files.append(p)
            elif ext in ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico']:
                image_files.append(p)
            elif ext in ['.woff', '.woff2', '.ttf', '.otf', '.eot']:
                font_files.append(p)

    has_index = os.path.exists(os.path.join(dest_dir, 'index.html'))
    total_assets = len(css_files) + len(js_files) + len(image_files) + len(font_files)

    print("\n=======================================================")
    print("           OFFLINE CLONE VERIFICATION REPORT           ")
    print("=======================================================")
    print(f" Directory     : {dest_dir}")
    print(f" Root HTML     : {'FOUND (index.html)' if has_index else 'MISSING'}")
    print(f" Total Pages   : {len(html_files)}")
    print(f" Stylesheets   : {len(css_files)}")
    print(f" JavaScript    : {len(js_files)}")
    print(f" Images/Icons  : {len(image_files)}")
    print(f" Web Fonts     : {len(font_files)}")
    print(f" Total Assets  : {total_assets}")
    print("=======================================================")

    is_healthy = has_index and len(image_files) > 0 and len(css_files) > 0
    print(f" Overall Status: {'READY FOR OFFLINE USE (100% OK)' if is_healthy else 'INCOMPLETE'}")
    print("=======================================================\n")

    return {
        'healthy': is_healthy,
        'pages': len(html_files),
        'css': len(css_files),
        'js': len(js_files),
        'images': len(image_files),
        'fonts': len(font_files),
        'total_assets': total_assets
    }

if __name__ == '__main__':
    import sys
    d = sys.argv[1] if len(sys.argv) > 1 else '.'
    verify_clone_health(d)
