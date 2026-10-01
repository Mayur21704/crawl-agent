import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { stripSriAndCrossorigin, stripPromoBadges, rewritePathsToRelative, unquoteDiskFilenames } from './localizer.js';
import { updateCrawlStatus } from './db.js';

/**
 * Deep Network Intercepting Crawler
 * Launches headless Chromium, listens to all network responses,
 * downloads HTML, CSS, JS runtime chunks, fonts, responsive images, and videos.
 */
export async function crawlWebsite({ url, outputDir, crawlId }) {
  console.log(`\n[CRAWLER] Starting deep crawl for: ${url}`);
  console.log(`[CRAWLER] Target output directory: ${outputDir}`);

  // Create folder structure
  for (const sub of ['css', 'js', 'images', 'fonts', 'videos']) {
    fs.mkdirSync(path.join(outputDir, sub), { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();
  let assetCount = 0;
  const savedUrls = new Set();

  // Intercept all network responses to capture dynamic chunks, webp, avif, woff2, etc.
  page.on('response', async (response) => {
    const resUrl = response.url();
    const status = response.status();
    if (status !== 200 || savedUrls.has(resUrl) || resUrl.startsWith('data:')) return;

    try {
      const parsed = new URL(resUrl);
      const pathname = parsed.pathname;
      const filename = path.basename(pathname);
      if (!filename || filename === '/' || filename.includes('google-analytics') || filename.includes('googletagmanager')) return;

      const ext = path.extname(filename).toLowerCase();
      let targetFolder = null;

      if (['.css'].includes(ext)) targetFolder = 'css';
      else if (['.js', '.mjs'].includes(ext) || filename.includes('achunk') || filename.includes('chunk')) targetFolder = 'js';
      else if (['.woff', '.woff2', '.ttf', '.eot', '.otf'].includes(ext)) targetFolder = 'fonts';
      else if (['.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg', '.gif', '.ico'].includes(ext)) targetFolder = 'images';
      else if (['.mp4', '.webm', '.ogg'].includes(ext)) targetFolder = 'videos';

      if (targetFolder) {
        savedUrls.add(resUrl);
        const buffer = await response.body();
        const savePath = path.join(outputDir, targetFolder, filename);
        fs.writeFileSync(savePath, buffer);
        assetCount++;

        // If filename is encoded (%20), also save unquoted copy immediately
        const decoded = decodeURIComponent(filename);
        if (decoded !== filename) {
          fs.writeFileSync(path.join(outputDir, targetFolder, decoded), buffer);
        }
      }
    } catch (e) {
      // Ignore background streaming/abort errors
    }
  });

  try {
    // Navigate with generous timeout
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Smooth scroll down to bottom to trigger lazy-loaded images, Webflow IX2 animations, and autovideo
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 400;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            window.scrollTo(0, 0); // Scroll back to top
            resolve();
          }
        }, 150);
      });
    });

    // Wait a short moment for final network idle
    await page.waitForTimeout(3000);

    // Capture fully hydrated HTML
    let rawHtml = await page.content();

    // 1. Strip SRI integrity and crossorigin attributes (fixes CSS blocking)
    rawHtml = stripSriAndCrossorigin(rawHtml);

    // 2. Strip Webflow promo badges
    rawHtml = stripPromoBadges(rawHtml);

    // 3. Rewrite all paths to relative ./
    rawHtml = rewritePathsToRelative(rawHtml);

    // Save final clean index.html
    const indexPath = path.join(outputDir, 'index.html');
    fs.writeFileSync(indexPath, rawHtml, 'utf-8');
    console.log(`[CRAWLER] Saved clean index.html (${rawHtml.length} chars)`);

    // Ensure all unquoted filenames exist on disk
    unquoteDiskFilenames(outputDir);

    await browser.close();

    console.log(`[CRAWLER] Deep crawl complete for ${url}! Total assets saved: ${assetCount}`);
    if (crawlId) {
      updateCrawlStatus(crawlId, 'completed', assetCount);
    }
    return { success: true, assetCount, outputDir };
  } catch (err) {
    console.error(`[CRAWLER] Crawl failed for ${url}:`, err.message);
    await browser.close();
    if (crawlId) {
      updateCrawlStatus(crawlId, 'failed', assetCount, err.message);
    }
    return { success: false, error: err.message };
  }
}
