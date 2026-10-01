import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
import { evaluateWebsite } from './ai.js';
import { getIndustries, saveCandidates, updateIndustryStatus } from './db.js';
import { sendScoutReport } from './mailer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCREENSHOTS_DIR = path.resolve(__dirname, '../public/screenshots');

// Curated pool of verified, live, high-aesthetic award-grade candidates per industry
export const VERIFIED_CANDIDATE_POOL = {
  'tattoo-studio': [
    { url: 'https://wonderkin.michael-aust.com/', title: 'Wonderkin Tattoo Studio' },
    { url: 'https://hype-tattoo.com/', title: 'Hype Tattoo Studio' }
  ],
  therapist: [
    { url: 'https://maximatherapy.com/', title: 'Maxima Therapy' },
    { url: 'https://twofoldny.com/', title: 'Twofold Therapy' }
  ],
  electrician: [
    { url: 'https://spark-electric.webflow.io', title: 'Spark Electric Architectural Lighting & Commercial Contractor' },
    { url: 'https://volt-template.webflow.io', title: 'Volt Master Electrician & Commercial Electrical Services' },
    { url: 'https://element-electrical.webflow.io', title: 'Element Master Electrical Contractor Services' }
  ],
  hvac: [
    { url: 'https://rls-appliances-repair-hvac.webflow.io', title: 'RLS Precision Climate Engineering & HVAC' },
    { url: 'https://coverd.webflow.io', title: 'Coverd Smart Climate & Home Systems' },
    { url: 'https://sc4-technology.webflow.io', title: 'SC4 Advanced Air & Thermal Tech' },
    { url: 'https://hapihapi.webflow.io', title: 'Hapi Living Clean Air & Comfort' }
  ],
  'home-services': [
    { url: 'https://builderx-template.webflow.io', title: 'BuilderX Luxury Renovations & Architecture' },
    { url: 'https://demure-template.webflow.io', title: 'Demure Modern Residential Contracting' },
    { url: 'https://artista-deco.webflow.io', title: 'Artista Deco Luxury Interior & Home Design' },
    { url: 'https://roomflowtemplate.webflow.io', title: 'RoomFlow Architectural Remodeling' }
  ],
  'concrete-paving': [
    { url: 'https://www.hardscape.co.uk', title: 'Hardscape Architectural Stone & Paving Systems' },
    { url: 'https://unilock.com', title: 'Unilock Premium Hardscaping & Concrete Pavers' },
    { url: 'https://belgard.com', title: 'Belgard Commercial & Residential Architectural Paving' },
    { url: 'https://pavingexpert.com', title: 'PavingExpert Master Stone & Surface Engineering' }
  ],
  dentist: [
    { url: 'https://lumina-dental.webflow.io', title: 'Lumina Aesthetic Dentistry Studio' },
    { url: 'https://grandstreetdental.com', title: 'Grand Street Dental Studio & Aesthetics' },
    { url: 'https://zen.dental', title: 'Zen Dental Modern Orthodontics' }
  ]
};

const ERROR_SIGNATURES = [
  '404 not found',
  'page not found',
  '502 bad gateway',
  '504 gateway time-out',
  '500 internal server error',
  'nginx',
  'webflow - 404',
  'the page you are looking for does not exist',
  'oops! this page does not exist',
  'domain is for sale',
  'parking page',
  'this site can’t be reached',
  'this site cant be reached',
  'server error',
  'site not configured',
  'under maintenance'
];

/**
 * Validates whether a website is live, accessible, and not an error/404/nginx page.
 */
export async function validateAndInspectWebsite(page, candidateUrl) {
  try {
    const response = await page.goto(candidateUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 18000
    });

    if (!response) {
      return { valid: false, reason: 'No response received' };
    }

    const status = response.status();
    if (status >= 400) {
      return { valid: false, reason: `HTTP error status ${status}` };
    }

    // Wait a brief moment for dynamic client rendering
    await page.waitForTimeout(1500);

    const title = (await page.title()) || '';
    const bodyText = await page.evaluate(() => document.body ? document.body.innerText.toLowerCase() : '');

    // Check for error keywords
    for (const signature of ERROR_SIGNATURES) {
      if (title.toLowerCase().includes(signature) || (bodyText.length < 1500 && bodyText.includes(signature))) {
        return { valid: false, reason: `Contains dead/error signature: "${signature}"` };
      }
    }

    // Ensure site has substantial visual/text content (not an empty white page)
    if (bodyText.length < 120) {
      return { valid: false, reason: 'Insufficient page content (empty or parked)' };
    }

    return { valid: true, status, title: title.trim() };
  } catch (err) {
    return { valid: false, reason: `Navigation failure: ${err.message}` };
  }
}

