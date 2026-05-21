window.ReportPage = (() => {
  const state = {
    batchId: '',
    batch: null,
    permission: 'none',
    rows: [],
    chart: { egg: [], feed: [], duck: [] },
    months: [],
    selectedMonth: 'all',
    pageIndex: 0,
    tab: 'table',
    charts: {},
    isRotated: false
  };
  let bootstrapped = false;
  let chartLoadPromise = null;
  let reportSyncPromise = null;
  let reportSyncSeq = 0;
  const nativeChartMeta = new WeakMap();
  const REPORT_CACHE_TTL_MS = 2 * 60 * 1000;
  const REPORT_SYNC_TIMEOUT_MS = 12000;
  const REPORT_FORCE_SYNC_TIMEOUT_MS = 30000;

  async function bootstrap() {
    if (bootstrapped) return;
    bootstrapped = true;
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    bind();
    state.batchId = new URLSearchParams(location.search).get('bid') || '';
    if (!state.batchId) {
      setText('reportSubtitle', 'ไม่พบ batch id');
      return;
    }
    await load();
  }

  function bind() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);
    document.getElementById('reportMonthSelect')?.addEventListener('change', onMonthChange);
    document.getElementById('reportRebuildBtn')?.addEventListener('click', rebuildReport);
    document.getElementById('reportExportBtn')?.addEventListener('click', exportExcel);
    document.getElementById('reportCreateViewLinkBtn')?.addEventListener('click', createReportViewLink);
    document.getElementById('reportFullscreenBtn')?.addEventListener('click', openFullscreen);
    document.getElementById('reportFullscreenCloseBtn')?.addEventListener('click', closeFullscreen);
    document.getElementById('reportRotateBtn')?.addEventListener('click', toggleRotate);
    document.querySelectorAll('[data-report-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.dataset.reportTab || 'table'));
    });
    window.addEventListener('resize', () => {
      if (!document.getElementById('reportFullscreen')?.classList.contains('hidden')) {
        renderFullscreenTable();
      }
    });
  }

  async function load(options = {}) {
    const force = !!options.force;
    setBusy(true, force ? 'กำลังโหลดรายงานล่าสุด...' : 'กำลังเปิดรายงานจากเครื่อง...');

    // Normal open: show browser cache immediately and sync in the background.
    // Force open after rebuild: start a new request and do not reuse an older
    // background sync promise, because the older request may already be close to
    // its timeout.
    const cached = !force ? readReportCache() : null;
    if (cached?.data?.status === 'ok') {
      hydrateFromResponse(cached.data);
      setBusy(false, `แสดงข้อมูลจากเครื่อง${formatCacheAge(cached.ageMs)} • กำลังซิงก์ล่าสุด...`);
      syncReportInBackground({ hasCache: true });
      return;
    }

    const seq = nextReportSyncSeq();
    await syncReportFromGas({
      hasCache: false,
      showError: true,
      forceFresh: force,
      seq
    });
  }

  function nextReportSyncSeq() {
    reportSyncSeq += 1;
    return reportSyncSeq;
  }

  function isLatestReportSync(seq) {
    return !seq || seq === reportSyncSeq;
  }

  async function syncReportInBackground(options = {}) {
    if (reportSyncPromise) return reportSyncPromise;
    const seq = nextReportSyncSeq();
    reportSyncPromise = syncReportFromGas({ hasCache: !!options.hasCache, showError: false, seq })
      .finally(() => { reportSyncPromise = null; });
    return reportSyncPromise;
  }

  async function syncReportFromGas(options = {}) {
    const hasCache = !!options.hasCache;
    const showError = !!options.showError;
    const forceFresh = !!options.forceFresh;
    const seq = options.seq || nextReportSyncSeq();
    const payload = { action: 'getReportPageData', batch_id: state.batchId };

    if (forceFresh) {
      payload._request_id = `report_force_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }

    const response = await AppApi.post(
      payload,
      {
        timeoutMs: forceFresh ? REPORT_FORCE_SYNC_TIMEOUT_MS : REPORT_SYNC_TIMEOUT_MS,
        dedupe: !forceFresh
      }
    );

    // If a newer sync/rebuild started while this one was still running, ignore
    // this old result so it cannot overwrite fresh UI state or show a stale
    // timeout message.
    if (!isLatestReportSync(seq)) return null;

    if (!response || response.status !== 'ok') {
      const message = response?.message === 'request_timeout'
        ? 'เชื่อมต่อ GAS ช้า/timeout กำลังแสดงข้อมูลจาก cache ในเครื่อง'
        : (response?.message || 'โหลดรายงานไม่สำเร็จ');

      if (hasCache) {
        setBusy(false, message);
        return null;
      }

      setBusy(false, showError ? message : 'ยังไม่มี cache ในเครื่อง และโหลดข้อมูลล่าสุดไม่สำเร็จ');
      setText('reportSubtitle', showError ? message : 'โหลดรายงานไม่สำเร็จ');
      return null;
    }

    writeReportCache(response);
    hydrateFromResponse(response);
    setBusy(false, state.rows.length ? 'ซิงก์ข้อมูลรายงานล่าสุดแล้ว' : 'ยังไม่มีข้อมูลรายงาน กด “โหลดข้อมูลใหม่” เพื่อสร้างข้อมูลของ batch นี้');
    return response;
  }

  function reportCacheKey() {
    return `ducky:report:${state.batchId}`;
  }

  function readReportCache() {
    try {
      const raw = localStorage.getItem(reportCacheKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const isEnvelope = parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'value');
      const data = isEnvelope ? parsed.value : parsed;
      const cachedAt = Number(isEnvelope ? parsed.__cached_at : (parsed.__cached_at || 0)) || 0;
      return { data, cachedAt, ageMs: cachedAt ? Date.now() - cachedAt : null };
    } catch (error) {
      console.warn('Report cache read failed', error);
      return null;
    }
  }

  function writeReportCache(response) {
    try {
      if (window.AppCache?.writeEnvelope) AppCache.writeEnvelope(reportCacheKey(), response);
      else localStorage.setItem(reportCacheKey(), JSON.stringify({ __cached_at: Date.now(), value: response }));
    } catch (error) {
      console.warn('Report cache write failed', error);
    }
  }

  function formatCacheAge(ageMs) {
    if (ageMs == null || Number.isNaN(Number(ageMs))) return '';
    if (ageMs < 60 * 1000) return ' • cache ล่าสุดไม่ถึง 1 นาที';
    if (ageMs < 60 * 60 * 1000) return ` • cache ${Math.round(ageMs / 60000)} นาทีที่แล้ว`;
    return ` • cache ${Math.round(ageMs / 3600000)} ชม.ที่แล้ว`;
  }


  function hydrateFromResponse(response) {
    state.batch = response.batch;
    state.permission = response.permission || 'none';
    state.rows = Array.isArray(response.rows) ? response.rows : [];
    state.chart = response.chart || { egg: [], feed: [], duck: [] };
    state.months = Array.isArray(response.months) ? response.months : deriveMonths(state.rows);
    if (!state.months.length) state.selectedMonth = 'all';
    const previousMonth = state.selectedMonth;
    renderHeader(response);
    renderMonthSelect(previousMonth);
    normalizePageIndex();
    renderAll();
  }

  function renderHeader(response) {
    const batch = state.batch || {};
    setText('reportTitle', 'รายงาน');
    setText('reportSubtitle', `${batch.name || state.batchId} • ${batch.specie === 'fish' ? 'ปลา' : 'เป็ด'}`);
    const badge = document.getElementById('reportPermissionBadge');
    if (badge) {
      badge.className = `badge-inline ${state.permission === 'write' ? 'success' : 'muted-badge'}`;
      badge.textContent = state.permission === 'write' ? 'ดูและแก้ไข' : 'ดู';
    }
    if (window.NavDrawer) {
      NavDrawer.setBatchContext({
        id: state.batchId,
        specie: batch.specie,
        permission: state.permission,
        isOwner: !!response.is_owner,
        isAdmin: !!response.is_admin,
        module_permissions: { report: state.permission }
      });
    }
  }

  function renderMonthSelect(preferred) {
    const select = document.getElementById('reportMonthSelect');
    if (!select) return;
    const options = [`<option value="all">ทั้งหมด</option>`].concat(state.months.map((m) => `<option value="${escapeHtml(m.key)}">${escapeHtml(m.label)}</option>`));
    select.innerHTML = options.join('');
    if (preferred && (preferred === 'all' || state.months.some((m) => m.key === preferred))) {
      state.selectedMonth = preferred;
    } else {
      state.selectedMonth = 'all';
    }
    select.value = state.selectedMonth;
  }

  function renderAll() {
    const allRows = state.rows;
    const currentRows = getCurrentRows();
    const subTotal = summarizeRows(currentRows);
    const grandTotal = summarizeRows(allRows);
    renderSummaryCards(grandTotal);
    renderPager();
    renderCompactTable(currentRows, subTotal, grandTotal);
    renderFooter(subTotal, grandTotal);
    renderCharts();
    document.getElementById('reportEmptyState')?.classList.toggle('hidden', state.rows.length > 0);
    // v4.4: subtotal / grand total ย้ายไปอยู่ท้ายตารางแล้ว ไม่ใช้ fixed footer บนมือถือ
    document.getElementById('reportFixedFooter')?.classList.add('hidden');
    setText('reportTableTitle', state.selectedMonth === 'all' ? `ตารางสรุปรายวัน • ${currentMonthLabel()}` : `ตารางสรุปรายวัน • ${selectedMonthLabel()}`);
    setText('reportPageHint', state.selectedMonth === 'all' ? 'เลือกทั้งหมดจะแสดงทีละเดือนผ่านเลขหน้า และมีรวมทั้งหมดท้ายตาราง' : 'แสดงเฉพาะเดือนที่เลือก และมีรวมทั้งหมดท้ายตาราง');
  }

  function renderSummaryCards(total) {
    const target = document.getElementById('reportSummaryCards');
    if (!target) return;
    target.innerHTML = [
      ['ไข่รวม', `${fmt(total.egg_daily)} ฟอง`],
      ['ค่าอาหาร', money(total.feed_cost)],
      ['ค่าไข่', money(total.egg_income)],
      ['สุทธิ', money(total.total_income)]
    ].map(([label, value]) => `
      <div class="report-summary-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `).join('');
  }

  function renderPager() {
    const pager = document.getElementById('reportMonthPager');
    if (!pager) return;
    if (state.selectedMonth !== 'all' || state.months.length <= 1) {
      pager.innerHTML = '';
      return;
    }
    pager.innerHTML = state.months.map((month, index) => `
      <button type="button" class="report-month-page-btn ${index === state.pageIndex ? 'is-active' : ''}" data-page-index="${index}" title="${escapeHtml(month.label)}">${index + 1}</button>
    `).join('');
    pager.querySelectorAll('[data-page-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.pageIndex = Number(btn.dataset.pageIndex || 0);
        renderAll();
      });
    });
  }

  function renderCompactTable(rows, subTotal, grandTotal) {
    const target = document.getElementById('reportCompactTable');
    if (!target) return;
    if (!rows.length) {
      target.innerHTML = '';
      return;
    }
    target.innerHTML = buildMobileTableHtml(rows, subTotal, true, grandTotal);
  }

  function buildMobileTableHtml(rows, subTotal, includeFooter = false, grandTotal = null) {
    const body = rows.map((row) => `
      <tr>
        <td class="report-date-cell">${escapeHtml(dayOnly(row))}</td>
        <td>${fmtCompact(row.egg_daily)}</td>
        <td>${fmtPercent(row.egg_percent)}</td>
        <td>${fmtFeed(row.feed_out)}</td>
        <td>${fmtCompact(row.feed_cost)}</td>
        <td>${fmtCompact(row.egg_income)}</td>
        <td class="${Number(row.total_income || 0) < 0 ? 'report-negative' : 'report-positive'}">${fmtCompact(row.total_income)}</td>
      </tr>
    `).join('');
    const footerRows = [];
    if (includeFooter) {
      footerRows.push(totalRowHtml(state.selectedMonth === 'all' ? 'รวมหน้า' : 'รวมเดือน', subTotal));
      if (grandTotal) footerRows.push(totalRowHtml('รวมทั้งหมด', grandTotal));
    }
    const footer = footerRows.length ? `<tfoot>${footerRows.join('')}</tfoot>` : '';
    return `
      <div class="report-table-scroll" role="region" aria-label="ตารางสรุปรายวัน">
        <table class="report-table report-table--compact">
          <thead>
            <tr>
              <th>วันที่</th>
              <th>ไข่</th>
              <th>%ไข่</th>
              <th>อาหาร</th>
              <th>ทุน</th>
              <th>ขาย</th>
              <th>สุทธิ</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          ${footer}
        </table>
      </div>
    `;
  }

  function totalRowHtml(label, total) {
    return `
      <tr class="report-total-row">
        <td class="report-total-label">${escapeHtml(label)}</td>
        <td>${fmtCompact(total.egg_daily)}</td>
        <td>-</td>
        <td>${fmtFeed(total.feed_out)}</td>
        <td>${fmtCompact(total.feed_cost)}</td>
        <td>${fmtCompact(total.egg_income)}</td>
        <td class="${Number(total.total_income || 0) < 0 ? 'report-negative' : 'report-positive'}">${fmtCompact(total.total_income)}</td>
      </tr>
    `;
  }

  function renderFooter(subTotal, grandTotal) {
    setText('reportSubTotalLabel', state.selectedMonth === 'all' ? `รวมหน้านี้ • ${currentMonthLabel()}` : `รวมเดือนนี้ • ${selectedMonthLabel()}`);
    setText('reportSubTotalValue', footerLine(subTotal));
    setText('reportGrandTotalValue', footerLine(grandTotal));
  }

  function renderCharts() {
    if (state.tab !== 'chart') return;

    const eggRows = getChartRows('egg');
    const feedRows = getChartRows('feed');
    const duckRows = getChartRows('duck');

    destroyCharts();

    if (window.Chart) {
      renderChartJsCharts(eggRows, feedRows, duckRows);
      return;
    }

    // v4.5: native canvas fallback. This avoids third-party CDN storage warnings
    // and still keeps the report graph usable when Chart.js is not hosted locally.
    renderNativeCharts(eggRows, feedRows, duckRows);
  }

  function getChartRows(type) {
    const rows = Array.isArray(state.chart?.[type]) ? state.chart[type] : [];
    const scoped = state.selectedMonth === 'all'
      ? rows
      : rows.filter((r) => r.month_key === currentMonthKey());
    return scoped.slice().sort((a, b) => String(a.date_key || '').localeCompare(String(b.date_key || '')));
  }

  function renderChartJsCharts(eggRows, feedRows, duckRows) {
    const eggCanvas = document.getElementById('eggChart');
    const feedCanvas = document.getElementById('feedChart');
    const duckCanvas = document.getElementById('duckChart');

    const labels = eggRows.map(chartLabel);
    prepareChartCanvas(eggCanvas, labels.length);
    state.charts.egg = new Chart(eggCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'ไข่รายวัน', data: eggRows.map((r) => Number(r.egg_daily || 0)), yAxisID: 'y', backgroundColor: '#2563eb', borderColor: '#1d4ed8', borderWidth: 1.2, borderRadius: 5, maxBarThickness: 18 },
          { label: '% ไข่', data: eggRows.map((r) => Number(r.egg_percent || 0)), type: 'line', yAxisID: 'y1', borderColor: '#f97316', backgroundColor: '#f97316', borderWidth: 2.5, pointRadius: 2.6, pointHoverRadius: 5, tension: .25 }
        ]
      },
      options: chartOptions({ rightAxis: true })
    });

    const feedTypes = Array.from(new Set(feedRows.map(feedSeriesName)));
    const dateKeys = Array.from(new Set(feedRows.map((r) => String(r.date_key || '')))).filter(Boolean).sort();
    const feedLabels = dateKeys.map((key) => chartLabel(feedRows.find((r) => String(r.date_key || '') === key) || { date_key: key }));
    const chartColors = chartPalette();
    const feedDatasets = feedTypes.map((name, index) => ({
      label: name,
      data: dateKeys.map((key) => feedRows.filter((r) => String(r.date_key || '') === key && feedSeriesName(r) === name).reduce((sum, r) => sum + Number(r.feed_out || 0), 0)),
      backgroundColor: chartColors[index % chartColors.length],
      borderColor: chartColors[index % chartColors.length],
      borderWidth: 1,
      borderRadius: 4,
      maxBarThickness: 18
    }));
    prepareChartCanvas(feedCanvas, feedLabels.length);
    state.charts.feed = new Chart(feedCanvas, {
      type: 'bar',
      data: { labels: feedLabels, datasets: feedDatasets },
      options: chartOptions({ stacked: true })
    });

    const duckLabels = duckRows.map(chartLabel);
    prepareChartCanvas(duckCanvas, duckLabels.length);
    state.charts.duck = new Chart(duckCanvas, {
      type: 'bar',
      data: {
        labels: duckLabels,
        datasets: [{ label: 'เป็ดตาย', data: duckRows.map((r) => Number(r.duck_dead || 0)), backgroundColor: '#dc2626', borderColor: '#b91c1c', borderWidth: 1.2, borderRadius: 5, maxBarThickness: 18 }]
      },
      options: chartOptions()
    });
  }

  function renderNativeCharts(eggRows, feedRows, duckRows) {
    const eggLabels = eggRows.map(chartLabel);
    drawComboCanvasChart('eggChart', eggLabels, eggRows.map((r) => Number(r.egg_daily || 0)), eggRows.map((r) => Number(r.egg_percent || 0)), 'ไข่', '%');

    const feedTypes = Array.from(new Set(feedRows.map(feedSeriesName)));
    const dateKeys = Array.from(new Set(feedRows.map((r) => String(r.date_key || '')))).filter(Boolean).sort();
    const feedLabels = dateKeys.map((key) => chartLabel(feedRows.find((r) => String(r.date_key || '') === key) || { date_key: key }));
    const chartColors = chartPalette();
    const feedDatasets = feedTypes.map((name, index) => ({
      label: name,
      data: dateKeys.map((key) => feedRows.filter((r) => String(r.date_key || '') === key && feedSeriesName(r) === name).reduce((sum, r) => sum + Number(r.feed_out || 0), 0)),
      backgroundColor: chartColors[index % chartColors.length],
      borderColor: chartColors[index % chartColors.length],
      borderWidth: 1,
      borderRadius: 4,
      maxBarThickness: 18
    }));
    drawStackedCanvasChart('feedChart', feedLabels, feedDatasets);

    drawBarCanvasChart('duckChart', duckRows.map(chartLabel), duckRows.map((r) => Number(r.duck_dead || 0)), 'เป็ดตาย');
  }

  function chartLabel(row) {
    if (state.selectedMonth !== 'all') return dayOnly(row);
    const key = String(row?.date_key || '');
    const match = key.match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (match) return `${Number(match[2])}/${Number(match[1])}`;
    return shortDate(row?.date_display || row?.date_key || '');
  }

  function feedSeriesName(row) {
    return row.feed_name || row.feed_id || 'Feed';
  }

  function prepareChartCanvas(canvas, labelCount = 0) {
    if (!canvas) return;
    const wrap = canvas.closest('.report-chart-canvas');
    const base = wrap?.clientWidth || 320;
    const width = Math.max(base, Math.min(2400, Math.max(1, labelCount) * (state.selectedMonth === 'all' ? 24 : 18)));
    canvas.style.width = `${width}px`;
    canvas.style.height = '240px';
  }

  function buildTableHtml(rows, total, includeFooter = true) {
    const body = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.date_display || row.date_key || '-')}</td>
        <td>${fmt(row.duck_start)}</td>
        <td>${fmt(row.duck_dead)}</td>
        <td>${fmt(row.duck_remain)}</td>
        <td>${fmt(row.egg_daily)}</td>
        <td>${fmt(row.egg_percent)}</td>
        <td>${fmtFeed(row.feed_out)}</td>
        <td>${fmt(row.feed_cost)}</td>
        <td>${fmt(row.egg_income)}</td>
        <td class="${Number(row.total_income || 0) < 0 ? 'report-negative' : 'report-positive'}">${fmt(row.total_income)}</td>
      </tr>
    `).join('');
    const footer = includeFooter ? `
      <tfoot>
        <tr>
          <td>รวม</td>
          <td>${fmt(total.duck_start)}</td>
          <td>${fmt(total.duck_dead)}</td>
          <td>${fmt(total.duck_remain)}</td>
          <td>${fmt(total.egg_daily)}</td>
          <td>-</td>
          <td>${fmtFeed(total.feed_out)}</td>
          <td>${fmt(total.feed_cost)}</td>
          <td>${fmt(total.egg_income)}</td>
          <td class="${Number(total.total_income || 0) < 0 ? 'report-negative' : 'report-positive'}">${fmt(total.total_income)}</td>
        </tr>
      </tfoot>
    ` : '';
    return `
      <table class="report-table">
        <thead><tr>
          <th>วันที่</th><th>เป็ดตั้งต้น</th><th>เป็ดตาย</th><th>เหลือเป็ด</th><th>เก็บไข่</th><th>% ไข่</th><th>อาหาร</th><th>ค่าอาหาร</th><th>ค่าไข่</th><th>รายได้สุทธิ</th>
        </tr></thead>
        <tbody>${body}</tbody>
        ${footer}
      </table>
    `;
  }

  function openFullscreen() {
    const modal = document.getElementById('reportFullscreen');
    if (!modal) return;
    state.isRotated = false;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('report-fullscreen-open');
    renderFullscreenTable();
  }

  function closeFullscreen() {
    const modal = document.getElementById('reportFullscreen');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.body.classList.remove('report-fullscreen-open');
    state.isRotated = false;
    document.getElementById('reportFullTableWrap')?.classList.remove('is-rotated');
  }

  function toggleRotate() {
    state.isRotated = !state.isRotated;
    renderFullscreenTable();
  }

  function renderFullscreenTable() {
    const rows = getCurrentRows();
    const total = summarizeRows(rows);
    const wrap = document.getElementById('reportFullTableWrap');
    if (!wrap) return;
    wrap.innerHTML = buildMobileTableHtml(rows, total, true, summarizeRows(state.rows));
    wrap.classList.toggle('is-rotated', state.isRotated);
    setText('reportFullscreenTitle', 'ตารางสรุปรายวัน');
    setText('reportFullscreenSubtitle', currentMonthLabel());
    setText('reportRotateBtn', state.isRotated ? 'กลับแนวเดิม' : 'หมุนตาราง');
    const portrait = window.innerHeight > window.innerWidth;
    document.getElementById('reportRotateHint')?.classList.toggle('hidden', !portrait && !state.isRotated);
  }

  async function rebuildReport() {
    if (!confirm('โหลดข้อมูลรายงานใหม่ของ batch นี้ตั้งแต่วันเริ่มเลี้ยงถึงปัจจุบัน?')) return;

    // Invalidate any background getReportPageData request already in flight.
    // The rebuild result must not be followed by an old almost-timeout read.
    nextReportSyncSeq();
    reportSyncPromise = null;

    setButtonLoading('reportRebuildBtn', true, 'กำลังโหลด...');
    setBusy(true, 'กำลังสร้างข้อมูลรายงานใหม่...');
    const response = await AppApi.post(
      { action: 'rebuildReportForBatch', batch_id: state.batchId, _request_id: `rebuild_${Date.now()}` },
      { timeoutMs: 45000, dedupe: false }
    );
    if (!response || response.status !== 'ok') {
      setButtonLoading('reportRebuildBtn', false);
      setBusy(false, response?.message || 'สร้างข้อมูลรายงานไม่สำเร็จ');
      alert(response?.message || 'สร้างข้อมูลรายงานไม่สำเร็จ');
      return;
    }

    if (window.AppCache?.remove) AppCache.remove(reportCacheKey());
    else localStorage.removeItem(reportCacheKey());

    setText('reportHint', `สร้างข้อมูลใหม่แล้ว ${Number(response.rows || 0).toLocaleString('th-TH')} แถว กำลังโหลดผลล่าสุด...`);
    await load({ force: true });
    setButtonLoading('reportRebuildBtn', false);
    setBusy(false, state.rows.length ? 'โหลดข้อมูลรายงานล่าสุดแล้ว' : 'สร้างข้อมูลแล้ว แต่ยังโหลดผลล่าสุดไม่สำเร็จ');
  }


  async function createReportViewLink() {
    setButtonLoading('reportCreateViewLinkBtn', true, 'กำลังสร้างลิงก์...');
    const response = await AppApi.post({ action: 'createReportViewLink', batch_id: state.batchId });
    setButtonLoading('reportCreateViewLinkBtn', false);
    if (!response || response.status !== 'ok') {
      alert(response?.message || 'สร้างลิงก์ไม่สำเร็จ');
      return;
    }
    const key = response.view_key || response.key || '';
    const url = `${location.origin}${location.pathname.replace(/report\.html$/, '')}report-view.html?key=${encodeURIComponent(key)}`;
    try { await navigator.clipboard.writeText(url); alert('สร้างลิงก์และคัดลอกแล้ว\n' + url); }
    catch (_) { prompt('คัดลอกลิงก์นี้', url); }
  }

  async function exportExcel() {
    const month = state.selectedMonth === 'all' ? 'all' : state.selectedMonth;
    setButtonLoading('reportExportBtn', true, 'กำลัง Export...');
    setBusy(true, 'กำลังสร้างไฟล์ Excel...');
    const response = await AppApi.post({ action: 'exportReportExcel', batch_id: state.batchId, month });
    setButtonLoading('reportExportBtn', false);
    if (!response || response.status !== 'ok') {
      setBusy(false, response?.message || 'Export ไม่สำเร็จ');
      alert(response?.message || 'Export ไม่สำเร็จ');
      return;
    }
    setBusy(false, `Export สำเร็จ ${Number(response.row_count || 0).toLocaleString('th-TH')} แถว กำลังเปิดไฟล์...`);
    openFileUrl(response.file_url || response.view_url);
  }

  function onMonthChange(event) {
    state.selectedMonth = event.target.value || 'all';
    state.pageIndex = 0;
    normalizePageIndex();
    renderAll();
  }

  async function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('[data-report-tab]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.reportTab === tab));
    document.getElementById('reportTablePanel')?.classList.toggle('hidden', tab !== 'table');
    document.getElementById('reportChartPanel')?.classList.toggle('hidden', tab !== 'chart');
    if (tab === 'chart') await ensureChartJs();
    renderCharts();
  }

  function getCurrentRows() {
    const monthKey = currentMonthKey();
    return state.rows.filter((row) => row.month_key === monthKey);
  }

  function currentMonthKey() {
    if (state.selectedMonth !== 'all') return state.selectedMonth;
    return state.months[state.pageIndex]?.key || '';
  }

  function selectedMonthLabel() {
    return state.months.find((m) => m.key === state.selectedMonth)?.label || state.selectedMonth;
  }

  function currentMonthLabel() {
    const key = currentMonthKey();
    return state.months.find((m) => m.key === key)?.label || key || '-';
  }

  function normalizePageIndex() {
    if (state.selectedMonth !== 'all') {
      const index = state.months.findIndex((m) => m.key === state.selectedMonth);
      state.pageIndex = Math.max(0, index);
    } else if (state.pageIndex >= state.months.length) {
      state.pageIndex = Math.max(0, state.months.length - 1);
    }
  }

  function summarizeRows(rows) {
    if (!rows.length) return { duck_start: 0, duck_dead: 0, duck_remain: 0, feed_out: 0, egg_daily: 0, feed_cost: 0, egg_income: 0, total_income: 0 };
    const sorted = rows.slice().sort((a, b) => String(a.date_key).localeCompare(String(b.date_key)));
    return {
      duck_start: Number(sorted[0].duck_start || 0),
      duck_dead: sum(sorted, 'duck_dead'),
      duck_remain: Number(sorted[sorted.length - 1].duck_remain || 0),
      feed_out: sum(sorted, 'feed_out'),
      egg_daily: sum(sorted, 'egg_daily'),
      feed_cost: sum(sorted, 'feed_cost'),
      egg_income: sum(sorted, 'egg_income'),
      total_income: sum(sorted, 'total_income')
    };
  }

  function footerLine(total) {
    return `ไข่ ${fmt(total.egg_daily)} | อาหาร ${fmt(total.feed_out)} | ค่าอาหาร ${money(total.feed_cost)} | ค่าไข่ ${money(total.egg_income)} | สุทธิ ${money(total.total_income)}`;
  }

  function deriveMonths(rows) {
    const map = new Map();
    rows.forEach((row) => {
      if (!row.month_key || map.has(row.month_key)) return;
      map.set(row.month_key, { key: row.month_key, label: thaiMonth(row.month_key), year: row.year, month: row.month });
    });
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }

  function thaiMonth(key) {
    const names = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const [y, m] = String(key || '').split('-').map(Number);
    return `${names[(m || 1) - 1] || key} ${y ? y + 543 : ''}`;
  }

  function ensureChartJs() {
    if (window.Chart) return Promise.resolve(true);
    if (chartLoadPromise) return chartLoadPromise;

    // v4.5: Do not load Chart.js from CDN by default.
    // Edge/Safari tracking prevention can show noisy storage warnings for third-party CDN scripts.
    // If you want to use real Chart.js, host chart.umd.min.js locally and include it in report.html
    // before report-page.js. Otherwise the native canvas fallback below will render the charts.
    chartLoadPromise = Promise.resolve(false);
    return chartLoadPromise;
  }

  function chartPalette() {
    return ['#2563eb', '#0ea5e9', '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#f59e0b', '#64748b'];
  }

  function shouldDrawValueLabels(count) {
    return count <= 35;
  }

  function fmtChartNumber(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('th-TH', {
      minimumFractionDigits: Number.isInteger(n) ? 0 : 1,
      maximumFractionDigits: 2
    });
  }

  function drawValueLabel(ctx, text, x, y, color, ratio) {
    const safe = String(text || '0');
    ctx.save();
    ctx.font = `${9.5 * ratio}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const metrics = ctx.measureText(safe);
    const padX = 3 * ratio;
    const h = 13 * ratio;
    const w = metrics.width + padX * 2;
    const bx = x - w / 2;
    const by = Math.max(2 * ratio, y - h);
    roundedRect(ctx, bx, by, w, h, 4, 'rgba(255,255,255,.88)');
    ctx.fillStyle = color || '#0f172a';
    ctx.fillText(safe, x, by + h - 2 * ratio);
    ctx.restore();
  }

  function drawBarCanvasChart(canvasId, labels, data, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    prepareNativeCanvas(canvas, labels.length);
    const ctx = canvas.getContext('2d');
    const box = chartBox(canvas);
    clearCanvas(ctx, canvas);
    drawAxes(ctx, box, labels);
    const max = Math.max(1, ...data.map(Number));
    const barW = Math.max(5, Math.min(20, box.w / Math.max(1, labels.length) * .62));
    const color = '#dc2626';
    const points = [];
    labels.forEach((lab, i) => {
      const value = Number(data[i] || 0);
      const x = box.x + (i + .5) * box.w / Math.max(1, labels.length);
      const h = (value / max) * box.h;
      const y = box.y + box.h - h;
      roundedRect(ctx, x - barW / 2, y, barW, h, 4, color);
      if (value > 0 && shouldDrawValueLabels(labels.length)) drawValueLabel(ctx, fmtChartNumber(value), x, y - 2 * box.ratio, color, box.ratio);
      points.push({ x, y, label: lab, items: [{ label, value, color }] });
    });
    drawLegend(ctx, [{ label, color }], canvas);
    registerNativeChartTooltip(canvas, points);
  }

  function drawComboCanvasChart(canvasId, labels, bars, line, barLabel, lineLabel) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    prepareNativeCanvas(canvas, labels.length);
    const ctx = canvas.getContext('2d');
    const box = chartBox(canvas);
    clearCanvas(ctx, canvas);
    drawAxes(ctx, box, labels);
    const maxBar = Math.max(1, ...bars.map(Number));
    const maxLine = Math.max(1, ...line.map(Number));
    const barColor = '#2563eb';
    const lineColor = '#f97316';
    const barW = Math.max(5, Math.min(20, box.w / Math.max(1, labels.length) * .62));
    const points = [];
    labels.forEach((lab, i) => {
      const barValue = Number(bars[i] || 0);
      const percentValue = Number(line[i] || 0);
      const x = box.x + (i + .5) * box.w / Math.max(1, labels.length);
      const h = (barValue / maxBar) * box.h;
      const y = box.y + box.h - h;
      roundedRect(ctx, x - barW / 2, y, barW, h, 4, barColor);
      if (barValue > 0 && shouldDrawValueLabels(labels.length)) drawValueLabel(ctx, fmtChartNumber(barValue), x, y - 2 * box.ratio, barColor, box.ratio);
      points.push({ x, y, label: lab, items: [
        { label: barLabel, value: barValue, color: barColor },
        { label: lineLabel, value: percentValue, color: lineColor, suffix: '%' }
      ] });
    });
    ctx.beginPath();
    labels.forEach((_, i) => {
      const x = box.x + (i + .5) * box.w / Math.max(1, labels.length);
      const y = box.y + box.h - (Number(line[i] || 0) / maxLine) * box.h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.4 * dpr();
    ctx.stroke();
    labels.forEach((_, i) => {
      const x = box.x + (i + .5) * box.w / Math.max(1, labels.length);
      const y = box.y + box.h - (Number(line[i] || 0) / maxLine) * box.h;
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(x, y, 2.4 * box.ratio, 0, Math.PI * 2);
      ctx.fill();
      if (Number(line[i] || 0) > 0 && shouldDrawValueLabels(labels.length) && i % 2 === 0) {
        drawValueLabel(ctx, `${fmtChartNumber(line[i])}%`, x, y - 5 * box.ratio, lineColor, box.ratio);
      }
    });
    drawLegend(ctx, [{ label: barLabel, color: barColor }, { label: lineLabel, color: lineColor }], canvas);
    registerNativeChartTooltip(canvas, points);
  }

  function drawStackedCanvasChart(canvasId, labels, datasets) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    prepareNativeCanvas(canvas, labels.length);
    const ctx = canvas.getContext('2d');
    const box = chartBox(canvas);
    clearCanvas(ctx, canvas);
    drawAxes(ctx, box, labels);
    const palette = chartPalette();
    const totals = labels.map((_, i) => datasets.reduce((sum, ds) => sum + Number(ds.data[i] || 0), 0));
    const max = Math.max(1, ...totals);
    const barW = Math.max(5, Math.min(20, box.w / Math.max(1, labels.length) * .62));
    const points = [];
    labels.forEach((lab, i) => {
      const x = box.x + (i + .5) * box.w / Math.max(1, labels.length);
      let y = box.y + box.h;
      const items = [];
      datasets.forEach((ds, j) => {
        const value = Number(ds.data[i] || 0);
        const h = (value / max) * box.h;
        const color = palette[j % palette.length];
        if (h > 0) roundedRect(ctx, x - barW / 2, y - h, barW, h, 2, color);
        y -= h;
        if (value > 0) items.push({ label: ds.label, value, color });
      });
      if (totals[i] > 0 && shouldDrawValueLabels(labels.length)) drawValueLabel(ctx, fmtChartNumber(totals[i]), x, y - 2 * box.ratio, '#0f766e', box.ratio);
      points.push({ x, y, label: lab, items: [{ label: 'รวม', value: totals[i], color: '#0f766e' }].concat(items) });
    });
    drawLegend(ctx, datasets.slice(0, 4).map((ds, i) => ({ label: ds.label, color: palette[i % palette.length] })), canvas);
    registerNativeChartTooltip(canvas, points);
  }

  function registerNativeChartTooltip(canvas, points) {
    nativeChartMeta.set(canvas, { points: points || [] });
    if (canvas.dataset.reportTooltipBound === '1') return;
    canvas.dataset.reportTooltipBound = '1';
    const move = (event) => showNativeChartTooltip(canvas, event);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('touchstart', move, { passive: true });
    canvas.addEventListener('touchmove', move, { passive: true });
    canvas.addEventListener('mouseleave', hideNativeChartTooltip);
    canvas.addEventListener('touchend', () => setTimeout(hideNativeChartTooltip, 900), { passive: true });
  }

  function ensureNativeChartTooltip() {
    let el = document.getElementById('reportNativeTooltip');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'reportNativeTooltip';
    el.className = 'report-native-tooltip hidden';
    document.body.appendChild(el);
    return el;
  }

  function showNativeChartTooltip(canvas, event) {
    const meta = nativeChartMeta.get(canvas);
    if (!meta || !meta.points?.length) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = event.touches?.[0] || event;
    const cssX = pointer.clientX - rect.left;
    const canvasX = cssX * (canvas.width / Math.max(1, rect.width));
    let nearest = null;
    let best = Infinity;
    meta.points.forEach((p) => {
      const d = Math.abs(Number(p.x || 0) - canvasX);
      if (d < best) { best = d; nearest = p; }
    });
    if (!nearest || best > 32 * dpr()) return hideNativeChartTooltip();
    const el = ensureNativeChartTooltip();
    el.innerHTML = `<b>${escapeHtml(nearest.label || '-')}</b>` + (nearest.items || []).map((item) => {
      const value = fmtChartNumber(item.value) + (item.suffix || '');
      return `<div><i style="background:${escapeHtml(item.color || '#64748b')}"></i><span>${escapeHtml(item.label || '')}</span><strong>${escapeHtml(value)}</strong></div>`;
    }).join('');
    const left = Math.min(window.innerWidth - 18, Math.max(8, pointer.clientX + 10));
    const top = Math.min(window.innerHeight - 18, Math.max(8, pointer.clientY + 10));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.classList.remove('hidden');
  }

  function hideNativeChartTooltip() {
    document.getElementById('reportNativeTooltip')?.classList.add('hidden');
  }

  function prepareNativeCanvas(canvas, labelCount = 0) {
    const wrap = canvas.closest('.report-chart-canvas');
    const baseW = wrap?.clientWidth || 320;
    const cssW = Math.max(baseW, Math.min(2400, Math.max(1, labelCount) * (state.selectedMonth === 'all' ? 24 : 18)));
    const cssH = 270;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ratio = dpr();
    canvas.width = Math.round(cssW * ratio);
    canvas.height = Math.round(cssH * ratio);
  }

  function dpr() { return Math.max(1, Math.min(2, window.devicePixelRatio || 1)); }

  function chartBox(canvas) {
    const ratio = dpr();
    return { x: 36 * ratio, y: 30 * ratio, w: canvas.width - 54 * ratio, h: canvas.height - 88 * ratio, ratio };
  }

  function clearCanvas(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = cssVar('--bg-card') || '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawAxes(ctx, box, labels) {
    const textColor = cssVar('--text-sub') || '#64748b';
    const gridColor = cssVar('--border-soft') || '#e5e7eb';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1 * box.ratio;
    ctx.font = `${10 * box.ratio}px system-ui, sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i += 1) {
      const y = box.y + (box.h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
    }
    const step = Math.max(1, Math.ceil(labels.length / 6));
    labels.forEach((label, i) => {
      if (i % step !== 0 && i !== labels.length - 1) return;
      const x = box.x + (i + .5) * box.w / Math.max(1, labels.length);
      ctx.fillText(label, x, box.y + box.h + 8 * box.ratio);
    });
  }

  function drawLegend(ctx, items, canvas) {
    const ratio = dpr();
    const y = canvas.height - 18 * ratio;
    let x = 12 * ratio;
    ctx.font = `${10 * ratio}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    items.forEach((item) => {
      ctx.fillStyle = item.color;
      ctx.fillRect(x, y - 4 * ratio, 8 * ratio, 8 * ratio);
      x += 12 * ratio;
      ctx.fillStyle = cssVar('--text-sub') || '#64748b';
      ctx.fillText(String(item.label || ''), x, y);
      x += Math.min(92 * ratio, ctx.measureText(String(item.label || '')).width + 14 * ratio);
    });
  }

  function roundedRect(ctx, x, y, w, h, r, color) {
    if (h < 1) return;
    const radius = Math.min(r * dpr(), Math.abs(h) / 2, w / 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.fill();
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function chartOptions({ stacked = false, rightAxis = false } = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(15, 23, 42, .92)',
          titleColor: '#fff',
          bodyColor: '#fff',
          padding: 10,
          cornerRadius: 10,
          callbacks: {
            label(ctx) {
              const label = ctx.dataset?.label || '';
              const value = ctx.parsed?.y ?? ctx.raw ?? 0;
              return `${label}: ${fmtChartNumber(value)}`;
            }
          }
        }
      },
      scales: {
        x: { stacked, grid: { display: false }, ticks: { color: '#64748b', maxRotation: 0, autoSkip: true } },
        y: { stacked, beginAtZero: true, grid: { color: 'rgba(148, 163, 184, .25)' }, ticks: { color: '#64748b' } },
        ...(rightAxis ? { y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#f97316' } } } : {})
      }
    };
  }

  function destroyCharts() {
    Object.values(state.charts).forEach((chart) => chart?.destroy?.());
    state.charts = {};
  }

  function setButtonLoading(id, isLoading, loadingText = '') {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (!btn.dataset.defaultLabel) btn.dataset.defaultLabel = btn.textContent || '';
    if (isLoading) btn.dataset.loadingSelf = '1';
    else delete btn.dataset.loadingSelf;
    btn.disabled = !!isLoading;
    btn.textContent = isLoading ? loadingText : btn.dataset.defaultLabel;
  }

  function openFileUrl(url) {
    if (!url) {
      alert('สร้างไฟล์สำเร็จ แต่ไม่พบ URL สำหรับดาวน์โหลด');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function setBusy(isBusy, text = '') {
    const rebuild = document.getElementById('reportRebuildBtn');
    const exportBtn = document.getElementById('reportExportBtn');
    if (rebuild && !rebuild.dataset.loadingSelf) rebuild.disabled = isBusy;
    if (exportBtn && !exportBtn.dataset.loadingSelf) exportBtn.disabled = isBusy;
    if (text) setText('reportHint', text);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function sum(rows, key) { return rows.reduce((s, r) => s + Number(r[key] || 0), 0); }
  function fmt(value) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
  function money(value) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 }); }
  function fmtCompact(value) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 }); }
  function fmtPercent(value) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
  function fmtFeed(value) { const n = Number(value || 0); return n.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(n) ? 0 : 1, maximumFractionDigits: 2 }); }
  function shortDate(value) { return String(value || '').replace(/ \d{4}$/, ''); }
  function dayOnly(row) {
    const key = String(row?.date_key || '');
    const match = key.match(/^(?:\d{4})-(?:\d{2})-(\d{2})$/);
    if (match) return String(Number(match[1]));
    const display = String(row?.date_display || '').trim();
    const first = display.split(/\s+/)[0];
    return first || '-';
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function autoBootstrapReportPage() {
    if (document.body?.dataset?.page !== 'report') return;
    // กันเคส app.js เก่าไม่ได้เพิ่ม branch report หรือ Chart CDN โหลดช้าแล้วหน้าไม่เริ่มทำงาน
    setTimeout(() => {
      if (!bootstrapped) bootstrap();
    }, 0);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', autoBootstrapReportPage, { once: true });
  } else {
    autoBootstrapReportPage();
  }

  return { bootstrap };
})();
