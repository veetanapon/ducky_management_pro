window.ModuleCalendarPage = (() => {
  const state = { batch: null, moduleType: '', month: '', permission: 'none', data: null, feedLots: [], feedLotMap: {}, feedEditDate: '', feedEditRows: [] };
  const CACHE_TTL_MS = 60 * 1000;
  const EGG_TYPE_OPTIONS = [
    { key: 'qty_all', label: 'ไข่รวม' },
    { key: 'qty_big', label: 'ไข่ใหญ่/แฝด' },
    { key: 'qty_small', label: 'ไข่เล็ก' },
    { key: 'qty_cracked', label: 'ไข่บุบ' },
    { key: 'qty_broken', label: 'ไข่แตก' },
    { key: 'qty_remain', label: 'ไข่คงเหลือ' }
  ];

  async function bootstrap() {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    state.moduleType = document.body?.dataset?.module || 'feed_manage';
    state.month = monthKey(new Date());
    bindBaseEvents();
    const batchId = new URLSearchParams(location.search).get('bid');
    if (!batchId) {
      document.getElementById('moduleSubtitle').textContent = 'ไม่พบ batch id';
      return;
    }

    const cachedContext = readCache(`ducky:batch-dashboard:${batchId}`);
    const expectedPermission = pickModulePermission(cachedContext?.module_permissions || {}, state.moduleType, cachedContext?.batch?.specie || cachedContext?.batch?.specie, cachedContext?.batch?.specie);
    if (cachedContext && expectedPermission === 'none' && !cachedContext.is_owner && !cachedContext.is_admin) {
      renderNoAccess();
      return;
    }

    await load(batchId);
  }

  
function bindBaseEvents() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);
    document.getElementById('calendarPrevBtn')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('calendarNextBtn')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('moduleCalendarGrid')?.addEventListener('click', onCalendarCellClick);

    document.getElementById('feedLogCloseBtn')?.addEventListener('click', closeFeedSheet);
    document.getElementById('feedLogBackdrop')?.addEventListener('click', closeFeedSheet);
    document.getElementById('feedLogCancelBtn')?.addEventListener('click', closeFeedSheet);
    document.getElementById('feedLogForm')?.addEventListener('submit', submitFeedLog);
    document.getElementById('addFeedEntryBtn')?.addEventListener('click', () => appendFeedEntryRow());
    document.getElementById('feedEntryList')?.addEventListener('click', onFeedEntryListClick);
    document.getElementById('feedEntryList')?.addEventListener('change', onFeedEntryListChange);
    document.getElementById('feedEntryList')?.addEventListener('input', onFeedEntryListInput);

    document.getElementById('eggDailyCloseBtn')?.addEventListener('click', closeEggDailySheet);
    document.getElementById('eggDailyBackdrop')?.addEventListener('click', closeEggDailySheet);
    document.getElementById('eggDailyCancelBtn')?.addEventListener('click', closeEggDailySheet);
    document.getElementById('eggDailyForm')?.addEventListener('submit', submitEggDailyLog);
    document.getElementById('addEggEntryBtn')?.addEventListener('click', () => appendEggEntryRow());
    document.getElementById('eggEntryList')?.addEventListener('click', onEggListClick);
    document.getElementById('eggEntryList')?.addEventListener('change', onEggListChange);
  }

  async function load(batchId) {
    const cacheKey = `ducky:module:${state.moduleType}:${batchId}:${state.month}`;
    const cached = readCache(cacheKey);
    if (cached) {
      renderAll(cached);
    }

    const response = await AppApi.post({ action: 'getModuleCalendarData', batch_id: batchId, module_type: state.moduleType, month: state.month });
    if (!response || response.status !== 'ok') {
      if (!cached) {
        document.getElementById('moduleSubtitle').textContent = response?.message || 'โหลดข้อมูลไม่สำเร็จ';
      }
      return;
    }
    writeCache(cacheKey, response);
    renderAll(response);
  }

  function renderAll(response) {
    state.batch = response.batch;
    state.permission = response.permission || 'none';
    state.data = response;
    state.feedLots = Array.isArray(response.feed_lots) ? response.feed_lots : [];
    state.feedLotMap = Object.fromEntries(state.feedLots.map((lot) => [lot.label, lot]));

    if (state.permission === 'none') {
      renderNoAccess();
      return;
    }

    renderHeader();
    renderSummary();
    renderCalendar();
    // renderRecentLogs();
    renderFab();
    if (window.NavDrawer) {
      NavDrawer.setBatchContext({
        id: state.batch.id,
        specie: state.batch.specie,
        permission: response.batch_permission || response.permission,
        isOwner: !!response.is_owner,
        isAdmin: !!response.is_admin,
        module_permissions: response.module_permissions || {}
      });
    }
  }

  async function changeMonth(offset) {
    const [year, month] = state.month.split('-').map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    state.month = monthKey(next);
    await load(state.batch.id);
  }

  function renderHeader() {
    const labels = {
      feed_manage: ['จัดการอาหาร', ''],
      egg_daily: ['บันทึกจำนวนไข่รายวัน', ''],
      sale_manage: ['ขายออก / บิล', ''],
      report: ['รายงาน', '']
      // feed_manage: ['จัดการอาหาร', 'สรุปคลังอาหารและวันที่มีการบันทึกของ batch นี้'],
      // egg_daily: ['บันทึกจำนวนไข่รายวัน', 'สรุปการบันทึกไข่และวันที่ยังไม่ได้กรอก'],
      // sale_manage: ['ขายออก / บิล', 'สรุปการขายและเอกสารของ batch นี้'],
      // report: ['รายงาน', 'สรุปภาพรวมสำหรับใช้ทำรายงาน']
    };
    const [title, subtitle] = labels[state.moduleType] || ['โมดูล', 'กำลังโหลดข้อมูล'];
    document.getElementById('moduleTitle').textContent = title;
    document.getElementById('moduleSubtitle').textContent = `• ${state.batch.name}  ${subtitle}`;
    document.getElementById('modulePermissionBadge').className = `badge-inline ${badgeClass(state.permission)}`;
    document.getElementById('modulePermissionBadge').textContent = permissionLabel(state.permission);
    document.getElementById('moduleHint').textContent = state.data.hint || subtitle;
    document.getElementById('calendarMonthLabel').textContent = formatThaiMonth(state.month);
    document.getElementById('calendarTitle').textContent = `ปฏิทิน ${formatThaiMonth(state.month)}`;
  }

  function renderSummary() {
    let cards = state.data.summary_cards || [];
    const container = document.getElementById('moduleSummaryCards');

    if (state.moduleType === 'feed_manage') {
      container.className = 'module-summary-grid module-summary-grid--3';
      cards = cards.slice(0, 3);
    } else if (state.moduleType === 'egg_daily') {
      container.className = 'module-summary-grid module-summary-grid--3';
      cards = cards.slice(0, 3);
    } else if (state.moduleType === 'sale_manage') {
      container.className = 'module-summary-grid module-summary-grid--2';
      cards = cards.slice(0, 2);
    } else {
      container.className = 'module-summary-grid';
    }

    container.innerHTML = cards.map((card) => `
      <div class="module-summary-card">
        <span class="module-summary-label">${escapeHtml(card.label)}</span>
        <strong class="module-summary-value">${escapeHtml(card.value)}</strong>
        <span class="muted">${escapeHtml(card.note || '')}</span>
      </div>
    `).join('');
  }

  
