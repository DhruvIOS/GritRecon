let reconButton = null;
let popup = null;
let selectedName = '';
let currentIntelData = null;
let pinnedProfA = null; // Stored professor for side-by-side comparison
let activeTab = 'overview'; // 'overview', 'grades', 'reviews', 'compare'

// HTML Sanitization to prevent XSS vulnerability in content script context
function escapeHTML(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Create floating action button with UMBC Gold styling
function getOrCreateButton() {
  if (!reconButton) {
    reconButton = document.createElement('div');
    reconButton.id = 'gritrecon-action-btn';
    const logoUrl = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('Logo.png') : '';
    const iconHtml = logoUrl 
      ? `<img class="gritrecon-btn-logo" src="${logoUrl}" alt="GritRecon" />`
      : `<span class="gritrecon-btn-icon">⚡</span>`;
    reconButton.innerHTML = `
      ${iconHtml}
      <span class="gritrecon-btn-text">GritRecon</span>
    `;
    document.body.appendChild(reconButton);
    
    reconButton.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      reconButton.style.display = 'none'; 
      showPopup(selectedName, e.pageX, e.pageY); 
    });
  }
  return reconButton;
}

function getOrCreatePopup() {
  if (!popup) {
    popup = document.createElement('div');
    popup.id = 'gritrecon-popup';
    document.body.appendChild(popup);
  }
  return popup;
}

// Position element safely within viewport boundaries
function positionElement(element, x, y, approxWidth, approxHeight) {
  const scrollX = window.scrollX || window.pageXOffset || document.documentElement.scrollLeft || 0;
  const scrollY = window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

  const padding = 16;
  let left = x + 15;
  let top = y + 15;

  if (left + approxWidth > scrollX + viewportWidth - padding) {
    left = x - approxWidth - 15;
    if (left < scrollX + padding) {
      left = Math.max(scrollX + padding, scrollX + viewportWidth - approxWidth - padding);
    }
  }

  if (top + approxHeight > scrollY + viewportHeight - padding) {
    top = y - approxHeight - 15;
    if (top < scrollY + padding) {
      top = Math.max(scrollY + padding, scrollY + viewportHeight - approxHeight - padding);
    }
  }

  element.style.left = `${Math.round(left)}px`;
  element.style.top = `${Math.round(top)}px`;
}

// Hide elements when clicking elsewhere
document.addEventListener('mousedown', (e) => {
  if (reconButton && !reconButton.contains(e.target)) {
    reconButton.style.display = 'none';
  }
  if (popup && !popup.contains(e.target) && (!reconButton || !reconButton.contains(e.target))) {
    popup.style.display = 'none';
  }
});

