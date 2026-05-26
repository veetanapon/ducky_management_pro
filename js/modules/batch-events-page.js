window.BatchEventsPage = (() => {
  const state = {
    batchId: '',
    batch: null,
    permission: 'none',
    batchPermission: 'read',
    isOwner: false,
    isAdmin: false,
    events: [],
    consumption: [],
    medicalItems: [],
    summary: {},
    modulePermissions: {},
    currentAction: '',
    editingEvent: null
  };
  let bootstrapped = false;

  const ACTIONS = [
    { key: 'medical_in', eventType: 'medical_in', label: 'ซื้อยา/วิตามิน', icon: '📦', title: 'ซื้อยา/วิตามินเข้าคลัง' },
    { key: 'injection', eventType: 'injection', label: 'ฉีดยา', icon: '💉', title: 'บันทึกการฉีดยา' },
    { key: 'rain', eventType: 'rain', label: 'ฝนตก', icon: '🌧', title: 'บันทึกฝนตก' },
    { key: 'duck_cull', eventType: 'duck_cull', label: 'แตะตูด', icon: '🦆', title: 'แตะตูด / คัดเป็ดไม่ไข่' },
    { key: 'vitamin', eventType: 'vitamin', label: 'วิตามิน', icon: '✨', title: 'บันทึกการให้วิตามิน' },
    { key: 'medicine', eventType: 'medicine', label: 'ให้ยา', icon: '💊', title: 'บันทึกการให้ยา' },
    { key: 'feed_swap', eventType: 'feed_swap', label: 'เคลมอาหาร', icon: '🔁', title: 'บันทึกการเคลมอาหาร' },
    { key: 'other', eventType: 'other', label: 'อื่น ๆ', icon: '•', title: 'บันทึกกิจกรรมอื่น ๆ' }
  ];

  async function bootstrap() {
    if (bootstrapped) return;
    bootstrapped = true;
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    state.batchId = new URLSearchParams(location.search).get('bid') || '';
    bind();
    if (!state.batchId) {
      setText('eventSubtitle', 'ไม่พบ batch id');
      return;
    }
    renderSkeleton();
    await load();
  }

  function bind() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);
    document.getElementById('eventSheetCloseBtn')?.addEventListener('click', closeEventSheet);
    document.getElementById('eventSheetBackdrop')?.addEventListener('click', closeEventSheet);
    document.getElementById('eventSheetCancelBtn')?.addEventListener('click', closeEventSheet);
    document.getElementById('batchEventForm')?.addEventListener('submit', saveEvent);
    document.getElementById('eventTimeline')?.addEventListener('click', onTimelineClick);
    document.getElementById('eventStartDate')?.addEventListener('change', syncEndDateIfEmpty);
    document.getElementById('eventDynamicFields')?.addEventListener('click', onEventDynamicFieldsClick);
    document.getElementById('eventDynamicFields')?.addEventListener('change', onEventDynamicFieldsChange);
    document.addEventListener('click', onOutsideFabClick, { capture: true });
  }

  async function load() {
    setText('eventSubtitle', 'กำลังโหลดข้อมูล...');
    const cacheKey = `ducky:farm-events:${state.batchId}`;
    const cached = readCache(cacheKey);
    if (cached) hydrateAndRender(cached);

    const res = await AppApi.post({ action: 'getBatchEventsPageData', batch_id: state.batchId });
    if (!res || res.status !== 'ok') {
      if (!cached) {
        setText('eventSubtitle', res?.message || 'โหลดข้อมูลไม่สำเร็จ');
        document.getElementById('eventTimeline').innerHTML = `<div class="empty-state">${escapeHtml(res?.message || 'โหลดข้อมูลไม่สำเร็จ')}</div>`;
      }
      return;
    }
    writeCache(cacheKey, res);
    hydrateAndRender(res);
  }

  function hydrateAndRender(res) {
    state.batch = res.batch || null;
    state.permission = res.permission || 'none';
    state.batchPermission = res.batch_permission || res.permission || 'read';
    state.isOwner = !!res.is_owner;
    state.isAdmin = !!res.is_admin;
    state.events = Array.isArray(res.events) ? res.events : [];
    state.consumption = Array.isArray(res.consumption_logs) ? res.consumption_logs : [];
    state.medicalItems = Array.isArray(res.medical_items) ? res.medical_items : [];
    state.summary = res.summary || {};
    state.modulePermissions = res.module_permissions || { farm_events: state.permission };
    render();
  }

  function render() {
    setText('eventTitle', 'กิจกรรม');
    setText('eventSubtitle', `${state.batch?.name || state.batchId} • ${state.batch?.specie === 'fish' ? 'ปลา' : 'เป็ด'}`);

    const badge = document.getElementById('eventPermissionBadge');
    if (badge) {
      badge.className = `badge-inline ${state.permission === 'write' ? 'success' : 'muted-badge'}`;
      badge.textContent = state.permission === 'write' ? 'ดูและแก้ไข' : 'ดู';
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
    renderTimeline();
    renderFab();
  }

  function renderSkeleton() {
    document.getElementById('eventSummaryCards').innerHTML = [1, 2, 3, 4].map(() => '<div class="event-summary-card skeleton-card-lite"></div>').join('');
    document.getElementById('eventTimeline').innerHTML = '<div class="empty-state">กำลังโหลด...</div>';
  }

  function renderSummary() {
    const target = document.getElementById('eventSummaryCards');
    if (!target) return;
    const eventCount = Number(state.summary.event_count || state.events.length || 0);
    const eventCost = Number(state.summary.event_expense || 0);
    const cullCount = state.events.filter((e) => normalizeEventType(e.event_type) === 'duck_cull').reduce((s, e) => s + Number(e.cull_qty || e.extra?.cull_qty || 0), 0);
    const injectionCount = state.events.filter((e) => normalizeEventType(e.event_type) === 'injection').length;
    const stockCount = state.medicalItems.filter((item) => Number(item.current_qty || 0) > 0).length;
    const cards = [
      ['กิจกรรม', `${fmt(eventCount)} รายการ`, 'เหตุการณ์ทั้งหมดของ batch นี้'],
      ['ค่าใช้จ่าย', `${fmt(eventCost)} ฿`, 'รวมค่าแรง/ค่าใช้จ่ายที่ระบุ'],
      ['ฉีดยา', `${fmt(injectionCount)} ครั้ง`, 'ใช้เทียบผลกับไข่และการกิน'],
      ['คลังยา', `${fmt(stockCount)} รายการ`, `คัดออก ${fmt(cullCount)} ตัว`]
    ];
    target.innerHTML = cards.map(([label, value, note]) => `
      <div class="event-summary-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(note)}</small>
      </div>
    `).join('');
  }

  function renderTimeline() {
    const target = document.getElementById('eventTimeline');
    if (!target) return;
    setText('eventCountBadge', `${state.events.length} รายการ`);
    if (!state.events.length) {
      target.innerHTML = '<div class="empty-state">ยังไม่มีการบันทึกกิจกรรม ใช้ปุ่ม + เพื่อเพิ่มกิจกรรม</div>';
      return;
    }

    const sorted = state.events.slice().sort((a, b) => String(b.log_date).localeCompare(String(a.log_date)));
    target.innerHTML = sorted.map((ev, index) => {
      const type = normalizeEventType(ev.event_type);
      const title = ev.event_title || typeLabel(type, ev.event_subtype);
      const cost = Number(ev.expense_total || 0);
      const extra = ev.extra || {};
      const range = extra.range_days > 1 ? `วันที่ ${extra.range_index}/${extra.range_days}` : '';
      const metaItems = [typeLabel(type, ev.event_subtype), range, severityLabel(ev.severity), cost ? `${fmt(cost)} ฿` : '', extra.ref_bill_id || ev.ref_bill_id ? 'สร้างบิลแล้ว' : ''].filter(Boolean);
      const detail = ev.detail || extra.detail || '';
      return `
        <article class="event-timeline-item event-timeline-item--${escapeAttr(type)}" data-event-id="${escapeAttr(ev.id)}">
          <div class="event-timeline-rail" aria-hidden="true">
            <span class="event-timeline-line"></span>
            ${eventIconHtml(type, ev.event_subtype, ev.severity, "event-timeline-bubble event-row-icon--" + type)}
          </div>
          <div class="event-timeline-content">
            <div class="event-date-pill"><span>📅</span>${escapeHtml(formatDateLong(ev.log_date))}</div>
            <div class="event-card event-card--${escapeAttr(type)}">
              <div class="event-card-head">
                <strong>${escapeHtml(title)}</strong>
                <span class="event-card-actions">
                  ${state.permission === 'write' ? `<button type="button" class="event-edit-link" data-event-edit="${escapeAttr(ev.id)}">แก้ไข</button>` : ''}
                  ${cost ? `<span class="event-cost-pill">${escapeHtml(fmt(cost))} ฿</span>` : '<span class="event-type-pill">Event</span>'}
                </span>
              </div>
              <div class="event-card-meta">${escapeHtml(metaItems.join(' • '))}</div>
              ${detail ? `<p class="event-card-detail">${escapeHtml(detail)}</p>` : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderFab() {
    const root = document.getElementById('eventFabRoot');
    if (!root) return;
    if (state.permission !== 'write') {
      root.innerHTML = '';
      return;
    }
    root.innerHTML = `
      <div class="module-fab event-fab" id="eventFab">
        <div class="module-fab-actions">
          ${ACTIONS.map((a) => `<button type="button" class="module-fab-action" data-event-action="${a.key}"><span>${a.icon}</span>${escapeHtml(a.label)}</button>`).join('')}
        </div>
        <button class="fab module-fab-main" id="eventFabMain" type="button" aria-label="กิจกรรม">＋</button>
      </div>`;
    document.getElementById('eventFabMain')?.addEventListener('click', (event) => {
      event.stopPropagation();
      document.getElementById('eventFab')?.classList.toggle('open');
    });
    root.querySelectorAll('[data-event-action]').forEach((btn) => btn.addEventListener('click', () => {
      document.getElementById('eventFab')?.classList.remove('open');
      openEventSheet(btn.dataset.eventAction);
    }));
  }

  function onOutsideFabClick(event) {
    const fab = document.getElementById('eventFab');
    if (!fab || !fab.classList.contains('open')) return;
    if (!fab.contains(event.target)) fab.classList.remove('open');
  }

  function openEventSheet(actionKey, editEvent) {
    const action = ACTIONS.find((a) => a.key === actionKey) || ACTIONS[ACTIONS.length - 1];
    state.currentAction = action.key;
    state.editingEvent = editEvent || null;
    document.getElementById('batchEventForm')?.reset();
    valSet('eventActionType', action.key);
    valSet('eventEventType', action.eventType);
    valSet('eventStartDate', todayString());
    valSet('eventEndDate', todayString());
    const dateGrid = document.querySelector('.event-date-range-grid');
    const distribute = document.getElementById('eventDistributeWrap');
    if (dateGrid) dateGrid.classList.toggle('hidden', action.key === 'medical_in');
    if (distribute) distribute.classList.toggle('hidden', action.key === 'medical_in' || action.key === 'duck_cull');
    setText('eventSheetTitle', editEvent ? 'แก้ไขกิจกรรม' : action.title);
    setText('eventSubmitBtn', editEvent ? 'บันทึกการแก้ไข' : (action.key === 'duck_cull' ? 'บันทึกและสร้างบิล' : (action.key === 'medical_in' ? 'บันทึกเข้าคลัง' : 'บันทึกกิจกรรม')));
    const target = document.getElementById('eventDynamicFields');
    if (target) target.innerHTML = `${editEvent ? renderEditTools(editEvent) : ''}${renderDynamicFields(action.key)}`;
    if (editEvent) populateEventForm(editEvent, action.key);
    showSheet(document.getElementById('eventSheet'));
  }

  function renderEditTools(editEvent) {
    const extra = eventExtra(editEvent);
    const rangeDays = Number(extra.range_days || 0);
    const hasSeries = rangeDays > 1 && extra.range_start && extra.range_end;
    return `
      <div class="event-edit-tools" data-edit-event-tools>
        <div class="event-edit-tools__head">
          <strong>กำลังแก้ไขกิจกรรม</strong>
          <span>${escapeHtml(formatDateShort(editEvent.log_date))}</span>
        </div>
        ${hasSeries ? `
          <label class="event-series-toggle">
            <input id="eventApplySeries" type="checkbox"
              data-series-start="${escapeAttr(extra.range_start)}"
              data-series-end="${escapeAttr(extra.range_end)}"
              data-single-date="${escapeAttr(normalizeDateValue(editEvent.log_date))}" />
            <span>แก้ไขทั้ง series นี้ (${escapeHtml(String(rangeDays))} วัน)</span>
          </label>
          <div class="inline-note event-series-note">ถ้าไม่เลือก ระบบจะแก้เฉพาะวันที่ ${escapeHtml(formatDateShort(editEvent.log_date))}</div>
        ` : `<div class="inline-note event-series-note">รายการนี้ไม่ใช่ series จะแก้เฉพาะรายการนี้</div>`}
        <button type="button" class="event-delete-btn" id="eventDeleteBtn">ยกเลิกกิจกรรมนี้</button>
      </div>
    `;
  }

  function renderMedicalSelect(typeFilter) {
    const types = Array.isArray(typeFilter) ? typeFilter : [typeFilter].filter(Boolean);
    const items = state.medicalItems.filter((item) => !types.length || types.includes(normalizeMedicalType(item.item_type)));
    if (!items.length) return '<div class="inline-note">ยังไม่มีของในคลัง สามารถกรอกค่าใช้จ่ายเอง หรือใช้ action ซื้อยา/วิตามินเข้าคลังก่อน</div>';
    return `
      <label class="field-label">ใช้จากคลังยา/วิตามิน (ถ้ามี)</label>
      <select id="medicalItemId">
        <option value="">ไม่ใช้คลัง / กรอกต้นทุนเอง</option>
        ${items.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)} • เหลือ ${fmt(item.current_qty)} ${escapeHtml(item.unit || '')} • ${fmt(item.unit_price)}฿/${escapeHtml(item.unit || 'หน่วย')}</option>`).join('')}
      </select>
      <label class="field-label">จำนวนที่ใช้จากคลัง</label>
      <input id="medicalItemQty" type="number" min="0" step="0.01" placeholder="เช่น 0.25" />
    `;
  }

  function renderDynamicFields(actionKey) {
    if (actionKey === 'medical_in') return `
      <label class="field-label">ประเภท</label>
      <select id="medicalItemType"><option value="medicine">ยา</option><option value="vitamin">วิตามิน</option><option value="vaccine">วัคซีน</option><option value="other">อื่น ๆ</option></select>
      <label class="field-label">ชื่อยา/วิตามิน</label>
      <input id="medicalItemName" type="text" placeholder="เช่น ยาเพร็ก / วิตามินรวม" required />
      <div class="sheet-field-grid sheet-field-grid--2 event-cost-grid">
        <div><label class="field-label">จำนวนซื้อเข้า</label><input id="medicalInQty" type="number" min="0" step="0.01" required /></div>
        <div><label class="field-label">หน่วย</label><input id="medicalUnit" type="text" placeholder="ขวด / ซอง / ถุง" value="ขวด" /></div>
      </div>
      <label class="field-label">ราคาต่อหน่วย</label>
      <input id="medicalUnitPrice" type="number" min="0" step="0.01" placeholder="0" />
      <label class="field-label">หมายเหตุ</label>
      <textarea id="eventDetail" rows="3" placeholder="เช่น ซื้อเข้าคลังไว้ใช้หลายครั้ง"></textarea>
    `;
    if (actionKey === 'injection') return `
      <label class="field-label">ประเภท/ชื่อยา</label>
      <select id="injectionSubtype"><option value="preg">เพร็ก</option><option value="bird_flu">หวัดนก</option><option value="other">ยาอื่น ๆ</option></select>
      <input id="medicineName" type="text" placeholder="ชื่อยา / รุ่นยา (ถ้ามี)" />
      ${renderMedicalSelect(['medicine', 'vaccine', 'other'])}
      <div class="sheet-field-grid sheet-field-grid--2 event-cost-grid">
        <div><label class="field-label">ค่ายาเอง (ถ้าไม่ใช้คลัง)</label><input id="medicineCost" type="number" min="0" step="0.01" placeholder="0" /></div>
        <div><label class="field-label">ค่าจ้างคน</label><input id="laborCost" type="number" min="0" step="0.01" placeholder="0" /></div>
      </div>
      <label class="field-label">จำนวนเป็ดที่ฉีด</label>
      <input id="birdCount" type="number" min="0" step="1" placeholder="optional" />
      <label class="field-label">รายละเอียด</label>
      <textarea id="eventDetail" rows="3" placeholder="รายละเอียดเพิ่มเติม"></textarea>
    `;
    if (actionKey === 'rain') return `
      <label class="field-label">ระดับฝน</label>
      <select id="rainLevel"><option value="light">เบา</option><option value="heavy">แรง</option></select>
      <label class="field-label">รายละเอียด / ผลกระทบ</label>
      <textarea id="eventDetail" rows="4" placeholder="เช่น ฝนตกแรง พื้นเปียก เป็ดกินลดลง"></textarea>
    `;
    if (actionKey === 'duck_cull') return `
      <div class="inline-note">แตะตูด/คัดเป็ดบันทึกได้ครั้งละ 1 วัน ระบบจะสร้าง event + ลดจำนวนเป็ด + สร้างบิลขายเป็ดให้</div>
      <div class="sheet-field-grid sheet-field-grid--2 event-cost-grid">
        <div><label class="field-label">จำนวนเป็ดที่คัดออก</label><input id="cullQty" type="number" min="1" step="1" required /></div>
        <div><label class="field-label">ราคาขาย/ตัว</label><input id="cullUnitPrice" type="number" min="0" step="0.01" required /></div>
      </div>
      <label class="field-label">ผู้ซื้อ</label><input id="cullBuyer" type="text" placeholder="ชื่อผู้ซื้อ (optional)" />
      <label class="field-label">ค่าจ้างคนคัดเป็ด</label><input id="laborCost" type="number" min="0" step="0.01" placeholder="0" />
      <label class="field-label">รายละเอียด</label><textarea id="eventDetail" rows="3" placeholder="เช่น คัดเป็ดไม่ไข่ออก"></textarea>
    `;
    if (actionKey === 'vitamin') return `
      <label class="field-label">ชื่อวิตามิน</label><input id="itemName" type="text" placeholder="เช่น วิตามินรวม" required />
      ${renderMedicalSelect(['vitamin', 'other'])}
      <label class="field-label">ค่าใช้จ่ายเอง (ถ้าไม่ใช้คลัง)</label><input id="vitaminCost" type="number" min="0" step="0.01" placeholder="0" />
      <label class="field-label">รายละเอียด</label><textarea id="eventDetail" rows="3" placeholder="เช่น ผสมน้ำ 2 วัน"></textarea>
    `;
    if (actionKey === 'medicine') return `
      <label class="field-label">ชื่อยา</label><input id="itemName" type="text" placeholder="ชื่อยา" required />
      ${renderMedicalSelect(['medicine', 'vaccine', 'other'])}
      <label class="field-label">วิธีให้</label><select id="medicineMethod"><option value="water">ผสมน้ำ</option><option value="feed">ผสมอาหาร</option><option value="other">อื่น ๆ</option></select>
      <label class="field-label">ค่าใช้จ่ายเอง (ถ้าไม่ใช้คลัง)</label><input id="medicineCost" type="number" min="0" step="0.01" placeholder="0" />
      <label class="field-label">รายละเอียด</label><textarea id="eventDetail" rows="3" placeholder="เช่น ให้ต่อเนื่อง 3 วัน"></textarea>
    `;
    if (actionKey === 'feed_swap') return `
      <div class="inline-note">บันทึกเป็นเหตุการณ์เคลมอาหารเท่านั้น ไม่หัก/เพิ่ม stock อาหารอัตโนมัติ</div>
      <label class="field-label">อาหาร/ล็อตที่มีปัญหา</label><input id="oldFeedName" type="text" placeholder="ชื่ออาหาร/ล็อตที่มีปัญหา" />
      <label class="field-label">อาหารที่ได้เปลี่ยนกลับ / อาหารใหม่</label><input id="newFeedName" type="text" placeholder="ชื่ออาหารที่ได้เปลี่ยนกลับ / อาหารใหม่" />
      <label class="field-label">สาเหตุ</label><textarea id="eventDetail" rows="3" placeholder="เช่น อาหาร lot เดิมมีปัญหา ต้องส่งคืน/เคลมกับโรงงาน"></textarea>
    `;
    return `
      <label class="field-label">หัวข้อ</label><input id="otherTitle" type="text" placeholder="หัวข้อกิจกรรม" required />
      <label class="field-label">ค่าใช้จ่าย (ถ้ามี)</label><input id="otherCost" type="number" min="0" step="0.01" placeholder="0" />
      <label class="field-label">รายละเอียด</label><textarea id="eventDetail" rows="4" placeholder="รายละเอียดเพิ่มเติม"></textarea>
    `;
  }

  async function saveEvent(ev) {
    ev.preventDefault();
    if (state.permission !== 'write') return alert('ไม่มีสิทธิ์บันทึก');
    const btn = document.getElementById('eventSubmitBtn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    const payload = buildPayload();
    const res = await AppApi.post(payload);
    btn.disabled = false;
    btn.textContent = original;
    if (!res || res.status !== 'ok') return alert(res?.message || 'บันทึกไม่สำเร็จ');
    closeEventSheet();
    removeCache(`ducky:farm-events:${state.batchId}`);
    await load();
    if (payload.event_type === 'duck_cull' && res.ref_bill_id) alert(`บันทึกแตะตูดและสร้างบิลแล้ว\nเลขบิล: ${res.ref_bill_id}`);
    else if (payload.action === 'saveBatchEvent' && Number(res.days || 1) > 1) alert(`บันทึกกิจกรรม ${res.days} วันแล้ว`);
  }

  function buildPayload() {
    const action = state.currentAction || val('eventActionType') || 'other';
    if (action === 'medical_in') {
      return {
        action: 'saveMedicalInventoryLog',
        batch_id: state.batchId,
        log_date: val('eventStartDate') || todayString(),
        trans_type: 'in',
        item_type: val('medicalItemType') || 'medicine',
        item_name: val('medicalItemName'),
        unit: val('medicalUnit') || 'หน่วย',
        qty: num('medicalInQty'),
        unit_price: num('medicalUnitPrice'),
        remark: val('eventDetail')
      };
    }

    const start = val('eventStartDate') || todayString();
    const end = val('eventEndDate') || start;
    const base = {
      action: 'saveBatchEvent',
      batch_id: state.batchId,
      log_date: start,
      start_date: start,
      end_date: action === 'duck_cull' ? start : end,
      distribute_cost: document.getElementById('eventDistributeCost')?.checked !== false,
      event_type: val('eventEventType') || action,
      event_subtype: '',
      event_title: '',
      severity: 'normal',
      detail: val('eventDetail'),
      expenses: [],
      extra: {}
    };
    if (state.editingEvent?.id) {
      base.id = state.editingEvent.id;
      base.event_id = state.editingEvent.id;
      base.update_scope = document.getElementById('eventApplySeries')?.checked ? 'series' : 'single';
      if (base.update_scope !== 'series') {
        base.start_date = normalizeDateValue(state.editingEvent.log_date || start);
        base.log_date = base.start_date;
        base.end_date = base.start_date;
      }
    }
    const pushExpense = (type, name, amount) => {
      const total = Number(amount || 0);
      if (total > 0) base.expenses.push({ expense_type: type, item_name: name, qty: 1, unit_price: total, total_price: total });
    };
    const medicalId = val('medicalItemId');
    const medicalQty = num('medicalItemQty');
    if (medicalId && medicalQty > 0) {
      base.medical_item_id = medicalId;
      base.medical_item_qty = medicalQty;
    }

    if (action === 'injection') {
      const subtype = val('injectionSubtype') || 'other';
      const medName = val('medicineName') || selectedMedicalName() || injectionSubtypeLabel(subtype);
      base.event_subtype = subtype;
      base.event_title = `ฉีดยา${medName ? ' • ' + medName : ''}`;
      base.extra = { medicine_name: medName, bird_count: num('birdCount') };
      if (!medicalId) pushExpense('medicine', medName || 'ค่ายา', num('medicineCost'));
      pushExpense('labor', 'ค่าจ้างคนฉีด', num('laborCost'));
    } else if (action === 'rain') {
      const level = val('rainLevel') || 'light';
      base.event_subtype = level;
      base.severity = level === 'heavy' ? 'high' : 'medium';
      base.event_title = level === 'heavy' ? 'ฝนตกแรง' : 'ฝนตกเบา';
      base.extra = { rain_level: level };
    } else if (action === 'duck_cull') {
      const qty = num('cullQty');
      const unitPrice = num('cullUnitPrice');
      base.event_title = 'แตะตูด / คัดเป็ดไม่ไข่';
      base.detail = val('eventDetail') || `คัดเป็ดออก ${qty} ตัว`;
      base.cull_qty = qty;
      base.cull_unit_price = unitPrice;
      base.buyer = val('cullBuyer');
      base.extra = { cull_qty: qty, cull_unit_price: unitPrice, buyer: val('cullBuyer') };
      pushExpense('labor', 'ค่าจ้างคนคัดเป็ด', num('laborCost'));
    } else if (action === 'vitamin') {
      const name = val('itemName') || selectedMedicalName();
      base.event_title = `ให้วิตามิน${name ? ' • ' + name : ''}`;
      base.extra = { item_name: name };
      if (!medicalId) pushExpense('vitamin', name || 'ค่าวิตามิน', num('vitaminCost'));
    } else if (action === 'medicine') {
      const name = val('itemName') || selectedMedicalName();
      const method = val('medicineMethod') || 'other';
      base.event_title = `ให้ยา${name ? ' • ' + name : ''}`;
      base.event_subtype = method;
      base.extra = { item_name: name, method };
      if (!medicalId) pushExpense('medicine', name || 'ค่ายา', num('medicineCost'));
    } else if (action === 'feed_swap') {
      const oldName = val('oldFeedName');
      const newName = val('newFeedName');
      base.event_title = 'เคลมอาหาร';
      base.detail = val('eventDetail') || `${oldName || '-'} → ${newName || '-'}`;
      base.extra = { old_feed_name: oldName, new_feed_name: newName };
    } else {
      const title = val('otherTitle') || 'กิจกรรมอื่น ๆ';
      base.event_title = title;
      base.extra = { title };
      pushExpense('other', title, num('otherCost'));
    }
    return base;
  }


  function actionKeyFromEvent(ev) {
    const t = normalizeEventType(ev?.event_type || ev?.type);
    return ['injection', 'rain', 'duck_cull', 'vitamin', 'medicine', 'feed_swap', 'other'].includes(t) ? t : 'other';
  }

  function eventExtra(ev) {
    const extra = ev?.extra || ev?.extra_json || {};
    if (extra && typeof extra === 'object') return extra;
    try { return JSON.parse(String(extra || '{}')); } catch (_) { return {}; }
  }

  function populateEventForm(ev, actionKey) {
    const extra = eventExtra(ev);
    const date = normalizeDateValue(ev.log_date || ev.date || todayString());
    valSet('eventStartDate', date);
    valSet('eventEndDate', date);
    const distribute = document.getElementById('eventDistributeCost');
    if (distribute) distribute.checked = true;
    valSet('eventDetail', ev.detail || extra.detail || '');

    if (actionKey === 'injection') {
      valSet('injectionSubtype', ev.event_subtype || extra.subtype || 'other');
      valSet('medicineName', extra.medicine_name || extra.medical_item_name || '');
      valSet('medicalItemId', extra.medical_item_id || ev.ref_item_id || '');
      valSet('medicalItemQty', extra.medical_item_qty || '');
      valSet('medicineCost', Number(ev.medicine_cost || ev.vaccine_cost || 0) || '');
      valSet('laborCost', Number(ev.labor_cost || 0) || '');
      valSet('birdCount', extra.bird_count || '');
    } else if (actionKey === 'rain') {
      valSet('rainLevel', ev.event_subtype || extra.rain_level || (ev.severity === 'high' ? 'heavy' : 'light'));
    } else if (actionKey === 'duck_cull') {
      valSet('cullQty', extra.cull_qty || ev.cull_qty || '');
      valSet('cullUnitPrice', extra.cull_unit_price || ev.cull_unit_price || '');
      valSet('cullBuyer', extra.buyer || ev.buyer || '');
      valSet('laborCost', Number(ev.labor_cost || 0) || '');
    } else if (actionKey === 'vitamin') {
      valSet('itemName', extra.item_name || extra.medical_item_name || stripEventPrefix(ev.event_title, 'ให้วิตามิน'));
      valSet('medicalItemId', extra.medical_item_id || ev.ref_item_id || '');
      valSet('medicalItemQty', extra.medical_item_qty || '');
      valSet('vitaminCost', Number(ev.vitamin_cost || 0) || '');
    } else if (actionKey === 'medicine') {
      valSet('itemName', extra.item_name || extra.medical_item_name || stripEventPrefix(ev.event_title, 'ให้ยา'));
      valSet('medicalItemId', extra.medical_item_id || ev.ref_item_id || '');
      valSet('medicalItemQty', extra.medical_item_qty || '');
      valSet('medicineMethod', ev.event_subtype || extra.method || 'other');
      valSet('medicineCost', Number(ev.medicine_cost || 0) || '');
    } else if (actionKey === 'feed_swap') {
      valSet('oldFeedName', extra.old_feed_name || '');
      valSet('newFeedName', extra.new_feed_name || '');
    } else {
      valSet('otherTitle', ev.event_title || extra.title || 'กิจกรรมอื่น ๆ');
      valSet('otherCost', Number(ev.other_cost || ev.expense_total || 0) || '');
    }
  }

  function stripEventPrefix(title, prefix) {
    const text = String(title || '');
    return text.replace(prefix, '').replace(/^\s*•\s*/, '').trim();
  }

  function selectedMedicalName() {
    const id = val('medicalItemId');
    const item = state.medicalItems.find((it) => String(it.id) === String(id));
    return item?.name || '';
  }

  function syncEndDateIfEmpty() {
    const end = document.getElementById('eventEndDate');
    if (end && !end.value) end.value = val('eventStartDate') || todayString();
  }

  function closeEventSheet() { state.editingEvent = null; hideSheet(document.getElementById('eventSheet')); }
  
  function onTimelineClick(event) {
    const editButton = event.target.closest('[data-event-edit]');
    if (!editButton) return;
    event.preventDefault();
    event.stopPropagation();
    if (state.permission !== 'write') return alert('ไม่มีสิทธิ์แก้ไข');
    const eventId = editButton.dataset.eventEdit || '';
    const found = state.events.find((item) => String(item.id || '') === String(eventId));
    if (!found) return alert('ไม่พบข้อมูลกิจกรรมนี้');
    const actionKey = actionKeyFromEvent(found);
    if (actionKey === 'medical_in') return alert('รายการซื้อยา/วิตามินเข้าคลังให้แก้ผ่านหน้าคลังโดยตรง');
    openEventSheet(actionKey, found);
  }


  async function onEventDynamicFieldsClick(event) {
    const deleteBtn = event.target.closest('#eventDeleteBtn');
    if (!deleteBtn) return;
    event.preventDefault();
    await deleteEditingEvent();
  }

  function onEventDynamicFieldsChange(event) {
    if (event.target?.id !== 'eventApplySeries') return;
    const checked = !!event.target.checked;
    const singleDate = event.target.dataset.singleDate || normalizeDateValue(state.editingEvent?.log_date || todayString());
    const start = checked ? (event.target.dataset.seriesStart || singleDate) : singleDate;
    const end = checked ? (event.target.dataset.seriesEnd || start) : singleDate;
    valSet('eventStartDate', start);
    valSet('eventEndDate', end);
  }

  async function deleteEditingEvent() {
    if (!state.editingEvent?.id) return;
    const applySeries = !!document.getElementById('eventApplySeries')?.checked;
    const message = applySeries
      ? 'ต้องการยกเลิกกิจกรรมทั้ง series นี้ใช่ไหม?'
      : 'ต้องการยกเลิกกิจกรรมวันนี้ใช่ไหม?';
    if (!confirm(message)) return;
    const btn = document.getElementById('eventDeleteBtn');
    const oldText = btn?.textContent || '';
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังยกเลิก...'; }
    const res = await AppApi.post({
      action: 'deleteBatchEvent',
      batch_id: state.batchId,
      event_id: state.editingEvent.id,
      update_scope: applySeries ? 'series' : 'single'
    });
    if (btn) { btn.disabled = false; btn.textContent = oldText || 'ยกเลิกกิจกรรมนี้'; }
    if (!res || res.status !== 'ok') return alert(res?.message || 'ยกเลิกกิจกรรมไม่สำเร็จ');
    closeEventSheet();
    removeCache(`ducky:farm-events:${state.batchId}`);
    await load();
  }

  function showSheet(sheet) { if (!sheet) return; sheet.classList.remove('hidden'); requestAnimationFrame(() => sheet.classList.add('show')); }
  function hideSheet(sheet) { if (!sheet) return; sheet.classList.remove('show'); setTimeout(() => sheet.classList.add('hidden'), 220); }

  function readCache(key) { try { const raw = localStorage.getItem(key); if (!raw) return null; const parsed = JSON.parse(raw); if (!parsed || !parsed.saved_at || Date.now() - parsed.saved_at > 90 * 1000) return null; return parsed.data; } catch (_) { return null; } }
  function writeCache(key, data) { try { localStorage.setItem(key, JSON.stringify({ saved_at: Date.now(), data })); } catch (_) {} }
  function removeCache(key) { try { localStorage.removeItem(key); } catch (_) {} }
  function normalizeEventType(type) { const t = String(type || 'other').toLowerCase(); if (t === 'vaccine') return 'injection'; if (t === 'weather') return 'rain'; if (t === 'farm_event') return 'other'; return ['injection', 'rain', 'duck_cull', 'vitamin', 'medicine', 'feed_swap', 'other'].includes(t) ? t : 'other'; }
  function normalizeMedicalType(type) { const t = String(type || 'medicine').toLowerCase(); return ['medicine', 'vitamin', 'vaccine', 'chemical', 'other'].includes(t) ? t : 'medicine'; }
  function eventIcon(type, subtype, severity) { const t = normalizeEventType(type); if (t === 'injection') return subtype === 'preg' ? '💉P' : '💉'; if (t === 'rain') return severity === 'high' || subtype === 'heavy' ? '⛈' : '🌦'; return ({ duck_cull:'🦆', vitamin:'✨', medicine:'💊', feed_swap:'🔁', other:'•' }[t] || '•'); }
  function eventIconFile(type, subtype, severity) { const t = normalizeEventType(type); return ({ injection:'injection.png', rain:'rain.png', duck_cull:'duck.png', vitamin:'vitamin.png', medicine:'medicine.png', feed_swap:'feed-swap.png', other:'activity.png' }[t] || 'activity.png'); }
  function eventIconHtml(type, subtype, severity, className) { const fallback = eventIcon(type, subtype, severity); const file = eventIconFile(type, subtype, severity); return `<span class="${escapeAttr(className || 'event-timeline-bubble')} event-timeline-bubble--asset" data-fallback="${escapeAttr(fallback)}"><img src="assets/report-icon/${escapeAttr(file)}" alt="" loading="lazy" onerror="this.parentElement.textContent=this.parentElement.dataset.fallback||'•';" /></span>`; }
  function typeLabel(type, subtype) { const t = normalizeEventType(type); if (t === 'injection') return 'ฉีดยา' + (subtype ? ' • ' + injectionSubtypeLabel(subtype) : ''); if (t === 'rain') return subtype === 'heavy' ? 'ฝนตกแรง' : (subtype === 'light' ? 'ฝนตกเบา' : 'ฝนตก'); return ({ duck_cull:'แตะตูด / คัดเป็ด', vitamin:'ให้วิตามิน', medicine:'ให้ยา', feed_swap:'เคลมอาหาร', other:'อื่น ๆ' }[t] || t || '-'); }
  function injectionSubtypeLabel(v) { return ({ preg:'เพร็ก', bird_flu:'หวัดนก', other:'ยาอื่น ๆ', water:'ผสมน้ำ', feed:'ผสมอาหาร' }[v] || v || 'ยาอื่น ๆ'); }
  function severityLabel(v) { return ({ normal:'ปกติ', medium:'กลาง', high:'สูง', light:'เบา', heavy:'แรง' }[v] || 'ปกติ'); }
  function todayString() { return new Date().toISOString().slice(0, 10); }
  function normalizeDateValue(v) { return String(v || '').slice(0, 10); }
  function formatDateLong(v) { const d = new Date(String(v || '').slice(0, 10)); if (Number.isNaN(d.getTime())) return v || '-'; return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }
  function formatDateShort(v) { const d = new Date(String(v || '').slice(0, 10)); if (Number.isNaN(d.getTime())) return v || '-'; return d.toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' }); }
  function val(id) { return document.getElementById(id)?.value || ''; }
  function valSet(id, value) { const el = document.getElementById(id); if (el) el.value = value || ''; }
  function num(id) { return Number(val(id) || 0); }
  function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v || ''; }
  function fmt(v) { return Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
  function escapeHtml(text) { return String(text ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[m])); }
  function escapeAttr(text) { return escapeHtml(text).replace(/`/g, '&#096;'); }

  return { bootstrap };
})();
