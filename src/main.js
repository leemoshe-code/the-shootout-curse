import { shootoutData as rawData } from './data.js';
import './style.css';

/* ═══════════════════════════════════════════
   State
   ═══════════════════════════════════════════ */
// Filter to Men's World Cups only — women's height distributions skew the analysis
const WOMENS_YEARS = new Set([1991, 1995, 1999, 2003, 2007, 2011, 2015, 2019, 2023]);
const shootoutData = rawData.filter((k) => !WOMENS_YEARS.has(k.year));

let filteredKicks = [...shootoutData];
let currentPage = 1;
const PAGE_SIZE = 10;
const IS_MOBILE = () => window.innerWidth < 640;

/* ═══════════════════════════════════════════
   DOM Refs
   ═══════════════════════════════════════════ */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// Simulator
const simPosition = $('#sim-position');
const simHeight = $('#sim-height');
const simHeightVal = $('#sim-height-val');
const simProb = $('#sim-prob');
const simTag = $('#sim-tag');
const btnSimulate = $('#btn-simulate');
const ball = $('#ball');
const goalkeeper = $('#goalkeeper');
const outcomeBanner = $('#outcome-banner');

// Filters
const filterSearch = $('#filter-search');
const btnClearSearch = $('#btn-clear-search');
const filterPosition = $('#filter-position');
const filterHeight = $('#filter-height');
const filterOutcome = $('#filter-outcome');
const btnFilters = $('#btn-filters');
const filtersPanel = $('#filters-panel');

// Height Helper: Converts centimeters to standard feet/inches format
function cmToFtIn(cm) {
  const totalInches = Math.round(cm / 2.54);
  const ft = Math.floor(totalInches / 12);
  const in_ = totalInches % 12;
  return `${ft}'${in_}"`;
}

// Table / Cards
const tableBody = $('#table-body');
const cardsList = $('#cards-list');
const pageInfo = $('#page-info');
const pageNum = $('#page-num');
const btnPrev = $('#btn-prev');
const btnNext = $('#btn-next');

// Tooltip
const tooltip = $('#scatter-tooltip');

/* ═══════════════════════════════════════════
   Init
   ═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  setupScrollReveals();
  setupEventListeners();
  computeStats();
  updateSimulatorProb();
  renderCharts();
  renderScatter();
  applyFilters();
});

/* ═══════════════════════════════════════════
   Scroll Reveal via IntersectionObserver
   ═══════════════════════════════════════════ */
function setupScrollReveals() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          // Animate counters when stat cards come into view
          if (entry.target.classList.contains('stat-card')) {
            animateCounter(entry.target);
          }
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
  );

  $$('.reveal').forEach((el) => observer.observe(el));
}

/* ═══════════════════════════════════════════
   Animated Counters
   ═══════════════════════════════════════════ */
function animateCounter(card) {
  const el = card.querySelector('.stat-number');
  if (!el) return;

  const target = parseFloat(el.dataset.target);
  const suffix = el.dataset.suffix || '';
  const isFloat = String(target).includes('.');
  const duration = 1200;
  const startTime = performance.now();

  function update(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    // Ease-out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    const current = eased * target;

    el.textContent = isFloat
      ? current.toFixed(1) + suffix
      : Math.round(current) + suffix;

    if (progress < 1) requestAnimationFrame(update);
  }

  requestAnimationFrame(update);
}

/* ═══════════════════════════════════════════
   Event Listeners
   ═══════════════════════════════════════════ */