function renderCalendar() {
    const calendarPanel = document.querySelector('.module-calendar-panel');
    const isFishSale = state.moduleType === 'sale_manage' && state.batch?.specie === 'fish';
    if (calendarPanel) calendarPanel.classList.toggle('hidden', isFishSale || state.moduleType === 'report');
    if (isFishSale || state.moduleType === 'report') return;

    const grid = document.getElementById('moduleCalendarGrid');
    const month = state.month;
    const map = state.data.calendar_map || {};
    const [year, monthNum] = month.split('-').map(Number);
    const firstDay = new Date(year, monthNum - 1, 1);
    const lastDay = new Date(year, monthNum, 0).getDate();
    const startWeekday = firstDay.getDay();
    const cells = [];
    for (let i = 0; i < startWeekday; i += 1) cells.push('<div class="module-day module-day--empty"></div>');
    for (let day = 1; day <= lastDay; day += 1) {
      const key = `${month}-${String(day).padStart(2, '0')}`;
      const item = map[key] || null;
      const canQuickEdit = !!item && (state.moduleType === 'egg_daily' || state.moduleType === 'feed_manage') && state.permission === 'write';
      const cls = item ? 'module-day module-day--filled' : 'module-day module-day--missing';
      const meta = item ? `${escapeHtml(item.meta || '')}` : 'ยังไม่บันทึก';
      const plusLine = item?.plus_text ? `<div class="module-day-total module-day-total--plus">${escapeHtml(item.plus_text)}</div>` : '';
      const minusLine = item?.minus_text ? `<div class="module-day-total module-day-total--minus">${escapeHtml(item.minus_text)}</div>` : '';
      const iconLine = item?.icon ? `<div class="module-day-total module-day-total--icon">${escapeHtml(item.icon)}</div>` : '';
      const plainLine = (!item?.plus_text && !item?.minus_text && !item?.icon)
        ? `<div class="module-day-total">${escapeHtml(item?.value || '-')}</div>`
        : '';
      cells.push(`<div class="${cls}${canQuickEdit ? ' module-day--clickable' : ''}" title="${meta}" ${canQuickEdit ? `data-log-date="${key}"` : ''}><div class="module-day-number">${day}</div>${plusLine}${minusLine}${iconLine}${plainLine}</div>`);
    }
    grid.innerHTML = cells.join('');
  }

  function renderRecentLogs() {
    const list = document.getElementById('recentLogList');
    const badge = document.getElementById('recentCountBadge');
    const rows = state.data.recent_logs || [];
    badge.textContent = `${rows.length} รายการ`;
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">ยังไม่มีรายการในช่วงที่เลือก</div>';
      return;
    }
    list.innerHTML = rows.map((row) => `
      <div class="log-item">
        <div class="log-item__head"><strong>${escapeHtml(row.title || '-')}</strong><span>${escapeHtml(row.log_date || '-')}</span></div>
        <div class="log-item__body">${(row.lines || []).map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>
      </div>
    `).join('');
  }

  function renderFab() {
    const root = document.getElementById('moduleFabRoot');
    if (!root) return;
    if (state.permission !== 'write' || state.moduleType === 'report') {
      root.innerHTML = '';
      return;
    }
    let actions;
    if (state.moduleType === 'feed_manage') {
      actions = [{ label: 'รับเข้า', code: 'feed-in' }, { label: 'ตัดจ่าย', code: 'feed-out' }];
    } else if (state.moduleType === 'sale_manage') {
      actions = [{ label: 'ขายออก', code: 'sale-create' }];
    } else {
      actions = [{ label: 'บันทึกวันนี้', code: 'egg-add' }, { label: 'แก้ไขล่าสุด', code: 'egg-edit' }];
    }
    root.innerHTML = `
      <div class="module-fab" id="moduleFab">
        <div class="module-fab-actions">${actions.map((item) => `<button type="button" class="module-fab-action" data-module-action="${item.code}">${item.label}</button>`).join('')}</div>
        <button type="button" class="fab module-fab-main" id="moduleFabToggle">＋</button>
      </div>
    `;
    document.getElementById('moduleFabToggle')?.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleFab();
    });
    root.querySelectorAll('[data-module-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const code = button.dataset.moduleAction;
        document.getElementById('moduleFab')?.classList.remove('open');
        if (code === 'sale-create') {
          location.href = `module-batch-manage.html?bid=${encodeURIComponent(state.batch.id)}&action=sell`;
          return;
        }
        if (code === 'feed-in') return openFeedSheet('in');
        if (code === 'feed-out') return openFeedSheet('out');
        if (code === 'egg-add') return openEggDailySheet();
        if (code === 'egg-edit') return editLatestEggDaily();
      });
    });
    document.addEventListener('click', onOutsideFabClick, { capture: true });
  }

  function onOutsideFabClick(event) {
    const root = document.getElementById('moduleFab');
    if (root && !root.contains(event.target)) root.classList.remove('open');
  }
  function toggleFab() { document.getElementById('moduleFab')?.classList.toggle('open'); }

  
