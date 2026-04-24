window.IndexPage = (() => {
  function init() {
    const form = document.getElementById('batchForm');
    const closeButton = document.getElementById('closeSheetBtn');
    const refreshButton = document.getElementById('refreshBtn');
    const logoutButton = document.getElementById('logoutBtn');
    const searchInput = document.getElementById('batchSearch');
    const fab = document.getElementById('fabMain');
    const backdrop = document.querySelector('[data-close-sheet]');
    const fabMenu = document.getElementById('fabMenu');

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      await IndexBatchForm.submit();
    });

    closeButton?.addEventListener('click', IndexBatchForm.close);
    backdrop?.addEventListener('click', IndexBatchForm.close);
    refreshButton?.addEventListener('click', () => loadBatches({ forceRefresh: true }));
    logoutButton?.addEventListener('click', AppAuth.logout);
    fab?.addEventListener('click', handleFab);
    document.addEventListener('click', (event) => {
      if (!fabMenu?.contains(event.target) && event.target !== fab) {
        fabMenu?.classList.add('hidden');
      }
    });

    searchInput?.addEventListener('input', (event) => {
      AppState.patch('ui.search', event.target.value.trim().toLowerCase());
      render();
    });

    AppState.merge({
      ui: {
        fab: {
          actions: [{ id: 'add_batch', label: 'เพิ่มชุดสัตว์' }]
        }
      }
    });
  }

  async function bootstrap() {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    init();
    await loadBatches();

    const params = new URLSearchParams(location.search);
    if (params.get('action') === 'add_batch') {
      IndexBatchForm.open('add');
      params.delete('action');
      const next = params.toString();
      history.replaceState({}, '', `${location.pathname}${next ? `?${next}` : ''}${location.hash || ''}`);
    }
  }

  async function loadBatches({ forceRefresh = false } = {}) {
    const cache = AppCache.loadBatchCache();
    const now = Date.now();
    const cacheAge = cache.meta?.fetchedAt ? now - new Date(cache.meta.fetchedAt).getTime() : Infinity;
    const useCacheFirst = !forceRefresh && Array.isArray(cache.batches) && cache.batches.length > 0;

    if (useCacheFirst) {
      AppState.merge({
        batches: cache.batches,
        batchMeta: cache.meta || {},
        ui: { offlineMode: cacheAge > AppConfig.CACHE_MAX_AGE_MS }
      });
      render();
      if (cacheAge <= AppConfig.CACHE_MAX_AGE_MS) {
        return;
      }
    } else {
      renderSkeleton();
    }

    const response = await AppApi.post({
      action: 'getAllBatches',
      lastUpdate: !forceRefresh ? cache.meta?.lastUpdate || null : null
    });

    if (!response) return;
    if (response.hasUpdate === false) return;

    if (!Array.isArray(response.batches)) {
      if (!useCacheFirst) renderEmpty('ไม่พบข้อมูลชุดสัตว์');
      return;
    }

    const meta = {
      lastUpdate: response.lastUpdate || new Date().toISOString(),
      fetchedAt: new Date().toISOString()
    };

    AppState.merge({
      batches: response.batches,
      batchMeta: meta,
      ui: { offlineMode: false }
    });
    AppCache.saveBatchCache(response.batches, meta);
    render();
  }

  function render() {
    const list = document.getElementById('batchLists');
    const banner = document.getElementById('offlineBanner');
    const template = document.getElementById('batchCardTemplate');
    const state = AppState.get();
    const search = state.ui.search;

    if (!list || !template) return;
    list.innerHTML = '';

    if (state.ui.offlineMode && state.batches.length) banner.classList.remove('hidden');
    else banner.classList.add('hidden');

    const visible = state.batches.filter((item) => !search || String(item.batch_name || '').toLowerCase().includes(search));

    if (!visible.length) {
      renderEmpty('ไม่พบข้อมูลชุดสัตว์');
      return;
    }

    const fragment = document.createDocumentFragment();

    visible.forEach((batch) => {
      const node = template.content.cloneNode(true);
      const article = node.querySelector('.swipe-wrap');
      const content = node.querySelector('.swipe-content');
      const image = node.querySelector('img');
      const title = node.querySelector('.batch-title');
      const subtitle = node.querySelector('.batch-subtitle');
      const start = node.querySelector('.js-start');
      const current = node.querySelector('.js-current');
      const rightLabel = node.querySelector('.js-right-label');
      const rightValue = node.querySelector('.js-right-value');
      const editButton = node.querySelector('[data-action="edit"]');
      const deleteButton = node.querySelector('[data-action="delete"]');

      article.id = `card-${batch.batch_id}`;
      title.textContent = `${specieEmoji(batch.batch_specie)} ${batch.batch_name || '-'}`;
      subtitle.textContent = `เข้าวันที่ ${batch.batch_stdate || '-'}`;
      start.textContent = `แรกเข้า ${batch.batch_iniqty ?? 0}`;
      current.textContent = `เหลือ ${batch.batch_curqty ?? 0}`;
      rightLabel.textContent = `ไข่เฉลี่ย ${Number(batch.summary?.percent_dailyegg || 0).toFixed(2)}%`;
      rightValue.textContent = `${Number(batch.summary?.total_cost || 0).toFixed(2)} บาท`;
      image.src = AppConfig.imageUrlFromId(batch.batch_imgurl);
      image.alt = batch.batch_name || 'batch image';

      content.addEventListener('click', () => {
        location.href = `batch.html?bid=${encodeURIComponent(batch.batch_id)}`;
      });

      if (batch.permission !== 'write') {
        editButton.classList.add('hidden');
        deleteButton.classList.add('hidden');
      } else {
        editButton.addEventListener('click', (event) => {
          event.stopPropagation();
          IndexBatchForm.open('edit', batch);
        });

        deleteButton.addEventListener('click', async (event) => {
          event.stopPropagation();
          await removeBatch(batch.batch_id, article);
        });
      }

      bindSwipe(article, content, batch.permission === 'write');
      fragment.appendChild(node);
    });

    list.appendChild(fragment);
  }

  function renderSkeleton() {
    const list = document.getElementById('batchLists');
    if (!list) return;
    list.innerHTML = '';
    for (let index = 0; index < 3; index += 1) {
      list.insertAdjacentHTML('beforeend', `
        <div class="skeleton-wrap">
          <div class="batch-card skeleton-card">
            <div class="skeleton skeleton-thumb"></div>
            <div style="flex:1">
              <div class="skeleton skeleton-line long"></div>
              <div class="skeleton skeleton-line short"></div>
            </div>
          </div>
        </div>
      `);
    }
  }

  function renderEmpty(message) {
    const list = document.getElementById('batchLists');
    if (list) list.innerHTML = `<div class="empty-state">${message}</div>`;
  }

  function handleFab() {
    const actions = AppState.get().ui.fab.actions || [];
    if (!actions.length) return;
    if (actions.length === 1) {
      handleFabAction(actions[0].id);
      return;
    }

    const menu = document.getElementById('fabMenu');
    menu.innerHTML = actions.map((action) => `<button type="button" data-fab-action="${action.id}">${action.label}</button>`).join('');
    menu.classList.toggle('hidden');
    menu.querySelectorAll('[data-fab-action]').forEach((button) => {
      button.addEventListener('click', () => {
        handleFabAction(button.dataset.fabAction);
        menu.classList.add('hidden');
      });
    });
  }

  function handleFabAction(actionId) {
    if (actionId === 'add_batch') IndexBatchForm.open('add');
  }

  function updateBatchInState(updated) {
    const state = AppState.get();
    const next = state.batches.map((item) => item.batch_id === updated.batch_id ? { ...item, ...updated } : item);
    const meta = { ...(state.batchMeta || {}), fetchedAt: new Date().toISOString() };
    AppState.merge({ batches: next, batchMeta: meta });
    AppCache.saveBatchCache(next, meta);
    render();
  }

  async function removeBatch(batchId, element) {
    const confirmed = window.confirm('ลบชุดสัตว์นี้?');
    if (!confirmed) return;

    element.classList.add('removing');

    const response = await AppApi.post({ action: 'delete_batch', bid: batchId });
    if (!response || response.status !== 'ok') {
      element.classList.remove('removing');
      alert(response?.message || 'ลบข้อมูลไม่สำเร็จ');
      return;
    }

    const state = AppState.get();
    const next = state.batches.filter((item) => item.batch_id !== batchId);
    const meta = { ...(state.batchMeta || {}), fetchedAt: new Date().toISOString() };
    AppState.merge({ batches: next, batchMeta: meta });
    AppCache.saveBatchCache(next, meta);
    render();
  }

  function bindSwipe(article, content, allowSwipe) {
    if (!allowSwipe) return;
    let startX = 0;

    content.addEventListener('touchstart', (event) => {
      startX = event.touches[0].clientX;
    }, { passive: true });

    content.addEventListener('touchend', (event) => {
      const endX = event.changedTouches[0].clientX;
      const diff = endX - startX;
      content.style.transform = diff < -60 ? 'translateX(-128px)' : 'translateX(0)';
    }, { passive: true });

    article.addEventListener('mouseleave', () => {
      content.style.transform = 'translateX(0)';
    });
  }

  function specieEmoji(specie) {
    if (specie === 'duck') return '🦆';
    if (specie === 'fish') return '🐟';
    return '❓';
  }

  function prependBatchToState(created) {
    const state = AppState.get();
    const next = [created, ...(state.batches || [])];
    const meta = { ...(state.batchMeta || {}), fetchedAt: new Date().toISOString() };
    AppState.merge({ batches: next, batchMeta: meta });
    AppCache.saveBatchCache(next, meta);
    render();
  }

  return {
    bootstrap,
    loadBatches,
    updateBatchInState,
    prependBatchToState,
    render
  };
})();
