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


/* ===== js/core/ducky-ui.js ===== */
window.DuckyUI = (() => {
  function ensureToastRoot() {
    let root = document.getElementById('duckyToastRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'duckyToastRoot';
      root.className = 'ducky-toast-root';
      document.body.appendChild(root);
    }
    return root;
  }
  function toast(message, type = 'info', timeout = 3500) {
    const root = ensureToastRoot();
    const item = document.createElement('div');
    item.className = `ducky-toast ducky-toast--${type}`;
    item.textContent = message || '';
    root.appendChild(item);
    requestAnimationFrame(() => item.classList.add('is-visible'));
    setTimeout(() => {
      item.classList.remove('is-visible');
      setTimeout(() => item.remove(), 220);
    }, timeout);
  }
  function showLoading(target, message = 'กำลังโหลด...') {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    el.dataset.previousHtml = el.innerHTML;
    el.innerHTML = `<div class="ducky-loading"><span class="ducky-spinner"></span><span>${message}</span></div>`;
  }
  function hideLoading(target) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    if (el.dataset.previousHtml != null) {
      el.innerHTML = el.dataset.previousHtml;
      delete el.dataset.previousHtml;
    }
  }
  function formatError(res, fallback = 'เกิดข้อผิดพลาด') {
    if (!res) return fallback;
    return res.message || res.error || res.code || fallback;
  }
  async function call(action, payload = {}, options = {}) {
    const title = options.title || action;
    if (options.loadingEl) showLoading(options.loadingEl, options.loadingText || 'กำลังโหลด...');
    try {
      const res = await AppApi.post({ action, ...payload }, options.apiOptions || {});
      if (!res || res.status !== 'ok') {
        const msg = formatError(res, `${title} ไม่สำเร็จ`);
        toast(msg, 'error', 5200);
        return res || { status: 'error', message: msg };
      }
      if (options.successMessage) toast(options.successMessage, 'success');
      return res;
    } catch (err) {
      const msg = err?.message || `${title} ไม่สำเร็จ`;
      toast(msg, 'error', 5200);
      return { status: 'error', message: msg };
    } finally {
      if (options.loadingEl) hideLoading(options.loadingEl);
    }
  }
  return { toast, showLoading, hideLoading, formatError, call };
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


/* ===== js/services/ducky-admin.service.js ===== */
window.DuckyAdminService = (() => {
  const post = (action, data = {}) => AppApi.post({ action, ...data });
  return {
    getMode: () => post('getDuckyDataSourceMode'),
    setMode: (mode) => post('setDuckyDataSourceMode', { mode }),
    health: (data = {}) => post('getDuckySystemHealth', data),
    validate: (data = {}) => post('runDuckyFullValidation', data),
    reconcile: (data = {}) => post('reconcileDuckySupabaseWithSheets', data),
    validateReport: (data = {}) => post('validateSupabaseReportFull', data),
    rebuildReport: (batchId) => post('rebuildSupabaseFullReportForBatch', { batch_id: batchId }),
    timeline: (data = {}) => post('getBatchActivityTimeline', data),
    reportDashboard: (data = {}) => post('getSupabaseReportDashboard', data),
    alerts: (data = {}) => post('getDuckyAlertsForecast', data),
    publicReport: (viewKey) => AppApi.postPublic({ action: 'getReportPublicViewData', view_key: viewKey }),
    diagnostics: (data = {}) => post('getDuckyDiagnosticsDashboard', data),
    diagnosticsSmoke: () => post('runDuckyDiagnosticsSmokeTest'),
    integrity: (data = {}) => post('runDuckyDataIntegrityCheck', data),
    hardeningAudit: () => post('runDuckyProductionHardeningAudit'),
    viewsStatus: () => post('getDuckyV14OptimizationStatus'),
    warmupStatus: () => post('getWarmupStatus'),
    clearRuntimeCaches: (scopes = ['global']) => post('clearDuckyRuntimeCaches', { scopes })
  };
})();


/* ===== js/modules/diagnostics-page.js ===== */
(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  let lastResult = null;
  let isBootstrapped = false;
  let isBound = false;
  let isBusy = false;

  function toast(message, tone = 'info') {
    if (window.DuckyUI?.toast) DuckyUI.toast(message, tone);
    else console[tone === 'error' ? 'error' : 'log'](message);
  }

  function tone(value) {
    const text = String(value || '').toLowerCase();
    if (['ok', 'success', 'ready'].includes(text)) return 'ok';
    if (['warning', 'warn', 'partial'].includes(text)) return 'warn';
    if (['data', 'data_issue', 'data_error'].includes(text)) return 'data';
    if (['error', 'bad', 'critical', 'failed'].includes(text)) return 'error';
    return 'neutral';
  }

  function badge(status, label) {
    const t = tone(status);
    const cls = t === 'ok' ? 'status-ok' : (t === 'warn' ? 'status-warn' : (t === 'data' ? 'status-data' : (t === 'error' ? 'status-error' : 'muted-badge')));
    return `<span class="badge-inline ${cls}">${esc(label || status || '-')}</span>`;
  }

  function kv(label, value) {
    return `<div class="diag-kv"><span>${esc(label)}</span><b>${esc(value == null || value === '' ? '-' : value)}</b></div>`;
  }

  function getCall(data, name) {
    return (data?.calls || []).find((item) => item.name === name) || null;
  }

  function safeSetText(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function setButtonBusy(button, busyText) {
    if (!button) return () => {};
    const oldHtml = button.innerHTML;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (busyText) button.innerHTML = busyText;
    return () => {
      button.disabled = false;
      button.removeAttribute('aria-busy');
      button.innerHTML = oldHtml;
    };
  }

  function setGlobalBusy(next) {
    isBusy = !!next;
    ['diagRefreshBtn', 'refreshDiagnosticsBtn', 'diagIntegrityBtn', 'diagSmokeBtn', 'diagClearCacheBtn'].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = isBusy;
    });
  }

  function setCard(cardId, title, status, html) {
    const card = $(cardId);
    if (!card) return;
    const headBadge = card.querySelector('.diag-card__head .badge-inline');
    if (headBadge) {
      const t = tone(status);
      headBadge.className = `badge-inline ${t === 'ok' ? 'status-ok' : t === 'warn' ? 'status-warn' : t === 'data' ? 'status-data' : t === 'error' ? 'status-error' : 'muted-badge'}`;
      headBadge.textContent = title || status || '-';
    }
    const body = card.querySelector('.diag-card__body');
    if (body) body.innerHTML = html || '<p class="muted">ไม่มีข้อมูล</p>';
  }

  function compactJson(value, maxLen = 220) {
    let text = '';
    try { text = JSON.stringify(value || {}, null, 2); } catch (_) { text = String(value || ''); }
    return text.length > maxLen ? `${text.slice(0, maxLen)}…` : text;
  }

  function buildIssueGroups(issues = [], summaryByCode = null) {
    if (summaryByCode && typeof summaryByCode === 'object') {
      return Object.keys(summaryByCode).map((code) => ({ code, ...summaryByCode[code] }));
    }
    const map = {};
    issues.forEach((issue) => {
      const code = issue.code || issue.message || 'UNKNOWN';
      if (!map[code]) map[code] = { code, count: 0, severity: issue.severity || 'warning', message: issue.message || '', sample: issue.detail || {} };
      map[code].count += 1;
      if (tone(issue.severity) === 'error') map[code].severity = 'error';
    });
    return Object.values(map);
  }

  function renderMode(call) {
    const res = call?.result || {};
    const mode = res.mode || res.data_source_mode || '-';
    setCard('diagModeCard', call?.status || 'ok', call?.status || 'neutral', [
      kv('Mode', mode),
      kv('Users', res.users_source || '-'),
      kv('Sessions', res.sessions_source || '-'),
      kv('Logs', `action=${res.action_logs_source || '-'}, error=${res.system_error_logs_source || '-'}`),
      kv('Elapsed', `${call?.elapsed_ms ?? '-'} ms`)
    ].join(''));
  }

  function renderWarmup(call) {
    const res = call?.result || {};
    setCard('diagWarmupCard', call?.status || 'ok', call?.status || 'neutral', [
      kv('Triggers', res.trigger_count ?? '-'),
      kv('Handler', res.handler || '-'),
      kv('Last warm-up', res.last_warmup_at || '-'),
      kv('Elapsed', `${call?.elapsed_ms ?? '-'} ms`)
    ].join(''));
  }

  function renderViews(call) {
    const res = call?.result || {};
    const items = (res.views || []).map((v) => `<li><span title="${esc(v.view || v.key)}">${esc(v.view || v.key)}</span>${badge(v.ok ? 'ok' : 'error', v.ok ? `${v.ms || 0} ms` : 'error')}</li>`).join('');
    setCard('diagViewsCard', call?.status || 'ok', call?.status || 'neutral', [
      kv('Enabled', res.enabled === false ? 'false' : 'true'),
      kv('Installed', `${res.installed_count ?? 0}/${res.total_count ?? 0}`),
      `<ul class="diag-list">${items || '<li><span>-</span><span>-</span></li>'}</ul>`
    ].join(''));
  }

  function renderHardening(call) {
    const res = call?.result || {};
    const s = res.summary || {};
    const missing = res.idempotency?.missing_critical_write_actions || [];
    setCard('diagHardeningCard', s.severity || call?.status || 'neutral', s.severity || call?.status || 'neutral', [
      kv('Write actions', s.write_actions ?? '-'),
      kv('Idempotent', s.idempotent_write_actions ?? '-'),
      kv('Missing critical', s.missing_critical_idempotency ?? '-'),
      missing.length ? `<p class="muted">${esc(missing.slice(0, 5).join(', '))}${missing.length > 5 ? ' ...' : ''}</p>` : '<p class="muted">Critical write actions covered</p>'
    ].join(''));
  }

  function renderHealth(call) {
    const res = call?.result || {};
    const runtime = res.runtime || {};
    const tables = (res.checked_tables || []).map((t) => `<li><span>${esc(t.table_name || t.table)}</span>${badge(t.ok ? 'ok' : 'error', t.ok ? `${t.count ?? '-'} rows` : 'error')}</li>`).join('');
    setCard('diagHealthCard', call?.status || 'ok', call?.status || 'neutral', [
      kv('Supabase', res.supabase_connected ? 'connected' : 'not connected'),
      kv('Mode', res.mode || '-'),
      kv('Response', `${res.response_time_ms ?? runtime.response_time_ms ?? call?.elapsed_ms ?? '-'} ms`),
      `<ul class="diag-list">${tables || '<li><span>-</span><span>-</span></li>'}</ul>`
    ].join(''));
  }

  function renderIntegrity(call) {
    if (!call) return;
    const res = call?.result || {};
    const s = res.summary || {};
    const issues = res.issues || [];
    const groups = buildIssueGroups(issues, res.issues_by_code).slice(0, 8);
    const status = Number(s.error_count || 0) > 0 ? 'data' : (Number(s.warning_count || 0) > 0 ? 'warning' : 'ok');
    const groupHtml = groups.map((g) => `
      <div class="diag-issue-row">
        <div class="diag-issue-row__top"><code>${esc(g.code)}</code>${badge(g.severity || status, `${g.count || 1}x`)}</div>
        ${g.message ? `<p>${esc(g.message)}</p>` : ''}
        ${g.sample ? `<pre>${esc(compactJson(g.sample))}</pre>` : ''}
      </div>
    `).join('');
    const truncated = res.truncated ? `<p class="muted">แสดง ${esc(res.issue_count_returned)} จาก ${esc(s.issue_count)} issues — ดูทั้งหมดใน Raw result</p>` : '';
    setCard('diagIntegrityCard', status === 'data' ? 'data issue' : (call?.status || s.severity || 'ok'), status, [
      `<div class="diag-issue-summary">
        <div class="diag-mini-stat"><span>Issues</span><b>${esc(s.issue_count ?? 0)}</b></div>
        <div class="diag-mini-stat"><span>Errors</span><b>${esc(s.error_count ?? 0)}</b></div>
        <div class="diag-mini-stat"><span>Warnings</span><b>${esc(s.warning_count ?? 0)}</b></div>
      </div>`,
      kv('Elapsed', `${call?.elapsed_ms ?? res.elapsed_ms ?? '-'} ms`),
      truncated,
      groupHtml ? `<div class="diag-issue-groups">${groupHtml}</div>` : '<p class="muted">ไม่พบปัญหา critical จาก integrity check</p>'
    ].join(''));
  }


  function renderPerformance(call) {
    if (!call) return;
    const res = call?.result || {};
    const s = res.summary || {};
    const status = s.severity || call?.status || 'ok';
    const rows = (res.tests || []).map((t) => {
      const grade = t.grade || (t.ok ? 'ok' : 'error');
      const detail = t.result?.source ? t.result.source : (t.result?.note || t.error || '');
      return `
        <div class="diag-perf-row">
          <div>
            <b title="${esc(t.title || t.name)}">${esc(t.title || t.name)}</b>
            <div class="muted" title="${esc(detail)}">${esc(detail || t.name)}</div>
          </div>
          <span>${esc(t.elapsed_ms ?? '-')} ms</span>
          <span class="diag-perf-target diag-perf-grade-${esc(grade)}">${esc(grade)}</span>
        </div>
      `;
    }).join('');
    setCard('diagPerformanceCard', status, status, [
      `<div class="diag-issue-summary">
        <div class="diag-mini-stat"><span>OK</span><b>${esc(s.ok_count ?? 0)}</b></div>
        <div class="diag-mini-stat"><span>Warn/Slow</span><b>${esc(Number(s.warning_count || 0) + Number(s.slow_count || 0))}</b></div>
        <div class="diag-mini-stat"><span>Error</span><b>${esc(s.error_count ?? 0)}</b></div>
      </div>`,
      kv('Batch', res.batch_id || '-'),
      kv('Elapsed', `${call?.elapsed_ms ?? res.elapsed_ms ?? '-'} ms`),
      rows ? `<div class="diag-perf-table">${rows}</div>` : '<p class="muted">ยังไม่มี baseline</p>'
    ].join(''));
  }

  function render(data) {
    lastResult = data || null;
    const sev = data?.summary?.severity || 'neutral';
    const overall = $('diagOverallBadge');
    if (overall) {
      const t = tone(sev);
      overall.className = `badge-inline ${t === 'ok' ? 'status-ok' : t === 'warn' ? 'status-warn' : t === 'data' ? 'status-data' : t === 'error' ? 'status-error' : 'muted-badge'}`;
      overall.textContent = sev;
    }
    const dataIssues = Number(data?.summary?.data_issue_count || 0);
    safeSetText('diagHeroTitle', sev === 'ok' ? 'ระบบพร้อมใช้งาน' : (dataIssues > 0 ? 'พบข้อมูลที่ควรตรวจสอบ' : (sev === 'warning' ? 'มี warning ที่ควรตรวจสอบ' : 'พบ error ที่ต้องตรวจสอบ')));
    safeSetText('diagHeroDesc', `ตรวจ ${data?.summary?.total_count ?? 0} รายการ · ใช้เวลา ${data?.elapsed_ms ?? '-'} ms${dataIssues ? ` · data issues ${dataIssues}` : ''}`);
    safeSetText('diagLastUpdated', `ล่าสุด ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`);

    renderMode(getCall(data, 'mode'));
    renderWarmup(getCall(data, 'warmup'));
    renderViews(getCall(data, 'v14_views'));
    renderHardening(getCall(data, 'hardening'));
    renderHealth(getCall(data, 'health'));
    renderPerformance(getCall(data, 'performance'));
    renderIntegrity(getCall(data, 'integrity'));

    const raw = $('diagRawJson');
    if (raw) raw.textContent = JSON.stringify(data || {}, null, 2);
  }

  function renderError(error) {
    const message = error?.message || String(error || 'โหลด diagnostics ไม่สำเร็จ');
    const payload = {
      status: 'error',
      message,
      hint: 'ตรวจว่า deploy backend v15.4 แล้ว และ session ยังไม่หมดอายุ',
      at: new Date().toISOString()
    };
    const overall = $('diagOverallBadge');
    if (overall) {
      overall.className = 'badge-inline status-error';
      overall.textContent = 'error';
    }
    safeSetText('diagHeroTitle', 'โหลด diagnostics ไม่สำเร็จ');
    safeSetText('diagHeroDesc', message);
    safeSetText('diagLastUpdated', `ล่าสุด ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}`);
    ['diagModeCard', 'diagWarmupCard', 'diagViewsCard', 'diagHardeningCard', 'diagHealthCard', 'diagPerformanceCard'].forEach((id) => {
      setCard(id, 'error', 'error', `<p class="muted">${esc(message)}</p>`);
    });
    const raw = $('diagRawJson');
    if (raw) raw.textContent = JSON.stringify(payload, null, 2);
  }

  async function loadDiagnostics(options = {}) {
    const payload = {
      action: 'getDuckyDiagnosticsDashboard',
      include_integrity: !!options.includeIntegrity,
      include_health: true,
      include_hardening: true,
      include_views: true,
      include_warmup: true,
      include_performance: !!options.includePerformance,
      issue_limit: options.includeIntegrity ? 80 : 20
    };
    const res = await AppApi.post(payload, { cache: false, timeoutMs: options.includeIntegrity ? 120000 : 45000 });
    if (!res || res.status !== 'ok') throw new Error(res?.message || 'โหลด diagnostics ไม่สำเร็จ');
    render(res);
    return res;
  }

  async function runSmoke() {
    const res = await AppApi.post({ action: 'runDuckyDiagnosticsSmokeTest' }, { cache: false, timeoutMs: 60000 });
    if (!res || res.status !== 'ok') throw new Error(res?.message || 'Smoke test ไม่สำเร็จ');
    const raw = $('diagRawJson');
    if (raw) raw.textContent = JSON.stringify(res, null, 2);
    toast(res.all_ok ? 'Smoke test ผ่าน' : 'Smoke test พบปัญหา', res.all_ok ? 'success' : 'error');
  }

  async function clearCaches() {
    if (!confirm('ล้าง server runtime cache และ client API cache ใช่ไหม?')) return;
    const res = await AppApi.post({ action: 'clearDuckyRuntimeCaches', scopes: ['global'] }, { cache: false, timeoutMs: 45000 });
    AppCache?.removeByPrefix?.('ducky:api:');
    AppCache?.removeByPrefix?.('ducky:module:');
    AppCache?.removeByPrefix?.('ducky:report:');
    const raw = $('diagRawJson');
    if (raw) raw.textContent = JSON.stringify(res, null, 2);
    toast('ล้าง cache แล้ว', 'success');
  }

  function bind() {
    if (isBound) return;
    isBound = true;
    const onRefresh = async () => {
      const restore = setButtonBusy($('diagRefreshBtn'), '<span>↻</span><b>Loading</b>');
      setGlobalBusy(true);
      try { await loadDiagnostics(); } catch (err) { renderError(err); toast(err.message, 'error'); }
      finally { setGlobalBusy(false); restore(); }
    };
    $('refreshDiagnosticsBtn')?.addEventListener('click', onRefresh);
    $('diagRefreshBtn')?.addEventListener('click', onRefresh);
    $('diagIntegrityBtn')?.addEventListener('click', async () => {
      const restore = setButtonBusy($('diagIntegrityBtn'), '<span>✓</span><b>Checking</b>');
      setGlobalBusy(true);
      try { await loadDiagnostics({ includeIntegrity: true }); }
      catch (err) { renderError(err); toast(err.message, 'error'); }
      finally { setGlobalBusy(false); restore(); }
    });
    $('diagSmokeBtn')?.addEventListener('click', async () => {
      const restore = setButtonBusy($('diagSmokeBtn'), '<span>⌁</span><b>Testing</b>');
      setGlobalBusy(true);
      try { await runSmoke(); }
      catch (err) { toast(err.message, 'error'); }
      finally { setGlobalBusy(false); restore(); }
    });
    $('diagPerformanceBtn')?.addEventListener('click', async () => {
      const restore = setButtonBusy($('diagPerformanceBtn'), '<span>◷</span><b>Measuring</b>');
      setGlobalBusy(true);
      try { await loadDiagnostics({ includePerformance: true }); }
      catch (err) { renderError(err); toast(err.message, 'error'); }
      finally { setGlobalBusy(false); restore(); }
    });
    $('diagClearCacheBtn')?.addEventListener('click', async () => {
      const restore = setButtonBusy($('diagClearCacheBtn'), '<span>×</span><b>Clearing</b>');
      setGlobalBusy(true);
      try { await clearCaches(); }
      catch (err) { toast(err.message, 'error'); }
      finally { setGlobalBusy(false); restore(); }
    });
    $('diagCopyBtn')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(lastResult || {}, null, 2));
        toast('copy JSON แล้ว', 'success');
      } catch (_) { toast('copy ไม่สำเร็จ', 'error'); }
    });
  }

  async function bootstrap() {
    if (isBootstrapped) return;
    isBootstrapped = true;

    try {
      if (window.AppAuth?.ensureAuth) {
        const ok = await AppAuth.ensureAuth();
        if (!ok) return;
      }
      bind();
      await loadDiagnostics();
    } catch (err) {
      renderError(err);
      toast(err.message || String(err), 'error');
    }
  }

  window.DiagnosticsPage = { bootstrap, loadDiagnostics, runSmoke, clearCaches };

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      if (!isBootstrapped) bootstrap();
    }, 0);
  });
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
