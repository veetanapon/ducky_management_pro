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


/* ===== js/core/state.js ===== */
window.AppState = (() => {
  const state = {
    auth: {
      userId: null,
      sessionToken: null,
      sessionExpire: null
    },
    batches: [],
    batchMeta: {
      lastUpdate: null,
      fetchedAt: null
    },
    ui: {
      page: document.body?.dataset?.page || '',
      search: '',
      offlineMode: false,
      fab: { actions: [] },
      batchForm: {
        mode: 'add',
        editId: null,
        imageBase64: null
      }
    }
  };

  const listeners = new Set();

  function get() {
    return state;
  }

  function patch(path, value) {
    const keys = path.split('.');
    let target = state;
    while (keys.length > 1) {
      target = target[keys.shift()];
    }
    target[keys[0]] = value;
    emit();
  }

  function merge(partial) {
    deepMerge(state, partial);
    emit();
  }

  function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function emit() {
    listeners.forEach((fn) => fn(state));
  }

  function deepMerge(target, source) {
    Object.keys(source).forEach((key) => {
      const value = source[key];
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        target[key] = target[key] || {};
        deepMerge(target[key], value);
      } else {
        target[key] = value;
      }
    });
  }

  return { get, patch, merge, subscribe };
})();


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


/* ===== js/core/auth.js ===== */
window.AppAuth = (() => {
  const REFRESH_BEFORE_MS = 5 * 60 * 1000;
  const WATCH_INTERVAL_MS = 30 * 1000;
  let refreshPromise = null;
  let sessionWatchTimer = null;
  let redirecting = false;

  function getSession(name = 'session_token') {
    try {
      return JSON.parse(sessionStorage.getItem(name) || 'null');
    } catch (error) {
      return null;
    }
  }

  function normalizeRole(value) {
    const role = String(value || '').trim().toLowerCase();
    if (role === 'admin' || role === 'administrator' || role === 'system_admin' || role === 'super_admin') return 'admin';
    return role || 'guest';
  }

  function normalizeBoolean(value) {
    if (value === true || value === 1) return true;
    const text = String(value == null ? '' : value).trim().toLowerCase();
    return text === '1' || text === 'true' || text === 'yes' || text === 'y' || text === 'admin';
  }

  function getPayloadProfile(payload = {}) {
    return payload.profile || payload.user || payload.user_profile || {};
  }

  function resolveSessionPayload(payload = {}) {
    const profile = getPayloadProfile(payload);
    let role = normalizeRole(payload.role ?? profile.role);
    let isAdmin = normalizeBoolean(payload.is_admin ?? profile.is_admin);
    if (role === 'admin') isAdmin = true;
    if (isAdmin) role = 'admin';
    return {
      user_id: payload.user_id || profile.user_id || profile.id || '',
      session_token: payload.session_token || payload.token || getSession(),
      session_expire: payload.session_expire || payload.expire_at || payload.expires_at || getSession('session_expire'),
      role,
      is_admin: isAdmin,
      display_name: payload.display_name ?? profile.display_name ?? '',
      farm_name: payload.farm_name ?? profile.farm_name ?? '',
      bill_note: payload.bill_note ?? profile.bill_note ?? ''
    };
  }

  function isAdminSession() {
    return normalizeBoolean(getSession('is_admin')) || normalizeRole(getSession('role')) === 'admin';
  }

  function setSession(payload) {
    const session = resolveSessionPayload(payload || {});
    sessionStorage.removeItem('menu_permissions');
    sessionStorage.removeItem('menu_permission_defs');
    sessionStorage.removeItem('menu_permissions_fetched_at');
    sessionStorage.removeItem('menu_permissions_user_id');
    try { localStorage.removeItem('ducky:lastBatchContext'); } catch (_) {}
    sessionStorage.setItem('user_id', JSON.stringify(session.user_id));
    sessionStorage.setItem('session_token', JSON.stringify(session.session_token));
    sessionStorage.setItem('session_expire', JSON.stringify(session.session_expire));
    sessionStorage.setItem('role', JSON.stringify(session.role));
    sessionStorage.setItem('is_admin', JSON.stringify(!!session.is_admin));
    sessionStorage.setItem('display_name', JSON.stringify(session.display_name || ''));
    sessionStorage.setItem('farm_name', JSON.stringify(session.farm_name || ''));
    sessionStorage.setItem('bill_note', JSON.stringify(session.bill_note || ''));
    redirecting = false;
    startSessionWatcher();

    if (window.AppState) {
      AppState.merge({
        auth: {
          userId: session.user_id,
          sessionToken: session.session_token,
          sessionExpire: session.session_expire
        }
      });
    }
  }

  function applySessionProfile(profile = {}) {
    const current = resolveSessionPayload({
      user_id: getSession('user_id'),
      session_token: getSession(),
      session_expire: getSession('session_expire'),
      role: getSession('role'),
      is_admin: getSession('is_admin'),
      display_name: getSession('display_name'),
      farm_name: getSession('farm_name'),
      bill_note: getSession('bill_note'),
      profile
    });
    sessionStorage.setItem('role', JSON.stringify(current.role));
    sessionStorage.setItem('is_admin', JSON.stringify(!!current.is_admin));
    sessionStorage.setItem('display_name', JSON.stringify(current.display_name || ''));
    sessionStorage.setItem('farm_name', JSON.stringify(current.farm_name || ''));
    sessionStorage.setItem('bill_note', JSON.stringify(current.bill_note || ''));
  }

  function clearSession() {
    sessionStorage.removeItem('user_id');
    sessionStorage.removeItem('session_token');
    sessionStorage.removeItem('session_expire');
    sessionStorage.removeItem('role');
    sessionStorage.removeItem('is_admin');
    sessionStorage.removeItem('display_name');
    sessionStorage.removeItem('farm_name');
    sessionStorage.removeItem('bill_note');
    sessionStorage.removeItem('menu_permissions');
    sessionStorage.removeItem('menu_permission_defs');
    sessionStorage.removeItem('menu_permissions_fetched_at');
    sessionStorage.removeItem('menu_permissions_user_id');
    try { localStorage.removeItem('ducky:lastBatchContext'); } catch (_) {}
  }

  function getExpireTime() {
    const raw = getSession('session_expire');
    if (!raw) return 0;
    const time = new Date(raw).getTime();
    return Number.isFinite(time) ? time : 0;
  }

  function isLoginPage() {
    return location.pathname.includes('login.html') || document.body?.classList?.contains('dm-login-page');
  }

  function cleanupForLogout() {
    clearSession();
    stopSessionWatcher();
    try {
      if (window.AppCache) {
        AppCache.clearBatchCache?.();
        AppCache.removeByPrefix?.('ducky:api:');
        AppCache.removeByPrefix?.('ducky:batch-dashboard:');
        AppCache.removeByPrefix?.('ducky:module:');
        AppCache.removeByPrefix?.('ducky:report:');
      }
    } catch (_) {}
  }

  async function ensureAuth() {
    if (isLoginPage()) return true;

    const sessionToken = getSession();
    if (!sessionToken) {
      redirectLogin('missing_session');
      return false;
    }

    const expireAt = getExpireTime();
    if (!expireAt) {
      redirectLogin('invalid_session');
      return false;
    }

    if (expireAt <= Date.now()) {
      const refreshed = await silentRefreshSession();
      if (refreshed) return true;
      redirectLogin('session_expired');
      return false;
    }

    if (expireAt - Date.now() > REFRESH_BEFORE_MS) {
      return true;
    }

    const refreshed = await silentRefreshSession();
    if (refreshed) return true;

    redirectLogin('session_expired');
    return false;
  }

  async function silentRefreshSession() {
    const sessionToken = getSession();
    if (!sessionToken || !window.AppApi?.postPublic) return false;

    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      try {
        const json = await AppApi.postPublic({ action: 'refresh_session', session_token: sessionToken }, { timeoutMs: 12000 });
        if (json?.status === 'ok' && json.session_token) {
          setSession(json);
          return true;
        }
        return false;
      } catch (error) {
        return false;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  function redirectLogin(reason = 'session_expired') {
    if (isLoginPage()) {
      cleanupForLogout();
      return;
    }
    if (redirecting) return;
    redirecting = true;

    try {
      sessionStorage.setItem('login_redirect_reason', String(reason || 'session_expired'));
      sessionStorage.setItem('login_redirect_after', location.pathname.split('/').pop() + location.search + location.hash);
    } catch (_) {}

    cleanupForLogout();
    location.replace('login.html?reason=' + encodeURIComponent(reason || 'session_expired'));
  }

  function logout() {
    redirecting = false;
    cleanupForLogout();
    redirectLogin('logout');
  }

  function stopSessionWatcher() {
    if (sessionWatchTimer) clearInterval(sessionWatchTimer);
    sessionWatchTimer = null;
  }

  function checkSessionNow({ redirect = true } = {}) {
    if (isLoginPage()) return true;
    const token = getSession();
    const expireAt = getExpireTime();
    const ok = !!token && !!expireAt && expireAt > Date.now();
    if (!ok && redirect) redirectLogin('session_expired');
    return ok;
  }

  function startSessionWatcher() {
    if (isLoginPage()) return;
    stopSessionWatcher();

    sessionWatchTimer = setInterval(() => {
      checkSessionNow({ redirect: true });
    }, WATCH_INTERVAL_MS);

    window.removeEventListener('focus', onSessionWatchSignal);
    window.addEventListener('focus', onSessionWatchSignal);
    document.removeEventListener('visibilitychange', onSessionWatchSignal);
    document.addEventListener('visibilitychange', onSessionWatchSignal);
    window.removeEventListener('pageshow', onSessionWatchSignal);
    window.addEventListener('pageshow', onSessionWatchSignal);
  }

  function onSessionWatchSignal() {
    if (document.visibilityState && document.visibilityState !== 'visible') return;
    checkSessionNow({ redirect: true });
  }

  async function login(email, deviceName) {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + '_' + Math.random().toString(16).slice(2);
      localStorage.setItem('device_id', deviceId);
    }

    const json = await AppApi.postPublic({
      action: 'auth',
      email,
      device_id: deviceId,
      device_name: deviceName || navigator.userAgent
    });

    if (json?.status === 'ok') {
      setSession(json);
    }

    return json;
  }

  function bootstrapLoginPage() {
    const token = getSession();
    const expireAt = getExpireTime();

    if (token && expireAt > Date.now()) {
      location.href = 'index.html';
      return;
    }

    cleanupForLogout();

    const params = new URLSearchParams(location.search || '');
    const reason = params.get('reason') || sessionStorage.getItem('login_redirect_reason') || '';
    const form = document.getElementById('loginForm');
    const status = document.getElementById('status');
    const button = document.getElementById('submitLogin');
    if (!form) return;

    if (status && reason && reason !== 'logout') {
      status.textContent = 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      button.disabled = true;
      status.textContent = 'กำลังเข้าสู่ระบบ...';

      const email = document.getElementById('email').value.trim();
      const deviceName = document.getElementById('deviceName').value.trim();

      if (!email) {
        status.textContent = 'กรุณากรอกอีเมล';
        button.disabled = false;
        return;
      }

      const result = await login(email, deviceName);
      button.disabled = false;

      if (result?.status === 'ok') {
        // The backend returns role/is_admin inside result.profile. setSession() now normalizes that shape.
        let next = 'index.html';
        try {
          const stored = sessionStorage.getItem('login_redirect_after');
          if (stored && !stored.includes('login.html')) next = stored;
          sessionStorage.removeItem('login_redirect_after');
          sessionStorage.removeItem('login_redirect_reason');
        } catch (_) {}
        location.href = next;
        return;
      }

      if (result?.status === 'pending') {
        status.textContent = 'บัญชียังไม่ได้รับอนุมัติ';
        return;
      }

      if (result?.status === 'device_limit') {
        status.textContent = 'อุปกรณ์เกินจำนวนที่อนุญาต';
        return;
      }

      status.textContent = result?.message || 'เข้าสู่ระบบไม่สำเร็จ';
    });
  }

  return {
    getSession,
    setSession,
    clearSession,
    ensureAuth,
    silentRefreshSession,
    redirectLogin,
    logout,
    startSessionWatcher,
    stopSessionWatcher,
    checkSessionNow,
    isAdminSession,
    applySessionProfile,
    bootstrapLoginPage
  };
})();


/* ===== js/core/dom.js ===== */
window.AppDom = (() => {
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const byId = (id) => document.getElementById(id);
  function setText(id, text) { const el = byId(id); if (el) el.textContent = text == null ? '' : String(text); }
  function toggle(el, show) { if (el) el.classList.toggle('hidden', !show); }
  function disableWhile(button, promise, label) {
    if (!button) return promise;
    const old = button.textContent;
    button.disabled = true;
    if (label) button.textContent = label;
    return Promise.resolve(promise).finally(() => { button.disabled = false; button.textContent = old; });
  }
  return { qs, qsa, byId, setText, toggle, disableWhile };
})();


