"""
Sitemap and robots.txt discovery parser
Discovers all available URLs from robots.txt, sitemap.xml, and sub-sitemaps
"""
import re
import urllib.parse
import xml.etree.ElementTree as ET
from .common_utils import fetch_url, is_same_domain

def discover_sitemap_urls(base_url):
    discovered_urls = set()
    parsed_base = urllib.parse.urlparse(base_url)
    origin = f"{parsed_base.scheme}://{parsed_base.netloc}"

    # 1. Check robots.txt
    robots_url = urllib.parse.urljoin(origin, '/robots.txt')
    data, _ = fetch_url(robots_url, retries=2, timeout=10)
    sitemap_targets = set()
    if data:
        try:
            text = data.decode('utf-8', errors='ignore')
            for line in text.splitlines():
                if line.lower().startswith('sitemap:'):
                    sm = line.split(':', 1)[1].strip()
                    sitemap_targets.add(sm)
        except Exception:
            pass

    # Default common sitemap locations
    sitemap_targets.add(urllib.parse.urljoin(origin, '/sitemap.xml'))
    sitemap_targets.add(urllib.parse.urljoin(origin, '/sitemap_index.xml'))

    # 2. Parse XML sitemaps
    for sm_url in sitemap_targets:
        sm_data, _ = fetch_url(sm_url, retries=2, timeout=12)
        if not sm_data:
            continue
        try:
            root = ET.fromstring(sm_data)
            # Find all <loc> elements regardless of namespace
            for elem in root.iter():
                if elem.tag.endswith('loc') and elem.text:
                    loc = elem.text.strip()
                    if loc.endswith('.xml'):
                        # Nested sitemap
                        nested_data, _ = fetch_url(loc, retries=2, timeout=10)
                        if nested_data:
                            try:
                                nested_root = ET.fromstring(nested_data)
                                for n_elem in nested_root.iter():
                                    if n_elem.tag.endswith('loc') and n_elem.text:
                                        discovered_urls.add(n_elem.text.strip())
                            except Exception:
                                pass
                    else:
                        if is_same_domain(loc, base_url):
                            discovered_urls.add(loc)
        except Exception:
            # Fallback regex if XML parser fails
            try:
                text = sm_data.decode('utf-8', errors='ignore')
                locs = re.findall(r'<loc>([^<]+)</loc>', text)
                for loc in locs:
                    if is_same_domain(loc, base_url) and not loc.endswith('.xml'):
                        discovered_urls.add(loc.strip())
            except Exception:
                pass

    return sorted(list(discovered_urls))

if __name__ == '__main__':
    import sys
    url = sys.argv[1] if len(sys.argv) > 1 else 'https://wonderkin.michael-aust.com/'
    urls = discover_sitemap_urls(url)
    print(f"Found {len(urls)} URLs in sitemaps:")
    for u in urls[:10]:
        print(" -", u)
