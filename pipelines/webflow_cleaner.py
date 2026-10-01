"""
Webflow Interaction & Form Cleaner
Disables Webflow form submissions that fail offline and prevents Webflow JS runtime errors.
"""
import os
import re

def clean_webflow_artifacts(html_text):
    # Neutralize webflow forms so they don't break when clicked offline
    html_text = re.sub(r'<form([^>]*?)data-name=["\'][^"\']*["\']([^>]*?)>', r'<form\1\2 onsubmit="event.preventDefault(); alert(\'Demo Form: Offline Template Preview\'); return false;">', html_text, flags=re.IGNORECASE)
    # Strip Webflow CSRF tokens and internal IDs
    html_text = re.sub(r'data-wf-page=["\'][^"\']*["\']', '', html_text)
    html_text = re.sub(r'data-wf-site=["\'][^"\']*["\']', '', html_text)
    return html_text

def clean_webflow_directory(dest_dir):
    count = 0
    for root, _, files in os.walk(dest_dir):
        for f in files:
            if f.endswith('.html'):
                fp = os.path.join(root, f)
                with open(fp, 'r', encoding='utf-8', errors='ignore') as fl:
                    text = fl.read()
                new_text = clean_webflow_artifacts(text)
                if new_text != text:
                    with open(fp, 'w', encoding='utf-8') as fl:
                        fl.write(new_text)
                    count += 1
    print(f"[WEBFLOW CLEANER] Sanitized Webflow interactions in {count} HTML pages.")
    return count\n