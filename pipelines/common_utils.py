"""
Common Crawler Utilities: HTTP requests, SSL bypass, path sanitization, threading
"""
import os
import re
import ssl
import time
import urllib.request
import urllib.parse
import urllib.error

# SSL context for sites with mismatched or self-signed certs
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
}

def sanitize_filename(name):
    # Remove query string if any
    name = name.split('?')[0].split('#')[0]
    # Unquote URL encoding
    name = urllib.parse.unquote(name)
    # Replace invalid Windows filename characters
    name = re.sub(r'[<>:"/\\|?*]', '_', name)
    return name.strip(' ._')

def fetch_url(url, retries=3, timeout=20):
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, context=SSL_CTX, timeout=timeout) as resp:
                return resp.read(), resp.info().get('Content-Type', '')
        except Exception as e:
            if attempt == retries:
                return None, str(e)
            time.sleep(attempt * 0.7)
    return None, "Exceeded retries"

def safe_download_file(url, dest_path, retries=3, timeout=25):
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 0:
        return True, "Already cached"
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    data, info = fetch_url(url, retries=retries, timeout=timeout)
    if data:
        with open(dest_path, 'wb') as f:
            f.write(data)
        return True, f"Saved {len(data)} bytes"
    return False, info

def is_same_domain(url, base_url):
    net1 = urllib.parse.urlparse(url).netloc.lower()
    net2 = urllib.parse.urlparse(base_url).netloc.lower()
    return net1 == net2 or net1.endswith('.' + net2) or net2.endswith('.' + net1)
