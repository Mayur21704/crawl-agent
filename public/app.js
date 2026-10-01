// ==========================================================================
// AETHER // DASHBOARD APPLICATION LOGIC (Vibrant Light UI)
// ==========================================================================

let state = {
  industries: [],
  isScouting: false,
  isCrawling: false,
  crawlProgress: { total: 0, current: 0, currentUrl: '', status: 'idle' },
  activeFilter: 'all'
};

const dom = {
  industriesContainer: document.getElementById('industries-container'),
  metricIndustries: document.getElementById('metric-industries'),
  metricCandidates: document.getElementById('metric-candidates'),
  metricApproved: document.getElementById('metric-approved'),
  btnScout: document.getElementById('btn-scout'),
  btnCrawl: document.getElementById('btn-crawl'),
  statusStrip: document.getElementById('status-strip'),
  statusTitle: document.getElementById('status-title'),
  statusDesc: document.getElementById('status-desc'),
  progressBar: document.getElementById('progress-bar'),
  modal: document.getElementById('screenshot-modal'),
  modalImg: document.getElementById('modal-img'),
  modalTitle: document.getElementById('modal-title'),
  modalClose: document.getElementById('modal-close'),
  toastContainer: document.getElementById('toast-container'),
  filterButtons: document.querySelectorAll('.filter-tab')
};

// Distinct vibrant icons & class names per industry
const INDUSTRY_CONFIG = {
  electrician: { icon: '⚡', iconClass: 'icon-electrician' },
  hvac: { icon: '❄️', iconClass: 'icon-hvac' },
  'home-services': { icon: '🏡', iconClass: 'icon-home-services' },
  'concrete-paving': { icon: '🧱', iconClass: 'icon-concrete-paving' },
  dentist: { icon: '🦷', iconClass: 'icon-dentist' }
};

// Initialize Application
async function init() {
  bindEvents();
  await fetchState();
  setInterval(pollStatusIfActive, 3500);
}

function bindEvents() {
  dom.btnScout.addEventListener('click', startScout);
  dom.btnCrawl.addEventListener('click', startCrawl);
  
  dom.modalClose.addEventListener('click', closeModal);
  dom.modal.addEventListener('click', (e) => {
    if (e.target === dom.modal) closeModal();
  });

  dom.filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      dom.filterButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeFilter = btn.dataset.filter;
      renderIndustries();
    });
  });
}

// Fetch DB State from Backend
async function fetchState() {
  try {
    const res = await fetch('/api/industries');
    const data = await res.json();
    if (data.success) {
      state.industries = data.industries;
      state.isScouting = data.isScouting;
      state.isCrawling = data.isCrawling;
      state.crawlProgress = data.crawlProgress;
      
      updateMetrics();
      updateStatusStrip();
      renderIndustries();
    }
  } catch (err) {
    showToast('Failed to load system state', 'error');
  }
}

async function pollStatusIfActive() {
  if (state.isScouting || state.isCrawling) {
    await fetchState();
  }
}

function updateMetrics() {
  dom.metricIndustries.innerText = state.industries.length;
  let totalCandidates = 0;
  let approvedCount = 0;

  state.industries.forEach(ind => {
    totalCandidates += ind.candidates.length;
    approvedCount += ind.candidates.filter(c => c.approved === 1).length;
  });

  dom.metricCandidates.innerText = totalCandidates;
  dom.metricApproved.innerText = approvedCount;
}

function updateStatusStrip() {
  if (state.isScouting) {
    dom.statusStrip.classList.remove('hidden');
    dom.statusTitle.innerText = 'Neural Scout Running';
    dom.statusDesc.innerText = 'Testing live sites, validating HTTP 200, & discarding broken links...';
    dom.progressBar.style.width = '70%';
  } else if (state.isCrawling) {
    dom.statusStrip.classList.remove('hidden');
    const { total, current, currentUrl } = state.crawlProgress;
    dom.statusTitle.innerText = `Deep Crawling [${current}/${total}]`;
    dom.statusDesc.innerText = currentUrl ? `Capturing assets for: ${currentUrl}` : 'Localizing Webflow runtime & assets...';
    const percent = total > 0 ? Math.round((current / total) * 100) : 50;
    dom.progressBar.style.width = `${percent}%`;
  } else {
    dom.statusStrip.classList.add('hidden');
    dom.progressBar.style.width = '0%';
  }
}

