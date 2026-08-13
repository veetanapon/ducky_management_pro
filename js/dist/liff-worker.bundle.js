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


/* ===== js/modules/liff-worker.js ===== */
(() => {
  const state = { routeKey: '', profile: null, profileReady: null };
  const qs = (id) => document.getElementById(id);

  function dateKeyOffset(days = 0) {
    const d = new Date();
    d.setDate(d.getDate() + Number(days || 0));
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  const today = () => dateKeyOffset(0);
  const num = (id) => Number(qs(id)?.value || 0);

  function setStatus(text) {
    const el = qs('statusText');
    if (el) el.textContent = text || '';
  }

  function parseRouteFromSearch(search) {
    const params = new URLSearchParams(search || '');
    return params.get('route') || params.get('rt') || params.get('route_key') || '';
  }

  function getRouteKey() {
    let route = parseRouteFromSearch(location.search);
    if (route) return route.trim();

    const params = new URLSearchParams(location.search || '');
    const liffState = params.get('liff.state');
    if (liffState) {
      try {
        const decoded = decodeURIComponent(liffState);
        route = parseRouteFromSearch(decoded.includes('?') ? decoded.slice(decoded.indexOf('?')) : decoded);
        if (route) return route.trim();
      } catch (_) {}
    }
    return '';
  }

  async function initLiffProfileInBackground() {
    try {
      if (!window.liff || !AppConfig.LIFF_ID) return;
      await liff.init({ liffId: AppConfig.LIFF_ID });
      if (liff.isInClient()) liff.window.setLayout('tall');
      if (liff.isLoggedIn()) {
        try { state.profile = await liff.getProfile(); } catch (_) {}
      }
    } catch (error) {
      console.warn('LIFF init skipped/failed', error);
    }
  }

  function init() {
    state.routeKey = getRouteKey();
    qs('logDate').value = today();

    if (!state.routeKey) {
      qs('routeBadge').textContent = 'ลิงก์ไม่ถูกต้อง';
      qs('batchName').textContent = 'ไม่พบ route_key กรุณาใช้ลิงก์ที่ถูกต้อง';
      setStatus('ลิงก์นี้ไม่มี route_key');
      qs('submitBtn').disabled = true;
      return;
    }

    qs('routeBadge').textContent = 'พร้อมบันทึก';
    qs('batchName').textContent = 'ข้อมูลจะถูกส่งไปตรวจสอบ';
    setStatus('');
    state.profileReady = initLiffProfileInBackground();
  }

  async function onSubmit(event) {
    event.preventDefault();

    const rawMessage = qs('rawMessage').value.trim();
    const eggDaily = {
      qty_all: num('qty_all'),
      qty_cracked: num('qty_cracked'),
      qty_big: num('qty_big'),
      qty_small: num('qty_small'),
      qty_broken: num('qty_broken'),
      qty_remain: num('qty_remain')
    };
    const feedDaily = {
      feed_out_qty: num('feed_out_qty'),
      leftover_qty: num('feed_leftover_qty'),
      remark: qs('feed_remark')?.value?.trim() || ''
    };

    if (feedDaily.leftover_qty > feedDaily.feed_out_qty && feedDaily.leftover_qty > 0) {
      alert('จำนวนอาหารเหลือต้องไม่มากกว่าจำนวนที่เท');
      return;
    }

    const hasEgg = Object.values(eggDaily).some((v) => Number(v) > 0);
    const hasFeed = Number(feedDaily.feed_out_qty || 0) > 0 || Number(feedDaily.leftover_qty || 0) > 0 || !!feedDaily.remark;
    if (!hasEgg && !rawMessage && !hasFeed) {
      alert('กรุณากรอกจำนวนไข่ รายการส่งขาย หรือข้อมูลอาหารอย่างน้อย 1 อย่าง');
      return;
    }

    const btn = qs('submitBtn');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    setStatus('กำลังส่งข้อมูล');

    if (state.profileReady) {
      await Promise.race([state.profileReady, new Promise((resolve) => setTimeout(resolve, 250))]);
    }

    const res = await AppApi.postPublic({
      action: 'createLiffPreBill',
      route_key: state.routeKey,
      log_date: qs('logDate').value || today(),
      raw_message: rawMessage,
      egg_daily: eggDaily,
      feed_daily: feedDaily,
      line_user_id: state.profile?.userId || '',
      line_display_name: state.profile?.displayName || ''
    });

    btn.disabled = false;
    btn.textContent = 'บันทึกข้อมูล';

    if (!res || res.status !== 'ok') {
      const message = res?.message || 'บันทึกไม่สำเร็จ';
      setStatus(message);
      alert(message);
      return;
    }

    setStatus('บันทึกสำเร็จแล้ว');
    alert('บันทึกสำเร็จแล้ว');
    event.target.reset();
    qs('logDate').value = today();

    if (window.liff?.isInClient?.()) setTimeout(() => liff.closeWindow(), 700);
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    qs('liffWorkerForm')?.addEventListener('submit', onSubmit);
  });
})();