function setupEventListeners() {
  // Simulator
  simPosition.addEventListener('change', updateSimulatorProb);
  simHeight.addEventListener('input', () => {
    updateSimulatorProb();
  });
  btnSimulate.addEventListener('click', runSimulation);

  // Filter toggle
  btnFilters.addEventListener('click', () => {
    const open = filtersPanel.hidden;
    filtersPanel.hidden = !open;
    btnFilters.setAttribute('aria-expanded', String(open));
  });

  // Filter clear search action
  btnClearSearch.addEventListener('click', () => {
    filterSearch.value = '';
    btnClearSearch.hidden = true;
    filterSearch.focus();
    applyFilters();
  });

  // Filter changes
  [filterSearch, filterPosition, filterHeight, filterOutcome].forEach((el) => {
    el.addEventListener(el.type === 'search' || el.tagName === 'INPUT' ? 'input' : 'change', () => {
      if (el === filterSearch) {
        btnClearSearch.hidden = !filterSearch.value;
      }
      currentPage = 1;
      applyFilters();
    });
  });

  // Pagination
  btnPrev.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderData(); }
  });
  btnNext.addEventListener('click', () => {
    const total = Math.ceil(filteredKicks.length / PAGE_SIZE) || 1;
    if (currentPage < total) { currentPage++; renderData(); }
  });

  // Dismiss scatter tooltip on outside tap
  document.addEventListener('click', (e) => {
    if (!e.target.classList.contains('scatter-dot')) {
      dismissTooltip();
    }
  });
}

/* ═══════════════════════════════════════════
   Compute Stats
   ═══════════════════════════════════════════ */
function computeStats() {
  const total = shootoutData.length;
  const scored = shootoutData.filter((k) => k.converted).length;
  const rate = ((scored / total) * 100).toFixed(1);

  // Update counter targets (they animate on scroll reveal)
  const counterTotal = $('#counter-total');
  const counterRate = $('#counter-rate');
  counterTotal.dataset.target = total;
  counterRate.dataset.target = rate;

  // Update detail text
  $('#stat-rate-detail').textContent = `${scored} Scored · ${total - scored} Missed`;

  // Worst group: Very Tall Defenders
  const vtDef = shootoutData.filter((k) => k.position === 'DF' && k.height >= 190);
  const vtScored = vtDef.filter((k) => k.converted).length;
  const vtRate = ((vtScored / vtDef.length) * 100).toFixed(1);

  $('#counter-worst').dataset.target = vtRate;
  $('#stat-worst-detail').textContent = `Very Tall Defenders ≥6'3" / 190cm (${vtScored}/${vtDef.length})`;
}

/* ═══════════════════════════════════════════
   Simulator
   ═══════════════════════════════════════════ */
function calcProb(position, height) {
  let base = 0.681; // All Positions average (68.1%)
  if (position === 'FW') base = 0.740;
  if (position === 'MF') base = 0.664;
  if (position === 'DF') base = 0.634;

  const penalty = (height - 180) * 0.0032;
  return Math.max(0.50, Math.min(0.85, base - penalty));
}

function updateSimulatorProb() {
  const pos = simPosition.value;
  const h = parseInt(simHeight.value);
  const prob = calcProb(pos, h);

  simProb.textContent = `${(prob * 100).toFixed(1)}%`;
  simHeightVal.textContent = `${cmToFtIn(h)} (${h} cm)`;

  let hTag = h < 175 ? 'Short' : h < 185 ? 'Average' : h < 190 ? 'Tall' : 'Very Tall';
  let pTag = pos === 'FW' ? 'Forward' : pos === 'MF' ? 'Midfielder' : pos === 'DF' ? 'Defender' : 'Player';
  simTag.textContent = `${hTag} ${pTag}`;
  simTag.classList.toggle('danger', h >= 190 && (pos === 'DF' || pos === 'all'));
}

