window.ItemsPriceManagePage = (() => {
  const state = {
    users: [],
    batches: [],
    priceSets: [],
    activeSet: null,
    activeBindings: [],
    bindingsLoaded: false
  };
  const CACHE_TTL_MS = 90 * 1000;

  async function bootstrap() {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    bindBaseEvents();

    const cached = readCache('ducky:price-admin:data');
    if (cached) {
      hydrateState(cached);
      renderAll();
    }

    const response = await AppApi.post({ action: 'getItemPriceAdminData' });
    if (!response || response.status !== 'ok') {
      if (!cached) document.getElementById('priceManageSubtitle').textContent = response?.message || 'โหลดชุดราคาไม่สำเร็จ';
      return;
    }

    hydrateState(response);
    writeAdminCache();
    renderAll();

    if (window.NavDrawer) {
      NavDrawer.setBatchContext({ isAdmin: true, module_permissions: {}, batch: null });
    }
  }

  function hydrateState(payload) {
    state.users = payload.users || [];
    state.batches = payload.batches || [];
    state.priceSets = payload.price_sets || [];
    if (state.activeSet) {
      const refreshed = state.priceSets.find((item) => String(item.id) === String(state.activeSet.id));
      state.activeSet = refreshed || null;
    }
  }

  function bindBaseEvents() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);

    document.getElementById('priceSetForm')?.addEventListener('submit', onSavePriceSet);
    document.getElementById('addPriceItemBtn')?.addEventListener('click', () => appendPriceItemRow('', '', '', true));
    document.getElementById('newPriceSetBtn')?.addEventListener('click', resetEditor);
    document.getElementById('deletePriceSetBtn')?.addEventListener('click', onDeletePriceSet);
    document.getElementById('priceItemList')?.addEventListener('click', onPriceItemListClick);
    document.getElementById('priceSetList')?.addEventListener('click', onPriceSetListClick);

    document.getElementById('bindingType')?.addEventListener('change', renderBindingTargetList);
    document.getElementById('bindingForm')?.addEventListener('submit', onSaveBinding);
    document.getElementById('loadBindingsBtn')?.addEventListener('click', loadBindingsForActiveSet);
    document.getElementById('bindingList')?.addEventListener('click', onBindingListClick);

    document.getElementById('priceSetEditorCloseBtn')?.addEventListener('click', closePriceSetSheet);
    document.getElementById('priceSetEditorBackdrop')?.addEventListener('click', closePriceSetSheet);
    document.getElementById('bindingCloseBtn')?.addEventListener('click', closeBindingSheet);
    document.getElementById('bindingBackdrop')?.addEventListener('click', closeBindingSheet);
  }

  function renderAll() {
    document.getElementById('priceManageSubtitle').textContent = `มีชุดราคาทั้งหมด ${state.priceSets.length} ชุด`;
    document.getElementById('priceSetCountBadge').textContent = `${state.priceSets.length} ชุด`;
    renderSummary();
    renderBindingTargetList();
    renderPriceSetCards();
    renderFab();
    updateActiveSetHint();
  }

  function renderSummary() {
    const summary = document.getElementById('itemPriceSummaryCards');
    if (!summary) return;
    const bindingCount = state.activeSet ? Number(state.activeSet.binding_count || state.activeBindings.length || 0) : 0;
    summary.innerHTML = `
      <div class="module-summary-card">
        <span class="module-summary-label">ชุดราคาทั้งหมด</span>
        <strong class="module-summary-value">${escapeHtml(String(state.priceSets.length))}</strong>
        <span class="muted">ใช้ FAB เพื่อสร้างชุดราคาใหม่</span>
      </div>
      <div class="module-summary-card">
        <span class="module-summary-label">ชุดที่เลือก</span>
        <strong class="module-summary-value">${escapeHtml(state.activeSet?.name || 'ยังไม่ได้เลือก')}</strong>
        <span class="muted">ผูกใช้งานแล้ว ${escapeHtml(String(bindingCount))} รายการ</span>
      </div>
    `;
  }

  function updateActiveSetHint() {
    const hint = document.getElementById('activeSetHint');
    if (!hint) return;
    if (!state.activeSet) {
      hint.textContent = 'แตะการ์ดชุดราคาเพื่อเลือกเป็นชุดที่ต้องการแก้ไขหรือผูกใช้งาน';
      return;
    }
    const scopeLabel = state.activeSet.scope_type === 'user' ? 'เฉพาะผู้ใช้' : 'ทั้งระบบ';
    const itemCount = Number(state.activeSet.item_count || 0);
    const bindingCount = Number(state.activeSet.binding_count || state.activeBindings.length || 0);
    hint.textContent = `กำลังเลือก: ${state.activeSet.name} • ${scopeLabel} • ${itemCount} รายการราคา • ผูกแล้ว ${bindingCount} รายการ`;
  }

  function renderBindingTargetList() {
    const type = document.getElementById('bindingType')?.value || 'batch';
    const list = document.getElementById('bindingTargetList');
    if (!list) return;
    const rows = type === 'user' ? state.users : state.batches;
    list.innerHTML = rows.map((item) => `<option value="${escapeHtml(item.label)}"></option>`).join('');
  }

  function renderPriceSetCards() {
    const target = document.getElementById('priceSetList');
    if (!target) return;
    if (!state.priceSets.length) {
      target.innerHTML = '<div class="empty-state">ยังไม่มีชุดราคา กด FAB ด้านล่างเพื่อสร้างชุดแรกได้เลย</div>';
      return;
    }
    target.innerHTML = state.priceSets.map((set) => {
      const active = state.activeSet && String(state.activeSet.id) === String(set.id);
      const scopeLabel = set.scope_type === 'user' ? 'เฉพาะผู้ใช้' : 'ทั้งระบบ';
      return `
        <button type="button" class="price-set-card${active ? ' is-active' : ''}" data-price-set-id="${escapeAttr(set.id)}">
          <div class="price-set-card__head">
            <strong class="price-set-card__title">${escapeHtml(set.name)}</strong>
            <span class="badge-inline ${set.is_active ? 'success' : 'muted-badge'}">${set.is_active ? 'active' : 'inactive'}</span>
          </div>
          <div class="price-set-card__meta">
            <span>${escapeHtml(scopeLabel)}</span>
            <span>${escapeHtml(String(set.item_count || 0))} รายการ</span>
            <span>${escapeHtml(String(set.binding_count || 0))} การผูก</span>
          </div>
        </button>`;
    }).join('');
  }

  function renderFab() {
    const root = document.getElementById('moduleFabRoot');
    if (!root) return;
    root.innerHTML = `
      <div class="module-fab" id="moduleFab">
        <div class="module-fab-actions">
          <button type="button" class="module-fab-action" data-price-action="create">สร้างชุดราคา</button>
          <button type="button" class="module-fab-action${state.activeSet ? '' : ' is-disabled'}" data-price-action="edit">แก้ไขชุดราคา</button>
          <button type="button" class="module-fab-action${state.activeSet ? '' : ' is-disabled'}" data-price-action="bind">ผูกชุดราคา</button>
        </div>
        <button type="button" class="fab module-fab-main" id="moduleFabToggle">＋</button>
      </div>
    `;
    document.getElementById('moduleFabToggle')?.addEventListener('click', (event) => {
      event.stopPropagation();
      document.getElementById('moduleFab')?.classList.toggle('open');
    });
    root.querySelectorAll('[data-price-action]').forEach((button) => {
      button.addEventListener('click', () => handleFabAction(button.dataset.priceAction));
    });
    document.removeEventListener('click', onOutsideFabClick, true);
    document.addEventListener('click', onOutsideFabClick, true);
  }

  function onOutsideFabClick(event) {
    const root = document.getElementById('moduleFab');
    if (root && !root.contains(event.target)) root.classList.remove('open');
  }

  function handleFabAction(action) {
    document.getElementById('moduleFab')?.classList.remove('open');
    if (action === 'create') {
      resetEditor(false);
      openPriceSetSheet('create');
      return;
    }
    if (!state.activeSet) {
      alert('กรุณาเลือกชุดราคาก่อน');
      return;
    }
    if (action === 'edit') {
      openPriceSetSheet('edit');
      return;
    }
    if (action === 'bind') {
      openBindingSheet();
    }
  }

  function openPriceSetSheet(mode) {
    const title = document.getElementById('priceSetEditorTitle');
    title.textContent = mode === 'edit' ? 'แก้ไขชุดราคา' : 'สร้างชุดราคา';
    showSheet('priceSetEditorSheet');
  }

  function closePriceSetSheet() { hideSheet('priceSetEditorSheet'); }
  function openBindingSheet() {
    if (!state.activeSet) return alert('กรุณาเลือกชุดราคาก่อน');
    document.getElementById('bindingPriceSetSearch').value = priceSetLabel(state.activeSet);
    document.getElementById('bindingTargetSearch').value = '';
    renderBindingTargetList();
    if (state.bindingsLoaded) renderBindings();
    else loadBindingsForActiveSet();
    showSheet('bindingSheet');
  }
  function closeBindingSheet() { hideSheet('bindingSheet'); }

  function resetEditor(resetBindings = true) {
    state.activeSet = null;
    if (resetBindings) {
      state.activeBindings = [];
      state.bindingsLoaded = false;
    }
    document.getElementById('priceSetForm').reset();
    document.getElementById('priceSetId').value = '';
    document.getElementById('priceSetScopeType').value = 'system';
    document.getElementById('priceItemList').innerHTML = '';
    appendPriceItemRow('23.6', '23.6 (23.6 กรัมขึ้นไป)', '', false);
    appendPriceItemRow('23.1', '23.1 (23.10-23.59 กรัม)', '', false);
    document.getElementById('deletePriceSetWrap').classList.add('hidden');
    if (resetBindings) {
      document.getElementById('bindingCountBadge').textContent = 'ยังไม่มีการผูกใช้งาน';
      document.getElementById('bindingList').innerHTML = '<div class="empty-state">ยังไม่มีการผูกชุดราคานี้</div>';
      document.getElementById('bindingPriceSetSearch').value = '';
      document.getElementById('bindingTargetSearch').value = '';
    }
    renderAll();
  }

  function appendPriceItemRow(itemName = '', displayName = '', price = '', scrollIntoView = false) {
    const row = document.createElement('div');
    row.className = 'price-item-row';
    row.innerHTML = `
      <div class="price-item-grid">
        <div class="price-item-field">
          <label class="field-label">ชื่อรายการ</label>
          <input class="price-item-name" type="text" placeholder="เช่น 23.6 หรือ บาง" value="${escapeAttr(itemName)}" />
        </div>
        <div class="price-item-field">
          <label class="field-label">ข้อความที่แสดงบนบิล</label>
          <input class="price-item-display" type="text" placeholder="ข้อความแสดงผลเพิ่มเติม" value="${escapeAttr(displayName)}" />
        </div>
        <div class="price-item-field price-item-field--price">
          <label class="field-label">ราคาต่อฟอง</label>
          <input class="price-item-value" type="number" min="0" step="0.01" placeholder="0.00" value="${price !== '' ? escapeAttr(price) : ''}" />
        </div>
        <div class="price-item-remove-wrap">
          <button type="button" class="secondary-btn price-item-remove" data-action="remove-price-item">ลบรายการ</button>
        </div>
      </div>
    `;
    document.getElementById('priceItemList').appendChild(row);
    if (scrollIntoView) requestAnimationFrame(() => row.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  }

  function onPriceItemListClick(event) {
    const btn = event.target.closest('[data-action="remove-price-item"]');
    if (!btn) return;
    const list = document.getElementById('priceItemList');
    if (list.children.length <= 1) return;
    btn.closest('.price-item-row')?.remove();
  }

  async function onPriceSetListClick(event) {
    const card = event.target.closest('[data-price-set-id]');
    if (!card) return;
    await loadPriceSetDetail(card.dataset.priceSetId);
  }

  async function loadPriceSetDetail(priceSetId) {
    const response = await AppApi.post({ action: 'getPriceSetDetail', price_set_id: priceSetId });
    if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดรายละเอียดชุดราคาไม่สำเร็จ');
    state.activeSet = response.price_set;
    state.activeBindings = response.bindings || [];
    state.bindingsLoaded = true;
    fillEditor(response.price_set, response.items || []);
    renderAll();
    renderBindings();
  }

  function fillEditor(priceSet, items) {
    document.getElementById('priceSetId').value = priceSet.id || '';
    document.getElementById('priceSetName').value = priceSet.name || '';
    document.getElementById('priceSetScopeType').value = priceSet.scope_type || 'system';
    document.getElementById('priceSetRemark').value = priceSet.remark || '';
    const list = document.getElementById('priceItemList');
    list.innerHTML = '';
    if (items.length) items.forEach((item) => appendPriceItemRow(item.item_name, item.display_name, item.current_price));
    else appendPriceItemRow();
    document.getElementById('deletePriceSetWrap').classList.remove('hidden');
  }

  async function onSavePriceSet(event) {
    event.preventDefault();
    const rows = [...document.querySelectorAll('#priceItemList .price-item-row')];
    if (!rows.length) return alert('กรุณาเพิ่มรายการราคาอย่างน้อย 1 รายการ');

    const items = [];
    const seen = new Set();
    for (const row of rows) {
      const itemName = row.querySelector('.price-item-name').value.trim();
      const displayName = row.querySelector('.price-item-display').value.trim();
      const currentPrice = Number(row.querySelector('.price-item-value').value || 0);
      if (!itemName) return alert('กรุณากรอก item_name ทุกแถว');
      if (seen.has(itemName)) return alert(`item_name ซ้ำกัน: ${itemName}`);
      seen.add(itemName);
      if (currentPrice < 0) return alert('ราคาต่อฟองต้องไม่ติดลบ');
      items.push({ item_name: itemName, display_name: displayName, current_price: currentPrice });
    }

    const payload = {
      action: 'savePriceSet',
      price_set_id: document.getElementById('priceSetId').value || '',
      name: document.getElementById('priceSetName').value.trim(),
      scope_type: document.getElementById('priceSetScopeType').value,
      scope_ref_id: '',
      specie: 'duck',
      sale_kind: 'egg_weight',
      remark: document.getElementById('priceSetRemark').value.trim(),
      items
    };
    if (!payload.name) return alert('กรุณากรอกชื่อชุดราคา');

    const btn = document.getElementById('savePriceSetBtn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post(payload);
    btn.disabled = false;
    btn.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกชุดราคาไม่สำเร็จ');

    localStorage.removeItem('ducky:price-admin:data');
    const refresh = await AppApi.post({ action: 'getItemPriceAdminData' });
    if (refresh && refresh.status === 'ok') {
      hydrateState(refresh);
      writeAdminCache();
    }
    closePriceSetSheet();
    await loadPriceSetDetail(response.price_set.id);
    alert('บันทึกชุดราคาเรียบร้อย');
  }

  async function onDeletePriceSet() {
    const id = document.getElementById('priceSetId').value;
    if (!id) return;
    if (!confirm('ต้องการลบชุดราคานี้ใช่ไหม')) return;
    const response = await AppApi.post({ action: 'deletePriceSet', price_set_id: id });
    if (!response || response.status !== 'ok') return alert(response?.message || 'ลบชุดราคาไม่สำเร็จ');
    localStorage.removeItem('ducky:price-admin:data');
    const refresh = await AppApi.post({ action: 'getItemPriceAdminData' });
    if (refresh && refresh.status === 'ok') {
      hydrateState(refresh);
      writeAdminCache();
    }
    closePriceSetSheet();
    resetEditor();
    alert('ลบชุดราคาเรียบร้อย');
  }

  async function loadBindingsForActiveSet() {
    if (!state.activeSet) return alert('กรุณาเลือกชุดราคาก่อน');
    const response = await AppApi.post({ action: 'getPriceSetDetail', price_set_id: state.activeSet.id });
    if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดการผูกใช้งานไม่สำเร็จ');
    state.activeSet = response.price_set;
    state.activeBindings = response.bindings || [];
    state.bindingsLoaded = true;
    document.getElementById('bindingCountBadge').textContent = `${state.activeBindings.length} รายการผูก`;
    renderAll();
    renderBindings();
  }

  async function onSaveBinding(event) {
    event.preventDefault();
    if (!state.activeSet) return alert('กรุณาเลือกชุดราคาก่อน');
    const bindingType = document.getElementById('bindingType').value;
    const target = bindingType === 'user'
      ? resolveUserByLabel(document.getElementById('bindingTargetSearch').value)
      : resolveBatchByLabel(document.getElementById('bindingTargetSearch').value);
    if (!target) return alert(`กรุณาเลือก ${bindingType === 'user' ? 'ผู้ใช้' : 'batch'} ที่ต้องการผูก`);

    const btn = document.getElementById('saveBindingBtn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post({
      action: 'savePriceSetBinding',
      price_set_id: state.activeSet.id,
      binding_type: bindingType,
      binding_ref_id: target.id
    });
    btn.disabled = false;
    btn.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกการผูกใช้งานไม่สำเร็จ');
    document.getElementById('bindingTargetSearch').value = '';
    localStorage.removeItem('ducky:price-admin:data');
    await loadBindingsForActiveSet();
    alert('บันทึกการผูกใช้งานเรียบร้อย');
  }

  async function onBindingListClick(event) {
    const btn = event.target.closest('[data-binding-id]');
    if (!btn) return;
    if (!confirm('ต้องการยกเลิกการผูกใช้งานนี้ใช่ไหม')) return;
    const response = await AppApi.post({ action: 'removePriceSetBinding', binding_id: btn.dataset.bindingId });
    if (!response || response.status !== 'ok') return alert(response?.message || 'ยกเลิกการผูกใช้งานไม่สำเร็จ');
    await loadBindingsForActiveSet();
  }

  function renderBindings() {
    const target = document.getElementById('bindingList');
    if (!state.activeSet) {
      target.innerHTML = '<div class="empty-state">ยังไม่ได้เลือกชุดราคา</div>';
      return;
    }
    if (!state.bindingsLoaded) {
      target.innerHTML = '<div class="empty-state">กด “โหลดรายการผูก” เพื่อดึงข้อมูลล่าสุด</div>';
      return;
    }
    if (!state.activeBindings.length) {
      target.innerHTML = '<div class="empty-state">ยังไม่มีการผูกชุดราคานี้</div>';
      return;
    }
    target.innerHTML = state.activeBindings.map((binding) => `
      <div class="price-binding-card">
        <div>
          <div class="price-binding-title">${escapeHtml(binding.target_label || binding.binding_ref_id)}</div>
          <div class="muted">${escapeHtml(binding.binding_type)} • ${escapeHtml(binding.binding_ref_id)}</div>
        </div>
        <button type="button" class="secondary-btn price-binding-remove" data-binding-id="${escapeAttr(binding.id)}">ยกเลิกการผูก</button>
      </div>
    `).join('');
    document.getElementById('bindingCountBadge').textContent = `${state.activeBindings.length} รายการผูก`;
  }

  function resolveUserByLabel(label) { return state.users.find((user) => user.label === label) || null; }
  function resolveBatchByLabel(label) { return state.batches.find((batch) => batch.label === label) || null; }

  function priceSetLabel(item) {
    const parts = [item.name || ''];
    if (item.scope_type === 'user' && item.scope_ref_label) parts.push(item.scope_ref_label);
    parts.push(item.id || '');
    return parts.filter(Boolean).join(' • ');
  }

  function writeAdminCache() {
    writeCache('ducky:price-admin:data', {
      users: state.users,
      batches: state.batches,
      price_sets: state.priceSets
    });
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
  function escapeHtml(text) { return String(text || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m])); }
  function escapeAttr(text) { return escapeHtml(String(text || '')); }

  return { bootstrap };
})();
