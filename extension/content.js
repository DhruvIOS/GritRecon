let reconButton = null;
let popup = null;
let selectedName = '';
let currentIntelData = null;
let pinnedProfA = null; // Stored professor for side-by-side comparison
let activeTab = 'overview'; // 'overview', 'grades', 'reviews', 'compare', 'saved'
let favoritesCache = {}; // Local memory cache for favorited professors
let clientIntelCache = {}; // In-memory client cache to prevent redundant backend/API calls

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

// Local Storage Helpers for Zero-Login Privacy-First Favorites
function loadFavorites(callback) {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['gritrecon_favorites'], (result) => {
      favoritesCache = result.gritrecon_favorites || {};
      if (callback) callback(favoritesCache);
    });
  } else {
    try {
      const raw = localStorage.getItem('gritrecon_favorites');
      favoritesCache = raw ? JSON.parse(raw) : {};
    } catch (e) {
      favoritesCache = {};
    }
    if (callback) callback(favoritesCache);
  }
}

function isFavorite(profName) {
  if (!profName) return false;
  const key = profName.trim().toLowerCase();
  return !!favoritesCache[key];
}

function toggleFavorite(profData, callback) {
  if (!profData || !profData.fullName) return;
  const key = profData.fullName.trim().toLowerCase();

  if (favoritesCache[key]) {
    delete favoritesCache[key];
  } else {
    favoritesCache[key] = {
      fullName: profData.fullName,
      gpa: profData.gpa || 0,
      averageGrade: profData.averageGrade || 'N/A',
      difficulty: profData.difficulty ?? 0,
      wouldTakeAgain: profData.wouldTakeAgain ?? -1,
      passRate: profData.passRate || 0,
      savedAt: Date.now()
    };
  }

  const saveDone = (isFav) => {
    if (callback) callback(isFav);
    // Refresh inline table badges to update star indicators
    const injectedBadges = document.querySelectorAll('.gritrecon-inline-pill');
    injectedBadges.forEach(btn => btn.removeAttribute('data-gritrecon-injected'));
    autoScanAndInjectBadges();
  };

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({ gritrecon_favorites: favoritesCache }, () => {
      saveDone(isFavorite(profData.fullName));
    });
  } else {
    try {
      localStorage.setItem('gritrecon_favorites', JSON.stringify(favoritesCache));
    } catch (e) {}
    saveDone(isFavorite(profData.fullName));
  }
}

// Initialize favorites on script load
loadFavorites();

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

// Check if current page is an active course registration or catalog portal
function isCourseRegistrationContext() {
  const url = window.location.href.toLowerCase();
  return (
    url.includes('csprd-web.ps.umbc.edu') ||
    url.includes('sa.umbc.edu') ||
    url.includes('ssr_clsrch') ||
    url.includes('schedulebuilder') ||
    url.includes('highpoint') ||
    url.includes('catalog.umbc.edu') ||
    url.includes('classsearch') ||
    url.includes('registration')
  );
}

