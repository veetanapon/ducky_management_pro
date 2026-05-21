window.MedicinePage = (() => {
  const state = {
    batchId: '',
    batch: null,
    permission: 'none',
    batchPermission: 'read',
    isOwner: false,
    isAdmin: false,
    modulePermissions: {},
    items: [],
    filter: 'all',
    search: '',
    editingItem: null
  };

  const TYPE_LABELS = {
    medicine: 'ยา',
    vitamin: 'วิตามิน',
    premix: 'พรีมิกซ์',
    vaccine: 'วัคซีน',
    chemical: 'เคมีภัณฑ์',
    other: 'อื่น ๆ'
  };

  async function bootstrap() {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    state.batchId = new URLSearchParams(location.search).get('bid') || '';
    bind();
    if (!state.batchId) {
      setText('medicineSubtitle', 'ไม่พบ batch id');
      return;
    }
    await load();
  }

  function bind() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);
    document.getElementById('medicineSearch')?.addEventListener('input', (event) => {
      state.search = String(event.target.value || '').trim().toLowerCase();
      renderList();
    });
    document.getElementById('medicineFilterRow')?.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-filter]');
      if (!btn) return;
      state.filter = btn.dataset.filter || 'all';
      document.querySelectorAll('#medicineFilterRow [data-filter]').forEach((el) => el.classList.toggle('is-active', el === btn));
      renderList();
    });
    document.getElementById('medicineSheetCloseBtn')?.addEventListener('click', closeSheet);
    document.getElementById('medicineSheetCancelBtn')?.addEventListener('click', closeSheet);
    document.getElementById('medicineSheetBackdrop')?.addEventListener('click', closeSheet);
    document.getElementById('medicineForm')?.addEventListener('submit', submitForm);
    ['medicinePackageQty', 'medicineKgPerPackage', 'medicineTotalCost'].forEach((id) => {
      document.getElementById(id)?.addEventListener('input', updateComputedWeight);
    });
  }

  async function load() {
    setText('medicineSubtitle', 'กำลังโหลดข้อมูล...');
    const cacheKey = `ducky:medicine:${state.batchId}`;
    const cached = readEnvelope(cacheKey, true);
    if (cached) hydrateAndRender(cached, true);

    const res = await AppApi.post({ action: 'getBatchEventsPageData', batch_id: state.batchId }, { timeoutMs: 14000 });
    if (!res || res.status !== 'ok') {
      if (!cached) {
        setText('medicineSubtitle', res?.message || 'โหลดข้อมูลไม่สำเร็จ');
        document.getElementById('medicineList').innerHTML = `<div class="empty-state">${esc(res?.message || 'โหลดข้อมูลไม่สำเร็จ')}</div>`;
      }
      return;
    }
    writeEnvelope(cacheKey, res);
    hydrateAndRender(res, false);
  }

  function hydrateAndRender(res, fromCache) {
    state.batch = res.batch || null;
    state.permission = res.permission || 'none';
    state.batchPermission = res.batch_permission || res.permission || 'read';
    state.isOwner = !!res.is_owner;
    state.isAdmin = !!res.is_admin;
    state.modulePermissions = res.module_permissions || { farm_events: state.permission };
    state.items = Array.isArray(res.medical_items) ? res.medical_items : [];
    render(fromCache);
  }

  function render(fromCache) {
    setText('medicineTitle', 'คลังยา / วิตามิน');
    setText('medicineSubtitle', `${state.batch?.name || state.batchId} • เก็บ stock เป็นกรัม${fromCache ? ' • แสดงจาก cache' : ''}`);
    const badge = document.getElementById('medicinePermissionBadge');
    if (badge) {
      badge.className = `badge-inline ${state.permission === 'write' ? 'success' : 'muted-badge'}`;
      badge.textContent = state.permission === 'write' ? 'ดูและแก้ไข' : 'ดูอย่างเดียว';
    }
    if (window.NavDrawer) {
      NavDrawer.setBatchContext({
        id: state.batchId,
        specie: state.batch?.specie,
        permission: state.batchPermission,
        isOwner: state.isOwner,
        isAdmin: state.isAdmin,
        module_permissions: state.modulePermissions
      });
    }
    renderSummary();
    renderList();
    renderFab();
  }

  function renderSummary() {
    const target = document.getElementById('medicineSummaryCards');
    if (!target) return;
    const active = state.items.filter((item) => Number(item.current_qty || 0) > 0);
    const low = state.items.filter((item) => Number(item.current_qty || 0) > 0 && Number(item.current_qty || 0) <= 500).length;
    const premix = state.items.filter((item) => normalizeType(item.item_type) === 'premix').length;
    target.innerHTML = [
      ['รายการทั้งหมด', `${fmt(state.items.length)} รายการ`, 'ยา/วิตามิน/พรีมิกซ์'],
      ['มีคงเหลือ', `${fmt(active.length)} รายการ`, 'พร้อมใช้งาน'],
      ['ใกล้หมด', `${fmt(low)} รายการ`, 'เหลือไม่เกิน 500 กรัม'],
      ['พรีมิกซ์', `${fmt(premix)} รายการ`, 'ซื้อเป็นถุง ใช้เป็นกรัม']
    ].map(([label, value, note]) => `
      <div class="module-summary-card">
        <span class="module-summary-label">${esc(label)}</span>
        <strong class="module-summary-value">${esc(value)}</strong>
        <span class="muted">${esc(note)}</span>
      </div>
    `).join('');
  }

  function filteredItems() {
    return state.items.filter((item) => {
      const type = normalizeType(item.item_type);
      if (state.filter !== 'all' && type !== state.filter) return false;
      if (!state.search) return true;
      return [item.name, TYPE_LABELS[type], item.remark].join(' ').toLowerCase().includes(state.search);
    });
  }

  function renderList() {
    const target = document.getElementById('medicineList');
    const badge = document.getElementById('medicineCountBadge');
    if (!target) return;
    const rows = filteredItems();
    if (badge) badge.textContent = `${rows.length} รายการ`;
    if (!rows.length) {
      target.innerHTML = '<div class="empty-state">ยังไม่มีรายการในคลัง ใช้ปุ่ม + เพื่อบันทึกการซื้อเข้า</div>';
      return;
    }
    target.innerHTML = rows.map((item) => renderItemCard(item)).join('');
    target.querySelectorAll('[data-med-action]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = state.items.find((it) => String(it.id) === String(btn.dataset.itemId));
        openSheet(btn.dataset.medAction, item || null);
      });
    });
  }

  function renderItemCard(item) {
    const type = normalizeType(item.item_type);
    const qty = Number(item.current_qty || 0);
    const low = qty > 0 && qty <= 500;
    const canWrite = state.permission === 'write';
    return `
      <article class="medicine-card ${low ? 'medicine-low-stock' : ''}">
        <div class="medicine-card__head">
          <div>
            <div class="medicine-card__title">${esc(item.name || '-')}</div>
            <div class="medicine-card__meta">
              <span class="medicine-pill medicine-pill--${esc(type)}">${esc(TYPE_LABELS[type] || 'อื่น ๆ')}</span>
              ${low ? '<span class="medicine-pill">ใกล้หมด</span>' : ''}
            </div>
          </div>
          <span class="medicine-pill">${esc(displayGram(qty))}</span>
        </div>
        <div class="medicine-stock">
          <div><span>คงเหลือ</span><strong>${esc(displayGram(qty))}</strong></div>
          <div><span>ต้นทุนเฉลี่ย</span><strong>${money(Number(item.unit_price || 0) * 1000)} ฿/กก.</strong></div>
        </div>
        ${item.remark ? `<div class="inline-note">${esc(item.remark)}</div>` : ''}
        <div class="medicine-card__actions">
          <button class="secondary-btn" type="button" data-med-action="purchase" data-item-id="${escAttr(item.id)}" ${canWrite ? '' : 'disabled'}>ซื้อเพิ่ม</button>
          <button class="secondary-btn" type="button" data-med-action="use" data-item-id="${escAttr(item.id)}" ${canWrite ? '' : 'disabled'}>ใช้</button>
          <button class="secondary-btn" type="button" data-med-action="adjust" data-item-id="${escAttr(item.id)}" ${canWrite ? '' : 'disabled'}>ปรับยอด</button>
        </div>
      </article>
    `;
  }

  function renderFab() {
    const root = document.getElementById('medicineFabRoot');
    if (!root) return;
    if (state.permission !== 'write') {
      root.innerHTML = '';
      return;
    }
    root.innerHTML = `<button type="button" class="fab module-fab-main" id="medicineFabBtn" aria-label="ซื้อเข้า">＋</button>`;
    document.getElementById('medicineFabBtn')?.addEventListener('click', () => openSheet('purchase', null));
  }

  function openSheet(mode, item) {
    state.editingItem = item || null;
    const form = document.getElementById('medicineForm');
    form?.reset();
    setValue('medicineMode', mode);
    setValue('medicineItemId', item?.id || '');
    setValue('medicineLogDate', todayKey());
    document.querySelectorAll('.medicine-mode-panel').forEach((el) => el.classList.add('hidden'));

    if (mode === 'purchase') {
      document.getElementById('medicinePurchaseFields')?.classList.remove('hidden');
      setText('medicineSheetTitle', item ? 'ซื้อเพิ่มเข้าคลัง' : 'ซื้อยา/วิตามิน/พรีมิกซ์เข้าคลัง');
      setText('medicineSubmitBtn', item ? 'บันทึกซื้อเพิ่ม' : 'บันทึกซื้อเข้า');
      setValue('medicineItemType', normalizeType(item?.item_type || 'medicine'));
      setValue('medicineItemName', item?.name || '');
      setValue('medicinePackageQty', '1');
      setValue('medicineKgPerPackage', '');
      setValue('medicineTotalCost', '');
      setValue('medicineRemark', item?.remark || '');
      document.getElementById('medicineItemName').readOnly = !!item;
      updateComputedWeight();
    } else if (mode === 'use') {
      document.getElementById('medicineUseFields')?.classList.remove('hidden');
      setText('medicineSheetTitle', 'ใช้จากคลัง');
      setText('medicineSubmitBtn', 'บันทึกการใช้');
      setValue('medicineUseItemName', item?.name || '');
      setText('medicineUseStockNote', `คงเหลือ ${displayGram(item?.current_qty || 0)}`);
      setValue('medicineRemark', 'ใช้จากคลังยา/วิตามิน');
    } else if (mode === 'adjust') {
      document.getElementById('medicineAdjustFields')?.classList.remove('hidden');
      setText('medicineSheetTitle', 'ปรับยอดคงเหลือ');
      setText('medicineSubmitBtn', 'บันทึกปรับยอด');
      setValue('medicineAdjustItemName', item?.name || '');
      setText('medicineAdjustStockNote', `คงเหลือเดิม ${displayGram(item?.current_qty || 0)}`);
      setValue('medicineAdjustGram', Number(item?.current_qty || 0));
      setValue('medicineRemark', 'ปรับยอดคลัง');
    }
    showSheet();
  }

  async function submitForm(event) {
    event.preventDefault();
    if (state.permission !== 'write') return alert('ไม่มีสิทธิ์แก้ไข');
    const mode = val('medicineMode');
    const item = state.editingItem;
    let payload = {
      action: 'saveMedicalInventoryLog',
      batch_id: state.batchId,
      item_id: val('medicineItemId'),
      log_date: val('medicineLogDate') || todayKey(),
      remark: val('medicineRemark')
    };

    if (mode === 'purchase') {
      const packageQty = Number(val('medicinePackageQty') || 0);
      const kgPerPackage = Number(val('medicineKgPerPackage') || 0);
      const totalGram = roundQty(packageQty * kgPerPackage * 1000);
      const totalCost = Math.max(0, Number(val('medicineTotalCost') || 0));
      if (!val('medicineItemName')) return alert('กรุณาระบุชื่อรายการ');
      if (!(totalGram > 0)) return alert('กรุณาระบุจำนวนถุงและกิโลกรัม/ถุง');
      payload = {
        ...payload,
        trans_type: 'in',
        item_type: val('medicineItemType') || normalizeType(item?.item_type || 'medicine'),
        item_name: val('medicineItemName'),
        unit: 'กรัม',
        qty: totalGram,
        package_qty: packageQty,
        kg_per_package: kgPerPackage,
        total_cost: totalCost,
        unit_price: totalGram > 0 ? totalCost / totalGram : 0,
        remark: val('medicineRemark') || `ซื้อเข้า ${packageQty} ถุง × ${kgPerPackage} กก.`
      };
    } else if (mode === 'use') {
      const useGram = roundQty(Number(val('medicineUseGram') || 0));
      if (!item?.id) return alert('ไม่พบรายการในคลัง');
      if (!(useGram > 0)) return alert('กรุณาระบุจำนวนที่ใช้เป็นกรัม');
      if (useGram > Number(item.current_qty || 0)) return alert('จำนวนในคลังไม่พอ');
      payload = {
        ...payload,
        trans_type: 'use',
        item_id: item.id,
        qty: useGram,
        unit: 'กรัม',
        unit_price: Number(item.unit_price || 0),
        remark: val('medicineRemark') || `ใช้ ${useGram} กรัม`
      };
    } else if (mode === 'adjust') {
      const nextGram = roundQty(Number(val('medicineAdjustGram') || 0));
      if (!item?.id) return alert('ไม่พบรายการในคลัง');
      payload = {
        ...payload,
        trans_type: 'adjust',
        item_id: item.id,
        item_name: item.name,
        item_type: normalizeType(item.item_type),
        qty: nextGram,
        unit: 'กรัม',
        unit_price: Number(item.unit_price || 0),
        remark: val('medicineRemark') || `ปรับยอดเป็น ${nextGram} กรัม`
      };
    }

    const btn = document.getElementById('medicineSubmitBtn');
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    const res = await AppApi.post(payload, { timeoutMs: 18000 });
    btn.disabled = false;
    btn.textContent = old;
    if (!res || res.status !== 'ok') return alert(res?.message || 'บันทึกไม่สำเร็จ');
    localStorage.removeItem(`ducky:medicine:${state.batchId}`);
    localStorage.removeItem(`ducky:farm-events:${state.batchId}`);
    closeSheet();
    await load();
  }

  function updateComputedWeight() {
    const packageQty = Number(val('medicinePackageQty') || 0);
    const kgPerPackage = Number(val('medicineKgPerPackage') || 0);
    const grams = packageQty * kgPerPackage * 1000;
    const totalCost = Number(val('medicineTotalCost') || 0);
    const unitCost = grams > 0 ? totalCost / grams : 0;
    setText('medicineComputedWeight', `รวม ${displayGram(grams)} • ต้นทุน ${money(unitCost * 1000)} ฿/กก.`);
  }

  function showSheet() {
    const sheet = document.getElementById('medicineSheet');
    if (!sheet) return;
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => sheet.classList.add('show'));
  }
  function closeSheet() {
    const sheet = document.getElementById('medicineSheet');
    if (!sheet) return;
    sheet.classList.remove('show');
    setTimeout(() => sheet.classList.add('hidden'), 220);
  }

  function readEnvelope(key, allowStale) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!allowStale && Date.now() - Number(parsed.savedAt || 0) > 60 * 1000) return null;
      return parsed.data || null;
    } catch (_) { return null; }
  }
  function writeEnvelope(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch (_) {}
  }

  function normalizeType(value) {
    const t = String(value || 'medicine').trim().toLowerCase();
    if (t === 'ยา') return 'medicine';
    if (t === 'วิตามิน') return 'vitamin';
    if (t === 'พรีมิกซ์' || t === 'premix') return 'premix';
    if (['medicine', 'vitamin', 'premix', 'vaccine', 'chemical', 'other'].includes(t)) return t;
    return 'medicine';
  }
  function displayGram(value) {
    const n = Number(value || 0);
    if (Math.abs(n) >= 1000) return `${fmtQty(n / 1000)} กก.`;
    return `${fmtQty(n)} กรัม`;
  }
  function fmtQty(value) {
    const n = Number(value || 0);
    return n.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(n) ? 0 : 1, maximumFractionDigits: 2 });
  }
  function roundQty(value) { return Math.max(0, Number(Number(value || 0).toFixed(3))); }
  function fmt(value) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
  function money(value) { return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function todayKey() { return new Date().toISOString().slice(0, 10); }
  function val(id) { return document.getElementById(id)?.value?.trim?.() || ''; }
  function setValue(id, value) { const el = document.getElementById(id); if (el) el.value = value == null ? '' : String(value); }
  function setText(id, value) { const el = document.getElementById(id); if (el) el.textContent = value == null ? '' : String(value); }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m])); }
  function escAttr(value) { return esc(value).replace(/`/g, '&#096;'); }

  return { bootstrap };
})();
