
window.AdminPermissionsPage = (() => {
  const state = {
    users: [],
    batches: [],
    selectedBatch: null,
    selectedUser: null,
    currentPermissions: {},
    grantedMembers: [],
    grantedLoaded: false
  };
  const CACHE_TTL_MS = 90 * 1000;

  async function bootstrap() {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    bindBaseEvents();

    const cached = readCache('ducky:admin:options');
    if (cached) {
      state.users = cached.users || [];
      state.batches = cached.batches || [];
      renderOptionLists();
    }

    const response = await AppApi.post({ action: 'getPermissionAdminOptions' });
    if (!response || response.status !== 'ok') {
      if (!cached) document.getElementById('adminPermissionSubtitle').textContent = response?.message || 'โหลดตัวเลือกไม่สำเร็จ';
      return;
    }
    state.users = response.users || [];
    state.batches = response.batches || [];
    writeCache('ducky:admin:options', { users: state.users, batches: state.batches });
    renderOptionLists();

    if (window.NavDrawer) {
      NavDrawer.setBatchContext({ isAdmin: true, module_permissions: {}, batch: null });
    }
  }

  function bindBaseEvents() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);
    document.getElementById('adminBatchSearch')?.addEventListener('change', onSelectionChange);
    document.getElementById('adminUserSearch')?.addEventListener('change', onSelectionChange);
    document.getElementById('adminPermissionForm')?.addEventListener('submit', onSubmit);
    document.getElementById('adminLoadGrantedBtn')?.addEventListener('click', loadGrantedMembers);
  }

  function renderOptionLists() {
    document.getElementById('adminBatchList').innerHTML = state.batches.map((batch) => `<option value="${escapeHtml(batch.label)}"></option>`).join('');
    document.getElementById('adminUserList').innerHTML = state.users.map((user) => `<option value="${escapeHtml(user.label)}"></option>`).join('');
  }

  async function onSelectionChange() {
    state.selectedBatch = resolveBatch();
    state.selectedUser = resolveUser();
    state.grantedLoaded = false;
    state.grantedMembers = [];
    document.getElementById('adminGrantedCountBadge').textContent = 'ยังไม่โหลด';
    document.getElementById('adminGrantedList').innerHTML = '<div class="empty-state">ยังไม่ได้ดึงข้อมูล</div>';

    const matrix = document.getElementById('adminPermissionMatrix');
    if (!state.selectedBatch || !state.selectedUser) {
      state.currentPermissions = {};
      matrix.innerHTML = '<div class="empty-state">เลือก batch และ user ก่อนเพื่อแสดงสิทธิ์รายโมดูล</div>';
      return;
    }

    const cache = readCache(memberCacheKey(state.selectedBatch.id));
    const member = cache?.find((item) => String(item.user_id) === String(state.selectedUser.id));
    state.currentPermissions = member?.permissions || {};
    renderPermissionGrid(matrix, getModules(state.selectedBatch.specie), state.currentPermissions);

    if (!member) {
      const perms = await fetchUserPermissions(state.selectedBatch.id, state.selectedUser.id);
      state.currentPermissions = perms;
      renderPermissionGrid(matrix, getModules(state.selectedBatch.specie), perms);
    }
  }

  async function fetchUserPermissions(batchId, userId) {
    const access = await AppApi.post({ action: 'getBatchAccessList', batch_id: batchId });
    const members = access && access.status === 'ok' ? (access.members || []) : [];
    if (members.length) writeCache(memberCacheKey(batchId), members);
    const member = members.find((item) => String(item.user_id) === String(userId));
    return member?.permissions || {};
  }

  async function onSubmit(event) {
    event.preventDefault();
    const batch = resolveBatch();
    const user = resolveUser();
    if (!batch || !user) return alert('กรุณาเลือก batch และ user');
    const button = document.getElementById('adminPermissionSaveBtn');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'กำลังบันทึก...';

    const selects = [...document.querySelectorAll('#adminPermissionMatrix select[data-module-key]')];
    for (const select of selects) {
      const response = await AppApi.post({
        action: 'upsertBatchModulePermission',
        batch_id: batch.id,
        target_user_id: user.id,
        module_key: select.dataset.moduleKey,
        permission: select.value
      });
      if (!response || response.status !== 'ok') {
        button.disabled = false;
        button.textContent = original;
        return alert(response?.message || `บันทึกสิทธิ์ ${select.dataset.moduleKey} ไม่สำเร็จ`);
      }
    }

    button.disabled = false;
    button.textContent = original;
    localStorage.removeItem(memberCacheKey(batch.id));
    localStorage.removeItem(`ducky:batch-dashboard:${batch.id}`);
    alert('บันทึกสิทธิ์เรียบร้อย');
    if (state.grantedLoaded) await loadGrantedMembers();
  }

  async function loadGrantedMembers() {
    const batch = resolveBatch();
    if (!batch) return alert('กรุณาเลือก batch ก่อน');
    const badge = document.getElementById('adminGrantedCountBadge');
    const list = document.getElementById('adminGrantedList');
    const hint = document.getElementById('adminGrantedHint');
    badge.textContent = 'กำลังโหลด';
    list.innerHTML = '<div class="empty-state">กำลังโหลดรายการสิทธิ์...</div>';

    let members = readCache(memberCacheKey(batch.id));
    if (!members) {
      const response = await AppApi.post({ action: 'getBatchAccessList', batch_id: batch.id });
      if (!response || response.status !== 'ok') {
        badge.textContent = 'ผิดพลาด';
        list.innerHTML = `<div class="empty-state">${escapeHtml(response?.message || 'โหลดรายการสิทธิ์ไม่สำเร็จ')}</div>`;
        return;
      }
      members = response.members || [];
      writeCache(memberCacheKey(batch.id), members);
    }

    state.grantedLoaded = true;
    state.grantedMembers = members || [];
    badge.textContent = `${state.grantedMembers.length} คน`;
    hint.textContent = 'แสดงเฉพาะผู้ที่ถูก grant สิทธิ์ใน batch ที่เลือก';
    list.innerHTML = renderMemberCards(state.grantedMembers, batch.specie, true, batch.id);
  }

  function renderPermissionGrid(container, modules, permissions) {
    container.innerHTML = modules.map((module) => {
      const current = permissions[module.key] || 'none';
      return `
        <div class="permission-card">
          <div class="permission-card__title">${module.label}</div>
          <div class="permission-card__key muted">${module.key}</div>
          <select data-module-key="${module.key}" class="permission-card__select">
            <option value="none" ${current === 'none' ? 'selected' : ''}>ไม่มีสิทธิ์</option>
            <option value="view" ${current === 'view' ? 'selected' : ''}>ดูอย่างเดียว</option>
            <option value="write" ${current === 'write' ? 'selected' : ''}>ดูและแก้ไข</option>
          </select>
        </div>`;
    }).join('');
  }

  function renderMemberCards(members, specie, canRevoke, batchId) {
    if (!members.length) return '<div class="empty-state">ยังไม่มีผู้ใช้คนอื่นได้รับสิทธิ์ใน batch นี้</div>';
    const modules = getModules(specie);
    return members.map((member) => {
      const name = member.display_name || member.farm_name || member.email || member.user_id;
      const subtitle = [member.email || '', member.role ? `role: ${member.role}` : ''].filter(Boolean).join(' • ');
      return `
        <div class="access-member-card">
          <div class="access-member-head">
            <div>
              <div class="access-member-name">${escapeHtml(name)}</div>
              <div class="muted">${escapeHtml(subtitle || member.user_id)}</div>
            </div>
            <div class="access-member-badges">
              ${member.is_admin ? '<span class="badge-inline success">admin</span>' : ''}
              ${canRevoke ? `<button type="button" class="secondary-btn access-revoke-all-btn" data-target-user-id="${member.user_id}" data-batch-id="${batchId}" data-action="admin-revoke-all">ถอนสิทธิ์ทั้งหมด</button>` : ''}
            </div>
          </div>
          <div class="access-module-grid access-module-grid--3">
            ${modules.map((module) => {
              const permission = (member.permissions && member.permissions[module.key]) || 'none';
              const revokeButton = canRevoke && permission !== 'none'
                ? `<button type="button" class="access-link-btn" data-target-user-id="${member.user_id}" data-batch-id="${batchId}" data-module-key="${module.key}" data-action="admin-revoke-module">ถอนสิทธิ์โมดูล</button>`
                : '<span class="muted">-</span>';
              return `
                <div class="access-module-card">
                  <div class="access-module-card__title">${module.label}</div>
                  <span class="badge-inline ${badgeClass(permission)}">${permissionLabel(permission)}</span>
                  ${revokeButton}
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }).join('');
  }

  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'admin-revoke-all') {
      if (!confirm('ต้องการถอนสิทธิ์ทั้งหมดของผู้ใช้นี้ใช่ไหม')) return;
      const response = await AppApi.post({ action: 'revokeBatchUserPermissions', batch_id: button.dataset.batchId, target_user_id: button.dataset.targetUserId });
      if (!response || response.status !== 'ok') return alert(response?.message || 'ถอนสิทธิ์ไม่สำเร็จ');
      localStorage.removeItem(memberCacheKey(button.dataset.batchId));
      localStorage.removeItem(`ducky:batch-dashboard:${button.dataset.batchId}`);
      await loadGrantedMembers();
      return;
    }
    if (action === 'admin-revoke-module') {
      if (!confirm('ต้องการถอนสิทธิ์ของโมดูลนี้ใช่ไหม')) return;
      const response = await AppApi.post({ action: 'revokeBatchUserPermissions', batch_id: button.dataset.batchId, target_user_id: button.dataset.targetUserId, module_key: button.dataset.moduleKey });
      if (!response || response.status !== 'ok') return alert(response?.message || 'ถอนสิทธิ์โมดูลไม่สำเร็จ');
      localStorage.removeItem(memberCacheKey(button.dataset.batchId));
      localStorage.removeItem(`ducky:batch-dashboard:${button.dataset.batchId}`);
      await loadGrantedMembers();
    }
  });

  function resolveBatch() {
    const value = document.getElementById('adminBatchSearch')?.value || '';
    return state.batches.find((batch) => batch.label === value) || null;
  }
  function resolveUser() {
    const value = document.getElementById('adminUserSearch')?.value || '';
    return state.users.find((user) => user.label === value) || null;
  }
  function getModules(specie) {
    return specie === 'fish'
      ? [
          { key: 'batch_manage', label: 'จัดการชุดสัตว์' },
          { key: 'fish_feed_manage', label: 'จัดการอาหาร' },
          { key: 'fish_sale', label: 'ขายออก / บิล' },
          { key: 'batch_access', label: 'สิทธิ์การเข้าถึง batch' },
          { key: 'report', label: 'รายงาน' }
        ]
      : [
          { key: 'batch_manage', label: 'จัดการชุดสัตว์' },
          { key: 'feed_manage', label: 'จัดการอาหาร' },
          { key: 'egg_daily', label: 'บันทึกไข่รายวัน' },
          { key: 'egg_sale', label: 'ขายออก / บิล' },
          { key: 'batch_access', label: 'สิทธิ์การเข้าถึง batch' },
          { key: 'report', label: 'รายงาน' }
        ];
  }
  function memberCacheKey(batchId) { return `ducky:access-members:${batchId}`; }
  function permissionLabel(value) { return value === 'write' ? 'ดูและแก้ไข' : (value === 'view' ? 'ดูอย่างเดียว' : 'ไม่มีสิทธิ์'); }
  function badgeClass(value) { return value === 'write' ? 'success' : (value === 'view' ? 'muted-badge' : 'danger-soft'); }
  function escapeHtml(text) { return String(text || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m])); }
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

  return { bootstrap };
})();
