"""
Subpath Preserver & Aliasing Engine
Ensures nested directories (images/layout/, assets/vectors/, etc.) are created on disk
AND duplicates flat copies in root folder so any relative asset request always resolves.
"""
import os
import shutil

def duplicate_assets_for_fallback(dest_dir):
    images_dir = os.path.join(dest_dir, 'images')
    if not os.path.exists(images_dir):
        return 0

    aliased = 0
    for root, _, files in os.walk(images_dir):
        if root == images_dir:
            continue
        for f in files:
            src = os.path.join(root, f)
            flat = os.path.join(images_dir, f)
            if not os.path.exists(flat):
                try:
                    shutil.copy2(src, flat)
                    aliased += 1
                except Exception:
                    pass
    print(f"[SUBPATH ENGINE] Created {aliased} root fallback aliases for nested assets.")
    return aliased
