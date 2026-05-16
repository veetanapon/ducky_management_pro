
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
      report: `report.html?bid=${bid}`,
      farm_events: `batch-events.html?bid=${bid}`
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
      return `
        <a class="module-card module-menu-card" href="${href}" aria-label="${escapeHtml(compactTitle(card))} - ${escapeHtml(permissionLabel(card.permission))}">
          <span class="module-card-permission-icon ${badgeClass(card.permission)}" title="${escapeHtml(permissionLabel(card.permission))}" aria-hidden="true">${permissionIcon(card.permission)}</span>
          <span class="module-menu-icon" aria-hidden="true">${moduleIcon(card.key)}</span>
          <span class="module-card-title">${escapeHtml(compactTitle(card))}</span>
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


  function compactTitle(card) {
    const titles = {
      batch_manage: 'จัดการชุดสัตว์',
      feed_manage: 'อาหาร',
      egg_daily: 'บันทึกไข่',
      sale_manage: 'ขาย / บิล',
      batch_access: 'สิทธิ์ Batch',
      liff_routes: 'ลิงก์ LIFF',
      report: 'รายงาน',
      farm_events: 'กิจกรรม'
    };
    return titles[card.key] || card.title || 'โมดูล';
  }

  function moduleIcon(key) {
    const icons = {
      batch_manage: iconSvg('batch'),
      feed_manage: iconSvg('feed'),
      egg_daily: iconSvg('egg'),
      sale_manage: iconSvg('sale'),
      batch_access: iconSvg('shield'),
      liff_routes: iconSvg('link'),
      report: iconSvg('report'),
      farm_events: iconSvg('activity')
    };
    return icons[key] || iconSvg('grid');
  }

  function permissionIcon(value) {
    if (value === 'write') return iconSvg('pencil');
    if (value === 'view') return iconSvg('eye');
    return '';
  }

  function iconSvg(name) {
    const icons = {
      batch: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4h8l1 3h3v13H4V7h3l1-3Z"/><path d="M9 11h6"/><path d="M9 15h6"/><path d="M9 19h4"/></svg>`,
      feed: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18"/><path d="M12 8C8 8 6 6 5 3c4 0 6 2 7 5Z"/><path d="M12 13c4 0 6-2 7-5-4 0-6 2-7 5Z"/><path d="M12 18c-4 0-6-2-7-5 4 0 6 2 7 5Z"/></svg>`,
      egg: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c4.2 0 7 6.2 7 11.1A7 7 0 0 1 5 14.1C5 9.2 7.8 3 12 3Z"/><path d="M9.4 14.7c.6 1.2 1.5 1.8 2.6 1.8"/></svg>`,
      sale: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2V3Z"/><path d="M9 8h6"/><path d="M9 12h6"/><path d="M9 16h4"/></svg>`,
      report: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 17v-5"/><path d="M12 17V7"/><path d="M16 17v-8"/></svg>`,
      shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6l8-3Z"/><path d="m9 12 2 2 4-5"/></svg>`,
      link: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.1 0l1.4-1.4a5 5 0 0 0-7.1-7.1L10.5 5.4"/><path d="M14 11a5 5 0 0 0-7.1 0l-1.4 1.4a5 5 0 0 0 7.1 7.1l.9-.9"/></svg>`,
      activity: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h4l2-7 4 14 2-7h4"/><path d="M5 5h14v14H5Z"/></svg>`,
      grid: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7v7H4Z"/><path d="M13 4h7v7h-7Z"/><path d="M4 13h7v7H4Z"/><path d="M13 13h7v7h-7Z"/></svg>`,
      pencil: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m14 6 4 4"/></svg>`,
      eye: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.6-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.6 6.5-9.5 6.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>`
    };
    return icons[name] || icons.grid;
  }

  function displaySpecie(value) { return value === 'duck' ? 'เป็ด' : (value === 'fish' ? 'ปลา' : (value || '-')); }
  function permissionLabel(value) { return value === 'write' ? 'ดูและแก้ไข' : (value === 'view' ? 'ดูอย่างเดียว' : 'ไม่มีสิทธิ์'); }
  function badgeClass(value) { return value === 'write' ? 'success' : (value === 'view' ? 'muted-badge' : 'danger-soft'); }
  function escapeHtml(text) { return String(text || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m])); }

  return { bootstrap };
})();
