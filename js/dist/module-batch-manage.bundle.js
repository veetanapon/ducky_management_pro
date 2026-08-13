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


/* ===== js/modules/module-batch-manage-page.js ===== */

window.BatchManagePage = (() => {
  const state = {
    batch: null,
    batchPermission: 'read',
    modulePermission: 'none',
    isOwner: false,
    isAdmin: false,
    month: monthKey(new Date()),
    imageBase64: null,
    billDraft: null,
    billPreviewImage: '',
    farmName: '',
    logoUrl: 'assets/farm-logo.png'
  };
  const CACHE_TTL_MS = 60 * 1000;

  const movementModeConfig = {
    add: {
      title: 'เพิ่มจำนวนสัตว์',
      submitLabel: 'บันทึกการเพิ่ม',
      unitPriceLabel: 'ราคาต่อหน่วย (ถ้ามี)',
      unitPriceVisible: true,
      helper: 'เพิ่มจำนวนเข้า batch'
    },
    dead: {
      title: 'บันทึกตาย/สูญเสีย',
      submitLabel: 'บันทึกการตาย',
      unitPriceVisible: false,
      helper: 'ระบบจะหักจำนวนคงเหลือตามที่ระบุ'
    }
  };

  async function bootstrap() {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    bindBaseEvents();
    const batchId = new URLSearchParams(location.search).get('bid');
    if (!batchId) {
      document.getElementById('moduleSubtitle').textContent = 'ไม่พบ batch id';
      return;
    }
    const cached = readCache(cacheKey(batchId));
    if (cached) renderAll(cached);
    await load(batchId);
    const requestedAction = new URLSearchParams(location.search).get('action');
    if (requestedAction === 'sell' && state.modulePermission === 'write') {
      openSaleBillSheet();
    }
  }

  function bindBaseEvents() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);
    document.getElementById('calendarPrevBtn')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('calendarNextBtn')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('moduleCalendarGrid')?.addEventListener('click', onCalendarCellClick);

    document.getElementById('movementSheetCloseBtn')?.addEventListener('click', closeMovementSheet);
    document.getElementById('movementSheetBackdrop')?.addEventListener('click', closeMovementSheet);
    document.getElementById('movementForm')?.addEventListener('submit', submitMovement);

    document.getElementById('movementDayCloseBtn')?.addEventListener('click', closeMovementDaySheet);
    document.getElementById('movementDayBackdrop')?.addEventListener('click', closeMovementDaySheet);
    document.getElementById('movementDayCancelBtn')?.addEventListener('click', closeMovementDaySheet);
    document.getElementById('movementDayForm')?.addEventListener('submit', submitMovementDay);
    document.getElementById('addMovementDayEntryBtn')?.addEventListener('click', () => appendMovementDayEntryRow());
    document.getElementById('movementDayEntryList')?.addEventListener('click', onMovementDayListClick);

    document.getElementById('editSheetCloseBtn')?.addEventListener('click', closeEditSheet);
    document.getElementById('editSheetBackdrop')?.addEventListener('click', closeEditSheet);
    document.getElementById('editBatchForm')?.addEventListener('submit', submitEditBatch);
    document.getElementById('batchImageInput')?.addEventListener('change', onEditImageSelected);

    document.getElementById('saleBillCloseBtn')?.addEventListener('click', closeSaleBillSheet);
    document.getElementById('saleBillBackdrop')?.addEventListener('click', closeSaleBillSheet);
    document.getElementById('saleBillForm')?.addEventListener('submit', onPreviewBillSubmit);
    document.getElementById('addSaleItemBtn')?.addEventListener('click', () => appendSaleItemRow());
    ensureSaleDiscountField();
    normalizeSaleLayout();

    document.getElementById('billPreviewCloseBtn')?.addEventListener('click', closeBillPreview);
    document.getElementById('billPreviewBackdrop')?.addEventListener('click', closeBillPreview);
    document.getElementById('billBackToEditBtn')?.addEventListener('click', backToEditBill);
    document.getElementById('billDownloadBtn')?.addEventListener('click', downloadBillImage);
    document.getElementById('billConfirmBtn')?.addEventListener('click', confirmBill);
  }

  async function load(batchId) {
    const key = cacheKey(batchId);
    const cached = readCache(key, { allowStale: true });
    const cachedData = cached?.data || null;

    if (cachedData) {
      renderAll(cachedData);
      setModuleSyncHint(cached.isStale ? 'กำลังซิงก์ข้อมูลล่าสุด...' : 'กำลังตรวจสอบข้อมูลล่าสุด...');
    }

    const response = await AppApi.post({ action: 'getBatchManagePageData', batch_id: batchId, month: state.month });
    if (!response || response.status !== 'ok') {
      if (!cachedData) document.getElementById('moduleSubtitle').textContent = response?.message || 'โหลดข้อมูลไม่สำเร็จ';
      else setModuleSyncHint('แสดงข้อมูลจากเครื่องอยู่ ยังซิงก์ล่าสุดไม่ได้');
      return;
    }
    writeCache(key, response);
    renderAll(response);
  }

  function renderAll(response) {
    state.batch = response.batch;
    state.batchPermission = response.batch_permission || response.permission || 'read';
    state.modulePermission = response.permission || 'none';
    state.isOwner = !!response.is_owner;
    state.isAdmin = !!response.is_admin;
    state.farmName = response.farm_name || response.batch.owner_name || response.batch.name || 'FARM';
    renderHeader(response);
    renderSummary(response.summary_cards || []);
    renderCalendar(response.calendar_map || {});
    renderFab();
    if (window.NavDrawer) {
      NavDrawer.setBatchContext({
        id: state.batch.id,
        specie: state.batch.specie,
        permission: state.batchPermission,
        isOwner: state.isOwner,
        isAdmin: state.isAdmin,
        module_permissions: response.module_permissions || {}
      });
    }
  }

  function renderHeader(response) {
    document.getElementById('moduleTitle').textContent = 'จัดการชุดสัตว์';
    document.getElementById('moduleSubtitle').textContent = `${state.batch.name} • ${state.batch.specie === 'fish' ? 'จัดการปลา' : 'จัดการเป็ด'}`;
    const badge = document.getElementById('modulePermissionBadge');
    badge.className = `badge-inline ${badgeClass(state.modulePermission)}`;
    badge.textContent = permissionLabel(state.modulePermission);
    document.getElementById('moduleHint').textContent = response.hint || 'ดูภาพรวมการจัดการชุดสัตว์และ action ล่าสุด';
    document.getElementById('calendarMonthLabel').textContent = formatThaiMonth(state.month);
    document.getElementById('calendarTitle').textContent = state.batch.specie === 'duck'
      ? `ปฏิทิน ${formatThaiMonth(state.month)}`
      : 'ไม่แสดงปฏิทินสำหรับปลา';
  }

  function renderSummary(cards) {
    const container = document.getElementById('moduleSummaryCards');
    container.innerHTML = cards.map((card) => `
      <div class="module-summary-card">
        <span class="module-summary-label">${escapeHtml(card.label)}</span>
        <strong class="module-summary-value">${escapeHtml(card.value)}</strong>
        <span class="muted">${escapeHtml(card.note || '')}</span>
      </div>
    `).join('');
  }

  function renderCalendar(map) {
    const panel = document.getElementById('batchManageCalendarPanel');
    if (state.batch.specie !== 'duck') {
      panel?.classList.add('hidden');
      return;
    }
    panel?.classList.remove('hidden');
    const grid = document.getElementById('moduleCalendarGrid');
    const [year, monthNum] = state.month.split('-').map(Number);
    const firstDay = new Date(year, monthNum - 1, 1);
    const lastDay = new Date(year, monthNum, 0).getDate();
    const startWeekday = firstDay.getDay();
    const cells = [];
    for (let i = 0; i < startWeekday; i += 1) cells.push('<div class="module-day module-day--empty"></div>');
    for (let day = 1; day <= lastDay; day += 1) {
      const key = `${state.month}-${String(day).padStart(2, '0')}`;
      const item = map[key] || null;
      const canQuickEdit = !!item && state.modulePermission === 'write';
      const cls = item ? 'module-day module-day--filled' : 'module-day module-day--missing';
      const plusLine = item?.plus_text ? `<div class="module-day-total module-day-total--plus">${escapeHtml(item.plus_text)}</div>` : '';
      const minusLine = item?.minus_text ? `<div class="module-day-total module-day-total--minus">${escapeHtml(item.minus_text)}</div>` : '';
      const emptyLine = (!item?.plus_text && !item?.minus_text) ? '<div class="module-day-total">-</div>' : '';
      cells.push(`<div class="${cls}${canQuickEdit ? ' module-day--clickable' : ''}" ${canQuickEdit ? `data-log-date="${key}"` : ''} title="${escapeHtml(item?.meta || 'ยังไม่มี action')}"><div class="module-day-number">${day}</div>${plusLine}${minusLine}${emptyLine}</div>`);
    }
    grid.innerHTML = cells.join('');
  }

  function renderLogs() {
    const list = document.getElementById('recentLogList');
    const badge = document.getElementById('recentCountBadge');
    badge.textContent = `${state.logs.length} รายการ`;
    if (!state.logs.length) {
      list.innerHTML = '<div class="empty-state">ยังไม่มีรายการล่าสุด</div>';
      return;
    }
    list.innerHTML = state.logs.map((row) => `
      <div class="log-item ${escapeHtml(row.trans_type || '')}">
        <div class="log-item__head"><strong>${escapeHtml(row.title || '-')}</strong><span>${escapeHtml(row.log_date || '-')}</span></div>
        <div class="log-item__body">${(row.lines || []).map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>
      </div>
    `).join('');
  }

  function renderFab() {
    const root = document.getElementById('batchFabRoot');
    if (!root) return;
    if (state.modulePermission !== 'write') {
      root.innerHTML = '';
      return;
    }
    const actions = state.batch.specie === 'fish'
      ? [
          { label: 'เพิ่ม', code: 'add' },
          { label: 'ขาย', code: 'sell' }
        ]
      : [
          { label: 'เพิ่ม', code: 'add' },
          { label: 'ตาย', code: 'dead' },
          { label: 'ขาย', code: 'sell' },
          { label: 'แก้ไขข้อมูล', code: 'edit' }
        ];

    root.innerHTML = `
      <div class="module-fab module-fab--batch" id="moduleFab">
        <div class="module-fab-actions">
          ${actions.map((item) => `<button type="button" class="module-fab-action" data-module-action="${item.code}">${item.label}</button>`).join('')}
        </div>
        <button type="button" class="fab module-fab-main" id="moduleFabToggle">＋</button>
      </div>
    `;
    document.getElementById('moduleFabToggle')?.addEventListener('click', (event) => {
      event.stopPropagation();
      document.getElementById('moduleFab')?.classList.toggle('open');
    });
    root.querySelectorAll('[data-module-action]').forEach((button) => {
      button.addEventListener('click', () => handleAction(button.dataset.moduleAction));
    });
    document.addEventListener('click', onOutsideFabClick, { capture: true });
  }

  function onOutsideFabClick(event) {
    const root = document.getElementById('moduleFab');
    if (root && !root.contains(event.target)) root.classList.remove('open');
  }

  function handleAction(action) {
    document.getElementById('moduleFab')?.classList.remove('open');
    if (action === 'edit') return openEditSheet();
    if (action === 'sell') return openSaleBillSheet();
    return openMovementSheet(action);
  }

  function openMovementSheet(mode) {
    const config = movementModeConfig[mode] || movementModeConfig.add;
    document.getElementById('movementSheetTitle').textContent = config.title;
    document.getElementById('movementSubmitBtn').textContent = config.submitLabel;
    document.getElementById('movementHelperText').textContent = config.helper;
    document.getElementById('movementType').value = mode;
    document.getElementById('movementDate').value = todayString();
    document.getElementById('movementQty').value = '';
    document.getElementById('movementRemark').value = '';
    document.getElementById('movementUnitPrice').value = '';
    document.getElementById('movementCurrentQtyLabel').textContent = `คงเหลือปัจจุบัน ${Number(state.batch.current_qty || 0).toLocaleString()} ตัว`;
    const unitWrap = document.getElementById('movementUnitPriceWrap');
    const unitInput = document.getElementById('movementUnitPrice');
    const unitLabel = document.getElementById('movementUnitPriceLabel');
    unitLabel.textContent = config.unitPriceLabel || 'ราคาต่อหน่วย';
    unitInput.placeholder = config.unitPricePlaceholder || 'ราคาต่อหน่วย';
    unitWrap.classList.toggle('hidden', !config.unitPriceVisible);
    showSheet('movementSheet');
  }

  function closeMovementSheet() { hideSheet('movementSheet'); }

  async function submitMovement(event) {
    event.preventDefault();
    const mode = document.getElementById('movementType').value;
    const qty = Number(document.getElementById('movementQty').value || 0);
    const unitPrice = Number(document.getElementById('movementUnitPrice').value || 0);
    const logDate = document.getElementById('movementDate').value || todayString();
    const remark = document.getElementById('movementRemark').value.trim();
    const submitButton = document.getElementById('movementSubmitBtn');
    const original = submitButton.textContent;

    if (!qty || qty <= 0) return alert('กรุณาระบุจำนวนให้มากกว่า 0');
    if (mode === 'dead' && qty > Number(state.batch.current_qty || 0)) return alert('จำนวนมากกว่าคงเหลือปัจจุบัน');

    submitButton.disabled = true;
    submitButton.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post({
      action: 'saveBatchMovement',
      batch_id: state.batch.id,
      movement_type: mode,
      log_date: logDate,
      qty,
      unit_price: unitPrice,
      remark
    });
    submitButton.disabled = false;
    submitButton.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกรายการไม่สำเร็จ');
    closeMovementSheet();
    clearCache();
    await load(state.batch.id);
  }

  async function onCalendarCellClick(event) {
    const cell = event.target.closest('.module-day[data-log-date]');
    if (!cell || state.modulePermission !== 'write') return;
    const logDate = cell.dataset.logDate;
    if (!logDate) return;
    const ok = confirm(`ต้องการแก้ไขรายการของวันที่ ${logDate} ใช่หรือไม่`);
    if (!ok) return;
    const response = await AppApi.post({ action: 'getBatchMovementRecord', batch_id: state.batch.id, log_date: logDate });
    if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดรายการของวันไม่สำเร็จ');
    openMovementDaySheet(response);
  }

  function openMovementDaySheet(payload) {
    document.getElementById('movementDayTitle').textContent = `แก้ไขรายการของวันที่ ${payload.log_date || ''}`;
    document.getElementById('movementDayDate').value = payload.log_date || todayString();
    const list = document.getElementById('movementDayEntryList');
    list.innerHTML = '';
    const rows = Array.isArray(payload.records) ? payload.records : [];
    if (rows.length) rows.forEach((row) => appendMovementDayEntryRow(row));
    else appendMovementDayEntryRow();
    showSheet('movementDaySheet');
  }

  function closeMovementDaySheet() { hideSheet('movementDaySheet'); }

  function appendMovementDayEntryRow(entry = {}) {
    const list = document.getElementById('movementDayEntryList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'movement-day-entry-row';
    row.innerHTML = `
      <div class="sheet-field-grid sheet-field-grid--2">
        <div>
          <label class="field-label">ประเภท</label>
          <select class="movement-day-type">
            <option value="add" ${String(entry.trans_type || 'add') === 'add' ? 'selected' : ''}>เพิ่ม</option>
            <option value="dead" ${String(entry.trans_type || '') === 'dead' ? 'selected' : ''}>ตาย/สูญเสีย</option>
            <option value="sell" ${String(entry.trans_type || '') === 'sell' ? 'selected' : ''}>ขายออก</option>
          </select>
        </div>
        <div>
          <label class="field-label">จำนวน</label>
          <input class="movement-day-qty" type="number" min="1" step="1" value="${entry.qty != null ? escapeHtml(entry.qty) : ''}" />
        </div>
      </div>
      <div class="sheet-field-grid sheet-field-grid--2">
        <div>
          <label class="field-label">ราคาต่อหน่วย</label>
          <input class="movement-day-unit-price" type="number" min="0" step="0.01" value="${entry.unit_price != null ? escapeHtml(entry.unit_price) : ''}" />
        </div>
        <div class="movement-day-remove-wrap">
          <button type="button" class="secondary-btn entry-remove-btn" data-movement-day-action="remove">ลบรายการนี้</button>
        </div>
      </div>
      <div>
        <label class="field-label">หมายเหตุ</label>
        <textarea class="movement-day-remark" rows="2" placeholder="หมายเหตุเพิ่มเติม">${escapeHtml(entry.remark || '')}</textarea>
      </div>
    `;
    list.appendChild(row);
  }

  function onMovementDayListClick(event) {
    const btn = event.target.closest('[data-movement-day-action="remove"]');
    if (!btn) return;
    const list = document.getElementById('movementDayEntryList');
    if (list.children.length <= 1) return;
    btn.closest('.movement-day-entry-row')?.remove();
  }

  async function submitMovementDay(event) {
    event.preventDefault();
    const rows = [...document.querySelectorAll('#movementDayEntryList .movement-day-entry-row')];
    if (!rows.length) return alert('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ');
    const entries = [];
    for (const row of rows) {
      const transType = row.querySelector('.movement-day-type')?.value || 'add';
      const qty = Number(row.querySelector('.movement-day-qty')?.value || 0);
      const unitPrice = Number(row.querySelector('.movement-day-unit-price')?.value || 0);
      const remark = row.querySelector('.movement-day-remark')?.value.trim() || '';
      if (!(qty > 0)) return alert('จำนวนต้องมากกว่า 0 ทุกรายการ');
      entries.push({ trans_type: transType, qty, unit_price: unitPrice, remark });
    }
    const submitButton = document.getElementById('movementDaySubmitBtn');
    const original = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post({
      action: 'saveBatchMovement',
      mode: 'replace_day',
      batch_id: state.batch.id,
      log_date: document.getElementById('movementDayDate').value || todayString(),
      entries
    });
    submitButton.disabled = false;
    submitButton.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกรายการไม่สำเร็จ');
    closeMovementDaySheet();
    clearCache();
    await load(state.batch.id);
  }

  function openEditSheet() {
    state.imageBase64 = null;
    document.getElementById('editBatchName').value = state.batch.name || '';
    document.getElementById('editBatchSpecie').value = displaySpecie(state.batch.specie);
    document.getElementById('editBatchStatus').value = String(state.batch.status || 0);
    document.getElementById('editBatchUnitPrice').value = state.batch.unit_price || 0;
    document.getElementById('editBatchInitialQty').value = state.batch.initial_qty || 0;
    document.getElementById('editBatchCurrentQty').value = state.batch.current_qty || 0;
    document.getElementById('editBatchStartDate').value = state.batch.start_date || '';
    document.getElementById('editBatchEndDate').value = state.batch.end_date || '';
    document.getElementById('editBatchRemark').value = state.batch.remark || '';
    const preview = document.getElementById('editBatchImagePreview');
    preview.src = AppConfig.imageUrlFromId(state.batch.image_url);
    preview.classList.toggle('hidden', !state.batch.image_url);
    showSheet('editBatchSheet');
  }

  function closeEditSheet() { hideSheet('editBatchSheet'); }

  async function onEditImageSelected(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const base64 = await fileToBase64(file);
    state.imageBase64 = await resizeImage(base64, 1200, 800, 0.82);
    const preview = document.getElementById('editBatchImagePreview');
    preview.src = state.imageBase64;
    preview.classList.remove('hidden');
  }

  async function submitEditBatch(event) {
    event.preventDefault();
    const submitButton = document.getElementById('editBatchSubmitBtn');
    const original = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = 'กำลังบันทึก...';

    const response = await AppApi.post({
      action: 'edit_batch',
      bid: state.batch.id,
      ab_name: document.getElementById('editBatchName').value.trim(),
      ab_species: normalizeSpecie(document.getElementById('editBatchSpecie').value),
      ab_status: Number(document.getElementById('editBatchStatus').value || 0),
      ab_unitprice: Number(document.getElementById('editBatchUnitPrice').value || 0),
      ab_initqty: Number(document.getElementById('editBatchInitialQty').value || 0),
      ab_currqty: Number(document.getElementById('editBatchCurrentQty').value || 0),
      ab_startDate: document.getElementById('editBatchStartDate').value || '',
      ab_endDate: document.getElementById('editBatchEndDate').value || '',
      ab_remark: document.getElementById('editBatchRemark').value.trim(),
      image_base64: state.imageBase64 || null
    });
    submitButton.disabled = false;
    submitButton.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกข้อมูลไม่สำเร็จ');
    closeEditSheet();
    clearCache();
    await load(state.batch.id);
  }

  function openSaleBillSheet() {
    document.getElementById('saleBillDate').value = todayString();
    document.getElementById('saleBuyerName').value = '';
    document.getElementById('saleBillRemark').value = '';
    if (document.getElementById('saleDiscount')) document.getElementById('saleDiscount').value = '0';
    document.getElementById('saleBillStockNote').textContent = `คงเหลือปัจจุบัน ${Number(state.batch.current_qty || 0).toLocaleString()} ${state.batch.specie === 'fish' ? 'กก.' : 'ตัว'} • ชื่อฟาร์มบนบิล: ${state.farmName || '-'}`;
    document.getElementById('saleItemsList').innerHTML = '';
    appendSaleItemRow({ item_name: state.batch.specie === 'fish' ? 'ขายปลา' : 'ขายเป็ด', qty: 1, unit: state.batch.specie === 'fish' ? 'กก.' : 'ตัว', unit_price: Number(state.batch.unit_price || 0) || 0 });
    normalizeSaleLayout();
    showSheet('saleBillSheet');
  }

  function closeSaleBillSheet() { hideSheet('saleBillSheet'); }
  function closeBillPreview() { hideSheet('billPreviewSheet'); }
  function backToEditBill() { hideSheet('billPreviewSheet'); showSheet('saleBillSheet'); }

  function appendSaleItemRow(seed = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'sale-item-card';
    wrap.innerHTML = `
      <button class="remove-line-btn" type="button">ลบรายการ</button>
      <div class="sale-item-grid">
        <div>
          <label class="field-label">รายการ</label>
          <input class="sale-item-name" type="text" placeholder="เช่น ขายสัตว์ชุด A" value="${escapeHtml(seed.item_name || '')}" required>
        </div>
        <div>
          <label class="field-label">หน่วย</label>
          <input class="sale-item-unit" type="text" placeholder="หน่วย" value="${escapeHtml(seed.unit || 'ตัว')}" required>
        </div>
      </div>
      <div class="sale-item-grid-3">
        <div>
          <label class="field-label">จำนวน</label>
          <input class="sale-item-qty" type="number" min="0.01" step="0.01" value="${Number(seed.qty || 0) || ''}" required>
        </div>
        <div>
          <label class="field-label">ราคาต่อหน่วย</label>
          <input class="sale-item-price" type="number" min="0" step="0.01" value="${Number(seed.unit_price || 0) || ''}" required>
        </div>
        <div>
          <label class="field-label">รวม</label>
          <div class="line-total-badge">0.00</div>
        </div>
      </div>
    `;
    const list = document.getElementById('saleItemsList');
    list.appendChild(wrap);
    const qtyInput = wrap.querySelector('.sale-item-qty');
    const priceInput = wrap.querySelector('.sale-item-price');
    const updateLine = () => {
      const total = Number(qtyInput.value || 0) * Number(priceInput.value || 0);
      wrap.querySelector('.line-total-badge').textContent = `${formatMoney(total)} ฿`;
    };
    qtyInput.addEventListener('input', updateLine);
    priceInput.addEventListener('input', updateLine);
    wrap.querySelector('.remove-line-btn').addEventListener('click', () => {
      if (document.querySelectorAll('.sale-item-card').length <= 1) return alert('ต้องมีอย่างน้อย 1 รายการ');
      wrap.remove();
    });
    updateLine();
  }

  async function onPreviewBillSubmit(event) {
    event.preventDefault();
    const draft = collectBillDraft();
    if (!draft) return;
    state.billDraft = draft;
    const dataUrl = await renderBillImage(draft);
    state.billPreviewImage = dataUrl;
    document.getElementById('billPreviewImage').src = dataUrl;
    document.getElementById('billPreviewImage').classList.remove('hidden');
    document.getElementById('billPreviewMeta').textContent = `ก่อนหักส่วนลด ${formatMoney(draft.sub_total || draft.grand_total)} บาท • ส่วนลด ${formatMoney(draft.discount || 0)} บาท • สุทธิหลังหักส่วนลด ${formatMoney(draft.grand_total)} บาท`;
    hideSheet('saleBillSheet');
    showSheet('billPreviewSheet');
  }

  function collectBillDraft() {
    const logDate = document.getElementById('saleBillDate').value;
    if (!logDate) { alert('กรุณาเลือกวันที่ขาย'); return null; }
    const buyerName = document.getElementById('saleBuyerName').value.trim();
    const remark = document.getElementById('saleBillRemark').value.trim();
    const billDiscount = Number(document.getElementById('saleDiscount')?.value || 0);
    const rows = [...document.querySelectorAll('.sale-item-card')];
    const items = [];
    let totalQty = 0;
    let subTotal = 0;
    for (const row of rows) {
      const item_name = row.querySelector('.sale-item-name').value.trim();
      const unit = row.querySelector('.sale-item-unit').value.trim() || 'ตัว';
      const qty = Number(row.querySelector('.sale-item-qty').value || 0);
      const unit_price = Number(row.querySelector('.sale-item-price').value || 0);
      if (!item_name || qty <= 0) { alert('กรุณากรอกชื่อรายการและจำนวนให้ถูกต้อง'); return null; }
      const line_total = round2(qty * unit_price);
      totalQty += qty;
      subTotal += line_total;
      items.push({ item_name, unit, qty, unit_price, line_total });
    }
    if (totalQty > Number(state.batch.current_qty || 0)) { alert('จำนวนขายรวมมากกว่าคงเหลือปัจจุบัน'); return null; }
    const safeDiscount = Math.max(0, round2(billDiscount));
    const grandTotal = Math.max(0, round2(subTotal - safeDiscount));
    return {
      batch_id: state.batch.id,
      bill_title: 'บิลเงินสด',
      bill_type: state.batch.specie,
      farm_name: state.farmName || 'FARM',
      logo_url: state.logoUrl,
      batch_name: state.batch.name,
      log_date: logDate,
      issue_date: nowDateTimeDisplay(),
      sale_name: buyerName,
      remark,
      items,
      total_qty: round2(totalQty),
      sub_total: round2(subTotal),
      discount: safeDiscount,
      grand_total: grandTotal
    };
  }

  // function drawCanvasCenteredText(ctx, text, centerX, y) {
  //   const metrics = ctx.measureText(text);
  //   const visualWidth =
  //     Math.abs(metrics.actualBoundingBoxLeft || 0) +
  //     Math.abs(metrics.actualBoundingBoxRight || metrics.width || 0);

  //   const x =
  //     centerX -
  //     visualWidth / 2 -
  //     (metrics.actualBoundingBoxLeft || 0);

  //   const previousAlign = ctx.textAlign;
  //   ctx.textAlign = 'left';
  //   ctx.fillText(text, x, y);
  //   ctx.textAlign = previousAlign;
  // }

  // async function renderBillImage(draft) {
  //   const width = 430;
  //   const padding = 22;
  //   const lineGap = 18;
  //   const itemBlockHeight = 56;
  //   const headerHeight = 160;
  //   const footerHeight = (draft.remark ? 74 : 42) + 40;
  //   const discountRows = Number(draft.discount || 0) > 0 ? 2 : 1;
  //   const height = headerHeight + footerHeight + (draft.items.length * itemBlockHeight) + 120 + (discountRows * 20);
  //   const canvas = document.createElement('canvas');
  //   canvas.width = width;
  //   canvas.height = height;
  //   const ctx = canvas.getContext('2d');
  //   ctx.fillStyle = '#ffffff';
  //   ctx.fillRect(0, 0, width, height);
  //   ctx.fillStyle = '#111827';
  //   ctx.textBaseline = 'top';

  //   let y = padding;
  //   ctx.fillStyle = '#111827';
  //   ctx.textBaseline = 'top';
  //   ctx.font = 'bold 24px system-ui';
  //   drawCanvasCenteredText(ctx, draft.farm_name || 'FARM', width / 2, y);
  //   y += 34;
  //   ctx.font = 'bold 18px system-ui';
  //   drawCanvasCenteredText(ctx, 'บิลเงินสด', width / 2, y);
  //   y += 32;
  //   ctx.textAlign = 'left';
  //   ctx.font = '14px system-ui';
  //   ctx.fillText('วันที่ขาย: ' + formatThaiDate(draft.log_date), padding, y);

  //   // let y = padding;
  //   // ctx.font = 'bold 24px system-ui';
  //   // ctx.textAlign = 'center';
  //   // ctx.fillText(draft.farm_name || 'FARM', width / 2, y);
  //   // y += 34;
  //   // ctx.textAlign = 'center';
  //   // ctx.font = 'bold 18px system-ui';
  //   // ctx.fillText('บิลเงินสด', width / 2, y);
  //   // y += 32;
  //   // ctx.textAlign = 'left';
  //   // ctx.font = '14px system-ui';
  //   // ctx.fillText('วันที่ขาย: ' + formatThaiDate(draft.log_date), padding, y);

  //   y += lineGap;
  //   ctx.fillText('เวลาออกบิล: ' + draft.issue_date, padding, y);
  //   y += lineGap;
  //   ctx.fillText('ชุดสัตว์: ' + draft.batch_name, padding, y);
  //   y += 22;
  //   ctx.strokeStyle = '#cbd5e1';
  //   ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke();
  //   y += 12;
  //   draft.items.forEach((item) => {
  //     ctx.font = 'bold 15px system-ui';
  //     ctx.fillText(item.item_name, padding, y);
  //     y += 18;
  //     ctx.font = '14px system-ui';
  //     ctx.fillText(`${formatNumber(item.qty)} ${item.unit} x ${formatMoney(item.unit_price)}`, padding, y);
  //     ctx.textAlign = 'right';
  //     ctx.fillText(formatMoney(item.line_total), width - padding, y);
  //     ctx.textAlign = 'left';
  //     y += itemBlockHeight - 18;
  //   });
  //   ctx.strokeStyle = '#cbd5e1';
  //   ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke();
  //   y += 12;
  //   ctx.font = '14px system-ui';
  //   ctx.fillText('รวมก่อนหักส่วนลด', padding, y);
  //   ctx.textAlign = 'right'; ctx.fillText(formatMoney(draft.sub_total), width - padding, y); ctx.textAlign = 'left';
  //   y += lineGap;
  //   if (Number(draft.discount || 0) > 0) {
  //     ctx.fillText('ส่วนลด', padding, y);
  //     ctx.textAlign = 'right'; ctx.fillText('-' + formatMoney(draft.discount), width - padding, y); ctx.textAlign = 'left';
  //     y += lineGap;
  //   }
  //   ctx.font = 'bold 16px system-ui';
  //   ctx.fillText('สุทธิหลังหักส่วนลด', padding, y);
  //   ctx.textAlign = 'right'; ctx.fillText(formatMoney(draft.grand_total), width - padding, y); ctx.textAlign = 'left';
  //   y += lineGap + 10;
  //   if (draft.remark) {
  //     ctx.font = '13px system-ui';
  //     wrapText(ctx, 'หมายเหตุ: ' + draft.remark, padding, y, width - (padding * 2), 18);
  //   }
  //   return canvas.toDataURL('image/png');
  // }
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

function drawCanvasCenteredText(ctx, text, centerX, y) {
  const safeText = String(text || '');
  const metrics = ctx.measureText(safeText);
  const visualWidth =
    Math.abs(metrics.actualBoundingBoxLeft || 0) +
    Math.abs(metrics.actualBoundingBoxRight || metrics.width || 0);

  const x =
    centerX -
    visualWidth / 2 -
    (metrics.actualBoundingBoxLeft || 0);

  const previousAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  ctx.fillText(safeText, x, y);
  ctx.textAlign = previousAlign;
}

async function renderBillImage(draft) {
  return BillPreview.renderBillImage(draft, {
    logoUrl: state.logoUrl || 'assets/farm-logo.png',
    formatThaiDate,
    formatMoney,
    formatNumber,
    wrapText,
    title: draft.bill_title || 'บิลเงินสด',
    thankYouText: 'ขอบคุณที่อุดหนุน'
  });
}    


  async function confirmBill() {
    if (!state.billDraft) return;
    const button = document.getElementById('billConfirmBtn');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post({
      action: 'saveBatchSaleBill',
      batch_id: state.billDraft.batch_id,
      log_date: state.billDraft.log_date,
      sale_name: state.billDraft.sale_name,
      remark: state.billDraft.remark,
      discount: state.billDraft.discount || 0,
      items: state.billDraft.items
    });
    button.disabled = false;
    button.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกบิลไม่สำเร็จ');
    closeBillPreview();
    closeSaleBillSheet();
    clearCache();
    await load(state.batch.id);
    alert(`บันทึกบิลสำเร็จ เลขที่ ${response.bill?.bill_id || '-'}`);
  }

  function downloadBillImage() {
    if (!state.billPreviewImage) return;
    const link = document.createElement('a');
    link.href = state.billPreviewImage;
    link.download = `cash-bill-${state.batch.id}-${Date.now()}.png`;
    link.click();
  }

  function ensureSaleDiscountField() {
    const form = document.getElementById('saleBillForm');
    if (!form || document.getElementById('saleDiscount')) return;
    const stockNote = document.getElementById('saleBillStockNote');
    const discountWrap = document.createElement('div');
    discountWrap.className = 'sale-discount-wrap';
    discountWrap.innerHTML = `
      <label class="field-label" for="saleDiscount">ส่วนลดรวม</label>
      <input id="saleDiscount" type="number" min="0" step="0.01" placeholder="ส่วนลดรวม (บาท)" value="0" />
    `;
    if (stockNote && stockNote.parentNode === form) form.insertBefore(discountWrap, stockNote);
    else form.appendChild(discountWrap);
  }

  function normalizeSaleLayout() {
    const addBtn = document.getElementById('addSaleItemBtn');
    const footer = document.querySelector('#saleBillSheet .sheet-footer');
    if (!addBtn || !footer) return;
    let row = footer.querySelector('.sale-bill-footer-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'sale-bill-footer-row';
      footer.prepend(row);
    }
    const submitBtn = footer.querySelector('#salePreviewBtn');
    addBtn.type = 'button';
    if (!row.contains(addBtn)) row.appendChild(addBtn);
    if (submitBtn && !row.contains(submitBtn)) row.appendChild(submitBtn);
  }

  function showSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => sheet.classList.add('show'));
  }

  function hideSheet(id) {
    const sheet = document.getElementById(id);
    if (!sheet) return;
    sheet.classList.remove('show');
    setTimeout(() => sheet.classList.add('hidden'), 220);
  }

  function cacheKey(batchId) { return `ducky:batch-manage:${batchId}:${state.month}`; }
  function clearCache() {
    try {
      Object.keys(localStorage).forEach((key) => {
        if (state.batch?.id && key.startsWith(`ducky:batch-manage:${state.batch.id}:`)) localStorage.removeItem(key);
      });
    } catch (_) {}
  }
  function setModuleSyncHint(message) {
    const el = document.getElementById('moduleHint');
    if (!el || !message) return;
    el.dataset.syncHint = message;
    el.textContent = message;
  }

  function readCache(key, options = {}) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return options.allowStale ? { data: null, isStale: false, age: Infinity } : null;
      const parsed = JSON.parse(raw);
      const savedAt = Number(parsed.savedAt || parsed.saved_at || 0);
      const age = savedAt ? Date.now() - savedAt : Infinity;
      const isStale = age > CACHE_TTL_MS;
      const data = parsed.data || null;
      if (options.allowStale) return { data, isStale, age, savedAt };
      if (isStale) return null;
      return data;
    } catch (_) { return options.allowStale ? { data: null, isStale: false, age: Infinity } : null; }
  }
  function writeCache(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch (_) {}
  }

  async function changeMonth(offset) {
    const [year, month] = state.month.split('-').map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    state.month = monthKey(next);
    await load(state.batch.id);
  }

  function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
  function permissionLabel(value) { return value === 'write' ? 'ดูและแก้ไข' : (value === 'view' ? 'ดูอย่างเดียว' : 'ไม่มีสิทธิ์'); }
  function badgeClass(value) { return value === 'write' ? 'success' : (value === 'view' ? 'muted-badge' : 'danger-soft'); }
  function displaySpecie(value) { return value === 'duck' ? 'เป็ด' : (value === 'fish' ? 'ปลา' : (value || '-')); }
  function normalizeSpecie(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'เป็ด' || raw === 'duck') return 'duck';
    if (raw === 'ปลา' || raw === 'fish') return 'fish';
    return raw;
  }
  function todayString() { return new Date().toISOString().slice(0, 10); }
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }
  function resizeImage(base64, maxWidth, maxHeight, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        let width = image.width;
        let height = image.height;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.onerror = reject;
      image.src = base64;
    });
  }

  function drawCenteredFitText(ctx, text, centerX, y, maxWidth, weight, baseSize, minSize) {
    text = String(text || '');
    weight = weight || 'bold';
    baseSize = Number(baseSize || 18);
    minSize = Number(minSize || 12);
    var size = baseSize;
    do {
      ctx.font = weight + ' ' + size + 'px system-ui';
      if (ctx.measureText(text).width <= maxWidth || size <= minSize) break;
      size -= 1;
    } while (size >= minSize);
    ctx.textAlign = 'center';
    ctx.fillText(text, centerX, y, maxWidth);
    return size;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = String(text || '').split(/\s+/);
    let line = '';
    for (let i = 0; i < words.length; i += 1) {
      const test = line ? `${line} ${words[i]}` : words[i];
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, y);
        y += lineHeight;
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, x, y);
  }
  function formatMoney(value) { return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function formatNumber(value) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  function round2(value) { return Math.round(Number(value || 0) * 100) / 100; }
  function nowDateTimeDisplay() {
    const d = new Date();
    return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function pad2(value) { return String(value).padStart(2, '0'); }
  function formatThaiMonth(month) {
    const [year, m] = month.split('-').map(Number);
    const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    return `${months[m - 1]} ${year + 543}`;
  }
  function formatThaiDate(dateStr) {
    const date = new Date(`${dateStr}T00:00:00`);
    const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear() + 543}`;
  }
  function escapeHtml(text) {
    return String(text || '').replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  }

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
