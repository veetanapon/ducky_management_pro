
window.BatchDashboardPage = (() => {
  const CACHE_TTL_MS = 60 * 1000;

  async function bootstrap() {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    bindBaseEvents();
    const batchId = new URLSearchParams(location.search).get('bid');
    if (!batchId) {
      document.getElementById('batchSubtitle').textContent = 'ไม่พบ batch id';
      return;
    }

    const cacheKey = `ducky:batch-dashboard:${batchId}`;
    const cached = readCache(cacheKey);
    if (cached) {
      renderAll(cached);
    }

    const response = await AppApi.post({ action: 'getBatchDashboardSummary', batch_id: batchId });
    if (!response || response.status !== 'ok') {
      if (!cached) document.getElementById('batchSubtitle').textContent = response?.message || 'โหลดข้อมูลไม่สำเร็จ';
      return;
    }
    writeCache(cacheKey, response);
    renderAll(response);
  }

  function bindBaseEvents() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);
  }

  function renderAll(response) {
    const batch = response.batch;
    renderHeader(batch, response.permission);
    renderCards(batch, response.cards || [], response.module_permissions || {}, response.is_owner, response.is_admin);
    if (window.NavDrawer) {
      NavDrawer.setBatchContext({
        id: batch.id,
        specie: batch.specie,
        permission: response.permission,
        isOwner: !!response.is_owner,
        isAdmin: !!response.is_admin,
        module_permissions: response.module_permissions || {}
      });
    }
  }

  function renderHeader(batch, permission) {
    document.getElementById('batchTitle').textContent = batch.name || 'Batch Dashboard';
    document.getElementById('batchSubtitle').textContent = 'ภาพรวมโมดูลของ batch นี้';
    document.getElementById('batchHeroImage').src = AppConfig.imageUrlFromId(batch.image_url);
    document.getElementById('batchSpecie').textContent = displaySpecie(batch.specie);
    document.getElementById('batchStatus').textContent = String(batch.status) === '1' ? 'Active' : 'Inactive';
    document.getElementById('batchPermission').textContent = permission === 'write' ? 'Read & Write' : 'Read Only';
    document.getElementById('batchDates').textContent = `${batch.start_date || '-'} → ${batch.end_date || '-'}`;
    document.getElementById('batchRemark').textContent = batch.remark || 'ไม่มีหมายเหตุ';
    document.getElementById('batchHeroQty').textContent = `${Number(batch.current_qty || 0).toLocaleString()} ตัว`;
    document.getElementById('batchHeroPrice').textContent = `${Number(batch.unit_price || 0).toLocaleString()} บาท/ตัว`;
  }

  function renderCards(batch, cards, modulePermissions, isOwner, isAdmin) {
    const container = document.getElementById('moduleCards');
    const bid = encodeURIComponent(batch.id);
    const links = {
      batch_manage: `module-batch-manage.html?bid=${bid}`,
      feed_manage: `module-feed.html?bid=${bid}`,
      egg_daily: `module-egg-daily.html?bid=${bid}`,
      sale_manage: `module-sale.html?bid=${bid}`,
      batch_access: `batch-access.html?bid=${bid}`,
      liff_routes: `liff-routes.html?bid=${bid}`,
      report: `report.html?bid=${bid}`
    };

    const visibleCards = (cards || []).filter((card) => {
      if (isOwner || isAdmin) return true;
      return card.permission && card.permission !== 'none';
    });

    if (!visibleCards.length) {
      container.innerHTML = '<div class="empty-state">ยังไม่มีโมดูลที่คุณมีสิทธิ์เข้าถึงใน batch นี้</div>';
      return;
    }

    container.innerHTML = visibleCards.map((card) => {
      const href = links[card.key] || `batch.html?bid=${bid}`;
      const lines = (card.lines || []).map((line) => `<div class="module-card-line">${escapeHtml(line)}</div>`).join('');
      return `
        <a class="module-card" href="${href}">
          <div class="module-card-head">
            <div>
              <div class="module-card-title">${escapeHtml(card.title)}</div>
              <div class="muted">${escapeHtml(card.subtitle || '')}</div>
            </div>
            <span class="badge-inline ${badgeClass(card.permission)}">${permissionLabel(card.permission)}</span>
          </div>
          <div class="module-card-body">${lines}</div>
        </a>
      `;
    }).join('');
  }

  function readCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - Number(parsed.savedAt || 0) > CACHE_TTL_MS) return null;
      return parsed.data || null;
    } catch (_) {
      return null;
    }
  }

  function writeCache(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data }));
    } catch (_) {}
  }

  function displaySpecie(value) { return value === 'duck' ? 'เป็ด' : (value === 'fish' ? 'ปลา' : (value || '-')); }
  function permissionLabel(value) { return value === 'write' ? 'ดูและแก้ไข' : (value === 'view' ? 'ดูอย่างเดียว' : 'ไม่มีสิทธิ์'); }
  function badgeClass(value) { return value === 'write' ? 'success' : (value === 'view' ? 'muted-badge' : 'danger-soft'); }
  function escapeHtml(text) { return String(text || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m])); }

  return { bootstrap };
})();