/* ===== js/core/format.js ===== */
window.AppFormat = (() => {
  function number(value, digits = 0) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: digits }); }
  function money(value) { return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
  function todayKey() { return new Date().toISOString().slice(0, 10); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])); }
  return { number, money, monthKey, todayKey, escapeHtml };
})();


/* ===== js/core/image.js ===== */
window.AppImage = (() => {
  function fileToBase64(file) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); }); }
  function resizeDataUrl(dataUrl, maxW = 1200, maxH = 900, quality = 0.82) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        const ratio = Math.min(maxW / width, maxH / height, 1);
        width = Math.round(width * ratio); height = Math.round(height * ratio);
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = dataUrl;
    });
  }
  return { fileToBase64, resizeDataUrl };
})();


/* ===== js/services/batch.service.js ===== */
window.BatchApi = {
  list: (lastUpdate) => AppApi.postCached({ action: 'getAllBatches', lastUpdate }, { background: true, maxStaleMs: 24 * 60 * 60 * 1000 }),
  dashboard: (batchId) => AppApi.postCached({ action: 'getBatchDashboardSummary', batch_id: batchId }, { background: true, maxStaleMs: 6 * 60 * 60 * 1000 }),
  detail: (batchId) => AppApi.postCached({ action: 'getBatchFullDetail', batch_id: batchId }, { background: true, maxStaleMs: 6 * 60 * 60 * 1000 }),
  save: (payload) => AppApi.post(payload),
  movement: (payload) => AppApi.post({ action: 'saveBatchMovement', ...payload })
};


/* ===== js/services/feed.service.js ===== */
window.FeedApi = {
  pageData: (batchId, month) => AppApi.postCached({ action: 'getModuleCalendarData', batch_id: batchId, module_type: 'feed_manage', month }, { background: true, maxStaleMs: 12 * 60 * 60 * 1000 }),
  saveLog: (payload) => AppApi.post({ action: 'saveFeedLog', ...payload }),
  record: (payload) => AppApi.postCached({ action: 'getFeedLogRecord', ...payload }, { background: true, maxStaleMs: 6 * 60 * 60 * 1000 })
};


/* ===== js/services/egg.service.js ===== */
window.EggApi = {
  pageData: (batchId, month) => AppApi.postCached({ action: 'getModuleCalendarData', batch_id: batchId, module_type: 'egg_daily', month }, { background: true, maxStaleMs: 12 * 60 * 60 * 1000 }),
  saveLog: (payload) => AppApi.post({ action: 'saveEggDailyLog', ...payload }),
  record: (payload) => AppApi.postCached({ action: 'getEggDailyRecord', ...payload }, { background: true, maxStaleMs: 6 * 60 * 60 * 1000 })
};


/* ===== js/services/sale.service.js ===== */
window.SaleApi = {
  pageData: (batchId, month) => AppApi.postCached({ action: 'getModuleCalendarData', batch_id: batchId, module_type: 'sale_manage', month }, { background: true, maxStaleMs: 12 * 60 * 60 * 1000 }),
  saveBill: (payload) => AppApi.post({ action: 'saveBatchSaleBill', ...payload }),
  billRecord: (payload) => AppApi.postCached({ action: 'getSaleBillRecord', ...payload }, { background: true, maxStaleMs: 6 * 60 * 60 * 1000 }),
  billsForDate: (payload) => AppApi.postCached({ action: 'getSaleBillsForDate', ...payload }, { background: true, maxStaleMs: 6 * 60 * 60 * 1000 }),
  rangeSummary: (payload) => AppApi.postCached({ action: 'getSaleBillRangeSummary', ...payload }, { background: true, maxStaleMs: 6 * 60 * 60 * 1000 }),
  billEditBundle: (payload) => AppApi.postCached({ action: 'getSaleBillEditBundle', ...payload }, { timeoutMs: 25000, background: true, maxStaleMs: 6 * 60 * 60 * 1000 }),
  preBillEditBundle: (payload) => AppApi.postCached({ action: 'getPreBillEditBundle', ...payload }, { timeoutMs: 25000, background: true, maxStaleMs: 6 * 60 * 60 * 1000 }),
  effectiveEgg: (batchId) => AppApi.postCached({ action: 'getEffectiveEggPriceSet', batch_id: batchId }, { ttlMs: 12 * 60 * 60 * 1000, background: true, maxStaleMs: 7 * 24 * 60 * 60 * 1000 })
};


/* ===== js/services/price.service.js ===== */
window.PriceApi = {
  adminData: () => AppApi.postCached({ action: 'getItemPriceAdminData' }, { background: true, maxStaleMs: 12 * 60 * 60 * 1000 }),
  effectiveEgg: (batchId) => AppApi.postCached({ action: 'getEffectiveEggPriceSet', batch_id: batchId }, { ttlMs: 12 * 60 * 60 * 1000, background: true, maxStaleMs: 7 * 24 * 60 * 60 * 1000 }),
  saveSet: (payload) => AppApi.post({ action: 'savePriceSet', ...payload })
};


/* ===== js/services/permission.service.js ===== */
window.PermissionApi = {
  adminOptions: () => AppApi.postCached({ action: 'getPermissionAdminOptions' }, { ttlMs: 5 * 60 * 1000, background: true, maxStaleMs: 12 * 60 * 60 * 1000 }),
  accessList: (batchId) => AppApi.postCached({ action: 'getBatchAccessList', batch_id: batchId }, { background: true, maxStaleMs: 6 * 60 * 60 * 1000 }),
  accessSummary: (batchId) => AppApi.postCached({ action: 'getBatchAccessSummary', batch_id: batchId }, { background: true, maxStaleMs: 6 * 60 * 60 * 1000 })
};


/* ===== js/services/menu-permission.service.js ===== */
window.MenuPermissionApi = (() => {
  const STORAGE_KEY = 'menu_permissions';
  const DEF_KEY = 'menu_permission_defs';
  const FETCHED_KEY = 'menu_permissions_fetched_at';
  const USER_KEY = 'menu_permissions_user_id';
  const TTL_MS = 5 * 60 * 1000;

  const MENU_KEYS = ['batch_list', 'feed_order_bills', 'batch_create'];

  function normalizePermission(value) {
    const permission = String(value || '').trim().toLowerCase();
    if (permission === 'write' || permission === 'rw' || permission === 'r&w') return 'write';
    if (permission === 'view' || permission === 'read' || permission === 'readonly' || permission === 'read_only') return 'view';
    return 'none';
  }

  function normalizeMenuKey(value) {
    let key = String(value || '').trim().toLowerCase().replace(/-/g, '_');
    if (key === 'index') key = 'batch_list';
    if (key === 'add_batch' || key === 'create_batch') key = 'batch_create';
    if (key === 'feed_order_bill') key = 'feed_order_bills';
    return MENU_KEYS.includes(key) ? key : '';
  }

  function isAdminSession() {
    if (window.AppAuth?.isAdminSession) return AppAuth.isAdminSession();
    const role = String(window.AppAuth?.getSession?.('role') || '').trim().toLowerCase();
    const flag = window.AppAuth?.getSession?.('is_admin');
    const flagText = String(flag == null ? '' : flag).trim().toLowerCase();
    return role === 'admin' || flag === true || flag === 1 || flagText === '1' || flagText === 'true' || flagText === 'yes';
  }

  function currentUserId() {
    try { return String(window.AppAuth?.getSession?.('user_id') || ''); }
    catch (_) { return ''; }
  }

  function adminFullMap() {
    return MENU_KEYS.reduce((acc, key) => {
      acc[key] = 'write';
      return acc;
    }, {});
  }

  function safeParse(key, fallback) {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (_) {
      return fallback;
    }
  }

  function writeCache(permissions, defs) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(permissions || {}));
      sessionStorage.setItem(FETCHED_KEY, JSON.stringify(Date.now()));
      sessionStorage.setItem(USER_KEY, JSON.stringify(currentUserId()));
      if (Array.isArray(defs)) sessionStorage.setItem(DEF_KEY, JSON.stringify(defs));
    } catch (_) {}
  }

  function clearCache() {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(DEF_KEY);
      sessionStorage.removeItem(FETCHED_KEY);
      sessionStorage.removeItem(USER_KEY);
    } catch (_) {}
  }

  function getCached() {
    if (isAdminSession()) return adminFullMap();
    const cachedUserId = String(safeParse(USER_KEY, '') || '');
    if (cachedUserId && cachedUserId !== currentUserId()) {
      clearCache();
      return {};
    }
    const permissions = safeParse(STORAGE_KEY, null);
    if (!permissions || typeof permissions !== 'object') return {};
    return permissions;
  }

  function getDefs() {
    return safeParse(DEF_KEY, []);
  }

  function isFresh() {
    const cachedUserId = String(safeParse(USER_KEY, '') || '');
    if (cachedUserId && cachedUserId !== currentUserId()) return false;
    const fetchedAt = Number(safeParse(FETCHED_KEY, 0) || 0);
    return fetchedAt && Date.now() - fetchedAt <= TTL_MS;
  }

  async function ensureLoaded({ force = false } = {}) {
    const cached = getCached();
    const hasCached = Object.keys(cached || {}).length > 0;
    if (!force && hasCached && isFresh()) {
      return { status: 'ok', menu_permissions: cached, menu_defs: getDefs(), cached: true };
    }

    function applyResponse(res) {
      if (res?.status !== 'ok') return res;
      const profile = res.profile || res.user || {};
      if (res.is_admin != null || profile.is_admin != null || profile.role) {
        window.AppAuth?.applySessionProfile?.({
          ...profile,
          role: profile.role || (res.is_admin ? 'admin' : undefined),
          is_admin: res.is_admin != null ? res.is_admin : profile.is_admin
        });
      }
      writeCache(res.menu_permissions || res.permissions || {}, res.menu_defs || []);
      return res;
    }

    if (!window.AppApi?.postCached) return hasCached ? { status: 'ok', menu_permissions: cached, menu_defs: getDefs(), cached: true, stale: true } : null;

    // ถ้ามี cache เก่า ให้ปล่อยหน้าโหลดต่อทันที แล้ว refresh permission เงียบ ๆ
    if (!force && hasCached) {
      AppApi.postCached(
        { action: 'getMyMenuPermissions' },
        { ttlMs: TTL_MS, maxStaleMs: 12 * 60 * 60 * 1000, background: true, onUpdate: applyResponse }
      ).then(applyResponse).catch(() => null);
      return { status: 'ok', menu_permissions: cached, menu_defs: getDefs(), cached: true, stale: true };
    }

    const res = await AppApi.postCached(
      { action: 'getMyMenuPermissions' },
      { ttlMs: TTL_MS, maxStaleMs: 12 * 60 * 60 * 1000, background: true, onUpdate: applyResponse }
    );
    return applyResponse(res);
  }

  function permissionOf(menuKey) {
    const key = normalizeMenuKey(menuKey);
    if (!key) return 'none';
    const permissions = getCached();
    return normalizePermission(permissions[key]);
  }

  function canView(menuKey) {
    const permission = permissionOf(menuKey);
    return permission === 'view' || permission === 'write';
  }

  function canWrite(menuKey) {
    return permissionOf(menuKey) === 'write';
  }

  function adminOptions() {
    return AppApi.postCached({ action: 'getProgramMenuPermissionAdminOptions' }, { ttlMs: TTL_MS, background: false });
  }

  function userPermissions(targetUserId) {
    return AppApi.post({ action: 'getUserMenuPermissionList', target_user_id: targetUserId });
  }

  function saveUserPermissions(targetUserId, permissions) {
    return AppApi.post({ action: 'upsertUserMenuPermission', target_user_id: targetUserId, permissions });
  }

  function revoke(targetUserId, menuKey = '') {
    return AppApi.post({ action: 'revokeUserMenuPermission', target_user_id: targetUserId, menu_key: menuKey });
  }

  function migrateExistingUsers() {
    return AppApi.post({ action: 'migrateExistingUsersToFullMenuPermissions' }, { timeoutMs: 30000 });
  }

  function ensureSheetReady() {
    return AppApi.post({ action: 'ensureProgramMenuPermissionsReady' });
  }

  return {
    MENU_KEYS,
    normalizeMenuKey,
    normalizePermission,
    ensureLoaded,
    getCached,
    getDefs,
    clearCache,
    permissionOf,
    canView,
    canWrite,
    adminOptions,
    userPermissions,
    saveUserPermissions,
    revoke,
    migrateExistingUsers,
    ensureSheetReady
  };
})();


/* ===== js/services/report.service.js ===== */
window.ReportApi = {
  pageData: (batchId) => AppApi.postCached(
    { action: 'getReportPageData', batch_id: batchId },
    { ttlMs: 2 * 60 * 1000, maxStaleMs: 24 * 60 * 60 * 1000, background: true, timeoutMs: 10000 }
  ),
  rebuild: (batchId) => AppApi.post({ action: 'rebuildReportForBatch', batch_id: batchId }, { timeoutMs: 30000 }),
  exportExcel: (batchId, month) => AppApi.post({ action: 'exportReportExcel', batch_id: batchId, month }, { timeoutMs: 30000 }),
  publicView: (key) => AppApi.postPublic({ action: 'getReportPublicViewData', view_key: key }, { timeoutMs: 10000, ttlMs: 60 * 1000, maxStaleMs: 6 * 60 * 60 * 1000, background: true })
};


