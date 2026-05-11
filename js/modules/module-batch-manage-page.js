
window.BatchManagePage = (() => {
  const state = {
    batch: null,
    batchPermission: 'read',
    modulePermission: 'none',
    isOwner: false,
    isAdmin: false,
    month: monthKey(new Date()),
    imageBase64: null,
    billDraft: null,
    billPreviewImage: '',
    farmName: '',
    logoUrl: 'assets/farm-logo.png'
  };
  const CACHE_TTL_MS = 60 * 1000;

  const movementModeConfig = {
    add: {
      title: 'เพิ่มจำนวนสัตว์',
      submitLabel: 'บันทึกการเพิ่ม',
      unitPriceLabel: 'ราคาต่อหน่วย (ถ้ามี)',
      unitPriceVisible: true,
      helper: 'เพิ่มจำนวนเข้า batch'
    },
    dead: {
      title: 'บันทึกตาย/สูญเสีย',
      submitLabel: 'บันทึกการตาย',
      unitPriceVisible: false,
      helper: 'ระบบจะหักจำนวนคงเหลือตามที่ระบุ'
    }
  };

  async function bootstrap() {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    bindBaseEvents();
    const batchId = new URLSearchParams(location.search).get('bid');
    if (!batchId) {
      document.getElementById('moduleSubtitle').textContent = 'ไม่พบ batch id';
      return;
    }
    const cached = readCache(cacheKey(batchId));
    if (cached) renderAll(cached);
    await load(batchId);
    const requestedAction = new URLSearchParams(location.search).get('action');
    if (requestedAction === 'sell' && state.modulePermission === 'write') {
      openSaleBillSheet();
    }
  }

  function bindBaseEvents() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);
    document.getElementById('calendarPrevBtn')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('calendarNextBtn')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('moduleCalendarGrid')?.addEventListener('click', onCalendarCellClick);

    document.getElementById('movementSheetCloseBtn')?.addEventListener('click', closeMovementSheet);
    document.getElementById('movementSheetBackdrop')?.addEventListener('click', closeMovementSheet);
    document.getElementById('movementForm')?.addEventListener('submit', submitMovement);

    document.getElementById('movementDayCloseBtn')?.addEventListener('click', closeMovementDaySheet);
    document.getElementById('movementDayBackdrop')?.addEventListener('click', closeMovementDaySheet);
    document.getElementById('movementDayCancelBtn')?.addEventListener('click', closeMovementDaySheet);
    document.getElementById('movementDayForm')?.addEventListener('submit', submitMovementDay);
    document.getElementById('addMovementDayEntryBtn')?.addEventListener('click', () => appendMovementDayEntryRow());
    document.getElementById('movementDayEntryList')?.addEventListener('click', onMovementDayListClick);

    document.getElementById('editSheetCloseBtn')?.addEventListener('click', closeEditSheet);
    document.getElementById('editSheetBackdrop')?.addEventListener('click', closeEditSheet);
    document.getElementById('editBatchForm')?.addEventListener('submit', submitEditBatch);
    document.getElementById('batchImageInput')?.addEventListener('change', onEditImageSelected);

    document.getElementById('saleBillCloseBtn')?.addEventListener('click', closeSaleBillSheet);
    document.getElementById('saleBillBackdrop')?.addEventListener('click', closeSaleBillSheet);
    document.getElementById('saleBillForm')?.addEventListener('submit', onPreviewBillSubmit);
    document.getElementById('addSaleItemBtn')?.addEventListener('click', () => appendSaleItemRow());
    ensureSaleDiscountField();
    normalizeSaleLayout();

    document.getElementById('billPreviewCloseBtn')?.addEventListener('click', closeBillPreview);
    document.getElementById('billPreviewBackdrop')?.addEventListener('click', closeBillPreview);
    document.getElementById('billBackToEditBtn')?.addEventListener('click', backToEditBill);
    document.getElementById('billDownloadBtn')?.addEventListener('click', downloadBillImage);
    document.getElementById('billConfirmBtn')?.addEventListener('click', confirmBill);
  }

  async function load(batchId) {
    const response = await AppApi.post({ action: 'getBatchManagePageData', batch_id: batchId, month: state.month });
    if (!response || response.status !== 'ok') {
      document.getElementById('moduleSubtitle').textContent = response?.message || 'โหลดข้อมูลไม่สำเร็จ';
      return;
    }
    writeCache(cacheKey(batchId), response);
    renderAll(response);
  }

  function renderAll(response) {
    state.batch = response.batch;
    state.batchPermission = response.batch_permission || response.permission || 'read';
    state.modulePermission = response.permission || 'none';
    state.isOwner = !!response.is_owner;
    state.isAdmin = !!response.is_admin;
    state.farmName = response.farm_name || response.batch.owner_name || response.batch.name || 'FARM';
    renderHeader(response);
    renderSummary(response.summary_cards || []);
    renderCalendar(response.calendar_map || {});
    renderFab();
    if (window.NavDrawer) {
      NavDrawer.setBatchContext({
        id: state.batch.id,
        specie: state.batch.specie,
        permission: state.batchPermission,
        isOwner: state.isOwner,
        isAdmin: state.isAdmin,
        module_permissions: response.module_permissions || {}
      });
    }
  }

  function renderHeader(response) {
    document.getElementById('moduleTitle').textContent = 'จัดการชุดสัตว์';
    document.getElementById('moduleSubtitle').textContent = `${state.batch.name} • ${state.batch.specie === 'fish' ? 'จัดการปลา' : 'จัดการเป็ด'}`;
    const badge = document.getElementById('modulePermissionBadge');
    badge.className = `badge-inline ${badgeClass(state.modulePermission)}`;
    badge.textContent = permissionLabel(state.modulePermission);
    document.getElementById('moduleHint').textContent = response.hint || 'ดูภาพรวมการจัดการชุดสัตว์และ action ล่าสุด';
    document.getElementById('calendarMonthLabel').textContent = formatThaiMonth(state.month);
    document.getElementById('calendarTitle').textContent = state.batch.specie === 'duck'
      ? `ปฏิทิน ${formatThaiMonth(state.month)}`
      : 'ไม่แสดงปฏิทินสำหรับปลา';
  }

  function renderSummary(cards) {
    const container = document.getElementById('moduleSummaryCards');
    container.innerHTML = cards.map((card) => `
      <div class="module-summary-card">
        <span class="module-summary-label">${escapeHtml(card.label)}</span>
        <strong class="module-summary-value">${escapeHtml(card.value)}</strong>
        <span class="muted">${escapeHtml(card.note || '')}</span>
      </div>
    `).join('');
  }

  function renderCalendar(map) {
    const panel = document.getElementById('batchManageCalendarPanel');
    if (state.batch.specie !== 'duck') {
      panel?.classList.add('hidden');
      return;
    }
    panel?.classList.remove('hidden');
    const grid = document.getElementById('moduleCalendarGrid');
    const [year, monthNum] = state.month.split('-').map(Number);
    const firstDay = new Date(year, monthNum - 1, 1);
    const lastDay = new Date(year, monthNum, 0).getDate();
    const startWeekday = firstDay.getDay();
    const cells = [];
    for (let i = 0; i < startWeekday; i += 1) cells.push('<div class="module-day module-day--empty"></div>');
    for (let day = 1; day <= lastDay; day += 1) {
      const key = `${state.month}-${String(day).padStart(2, '0')}`;
      const item = map[key] || null;
      const canQuickEdit = !!item && state.modulePermission === 'write';
      const cls = item ? 'module-day module-day--filled' : 'module-day module-day--missing';
      const plusLine = item?.plus_text ? `<div class="module-day-total module-day-total--plus">${escapeHtml(item.plus_text)}</div>` : '';
      const minusLine = item?.minus_text ? `<div class="module-day-total module-day-total--minus">${escapeHtml(item.minus_text)}</div>` : '';
      const emptyLine = (!item?.plus_text && !item?.minus_text) ? '<div class="module-day-total">-</div>' : '';
      cells.push(`<div class="${cls}${canQuickEdit ? ' module-day--clickable' : ''}" ${canQuickEdit ? `data-log-date="${key}"` : ''} title="${escapeHtml(item?.meta || 'ยังไม่มี action')}"><div class="module-day-number">${day}</div>${plusLine}${minusLine}${emptyLine}</div>`);
    }
    grid.innerHTML = cells.join('');
  }

  function renderLogs() {
    const list = document.getElementById('recentLogList');
    const badge = document.getElementById('recentCountBadge');
    badge.textContent = `${state.logs.length} รายการ`;
    if (!state.logs.length) {
      list.innerHTML = '<div class="empty-state">ยังไม่มีรายการล่าสุด</div>';
      return;
    }
    list.innerHTML = state.logs.map((row) => `
      <div class="log-item ${escapeHtml(row.trans_type || '')}">
        <div class="log-item__head"><strong>${escapeHtml(row.title || '-')}</strong><span>${escapeHtml(row.log_date || '-')}</span></div>
        <div class="log-item__body">${(row.lines || []).map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>
      </div>
    `).join('');
  }

  function renderFab() {
    const root = document.getElementById('batchFabRoot');
    if (!root) return;
    if (state.modulePermission !== 'write') {
      root.innerHTML = '';
      return;
    }
    const actions = state.batch.specie === 'fish'
      ? [
          { label: 'เพิ่ม', code: 'add' },
          { label: 'ขาย', code: 'sell' }
        ]
      : [
          { label: 'เพิ่ม', code: 'add' },
          { label: 'ตาย', code: 'dead' },
          { label: 'ขาย', code: 'sell' },
          { label: 'แก้ไขข้อมูล', code: 'edit' }
        ];

    root.innerHTML = `
      <div class="module-fab module-fab--batch" id="moduleFab">
        <div class="module-fab-actions">
          ${actions.map((item) => `<button type="button" class="module-fab-action" data-module-action="${item.code}">${item.label}</button>`).join('')}
        </div>
        <button type="button" class="fab module-fab-main" id="moduleFabToggle">＋</button>
      </div>
    `;
    document.getElementById('moduleFabToggle')?.addEventListener('click', (event) => {
      event.stopPropagation();
      document.getElementById('moduleFab')?.classList.toggle('open');
    });
    root.querySelectorAll('[data-module-action]').forEach((button) => {
      button.addEventListener('click', () => handleAction(button.dataset.moduleAction));
    });
    document.addEventListener('click', onOutsideFabClick, { capture: true });
  }

  function onOutsideFabClick(event) {
    const root = document.getElementById('moduleFab');
    if (root && !root.contains(event.target)) root.classList.remove('open');
  }

  function handleAction(action) {
    document.getElementById('moduleFab')?.classList.remove('open');
    if (action === 'edit') return openEditSheet();
    if (action === 'sell') return openSaleBillSheet();
    return openMovementSheet(action);
  }

  function openMovementSheet(mode) {
    const config = movementModeConfig[mode] || movementModeConfig.add;
    document.getElementById('movementSheetTitle').textContent = config.title;
    document.getElementById('movementSubmitBtn').textContent = config.submitLabel;
    document.getElementById('movementHelperText').textContent = config.helper;
    document.getElementById('movementType').value = mode;
    document.getElementById('movementDate').value = todayString();
    document.getElementById('movementQty').value = '';
    document.getElementById('movementRemark').value = '';
    document.getElementById('movementUnitPrice').value = '';
    document.getElementById('movementCurrentQtyLabel').textContent = `คงเหลือปัจจุบัน ${Number(state.batch.current_qty || 0).toLocaleString()} ตัว`;
    const unitWrap = document.getElementById('movementUnitPriceWrap');
    const unitInput = document.getElementById('movementUnitPrice');
    const unitLabel = document.getElementById('movementUnitPriceLabel');
    unitLabel.textContent = config.unitPriceLabel || 'ราคาต่อหน่วย';
    unitInput.placeholder = config.unitPricePlaceholder || 'ราคาต่อหน่วย';
    unitWrap.classList.toggle('hidden', !config.unitPriceVisible);
    showSheet('movementSheet');
  }

  function closeMovementSheet() { hideSheet('movementSheet'); }

  async function submitMovement(event) {
    event.preventDefault();
    const mode = document.getElementById('movementType').value;
    const qty = Number(document.getElementById('movementQty').value || 0);
    const unitPrice = Number(document.getElementById('movementUnitPrice').value || 0);
    const logDate = document.getElementById('movementDate').value || todayString();
    const remark = document.getElementById('movementRemark').value.trim();
    const submitButton = document.getElementById('movementSubmitBtn');
    const original = submitButton.textContent;

    if (!qty || qty <= 0) return alert('กรุณาระบุจำนวนให้มากกว่า 0');
    if (mode === 'dead' && qty > Number(state.batch.current_qty || 0)) return alert('จำนวนมากกว่าคงเหลือปัจจุบัน');

    submitButton.disabled = true;
    submitButton.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post({
      action: 'saveBatchMovement',
      batch_id: state.batch.id,
      movement_type: mode,
      log_date: logDate,
      qty,
      unit_price: unitPrice,
      remark
    });
    submitButton.disabled = false;
    submitButton.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกรายการไม่สำเร็จ');
    closeMovementSheet();
    clearCache();
    await load(state.batch.id);
  }

  async function onCalendarCellClick(event) {
    const cell = event.target.closest('.module-day[data-log-date]');
    if (!cell || state.modulePermission !== 'write') return;
    const logDate = cell.dataset.logDate;
    if (!logDate) return;
    const ok = confirm(`ต้องการแก้ไขรายการของวันที่ ${logDate} ใช่หรือไม่`);
    if (!ok) return;
    const response = await AppApi.post({ action: 'getBatchMovementRecord', batch_id: state.batch.id, log_date: logDate });
    if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดรายการของวันไม่สำเร็จ');
    openMovementDaySheet(response);
  }

  function openMovementDaySheet(payload) {
    document.getElementById('movementDayTitle').textContent = `แก้ไขรายการของวันที่ ${payload.log_date || ''}`;
    document.getElementById('movementDayDate').value = payload.log_date || todayString();
    const list = document.getElementById('movementDayEntryList');
    list.innerHTML = '';
    const rows = Array.isArray(payload.records) ? payload.records : [];
    if (rows.length) rows.forEach((row) => appendMovementDayEntryRow(row));
    else appendMovementDayEntryRow();
    showSheet('movementDaySheet');
  }

  function closeMovementDaySheet() { hideSheet('movementDaySheet'); }

  function appendMovementDayEntryRow(entry = {}) {
    const list = document.getElementById('movementDayEntryList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'movement-day-entry-row';
    row.innerHTML = `
      <div class="sheet-field-grid sheet-field-grid--2">
        <div>
          <label class="field-label">ประเภท</label>
          <select class="movement-day-type">
            <option value="add" ${String(entry.trans_type || 'add') === 'add' ? 'selected' : ''}>เพิ่ม</option>
            <option value="dead" ${String(entry.trans_type || '') === 'dead' ? 'selected' : ''}>ตาย/สูญเสีย</option>
            <option value="sell" ${String(entry.trans_type || '') === 'sell' ? 'selected' : ''}>ขายออก</option>
          </select>
        </div>
        <div>
          <label class="field-label">จำนวน</label>
          <input class="movement-day-qty" type="number" min="1" step="1" value="${entry.qty != null ? escapeHtml(entry.qty) : ''}" />
        </div>
      </div>
      <div class="sheet-field-grid sheet-field-grid--2">
        <div>
          <label class="field-label">ราคาต่อหน่วย</label>
          <input class="movement-day-unit-price" type="number" min="0" step="0.01" value="${entry.unit_price != null ? escapeHtml(entry.unit_price) : ''}" />
        </div>
        <div class="movement-day-remove-wrap">
          <button type="button" class="secondary-btn entry-remove-btn" data-movement-day-action="remove">ลบรายการนี้</button>
        </div>
      </div>
      <div>
        <label class="field-label">หมายเหตุ</label>
        <textarea class="movement-day-remark" rows="2" placeholder="หมายเหตุเพิ่มเติม">${escapeHtml(entry.remark || '')}</textarea>
      </div>
    `;
    list.appendChild(row);
  }

  function onMovementDayListClick(event) {
    const btn = event.target.closest('[data-movement-day-action="remove"]');
    if (!btn) return;
    const list = document.getElementById('movementDayEntryList');
    if (list.children.length <= 1) return;
    btn.closest('.movement-day-entry-row')?.remove();
  }

  async function submitMovementDay(event) {
    event.preventDefault();
    const rows = [...document.querySelectorAll('#movementDayEntryList .movement-day-entry-row')];
    if (!rows.length) return alert('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ');
    const entries = [];
    for (const row of rows) {
      const transType = row.querySelector('.movement-day-type')?.value || 'add';
      const qty = Number(row.querySelector('.movement-day-qty')?.value || 0);
      const unitPrice = Number(row.querySelector('.movement-day-unit-price')?.value || 0);
      const remark = row.querySelector('.movement-day-remark')?.value.trim() || '';
      if (!(qty > 0)) return alert('จำนวนต้องมากกว่า 0 ทุกรายการ');
      entries.push({ trans_type: transType, qty, unit_price: unitPrice, remark });
    }
    const submitButton = document.getElementById('movementDaySubmitBtn');
    const original = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post({
      action: 'saveBatchMovement',
      mode: 'replace_day',
      batch_id: state.batch.id,
      log_date: document.getElementById('movementDayDate').value || todayString(),
      entries
    });
    submitButton.disabled = false;
    submitButton.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกรายการไม่สำเร็จ');
    closeMovementDaySheet();
    clearCache();
    await load(state.batch.id);
  }

  function openEditSheet() {
    state.imageBase64 = null;
    document.getElementById('editBatchName').value = state.batch.name || '';
    document.getElementById('editBatchSpecie').value = displaySpecie(state.batch.specie);
    document.getElementById('editBatchStatus').value = String(state.batch.status || 0);
    document.getElementById('editBatchUnitPrice').value = state.batch.unit_price || 0;
    document.getElementById('editBatchInitialQty').value = state.batch.initial_qty || 0;
    document.getElementById('editBatchCurrentQty').value = state.batch.current_qty || 0;
    document.getElementById('editBatchStartDate').value = state.batch.start_date || '';
    document.getElementById('editBatchEndDate').value = state.batch.end_date || '';
    document.getElementById('editBatchRemark').value = state.batch.remark || '';
    const preview = document.getElementById('editBatchImagePreview');
    preview.src = AppConfig.imageUrlFromId(state.batch.image_url);
    preview.classList.toggle('hidden', !state.batch.image_url);
    showSheet('editBatchSheet');
  }

  function closeEditSheet() { hideSheet('editBatchSheet'); }

  async function onEditImageSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    state.imageBase64 = await resizeImage(base64, 1200, 800, 0.82);
    const preview = document.getElementById('editBatchImagePreview');
    preview.src = state.imageBase64;
    preview.classList.remove('hidden');
  }

  async function submitEditBatch(event) {
    event.preventDefault();
    const submitButton = document.getElementById('editBatchSubmitBtn');
    const original = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'กำลังบันทึก...';

    const response = await AppApi.post({
      action: 'edit_batch',
      bid: state.batch.id,
      ab_name: document.getElementById('editBatchName').value.trim(),
      ab_species: normalizeSpecie(document.getElementById('editBatchSpecie').value),
      ab_status: Number(document.getElementById('editBatchStatus').value || 0),
      ab_unitprice: Number(document.getElementById('editBatchUnitPrice').value || 0),
      ab_initqty: Number(document.getElementById('editBatchInitialQty').value || 0),
      ab_currqty: Number(document.getElementById('editBatchCurrentQty').value || 0),
      ab_startDate: document.getElementById('editBatchStartDate').value || '',
      ab_endDate: document.getElementById('editBatchEndDate').value || '',
      ab_remark: document.getElementById('editBatchRemark').value.trim(),
      image_base64: state.imageBase64 || null
    });
    submitButton.disabled = false;
    submitButton.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกข้อมูลไม่สำเร็จ');
    closeEditSheet();
    clearCache();
    await load(state.batch.id);
  }

  function openSaleBillSheet() {
    document.getElementById('saleBillDate').value = todayString();
    document.getElementById('saleBuyerName').value = '';
    document.getElementById('saleBillRemark').value = '';
    if (document.getElementById('saleDiscount')) document.getElementById('saleDiscount').value = '0';
    document.getElementById('saleBillStockNote').textContent = `คงเหลือปัจจุบัน ${Number(state.batch.current_qty || 0).toLocaleString()} ${state.batch.specie === 'fish' ? 'กก.' : 'ตัว'} • ชื่อฟาร์มบนบิล: ${state.farmName || '-'}`;
    document.getElementById('saleItemsList').innerHTML = '';
    appendSaleItemRow({ item_name: state.batch.specie === 'fish' ? 'ขายปลา' : 'ขายเป็ด', qty: 1, unit: state.batch.specie === 'fish' ? 'กก.' : 'ตัว', unit_price: Number(state.batch.unit_price || 0) || 0 });
    normalizeSaleLayout();
    showSheet('saleBillSheet');
  }

  function closeSaleBillSheet() { hideSheet('saleBillSheet'); }
  function closeBillPreview() { hideSheet('billPreviewSheet'); }
  function backToEditBill() { hideSheet('billPreviewSheet'); showSheet('saleBillSheet'); }

  function appendSaleItemRow(seed = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'sale-item-card';
    wrap.innerHTML = `
      <button class="remove-line-btn" type="button">ลบรายการ</button>
      <div class="sale-item-grid">
        <div>
          <label class="field-label">รายการ</label>
          <input class="sale-item-name" type="text" placeholder="เช่น ขายสัตว์ชุด A" value="${escapeHtml(seed.item_name || '')}" required>
        </div>
        <div>
          <label class="field-label">หน่วย</label>
          <input class="sale-item-unit" type="text" placeholder="หน่วย" value="${escapeHtml(seed.unit || 'ตัว')}" required>
        </div>
      </div>
      <div class="sale-item-grid-3">
        <div>
          <label class="field-label">จำนวน</label>
          <input class="sale-item-qty" type="number" min="0.01" step="0.01" value="${Number(seed.qty || 0) || ''}" required>
        </div>
        <div>
          <label class="field-label">ราคาต่อหน่วย</label>
          <input class="sale-item-price" type="number" min="0" step="0.01" value="${Number(seed.unit_price || 0) || ''}" required>
        </div>
        <div>
          <label class="field-label">รวม</label>
          <div class="line-total-badge">0.00</div>
        </div>
      </div>
    `;
    const list = document.getElementById('saleItemsList');
    list.appendChild(wrap);
    const qtyInput = wrap.querySelector('.sale-item-qty');
    const priceInput = wrap.querySelector('.sale-item-price');
    const updateLine = () => {
      const total = Number(qtyInput.value || 0) * Number(priceInput.value || 0);
      wrap.querySelector('.line-total-badge').textContent = `${formatMoney(total)} ฿`;
    };
    qtyInput.addEventListener('input', updateLine);
    priceInput.addEventListener('input', updateLine);
    wrap.querySelector('.remove-line-btn').addEventListener('click', () => {
      if (document.querySelectorAll('.sale-item-card').length <= 1) return alert('ต้องมีอย่างน้อย 1 รายการ');
      wrap.remove();
    });
    updateLine();
  }

  async function onPreviewBillSubmit(event) {
    event.preventDefault();
    const draft = collectBillDraft();
    if (!draft) return;
    state.billDraft = draft;
    const dataUrl = await renderBillImage(draft);
    state.billPreviewImage = dataUrl;
    document.getElementById('billPreviewImage').src = dataUrl;
    document.getElementById('billPreviewImage').classList.remove('hidden');
    document.getElementById('billPreviewMeta').textContent = `ก่อนหักส่วนลด ${formatMoney(draft.sub_total || draft.grand_total)} บาท • ส่วนลด ${formatMoney(draft.discount || 0)} บาท • สุทธิหลังหักส่วนลด ${formatMoney(draft.grand_total)} บาท`;
    hideSheet('saleBillSheet');
    showSheet('billPreviewSheet');
  }

  function collectBillDraft() {
    const logDate = document.getElementById('saleBillDate').value;
    if (!logDate) { alert('กรุณาเลือกวันที่ขาย'); return null; }
    const buyerName = document.getElementById('saleBuyerName').value.trim();
    const remark = document.getElementById('saleBillRemark').value.trim();
    const billDiscount = Number(document.getElementById('saleDiscount')?.value || 0);
    const rows = [...document.querySelectorAll('.sale-item-card')];
    const items = [];
    let totalQty = 0;
    let subTotal = 0;
    for (const row of rows) {
      const item_name = row.querySelector('.sale-item-name').value.trim();
      const unit = row.querySelector('.sale-item-unit').value.trim() || 'ตัว';
      const qty = Number(row.querySelector('.sale-item-qty').value || 0);
      const unit_price = Number(row.querySelector('.sale-item-price').value || 0);
      if (!item_name || qty <= 0) { alert('กรุณากรอกชื่อรายการและจำนวนให้ถูกต้อง'); return null; }
      const line_total = round2(qty * unit_price);
      totalQty += qty;
      subTotal += line_total;
      items.push({ item_name, unit, qty, unit_price, line_total });
    }
    if (totalQty > Number(state.batch.current_qty || 0)) { alert('จำนวนขายรวมมากกว่าคงเหลือปัจจุบัน'); return null; }
    const safeDiscount = Math.max(0, round2(billDiscount));
    const grandTotal = Math.max(0, round2(subTotal - safeDiscount));
    return {
      batch_id: state.batch.id,
      bill_title: 'บิลเงินสด',
      bill_type: state.batch.specie,
      farm_name: state.farmName || 'FARM',
      logo_url: state.logoUrl,
      batch_name: state.batch.name,
      log_date: logDate,
      issue_date: nowDateTimeDisplay(),
      sale_name: buyerName,
      remark,
      items,
      total_qty: round2(totalQty),
      sub_total: round2(subTotal),
      discount: safeDiscount,
      grand_total: grandTotal
    };
  }

  async function renderBillImage(draft) {
    const width = 430;
    const padding = 22;
    const lineGap = 18;
    const itemBlockHeight = 56;
    const headerHeight = 160;
    const footerHeight = (draft.remark ? 74 : 42) + 40;
    const discountRows = Number(draft.discount || 0) > 0 ? 2 : 1;
    const height = headerHeight + footerHeight + (draft.items.length * itemBlockHeight) + 120 + (discountRows * 20);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#111827';
    ctx.textBaseline = 'top';
    let y = padding;
    ctx.font = 'bold 24px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(draft.farm_name || 'FARM', width / 2, y);
    y += 34;
    ctx.font = 'bold 18px system-ui';
    ctx.fillText('บิลเงินสด', width / 2, y);
    y += 32;
    ctx.textAlign = 'left';
    ctx.font = '14px system-ui';
    ctx.fillText('วันที่ขาย: ' + formatThaiDate(draft.log_date), padding, y);
    y += lineGap;
    ctx.fillText('เวลาออกบิล: ' + draft.issue_date, padding, y);
    y += lineGap;
    ctx.fillText('ชุดสัตว์: ' + draft.batch_name, padding, y);
    y += 22;
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke();
    y += 12;
    draft.items.forEach((item) => {
      ctx.font = 'bold 15px system-ui';
      ctx.fillText(item.item_name, padding, y);
      y += 18;
      ctx.font = '14px system-ui';
      ctx.fillText(`${formatNumber(item.qty)} ${item.unit} x ${formatMoney(item.unit_price)}`, padding, y);
      ctx.textAlign = 'right';
      ctx.fillText(formatMoney(item.line_total), width - padding, y);
      ctx.textAlign = 'left';
      y += itemBlockHeight - 18;
    });
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke();
    y += 12;
    ctx.font = '14px system-ui';
    ctx.fillText('รวมก่อนหักส่วนลด', padding, y);
    ctx.textAlign = 'right'; ctx.fillText(formatMoney(draft.sub_total), width - padding, y); ctx.textAlign = 'left';
    y += lineGap;
    if (Number(draft.discount || 0) > 0) {
      ctx.fillText('ส่วนลด', padding, y);
      ctx.textAlign = 'right'; ctx.fillText('-' + formatMoney(draft.discount), width - padding, y); ctx.textAlign = 'left';
      y += lineGap;
    }
    ctx.font = 'bold 16px system-ui';
    ctx.fillText('สุทธิหลังหักส่วนลด', padding, y);
    ctx.textAlign = 'right'; ctx.fillText(formatMoney(draft.grand_total), width - padding, y); ctx.textAlign = 'left';
    y += lineGap + 10;
    if (draft.remark) {
      ctx.font = '13px system-ui';
      wrapText(ctx, 'หมายเหตุ: ' + draft.remark, padding, y, width - (padding * 2), 18);
    }
    return canvas.toDataURL('image/png');
  }

  async function confirmBill() {
    if (!state.billDraft) return;
    const button = document.getElementById('billConfirmBtn');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post({
      action: 'saveBatchSaleBill',
      batch_id: state.billDraft.batch_id,
      log_date: state.billDraft.log_date,
      sale_name: state.billDraft.sale_name,
      remark: state.billDraft.remark,
      discount: state.billDraft.discount || 0,
      items: state.billDraft.items
    });
    button.disabled = false;
    button.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกบิลไม่สำเร็จ');
    closeBillPreview();
    closeSaleBillSheet();
    clearCache();
    await load(state.batch.id);
    alert(`บันทึกบิลสำเร็จ เลขที่ ${response.bill?.bill_id || '-'}`);
  }

  function downloadBillImage() {
    if (!state.billPreviewImage) return;
    const link = document.createElement('a');
    link.href = state.billPreviewImage;
    link.download = `cash-bill-${state.batch.id}-${Date.now()}.png`;
    link.click();
  }

  function ensureSaleDiscountField() {
    const form = document.getElementById('saleBillForm');
    if (!form || document.getElementById('saleDiscount')) return;
    const stockNote = document.getElementById('saleBillStockNote');
    const discountWrap = document.createElement('div');
    discountWrap.className = 'sale-discount-wrap';
    discountWrap.innerHTML = `
      <label class="field-label" for="saleDiscount">ส่วนลดรวม</label>
      <input id="saleDiscount" type="number" min="0" step="0.01" placeholder="ส่วนลดรวม (บาท)" value="0" />
    `;
    if (stockNote && stockNote.parentNode === form) form.insertBefore(discountWrap, stockNote);
    else form.appendChild(discountWrap);
  }

  function normalizeSaleLayout() {
    const addBtn = document.getElementById('addSaleItemBtn');
    const footer = document.querySelector('#saleBillSheet .sheet-footer');
    if (!addBtn || !footer) return;
    let row = footer.querySelector('.sale-bill-footer-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'sale-bill-footer-row';
      footer.prepend(row);
    }
    const submitBtn = footer.querySelector('#salePreviewBtn');
    addBtn.type = 'button';
    if (!row.contains(addBtn)) row.appendChild(addBtn);
    if (submitBtn && !row.contains(submitBtn)) row.appendChild(submitBtn);
  }

  function showSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => sheet.classList.add('show'));
  }

  function hideSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    sheet.classList.remove('show');
    setTimeout(() => sheet.classList.add('hidden'), 220);
  }

  function cacheKey(batchId) { return `ducky:batch-manage:${batchId}:${state.month}`; }
  function clearCache() {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (state.batch?.id && key.startsWith(`ducky:batch-manage:${state.batch.id}:`)) localStorage.removeItem(key);
      });
    } catch (_) {}
  }
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

  async function changeMonth(offset) {
    const [year, month] = state.month.split('-').map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    state.month = monthKey(next);
    await load(state.batch.id);
  }

  function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
  function permissionLabel(value) { return value === 'write' ? 'ดูและแก้ไข' : (value === 'view' ? 'ดูอย่างเดียว' : 'ไม่มีสิทธิ์'); }
  function badgeClass(value) { return value === 'write' ? 'success' : (value === 'view' ? 'muted-badge' : 'danger-soft'); }
  function displaySpecie(value) { return value === 'duck' ? 'เป็ด' : (value === 'fish' ? 'ปลา' : (value || '-')); }
  function normalizeSpecie(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'เป็ด' || raw === 'duck') return 'duck';
    if (raw === 'ปลา' || raw === 'fish') return 'fish';
    return raw;
  }
  function todayString() { return new Date().toISOString().slice(0, 10); }
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
  function resizeImage(base64, maxWidth, maxHeight, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        let width = image.width;
        let height = image.height;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.onerror = reject;
      image.src = base64;
    });
  }

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

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || '').split(/\s+/);
    let line = '';
    for (let i = 0; i < words.length; i += 1) {
      const test = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y);
  }
  function formatMoney(value) { return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function formatNumber(value) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  function round2(value) { return Math.round(Number(value || 0) * 100) / 100; }
  function nowDateTimeDisplay() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function pad2(value) { return String(value).padStart(2, '0'); }
  function formatThaiMonth(month) {
    const [year, m] = month.split('-').map(Number);
    const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    return `${months[m - 1]} ${year + 543}`;
  }
  function formatThaiDate(dateStr) {
    const date = new Date(`${dateStr}T00:00:00`);
    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear() + 543}`;
  }
  function escapeHtml(text) {
    return String(text || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  }

  return { bootstrap };
})();
