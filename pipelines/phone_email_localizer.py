"""
Contact Information Scanner & Localizer
Finds telephone numbers (tel: links, formatted numbers) and email addresses
for template adaptation and re-branding.
"""
import os
import re

PHONE_REGEX = re.compile(r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}')
EMAIL_REGEX = re.compile(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+')

def scan_contact_info(dest_dir):
    contacts = {'phones': set(), 'emails': set()}
    for root, _, files in os.walk(dest_dir):
        for f in files:
            if f.endswith('.html'):
                with open(os.path.join(root, f), 'r', encoding='utf-8', errors='ignore') as fl:
                    text = fl.read()
                # Find tel: links
                tels = re.findall(r'href=["\']tel:([^"\']+)["\']', text, re.IGNORECASE)
                contacts['phones'].update(tels)
                # Find mailto: links
                mailtos = re.findall(r'href=["\']mailto:([^"\']+)["\']', text, re.IGNORECASE)
                contacts['emails'].update(mailtos)

    print(f"[CONTACT SCANNER] Discovered {len(contacts['phones'])} phones and {len(contacts['emails'])} emails.")
    return contacts\n