function openFeedSheet(mode) {
    const sheet = document.getElementById('feedLogSheet');
    if (!sheet) return;
    document.getElementById('feedEditMode').value = 'create';
    document.getElementById('feedEditDate').value = '';
    document.getElementById('feedTransType').value = mode;
    document.getElementById('feedLogTitle').textContent = mode === 'in' ? 'รับเข้าอาหาร' : 'ตัดจ่ายอาหาร';
    document.getElementById('feedLogDate').value = todayString();
    document.getElementById('feedRemark').value = '';
    document.getElementById('feedFormHint').textContent = mode === 'in'
      ? 'เพิ่มอาหารเข้าได้หลาย lot ในครั้งเดียว'
      : 'ตัดจ่ายได้หลาย lot ในครั้งเดียว และเลือกจาก lot ที่มีอยู่';
    const list = document.getElementById('feedEntryList');
    list.innerHTML = '';
    appendFeedEntryRow({ trans_type: mode });
    refreshFeedLotDatalist();
    showSheet(sheet);
  }

  function openFeedSheetForEdit(payload) {
    const sheet = document.getElementById('feedLogSheet');
    if (!sheet) return;
    document.getElementById('feedEditMode').value = 'replace_day';
    document.getElementById('feedEditDate').value = payload.log_date || '';
    document.getElementById('feedTransType').value = 'mixed';
    document.getElementById('feedLogTitle').textContent = `แก้ไขรายการอาหาร ${payload.log_date || ''}`;
    document.getElementById('feedLogDate').value = payload.log_date || todayString();
    document.getElementById('feedRemark').value = payload.remark || '';
    document.getElementById('feedFormHint').textContent = 'แก้ไขรายการทั้งหมดของวันนั้น แล้วระบบจะบันทึกทับรายการเดิมทั้งวัน';
    const list = document.getElementById('feedEntryList');
    list.innerHTML = '';
    const rows = Array.isArray(payload.records) ? payload.records : [];
    if (rows.length) {
      rows.forEach((row) => appendFeedEntryRow(row));
    } else {
      appendFeedEntryRow({ trans_type: 'out' });
    }
    refreshFeedLotDatalist();
    showSheet(sheet);
  }

  function closeFeedSheet() {
    hideSheet(document.getElementById('feedLogSheet'));
  }

  function refreshFeedLotDatalist() {
    const datalist = document.getElementById('feedLotOptions');
    if (!datalist) return;
    datalist.innerHTML = state.feedLots.map((lot) => `<option value="${escapeAttr(lot.label)}"></option>`).join('');
  }

  function appendFeedEntryRow(entry = {}) {
    const list = document.getElementById('feedEntryList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'feed-entry-row';
    row.innerHTML = `
      <div class="feed-entry-head">
        <span class="feed-entry-badge">รายการ lot อาหาร</span>
        <button type="button" class="secondary-btn entry-remove-btn entry-remove-btn--feed" data-feed-action="remove">ลบ lot นี้</button>
      </div>
      <div class="feed-entry-grid">
        <div>
          <label class="field-label">ประเภท</label>
          <select class="feed-entry-type">
            <option value="in" ${String(entry.trans_type || 'out') === 'in' ? 'selected' : ''}>รับเข้า</option>
            <option value="out" ${String(entry.trans_type || 'out') === 'out' ? 'selected' : ''}>ตัดจ่าย</option>
          </select>
        </div>
        <div>
          <label class="field-label">จำนวน</label>
          <input class="feed-entry-qty" type="number" min="0.01" step="0.01" placeholder="จำนวน" value="${entry.qty != null ? escapeAttr(entry.qty) : ''}" />
        </div>
      </div>
      <div>
        <label class="field-label">ชื่ออาหาร / lot</label>
        <input class="feed-entry-name" type="text" list="feedLotOptions" placeholder="เลือก lot หรือพิมพ์ชื่อใหม่" value="${escapeAttr(entry.feed_label || entry.feed_name || '')}" />
        <input class="feed-entry-feed-id" type="hidden" value="${escapeAttr(entry.feed_id || '')}" />
        <div class="feed-entry-lot-info muted"></div>
      </div>
      <div class="feed-entry-grid feed-entry-grid--unit">
        <div>
          <label class="field-label">ราคาต่อหน่วย</label>
          <input class="feed-entry-unit-price" type="number" min="0" step="0.01" placeholder="ราคาต่อหน่วย" value="${entry.unit_price != null ? escapeAttr(entry.unit_price) : ''}" />
        </div>
      </div>
    `;
    list.appendChild(row);
    syncFeedEntryRow(row);
  }

  function onFeedEntryListClick(event) {
    const removeBtn = event.target.closest('[data-feed-action="remove"]');
    if (!removeBtn) return;
    const list = document.getElementById('feedEntryList');
    if (list.children.length <= 1) return;
    removeBtn.closest('.feed-entry-row')?.remove();
  }

  function onFeedEntryListChange(event) {
    const row = event.target.closest('.feed-entry-row');
    if (!row) return;
    if (event.target.classList.contains('feed-entry-type') || event.target.classList.contains('feed-entry-name')) {
      syncFeedEntryRow(row);
    }
  }

  function onFeedEntryListInput(event) {
    const row = event.target.closest('.feed-entry-row');
    if (!row) return;
    if (event.target.classList.contains('feed-entry-name')) {
      syncFeedEntryRow(row, true);
    }
  }

  function syncFeedEntryRow(row, preserveTyping = false) {
    const type = row.querySelector('.feed-entry-type')?.value || 'out';
    const nameInput = row.querySelector('.feed-entry-name');
    const feedIdInput = row.querySelector('.feed-entry-feed-id');
    const unitInput = row.querySelector('.feed-entry-unit-price');
    const info = row.querySelector('.feed-entry-lot-info');
    const matched = state.feedLotMap[nameInput.value] || null;
    if (matched) {
      feedIdInput.value = matched.id || '';
      if (type === 'out') {
        unitInput.value = matched.unit_price || 0;
        unitInput.readOnly = true;
        nameInput.placeholder = 'เลือก lot ที่มีอยู่';
      }
      info.textContent = `${matched.name} • วันที่เข้า ${matched.start_date || '-'} • ${formatCompactNumber(matched.unit_price || 0)} บาท/หน่วย • คงเหลือ ${formatCompactNumber(matched.current_qty || 0)}`;
    } else {
      feedIdInput.value = '';
      if (type === 'out') {
        unitInput.readOnly = true;
        if (!preserveTyping) unitInput.value = '';
        info.textContent = 'เลือก lot จากรายการที่มีอยู่ เพื่อใช้ตัดจ่าย';
      } else {
        unitInput.readOnly = false;
        info.textContent = 'พิมพ์ชื่ออาหารใหม่หรือใช้ชื่อเดิมได้';
      }
    }
    if (type === 'in') {
      unitInput.readOnly = false;
      nameInput.placeholder = 'เช่น อาหารขุน A lot 2026-01';
      if (matched && !preserveTyping && !unitInput.value) unitInput.value = matched.unit_price || 0;
    }
  }

  async function submitFeedLog(event) {
    event.preventDefault();
    if (!state.batch) return;
    const rows = [...document.querySelectorAll('.feed-entry-row')];
    if (!rows.length) return alert('กรุณาเพิ่มรายการอย่างน้อย 1 lot');
    const entries = [];
    for (const row of rows) {
      const transType = row.querySelector('.feed-entry-type')?.value || 'out';
      const label = row.querySelector('.feed-entry-name')?.value.trim() || '';
      const matched = state.feedLotMap[label] || null;
      const feedId = row.querySelector('.feed-entry-feed-id')?.value || matched?.id || '';
      const feedName = matched?.name || label;
      const qty = Number(row.querySelector('.feed-entry-qty')?.value || 0);
      const unitPrice = Number(row.querySelector('.feed-entry-unit-price')?.value || 0);
      if (!feedName) return alert('กรุณาระบุชื่ออาหาร / lot ทุกรายการ');
      if (!(qty > 0)) return alert('จำนวนอาหารต้องมากกว่า 0');
      if (transType === 'out' && !feedId) return alert('รายการตัดจ่ายต้องเลือก lot ที่มีอยู่จากรายการ');
      entries.push({ trans_type: transType, feed_id: feedId, feed_name: feedName, qty, unit_price: unitPrice });
    }
    const payload = {
      action: 'saveFeedLog',
      batch_id: state.batch.id,
      log_date: document.getElementById('feedLogDate').value,
      remark: document.getElementById('feedRemark').value.trim(),
      mode: document.getElementById('feedEditMode').value,
      entries
    };
    const submit = document.getElementById('feedLogSubmitBtn');
    const original = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post(payload);
    submit.disabled = false;
    submit.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกข้อมูลอาหารไม่สำเร็จ');
    closeFeedSheet();
    clearModuleCaches(state.batch.id, ['feed_manage']);
    state.month = String(payload.log_date || state.month).slice(0, 7);
    await load(state.batch.id);
  }

  async function onCalendarCellClick(event) {
    const cell = event.target.closest('.module-day[data-log-date]');
    if (!cell || state.permission !== 'write') return;
    const logDate = cell.dataset.logDate;
    if (!logDate) return;
    if (state.moduleType === 'egg_daily') {
      const ok = confirm(`ต้องการแก้ไขข้อมูลไข่ประจำวันที่ ${logDate} ใช่หรือไม่`);
      if (!ok) return;
      const response = await AppApi.post({ action: 'getEggDailyRecord', batch_id: state.batch.id, log_date: logDate });
      if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดข้อมูลไม่สำเร็จ');
      if (!response.record) return alert('ไม่พบข้อมูลของวันที่เลือก');
      openEggDailySheet(response.record);
      return;
    }
    if (state.moduleType === 'feed_manage') {
      const ok = confirm(`ต้องการแก้ไขรายการอาหารประจำวันที่ ${logDate} ใช่หรือไม่`);
      if (!ok) return;
      const response = await AppApi.post({ action: 'getFeedLogRecord', batch_id: state.batch.id, log_date: logDate });
      if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดข้อมูลอาหารไม่สำเร็จ');
      state.feedLots = Array.isArray(response.feed_lots) ? response.feed_lots : state.feedLots;
      state.feedLotMap = Object.fromEntries(state.feedLots.map((lot) => [lot.label, lot]));
      openFeedSheetForEdit(response);
    }
  }

  function openEggDailySheet(record = null) {
    const sheet = document.getElementById('eggDailySheet');
    if (!sheet) return;
    document.getElementById('eggDailyTitle').textContent = record ? 'แก้ไขบันทึกไข่รายวัน' : 'บันทึกจำนวนไข่รายวัน';
    document.getElementById('eggDailyDate').value = record?.log_date || todayString();
    const list = document.getElementById('eggEntryList');
    list.innerHTML = '';
    const rows = buildEggRowsFromRecord(record);
    rows.forEach((row) => appendEggEntryRow(row.key, row.value));
    if (!rows.length) appendEggEntryRow();
    syncEggTypeOptions();
    showSheet(sheet);
  }

  function closeEggDailySheet() {
    hideSheet(document.getElementById('eggDailySheet'));
  }

  async function editLatestEggDaily() {
    if (!state.batch) return;
    const response = await AppApi.post({ action: 'getEggDailyRecord', batch_id: state.batch.id, mode: 'latest' });
    if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดข้อมูลล่าสุดไม่สำเร็จ');
    if (!response.record) return alert('ยังไม่มีข้อมูลไข่รายวันให้แก้ไข');
    openEggDailySheet(response.record);
  }

  function buildEggRowsFromRecord(record) {
    if (!record) return [];
    return EGG_TYPE_OPTIONS
      .map((item) => ({ key: item.key, value: Number(record[item.key] || 0) }))
      .filter((item) => item.value > 0);
  }

  function appendEggEntryRow(typeKey = 'qty_all', qtyValue = '') {
    const list = document.getElementById('eggEntryList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'module-entry-row';
    row.innerHTML = `
      <select class="egg-entry-type"></select>
      <input class="egg-entry-qty" type="number" min="0" step="1" placeholder="จำนวน" value="${qtyValue !== '' ? escapeAttr(qtyValue) : ''}" />
      <button type="button" class="secondary-btn entry-remove-btn" data-egg-action="remove">ลบ</button>
    `;
    list.appendChild(row);
    fillEggTypeOptions(row.querySelector('.egg-entry-type'), typeKey);
    syncEggTypeOptions();
  }

  function onEggListClick(event) {
    const button = event.target.closest('[data-egg-action="remove"]');
    if (!button) return;
    const list = document.getElementById('eggEntryList');
    if (list.children.length <= 1) return;
    button.closest('.module-entry-row')?.remove();
    syncEggTypeOptions();
  }

  function onEggListChange(event) {
    if (event.target.closest('.egg-entry-type')) syncEggTypeOptions();
  }

  function fillEggTypeOptions(select, selectedValue) {
    if (!select) return;
    select.innerHTML = EGG_TYPE_OPTIONS.map((item) => `
      <option value="${item.key}" ${item.key === selectedValue ? 'selected' : ''}>${item.label}</option>
    `).join('');
  }

  function syncEggTypeOptions() {
    const selects = [...document.querySelectorAll('.egg-entry-type')];
    const picked = selects.map((select) => select.value).filter(Boolean);
    selects.forEach((select) => {
      const own = select.value;
      [...select.options].forEach((option) => {
        option.disabled = option.value !== own && picked.includes(option.value);
      });
    });
  }

  async function submitEggDailyLog(event) {
    event.preventDefault();
    if (!state.batch) return;
    const rows = [...document.querySelectorAll('.module-entry-row')];
    if (!rows.length) return alert('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ');
    const payload = {
      action: 'saveEggDailyLog',
      batch_id: state.batch.id,
      log_date: document.getElementById('eggDailyDate').value,
      qty_all: 0,
      qty_big: 0,
      qty_small: 0,
      qty_cracked: 0,
      qty_broken: 0,
      qty_remain: 0
    };
    const used = new Set();
    for (const row of rows) {
      const type = row.querySelector('.egg-entry-type')?.value;
      const qty = Number(row.querySelector('.egg-entry-qty')?.value || 0);
      if (!type) return alert('กรุณาเลือกชนิดไข่ทุกรายการ');
      if (used.has(type)) return alert('ชนิดไข่ซ้ำกัน กรุณาเลือกไม่ให้ซ้ำ');
      used.add(type);
      if (qty < 0) return alert('จำนวนไข่ต้องไม่ติดลบ');
      payload[type] = qty;
    }
    const submit = document.getElementById('eggDailySubmitBtn');
    const original = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post(payload);
    submit.disabled = false;
    submit.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกไข่รายวันไม่สำเร็จ');
    closeEggDailySheet();
    clearModuleCaches(state.batch.id, ['egg_daily']);
    state.month = String(payload.log_date || state.month).slice(0, 7);
    await load(state.batch.id);
  }

  function showSheet(sheet) {
    if (!sheet) return;
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => sheet.classList.add('show'));
  }

  function hideSheet(sheet) {
    if (!sheet) return;
    sheet.classList.remove('show');
    setTimeout(() => sheet.classList.add('hidden'), 220);
  }

  function clearModuleCaches(batchId, modules) {
    try {
      const prefixes = (modules || []).map((moduleKey) => `ducky:module:${moduleKey}:${batchId}:`);
      Object.keys(localStorage).forEach((key) => {
        if (prefixes.some((prefix) => key.indexOf(prefix) === 0)) localStorage.removeItem(key);
      });
      localStorage.removeItem(`ducky:batch-dashboard:${batchId}`);
    } catch (_) {}
  }

  function renderNoAccess() {
    document.getElementById('moduleSubtitle').textContent = 'คุณไม่มีสิทธิ์เข้าถึงโมดูลนี้';
    const intro = document.querySelector('.module-page-intro');
    if (intro) {
      intro.querySelector('#modulePermissionBadge').className = 'badge-inline danger-soft';
      intro.querySelector('#modulePermissionBadge').textContent = 'ไม่มีสิทธิ์';
      intro.querySelector('#moduleHint').textContent = 'ระบบจะไม่ดึงข้อมูลเชิงลึกของโมดูลนี้เพิ่มเติม';
    }
    document.getElementById('moduleSummaryCards').innerHTML = '<div class="empty-state">ไม่มีข้อมูลสำหรับโมดูลนี้</div>';
    document.querySelector('.module-calendar-panel')?.classList.add('hidden');
    document.getElementById('recentLogList').innerHTML = '<div class="empty-state">ไม่มีข้อมูลสำหรับโมดูลนี้</div>';
    document.getElementById('moduleFabRoot')?.replaceChildren();
  }

  function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
  function todayString() { return monthKey(new Date()) + '-' + String(new Date().getDate()).padStart(2, '0'); }
  function formatThaiMonth(month) {
    const [year, m] = month.split('-').map(Number);
    const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    return `${months[m - 1]} ${year + 543}`;
  }
  function permissionLabel(value) { return value === 'write' ? 'ดูและแก้ไข' : (value === 'view' ? 'ดูอย่างเดียว' : 'ไม่มีสิทธิ์'); }
  function badgeClass(value) { return value === 'write' ? 'success' : (value === 'view' ? 'muted-badge' : 'danger-soft'); }
  function formatCompactNumber(value) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  function escapeHtml(text) { return String(text || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m])); }
  function escapeAttr(text) { return escapeHtml(String(text || '')); }
  function readCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - Number(parsed.savedAt || 0) > CACHE_TTL_MS) return null;
      return parsed.data || null;
    } catch (_) { return null; }
  }
  function writeCache(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch (_) {}
  }
  function pickModulePermission(perms, moduleType, specie) {
    if (moduleType === 'sale_manage') return perms[(specie === 'fish' ? 'fish_sale' : 'egg_sale')] || 'none';
    if (moduleType === 'feed_manage' && specie === 'fish') return perms['fish_feed_manage'] || 'none';
    return perms[moduleType] || 'none';
  }

  return { bootstrap };
})();
