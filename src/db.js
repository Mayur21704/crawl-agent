import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');
const DB_FILE = path.join(DATA_DIR, 'db_state.json');

function getDb() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initial = { industries: [], candidates: [], crawls: [] };
    fs.writeFileSync(DB_FILE, JSON.stringify(initial, null, 2), 'utf-8');
    return initial;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch (err) {
    return { industries: [], candidates: [], crawls: [] };
  }
}

function saveDb(data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export function initDb() {
  const db = getDb();
  const seedFile = path.join(DATA_DIR, 'industries.json');

  if (fs.existsSync(seedFile) && db.industries.length === 0) {
    const seed = JSON.parse(fs.readFileSync(seedFile, 'utf-8'));
    db.industries = seed.map(ind => ({
      ...ind,
      status: ind.status || 'pending',
      updated_at: new Date().toISOString()
    }));
    saveDb(db);
    console.log(`[DB] Seeded ${seed.length} industries into local JSON database.`);
  }
}

export function getIndustries() {
  const db = getDb();
  const outputBase = path.resolve(DATA_DIR, '../output');

  return db.industries.map(ind => {
    const candidates = db.candidates
      .filter(c => c.industry_id === ind.id)
      .map(c => {
        const localIndexPath = path.join(outputBase, ind.id, `website-${c.rank}`, 'index.html');
        const isCrawled = fs.existsSync(localIndexPath);
        const crawledUrl = isCrawled ? `/crawled/${ind.id}/website-${c.rank}/index.html` : null;

        return {
          ...c,
          isCrawled,
          crawledUrl,
          crawledFolder: `${ind.id}/website-${c.rank}`,
          screenshot_path: c.screenshot_path || `/screenshots/${ind.id}_${c.rank}.jpg`,
          screenshotPath: c.screenshot_path || c.screenshotPath || `/screenshots/${ind.id}_${c.rank}.jpg`
        };
      });
    const crawls = db.crawls.filter(cr => cr.industry_id === ind.id);
    return { ...ind, candidates, crawls };
  });
}

export function updateIndustryStatus(industryId, status) {
  const db = getDb();
  const ind = db.industries.find(i => i.id === industryId);
  if (ind) {
    ind.status = status;
    ind.updated_at = new Date().toISOString();
    saveDb(db);
  }
}

export function saveCandidates(industryId, candidatesList) {
  const db = getDb();
  // Remove existing candidates for this industry
  db.candidates = db.candidates.filter(c => c.industry_id !== industryId);

  for (const c of candidatesList) {
    db.candidates.push({
      id: Date.now() + Math.floor(Math.random() * 1000),
      industry_id: industryId,
      url: c.url,
      rank: c.rank,
      title: c.title || '',
      screenshot_path: c.screenshotPath || '',
      score: c.score || 0,
      notes: c.notes || '',
      approved: c.approved !== undefined ? c.approved : 1,
      status: 'scouted'
    });
  }
  saveDb(db);
}

export function updateCandidateUrl(candidateId, newUrl) {
  const db = getDb();
  const c = db.candidates.find(item => item.id == candidateId);
  if (c) {
    c.url = newUrl;
    c.status = 'user-edited';
    saveDb(db);
  }
}

export function toggleCandidateApproval(candidateId, approved) {
  const db = getDb();
  const c = db.candidates.find(item => item.id == candidateId);
  if (c) {
    c.approved = approved ? 1 : 0;
    saveDb(db);
  }
}

export function createCrawlJob(industryId, slot, sourceUrl, outputDir) {
  const db = getDb();
  const id = Date.now() + Math.floor(Math.random() * 1000);
  db.crawls.push({
    id,
    industry_id: industryId,
    slot,
    source_url: sourceUrl,
    status: 'crawling',
    output_dir: outputDir,
    total_assets: 0,
    started_at: new Date().toISOString()
  });
  saveDb(db);
  return id;
}

export function updateCrawlStatus(crawlId, status, totalAssets = 0, error = null) {
  const db = getDb();
  const cr = db.crawls.find(c => c.id == crawlId);
  if (cr) {
    cr.status = status;
    cr.total_assets = totalAssets;
    cr.error = error;
    cr.finished_at = new Date().toISOString();
    saveDb(db);
  }
}


export function pushCandidateToHistory(candidateId) {
  const db = getDb();
  const c = db.candidates.find(item => item.id == candidateId);
  if (!c) return null;

  c.history = c.history || [];
  // Only push if not already in history
  const alreadyInHistory = c.history.some(h => h.url === c.url);
  if (!alreadyInHistory && c.url) {
    c.history.unshift({
      url: c.url,
      title: c.title || 'Previous Website',
      screenshot_path: c.screenshot_path || '',
      score: c.score || 0,
      notes: c.notes || '',
      scanned_at: c.scanned_at || new Date().toISOString()
    });
    saveDb(db);
  }
  return c;
}

export function updateCandidateAfterRescan(candidateId, newCandData) {
  const db = getDb();
  const c = db.candidates.find(item => item.id == candidateId);
  if (!c) return null;

  c.history = c.history || [];
  // Push current version to history first
  if (c.url && !c.history.some(h => h.url === c.url)) {
    c.history.unshift({
      url: c.url,
      title: c.title || 'Previous Website',
      screenshot_path: c.screenshot_path || '',
      score: c.score || 0,
      notes: c.notes || '',
      scanned_at: new Date().toISOString()
    });
  }

  // Update with fresh candidate details
  c.url = newCandData.url;
  c.title = newCandData.title;
  c.screenshot_path = newCandData.screenshot_path || newCandData.screenshotPath;
  c.score = newCandData.score;
  c.notes = newCandData.notes;
  c.status = 'rescanned';
  c.scanned_at = new Date().toISOString();

  saveDb(db);
  return c;
}

export function restoreCandidateFromHistory(candidateId, historyIndex) {
  const db = getDb();
  const c = db.candidates.find(item => item.id == candidateId);
  if (!c || !c.history || !c.history[historyIndex]) return false;

  const target = c.history[historyIndex];

  // Save current into history
  const currentSnapshot = {
    url: c.url,
    title: c.title,
    screenshot_path: c.screenshot_path,
    score: c.score,
    notes: c.notes,
    scanned_at: new Date().toISOString()
  };

  // Swap
  c.url = target.url;
  c.title = target.title;
  c.screenshot_path = target.screenshot_path;
  c.score = target.score;
  c.notes = target.notes;
  c.status = 'restored';

  // Replace item in history with currentSnapshot
  c.history[historyIndex] = currentSnapshot;

  saveDb(db);
  return true;
}

export function toggleCandidateSkipCrawl(candidateId, skipCrawl) {
  const db = getDb();
  const c = db.candidates.find(item => item.id == candidateId);
  if (c) {
    c.skipCrawl = Boolean(skipCrawl);
    saveDb(db);
    return true;
  }
  return false;
}
