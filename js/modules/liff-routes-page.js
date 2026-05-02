window.LiffRoutesPage = (() => {
  const state = { batch: null, permission: 'none', isOwner: false, isAdmin: false, routes: [] };

  async function bootstrap() {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    bindEvents();
    const batchId = new URLSearchParams(location.search).get('bid');
    if (!batchId) {
      document.getElementById('liffRoutesSubtitle').textContent = 'ไม่พบ batch id';
      return;
    }
    await load(batchId);
  }

  function bindEvents() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);
    document.getElementById('newLiffRouteBtn')?.addEventListener('click', resetForm);
    document.getElementById('generateRouteKeyBtn')?.addEventListener('click', generateRouteKey);
    document.getElementById('liffRouteForm')?.addEventListener('submit', saveRoute);
    document.getElementById('liffRouteList')?.addEventListener('click', onListClick);
  }

  async function load(batchId) {
    const response = await AppApi.post({ action: 'getLiffBatchRoutePageData', batch_id: batchId });
    if (!response || response.status !== 'ok') {
      renderNoAccess(response?.message || 'ไม่มีสิทธิ์เข้าถึงเมนูนี้');
      return;
    }
    state.batch = response.batch;
    state.permission = response.permission || 'none';
    state.isOwner = !!response.is_owner;
    state.isAdmin = !!response.is_admin;
    state.routes = response.routes || [];
    renderAll(response);
  }

  function renderAll(response) {
    document.getElementById('liffRoutesSubtitle').textContent = `${state.batch.name || state.batch.id} • route สำหรับ LIFF`;
    const badge = document.getElementById('liffRoutesPermissionBadge');
    badge.className = `badge-inline ${badgeClass(state.permission)}`;
    badge.textContent = permissionLabel(state.permission);
    document.getElementById('liffRoutesHint').textContent = state.permission === 'write'
      ? 'สร้าง/แก้ไข route_key แล้ว copy LIFF link ให้ลูกน้อง หรือทำเป็น QR code ได้'
      : 'บัญชีนี้ดูและ copy link ได้ แต่แก้ไข route ไม่ได้';
    document.getElementById('liffRouteEditorCard')?.classList.toggle('hidden', state.permission !== 'write');
    renderList();
    if (window.NavDrawer) {
      NavDrawer.setBatchContext({
        id: state.batch.id,
        specie: state.batch.specie,
        permission: response.batch_permission || 'read',
        isOwner: state.isOwner,
        isAdmin: state.isAdmin,
        module_permissions: response.module_permissions || { liff_routes: state.permission }
      });
    }
  }

  function renderNoAccess(message) {
    document.getElementById('liffRoutesSubtitle').textContent = message;
    document.getElementById('liffRoutesPermissionBadge').textContent = 'no access';
    document.getElementById('liffRouteEditorCard')?.classList.add('hidden');
    document.getElementById('liffRouteList').innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
  }

  function buildClientUrl(route) {
    const key = encodeURIComponent(route.route_key || '');
    if (window.AppConfig?.LIFF_ID) return `https://liff.line.me/${encodeURIComponent(AppConfig.LIFF_ID)}?route=${key}`;
    if (window.AppConfig?.LIFF_WORKER_URL) {
      const sep = AppConfig.LIFF_WORKER_URL.includes('?') ? '&' : '?';
      return `${AppConfig.LIFF_WORKER_URL}${sep}route=${key}`;
    }
    return route.line_liff_url || route.worker_url || `?route=${key}`;
  }

  function renderList() {
    document.getElementById('liffRouteCountBadge').textContent = `${state.routes.length} รายการ`;
    const list = document.getElementById('liffRouteList');
    if (!state.routes.length) {
      list.innerHTML = '<div class="empty-state">ยังไม่มีลิงก์ LIFF สำหรับ batch นี้</div>';
      return;
    }
    list.innerHTML = state.routes.map((route) => {
      const url = buildClientUrl(route);
      const activeText = Number(route.is_active) ? 'ใช้งานอยู่' : 'ปิดใช้งาน';
      const activeClass = Number(route.is_active) ? 'success' : 'muted-badge';
      return `
        <article class="price-set-card ${Number(route.is_active) ? '' : 'is-disabled'}" data-route-id="${escapeHtml(route.id)}">
          <div class="price-set-card__head">
            <div>
              <div class="price-set-card__title">${escapeHtml(route.route_name || route.route_key)}</div>
              <div class="muted">${escapeHtml(route.route_key)}</div>
            </div>
            <span class="badge-inline ${activeClass}">${activeText}</span>
          </div>
          <div class="price-set-card__meta">
            <span>อัปเดต ${escapeHtml(route.last_update || '-')}</span>
            ${route.line_to_id ? `<span>LINE: ${escapeHtml(route.line_to_id)}</span>` : '<span>ยังไม่ตั้ง LINE</span>'}
            ${route.line_to_id ? '<span>แจ้งสำเร็จ: เปิดอัตโนมัติ</span>' : '<span>แจ้งสำเร็จ: ต้องใส่ LINE ID</span>'}
            <span>error: ส่งเมลหา admin</span>
            ${route.remark ? `<span>${escapeHtml(route.remark)}</span>` : ''}
          </div>
          <input type="text" readonly value="${escapeHtml(url)}" class="liff-route-url-input" />
          <div class="access-action-row">
            <button type="button" class="secondary-btn" data-action="copy" data-url="${escapeHtml(url)}">Copy link</button>
            ${state.permission === 'write' ? `<button type="button" class="secondary-btn" data-action="edit" data-route-id="${escapeHtml(route.id)}">แก้ไข</button>` : ''}
            ${state.permission === 'write' && Number(route.is_active) ? `<button type="button" class="secondary-btn item-price-danger-btn" data-action="deactivate" data-route-id="${escapeHtml(route.id)}">ปิดใช้งาน</button>` : ''}
          </div>
        </article>`;
    }).join('');
  }

  async function generateRouteKey() {
    const fallback = `rt_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-6)}`;
    if (!state.batch?.id) {
      document.getElementById('liffRouteKey').value = fallback;
      return;
    }
    const response = await AppApi.post({ action: 'generateLiffRouteKey', batch_id: state.batch.id });
    document.getElementById('liffRouteKey').value = response?.status === 'ok' ? response.route_key : fallback;
  }

  async function saveRoute(event) {
    event.preventDefault();
    if (state.permission !== 'write') return alert('ไม่มีสิทธิ์แก้ไขลิงก์');
    const button = document.getElementById('saveLiffRouteBtn');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post({
      action: 'saveLiffBatchRoute',
      batch_id: state.batch.id,
      id: document.getElementById('liffRouteId').value,
      route_name: document.getElementById('liffRouteName').value,
      route_key: document.getElementById('liffRouteKey').value,
      remark: document.getElementById('liffRouteRemark').value,
      line_to_id: document.getElementById('liffLineToId')?.value || '',
      notify_success: 1,
      notify_error: 0,
      is_active: document.getElementById('liffRouteActive').checked ? 1 : 0
    });
    button.disabled = false;
    button.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกลิงก์ไม่สำเร็จ');
    state.routes = response.routes || [];
    resetForm();
    renderList();
    localStorage.removeItem(`ducky:batch-dashboard:${state.batch.id}`);
  }

  async function onListClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'copy') {
      await copyText(button.dataset.url || '');
      button.textContent = 'Copied';
      setTimeout(() => { button.textContent = 'Copy link'; }, 1000);
      return;
    }
    if (action === 'edit') {
      const route = state.routes.find((item) => String(item.id) === String(button.dataset.routeId));
      if (route) fillForm(route);
      return;
    }
    if (action === 'deactivate') {
      if (!confirm('ต้องการปิดใช้งานลิงก์นี้ใช่ไหม')) return;
      const response = await AppApi.post({ action: 'deactivateLiffBatchRoute', batch_id: state.batch.id, route_id: button.dataset.routeId });
      if (!response || response.status !== 'ok') return alert(response?.message || 'ปิดใช้งานไม่สำเร็จ');
      state.routes = response.routes || [];
      renderList();
      localStorage.removeItem(`ducky:batch-dashboard:${state.batch.id}`);
    }
  }

  function fillForm(route) {
    document.getElementById('liffRouteEditorTitle').textContent = 'แก้ไขลิงก์ LIFF';
    document.getElementById('liffRouteId').value = route.id || '';
    document.getElementById('liffRouteName').value = route.route_name || '';
    document.getElementById('liffRouteKey').value = route.route_key || '';
    document.getElementById('liffLineToId').value = route.line_to_id || '';
    document.getElementById('liffRouteRemark').value = route.remark || '';
    document.getElementById('liffRouteActive').checked = Number(route.is_active) === 1;
    document.getElementById('liffRouteEditorCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function resetForm() {
    document.getElementById('liffRouteEditorTitle').textContent = 'สร้างลิงก์ใหม่';
    document.getElementById('liffRouteForm')?.reset();
    document.getElementById('liffRouteId').value = '';
    document.getElementById('liffRouteActive').checked = true;
  }

  async function copyText(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const input = document.createElement('textarea');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      input.remove();
    }
  }

  function permissionLabel(value) { return value === 'write' ? 'ดูและแก้ไข' : (value === 'view' ? 'ดูอย่างเดียว' : 'ไม่มีสิทธิ์'); }
  function badgeClass(value) { return value === 'write' ? 'success' : (value === 'view' ? 'muted-badge' : 'danger-soft'); }
  function escapeHtml(text) { return String(text || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m])); }

  return { bootstrap };
})();