export async function runScout() {
  console.log('\n======================================================');
  console.log('       STARTING RESILIENT AUTONOMOUS SCOUT AGENT      ');
  console.log('======================================================\n');

  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const industries = getIndustries();
  console.log(`[SCOUT] Target Industries: ${industries.length}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 }
  });

  for (const ind of industries) {
    console.log(`\n------------------------------------------------------`);
    console.log(`[SCOUT] Scouting industry: ${ind.name.toUpperCase()} (${ind.id})...`);
    console.log(`------------------------------------------------------`);

    // Build prioritized candidate exploration queue
    const queue = [];

    // Step 1: Query DuckDuckGo for live candidates
    try {
      const searchQuery = `site:webflow.io ${ind.query || ind.name} award modern template`;
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });

      const links = await page.$$eval('a.result__url', els => els.map(e => e.getAttribute('href') || e.innerText));
      for (let l of links) {
        if (!l.startsWith('http')) l = 'https://' + l.trim();
        if (l.includes('duckduckgo.com/l/?uddg=')) {
          const matched = l.match(/uddg=([^&]+)/);
          if (matched) l = decodeURIComponent(matched[1]);
        }
        if (l.startsWith('http') && !l.includes('duckduckgo') && !queue.includes(l)) {
          queue.push({ url: l, title: ind.name, source: 'search' });
        }
      }
    } catch (e) {
      console.warn(`[SCOUT] Search query timed out or throttled, prioritizing verified pool.`);
    }

    // Step 2: Append curated verified candidates
    if (VERIFIED_CANDIDATE_POOL[ind.id]) {
      for (const item of VERIFIED_CANDIDATE_POOL[ind.id]) {
        if (!queue.some(q => q.url === item.url)) {
          queue.push({ ...item, source: 'curated' });
        }
      }
    }

    console.log(`[SCOUT] Exploration pool contains ${queue.length} potential candidates.`);

    const verifiedCandidates = [];

    // Explore queue until 2 genuinely live, healthy websites are found
    for (const cand of queue) {
      if (verifiedCandidates.length >= 2) break;

      console.log(`[SCOUT-EXPLORE] Testing site: ${cand.url}`);
      const health = await validateAndInspectWebsite(page, cand.url);

      if (!health.valid) {
        console.log(`[SCOUT-EXPLORE] ⚠️ SKIPPED broken/dead site: ${cand.url} (${health.reason}). Exploring next...`);
        continue;
      }

      console.log(`[SCOUT-EXPLORE] ✅ Verified healthy! Title: "${health.title}"`);
      const rank = verifiedCandidates.length + 1;
      const screenshotFilename = `${ind.id}_${rank}.jpg`;
      const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotFilename);

      let screenshotBase64 = null;
      try {
        const buffer = await page.screenshot({ quality: 80, type: 'jpeg' });
        fs.writeFileSync(screenshotPath, buffer);
        screenshotBase64 = buffer.toString('base64');
      } catch (err) {
        console.warn(`[SCOUT] Screenshot warning: ${err.message}`);
      }

      // Evaluate visual quality with AI
      const aiEval = await evaluateWebsite({
        url: cand.url,
        title: health.title || cand.title,
        screenshotBase64,
        industry: ind.name
      });

      console.log(`[SCOUT-EVAL] Candidate #${rank} Score: ${aiEval.score}/10 | Approved: ${aiEval.approved}`);

      verifiedCandidates.push({
        url: cand.url,
        rank,
        title: health.title || cand.title,
        screenshotPath: `/screenshots/${screenshotFilename}`,
        score: aiEval.score,
        notes: aiEval.notes,
        approved: aiEval.approved ? 1 : 0
      });
    }

    // Save verified candidates and update DB
    if (verifiedCandidates.length > 0) {
      saveCandidates(ind.id, verifiedCandidates);
      updateIndustryStatus(ind.id, 'scouted');
      console.log(`[SCOUT] Successfully saved ${verifiedCandidates.length} healthy websites for ${ind.name}!`);
    } else {
      console.error(`[SCOUT] ❌ Warning: Could not find 2 live candidates for ${ind.name}.`);
    }
  }

  await browser.close();

  // Send Email Notification with review dashboard link
  console.log(`\n[SCOUT] Scouting complete for all industries. Dispatching email report...`);
  const refreshedIndustries = getIndustries();
  await sendScoutReport(refreshedIndustries);

  console.log('\n======================================================');
  console.log('              SCOUT AGENT COMPLETED!                  ');
  console.log('======================================================\n');
}


/**
 * Rescans a single candidate slot: finds an alternative healthy, award-grade website,
 * archives the old website into history, and updates the candidate.
 */
