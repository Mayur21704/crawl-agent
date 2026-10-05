import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { updateCrawlStatus } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

/**
 * Automatically resolve Python executable across OS environments:
 * Linux/Ubuntu VPS: python3
 * Windows: python / py
 */
function getPythonCommand() {
  const candidates = process.platform === 'win32'
    ? ['python', 'py', 'python3']
    : ['python3', 'python'];

  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch (e) {
      // Try next candidate
    }
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}


/**
 * Autonomous Deep Website Crawler
 * Powered by modular Python pipeline suite in pipelines/
 * Discovers all internal pages, sitemaps, localized CSS/JS, dynamic chunks,
 * full responsive srcset images, fonts, self-hosted media, strips badges,
 * and audits all assets for 100% offline self-contained fidelity.
 */
export async function crawlWebsite({ url, outputDir, crawlId, aggressive = false, onProgress = () => {} }) {
  console.log(`\n[CRAWLER] Starting deep Python pipeline crawl for: ${url}`);
  console.log(`[CRAWLER] Target output directory: ${outputDir}`);

  onProgress({ percent: 5, stage: 'Discovering pages and sitemaps...', assetCount: 0 });

  return new Promise((resolve, reject) => {
    const pythonScript = path.join(PROJECT_ROOT, 'pipelines', 'master_crawler.py');
    const pyCmd = getPythonCommand();
    console.log(`[CRAWLER] Using Python binary: ${pyCmd}`);
    const pyArgs = ['-m', 'pipelines.master_crawler', url, outputDir, '--max-pages', aggressive ? '45' : '35'];
    if (aggressive) {
      pyArgs.push('--aggressive');
      console.log(`[CRAWLER] 🔥 AGGRESSIVE MODE ENABLED: Deep asset healing, clean slate wipe, and lazyload normalization active.`);
    }
    const child = spawn(pyCmd, pyArgs, {
      cwd: PROJECT_ROOT,
      env: process.env
    });

    let lastAssets = 0;
    let stdoutBuffer = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      stdoutBuffer += text;
      const lines = stdoutBuffer.split('\n');
      stdoutBuffer = lines.pop(); // keep trailing remainder

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('[PROGRESS]')) {
          try {
            const jsonStr = trimmed.replace('[PROGRESS]', '').trim();
            const prog = JSON.parse(jsonStr);
            lastAssets = prog.assets || lastAssets;
            onProgress({
              percent: prog.percent,
              stage: prog.stage,
              assetCount: lastAssets,
              pages: prog.pages || 0,
              completed: prog.percent >= 100,
              outputDir
            });
          } catch (e) {
            // Ignore parse errors on partial stream
          }
        } else if (trimmed) {
          console.log(`[PY-CRAWLER] ${trimmed}`);
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      const errText = chunk.toString().trim();
      if (errText) {
        console.error(`[PY-CRAWLER ERR] ${errText}`);
      }
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`[CRAWLER] Deep crawl complete for ${url}! Total assets: ${lastAssets}`);
        if (crawlId) {
          updateCrawlStatus(crawlId, 'completed', lastAssets);
        }
        onProgress({
          percent: 100,
          stage: `✓ Crawl Completed! ${lastAssets} assets localized offline.`,
          assetCount: lastAssets,
          completed: true,
          outputDir
        });
        resolve({ success: true, assetCount: lastAssets, outputDir });
      } else {
        const errMsg = `Python crawler exited with code ${code}`;
        console.error(`[CRAWLER] ${errMsg}`);
        if (crawlId) {
          updateCrawlStatus(crawlId, 'failed', lastAssets, errMsg);
        }
        onProgress({
          percent: 100,
          stage: `✗ Crawl Error: ${errMsg}`,
          error: errMsg,
          completed: true
        });
        resolve({ success: false, error: errMsg });
      }
    });

    child.on('error', (err) => {
      console.error(`[CRAWLER] Failed to spawn Python crawler process:`, err);
      if (crawlId) {
        updateCrawlStatus(crawlId, 'failed', 0, err.message);
      }
      reject(err);
    });
  });
}