/* ===== js/services/liff.service.js ===== */
window.LiffRouteApi = {
  pageData: (batchId) => AppApi.postCached({ action: 'getLiffBatchRoutePageData', batch_id: batchId }, { ttlMs: 2 * 60 * 1000, background: true, maxStaleMs: 12 * 60 * 60 * 1000 }),
  save: (payload) => AppApi.post({ action: 'saveLiffBatchRoute', ...payload }),
  generateKey: (batchId) => AppApi.post({ action: 'generateLiffRouteKey', batch_id: batchId })
};


/* ===== js/services/event.service.js ===== */
window.EventApi = {
  pageData: (batchId) => AppApi.postCached({ action: 'getBatchEventsPageData', batch_id: batchId }, { ttlMs: 2 * 60 * 1000, background: true, maxStaleMs: 12 * 60 * 60 * 1000 }),
  saveFeedConsumption: (payload) => AppApi.post({ action: 'saveFeedConsumptionLog', ...payload }),
  saveEvent: (payload) => AppApi.post({ action: 'saveBatchEvent', ...payload }),
  saveMedicalInventory: (payload) => AppApi.post({ action: 'saveMedicalInventoryLog', ...payload }),
  deleteEvent: (payload) => AppApi.post({ action: 'deleteBatchEvent', ...payload })
};


/* ===== js/components/bottom-sheet.js ===== */
window.BottomSheet = (() => {
  function open(id) { const sheet = document.getElementById(id); if (!sheet) return; sheet.classList.remove('hidden'); requestAnimationFrame(() => sheet.classList.add('show')); }
  function close(id) { const sheet = document.getElementById(id); if (!sheet) return; sheet.classList.remove('show'); setTimeout(() => sheet.classList.add('hidden'), 220); }
  return { open, close };
})();


/* ===== js/components/calendar-grid.js ===== */
window.CalendarGrid = (() => {
  function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
  function daysInMonth(key) { const [y,m] = String(key).split('-').map(Number); return new Date(y, m, 0).getDate(); }
  return { monthKey, daysInMonth };
})();


/* ===== js/components/summary-cards.js ===== */
window.SummaryCards = (() => {
  function render(container, cards = []) {
    if (!container) return;
    container.innerHTML = cards.map((card) => `<div class="module-summary-card"><span class="module-summary-label">${AppFormat?.escapeHtml?.(card.label) ?? card.label}</span><strong class="module-summary-value">${AppFormat?.escapeHtml?.(card.value) ?? card.value}</strong><span class="muted">${AppFormat?.escapeHtml?.(card.note || '') ?? ''}</span></div>`).join('');
  }
  return { render };
})();


/* ===== js/components/skeleton.js ===== */
window.Skeleton = (() => {
  function cards(count = 3) { return Array.from({ length: count }, () => '<div class="skeleton-wrap"><div class="skeleton-card"><div class="skeleton skeleton-thumb"></div><div style="flex:1"><div class="skeleton skeleton-line long"></div><div class="skeleton skeleton-line short"></div></div></div></div>').join(''); }
  return { cards };
})();


/* ===== js/components/fab.js ===== */
window.AppFab = (() => {
  function close(root) { root?.classList?.remove('open'); }
  function toggle(root) { root?.classList?.toggle('open'); }
  return { close, toggle };
})();


