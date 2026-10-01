"""
Filename & URL Encoded Cleaner
Decodes %20, %40, %2B in files on disk and aligns HTML/CSS references
"""
import os
import urllib.parse

def clean_unquoted_files(dest_dir):
    renamed_count = 0
    for root, dirs, files in os.walk(dest_dir):
        for f in files:
            if '%' in f:
                decoded = urllib.parse.unquote(f)
                if decoded != f:
                    old_path = os.path.join(root, f)
                    new_path = os.path.join(root, decoded)
                    if not os.path.exists(new_path):
                        try:
                            os.rename(old_path, new_path)
                            renamed_count += 1
                        except Exception:
                            pass
    return renamed_count