function runSimulation() {
  btnSimulate.disabled = true;

  const prob = calcProb(simPosition.value, parseInt(simHeight.value));
  const isGoal = Math.random() < prob;

  // Reset
  ball.className = 'ball';
  goalkeeper.style.left = '45%';
  goalkeeper.style.bottom = '0';
  outcomeBanner.className = 'outcome-banner';
  outcomeBanner.textContent = '';
  void ball.offsetWidth; // force reflow

  const keeperDive = Math.floor(Math.random() * 3); // 0=L, 1=C, 2=R
  let ballDir, missType = 'save';

  if (isGoal) {
    const opts = [0, 1, 2].filter((d) => d !== keeperDive);
    ballDir = opts[Math.floor(Math.random() * opts.length)];
  } else {
    const r = Math.random();
    if (r < 0.5) {
      missType = 'save';
      ballDir = keeperDive === 1 ? (Math.random() < 0.5 ? 0 : 2) : keeperDive;
    } else if (r < 0.8) {
      missType = 'high';
      ballDir = 1;
    } else {
      missType = 'wide';
      ballDir = Math.random() < 0.5 ? 0 : 2;
    }
  }

  // Goalkeeper dive
  setTimeout(() => {
    if (keeperDive === 0) { goalkeeper.style.left = '16%'; goalkeeper.style.bottom = '10%'; }
    else if (keeperDive === 2) { goalkeeper.style.left = '74%'; goalkeeper.style.bottom = '10%'; }
    else { goalkeeper.style.bottom = '8%'; }
  }, 80);

  // Ball flight
  setTimeout(() => {
    if (isGoal) {
      ball.classList.add(ballDir === 0 ? 'ball--scored-left' : ballDir === 1 ? 'ball--scored-center' : 'ball--scored-right');
    } else if (missType === 'save') {
      ball.classList.add(ballDir === 0 ? 'ball--saved-left' : 'ball--saved-right');
    } else if (missType === 'high') {
      ball.classList.add('ball--missed-high');
    } else {
      ball.classList.add('ball--missed-wide');
    }
  }, 40);

  // Outcome banner
  setTimeout(() => {
    if (isGoal) {
      outcomeBanner.textContent = 'GOAL!';
      outcomeBanner.classList.add('show-scored');
    } else {
      outcomeBanner.textContent = missType === 'save' ? 'SAVED!' : missType === 'high' ? 'OVER THE BAR!' : 'WIDE!';
      outcomeBanner.classList.add('show-missed');
    }
    setTimeout(() => { btnSimulate.disabled = false; }, 1000);
  }, 550);
}

/* ═══════════════════════════════════════════
   Charts
   ═══════════════════════════════════════════ */
function renderCharts() {
  renderBarChart('chart-position', getPositionData(), [
    { color: '#34d399', glow: 'rgba(52, 211, 153, 0.3)' },
    { color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.3)' },
    { color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.3)' }
  ]);

  renderBarChart('chart-height', getHeightData(), [
    { color: '#34d399', glow: 'rgba(52, 211, 153, 0.3)' },
    { color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.3)' },
    { color: '#fbbf24', glow: 'rgba(251, 191, 36, 0.3)' },
    { color: '#fb7185', glow: 'rgba(251, 113, 133, 0.3)' }
  ]);
}

function getPositionData() {
  return [
    { label: 'Forwards', code: 'FW' },
    { label: 'Midfielders', code: 'MF' },
    { label: 'Defenders', code: 'DF' }
  ].map((p) => {
    const list = shootoutData.filter((k) => k.position === p.code);
    const scored = list.filter((k) => k.converted).length;
    return { label: p.label, rate: list.length ? (scored / list.length) * 100 : 0, count: `${scored}/${list.length}` };
  });
}

function getHeightData() {
  return [
    { label: 'Short (<5\'9")', min: 0, max: 174 },
    { label: 'Medium (5\'9"–6\'0")', min: 175, max: 184 },
    { label: 'Tall (6\'1"–6\'2")', min: 185, max: 189 },
    { label: 'Very Tall (≥6\'3")', min: 190, max: 999 }
  ].map((b) => {
    const list = shootoutData.filter((k) => k.height >= b.min && k.height <= b.max);
    const scored = list.filter((k) => k.converted).length;
    return { label: b.label, rate: list.length ? (scored / list.length) * 100 : 0, count: `${scored}/${list.length}` };
  });
}

