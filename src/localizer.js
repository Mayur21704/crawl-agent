import fs from 'fs';
import path from 'path';

/**
 * Strips Subresource Integrity (SRI) and crossorigin attributes.
 * Prevents modern browsers from blocking localized/modified CSS and JS bundles.
 */
export function stripSriAndCrossorigin(html) {
  return html
    .replace(/\s+integrity=["'][^"']*["']/gi, '')
    .replace(/\s+crossorigin=["'][^"']*["']/gi, '');
}

/**
 * Strips Webflow promotion labels and "Buy Template" badges.
 */
export function stripPromoBadges(html) {
  return html
    .replace(/<div[^>]*class=["'][^"']*promotion-labels-wrapper[^"']*["'][^>]*>.*?<\/div>\s*<\/div>/gis, '')
    .replace(/<a[^>]*class=["'][^"']*w-webflow-badge[^"']*["'][^>]*>.*?<\/a>/gis, '');
}

/**
 * Ensures all asset links in HTML are strictly relative (./css/, ./js/, ./images/, ./fonts/)
 * so the output works 100% statically in any folder or iframe without server dependencies.
 */
export function rewritePathsToRelative(html) {
  let cleaned = html;
  cleaned = cleaned.replace(/href=["'](?:\.\/)?css\//g, 'href="./css/');
  cleaned = cleaned.replace(/src=["'](?:\.\/)?js\//g, 'src="./js/');
  cleaned = cleaned.replace(/src=["'](?:\.\/)?images\//g, 'src="./images/');
  cleaned = cleaned.replace(/href=["'](?:\.\/)?images\//g, 'href="./images/');
  cleaned = cleaned.replace(/href=["'](?:\.\/)?fonts\//g, 'href="./fonts/');
  cleaned = cleaned.replace(/src=["'](?:\.\/)?videos\//g, 'src="./videos/');

  // Fix srcset paths
  cleaned = cleaned.replace(/srcset=["']([^"']+)["']/g, (match, val) => {
    const fixed = val.replace(/(?:^|[\s,]+)(?:\.\/)?images\//g, (m) => m.replace('images/', './images/').replace('.//images/', './images/'));
    return `srcset="${fixed}"`;
  });

  return cleaned;
}

/**
 * Unquotes filenames on disk.
 * e.g., creates "file 1.webp" copy for "file%201.webp" and "@3x" for "%403x"
 * so web servers, Vite, and Apache never return 404s for unquoted asset requests.
 */
export function unquoteDiskFilenames(targetDir) {
  if (!fs.existsSync(targetDir)) return;

  function traverse(dir) {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        traverse(fullPath);
      } else {
        const decoded = decodeURIComponent(item.name);
        if (decoded !== item.name) {
          const newPath = path.join(dir, decoded);
          if (!fs.existsSync(newPath)) {
            try {
              fs.copyFileSync(fullPath, newPath);
            } catch (e) {
              // Ignore copy error if already exists
            }
          }
        }
      }
    }
  }

  traverse(targetDir);
}
