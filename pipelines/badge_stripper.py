"""
Badge, Floater & Tracker Stripper
Removes 'Made in Webflow' badges, Wix promotions, SRI integrity hashes, and blocking analytics
"""
import re

def strip_promos_and_trackers(html_text):
    cleaned = html_text

    # Remove Webflow badge
    cleaned = re.sub(r'<a\s+[^>]*?class=["\'][^"\']*w-webflow-badge[^"\']*["\'][^>]*>.*?</a>', '', cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r'<div\s+[^>]*?class=["\'][^"\']*w-webflow-badge[^"\']*["\'][^>]*>.*?</div>', '', cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r'<a[^>]*href=["\']https?://webflow\.com\?utm_campaign=[^"\']*["\'][^>]*>.*?</a>', '', cleaned, flags=re.DOTALL | re.IGNORECASE)

    # Strip SRI integrity hashes
    cleaned = re.sub(r'\s+integrity=["\'][^"\']+["\']', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'\s+crossorigin(?:=["\'][^"\']*["\'])?', '', cleaned, flags=re.IGNORECASE)

    # Strip tracking beacons
    cleaned = re.sub(r'<script[^>]*>(?:(?!</script>).)*?googletagmanager\.com.*?</script>', '', cleaned, flags=re.DOTALL | re.IGNORECASE)
    cleaned = re.sub(r'<script[^>]*>(?:(?!</script>).)*?google-analytics\.com.*?</script>', '', cleaned, flags=re.DOTALL | re.IGNORECASE)

    offline_fix = '''<style id="offline-cleaner-fix">
  .w-webflow-badge, .w-webflow-badge a, [class*="webflow-badge"] { display: none !important; opacity: 0 !important; pointer-events: none !important; }
</style>'''
    if '</head>' in cleaned:
        cleaned = cleaned.replace('</head>', f'{offline_fix}\n</head>')
    else:
        cleaned = offline_fix + cleaned

    return cleaned
