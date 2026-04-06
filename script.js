/* ═══════════════════════════════════════════════════════════════════════════
   CONFIG & STATE
═══════════════════════════════════════════════════════════════════════════ */
const DEFAULT_CFG = {
  baseUrl:  'http://34.130.114.166:8005',
  apiKey:   'ZQT8WxJIIJTM3OaCjTbKRUU9V6iyIABm',
  scraper:  'gtadnata',
  delay:    700,
  user:     'wayne',
  pass:     'wayne2024',
};

function getCfg() {
  const stored = localStorage.getItem('wayne_cfg');
  return stored ? { ...DEFAULT_CFG, ...JSON.parse(stored) } : { ...DEFAULT_CFG };
}
function saveCfg(obj) {
  const cur = getCfg();
  localStorage.setItem('wayne_cfg', JSON.stringify({ ...cur, ...obj }));
}

let batchResults   = [];
let batchRunning   = false;
let arrivalRunning = false;
const HISTORY_KEY  = 'wayne_history';

function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function saveHistory(h) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 500)));
}
function addHistory(entry) {
  const h = getHistory();
  h.unshift({ ...entry, ts: new Date().toISOString() });
  saveHistory(h);
}

/* ═══════════════════════════════════════════════════════════════════════════
   AUTH
═══════════════════════════════════════════════════════════════════════════ */
function doLogin() {
  const cfg  = getCfg();
  const user = document.getElementById('login-user').value.trim();
  const pass = document.getElementById('login-pass').value;
  if (user === cfg.user && pass === cfg.pass) {
    sessionStorage.setItem('wayne_auth', '1');
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app').classList.add('visible');
    init();
  } else {
    document.getElementById('login-error').textContent = 'Invalid username or password.';
  }
}
document.getElementById('login-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('login-user').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

function doLogout() {
  sessionStorage.removeItem('wayne_auth');
  location.reload();
}

// Auto-login check
if (sessionStorage.getItem('wayne_auth')) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').classList.add('visible');
  document.addEventListener('DOMContentLoaded', init);
}

/* ═══════════════════════════════════════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════════════════════════════════════ */
const PAGE_META = {
  dashboard: { title: 'Dashboard',        meta: 'Overview of all activity' },
  single:    { title: 'Single Query',     meta: 'Look up one AWB number' },
  batch:     { title: 'Batch Process',    meta: 'Process multiple AWBs at once' },
  arrivals:  { title: 'Arrival Notices',  meta: 'Download PDF arrival notices' },
  history:   { title: 'Query History',    meta: 'All past queries' },
  settings:  { title: 'Settings',         meta: 'Configure API and preferences' },
};

function goto(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`.nav-item[onclick="goto('${page}')"]`).classList.add('active');

  const m = PAGE_META[page] || {};
  document.getElementById('page-title').textContent = m.title || page;
  document.getElementById('page-meta').textContent  = m.meta  || '';

  if (page === 'dashboard') refreshDashboard();
  if (page === 'history')   renderHistory();
  if (page === 'settings')  loadSettings();
}

/* ═══════════════════════════════════════════════════════════════════════════
   API HELPERS
═══════════════════════════════════════════════════════════════════════════ */
function resolveBase() {
  const cfg = getCfg();
  // On localhost use the API directly; on any hosted domain use the /api proxy
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return cfg.baseUrl;
  }
  return '/api';
}

async function apiPost(path, body) {
  const cfg = getCfg();
  const res = await fetch(resolveBase() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.apiKey },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { code: res.status, data: json };
}

async function apiGet(path) {
  const cfg = getCfg();
  const res = await fetch(resolveBase() + path, {
    headers: { 'x-api-key': cfg.apiKey },
  });
  const json = await res.json().catch(() => ({}));
  return { code: res.status, data: json };
}

async function scrapeAWB(awb) {
  const cfg = getCfg();
  return apiPost('/gtadnata/scrape/' + encodeURIComponent(cfg.scraper), {
    awb_number: awb, tracking_number: awb,
  });
}

