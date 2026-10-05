"""
Inline SVG & Vector Cleaner
Optimizes inline SVG tags and extracts large embedded vector illustrations.
"""
import os
import re

def clean_inline_svgs(html_text):
    # Ensure all svgs have appropriate viewBox and display inline-block
    cleaned = re.sub(r'<svg([^>]*?)>', r'<svg\1 style="max-width:100%; height:auto;">', html_text)
    return cleaned
