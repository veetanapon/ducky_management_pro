window.ModuleCalendarPage = (() => {
  const state = { batch: null, moduleType: '', month: '', permission: 'none', data: null, feedLots: [], feedLotMap: {}, feedEditDate: '', feedEditRows: [], saleType: '', salePriceSet: null, salePriceItems: [], salePriceLoaded: false, billDraft: null, billPreviewImage: '', saleEditBillId: '', saleRangeRows: [], saleRangeTotals: null, saleRangeImage: '', preBillReviewId: '', priceLoadPromise: null, logoUrl: 'assets/farm-logo.png' };
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

    document.getElementById('saleBillCloseBtn')?.addEventListener('click', closeSaleBillSheet);
    document.getElementById('saleBillBackdrop')?.addEventListener('click', closeSaleBillSheet);
    document.getElementById('saleBillForm')?.addEventListener('submit', onPreviewBillSubmit);
    document.getElementById('addSaleItemBtn')?.addEventListener('click', () => appendSaleItemRow());
    document.getElementById('saleTypeEggBtn')?.addEventListener('click', async () => { await loadEffectiveEggPriceSet(true); setSaleType('egg', true); });
    document.getElementById('saleTypeDuckBtn')?.addEventListener('click', () => setSaleType('duck', true));
    document.getElementById('billPreviewCloseBtn')?.addEventListener('click', closeBillPreview);
    document.getElementById('billPreviewBackdrop')?.addEventListener('click', closeBillPreview);
    document.getElementById('billBackToEditBtn')?.addEventListener('click', backToEditBill);
    document.getElementById('billDownloadBtn')?.addEventListener('click', downloadBillImage);
    document.getElementById('billConfirmBtn')?.addEventListener('click', confirmBill);
    document.getElementById('saleBillPickerCloseBtn')?.addEventListener('click', closeSaleBillPicker);
    document.getElementById('saleBillPickerBackdrop')?.addEventListener('click', closeSaleBillPicker);
    document.getElementById('saleBillPickerList')?.addEventListener('click', onSaleBillPickerClick);
    document.getElementById('saleRangeSearchBtn')?.addEventListener('click', searchSaleRangeSummary);
    document.getElementById('saleRangePreviewBtn')?.addEventListener('click', previewSaleRangeSummaryImage);
    document.getElementById('saleRangeSummaryList')?.addEventListener('click', onSaleRangeListClick);
    document.getElementById('saleRangePreviewCloseBtn')?.addEventListener('click', closeSaleRangePreview);
    document.getElementById('saleRangePreviewBackdrop')?.addEventListener('click', closeSaleRangePreview);
    document.getElementById('saleRangeBackBtn')?.addEventListener('click', closeSaleRangePreview);
    document.getElementById('saleRangeDownloadBtn')?.addEventListener('click', downloadSaleRangeSummaryImage);
    ensureSaleDiscountField();
    normalizeSaleLayout();
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
    initSaleRangeSummaryDefaults();
    // renderRecentLogs();
    renderFab();
    if (state.moduleType === 'sale_manage' && String(state.batch?.specie || '').toLowerCase() === 'duck') warmSalePriceCache();
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
    if (calendarPanel) calendarPanel.classList.toggle('hidden', state.moduleType === 'report');
    if (state.moduleType === 'report') return;

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
      const canQuickEdit = !!item && ['egg_daily', 'feed_manage', 'sale_manage'].includes(state.moduleType) && state.permission === 'write';
      const cls = item ? 'module-day module-day--filled' : 'module-day module-day--missing';
      const meta = item ? `${escapeHtml(item.meta || '')}` : 'ยังไม่บันทึก';
      const plusLine = item?.plus_text ? `<div class="module-day-total module-day-total--plus">${escapeHtml(item.plus_text)}</div>` : '';
      const minusLine = item?.minus_text ? `<div class="module-day-total module-day-total--minus">${escapeHtml(item.minus_text)}</div>` : '';
      const iconLine = renderCalendarIconLine(item);
      const plainLine = (!item?.plus_text && !item?.minus_text && !item?.icon && !item?.icon_top && !item?.icon_bottom)
        ? `<div class="module-day-total">${escapeHtml(item?.value || '-')}</div>`
        : '';
      cells.push(`<div class="${cls}${canQuickEdit ? ' module-day--clickable' : ''}" title="${meta}" ${canQuickEdit ? `data-log-date="${key}"` : ''}><div class="module-day-number">${day}</div>${plusLine}${minusLine}${iconLine}${plainLine}</div>`);
    }
    grid.innerHTML = cells.join('');
  }


  function renderCalendarIconLine(item) {
    if (!item) return '';
    if (item.icon_top || item.icon_bottom) {
      return `<div class="module-day-icons"><div class="module-day-icon-line module-day-icon-line--top">${escapeHtml(item.icon_top || '')}</div><div class="module-day-icon-line module-day-icon-line--bottom">${escapeHtml(item.icon_bottom || '')}</div></div>`;
    }
    if (item.icon) return `<div class="module-day-total module-day-total--icon">${escapeHtml(item.icon)}</div>`;
    return '';
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
        if (code === 'sale-create') return openSaleBillSheet();
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
      return;
    }
    if (state.moduleType === 'sale_manage') {
      const ok = confirm(`ต้องการแก้ไขบิลประจำวันที่ ${logDate} ใช่หรือไม่`);
      if (!ok) return;
      const response = await AppApi.post({ action: 'getSaleBillsForDate', batch_id: state.batch.id, log_date: logDate });
      if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดรายการบิลไม่สำเร็จ');
      const bills = Array.isArray(response.bills) ? response.bills : [];
      const prebills = Array.isArray(response.prebills) ? response.prebills : [];
      if (!bills.length && !prebills.length) return alert('ไม่พบบิลหรือ PreBill ของวันที่เลือก');
      if (bills.length === 1 && !prebills.length) { await loadAndOpenSaleBillById(bills[0].bill_id); return; }
      if (!bills.length && prebills.length === 1) { await loadAndOpenPreBillById(prebills[0].pre_bill_id || prebills[0].id); return; }
      openSaleBillPicker(logDate, bills, prebills);
    }
  }


  function openSaleBillPicker(logDate, bills = [], prebills = []) {
    const sheet = document.getElementById('saleBillPickerSheet');
    const hint = document.getElementById('saleBillPickerHint');
    const list = document.getElementById('saleBillPickerList');
    if (!sheet || !list) return;
    if (hint) hint.textContent = `พบ ${bills.length} บิลจริง และ ${prebills.length} PreBill รอตรวจ ในวันที่ ${logDate}`;
    const billCards = bills.map((bill) => {
      const icon = saleTypeIcon(bill.sale_type);
      const buyer = bill.buyer || bill.sale_name || 'ไม่ระบุผู้ซื้อ';
      const itemText = (bill.items || []).slice(0, 2).map((item) => {
        const name = item.display_name || item.item_name || item.sale_item || '-';
        const qty = item.sale_qty != null ? item.sale_qty : item.qty;
        const unit = item.sale_unit || item.unit || '';
        return `${name} ${formatNumber(qty)} ${saleUnitLabel(unit)}`;
      }).join(' • ');
      const more = (bill.items || []).length > 2 ? ` +${(bill.items || []).length - 2} รายการ` : '';
      return `
        <button type="button" class="sale-bill-picker-card" data-bill-id="${escapeAttr(bill.bill_id)}">
          <div class="sale-bill-picker-icon">${escapeHtml(icon)}</div>
          <div class="sale-bill-picker-main">
            <div class="sale-bill-picker-head">
              <strong>${escapeHtml(formatThaiDate(bill.log_date))}</strong>
              <span>${escapeHtml(saleTypeLabel(bill.sale_type))}</span>
            </div>
            <div class="sale-bill-picker-buyer">${escapeHtml(buyer)}</div>
            <div class="sale-bill-picker-items">${escapeHtml(itemText || 'ไม่มีรายละเอียดรายการ')}${escapeHtml(more)}</div>
          </div>
          <div class="sale-bill-picker-side">
            <span>${escapeHtml(bill.bill_id || '-')}</span>
            <strong>${escapeHtml(formatMoney(bill.grand_total || 0))} ฿</strong>
          </div>
        </button>`;
    });
    const preBillCards = prebills.map((bill) => `
        <button type="button" class="sale-bill-picker-card sale-bill-picker-card--prebill" data-prebill-id="${escapeAttr(bill.pre_bill_id || bill.id)}">
          <div class="sale-bill-picker-icon">🧾</div>
          <div class="sale-bill-picker-main"><div class="sale-bill-picker-head"><strong>${escapeHtml(formatThaiDate(bill.log_date))}</strong><span>PreBill รอตรวจ</span></div><div class="sale-bill-picker-buyer">${escapeHtml(bill.buyer || bill.sale_name || bill.line_display_name || 'ไม่ระบุผู้ซื้อ')}</div><div class="sale-bill-picker-items">${escapeHtml(bill.raw_message || 'แตะเพื่อตรวจ PreBill')}</div></div>
          <div class="sale-bill-picker-side"><span>${escapeHtml(bill.pre_bill_id || bill.id || '-')}</span><strong>${escapeHtml(formatMoney(bill.grand_total || 0))} ฿</strong></div>
        </button>`);
    list.innerHTML = [...preBillCards, ...billCards].join('');
    showSheet(sheet);
  }

  function closeSaleBillPicker() { hideSheet(document.getElementById('saleBillPickerSheet')); }

  async function onSaleBillPickerClick(event) {
    const preBillCard = event.target.closest('[data-prebill-id]');
    if (preBillCard) { closeSaleBillPicker(); await loadAndOpenPreBillById(preBillCard.dataset.prebillId); return; }
    const card = event.target.closest('[data-bill-id]');
    if (!card) return;
    const billId = card.dataset.billId;
    closeSaleBillPicker();
    await loadAndOpenSaleBillById(billId);
  }

  async function loadAndOpenSaleBillById(billId) {
    if (!billId) return alert('ไม่พบรหัสบิล');
    const response = await AppApi.post({ action: 'getSaleBillRecord', batch_id: state.batch.id, bill_id: billId });
    if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดบิลไม่สำเร็จ');
    await openSaleBillSheetForEdit(response.bill, response.items || []);
  }


  async function loadAndOpenPreBillById(preBillId) {
    if (!preBillId) return alert('ไม่พบรหัส PreBill');
    const response = await AppApi.post({ action: 'getPreBillRecord', batch_id: state.batch.id, pre_bill_id: preBillId });
    if (!response || response.status !== 'ok') return alert(response?.message || 'โหลด PreBill ไม่สำเร็จ');
    await openSaleBillSheetForPreBill(response.bill, response.items || []);
  }

  async function openSaleBillSheetForPreBill(bill, items) {
    state.preBillReviewId = bill.pre_bill_id || bill.id || ''; state.saleEditBillId = '';
    document.getElementById('saleBillDate').value = bill.log_date || todayString();
    document.getElementById('saleBuyerName').value = bill.buyer || bill.sale_name || '';
    document.getElementById('saleBillRemark').value = bill.raw_message ? `PreBill: ${bill.raw_message}` : '';
    if (document.getElementById('saleDiscount')) document.getElementById('saleDiscount').value = Number(bill.discount || 0);
    document.getElementById('saleItemsList').innerHTML = '';
    document.getElementById('saleTypeWrap')?.classList.toggle('hidden', false);
    await loadEffectiveEggPriceSet(false);
    ensureSalePriceItemsFromBill(items || []);
    setSaleType('egg', false);
    document.getElementById('saleItemsList').innerHTML = '';
    (items || []).forEach((item) => appendSaleItemRow({ item_name: item.item_name || item.sale_item || '', unit: item.unit || item.sale_unit || '', qty: item.qty != null ? item.qty : item.sale_qty, unit_price: item.unit_price, total_qty: item.total_qty, display_name: item.display_name || item.sale_item || '' }));
    if (!document.querySelector('#saleItemsList .sale-item-card')) appendSaleItemRow();
    const note = document.getElementById('salePriceSetNote'); if (note) { note.classList.remove('hidden'); note.textContent = `กำลังตรวจ PreBill ${state.preBillReviewId} • แก้ไขได้ก่อนกดยืนยัน`; }
    normalizeSaleLayout(); showSheet(document.getElementById('saleBillSheet'));
  }

  function saleTypeIcon(type) {
    if (type === 'egg') return '🥚';
    if (type === 'fish') return '🐟';
    return '🦆';
  }

  function saleTypeLabel(type) {
    if (type === 'egg') return 'ขายไข่';
    if (type === 'fish') return 'ขายปลา';
    if (type === 'duck') return 'ขายเป็ด';
    return 'บิลขาย';
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


  async function openSaleBillSheet() {
    if (!state.batch) return;
    state.saleEditBillId = '';
    state.preBillReviewId = '';
    document.getElementById('saleBillDate').value = todayString();
    document.getElementById('saleBuyerName').value = '';
    document.getElementById('saleBillRemark').value = '';
    if (document.getElementById('saleDiscount')) document.getElementById('saleDiscount').value = '0';
    document.getElementById('saleItemsList').innerHTML = '';

    const isDuck = String(state.batch.specie || '').toLowerCase() === 'duck';
    const isFish = String(state.batch.specie || '').toLowerCase() === 'fish';
    const typeWrap = document.getElementById('saleTypeWrap');
    typeWrap?.classList.toggle('hidden', !isDuck);

    if (isDuck) {
      setSaleType('egg', false);
      normalizeSaleLayout();
      showSheet(document.getElementById('saleBillSheet'));
      await loadEffectiveEggPriceSet(false);
      if (!document.querySelector('#saleItemsList .sale-item-card')) appendSaleItemRow();
      return;
    } else if (isFish) {
      setSaleType('fish', false);
    } else {
      setSaleType('duck', false);
    }

    normalizeSaleLayout();
    showSheet(document.getElementById('saleBillSheet'));
  }


  async function openSaleBillSheetForEdit(bill, items) {
    if (!bill) return;
    state.saleEditBillId = bill.bill_id || '';
    document.getElementById('saleBillDate').value = bill.log_date || todayString();
    document.getElementById('saleBuyerName').value = bill.buyer || bill.sale_name || '';
    document.getElementById('saleBillRemark').value = bill.remark || '';
    if (document.getElementById('saleDiscount')) document.getElementById('saleDiscount').value = Number(bill.discount || 0);
    document.getElementById('saleItemsList').innerHTML = '';

    const isDuck = String(state.batch?.specie || '').toLowerCase() === 'duck';
    document.getElementById('saleTypeWrap')?.classList.toggle('hidden', !isDuck);
    const billType = bill.sale_type || (state.batch?.specie === 'fish' ? 'fish' : 'duck');
    if (billType === 'egg') {
      await loadEffectiveEggPriceSet(true);
      ensureSalePriceItemsFromBill(items || []);
    }
    setSaleType(billType, false);
    document.getElementById('saleItemsList').innerHTML = '';
    (items || []).forEach((item) => appendSaleItemRow({
      item_name: item.item_name || item.sale_item || '',
      unit: item.unit || item.sale_unit || '',
      qty: item.qty != null ? item.qty : item.sale_qty,
      unit_price: item.unit_price,
      total_qty: item.total_qty,
      display_name: item.display_name || item.sale_item || ''
    }));
    if (!document.querySelector('#saleItemsList .sale-item-card')) appendSaleItemRow();
    normalizeSaleLayout();
    showSheet(document.getElementById('saleBillSheet'));
  }

  function closeSaleBillSheet() { hideSheet(document.getElementById('saleBillSheet')); }
  function closeBillPreview() { hideSheet(document.getElementById('billPreviewSheet')); }
  function backToEditBill() { hideSheet(document.getElementById('billPreviewSheet')); showSheet(document.getElementById('saleBillSheet')); }

  async function loadEffectiveEggPriceSet(force = false) {
    const batchId = state.batch?.id || '';
    const cacheKey = `ducky:price:egg:${batchId}`;
    const maxAgeMs = 12 * 60 * 60 * 1000;
    const note = document.getElementById('salePriceSetNote');
    if (!force && batchId) {
      const cached = AppCache?.read?.(cacheKey, null);
      const fresh = cached?.fetchedAt && (Date.now() - Number(cached.fetchedAt) < maxAgeMs);
      if (cached?.items?.length) {
        state.salePriceLoaded = true; state.salePriceSet = cached.price_set || null; state.salePriceItems = cached.items || [];
        renderSalePriceNote(fresh ? 'cached' : 'stale');
        if (fresh) return;
      }
    }
    if (state.priceLoadPromise && !force) return state.priceLoadPromise;
    if (note) { note.classList.remove('hidden'); note.textContent = state.salePriceItems.length ? 'กำลังตรวจสอบราคาใหม่...' : 'กำลังโหลดชุดราคาไข่...'; }
    state.priceLoadPromise = (async () => {
      const response = await AppApi.post({ action: 'getEffectiveEggPriceSet', batch_id: state.batch.id });
      if (!response || response.status !== 'ok') { if (note && !state.salePriceItems.length) note.textContent = response?.message || 'โหลดชุดราคาไข่ไม่สำเร็จ'; return; }
      state.salePriceLoaded = true; state.salePriceSet = response.price_set || null; state.salePriceItems = Array.isArray(response.items) ? response.items : [];
      AppCache?.write?.(cacheKey, { price_set: state.salePriceSet, items: state.salePriceItems, fetchedAt: Date.now() });
      renderSalePriceNote('fresh');
    })().finally(() => { state.priceLoadPromise = null; });
    return state.priceLoadPromise;
  }

  function warmSalePriceCache() { if (state.batch) loadEffectiveEggPriceSet(false); }
  function renderSalePriceNote(source = '') {
    const note = document.getElementById('salePriceSetNote'); if (!note) return; note.classList.remove('hidden');
    if (state.salePriceSet && state.salePriceItems.length) {
      const suffix = source === 'cached' ? ' • จาก cache' : (source === 'stale' ? ' • แสดงจาก cache ระหว่างอัปเดต' : '');
      note.textContent = `ใช้ชุดราคาไข่: ${state.salePriceSet.name || '-'} • ${state.salePriceItems.length} รายการราคา${suffix}`;
    } else note.textContent = 'ยังไม่พบชุดราคาไข่ที่ผูกกับ batch/user นี้ กรุณาให้ admin ผูกชุดราคาก่อนขายไข่';
  }


  function ensureSalePriceItemsFromBill(items) {
    if (!Array.isArray(state.salePriceItems)) state.salePriceItems = [];
    const existing = new Set(state.salePriceItems.map((item) => String(item.item_name || '')));
    (items || []).forEach((item) => {
      const name = String(item.item_name || item.sale_item || '').trim();
      if (!name || existing.has(name)) return;
      existing.add(name);
      state.salePriceItems.push({
        item_name: name,
        display_name: item.display_name || name,
        current_price: Number(item.unit_price || 0),
        from_bill: true
      });
    });
  }

  function setSaleType(type, resetItems = true) {
    state.saleType = type;
    document.getElementById('saleTypeEggBtn')?.classList.toggle('is-active', type === 'egg');
    document.getElementById('saleTypeDuckBtn')?.classList.toggle('is-active', type === 'duck');
    const stockNote = document.getElementById('saleBillStockNote');
    const priceNote = document.getElementById('salePriceSetNote');
    if (type === 'egg') {
      // ขายไข่เป็นการเก็บ log และออกบิลเท่านั้น ไม่ผูกกับจำนวนไข่ที่เก็บได้ 
      if (stockNote) stockNote.textContent = `• ฟาร์มบนบิล: ${state.data?.farm_name || state.batch?.owner_name || '-'}`;
      priceNote?.classList.remove('hidden');
    } else if (type === 'fish') {
      // ขายปลาเป็นการเก็บ log และออกบิลเท่านั้น ไม่หักจำนวนสัตว์ใน batch เพราะขายเหมาเป็นน้ำหนักกิโล 
      if (stockNote) stockNote.textContent = `• ฟาร์มบนบิล: ${state.data?.farm_name || '-'}`;
      priceNote?.classList.add('hidden');
    } else {
      if (stockNote) stockNote.textContent = `คงเหลือปัจจุบัน ${formatCompactNumber(state.batch.current_qty || 0)} ตัว • ขายเป็ดจะหักจำนวนคงเหลือใน batch`;
      priceNote?.classList.add('hidden');
    }
    if (resetItems) {
      document.getElementById('saleItemsList').innerHTML = '';
      appendSaleItemRow();
    } else if (!document.querySelector('#saleItemsList .sale-item-card')) {
      appendSaleItemRow();
    }
  }

  function appendSaleItemRow(seed = {}) {
    const type = state.saleType || (state.batch?.specie === 'fish' ? 'fish' : 'duck');
    if (type === 'egg' && !state.salePriceItems.length) {
      alert('ยังไม่มีรายการราคาไข่สำหรับชุดนี้ กรุณาให้ admin ผูกชุดราคาก่อน');
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = `sale-item-card sale-item-card--${escapeAttr(type)}`;
    if (type === 'egg') renderEggSaleRow(wrap, seed);
    else renderManualSaleRow(wrap, seed, type);
    const list = document.getElementById('saleItemsList');
    list.appendChild(wrap);
    requestAnimationFrame(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    syncSaleItemRow(wrap);
  }

  function renderEggSaleRow(wrap, seed = {}) {
    const selectedName = seed.item_name || (state.salePriceItems[0]?.item_name || '');
    const selectedPrice = seed.unit_price != null ? Number(seed.unit_price || 0) : Number((getPriceItemByName(selectedName) || state.salePriceItems[0] || {}).current_price || 0);
    const options = state.salePriceItems.map((item) => {
      const label = item.display_name || item.item_name;
      return `<option value="${escapeAttr(item.item_name)}" ${String(selectedName || '') === String(item.item_name) ? 'selected' : ''}>${escapeHtml(label)} • ${formatMoney(item.current_price)} บาท/ฟอง</option>`;
    }).join('');
    wrap.innerHTML = `
      <div class="sale-item-head">
        <span class="feed-entry-badge">รายการขายไข่</span>
        <button class="remove-line-btn" type="button">ลบรายการ</button>
      </div>
      <div class="sale-egg-grid sale-egg-grid--top">
        <div class="sale-grid-field sale-grid-field--item">
          <label class="field-label">น้ำหนัก/ชนิดไข่</label>
          <select class="sale-item-name" required>${options}</select>
        </div>
        <div class="sale-grid-field sale-grid-field--unit">
          <label class="field-label">รูปแบบ</label>
          <select class="sale-item-unit" required>
            <option value="full_set" ${seed.unit === 'full_set' ? 'selected' : ''}>เต็มตั้ง</option>
            <option value="tray" ${seed.unit === 'tray' ? 'selected' : ''}>เศษแผง</option>
            <option value="piece" ${seed.unit === 'piece' ? 'selected' : ''}>เศษฟอง</option>
          </select>
        </div>
      </div>
      <div class="sale-egg-grid sale-egg-grid--bottom">
        <div class="sale-grid-field">
          <label class="field-label">จำนวน</label>
          <input class="sale-item-qty" type="number" min="1" step="1" value="${Number(seed.qty || 1)}" required>
        </div>
        <div class="sale-grid-field">
          <label class="field-label">ราคาต่อฟอง</label>
          <input class="sale-item-price" type="number" min="0" step="0.01" value="${selectedPrice || ''}" required>
        </div>
        <div class="sale-grid-field">
          <label class="field-label">จำนวนรวม</label>
          <div class="line-total-badge sale-total-qty-badge">0</div>
        </div>
        <div class="sale-grid-field">
          <label class="field-label">เป็นเงิน</label>
          <div class="line-total-badge sale-line-total-badge">0.00 ฿</div>
        </div>
      </div>
    `;
    bindSaleRowEvents(wrap);
  }

  function renderManualSaleRow(wrap, seed = {}, type = 'duck') {
    const isFish = type === 'fish';
    wrap.innerHTML = `
      <div class="sale-item-head">
        <span class="feed-entry-badge">${isFish ? 'รายการขายปลา' : 'รายการขายเป็ด'}</span>
        <button class="remove-line-btn" type="button">ลบรายการ</button>
      </div>
      <div class="sale-manual-grid sale-manual-grid--top">
        <div class="sale-grid-field sale-grid-field--wide">
          <label class="field-label">รายการ</label>
          <input class="sale-item-name" type="text" placeholder="${isFish ? 'เช่น ปลานิล ไซส์ใหญ่' : 'เช่น ขายเป็ด'}" value="${escapeAttr(seed.item_name || (isFish ? 'ขายปลา' : 'ขายเป็ด'))}" required>
        </div>
        <div class="sale-grid-field">
          <label class="field-label">หน่วย</label>
          <input class="sale-item-unit" type="text" value="${escapeAttr(seed.unit || (isFish ? 'กก.' : 'ตัว'))}" required>
        </div>
      </div>
      <div class="sale-manual-grid sale-manual-grid--bottom">
        <div class="sale-grid-field">
          <label class="field-label">จำนวน</label>
          <input class="sale-item-qty" type="number" min="0.01" step="0.01" value="${Number(seed.qty || 1)}" required>
        </div>
        <div class="sale-grid-field">
          <label class="field-label">ราคาต่อหน่วย</label>
          <input class="sale-item-price" type="number" min="0" step="0.01" value="${Number(seed.unit_price || 0) || ''}" required>
        </div>
        <div class="sale-grid-field">
          <label class="field-label">เป็นเงิน</label>
          <div class="line-total-badge sale-line-total-badge">0.00 ฿</div>
        </div>
      </div>
    `;
    bindSaleRowEvents(wrap);
  }

  function bindSaleRowEvents(wrap) {
    wrap.querySelectorAll('input, select').forEach((input) => {
      input.addEventListener('input', () => syncSaleItemRow(wrap));
      input.addEventListener('change', () => {
        if (state.saleType === 'egg' && input.classList.contains('sale-item-name')) applyEggDefaultPrice(wrap);
        syncSaleItemRow(wrap);
      });
    });
    wrap.querySelector('.remove-line-btn')?.addEventListener('click', () => {
      if (document.querySelectorAll('#saleItemsList .sale-item-card').length <= 1) return alert('ต้องมีอย่างน้อย 1 รายการ');
      wrap.remove();
    });
  }

  function applyEggDefaultPrice(row) {
    const itemName = row.querySelector('.sale-item-name')?.value || '';
    const priceItem = getPriceItemByName(itemName);
    const priceInput = row.querySelector('.sale-item-price');
    if (priceItem && priceInput) priceInput.value = Number(priceItem.current_price || 0);
  }

  function syncSaleItemRow(row) {
    const type = state.saleType;
    const qty = Number(row.querySelector('.sale-item-qty')?.value || 0);
    let unitPrice = Number(row.querySelector('.sale-item-price')?.value || 0);
    let totalQty = qty;
    if (type === 'egg') {
      const itemName = row.querySelector('.sale-item-name')?.value || '';
      const unit = row.querySelector('.sale-item-unit')?.value || 'piece';
      totalQty = qty * saleUnitMultiplier(unit);
      const qtyBadge = row.querySelector('.sale-total-qty-badge');
      if (qtyBadge) qtyBadge.textContent = `${formatCompactNumber(totalQty)} ฟอง`;
    }
    const lineTotal = round2(totalQty * unitPrice);
    const totalBadge = row.querySelector('.sale-line-total-badge') || row.querySelector('.line-total-badge');
    if (totalBadge) totalBadge.textContent = `${formatMoney(lineTotal)} ฿`;
  }

  function getPriceItemByName(itemName) {
    return state.salePriceItems.find((item) => String(item.item_name || '') === String(itemName || '')) || null;
  }
  function saleUnitMultiplier(unit) { return unit === 'full_set' ? 300 : (unit === 'tray' ? 30 : 1); }
  function saleUnitLabel(unit) { return unit === 'full_set' ? 'ตั้ง' : (unit === 'tray' ? 'แผง' : (unit === 'piece' ? 'ฟอง' : (unit || ''))); }

  async function onPreviewBillSubmit(event) {
    event.preventDefault();
    const draft = collectBillDraft();
    if (!draft) return;
    state.billDraft = draft;
    const dataUrl = await renderBillImage(draft);
    state.billPreviewImage = dataUrl;
    document.getElementById('billPreviewImage').src = dataUrl;
    document.getElementById('billPreviewImage').classList.remove('hidden');
    document.getElementById('billPreviewMeta').textContent = `ก่อนหักส่วนลด ${formatMoney(draft.sub_total)} บาท • ส่วนลด ${formatMoney(draft.discount || 0)} บาท • สุทธิ ${formatMoney(draft.grand_total)} บาท`;
    hideSheet(document.getElementById('saleBillSheet'));
    showSheet(document.getElementById('billPreviewSheet'));
  }

  function collectBillDraft() {
    const logDate = document.getElementById('saleBillDate').value;
    if (!logDate) { alert('กรุณาเลือกวันที่ขาย'); return null; }
    const buyerName = document.getElementById('saleBuyerName').value.trim();
    const remark = document.getElementById('saleBillRemark').value.trim();
    const billDiscount = Math.max(0, Number(document.getElementById('saleDiscount')?.value || 0));
    const rows = [...document.querySelectorAll('#saleItemsList .sale-item-card')];
    if (!rows.length) { alert('กรุณาเพิ่มรายการขาย'); return null; }
    const items = [];
    let totalQty = 0;
    let subTotal = 0;
    for (const row of rows) {
      const rawItemName = row.querySelector('.sale-item-name')?.value?.trim() || '';
      const unit = row.querySelector('.sale-item-unit')?.value?.trim() || 'ตัว';
      const qty = Number(row.querySelector('.sale-item-qty')?.value || 0);
      let unitPrice = Number(row.querySelector('.sale-item-price')?.value || 0);
      if (!rawItemName || qty <= 0) { alert('กรุณากรอกข้อมูลรายการขายให้ครบ'); return null; }
      let itemName = rawItemName;
      let displayName = rawItemName;
      let totalQtyLine = qty;
      if (state.saleType === 'egg') {
        const priceItem = getPriceItemByName(rawItemName);
        if (!priceItem) { alert('ไม่พบราคาของรายการไข่ที่เลือก'); return null; }
        itemName = priceItem.item_name;
        displayName = priceItem.display_name || priceItem.item_name;
        totalQtyLine = qty * saleUnitMultiplier(unit);
      }
      const lineTotal = round2(totalQtyLine * unitPrice);
      totalQty += totalQtyLine;
      subTotal += lineTotal;
      items.push({ item_name: itemName, display_name: displayName, unit, unit_label: saleUnitLabel(unit), qty, total_qty: round2(totalQtyLine), unit_price: unitPrice, discount: 0, line_total: lineTotal });
    }
    if (state.saleType === 'duck' && totalQty > Number(state.batch.current_qty || 0)) { alert('จำนวนขายเป็ดรวมมากกว่าคงเหลือปัจจุบัน'); return null; }
    const grandTotal = Math.max(0, round2(subTotal - billDiscount));
    return { batch_id: state.batch.id, bill_id: state.saleEditBillId || '', mode: state.saleEditBillId ? 'replace_bill' : 'create', sale_type: state.saleType, bill_title: 'บิลเงินสด', farm_name: state.data?.farm_name || state.batch?.owner_name || 'FARM', logo_url: state.logoUrl, batch_name: state.batch.name, log_date: logDate, issue_date: nowDateTimeDisplay(), sale_name: buyerName, remark, items, total_qty: round2(totalQty), sub_total: round2(subTotal), discount: round2(billDiscount), grand_total: grandTotal };
  }

  async function renderBillImage(draft) {
    const width = 430, padding = 22, lineGap = 18, itemBlockHeight = 62, headerHeight = 188;
    const footerHeight = (draft.remark ? 78 : 48) + 50;
    const discountRows = Number(draft.discount || 0) > 0 ? 2 : 1;
    const height = headerHeight + footerHeight + (draft.items.length * itemBlockHeight) + 120 + (discountRows * 20);
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#111827'; ctx.textBaseline = 'top';
    let y = padding;
    try { const logo = await loadImage(draft.logo_url); const logoSize = 54; ctx.drawImage(logo, (width - logoSize) / 2, y, logoSize, logoSize); y += logoSize + 8; } catch (_) {}
    drawCenteredFitText(ctx, draft.farm_name || 'FARM', width / 2, y, width - (padding * 2), 'bold', 20, 13); y += 28;
    drawCenteredFitText(ctx, draft.bill_title || 'บิลเงินสด', width / 2, y, width - (padding * 2), 'bold', 17, 13); y += 28;
    ctx.textAlign = 'left'; ctx.font = '13px system-ui';
    ctx.fillText('วันที่ขาย: ' + formatThaiDate(draft.log_date), padding, y, width - (padding * 2)); y += lineGap;
    ctx.fillText('เวลาออกบิล: ' + draft.issue_date, padding, y, width - (padding * 2)); y += lineGap;
    ctx.fillText('ชุดสัตว์: ' + draft.batch_name, padding, y, width - (padding * 2)); y += 22;
    ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke(); y += 12;
    draft.items.forEach((item) => {
      ctx.textAlign = 'left'; ctx.font = 'bold 14px system-ui'; ctx.fillText(item.display_name || item.item_name, padding, y, width - (padding * 2)); y += 18;
      ctx.font = '13px system-ui';
      const unitText = draft.sale_type === 'egg' ? `${formatNumber(item.qty)} ${item.unit_label} (${formatNumber(item.total_qty)} ฟอง) x ${formatMoney(item.unit_price)}` : `${formatNumber(item.qty)} ${item.unit} x ${formatMoney(item.unit_price)}`;
      ctx.fillText(unitText, padding, y, width - (padding * 2) - 104); ctx.textAlign = 'right'; ctx.fillText(formatMoney(item.line_total), width - padding, y, 100); y += itemBlockHeight - 18;
    });
    ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke(); y += 12;
    ctx.font = '14px system-ui'; ctx.textAlign = 'left'; ctx.fillText('รวมก่อนหักส่วนลด', padding, y); ctx.textAlign = 'right'; ctx.fillText(formatMoney(draft.sub_total), width - padding, y); y += lineGap;
    if (Number(draft.discount || 0) > 0) { ctx.textAlign = 'left'; ctx.fillText('ส่วนลด', padding, y); ctx.textAlign = 'right'; ctx.fillText('-' + formatMoney(draft.discount), width - padding, y); y += lineGap; }
    ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'left'; ctx.fillText('สุทธิ', padding, y); ctx.textAlign = 'right'; ctx.fillText(formatMoney(draft.grand_total), width - padding, y); y += lineGap + 14;
    if (draft.remark) { ctx.textAlign = 'left'; ctx.font = '13px system-ui'; wrapText(ctx, 'หมายเหตุ: ' + draft.remark, padding, y, width - (padding * 2), 18); }
    return canvas.toDataURL('image/png');
  }

  async function confirmBill() {
    if (!state.billDraft) return;
    const button = document.getElementById('billConfirmBtn');
    const original = button.textContent;
    button.disabled = true; button.textContent = 'กำลังบันทึก...';
    const action = state.preBillReviewId ? 'approvePreBill' : 'saveBatchSaleBill';
    const response = await AppApi.post({ action, pre_bill_id: state.preBillReviewId || '', batch_id: state.billDraft.batch_id, bill_id: state.billDraft.bill_id || '', mode: state.billDraft.mode || 'create', log_date: state.billDraft.log_date, sale_name: state.billDraft.sale_name, remark: state.billDraft.remark, sale_type: state.billDraft.sale_type, discount: state.billDraft.discount || 0, items: state.billDraft.items });
    button.disabled = false; button.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกบิลไม่สำเร็จ');
    closeBillPreview(); closeSaleBillSheet();
    clearModuleCaches(state.batch.id, ['sale_manage']);
    state.month = String(state.billDraft.log_date || state.month).slice(0, 7);
    await load(state.batch.id);
    alert(`${state.preBillReviewId ? 'อนุมัติ PreBill และสร้างบิลสำเร็จ' : 'บันทึกบิลสำเร็จ'} เลขที่ ${response.bill?.bill_id || '-'}`);
    state.preBillReviewId = '';
  }

  function downloadBillImage() { if (!state.billPreviewImage) return; const link = document.createElement('a'); link.href = state.billPreviewImage; link.download = `cash-bill-${state.batch.id}-${Date.now()}.png`; link.click(); }
  function ensureSaleDiscountField() {
    const form = document.getElementById('saleBillForm');
    if (!form || document.getElementById('saleDiscount')) return;
    const stockNote = document.getElementById('saleBillStockNote');
    const discountWrap = document.createElement('div');
    discountWrap.className = 'sale-discount-wrap';
    discountWrap.innerHTML = `<label class="field-label" for="saleDiscount">ส่วนลดรวม</label><input id="saleDiscount" type="number" min="0" step="0.01" placeholder="ส่วนลดรวม (บาท)" value="0" />`;
    if (stockNote && stockNote.parentNode === form) form.insertBefore(discountWrap, stockNote); else form.appendChild(discountWrap);
  }
  function normalizeSaleLayout() {
    const addBtn = document.getElementById('addSaleItemBtn'); const footer = document.querySelector('#saleBillSheet .sheet-footer');
    if (!addBtn || !footer) return;
    let row = footer.querySelector('.sale-bill-footer-row');
    if (!row) { row = document.createElement('div'); row.className = 'sale-bill-footer-row'; footer.prepend(row); }
    const submitBtn = footer.querySelector('#salePreviewBtn'); addBtn.type = 'button';
    if (!row.contains(addBtn)) row.appendChild(addBtn);
    if (submitBtn && !row.contains(submitBtn)) row.appendChild(submitBtn);
  }


  function initSaleRangeSummaryDefaults() {
    if (state.moduleType !== 'sale_manage' || !state.batch) return;
    const start = document.getElementById('saleRangeStartDate');
    const end = document.getElementById('saleRangeEndDate');
    if (start && !start.value) start.value = state.month + '-01';
    if (end && !end.value) {
      const [y, m] = state.month.split('-').map(Number);
      end.value = state.month + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0');
    }
  }

  async function searchSaleRangeSummary() {
    if (!state.batch) return;
    const startDate = document.getElementById('saleRangeStartDate')?.value || '';
    const endDate = document.getElementById('saleRangeEndDate')?.value || '';
    const buyerSearch = document.getElementById('saleRangeBuyerSearch')?.value?.trim() || '';
    if (!startDate || !endDate) return alert('กรุณาเลือกวันที่เริ่มและวันที่สิ้นสุด');
    if (startDate > endDate) return alert('วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
    const btn = document.getElementById('saleRangeSearchBtn');
    const original = btn?.textContent || 'ค้นหา';
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังค้นหา...'; }
    const response = await AppApi.post({ action: 'getSaleBillRangeSummary', batch_id: state.batch.id, start_date: startDate, end_date: endDate, buyer_search: buyerSearch });
    if (btn) { btn.disabled = false; btn.textContent = original; }
    if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดสรุปบิลไม่สำเร็จ');
    state.saleRangeRows = (Array.isArray(response.rows) ? response.rows : []).map((row) => ({ ...row, selected: true }));
    state.saleRangeTotals = calculateSelectedSaleRangeTotals();
    renderSaleRangeSummary({ rows: state.saleRangeRows, totals: state.saleRangeTotals });
  }

  function onSaleRangeListClick(event) {
    const card = event.target.closest('[data-sale-range-bill-id]');
    if (!card) return;
    const billId = card.dataset.saleRangeBillId;
    state.saleRangeRows = (state.saleRangeRows || []).map((row) => String(row.bill_id) === String(billId) ? { ...row, selected: !row.selected } : row);
    state.saleRangeTotals = calculateSelectedSaleRangeTotals();
    renderSaleRangeSummary({ rows: state.saleRangeRows, totals: state.saleRangeTotals });
  }

  function calculateSelectedSaleRangeTotals() {
    const selected = (state.saleRangeRows || []).filter((row) => row.selected !== false);
    const totals = selected.reduce((acc, row) => {
      acc.bill_count += 1;
      acc.gross_total += Number(row.gross_total || 0);
      acc.discount_total += Number(row.discount_total || 0);
      acc.grand_total += Number(row.grand_total || 0);
      return acc;
    }, { bill_count: 0, gross_total: 0, discount_total: 0, grand_total: 0 });
    totals.gross_total = round2(totals.gross_total);
    totals.discount_total = round2(totals.discount_total);
    totals.grand_total = round2(totals.grand_total);
    return totals;
  }

  function renderSaleRangeSummary(response) {
    const list = document.getElementById('saleRangeSummaryList');
    const badge = document.getElementById('saleRangeSummaryBadge');
    const footer = document.getElementById('saleRangeSummaryFooter');
    const grand = document.getElementById('saleRangeGrandTotal');
    if (!list) return;
    const rows = Array.isArray(response.rows) ? response.rows : [];
    const selectedRows = rows.filter((row) => row.selected !== false);
    const totals = response.totals || calculateSelectedSaleRangeTotals();
    if (badge) badge.textContent = rows.length ? (`เลือก ${selectedRows.length}/${rows.length} บิล`) : 'ไม่พบข้อมูล';
    if (grand) grand.textContent = formatMoney(totals.grand_total || 0) + ' ฿';
    footer?.classList.toggle('hidden', !rows.length);
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">ไม่พบข้อมูลบิลในช่วงวันที่เลือก</div>';
      return;
    }
    list.innerHTML = rows.map((row) => {
      const selected = row.selected !== false;
      const icon = row.sale_type === 'egg' ? '🥚' : (row.sale_type === 'fish' ? '🐟' : (row.sale_type === 'duck' ? '🦆' : '🧾'));
      const buyer = row.buyer || row.sale_name || 'ไม่ระบุผู้ซื้อ';
      const itemText = (row.items || []).slice(0, 3).map((item) => `${item.sale_item || item.item_name || '-'} ${formatCompactNumber(item.sale_qty || item.qty || 0)} ${saleUnitLabel(item.sale_unit || item.unit || '')}`).join(' • ');
      const moreText = (row.items || []).length > 3 ? ` • +${(row.items || []).length - 3} รายการ` : '';
      return `
        <button type="button" class="sale-range-bill-card${selected ? ' is-selected' : ' is-deselected'}" data-sale-range-bill-id="${escapeAttr(row.bill_id)}">
          <div class="sale-range-bill-icon">${icon}</div>
          <div class="sale-range-bill-main">
            <div class="sale-range-bill-head">
              <strong class="sale-range-bill-date">${escapeHtml(formatThaiDate(row.log_date))}</strong>
              <span class="sale-range-bill-buyer">${escapeHtml(buyer)}</span>
            </div>
            <div class="sale-range-bill-body">
              <div class="sale-range-bill-detail">ยอดเต็ม ${escapeHtml(formatMoney(row.gross_total || 0))} ฿ • ส่วนลด ${escapeHtml(formatMoney(row.discount_total || 0))} ฿</div>
              <div class="sale-range-bill-items">${escapeHtml(itemText || 'ไม่มีรายละเอียดรายการ')}${escapeHtml(moreText)}</div>
            </div>
          </div>
          <div class="sale-range-bill-side">
            <span class="sale-range-bill-id">${escapeHtml(row.bill_id || '-')}</span>
            <strong class="sale-range-bill-total">${escapeHtml(formatMoney(row.grand_total || 0))} ฿</strong>
          </div>
        </button>`;
    }).join('');
  }

  async function previewSaleRangeSummaryImage() {
    const selected = (state.saleRangeRows || []).filter((row) => row.selected !== false);
    if (!selected.length) return alert('กรุณาเลือกอย่างน้อย 1 บิล');
    const startDate = document.getElementById('saleRangeStartDate')?.value || '';
    const endDate = document.getElementById('saleRangeEndDate')?.value || '';
    const totals = calculateSelectedSaleRangeTotals();
    const img = await renderSaleRangeSummaryImage({ startDate, endDate, rows: selected, totals });
    state.saleRangeImage = img;
    const image = document.getElementById('saleRangePreviewImage');
    if (image) { image.src = img; image.classList.remove('hidden'); }
    const meta = document.getElementById('saleRangePreviewMeta');
    if (meta) meta.textContent = `เลือก ${selected.length} บิล • สุทธิ ${formatMoney(totals.grand_total)} บาท`;
    showSheet(document.getElementById('saleRangePreviewSheet'));
  }

  function closeSaleRangePreview() { hideSheet(document.getElementById('saleRangePreviewSheet')); }

  function downloadSaleRangeSummaryImage() {
    if (!state.saleRangeImage) return alert('กรุณา Preview สรุปยอดก่อน');
    const startDate = document.getElementById('saleRangeStartDate')?.value || '';
    const endDate = document.getElementById('saleRangeEndDate')?.value || '';
    const link = document.createElement('a');
    link.href = state.saleRangeImage;
    link.download = `bill-summary-${state.batch?.id || 'batch'}-${startDate}-${endDate}.png`;
    link.click();
  }

  async function renderSaleRangeSummaryImage(payload) {
    const rows = payload.rows || [];
    const totals = payload.totals || {};
    const width = 430, padding = 22, lineGap = 20;
    const height = 194 + rows.length * 58 + 102;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#111827'; ctx.textBaseline = 'top';
    let y = padding;
    try { const logo = await loadImage(state.logoUrl); const logoSize = 48; ctx.drawImage(logo, (width - logoSize) / 2, y, logoSize, logoSize); y += logoSize + 8; } catch (_) {}
    ctx.font = 'bold 20px system-ui'; ctx.textAlign = 'center'; ctx.fillText(state.data?.farm_name || state.batch?.owner_name || 'FARM', width / 2, y); y += 28;
    ctx.font = 'bold 16px system-ui'; ctx.fillText('สรุปยอดบิล', width / 2, y); y += 24;
    ctx.font = '13px system-ui'; ctx.fillText(formatThaiDate(payload.startDate) + ' ถึง ' + formatThaiDate(payload.endDate), width / 2, y); y += 26;
    ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke(); y += 12;
    rows.forEach((row) => {
      const icon = row.sale_type === 'egg' ? 'ไข่' : (row.sale_type === 'fish' ? 'ปลา' : (row.sale_type === 'duck' ? 'เป็ด' : 'บิล'));
      ctx.textAlign = 'left'; ctx.font = 'bold 13px system-ui'; ctx.fillStyle = '#111827'; ctx.fillText(formatThaiDate(row.log_date) + ' • ' + icon, padding, y);
      ctx.textAlign = 'right'; ctx.fillText(formatMoney(row.grand_total || 0), width - padding, y); y += 18;
      ctx.textAlign = 'left'; ctx.font = '12px system-ui'; ctx.fillStyle = '#6b7280';
      const buyer = row.buyer || row.sale_name || 'ไม่ระบุผู้ซื้อ';
      ctx.fillText(buyer, padding, y); y += 16;
      ctx.fillText('ยอดเต็ม ' + formatMoney(row.gross_total || 0) + ' • ส่วนลด ' + formatMoney(row.discount_total || 0), padding, y);
      y += 24;
    });
    ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke(); y += 14;
    ctx.fillStyle = '#111827'; ctx.font = '14px system-ui'; ctx.textAlign = 'left'; ctx.fillText('ยอดเต็มรวม', padding, y); ctx.textAlign = 'right'; ctx.fillText(formatMoney(totals.gross_total || 0), width - padding, y); y += lineGap;
    ctx.textAlign = 'left'; ctx.fillText('ส่วนลดรวม', padding, y); ctx.textAlign = 'right'; ctx.fillText('-' + formatMoney(totals.discount_total || 0), width - padding, y); y += lineGap;
    ctx.font = 'bold 17px system-ui'; ctx.textAlign = 'left'; ctx.fillText('ยอดสุทธิรวม', padding, y); ctx.textAlign = 'right'; ctx.fillText(formatMoney(totals.grand_total || 0), width - padding, y);
    return canvas.toDataURL('image/png');
  }

  function round2(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
  function formatMoney(value) { return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function formatNumber(value) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  function nowDateTimeDisplay() { const now = new Date(); return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; }
  function formatThaiDate(dateStr) { if (!dateStr) return '-'; const [year, month, day] = String(dateStr).split('-').map(Number); const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']; return `${day} ${months[(month || 1) - 1]} ${year + 543}`; }

  function drawCenteredFitText(ctx, text, centerX, y, maxWidth, weight, baseSize, minSize) {
    text = String(text || '');
    weight = weight || 'bold';
    baseSize = Number(baseSize || 18);
    minSize = Number(minSize || 12);
    var size = baseSize;
    do {
      ctx.font = weight + ' ' + size + 'px system-ui';
      if (ctx.measureText(text).width <= maxWidth || size <= minSize) break;
      size -= 1;
    } while (size >= minSize);
    ctx.textAlign = 'center';
    ctx.fillText(text, centerX, y, maxWidth);
    return size;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) { const words = String(text || '').split(' '); let line = ''; for (let n = 0; n < words.length; n += 1) { const testLine = line + words[n] + ' '; const metrics = ctx.measureText(testLine); if (metrics.width > maxWidth && n > 0) { ctx.fillText(line, x, y); line = words[n] + ' '; y += lineHeight; } else { line = testLine; } } ctx.fillText(line, x, y); }
  function loadImage(src) { return new Promise((resolve, reject) => { if (!src) return reject(new Error('missing image')); const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); }

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
    document.getElementById('recentLogList') && (document.getElementById('recentLogList').innerHTML = '<div class="empty-state">ไม่มีข้อมูลสำหรับโมดูลนี้</div>');
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
