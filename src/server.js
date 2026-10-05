import { spawn } from 'child_process';
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { initDb, getIndustries, updateCandidateUrl, toggleCandidateApproval, toggleCandidateSkipCrawl,
  addCustomCandidate, createCrawlJob, restoreCandidateFromHistory } from './db.js';
import { runScout, validateAndInspectWebsite, rescanCandidate } from './scout.js';
import { crawlWebsite } from './crawler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');
const OUTPUT_DIR = path.resolve(__dirname, '../output');
const PROJECT_ROOT = path.resolve(__dirname, '..');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * Executes pipelines/archive_output.py to package output/ -> /home/ubuntu/output.tar.gz
 * Deletes any previous archive before creating the new one.
 */
function runOutputArchive() {
  return new Promise((resolve) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(PROJECT_ROOT, 'pipelines', 'archive_output.py');
    console.log(`[ARCHIVE] Triggering archive_output.py via ${pythonCmd}...`);

    const child = spawn(pythonCmd, [scriptPath], { cwd: PROJECT_ROOT, env: process.env });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('close', code => {
      console.log(stdout.trim());
      if (code === 0) {
        const targetPath = fs.existsSync('/home/ubuntu') ? '/home/ubuntu/output.tar.gz' : path.join(PROJECT_ROOT, 'output.tar.gz');
        let sizeMB = '0';
        try {
          sizeMB = (fs.statSync(targetPath).size / (1024 * 1024)).toFixed(2);
        } catch (e) {}
        resolve({ success: true, path: targetPath, sizeMB });
      } else {
        console.error(`[ARCHIVE] Failed with code ${code}: ${stderr}`);
        resolve({ success: false, error: stderr || `Exit code ${code}` });
      }
    });

    child.on('error', err => {
      console.error(`[ARCHIVE] Process error:`, err);
      resolve({ success: false, error: err.message });
    });
  });
}


app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR));
app.use('/crawled', express.static(OUTPUT_DIR));

// Initialize database
initDb();

let isScouting = false;
let isCrawling = false;
let currentCrawlProgress = { total: 0, current: 0, currentUrl: '', status: 'idle' };
const activeCrawlJobs = {};

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
      crawlProgress: currentCrawlProgress,
      activeCrawlJobs
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

// API: Crawl Single Candidate with Live Progress Tracking
app.post('/api/crawl/single', async (req, res) => {
  const { candidateId, industryId, rank, url, aggressive } = req.body;
  if (!industryId || !rank || !url) {
    return res.status(400).json({ success: false, error: 'industryId, rank, and url are required' });
  }

  const targetDir = path.join(OUTPUT_DIR, industryId, `website-${rank}`);
  const previewUrl = `/crawled/${industryId}/website-${rank}/index.html`;

  if (candidateId) {
    activeCrawlJobs[candidateId] = {
      percent: 5,
      stage: 'Starting crawl...',
      assetCount: 0,
      status: 'running',
      previewUrl
    };
  }

  res.json({ success: true, message: `Started crawl for ${url}` });

  (async () => {
    try {
      const crawlId = createCrawlJob(industryId, rank, url, targetDir);
      await crawlWebsite({
        url,
        outputDir: targetDir,
        crawlId,
        onProgress: (prog) => {
          if (candidateId) {
            activeCrawlJobs[candidateId] = {
              ...prog,
              status: prog.completed ? (prog.error ? 'error' : 'completed') : 'running',
              previewUrl
            };
          }
        }
      });
      console.log(`[SERVER] Single crawl complete for ${url}. Updating output.tar.gz...`);
      await runOutputArchive();
    } catch (err) {
      console.error('[SERVER] Single crawl error:', err);
      if (candidateId) {
        activeCrawlJobs[candidateId] = {
          percent: 100,
          stage: `Error: ${err.message}`,
          status: 'error',
          error: err.message
        };
      }
    }
  })();
});

