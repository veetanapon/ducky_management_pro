
window.BatchAccessPage = (() => {
  const state = {
    batch: null,
    isAdmin: false,
    isOwner: false,
    membersLoaded: false,
    members: [],
    currentPermissions: {}
  };
  const CACHE_TTL_MS = 90 * 1000;

  async function bootstrap() {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    bind();
    const batchId = new URLSearchParams(location.search).get('bid');
    if (!batchId) {
      document.getElementById('accessPageSubtitle').textContent = 'ไม่พบ batch id';
      return;
    }

    const detail = await AppApi.post({ action: 'getBatchFullDetail', batch_id: batchId });
    if (!detail || detail.status !== 'ok') {
      document.getElementById('accessPageSubtitle').textContent = detail?.message || 'โหลด batch ไม่สำเร็จ';
      return;
    }
    state.batch = detail.batch;
    state.isAdmin = !!detail.is_admin || AppAuth.getSession('role') === 'admin' || AppAuth.getSession('is_admin') === true || AppAuth.getSession('is_admin') === 'true';
    state.isOwner = !!detail.can_manage_access && !state.isAdmin ? !!detail.can_manage_access : String(detail.batch.user_id || '') === String(AppAuth.getSession?.('user_id') || '');
    if (window.NavDrawer) {
      NavDrawer.setBatchContext({
        id: state.batch.id,
        specie: state.batch.specie,
        permission: detail.permission || 'read',
        isOwner: state.isOwner,
        isAdmin: state.isAdmin,
        module_permissions: detail.module_permissions || {}
      });
    }
    renderStaticState();
    await loadAccessSummary();
  }

  function bind() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);
    document.getElementById('accessAdminFormCard')?.addEventListener('submit', onSubmit);
    document.getElementById('accessAdminFormCard')?.addEventListener('click', onClick);
    document.getElementById('accessMemberList')?.addEventListener('click', onClick);
    document.getElementById('accessLoadMembersBtn')?.addEventListener('click', loadMembersOnDemand);
  }

  function renderStaticState() {
    document.getElementById('accessPageTitle').textContent = `สิทธิ์การเข้าถึง • ${state.batch.name}`;
    document.getElementById('accessPageSubtitle').textContent = 'จัดการสิทธิ์ราย module ของ batch นี้';
    const roleBadge = document.getElementById('accessRoleBadge');
    const description = document.getElementById('accessDescription');
    const summary = document.getElementById('accessOwnerSummary');
    const formCard = document.getElementById('accessAdminFormCard');

    roleBadge.className = `badge-inline ${state.isAdmin ? 'success' : (state.isOwner ? 'success' : 'muted-badge')}`;
    roleBadge.textContent = state.isAdmin ? 'admin' : (state.isOwner ? 'owner' : 'viewer');
    description.textContent = state.isAdmin
      ? 'admin สามารถ grant / update สิทธิ์รายโมดูลได้ ส่วน owner สามารถถอนสิทธิ์ของผู้ใช้ที่อยู่ใน batch ได้'
      : (state.isOwner
          ? 'owner ของ batch นี้สามารถดูรายชื่อผู้มีสิทธิ์ และถอนสิทธิ์ออกได้ แต่ไม่สามารถ grant เองได้'
          : 'บัญชีนี้ไม่มีสิทธิ์จัดการรายการสิทธิ์ของ batch นี้');

    summary.innerHTML = `
      <div class="module-summary-card"><span class="module-summary-label">เจ้าของ batch</span><strong class="module-summary-value">${state.isOwner ? 'คุณ' : 'ไม่ใช่ owner'}</strong><span class="muted">owner มีสิทธิ์เต็มใน batch ของตัวเอง</span></div>
      <div class="module-summary-card"><span class="module-summary-label">ผู้มีสิทธิ์ทั้งหมด</span><strong class="module-summary-value">-</strong><span class="muted">รายชื่อจะโหลดเมื่อกดปุ่มแสดงรายการ</span></div>
    `;

    formCard.innerHTML = state.isAdmin ? renderGrantForm() : '<div class="empty-state">ส่วนกำหนดสิทธิ์ใช้ได้เฉพาะ admin</div>';
  }


  async function loadAccessSummary() {
    const countBadge = document.getElementById('accessCountBadge');
    if (!countBadge || !state.batch) return;

    const cachedMembers = readCache(memberCacheKey());
    if (Array.isArray(cachedMembers)) {
      countBadge.textContent = `${cachedMembers.length} คน`;
      updateSummaryCount(cachedMembers.length);
      return;
    }

    const response = await AppApi.post({ action: 'getBatchAccessSummary', batch_id: state.batch.id });
    if (!response || response.status !== 'ok') {
      countBadge.textContent = 'ยังไม่โหลด';
      return;
    }
    countBadge.textContent = `${Number(response.member_count || 0)} คน`;
    updateSummaryCount(Number(response.member_count || 0));
  }

  function updateSummaryCount(count) {
    const summary = document.getElementById('accessOwnerSummary');
    if (!summary) return;
    const cards = summary.querySelectorAll('.module-summary-card');
    if (cards[1]) {
      cards[1].innerHTML = `<span class="module-summary-label">ผู้มีสิทธิ์ทั้งหมด</span><strong class="module-summary-value">${count} คน</strong><span class="muted">รายชื่อจะโหลดเมื่อกดปุ่มแสดงรายการ</span>`;
    }
  }

  function renderGrantForm() {
    return `
      <div class="section-card-head"><h3>grant / update สิทธิ์</h3><span class="badge-inline success">admin only</span></div>
      <form id="accessGrantForm" class="form-stack">
        <label class="field-label">อีเมลผู้ใช้</label>
        <input type="email" name="target_email" id="accessTargetEmail" placeholder="user@example.com" required />
        <div class="access-action-row access-action-row--single compact-top">
          <button type="button" class="secondary-btn" id="accessLoadUserPermissionBtn">โหลดสิทธิ์ผู้ใช้นี้</button>
        </div>
        <div id="accessGrantMatrix" class="permission-card-grid permission-card-grid--3">
          ${renderPermissionCards(getModules(), {})}
        </div>
        <button type="submit">บันทึกสิทธิ์ทั้งหมด</button>
      </form>
    `;
  }

  async function loadTargetPermissions() {
    if (!state.isAdmin) return;
    const email = document.getElementById('accessTargetEmail')?.value.trim();
    if (!email) return alert('กรุณากรอกอีเมลผู้ใช้ก่อน');

    const members = readCache(memberCacheKey()) || await fetchMembers();
    const member = (members || []).find((item) => String(item.email || '').toLowerCase() === email.toLowerCase());
    state.currentPermissions = member?.permissions || {};
    document.getElementById('accessGrantMatrix').innerHTML = renderPermissionCards(getModules(), state.currentPermissions);
  }

  async function fetchMembers() {
    const response = await AppApi.post({ action: 'getBatchAccessList', batch_id: state.batch.id });
    if (!response || response.status !== 'ok') return null;
    const members = response.members || [];
    state.isAdmin = !!response.is_admin;
    state.isOwner = !!response.is_owner;
    writeCache(memberCacheKey(), members);
    return members;
  }

  async function loadMembersOnDemand() {
    const badge = document.getElementById('accessCountBadge');
    const list = document.getElementById('accessMemberList');
    badge.textContent = 'กำลังโหลด';
    list.innerHTML = '<div class="empty-state">กำลังโหลดรายการสิทธิ์...</div>';

    const members = readCache(memberCacheKey()) || await fetchMembers();
    if (!members) {
      badge.textContent = 'ผิดพลาด';
      list.innerHTML = '<div class="empty-state">โหลดข้อมูลสิทธิ์ไม่สำเร็จ</div>';
      return;
    }

    state.membersLoaded = true;
    state.members = members;
    badge.textContent = `${state.members.length} คน`;
    updateSummaryCount(state.members.length);
    list.innerHTML = renderMembers(state.members, state.isAdmin || state.isOwner);
  }

  function renderMembers(members, canRevoke) {
    if (!members.length) return '<div class="empty-state">ยังไม่มีผู้ใช้คนอื่นได้รับสิทธิ์ใน batch นี้</div>';
    const modules = getModules();
    return members.map((member) => `
      <div class="access-member-card">
        <div class="access-member-head">
          <div>
            <div class="access-member-name">${escapeHtml(member.display_name || member.farm_name || member.email || member.user_id)}</div>
            <div class="muted">${escapeHtml(member.email || member.user_id)}</div>
          </div>
          ${canRevoke ? `<button type="button" class="secondary-btn access-revoke-all-btn" data-target-user-id="${member.user_id}" data-action="revoke-all">ถอนสิทธิ์ทั้งหมด</button>` : ''}
        </div>
        <div class="access-module-grid access-module-grid--3">
          ${modules.map((module) => {
            const permission = (member.permissions && member.permissions[module.key]) || 'none';
            const revokeButton = canRevoke && permission !== 'none'
              ? `<button type="button" class="access-link-btn" data-target-user-id="${member.user_id}" data-module-key="${module.key}" data-action="revoke-module">ถอนสิทธิ์โมดูล</button>`
              : '<span class="muted">-</span>';
            return `
              <div class="access-module-card">
                <div class="access-module-card__title">${module.label}</div>
                <span class="badge-inline ${badgeClass(permission)}">${permissionLabel(permission)}</span>
                ${revokeButton}
              </div>`;
          }).join('')}
        </div>
      </div>
    `).join('');
  }

  function renderPermissionCards(modules, permissions) {
    return modules.map((module) => {
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

  async function onSubmit(event) {
    if (event.target?.id !== 'accessGrantForm') return;
    event.preventDefault();
    if (!state.isAdmin) return alert('เฉพาะ admin เท่านั้นที่กำหนดสิทธิ์ได้');

    const form = event.target;
    const email = form.target_email.value.trim();
    if (!email) return alert('กรุณากรอกอีเมลผู้ใช้');

    const button = form.querySelector('button[type="submit"]');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'กำลังบันทึก...';

    const selects = [...document.querySelectorAll('#accessGrantMatrix select[data-module-key]')];
    for (const select of selects) {
      const response = await AppApi.post({
        action: 'upsertBatchModulePermission',
        batch_id: state.batch.id,
        target_email: email,
        module_key: select.dataset.moduleKey,
        permission: select.value
      });
      if (!response || response.status !== 'ok') {
        button.disabled = false;
        button.textContent = original;
        return alert(response?.message || 'บันทึกสิทธิ์ไม่สำเร็จ');
      }
    }

    button.disabled = false;
    button.textContent = original;
    localStorage.removeItem(memberCacheKey());
    localStorage.removeItem(`ducky:batch-dashboard:${state.batch.id}`);
    alert('บันทึกสิทธิ์เรียบร้อย');
    await loadAccessSummary();
    if (state.membersLoaded) await loadMembersOnDemand();
  }

  async function onClick(event) {
    if (event.target?.id === 'accessLoadUserPermissionBtn') {
      event.preventDefault();
      await loadTargetPermissions();
      return;
    }

    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'revoke-all') {
      if (!confirm('ต้องการถอนสิทธิ์ทั้งหมดของผู้ใช้นี้ใช่ไหม')) return;
      const response = await AppApi.post({ action: 'revokeBatchUserPermissions', batch_id: state.batch.id, target_user_id: button.dataset.targetUserId });
      if (!response || response.status !== 'ok') return alert(response?.message || 'ถอนสิทธิ์ไม่สำเร็จ');
      localStorage.removeItem(memberCacheKey());
    localStorage.removeItem(`ducky:batch-dashboard:${state.batch.id}`);
      await loadMembersOnDemand();
      return;
    }
    if (action === 'revoke-module') {
      if (!confirm('ต้องการถอนสิทธิ์ของโมดูลนี้ใช่ไหม')) return;
      const response = await AppApi.post({ action: 'revokeBatchUserPermissions', batch_id: state.batch.id, target_user_id: button.dataset.targetUserId, module_key: button.dataset.moduleKey });
      if (!response || response.status !== 'ok') return alert(response?.message || 'ถอนสิทธิ์โมดูลไม่สำเร็จ');
      localStorage.removeItem(memberCacheKey());
    localStorage.removeItem(`ducky:batch-dashboard:${state.batch.id}`);
      await loadMembersOnDemand();
    }
  }

  function getModules() {
    return state.batch && state.batch.specie === 'fish'
      ? [
          { key: 'batch_manage', label: 'จัดการชุดสัตว์' },
          { key: 'fish_feed_manage', label: 'จัดการอาหาร' },
          { key: 'fish_sale', label: 'ขายออก / บิล' },
          { key: 'batch_access', label: 'สิทธิ์การเข้าถึง batch' },
          { key: 'liff_routes', label: 'จัดการลิงก์ LIFF' },
          { key: 'farm_events', label: 'กิจกรรม' },
          { key: 'report', label: 'รายงาน' }
        ]
      : [
          { key: 'batch_manage', label: 'จัดการชุดสัตว์' },
          { key: 'feed_manage', label: 'จัดการอาหาร' },
          { key: 'egg_daily', label: 'บันทึกไข่รายวัน' },
          { key: 'egg_sale', label: 'ขายออก / บิล' },
          { key: 'batch_access', label: 'สิทธิ์การเข้าถึง batch' },
          { key: 'liff_routes', label: 'จัดการลิงก์ LIFF' },
          { key: 'farm_events', label: 'กิจกรรม' },
          { key: 'report', label: 'รายงาน' }
        ];
  }
  function memberCacheKey() { return `ducky:access-members:${state.batch.id}`; }
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
