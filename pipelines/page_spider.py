"""
Recursive Multi-Page Crawler Spider
Crawls homepage and follows internal links to discover all pages (about, services, contact, etc.)
"""
import re
import urllib.parse
from .common_utils import fetch_url, is_same_domain
from .sitemap_parser import discover_sitemap_urls

def extract_internal_links(html_text, page_url, base_url):
    links = set()
    href_pattern = re.compile(r'<a\s+[^>]*?href=["\']([^"\'#]+)["\']', re.IGNORECASE)
    for href in href_pattern.findall(html_text):
        href = href.strip()
        if not href or href.startswith(('javascript:', 'mailto:', 'tel:', 'data:')):
            continue
        full_url = urllib.parse.urljoin(page_url, href)
        full_url = full_url.split('#')[0]
        if is_same_domain(full_url, base_url):
            path = urllib.parse.urlparse(full_url).path.lower()
            if not any(path.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.css', '.js', '.pdf', '.zip']):
                links.add(full_url)
    return links

def crawl_site_pages(base_url, max_pages=35):
    visited = set()
    to_visit = [base_url]
    page_data = {}

    sitemap_links = discover_sitemap_urls(base_url)
    for sm_link in sitemap_links:
        if sm_link not in to_visit and len(to_visit) < max_pages:
            to_visit.append(sm_link)

    print(f"[PAGE SPIDER] Starting crawl for: {base_url} (queue initial size: {len(to_visit)})")

    while to_visit and len(visited) < max_pages:
        current_url = to_visit.pop(0)
        clean_url = current_url.rstrip('/')
        if clean_url in visited:
            continue
        visited.add(clean_url)

        print(f"[PAGE SPIDER] ({len(visited)}/{max_pages}) Fetching: {current_url}")
        data, content_type = fetch_url(current_url, retries=2, timeout=15)
        if not data:
            continue
        
        if 'html' in content_type.lower() or data.startswith(b'<!DOCTYPE') or b'<html' in data[:500]:
            page_data[current_url] = data
            try:
                html_text = data.decode('utf-8', errors='ignore')
                new_links = extract_internal_links(html_text, current_url, base_url)
                for nl in new_links:
                    nl_clean = nl.rstrip('/')
                    if nl_clean not in visited and nl not in to_visit and len(visited) + len(to_visit) < max_pages * 2:
                        to_visit.append(nl)
            except Exception:
                pass

    print(f"[PAGE SPIDER] Finished. Discovered and downloaded {len(page_data)} pages.")
    return page_data