// Strict smart filter to ensure selected text is a valid professor name and not pronouns/student info
function isValidProfessorName(text) {
  if (!text) return false;
  // Clean trailing dots/ellipsis e.g. "Enis Golas..." -> "Enis Golas"
  const clean = text.replace(/[\.\s]+$/, '').trim();
  if (clean.length < 3 || clean.length > 40) return false;
  if (/\d|@|https?:\/\/|[{}[\]<>\\=+\/*#]/i.test(clean)) return false;

  // Reject pronouns & gender identifiers (e.g. (he/him), (she/her), (they/them))
  if (/\((he|she|they)\/(him|her|them)\)/i.test(clean) || /he\/him|she\/her|they\/them/i.test(clean)) return false;

  // Reject common course codes, table headers & non-professor keywords
  const blockedTerms = [
    'ifsm', 'cmsc', 'is', 'stat', 'math', 'biol', 'chem', 'phys', 'engl', 'hist', 'psyc', 'socy', 'econ', 'mgmt',
    'student', 'undergraduate', 'graduate', 'major', 'minor', 'adviser', 'advisor', 'campus', 'building', 'room',
    'term', 'semester', 'section', 'units', 'credits', 'lecture', 'discussion', 'lab', 'topic', 'staff', 'tba',
    'instruction', 'mode', 'location', 'days', 'times', 'meeting', 'dates', 'status', 'component', 'session',
    'career', 'grading', 'class', 'number', 'attribute', 'requirement', 'description', 'catalog', 'subject'
  ];

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;

  for (const w of words) {
    const sanitized = w.toLowerCase().replace(/[^a-z]/g, '');
    if (blockedTerms.includes(sanitized)) return false;
  }

  // Ensure first & last words start with capital letters
  const firstWord = words[0].replace(/[^a-zA-Z]/g, '');
  const lastWord = words[words.length - 1].replace(/[^a-zA-Z]/g, '');
  if (!/^[A-Z][a-zA-Z'\-]+$/.test(firstWord) || !/^[A-Z][a-zA-Z'\-]+$/.test(lastWord)) {
    return false;
  }

  return true;
}

// Automatic DOM Scanner: Inject inline "⚡ Recon" badges next to professor names on UMBC registration tables
function autoScanAndInjectBadges() {
  if (!isCourseRegistrationContext()) return;

  const candidateNodes = [];

  // 1. HighPoint & Modern Schedule Table Scanner (Find column titled INSTRUCTOR)
  const allHeaders = document.querySelectorAll('th, [role="columnheader"], .header, .table-header, td');
  allHeaders.forEach((header) => {
    const hText = (header.textContent || '').trim().toUpperCase();
    if (hText === 'INSTRUCTOR' || (hText.includes('INSTRUCTOR') && !hText.includes('MODE'))) {
      const row = header.parentElement;
      const table = header.closest('table, [role="table"], tbody, .grid');
      if (row && table) {
        const children = Array.from(row.children);
        const colIdx = children.indexOf(header);
        if (colIdx !== -1) {
          const rows = table.querySelectorAll('tr, [role="row"]');
          rows.forEach((r) => {
            if (r !== row && r.children && r.children[colIdx]) {
              candidateNodes.push(r.children[colIdx]);
            }
          });
        }
      }
    }
  });

  // 2. CSS Selectors for PeopleSoft, HighPoint, and Custom Portals
  const instructorSelectors = [
    'span[id*="DERIVED_CLSRCH_SSR_INSTR_LONG"]',
    'span[id*="MTG_INSTR"]',
    'span[id*="SSR_INSTR"]',
    'td.ps_grid-cell[id*="INSTR_LONG"]',
    '[id*="INSTR_LONG"]',
    '.instructor-name',
    '[class*="instructor"]',
    '[class*="Instructor"]',
    '[id*="instructor"]',
    '[id*="Instructor"]',
    '[data-th*="Instructor"]',
    '[data-label*="Instructor"]',
    '[data-heading*="Instructor"]',
    '[data-property*="instructor"]'
  ];

  const selectorNodes = document.querySelectorAll(instructorSelectors.join(','));
  selectorNodes.forEach((node) => candidateNodes.push(node));

  // Deduplicate
  const uniqueNodes = Array.from(new Set(candidateNodes));

  uniqueNodes.forEach((node) => {
    if (node.getAttribute('data-gritrecon-injected') === 'true') return;

    // Ignore headers or elements with INSTRUCTION_MODE in id or class
    const nodeAttr = ((node.id || '') + ' ' + (node.className || '')).toUpperCase();
    if (nodeAttr.includes('INSTRUCTION_MODE') || nodeAttr.includes('INSTR_MODE')) return;

    const rawText = node.textContent ? node.textContent.trim() : '';
    if (!rawText || rawText.toLowerCase().includes('staff') || rawText.toLowerCase().includes('tba')) return;

    // Clean trailing ellipsis or dots e.g. "Enis Golas..." -> "Enis Golas"
    let profName = rawText.replace(/[\.\s]+$/, '').trim();
    if (profName.includes(',')) {
      const parts = profName.split(',').map(s => s.trim());
      if (parts.length >= 2) {
        profName = `${parts[1]} ${parts[0]}`;
      }
    }

    if (!isValidProfessorName(profName)) return;

    node.setAttribute('data-gritrecon-injected', 'true');

    const logoUrl = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('Logo.png') : '';
    const favorited = isFavorite(profName);

    const badge = document.createElement('button');
    badge.className = `gritrecon-inline-pill ${favorited ? 'gritrecon-fav-pill' : ''}`;
    badge.title = favorited 
      ? `⭐ Favorited Professor - Click to inspect intel for ${profName}` 
      : `Click to inspect GritRecon intel for ${profName}`;
    
    const starHtml = favorited ? `<span class="gritrecon-pill-star" title="Favorited Professor">⭐</span>` : '';
    const imgHtml = logoUrl 
      ? `<img src="${logoUrl}" class="gritrecon-pill-logo-img" alt="GritRecon" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='inline-block';" />`
      : '';
    const fallbackIcon = `<span class="gritrecon-pill-icon" style="${logoUrl ? 'display:none;' : ''}">⚡</span>`;

    badge.innerHTML = `${starHtml}${imgHtml}${fallbackIcon}<span class="gritrecon-pill-label">Recon</span>`;

    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = badge.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset || 0;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      showPopup(profName, rect.left + scrollX, rect.bottom + scrollY);
    });

    node.appendChild(badge);
  });
}

// Periodically run auto-scanner on registration pages
if (typeof window !== 'undefined') {
  setInterval(autoScanAndInjectBadges, 1500);
  document.addEventListener('DOMContentLoaded', autoScanAndInjectBadges);
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

// Show action button on text selection with strict smart filters
document.addEventListener('mouseup', (e) => {
  if (popup && popup.contains(e.target)) return;
  if (reconButton && reconButton.contains(e.target)) return;
  // Strictly enforce: ONLY trigger floating selection button inside UMBC Registration / Catalog portals!
  if (!isCourseRegistrationContext()) return;

  const selection = window.getSelection();
  const text = selection ? selection.toString().trim() : '';
  if (!isValidProfessorName(text)) return;

  selectedName = text;
  
  const btn = getOrCreateButton();
  btn.style.display = 'flex';
  positionElement(btn, e.pageX, e.pageY - 42, 140, 42);
});

// Render UMBC Gold Risk Badges
function renderRiskBadges(riskFlags) {
  if (!riskFlags || riskFlags.length === 0) return '';

  const badgeMap = {
    NO_RMP_DATA: { label: 'ℹ️ No RMP Profile', cls: 'warning', title: 'Instructor not listed on RateMyProfessors under UMBC' },
    NO_REGISTRAR_DATA: { label: 'ℹ️ No Grade Record', cls: 'warning', title: 'No historical UMBC registrar grade distribution recorded' },
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
          ${gradeDist.oPercent ? `<div class="gritrecon-bar-segment o-grade" style="width: ${gradeDist.oPercent}%" title="Other/W/P: ${gradeDist.oPercent}%"></div>` : ''}
        </div>
        <div class="gritrecon-legend">
          <span class="legend-item"><span class="dot a"></span> A: ${gradeDist.aPercent}%</span>
          <span class="legend-item"><span class="dot b"></span> B: ${gradeDist.bPercent}%</span>
          <span class="legend-item"><span class="dot c"></span> C: ${gradeDist.cPercent}%</span>
          <span class="legend-item"><span class="dot d"></span> D: ${gradeDist.dPercent}%</span>
          <span class="legend-item"><span class="dot f"></span> F: ${gradeDist.fPercent}%</span>
          ${gradeDist.oPercent ? `<span class="legend-item"><span class="dot o"></span> Other: ${gradeDist.oPercent}%</span>` : ''}
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

  if (activeTab === 'saved') {
    const savedList = Object.values(favoritesCache).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));

    if (savedList.length === 0) {
      return `
        <div class="gritrecon-tab-pane text-center py-4">
          <div class="gritrecon-empty-saved-icon">⭐</div>
          <div class="gritrecon-empty-title">No Saved Professors Yet</div>
          <div class="gritrecon-sub mb-3">Click the star icon (☆) in any professor's profile header to shortlist them for course registration!</div>
        </div>
      `;
    }

    return `
      <div class="gritrecon-tab-pane gritrecon-saved-pane">
        <div class="gritrecon-saved-header">
          <span>Shortlisted Professors (${savedList.length})</span>
        </div>
        <div class="gritrecon-saved-grid">
          ${savedList.map(prof => `
            <div class="gritrecon-saved-card">
              <div class="gritrecon-saved-info">
                <div class="gritrecon-saved-name">${escapeHTML(prof.fullName)}</div>
                <div class="gritrecon-saved-stats">
                  <span class="gritrecon-saved-stat">GPA: <strong>${prof.gpa ? prof.gpa.toFixed(2) : 'N/A'}</strong> (${escapeHTML(prof.averageGrade)})</span>
                  <span class="gritrecon-saved-stat">Diff: <strong>${prof.difficulty ? prof.difficulty.toFixed(1) : 'N/A'}/5</strong></span>
                  <span class="gritrecon-saved-stat">Again: <strong>${prof.wouldTakeAgain >= 0 ? prof.wouldTakeAgain + '%' : 'N/A'}</strong></span>
                </div>
              </div>
              <div class="gritrecon-saved-actions">
                <button class="gritrecon-btn-icon-only gritrecon-view-saved-btn" data-name="${escapeHTML(prof.fullName)}" title="Inspect Intel">
                  🔍
                </button>
                <button class="gritrecon-btn-icon-only gritrecon-remove-saved-btn" data-name="${escapeHTML(prof.fullName)}" title="Remove from Saved">
                  ✕
                </button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Default: Overview Tab
  const takeAgainDisplay = data.wouldTakeAgain === -1 ? 'N/A' : `${data.wouldTakeAgain}%`;
  const passRateDisplay = data.passRate && data.passRate > 0 ? `${data.passRate}%` : 'N/A';
  const isPinned = pinnedProfA && pinnedProfA.fullName.toLowerCase() === data.fullName.toLowerCase();

  let sourceNotice = '💡 <strong>Data Source:</strong> Gritview &amp; RateMyProfessors (Aggregated UMBC Intel)';
  if (data.hasRmpData === false && data.hasGritviewData !== false) {
    sourceNotice = 'ℹ️ <strong>Data Source:</strong> Gritview Only (Instructor not found on RateMyProfessors)';
  } else if (data.hasGritviewData === false && data.hasRmpData !== false) {
    sourceNotice = 'ℹ️ <strong>Data Source:</strong> RateMyProfessors Only (No UMBC Registrar grade record found)';
  }

  const rmpUrl = data.rmpUrl || `https://www.ratemyprofessors.com/search/professors?q=${encodeURIComponent(data.fullName)}`;
  const gritviewUrl = data.gritviewUrl || `https://gritview.io/professor?name=${encodeURIComponent(data.fullName)}`;

  return `
    <div class="gritrecon-tab-pane">
      <div class="gritrecon-stats">
        <div class="gritrecon-stat" title="Course difficulty rated from 1 (Very Easy) to 5 (Extremely Hard)">
          <span class="gritrecon-stat-value gold-text">${data.difficulty != null && data.difficulty !== 0 ? `${data.difficulty}/5` : 'N/A'}</span>
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
        <div class="gritrecon-source-text">${sourceNotice}</div>
        <div class="gritrecon-verify-links">
          <a href="${escapeHTML(rmpUrl)}" target="_blank" rel="noopener noreferrer" class="gritrecon-verify-badge" title="Verify on RateMyProfessors">
            RateMyProfessors ↗
          </a>
          <a href="${escapeHTML(gritviewUrl)}" target="_blank" rel="noopener noreferrer" class="gritrecon-verify-badge" title="Verify on GritView">
            GritView ↗
          </a>
        </div>
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

  // Favorite Star Toggle Event
  document.getElementById('gritrecon-fav-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (currentIntelData) {
      toggleFavorite(currentIntelData, () => {
        renderModalBody(name, x, y);
      });
    }
  });

  // Saved List Actions
  modal.querySelectorAll('.gritrecon-view-saved-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const profName = btn.getAttribute('data-name');
      if (profName) {
        activeTab = 'overview';
        showPopup(profName, x, y);
      }
    });
  });

  modal.querySelectorAll('.gritrecon-remove-saved-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const profName = btn.getAttribute('data-name');
      if (profName) {
        toggleFavorite({ fullName: profName }, () => {
          renderModalBody(name, x, y);
        });
      }
    });
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
  const isFav = isFavorite(data.fullName);
  const favCount = Object.keys(favoritesCache).length;

  modal.innerHTML = `
    <div class="gritrecon-card">
      <div class="gritrecon-header">
        <div class="gritrecon-brand-container">
          ${logoUrl ? `<img class="gritrecon-header-logo" src="${logoUrl}" alt="GritRecon Logo" />` : ''}
          <div class="gritrecon-name-container">
            <div class="gritrecon-title-row">
              <h3 class="gritrecon-title">${escapeHTML(data.fullName)}</h3>
              <button class="gritrecon-fav-star-btn ${isFav ? 'active' : ''}" id="gritrecon-fav-btn" title="${isFav ? 'Remove from Saved' : 'Save to Favorites'}">
                <span class="gritrecon-fav-star-icon">${isFav ? '★' : '☆'}</span>
              </button>
            </div>
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
        <button class="gritrecon-tab-btn ${activeTab === 'saved' ? 'active' : ''}" data-tab="saved">⭐ Saved (${favCount})</button>
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

  const cacheKey = name.trim().toLowerCase();

  // Instant Client Cache Lookup (0ms response, 0 network requests)
  if (!force && clientIntelCache[cacheKey]) {
    currentIntelData = clientIntelCache[cacheKey];
    renderModalBody(name, x, y);
    return;
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
    if (currentIntelData) {
      clientIntelCache[cacheKey] = currentIntelData;
    }
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