/* ===== js/components/bill-preview.js ===== */
window.BillPreview = (() => {
  function loadCanvasImage(src) {
    return new Promise((resolve) => {
      if (!src) return resolve(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function drawCenteredText(ctx, text, centerX, y) {
    const safeText = String(text || '');
    const previousAlign = ctx.textAlign;
    const previousDirection = ('direction' in ctx) ? ctx.direction : null;

    // Use an explicit LTR + left-aligned draw position for centered Thai text.
    // Some mobile WebViews misplace canvas text when using textAlign='center',
    // especially after drawing right-aligned amount columns.
    if ('direction' in ctx) ctx.direction = 'ltr';
    ctx.textAlign = 'left';

    const metrics = ctx.measureText(safeText);
    const left = Number(metrics.actualBoundingBoxLeft || 0);
    const right = Number(metrics.actualBoundingBoxRight || metrics.width || 0);
    const visualWidth = Math.abs(left) + Math.abs(right);
    const x = Math.round(centerX - visualWidth / 2 - left);
    ctx.fillText(safeText, x, Math.round(y));

    ctx.textAlign = previousAlign;
    if (previousDirection != null) ctx.direction = previousDirection;
  }

  function fitCenteredText(ctx, text, centerX, y, maxWidth, weight = 'bold', startSize = 22, minSize = 13) {
    const safeText = String(text || '');
    let size = startSize;
    while (size > minSize) {
      ctx.font = `${weight} ${size}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      if (ctx.measureText(safeText).width <= maxWidth) break;
      size -= 1;
    }
    drawCenteredText(ctx, safeText, centerX, y);
    return size;
  }

  function defaultWrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const source = String(text || '');
    const paragraphs = source.split(/\r?\n/);
    let currentY = y;
    paragraphs.forEach((paragraph, pIndex) => {
      const words = paragraph.split(/\s+/).filter(Boolean);
      if (!words.length) {
        currentY += lineHeight;
        return;
      }
      let line = '';
      words.forEach((word) => {
        const testLine = line ? `${line} ${word}` : word;
        if (ctx.measureText(testLine).width > maxWidth && line) {
          ctx.fillText(line, x, currentY);
          line = word;
          currentY += lineHeight;
        } else {
          line = testLine;
        }
      });
      if (line) ctx.fillText(line, x, currentY);
      if (pIndex < paragraphs.length - 1) currentY += lineHeight;
    });
    return currentY;
  }

  function compactDate(value, helpers = {}) {
    if (helpers.formatThaiDate) return helpers.formatThaiDate(value);
    if (!value) return '-';
    const text = String(value).slice(0, 10);
    const parts = text.split('-').map(Number);
    if (parts.length === 3 && parts.every((v) => !Number.isNaN(v))) {
      const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
      return `${parts[2]} ${months[(parts[1] || 1) - 1]} ${parts[0] + 543}`;
    }
    return text;
  }

  function formatNumber(value, helpers = {}) {
    if (helpers.formatNumber) return helpers.formatNumber(value);
    return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 });
  }

  function formatMoney(value, helpers = {}) {
    if (helpers.formatMoney) return helpers.formatMoney(value);
    return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  async function renderBillImage(draft = {}, helpers = {}) {
    const width = helpers.width || 430;
    const padding = helpers.padding || 22;
    const lineGap = 18;
    const items = Array.isArray(draft.items) ? draft.items : [];
    const itemBlockHeight = helpers.itemBlockHeight || 52;
    const hasRemark = !!String(draft.remark || '').trim();
    const logoSize = helpers.logoSize || 54;
    const headerHeight = 154;
    const remarkReserve = hasRemark ? 96 : 24;
    const thankYouHeight = 34;
    const bottomPadding = helpers.bottomPadding || 42;
    const discountRows = Number(draft.discount || 0) > 0 ? 2 : 1;
    const height = Math.max(
      320,
      headerHeight +
        (items.length * itemBlockHeight) +
        remarkReserve +
        thankYouHeight +
        (discountRows * lineGap) +
        bottomPadding +
        34
    );

    const dpr = Math.min(window.devicePixelRatio || 2, 3);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    if ('direction' in ctx) ctx.direction = 'ltr';
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#111827';
    ctx.textBaseline = 'top';

    let y = padding;
    const logoSrc = draft.logo_url || draft.logoUrl || helpers.logoUrl || 'assets/farm-logo.png';
    const logo = await loadCanvasImage(logoSrc);
    if (logo) {
      ctx.drawImage(logo, Math.round((width - logoSize) / 2), y, logoSize, logoSize);
      y += logoSize + 8;
    }

    ctx.fillStyle = '#111827';
    fitCenteredText(ctx, draft.farm_name || draft.farmName || 'FARM', width / 2, y, width - (padding * 2), 'bold', 22, 13);
    y += 30;
    fitCenteredText(ctx, draft.bill_title || draft.title || helpers.title || 'บิลเงินสด', width / 2, y, width - (padding * 2), 'bold', 17, 13);
    y += 28;

    ctx.textAlign = 'left';
    ctx.font = '14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#374151';
    ctx.fillText('วันที่ขาย: ' + compactDate(draft.log_date, helpers), padding, y);
    y += lineGap;
    ctx.fillText('เวลาออกบิล: ' + (draft.issue_date || '-'), padding, y);
    y += lineGap;
    ctx.fillText('ชุดสัตว์: ' + (draft.batch_name || '-'), padding, y);
    y += 20;

    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
    y += 12;

    items.forEach((item) => {
      const itemName = item.display_name || item.item_name || item.name || '-';
      const unitLabel = item.unit_label || item.unit || '';
      const qtyText = draft.sale_type === 'egg' && item.total_qty != null
        ? `${formatNumber(item.qty, helpers)} ${unitLabel} (${formatNumber(item.total_qty, helpers)} ฟอง) x ${formatMoney(item.unit_price, helpers)}`
        : `${formatNumber(item.qty, helpers)} ${unitLabel} x ${formatMoney(item.unit_price, helpers)}`;

      ctx.textAlign = 'left';
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillText(itemName, padding, y, width - (padding * 2));
      y += 18;

      ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = '#4b5563';
      ctx.fillText(qtyText, padding, y, width - (padding * 2) - 112);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#111827';
      ctx.fillText(formatMoney(item.line_total, helpers), width - padding, y, 108);
      y += itemBlockHeight - 18;
    });

    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
    y += 12;

    ctx.textAlign = 'left';
    ctx.fillStyle = '#111827';
    ctx.font = '14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('รวมก่อนหักส่วนลด', padding, y);
    ctx.textAlign = 'right';
    ctx.fillText(formatMoney(draft.sub_total || draft.subTotal || draft.grand_total, helpers), width - padding, y);
    y += lineGap;

    if (Number(draft.discount || 0) > 0) {
      ctx.textAlign = 'left';
      ctx.fillText('ส่วนลด', padding, y);
      ctx.textAlign = 'right';
      ctx.fillText('-' + formatMoney(draft.discount, helpers), width - padding, y);
      y += lineGap;
    }

    ctx.textAlign = 'left';
    ctx.fillStyle = '#111827';
    ctx.font = 'bold 16px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText('สุทธิ', padding, y);
    ctx.textAlign = 'right';
    ctx.font = 'bold 18px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillText(formatMoney(draft.grand_total || draft.grandTotal || 0, helpers), width - padding, y);
    y += 32;

    if (hasRemark) {
      ctx.textAlign = 'left';
      ctx.font = '13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
      ctx.fillStyle = '#4b5563';
      const wrap = helpers.wrapText || defaultWrapText;
      const remarkEndY = wrap(ctx, 'หมายเหตุ: ' + draft.remark, padding, y, width - (padding * 2), 17);
      y = Number.isFinite(remarkEndY) ? remarkEndY + 18 : y + 48;
    } else {
      y += 12;
    }

    const thankYouY = Math.min(y, height - padding - 22);
    ctx.textAlign = 'left';
    ctx.font = 'bold 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#0f766e';
    drawCenteredText(ctx, helpers.thankYouText || 'ขอบคุณที่อุดหนุน', width / 2, thankYouY);
    ctx.textAlign = 'left';

    return canvas.toDataURL('image/png');
  }

  return { renderBillImage, loadCanvasImage, drawCenteredText, fitCenteredText };
})();


/* ===== js/modules/nav.js ===== */
window.NavDrawer = (() => {
  const state = {
    isOpen: false,
    page: 'index',
    batch: null,
    touchStartX: null,
    touchStartY: null
  };

  const PAGE_LABELS = {
    batch: 'ภาพรวม batch',
    batch_dashboard: 'ภาพรวม batch',
    batch_manage: 'จัดการชุดสัตว์',
    module_feed: 'จัดการอาหาร',
    module_egg_daily: 'บันทึกจำนวนไข่รายวัน',
    module_sale: 'ขายออก/บิล',
    batch_access: 'สิทธิ์การเข้าถึง batch',
    admin_permissions: 'จัดการสิทธิ์ Batch',
    program_permissions: 'สิทธิ์เมนูหลัก',
    items_price_manage: 'จัดการราคาไข่',
    liff_routes: 'จัดการลิงก์ LIFF',
    report: 'รายงาน',
    report_view: 'รายงานแบบแชร์',
    farm_events: 'กิจกรรม',
    feed_order_bills: 'บิลอาหารกลาง',
    medicine: 'คลังยา / วิตามิน',
    medicine_manage: 'คลังยา / วิตามิน',
    system_health: 'System Health',
    diagnostics: 'Diagnostics'
  };

  function ensureShell() {
    if (document.getElementById('navOverlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'navOverlay';
    overlay.className = 'nav-overlay hidden';
    overlay.hidden = true;

    const drawer = document.createElement('aside');
    drawer.id = 'sideNav';
    drawer.className = 'side-nav';
    drawer.inert = true;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);

    overlay.addEventListener('click', close);
    drawer.addEventListener('click', handleDrawerClick);
  }

  function init(options = {}) {
    ensureShell();
    state.page = resolvePageKey(options.page || document.body?.dataset?.page || 'index');
    state.batch = options.batch || readStoredBatchContext() || null;
    render();
    bind();
    if (window.MenuPermissionApi?.ensureLoaded) {
      MenuPermissionApi.ensureLoaded().then(() => render()).catch(() => render());
    }
  }

  function resolvePageKey(page) {
    const bodyPage = page || document.body?.dataset?.page || '';
    const moduleType = document.body?.dataset?.module || '';

    if (bodyPage === 'module_calendar') {
      if (moduleType === 'feed_manage') return 'module_feed';
      if (moduleType === 'egg_daily') return 'module_egg_daily';
      if (moduleType === 'sale_manage') return 'module_sale';
      if (moduleType === 'report') return 'report';
    }

    if (bodyPage === 'batch' || bodyPage === 'batch_dashboard') return 'batch_dashboard';
    if (bodyPage === 'items_price_manage' || bodyPage === 'item_price_manage' || bodyPage === 'item-price-manage') return 'items_price_manage';
    if (bodyPage === 'program_permissions' || bodyPage === 'program-permissions') return 'program_permissions';
    if (bodyPage === 'admin_permissions' || bodyPage === 'admin-permissions') return 'admin_permissions';
    if (bodyPage === 'liff_routes' || bodyPage === 'liff-routes') return 'liff_routes';
    if (bodyPage === 'medicine_manage' || bodyPage === 'medicine' || bodyPage === 'module_medicine') return 'medicine';
    if (bodyPage === 'system_health' || bodyPage === 'system-health') return 'system_health';
    if (bodyPage === 'diagnostics') return 'diagnostics';
    if (bodyPage === 'farm_events' || bodyPage === 'batch_events' || bodyPage === 'batch-events') return 'farm_events';
    if (bodyPage === 'report_view' || bodyPage === 'report-view') return 'report_view';
    if (bodyPage === 'feed_order_bills' || bodyPage === 'feed-order-bills') return 'feed_order_bills';
    return bodyPage || 'index';
  }

  function setBatchContext(batch) {
    const sessionUserId = getSessionUserId();
    state.batch = batch ? sanitizeBatchContext({ ...batch, _user_id: sessionUserId }) : null;
    storeBatchContext(state.batch);
    state.page = resolvePageKey(document.body?.dataset?.page || state.page);
    render();
  }

  function getSessionUserId() {
    try {
      return String(window.AppAuth?.getSession?.('user_id') || '');
    } catch (_) {
      return '';
    }
  }

  function sanitizeBatchContext(batch) {
    if (!batch) return null;
    const sessionIsAdmin = isAdminSession();
    const sanitized = {
      ...batch,
      _user_id: String(batch._user_id || getSessionUserId() || ''),
      // isAdmin is never trusted from localStorage. System/admin menus are based on session only.
      isAdmin: sessionIsAdmin,
      isOwner: !!batch.isOwner,
      module_permissions: batch.module_permissions || {}
    };
    return sanitized;
  }

  function readStoredBatchContext() {
    try {
      const raw = localStorage.getItem('ducky:lastBatchContext');
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const sessionUserId = getSessionUserId();
      if (!sessionUserId || String(parsed._user_id || '') !== sessionUserId) {
        localStorage.removeItem('ducky:lastBatchContext');
        return null;
      }
      return sanitizeBatchContext(parsed);
    } catch (_) {
      return null;
    }
  }

  function storeBatchContext(batch) {
    try {
      if (!batch) {
        localStorage.removeItem('ducky:lastBatchContext');
        return;
      }
      const sessionUserId = getSessionUserId();
      if (!sessionUserId) return;
      localStorage.setItem('ducky:lastBatchContext', JSON.stringify(sanitizeBatchContext({ ...batch, _user_id: sessionUserId })));
    } catch (_) {}
  }

  function bind() {
    document.querySelectorAll('[data-nav-toggle]').forEach((button) => {
      button.removeEventListener('click', toggle);
      button.addEventListener('click', toggle);
    });

    document.removeEventListener('touchstart', onTouchStart);
    document.removeEventListener('touchend', onTouchEnd);
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });

    window.removeEventListener('keydown', onKeyDown);
    window.addEventListener('keydown', onKeyDown);
  }

  function onKeyDown(event) {
    if (event.key === 'Escape' && state.isOpen) close();
  }

  function onTouchStart(event) {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    state.touchStartX = touch.clientX;
    state.touchStartY = touch.clientY;
  }

  function onTouchEnd(event) {
    const touch = event.changedTouches?.[0];
    if (!touch || state.touchStartX === null) return;

    const diffX = touch.clientX - state.touchStartX;
    const diffY = Math.abs(touch.clientY - state.touchStartY);

    if (diffY > 60) {
      resetTouch();
      return;
    }

    const startedNearLeftEdge = state.touchStartX <= 28;
    const startedInsideDrawer = state.touchStartX <= 280;

    if (!state.isOpen && startedNearLeftEdge && diffX > 70) {
      open();
    } else if (state.isOpen && startedInsideDrawer && diffX < -70) {
      close();
    }

    resetTouch();
  }

  function resetTouch() {
    state.touchStartX = null;
    state.touchStartY = null;
  }

  function open() {
    const overlay = document.getElementById('navOverlay');
    const drawer = document.getElementById('sideNav');
    if (!overlay || !drawer) return;
    state.isOpen = true;
    overlay.hidden = false;
    overlay.classList.remove('hidden');
    drawer.classList.add('show');
    drawer.inert = false;
    document.body.classList.add('drawer-open');
  }

  function close() {
    const overlay = document.getElementById('navOverlay');
    const drawer = document.getElementById('sideNav');
    if (!overlay || !drawer) return;
    state.isOpen = false;
    drawer.classList.remove('show');
    drawer.inert = true;
    overlay.classList.add('hidden');
    setTimeout(() => { if (!state.isOpen) overlay.hidden = true; }, 180);
    document.body.classList.remove('drawer-open');
  }

  function toggle() {
    if (state.isOpen) close();
    else open();
  }

  function handleDrawerClick(event) {
    const action = event.target.closest('[data-nav-action]');
    if (!action) return;
    const type = action.dataset.navAction;

    if (type === 'open-add-batch') {
      event.preventDefault();
      close();
      if (!canWriteProgramMenu('batch_create')) {
        alert('ไม่มีสิทธิ์เพิ่มชุดสัตว์');
        return;
      }
      if (state.page === 'index' && window.IndexBatchForm) {
        IndexBatchForm.open('add');
        return;
      }
      location.href = 'index.html?action=add_batch';
      return;
    }

    if (type === 'todo') {
      event.preventDefault();
      close();
      return;
    }

    close();
  }

  function render() {
    const drawer = document.getElementById('sideNav');
    if (!drawer) return;

    const menu = buildMenu();
    drawer.innerHTML = `
      <div class="side-nav__header">
        <div>
          <div class="side-nav__eyebrow">Ducky Management Pro</div>
          <div class="side-nav__title">เมนูหลัก</div>
        </div>
        <button type="button" class="icon-btn side-nav__close" data-nav-toggle>×</button>
      </div>
      <div class="side-nav__scroll">
        ${menu.map(renderSection).join('')}
      </div>
    `;

    drawer.querySelectorAll('[data-nav-toggle]').forEach((button) => {
      button.addEventListener('click', toggle);
    });
  }

  function renderSection(section) {
    if (!section.items.length) return '';
    return `
      <section class="side-nav__section">
        <div class="side-nav__section-title">${section.title}</div>
        <div class="side-nav__items">
          ${section.items.map(renderItem).join('')}
        </div>
      </section>
    `;
  }

  function renderItem(item) {
    const className = ['side-nav__item'];
    if (item.active) className.push('active');
    if (item.disabled) className.push('disabled');
    const attrs = item.disabled
      ? 'href="#" data-nav-action="todo" aria-disabled="true" tabindex="-1"'
      : `href="${item.href}" data-nav-action="${item.navAction || 'link'}"${item.active ? ' aria-current="page"' : ''} title="${item.label || ''}"`;
    const badge = item.badge ? `<span class="side-nav__badge">${item.badge}</span>` : '';
    return `
      <a class="${className.join(' ')}" ${attrs}>
        <span>${item.label}</span>
        ${badge}
      </a>
    `;
  }

  function buildMenu() {
    const batchId = state.batch?.id || getBatchIdFromUrl();
    const specie = state.batch?.specie || null;
    const isOwner = Boolean(state.batch?.isOwner);
    const sessionIsAdmin = isAdminSession();
    const isAdmin = sessionIsAdmin;
    const modulePermissions = state.batch?.module_permissions || {};
    const inBatch = Boolean(batchId);

    const mainItems = [];
    if (canViewProgramMenu('batch_list')) {
      mainItems.push({ label: 'รายการชุดสัตว์', href: 'index.html', active: state.page === 'index' });
    }
    if (canViewProgramMenu('feed_order_bills')) {
      mainItems.push({ label: 'บิลอาหารกลาง', href: 'feed-order-bills.html', active: state.page === 'feed_order_bills' });
    }
    if (canWriteProgramMenu('batch_create')) {
      mainItems.push({ label: 'เพิ่มชุดสัตว์', href: state.page === 'index' ? '#' : 'index.html?action=add_batch', navAction: 'open-add-batch' });
    }

    const sections = [{ title: 'หน้าหลัก', items: mainItems }];

    if (inBatch) {
      const batchItems = [];
      if (canAccess('batch_manage', modulePermissions, isOwner, isAdmin, specie)) {
        batchItems.push({
          label: 'จัดการชุดสัตว์',
          href: `module-batch-manage.html?bid=${encodeURIComponent(batchId)}`,
          active: state.page === 'batch_manage'
        });
      }
      if (canAccess('feed_manage', modulePermissions, isOwner, isAdmin, specie)) {
        batchItems.push({
          label: 'จัดการอาหาร',
          href: `module-feed.html?bid=${encodeURIComponent(batchId)}`,
          active: state.page === 'module_feed'
        });
      }
      if (specie === 'duck' && canAccess('egg_daily', modulePermissions, isOwner, isAdmin)) {
        batchItems.push({
          label: 'บันทึกจำนวนไข่รายวัน',
          href: `module-egg-daily.html?bid=${encodeURIComponent(batchId)}`,
          active: state.page === 'module_egg_daily'
        });
      }
      if (canAccess('sale_manage', modulePermissions, isOwner, isAdmin, specie)) {
        batchItems.push({
          label: specie === 'fish' ? 'ขายปลา / บิล' : 'ขายออก / บิล',
          href: `module-sale.html?bid=${encodeURIComponent(batchId)}`,
          active: state.page === 'module_sale'
        });
      }
      if (canAccess('farm_events', modulePermissions, isOwner, isAdmin, specie)) {
        batchItems.push({
          label: 'กิจกรรม',
          href: `batch-events.html?bid=${encodeURIComponent(batchId)}`,
          active: state.page === 'farm_events'
        });
        batchItems.push({
          label: 'คลังยา / วิตามิน',
          href: `module-medicine.html?bid=${encodeURIComponent(batchId)}`,
          active: state.page === 'medicine' || state.page === 'medicine_manage'
        });
      }
      if (canAccess('report', modulePermissions, isOwner, isAdmin, specie)) {
        batchItems.push({
          label: 'รายงาน',
          href: `report.html?bid=${encodeURIComponent(batchId)}`,
          active: state.page === 'report'
        });
      }
      if (canAccess('liff_routes', modulePermissions, isOwner, isAdmin, specie)) {
        batchItems.push({
          label: 'จัดการลิงก์ LIFF',
          href: `liff-routes.html?bid=${encodeURIComponent(batchId)}`,
          active: state.page === 'liff_routes'
        });
      }
      if ((isOwner || isAdmin) && (modulePermissions.batch_access === 'write' || isOwner || isAdmin)) {
        batchItems.push({
          label: 'สิทธิ์การเข้าถึง batch',
          href: `batch-access.html?bid=${encodeURIComponent(batchId)}`,
          active: state.page === 'batch_access',
          badge: isOwner ? 'owner' : (isAdmin ? 'admin' : '')
        });
      }
      sections.push({ title: 'batch นี้', items: batchItems });
    }

    if (isAdmin) {
      sections.push({
        title: 'ระบบ',
        items: [{
          label: 'สิทธิ์เมนูหลัก',
          href: 'program-permissions.html',
          active: state.page === 'program_permissions'
        }, {
          label: 'สิทธิ์ Batch',
          href: 'admin-permissions.html',
          active: state.page === 'admin_permissions'
        }, {
          label: 'จัดการราคาไข่',
          href: 'items-price-manage.html',
          active: state.page === 'items_price_manage'
        }, {
          label: 'System Health',
          href: 'system-health.html',
          active: state.page === 'system_health',
          badge: 'admin'
        }, {
          label: 'Diagnostics',
          href: 'diagnostics.html',
          active: state.page === 'diagnostics',
          badge: 'admin'
        }]
      });
    }

    return sections;
  }

  function isAdminSession() {
    if (window.AppAuth?.isAdminSession) return AppAuth.isAdminSession();
    const role = String(window.AppAuth?.getSession?.('role') || '').trim().toLowerCase();
    const flag = window.AppAuth?.getSession?.('is_admin');
    const flagText = String(flag == null ? '' : flag).trim().toLowerCase();
    return role === 'admin' || flag === true || flag === 1 || flagText === '1' || flagText === 'true' || flagText === 'yes';
  }

  function canViewProgramMenu(menuKey) {
    if (isAdminSession()) return true;
    if (!window.MenuPermissionApi?.canView) return false;
    return MenuPermissionApi.canView(menuKey);
  }

  function canWriteProgramMenu(menuKey) {
    if (isAdminSession()) return true;
    if (!window.MenuPermissionApi?.canWrite) return false;
    return MenuPermissionApi.canWrite(menuKey);
  }

  function canAccess(moduleKey, modulePermissions, isOwner, isAdmin, specie) {
    if (moduleKey === 'batch_access') return isAdmin || isOwner || modulePermissions.batch_access === 'view' || modulePermissions.batch_access === 'write';
    if (moduleKey === 'liff_routes') return isAdmin || isOwner || modulePermissions.liff_routes === 'view' || modulePermissions.liff_routes === 'write';
    if (moduleKey === 'farm_events') return isAdmin || isOwner || modulePermissions.farm_events === 'view' || modulePermissions.farm_events === 'write';
    if (isAdmin || isOwner) return true;
    if (moduleKey === 'sale_manage') {
      const fishKey = specie === 'fish' ? 'fish_sale' : 'egg_sale';
      return modulePermissions[fishKey] === 'view' || modulePermissions[fishKey] === 'write';
    }
    if (moduleKey === 'feed_manage' && specie === 'fish') {
      const fishKey = 'fish_feed_manage';
      return modulePermissions[fishKey] === 'view' || modulePermissions[fishKey] === 'write';
    }
    return modulePermissions[moduleKey] === 'view' || modulePermissions[moduleKey] === 'write';
  }

  function getBatchIdFromUrl() {
    try {
      const params = new URLSearchParams(location.search);
      return params.get('bid') || '';
    } catch (_) {
      return '';
    }
  }

  return { init, setBatchContext, close, open };
})();


/* ===== js/modules/batch-events-page.js ===== */
window.BatchEventsPage = (() => {
  const state = {
    batchId: '',
    batch: null,
    permission: 'none',
    batchPermission: 'read',
    isOwner: false,
    isAdmin: false,
    events: [],
    consumption: [],
    feedLots: [],
    medicalItems: [],
    summary: {},
    modulePermissions: {},
    currentAction: '',
    editingEvent: null
  };
  let bootstrapped = false;
  let pageUpdateUnsubscribe = null;

  const ACTIONS = [
    { key: 'medical_in', eventType: 'medical_in', label: 'ซื้อยา/วิตามิน', icon: '📦', title: 'ซื้อยา/วิตามินเข้าคลัง' },
    { key: 'injection', eventType: 'injection', label: 'ฉีดยา', icon: '💉', title: 'บันทึกการฉีดยา' },
    { key: 'rain', eventType: 'rain', label: 'ฝนตก', icon: '🌧', title: 'บันทึกฝนตก' },
    { key: 'duck_cull', eventType: 'duck_cull', label: 'แตะตูด', icon: '🦆', title: 'แตะตูด / คัดเป็ดไม่ไข่' },
    { key: 'vitamin', eventType: 'vitamin', label: 'วิตามิน', icon: '✨', title: 'บันทึกการให้วิตามิน' },
    { key: 'medicine', eventType: 'medicine', label: 'ให้ยา', icon: '💊', title: 'บันทึกการให้ยา' },
    { key: 'feed_swap', eventType: 'feed_swap', label: 'เคลมอาหาร', icon: '🔁', title: 'บันทึกการเคลมอาหาร' },
    { key: 'other', eventType: 'other', label: 'อื่น ๆ', icon: '•', title: 'บันทึกกิจกรรมอื่น ๆ' }
  ];

  async function bootstrap() {
    if (bootstrapped) return;
    bootstrapped = true;
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    state.batchId = new URLSearchParams(location.search).get('bid') || '';
    bind();
    if (!state.batchId) {
      setText('eventSubtitle', 'ไม่พบ batch id');
      return;
    }
    bindBackgroundUpdates();
    renderSkeleton();
    await load();
  }

  function bindBackgroundUpdates() {
    if (pageUpdateUnsubscribe || !window.AppSectionLoader?.subscribe) return;
    pageUpdateUnsubscribe = AppSectionLoader.subscribe('getBatchEventsPageData', (response, detail) => {
      if (!response || response.status !== 'ok') return;
      if (String(detail?.payload?.batch_id || '') !== String(state.batchId || '')) return;
      writeCache(`ducky:farm-events:${state.batchId}`, response);
      hydrateAndRender(response);
      AppSectionLoader.applyCachedBadge('eventSummaryCards', response);
      AppSectionLoader.applyCachedBadge('eventTimeline', response);
    });
  }

  function bind() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);
    document.getElementById('eventSheetCloseBtn')?.addEventListener('click', closeEventSheet);
    document.getElementById('eventSheetBackdrop')?.addEventListener('click', closeEventSheet);
    document.getElementById('eventSheetCancelBtn')?.addEventListener('click', closeEventSheet);
    document.getElementById('batchEventForm')?.addEventListener('submit', saveEvent);
    document.getElementById('eventTimeline')?.addEventListener('click', onTimelineClick);
    document.getElementById('eventStartDate')?.addEventListener('change', syncEndDateIfEmpty);
    document.getElementById('eventDynamicFields')?.addEventListener('click', onEventDynamicFieldsClick);
    document.getElementById('eventDynamicFields')?.addEventListener('change', onEventDynamicFieldsChange);
    document.addEventListener('click', onOutsideFabClick, { capture: true });
  }

  async function load() {
    setText('eventSubtitle', 'กำลังโหลดข้อมูล...');
    const cacheKey = `ducky:farm-events:${state.batchId}`;
    const cached = readCache(cacheKey);
    if (cached) {
      hydrateAndRender(cached);
      AppSectionLoader?.applyCachedBadge?.('eventSummaryCards', { __from_cache: true, __cache_age_ms: 1000, __cache_stale: true });
      AppSectionLoader?.applyCachedBadge?.('eventTimeline', { __from_cache: true, __cache_age_ms: 1000, __cache_stale: true });
    } else {
      AppSectionLoader?.mark?.('eventSummaryCards', 'loading', 'กำลังโหลดสรุป...');
      AppSectionLoader?.mark?.('eventTimeline', 'loading', 'กำลังโหลดกิจกรรม...');
    }

    const res = await AppApi.post({ action: 'getBatchEventsPageData', batch_id: state.batchId });
    if (!res || res.status !== 'ok') {
      if (!cached) {
        setText('eventSubtitle', res?.message || 'โหลดข้อมูลไม่สำเร็จ');
        document.getElementById('eventTimeline').innerHTML = `<div class="empty-state">${escapeHtml(res?.message || 'โหลดข้อมูลไม่สำเร็จ')}</div>`;
      }
      AppSectionLoader?.mark?.('eventSummaryCards', 'stale', 'อัปเดตไม่สำเร็จ');
      AppSectionLoader?.mark?.('eventTimeline', 'stale', 'อัปเดตไม่สำเร็จ');
      return;
    }
    writeCache(cacheKey, res);
    hydrateAndRender(res);
    AppSectionLoader?.applyCachedBadge?.('eventSummaryCards', res);
    AppSectionLoader?.applyCachedBadge?.('eventTimeline', res);
  }

  function hydrateAndRender(res) {
    state.batch = res.batch || null;
    state.permission = res.permission || 'none';
    state.batchPermission = res.batch_permission || res.permission || 'read';
    state.isOwner = !!res.is_owner;
    state.isAdmin = !!res.is_admin;
    state.events = Array.isArray(res.events) ? res.events : [];
    state.consumption = Array.isArray(res.consumption_logs) ? res.consumption_logs : [];
    state.feedLots = Array.isArray(res.feed_lots) ? res.feed_lots : [];
    state.medicalItems = Array.isArray(res.medical_items) ? res.medical_items : [];
    state.summary = res.summary || {};
    state.modulePermissions = res.module_permissions || { farm_events: state.permission };
    render();
  }

  function render() {
    setText('eventTitle', 'กิจกรรม');
    setText('eventSubtitle', `${state.batch?.name || state.batchId} • ${state.batch?.specie === 'fish' ? 'ปลา' : 'เป็ด'}`);

    const badge = document.getElementById('eventPermissionBadge');
    if (badge) {
      badge.className = `badge-inline ${state.permission === 'write' ? 'success' : 'muted-badge'}`;
      badge.textContent = state.permission === 'write' ? 'ดูและแก้ไข' : 'ดู';
    }

    if (window.NavDrawer) {
      NavDrawer.setBatchContext({
        id: state.batchId,
        specie: state.batch?.specie,
        permission: state.batchPermission,
        isOwner: state.isOwner,
        isAdmin: state.isAdmin,
        module_permissions: state.modulePermissions
      });
    }

    renderSummary();
    renderTimeline();
    renderFab();
  }

  function renderSkeleton() {
    document.getElementById('eventSummaryCards').innerHTML = [1, 2, 3, 4].map(() => '<div class="event-summary-card skeleton-card-lite"></div>').join('');
    document.getElementById('eventTimeline').innerHTML = '<div class="empty-state">กำลังโหลด...</div>';
  }

  function renderSummary() {
    const target = document.getElementById('eventSummaryCards');
    if (!target) return;
    const eventCount = Number(state.summary.event_count || state.events.length || 0);
    const eventCost = Number(state.summary.event_expense || 0);
    const cullCount = state.events.filter((e) => normalizeEventType(e.event_type) === 'duck_cull').reduce((s, e) => s + Number(e.cull_qty || e.extra?.cull_qty || 0), 0);
    const injectionCount = state.events.filter((e) => normalizeEventType(e.event_type) === 'injection').length;
    const stockCount = state.medicalItems.filter((item) => Number(item.current_qty || 0) > 0).length;
    const cards = [
      ['กิจกรรม', `${fmt(eventCount)} รายการ`, 'เหตุการณ์ทั้งหมดของ batch นี้'],
      ['ค่าใช้จ่าย', `${fmt(eventCost)} ฿`, 'รวมค่าแรง/ค่าใช้จ่ายที่ระบุ'],
      ['ฉีดยา', `${fmt(injectionCount)} ครั้ง`, 'ใช้เทียบผลกับไข่และการกิน'],
      ['คลังยา', `${fmt(stockCount)} รายการ`, `คัดออก ${fmt(cullCount)} ตัว`]
    ];
    target.innerHTML = cards.map(([label, value, note]) => `
      <div class="event-summary-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
        <small>${escapeHtml(note)}</small>
      </div>
    `).join('');
  }

  function renderTimeline() {
    const target = document.getElementById('eventTimeline');
    if (!target) return;
    setText('eventCountBadge', `${state.events.length} รายการ`);
    if (!state.events.length) {
      target.innerHTML = '<div class="empty-state">ยังไม่มีการบันทึกกิจกรรม ใช้ปุ่ม + เพื่อเพิ่มกิจกรรม</div>';
      return;
    }

    const sorted = state.events.slice().sort((a, b) => String(b.log_date).localeCompare(String(a.log_date)));
    target.innerHTML = sorted.map((ev, index) => {
      const type = normalizeEventType(ev.event_type);
      const title = ev.event_title || typeLabel(type, ev.event_subtype);
      const cost = Number(ev.expense_total || 0);
      const extra = eventExtra(ev);
      const range = extra.range_days > 1 ? `วันที่ ${extra.range_index}/${extra.range_days}` : '';
      const metaItems = [typeLabel(type, ev.event_subtype), range, severityLabel(ev.severity), cost ? `${fmt(cost)} ฿` : '', extra.ref_bill_id || ev.ref_bill_id ? 'สร้างบิลแล้ว' : ''].filter(Boolean);
      const detail = ev.detail || extra.detail || '';
      return `
        <article class="event-timeline-item event-timeline-item--${escapeAttr(type)}" data-event-id="${escapeAttr(ev.id)}">
          <div class="event-timeline-rail" aria-hidden="true">
            <span class="event-timeline-line"></span>
            ${eventIconHtml(type, ev.event_subtype, ev.severity, "event-timeline-bubble event-row-icon--" + type)}
          </div>
          <div class="event-timeline-content">
            <div class="event-date-pill"><span>📅</span>${escapeHtml(formatDateLong(ev.log_date))}</div>
            <div class="event-card event-card--${escapeAttr(type)}">
              <div class="event-card-head">
                <strong>${escapeHtml(title)}</strong>
                <span class="event-card-actions">
                  ${state.permission === 'write' ? `<button type="button" class="event-edit-link" data-event-edit="${escapeAttr(ev.id)}">แก้ไข</button>` : ''}
                  ${cost ? `<span class="event-cost-pill">${escapeHtml(fmt(cost))} ฿</span>` : '<span class="event-type-pill">Event</span>'}
                </span>
              </div>
              <div class="event-card-meta">${escapeHtml(metaItems.join(' • '))}</div>
              ${detail ? `<p class="event-card-detail">${escapeHtml(detail)}</p>` : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderFab() {
    const root = document.getElementById('eventFabRoot');
    if (!root) return;
    if (state.permission !== 'write') {
      root.innerHTML = '';
      return;
    }
    root.innerHTML = `
      <div class="module-fab event-fab" id="eventFab">
        <div class="module-fab-actions">
          ${ACTIONS.map((a) => `<button type="button" class="module-fab-action" data-event-action="${a.key}"><span>${a.icon}</span>${escapeHtml(a.label)}</button>`).join('')}
        </div>
        <button class="fab module-fab-main" id="eventFabMain" type="button" aria-label="กิจกรรม">＋</button>
      </div>`;
    document.getElementById('eventFabMain')?.addEventListener('click', (event) => {
      event.stopPropagation();
      document.getElementById('eventFab')?.classList.toggle('open');
    });
    root.querySelectorAll('[data-event-action]').forEach((btn) => btn.addEventListener('click', () => {
      document.getElementById('eventFab')?.classList.remove('open');
      openEventSheet(btn.dataset.eventAction);
    }));
  }

  function onOutsideFabClick(event) {
    const fab = document.getElementById('eventFab');
    if (!fab || !fab.classList.contains('open')) return;
    if (!fab.contains(event.target)) fab.classList.remove('open');
  }

  function openEventSheet(actionKey, editEvent) {
    const action = ACTIONS.find((a) => a.key === actionKey) || ACTIONS[ACTIONS.length - 1];
    state.currentAction = action.key;
    state.editingEvent = editEvent || null;
    document.getElementById('batchEventForm')?.reset();
    valSet('eventActionType', action.key);
    valSet('eventEventType', action.eventType);
    valSet('eventStartDate', todayString());
    valSet('eventEndDate', todayString());
    const dateGrid = document.querySelector('.event-date-range-grid');
    const distribute = document.getElementById('eventDistributeWrap');
    if (dateGrid) dateGrid.classList.toggle('hidden', action.key === 'medical_in');
    if (distribute) distribute.classList.toggle('hidden', action.key === 'medical_in' || action.key === 'duck_cull');
    setText('eventSheetTitle', editEvent ? 'แก้ไขกิจกรรม' : action.title);
    setText('eventSubmitBtn', editEvent ? 'บันทึกการแก้ไข' : (action.key === 'duck_cull' ? 'บันทึกและสร้างบิล' : (action.key === 'medical_in' ? 'บันทึกเข้าคลัง' : 'บันทึกกิจกรรม')));
    const target = document.getElementById('eventDynamicFields');
    if (target) target.innerHTML = `${editEvent ? renderEditTools(editEvent) : ''}${renderDynamicFields(action.key)}`;
    if (editEvent) populateEventForm(editEvent, action.key);
    showSheet(document.getElementById('eventSheet'));
  }

  function renderEditTools(editEvent) {
    const extra = eventExtra(editEvent);
    const rangeDays = Number(extra.range_days || 0);
    const hasSeries = rangeDays > 1 && extra.range_start && extra.range_end;
    return `
      <div class="event-edit-tools" data-edit-event-tools>
        <div class="event-edit-tools__head">
          <strong>กำลังแก้ไขกิจกรรม</strong>
          <span>${escapeHtml(formatDateShort(editEvent.log_date))}</span>
        </div>
        ${hasSeries ? `
          <label class="event-series-toggle">
            <input id="eventApplySeries" type="checkbox"
              data-series-start="${escapeAttr(extra.range_start)}"
              data-series-end="${escapeAttr(extra.range_end)}"
              data-single-date="${escapeAttr(normalizeDateValue(editEvent.log_date))}" />
            <span>แก้ไขทั้ง series นี้ (${escapeHtml(String(rangeDays))} วัน)</span>
          </label>
          <div class="inline-note event-series-note">ถ้าไม่เลือก ระบบจะแก้เฉพาะวันที่ ${escapeHtml(formatDateShort(editEvent.log_date))}</div>
        ` : `<div class="inline-note event-series-note">รายการนี้ไม่ใช่ series จะแก้เฉพาะรายการนี้</div>`}
        <button type="button" class="event-delete-btn" id="eventDeleteBtn">ยกเลิกกิจกรรมนี้</button>
      </div>
    `;
  }

  function renderMedicalSelect(typeFilter) {
    const types = Array.isArray(typeFilter) ? typeFilter : [typeFilter].filter(Boolean);
    const items = state.medicalItems.filter((item) => !types.length || types.includes(normalizeMedicalType(item.item_type)));
    if (!items.length) return '<div class="inline-note">ยังไม่มีของในคลัง สามารถกรอกค่าใช้จ่ายเอง หรือใช้ action ซื้อยา/วิตามินเข้าคลังก่อน</div>';
    return `
      <label class="field-label">ใช้จากคลังยา/วิตามิน (ถ้ามี)</label>
      <select id="medicalItemId">
        <option value="">ไม่ใช้คลัง / กรอกต้นทุนเอง</option>
        ${items.map((item) => `<option value="${escapeAttr(item.id)}">${escapeHtml(item.name)} • เหลือ ${fmt(item.current_qty)} ${escapeHtml(item.unit || '')} • ${fmt(item.unit_price)}฿/${escapeHtml(item.unit || 'หน่วย')}</option>`).join('')}
      </select>
      <label class="field-label">จำนวนที่ใช้จากคลัง</label>
      <input id="medicalItemQty" type="number" min="0" step="0.01" placeholder="เช่น 0.25" />
    `;
  }

  function renderFeedClaimSelect() {
    const lots = state.feedLots.filter((lot) => Number(lot.current_qty || 0) > 0);
    if (!lots.length) return '<div class="inline-note">ยังไม่มี lot อาหารที่มีคงเหลือสำหรับเคลม</div>';
    return `
      <label class="field-label">เลือก lot อาหารที่ต้องตัดออก</label>
      <select id="claimFeedId" required>
        <option value="">เลือก lot อาหาร</option>
        ${lots.map((lot) => `<option value="${escapeAttr(lot.id)}" data-current="${escapeAttr(lot.current_qty)}">${escapeHtml(lot.label || lot.name)} • คงเหลือ ${fmt(lot.current_qty)} ลูก</option>`).join('')}
      </select>
      <div class="sheet-field-grid sheet-field-grid--2 event-cost-grid">
        <div><label class="field-label">จำนวนที่เคลม/ตัดออก</label><input id="claimFeedQty" type="number" min="0.01" step="0.01" required placeholder="เช่น 10" /></div>
        <div><label class="field-label">ชื่อ lot เดิม</label><input id="oldFeedName" type="text" placeholder="auto จาก lot ที่เลือก หรือกรอกเอง" /></div>
      </div>
      <div id="claimFeedInfo" class="inline-note">เลือก lot เพื่อดูยอดคงเหลือ</div>
    `;
  }

  function renderDynamicFields(actionKey) {
    if (actionKey === 'medical_in') return `
      <label class="field-label">ประเภท</label>
      <select id="medicalItemType"><option value="medicine">ยา</option><option value="vitamin">วิตามิน</option><option value="vaccine">วัคซีน</option><option value="other">อื่น ๆ</option></select>
      <label class="field-label">ชื่อยา/วิตามิน</label>
      <input id="medicalItemName" type="text" placeholder="เช่น ยาเพร็ก / วิตามินรวม" required />
      <div class="sheet-field-grid sheet-field-grid--2 event-cost-grid">
        <div><label class="field-label">จำนวนซื้อเข้า</label><input id="medicalInQty" type="number" min="0" step="0.01" required /></div>
        <div><label class="field-label">หน่วย</label><input id="medicalUnit" type="text" placeholder="ขวด / ซอง / ถุง" value="ขวด" /></div>
      </div>
      <label class="field-label">ราคาต่อหน่วย</label>
      <input id="medicalUnitPrice" type="number" min="0" step="0.01" placeholder="0" />
      <label class="field-label">หมายเหตุ</label>
      <textarea id="eventDetail" rows="3" placeholder="เช่น ซื้อเข้าคลังไว้ใช้หลายครั้ง"></textarea>
    `;
    if (actionKey === 'injection') return `
      <label class="field-label">ประเภท/ชื่อยา</label>
      <select id="injectionSubtype"><option value="preg">เพร็ก</option><option value="bird_flu">หวัดนก</option><option value="other">ยาอื่น ๆ</option></select>
      <input id="medicineName" type="text" placeholder="ชื่อยา / รุ่นยา (ถ้ามี)" />
      ${renderMedicalSelect(['medicine', 'vaccine', 'other'])}
      <div class="sheet-field-grid sheet-field-grid--2 event-cost-grid">
        <div><label class="field-label">ค่ายาเอง (ถ้าไม่ใช้คลัง)</label><input id="medicineCost" type="number" min="0" step="0.01" placeholder="0" /></div>
        <div><label class="field-label">ค่าจ้างคน</label><input id="laborCost" type="number" min="0" step="0.01" placeholder="0" /></div>
      </div>
      <label class="field-label">จำนวนเป็ดที่ฉีด</label>
      <input id="birdCount" type="number" min="0" step="1" placeholder="optional" />
      <label class="field-label">รายละเอียด</label>
      <textarea id="eventDetail" rows="3" placeholder="รายละเอียดเพิ่มเติม"></textarea>
    `;
    if (actionKey === 'rain') return `
      <label class="field-label">ระดับฝน</label>
      <select id="rainLevel"><option value="light">เบา</option><option value="heavy">แรง</option></select>
      <label class="field-label">รายละเอียด / ผลกระทบ</label>
      <textarea id="eventDetail" rows="4" placeholder="เช่น ฝนตกแรง พื้นเปียก เป็ดกินลดลง"></textarea>
    `;
    if (actionKey === 'duck_cull') return `
      <div class="inline-note">แตะตูด/คัดเป็ดบันทึกได้ครั้งละ 1 วัน ระบบจะสร้าง event + ลดจำนวนเป็ด + สร้างบิลขายเป็ดให้</div>
      <div class="sheet-field-grid sheet-field-grid--2 event-cost-grid">
        <div><label class="field-label">จำนวนเป็ดที่คัดออก</label><input id="cullQty" type="number" min="1" step="1" required /></div>
        <div><label class="field-label">ราคาขาย/ตัว</label><input id="cullUnitPrice" type="number" min="0" step="0.01" required /></div>
      </div>
      <label class="field-label">ผู้ซื้อ</label><input id="cullBuyer" type="text" placeholder="ชื่อผู้ซื้อ (optional)" />
      <label class="field-label">ค่าจ้างคนคัดเป็ด</label><input id="laborCost" type="number" min="0" step="0.01" placeholder="0" />
      <label class="field-label">รายละเอียด</label><textarea id="eventDetail" rows="3" placeholder="เช่น คัดเป็ดไม่ไข่ออก"></textarea>
    `;
    if (actionKey === 'vitamin') return `
      <label class="field-label">ชื่อวิตามิน</label><input id="itemName" type="text" placeholder="เช่น วิตามินรวม" required />
      ${renderMedicalSelect(['vitamin', 'other'])}
      <label class="field-label">ค่าใช้จ่ายเอง (ถ้าไม่ใช้คลัง)</label><input id="vitaminCost" type="number" min="0" step="0.01" placeholder="0" />
      <label class="field-label">รายละเอียด</label><textarea id="eventDetail" rows="3" placeholder="เช่น ผสมน้ำ 2 วัน"></textarea>
    `;
    if (actionKey === 'medicine') return `
      <label class="field-label">ชื่อยา</label><input id="itemName" type="text" placeholder="ชื่อยา" required />
      ${renderMedicalSelect(['medicine', 'vaccine', 'other'])}
      <label class="field-label">วิธีให้</label><select id="medicineMethod"><option value="water">ผสมน้ำ</option><option value="feed">ผสมอาหาร</option><option value="other">อื่น ๆ</option></select>
      <label class="field-label">ค่าใช้จ่ายเอง (ถ้าไม่ใช้คลัง)</label><input id="medicineCost" type="number" min="0" step="0.01" placeholder="0" />
      <label class="field-label">รายละเอียด</label><textarea id="eventDetail" rows="3" placeholder="เช่น ให้ต่อเนื่อง 3 วัน"></textarea>
    `;
    if (actionKey === 'feed_swap') return `
      <div class="inline-note">เคลมอาหารจะตัดยอดออกจาก lot อาหารและสร้าง feed batch log แต่ไม่สร้าง feed consumption log จึงไม่คิดเป็นต้นทุนอาหาร</div>
      ${renderFeedClaimSelect()}
      <label class="field-label">อาหารที่ได้เปลี่ยนกลับ / อาหารใหม่</label><input id="newFeedName" type="text" placeholder="ชื่ออาหารที่ได้เปลี่ยนกลับ / อาหารใหม่" />
      <label class="field-label">สาเหตุ</label><textarea id="eventDetail" rows="3" placeholder="เช่น อาหาร lot เดิมมีปัญหา ต้องส่งคืน/เคลมกับโรงงาน"></textarea>
    `;
    return `
      <label class="field-label">หัวข้อ</label><input id="otherTitle" type="text" placeholder="หัวข้อกิจกรรม" required />
      <label class="field-label">ค่าใช้จ่าย (ถ้ามี)</label><input id="otherCost" type="number" min="0" step="0.01" placeholder="0" />
      <label class="field-label">รายละเอียด</label><textarea id="eventDetail" rows="4" placeholder="รายละเอียดเพิ่มเติม"></textarea>
    `;
  }

  async function saveEvent(ev) {
    ev.preventDefault();
    if (state.permission !== 'write') return alert('ไม่มีสิทธิ์บันทึก');
    const btn = document.getElementById('eventSubmitBtn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    const payload = buildPayload();
    const validationMessage = validateEventPayload(payload);
    if (validationMessage) {
      btn.disabled = false;
      btn.textContent = original;
      return alert(validationMessage);
    }
    const res = await AppApi.post(payload);
    btn.disabled = false;
    btn.textContent = original;
    if (!res || res.status !== 'ok') return alert(res?.message || 'บันทึกไม่สำเร็จ');
    closeEventSheet();
    removeCache(`ducky:farm-events:${state.batchId}`);
    await load();
    if (payload.event_type === 'duck_cull' && res.ref_bill_id) alert(`บันทึกแตะตูดและสร้างบิลแล้ว\nเลขบิล: ${res.ref_bill_id}`);
    else if (payload.action === 'saveBatchEvent' && Number(res.days || 1) > 1) alert(`บันทึกกิจกรรม ${res.days} วันแล้ว`);
  }

  function buildPayload() {
    const action = state.currentAction || val('eventActionType') || 'other';
    if (action === 'medical_in') {
      return {
        action: 'saveMedicalInventoryLog',
        batch_id: state.batchId,
        log_date: val('eventStartDate') || todayString(),
        trans_type: 'in',
        item_type: val('medicalItemType') || 'medicine',
        item_name: val('medicalItemName'),
        unit: val('medicalUnit') || 'หน่วย',
        qty: num('medicalInQty'),
        unit_price: num('medicalUnitPrice'),
        remark: val('eventDetail')
      };
    }

    const start = val('eventStartDate') || todayString();
    const end = val('eventEndDate') || start;
    const base = {
      action: 'saveBatchEvent',
      batch_id: state.batchId,
      log_date: start,
      start_date: start,
      end_date: action === 'duck_cull' ? start : end,
      distribute_cost: document.getElementById('eventDistributeCost')?.checked !== false,
      event_type: val('eventEventType') || action,
      event_subtype: '',
      event_title: '',
      severity: 'normal',
      detail: val('eventDetail'),
      expenses: [],
      extra: {}
    };
    if (state.editingEvent?.id) {
      base.id = state.editingEvent.id;
      base.event_id = state.editingEvent.id;
      base.update_scope = document.getElementById('eventApplySeries')?.checked ? 'series' : 'single';
      if (base.update_scope !== 'series') {
        base.start_date = normalizeDateValue(state.editingEvent.log_date || start);
        base.log_date = base.start_date;
        base.end_date = base.start_date;
      }
    }
    const pushExpense = (type, name, amount) => {
      const total = Number(amount || 0);
      if (total > 0) base.expenses.push({ expense_type: type, item_name: name, qty: 1, unit_price: total, total_price: total });
    };
    const medicalId = val('medicalItemId');
    const medicalQty = num('medicalItemQty');
    if (medicalId && medicalQty > 0) {
      base.medical_item_id = medicalId;
      base.medical_item_qty = medicalQty;
    }

    if (action === 'injection') {
      const subtype = val('injectionSubtype') || 'other';
      const medName = val('medicineName') || selectedMedicalName() || injectionSubtypeLabel(subtype);
      base.event_subtype = subtype;
      base.event_title = `ฉีดยา${medName ? ' • ' + medName : ''}`;
      base.extra = { medicine_name: medName, bird_count: num('birdCount') };
      if (!medicalId) pushExpense('medicine', medName || 'ค่ายา', num('medicineCost'));
      pushExpense('labor', 'ค่าจ้างคนฉีด', num('laborCost'));
    } else if (action === 'rain') {
      const level = val('rainLevel') || 'light';
      base.event_subtype = level;
      base.severity = level === 'heavy' ? 'high' : 'medium';
      base.event_title = level === 'heavy' ? 'ฝนตกแรง' : 'ฝนตกเบา';
      base.extra = { rain_level: level };
    } else if (action === 'duck_cull') {
      const qty = num('cullQty');
      const unitPrice = num('cullUnitPrice');
      base.event_title = 'แตะตูด / คัดเป็ดไม่ไข่';
      base.detail = val('eventDetail') || `คัดเป็ดออก ${qty} ตัว`;
      base.cull_qty = qty;
      base.cull_unit_price = unitPrice;
      base.buyer = val('cullBuyer');
      base.extra = { cull_qty: qty, cull_unit_price: unitPrice, buyer: val('cullBuyer') };
      pushExpense('labor', 'ค่าจ้างคนคัดเป็ด', num('laborCost'));
    } else if (action === 'vitamin') {
      const name = val('itemName') || selectedMedicalName();
      base.event_title = `ให้วิตามิน${name ? ' • ' + name : ''}`;
      base.extra = { item_name: name };
      if (!medicalId) pushExpense('vitamin', name || 'ค่าวิตามิน', num('vitaminCost'));
    } else if (action === 'medicine') {
      const name = val('itemName') || selectedMedicalName();
      const method = val('medicineMethod') || 'other';
      base.event_title = `ให้ยา${name ? ' • ' + name : ''}`;
      base.event_subtype = method;
      base.extra = { item_name: name, method };
      if (!medicalId) pushExpense('medicine', name || 'ค่ายา', num('medicineCost'));
    } else if (action === 'feed_swap') {
      const oldName = val('oldFeedName');
      const newName = val('newFeedName');
      const claimFeedId = val('claimFeedId');
      const claimFeedQty = num('claimFeedQty');
      const claimLot = state.feedLots.find((lot) => String(lot.id) === String(claimFeedId));
      base.event_title = 'เคลมอาหาร';
      base.detail = val('eventDetail') || `${oldName || claimLot?.name || '-'} → ${newName || '-'}`;
      base.feed_id = claimFeedId;
      base.claim_feed_id = claimFeedId;
      base.feed_qty = claimFeedQty;
      base.claim_qty = claimFeedQty;
      base.extra = { old_feed_name: oldName || claimLot?.name || '', new_feed_name: newName, feed_id: claimFeedId, feed_name: claimLot?.name || '', claim_qty: claimFeedQty, cost_excluded: true };
    } else {
      const title = val('otherTitle') || 'กิจกรรมอื่น ๆ';
      base.event_title = title;
      base.extra = { title };
      pushExpense('other', title, num('otherCost'));
    }
    return base;
  }


  function validateEventPayload(payload) {
    if (!payload || payload.action !== 'saveBatchEvent') return '';
    if (payload.event_type === 'feed_swap') {
      if (!payload.feed_id) return 'กรุณาเลือก lot อาหารที่ต้องการเคลม';
      if (!(Number(payload.feed_qty || 0) > 0)) return 'กรุณาระบุจำนวนอาหารที่ต้องการเคลม';
      const lot = state.feedLots.find((item) => String(item.id) === String(payload.feed_id));
      if (lot && Number(payload.feed_qty || 0) - Number(lot.current_qty || 0) > 0.000001) {
        return `จำนวนที่เคลมมากกว่ายอดคงเหลือของ lot นี้ (คงเหลือ ${fmt(lot.current_qty)} ลูก)`;
      }
    }
    return '';
  }


  function actionKeyFromEvent(ev) {
    const t = normalizeEventType(ev?.event_type || ev?.type);
    return ['injection', 'rain', 'duck_cull', 'vitamin', 'medicine', 'feed_swap', 'other'].includes(t) ? t : 'other';
  }

  function eventExtra(ev) {
    const extra = ev?.extra || ev?.extra_json || {};
    if (extra && typeof extra === 'object') return extra;
    try { return JSON.parse(String(extra || '{}')); } catch (_) { return {}; }
  }

  function populateEventForm(ev, actionKey) {
    const extra = eventExtra(ev);
    const date = normalizeDateValue(ev.log_date || ev.date || todayString());
    valSet('eventStartDate', date);
    valSet('eventEndDate', date);
    const distribute = document.getElementById('eventDistributeCost');
    if (distribute) distribute.checked = true;
    valSet('eventDetail', ev.detail || extra.detail || '');

    if (actionKey === 'injection') {
      valSet('injectionSubtype', ev.event_subtype || extra.subtype || 'other');
      valSet('medicineName', extra.medicine_name || extra.medical_item_name || '');
      valSet('medicalItemId', extra.medical_item_id || ev.ref_item_id || '');
      valSet('medicalItemQty', extra.medical_item_qty || '');
      valSet('medicineCost', Number(ev.medicine_cost || ev.vaccine_cost || 0) || '');
      valSet('laborCost', Number(ev.labor_cost || 0) || '');
      valSet('birdCount', extra.bird_count || '');
    } else if (actionKey === 'rain') {
      valSet('rainLevel', ev.event_subtype || extra.rain_level || (ev.severity === 'high' ? 'heavy' : 'light'));
    } else if (actionKey === 'duck_cull') {
      valSet('cullQty', extra.cull_qty || ev.cull_qty || '');
      valSet('cullUnitPrice', extra.cull_unit_price || ev.cull_unit_price || '');
      valSet('cullBuyer', extra.buyer || ev.buyer || '');
      valSet('laborCost', Number(ev.labor_cost || 0) || '');
    } else if (actionKey === 'vitamin') {
      valSet('itemName', extra.item_name || extra.medical_item_name || stripEventPrefix(ev.event_title, 'ให้วิตามิน'));
      valSet('medicalItemId', extra.medical_item_id || ev.ref_item_id || '');
      valSet('medicalItemQty', extra.medical_item_qty || '');
      valSet('vitaminCost', Number(ev.vitamin_cost || 0) || '');
    } else if (actionKey === 'medicine') {
      valSet('itemName', extra.item_name || extra.medical_item_name || stripEventPrefix(ev.event_title, 'ให้ยา'));
      valSet('medicalItemId', extra.medical_item_id || ev.ref_item_id || '');
      valSet('medicalItemQty', extra.medical_item_qty || '');
      valSet('medicineMethod', ev.event_subtype || extra.method || 'other');
      valSet('medicineCost', Number(ev.medicine_cost || 0) || '');
    } else if (actionKey === 'feed_swap') {
      const claim = extra.feed_claim || extra || {};
      valSet('claimFeedId', claim.feed_id || ev.ref_item_id || extra.feed_id || '');
      valSet('claimFeedQty', claim.qty || extra.claim_qty || '');
      valSet('oldFeedName', extra.old_feed_name || claim.feed_name || '');
      valSet('newFeedName', extra.new_feed_name || '');
      updateClaimFeedInfo();
    } else {
      valSet('otherTitle', ev.event_title || extra.title || 'กิจกรรมอื่น ๆ');
      valSet('otherCost', Number(ev.other_cost || ev.expense_total || 0) || '');
    }
  }

  function stripEventPrefix(title, prefix) {
    const text = String(title || '');
    return text.replace(prefix, '').replace(/^\s*•\s*/, '').trim();
  }

  function selectedMedicalName() {
    const id = val('medicalItemId');
    const item = state.medicalItems.find((it) => String(it.id) === String(id));
    return item?.name || '';
  }

  function syncEndDateIfEmpty() {
    const end = document.getElementById('eventEndDate');
    if (end && !end.value) end.value = val('eventStartDate') || todayString();
  }

  function closeEventSheet() { state.editingEvent = null; hideSheet(document.getElementById('eventSheet')); }
  
  function onTimelineClick(event) {
    const editButton = event.target.closest('[data-event-edit]');
    if (!editButton) return;
    event.preventDefault();
    event.stopPropagation();
    if (state.permission !== 'write') return alert('ไม่มีสิทธิ์แก้ไข');
    const eventId = editButton.dataset.eventEdit || '';
    const found = state.events.find((item) => String(item.id || '') === String(eventId));
    if (!found) return alert('ไม่พบข้อมูลกิจกรรมนี้');
    const actionKey = actionKeyFromEvent(found);
    if (actionKey === 'medical_in') return alert('รายการซื้อยา/วิตามินเข้าคลังให้แก้ผ่านหน้าคลังโดยตรง');
    openEventSheet(actionKey, found);
  }


  async function onEventDynamicFieldsClick(event) {
    const deleteBtn = event.target.closest('#eventDeleteBtn');
    if (!deleteBtn) return;
    event.preventDefault();
    await deleteEditingEvent();
  }

  function onEventDynamicFieldsChange(event) {
    if (event.target?.id === 'claimFeedId') { updateClaimFeedInfo(); return; }
    if (event.target?.id !== 'eventApplySeries') return;
    const checked = !!event.target.checked;
    const singleDate = event.target.dataset.singleDate || normalizeDateValue(state.editingEvent?.log_date || todayString());
    const start = checked ? (event.target.dataset.seriesStart || singleDate) : singleDate;
    const end = checked ? (event.target.dataset.seriesEnd || start) : singleDate;
    valSet('eventStartDate', start);
    valSet('eventEndDate', end);
  }

  function updateClaimFeedInfo() {
    const id = val('claimFeedId');
    const lot = state.feedLots.find((item) => String(item.id) === String(id));
    const info = document.getElementById('claimFeedInfo');
    if (!info) return;
    if (!lot) { info.textContent = 'เลือก lot เพื่อดูยอดคงเหลือ'; return; }
    info.textContent = `${lot.name || 'Lot อาหาร'} • คงเหลือ ${fmt(lot.current_qty)} ลูก • ${fmt(lot.unit_price)} บาท/ลูก`;
    const oldName = document.getElementById('oldFeedName');
    if (oldName && !oldName.value) oldName.value = lot.name || '';
  }

  async function deleteEditingEvent() {
    if (!state.editingEvent?.id) return;
    const applySeries = !!document.getElementById('eventApplySeries')?.checked;
    const message = applySeries
      ? 'ต้องการยกเลิกกิจกรรมทั้ง series นี้ใช่ไหม?'
      : 'ต้องการยกเลิกกิจกรรมวันนี้ใช่ไหม?';
    if (!confirm(message)) return;
    const btn = document.getElementById('eventDeleteBtn');
    const oldText = btn?.textContent || '';
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังยกเลิก...'; }
    const res = await AppApi.post({
      action: 'deleteBatchEvent',
      batch_id: state.batchId,
      event_id: state.editingEvent.id,
      update_scope: applySeries ? 'series' : 'single'
    });
    if (btn) { btn.disabled = false; btn.textContent = oldText || 'ยกเลิกกิจกรรมนี้'; }
    if (!res || res.status !== 'ok') return alert(res?.message || 'ยกเลิกกิจกรรมไม่สำเร็จ');
    closeEventSheet();
    removeCache(`ducky:farm-events:${state.batchId}`);
    await load();
  }

  function showSheet(sheet) { if (!sheet) return; sheet.classList.remove('hidden'); requestAnimationFrame(() => sheet.classList.add('show')); }
  function hideSheet(sheet) { if (!sheet) return; sheet.classList.remove('show'); setTimeout(() => sheet.classList.add('hidden'), 220); }

  function readCache(key) { try { const raw = localStorage.getItem(key); if (!raw) return null; const parsed = JSON.parse(raw); if (!parsed || !parsed.saved_at || Date.now() - parsed.saved_at > 90 * 1000) return null; return parsed.data; } catch (_) { return null; } }
  function writeCache(key, data) { try { localStorage.setItem(key, JSON.stringify({ saved_at: Date.now(), data })); } catch (_) {} }
  function removeCache(key) { try { localStorage.removeItem(key); } catch (_) {} }
  function normalizeEventType(type) { const t = String(type || 'other').toLowerCase(); if (t === 'vaccine') return 'injection'; if (t === 'weather') return 'rain'; if (t === 'farm_event') return 'other'; return ['injection', 'rain', 'duck_cull', 'vitamin', 'medicine', 'feed_swap', 'other'].includes(t) ? t : 'other'; }
  function normalizeMedicalType(type) { const t = String(type || 'medicine').toLowerCase(); return ['medicine', 'vitamin', 'vaccine', 'chemical', 'other'].includes(t) ? t : 'medicine'; }
  function eventIcon(type, subtype, severity) { const t = normalizeEventType(type); if (t === 'injection') return subtype === 'preg' ? '💉P' : '💉'; if (t === 'rain') return severity === 'high' || subtype === 'heavy' ? '⛈' : '🌦'; return ({ duck_cull:'🦆', vitamin:'✨', medicine:'💊', feed_swap:'🔁', other:'•' }[t] || '•'); }
  function eventIconFile(type, subtype, severity) { const t = normalizeEventType(type); return ({ injection:'injection.png', rain:'rain.png', duck_cull:'duck.png', vitamin:'vitamin.png', medicine:'medicine.png', feed_swap:'feed-swap.png', other:'activity.png' }[t] || 'activity.png'); }
  function eventIconHtml(type, subtype, severity, className) { const fallback = eventIcon(type, subtype, severity); const file = eventIconFile(type, subtype, severity); return `<span class="${escapeAttr(className || 'event-timeline-bubble')} event-timeline-bubble--asset" data-fallback="${escapeAttr(fallback)}"><img src="assets/report-icon/${escapeAttr(file)}" alt="" loading="lazy" onerror="this.parentElement.textContent=this.parentElement.dataset.fallback||'•';" /></span>`; }
  function typeLabel(type, subtype) { const t = normalizeEventType(type); if (t === 'injection') return 'ฉีดยา' + (subtype ? ' • ' + injectionSubtypeLabel(subtype) : ''); if (t === 'rain') return subtype === 'heavy' ? 'ฝนตกแรง' : (subtype === 'light' ? 'ฝนตกเบา' : 'ฝนตก'); return ({ duck_cull:'แตะตูด / คัดเป็ด', vitamin:'ให้วิตามิน', medicine:'ให้ยา', feed_swap:'เคลมอาหาร', other:'อื่น ๆ' }[t] || t || '-'); }
  function injectionSubtypeLabel(v) { return ({ preg:'เพร็ก', bird_flu:'หวัดนก', other:'ยาอื่น ๆ', water:'ผสมน้ำ', feed:'ผสมอาหาร' }[v] || v || 'ยาอื่น ๆ'); }
  function severityLabel(v) { return ({ normal:'ปกติ', medium:'กลาง', high:'สูง', light:'เบา', heavy:'แรง' }[v] || 'ปกติ'); }
  function todayString() { return new Date().toISOString().slice(0, 10); }
  function normalizeDateValue(v) { return String(v || '').slice(0, 10); }
  function formatDateLong(v) { const d = new Date(String(v || '').slice(0, 10)); if (Number.isNaN(d.getTime())) return v || '-'; return d.toLocaleDateString('en-GB', { day:'numeric', month:'short', year:'numeric' }); }
  function formatDateShort(v) { const d = new Date(String(v || '').slice(0, 10)); if (Number.isNaN(d.getTime())) return v || '-'; return d.toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit' }); }
  function val(id) { return document.getElementById(id)?.value || ''; }
  function valSet(id, value) { const el = document.getElementById(id); if (el) el.value = value || ''; }
  function num(id) { return Number(val(id) || 0); }
  function setText(id, v) { const el = document.getElementById(id); if (el) el.textContent = v || ''; }
  function fmt(v) { return Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
  function escapeHtml(text) { return String(text ?? '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[m])); }
  function escapeAttr(text) { return escapeHtml(text).replace(/`/g, '&#096;'); }

  return { bootstrap };
})();


/* ===== js/core/zoom-lock.js ===== */
(() => {
  // Ducky Management Pro - global zoom lock for mobile browsers.
  // Works together with CSS font-size:16px to prevent input focus zoom.
  const viewportContent = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

  function lockViewport() {
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'viewport';
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', viewportContent);
  }

  function preventIfCancelable(event) {
    // Chrome/Safari can fire non-cancelable touch events while scrolling.
    // Calling preventDefault() on those events causes console Intervention warnings.
    if (event && event.cancelable) event.preventDefault();
  }

  lockViewport();

  document.addEventListener('gesturestart', preventIfCancelable, { passive: false });
  document.addEventListener('gesturechange', preventIfCancelable, { passive: false });
  document.addEventListener('gestureend', preventIfCancelable, { passive: false });

  let lastTouchEnd = 0;
  document.addEventListener('touchend', (event) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 320) preventIfCancelable(event);
    lastTouchEnd = now;
  }, { passive: false });

  document.addEventListener('wheel', (event) => {
    if (event.ctrlKey) preventIfCancelable(event);
  }, { passive: false });
})();


/* ===== js/app.js ===== */
window.addEventListener('DOMContentLoaded', async () => {
  const theme = localStorage.getItem('theme');
  if (theme === 'theme-dark') document.body.classList.add('theme-dark');

  ensureFavicon();
  addPreconnectHints();

  const rawPage = document.body?.dataset?.page || '';
  const page = normalizePageKey(rawPage);

  await ensureDuckyUI(page);

  registerServiceWorker();

  if (window.AppApi?.warmup) AppApi.warmup();
  if (window.AppAuth?.startSessionWatcher) AppAuth.startSessionWatcher();

  if (window.MenuPermissionApi && page !== 'login') {
    await MenuPermissionApi.ensureLoaded().catch(() => null);
  }

  if (window.NavDrawer) NavDrawer.init({ page });

  if (page === 'index' && window.IndexPage) return await IndexPage.bootstrap();
  if ((page === 'batch' || page === 'batch_dashboard') && window.BatchDashboardPage) return await BatchDashboardPage.bootstrap();
  if (page === 'batch_manage' && window.BatchManagePage) return await BatchManagePage.bootstrap();
  if (page === 'report' && window.ReportPage) return await ReportPage.bootstrap();
  if (page === 'report_view' && window.ReportViewPage) return await ReportViewPage.bootstrap();
  if (page === 'farm_events' && window.BatchEventsPage) return await BatchEventsPage.bootstrap();
  if (page === 'module_calendar' && window.ModuleCalendarPage) return await ModuleCalendarPage.bootstrap();
  if (page === 'batch_access' && window.BatchAccessPage) return await BatchAccessPage.bootstrap();
  if (page === 'admin_permissions' && window.AdminPermissionsPage) return await AdminPermissionsPage.bootstrap();
  if (page === 'program_permissions' && window.ProgramPermissionsPage) return await ProgramPermissionsPage.bootstrap();
  if (page === 'items_price_manage' && window.ItemsPriceManagePage) return await ItemsPriceManagePage.bootstrap();
  if (page === 'liff_routes' && window.LiffRoutesPage) return await LiffRoutesPage.bootstrap();
  if ((page === 'medicine' || page === 'medicine_manage') && window.MedicinePage) return await MedicinePage.bootstrap();
  if (page === 'feed_order_bills' && window.FeedOrderBillsPage) return await FeedOrderBillsPage.bootstrap();
  if (page === 'diagnostics' && window.DiagnosticsPage) return await DiagnosticsPage.bootstrap();

  console.warn('No page bootstrap matched:', { rawPage, page });
});

function ensureDuckyUI(page) {
  const excluded = new Set(['login', 'liff_worker', 'report_view']);
  if (excluded.has(page)) return Promise.resolve(false);
  if (window.DuckyUI) return Promise.resolve(true);
  if (document.querySelector('script[data-ducky-ui-loader]')) {
    return new Promise((resolve) => {
      const existing = document.querySelector('script[data-ducky-ui-loader]');
      existing.addEventListener('load', () => resolve(!!window.DuckyUI), { once: true });
      existing.addEventListener('error', () => resolve(false), { once: true });
    });
  }
  return new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'js/core/ducky-ui.js';
    script.defer = true;
    script.dataset.duckyUiLoader = '1';
    script.onload = () => resolve(!!window.DuckyUI);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

function normalizePageKey(value) {
  const key = String(value || '').trim().replace(/-/g, '_');
  if (key === 'medicine_manage') return 'medicine';
  if (key === 'feed_order_bills' || key === 'feed_order_bill') return 'feed_order_bills';
  return key;
}

function ensureFavicon() {
  if (document.querySelector('link[rel~="icon"]')) return;
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = 'favicon.ico';
  document.head.appendChild(link);
}

function addPreconnectHints() {
  const urls = [
    'https://script.google.com',
    'https://script.googleusercontent.com',
    'https://drive.google.com',
    'https://static.line-scdn.net'
  ];
  urls.forEach((href) => {
    if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
