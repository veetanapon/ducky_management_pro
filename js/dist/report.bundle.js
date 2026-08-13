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


/* ===== js/modules/report-page.js ===== */
window.ReportPage = (() => {
  const state = {
    batchId: '',
    batch: null,
    permission: 'none',
    rows: [],
    chart: { egg: [], feed: [], duck: [] },
    months: [],
    selectedMonth: 'all',
    pageIndex: 0,
    tab: 'table',
    charts: {},
    isRotated: false
  };
  let bootstrapped = false;
  let chartLoadPromise = null;
  let reportSyncPromise = null;
  let reportSyncSeq = 0;
  const nativeChartMeta = new WeakMap();
  const REPORT_CACHE_TTL_MS = 2 * 60 * 1000;
  const REPORT_SYNC_TIMEOUT_MS = 12000;
  const REPORT_FORCE_SYNC_TIMEOUT_MS = 30000;

  async function bootstrap() {
    if (bootstrapped) return;
    bootstrapped = true;
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    bind();
    state.batchId = new URLSearchParams(location.search).get('bid') || '';
    if (!state.batchId) {
      setText('reportSubtitle', 'ไม่พบ batch id');
      return;
    }
    await load();
  }

  function bind() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);
    document.getElementById('reportMonthSelect')?.addEventListener('change', onMonthChange);
    document.getElementById('reportRebuildBtn')?.addEventListener('click', rebuildReport);
    document.getElementById('reportExportBtn')?.addEventListener('click', exportExcel);
    document.getElementById('reportCreateViewLinkBtn')?.addEventListener('click', createReportViewLink);
    document.getElementById('reportFullscreenBtn')?.addEventListener('click', openFullscreen);
    document.getElementById('reportFullscreenCloseBtn')?.addEventListener('click', closeFullscreen);
    document.getElementById('reportRotateBtn')?.addEventListener('click', toggleRotate);
    document.querySelectorAll('[data-report-tab]').forEach((btn) => {
      btn.addEventListener('click', () => setTab(btn.dataset.reportTab || 'table'));
    });
    window.addEventListener('resize', () => {
      if (!document.getElementById('reportFullscreen')?.classList.contains('hidden')) {
        renderFullscreenTable();
      }
    });
  }

  async function load(options = {}) {
    const force = !!options.force;
    setBusy(true, force ? 'กำลังโหลดรายงานล่าสุด...' : 'กำลังเปิดรายงานจากเครื่อง...');

    // Normal open: show browser cache immediately and sync in the background.
    // Force open after rebuild: start a new request and do not reuse an older
    // background sync promise, because the older request may already be close to
    // its timeout.
    const cached = !force ? readReportCache() : null;
    if (cached?.data?.status === 'ok') {
      hydrateFromResponse(cached.data);
      setBusy(false, `แสดงข้อมูลจากเครื่อง${formatCacheAge(cached.ageMs)} • กำลังซิงก์ล่าสุด...`);
      syncReportInBackground({ hasCache: true });
      return;
    }

    const seq = nextReportSyncSeq();
    await syncReportFromGas({
      hasCache: false,
      showError: true,
      forceFresh: force,
      seq
    });
  }

  function nextReportSyncSeq() {
    reportSyncSeq += 1;
    return reportSyncSeq;
  }

  function isLatestReportSync(seq) {
    return !seq || seq === reportSyncSeq;
  }

  async function syncReportInBackground(options = {}) {
    if (reportSyncPromise) return reportSyncPromise;
    const seq = nextReportSyncSeq();
    reportSyncPromise = syncReportFromGas({ hasCache: !!options.hasCache, showError: false, seq })
      .finally(() => { reportSyncPromise = null; });
    return reportSyncPromise;
  }

  async function syncReportFromGas(options = {}) {
    const hasCache = !!options.hasCache;
    const showError = !!options.showError;
    const forceFresh = !!options.forceFresh;
    const seq = options.seq || nextReportSyncSeq();
    const payload = { action: 'getReportPageData', batch_id: state.batchId };

    if (forceFresh) {
      payload._request_id = `report_force_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    }

    const response = await AppApi.post(
      payload,
      {
        timeoutMs: forceFresh ? REPORT_FORCE_SYNC_TIMEOUT_MS : REPORT_SYNC_TIMEOUT_MS,
        dedupe: !forceFresh
      }
    );

    // If a newer sync/rebuild started while this one was still running, ignore
    // this old result so it cannot overwrite fresh UI state or show a stale
    // timeout message.
    if (!isLatestReportSync(seq)) return null;

    if (!response || response.status !== 'ok') {
      const message = response?.message === 'request_timeout'
        ? 'เชื่อมต่อ GAS ช้า/timeout กำลังแสดงข้อมูลจาก cache ในเครื่อง'
        : (response?.message || 'โหลดรายงานไม่สำเร็จ');

      if (hasCache) {
        setBusy(false, message);
        return null;
      }

      setBusy(false, showError ? message : 'ยังไม่มี cache ในเครื่อง และโหลดข้อมูลล่าสุดไม่สำเร็จ');
      setText('reportSubtitle', showError ? message : 'โหลดรายงานไม่สำเร็จ');
      return null;
    }

    writeReportCache(response);
    hydrateFromResponse(response);
    setBusy(false, state.rows.length ? 'ซิงก์ข้อมูลรายงานล่าสุดแล้ว' : 'ยังไม่มีข้อมูลรายงาน กด “โหลดข้อมูลใหม่” เพื่อสร้างข้อมูลของ batch นี้');
    return response;
  }

  function reportCacheKey() {
    return `ducky:report:${state.batchId}`;
  }

  function readReportCache() {
    try {
      const raw = localStorage.getItem(reportCacheKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const isEnvelope = parsed && typeof parsed === 'object' && Object.prototype.hasOwnProperty.call(parsed, 'value');
      const data = isEnvelope ? parsed.value : parsed;
      const cachedAt = Number(isEnvelope ? parsed.__cached_at : (parsed.__cached_at || 0)) || 0;
      return { data, cachedAt, ageMs: cachedAt ? Date.now() - cachedAt : null };
    } catch (error) {
      console.warn('Report cache read failed', error);
      return null;
    }
  }

  function writeReportCache(response) {
    try {
      if (window.AppCache?.writeEnvelope) AppCache.writeEnvelope(reportCacheKey(), response);
      else localStorage.setItem(reportCacheKey(), JSON.stringify({ __cached_at: Date.now(), value: response }));
    } catch (error) {
      console.warn('Report cache write failed', error);
    }
  }

  function formatCacheAge(ageMs) {
    if (ageMs == null || Number.isNaN(Number(ageMs))) return '';
    if (ageMs < 60 * 1000) return ' • cache ล่าสุดไม่ถึง 1 นาที';
    if (ageMs < 60 * 60 * 1000) return ` • cache ${Math.round(ageMs / 60000)} นาทีที่แล้ว`;
    return ` • cache ${Math.round(ageMs / 3600000)} ชม.ที่แล้ว`;
  }


  function hydrateFromResponse(response) {
    state.batch = response.batch;
    state.permission = response.permission || 'none';
    state.rows = Array.isArray(response.rows) ? response.rows : [];
    state.chart = response.chart || { egg: [], feed: [], duck: [] };
    state.months = Array.isArray(response.months) ? response.months : deriveMonths(state.rows);
    if (!state.months.length) state.selectedMonth = 'all';
    const previousMonth = state.selectedMonth;
    renderHeader(response);
    renderMonthSelect(previousMonth);
    normalizePageIndex();
    renderAll();
  }

  function renderHeader(response) {
    const batch = state.batch || {};
    setText('reportTitle', 'รายงาน');
    setText('reportSubtitle', `${batch.name || state.batchId} • ${batch.specie === 'fish' ? 'ปลา' : 'เป็ด'}`);
    const badge = document.getElementById('reportPermissionBadge');
    if (badge) {
      badge.className = `badge-inline ${state.permission === 'write' ? 'success' : 'muted-badge'}`;
      badge.textContent = state.permission === 'write' ? 'ดูและแก้ไข' : 'ดู';
    }
    if (window.NavDrawer) {
      NavDrawer.setBatchContext({
        id: state.batchId,
        specie: batch.specie,
        permission: state.permission,
        isOwner: !!response.is_owner,
        isAdmin: !!response.is_admin,
        module_permissions: { report: state.permission }
      });
    }
  }

  function renderMonthSelect(preferred) {
    const select = document.getElementById('reportMonthSelect');
    if (!select) return;
    const options = [`<option value="all">ทั้งหมด</option>`].concat(state.months.map((m) => `<option value="${escapeHtml(m.key)}">${escapeHtml(m.label)}</option>`));
    select.innerHTML = options.join('');
    if (preferred && (preferred === 'all' || state.months.some((m) => m.key === preferred))) {
      state.selectedMonth = preferred;
    } else {
      state.selectedMonth = 'all';
    }
    select.value = state.selectedMonth;
  }

  function renderAll() {
    const allRows = state.rows;
    const currentRows = getCurrentRows();
    const subTotal = summarizeRows(currentRows);
    const grandTotal = summarizeRows(allRows);
    renderSummaryCards(grandTotal);
    renderPager();
    renderCompactTable(currentRows, subTotal, grandTotal);
    renderFooter(subTotal, grandTotal);
    renderCharts();
    document.getElementById('reportEmptyState')?.classList.toggle('hidden', state.rows.length > 0);
    // v4.4: subtotal / grand total ย้ายไปอยู่ท้ายตารางแล้ว ไม่ใช้ fixed footer บนมือถือ
    document.getElementById('reportFixedFooter')?.classList.add('hidden');
    setText('reportTableTitle', state.selectedMonth === 'all' ? `ตารางสรุปรายวัน • ${currentMonthLabel()}` : `ตารางสรุปรายวัน • ${selectedMonthLabel()}`);
    setText('reportPageHint', state.selectedMonth === 'all' ? 'เลือกทั้งหมดจะแสดงทีละเดือนผ่านเลขหน้า และมีรวมทั้งหมดท้ายตาราง' : 'แสดงเฉพาะเดือนที่เลือก และมีรวมทั้งหมดท้ายตาราง');
  }

  function renderSummaryCards(total) {
    const target = document.getElementById('reportSummaryCards');
    if (!target) return;
    target.innerHTML = [
      ['ไข่รวม', `${fmt(total.egg_daily)} ฟอง`],
      ['ค่าอาหาร', money(total.feed_cost)],
      ['ค่าไข่', money(total.egg_income)],
      ['สุทธิ', money(total.total_income)]
    ].map(([label, value]) => `
      <div class="report-summary-card">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `).join('');
  }

  function renderPager() {
    const pager = document.getElementById('reportMonthPager');
    if (!pager) return;
    if (state.selectedMonth !== 'all' || state.months.length <= 1) {
      pager.innerHTML = '';
      return;
    }
    pager.innerHTML = state.months.map((month, index) => `
      <button type="button" class="report-month-page-btn ${index === state.pageIndex ? 'is-active' : ''}" data-page-index="${index}" title="${escapeHtml(month.label)}">${index + 1}</button>
    `).join('');
    pager.querySelectorAll('[data-page-index]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.pageIndex = Number(btn.dataset.pageIndex || 0);
        renderAll();
      });
    });
  }

  function renderCompactTable(rows, subTotal, grandTotal) {
    const target = document.getElementById('reportCompactTable');
    if (!target) return;
    if (!rows.length) {
      target.innerHTML = '';
      return;
    }
    target.innerHTML = buildMobileTableHtml(rows, subTotal, true, grandTotal);
  }

  function buildMobileTableHtml(rows, subTotal, includeFooter = false, grandTotal = null) {
    const body = rows.map((row) => `
      <tr>
        <td class="report-date-cell">${escapeHtml(dayOnly(row))}</td>
        <td>${fmtCompact(row.egg_daily)}</td>
        <td>${fmtPercent(row.egg_percent)}</td>
        <td>${fmtFeed(row.feed_out)}</td>
        <td>${fmtCompact(row.feed_cost)}</td>
        <td>${fmtCompact(row.egg_income)}</td>
        <td class="${Number(row.total_income || 0) < 0 ? 'report-negative' : 'report-positive'}">${fmtCompact(row.total_income)}</td>
      </tr>
    `).join('');
    const footerRows = [];
    if (includeFooter) {
      footerRows.push(totalRowHtml(state.selectedMonth === 'all' ? 'รวมหน้า' : 'รวมเดือน', subTotal));
      if (grandTotal) footerRows.push(totalRowHtml('รวมทั้งหมด', grandTotal));
    }
    const footer = footerRows.length ? `<tfoot>${footerRows.join('')}</tfoot>` : '';
    return `
      <div class="report-table-scroll" role="region" aria-label="ตารางสรุปรายวัน">
        <table class="report-table report-table--compact">
          <thead>
            <tr>
              <th>วันที่</th>
              <th>ไข่</th>
              <th>%ไข่</th>
              <th>อาหาร</th>
              <th>ทุน</th>
              <th>ขาย</th>
              <th>สุทธิ</th>
            </tr>
          </thead>
          <tbody>${body}</tbody>
          ${footer}
        </table>
      </div>
    `;
  }

  function totalRowHtml(label, total) {
    return `
      <tr class="report-total-row">
        <td class="report-total-label">${escapeHtml(label)}</td>
        <td>${fmtCompact(total.egg_daily)}</td>
        <td>-</td>
        <td>${fmtFeed(total.feed_out)}</td>
        <td>${fmtCompact(total.feed_cost)}</td>
        <td>${fmtCompact(total.egg_income)}</td>
        <td class="${Number(total.total_income || 0) < 0 ? 'report-negative' : 'report-positive'}">${fmtCompact(total.total_income)}</td>
      </tr>
    `;
  }

  function renderFooter(subTotal, grandTotal) {
    setText('reportSubTotalLabel', state.selectedMonth === 'all' ? `รวมหน้านี้ • ${currentMonthLabel()}` : `รวมเดือนนี้ • ${selectedMonthLabel()}`);
    setText('reportSubTotalValue', footerLine(subTotal));
    setText('reportGrandTotalValue', footerLine(grandTotal));
  }

  function renderCharts() {
    if (state.tab !== 'chart') return;

    const eggRows = getChartRows('egg');
    const feedRows = getChartRows('feed');
    const duckRows = getChartRows('duck');

    destroyCharts();

    if (window.Chart) {
      renderChartJsCharts(eggRows, feedRows, duckRows);
      return;
    }

    // v4.5: native canvas fallback. This avoids third-party CDN storage warnings
    // and still keeps the report graph usable when Chart.js is not hosted locally.
    renderNativeCharts(eggRows, feedRows, duckRows);
  }

  function getChartRows(type) {
    const rows = Array.isArray(state.chart?.[type]) ? state.chart[type] : [];
    const scoped = state.selectedMonth === 'all'
      ? rows
      : rows.filter((r) => r.month_key === currentMonthKey());
    return scoped.slice().sort((a, b) => String(a.date_key || '').localeCompare(String(b.date_key || '')));
  }

  function renderChartJsCharts(eggRows, feedRows, duckRows) {
    const eggCanvas = document.getElementById('eggChart');
    const feedCanvas = document.getElementById('feedChart');
    const duckCanvas = document.getElementById('duckChart');

    const labels = eggRows.map(chartLabel);
    prepareChartCanvas(eggCanvas, labels.length);
    state.charts.egg = new Chart(eggCanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'ไข่รายวัน', data: eggRows.map((r) => Number(r.egg_daily || 0)), yAxisID: 'y', backgroundColor: '#2563eb', borderColor: '#1d4ed8', borderWidth: 1.2, borderRadius: 5, maxBarThickness: 18 },
          { label: '% ไข่', data: eggRows.map((r) => Number(r.egg_percent || 0)), type: 'line', yAxisID: 'y1', borderColor: '#f97316', backgroundColor: '#f97316', borderWidth: 2.5, pointRadius: 2.6, pointHoverRadius: 5, tension: .25 }
        ]
      },
      options: chartOptions({ rightAxis: true })
    });

    const feedTypes = Array.from(new Set(feedRows.map(feedSeriesName)));
    const dateKeys = Array.from(new Set(feedRows.map((r) => String(r.date_key || '')))).filter(Boolean).sort();
    const feedLabels = dateKeys.map((key) => chartLabel(feedRows.find((r) => String(r.date_key || '') === key) || { date_key: key }));
    const chartColors = chartPalette();
    const feedDatasets = feedTypes.map((name, index) => ({
      label: name,
      data: dateKeys.map((key) => feedRows.filter((r) => String(r.date_key || '') === key && feedSeriesName(r) === name).reduce((sum, r) => sum + Number(r.feed_out || 0), 0)),
      backgroundColor: chartColors[index % chartColors.length],
      borderColor: chartColors[index % chartColors.length],
      borderWidth: 1,
      borderRadius: 4,
      maxBarThickness: 18
    }));
    prepareChartCanvas(feedCanvas, feedLabels.length);
    state.charts.feed = new Chart(feedCanvas, {
      type: 'bar',
      data: { labels: feedLabels, datasets: feedDatasets },
      options: chartOptions({ stacked: true })
    });

    const duckLabels = duckRows.map(chartLabel);
    prepareChartCanvas(duckCanvas, duckLabels.length);
    state.charts.duck = new Chart(duckCanvas, {
      type: 'bar',
      data: {
        labels: duckLabels,
        datasets: [{ label: 'เป็ดตาย', data: duckRows.map((r) => Number(r.duck_dead || 0)), backgroundColor: '#dc2626', borderColor: '#b91c1c', borderWidth: 1.2, borderRadius: 5, maxBarThickness: 18 }]
      },
      options: chartOptions()
    });
  }

  function renderNativeCharts(eggRows, feedRows, duckRows) {
    const eggLabels = eggRows.map(chartLabel);
    drawComboCanvasChart('eggChart', eggLabels, eggRows.map((r) => Number(r.egg_daily || 0)), eggRows.map((r) => Number(r.egg_percent || 0)), 'ไข่', '%');

    const feedTypes = Array.from(new Set(feedRows.map(feedSeriesName)));
    const dateKeys = Array.from(new Set(feedRows.map((r) => String(r.date_key || '')))).filter(Boolean).sort();
    const feedLabels = dateKeys.map((key) => chartLabel(feedRows.find((r) => String(r.date_key || '') === key) || { date_key: key }));
    const chartColors = chartPalette();
    const feedDatasets = feedTypes.map((name, index) => ({
      label: name,
      data: dateKeys.map((key) => feedRows.filter((r) => String(r.date_key || '') === key && feedSeriesName(r) === name).reduce((sum, r) => sum + Number(r.feed_out || 0), 0)),
      backgroundColor: chartColors[index % chartColors.length],
      borderColor: chartColors[index % chartColors.length],
      borderWidth: 1,
      borderRadius: 4,
      maxBarThickness: 18
    }));
    drawStackedCanvasChart('feedChart', feedLabels, feedDatasets);

    drawBarCanvasChart('duckChart', duckRows.map(chartLabel), duckRows.map((r) => Number(r.duck_dead || 0)), 'เป็ดตาย');
  }

  function chartLabel(row) {
    if (state.selectedMonth !== 'all') return dayOnly(row);
    const key = String(row?.date_key || '');
    const match = key.match(/^\d{4}-(\d{2})-(\d{2})$/);
    if (match) return `${Number(match[2])}/${Number(match[1])}`;
    return shortDate(row?.date_display || row?.date_key || '');
  }

  function feedSeriesName(row) {
    return row.feed_name || row.feed_id || 'Feed';
  }

  function prepareChartCanvas(canvas, labelCount = 0) {
    if (!canvas) return;
    const wrap = canvas.closest('.report-chart-canvas');
    const base = wrap?.clientWidth || 320;
    const width = Math.max(base, Math.min(2400, Math.max(1, labelCount) * (state.selectedMonth === 'all' ? 24 : 18)));
    canvas.style.width = `${width}px`;
    canvas.style.height = '240px';
  }

  function buildTableHtml(rows, total, includeFooter = true) {
    const body = rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.date_display || row.date_key || '-')}</td>
        <td>${fmt(row.duck_start)}</td>
        <td>${fmt(row.duck_dead)}</td>
        <td>${fmt(row.duck_remain)}</td>
        <td>${fmt(row.egg_daily)}</td>
        <td>${fmt(row.egg_percent)}</td>
        <td>${fmtFeed(row.feed_out)}</td>
        <td>${fmt(row.feed_cost)}</td>
        <td>${fmt(row.egg_income)}</td>
        <td class="${Number(row.total_income || 0) < 0 ? 'report-negative' : 'report-positive'}">${fmt(row.total_income)}</td>
      </tr>
    `).join('');
    const footer = includeFooter ? `
      <tfoot>
        <tr>
          <td>รวม</td>
          <td>${fmt(total.duck_start)}</td>
          <td>${fmt(total.duck_dead)}</td>
          <td>${fmt(total.duck_remain)}</td>
          <td>${fmt(total.egg_daily)}</td>
          <td>-</td>
          <td>${fmtFeed(total.feed_out)}</td>
          <td>${fmt(total.feed_cost)}</td>
          <td>${fmt(total.egg_income)}</td>
          <td class="${Number(total.total_income || 0) < 0 ? 'report-negative' : 'report-positive'}">${fmt(total.total_income)}</td>
        </tr>
      </tfoot>
    ` : '';
    return `
      <table class="report-table">
        <thead><tr>
          <th>วันที่</th><th>เป็ดตั้งต้น</th><th>เป็ดตาย</th><th>เหลือเป็ด</th><th>เก็บไข่</th><th>% ไข่</th><th>อาหาร</th><th>ค่าอาหาร</th><th>ค่าไข่</th><th>รายได้สุทธิ</th>
        </tr></thead>
        <tbody>${body}</tbody>
        ${footer}
      </table>
    `;
  }

  function openFullscreen() {
    const modal = document.getElementById('reportFullscreen');
    if (!modal) return;
    state.isRotated = false;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    document.body.classList.add('report-fullscreen-open');
    renderFullscreenTable();
  }

  function closeFullscreen() {
    const modal = document.getElementById('reportFullscreen');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    document.body.classList.remove('report-fullscreen-open');
    state.isRotated = false;
    document.getElementById('reportFullTableWrap')?.classList.remove('is-rotated');
  }

  function toggleRotate() {
    state.isRotated = !state.isRotated;
    renderFullscreenTable();
  }

  function renderFullscreenTable() {
    const rows = getCurrentRows();
    const total = summarizeRows(rows);
    const wrap = document.getElementById('reportFullTableWrap');
    if (!wrap) return;
    wrap.innerHTML = buildMobileTableHtml(rows, total, true, summarizeRows(state.rows));
    wrap.classList.toggle('is-rotated', state.isRotated);
    setText('reportFullscreenTitle', 'ตารางสรุปรายวัน');
    setText('reportFullscreenSubtitle', currentMonthLabel());
    setText('reportRotateBtn', state.isRotated ? 'กลับแนวเดิม' : 'หมุนตาราง');
    const portrait = window.innerHeight > window.innerWidth;
    document.getElementById('reportRotateHint')?.classList.toggle('hidden', !portrait && !state.isRotated);
  }

  async function rebuildReport() {
    if (!confirm('โหลดข้อมูลรายงานใหม่ของ batch นี้ตั้งแต่วันเริ่มเลี้ยงถึงปัจจุบัน?')) return;

    // Invalidate any background getReportPageData request already in flight.
    // The rebuild result must not be followed by an old almost-timeout read.
    nextReportSyncSeq();
    reportSyncPromise = null;

    setButtonLoading('reportRebuildBtn', true, 'กำลังโหลด...');
    setBusy(true, 'กำลังสร้างข้อมูลรายงานใหม่...');
    const response = await AppApi.post(
      { action: 'rebuildReportForBatch', batch_id: state.batchId, _request_id: `rebuild_${Date.now()}` },
      { timeoutMs: 45000, dedupe: false }
    );
    if (!response || response.status !== 'ok') {
      setButtonLoading('reportRebuildBtn', false);
      setBusy(false, response?.message || 'สร้างข้อมูลรายงานไม่สำเร็จ');
      alert(response?.message || 'สร้างข้อมูลรายงานไม่สำเร็จ');
      return;
    }

    if (window.AppCache?.remove) AppCache.remove(reportCacheKey());
    else localStorage.removeItem(reportCacheKey());

    setText('reportHint', `สร้างข้อมูลใหม่แล้ว ${Number(response.rows || 0).toLocaleString('th-TH')} แถว กำลังโหลดผลล่าสุด...`);
    await load({ force: true });
    setButtonLoading('reportRebuildBtn', false);
    setBusy(false, state.rows.length ? 'โหลดข้อมูลรายงานล่าสุดแล้ว' : 'สร้างข้อมูลแล้ว แต่ยังโหลดผลล่าสุดไม่สำเร็จ');
  }


  async function createReportViewLink() {
    setButtonLoading('reportCreateViewLinkBtn', true, 'กำลังสร้างลิงก์...');
    const response = await AppApi.post({ action: 'createReportViewLink', batch_id: state.batchId });
    setButtonLoading('reportCreateViewLinkBtn', false);
    if (!response || response.status !== 'ok') {
      alert(response?.message || 'สร้างลิงก์ไม่สำเร็จ');
      return;
    }
    const key = response.view_key || response.key || '';
    const url = `${location.origin}${location.pathname.replace(/report\.html$/, '')}report-view.html?key=${encodeURIComponent(key)}`;
    try { await navigator.clipboard.writeText(url); alert('สร้างลิงก์และคัดลอกแล้ว\n' + url); }
    catch (_) { prompt('คัดลอกลิงก์นี้', url); }
  }

  async function exportExcel() {
    const month = state.selectedMonth === 'all' ? 'all' : state.selectedMonth;
    setButtonLoading('reportExportBtn', true, 'กำลัง Export...');
    setBusy(true, 'กำลังสร้างไฟล์ Excel...');
    const response = await AppApi.post({ action: 'exportReportExcel', batch_id: state.batchId, month });
    setButtonLoading('reportExportBtn', false);
    if (!response || response.status !== 'ok') {
      setBusy(false, response?.message || 'Export ไม่สำเร็จ');
      alert(response?.message || 'Export ไม่สำเร็จ');
      return;
    }
    setBusy(false, `Export สำเร็จ ${Number(response.row_count || 0).toLocaleString('th-TH')} แถว กำลังเปิดไฟล์...`);
    openFileUrl(response.file_url || response.view_url);
  }

  function onMonthChange(event) {
    state.selectedMonth = event.target.value || 'all';
    state.pageIndex = 0;
    normalizePageIndex();
    renderAll();
  }

  async function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('[data-report-tab]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.reportTab === tab));
    document.getElementById('reportTablePanel')?.classList.toggle('hidden', tab !== 'table');
    document.getElementById('reportChartPanel')?.classList.toggle('hidden', tab !== 'chart');
    if (tab === 'chart') await ensureChartJs();
    renderCharts();
  }

  function getCurrentRows() {
    const monthKey = currentMonthKey();
    return state.rows.filter((row) => row.month_key === monthKey);
  }

  function currentMonthKey() {
    if (state.selectedMonth !== 'all') return state.selectedMonth;
    return state.months[state.pageIndex]?.key || '';
  }

  function selectedMonthLabel() {
    return state.months.find((m) => m.key === state.selectedMonth)?.label || state.selectedMonth;
  }

  function currentMonthLabel() {
    const key = currentMonthKey();
    return state.months.find((m) => m.key === key)?.label || key || '-';
  }

  function normalizePageIndex() {
    if (state.selectedMonth !== 'all') {
      const index = state.months.findIndex((m) => m.key === state.selectedMonth);
      state.pageIndex = Math.max(0, index);
    } else if (state.pageIndex >= state.months.length) {
      state.pageIndex = Math.max(0, state.months.length - 1);
    }
  }

  function summarizeRows(rows) {
    if (!rows.length) return { duck_start: 0, duck_dead: 0, duck_remain: 0, feed_out: 0, egg_daily: 0, feed_cost: 0, egg_income: 0, total_income: 0 };
    const sorted = rows.slice().sort((a, b) => String(a.date_key).localeCompare(String(b.date_key)));
    return {
      duck_start: Number(sorted[0].duck_start || 0),
      duck_dead: sum(sorted, 'duck_dead'),
      duck_remain: Number(sorted[sorted.length - 1].duck_remain || 0),
      feed_out: sum(sorted, 'feed_out'),
      egg_daily: sum(sorted, 'egg_daily'),
      feed_cost: sum(sorted, 'feed_cost'),
      egg_income: sum(sorted, 'egg_income'),
      total_income: sum(sorted, 'total_income')
    };
  }

  function footerLine(total) {
    return `ไข่ ${fmt(total.egg_daily)} | อาหาร ${fmt(total.feed_out)} | ค่าอาหาร ${money(total.feed_cost)} | ค่าไข่ ${money(total.egg_income)} | สุทธิ ${money(total.total_income)}`;
  }

  function deriveMonths(rows) {
    const map = new Map();
    rows.forEach((row) => {
      if (!row.month_key || map.has(row.month_key)) return;
      map.set(row.month_key, { key: row.month_key, label: thaiMonth(row.month_key), year: row.year, month: row.month });
    });
    return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
  }

  function thaiMonth(key) {
    const names = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
    const [y, m] = String(key || '').split('-').map(Number);
    return `${names[(m || 1) - 1] || key} ${y ? y + 543 : ''}`;
  }

  function ensureChartJs() {
    if (window.Chart) return Promise.resolve(true);
    if (chartLoadPromise) return chartLoadPromise;

    // v4.5: Do not load Chart.js from CDN by default.
    // Edge/Safari tracking prevention can show noisy storage warnings for third-party CDN scripts.
    // If you want to use real Chart.js, host chart.umd.min.js locally and include it in report.html
    // before report-page.js. Otherwise the native canvas fallback below will render the charts.
    chartLoadPromise = Promise.resolve(false);
    return chartLoadPromise;
  }

  function chartPalette() {
    return ['#2563eb', '#0ea5e9', '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#f59e0b', '#64748b'];
  }

  function shouldDrawValueLabels(count) {
    return count <= 35;
  }

  function fmtChartNumber(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString('th-TH', {
      minimumFractionDigits: Number.isInteger(n) ? 0 : 1,
      maximumFractionDigits: 2
    });
  }

  function drawValueLabel(ctx, text, x, y, color, ratio) {
    const safe = String(text || '0');
    ctx.save();
    ctx.font = `${9.5 * ratio}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const metrics = ctx.measureText(safe);
    const padX = 3 * ratio;
    const h = 13 * ratio;
    const w = metrics.width + padX * 2;
    const bx = x - w / 2;
    const by = Math.max(2 * ratio, y - h);
    roundedRect(ctx, bx, by, w, h, 4, 'rgba(255,255,255,.88)');
    ctx.fillStyle = color || '#0f172a';
    ctx.fillText(safe, x, by + h - 2 * ratio);
    ctx.restore();
  }

  function drawBarCanvasChart(canvasId, labels, data, label) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    prepareNativeCanvas(canvas, labels.length);
    const ctx = canvas.getContext('2d');
    const box = chartBox(canvas);
    clearCanvas(ctx, canvas);
    drawAxes(ctx, box, labels);
    const max = Math.max(1, ...data.map(Number));
    const barW = Math.max(5, Math.min(20, box.w / Math.max(1, labels.length) * .62));
    const color = '#dc2626';
    const points = [];
    labels.forEach((lab, i) => {
      const value = Number(data[i] || 0);
      const x = box.x + (i + .5) * box.w / Math.max(1, labels.length);
      const h = (value / max) * box.h;
      const y = box.y + box.h - h;
      roundedRect(ctx, x - barW / 2, y, barW, h, 4, color);
      if (value > 0 && shouldDrawValueLabels(labels.length)) drawValueLabel(ctx, fmtChartNumber(value), x, y - 2 * box.ratio, color, box.ratio);
      points.push({ x, y, label: lab, items: [{ label, value, color }] });
    });
    drawLegend(ctx, [{ label, color }], canvas);
    registerNativeChartTooltip(canvas, points);
  }

  function drawComboCanvasChart(canvasId, labels, bars, line, barLabel, lineLabel) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    prepareNativeCanvas(canvas, labels.length);
    const ctx = canvas.getContext('2d');
    const box = chartBox(canvas);
    clearCanvas(ctx, canvas);
    drawAxes(ctx, box, labels);
    const maxBar = Math.max(1, ...bars.map(Number));
    const maxLine = Math.max(1, ...line.map(Number));
    const barColor = '#2563eb';
    const lineColor = '#f97316';
    const barW = Math.max(5, Math.min(20, box.w / Math.max(1, labels.length) * .62));
    const points = [];
    labels.forEach((lab, i) => {
      const barValue = Number(bars[i] || 0);
      const percentValue = Number(line[i] || 0);
      const x = box.x + (i + .5) * box.w / Math.max(1, labels.length);
      const h = (barValue / maxBar) * box.h;
      const y = box.y + box.h - h;
      roundedRect(ctx, x - barW / 2, y, barW, h, 4, barColor);
      if (barValue > 0 && shouldDrawValueLabels(labels.length)) drawValueLabel(ctx, fmtChartNumber(barValue), x, y - 2 * box.ratio, barColor, box.ratio);
      points.push({ x, y, label: lab, items: [
        { label: barLabel, value: barValue, color: barColor },
        { label: lineLabel, value: percentValue, color: lineColor, suffix: '%' }
      ] });
    });
    ctx.beginPath();
    labels.forEach((_, i) => {
      const x = box.x + (i + .5) * box.w / Math.max(1, labels.length);
      const y = box.y + box.h - (Number(line[i] || 0) / maxLine) * box.h;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2.4 * dpr();
    ctx.stroke();
    labels.forEach((_, i) => {
      const x = box.x + (i + .5) * box.w / Math.max(1, labels.length);
      const y = box.y + box.h - (Number(line[i] || 0) / maxLine) * box.h;
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(x, y, 2.4 * box.ratio, 0, Math.PI * 2);
      ctx.fill();
      if (Number(line[i] || 0) > 0 && shouldDrawValueLabels(labels.length) && i % 2 === 0) {
        drawValueLabel(ctx, `${fmtChartNumber(line[i])}%`, x, y - 5 * box.ratio, lineColor, box.ratio);
      }
    });
    drawLegend(ctx, [{ label: barLabel, color: barColor }, { label: lineLabel, color: lineColor }], canvas);
    registerNativeChartTooltip(canvas, points);
  }

  function drawStackedCanvasChart(canvasId, labels, datasets) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    prepareNativeCanvas(canvas, labels.length);
    const ctx = canvas.getContext('2d');
    const box = chartBox(canvas);
    clearCanvas(ctx, canvas);
    drawAxes(ctx, box, labels);
    const palette = chartPalette();
    const totals = labels.map((_, i) => datasets.reduce((sum, ds) => sum + Number(ds.data[i] || 0), 0));
    const max = Math.max(1, ...totals);
    const barW = Math.max(5, Math.min(20, box.w / Math.max(1, labels.length) * .62));
    const points = [];
    labels.forEach((lab, i) => {
      const x = box.x + (i + .5) * box.w / Math.max(1, labels.length);
      let y = box.y + box.h;
      const items = [];
      datasets.forEach((ds, j) => {
        const value = Number(ds.data[i] || 0);
        const h = (value / max) * box.h;
        const color = palette[j % palette.length];
        if (h > 0) roundedRect(ctx, x - barW / 2, y - h, barW, h, 2, color);
        y -= h;
        if (value > 0) items.push({ label: ds.label, value, color });
      });
      if (totals[i] > 0 && shouldDrawValueLabels(labels.length)) drawValueLabel(ctx, fmtChartNumber(totals[i]), x, y - 2 * box.ratio, '#0f766e', box.ratio);
      points.push({ x, y, label: lab, items: [{ label: 'รวม', value: totals[i], color: '#0f766e' }].concat(items) });
    });
    drawLegend(ctx, datasets.slice(0, 4).map((ds, i) => ({ label: ds.label, color: palette[i % palette.length] })), canvas);
    registerNativeChartTooltip(canvas, points);
  }

  function registerNativeChartTooltip(canvas, points) {
    nativeChartMeta.set(canvas, { points: points || [] });
    if (canvas.dataset.reportTooltipBound === '1') return;
    canvas.dataset.reportTooltipBound = '1';
    const move = (event) => showNativeChartTooltip(canvas, event);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('touchstart', move, { passive: true });
    canvas.addEventListener('touchmove', move, { passive: true });
    canvas.addEventListener('mouseleave', hideNativeChartTooltip);
    canvas.addEventListener('touchend', () => setTimeout(hideNativeChartTooltip, 900), { passive: true });
  }

  function ensureNativeChartTooltip() {
    let el = document.getElementById('reportNativeTooltip');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'reportNativeTooltip';
    el.className = 'report-native-tooltip hidden';
    document.body.appendChild(el);
    return el;
  }

  function showNativeChartTooltip(canvas, event) {
    const meta = nativeChartMeta.get(canvas);
    if (!meta || !meta.points?.length) return;
    const rect = canvas.getBoundingClientRect();
    const pointer = event.touches?.[0] || event;
    const cssX = pointer.clientX - rect.left;
    const canvasX = cssX * (canvas.width / Math.max(1, rect.width));
    let nearest = null;
    let best = Infinity;
    meta.points.forEach((p) => {
      const d = Math.abs(Number(p.x || 0) - canvasX);
      if (d < best) { best = d; nearest = p; }
    });
    if (!nearest || best > 32 * dpr()) return hideNativeChartTooltip();
    const el = ensureNativeChartTooltip();
    el.innerHTML = `<b>${escapeHtml(nearest.label || '-')}</b>` + (nearest.items || []).map((item) => {
      const value = fmtChartNumber(item.value) + (item.suffix || '');
      return `<div><i style="background:${escapeHtml(item.color || '#64748b')}"></i><span>${escapeHtml(item.label || '')}</span><strong>${escapeHtml(value)}</strong></div>`;
    }).join('');
    const left = Math.min(window.innerWidth - 18, Math.max(8, pointer.clientX + 10));
    const top = Math.min(window.innerHeight - 18, Math.max(8, pointer.clientY + 10));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.classList.remove('hidden');
  }

  function hideNativeChartTooltip() {
    document.getElementById('reportNativeTooltip')?.classList.add('hidden');
  }

  function prepareNativeCanvas(canvas, labelCount = 0) {
    const wrap = canvas.closest('.report-chart-canvas');
    const baseW = wrap?.clientWidth || 320;
    const cssW = Math.max(baseW, Math.min(2400, Math.max(1, labelCount) * (state.selectedMonth === 'all' ? 24 : 18)));
    const cssH = 270;
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ratio = dpr();
    canvas.width = Math.round(cssW * ratio);
    canvas.height = Math.round(cssH * ratio);
  }

  function dpr() { return Math.max(1, Math.min(2, window.devicePixelRatio || 1)); }

  function chartBox(canvas) {
    const ratio = dpr();
    return { x: 36 * ratio, y: 30 * ratio, w: canvas.width - 54 * ratio, h: canvas.height - 88 * ratio, ratio };
  }

  function clearCanvas(ctx, canvas) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = cssVar('--bg-card') || '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function drawAxes(ctx, box, labels) {
    const textColor = cssVar('--text-sub') || '#64748b';
    const gridColor = cssVar('--border-soft') || '#e5e7eb';
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1 * box.ratio;
    ctx.font = `${10 * box.ratio}px system-ui, sans-serif`;
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= 4; i += 1) {
      const y = box.y + (box.h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(box.x, y);
      ctx.lineTo(box.x + box.w, y);
      ctx.stroke();
    }
    const step = Math.max(1, Math.ceil(labels.length / 6));
    labels.forEach((label, i) => {
      if (i % step !== 0 && i !== labels.length - 1) return;
      const x = box.x + (i + .5) * box.w / Math.max(1, labels.length);
      ctx.fillText(label, x, box.y + box.h + 8 * box.ratio);
    });
  }

  function drawLegend(ctx, items, canvas) {
    const ratio = dpr();
    const y = canvas.height - 18 * ratio;
    let x = 12 * ratio;
    ctx.font = `${10 * ratio}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    items.forEach((item) => {
      ctx.fillStyle = item.color;
      ctx.fillRect(x, y - 4 * ratio, 8 * ratio, 8 * ratio);
      x += 12 * ratio;
      ctx.fillStyle = cssVar('--text-sub') || '#64748b';
      ctx.fillText(String(item.label || ''), x, y);
      x += Math.min(92 * ratio, ctx.measureText(String(item.label || '')).width + 14 * ratio);
    });
  }

  function roundedRect(ctx, x, y, w, h, r, color) {
    if (h < 1) return;
    const radius = Math.min(r * dpr(), Math.abs(h) / 2, w / 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.fill();
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function chartOptions({ stacked = false, rightAxis = false } = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(15, 23, 42, .92)',
          titleColor: '#fff',
          bodyColor: '#fff',
          padding: 10,
          cornerRadius: 10,
          callbacks: {
            label(ctx) {
              const label = ctx.dataset?.label || '';
              const value = ctx.parsed?.y ?? ctx.raw ?? 0;
              return `${label}: ${fmtChartNumber(value)}`;
            }
          }
        }
      },
      scales: {
        x: { stacked, grid: { display: false }, ticks: { color: '#64748b', maxRotation: 0, autoSkip: true } },
        y: { stacked, beginAtZero: true, grid: { color: 'rgba(148, 163, 184, .25)' }, ticks: { color: '#64748b' } },
        ...(rightAxis ? { y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { color: '#f97316' } } } : {})
      }
    };
  }

  function destroyCharts() {
    Object.values(state.charts).forEach((chart) => chart?.destroy?.());
    state.charts = {};
  }

  function setButtonLoading(id, isLoading, loadingText = '') {
    const btn = document.getElementById(id);
    if (!btn) return;
    if (!btn.dataset.defaultLabel) btn.dataset.defaultLabel = btn.textContent || '';
    if (isLoading) btn.dataset.loadingSelf = '1';
    else delete btn.dataset.loadingSelf;
    btn.disabled = !!isLoading;
    btn.textContent = isLoading ? loadingText : btn.dataset.defaultLabel;
  }

  function openFileUrl(url) {
    if (!url) {
      alert('สร้างไฟล์สำเร็จ แต่ไม่พบ URL สำหรับดาวน์โหลด');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function setBusy(isBusy, text = '') {
    const rebuild = document.getElementById('reportRebuildBtn');
    const exportBtn = document.getElementById('reportExportBtn');
    if (rebuild && !rebuild.dataset.loadingSelf) rebuild.disabled = isBusy;
    if (exportBtn && !exportBtn.dataset.loadingSelf) exportBtn.disabled = isBusy;
    if (text) setText('reportHint', text);
  }

  function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function sum(rows, key) { return rows.reduce((s, r) => s + Number(r[key] || 0), 0); }
  function fmt(value) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
  function money(value) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 }); }
  function fmtCompact(value) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 }); }
  function fmtPercent(value) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 }); }
  function fmtFeed(value) { const n = Number(value || 0); return n.toLocaleString('th-TH', { minimumFractionDigits: Number.isInteger(n) ? 0 : 1, maximumFractionDigits: 2 }); }
  function shortDate(value) { return String(value || '').replace(/ \d{4}$/, ''); }
  function dayOnly(row) {
    const key = String(row?.date_key || '');
    const match = key.match(/^(?:\d{4})-(?:\d{2})-(\d{2})$/);
    if (match) return String(Number(match[1]));
    const display = String(row?.date_display || '').trim();
    const first = display.split(/\s+/)[0];
    return first || '-';
  }
  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[ch]));
  }

  function autoBootstrapReportPage() {
    if (document.body?.dataset?.page !== 'report') return;
    // กันเคส app.js เก่าไม่ได้เพิ่ม branch report หรือ Chart CDN โหลดช้าแล้วหน้าไม่เริ่มทำงาน
    setTimeout(() => {
      if (!bootstrapped) bootstrap();
    }, 0);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', autoBootstrapReportPage, { once: true });
  } else {
    autoBootstrapReportPage();
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
