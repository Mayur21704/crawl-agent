import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { initDb, getIndustries, updateCandidateUrl, toggleCandidateApproval, createCrawlJob, restoreCandidateFromHistory } from './db.js';
import { runScout, validateAndInspectWebsite, rescanCandidate } from './scout.js';
import { crawlWebsite } from './crawler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const OUTPUT_DIR = path.resolve(__dirname, '../output');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// Initialize database
initDb();

let isScouting = false;
let isCrawling = false;
let currentCrawlProgress = { total: 0, current: 0, currentUrl: '', status: 'idle' };

// Redirect root to /review
app.get('/', (req, res) => {
  res.redirect('/review');
});

app.get('/review', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// API: Get all industries, candidates, and crawls
app.get('/api/industries', (req, res) => {
  try {
    const data = getIndustries();
    res.json({
      success: true,
      industries: data,
      isScouting,
      isCrawling,
      crawlProgress: currentCrawlProgress
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Live Verify URL (checks for 404, nginx error, dead domain)
app.post('/api/candidate/verify', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ success: false, reason: 'A valid http/https URL is required' });
  }

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const check = await validateAndInspectWebsite(page, url);
    await browser.close();

    res.json({ success: check.valid, ...check });
  } catch (err) {
    if (browser) await browser.close();
    res.status(500).json({ success: false, reason: err.message });
  }
});

// API: Edit / Swap a Candidate URL
app.post('/api/candidate/update', (req, res) => {
  const { candidateId, url } = req.body;
  if (!candidateId || !url) {
    return res.status(400).json({ success: false, error: 'candidateId and url required' });
  }
  try {
    updateCandidateUrl(candidateId, url);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Toggle Candidate Approval
app.post('/api/candidate/toggle', (req, res) => {
  const { candidateId, approved } = req.body;
  if (candidateId === undefined || approved === undefined) {
    return res.status(400).json({ success: false, error: 'candidateId and approved required' });
  }
  try {
    toggleCandidateApproval(candidateId, approved);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Trigger Scout Phase
app.post('/api/scout/start', async (req, res) => {
  if (isScouting) {
    return res.json({ success: false, message: 'Scout is already running' });
  }
  isScouting = true;
  res.json({ success: true, message: 'Resilient Scout agent started in background' });

  try {
    await runScout();
  } catch (err) {
    console.error('[SERVER] Scout error:', err);
  } finally {
    isScouting = false;
  }
});

// API: Crawl Single Candidate
app.post('/api/crawl/single', async (req, res) => {
  const { industryId, rank, url } = req.body;
  if (!industryId || !rank || !url) {
    return res.status(400).json({ success: false, error: 'industryId, rank, and url are required' });
  }

  const targetDir = path.join(OUTPUT_DIR, industryId, `website-${rank}`);
  res.json({ success: true, message: `Started crawl for ${url} -> ${targetDir}` });

  try {
    const crawlId = createCrawlJob(industryId, rank, url, targetDir);
    await crawlWebsite({ url, outputDir: targetDir, crawlId });
  } catch (err) {
    console.error('[SERVER] Single crawl error:', err);
  }
});

// API: Trigger Deep Crawl Phase for all approved candidates
app.post('/api/crawl/start', async (req, res) => {
  if (isCrawling) {
    return res.json({ success: false, message: 'Crawl is already in progress' });
  }

  const industries = getIndustries();
  const jobsToRun = [];

  for (const ind of industries) {
    const approved = ind.candidates.filter(c => c.approved === 1);
    for (const cand of approved) {
      jobsToRun.push({
        industryId: ind.id,
        rank: cand.rank,
        url: cand.url,
        outputDir: path.join(OUTPUT_DIR, ind.id, `website-${cand.rank}`)
      });
    }
  }

  if (jobsToRun.length === 0) {
    return res.json({ success: false, message: 'No approved candidates found to crawl. Toggle some cards to Approved first!' });
  }

  isCrawling = true;
  currentCrawlProgress = { total: jobsToRun.length, current: 0, currentUrl: '', status: 'running' };
  res.json({ success: true, message: `Started crawl for ${jobsToRun.length} approved websites in background` });

  (async () => {
    try {
      for (let i = 0; i < jobsToRun.length; i++) {
        const job = jobsToRun[i];
        currentCrawlProgress.current = i + 1;
        currentCrawlProgress.currentUrl = job.url;

        const crawlId = createCrawlJob(job.industryId, job.rank, job.url, job.outputDir);
        await crawlWebsite({ url: job.url, outputDir: job.outputDir, crawlId });
      }
      currentCrawlProgress.status = 'finished';
    } catch (err) {
      console.error('[SERVER] Crawl batch error:', err);
      currentCrawlProgress.status = 'error';
    } finally {
      isCrawling = false;
    }
  })();
});


// API: Rescan single candidate for an alternative
app.post('/api/candidate/rescan', async (req, res) => {
  const { candidateId } = req.body;
  if (!candidateId) {
    return res.status(400).json({ success: false, error: 'candidateId is required' });
  }

  try {
    const updated = await rescanCandidate(candidateId);
    res.json({ success: true, candidate: updated });
  } catch (err) {
    console.error('[SERVER] Rescan error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Restore a previous candidate from history
app.post('/api/candidate/restore', (req, res) => {
  const { candidateId, historyIndex } = req.body;
  if (candidateId === undefined || historyIndex === undefined) {
    return res.status(400).json({ success: false, error: 'candidateId and historyIndex required' });
  }

  try {
    const ok = restoreCandidateFromHistory(candidateId, historyIndex);
    res.json({ success: ok });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('\n======================================================');
  console.log(`[DASHBOARD] Autonomous Agent Server is Live!`);
  console.log(`[URL] http://localhost:${PORT}/review`);
  console.log(`======================================================\n`);
});