function renderBarChart(containerId, data, colors) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const W = 380, H = 40 + data.length * 46;
  const pad = { top: 10, right: 30, bottom: 30, left: 112 };

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" role="presentation">`;

  // Grid lines
  for (let pct = 0; pct <= 100; pct += 25) {
    const x = pad.left + (pct / 100) * (W - pad.left - pad.right);
    svg += `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${H - pad.bottom}" class="chart-grid" />`;
    svg += `<text x="${x}" y="${H - pad.bottom + 16}" text-anchor="middle" class="chart-label" style="font-size:9px">${pct}%</text>`;
  }

  const barH = 28;
  const gap = 18;

  data.forEach((d, i) => {
    const y = pad.top + i * (barH + gap);
    const maxW = W - pad.left - pad.right;
    const barW = (d.rate / 100) * maxW;
    const color = colors[i] || colors[0];

    // Label
    svg += `<text x="${pad.left - 8}" y="${y + barH / 2 + 4}" text-anchor="end" class="chart-label" style="font-weight:600">${d.label}</text>`;

    // Background track
    svg += `<rect x="${pad.left}" y="${y}" width="${maxW}" height="${barH}" rx="6" fill="rgba(255,255,255,0.03)" />`;

    // Value bar (wrapped in a group for animation)
    svg += `<g class="chart-bar-animated" style="animation-delay:${i * 0.1}s">`;
    svg += `<rect x="${pad.left}" y="${y}" width="${barW}" height="${barH}" rx="6" fill="${color.color}" class="chart-bar" />`;
    svg += `</g>`;

    // Percentage text
    if (barW > 50) {
      svg += `<text x="${pad.left + barW - 6}" y="${y + barH / 2 + 4}" text-anchor="end" class="chart-value">${d.rate.toFixed(1)}%</text>`;
    } else {
      svg += `<text x="${pad.left + barW + 6}" y="${y + barH / 2 + 4}" class="chart-value">${d.rate.toFixed(1)}%</text>`;
    }

    // Count
    svg += `<text x="${pad.left + 6}" y="${y + barH / 2 + 4}" class="chart-count">${d.count}</text>`;
  });

  // Y-axis
  svg += `<line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${H - pad.bottom}" class="chart-axis" />`;
  svg += `</svg>`;

  container.innerHTML = svg;
}

/* ═══════════════════════════════════════════
   Scatter / Beeswarm
   ═══════════════════════════════════════════ */
function renderScatter() {
  const container = document.getElementById('chart-scatter');
  if (!container) return;
  container.innerHTML = '';

  const W = 800, H = 260;
  const pad = { top: 20, right: 20, bottom: 45, left: 35 };
  const minH = 160, maxH = 205;
  const rangeX = maxH - minH;

  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMidYMid meet" style="overflow:visible">`;

  // Grid lines
  for (let h = minH; h <= maxH; h += 5) {
    const x = pad.left + ((h - minH) / rangeX) * (W - pad.left - pad.right);
    svg += `<line x1="${x}" y1="${pad.top}" x2="${x}" y2="${H - pad.bottom}" class="chart-grid" />`;
    svg += `<text x="${x}" y="${H - pad.bottom + 18}" text-anchor="middle" class="chart-label" style="font-family:var(--font-mono);font-size:10px">${h}</text>`;
  }

  // X-axis
  svg += `<line x1="${pad.left}" y1="${H - pad.bottom}" x2="${W - pad.right}" y2="${H - pad.bottom}" class="chart-axis" />`;

  // Center divider
  const midY = pad.top + (H - pad.top - pad.bottom) / 2;
  svg += `<line x1="${pad.left}" y1="${midY}" x2="${W - pad.right}" y2="${midY}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4,4" />`;

  // "190cm" annotation line
  const anno190 = pad.left + ((190 - minH) / rangeX) * (W - pad.left - pad.right);
  svg += `<line x1="${anno190}" y1="${pad.top}" x2="${anno190}" y2="${H - pad.bottom}" stroke="rgba(244,63,94,0.2)" stroke-dasharray="3,3" />`;
  svg += `<text x="${anno190 + 4}" y="${pad.top + 12}" fill="rgba(244,63,94,0.5)" font-size="9" font-family="var(--font-mono)">190cm</text>`;

  // Bin dots by height
  const bins = {};
  shootoutData.forEach((item) => {
    if (!bins[item.height]) bins[item.height] = { scored: [], missed: [] };
    (item.converted ? bins[item.height].scored : bins[item.height].missed).push(item);
  });

  const dotR = 5;
  const vSpace = 11;

  Object.entries(bins).forEach(([hStr, bin]) => {
    const h = parseInt(hStr);
    const x = pad.left + ((h - minH) / rangeX) * (W - pad.left - pad.right);

    bin.scored.forEach((item, idx) => {
      const jitter = (idx % 2 === 0 ? -1.5 : 1.5) * (idx > 0 ? 1 : 0);
      const y = midY - 12 - idx * vSpace;
      svg += `<circle cx="${x + jitter}" cy="${y}" r="${dotR}" fill="var(--green-500)" stroke="var(--bg-base)" stroke-width="1.5" class="scatter-dot" opacity="0.75" data-info='${JSON.stringify(item)}' />`;
    });

    bin.missed.forEach((item, idx) => {
      const jitter = (idx % 2 === 0 ? -1.5 : 1.5) * (idx > 0 ? 1 : 0);
      const y = midY + 12 + idx * vSpace;
      svg += `<circle cx="${x + jitter}" cy="${y}" r="${dotR}" fill="var(--rose-500)" stroke="var(--bg-base)" stroke-width="1.5" class="scatter-dot" opacity="0.75" data-info='${JSON.stringify(item)}' />`;
    });
  });

  svg += `</svg>`;
  container.innerHTML = svg;

  // Attach events (supports both mouse and touch)
  const dots = container.querySelectorAll('.scatter-dot');
  dots.forEach((dot) => {
    dot.addEventListener('mouseenter', handleDotHover);
    dot.addEventListener('mousemove', handleDotMove);
    dot.addEventListener('mouseleave', handleDotLeave);
    // Touch support
    dot.addEventListener('click', handleDotTap);
  });
}