// API: Get crawl progress for a specific candidate
app.get('/api/crawl/progress/:candidateId', (req, res) => {
  const candId = req.params.candidateId;
  const progress = activeCrawlJobs[candId] || { percent: 0, stage: 'Idle', status: 'idle' };
  res.json({ success: true, ...progress });
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
      // Check if user locked / checked 'skip re-crawl'
      if (cand.skipCrawl) {
        console.log(`[SERVER] Skipping ${cand.id} (${cand.url}) - marked as skipCrawl/locked`);
        continue;
      }
      jobsToRun.push({
        industryId: ind.id,
        rank: cand.rank,
        url: cand.url,
        outputDir: path.join(OUTPUT_DIR, ind.id, `website-${cand.rank}`)
      });
    }
  }

  if (jobsToRun.length === 0) {
    return res.json({ success: false, message: 'No approved websites to crawl (all approved sites are marked with Skip Re-crawl).' });
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
      console.log('[SERVER] All crawls finished! Creating output.tar.gz...');
      await runOutputArchive();
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

// API: Delete Crawled Website Output Folder
app.post('/api/crawl/delete', (req, res) => {
  const { industryId, rank, candidateId } = req.body;
  if (!industryId || !rank) {
    return res.status(400).json({ success: false, error: 'industryId and rank are required' });
  }

  const targetDir = path.join(OUTPUT_DIR, industryId, `website-${rank}`);
  console.log(`[SERVER] Deleting crawled website: ${targetDir}`);

  try {
    if (fs.existsSync(targetDir)) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    if (candidateId && activeCrawlJobs[candidateId]) {
      delete activeCrawlJobs[candidateId];
    }
    res.json({ success: true, message: `Successfully deleted crawled website for ${industryId}/website-${rank}` });
  } catch (err) {
    console.error('[SERVER] Delete crawl error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});


// API: Toggle Skip Re-crawl (Lock) for candidate
app.post('/api/candidate/skip-crawl', (req, res) => {
  const { candidateId, skipCrawl } = req.body;
  if (!candidateId) {
    return res.status(400).json({ success: false, error: 'candidateId is required' });
  }
  const ok = toggleCandidateSkipCrawl(candidateId, skipCrawl);
  res.json({ success: ok, skipCrawl: Boolean(skipCrawl) });
});

// API: Manually trigger output.tar.gz packaging
app.post('/api/crawl/archive', async (req, res) => {
  try {
    const result = await runOutputArchive();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// API: Download output.tar.gz
app.get('/api/crawl/archive/download', (req, res) => {
  const targetPath = fs.existsSync('/home/ubuntu') ? '/home/ubuntu/output.tar.gz' : path.join(PROJECT_ROOT, 'output.tar.gz');
  if (fs.existsSync(targetPath)) {
    return res.download(targetPath, 'output.tar.gz');
  }
  res.status(404).send('output.tar.gz not found. Please run a crawl first.');
});


// API: Add manual custom candidate website to industry
app.post('/api/candidate/add', async (req, res) => {
  const { industryId, url, title, notes, rank } = req.body;
  if (!industryId || !url) {
    return res.status(400).json({ success: false, error: 'industryId and url are required' });
  }

  let normalizedUrl = url.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  try {
    new URL(normalizedUrl);
  } catch (e) {
    return res.status(400).json({ success: false, error: 'Invalid website URL format' });
  }

  console.log(`[SERVER] Adding custom candidate to ${industryId}: ${normalizedUrl}`);

  const targetRank = parseInt(rank, 10) || 
    ((getIndustries().find(i => i.id === industryId)?.candidates?.length || 0) + 1);

  const screenshotFilename = `${industryId}_${targetRank}_${Date.now()}.jpg`;
  const screenshotsDir = path.join(PROJECT_ROOT, 'public', 'screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
  const screenshotDiskPath = path.join(screenshotsDir, screenshotFilename);
  let finalTitle = title ? title.trim() : '';

  try {
    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(normalizedUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    if (!finalTitle) {
      finalTitle = (await page.title()) || '';
    }
    await page.waitForTimeout(1000);
    await page.screenshot({ path: screenshotDiskPath, quality: 75, type: 'jpeg' });
    await browser.close();
  } catch (err) {
    console.log(`[SERVER] Headless screenshot capture notice for ${normalizedUrl}: ${err.message}`);
  }

  const screenshotWebPath = fs.existsSync(screenshotDiskPath) 
    ? `/screenshots/${screenshotFilename}` 
    : `/screenshots/placeholder.svg`;

  const cand = addCustomCandidate({
    industryId,
    url: normalizedUrl,
    title: finalTitle,
    notes,
    rank: targetRank,
    screenshotPath: screenshotWebPath
  });

  res.json({ success: true, candidate: cand, message: `Successfully added ${cand.title || normalizedUrl} to ${industryId}` });
});

// API: Quick Inspect URL for Add Modal
app.post('/api/candidate/inspect-url', async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ success: false, error: 'url required' });

  let norm = url.trim();
  if (!/^https?:\/\//i.test(norm)) norm = 'https://' + norm;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    const resp = await fetch(norm, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
    });
    clearTimeout(timeoutId);

    const html = await resp.text();
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = match ? match[1].trim() : '';

    res.json({ success: true, url: norm, title, status: resp.status });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log('\n======================================================');
  console.log(`[DASHBOARD] Autonomous Agent Server is Live!`);
  console.log(`[URL] http://localhost:${PORT}/review`);
  console.log(`======================================================\n`);
});