async function fetchArrivalNotice(awb) {
  const cfg = getCfg();
  return apiPost('/gtadnata/arrival-notice/' + encodeURIComponent(cfg.scraper), {
    awb_number: awb, tracking_number: awb,
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   HEALTH CHECK
═══════════════════════════════════════════════════════════════════════════ */
async function checkHealth() {
  try {
    const r   = await apiGet('/gtadnata/health');
    const dot = document.getElementById('status-dot');
    const lbl = document.getElementById('status-label');
    const det = document.getElementById('health-details');

    if (r.code === 200 && r.data.status === 'healthy') {
      dot.className = 'status-dot online';
      lbl.textContent = 'Online';
      if (det) det.innerHTML = `
        <div style="display:grid; gap:10px;">
          <div style="background:var(--bg3); border-radius:8px; padding:12px;">
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">STATUS</div>
            <div style="color:var(--green);font-weight:700;">✅ Healthy</div>
          </div>
          <div style="background:var(--bg3); border-radius:8px; padding:12px;">
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">BROWSER</div>
            <div style="font-weight:700;">${r.data.browser_connected ? '✅ Connected' : '❌ Disconnected'}</div>
          </div>
          <div style="background:var(--bg3); border-radius:8px; padding:12px;">
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">SCRAPERS</div>
            <div style="font-weight:700;">${(r.data.available_scrapers || []).join(', ') || 'None'}</div>
          </div>
        </div>`;
    } else {
      dot.className = 'status-dot offline';
      lbl.textContent = 'Offline';
      if (det) det.innerHTML = `<div style="color:var(--red);">❌ API unreachable (HTTP ${r.code})</div>`;
    }
  } catch(e) {
    document.getElementById('status-dot').className = 'status-dot offline';
    document.getElementById('status-label').textContent = 'Offline';
    const det = document.getElementById('health-details');
    if (det) det.innerHTML = `<div style="color:var(--red);">❌ Cannot reach server.<br/><small style="color:var(--muted);">${e.message}</small></div>`;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD
═══════════════════════════════════════════════════════════════════════════ */
function refreshDashboard() {
  const history = getHistory();
  const today   = new Date().toDateString();

  const total   = history.length;
  const success = history.filter(h => h.status === 'success').length;
  const failed  = history.filter(h => h.status === 'failed').length;
  const todayN  = history.filter(h => new Date(h.ts).toDateString() === today).length;

  document.getElementById('stat-total').textContent   = total;
  document.getElementById('stat-success').textContent = success;
  document.getElementById('stat-failed').textContent  = failed;
  document.getElementById('stat-today').textContent   = todayN;
  document.getElementById('stat-success-rate').textContent =
    total > 0 ? Math.round(success / total * 100) + '% success rate' : '—';

  const recent = document.getElementById('dash-recent');
  if (history.length === 0) {
    recent.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div><p>No queries yet</p></div>';
  } else {
    recent.innerHTML = history.slice(0, 8).map(h => `
      <div class="history-item">
        <div>
          <div class="awb">${h.awb}</div>
          <div class="time">${new Date(h.ts).toLocaleString()}</div>
        </div>
        <span class="badge ${h.status}">${h.status}</span>
      </div>`).join('');
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SINGLE QUERY
═══════════════════════════════════════════════════════════════════════════ */
async function runSingleQuery() {
  const awb = document.getElementById('single-awb').value.trim();
  if (!awb) { toast('Enter an AWB number', 'error'); return; }
  if (!validateApiKey()) return;

  setBusy('single', true);
  document.getElementById('single-result').innerHTML = '';

  try {
    const r    = await scrapeAWB(awb);
    const body = r.data || {};
    const d    = body.data || {};

    if (r.code === 200 && body.success) {
      addHistory({ awb, status: 'success', data: d });
      document.getElementById('single-result').innerHTML = buildResultCard(awb, d);
      toast('✅ AWB found', 'success');
    } else {
      addHistory({ awb, status: 'failed', error: body.error || 'HTTP ' + r.code });
      document.getElementById('single-result').innerHTML =
        `<div class="result-card" style="border-color:var(--red);">
          <div style="color:var(--red); font-size:16px; font-weight:700;">❌ Query Failed</div>
          <div style="color:var(--muted); margin-top:8px; font-size:14px;">${body.error || 'HTTP ' + r.code}</div>
        </div>`;
      toast('Query failed: ' + (body.error || 'HTTP ' + r.code), 'error');
    }
  } catch(e) {
    addHistory({ awb, status: 'failed', error: e.message });
    document.getElementById('single-result').innerHTML =
      `<div class="result-card" style="border-color:var(--red);">
        <div style="color:var(--red); font-weight:700;">❌ Network Error</div>
        <div style="color:var(--muted); margin-top:8px; font-size:13px;">${e.message}</div>
      </div>`;
    toast('Network error: ' + e.message, 'error');
  } finally {
    setBusy('single', false);
  }
}

document.getElementById('single-awb').addEventListener('keydown', e => { if (e.key === 'Enter') runSingleQuery(); });

function buildResultCard(awb, d) {
  const fmt = v => (v === undefined || v === null || v === '') ? '<span class="na">N/A</span>' : v;
  return `
    <div class="result-card">
      <div class="result-header">
        <div class="result-awb">${awb}</div>
        <span class="badge success">✅ success</span>
      </div>
      <div class="fee-grid">
        <div class="fee-item">
          <div class="fee-label">PCS</div>
          <div class="fee-value">${fmt(d.pcs)}</div>
        </div>
        <div class="fee-item">
          <div class="fee-label">Chargeable Weight</div>
          <div class="fee-value">${fmt(d.total_chargeable_weight)}</div>
        </div>
        <div class="fee-item">
          <div class="fee-label">Gross Weight</div>
          <div class="fee-value">${fmt(d.total_gross_weight)}</div>
        </div>
        <div class="fee-item">
          <div class="fee-label">Terminal Fee</div>
          <div class="fee-value">${fmt(d.terminal_fee)}</div>
        </div>
        <div class="fee-item">
          <div class="fee-label">Storage Fee</div>
          <div class="fee-value">${fmt(d.storage_fee)}</div>
        </div>
        <div class="fee-item">
          <div class="fee-label">NAVCAN Fee</div>
          <div class="fee-value">${fmt(d.navcan_fee)}</div>
        </div>
        <div class="fee-item">
          <div class="fee-label">Warehouse Charter Fee</div>
          <div class="fee-value">${fmt(d.warehouse_charter_fee)}</div>
        </div>
        <div class="fee-item fee-total" style="grid-column: span 2;">
          <div class="fee-label" style="color:rgba(255,255,255,.5);">TOTAL</div>
          <div class="fee-value">${fmt(d.total)}</div>
        </div>
      </div>
    </div>`;
}

function clearSingleResult() {
  document.getElementById('single-awb').value = '';
  document.getElementById('single-result').innerHTML = '';
}

/* ═══════════════════════════════════════════════════════════════════════════
   BATCH PROCESS
═══════════════════════════════════════════════════════════════════════════ */
async function runBatch() {
  if (batchRunning) return;
  const raw = document.getElementById('batch-awbs').value.trim();
  if (!raw) { toast('Enter at least one AWB number', 'error'); return; }
  if (!validateApiKey()) return;

  const awbs = raw.split('\n').map(s => s.trim()).filter(Boolean);
  if (awbs.length === 0) { toast('No valid AWB numbers found', 'error'); return; }

  batchRunning  = true;
  batchResults  = [];
  const cfg     = getCfg();

  setBusy('batch', true);
  document.getElementById('progress-wrap').style.display = 'block';
  document.getElementById('btn-export-csv').disabled   = true;
  document.getElementById('btn-export-excel').disabled = true;
  document.getElementById('batch-table-wrap').innerHTML = '';

  for (let i = 0; i < awbs.length; i++) {
    const awb = awbs[i];
    const pct = Math.round((i / awbs.length) * 100);
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('batch-status').textContent =
      `Processing ${i + 1} / ${awbs.length} — ${awb}`;

    let row = { awb, status: 'failed', pcs: '', chargeable: '', gross: '',
                terminal: '', storage: '', navcan: '', warehouse: '', total: '', error: '' };
    try {
      const r    = await scrapeAWB(awb);
      const body = r.data || {};
      const d    = body.data || {};
      if (r.code === 200 && body.success) {
        row = { awb, status: 'success',
          pcs:       d.pcs               ?? '',
          chargeable:d.total_chargeable_weight ?? '',
          gross:     d.total_gross_weight ?? '',
          terminal:  d.terminal_fee       ?? '',
          storage:   d.storage_fee        ?? '',
          navcan:    d.navcan_fee         ?? '',
          warehouse: d.warehouse_charter_fee ?? '',
          total:     d.total              ?? '',
          error: '' };
        addHistory({ awb, status: 'success', data: d });
      } else {
        row.error = body.error || 'HTTP ' + r.code;
        addHistory({ awb, status: 'failed', error: row.error });
      }
    } catch(e) {
      row.error = e.message;
      addHistory({ awb, status: 'failed', error: e.message });
    }

    batchResults.push(row);
    renderBatchTable();

    if (i < awbs.length - 1) await sleep(cfg.delay);
  }

  document.getElementById('progress-bar').style.width = '100%';
  const ok  = batchResults.filter(r => r.status === 'success').length;
  const bad = batchResults.length - ok;
  document.getElementById('batch-status').textContent =
    `Done — ✅ ${ok} succeeded, ❌ ${bad} failed`;

  document.getElementById('btn-export-csv').disabled   = false;
  document.getElementById('btn-export-excel').disabled = false;
  setBusy('batch', false);
  batchRunning = false;
  toast(`Batch complete — ${ok} of ${awbs.length} succeeded`, ok === awbs.length ? 'success' : 'info');
}

function renderBatchTable() {
  if (batchResults.length === 0) return;
  const rows = batchResults.map(r => `
    <tr>
      <td class="td-awb">${r.awb}</td>
      <td><span class="badge ${r.status}">${r.status}</span></td>
      <td>${r.pcs}</td>
      <td>${r.chargeable}</td>
      <td>${r.terminal || '—'}</td>
      <td>${r.storage  || '—'}</td>
      <td>${r.navcan   || '—'}</td>
      <td>${r.warehouse || '—'}</td>
      <td class="td-total">${r.total || '—'}</td>
      <td style="color:var(--red);font-size:12px;">${r.error}</td>
    </tr>`).join('');

  document.getElementById('batch-table-wrap').innerHTML = `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>AWB</th><th>Status</th><th>PCS</th><th>Chargeable Wt</th>
          <th>Terminal</th><th>Storage</th><th>NAVCAN</th><th>Warehouse</th>
          <th>Total</th><th>Error</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function clearBatch() {
  batchResults = [];
  document.getElementById('batch-awbs').value = '';
  document.getElementById('batch-status').textContent = '';
  document.getElementById('progress-bar').style.width = '0%';
  document.getElementById('progress-wrap').style.display = 'none';
  document.getElementById('batch-table-wrap').innerHTML = '';
  document.getElementById('btn-export-csv').disabled   = true;
  document.getElementById('btn-export-excel').disabled = true;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ARRIVAL NOTICES
═══════════════════════════════════════════════════════════════════════════ */
async function downloadArrivalNotice() {
  const awb = document.getElementById('arrival-awb').value.trim();
  if (!awb) { toast('Enter an AWB number', 'error'); return; }
  if (!validateApiKey()) return;

  setBusy('arrival', true);
  document.getElementById('arrival-result').innerHTML = 'Fetching arrival notice...';

  try {
    const r    = await fetchArrivalNotice(awb);
    const body = r.data || {};
    const d    = body.data || {};

    if (r.code === 200 && body.success && d.pdf_base64) {
      const bytes    = atob(d.pdf_base64);
      const arr      = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob     = new Blob([arr], { type: d.mime_type || 'application/pdf' });
      const url      = URL.createObjectURL(blob);
      const a        = document.createElement('a');
      a.href         = url;
      a.download     = d.file_name || (awb + '_arrival_notice.pdf');
      a.click();
      URL.revokeObjectURL(url);
      document.getElementById('arrival-result').innerHTML =
        `<span style="color:var(--green);">✅ Downloaded: ${d.file_name || awb + '_arrival_notice.pdf'}</span>`;
      toast('✅ PDF downloaded', 'success');
    } else {
      const msg = body.error || 'No PDF returned';
      document.getElementById('arrival-result').innerHTML =
        `<span style="color:var(--red);">❌ ${msg}</span>`;
      toast('Failed: ' + msg, 'error');
    }
  } catch(e) {
    document.getElementById('arrival-result').innerHTML =
      `<span style="color:var(--red);">❌ Network error: ${e.message}</span>`;
    toast('Network error', 'error');
  } finally {
    setBusy('arrival', false);
  }
}
document.getElementById('arrival-awb').addEventListener('keydown', e => { if (e.key === 'Enter') downloadArrivalNotice(); });

async function runBatchArrivals() {
  if (arrivalRunning) return;
  const raw = document.getElementById('arrival-batch-awbs').value.trim();
  if (!raw) { toast('Enter AWB numbers', 'error'); return; }
  if (!validateApiKey()) return;

  const awbs = raw.split('\n').map(s => s.trim()).filter(Boolean);
  arrivalRunning = true;
  setBusy('arrival-batch', true);

  document.getElementById('arrival-progress-wrap').style.display = 'block';
  let ok = 0, bad = 0;

  for (let i = 0; i < awbs.length; i++) {
    const awb = awbs[i];
    const pct = Math.round((i / awbs.length) * 100);
    document.getElementById('arrival-progress-bar').style.width = pct + '%';
    document.getElementById('arrival-batch-status').textContent =
      `Downloading ${i + 1} / ${awbs.length} — ${awb}`;

    try {
      const r    = await fetchArrivalNotice(awb);
      const body = r.data || {};
      const d    = body.data || {};
      if (r.code === 200 && body.success && d.pdf_base64) {
        const bytes = atob(d.pdf_base64);
        const arr   = new Uint8Array(bytes.length);
        for (let j = 0; j < bytes.length; j++) arr[j] = bytes.charCodeAt(j);
        const blob  = new Blob([arr], { type: d.mime_type || 'application/pdf' });
        const url   = URL.createObjectURL(blob);
        const a     = document.createElement('a');
        a.href      = url;
        a.download  = d.file_name || (awb + '_arrival_notice.pdf');
        a.click();
        URL.revokeObjectURL(url);
        ok++;
      } else { bad++; }
    } catch { bad++; }

    await sleep(getCfg().delay);
  }

  document.getElementById('arrival-progress-bar').style.width = '100%';
  document.getElementById('arrival-batch-status').textContent =
    `Done — ✅ ${ok} downloaded, ❌ ${bad} failed`;
  setBusy('arrival-batch', false);
  arrivalRunning = false;
  toast(`Arrival notices: ${ok} downloaded, ${bad} failed`, ok > 0 ? 'success' : 'error');
}

/* ═══════════════════════════════════════════════════════════════════════════
   HISTORY
═══════════════════════════════════════════════════════════════════════════ */
function renderHistory() {
  const history = getHistory();
  document.getElementById('history-count').textContent =
    history.length + ' total entr' + (history.length === 1 ? 'y' : 'ies');

  if (history.length === 0) {
    document.getElementById('history-table-wrap').innerHTML =
      '<div class="empty"><div class="empty-icon">🕐</div><p>No history yet</p></div>';
    return;
  }

  const rows = history.map(h => `
    <tr>
      <td style="color:var(--muted);font-size:12px;">${new Date(h.ts).toLocaleString()}</td>
      <td class="td-awb">${h.awb}</td>
      <td><span class="badge ${h.status}">${h.status}</span></td>
      <td>${h.data ? (h.data.pcs ?? '') : ''}</td>
      <td>${h.data ? (h.data.total_chargeable_weight ?? '') : ''}</td>
      <td class="td-total">${h.data ? (h.data.total ?? '') : ''}</td>
      <td style="color:var(--red);font-size:12px;">${h.error || ''}</td>
    </tr>`).join('');

  document.getElementById('history-table-wrap').innerHTML = `
    <table>
      <thead><tr>
        <th>Time</th><th>AWB</th><th>Status</th>
        <th>PCS</th><th>Chargeable Wt</th><th>Total</th><th>Error</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function clearHistory() {
  if (!confirm('Clear all query history?')) return;
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
  refreshDashboard();
  toast('History cleared', 'info');
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT
═══════════════════════════════════════════════════════════════════════════ */
function batchToRows() {
  return batchResults.map(r => ({
    AWB: r.awb, Status: r.status, PCS: r.pcs,
    'Chargeable Weight': r.chargeable, 'Gross Weight': r.gross,
    'Terminal Fee': r.terminal, 'Storage Fee': r.storage,
    'NAVCAN Fee': r.navcan, 'Warehouse Fee': r.warehouse,
    Total: r.total, Error: r.error,
  }));
}

function historyToRows() {
  return getHistory().map(h => ({
    Timestamp: new Date(h.ts).toLocaleString(),
    AWB: h.awb, Status: h.status,
    PCS: h.data?.pcs ?? '',
    'Chargeable Weight': h.data?.total_chargeable_weight ?? '',
    Total: h.data?.total ?? '',
    Error: h.error || '',
  }));
}

function exportCSV(rows, filename) {
  if (!rows.length) { toast('Nothing to export', 'error'); return; }
  const headers = Object.keys(rows[0]);
  const lines   = [headers.join(','),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(','))];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast('CSV downloaded', 'success');
}

function exportExcel(rows, filename) {
  if (!rows.length) { toast('Nothing to export', 'error'); return; }
  const ws  = XLSX.utils.json_to_sheet(rows);
  const wb  = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Results');
  XLSX.writeFile(wb, filename);
  toast('Excel downloaded', 'success');
}

function exportBatchCSV()    { exportCSV(batchToRows(),     'wayne_batch_' + dateTag() + '.csv'); }
function exportBatchExcel()  { exportExcel(batchToRows(),   'wayne_batch_' + dateTag() + '.xlsx'); }
function exportHistoryCSV()  { exportCSV(historyToRows(),   'wayne_history_' + dateTag() + '.csv'); }
function exportHistoryExcel(){ exportExcel(historyToRows(), 'wayne_history_' + dateTag() + '.xlsx'); }

/* ═══════════════════════════════════════════════════════════════════════════
   SETTINGS
═══════════════════════════════════════════════════════════════════════════ */
function loadSettings() {
  const cfg = getCfg();
  document.getElementById('cfg-base-url').value = cfg.baseUrl;
  document.getElementById('cfg-api-key').value  = cfg.apiKey;
  document.getElementById('cfg-scraper').value  = cfg.scraper;
  document.getElementById('cfg-delay').value    = cfg.delay;
}

function saveSettings() {
  const cfg = {
    baseUrl: document.getElementById('cfg-base-url').value.trim() || DEFAULT_CFG.baseUrl,
    apiKey:  document.getElementById('cfg-api-key').value.trim(),
    scraper: document.getElementById('cfg-scraper').value.trim() || DEFAULT_CFG.scraper,
    delay:   parseInt(document.getElementById('cfg-delay').value) || DEFAULT_CFG.delay,
  };
  const newUser = document.getElementById('cfg-new-user').value.trim();
  const newPass = document.getElementById('cfg-new-pass').value;
  if (newUser) cfg.user = newUser;
  if (newPass) cfg.pass = newPass;

  saveCfg(cfg);
  toast('✅ Settings saved', 'success');
  checkHealth();
}

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════════════════════ */
function validateApiKey() {
  if (!getCfg().apiKey) {
    toast('⚠️ API key not set — go to Settings first', 'error');
    goto('settings');
    return false;
  }
  return true;
}

function setBusy(id, busy) {
  const spinners = { single: 'spinner-single', batch: 'spinner-batch',
                     arrival: 'spinner-arrival', 'arrival-batch': 'spinner-arrival-batch' };
  const buttons  = { single: 'btn-single-query', batch: 'btn-batch',
                     arrival: 'btn-arrival', 'arrival-batch': 'btn-arrival-batch' };
  const sp = document.getElementById(spinners[id]);
  const bt = document.getElementById(buttons[id]);
  if (sp) sp.style.display = busy ? 'block' : 'none';
  if (bt) bt.disabled = busy;
}

function toast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `<span>${icons[type]}</span><span>${msg}</span>`;
  document.getElementById('toast-wrap').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function dateTag() { return new Date().toISOString().slice(0,10); }

/* ═══════════════════════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════════════════════ */
function init() {
  loadSettings();
  checkHealth();
  refreshDashboard();
  setInterval(checkHealth, 60000);
}

// Boot if already authed
if (sessionStorage.getItem('wayne_auth')) {
  window.addEventListener('load', init);
}