/* ─── Tooltip handlers ─── */
let activeDot = null;

function handleDotHover(e) {
  showTooltipFor(e.target, e.clientX, e.clientY);
}

function handleDotMove(e) {
  positionTooltip(e.clientX, e.clientY);
}

function handleDotLeave() {
  if (!('ontouchstart' in window)) dismissTooltip();
}

function handleDotTap(e) {
  e.stopPropagation();
  const dot = e.target;

  if (activeDot === dot) {
    dismissTooltip();
    return;
  }

  // Deselect previous
  if (activeDot) activeDot.classList.remove('active');

  activeDot = dot;
  dot.classList.add('active');

  const rect = dot.getBoundingClientRect();
  showTooltipFor(dot, rect.left + rect.width / 2, rect.top);
}

function showTooltipFor(dot, clientX, clientY) {
  const item = JSON.parse(dot.getAttribute('data-info'));

  const posName = item.position === 'FW' ? 'Forward' : item.position === 'MF' ? 'Midfielder' : 'Defender';
  const badge = item.converted
    ? '<span class="badge badge--scored">Scored</span>'
    : '<span class="badge badge--missed">Missed</span>';

  tooltip.innerHTML = `
    <div class="tooltip-name">${item.player}</div>
    <div class="tooltip-row"><span>Position</span><span class="tooltip-val">${posName}</span></div>
    <div class="tooltip-row"><span>Height</span><span class="tooltip-val">${cmToFtIn(item.height)} (${item.height} cm)</span></div>
    <div class="tooltip-row"><span>Team</span><span class="tooltip-val">${item.team}</span></div>
    <div class="tooltip-row"><span>Match</span><span class="tooltip-val" style="font-size:0.7rem">${item.match}</span></div>
    <div class="tooltip-row"><span>Year</span><span class="tooltip-val">${item.year}</span></div>
    <div class="tooltip-row" style="margin-top:6px"><span>Result</span><span>${badge}</span></div>
  `;

  tooltip.hidden = false;
  positionTooltip(clientX, clientY);
}

