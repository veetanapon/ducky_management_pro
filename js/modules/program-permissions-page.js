window.ProgramPermissionsPage = (() => {
  const state = {
    users: [],
    menuDefs: [],
    selectedUser: null,
    permissions: {}
  };

  async function bootstrap() {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    bind();
    await loadOptions();
    if (window.NavDrawer) NavDrawer.setBatchContext({ isAdmin: true, module_permissions: {}, batch: null });
  }

  function bind() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);
    document.getElementById('programUserSearch')?.addEventListener('change', onUserChange);
    document.getElementById('programPermissionForm')?.addEventListener('submit', onSubmit);
    document.getElementById('programInitSheetBtn')?.addEventListener('click', initializeSheet);
    document.getElementById('programMigrateBtn')?.addEventListener('click', migrateExistingUsers);
  }

  async function loadOptions() {
    setSubtitle('กำลังโหลดตัวเลือก...');
    const res = await MenuPermissionApi.adminOptions();
    if (!res || res.status !== 'ok') {
      setSubtitle(res?.message || 'โหลดตัวเลือกไม่สำเร็จ');
      return;
    }
    state.users = res.users || [];
    state.menuDefs = res.menu_defs || [];
    renderUserList();
    setSubtitle('เลือก user เพื่อกำหนดสิทธิ์เมนูหลัก');
  }

  function renderUserList() {
    const list = document.getElementById('programUserList');
    if (!list) return;
    list.innerHTML = state.users.map((user) => `<option value="${escapeHtml(user.label)}"></option>`).join('');
  }

  async function onUserChange() {
    state.selectedUser = resolveUser();
    if (!state.selectedUser) {
      state.permissions = {};
      renderMatrix(null);
      return;
    }
    setSubtitle('กำลังโหลดสิทธิ์ของผู้ใช้...');
    const res = await MenuPermissionApi.userPermissions(state.selectedUser.id);
    if (!res || res.status !== 'ok') {
      setSubtitle(res?.message || 'โหลดสิทธิ์ไม่สำเร็จ');
      renderMatrix(null, res?.message || 'โหลดสิทธิ์ไม่สำเร็จ');
      return;
    }
    state.permissions = res.permissions || res.menu_permissions || {};
    state.menuDefs = res.menu_defs || state.menuDefs;
    renderMatrix(state.permissions);
    setSubtitle(`กำลังแก้สิทธิ์ของ ${state.selectedUser.email || state.selectedUser.id}`);
  }

  function renderMatrix(permissions, emptyMessage) {
    const matrix = document.getElementById('programPermissionMatrix');
    if (!matrix) return;
    if (!state.selectedUser || !permissions) {
      matrix.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage || 'เลือก user ก่อนเพื่อแสดงสิทธิ์เมนูหลัก')}</div>`;
      return;
    }
    const defs = state.menuDefs.length ? state.menuDefs : [
      { key: 'batch_list', label: 'รายการชุดสัตว์' },
      { key: 'feed_order_bills', label: 'บิลอาหารกลาง' },
      { key: 'batch_create', label: 'เพิ่มชุดสัตว์' }
    ];
    matrix.innerHTML = defs.map((menu) => {
      const current = normalizePermission(permissions[menu.key]);
      return `
        <div class="permission-card">
          <div class="permission-card__title">${escapeHtml(menu.label)}</div>
          <div class="permission-card__key muted">${escapeHtml(menu.key)}</div>
          <p class="muted" style="margin:.35rem 0 .75rem">${escapeHtml(menu.description || '')}</p>
          <select data-menu-key="${escapeHtml(menu.key)}" class="permission-card__select">
            <option value="none" ${current === 'none' ? 'selected' : ''}>ไม่มีสิทธิ์</option>
            <option value="view" ${current === 'view' ? 'selected' : ''}>ดูอย่างเดียว</option>
            <option value="write" ${current === 'write' ? 'selected' : ''}>ดูและแก้ไข</option>
          </select>
        </div>`;
    }).join('');
  }

  async function onSubmit(event) {
    event.preventDefault();
    const user = resolveUser();
    if (!user) return alert('กรุณาเลือกผู้ใช้');
    const button = document.getElementById('programPermissionSaveBtn');
    const original = button?.textContent || 'บันทึกสิทธิ์เมนูหลัก';
    if (button) {
      button.disabled = true;
      button.textContent = 'กำลังบันทึก...';
    }

    const permissions = {};
    document.querySelectorAll('#programPermissionMatrix select[data-menu-key]').forEach((select) => {
      permissions[select.dataset.menuKey] = select.value;
    });

    const res = await MenuPermissionApi.saveUserPermissions(user.id, permissions);
    if (button) {
      button.disabled = false;
      button.textContent = original;
    }
    if (!res || res.status !== 'ok') return alert(res?.message || 'บันทึกสิทธิ์ไม่สำเร็จ');
    alert('บันทึกสิทธิ์เมนูหลักเรียบร้อย');
    await onUserChange();
  }

  async function initializeSheet() {
    const res = await MenuPermissionApi.ensureSheetReady();
    if (!res || res.status !== 'ok') return alert(res?.message || 'สร้าง/ตรวจชีทไม่สำเร็จ');
    alert('ตรวจชีท user_menu_permissions เรียบร้อย');
    await loadOptions();
  }

  async function migrateExistingUsers() {
    const confirmed = confirm('ฟังก์ชันนี้จะให้สิทธิ์ write ครบทุกเมนูกับ user ที่ auth_status = allow ทั้งหมด ต้องการทำต่อไหม?');
    if (!confirmed) return;
    const res = await MenuPermissionApi.migrateExistingUsers();
    if (!res || res.status !== 'ok') return alert(res?.message || 'migration ไม่สำเร็จ');
    alert(`อัปเดต user ${res.users_updated || 0} คน / rows ${res.rows_updated || 0} รายการ`);
    await onUserChange();
  }

  function resolveUser() {
    const value = document.getElementById('programUserSearch')?.value || '';
    return state.users.find((user) => user.label === value) || null;
  }

  function normalizePermission(value) {
    return MenuPermissionApi?.normalizePermission?.(value) || (value === 'write' || value === 'view' ? value : 'none');
  }

  function setSubtitle(text) {
    const el = document.getElementById('programPermissionSubtitle');
    if (el) el.textContent = text || '';
  }

  function escapeHtml(text) {
    return String(text || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));
  }

  return { bootstrap };
})();