export async function rescanCandidate(candidateId) {
  console.log(`\n[SCOUT-RESCAN] Initiating targeted rescan for candidate ID: ${candidateId}...`);
  
  const industries = getIndustries();
  let targetCandidate = null;
  let targetIndustry = null;

  for (const ind of industries) {
    const found = ind.candidates.find(c => c.id == candidateId);
    if (found) {
      targetCandidate = found;
      targetIndustry = ind;
      break;
    }
  }

  if (!targetCandidate || !targetIndustry) {
    throw new Error(`Candidate with ID ${candidateId} not found`);
  }

  // Blacklist existing and past URLs so we find a genuinely new site
  const blacklist = new Set();
  if (targetCandidate.url) blacklist.add(targetCandidate.url.toLowerCase().trim());
  if (targetCandidate.history && Array.isArray(targetCandidate.history)) {
    targetCandidate.history.forEach(h => blacklist.add(h.url.toLowerCase().trim()));
  }
  targetIndustry.candidates.forEach(c => {
    if (c.url) blacklist.add(c.url.toLowerCase().trim());
  });

  console.log(`[SCOUT-RESCAN] Blacklist contains ${blacklist.size} already scanned URLs.`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const queue = [];

  // 1. Search for new alternatives via live search queries
  const searchQueries = [
    `site:webflow.io ${targetIndustry.query || targetIndustry.name} award portfolio modern`,
    `site:webflow.io ${targetIndustry.name} showcase template`,
    `${targetIndustry.name} modern award-winning website design`
  ];

  for (const sq of searchQueries) {
    try {
      const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(sq)}`;
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
      const links = await page.$$eval('a.result__url', els => els.map(e => e.getAttribute('href') || e.innerText));
      for (let l of links) {
        if (!l.startsWith('http')) l = 'https://' + l.trim();
        if (l.includes('duckduckgo.com/l/?uddg=')) {
          const matched = l.match(/uddg=([^&]+)/);
          if (matched) l = decodeURIComponent(matched[1]);
        }
        const clean = l.toLowerCase().trim();
        if (l.startsWith('http') && !l.includes('duckduckgo') && !blacklist.has(clean) && !queue.some(q => q.url === l)) {
          queue.push({ url: l, title: targetIndustry.name });
        }
      }
    } catch (e) {
      console.warn(`[SCOUT-RESCAN] Live search timed out for query "${sq}".`);
    }
    if (queue.length >= 6) break;
  }

  // 2. Append unpicked candidates from verified pool
  if (VERIFIED_CANDIDATE_POOL[targetIndustry.id]) {
    for (const poolItem of VERIFIED_CANDIDATE_POOL[targetIndustry.id]) {
      const clean = poolItem.url.toLowerCase().trim();
      if (!blacklist.has(clean) && !queue.some(q => q.url === poolItem.url)) {
        queue.push({ ...poolItem });
      }
    }
  }

  console.log(`[SCOUT-RESCAN] Exploration pool for alternative contains ${queue.length} sites.`);

  let foundNewCandidate = null;

  for (const cand of queue) {
    console.log(`[SCOUT-RESCAN] Validating candidate: ${cand.url}`);
    const health = await validateAndInspectWebsite(page, cand.url);

    if (!health.valid) {
      console.log(`[SCOUT-RESCAN] ⚠️ Skipped dead/error link: ${cand.url} (${health.reason})`);
      continue;
    }

    console.log(`[SCOUT-RESCAN] ✅ Found live alternative: ${cand.url} - "${health.title}"`);
    const screenshotFilename = `${targetIndustry.id}_${targetCandidate.rank}_${Date.now()}.jpg`;
    const screenshotPath = path.join(SCREENSHOTS_DIR, screenshotFilename);

    let screenshotBase64 = null;
    try {
      const buffer = await page.screenshot({ quality: 80, type: 'jpeg' });
      fs.writeFileSync(screenshotPath, buffer);
      screenshotBase64 = buffer.toString('base64');
    } catch (err) {
      console.warn(`[SCOUT-RESCAN] Screenshot warning: ${err.message}`);
    }

    const aiEval = await evaluateWebsite({
      url: cand.url,
      title: health.title || cand.title,
      screenshotBase64,
      industry: targetIndustry.name
    });

    foundNewCandidate = {
      url: cand.url,
      title: health.title || cand.title,
      screenshot_path: `/screenshots/${screenshotFilename}`,
      score: aiEval.score,
      notes: aiEval.notes
    };
    break;
  }

  await browser.close();

  if (!foundNewCandidate) {
    throw new Error(`Could not find an alternative healthy website for ${targetIndustry.name}`);
  }

  const { updateCandidateAfterRescan } = await import('./db.js');
  const updated = updateCandidateAfterRescan(candidateId, foundNewCandidate);
  console.log(`[SCOUT-RESCAN] Successfully replaced candidate with: ${foundNewCandidate.url}`);
  return updated;
}