// Show action button on text selection with edge-case selection filters
document.addEventListener('mouseup', (e) => {
  if (popup && popup.contains(e.target)) return;
  if (reconButton && reconButton.contains(e.target)) return;

  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : '';

  if (!text || text.length < 2 || text.length > 50) return;
  if (/\d|@|https?:\/\/|[{}[\]<>\\=+\/*#]/i.test(text)) return;

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 1 || words.length > 4) return;

  selectedName = text;
  
  const btn = getOrCreateButton();
  btn.style.display = 'flex';
  positionElement(btn, e.pageX, e.pageY - 42, 125, 38);
});

// Render UMBC Gold Risk Badges
function renderRiskBadges(riskFlags) {
  if (!riskFlags || riskFlags.length === 0) return '';

  const badgeMap = {
    TRAP_CLASS: { label: '⚠️ Trap Class', cls: 'danger', title: 'High fail/drop rate with difficult grading history' },
    EASY_A_GEM: { label: '💎 High Grade Potential', cls: 'gold-badge', title: 'Over 50% of students earn an A with manageable workload' },
    LIMITED_DATA: { label: 'ℹ️ Limited Sample Size', cls: 'warning', title: 'Fewer than 3 evaluations available for this instructor' },
    TOUGH_GRADING: { label: '📉 Tough Grading', cls: 'warning', title: 'Average GPA is significantly lower than course standard' },
    MIXED_SIGNALS: { label: '⚡ High Rigor / Popular', cls: 'gold-badge', title: 'Highly rated instructor but challenging course material' },
  };

  return riskFlags.map(flag => {
    const info = badgeMap[flag] || { label: flag, cls: 'gold-badge', title: 'Calculated student risk indicator' };
    return `<span class="gritrecon-risk-badge ${info.cls}" title="${escapeHTML(info.title)}">${escapeHTML(info.label)}</span>`;
  }).join('');
}

// Compare Professor Recommendation Engine
function getComparisonWinner(profA, profB) {
  let scoreA = 0;
  let scoreB = 0;

  if (profA.gpa > profB.gpa) scoreA += 2; else if (profB.gpa > profA.gpa) scoreB += 2;
  if (profA.passRate > profB.passRate) scoreA += 2; else if (profB.passRate > profA.passRate) scoreB += 2;
  if (profA.wouldTakeAgain > profB.wouldTakeAgain) scoreA += 1; else if (profB.wouldTakeAgain > profA.wouldTakeAgain) scoreB += 1;
  if (profA.difficulty > 0 && profB.difficulty > 0) {
    if (profA.difficulty < profB.difficulty) scoreA += 2; else if (profB.difficulty < profA.difficulty) scoreB += 2;
  }

  if (scoreA > scoreB) return profA;
  if (scoreB > scoreA) return profB;
  return null;
}

// Render Tab Content
function renderTabContent(data) {
  const gradeDist = data.gradeDistribution || { aPercent: 35, bPercent: 35, cPercent: 15, dPercent: 10, fPercent: 5 };

  if (activeTab === 'compare') {
    if (!pinnedProfA) {
      return `
        <div class="gritrecon-tab-pane text-center py-4">
          <div class="gritrecon-sub mb-2">No professor pinned for comparison yet.</div>
          <button class="gritrecon-btn gritrecon-btn-gold" id="gritrecon-pin-current-btn">
            ⚖️ Pin ${escapeHTML(data.fullName)} as Professor A
          </button>
        </div>
      `;
    }

    const isCurrentPinned = pinnedProfA.fullName.toLowerCase() === data.fullName.toLowerCase();
    if (isCurrentPinned) {
      return `
        <div class="gritrecon-tab-pane text-center py-4">
          <div class="gritrecon-sub mb-2">📌 <strong>${escapeHTML(pinnedProfA.fullName)}</strong> is pinned as Professor A.</div>
          <div class="gritrecon-sub mb-3">Select or highlight another professor's name on your registration page to compare them side-by-side!</div>
          <button class="gritrecon-btn gritrecon-btn-dark" id="gritrecon-clear-pin-btn">
            🗑️ Clear Pinned Professor
          </button>
        </div>
      `;
    }

    const winner = getComparisonWinner(pinnedProfA, data);
    const profAGreaterGpa = pinnedProfA.gpa >= data.gpa;
    const profAGreaterPass = pinnedProfA.passRate >= data.passRate;
    const profAEasierDiff = (pinnedProfA.difficulty || 5) <= (data.difficulty || 5);
    const profAGreaterAgain = pinnedProfA.wouldTakeAgain >= data.wouldTakeAgain;

    return `
      <div class="gritrecon-tab-pane gritrecon-compare-pane">
        ${winner ? `
          <div class="gritrecon-winner-banner">
            🏆 Recommended: <strong>${escapeHTML(winner.fullName)}</strong>
          </div>
        ` : ''}

        <table class="gritrecon-compare-table">
          <thead>
            <tr>
              <th>Metric</th>
              <th className="pinned-header">📌 ${escapeHTML(pinnedProfA.fullName.split(' ')[0])}</th>
              <th>${escapeHTML(data.fullName.split(' ')[0])}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="metric-label" title="Historical Letter Grade (GPA)">Avg Grade</td>
              <td class="${profAGreaterGpa ? 'win' : ''}">${escapeHTML(pinnedProfA.averageGrade)} (${pinnedProfA.gpa.toFixed(2)})</td>
              <td class="${!profAGreaterGpa ? 'win' : ''}">${escapeHTML(data.averageGrade)} (${data.gpa.toFixed(2)})</td>
            </tr>
            <tr>
              <td className="metric-label" title="% of students passing with C or higher">Pass Rate</td>
              <td class="${profAGreaterPass ? 'win' : ''}">${pinnedProfA.passRate}%</td>
              <td class="${!profAGreaterPass ? 'win' : ''}">${data.passRate}%</td>
            </tr>
            <tr>
              <td className="metric-label" title="Course difficulty rating 1 (Easy) to 5 (Hard)">Difficulty</td>
              <td class="${profAEasierDiff ? 'win' : ''}">${pinnedProfA.difficulty}/5</td>
              <td class="${!profAEasierDiff ? 'win' : ''}">${data.difficulty}/5</td>
            </tr>
            <tr>
              <td className="metric-label" title="% of students who recommend this professor">Take Again</td>
              <td class="${profAGreaterAgain ? 'win' : ''}">${pinnedProfA.wouldTakeAgain === -1 ? 'N/A' : `${pinnedProfA.wouldTakeAgain}%`}</td>
              <td class="${!profAGreaterAgain ? 'win' : ''}">${data.wouldTakeAgain === -1 ? 'N/A' : `${data.wouldTakeAgain}%`}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex gap-2 mt-3">
          <button class="gritrecon-btn gritrecon-btn-gold flex-1" id="gritrecon-pin-current-btn">
            📌 Pin ${escapeHTML(data.fullName.split(' ')[0])} Instead
          </button>
          <button class="gritrecon-btn gritrecon-btn-dark" id="gritrecon-clear-pin-btn">
            🗑️ Clear
          </button>
        </div>
      </div>
    `;
  }

  if (activeTab === 'grades') {
    return `
      <div class="gritrecon-tab-pane">
        <div class="gritrecon-pane-header">Grade Distribution (UMBC Official)</div>
        <div class="gritrecon-bar-container">
          <div class="gritrecon-bar-segment a-grade" style="width: ${gradeDist.aPercent}%" title="A: ${gradeDist.aPercent}%"></div>
          <div class="gritrecon-bar-segment b-grade" style="width: ${gradeDist.bPercent}%" title="B: ${gradeDist.bPercent}%"></div>
          <div class="gritrecon-bar-segment c-grade" style="width: ${gradeDist.cPercent}%" title="C: ${gradeDist.cPercent}%"></div>
          <div class="gritrecon-bar-segment d-grade" style="width: ${gradeDist.dPercent}%" title="D: ${gradeDist.dPercent}%"></div>
          <div class="gritrecon-bar-segment f-grade" style="width: ${gradeDist.fPercent}%" title="F: ${gradeDist.fPercent}%"></div>
        </div>
        <div class="gritrecon-legend">
          <span class="legend-item"><span class="dot a"></span> A: ${gradeDist.aPercent}%</span>
          <span class="legend-item"><span class="dot b"></span> B: ${gradeDist.bPercent}%</span>
          <span class="legend-item"><span class="dot c"></span> C: ${gradeDist.cPercent}%</span>
          <span class="legend-item"><span class="dot d"></span> D: ${gradeDist.dPercent}%</span>
          <span class="legend-item"><span class="dot f"></span> F: ${gradeDist.fPercent}%</span>
        </div>
        <div class="gritrecon-risk-section">
          <div class="gritrecon-pane-header">Student Risk Matrix</div>
          <div class="gritrecon-risk-container">
            ${renderRiskBadges(data.riskFlags) || '<span class="gritrecon-sub">✅ Clean Record: No high-risk warnings detected.</span>'}
          </div>
        </div>
      </div>
    `;
  }

  if (activeTab === 'reviews') {
    const reviewsHtml = data.recentReviews && data.recentReviews.length > 0
      ? data.recentReviews.map(r => `
          <div class="gritrecon-review">
            <div class="gritrecon-review-meta">
              <span class="gritrecon-source ${escapeHTML(r.source.toLowerCase())}">${escapeHTML(r.source)}</span>
              <span class="gritrecon-review-grade">Grade: ${escapeHTML(r.gradeReceived || 'N/A')}</span>
            </div>
            <p class="gritrecon-review-text">"${escapeHTML(r.text)}"</p>
          </div>
        `).join('')
      : `<div class="gritrecon-empty">No written review comments recorded.</div>`;

    return `
      <div class="gritrecon-tab-pane">
        <div class="gritrecon-reviews">
          ${reviewsHtml}
        </div>
      </div>
    `;
  }

  // Default: Overview Tab
  const takeAgainDisplay = data.wouldTakeAgain === -1 ? 'N/A' : `${data.wouldTakeAgain}%`;
  const passRateDisplay = data.passRate && data.passRate > 0 ? `${data.passRate}%` : 'N/A';
  const isPinned = pinnedProfA && pinnedProfA.fullName.toLowerCase() === data.fullName.toLowerCase();

  return `
    <div class="gritrecon-tab-pane">
      <div class="gritrecon-stats">
        <div class="gritrecon-stat" title="Course difficulty rated from 1 (Very Easy) to 5 (Extremely Hard)">
          <span class="gritrecon-stat-value gold-text">${data.difficulty != null && data.difficulty !== 0 ? data.difficulty : 'N/A'}/5</span>
          <span class="gritrecon-stat-label">Difficulty ℹ️</span>
        </div>
        <div class="gritrecon-stat" title="Percentage of surveyed students who would take another class with this instructor">
          <span class="gritrecon-stat-value">${takeAgainDisplay}</span>
          <span class="gritrecon-stat-label">Take Again ℹ️</span>
        </div>
        <div class="gritrecon-stat" title="Percentage of students earning a passing grade (C or higher) in UMBC records">
          <span class="gritrecon-stat-value highlight">${passRateDisplay}</span>
          <span class="gritrecon-stat-label">Pass Rate ℹ️</span>
        </div>
      </div>

      <div class="gritrecon-info-banner">
        <span>💡 <strong>Student Tip:</strong> Avg Grade shows historical grade awarded by this instructor at UMBC (4.0 GPA scale).</span>
      </div>

      <div class="gritrecon-quick-preview">
        <div class="gritrecon-risk-pills">
          ${renderRiskBadges(data.riskFlags)}
        </div>
        ${data.recentReviews && data.recentReviews.length > 0 ? `
          <div class="gritrecon-featured-review">
            <span class="gritrecon-review-quote-icon">“</span>
            <span class="gritrecon-review-snippet">${escapeHTML(data.recentReviews[0].text.slice(0, 120))}${data.recentReviews[0].text.length > 120 ? '...' : ''}</span>
          </div>
        ` : ''}
      </div>

      <div class="gritrecon-action-row">
        <button class="gritrecon-btn gritrecon-btn-gold" id="gritrecon-pin-current-btn">
          ${isPinned ? '📌 Pinned as Prof A' : '⚖️ Compare Professor'}
        </button>
        <button class="gritrecon-btn gritrecon-btn-dark" id="gritrecon-refresh-btn" title="Force Refresh">
          🔄 Sync
        </button>
      </div>
    </div>
  `;
}

// Attach Tab & Comparison Events
function attachTabEvents(name, x, y) {
  const modal = getOrCreatePopup();
  modal.querySelectorAll('.gritrecon-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      activeTab = btn.getAttribute('data-tab');
      renderModalBody(name, x, y);
    });
  });

  document.getElementById('gritrecon-close-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    modal.style.display = 'none';
  });

  // Compare Pinning Event
  document.getElementById('gritrecon-pin-current-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentIntelData) {
      pinnedProfA = currentIntelData;
      activeTab = 'compare';
      renderModalBody(name, x, y);
    }
  });

  document.getElementById('gritrecon-clear-pin-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    pinnedProfA = null;
    activeTab = 'overview';
    renderModalBody(name, x, y);
  });

  document.getElementById('gritrecon-refresh-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    showPopup(name, x, y, true);
  });
}

// Render complete modal UI in clean UMBC Black and Gold
function renderModalBody(name, x, y) {
  const modal = getOrCreatePopup();
  if (!currentIntelData) return;

  const data = currentIntelData;
  const isPoorGrade = ['C', 'D', 'F'].some((g) => (data.averageGrade || '').includes(g));
  const gradeDisplay = data.averageGrade && data.averageGrade !== 'N/A' 
    ? `${escapeHTML(data.averageGrade)} ${data.gpa ? `(${data.gpa.toFixed(2)})` : ''}` 
    : 'N/A';

  const logoUrl = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('Logo.png') : '';

  modal.innerHTML = `
    <div class="gritrecon-card">
      <div class="gritrecon-header">
        <div class="gritrecon-brand-container">
          ${logoUrl ? `<img class="gritrecon-header-logo" src="${logoUrl}" alt="GritRecon Logo" />` : ''}
          <div class="gritrecon-name-container">
            <h3 class="gritrecon-title">${escapeHTML(data.fullName)}</h3>
            <span class="gritrecon-sub">
              ${pinnedProfA && pinnedProfA.fullName !== data.fullName ? `vs 📌 ${escapeHTML(pinnedProfA.fullName.split(' ')[0])}` : 'UMBC Faculty Intel'}
            </span>
          </div>
        </div>
        <div class="gritrecon-header-right">
          <div class="gritrecon-grade-container" title="Historical Average Grade &amp; GPA given by this instructor at UMBC">
            <span class="gritrecon-grade-caption">AVG GRADE</span>
            <span class="gritrecon-grade ${isPoorGrade ? 'poor' : ''}">${gradeDisplay}</span>
          </div>
          <button class="gritrecon-close" id="gritrecon-close-btn">&times;</button>
        </div>
      </div>

      <!-- Clean Tab Bar -->
      <div class="gritrecon-tabs">
        <button class="gritrecon-tab-btn ${activeTab === 'overview' ? 'active' : ''}" data-tab="overview">Overview</button>
        <button class="gritrecon-tab-btn ${activeTab === 'grades' ? 'active' : ''}" data-tab="grades">Grades</button>
        <button class="gritrecon-tab-btn ${activeTab === 'reviews' ? 'active' : ''}" data-tab="reviews">Reviews (${data.recentReviews?.length || 0})</button>
        <button class="gritrecon-tab-btn ${activeTab === 'compare' ? 'active' : ''}" data-tab="compare">⚖️ Compare ${pinnedProfA ? ' (1)' : ''}</button>
      </div>

      <!-- Active Tab Pane -->
      ${renderTabContent(data)}
    </div>
  `;

  attachTabEvents(name, x, y);
  positionElement(modal, x, y, modal.offsetWidth || 430, modal.offsetHeight || 370);
}

// Fetch and show popup modal overlay
async function showPopup(name, x, y, force = false) {
  const modal = getOrCreatePopup();
  modal.style.display = 'block';
  positionElement(modal, x, y, 430, 370);

  // Auto-switch to compare tab if Prof A is already pinned and we're looking at a different prof
  if (pinnedProfA && pinnedProfA.fullName.toLowerCase() !== name.toLowerCase() && activeTab === 'overview') {
    activeTab = 'compare';
  }

  const logoUrl = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('Logo.png') : '';

  modal.innerHTML = `
    <div class="gritrecon-card">
      <div class="gritrecon-header-top">
        <div class="gritrecon-badge-with-logo">
          ${logoUrl ? `<img class="gritrecon-badge-logo" src="${logoUrl}" alt="GritRecon Logo" />` : ''}
          <span class="gritrecon-badge">UMBC GRITRECON</span>
        </div>
        <button class="gritrecon-close" id="gritrecon-close-btn">&times;</button>
      </div>
      <div class="gritrecon-loader">
        <div class="gritrecon-spinner"></div>
        <span>Decrypting Intel for "${escapeHTML(name)}"...</span>
      </div>
    </div>
  `;

  document.getElementById('gritrecon-close-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    modal.style.display = 'none';
  });

  try {
    const url = `http://localhost:3000/api/recon?name=${encodeURIComponent(name)}${force ? '&force=true' : ''}`;
    const res = await fetch(url);
    
    if (!res.ok) {
      const errJson = await res.json().catch(() => null);
      throw new Error(errJson?.error || 'Intel search failed');
    }

    currentIntelData = await res.json();
    renderModalBody(name, x, y);

  } catch (error) {
    modal.innerHTML = `
      <div class="gritrecon-card">
        <div class="gritrecon-header-top">
          <div class="gritrecon-badge-with-logo">
            ${logoUrl ? `<img class="gritrecon-badge-logo" src="${logoUrl}" alt="GritRecon Logo" />` : ''}
            <span class="gritrecon-badge error">GritRecon Error</span>
          </div>
          <button class="gritrecon-close" id="gritrecon-close-btn">&times;</button>
        </div>
        <div class="gritrecon-error-container">
          <div class="gritrecon-error-icon">⚠️</div>
          <div class="gritrecon-error-title">${escapeHTML(error.message || 'Intel Not Found')}</div>
          <div class="gritrecon-error-sub">No evaluation records found for "${escapeHTML(name)}". Highlight the full professor name on the registration portal.</div>
        </div>
      </div>
    `;

    document.getElementById('gritrecon-close-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      modal.style.display = 'none';
    });
  }
}