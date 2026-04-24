window.BatchPage = (() => {
  const state = {
    batch: null,
    permission: 'read',
    isOwner: false,
    logs: [],
    movementMode: null,
    imageBase64: null,
    outsideFabBound: false,
    farmName: '',
    billDraft: null,
    billPreviewImage: '',
    logoUrl: 'assets/farm-logo.png',
    access: {
      loaded: false,
      loading: false,
      isAdmin: false,
      isOwner: false,
      members: []
    }
  };

  const movementModeConfig = {
    add: {
      title: 'เพิ่มจำนวนเป็ด',
      submitLabel: 'บันทึกการเพิ่ม',
      unitPriceLabel: 'ราคาต่อหน่วย (ถ้ามี)',
      unitPricePlaceholder: 'ราคาต่อหน่วย (0 = ฟรี)',
      unitPriceVisible: true,
      helper: 'ใช้กรณีเพิ่มเป็ดเข้า batch และสามารถระบุค่าใช้จ่ายต่อหน่วยได้'
    },
    dead: {
      title: 'บันทึกเป็ดตาย',
      submitLabel: 'บันทึกการตาย',
      unitPriceVisible: false,
      helper: 'ระบบจะหักจำนวนคงเหลือของ batch ตามจำนวนที่ระบุ'
    }
  };

  async function bootstrap() {
    const page = document.body?.dataset?.page;
    if (page !== 'batch' && page !== 'batch_manage') return;

    const ok = await AppAuth.ensureAuth();
    if (!ok) return;

    bindBaseEvents();
    updateFabVisibility();

    const params = new URLSearchParams(location.search);
    const batchId = params.get('bid');
    if (!batchId) {
      document.getElementById('batchSubtitle').textContent = 'ไม่พบ batch id';
      return;
    }

    await loadBatch(batchId);
  }

  function bindBaseEvents() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);

    document.getElementById('movementSheetCloseBtn')?.addEventListener('click', closeMovementSheet);
    document.getElementById('movementSheetBackdrop')?.addEventListener('click', closeMovementSheet);
    document.getElementById('movementForm')?.addEventListener('submit', submitMovement);

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

    const batchSections = document.getElementById('batchSections');
    batchSections?.addEventListener('click', onBatchSectionsClick);
    batchSections?.addEventListener('submit', onBatchSectionsSubmit);
  }

  async function loadBatch(batchId) {
    const response = await AppApi.post({ action: 'getBatchFullDetail', batch_id: batchId });
    if (!response || response.status !== 'ok') {
      document.getElementById('batchSubtitle').textContent = response?.message || 'โหลดข้อมูลไม่สำเร็จ';
      return;
    }

    state.batch = response.batch;
    state.permission = response.permission || 'read';
    state.isOwner = String(response.batch.user_id || '') === String(AppAuth.getSession('user_id') || '');
    state.farmName = response.farm_name || response.batch.owner_name || response.batch.name || 'FARM';

    if (window.NavDrawer) {
      NavDrawer.setBatchContext({
        id: batchId,
        specie: state.batch.specie,
        permission: state.permission,
        isOwner: state.isOwner
      });
    }

    renderHeader();
    renderSections();
    renderFab();
    await loadMovementLogs();
    if (state.batch?.specie === 'duck') {
      refreshAccessSection();
    }

    if (location.hash) {
      const target = document.querySelector(location.hash);
      if (target) setTimeout(() => target.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }

  function renderHeader() {
    const batch = state.batch;
    const isDuck = batch.specie === 'duck';
    document.getElementById('batchTitle').textContent = batch.name || 'Batch Detail';
    document.getElementById('batchSubtitle').textContent = isDuck ? 'จัดการชุดเป็ด' : (batch.specie === 'fish' ? 'จัดการชุดปลา' : 'จัดการ batch');
    document.getElementById('batchHeroImage').src = AppConfig.imageUrlFromId(batch.image_url);
    document.getElementById('batchSpecie').textContent = displaySpecie(batch.specie);
    document.getElementById('batchStatus').textContent = String(batch.status) === '1' ? 'Active' : 'Inactive';
    document.getElementById('batchPermission').textContent = state.permission === 'write' ? 'Read & Write' : 'Read Only';
    document.getElementById('batchDates').textContent = `${batch.start_date || '-'} → ${batch.end_date || '-'}`;
    document.getElementById('batchRemark').textContent = batch.remark || 'ไม่มีหมายเหตุ';
    document.getElementById('batchHeroQty').textContent = `${Number(batch.current_qty || 0).toLocaleString()} ตัว`;
    document.getElementById('batchHeroPrice').textContent = `${Number(batch.unit_price || 0).toLocaleString()} บาท/ตัว`;
  }

  function renderSections() {
    const target = document.getElementById('batchSections');
    const batch = state.batch;
    const isDuck = batch.specie === 'duck';

    const sections = [];
    if (isDuck) {
      sections.push(renderManageSection());
      sections.push(renderAccessSection());
      sections.push(renderPlaceholderSection('egg-daily', 'บันทึกจำนวนไข่รายวัน', 'หน้านี้จะทำต่อในรอบถัดไป โดยจะรองรับเพิ่มและแก้ไขข้อมูลไข่รายวัน'));
      sections.push(renderPlaceholderSection('feed-manage', 'จัดการอาหาร', 'หน้านี้จะทำต่อในรอบถัดไป โดยจะรองรับเข้า-ออกอาหารสำหรับชุดเป็ด'));
      sections.push(renderPlaceholderSection('egg-sale', 'ขายไข่', 'หน้านี้จะทำต่อในรอบถัดไป โดยจะเชื่อมกับระบบ sale logs และ sale bills')); 
    } else {
      sections.push(renderPlaceholderSection('fish-feed-manage', 'จัดการอาหาร', 'หน้านี้จะทำต่อในรอบถัดไปสำหรับชุดปลา'));
      sections.push(renderPlaceholderSection('fish-sale', 'ขายปลา', 'หน้านี้จะทำต่อในรอบถัดไปสำหรับการขายปลา'));
    }

    target.innerHTML = sections.join('');
    if (isDuck) {
      refreshAccessSection();
    }
  }

  function renderManageSection() {
    const batch = state.batch;
    const canWrite = state.permission === 'write';
    const statusBadge = canWrite ? '<span class="badge-inline success">พร้อมใช้งาน</span>' : '<span class="badge-inline muted-badge">Read Only</span>';
    return `
      <article id="batch-manage" class="card-panel section-card">
        <div class="section-card-head">
          <h3>แก้ไขข้อมูลชุดสัตว์</h3>
          ${statusBadge}
        </div>
        <p class="muted">ใช้ปุ่ม FAB มุมขวาล่างเพื่อเปิดเมนูสำหรับ เพิ่ม/ตาย/ขาย/แก้ไขข้อมูลชุดเป็ด</p>
        <div class="stat-grid">
          <div class="stat-tile"><span class="stat-label">คงเหลือปัจจุบัน</span><strong class="stat-value">${Number(batch.current_qty || 0).toLocaleString()} ตัว</strong></div>
          <div class="stat-tile"><span class="stat-label">ราคาอ้างอิง</span><strong class="stat-value">${Number(batch.unit_price || 0).toLocaleString()} บาท</strong></div>
          <div class="stat-tile"><span class="stat-label">สถานะ</span><strong class="stat-value">${String(batch.status) === '1' ? 'Active' : 'Inactive'}</strong></div>
          <div class="stat-tile"><span class="stat-label">เริ่มเลี้ยง</span><strong class="stat-value">${batch.start_date || '-'}</strong></div>
        </div>
        <div class="quick-notes">
          <div><strong>ชื่อฟาร์มบนบิล:</strong> ${state.farmName || '-'}</div>
          <div><strong>Last update:</strong> ${batch.last_update || '-'}</div>
        </div>
        ${canWrite ? '<div class="helper-chip-row"><span class="helper-chip">FAB: เพิ่ม</span><span class="helper-chip">FAB: ตาย</span><span class="helper-chip">FAB: ขาย</span><span class="helper-chip">FAB: แก้ไขข้อมูล</span></div>' : '<p class="muted">บัญชีนี้มีสิทธิ์อ่านอย่างเดียว จึงไม่สามารถใช้ action จาก FAB ได้</p>'}
      </article>
      <article id="batch-log-history" class="card-panel section-card">
        <div class="section-card-head">
          <h3>ประวัติการจัดการชุดเป็ดล่าสุด</h3>
          <span class="badge-inline muted-badge" id="movementLogCount">0 รายการ</span>
        </div>
        <div id="movementLogList" class="log-list muted">กำลังโหลดรายการ...</div>
      </article>
    `;
  }

  function renderAccessSection() {
    return `
      <article id="batch-access" class="card-panel section-card">
        <div class="section-card-head">
          <h3>สิทธิ์การเข้าถึง batch</h3>
          <span class="badge-inline muted-badge" id="batchAccessRoleBadge">กำลังตรวจสอบ</span>
        </div>
        <p class="muted" id="batchAccessDescription">กำลังโหลดสิทธิ์และรายชื่อผู้ใช้...</p>
        <div id="batchAccessAdminZone"></div>
        <div class="access-toolbar">
          <span class="badge-inline muted-badge" id="batchAccessCount">0 คน</span>
          <button type="button" class="secondary-btn access-refresh-btn" data-access-action="refresh">รีเฟรชรายชื่อ</button>
        </div>
        <div id="batchAccessList" class="access-member-list">
          <div class="empty-state">กำลังโหลดรายการ...</div>
        </div>
      </article>
    `;
  }

  function renderPlaceholderSection(id, title, note) {
    return `
      <article id="${id}" class="card-panel section-card">
        <div class="section-card-head">
          <h3>${title}</h3>
          <span class="badge-inline muted-badge">ถัดไป</span>
        </div>
        <p class="muted">${note}</p>
      </article>
    `;
  }

  const MODULE_LABELS = {
    batch_manage: 'จัดการชุดสัตว์',
    egg_daily: 'บันทึกไข่รายวัน',
    feed_manage: 'จัดการอาหาร',
    egg_sale: 'ขายไข่',
    fish_feed_manage: 'จัดการอาหารปลา',
    fish_sale: 'ขายปลา'
  };

  function getModulesForCurrentBatch() {
    if (state.batch?.specie === 'fish') {
      return ['batch_manage', 'fish_feed_manage', 'fish_sale'];
    }
    return ['batch_manage', 'egg_daily', 'feed_manage', 'egg_sale'];
  }

  function permissionLabel(permission) {
    if (permission === 'write') return 'ดูและแก้ไข';
    if (permission === 'view') return 'ดูอย่างเดียว';
    return 'ไม่มีสิทธิ์';
  }

  function permissionBadgeClass(permission) {
    if (permission === 'write') return 'success';
    if (permission === 'view') return 'muted-badge';
    return 'danger-soft';
  }

  async function refreshAccessSection() {
    const list = document.getElementById('batchAccessList');
    const description = document.getElementById('batchAccessDescription');
    const roleBadge = document.getElementById('batchAccessRoleBadge');
    const countBadge = document.getElementById('batchAccessCount');
    const adminZone = document.getElementById('batchAccessAdminZone');
    if (!list || !description || !roleBadge || !countBadge || !adminZone || state.batch?.specie !== 'duck') return;
    if (state.access.loading) return;

    state.access.loading = true;
    list.innerHTML = '<div class="empty-state">กำลังโหลดรายการสิทธิ์...</div>';

    const response = await AppApi.post({ action: 'getBatchAccessList', batch_id: state.batch.id });
    state.access.loading = false;

    if (!response || response.status !== 'ok') {
      state.access.loaded = false;
      state.access.isAdmin = false;
      state.access.isOwner = false;
      state.access.members = [];
      roleBadge.className = 'badge-inline muted-badge';
      roleBadge.textContent = state.isOwner ? 'owner' : 'ไม่มีสิทธิ์';
      description.textContent = state.isOwner
        ? 'เจ้าของ batch เห็นรายชื่อผู้ที่มีสิทธิ์ และสามารถถอนสิทธิ์ได้ แต่ไม่สามารถ grant เองได้'
        : 'เฉพาะเจ้าของ batch หรือ admin เท่านั้นที่ดูและจัดการสิทธิ์ได้';
      adminZone.innerHTML = '';
      countBadge.textContent = '0 คน';
      list.innerHTML = `<div class="empty-state">${escapeHtml(response?.message || 'โหลดรายการสิทธิ์ไม่สำเร็จ')}</div>`;
      return;
    }

    state.access.loaded = true;
    state.access.isAdmin = !!response.is_admin;
    state.access.isOwner = !!response.is_owner;
    state.access.members = Array.isArray(response.members) ? response.members : [];

    roleBadge.className = `badge-inline ${state.access.isAdmin ? 'success' : (state.access.isOwner ? 'success' : 'muted-badge')}`;
    roleBadge.textContent = state.access.isAdmin ? 'admin' : (state.access.isOwner ? 'owner' : 'viewer');
    description.textContent = state.access.isAdmin
      ? 'admin สามารถกำหนดสิทธิ์รายโมดูลให้ผู้ใช้อื่นได้ ส่วน owner ถอนสิทธิ์ของผู้ที่มีอยู่แล้วได้'
      : (state.access.isOwner
          ? 'เจ้าของ batch สามารถดูรายชื่อผู้ที่มีสิทธิ์ และถอนสิทธิ์ออกจาก batch ของตนได้'
          : 'บัญชีนี้ไม่มีสิทธิ์จัดการรายชื่อผู้เข้าถึง batch นี้');

    adminZone.innerHTML = state.access.isAdmin ? renderAccessGrantForm() : '';
    countBadge.textContent = `${state.access.members.length} คน`;
    list.innerHTML = renderAccessMemberList();
  }

  function renderAccessGrantForm() {
    const moduleOptions = getModulesForCurrentBatch().map((moduleKey) => {
      return `<option value="${moduleKey}">${MODULE_LABELS[moduleKey] || moduleKey}</option>`;
    }).join('');

    return `
      <form id="batchAccessGrantForm" class="access-grant-form">
        <div class="access-grant-grid">
          <div>
            <label class="field-label" for="batchAccessEmail">อีเมลผู้ใช้</label>
            <input id="batchAccessEmail" name="target_email" type="email" placeholder="user@example.com" required />
          </div>
          <div>
            <label class="field-label" for="batchAccessModule">โมดูล</label>
            <select id="batchAccessModule" name="module_key">${moduleOptions}</select>
          </div>
          <div>
            <label class="field-label" for="batchAccessPermission">สิทธิ์</label>
            <select id="batchAccessPermission" name="permission">
              <option value="view">ดูอย่างเดียว</option>
              <option value="write">ดูและแก้ไข</option>
              <option value="none">ไม่มีสิทธิ์</option>
            </select>
          </div>
        </div>
        <button type="submit" class="secondary-btn access-save-btn">บันทึกสิทธิ์</button>
      </form>
    `;
  }

  function renderAccessMemberList() {
    if (!state.access.members.length) {
      return '<div class="empty-state">ยังไม่มีผู้ใช้คนอื่นได้รับสิทธิ์ใน batch นี้</div>';
    }

    const modules = getModulesForCurrentBatch();
    return state.access.members.map((member) => {
      const name = member.display_name || member.farm_name || member.email || member.user_id;
      const subtitleParts = [];
      if (member.email) subtitleParts.push(member.email);
      if (member.role) subtitleParts.push(`role: ${member.role}`);
      const canRevokeAll = state.access.isAdmin || state.access.isOwner;
      const moduleRows = modules.map((moduleKey) => {
        const permission = member.permissions?.[moduleKey] || 'none';
        const canRevokeModule = canRevokeAll && permission !== 'none' && !(member.is_admin && !state.access.isAdmin);
        return `
          <div class="access-module-row">
            <div>
              <strong>${MODULE_LABELS[moduleKey] || moduleKey}</strong>
              <div class="muted">${permissionLabel(permission)}</div>
            </div>
            <div class="access-module-actions">
              <span class="badge-inline ${permissionBadgeClass(permission)}">${permissionLabel(permission)}</span>
              ${canRevokeModule ? `<button type="button" class="access-link-btn" data-access-action="revoke-module" data-target-user-id="${member.user_id}" data-module-key="${moduleKey}">ถอนสิทธิ์โมดูล</button>` : ''}
            </div>
          </div>
        `;
      }).join('');

      return `
        <div class="access-member-card">
          <div class="access-member-head">
            <div>
              <div class="access-member-name">${escapeHtml(name)}</div>
              <div class="muted">${escapeHtml(subtitleParts.join(' • ') || member.user_id)}</div>
            </div>
            <div class="access-member-badges">
              ${member.is_admin ? '<span class="badge-inline success">admin</span>' : ''}
              ${canRevokeAll ? `<button type="button" class="secondary-btn access-revoke-all-btn" data-access-action="revoke-user" data-target-user-id="${member.user_id}">ถอนสิทธิ์ทั้งหมด</button>` : ''}
            </div>
          </div>
          <div class="access-module-list">${moduleRows}</div>
        </div>
      `;
    }).join('');
  }

  async function onBatchSectionsSubmit(event) {
    if (event.target?.id !== 'batchAccessGrantForm') return;
    event.preventDefault();
    if (!state.access.isAdmin) return alert('เฉพาะ admin เท่านั้นที่กำหนดสิทธิ์ได้');

    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    const original = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'กำลังบันทึก...';

    const response = await AppApi.post({
      action: 'upsertBatchModulePermission',
      batch_id: state.batch.id,
      target_email: form.target_email.value.trim(),
      module_key: form.module_key.value,
      permission: form.permission.value
    });

    submitButton.disabled = false;
    submitButton.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกสิทธิ์ไม่สำเร็จ');
    form.reset();
    if (form.permission) form.permission.value = 'view';
    refreshAccessSection();
  }

  async function onBatchSectionsClick(event) {
    const button = event.target.closest('[data-access-action]');
    if (!button) return;
    const action = button.dataset.accessAction;
    if (action === 'refresh') {
      refreshAccessSection();
      return;
    }

    if (action === 'revoke-user') {
      const targetUserId = button.dataset.targetUserId;
      if (!targetUserId) return;
      if (!confirm('ต้องการถอนสิทธิ์ทั้งหมดของผู้ใช้นี้ออกจาก batch ใช่ไหม')) return;
      const response = await AppApi.post({
        action: 'revokeBatchUserPermissions',
        batch_id: state.batch.id,
        target_user_id: targetUserId
      });
      if (!response || response.status !== 'ok') return alert(response?.message || 'ถอนสิทธิ์ไม่สำเร็จ');
      refreshAccessSection();
      return;
    }

    if (action === 'revoke-module') {
      const targetUserId = button.dataset.targetUserId;
      const moduleKey = button.dataset.moduleKey;
      if (!targetUserId || !moduleKey) return;
      if (!confirm('ต้องการถอนสิทธิ์ของโมดูลนี้ใช่ไหม')) return;
      const response = await AppApi.post({
        action: 'revokeBatchUserPermissions',
        batch_id: state.batch.id,
        target_user_id: targetUserId,
        module_key: moduleKey
      });
      if (!response || response.status !== 'ok') return alert(response?.message || 'ถอนสิทธิ์โมดูลไม่สำเร็จ');
      refreshAccessSection();
    }
  }

  function renderFab() {
    const root = document.getElementById('batchFabRoot');
    if (!root) return;
    if (state.batch?.specie !== 'duck' || state.permission !== 'write') {
      root.innerHTML = '';
      return;
    }

    root.innerHTML = `
      <div class="fab-radial" id="duckFab">
        <div class="fab-radial__actions">
          <button type="button" class="fab-radial__action fab-radial__action--1" data-fab-action="add" aria-label="เพิ่ม">เพิ่ม</button>
          <button type="button" class="fab-radial__action fab-radial__action--2" data-fab-action="dead" aria-label="ตาย">ตาย</button>
          <button type="button" class="fab-radial__action fab-radial__action--3" data-fab-action="sell" aria-label="ขาย">ขาย</button>
          <button type="button" class="fab-radial__action fab-radial__action--4" data-fab-action="edit" aria-label="แก้ไขข้อมูล">แก้ไขข้อมูล</button>
        </div>
        <button type="button" class="fab fab-radial__main" id="duckFabToggle" aria-label="open actions">＋</button>
      </div>
    `;

    document.getElementById('duckFabToggle')?.addEventListener('click', toggleFab);
    root.querySelectorAll('[data-fab-action]').forEach((button) => {
      button.addEventListener('click', () => handleFabAction(button.dataset.fabAction));
    });

    if (!state.outsideFabBound) {
      document.addEventListener('click', onOutsideFabClick);
      state.outsideFabBound = true;
    }
    updateFabVisibility();
  }

  function onOutsideFabClick(event) {
    const root = document.getElementById('duckFab');
    if (!root) return;
    if (!root.contains(event.target)) root.classList.remove('open');
  }
  function toggleFab() { document.getElementById('duckFab')?.classList.toggle('open'); }

  function updateFabVisibility() {
    const root = document.getElementById('batchFabRoot');
    const openedSheet = document.querySelector('.sheet.show:not(.hidden)');
    document.body.classList.toggle('sheet-open', !!openedSheet);
    if (!root) return;
    root.classList.toggle('fab-root-hidden', !!openedSheet);
    root.style.display = openedSheet ? 'none' : '';
    if (openedSheet) document.getElementById('duckFab')?.classList.remove('open');
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

    if (stockNote && stockNote.parentNode === form) {
      form.insertBefore(discountWrap, stockNote);
    } else {
      form.appendChild(discountWrap);
    }
  }

  function normalizeSaleLayout() {
    const addBtn = document.getElementById('addSaleItemBtn');
    const footer = document.querySelector('#saleBillSheet .sheet-footer');
    if (!addBtn || !footer) return;

    const originalHead = addBtn.parentElement;
    if (originalHead?.classList?.contains('sale-items-head')) {
      originalHead.classList.add('sale-items-head--compact');
    }

    let row = footer.querySelector('.sale-bill-footer-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'sale-bill-footer-row';
      footer.prepend(row);
    }

    const submitBtn = footer.querySelector('button[type="submit"], .sheet-footer button:not(#addSaleItemBtn)');
    addBtn.type = 'button';
    addBtn.classList.add('sale-bill-footer-add');

    if (!row.contains(addBtn)) row.appendChild(addBtn);
    if (submitBtn && !row.contains(submitBtn)) {
      submitBtn.classList.add('sale-bill-footer-primary');
      row.appendChild(submitBtn);
    }
  }

  function handleFabAction(action) {
    document.getElementById('duckFab')?.classList.remove('open');
    if (action === 'edit') return openEditSheet();
    if (action === 'sell') return openSaleBillSheet();
    openMovementSheet(action);
  }

  async function loadMovementLogs() {
    const response = await AppApi.post({ action: 'getBatchMovementLogs', batch_id: state.batch.id });
    if (!response || response.status !== 'ok') return renderLogList([], response?.message || 'โหลดประวัติไม่สำเร็จ');
    state.logs = response.logs || [];
    renderLogList(state.logs);
  }

  function renderLogList(logs, errorMessage) {
    const list = document.getElementById('movementLogList');
    const count = document.getElementById('movementLogCount');
    if (!list || !count) return;
    count.textContent = `${logs.length} รายการ`;
    if (errorMessage) return (list.innerHTML = `<div class="empty-state">${errorMessage}</div>`);
    if (!logs.length) return (list.innerHTML = '<div class="empty-state">ยังไม่มีรายการจัดการชุดเป็ด</div>');
    list.innerHTML = logs.map((log) => `
      <div class="log-item ${log.trans_type}">
        <div class="log-item__head"><strong>${movementTypeLabel(log.trans_type)}</strong><span>${log.log_date || '-'}</span></div>
        <div class="log-item__body">
          <div>จำนวน: <strong>${Number(log.qty || 0).toLocaleString()}</strong> ตัว</div>
          <div>ราคาต่อหน่วย: <strong>${Number(log.unit_price || 0).toLocaleString()}</strong> บาท</div>
          <div>โดย: <strong>${log.created_user_id || '-'}</strong></div>
        </div>
        <p class="muted">${log.remark || 'ไม่มีหมายเหตุ'}</p>
      </div>
    `).join('');
  }

  function openMovementSheet(mode) {
    state.movementMode = mode;
    const config = movementModeConfig[mode];
    if (!config) return;
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
    unitInput.required = false;
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
    if ((mode === 'dead') && qty > Number(state.batch.current_qty || 0)) return alert('จำนวนมากกว่าคงเหลือปัจจุบัน');

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
    if (response.batch) {
      state.batch = { ...state.batch, ...response.batch };
      renderHeader();
      renderSections();
      renderFab();
    }
    await loadMovementLogs();
    closeMovementSheet();
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

    if (response.updated) {
      state.batch = {
        ...state.batch,
        name: response.updated.batch_name,
        specie: response.updated.batch_specie,
        status: response.updated.batch_status,
        unit_price: response.updated.batch_unitprice,
        initial_qty: response.updated.batch_iniqty,
        current_qty: response.updated.batch_curqty,
        start_date: response.updated.batch_stdate,
        end_date: response.updated.batch_endate,
        remark: response.updated.batch_remark,
        image_url: response.updated.batch_imgurl,
        last_update: new Date().toISOString().slice(0, 10)
      };
      renderHeader();
      renderSections();
      renderFab();
      if (window.NavDrawer) {
        NavDrawer.setBatchContext({ id: state.batch.id, specie: state.batch.specie, permission: state.permission, isOwner: state.isOwner });
      }
    }
    closeEditSheet();
  }

  function openSaleBillSheet() {
    document.getElementById('saleBillDate').value = todayString();
    document.getElementById('saleBuyerName').value = '';
    document.getElementById('saleBillRemark').value = '';
    if (document.getElementById('saleDiscount')) document.getElementById('saleDiscount').value = '0';
    document.getElementById('saleBillStockNote').textContent = `คงเหลือปัจจุบัน ${Number(state.batch.current_qty || 0).toLocaleString()} ตัว • ชื่อฟาร์มบนบิล: ${state.farmName || '-'}`;
    document.getElementById('saleItemsList').innerHTML = '';
    appendSaleItemRow({ item_name: 'ขายเป็ด', qty: 1, unit: 'ตัว', unit_price: Number(state.batch.unit_price || 0) || 0 });
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
          <input class="sale-item-name" type="text" placeholder="เช่น เป็ดชุด A" value="${escapeHtml(seed.item_name || '')}" required>
        </div>
        <div>
          <label class="field-label">หน่วย</label>
          <input class="sale-item-unit" type="text" placeholder="ตัว" value="${escapeHtml(seed.unit || 'ตัว')}" required>
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
    if (!logDate) return alert('กรุณาเลือกวันที่ขาย'), null;
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
      if (!item_name || qty <= 0) return alert('กรุณากรอกชื่อรายการและจำนวนให้ถูกต้อง'), null;
      const line_total = round2(qty * unit_price);
      totalQty += qty;
      subTotal += line_total;
      items.push({ item_name, unit, qty, unit_price, line_total });
    }
    if (totalQty > Number(state.batch.current_qty || 0)) return alert('จำนวนขายรวมมากกว่าคงเหลือปัจจุบัน'), null;
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
    const footerHeight = (draft.remark ? 74 : 42) + 0;
    const discountRows = Number(draft.discount || 0) > 0 ? 2 : 1;
    const height = headerHeight + footerHeight + (draft.items.length * itemBlockHeight) + 120 + (discountRows * 20);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#163e73';

    const logo = await loadImage(draft.logo_url);
    const logoSize = 72;
    const logoX = Math.round((width - logoSize) / 2);
    ctx.drawImage(logo, logoX, 18, logoSize, logoSize);

    let y = 114;
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(draft.farm_name || 'FARM', width / 2, y);
    y += 22;
    ctx.font = 'bold 18px Arial';
    ctx.fillText('บิลเงินสด', width / 2, y);
    ctx.font = '13px Arial';
    ctx.fillStyle = '#444';
    y += 26;
    ctx.fillText(`บิลวันที่: ${formatThaiDate(draft.log_date)}`, width / 2, y);
    y += 18;
    ctx.fillText(`วันที่ออกบิล: ${formatThaiDate(new Date().toISOString().slice(0, 10))} เวลา ${draft.issue_date} น.`, width / 2, y);

    y += 18;
    drawDivider(ctx, padding, y, width - padding);
    y += 22;

    for (const item of draft.items) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#111';
      ctx.font = 'bold 15px Arial';
      wrapText(ctx, item.item_name, padding, y, width - (padding * 2), lineGap);
      y += 20;
      ctx.font = '13px Arial';
      ctx.fillStyle = '#555';
      wrapText(ctx, `${formatNumber(item.qty)} ${item.unit} × ${formatMoney(item.unit_price)}`, padding, y, width - (padding * 2) - 110, 16);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#111';
      ctx.font = 'bold 14px Arial';
      ctx.fillText(formatMoney(item.line_total), width - padding, y + 14);
      y += 34;
    }

    drawDivider(ctx, padding, y, width - padding);
    y += 24;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#444';
    ctx.font = '13px Arial';
    ctx.fillText(`รวมจำนวน ${formatNumber(draft.total_qty)} ตัว`, padding, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#111';
    ctx.font = '13px Arial';
    ctx.fillText(`รวม ${formatMoney(draft.sub_total || draft.grand_total)} บาท`, width - padding, y);
    y += 22;

    if (Number(draft.discount || 0) > 0) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#444';
      ctx.font = '13px Arial';
      ctx.fillText('ส่วนลด', padding, y);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#111';
      ctx.font = '13px Arial';
      ctx.fillText(`- ${formatMoney(draft.discount)} บาท`, width - padding, y);
      y += 20;
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#163e73';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('สุทธิหลังหักส่วนลด', padding, y);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#163e73';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`${formatMoney(draft.grand_total)} บาท`, width - padding, y);
    y += 28;

    if (draft.remark) {
      ctx.textAlign = 'left';
      ctx.fillStyle = '#444';
      ctx.font = '12px Arial';
      wrapText(ctx, `หมายเหตุ: ${draft.remark}`, padding, y, width - (padding * 2), 16);
      y += 30;
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.fillText('ขอบคุณที่ใช้บริการ', width / 2, y + 8);
    y += 10;

    return canvas.toDataURL('image/png');
  }


  async function downloadBillImage() {
    if (!state.billPreviewImage) return;
    const link = document.createElement('a');
    link.href = state.billPreviewImage;
    link.download = `cash-bill-${state.batch.id}-${Date.now()}.png`;
    link.click();
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

    if (response.batch) {
      state.batch = { ...state.batch, ...response.batch };
      renderHeader();
      renderSections();
      renderFab();
    }
    await loadMovementLogs();
    closeBillPreview();
    closeSaleBillSheet();
    alert(`บันทึกบิลสำเร็จ เลขที่ ${response.bill?.bill_id || '-'}`);
  }

  function showSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => {
      sheet.classList.add('show');
      updateFabVisibility();
    });
  }

  function hideSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    sheet.classList.remove('show');
    setTimeout(() => {
      sheet.classList.add('hidden');
      updateFabVisibility();
    }, 220);
  }

  function movementTypeLabel(type) {
    if (type === 'add') return 'เพิ่ม';
    if (type === 'dead') return 'ตาย';
    if (type === 'sell') return 'ขาย';
    return type || '-';
  }
  function displaySpecie(value) { if (value === 'duck') return 'เป็ด'; if (value === 'fish') return 'ปลา'; return value || '-'; }
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
      reader.onerror = reject; reader.onload = () => resolve(reader.result); reader.readAsDataURL(file);
    });
  }
  function resizeImage(base64, maxWidth, maxHeight, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onerror = reject;
      image.onload = () => {
        let { width, height } = image;
        const scale = Math.min(maxWidth / width, maxHeight / height, 1);
        width = Math.round(width * scale); height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.src = base64;
    });
  }
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });
  }
  function drawDivider(ctx, x1, y, x2) {
    ctx.strokeStyle = '#d0d7e2';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x1, y);
    ctx.lineTo(x2, y);
    ctx.stroke();
  }
  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || '').split(' ');
    let line = '';
    let lines = 0;
    for (let index = 0; index < words.length; index += 1) {
      const test = line ? `${line} ${words[index]}` : words[index];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        line = words[index];
        lines += 1;
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, x, y);
      lines += 1;
    }
    return Math.max(lines, 1);
  }
  function formatMoney(value) { return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function formatNumber(value) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  function round2(value) { return Math.round(Number(value || 0) * 100) / 100; }
  function nowDateTimeDisplay() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function pad2(value) { return String(value).padStart(2, '0'); }
  function formatThaiDate(dateStr) {
    const date = new Date(`${dateStr}T00:00:00`);
    const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear() + 543}`;
  }
  function escapeHtml(text) {
    return String(text || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  }

  return { bootstrap };
})();