function positionTooltip(clientX, clientY) {
  const card = document.querySelector('.scatter-card');
  if (!card) return;
  const rect = card.getBoundingClientRect();
  let x = clientX - rect.left + 12;
  let y = clientY - rect.top - 50;

  // Prevent overflow off right edge
  const tooltipW = tooltip.offsetWidth || 220;
  if (x + tooltipW > rect.width) x = rect.width - tooltipW - 8;
  if (x < 0) x = 8;
  if (y < 0) y = clientY - rect.top + 16;

  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function dismissTooltip() {
  tooltip.hidden = true;
  if (activeDot) {
    activeDot.classList.remove('active');
    activeDot = null;
  }
}

/* ═══════════════════════════════════════════
   Filters & Data Rendering
   ═══════════════════════════════════════════ */
function applyFilters() {
  const search = filterSearch.value.trim().toLowerCase();
  const pos = filterPosition.value;
  const ht = filterHeight.value;
  const out = filterOutcome.value;

  filteredKicks = shootoutData.filter((k) => {
    if (search && !k.player.toLowerCase().includes(search)) return false;
    if (pos !== 'all' && k.position !== pos) return false;
    if (ht === 'short' && k.height >= 175) return false;
    if (ht === 'medium' && (k.height < 175 || k.height >= 185)) return false;
    if (ht === 'tall' && (k.height < 185 || k.height >= 190)) return false;
    if (ht === 'very-tall' && k.height < 190) return false;
    if (out === 'scored' && !k.converted) return false;
    if (out === 'missed' && k.converted) return false;
    return true;
  });

  currentPage = 1;
  renderData();
}

function renderData() {
  const total = filteredKicks.length;
  const pages = Math.ceil(total / PAGE_SIZE) || 1;
  if (currentPage > pages) currentPage = pages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const slice = filteredKicks.slice(start, end);

  // Render table (desktop) AND cards (mobile)
  renderTable(slice, total);
  renderCards(slice, total);

  // Pagination
  pageInfo.textContent = total === 0 ? 'No results' : `Showing ${start + 1}–${end} of ${total}`;
  pageNum.textContent = currentPage;
  btnPrev.disabled = currentPage <= 1;
  btnNext.disabled = currentPage >= pages;
}

function getOpponent(item) {
  const parts = item.match.split(' vs ');
  if (parts.length === 2) return parts[0] === item.team ? parts[1] : parts[0];
  return '—';
}

function badgeHTML(converted) {
  return converted
    ? '<span class="badge badge--scored">Scored</span>'
    : '<span class="badge badge--missed">Missed</span>';
}

/* ── Desktop table ── */
function renderTable(items) {
  if (!tableBody) return;
  tableBody.innerHTML = '';

  if (items.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2rem;color:var(--text-2)">No matching kicks found</td></tr>`;
    return;
  }

  items.forEach((k) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-player">${k.player}</td>
      <td class="td-mono">${cmToFtIn(k.height)} <span style="font-size:0.75rem; color:var(--text-3)">(${k.height}cm)</span></td>
      <td><span class="pos-chip">${k.position}</span></td>
      <td>${k.team}</td>
      <td>${getOpponent(k)}</td>
      <td class="td-mono">${k.year}</td>
      <td>${badgeHTML(k.converted)}</td>
    `;
    tableBody.appendChild(tr);
  });
}

/* ── Mobile cards ── */
function renderCards(items) {
  if (!cardsList) return;
  cardsList.innerHTML = '';

  if (items.length === 0) {
    cardsList.innerHTML = `<div class="kick-card" style="text-align:center;color:var(--text-2)">No matching kicks found</div>`;
    return;
  }

  items.forEach((k) => {
    const card = document.createElement('div');
    card.className = 'kick-card';
    card.innerHTML = `
      <div class="kick-card-top">
        <span class="kick-card-player">${k.player}</span>
        ${badgeHTML(k.converted)}
      </div>
      <div class="kick-card-grid">
        <span>Position</span><span>${k.position}</span>
        <span>Height</span><span>${cmToFtIn(k.height)} (${k.height}cm)</span>
        <span>Team</span><span>${k.team}</span>
        <span>vs</span><span>${getOpponent(k)}</span>
        <span>Year</span><span>${k.year}</span>
      </div>
    `;
    cardsList.appendChild(card);
  });
}