// Render Industries & Candidate Bento Cards
function renderIndustries() {
  if (state.industries.length === 0) {
    dom.industriesContainer.innerHTML = `
      <div class="loader-skeleton">
        <p>No industries found. Click "Run Resilient Scout" above to discover candidates.</p>
      </div>`;
    return;
  }

  let html = '';

  state.industries.forEach(ind => {
    let candidatesToDisplay = ind.candidates;
    if (state.activeFilter === 'approved') {
      candidatesToDisplay = ind.candidates.filter(c => c.approved === 1);
    } else if (state.activeFilter === 'pending') {
      candidatesToDisplay = ind.candidates.filter(c => c.approved === 0);
    }

    if (candidatesToDisplay.length === 0 && state.activeFilter !== 'all') {
      return;
    }

    const conf = INDUSTRY_CONFIG[ind.id] || { icon: '✨', iconClass: 'icon-home-services' };
    const statusText = ind.status.toUpperCase();

    html += `
      <section class="industry-block" id="ind-${ind.id}">
        <div class="industry-header">
          <div class="industry-title-area">
            <div class="industry-icon-box ${conf.iconClass}">${conf.icon}</div>
            <div>
              <div style="display:flex; align-items:center; gap:8px;">
                <h2 class="industry-name">${ind.name}</h2>
                <span class="industry-badge-id">${ind.id}</span>
              </div>
              <p class="industry-meta">Target: 2 verified themes • Pipeline Status: ${statusText}</p>
            </div>
          </div>
        </div>

        <div class="candidates-grid">
          ${candidatesToDisplay.map(c => renderCandidateCard(ind.id, c)).join('')}
        </div>
      </section>
    `;
  });

  dom.industriesContainer.innerHTML = html;
}

