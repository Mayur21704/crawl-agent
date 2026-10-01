# Autonomous Scout & Deep Crawler Agent

Autonomous agent designed for VPS deployment (or local execution) that discovers award-grade websites for specified industries, sends email alerts for review, and deep-crawls approved sites with zero-SRI, full asset localization, and pure static HTML output.

---

## Architecture Overview

```
[config/industries.json] ──► [Scout Agent] ──► [AI Design Evaluator]
                                                     │
                                                     ▼
[Deep Crawler Output] ◄── [Review Dashboard] ◄── [Email Alert]
 (output/<industry>/)      (http://localhost:3000)
```

---

## 1. Quick Setup & Configuration

### A. Environment Variables (`.env`)
Copy `.env.example` to `.env` (or edit existing `.env`):
```bash
# 1. Google AI Studio API Key (100% Free Tier: 1,500 requests/day)
# Get free key at: https://aistudio.google.com/
GEMINI_API_KEY=your_google_ai_studio_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# 2. Email Notifications (Nodemailer SMTP)
# For Gmail: Use an App Password (Google Account -> Security -> App Passwords)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password

# The recipient email where review alerts are sent:
NOTIFICATION_EMAIL=your_email@gmail.com

# 3. Server Port & Base URL
PORT=3000
BASE_URL=http://localhost:3000
```

---

## 2. Running the Agent

### Step 1: Start the Review Dashboard
```bash
npm start
```
Opens the interactive review UI at: **`http://localhost:3000/review`**

### Step 2: Run the Scout Agent
```bash
npm run scout
```
- Discovers top 2 candidate websites for all configured industries.
- Captures full-page screenshots into `public/screenshots/`.
- Uses Google Gemini to score typography, layout, and modern aesthetics.
- Sends an email to your `NOTIFICATION_EMAIL` with direct link to your dashboard.

### Step 3: Review & Approve Candidates
Open `http://localhost:3000/review` (or your VPS IP):
- View full screenshots by clicking any preview thumbnail.
- Edit or replace any candidate URL directly in the input box.
- Check/Uncheck "Approved for Crawl".
- Click **"Start Deep Crawl"**!

### Step 4: Run the Deep Crawler directly (CLI)
```bash
npm run crawl
```
Deep crawls all approved sites into:
- `output/electrician/website-1/`
- `output/electrician/website-2/`
- `output/hvac/website-1/`
- `output/hvac/website-2/`
... and so on.

---

## 3. Crawler Battle-Tested Golden Rules
Every crawl automatically applies our proven pipeline:
1. **Subresource Integrity (SRI) Stripping**: Removes `integrity` & `crossorigin` attributes so browser never blocks modified local CSS/JS.
2. **Webflow Chunks Interception**: Automatically downloads all dynamic `webflow.achunk.*.js` bundles.
3. **Unquoted Disk Copies**: Generates unquoted copies for `%20` and `%40` filenames so servers never return 404s.
4. **Pure Static Packaging**: All paths are rewritten to relative (`./css/`, `./js/`, `./images/`, `./fonts/`) with **zero Python or backend server dependency**.
5. **Template Badge Removal**: Strips promotional popups and template purchase banners.

---

## 4. Deploying on an AWS VPS

1. Launch an Ubuntu EC2 instance (t3.small / t3.medium recommended).
2. Install Node.js:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
3. Install Playwright browser dependencies:
   ```bash
   npx playwright install-deps
   ```
4. Clone or copy `agent-2-main` to the VPS.
5. Set up `.env` with your email and free Gemini API key.
6. Run with PM2 for 24/7 uptime:
   ```bash
   sudo npm install -g pm2
   pm2 start src/server.js --name "agent"
   ```
