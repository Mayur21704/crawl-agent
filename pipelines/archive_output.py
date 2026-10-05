"""
Output Directory Tarball Packager
Compresses output/ into output.tar.gz inside /home/ubuntu (or project root).
If an existing output.tar.gz already exists, it deletes the previous one before creating the new archive.
"""
import os
import sys
import subprocess
import tarfile

_pipelines_dir = os.path.dirname(os.path.abspath(__file__))
if _pipelines_dir not in sys.path:
    sys.path.insert(0, _pipelines_dir)

PROJECT_ROOT = os.path.abspath(os.path.join(_pipelines_dir, '..'))
OUTPUT_DIR = os.path.join(PROJECT_ROOT, 'output')

def create_output_archive(custom_dest=None):
    if not os.path.exists(OUTPUT_DIR):
        print(f"[ARCHIVE] Output directory does not exist yet: {OUTPUT_DIR}")
        return False, None, 0

    # Determine destination path
    if custom_dest:
        tar_path = custom_dest
    elif os.path.exists('/home/ubuntu') and os.path.isdir('/home/ubuntu'):
        tar_path = '/home/ubuntu/output.tar.gz'
    else:
        tar_path = os.path.join(PROJECT_ROOT, 'output.tar.gz')

    # 1. Delete previous archive if it exists
    if os.path.exists(tar_path):
        try:
            os.remove(tar_path)
            print(f"[ARCHIVE] Deleted previous archive: {tar_path}")
        except Exception as e:
            print(f"[ARCHIVE] Warning: Could not remove old archive: {e}")

    print(f"[ARCHIVE] Packaging {OUTPUT_DIR} -> {tar_path}...")

    # 2. Try native Linux tar command: tar -czvf <tar_path> output/
    created = False
    if sys.platform.startswith('linux'):
        try:
            cmd = ['tar', '-czvf', tar_path, 'output/']
            proc = subprocess.run(cmd, cwd=PROJECT_ROOT, capture_output=True, text=True, timeout=180)
            if proc.returncode == 0 and os.path.exists(tar_path):
                created = True
                print(f"[ARCHIVE] Native tar command completed successfully.")
            else:
                print(f"[ARCHIVE] Native tar stderr: {proc.stderr}")
        except Exception as e:
            print(f"[ARCHIVE] Native tar error: {e}")

    # Fallback to Python tarfile module (universal across all platforms)
    if not created:
        try:
            with tarfile.open(tar_path, "w:gz") as tar:
                tar.add(OUTPUT_DIR, arcname="output")
            created = os.path.exists(tar_path)
        except Exception as e:
            print(f"[ARCHIVE] Python tarfile error: {e}")
            return False, None, 0

    if created and os.path.exists(tar_path):
        size_bytes = os.path.getsize(tar_path)
        size_mb = round(size_bytes / (1024 * 1024), 2)
        print(f"[ARCHIVE] [OK] Successfully created {tar_path} ({size_mb} MB)")
        return True, tar_path, size_mb
    else:
        print(f"[ARCHIVE] [FAIL] Failed to create {tar_path}")
        return False, None, 0

if __name__ == '__main__':
    dest = sys.argv[1] if len(sys.argv) > 1 else None
    ok, path, mb = create_output_archive(dest)
    if ok:
        sys.exit(0)
    else:
        sys.exit(1)