function renderCandidateCard(industryId, cand) {
  const isApproved = cand.approved === 1;
  const score = parseFloat(cand.score || 8.5).toFixed(1);
  const isHighScore = score >= 8.0;
  const imgSrc = cand.screenshot_path || cand.screenshotPath || `/screenshots/${industryId}_${cand.rank}.jpg`;
  const historyList = cand.history || [];
  const historyCount = historyList.length;

  return `
    <article class="candidate-card ${isApproved ? 'is-approved' : ''}" id="card-${cand.id}">
      <div class="card-media" onclick="openModal('${imgSrc}', '${escapeQuotes(cand.title)}')">
        <img src="${imgSrc}" alt="${cand.title}" onerror="this.onerror=null; this.src='/screenshots/placeholder.svg'">
        <div class="media-hover-overlay">
          <span class="preview-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
            Click to View Full Preview
          </span>
        </div>
        <div class="floating-tags">
          <span class="rank-badge">CANDIDATE #${cand.rank}</span>
          <span class="ai-score-pill ${isHighScore ? 'high' : 'mid'}">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            ${score} / 10 AI SCORE
          </span>
        </div>
      </div>

      <div class="card-content">
        <div class="card-title-row">
          <h3 class="card-title">${cand.title || 'Untitled Candidate'}</h3>
          <div style="display:flex; align-items:center; gap:6px;">
            <button class="btn-rescan" id="btn-rescan-${cand.id}" onclick="rescanCandidateSlot('${cand.id}')" title="AI will discover another website for this slot">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
              <span>Rescan Alternative</span>
            </button>
          </div>
        </div>

        <div class="card-notes">
          ${cand.notes || 'Visual analysis: Modern layout with strong responsive typography.'}
        </div>

        <!-- URL Verification & Edit Bar -->
        <div class="url-control-block">
          <div class="url-input-container">
            <input type="text" class="url-field" id="url-${cand.id}" value="${cand.url}" spellcheck="false">
            <button class="btn-inline-action btn-verify" onclick="verifyCandidateUrl('${cand.id}')">Verify Link</button>
            <button class="btn-inline-action" onclick="saveCandidateUrl('${cand.id}')">Save</button>
          </div>
          <div class="url-health-indicator" id="health-${cand.id}"></div>
        </div>

        <!-- Scanned History Bar -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:2px;">
          <button class="btn-history-toggle" onclick="toggleHistoryDrawer('${cand.id}')">
            <span>📜 Scanned History (${historyCount})</span>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </button>
          <span style="font-size:11px; color:#94a3b8; font-family:monospace;">${cand.status === 'rescanned' ? '• Rescanned' : '• Verified'}</span>
        </div>

        <!-- Expandable History Drawer -->
        <div class="history-drawer hidden" id="history-${cand.id}">
          <div class="history-drawer-header">
            <span>PREVIOUSLY SCANNED SITES</span>
            <span>CLICK TO RESTORE</span>
          </div>
          <div class="history-list">
            ${historyList.length === 0 ? '<div class="history-empty">No previous scans recorded yet. When you rescan, older sites will be saved here.</div>' : 
              historyList.map((h, idx) => `
                <div class="history-card-item">
                  <div class="history-item-left">
                    <span class="history-item-title">${escapeQuotes(h.title || 'Untitled Site')}</span>
                    <a href="${h.url}" target="_blank" rel="noopener noreferrer" class="history-item-url">${h.url} ↗</a>
                    <span class="history-item-date">${h.scanned_at ? new Date(h.scanned_at).toLocaleString() : 'Scanned'} • Score: ${h.score || 8.0}</span>
                  </div>
                  <div class="history-item-actions">
                    <button class="btn-restore" onclick="restoreCandidate('${cand.id}', ${idx})" title="Restore this website as active candidate">
                      ↺ Restore
                    </button>
                  </div>
                </div>
              `).join('')
            }
          </div>
        </div>

        <!-- Bottom Controls -->
        <div class="card-bottom-bar">
          <div class="switch-wrapper ${isApproved ? 'active' : ''}" onclick="toggleApproval('${cand.id}', ${isApproved ? 0 : 1})">
            <div class="glow-switch">
              <span class="switch-thumb"></span>
            </div>
            <span class="switch-label">${isApproved ? 'Approved for Crawl' : 'Needs Review'}</span>
          </div>

          <div class="card-actions-right">
            <a href="${cand.url}" target="_blank" rel="noopener noreferrer" class="btn-visit">Visit Live ↗</a>
            <button class="btn-crawl-card" onclick="crawlSingleSite('${industryId}', ${cand.rank}, '${cand.id}')">
              <span>Crawl Site</span>
            </button>
          </div>
        </div>
      </div>
    </article>
  `;
}

// Live URL Health Verification (Detects 404, Nginx errors, dead links)
window.verifyCandidateUrl = async function(candId) {
  const input = document.getElementById(`url-${candId}`);
  const healthLabel = document.getElementById(`health-${candId}`);
  const url = input.value.trim();

  healthLabel.className = 'url-health-indicator';
  healthLabel.style.display = 'block';
  healthLabel.innerText = '⏳ Pinging URL and verifying HTTP health...';

  try {
    const res = await fetch('/api/candidate/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const result = await res.json();

    if (result.success) {
      healthLabel.className = 'url-health-indicator live';
      healthLabel.innerText = `✓ Verified 200 OK — "${result.title || 'Live Website'}"`;
      showToast('Website is healthy and ready for crawling!', 'success');
    } else {
      healthLabel.className = 'url-health-indicator error';
      healthLabel.innerText = `❌ Error: ${result.reason || 'Dead or broken URL'}`;
      showToast(`Warning: URL is broken (${result.reason})`, 'error');
    }
  } catch (err) {
    healthLabel.className = 'url-health-indicator error';
    healthLabel.innerText = '❌ Failed to reach server verifier';
  }
};

// Save edited URL
window.saveCandidateUrl = async function(candId) {
  const input = document.getElementById(`url-${candId}`);
  const url = input.value.trim();

  try {
    const res = await fetch('/api/candidate/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: candId, url })
    });
    const data = await res.json();
    if (data.success) {
      showToast('URL updated successfully', 'success');
      await fetchState();
    } else {
      showToast(data.error || 'Failed to update URL', 'error');
    }
  } catch (e) {
    showToast('Network error updating URL', 'error');
  }
};

