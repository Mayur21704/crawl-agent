import { initDb, getIndustries, createCrawlJob } from './db.js';
import { runScout } from './scout.js';
import { crawlWebsite } from './crawler.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_BASE = path.resolve(__dirname, '../output');

const args = process.argv.slice(2);
initDb();

async function main() {
  if (args.includes('--scout')) {
    await runScout();
  } else if (args.includes('--crawl')) {
    console.log('\n[CLI] Starting crawl for all approved candidate websites...');
    const industries = getIndustries();
    for (const ind of industries) {
      const approvedCandidates = ind.candidates.filter(c => c.approved === 1);
      for (const cand of approvedCandidates) {
        const slotDir = path.join(OUTPUT_BASE, ind.id, `website-${cand.rank}`);
        const crawlId = createCrawlJob(ind.id, cand.rank, cand.url, slotDir);
        await crawlWebsite({ url: cand.url, outputDir: slotDir, crawlId });
      }
    }
    console.log('\n[CLI] All crawls completed!');
  } else if (args.includes('--full')) {
    await runScout();
    console.log('\n[CLI] Scout finished. Starting automated crawl...');
    const industries = getIndustries();
    for (const ind of industries) {
      for (const cand of ind.candidates) {
        const slotDir = path.join(OUTPUT_BASE, ind.id, `website-${cand.rank}`);
        const crawlId = createCrawlJob(ind.id, cand.rank, cand.url, slotDir);
        await crawlWebsite({ url: cand.url, outputDir: slotDir, crawlId });
      }
    }
  } else {
    console.log(`
Usage:
  node src/cli.js --scout   # Scouts 1-2 award-grade candidate sites per industry & sends email
  node src/cli.js --crawl   # Deep crawls all approved sites with zero-SRI and full assets
  node src/cli.js --full    # Runs both scout and crawl in one automated pass
  npm start                 # Starts the Review Web Dashboard at http://localhost:3000
    `);
  }
}

main().catch(console.error);
