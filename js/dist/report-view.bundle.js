/* ===== js/config.js ===== */
window.AppConfig = {
  APP_VERSION: 'supabase-full-v26-dynamic-line-bot-20260611',
  GAS_URL: 'https://script.google.com/macros/s/AKfycbxFPkZtTumRGd6mIlf-vT1sHO1HgcjXiqnVECAcsEk3lqxBRg6YWyiynxZzotuHjdJ7/exec',
  CACHE_KEYS: {
    BATCHES: 'ducky:batches',
    BATCHES_META: 'ducky:batches:meta'
  },
  CACHE_MAX_AGE_MS: 5 * 60 * 1000,
  DEFAULT_IMAGE_ID: '1to1v80nOpqY5lOvh74CUciJKEsW-hULj',
  LIFF_ID: '2008564821-LAqYMk32',
  LIFF_WORKER_URL: 'https://liff.line.me/2008564821-LAqYMk32',
  imageUrlFromId(fileId) {
    if (!fileId) return 'https://via.placeholder.com/400x200?text=No+Image';
    return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w400`;
  }
};


/* ===== js/core/cache.js ===== */
window.AppCache = (() => {
  function read(key, fallback = null) {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (error) { console.warn('Cache read failed', key, error); return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (error) { console.warn('Cache write failed', key, error); return false; }
  }
  function remove(key) { try { localStorage.removeItem(key); } catch (_) {} }
  function removeByPrefix(prefix) {
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
      return keys.length;
    } catch (error) { console.warn('Cache removeByPrefix failed', prefix, error); return 0; }
  }
  function readEnvelopeDetailed(key, ttlMs = 0, fallback = null, options = {}) {
    const data = read(key, null);
    if (!data || typeof data !== 'object' || !data.__cached_at) {
      return { value: fallback, hasValue: false, isStale: false, ageMs: null, cachedAt: null };
    }
    const cachedAt = Number(data.__cached_at || 0);
    const ageMs = Date.now() - cachedAt;
    const isStale = ttlMs > 0 && ageMs > ttlMs;
    if (isStale && !options.allowStale) {
      return { value: fallback, hasValue: false, isStale, ageMs, cachedAt };
    }
    return { value: data.value, hasValue: true, isStale, ageMs, cachedAt };
  }
  function readEnvelope(key, ttlMs = 0, fallback = null, options = {}) {
    const detailed = readEnvelopeDetailed(key, ttlMs, fallback, options);
    return options.withMeta ? detailed : detailed.value;
  }
  function pruneApiCache(maxItems = 160) {
    try {
      const items = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith('ducky:api:')) continue;
        const raw = localStorage.getItem(k);
        let cachedAt = 0;
        try { cachedAt = Number(JSON.parse(raw || '{}').__cached_at || 0); } catch (_) {}
        items.push({ key: k, cachedAt });
      }
      if (items.length <= maxItems) return 0;
      items.sort((a, b) => a.cachedAt - b.cachedAt);
      const removeCount = items.length - maxItems;
      items.slice(0, removeCount).forEach((item) => localStorage.removeItem(item.key));
      return removeCount;
    } catch (error) {
      console.warn('Cache prune failed', error);
      return 0;
    }
  }

  function writeEnvelope(key, value) {
    const ok = write(key, { __cached_at: Date.now(), value });
    if (ok && String(key || '').startsWith('ducky:api:')) pruneApiCache();
    return ok;
  }

  function ensureVersion() {
    try {
      const current = String(window.AppConfig?.APP_VERSION || '');
      if (!current) return;
      const key = 'ducky:frontend:version';
      const previous = localStorage.getItem(key);
      if (previous !== current) {
        removeByPrefix('ducky:api:');
        removeByPrefix('ducky:module:');
        removeByPrefix('ducky:report:');
        removeByPrefix('ducky:batch-dashboard:');
        removeByPrefix('ducky:permission:');
        removeByPrefix('ducky:feed-order:');
        localStorage.setItem(key, current);
      }
    } catch (error) {
      console.warn('Cache version reset failed', error);
    }
  }

  function loadBatchCache() {
    const batches = read(AppConfig.CACHE_KEYS.BATCHES, []);
    const meta = read(AppConfig.CACHE_KEYS.BATCHES_META, null);
    return { batches, meta };
  }
  function saveBatchCache(batches, meta) {
    write(AppConfig.CACHE_KEYS.BATCHES, batches || []);
    write(AppConfig.CACHE_KEYS.BATCHES_META, meta || {});
  }
  function clearBatchCache() {
    remove(AppConfig.CACHE_KEYS.BATCHES);
    remove(AppConfig.CACHE_KEYS.BATCHES_META);
  }
  function invalidateByPayload(payload = {}) {
    const batchId = payload.batch_id || payload.batchId || payload.bid || '';
    const action = String(payload.action || '');
    if (batchId) {
      removeByPrefix(`ducky:batch-dashboard:${batchId}`);
      removeByPrefix(`ducky:module:feed_manage:${batchId}:`);
      removeByPrefix(`ducky:module:egg_daily:${batchId}:`);
      removeByPrefix(`ducky:module:sale_manage:${batchId}:`);
      removeByPrefix(`ducky:batch-manage:${batchId}`);
      removeByPrefix(`ducky:report:${batchId}`);
      removeByPrefix(`ducky:liff-routes:${batchId}`);
      removeByPrefix(`ducky:farm-events:${batchId}`);
      removeByPrefix(`ducky:medicine:${batchId}`);
      removeByPrefix('ducky:api:');
    }
    if (/FeedOrder|feedOrder|feed_order/i.test(action)) {
      removeByPrefix('ducky:feed-order:');
      removeByPrefix('ducky:api:');
    }
    if (/price|Permission|Access|batch|Batch|Liff|Report|FeedOrder/i.test(action)) {
      removeByPrefix('ducky:admin:');
      removeByPrefix('ducky:price-admin:');
      removeByPrefix('ducky:api:');
    }
  }
  ensureVersion();
  return { read, write, remove, removeByPrefix, readEnvelope, readEnvelopeDetailed, writeEnvelope, pruneApiCache, loadBatchCache, saveBatchCache, clearBatchCache, invalidateByPayload, ensureVersion };
})();


/* ===== js/core/api.js ===== */
window.AppApi = (() => {
  const DEFAULT_TIMEOUT_MS = 30000;
  const WRITE_TIMEOUT_MS = 90000;
  const inflight = new Map();
  const writeInflight = new Map();
  const refreshInflight = new Map();

  const READ_ACTIONS = new Set([
    'warmup','ping','health','getWarmupStatus','getDuckyDiagnosticsDashboard','runDuckyDiagnosticsSmokeTest','runDuckyProductionHardeningAudit','runDuckyDataIntegrityCheck','getDuckyV14OptimizationStatus','clearDuckyRuntimeCaches',
    'getMyMenuPermissions','getProgramMenuPermissionAdminOptions','getUserMenuPermissionList','ensureProgramMenuPermissionsReady',
    'getAllBatches','getBatchFullDetail','getBatchDashboardSummary','getBatchManagePageData','getBatchMovementLogs','getBatchMovementRecord',
    'getModuleCalendarData','getSaleBillsForDate','getSaleBillRecord','getSaleBillRangeSummary','getSaleBillEditBundle','getPreBillEditBundle',
    'getEggDailyRecord','getFeedLogRecord','getBatchAccessList','getBatchAccessSummary','getPermissionAdminOptions',
    'getItemPriceAdminData','getPriceSetDetail','getEffectiveEggPriceSet','getPreBillRecord','getReportPageData','getReportPublicViewData',
    'getLiffBatchRoutePageData','getBatchEventsPageData','getFeedOrderBillPageData','getFeedOrderBillsPageData','getFeedOrderPageData',
    'getSupabaseHybridFullStatus','validateSupabaseHybridTypedMirror'
  ]);

  const WRITE_ACTIONS = new Set([
    'upsertUserMenuPermission','revokeUserMenuPermission','migrateExistingUsersToFullMenuPermissions',
    'add_batch','edit_batch','delete_batch','saveBatchMovement','saveBatchSaleBill','deleteBatchSaleBill','saveFeedLog',
    'saveEggDailyLog','approvePreBill','rejectPreBill','upsertBatchModulePermission','revokeBatchUserPermissions',
    'saveLiffBatchRoute','deactivateLiffBatchRoute','generateLiffRouteKey','savePriceSet','savePriceSetBinding','removePriceSetBinding','deletePriceSet',
    'rebuildReportForBatch','createLiffPreBill','saveFeedConsumptionLog','approvePreFeedConsumption','rejectPreFeedConsumption',
    'saveBatchEvent','saveMedicalInventoryLog','deleteBatchEvent','createReportViewLink','exportReportExcel',
    'saveFeedOrderLot','saveFeedOrderBill','createFeedOrderBill','allocateFeedOrderToBatch','allocateFeedOrderBillToBatch',
    'saveFeedOrderAllocation','saveFeedOrderPayment','recordFeedOrderPayment','createFeedOrderPayment','saveFeedOrderBulkPayment',
    'recordFeedOrderBulkPayment','applyFeedOrderBulkPayment','saveFeedOrderClaim','recordFeedOrderClaim','createFeedOrderClaim',
    'setFeedOrderLotVisibility','updateFeedOrderLotVisibility','hideFeedOrderLot',
    'syncAllSupabaseTablesExceptUsersSessions','syncFeedOrderSheetsToSupabase','syncReportSheetsToSupabase','setDuckyDataSourceMode'
  ]);

  const CACHE_TTL = {
    getDuckyDiagnosticsDashboard: 30 * 1000,
    runDuckyDiagnosticsSmokeTest: 0,
    runDuckyProductionHardeningAudit: 30 * 1000,
    runDuckyDataIntegrityCheck: 0,
    getDuckyV14OptimizationStatus: 60 * 1000,
    clearDuckyRuntimeCaches: 0,
    getMyMenuPermissions: 5 * 60 * 1000,
    getProgramMenuPermissionAdminOptions: 5 * 60 * 1000,
    getUserMenuPermissionList: 60 * 1000,
    ensureProgramMenuPermissionsReady: 5 * 60 * 1000,
    getAllBatches: 5 * 60 * 1000,
    getBatchFullDetail: 2 * 60 * 1000,
    getBatchDashboardSummary: 2 * 60 * 1000,
    getBatchManagePageData: 2 * 60 * 1000,
    getBatchMovementLogs: 2 * 60 * 1000,
    getBatchMovementRecord: 30 * 1000,
    getModuleCalendarData: 2 * 60 * 1000,
    getSaleBillsForDate: 60 * 1000,
    getSaleBillRecord: 30 * 1000,
    getSaleBillRangeSummary: 60 * 1000,
    getSaleBillEditBundle: 30 * 1000,
    getPreBillEditBundle: 30 * 1000,
    getEggDailyRecord: 30 * 1000,
    getFeedLogRecord: 30 * 1000,
    getBatchAccessList: 60 * 1000,
    getBatchAccessSummary: 60 * 1000,
    getPermissionAdminOptions: 5 * 60 * 1000,
    getItemPriceAdminData: 5 * 60 * 1000,
    getPriceSetDetail: 2 * 60 * 1000,
    getEffectiveEggPriceSet: 12 * 60 * 60 * 1000,
    getPreBillRecord: 30 * 1000,
    getReportPageData: 2 * 60 * 1000,
    getReportPublicViewData: 60 * 1000,
    getLiffBatchRoutePageData: 2 * 60 * 1000,
    getBatchEventsPageData: 2 * 60 * 1000,
    getFeedOrderBillPageData: 2 * 60 * 1000,
    getFeedOrderBillsPageData: 2 * 60 * 1000,
    getFeedOrderPageData: 2 * 60 * 1000,
    getSupabaseHybridFullStatus: 30 * 1000,
    validateSupabaseHybridTypedMirror: 0
  };

  const CACHE_MAX_STALE = {
    getAllBatches: 24 * 60 * 60 * 1000,
    getBatchFullDetail: 6 * 60 * 60 * 1000,
    getBatchDashboardSummary: 6 * 60 * 60 * 1000,
    getBatchManagePageData: 12 * 60 * 60 * 1000,
    getBatchMovementLogs: 12 * 60 * 60 * 1000,
    getModuleCalendarData: 12 * 60 * 60 * 1000,
    getReportPageData: 24 * 60 * 60 * 1000,
    getReportPublicViewData: 6 * 60 * 60 * 1000,
    getLiffBatchRoutePageData: 12 * 60 * 60 * 1000,
    getBatchEventsPageData: 12 * 60 * 60 * 1000,
    getFeedOrderBillPageData: 24 * 60 * 60 * 1000,
    getFeedOrderBillsPageData: 24 * 60 * 60 * 1000,
    getFeedOrderPageData: 24 * 60 * 60 * 1000,
    getItemPriceAdminData: 12 * 60 * 60 * 1000,
    getPriceSetDetail: 12 * 60 * 60 * 1000,
    getEffectiveEggPriceSet: 7 * 24 * 60 * 60 * 1000,
    getPermissionAdminOptions: 12 * 60 * 60 * 1000,
    getProgramMenuPermissionAdminOptions: 12 * 60 * 60 * 1000,
    getMyMenuPermissions: 12 * 60 * 60 * 1000,
    getUserMenuPermissionList: 60 * 60 * 1000,
    getBatchAccessList: 6 * 60 * 60 * 1000,
    getBatchAccessSummary: 6 * 60 * 60 * 1000,
    getSaleBillRangeSummary: 6 * 60 * 60 * 1000,
    getSaleBillsForDate: 6 * 60 * 60 * 1000
  };

  const NETWORK_ONLY_READ_ACTIONS = new Set([
    'warmup','ping','health','getWarmupStatus','getDuckyDiagnosticsDashboard','runDuckyDiagnosticsSmokeTest','runDuckyProductionHardeningAudit','runDuckyDataIntegrityCheck','getDuckyV14OptimizationStatus','clearDuckyRuntimeCaches','validateSupabaseHybridTypedMirror'
  ]);

  function stableKey(payload) {
    const ignored = new Set(['session_token', 'debug_timing', 'client_ts', '_nonce', '_ts']);
    return Object.keys(payload || {})
      .filter((k) => !ignored.has(k))
      .sort()
      .map((k) => `${k}:${JSON.stringify(payload[k])}`)
      .join('|');
  }

  function cacheUserScope() {
    try {
      return String(window.AppAuth?.getSession?.('user_id') || window.AppAuth?.getSession?.('display_name') || 'guest');
    } catch (_) {
      return 'guest';
    }
  }

  function b64(text) {
    try { return btoa(unescape(encodeURIComponent(text))); }
    catch (_) { return btoa(String(text || '').slice(0, 512)); }
  }

  function cacheKey(body) {
    const action = String(body.action || '');
    const scope = cacheUserScope();
    return `ducky:api:${scope}:${action}:${b64(stableKey(body)).slice(0, 180)}`;
  }

  function dispatchCacheUpdate(action, payload, response, meta = {}) {
    try {
      window.dispatchEvent(new CustomEvent('ducky:api-cache-update', {
        detail: { action, payload, response, meta }
      }));
    } catch (_) {}
  }

  function isSessionExpiredResponse(json) {
    if (!json || typeof json !== 'object') return false;
    const text = [json.status, json.code, json.message, json.error]
      .filter(Boolean)
      .join(' ')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');
    return (
      text.includes('SESSION_EXPIRED') ||
      text.includes('SESSION_INVALID') ||
      text.includes('INVALID_SESSION') ||
      text.includes('TOKEN_EXPIRED') ||
      text.includes('AUTH_REQUIRED') ||
      text.includes('UNAUTHORIZED')
    );
  }

  function withDefaultTimeout(options = {}, isWrite = false) {
    if (options && Object.prototype.hasOwnProperty.call(options, 'timeoutMs')) return options;
    return { ...options, timeoutMs: isWrite ? WRITE_TIMEOUT_MS : DEFAULT_TIMEOUT_MS };
  }

  async function fetchJson(payload = {}, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(AppConfig.GAS_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      let json = null;
      try {
        json = await response.json();
      } catch (_) {
        json = { status: 'error', message: response.ok ? 'invalid_json_response' : `http_${response.status}` };
      }

      if ((response.status === 401 || response.status === 403) && !isSessionExpiredResponse(json)) {
        return { status: 'session_expired', code: `HTTP_${response.status}`, message: 'session_expired' };
      }

      return json;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchWithRetry(payload, options = {}) {
    try {
      return await fetchJson(payload, options);
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      await new Promise((r) => setTimeout(r, 350));
      return await fetchJson(payload, options);
    }
  }

  async function handleExpiredSession(payload, options = {}) {
    if (options.__retriedAfterSessionRefresh) {
      AppAuth.redirectLogin('session_expired');
      return null;
    }
    const refreshed = await AppAuth.silentRefreshSession();
    if (!refreshed) {
      AppAuth.redirectLogin('session_expired');
      return null;
    }
    return post(payload, { ...options, __retriedAfterSessionRefresh: true, cache: false });
  }

  function shouldUseAutoCache(action, options = {}) {
    if (!READ_ACTIONS.has(action)) return false;
    if (NETWORK_ONLY_READ_ACTIONS.has(action)) return false;
    if (options.cache === false || options.cacheMode === 'network-only') return false;
    const ttl = options.ttlMs ?? CACHE_TTL[action] ?? 0;
    return ttl > 0 && !!window.AppCache?.readEnvelopeDetailed;
  }

  function cachedClone(value, meta) {
    if (!value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice();
    return {
      ...value,
      __from_cache: true,
      __cache_age_ms: meta.ageMs,
      __cache_stale: !!meta.isStale
    };
  }

  async function networkPost(body, payload, options, isWrite) {
    const json = await fetchWithRetry(body, withDefaultTimeout(options, isWrite));
    if (isSessionExpiredResponse(json)) {
      return await handleExpiredSession(payload, options);
    }
    return json;
  }

  function cacheFreshResponse(key, action, payload, json) {
    if (json?.status === 'ok' && window.AppCache?.writeEnvelope) {
      AppCache.writeEnvelope(key, json);
      dispatchCacheUpdate(action, payload, json, { source: 'network' });
    }
  }

  function refreshReadInBackground(key, action, payload, body, options = {}) {
    if (refreshInflight.has(key)) return refreshInflight.get(key);
    const task = (async () => {
      try {
        const fresh = await networkPost(body, payload, { ...options, cache: false, cacheMode: 'network-only' }, false);
        cacheFreshResponse(key, action, payload, fresh);
        return fresh;
      } catch (error) {
        console.warn('Background API refresh failed:', action, error?.message || error);
        return null;
      } finally {
        setTimeout(() => refreshInflight.delete(key), 250);
      }
    })();
    refreshInflight.set(key, task);
    return task;
  }

  async function post(payload = {}, options = {}) {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return null;

    const body = { session_token: AppAuth.getSession(), ...payload };
    const action = String(payload.action || '');
    const isRead = READ_ACTIONS.has(action);
    const isWrite = WRITE_ACTIONS.has(action);
    const key = stableKey(body);
    const requestOptions = withDefaultTimeout(options, isWrite);

    if (isRead && shouldUseAutoCache(action, requestOptions)) {
      const ttl = requestOptions.ttlMs ?? CACHE_TTL[action] ?? 0;
      const maxStale = requestOptions.maxStaleMs ?? CACHE_MAX_STALE[action] ?? 0;
      const ck = cacheKey(body);
      const cached = AppCache.readEnvelopeDetailed(ck, ttl, null, { allowStale: maxStale > 0, withMeta: true });
      const usableStale = cached.hasValue && (!cached.isStale || (maxStale > 0 && cached.ageMs <= maxStale));
      if (usableStale) {
        if (requestOptions.background !== false) {
          refreshReadInBackground(ck, action, payload, body, requestOptions);
        }
        return cachedClone(cached.value, cached);
      }
    }

    if (isRead && inflight.has(key)) return inflight.get(key);
    if (isWrite && writeInflight.has(key)) return writeInflight.get(key);

    const task = (async () => {
      try {
        const json = await networkPost(body, payload, requestOptions, isWrite);
        if (isWrite && json?.status === 'ok' && window.AppCache) AppCache.invalidateByPayload(payload);
        if (isRead && shouldUseAutoCache(action, requestOptions)) {
          cacheFreshResponse(cacheKey(body), action, payload, json);
        }
        return json;
      } catch (error) {
        console.error('API error:', error);
        return { status: 'error', message: error?.name === 'AbortError' ? 'request_timeout' : (error?.message || 'network_error') };
      } finally {
        if (isRead) inflight.delete(key);
        if (isWrite) setTimeout(() => writeInflight.delete(key), 3000);
      }
    })();

    if (isRead) inflight.set(key, task);
    if (isWrite) writeInflight.set(key, task);
    return task;
  }

  async function postPublic(payload = {}, options = {}) {
    const action = String(payload.action || '');
    const isRead = READ_ACTIONS.has(action);
    const isWrite = WRITE_ACTIONS.has(action);
    const body = { ...payload };
    const requestOptions = withDefaultTimeout(options, isWrite);
    const key = stableKey(body || {});

    if (isRead && shouldUseAutoCache(action, requestOptions)) {
      const ttl = requestOptions.ttlMs ?? CACHE_TTL[action] ?? 0;
      const maxStale = requestOptions.maxStaleMs ?? CACHE_MAX_STALE[action] ?? 0;
      const ck = cacheKey(body);
      const cached = AppCache.readEnvelopeDetailed(ck, ttl, null, { allowStale: maxStale > 0, withMeta: true });
      const usableStale = cached.hasValue && (!cached.isStale || (maxStale > 0 && cached.ageMs <= maxStale));
      if (usableStale) {
        if (requestOptions.background !== false) refreshReadInBackground(ck, action, payload, body, requestOptions);
        return cachedClone(cached.value, cached);
      }
    }

    if (isWrite && writeInflight.has(key)) return writeInflight.get(key);
    if (isRead && inflight.has(key)) return inflight.get(key);

    const task = (async () => {
      try {
        const json = await fetchWithRetry(body, requestOptions);
        if (isRead && shouldUseAutoCache(action, requestOptions)) cacheFreshResponse(cacheKey(body), action, payload, json);
        return json;
      } catch (error) {
        console.error('API public error:', error);
        return { status: 'error', message: error?.name === 'AbortError' ? 'request_timeout' : (error?.message || 'network_error') };
      } finally {
        if (isRead) inflight.delete(key);
        if (isWrite) setTimeout(() => writeInflight.delete(key), 3000);
      }
    })();

    if (isRead) inflight.set(key, task);
    if (isWrite) writeInflight.set(key, task);
    return task;
  }

  let lastWarmupAt = 0;
  function warmup({ force = false, touchSupabase = false } = {}) {
    const now = Date.now();
    if (!force && now - lastWarmupAt < 60 * 1000) return Promise.resolve({ status: 'skipped', reason: 'recent_warmup' });
    lastWarmupAt = now;
    const payload = {
      action: 'warmup',
      page: document.body?.dataset?.page || '',
      client_ts: new Date().toISOString(),
      touch_supabase: touchSupabase ? 1 : 0
    };
    return fetchJson(payload, { timeoutMs: 12000 }).catch((error) => {
      console.warn('Warmup failed', error?.message || error);
      return { status: 'error', message: error?.message || 'warmup_failed' };
    });
  }

  async function postCached(payload = {}, { ttlMs, maxStaleMs, background = true, onUpdate } = {}) {
    const action = String(payload.action || '');
    const requestOptions = {
      ttlMs: ttlMs ?? CACHE_TTL[action] ?? 0,
      maxStaleMs: maxStaleMs ?? CACHE_MAX_STALE[action] ?? 0,
      background
    };

    const ok = payload.__public ? true : await AppAuth.ensureAuth();
    if (!ok) return null;

    const body = payload.__public ? { ...payload } : { session_token: AppAuth.getSession(), ...payload };
    delete body.__public;
    const key = cacheKey(body);
    const cached = requestOptions.ttlMs > 0 && window.AppCache
      ? AppCache.readEnvelopeDetailed(key, requestOptions.ttlMs, null, { allowStale: requestOptions.maxStaleMs > 0, withMeta: true })
      : { hasValue: false };

    const usableStale = cached.hasValue && (!cached.isStale || (requestOptions.maxStaleMs > 0 && cached.ageMs <= requestOptions.maxStaleMs));
    if (usableStale) {
      if (background) {
        refreshReadInBackground(key, action, payload, body, requestOptions).then((fresh) => {
          if (fresh?.status === 'ok' && typeof onUpdate === 'function') onUpdate(fresh);
        });
      }
      return cachedClone(cached.value, cached);
    }

    const fresh = payload.__public ? await postPublic(payload, { ...requestOptions, cache: false }) : await post(payload, { ...requestOptions, cache: false });
    if (fresh?.status === 'ok' && requestOptions.ttlMs > 0 && window.AppCache) AppCache.writeEnvelope(key, fresh);
    return fresh;
  }

  function subscribe(action, handler) {
    const listener = (event) => {
      if (!event?.detail) return;
      if (String(event.detail.action || '') !== String(action || '')) return;
      handler(event.detail.response, event.detail);
    };
    window.addEventListener('ducky:api-cache-update', listener);
    return () => window.removeEventListener('ducky:api-cache-update', listener);
  }

  return {
    post,
    postPublic,
    postCached,
    warmup,
    subscribe,
    READ_ACTIONS,
    WRITE_ACTIONS,
    isSessionExpiredResponse
  };
})();


/* ===== js/core/section-loader.js ===== */
window.AppSectionLoader = (() => {
  const BUSY_STATES = new Set(['loading', 'syncing', 'saving', 'refreshing']);

  function getTarget(target) {
    if (!target) return null;
    if (typeof target === 'string') return document.getElementById(target) || document.querySelector(target);
    return target;
  }

  function mark(target, state = 'idle', label = '') {
    const el = getTarget(target);
    if (!el) return null;
    const next = String(state || 'idle');
    el.dataset.sectionState = next;
    el.setAttribute('aria-busy', BUSY_STATES.has(next) ? 'true' : 'false');
    if (label) el.dataset.sectionStatus = label;
    else delete el.dataset.sectionStatus;
    return el;
  }

  function clear(target) {
    const el = getTarget(target);
    if (!el) return null;
    delete el.dataset.sectionState;
    delete el.dataset.sectionStatus;
    el.removeAttribute('aria-busy');
    return el;
  }

  function setText(id, text) {
    const el = getTarget(id);
    if (el) el.textContent = text == null ? '' : String(text);
  }

  function withBusy(target, label, task) {
    mark(target, 'loading', label || 'กำลังโหลด...');
    return Promise.resolve()
      .then(task)
      .finally(() => mark(target, 'idle'));
  }

  function subscribe(action, handler, options = {}) {
    if (!window.AppApi?.subscribe) return () => {};
    const filter = typeof options.filter === 'function' ? options.filter : null;
    return AppApi.subscribe(action, (response, detail) => {
      if (filter && !filter(response, detail)) return;
      handler(response, detail);
    });
  }

  function subscribeMany(actions = [], handler, options = {}) {
    const off = actions.map((action) => subscribe(action, handler, options)).filter(Boolean);
    return () => off.forEach((fn) => { try { fn(); } catch (_) {} });
  }

  function applyCachedBadge(target, response) {
    const el = getTarget(target);
    if (!el || !response || typeof response !== 'object') return;
    if (response.__from_cache) {
      const ageSec = Math.max(1, Math.round(Number(response.__cache_age_ms || 0) / 1000));
      mark(el, response.__cache_stale ? 'stale' : 'cached', response.__cache_stale ? `ข้อมูล cache ${ageSec} วิ กำลังอัปเดต` : `ข้อมูลจาก cache ${ageSec} วิ`);
    } else {
      mark(el, 'fresh', 'อัปเดตแล้ว');
      setTimeout(() => {
        if (el.dataset.sectionState === 'fresh') clear(el);
      }, 1800);
    }
  }

  return { mark, clear, setText, withBusy, subscribe, subscribeMany, applyCachedBadge };
})();


/* ===== js/modules/report-view-page.js ===== */
window.ReportViewPage = (() => {
  const state = {
    key: '',
    batch: null,
    rows: [],
    chart: { egg: [], feed: [], duck: [] },
    events: [],
    consumption: [],
    feedMovements: [],
    months: [],
    selectedMonth: 'all',
    filters: {
      egg: true,
      eggPercent: true,
      feed: true,
      events: true,
      feedMarkers: true,
      tooltip: true
    },
    daily: [],
    hoverIndex: -1,
    selectedIndex: -1,
    fullscreenChart: '',
    generatedAt: '',
    highlightBefore: readStoredNumber('rvHighlightBefore', 5),
    highlightAfter: readStoredNumber('rvHighlightAfter', 5)
  };

  let publicViewUnsubscribe = null;
  const chartCache = new WeakMap();
  const chartTitles = {
    main: 'ภาพรวมไข่ × อาหาร × เหตุการณ์',
    egg: 'ไข่รายวัน / %ไข่',
    feed: 'เทอาหาร / กินจริง',
    event: 'Timeline เหตุการณ์',
    cost: 'ทุน / ขาย / สุทธิ'
  };
  const eventIconMap = {
    injection: '💉',
    rain: '🌦',
    duck_cull: '🦆',
    vitamin: '✨',
    medicine: '💊',
    feed_swap: '🔁',
    other: '•',
    feed_in: '📦',
    feed_change: '🔁'
  };

  // Optional PNG icons for markers plotted on the charts only.
  // Put files in /assets/report-icon/. If a file is missing, the chart falls back to emoji.
  const chartMarkerIconFiles = {
    injection: 'injection.png',
    rain: 'rain.png',
    duck_cull: 'duck.png',
    vitamin: 'vitamin.png',
    medicine: 'medicine.png',
    feed_swap: 'feed-swap.png',
    feed_change: 'feed-swap.png',
    feed_in: 'feed-in.png',
    other: 'activity.png'
  };
  const chartMarkerImageCache = new Map();
  const eventLabelMap = {
    injection: 'ฉีดยา',
    rain: 'ฝนตก',
    duck_cull: 'แตะตูด / คัดเป็ด',
    vitamin: 'ให้วิตามิน',
    medicine: 'ให้ยา',
    feed_swap: 'เคลมอาหาร',
    other: 'อื่น ๆ',
    feed_in: 'อาหารเข้า',
    feed_change: 'เปลี่ยนอาหาร'
  };

  async function bootstrap() {
    state.key = new URLSearchParams(location.search).get('key') || '';
    bind();
    if (!state.key) {
      setText('rvSubtitle', 'ไม่พบ key สำหรับเปิดรายงาน');
      renderError('ลิงก์รายงานไม่ถูกต้อง');
      return;
    }
    bindBackgroundUpdates();
    await load();
  }

  function bindBackgroundUpdates() {
    if (publicViewUnsubscribe || !window.AppSectionLoader?.subscribe) return;
    publicViewUnsubscribe = AppSectionLoader.subscribe('getReportPublicViewData', (response, detail) => {
      if (!response || response.status !== 'ok') return;
      if (String(detail?.payload?.view_key || '') !== String(state.key || '')) return;
      hydrate(response);
      renderMonthSelect();
      render();
      AppSectionLoader.applyCachedBadge('rvSummary', response);
      AppSectionLoader.applyCachedBadge('[data-chart-card="main"]', response);
    });
  }

  function bind() {
    document.getElementById('rvMonthSelect')?.addEventListener('change', (event) => {
      state.selectedMonth = event.target.value || 'all';
      state.selectedIndex = -1;
      render();
    });
    document.getElementById('rvRefreshBtn')?.addEventListener('click', () => load({ force: true }));
    document.querySelectorAll('[data-rv-filter]').forEach((input) => {
      input.addEventListener('change', () => {
        state.filters[input.dataset.rvFilter] = !!input.checked;
        if (input.dataset.rvFilter === 'tooltip' && !state.filters.tooltip) hideTooltip();
        render();
      });
    });
    document.querySelectorAll('[data-fullscreen-chart]').forEach((button) => {
      button.addEventListener('click', () => openFullscreen(button.dataset.fullscreenChart));
    });
    document.getElementById('rvFullscreenCloseBtn')?.addEventListener('click', closeFullscreen);
    bindHighlightControls();
    window.addEventListener('resize', debounce(() => renderCharts(), 120));
  }

  function bindHighlightControls() {
    const beforeInput = document.getElementById('rvHighlightBefore');
    const afterInput = document.getElementById('rvHighlightAfter');
    const toggle = document.getElementById('rvHighlightToggle');
    const panel = document.getElementById('rvHighlightPanel');
    const label = document.getElementById('rvHighlightLabel');

    const updateLabel = () => {
      if (label) label.textContent = `ก่อน ${state.highlightBefore} · หลัง ${state.highlightAfter}`;
    };
    const setPanelOpen = (open) => {
      if (!panel || !toggle) return;
      panel.classList.toggle('hidden', !open);
      toggle.classList.toggle('is-open', !!open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    const applyBefore = () => {
      if (!beforeInput) return;
      state.highlightBefore = clampHighlightDays(beforeInput.value, 5);
      beforeInput.value = String(state.highlightBefore);
      localStorage.setItem('rvHighlightBefore', String(state.highlightBefore));
      updateLabel();
      renderCharts();
    };
    const applyAfter = () => {
      if (!afterInput) return;
      state.highlightAfter = clampHighlightDays(afterInput.value, 5);
      afterInput.value = String(state.highlightAfter);
      localStorage.setItem('rvHighlightAfter', String(state.highlightAfter));
      updateLabel();
      renderCharts();
    };

    if (beforeInput) {
      beforeInput.value = String(state.highlightBefore);
      beforeInput.addEventListener('change', applyBefore);
      beforeInput.addEventListener('input', applyBefore);
    }
    if (afterInput) {
      afterInput.value = String(state.highlightAfter);
      afterInput.addEventListener('change', applyAfter);
      afterInput.addEventListener('input', applyAfter);
    }
    if (toggle && panel) {
      toggle.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setPanelOpen(panel.classList.contains('hidden'));
      });
      panel.addEventListener('click', (event) => event.stopPropagation());
      document.addEventListener('click', () => setPanelOpen(false));
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') setPanelOpen(false);
      });
    }
    updateLabel();
    setPanelOpen(false);
  }

  async function load({ force = false } = {}) {
    setText('rvSubtitle', force ? 'กำลังโหลดข้อมูลใหม่...' : 'กำลังโหลดข้อมูล...');
    AppSectionLoader?.mark?.('rvSummary', force ? 'refreshing' : 'loading', force ? 'กำลังโหลดใหม่...' : 'กำลังโหลดสรุป...');
    AppSectionLoader?.mark?.('[data-chart-card="main"]', force ? 'refreshing' : 'loading', force ? 'กำลังโหลดใหม่...' : 'กำลังโหลดกราฟ...');
    const response = await AppApi.postPublic(
      { action: 'getReportPublicViewData', view_key: state.key, force: force ? 1 : 0 },
      { ttlMs: 60 * 1000, maxStaleMs: 6 * 60 * 60 * 1000, background: !force }
    );
    if (!response || response.status !== 'ok') {
      setText('rvSubtitle', response?.message || 'โหลดรายงานไม่สำเร็จ');
      renderError(response?.message || 'โหลดรายงานไม่สำเร็จ');
      AppSectionLoader?.mark?.('rvSummary', 'stale', 'โหลดไม่สำเร็จ');
      AppSectionLoader?.mark?.('[data-chart-card="main"]', 'stale', 'โหลดไม่สำเร็จ');
      return;
    }

    hydrate(response);
    renderMonthSelect();
    render();
    AppSectionLoader?.applyCachedBadge?.('rvSummary', response);
    AppSectionLoader?.applyCachedBadge?.('[data-chart-card="main"]', response);
  }

  function hydrate(response = {}) {
    state.batch = response.batch || null;
    state.rows = Array.isArray(response.rows) ? response.rows : [];
    state.chart = response.chart || { egg: [], feed: [], duck: [] };
    state.events = Array.isArray(response.events) ? response.events : [];
    state.consumption = Array.isArray(response.consumption) ? response.consumption : [];
    state.feedMovements = Array.isArray(response.feed_movements) ? response.feed_movements : [];
    state.months = Array.isArray(response.months) && response.months.length ? response.months : deriveMonths(state.rows);
    state.generatedAt = response.generated_at || response.updated_at || response.last_update || latestUpdatedAt(response);
    state.daily = buildDailyRows();
  }

  function renderError(message) {
    const summary = document.getElementById('rvSummary');
    if (summary) summary.innerHTML = `<div class="rv-error-card">${esc(message)}</div>`;
  }

  function renderMonthSelect() {
    const select = document.getElementById('rvMonthSelect');
    if (!select) return;
    const current = state.selectedMonth || 'all';
    select.innerHTML = '<option value="all">ทั้งหมด</option>' + state.months.map((month) => `<option value="${esc(month.key)}">${esc(month.label || month.key)}</option>`).join('');
    if (current === 'all' || state.months.some((month) => month.key === current)) state.selectedMonth = current;
    else state.selectedMonth = 'all';
    select.value = state.selectedMonth;
  }

  function render() {
    setText('rvTitle', state.batch?.name || 'รายงานวิเคราะห์');
    setText('rvSubtitle', `รายงานวิเคราะห์ • อัปเดต ${shortDateTime(state.generatedAt || '')}`);
    const daily = scopedDaily();
    if (state.selectedIndex >= daily.length) state.selectedIndex = -1;
    renderInsights(daily);
    renderSummary(daily);
    renderLegend();
    renderEvents(daily);
    renderInspector();
    renderCharts();
  }

  function renderInsights(daily) {
    const panel = document.getElementById('rvInsightPanel');
    if (!panel) return;
    const insights = buildInsights(daily);
    if (!insights.length) {
      panel.classList.add('hidden');
      panel.innerHTML = '';
      return;
    }
    panel.classList.remove('hidden');
    panel.innerHTML = `
      <div class="rv-insight-head">
        <span class="rv-panel-kicker">Insights</span>
        <span class="rv-insight-count">${insights.length}</span>
      </div>
      <div class="rv-insight-grid">
        ${insights.map((item) => `
          <article class="rv-insight-card rv-insight-${esc(item.level || 'info')}">
            <span class="rv-insight-icon">${esc(item.icon || 'i')}</span>
            <div>
              <b>${esc(item.title || '-')}</b>
              <p>${esc(item.detail || '')}</p>
            </div>
          </article>
        `).join('')}
      </div>
    `;
  }

  function buildInsights(daily) {
    const rows = (daily || []).filter((day) => day && day.dateKey).slice().sort((a, b) => String(a.dateKey).localeCompare(String(b.dateKey)));
    if (!rows.length) return [];
    const insights = [];
    const recent = rows.slice(-7);
    const latest = rows[rows.length - 1];
    const avg7 = avg(recent.map((day) => Number(day.eggPercent || 0)).filter((value) => value > 0));
    const avg15 = averageLatestEggPercent(rows, 15);
    const recentEgg = recent.map((day) => Number(day.eggDaily || 0));
    const avgEgg7 = avg(recentEgg.filter((value) => value > 0));
    const feedCost7 = avg(recent.map((day) => Number(day.feedCost || 0)).filter((value) => value > 0));
    const feedCostPrev = avg(rows.slice(-14, -7).map((day) => Number(day.feedCost || 0)).filter((value) => value > 0));

    if (avg7 > 0 && avg7 < 55) {
      insights.push({ level: 'danger', icon: '!', title: '%ไข่ต่ำกว่าปกติ', detail: `เฉลี่ย 7 วันล่าสุด ${fmt(avg7)}% ควรตรวจอาหาร สุขภาพ และสภาพแวดล้อม` });
    } else if (avg7 > 0 && avg7 < 70) {
      insights.push({ level: 'warn', icon: '!', title: '%ไข่เริ่มต่ำ', detail: `เฉลี่ย 7 วันล่าสุด ${fmt(avg7)}% ต่ำกว่าเป้าหมายทั่วไป` });
    }

    if (rows.length >= 4) {
      const last4 = rows.slice(-4).map((day) => Number(day.eggDaily || 0));
      const declining = last4.every((value, index, arr) => index === 0 || value <= arr[index - 1]);
      if (declining && last4[0] > last4[last4.length - 1]) {
        insights.push({ level: 'warn', icon: '↓', title: 'ไข่ลดลงต่อเนื่อง', detail: `ลดจาก ${fmt(last4[0])} เหลือ ${fmt(last4[last4.length - 1])} ฟองในช่วงล่าสุด` });
      }
    }

    if (feedCost7 > 0 && feedCostPrev > 0 && feedCost7 > feedCostPrev * 1.2) {
      insights.push({ level: 'warn', icon: '฿', title: 'ต้นทุนอาหารสูงขึ้น', detail: `เฉลี่ย 7 วันล่าสุด ${money(feedCost7)} / วัน สูงกว่าช่วงก่อนหน้า` });
    }

    if (latest && Number(latest.feedOutQty || 0) <= 0 && Number(latest.consumedQty || 0) <= 0) {
      insights.push({ level: 'info', icon: 'i', title: 'ข้อมูลอาหารล่าสุดอาจยังไม่ครบ', detail: `${thaiDate(latest.dateKey)} ยังไม่พบข้อมูลอาหารในรายงาน` });
    }

    if (avgEgg7 > 0 && rows.length >= 5) {
      const trend = trendLabel(recentEgg);
      insights.push({ level: 'success', icon: '↗', title: 'คาดการณ์ 7 วัน', detail: `เฉลี่ยประมาณ ${fmt(avgEgg7)} ฟอง/วัน • %ไข่เฉลี่ย ${avg7 > 0 ? fmt(avg7) : '-'}% • แนวโน้ม${trend}` });
    }

    if (!insights.length && avg15 > 0) {
      insights.push({ level: 'success', icon: '✓', title: 'แนวโน้มปกติ', detail: `ไม่พบ alert สำคัญในช่วงนี้ เฉลี่ย %ไข่ 15 วันล่าสุด ${fmt(avg15)}%` });
    }

    return insights.slice(0, 4);
  }

  function renderSummary(daily) {
    const totalEgg = sum(daily, 'eggDaily');
    const totalFeedUsed = sum(daily, 'feedOutQty');
    const totalFeedCost = sum(daily, 'feedCost');
    const totalEventCost = sum(daily, 'eventCost');
    const totalIncome = sum(daily, 'eggIncome');
    const net = sum(daily, 'totalIncome') - totalEventCost;
    const avgEggPercent15 = averageLatestEggPercent(daily, 15);
    const cards = [
      ['ไข่รวม', `${fmt(totalEgg)} ฟอง`, avgEggPercent15 > 0 ? `เฉลี่ย %ไข่ 15 วันล่าสุด ${fmt(avgEggPercent15)}%` : 'เฉลี่ย %ไข่ 15 วันล่าสุด -'],
      ['ใช้อาหาร', `${fmt(totalFeedUsed)} ลูก`, 'จากจำนวนที่เท/ตัดจ่าย'],
      ['ต้นทุนรวม', money(totalFeedCost + totalEventCost), `อาหาร ${money(totalFeedCost)} + อื่นๆ ${money(totalEventCost)}`],
      ['สุทธิ', money(net), `ยอดขาย ${money(totalIncome)}`]
    ];
    const target = document.getElementById('rvSummary');
    if (!target) return;
    target.innerHTML = cards.map(([label, value, note]) => `
      <article class="rv-summary-card">
        <span>${esc(label)}</span>
        <strong>${esc(value)}</strong>
        <small>${esc(note)}</small>
      </article>
    `).join('');
  }

  function renderLegend() {
    const legend = document.getElementById('rvMainLegend');
    if (!legend) return;
    legend.innerHTML = [
      ['rv-dot rv-dot--egg', 'ไข่รายวัน: แกนซ้ายบน (ฟอง)'],
      ['rv-dot rv-dot--percent', '%ไข่: แกนขวาบน (%)'],
      ['rv-dot rv-dot--feed', 'อาหาร: แท่งโปร่ง=ใช้อาหาร/เทต่อวัน / แท่งเข้ม=กินจริง (ลูก)'],
      ['rv-dot rv-dot--event', 'ไอคอนเหตุการณ์/อาหาร']
    ].map(([cls, text]) => `<span><i class="${cls}"></i>${esc(text)}</span>`).join('');
  }

  function renderEvents(daily) {
    const events = daily.flatMap((day) => day.timeline.map((item) => ({ ...item, dateKey: day.dateKey })));
    setText('rvEventCount', String(events.length));
    const target = document.getElementById('rvEvents');
    if (!target) return;
    if (!events.length) {
      target.innerHTML = '<div class="rv-empty">ไม่มีเหตุการณ์ในช่วงที่เลือก</div>';
      return;
    }

    const selectedDateKey = daily[state.selectedIndex]?.dateKey || '';
    const groups = [];
    const byDate = new Map();
    events.slice(0, 220).forEach((event) => {
      const key = event.dateKey || '';
      if (!byDate.has(key)) {
        const group = { dateKey: key, events: [] };
        byDate.set(key, group);
        groups.push(group);
      }
      byDate.get(key).events.push(event);
    });

    target.innerHTML = groups.map((group) => `
      <button type="button" class="rv-timeline-day ${group.dateKey === selectedDateKey ? 'is-selected' : ''}" data-date-key="${esc(group.dateKey)}">
        <span class="rv-timeline-dot" aria-hidden="true"></span>
        <span class="rv-timeline-date">${esc(shortDate(group.dateKey))}</span>
        <span class="rv-timeline-items">
          ${group.events.map((event) => `
            <span class="rv-timeline-item">
              <b>${esc(event.title || eventLabel(event.type))}</b>
              <small>${esc(event.detail || '')}</small>
              ${event.cost ? `<em>${money(event.cost)}</em>` : ''}
            </span>
          `).join('')}
        </span>
      </button>
    `).join('');
    target.querySelectorAll('[data-date-key]').forEach((button) => {
      button.addEventListener('click', () => selectDate(button.dataset.dateKey));
    });
  }

  function renderInspector() {
    const daily = scopedDaily();
    const selected = state.selectedIndex >= 0 ? daily[state.selectedIndex] : null;
    const target = document.getElementById('rvInspector');
    if (!target) return;
    if (!selected) {
      setText('rvSelectedDateBadge', 'แตะกราฟ');
      target.className = 'rv-inspector-empty';
      target.textContent = 'แตะจุดบนกราฟเพื่อดูว่าในวันนั้นกินอาหารเท่าไหร่ ไข่เท่าไหร่ และมีเหตุการณ์อะไรบ้าง';
      return;
    }
    setText('rvSelectedDateBadge', thaiDate(selected.dateKey));
    target.className = 'rv-inspector';
    target.innerHTML = `
      <div class="rv-inspector-grid rv-shared-metric-grid">
        <div><span>ไข่</span><strong>${fmt(selected.eggDaily)} ฟอง</strong></div>
        <div><span>%ไข่</span><strong>${fmt(selected.eggPercent)}%</strong></div>
        <div><span>ใช้อาหารไป</span><strong>${fmt(selected.feedOutQty)} ลูก</strong></div>
        <div><span>กินจริง</span><strong>${fmt(selected.consumedQty)} ลูก</strong></div>
        <div><span>เป็ดตาย</span><strong>${fmt(selected.duckDead)}</strong></div>
      </div>
      <div class="rv-inspector-events">
        ${selected.timeline.length ? selected.timeline.map((event) => `
          <div class="rv-inspector-event">${eventTimelineIconHtml(event, "rv-inspector-event-icon")}<div><b>${esc(event.title || eventLabel(event.type))}</b><p>${esc(event.detail || '')}</p></div>${event.cost ? `<strong>${money(event.cost)}</strong>` : ''}</div>
        `).join('') : '<div class="rv-empty">วันนี้ไม่มีเหตุการณ์เพิ่มเติม</div>'}
      </div>
    `;
  }

  function renderCharts() {
    const daily = scopedDaily();
    renderMainChart(document.getElementById('rvMainChart'), daily);
    renderEggChart(document.getElementById('rvEggChart'), daily);
    renderFeedChart(document.getElementById('rvFeedChart'), daily);
    renderEventChart(document.getElementById('rvEventChart'), daily);
    renderCostChart(document.getElementById('rvCostChart'), daily);
    if (state.fullscreenChart) renderFullscreenChart();
  }

  function dailyMarkerCount(day) {
    const eventCount = state.filters.events ? (day.events || []).length : 0;
    const feedCount = state.filters.feedMarkers ? (day.feedMarkers || []).length : 0;
    return eventCount + feedCount;
  }

  function markerRowsForDaily(daily) {
    const maxMarkers = Math.max(0, ...daily.map(dailyMarkerCount));
    return Math.max(1, Math.min(7, maxMarkers || 1));
  }

  function applyMainChartHeight(canvas, daily, options) {
    if (!canvas || !canvas.parentElement) return markerRowsForDaily(daily);
    const markerRows = markerRowsForDaily(daily);
    const extra = Math.max(0, markerRows - 1) * 14;
    const base = options && options.fullscreen ? 520 : 340;
    canvas.parentElement.style.minHeight = `${base + extra}px`;
    canvas.parentElement.dataset.markerRows = String(markerRows);
    return markerRows;
  }


  function renderMainChart(canvas, daily, options = {}) {
    if (!canvas) return;
    const markerRows = applyMainChartHeight(canvas, daily, options);
    const box = prepareCanvas(canvas);
    const ctx = box.ctx;
    const w = box.w;
    const h = box.h;
    clear(ctx, w, h);
    if (!daily.length) return drawNoData(ctx, w, h);

    const eventBandH = 22 + markerRows * 22;
    const paneGap = 38;
    const m = { l: 68, r: 76, t: Math.max(56, eventBandH + 22), b: 42 };
    const availableH = Math.max(260, h - m.t - m.b);
    const paneH = Math.max(108, (availableH - paneGap) / 2);
    const top = { x: m.l, y: m.t, w: w - m.l - m.r, h: paneH };
    const bottom = { x: m.l, y: top.y + top.h + paneGap, w: top.w, h: paneH };
    const eggMax = niceMax(Math.max(...daily.map((d) => d.eggDaily), 1));
    const percentMax = 100;
    const feedMax = niceMax(Math.max(...daily.map((d) => Math.max(d.consumedQty, d.feedOutQty)), 1));

    drawPane(ctx, top, { leftLabel: 'ไข่ (ฟอง)', rightLabel: '% ไข่', leftMax: eggMax, rightMax: percentMax });
    drawPane(ctx, bottom, { leftLabel: 'อาหาร (ลูก)', leftMax: feedMax });
    drawDateAxis(ctx, daily, bottom, options.compact);

    const xAt = makeXMapper(daily, top);
    const barW = Math.max(2, Math.min(20, top.w / Math.max(daily.length, 1) * 0.58));

    drawSelectedWindow(ctx, daily, top, bottom);
    drawMonthBoundaryLines(ctx, daily, top, xAt, top.y - 18, bottom.y + bottom.h, true);

    if (state.filters.egg) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.42)';
      daily.forEach((day, index) => {
        const x = xAt(index) - barW / 2;
        const bh = (day.eggDaily / eggMax) * top.h;
        ctx.fillRect(x, top.y + top.h - bh, barW, bh);
      });
    }

    if (state.filters.eggPercent) {
      drawLine(ctx, daily.map((day) => [xAt(day.__index), top.y + top.h - (day.eggPercent / percentMax) * top.h]), '#ef4444', 2.5);
      drawPoints(ctx, daily.map((day) => [xAt(day.__index), top.y + top.h - (day.eggPercent / percentMax) * top.h]), '#ef4444', 2.6);
    }

    const xAtBottom = makeXMapper(daily, bottom);
    const feedBarW = Math.max(3, Math.min(18, bottom.w / Math.max(daily.length, 1) * 0.56));
    if (state.filters.feed) {
      daily.forEach((day, index) => {
        const x = xAtBottom(index) - feedBarW / 2;
        const outH = (day.feedOutQty / feedMax) * bottom.h;
        const consumedH = (day.consumedQty / feedMax) * bottom.h;
        ctx.fillStyle = 'rgba(14, 165, 164, 0.18)';
        ctx.fillRect(x, bottom.y + bottom.h - outH, feedBarW, outH);
        ctx.strokeStyle = 'rgba(15, 118, 110, 0.62)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, bottom.y + bottom.h - outH + 0.5, Math.max(1, feedBarW - 1), Math.max(1, outH - 1));
        ctx.fillStyle = 'rgba(14, 165, 164, 0.78)';
        ctx.fillRect(x + feedBarW * 0.17, bottom.y + bottom.h - consumedH, feedBarW * 0.66, consumedH);
      });
    }
    const markerList = [];
    const markerTopY = Math.max(16, top.y - eventBandH + 14);
    daily.forEach((day, index) => {
      const stack = [];
      if (state.filters.events) stack.push(...(day.events || []));
      if (state.filters.feedMarkers) stack.push(...(day.feedMarkers || []));
      stack.slice(0, markerRows).forEach((event, eventIndex) => {
        markerList.push({
          x: xAt(index),
          y: markerTopY + eventIndex * 25,
          day,
          type: event.type,
          subtype: event.subtype,
          severity: event.severity,
          title: event.title,
          detail: event.detail
        });
      });
    });
    drawMarkers(ctx, markerList, canvas);
    chartCache.set(canvas, { daily, top, bottom, xAt, xAtBottom, markers: markerList, chartType: 'main' });

    drawSelectedGuide(ctx, canvas, daily, top, bottom);
  }

  function renderEggChart(canvas, daily) {
    renderMiniChart(canvas, daily, {
      tooltipType: 'egg',
      leftLabel: 'ไข่ (ฟอง)',
      rightLabel: '% ไข่',
      series: [
        { key: 'eggDaily', label: 'ไข่', type: 'bar', color: 'rgba(245, 158, 11, .45)' },
        { key: 'eggPercent', label: '%ไข่', type: 'line', color: '#ef4444', axis: 'right', max: 100 }
      ]
    });
  }

  function renderFeedChart(canvas, daily) {
    renderMiniChart(canvas, daily, {
      tooltipType: 'feed',
      leftLabel: 'อาหาร (ลูก)',
      series: [
        { key: 'feedOutQty', label: 'เทออก', type: 'bar', color: 'rgba(14, 165, 164, .22)' },
        { key: 'consumedQty', label: 'กินจริง', type: 'barOverlay', color: 'rgba(14, 165, 164, .72)' }
      ]
    });
  }

  function renderEventChart(canvas, daily) {
    if (!canvas) return;
    const box = prepareCanvas(canvas);
    const ctx = box.ctx;
    const w = box.w;
    const h = box.h;
    clear(ctx, w, h);
    if (!daily.length) return drawNoData(ctx, w, h);

    const pane = { x: 58, y: 32, w: w - 104, h: h - 82 };
    drawEventPane(ctx, pane);
    drawDateAxis(ctx, daily, pane, true);
    const xAt = makeXMapper(daily, pane);
    drawMonthBoundaryLines(ctx, daily, pane, xAt, pane.y, pane.y + pane.h, false);
    drawSelectedWindowSingle(ctx, daily, pane, xAt);
    const rows = Math.max(1, Math.min(5, Math.max(...daily.map((day) => day.timeline.length), 1)));
    const rowGap = pane.h / (rows + 1);
    const markers = [];

    daily.forEach((day, index) => {
      const items = (day.timeline || []).slice(0, rows);
      items.forEach((item, itemIndex) => {
        markers.push({
          x: xAt(index),
          y: pane.y + rowGap * (itemIndex + 1),
          day,
          type: item.type,
          subtype: item.subtype,
          severity: item.severity,
          title: item.title,
          detail: item.detail
        });
      });
    });

    drawMarkers(ctx, markers, canvas);
    drawSelectedGuideSingle(ctx, daily, pane, xAt);
    drawMiniLegend(ctx, [
      { label: 'อาหารเข้า', color: '#0ea5a4' },
      { label: 'สลับอาหาร', color: '#0ea5a4' },
      { label: 'กิจกรรม', color: '#f59e0b' }
    ], pane);
    chartCache.set(canvas, { daily, pane, xAt, markers, chartType: 'event' });
    attachCanvasInteractions(canvas);
  }

  function renderCostChart(canvas, daily) {
    renderMiniChart(canvas, daily, {
      tooltipType: 'cost',
      leftLabel: 'บาท',
      series: [
        { key: 'feedCost', label: 'ทุน', type: 'bar', color: 'rgba(100, 116, 139, .35)' },
        { key: 'eggIncome', label: 'ขาย', type: 'bar2', color: 'rgba(34, 197, 94, .28)' },
        { key: 'netAfterEvent', label: 'สุทธิ', type: 'lineSigned', color: '#047857', positiveColor: '#047857', negativeColor: '#dc2626' }
      ]
    });
  }

  function renderMiniChart(canvas, daily, config) {
    if (!canvas) return;
    const box = prepareCanvas(canvas);
    const ctx = box.ctx;
    const w = box.w;
    const h = box.h;
    clear(ctx, w, h);
    if (!daily.length) return drawNoData(ctx, w, h);

    const pane = { x: 72, y: 34, w: w - 148, h: h - 86 };
    const leftSeries = config.series.filter((s) => s.axis !== 'right');
    const rightSeries = config.series.filter((s) => s.axis === 'right');
    const leftValues = leftSeries.flatMap((s) => daily.map((d) => Number(d[s.key] || 0)));
    const rightValues = rightSeries.flatMap((s) => daily.map((d) => Number(d[s.key] || 0))).concat(rightSeries.map((s) => Number(s.max || 0)));
    const leftExtent = niceExtent(leftValues);
    const rightExtent = rightSeries.length ? niceExtent(rightValues) : null;

    drawPane(ctx, pane, {
      leftLabel: config.leftLabel,
      rightLabel: config.rightLabel,
      leftMin: leftExtent.min,
      leftMax: leftExtent.max,
      rightMin: rightExtent ? rightExtent.min : null,
      rightMax: rightExtent ? rightExtent.max : null
    });
    drawDateAxis(ctx, daily, pane, true);

    const xAt = makeXMapper(daily, pane);
    drawMonthBoundaryLines(ctx, daily, pane, xAt, pane.y, pane.y + pane.h, false);
    drawSelectedWindowSingle(ctx, daily, pane, xAt);
    const yForLeft = (value) => valueToY(Number(value || 0), leftExtent.min, leftExtent.max, pane);
    const yForRight = (value) => valueToY(Number(value || 0), rightExtent ? rightExtent.min : 0, rightExtent ? rightExtent.max : 1, pane);
    const zeroLeft = yForLeft(0);
    const zeroRight = rightExtent ? yForRight(0) : zeroLeft;
    const barW = Math.max(2, Math.min(18, pane.w / Math.max(1, daily.length) * 0.42));

    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, .18)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(pane.x, zeroLeft);
    ctx.lineTo(pane.x + pane.w, zeroLeft);
    ctx.stroke();
    ctx.restore();

    config.series.forEach((s) => {
      const yFor = s.axis === 'right' ? yForRight : yForLeft;
      const zero = s.axis === 'right' ? zeroRight : zeroLeft;
      const points = daily.map((day, index) => [xAt(index), yFor(day[s.key])]);
      if (s.type === 'bar' || s.type === 'bar2' || s.type === 'barOverlay') {
        ctx.fillStyle = s.color;
        daily.forEach((day, index) => {
          const v = Number(day[s.key] || 0);
          const y = yFor(v);
          const xBase = xAt(index);
          let x = xBase - barW * 0.5;
          let width = barW;
          if (s.type === 'bar2') x = xBase + barW * 0.08;
          if (s.type === 'barOverlay') {
            width = barW * 0.58;
            x = xBase - width / 2;
          }
          const topY = Math.min(y, zero);
          const height = Math.max(1, Math.abs(zero - y));
          ctx.fillRect(x, topY, width, height);
        });
      } else if (s.type === 'lineSigned') {
        drawSignedLine(ctx, points, daily.map((day) => Number(day[s.key] || 0)), s.positiveColor || '#047857', s.negativeColor || '#dc2626', 2.4);
        drawSignedPoints(ctx, points, daily.map((day) => Number(day[s.key] || 0)), s.positiveColor || '#047857', s.negativeColor || '#dc2626', 2.5);
      } else {
        drawLine(ctx, points, s.color, 2.2);
        if (s.axis === 'right' || s.key === 'eggPercent') drawPoints(ctx, points, s.color, 2.2);
      }
    });
    drawSelectedGuideSingle(ctx, daily, pane, xAt);
    drawMiniLegend(ctx, config.series, pane);
    chartCache.set(canvas, { daily, pane, xAt, chartType: config.tooltipType || 'main' });
    attachCanvasInteractions(canvas);
  }

  function openFullscreen(chart) {
    state.fullscreenChart = chart || 'main';
    document.getElementById('rvFullscreen')?.classList.remove('hidden');
    document.getElementById('rvFullscreen')?.setAttribute('aria-hidden', 'false');
    setText('rvFullscreenTitle', chartTitles[state.fullscreenChart] || 'กราฟ');
    setText('rvFullscreenSub', `${state.batch?.name || ''} • ${state.selectedMonth === 'all' ? 'ทั้งหมด' : state.selectedMonth}`);
    renderFullscreenChart();
  }

  function closeFullscreen() {
    state.fullscreenChart = '';
    document.getElementById('rvFullscreen')?.classList.add('hidden');
    document.getElementById('rvFullscreen')?.setAttribute('aria-hidden', 'true');
  }

  function renderFullscreenChart() {
    const canvas = document.getElementById('rvFullscreenCanvas');
    const daily = scopedDaily();
    if (state.fullscreenChart === 'main') renderMainChart(canvas, daily, { fullscreen: true });
    else if (state.fullscreenChart === 'egg') renderEggChart(canvas, daily);
    else if (state.fullscreenChart === 'feed') renderFeedChart(canvas, daily);
    else if (state.fullscreenChart === 'event') renderEventChart(canvas, daily);
    else if (state.fullscreenChart === 'cost') renderCostChart(canvas, daily);
    const legend = document.getElementById('rvFullscreenLegend');
    if (legend) legend.innerHTML = document.getElementById('rvMainLegend')?.innerHTML || '';
  }

  function buildDailyRows() {
    const byDate = new Map();
    const put = (dateKey) => {
      const key = normalizeDateKey(dateKey);
      if (!key) return null;
      if (!byDate.has(key)) {
        byDate.set(key, {
          dateKey: key,
          monthKey: key.slice(0, 7),
          dateLabel: shortDate(key),
          eggDaily: 0,
          eggPercent: 0,
          feedOutQty: 0,
          consumedQty: 0,
          leftoverQty: 0,
          wasteQty: 0,
          feedCost: 0,
          eventCost: 0,
          eggIncome: 0,
          totalIncome: 0,
          duckDead: 0,
          duckRemain: 0,
          eventCount: 0,
          netAfterEvent: 0,
          feedNames: new Set(),
          events: [],
          feedMarkers: [],
          timeline: []
        });
      }
      return byDate.get(key);
    };

    (state.rows || []).forEach((row) => {
      const day = put(row.date_key);
      if (!day) return;
      day.eggDaily = Number(row.egg_daily || 0);
      day.eggPercent = Number(row.egg_percent || 0);
      day.feedOutQty = Number(row.feed_out || 0);
      day.feedCost = Number(row.feed_cost || 0);
      day.eggIncome = Number(row.egg_income || 0);
      day.totalIncome = Number(row.total_income || 0);
      day.duckDead = Number(row.duck_dead || 0);
      day.duckRemain = Number(row.duck_remain || 0);
    });

    (state.chart?.feed || []).forEach((row) => {
      const day = put(row.date_key);
      if (!day) return;
      if (!day.feedOutQty) day.feedOutQty += Number(row.feed_out || 0);
      if (!day.feedCost) day.feedCost += Number(row.feed_cost || 0);
      if (row.feed_name || row.feed_id) day.feedNames.add(String(row.feed_name || row.feed_id));
    });

    (state.consumption || []).forEach((row) => {
      const day = put(row.log_date || row.date_key);
      if (!day) return;
      if (!day._hasConsumption) {
        day._hasConsumption = true;
        day.feedOutQty = 0;
        day.consumedQty = 0;
        day.leftoverQty = 0;
        day.wasteQty = 0;
        day.feedCost = 0;
      }
      const feedOutQty = Number(row.feed_out_qty || 0);
      const unitPrice = Number(row.unit_price || 0);
      day.feedOutQty += feedOutQty;
      day.consumedQty += Number(row.consumed_qty || 0);
      day.leftoverQty += Number(row.leftover_qty || 0);
      day.wasteQty += Number(row.waste_qty || 0);
      // Cost must be based on the amount taken out/served, not the amount actually eaten.
      day.feedCost += unitPrice ? (feedOutQty * unitPrice) : Number(row.feed_cost || 0);
      if (row.feed_name || row.feed_id) day.feedNames.add(String(row.feed_name || row.feed_id));
    });

    (state.chart?.duck || []).forEach((row) => {
      const day = put(row.date_key);
      if (!day) return;
      day.duckDead = Number(row.duck_dead || day.duckDead || 0);
    });

    (state.events || []).forEach((row) => {
      const day = put(row.date_key || row.log_date);
      if (!day) return;
      const rawType = row.type || row.event_type || 'other';
      const item = {
        type: normalizeEventType(rawType),
        subtype: row.event_subtype || row.subtype || '',
        title: row.title || row.event_title || eventLabel(rawType),
        detail: row.detail || '',
        severity: row.severity || '',
        cost: Number(row.expense_total || 0),
        extra: row.extra || {}
      };
      day.events.push(item);
      day.timeline.push(item);
      day.eventCost += item.cost;
    });

    (state.feedMovements || []).forEach((row) => {
      const day = put(row.date_key || row.log_date);
      if (!day) return;
      const type = normalizeFeedMoveType(row.trans_type || row.type);
      if (type === 'feed_in') {
        const feedQty = Number(row.qty || 0);
        const item = {
          type,
          title: `อาหารเข้า ${fmt(feedQty)} ลูก`,
          detail: `${row.feed_name || row.feed_id || 'Feed'} เข้า ${fmt(feedQty)} ลูก${row.remark ? ' • ' + row.remark : ''}`,
          qty: feedQty,
          cost: 0
        };
        day.feedMarkers.push(item);
        day.timeline.push(item);
      }
      if (row.feed_name || row.feed_id) day.feedNames.add(String(row.feed_name || row.feed_id));
    });

    addFeedChangeMarkers([...byDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey)));

    const daily = [...byDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    daily.forEach((day) => {
      if (!day._hasConsumption && Number(day.feedOutQty || 0) > 0) {
        day.consumedQty = Number(day.feedOutQty || 0);
        day.leftoverQty = 0;
        day.wasteQty = 0;
      }
      day.eventCount = day.events.length + day.feedMarkers.length;
      day.totalIncome = Number(day.eggIncome || 0) - Number(day.feedCost || 0);
      day.netAfterEvent = Number(day.totalIncome || 0) - Number(day.eventCost || 0);
      day.feedNameText = [...day.feedNames].filter(Boolean).join(', ');
      day.timeline.sort((a, b) => eventSortWeight(a.type) - eventSortWeight(b.type));
    });
    return daily;
  }

  function addFeedChangeMarkers(daily) {
    let prev = '';
    daily.forEach((day) => {
      const name = day.feedNameText || [...day.feedNames].join(', ');
      if (name && prev && name !== prev) {
        const item = { type: 'feed_change', title: 'เปลี่ยนอาหาร', detail: `${prev} → ${name}`, cost: 0 };
        day.feedMarkers.push(item);
        day.timeline.push(item);
      }
      if (name) prev = name;
    });
  }

  function scopedDaily() {
    let daily = state.daily || [];
    if (state.selectedMonth !== 'all') daily = daily.filter((day) => day.monthKey === state.selectedMonth);
    return daily.map((day, index) => ({ ...day, __index: index }));
  }

  function selectDate(dateKey) {
    const daily = scopedDaily();
    const index = daily.findIndex((day) => day.dateKey === dateKey);
    if (index >= 0) {
      state.selectedIndex = index;
      renderInspector();
      renderEvents(daily);
      renderCharts();
    }
  }

  function prepareCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(360, rect.width || canvas.clientWidth || 360);
    const h = Math.max(260, rect.height || canvas.clientHeight || 260);
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.font = '12px system-ui, -apple-system, Segoe UI, sans-serif';
    return { ctx, w, h, ratio };
  }

  function clear(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }

  function drawPane(ctx, pane, cfg) {
    const leftMin = Number(cfg.leftMin != null ? cfg.leftMin : 0);
    const leftMax = Number(cfg.leftMax != null ? cfg.leftMax : 1);
    const rightMin = Number(cfg.rightMin != null ? cfg.rightMin : 0);
    const rightMax = Number(cfg.rightMax != null ? cfg.rightMax : 1);
    ctx.save();
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px system-ui';
    for (let i = 0; i <= 4; i += 1) {
      const ratio = i / 4;
      const y = pane.y + pane.h - pane.h * ratio;
      ctx.beginPath();
      ctx.moveTo(pane.x, y);
      ctx.lineTo(pane.x + pane.w, y);
      ctx.stroke();
      if (cfg.leftMax != null) {
        ctx.textAlign = 'right';
        ctx.fillText(fmt(leftMin + (leftMax - leftMin) * ratio), pane.x - 8, y + 4);
      }
      if (cfg.rightMax != null) {
        ctx.textAlign = 'left';
        ctx.fillText(fmt(rightMin + (rightMax - rightMin) * ratio), pane.x + pane.w + 8, y + 4);
      }
    }
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(pane.x, pane.y, pane.w, pane.h);
    ctx.fillStyle = '#111827';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(cfg.leftLabel || '', pane.x, pane.y - 10);
    if (cfg.rightLabel) {
      ctx.textAlign = 'right';
      ctx.fillText(cfg.rightLabel, pane.x + pane.w, pane.y - 10);
    }
    ctx.restore();
  }

  function drawEventPane(ctx, pane) {
    ctx.save();
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = pane.y + (pane.h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pane.x, y);
      ctx.lineTo(pane.x + pane.w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(pane.x, pane.y, pane.w, pane.h);
    ctx.fillStyle = '#111827';
    ctx.font = '12px system-ui';
    ctx.fillText('Timeline เหตุการณ์', pane.x, pane.y - 10);
    ctx.restore();
  }

  function drawDateAxis(ctx, daily, pane, compact) {
    ctx.save();
    ctx.fillStyle = '#64748b';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.ceil(daily.length / (compact ? 8 : 14)));
    const xAt = makeXMapper(daily, pane);
    daily.forEach((day, index) => {
      if (index % step !== 0 && index !== daily.length - 1) return;
      ctx.fillText(day.dateLabel, xAt(index), pane.y + pane.h + 20);
    });
    ctx.restore();
  }

  function makeXMapper(daily, pane) {
    const count = Math.max(1, daily.length - 1);
    return (index) => pane.x + (pane.w * index) / count;
  }

  function drawLine(ctx, points, color, width) {
    ctx.save();
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  function drawSignedLine(ctx, points, values, positiveColor, negativeColor, width) {
    ctx.save();
    ctx.lineWidth = width || 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let i = 1; i < points.length; i += 1) {
      const [x1, y1] = points[i - 1];
      const [x2, y2] = points[i];
      const v1 = Number(values[i - 1] || 0);
      const v2 = Number(values[i] || 0);
      ctx.strokeStyle = (v1 + v2) / 2 >= 0 ? positiveColor : negativeColor;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSignedPoints(ctx, points, values, positiveColor, negativeColor, radius) {
    ctx.save();
    points.forEach(([x, y], index) => {
      ctx.fillStyle = Number(values[index] || 0) >= 0 ? positiveColor : negativeColor;
      ctx.beginPath();
      ctx.arc(x, y, radius || 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawPoints(ctx, points, color, radius) {
    ctx.save();
    ctx.fillStyle = color;
    points.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, radius || 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawMarkers(ctx, markers, canvas) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '20px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';
    markers.forEach((marker) => drawChartMarkerIcon(ctx, marker));
    ctx.restore();
    attachCanvasInteractions(canvas);
  }

  function drawChartMarkerIcon(ctx, marker) {
    const image = getChartMarkerImage(marker.type, marker.subtype, marker.severity);
    const size = marker.type === 'feed_in' || marker.type === 'feed_change' ? 24 : 22;
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, .16)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 1;

    if (image && image.complete && image.naturalWidth > 0) {
      ctx.drawImage(image, marker.x - size / 2, marker.y - size / 2, size, size);
    } else {
      ctx.fillStyle = '#111827';
      ctx.fillText(iconFor(marker.type, marker.subtype, marker.severity), marker.x, marker.y + 0.8);
    }
    ctx.restore();
  }

  function getChartMarkerImage(type, subtype, severity) {
    const normalizedType = normalizeMarkerIconType(type, subtype, severity);
    const file = chartMarkerIconFiles[normalizedType];
    if (!file) return null;
    const src = `assets/report-icon/${file}`;
    if (chartMarkerImageCache.has(src)) return chartMarkerImageCache.get(src);

    const img = new Image();
    img.onload = () => renderCharts();
    img.onerror = () => { chartMarkerImageCache.set(src, null); };
    img.src = src;
    chartMarkerImageCache.set(src, img);
    return img;
  }

  function normalizeMarkerIconType(type, subtype, severity) {
    const t = normalizeEventType(type);
    if (t === 'rain' && (severity === 'high' || subtype === 'heavy')) return 'rain';
    return t;
  }


  function eventTimelineIconHtml(event, className) {
    const type = event?.type || event?.event_type || 'other';
    const subtype = event?.subtype || event?.event_subtype || '';
    const severity = event?.severity || '';
    const normalizedType = normalizeMarkerIconType(type, subtype, severity);
    const file = chartMarkerIconFiles[normalizedType];
    const fallback = iconFor(type, subtype, severity);
    if (!file) return `<span class="${esc(className || 'rv-event-icon')}">${esc(fallback)}</span>`;
    return `<span class="${esc(className || 'rv-event-icon')} rv-event-icon--asset" data-fallback="${escapeAttr(fallback)}"><img src="assets/report-icon/${esc(file)}" alt="" loading="lazy" onerror="this.parentElement.textContent=this.parentElement.dataset.fallback||'•';" /></span>`;
  }

  function drawMarkerGlyph(ctx, marker, color) {
    const x = marker.x;
    const y = marker.y;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (marker.type === 'feed_in') {
      // arrow entering a tray/box: avoids missing emoji fonts on iOS/Edge canvas
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 5);
      ctx.lineTo(x + 2, y + 3);
      ctx.lineTo(x - 2, y + 3);
      ctx.moveTo(x + 2, y + 3);
      ctx.lineTo(x + 2, y - 1);
      ctx.stroke();
      ctx.strokeRect(x - 2, y + 2, 8, 5);
      ctx.restore();
      return;
    }

    if (marker.type === 'feed_change') {
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 3);
      ctx.lineTo(x + 5, y - 3);
      ctx.lineTo(x + 2, y - 6);
      ctx.moveTo(x + 5, y - 3);
      ctx.lineTo(x + 2, y);
      ctx.moveTo(x + 6, y + 4);
      ctx.lineTo(x - 5, y + 4);
      ctx.lineTo(x - 2, y + 1);
      ctx.moveTo(x - 5, y + 4);
      ctx.lineTo(x - 2, y + 7);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const type = normalizeEventType(marker.type);
    if (type === 'rain') {
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 1); ctx.lineTo(x - 7, y + 5);
      ctx.moveTo(x, y - 2); ctx.lineTo(x - 2, y + 6);
      ctx.moveTo(x + 5, y - 1); ctx.lineTo(x + 3, y + 5);
      ctx.stroke();
    } else if (type === 'injection') {
      ctx.beginPath();
      ctx.moveTo(x - 5, y + 5); ctx.lineTo(x + 5, y - 5);
      ctx.moveTo(x + 1, y - 6); ctx.lineTo(x + 6, y - 1);
      ctx.moveTo(x - 6, y + 1); ctx.lineTo(x - 1, y + 6);
      ctx.stroke();
      if (String(marker.subtype || '').toLowerCase() === 'preg') {
        ctx.font = 'bold 8px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('P', x + 5, y + 5);
      }
    } else if (type === 'duck_cull') {
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('คัด', x, y + 1);
    } else if (type === 'vitamin') {
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('V', x, y + 1);
    } else if (type === 'medicine') {
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('ยา', x, y + 1);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }


  function selectedWindowBounds(daily, pane, xAt) {
    if (state.selectedIndex < 0 || state.selectedIndex >= daily.length) return null;
    const idx = state.selectedIndex;
    const step = daily.length > 1 ? Math.abs(xAt(1) - xAt(0)) : Math.min(32, pane.w);
    const start = Math.max(0, idx - state.highlightBefore);
    const end = Math.min(daily.length - 1, idx + state.highlightAfter);
    return {
      selectedX: xAt(idx),
      x1: Math.max(pane.x, xAt(start) - step / 2),
      x2: Math.min(pane.x + pane.w, xAt(end) + step / 2)
    };
  }

  function drawSelectedWindowSingle(ctx, daily, pane, xAt) {
    const bounds = selectedWindowBounds(daily, pane, xAt);
    if (!bounds) return;
    ctx.save();
    ctx.fillStyle = 'rgba(236, 72, 153, .055)';
    ctx.fillRect(bounds.x1, pane.y, Math.max(1, bounds.x2 - bounds.x1), pane.h);
    ctx.strokeStyle = 'rgba(190, 24, 93, .46)';
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(bounds.x1, pane.y, Math.max(1, bounds.x2 - bounds.x1), pane.h);
    ctx.restore();
  }

  function drawSelectedGuideSingle(ctx, daily, pane, xAt) {
    const idx = state.selectedIndex >= 0 ? state.selectedIndex : state.hoverIndex;
    if (idx < 0 || idx >= daily.length) return;
    const x = xAt(idx);
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, .42)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, pane.y);
    ctx.lineTo(x, pane.y + pane.h);
    ctx.stroke();
    ctx.restore();
  }

  function drawSelectedWindow(ctx, daily, top, bottom) {
    if (state.selectedIndex < 0 || state.selectedIndex >= daily.length) return;
    const idx = state.selectedIndex;
    const xAt = makeXMapper(daily, top);
    const step = daily.length > 1 ? Math.abs(xAt(1) - xAt(0)) : Math.min(32, top.w);
    const start = Math.max(0, idx - state.highlightBefore);
    const end = Math.min(daily.length - 1, idx + state.highlightAfter);
    const x1 = Math.max(top.x, xAt(start) - step / 2);
    const x2 = Math.min(top.x + top.w, xAt(end) + step / 2);
    const y1 = Math.max(0, top.y - 26);
    const y2 = bottom.y + bottom.h;
    ctx.save();
    ctx.fillStyle = 'rgba(236, 72, 153, .075)';
    ctx.fillRect(x1, y1, Math.max(1, x2 - x1), y2 - y1);
    ctx.strokeStyle = 'rgba(190, 24, 93, .58)';
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(x1, y1, Math.max(1, x2 - x1), y2 - y1);
    ctx.restore();
  }

  function drawMonthBoundaryLines(ctx, daily, pane, xAt, fromY, toY, withLabel) {
    if (!daily || daily.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(100, 116, 139, .42)';
    ctx.fillStyle = 'rgba(100, 116, 139, .82)';
    ctx.font = '10px system-ui';
    ctx.textAlign = 'left';
    ctx.setLineDash([4, 5]);
    for (let i = 1; i < daily.length; i += 1) {
      if (daily[i].monthKey === daily[i - 1].monthKey) continue;
      const x = (xAt(i - 1) + xAt(i)) / 2;
      ctx.beginPath();
      ctx.moveTo(x, fromY);
      ctx.lineTo(x, toY);
      ctx.stroke();
      if (withLabel) {
        ctx.save();
        ctx.setLineDash([]);
        ctx.fillText(thaiMonth(daily[i].monthKey).replace(/\s+\d+$/, ''), x + 5, Math.max(12, fromY + 12));
        ctx.restore();
      }
    }
    ctx.restore();
  }

  function drawSelectedGuide(ctx, canvas, daily, top, bottom) {
    const idx = state.selectedIndex >= 0 ? state.selectedIndex : state.hoverIndex;
    if (idx < 0 || idx >= daily.length) return;
    const xAt = makeXMapper(daily, top);
    const x = xAt(idx);
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, .42)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, top.y - 26);
    ctx.lineTo(x, bottom.y + bottom.h);
    ctx.stroke();
    ctx.restore();
  }

  function drawMiniLegend(ctx, series, pane) {
    ctx.save();
    ctx.font = '11px system-ui';
    let x = pane.x;
    const y = pane.y + pane.h + 38;
    series.forEach((s) => {
      ctx.fillStyle = s.color || '#111827';
      ctx.fillRect(x, y - 9, 10, 10);
      ctx.fillStyle = '#475569';
      ctx.fillText(s.label, x + 14, y);
      x += ctx.measureText(s.label).width + 34;
    });
    ctx.restore();
  }

  function drawNoData(ctx, w, h) {
    ctx.fillStyle = '#64748b';
    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('ไม่มีข้อมูลในช่วงนี้', w / 2, h / 2);
  }

  function attachCanvasInteractions(canvas) {
    if (!canvas || canvas.dataset.rvBound === '1') return;
    canvas.dataset.rvBound = '1';
    const handle = (event, commit) => {
      const meta = chartCache.get(canvas);
      if (!meta || !meta.daily?.length) return;
      const rect = canvas.getBoundingClientRect();
      const clientX = event.touches?.[0]?.clientX ?? event.clientX;
      const x = clientX - rect.left;
      const pane = meta.top || meta.pane || meta.bottom;
      const ratio = Math.max(0, Math.min(1, (x - pane.x) / Math.max(1, pane.w)));
      const idx = Math.round(ratio * (meta.daily.length - 1));
      state.hoverIndex = idx;
      if (commit) {
        state.selectedIndex = idx;
        renderInspector();
        renderCharts();
      }
      showTooltip(meta.daily[idx], event, canvas, meta.chartType || 'main');
    };
    canvas.addEventListener('mousemove', (event) => handle(event, false));
    canvas.addEventListener('mouseleave', () => hideTooltip());
    canvas.addEventListener('click', (event) => handle(event, true));
    canvas.addEventListener('touchstart', (event) => handle(event, true), { passive: true });
  }

  function showTooltip(day, event, canvas, chartType) {
    if (!state.filters.tooltip) {
      hideTooltip();
      return;
    }
    const tip = tooltipForCanvas(canvas);
    if (!tip || !day) return;
    const rect = canvas.getBoundingClientRect();
    const parentRect = canvas.parentElement.getBoundingClientRect();
    const x = (event.touches?.[0]?.clientX ?? event.clientX) - rect.left;
    const y = (event.touches?.[0]?.clientY ?? event.clientY) - rect.top;
    tip.classList.remove('hidden');
    const leftMax = Math.max(8, parentRect.width - 265);
    const topMax = Math.max(8, parentRect.height - 178);
    tip.style.left = `${Math.min(leftMax, Math.max(8, x + 12))}px`;
    tip.style.top = `${Math.min(topMax, Math.max(8, y + 10))}px`;
    tip.innerHTML = tooltipHtml(day, chartType || 'main');
  }

  function tooltipForCanvas(canvas) {
    if (!canvas?.parentElement) return document.getElementById('rvTooltip');
    let tip = canvas.parentElement.querySelector('.rv-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'rv-tooltip hidden';
      canvas.parentElement.appendChild(tip);
    }
    return tip;
  }

  function hideTooltip() {
    document.querySelectorAll('.rv-tooltip').forEach((tip) => tip.classList.add('hidden'));
    state.hoverIndex = -1;
  }

  function tooltipHtml(day, chartType) {
    const eventLines = day.timeline.slice(0, 6).map((event) => {
      const title = event.title || eventLabel(event.type);
      const detail = event.detail ? `: ${event.detail}` : '';
      return `${iconFor(event.type, event.subtype, event.severity)} ${esc(title)}${esc(detail)}`;
    }).join('<br>');
    const title = `<b>${esc(thaiDate(day.dateKey))}</b>`;

    if (chartType === 'egg') {
      return `
        ${title}
        <div>ไข่ ${fmt(day.eggDaily)} ฟอง</div>
        <div>%ไข่ ${fmt(day.eggPercent)}%</div>
        <div>เป็ดคงเหลือ ${fmt(day.duckRemain || 0)} ตัว</div>
      `;
    }

    if (chartType === 'feed') {
      const names = day.feedNameText ? `<div>อาหาร: ${esc(day.feedNameText)}</div>` : '';
      const feedIn = (day.feedMarkers || [])
        .filter((event) => event.type === 'feed_in')
        .map((event) => `${iconFor(event.type)} ${esc(event.title || 'อาหารเข้า')}${event.detail ? `: ${esc(event.detail)}` : ''}`)
        .join('<br>');
      return `
        ${title}
        <div>ใช้อาหารไป ${fmt(day.feedOutQty)} ลูก</div>
        <div>กินจริง ${fmt(day.consumedQty)} ลูก</div>
        ${names}
        ${feedIn ? `<hr><div>${feedIn}</div>` : ''}
      `;
    }

    if (chartType === 'event') {
      return `
        ${title}
        ${eventLines ? `<div>${eventLines}</div>` : '<div>ไม่มีเหตุการณ์</div>'}
      `;
    }

    if (chartType === 'cost') {
      return `
        ${title}
        <div>ทุนอาหาร ${money(day.feedCost)}</div>
        <div>ขาย ${money(day.eggIncome)}</div>
        <div>สุทธิ ${money(day.netAfterEvent)}</div>
      `;
    }

    return `
      ${title}
      <div>ไข่ ${fmt(day.eggDaily)} ฟอง • ${fmt(day.eggPercent)}%</div>
      <div>เท ${fmt(day.feedOutQty)} ลูก</div>
      <div>ใช้อาหารไป ${fmt(day.feedOutQty)} ลูก • กินจริง ${fmt(day.consumedQty)} ลูก</div>
      ${eventLines ? `<hr><div>${eventLines}</div>` : ''}
    `;
  }


  function scopedValue(dateKey) { return String(dateKey || '').slice(0, 7); }
  function normalizeDateKey(value) { return value ? String(value).slice(0, 10) : ''; }
  function scopedByMonth(dateKey) { return state.selectedMonth === 'all' || scopedValue(dateKey) === state.selectedMonth; }
  function normalizeEventType(type) { const t = String(type || 'other').toLowerCase(); if (t === 'vaccine' || t === 'injection_preg' || t === 'injection_flu') return 'injection'; if (t === 'weather') return 'rain'; if (t === 'farm_event' || t === 'sick' || t === 'cleaning') return 'other'; return eventIconMap[t] ? t : 'other'; }
  function normalizeFeedMoveType(type) { const t = String(type || '').toLowerCase(); return ['in', 'เข้า', 'receive', 'stock_in'].includes(t) ? 'feed_in' : 'feed_out'; }
  function eventSortWeight(type) { return type === 'feed_in' ? 1 : type === 'feed_change' ? 2 : 3; }
  function iconFor(type, subtype, severity) { const t = normalizeEventType(type); if (t === 'injection' && subtype === 'preg') return '💉P'; if (t === 'rain' && (severity === 'high' || subtype === 'heavy')) return '⛈'; return eventIconMap[t] || eventIconMap[type] || '•'; }
  function eventLabel(type) { return eventLabelMap[normalizeEventType(type)] || eventLabelMap[type] || 'เหตุการณ์'; }

  function deriveMonths(rows) {
    const map = {};
    (rows || []).forEach((row) => {
      const key = row.month_key || String(row.date_key || '').slice(0, 7);
      if (key) map[key] = { key, label: thaiMonth(key) };
    });
    return Object.keys(map).sort().map((key) => map[key]);
  }

  function avg(values) {
    const nums = (values || []).map(Number).filter((value) => Number.isFinite(value));
    return nums.length ? nums.reduce((sum, value) => sum + value, 0) / nums.length : 0;
  }

  function averageLatestEggPercent(rows, days) {
    const slice = (rows || [])
      .slice()
      .sort((a, b) => String(a.dateKey || '').localeCompare(String(b.dateKey || '')))
      .slice(-Math.max(1, Number(days || 15)))
      .filter((row) => Number.isFinite(Number(row.eggPercent)));
    if (!slice.length) return 0;
    return slice.reduce((total, row) => total + Number(row.eggPercent || 0), 0) / slice.length;
  }

  function weightedEggPercent(daily) {
    const denominator = daily.reduce((sum, day) => sum + (day.eggPercent > 0 ? day.eggDaily / (day.eggPercent / 100) : 0), 0);
    const eggs = sum(daily, 'eggDaily');
    return denominator > 0 ? (eggs / denominator) * 100 : 0;
  }

  function sum(rows, key) { return (rows || []).reduce((s, r) => s + Number(r[key] || 0), 0); }
  function niceExtent(values) {
    const nums = (values || []).map((v) => Number(v || 0)).filter((v) => Number.isFinite(v));
    let min = Math.min(0, ...nums);
    let max = Math.max(1, ...nums);
    if (min < 0) min = -niceMax(Math.abs(min));
    max = niceMax(max);
    if (min === max) max = min + 1;
    return { min, max };
  }

  function valueToY(value, min, max, pane) {
    const span = Math.max(1e-9, Number(max) - Number(min));
    const ratio = (Number(value || 0) - Number(min)) / span;
    return pane.y + pane.h - ratio * pane.h;
  }

  function niceMax(value) { const v = Math.max(1, Number(value || 1)); const pow = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / pow) * pow; }
  function fmt(value) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 1 }); }
  function money(value) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 }) + ' ฿'; }
  function shortDate(key) { return String(key || '').slice(5); }
  function thaiDate(key) { const d = parseDate(key); if (!d) return key || '-'; const m = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']; return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear() + 543}`; }
  function thaiMonth(key) { const p = String(key || '').split('-'); const y = Number(p[0] || 0); const m = Number(p[1] || 0); const names = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']; return `${names[m - 1] || key} ${y ? y + 543 : ''}`; }
  function parseDate(key) { const p = String(key || '').slice(0, 10).split('-').map(Number); return p.length === 3 && p[0] ? new Date(p[0], p[1] - 1, p[2]) : null; }
  function latestUpdatedAt(response) {
    const candidates = [];
    const pushRows = (rows, keys) => (Array.isArray(rows) ? rows : []).forEach((row) => keys.forEach((key) => row?.[key] && candidates.push(row[key])));
    pushRows(response?.rows, ['updated_at', 'last_update', 'created_at', 'date_key']);
    pushRows(response?.chart?.egg, ['updated_at', 'date_key']);
    pushRows(response?.chart?.feed, ['updated_at', 'date_key']);
    pushRows(response?.chart?.duck, ['updated_at', 'date_key']);
    candidates.sort((a, b) => String(b).localeCompare(String(a)));
    return candidates[0] || '';
  }

  function readStoredNumber(key, fallback) {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) ? Math.max(0, Math.min(30, Math.round(value))) : fallback;
  }

  function clampHighlightDays(value, fallback) {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, Math.min(30, Math.round(num)));
  }

  function trendLabel(values) {
    const clean = (values || []).map(Number).filter((value) => value > 0);
    if (clean.length < 3) return 'ทรงตัว';
    const first = avg(clean.slice(0, Math.ceil(clean.length / 2)));
    const last = avg(clean.slice(Math.floor(clean.length / 2)));
    if (last > first * 1.04) return 'เพิ่มขึ้น';
    if (last < first * 0.96) return 'ลดลง';
    return 'ทรงตัว';
  }

  function shortDateTime(value) { return String(value || '').replace('T', ' ').slice(0, 16) || '-'; }
  function escapeAttr(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[ch])).replace(/`/g, '&#096;'); }
  function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[m])); }
  function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text || ''; }
  function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }

  return { bootstrap };
})();

window.addEventListener('DOMContentLoaded', () => window.ReportViewPage?.bootstrap?.());