// Toggle Approval State
window.toggleApproval = async function(candId, newApproved) {
  try {
    const res = await fetch('/api/candidate/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: candId, approved: newApproved })
    });
    const data = await res.json();
    if (data.success) {
      showToast(newApproved ? 'Candidate Approved' : 'Approval Revoked', 'info');
      await fetchState();
    } else {
      showToast('Failed to toggle approval', 'error');
    }
  } catch (e) {
    showToast('Failed to toggle approval', 'error');
  }
};

// Crawl Single Candidate
window.crawlSingleSite = async function(industryId, rank, candId) {
  const input = document.getElementById(`url-${candId}`);
  const url = input.value.trim();

  showToast(`Initiating crawl for Candidate #${rank}...`, 'info');

  try {
    const res = await fetch('/api/crawl/single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ industryId, rank, url })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message, 'success');
    } else {
      showToast(data.error || 'Crawl failed to start', 'error');
    }
  } catch (e) {
    showToast('Error triggering crawl', 'error');
  }
};

// Start Full Scout
async function startScout() {
  if (state.isScouting) return;
  showToast('Starting Resilient Scout agent...', 'info');

  try {
    const res = await fetch('/api/scout/start', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      state.isScouting = true;
      updateStatusStrip();
      showToast(data.message, 'success');
    }
  } catch (e) {
    showToast('Failed to trigger scout', 'error');
  }
}

// Start Deep Crawl of all approved sites
async function startCrawl() {
  if (state.isCrawling) return;

  try {
    const res = await fetch('/api/crawl/start', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      state.isCrawling = true;
      updateStatusStrip();
      showToast(data.message, 'success');
    } else {
      showToast(data.message, 'error');
    }
  } catch (e) {
    showToast('Failed to trigger crawl', 'error');
  }
}

// Lightbox Modal
window.openModal = function(src, title) {
  dom.modalImg.src = src;
  dom.modalTitle.innerText = title || 'Website Preview';
  dom.modal.classList.remove('hidden');
};

function closeModal() {
  dom.modal.classList.add('hidden');
}

// Toast Notifications
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = message;
  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

function escapeQuotes(str) {
  return (str || '').replace(/'/g, "\'").replace(/"/g, '&quot;');
}

document.addEventListener('DOMContentLoaded', init);


// Toggle History Drawer
window.toggleHistoryDrawer = function(candId) {
  const drawer = document.getElementById(`history-${candId}`);
  if (drawer) {
    drawer.classList.toggle('hidden');
  }
};

// Rescan single candidate slot to find an alternative website
window.rescanCandidateSlot = async function(candId) {
  const btn = document.getElementById(`btn-rescan-${candId}`);
  if (btn) {
    btn.classList.add('scanning');
    btn.innerHTML = `
      <svg class="spinner-ring" style="width:12px;height:12px;margin:0;border-width:2px;display:inline-block;" viewBox="0 0 24 24"></svg>
      <span>Searching Alternative...</span>
    `;
  }

  showToast('AI is scouting a fresh alternative website...', 'info');

  try {
    const res = await fetch('/api/candidate/rescan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: candId })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Found alternative: ${data.candidate.title}! Previous site archived in history.`, 'success');
      await fetchState();
    } else {
      showToast(`Rescan failed: ${data.error || 'No new site found'}`, 'error');
      if (btn) {
        btn.classList.remove('scanning');
        btn.innerHTML = `<span>Rescan Alternative</span>`;
      }
    }
  } catch (err) {
    showToast('Network error during rescan', 'error');
    if (btn) {
      btn.classList.remove('scanning');
      btn.innerHTML = `<span>Rescan Alternative</span>`;
    }
  }
};

// Restore previous candidate from history
window.restoreCandidate = async function(candId, historyIndex) {
  showToast('Restoring previous website...', 'info');

  try {
    const res = await fetch('/api/candidate/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ candidateId: candId, historyIndex })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Website restored successfully!', 'success');
      await fetchState();
    } else {
      showToast('Failed to restore website', 'error');
    }
  } catch (err) {
    showToast('Network error during restore', 'error');
  }
};
