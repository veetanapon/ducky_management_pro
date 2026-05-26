window.FeedOrderBillsPage = (() => {
  const state = {
    rows: [],
    batches: [],
    summary: {},
    filter: 'pending',
    showHidden: false,
    bootstrapped: false,
    lastUpdated: '',
    permission: 'none',
    expandedLots: new Set()
  };

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const n = (v) => Number(v || 0);
  const fmt = (v, digits = 0) => n(v).toLocaleString('th-TH', { maximumFractionDigits: digits });
  const money = (v) => n(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = () => new Date().toISOString().slice(0, 10);
  const nowText = () => new Date().toLocaleString('th-TH', { hour12: false });

  function readLot(raw = {}) {
    const purchaseQty = n(raw.purchase_qty ?? raw.qty_total ?? raw.total_qty ?? raw.qty ?? raw.feed_qty);
    const returnedQty = n(raw.returned_qty ?? raw.returned_total ?? raw.return_qty ?? raw.claim_return_qty);
    const replacementQty = n(raw.replacement_qty ?? raw.replacement_total ?? raw.claim_replacement_qty ?? raw.received_back_qty);
    const netQty = n(raw.net_qty ?? raw.effective_qty ?? (purchaseQty - returnedQty + replacementQty));
    const unitPrice = n(raw.unit_price ?? raw.purchase_unit_price ?? raw.price_per_unit);
    const purchaseValue = n(raw.purchase_value ?? raw.gross_total ?? raw.grand_total ?? (purchaseQty * unitPrice));
    const returnValue = n(raw.return_value ?? raw.claim_return_value ?? returnedQty * unitPrice);
    const replacementValue = n(raw.replacement_value ?? raw.claim_replacement_value ?? raw.replacement_total_value);
    const netValue = n(raw.net_value ?? raw.net_total ?? raw.effective_total ?? (purchaseValue - returnValue + replacementValue));
    const paid = n(raw.paid_total ?? raw.payment_total ?? raw.paid_amount);
    const outstanding = Math.max(0, n(raw.debt_total ?? raw.outstanding_total ?? raw.payable_total ?? (netValue - paid)));

    const allocations = Array.isArray(raw.allocations) ? raw.allocations : [];
    const payments = Array.isArray(raw.payments) ? raw.payments : [];
    const claims = Array.isArray(raw.claims) ? raw.claims : [];
    const allocated = n(raw.allocated_qty ?? raw.allocated_total ?? raw.qty_allocated ?? raw.allocation_total ?? allocations.reduce((s, a) => s + n(a.qty_allocated ?? a.qty ?? 0), 0));
    const allocationCount = n(raw.allocation_count ?? allocations.length);
    const claimCount = n(raw.claim_count ?? claims.length);
    const isHidden = ['0', 'false', 'hidden', 'hide'].includes(String(raw.is_visible ?? raw.visible ?? 1).trim().toLowerCase());

    const allocationDestinations = allocations
      .map((a) => {
        const name = String(a.batch_name || a.external_name || a.destination_name || a.batch_id || '').trim();
        const qty = n(a.qty_allocated ?? a.qty ?? 0);
        const date = String(a.allocation_date || a.log_date || '').trim();
        if (!name && !qty) return null;
        return {
          date,
          name: name || 'ไม่ระบุเล้า',
          qty,
          text: `${date ? date + ' • ' : ''}${name || 'ไม่ระบุเล้า'} ${fmt(qty, 2)} ลูก`
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

    const paymentRows = payments
      .map((p) => ({
        payment_date: String(p.payment_date || p.date || '').trim(),
        amount: n(p.amount || p.payment_amount || 0),
        payment_method: String(p.payment_method || '').trim(),
        remark: String(p.remark || '').trim()
      }))
      .filter((p) => p.payment_date || p.amount)
      .sort((a, b) => String(a.payment_date || '').localeCompare(String(b.payment_date || '')));

    const latestPayment = paymentRows[paymentRows.length - 1] || payments[0] || null;
    const latestPaymentDate = String(raw.last_payment_date || raw.payment_date_latest || latestPayment?.payment_date || '').trim();
    const latestPaymentAmount = n(raw.last_payment_amount ?? latestPayment?.amount ?? 0);

    // สถานะการจ่ายยึดจากยอดค้างจริงก่อนเสมอ
    // ห้ามให้ข้อความ status จาก backend เช่น CLEARED มาทับ ถ้ายังมียอดค้างจ่ายอยู่
    const isCleared = outstanding <= 0.0001 && netValue > 0;
    const statusLabel = isCleared ? 'เคลียร์แล้ว' : (paid > 0 ? 'จ่ายบางส่วน' : 'ยังไม่จ่าย');

    const title = String(raw.feed_name || raw.name || raw.lot_name || raw.title || 'ล็อตอาหาร').trim();
    const supplier = String(raw.supplier_name || raw.supplier || raw.vendor_name || '').trim();
    return {
      ...raw,
      id: String(raw.id || raw.lot_id || raw.feed_order_id || ''),
      title,
      supplier,
      purchaseDate: raw.purchase_date || raw.log_date || raw.date || '',
      purchaseQty,
      returnedQty,
      replacementQty,
      netQty,
      allocated,
      allocationCount,
      allocationDestinations,
      paymentRows,
      isHidden,
      unitPrice,
      purchaseValue,
      netValue,
      paid,
      outstanding,
      latestPaymentDate,
      latestPaymentAmount,
      claimCount,
      isCleared,
      statusLabel,
      creatorLabel: String(raw.created_user_label || raw.created_user_name || raw.created_user_email || raw.created_user_id || '').trim(),
      isOwnLot: raw.is_own_lot === 1 || raw.is_own_lot === true || raw.is_own_lot === '1',
      allocations,
      payments,
      claims
    };
  }

  function normalizePayload(res = {}) {
    const rows = (res.lots || res.bills || res.rows || res.feed_order_bills || []).map(readLot);
    const summary = res.summary || calcSummary(rows);
    state.rows = rows;
    state.batches = res.batches || res.batch_options || [];
    state.summary = { ...calcSummary(rows), ...summary };
    if (res.permission) state.permission = String(res.permission || state.permission || 'none').toLowerCase();
    state.lastUpdated = res.generated_at || res.updated_at || nowText();
  }

  function calcSummary(rows) {
    return {
      lot_count: rows.length,
      purchase_qty: rows.reduce((s, r) => s + n(r.purchaseQty), 0),
      net_qty: rows.reduce((s, r) => s + n(r.netQty), 0),
      purchase_value: rows.reduce((s, r) => s + n(r.purchaseValue), 0),
      net_value: rows.reduce((s, r) => s + n(r.netValue), 0),
      paid_total: rows.reduce((s, r) => s + n(r.paid), 0),
      debt_total: rows.reduce((s, r) => s + n(r.outstanding), 0)
    };
  }

  function displayRows() {
    return state.showHidden ? state.rows : state.rows.filter((r) => !r.isHidden);
  }

  async function bootstrap() {
    if (state.bootstrapped) return;
    state.bootstrapped = true;
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    if (window.MenuPermissionApi?.ensureLoaded) await MenuPermissionApi.ensureLoaded().catch(() => null);
    state.permission = getProgramMenuPermission('feed_order_bills');
    if (!canViewFeedOrder()) {
      renderAccessDenied('ไม่มีสิทธิ์เข้าถึงเมนูบิลอาหารกลาง');
      return;
    }
    bind();
    applyPermissionUI();
    await load();
  }

  function bind() {
    $('backBtn')?.addEventListener('click', () => history.back());
    $('logoutBtn')?.addEventListener('click', AppAuth.logout);
    $('reloadBtn')?.addEventListener('click', () => load({ force: true }));
    $('openLotBtn')?.addEventListener('click', () => { if (canWriteFeedOrder()) openLotSheet(); else alert('ไม่มีสิทธิ์เพิ่มล็อตอาหาร'); });
    $('feedOrderFab')?.addEventListener('click', () => { if (canWriteFeedOrder()) openLotSheet(); else alert('ไม่มีสิทธิ์เพิ่มล็อตอาหาร'); });
    $('feedOrderHiddenToggle')?.addEventListener('click', () => {
      state.showHidden = !state.showHidden;
      render();
    });
    document.addEventListener('click', onDocumentClick);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeSheet();
    });
  }

  async function load({ force = false } = {}) {
    if (!canViewFeedOrder()) {
      renderAccessDenied('ไม่มีสิทธิ์เข้าถึงเมนูบิลอาหารกลาง');
      return;
    }
    setSubtitle(force ? 'กำลังโหลดใหม่...' : 'กำลังโหลดข้อมูล...');
    const btn = $('reloadBtn');
    await withButton(btn, 'กำลังโหลด...', async () => {
      const res = await FeedOrderService.getPageData({ dedupe: false });
      if (!res || res.status !== 'ok') {
        setSubtitle(res?.message || 'โหลดข้อมูลไม่สำเร็จ');
        return;
      }
      normalizePayload(res);
      render();
    });
  }

  function setSubtitle(text) {
    const el = $('feedOrderSubtitle');
    if (el) el.textContent = text || '';
  }

  function render() {
    applyPermissionUI();
    setSubtitle(`อัปเดต ${state.lastUpdated || nowText()}`);
    renderSummary();
    renderList();
  }

  function renderSummary() {
    const s = { ...calcSummary(displayRows()) }; // summary follows the current visible/hidden toggle
    const target = $('feedOrderSummary');
    if (!target) return;
    target.innerHTML = [
      summaryCard('ล็อตทั้งหมด', `${fmt(s.lot_count)} ล็อต`, 'บิลอาหารทั้งหมด'),
      summaryCard('จำนวนซื้อเข้า (สุทธิ)', `${fmt(s.net_qty, 2)} ลูก`, `ซื้อเข้า ${fmt(s.purchase_qty, 2)} ลูก`),//, `หลังหักเคลม/รับคืน • ซื้อเข้า ${fmt(s.purchase_qty, 2)} ลูก`),
      summaryCard('ราคาซื้อเข้า (สุทธิ)', `${money(s.net_value)} ฿`, `ตั้งต้น ${money(s.purchase_value)} บาท`)//, `หลังเคลม/รับคืน • ตั้งต้น ${money(s.purchase_value)} บาท`)
    ].join('');
  }

  function summaryCard(label, value, sub) {
    return `<article class="feed-order-summary-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(sub)}</small></article>`;
  }

  function filteredRows() {
    const base = displayRows();
    if (state.filter === 'cleared') return base.filter((r) => r.isCleared);
    if (state.filter === 'pending') return base.filter((r) => !r.isCleared);
    return base;
  }

  function renderList() {
    document.querySelectorAll('[data-feed-order-filter]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.feedOrderFilter === state.filter));
    const hiddenToggle = $('feedOrderHiddenToggle');
    if (hiddenToggle) {
      const hiddenCount = state.rows.filter((r) => r.isHidden).length;
      hiddenToggle.classList.toggle('is-active', state.showHidden);
      hiddenToggle.setAttribute('aria-pressed', state.showHidden ? 'true' : 'false');
      hiddenToggle.textContent = state.showHidden ? `ซ่อนล็อตที่ถูกซ่อน (${fmt(hiddenCount)})` : `แสดงล็อตที่ซ่อน (${fmt(hiddenCount)})`;
      hiddenToggle.hidden = hiddenCount <= 0;
    }
    const hint = $('feedOrderFilterHint');
    if (hint) {
      const count = filteredRows().length;
      hint.textContent = `${fmt(count)} รายการ`;
    }
    const target = $('feedOrderList');
    if (!target) return;
    const rows = filteredRows();
    if (!rows.length) {
      target.innerHTML = state.showHidden ? '<div class="feed-order-empty">ยังไม่มีรายการตามเงื่อนไขนี้</div>' : '<div class="feed-order-empty">ยังไม่มีรายการตามเงื่อนไขนี้ หากเป็นล็อตเก่าที่ไม่ใช้แล้ว อาจถูกซ่อนไว้</div>';
      return;
    }
    target.innerHTML = rows.map(renderLotCard).join('');
  }

  function renderLotCard(row) {
    const statusClass = row.isHidden ? 'is-hidden' : (row.isCleared ? 'is-cleared' : (row.paid > 0 ? 'is-partial' : 'is-unpaid'));
    const isExpanded = state.expandedLots.has(String(row.id));
    const allocationList = row.allocationDestinations.length
      ? row.allocationDestinations.map((a) => `<li><strong>${esc(a.text)}</strong></li>`).join('')
      : '<li><span>-</span><strong>ยังไม่ได้แบ่งเข้าเล้า</strong></li>';
    const paymentList = row.paymentRows.length
      ? row.paymentRows.map((p) => `<li><strong>${esc(p.payment_date || '-')} • ${money(p.amount)} บาท${p.payment_method ? ' • ' + esc(p.payment_method) : ''}</strong></li>`).join('')
      : '<li><span>-</span><strong>ยังไม่มีประวัติจ่ายเงิน</strong></li>';
    const claimChips = [
      row.returnedQty ? `<span>เคลม/คืน ${fmt(row.returnedQty, 2)} ลูก</span>` : '',
      row.replacementQty ? `<span>รับคืน ${fmt(row.replacementQty, 2)} ลูก</span>` : '',
      row.claimCount ? `<span>ประวัติเคลม ${fmt(row.claimCount)} รายการ</span>` : ''
    ].filter(Boolean).join('');

    const compactSummary = `
        <button type="button" class="feed-order-card-compact-summary" data-feed-action="toggle" data-id="${esc(row.id)}" aria-expanded="false" aria-label="ดูรายละเอียดล็อตอาหาร">
          <span class="feed-order-compact-metric">
            <small>จำนวนสุทธิ</small>
            <strong>${fmt(row.netQty, 2)} ลูก</strong>
          </span>
          <span class="feed-order-compact-metric">
            <small>มูลค่าสุทธิ</small>
            <strong>${money(row.netValue)}</strong>
          </span>
          <span class="feed-order-compact-metric ${row.outstanding > 0 ? 'is-danger' : 'is-good'}">
            <small>ค้างจ่าย</small>
            <strong>${money(row.outstanding)}</strong>
          </span>
          <span class="feed-order-show-more" aria-hidden="true">เพิ่ม ▼</span>
        </button>`;

    const expandedContent = `
        <div class="feed-order-expanded-toolbar">
          <button type="button" class="feed-order-show-less" data-feed-action="toggle" data-id="${esc(row.id)}" aria-expanded="true">
            ลด ▲
          </button>
        </div>

        <div class="feed-order-card-grid">
          ${metric('จำนวนซื้อเข้า', `${fmt(row.purchaseQty, 2)} ลูก`)}
          ${metric('จำนวนสุทธิ', `${fmt(row.netQty, 2)} ลูก`)}
          ${metric('แบ่งแล้ว', `${fmt(row.allocated, 2)} ลูก`)}
          ${metric('มูลค่าซื้อเข้า', money(row.purchaseValue))}
          ${metric('มูลค่าสุทธิ', money(row.netValue))}
          ${metric('ค้างจ่าย', money(row.outstanding), row.outstanding > 0 ? 'danger' : 'good')}
        </div>

        <div class="feed-order-card-notes feed-order-card-notes--stacked">
          <div>
            <span>แบ่งไป</span>
            <ul class="feed-order-mini-list">${allocationList}</ul>
          </div>
          <div>
            <span>การจ่ายเงิน</span>
            <ul class="feed-order-mini-list">${paymentList}</ul>
          </div>
        </div>

        ${claimChips ? `<div class="feed-order-chip-row">${claimChips}</div>` : ''}

        <div class="feed-order-actions">
          ${canWriteFeedOrder() ? `
            <button type="button" data-feed-action="allocate" data-id="${esc(row.id)}">แบ่งเข้าเล้า</button>
            <button type="button" data-feed-action="payment" data-id="${esc(row.id)}">จ่ายเงิน</button>
            <button type="button" data-feed-action="claim" data-id="${esc(row.id)}">เคลม/คืน</button>
            <button type="button" data-feed-action="visibility" data-id="${esc(row.id)}">${row.isHidden ? 'แสดงอีกครั้ง' : 'ซ่อน'}</button>
          ` : ''}
          <button type="button" class="feed-order-detail-btn" data-feed-action="detail" data-id="${esc(row.id)}">รายละเอียด</button>
        </div>`;

    return `
      <article class="feed-order-card ${isExpanded ? 'is-expanded' : 'is-collapsed'}" data-lot-id="${esc(row.id)}">
        <div class="feed-order-card__head">
          <div class="feed-order-title-wrap">
            <h3>${esc(row.title)}</h3>
            <div class="feed-order-card__meta">${esc([row.purchaseDate, row.supplier, row.creatorLabel ? 'ผู้บันทึก ' + row.creatorLabel : ''].filter(Boolean).join(' • ') || '-')}</div>
          </div>
          <span class="feed-order-status ${statusClass}">${esc(row.isHidden ? 'ซ่อนไว้' : row.statusLabel)}</span>
        </div>
        ${isExpanded ? expandedContent : compactSummary}
      </article>`;
  }

  function metric(label, value, tone = '') {
    return `<div class="feed-order-metric ${tone ? `is-${tone}` : ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }

  function onDocumentClick(event) {
    const filter = event.target.closest('[data-feed-order-filter]');
    if (filter) {
      state.filter = filter.dataset.feedOrderFilter || 'pending';
      renderList();
      return;
    }
    const action = event.target.closest('[data-feed-action]');
    if (!action) return;
    const lot = state.rows.find((r) => String(r.id) === String(action.dataset.id));
    if (!lot) return;
    const type = action.dataset.feedAction;
    if (['allocate', 'payment', 'claim', 'visibility'].includes(type) && !canWriteFeedOrder()) {
      alert('ไม่มีสิทธิ์แก้ไขบิลอาหารกลาง');
      return;
    }
    if (type === 'toggle') toggleCard(lot);
    else if (type === 'allocate') openAllocateSheet(lot);
    else if (type === 'payment') openPaymentSheet(lot);
    else if (type === 'claim') openClaimSheet(lot);
    else if (type === 'visibility') toggleLotVisibility(lot);
    else if (type === 'detail') openDetailSheet(lot);
  }

  function toggleCard(lot) {
    const id = String(lot.id || '');
    if (!id) return;
    if (state.expandedLots.has(id)) state.expandedLots.delete(id);
    else state.expandedLots.add(id);
    renderList();
  }

  async function toggleLotVisibility(lot) {
    const nextVisible = lot.isHidden ? 1 : 0;
    const message = nextVisible
      ? `ต้องการแสดงล็อต "${lot.title}" กลับมาในรายการใช่ไหม?`
      : `ต้องการซ่อนล็อต "${lot.title}" จากหน้ารายการใช่ไหม?`;
    if (!confirm(message)) return;
    const res = await FeedOrderService.setVisibility({
      purchase_lot_id: lot.id,
      lot_id: lot.id,
      is_visible: nextVisible
    });
    if (!res || res.status !== 'ok') {
      alert(res?.message || 'ปรับสถานะการแสดงผลไม่สำเร็จ');
      return;
    }
    if (nextVisible) state.showHidden = true;
    await load({ force: true });
  }

  function batchOptions() {
    return (state.batches || []).map((b) => {
      const id = b.id || b.batch_id || b.value || '';
      const label = b.name || b.batch_name || b.label || id;
      return `<option value="${esc(id)}">${esc(label)}</option>`;
    }).join('');
  }

  function openLotSheet() {
    if (!canWriteFeedOrder()) {
      alert('ไม่มีสิทธิ์เพิ่มล็อตอาหาร');
      return;
    }
    openSheet('เพิ่มล็อตอาหาร', `
      <form id="feedOrderLotForm" class="feed-order-form">
        <label>วันที่ซื้อ<input name="purchase_date" type="date" value="${today()}" required></label>
        <label>ชื่ออาหาร<input name="feed_name" type="text" placeholder="เช่น S9 A" required></label>
        <label>Supplier / ร้าน<input name="supplier_name" type="text" placeholder="ชื่อร้านหรือโรงงาน"></label>
        <div class="feed-order-form-grid">
          <label>จำนวนซื้อเข้า<input name="qty_total" type="number" min="0" step="0.01" required></label>
          <label>ราคาต่อหน่วย<input name="unit_price" type="number" min="0" step="0.01" required></label>
        </div>
        <label>หมายเหตุ<textarea name="remark" rows="3" placeholder="รายละเอียดเพิ่มเติม"></textarea></label>
        <div class="sheet-footer-row"><button type="button" class="btn secondary" data-sheet-close>ยกเลิก</button><button class="btn primary" type="submit">บันทึกล็อตอาหาร</button></div>
      </form>`, async (sheet) => {
        sheet.querySelector('#feedOrderLotForm')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          await submitForm(e.currentTarget, 'กำลังบันทึก...', async (payload) => FeedOrderService.saveLot(payload));
        });
      });
  }

  function openAllocateSheet(lot) {
    openSheet(`แบ่งเข้าเล้า • ${lot.title}`, `
      <form id="feedOrderAllocateForm" class="feed-order-form">
        <input name="purchase_lot_id" type="hidden" value="${esc(lot.id)}"><input name="lot_id" type="hidden" value="${esc(lot.id)}">
        <label>วันที่แบ่ง<input name="allocation_date" type="date" value="${today()}" required></label>
        <label>เลือก batch / เล้า<select name="batch_id" required data-allocation-target><option value="">เลือก batch</option>${batchOptions()}<option value="outside">เล้านอกระบบ / ไม่ใช้ Ducky</option></select></label>
        <div class="feed-order-form-grid">
          <label>จำนวนที่แบ่ง<input name="qty_allocated" type="number" min="0" step="0.01" max="${esc(lot.netQty)}" required></label>
          <label>ราคาต่อหน่วย<input name="unit_price" type="number" min="0" step="0.01" value="${esc(lot.unitPrice)}"></label>
        </div>
        <label>ชื่อ lot ที่จะเข้า batch<input name="feed_name" type="text" value="${esc(lot.title)}"></label>
        <label>ชื่อเล้า/ปลายทางภายนอก<input name="external_name" type="text" placeholder="กรอกเมื่อเลือกเล้านอกระบบ"></label>
        <label class="check-line"><input name="create_feed_lot" type="checkbox" value="1" checked><span>สร้าง lot ใน Ducky สำหรับ batch ที่เลือก</span></label>
        <label>หมายเหตุ<textarea name="remark" rows="3" placeholder="เช่น แบ่งจากบิลอาหารกลาง"></textarea></label>
        <div class="sheet-footer-row"><button type="button" class="btn secondary" data-sheet-close>ยกเลิก</button><button class="btn primary" type="submit">บันทึกการแบ่ง</button></div>
      </form>`, async (sheet) => {
        const select = sheet.querySelector('[data-allocation-target]');
        const externalName = sheet.querySelector('input[name="external_name"]');
        const createLot = sheet.querySelector('input[name="create_feed_lot"]');
        const syncDestination = () => {
          const isOutside = select?.value === 'outside';
          if (externalName) externalName.required = !!isOutside;
          if (createLot) {
            createLot.disabled = !!isOutside;
            if (isOutside) createLot.checked = false;
          }
        };
        select?.addEventListener('change', syncDestination);
        syncDestination();

        sheet.querySelector('#feedOrderAllocateForm')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          await submitForm(e.currentTarget, 'กำลังบันทึก...', async (payload) => FeedOrderService.allocate(payload));
        });
      });
  }

  function openPaymentSheet(lot) {
    openSheet(`จ่ายเงิน • ${lot.title}`, `
      <form id="feedOrderPaymentForm" class="feed-order-form">
        <input name="purchase_lot_id" type="hidden" value="${esc(lot.id)}"><input name="lot_id" type="hidden" value="${esc(lot.id)}">
        <label>วันที่จ่าย<input name="payment_date" type="date" value="${today()}" required></label>
        <label>จำนวนเงิน<input name="amount" type="number" min="0" step="0.01" max="${esc(lot.outstanding || lot.netValue)}" required></label>
        <label>วิธีจ่าย<input name="payment_method" type="text" placeholder="เงินสด / โอน / เครดิต"></label>
        <label>หมายเหตุ<textarea name="remark" rows="3"></textarea></label>
        <div class="sheet-footer-row"><button type="button" class="btn secondary" data-sheet-close>ยกเลิก</button><button class="btn primary" type="submit">บันทึกจ่ายเงิน</button></div>
      </form>`, async (sheet) => {
        sheet.querySelector('#feedOrderPaymentForm')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          await submitForm(e.currentTarget, 'กำลังบันทึก...', async (payload) => FeedOrderService.savePayment(payload));
        });
      });
  }

  function openClaimSheet(lot) {
    openSheet(`เคลม/คืน • ${lot.title}`, `
      <form id="feedOrderClaimForm" class="feed-order-form">
        <input name="purchase_lot_id" type="hidden" value="${esc(lot.id)}"><input name="lot_id" type="hidden" value="${esc(lot.id)}">
        <label>วันที่เคลม<input name="claim_date" type="date" value="${today()}" required></label>
        <div class="feed-order-form-grid">
          <label>จำนวนส่งคืน<input name="return_qty" type="number" min="0" step="0.01" required></label>
          <label>จำนวนรับกลับ<input name="replacement_qty" type="number" min="0" step="0.01"></label>
        </div>
        <label>ชื่ออาหารที่รับกลับ<input name="replacement_feed_name" type="text" value="${esc(lot.title)}"></label>
        <label>ราคาอาหารที่รับกลับ<input name="replacement_unit_price" type="number" min="0" step="0.01" value="${esc(lot.unitPrice)}"></label>
        <label>สาเหตุ / หมายเหตุ<textarea name="remark" rows="3" placeholder="เช่น อาหารมีกลิ่น / เปียก / คุณภาพไม่ดี"></textarea></label>
        <div class="sheet-footer-row"><button type="button" class="btn secondary" data-sheet-close>ยกเลิก</button><button class="btn primary" type="submit">บันทึกเคลม/คืน</button></div>
      </form>`, async (sheet) => {
        sheet.querySelector('#feedOrderClaimForm')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          await submitForm(e.currentTarget, 'กำลังบันทึก...', async (payload) => FeedOrderService.saveClaim(payload));
        });
      });
  }

  function openDetailSheet(lot) {
    const allocationText = lot.allocationDestinations.length
      ? lot.allocationDestinations.map((a, idx) => `${idx + 1}. ${a.text}`).join('\\n')
      : 'ยังไม่ได้แบ่งเข้าเล้า';
    const paymentText = lot.paymentRows.length
      ? lot.paymentRows.map((p, idx) => `${idx + 1}. ${p.payment_date || '-'} • ${money(p.amount)} บาท${p.payment_method ? ' • ' + p.payment_method : ''}`).join('\\n')
      : '-';
    openSheet(`รายละเอียด • ${lot.title}`, `
      <div class="feed-order-detail-list">
        ${detailRow('วันที่ซื้อ', lot.purchaseDate || '-')}
        ${detailRow('Supplier', lot.supplier || '-')}
        ${detailRow('สถานะการแสดงผล', lot.isHidden ? 'ซ่อนไว้' : 'แสดงอยู่')}
        ${detailRow('จำนวนซื้อเข้า', `${fmt(lot.purchaseQty, 2)} ลูก`)}
        ${detailRow('จำนวนสุทธิ', `${fmt(lot.netQty, 2)} ลูก`)}
        ${detailRow('จำนวนแบ่งแล้ว', `${fmt(lot.allocated, 2)} ลูก`)}
        ${detailRow('แบ่งไป', allocationText)}
        ${detailRow('มูลค่าซื้อเข้า', `${money(lot.purchaseValue)} บาท`)}
        ${detailRow('มูลค่าสุทธิ', `${money(lot.netValue)} บาท`)}
        ${detailRow('จ่ายไปแล้ว', `${money(lot.paid)} บาท`)}
        ${detailRow('การจ่ายเงิน', paymentText)}
        ${detailRow('ค้างจ่าย', `${money(lot.outstanding)} บาท`)}
        ${detailRow('เคลม/คืน', lot.claimCount ? `${fmt(lot.claimCount)} รายการ • คืน ${fmt(lot.returnedQty, 2)} ลูก • รับคืน ${fmt(lot.replacementQty, 2)} ลูก` : '-')}
      </div>`);
  }

  function detailRow(label, value) {
    return `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }

  async function submitForm(form, loadingText, callback) {
    const btn = form.querySelector('button[type="submit"]');
    const oldText = btn?.textContent || '';
    const payload = formToObject(form);
    await withButton(btn, loadingText, async () => {
      const res = await callback(payload);
      if (!res || res.status !== 'ok') {
        alert(res?.message || 'บันทึกไม่สำเร็จ');
        return;
      }
      closeSheet();
      await load({ force: true });
    }, oldText);
  }

  function formToObject(form) {
    const out = {};
    new FormData(form).forEach((value, key) => { out[key] = value; });
    form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      out[input.name] = input.checked ? 1 : 0;
    });
    ['qty_total', 'unit_price', 'grand_total', 'qty_allocated', 'amount', 'return_qty', 'replacement_qty', 'replacement_unit_price', 'replacement_value'].forEach((key) => {
      if (out[key] != null && out[key] !== '') out[key] = Number(out[key]);
    });

    if (out.feed_order_id && !out.purchase_lot_id) out.purchase_lot_id = out.feed_order_id;
    if (out.purchase_lot_id && !out.lot_id) out.lot_id = out.purchase_lot_id;
    if (out.lot_id && !out.purchase_lot_id) out.purchase_lot_id = out.lot_id;
    delete out.feed_order_id;

    if (out.batch_id === 'outside') {
      out.destination_type = 'external';
      out.batch_id = '';
      out.create_feed_lot = 0;
    } else if (out.batch_id) {
      out.destination_type = 'batch';
    }
    return out;
  }

  async function withButton(button, loadingText, task, restoreText) {
    if (!button) return task();
    const oldText = restoreText || button.textContent;
    button.disabled = true;
    button.textContent = loadingText || oldText;
    try { return await task(); }
    finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function openSheet(title, body, onReady) {
    closeSheet(true);
    const wrap = document.createElement('div');
    wrap.id = 'feedOrderDynamicSheet';
    wrap.className = 'sheet-root feed-order-sheet-root';
    wrap.innerHTML = `
      <div class="sheet-backdrop" data-sheet-close></div>
      <section class="sheet-panel feed-order-sheet-panel">
        <header class="sheet-header"><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-sheet-close>×</button></header>
        <div class="sheet-body">${body}</div>
      </section>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (event) => {
      if (event.target.closest('[data-sheet-close]')) closeSheet();
    });
    requestAnimationFrame(() => wrap.classList.add('show'));
    if (onReady) onReady(wrap);
  }

  function closeSheet(immediate = false) {
    const sheet = $('feedOrderDynamicSheet');
    if (!sheet) return;
    sheet.classList.remove('show');
    if (immediate) sheet.remove();
    else setTimeout(() => sheet.remove(), 180);
  }


  function getProgramMenuPermission(menuKey) {
    if (typeof window.AppAuth?.isAdminSession === 'function' && AppAuth.isAdminSession()) return 'write';
    const role = String(window.AppAuth?.getSession?.('role') || '').trim().toLowerCase();
    const admin = String(window.AppAuth?.getSession?.('is_admin') ?? '').trim().toLowerCase();
    if (role === 'admin' || role === 'system_admin' || admin === 'true' || admin === '1' || admin === 'yes') return 'write';
    return window.MenuPermissionApi?.permissionOf?.(menuKey) || 'none';
  }

  function canViewFeedOrder() {
    return state.permission === 'view' || state.permission === 'write' || getProgramMenuPermission('feed_order_bills') === 'write' || getProgramMenuPermission('feed_order_bills') === 'view';
  }

  function canWriteFeedOrder() {
    return state.permission === 'write' || getProgramMenuPermission('feed_order_bills') === 'write';
  }

  function applyPermissionUI() {
    const writable = canWriteFeedOrder();
    const openBtn = $('openLotBtn');
    const fab = $('feedOrderFab');
    if (openBtn) openBtn.hidden = !writable;
    if (fab) fab.hidden = !writable;
  }

  function renderAccessDenied(message) {
    setSubtitle(message || 'ไม่มีสิทธิ์เข้าถึงเมนูนี้');
    const summary = $('feedOrderSummary');
    const list = $('feedOrderList');
    if (summary) summary.innerHTML = '';
    if (list) list.innerHTML = `<div class="feed-order-empty">${esc(message || 'ไม่มีสิทธิ์เข้าถึงเมนูนี้')}</div>`;
    const openBtn = $('openLotBtn');
    const fab = $('feedOrderFab');
    if (openBtn) openBtn.hidden = true;
    if (fab) fab.hidden = true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body?.dataset?.page === 'feed_order_bills') bootstrap();
  });

  return { bootstrap, load };
})();
