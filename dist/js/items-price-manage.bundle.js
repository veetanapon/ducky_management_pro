/* Ducky bundle: items-price-manage
 * Generated: 2026-05-28T05:12:04.739Z
 * Sources:
 * - js/config.js
 * - js/core/state.js
 * - js/core/cache.js
 * - js/core/api.js
 * - js/core/auth.js
 * - js/core/dom.js
 * - js/core/format.js
 * - js/core/image.js
 * - js/services/batch.service.js
 * - js/services/feed.service.js
 * - js/services/egg.service.js
 * - js/services/sale.service.js
 * - js/services/price.service.js
 * - js/services/permission.service.js
 * - js/services/menu-permission.service.js
 * - js/services/report.service.js
 * - js/services/liff.service.js
 * - js/services/event.service.js
 * - js/components/bottom-sheet.js
 * - js/components/calendar-grid.js
 * - js/components/summary-cards.js
 * - js/components/skeleton.js
 * - js/components/fab.js
 * - js/components/bill-preview.js
 * - js/modules/nav.js
 * - js/modules/items-price-manage-page.js
 * - js/core/zoom-lock.js
 * - js/app.js
 */

/* ==== js/config.js ==== */
window.AppConfig = {
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

//# sourceURL=js/config.js


/* ==== js/core/state.js ==== */
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

//# sourceURL=js/core/state.js


/* ==== js/core/cache.js ==== */
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
  function writeEnvelope(key, value) { return write(key, { __cached_at: Date.now(), value }); }
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
    if (/price|Permission|Access|batch|Batch|Liff|Report|FeedOrder/i.test(action)) {
      removeByPrefix('ducky:admin:');
      removeByPrefix('ducky:price-admin:');
      removeByPrefix('ducky:api:');
    }
  }
  return { read, write, remove, removeByPrefix, readEnvelope, readEnvelopeDetailed, writeEnvelope, loadBatchCache, saveBatchCache, clearBatchCache, invalidateByPayload };
})();

//# sourceURL=js/core/cache.js


/* ==== js/core/api.js ==== */
window.AppApi = (() => {
  const DEFAULT_TIMEOUT_MS = 18000;
  const inflight = new Map();
  const writeInflight = new Map();
  const READ_ACTIONS = new Set([
    'getMyMenuPermissions','getProgramMenuPermissionAdminOptions','getUserMenuPermissionList','ensureProgramMenuPermissionsReady','getAllBatches','getBatchFullDetail','getBatchDashboardSummary','getBatchManagePageData','getModuleCalendarData',
    'getSaleBillsForDate','getSaleBillRecord','getSaleBillRangeSummary','getEggDailyRecord','getFeedLogRecord',
    'getBatchAccessList','getBatchAccessSummary','getPermissionAdminOptions','getItemPriceAdminData','getPriceSetDetail',
    'getEffectiveEggPriceSet','getPreBillRecord','getReportPageData','getLiffBatchRoutePageData','getBatchEventsPageData',
    'getReportPublicViewData','getFeedOrderBillPageData','getFeedOrderBillsPageData','getFeedOrderPageData'
  ]);
  const WRITE_ACTIONS = new Set([
    'upsertUserMenuPermission','revokeUserMenuPermission','migrateExistingUsersToFullMenuPermissions','add_batch','edit_batch','delete_batch','saveBatchMovement','saveBatchSaleBill','deleteBatchSaleBill','saveFeedLog',
    'saveEggDailyLog','approvePreBill','rejectPreBill','upsertBatchModulePermission','revokeBatchUserPermissions',
    'saveLiffBatchRoute','deactivateLiffBatchRoute','savePriceSet','savePriceSetBinding','removePriceSetBinding','deletePriceSet',
    'rebuildReportForBatch','saveFeedConsumptionLog','approvePreFeedConsumption','rejectPreFeedConsumption','saveBatchEvent','saveMedicalInventoryLog','deleteBatchEvent','createReportViewLink','saveFeedOrderLot','saveFeedOrderBill','createFeedOrderBill','allocateFeedOrderToBatch','allocateFeedOrderBillToBatch','saveFeedOrderAllocation','saveFeedOrderPayment','recordFeedOrderPayment','createFeedOrderPayment','saveFeedOrderBulkPayment','recordFeedOrderBulkPayment','applyFeedOrderBulkPayment','saveFeedOrderClaim','recordFeedOrderClaim','createFeedOrderClaim','setFeedOrderLotVisibility','updateFeedOrderLotVisibility','hideFeedOrderLot'
  ]);
  const CACHE_TTL = {
    getMyMenuPermissions: 5 * 60 * 1000,
    getProgramMenuPermissionAdminOptions: 5 * 60 * 1000,
    getUserMenuPermissionList: 60 * 1000,
    getAllBatches: 5 * 60 * 1000,
    getBatchDashboardSummary: 60 * 1000,
    getBatchManagePageData: 60 * 1000,
    getModuleCalendarData: 60 * 1000,
    getEffectiveEggPriceSet: 12 * 60 * 60 * 1000,
    getPermissionAdminOptions: 5 * 60 * 1000,
    getItemPriceAdminData: 5 * 60 * 1000,
    getReportPageData: 2 * 60 * 1000,
    getLiffBatchRoutePageData: 2 * 60 * 1000,
    getBatchEventsPageData: 60 * 1000,
    getFeedOrderBillPageData: 2 * 60 * 1000
  };

  function stableKey(payload) {
    return Object.keys(payload || {}).sort().map((k) => `${k}:${JSON.stringify(payload[k])}`).join('|');
  }

  function cacheKey(body) {
    return `ducky:api:${String(body.action || '')}:${btoa(unescape(encodeURIComponent(stableKey(body)))).slice(0, 160)}`;
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
    return post(payload, { ...options, __retriedAfterSessionRefresh: true });
  }

  async function post(payload = {}, options = {}) {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return null;

    const body = { session_token: AppAuth.getSession(), ...payload };
    const action = String(payload.action || '');
    const isRead = READ_ACTIONS.has(action);
    const isWrite = WRITE_ACTIONS.has(action);
    const key = stableKey(body);
    if (isRead && inflight.has(key)) return inflight.get(key);
    if (isWrite && writeInflight.has(key)) return writeInflight.get(key);

    const task = (async () => {
      try {
        const json = await fetchWithRetry(body, options);
        if (isSessionExpiredResponse(json)) {
          return await handleExpiredSession(payload, options);
        }
        if (isWrite && json?.status === 'ok' && window.AppCache) AppCache.invalidateByPayload(payload);
        return json;
      } catch (error) {
        console.error('API error:', error);
        return { status: 'error', message: error?.name === 'AbortError' ? 'request_timeout' : (error?.message || 'network_error') };
      } finally {
        if (isRead) inflight.delete(key);
        if (isWrite) setTimeout(() => writeInflight.delete(key), 500);
      }
    })();

    if (isRead) inflight.set(key, task);
    if (isWrite) writeInflight.set(key, task);
    return task;
  }

  async function postPublic(payload = {}, options = {}) {
    try {
      return await fetchWithRetry(payload, options);
    } catch (error) {
      console.error('API public error:', error);
      return { status: 'error', message: error?.name === 'AbortError' ? 'request_timeout' : (error?.message || 'network_error') };
    }
  }

  async function postCached(payload = {}, { ttlMs, background = false, onUpdate } = {}) {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return null;

    const body = { session_token: AppAuth.getSession(), ...payload };
    const action = String(payload.action || '');
    const ttl = ttlMs ?? CACHE_TTL[action] ?? 0;
    const key = cacheKey(body);
    const cached = ttl > 0 && window.AppCache ? AppCache.readEnvelope(key, ttl, null) : null;

    if (cached && background) {
      post(payload).then((fresh) => {
        if (fresh?.status === 'ok') {
          AppCache.writeEnvelope(key, fresh);
          if (typeof onUpdate === 'function') onUpdate(fresh);
        }
      });
      return cached;
    }

    if (cached) return cached;
    const fresh = await post(payload);
    if (fresh?.status === 'ok' && ttl > 0 && window.AppCache) AppCache.writeEnvelope(key, fresh);
    return fresh;
  }

  return { post, postPublic, postCached, READ_ACTIONS, WRITE_ACTIONS, isSessionExpiredResponse };
})();

//# sourceURL=js/core/api.js


/* ==== js/core/auth.js ==== */
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

//# sourceURL=js/core/auth.js


/* ==== js/core/dom.js ==== */
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

//# sourceURL=js/core/dom.js


/* ==== js/core/format.js ==== */
window.AppFormat = (() => {
  function number(value, digits = 0) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: digits }); }
  function money(value) { return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
  function todayKey() { return new Date().toISOString().slice(0, 10); }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[ch])); }
  return { number, money, monthKey, todayKey, escapeHtml };
})();

//# sourceURL=js/core/format.js


/* ==== js/core/image.js ==== */
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

//# sourceURL=js/core/image.js


/* ==== js/services/batch.service.js ==== */
window.BatchApi = {
  list: (lastUpdate) => AppApi.postCached({ action: 'getAllBatches', lastUpdate }, { background: false }),
  dashboard: (batchId) => AppApi.postCached({ action: 'getBatchDashboardSummary', batch_id: batchId }, { background: false }),
  detail: (batchId) => AppApi.post({ action: 'getBatchFullDetail', batch_id: batchId }),
  save: (payload) => AppApi.post(payload),
  movement: (payload) => AppApi.post({ action: 'saveBatchMovement', ...payload })
};

//# sourceURL=js/services/batch.service.js


/* ==== js/services/feed.service.js ==== */
window.FeedApi = {
  pageData: (batchId, month) => AppApi.postCached({ action: 'getModuleCalendarData', batch_id: batchId, module_type: 'feed_manage', month }, { background: false }),
  saveLog: (payload) => AppApi.post({ action: 'saveFeedLog', ...payload }),
  record: (payload) => AppApi.post({ action: 'getFeedLogRecord', ...payload })
};

//# sourceURL=js/services/feed.service.js


/* ==== js/services/egg.service.js ==== */
window.EggApi = {
  pageData: (batchId, month) => AppApi.postCached({ action: 'getModuleCalendarData', batch_id: batchId, module_type: 'egg_daily', month }, { background: false }),
  saveLog: (payload) => AppApi.post({ action: 'saveEggDailyLog', ...payload }),
  record: (payload) => AppApi.post({ action: 'getEggDailyRecord', ...payload })
};

//# sourceURL=js/services/egg.service.js


/* ==== js/services/sale.service.js ==== */
window.SaleApi = {
  pageData: (batchId, month) => AppApi.postCached({ action: 'getModuleCalendarData', batch_id: batchId, module_type: 'sale_manage', month }, { background: false }),
  saveBill: (payload) => AppApi.post({ action: 'saveBatchSaleBill', ...payload }),
  billRecord: (payload) => AppApi.post({ action: 'getSaleBillRecord', ...payload }),
  billsForDate: (payload) => AppApi.post({ action: 'getSaleBillsForDate', ...payload }),
  rangeSummary: (payload) => AppApi.post({ action: 'getSaleBillRangeSummary', ...payload })
};

//# sourceURL=js/services/sale.service.js


/* ==== js/services/price.service.js ==== */
window.PriceApi = {
  adminData: () => AppApi.postCached({ action: 'getItemPriceAdminData' }, { background: false }),
  effectiveEgg: (batchId) => AppApi.postCached({ action: 'getEffectiveEggPriceSet', batch_id: batchId }, { ttlMs: 12 * 60 * 60 * 1000, background: false }),
  saveSet: (payload) => AppApi.post({ action: 'savePriceSet', ...payload })
};

//# sourceURL=js/services/price.service.js


/* ==== js/services/permission.service.js ==== */
window.PermissionApi = {
  adminOptions: () => AppApi.postCached({ action: 'getPermissionAdminOptions' }, { ttlMs: 5 * 60 * 1000, background: false }),
  accessList: (batchId) => AppApi.post({ action: 'getBatchAccessList', batch_id: batchId }),
  accessSummary: (batchId) => AppApi.post({ action: 'getBatchAccessSummary', batch_id: batchId })
};

//# sourceURL=js/services/permission.service.js


/* ==== js/services/menu-permission.service.js ==== */
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
    if (!force && isFresh() && Object.keys(getCached()).length) {
      return { status: 'ok', menu_permissions: getCached(), menu_defs: getDefs(), cached: true };
    }
    if (!window.AppApi?.postCached) return null;
    const res = await AppApi.postCached({ action: 'getMyMenuPermissions' }, { ttlMs: TTL_MS, background: false });
    if (res?.status === 'ok') {
      const profile = res.profile || res.user || {};
      if (res.is_admin != null || profile.is_admin != null || profile.role) {
        window.AppAuth?.applySessionProfile?.({
          ...profile,
          role: profile.role || (res.is_admin ? 'admin' : undefined),
          is_admin: res.is_admin != null ? res.is_admin : profile.is_admin
        });
      }
      writeCache(res.menu_permissions || res.permissions || {}, res.menu_defs || []);
    }
    return res;
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

//# sourceURL=js/services/menu-permission.service.js


/* ==== js/services/report.service.js ==== */
window.ReportApi = {
  pageData: (batchId) => AppApi.postCached(
    { action: 'getReportPageData', batch_id: batchId },
    { ttlMs: 20 * 60 * 1000, background: true, allowStale: true, timeoutMs: 10000 }
  ),
  rebuild: (batchId) => AppApi.post({ action: 'rebuildReportForBatch', batch_id: batchId }, { timeoutMs: 30000 }),
  exportExcel: (batchId, month) => AppApi.post({ action: 'exportReportExcel', batch_id: batchId, month }, { timeoutMs: 30000 }),
  publicView: (key) => AppApi.postPublic({ action: 'getReportPublicViewData', view_key: key }, { timeoutMs: 10000 })
};

//# sourceURL=js/services/report.service.js


/* ==== js/services/liff.service.js ==== */
window.LiffRouteApi = {
  pageData: (batchId) => AppApi.postCached({ action: 'getLiffBatchRoutePageData', batch_id: batchId }, { ttlMs: 2 * 60 * 1000, background: false }),
  save: (payload) => AppApi.post({ action: 'saveLiffBatchRoute', ...payload }),
  generateKey: (batchId) => AppApi.post({ action: 'generateLiffRouteKey', batch_id: batchId })
};

//# sourceURL=js/services/liff.service.js


/* ==== js/services/event.service.js ==== */
window.EventApi = {
  pageData: (batchId) => AppApi.postCached({ action: 'getBatchEventsPageData', batch_id: batchId }, { ttlMs: 60 * 1000, background: false }),
  saveFeedConsumption: (payload) => AppApi.post({ action: 'saveFeedConsumptionLog', ...payload }),
  saveEvent: (payload) => AppApi.post({ action: 'saveBatchEvent', ...payload }),
  saveMedicalInventory: (payload) => AppApi.post({ action: 'saveMedicalInventoryLog', ...payload }),
  deleteEvent: (payload) => AppApi.post({ action: 'deleteBatchEvent', ...payload })
};

//# sourceURL=js/services/event.service.js


/* ==== js/components/bottom-sheet.js ==== */
window.BottomSheet = (() => {
  function open(id) { const sheet = document.getElementById(id); if (!sheet) return; sheet.classList.remove('hidden'); requestAnimationFrame(() => sheet.classList.add('show')); }
  function close(id) { const sheet = document.getElementById(id); if (!sheet) return; sheet.classList.remove('show'); setTimeout(() => sheet.classList.add('hidden'), 220); }
  return { open, close };
})();

//# sourceURL=js/components/bottom-sheet.js


/* ==== js/components/calendar-grid.js ==== */
window.CalendarGrid = (() => {
  function monthKey(date = new Date()) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
  function daysInMonth(key) { const [y,m] = String(key).split('-').map(Number); return new Date(y, m, 0).getDate(); }
  return { monthKey, daysInMonth };
})();

//# sourceURL=js/components/calendar-grid.js


/* ==== js/components/summary-cards.js ==== */
window.SummaryCards = (() => {
  function render(container, cards = []) {
    if (!container) return;
    container.innerHTML = cards.map((card) => `<div class="module-summary-card"><span class="module-summary-label">${AppFormat?.escapeHtml?.(card.label) ?? card.label}</span><strong class="module-summary-value">${AppFormat?.escapeHtml?.(card.value) ?? card.value}</strong><span class="muted">${AppFormat?.escapeHtml?.(card.note || '') ?? ''}</span></div>`).join('');
  }
  return { render };
})();

//# sourceURL=js/components/summary-cards.js


/* ==== js/components/skeleton.js ==== */
window.Skeleton = (() => {
  function cards(count = 3) { return Array.from({ length: count }, () => '<div class="skeleton-wrap"><div class="skeleton-card"><div class="skeleton skeleton-thumb"></div><div style="flex:1"><div class="skeleton skeleton-line long"></div><div class="skeleton skeleton-line short"></div></div></div></div>').join(''); }
  return { cards };
})();

//# sourceURL=js/components/skeleton.js


/* ==== js/components/fab.js ==== */
window.AppFab = (() => {
  function close(root) { root?.classList?.remove('open'); }
  function toggle(root) { root?.classList?.toggle('open'); }
  return { close, toggle };
})();

//# sourceURL=js/components/fab.js


/* ==== js/components/bill-preview.js ==== */
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

//# sourceURL=js/components/bill-preview.js


/* ==== js/modules/nav.js ==== */
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
    farm_events: 'กิจกรรม',
    feed_order_bills: 'บิลอาหารกลาง'
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
    if (bodyPage === 'items_price_manage') return 'items_price_manage';
    if (bodyPage === 'program_permissions') return 'program_permissions';
    if (bodyPage === 'liff_routes') return 'liff_routes';
    if (bodyPage === 'farm_events') return 'farm_events';
    if (bodyPage === 'report_view') return 'report_view';
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
      : `href="${item.href}" data-nav-action="${item.navAction || 'link'}"`;
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

//# sourceURL=js/modules/nav.js


/* ==== js/modules/items-price-manage-page.js ==== */
window.ItemsPriceManagePage = (() => {
  const state = {
    users: [],
    batches: [],
    priceSets: [],
    activeSet: null,
    activeBindings: [],
    bindingsLoaded: false
  };
  const CACHE_TTL_MS = 90 * 1000;

  async function bootstrap() {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    bindBaseEvents();

    const cached = readCache('ducky:price-admin:data');
    if (cached) {
      hydrateState(cached);
      renderAll();
    }

    const response = await AppApi.post({ action: 'getItemPriceAdminData' });
    if (!response || response.status !== 'ok') {
      if (!cached) document.getElementById('priceManageSubtitle').textContent = response?.message || 'โหลดชุดราคาไม่สำเร็จ';
      return;
    }

    hydrateState(response);
    writeAdminCache();
    renderAll();

    if (window.NavDrawer) {
      NavDrawer.setBatchContext({ isAdmin: true, module_permissions: {}, batch: null });
    }
  }

  function hydrateState(payload) {
    state.users = payload.users || [];
    state.batches = payload.batches || [];
    state.priceSets = payload.price_sets || [];
    if (state.activeSet) {
      const refreshed = state.priceSets.find((item) => String(item.id) === String(state.activeSet.id));
      state.activeSet = refreshed || null;
    }
  }

  function bindBaseEvents() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);

    document.getElementById('priceSetForm')?.addEventListener('submit', onSavePriceSet);
    document.getElementById('addPriceItemBtn')?.addEventListener('click', () => appendPriceItemRow('', '', '', true));
    document.getElementById('newPriceSetBtn')?.addEventListener('click', resetEditor);
    document.getElementById('deletePriceSetBtn')?.addEventListener('click', onDeletePriceSet);
    document.getElementById('priceItemList')?.addEventListener('click', onPriceItemListClick);
    document.getElementById('priceSetList')?.addEventListener('click', onPriceSetListClick);

    document.getElementById('bindingType')?.addEventListener('change', renderBindingTargetList);
    document.getElementById('bindingForm')?.addEventListener('submit', onSaveBinding);
    document.getElementById('loadBindingsBtn')?.addEventListener('click', loadBindingsForActiveSet);
    document.getElementById('bindingList')?.addEventListener('click', onBindingListClick);

    document.getElementById('priceSetEditorCloseBtn')?.addEventListener('click', closePriceSetSheet);
    document.getElementById('priceSetEditorBackdrop')?.addEventListener('click', closePriceSetSheet);
    document.getElementById('bindingCloseBtn')?.addEventListener('click', closeBindingSheet);
    document.getElementById('bindingBackdrop')?.addEventListener('click', closeBindingSheet);
  }

  function renderAll() {
    document.getElementById('priceManageSubtitle').textContent = `มีชุดราคาทั้งหมด ${state.priceSets.length} ชุด`;
    document.getElementById('priceSetCountBadge').textContent = `${state.priceSets.length} ชุด`;
    renderSummary();
    renderBindingTargetList();
    renderPriceSetCards();
    renderFab();
    updateActiveSetHint();
  }

  function renderSummary() {
    const summary = document.getElementById('itemPriceSummaryCards');
    if (!summary) return;
    const bindingCount = state.activeSet ? Number(state.activeSet.binding_count || state.activeBindings.length || 0) : 0;
    summary.innerHTML = `
      <div class="module-summary-card">
        <span class="module-summary-label">ชุดราคาทั้งหมด</span>
        <strong class="module-summary-value">${escapeHtml(String(state.priceSets.length))}</strong>
        <span class="muted">ใช้ FAB เพื่อสร้างชุดราคาใหม่</span>
      </div>
      <div class="module-summary-card">
        <span class="module-summary-label">ชุดที่เลือก</span>
        <strong class="module-summary-value">${escapeHtml(state.activeSet?.name || 'ยังไม่ได้เลือก')}</strong>
        <span class="muted">ผูกใช้งานแล้ว ${escapeHtml(String(bindingCount))} รายการ</span>
      </div>
    `;
  }

  function updateActiveSetHint() {
    const hint = document.getElementById('activeSetHint');
    if (!hint) return;
    if (!state.activeSet) {
      hint.textContent = 'แตะการ์ดชุดราคาเพื่อเลือกเป็นชุดที่ต้องการแก้ไขหรือผูกใช้งาน';
      return;
    }
    const scopeLabel = state.activeSet.scope_type === 'user' ? 'เฉพาะผู้ใช้' : 'ทั้งระบบ';
    const itemCount = Number(state.activeSet.item_count || 0);
    const bindingCount = Number(state.activeSet.binding_count || state.activeBindings.length || 0);
    hint.textContent = `กำลังเลือก: ${state.activeSet.name} • ${scopeLabel} • ${itemCount} รายการราคา • ผูกแล้ว ${bindingCount} รายการ`;
  }

  function renderBindingTargetList() {
    const type = document.getElementById('bindingType')?.value || 'batch';
    const list = document.getElementById('bindingTargetList');
    if (!list) return;
    const rows = type === 'user' ? state.users : state.batches;
    list.innerHTML = rows.map((item) => `<option value="${escapeHtml(item.label)}"></option>`).join('');
  }

  function renderPriceSetCards() {
    const target = document.getElementById('priceSetList');
    if (!target) return;
    if (!state.priceSets.length) {
      target.innerHTML = '<div class="empty-state">ยังไม่มีชุดราคา กด FAB ด้านล่างเพื่อสร้างชุดแรกได้เลย</div>';
      return;
    }
    target.innerHTML = state.priceSets.map((set) => {
      const active = state.activeSet && String(state.activeSet.id) === String(set.id);
      const scopeLabel = set.scope_type === 'user' ? 'เฉพาะผู้ใช้' : 'ทั้งระบบ';
      return `
        <button type="button" class="price-set-card${active ? ' is-active' : ''}" data-price-set-id="${escapeAttr(set.id)}">
          <div class="price-set-card__head">
            <strong class="price-set-card__title">${escapeHtml(set.name)}</strong>
            <span class="badge-inline ${set.is_active ? 'success' : 'muted-badge'}">${set.is_active ? 'active' : 'inactive'}</span>
          </div>
          <div class="price-set-card__meta">
            <span>${escapeHtml(scopeLabel)}</span>
            <span>${escapeHtml(String(set.item_count || 0))} รายการ</span>
            <span>${escapeHtml(String(set.binding_count || 0))} การผูก</span>
          </div>
        </button>`;
    }).join('');
  }

  function renderFab() {
    const root = document.getElementById('moduleFabRoot');
    if (!root) return;
    root.innerHTML = `
      <div class="module-fab" id="moduleFab">
        <div class="module-fab-actions">
          <button type="button" class="module-fab-action" data-price-action="create">สร้างชุดราคา</button>
          <button type="button" class="module-fab-action${state.activeSet ? '' : ' is-disabled'}" data-price-action="edit">แก้ไขชุดราคา</button>
          <button type="button" class="module-fab-action${state.activeSet ? '' : ' is-disabled'}" data-price-action="bind">ผูกชุดราคา</button>
        </div>
        <button type="button" class="fab module-fab-main" id="moduleFabToggle">＋</button>
      </div>
    `;
    document.getElementById('moduleFabToggle')?.addEventListener('click', (event) => {
      event.stopPropagation();
      document.getElementById('moduleFab')?.classList.toggle('open');
    });
    root.querySelectorAll('[data-price-action]').forEach((button) => {
      button.addEventListener('click', () => handleFabAction(button.dataset.priceAction));
    });
    document.removeEventListener('click', onOutsideFabClick, true);
    document.addEventListener('click', onOutsideFabClick, true);
  }

  function onOutsideFabClick(event) {
    const root = document.getElementById('moduleFab');
    if (root && !root.contains(event.target)) root.classList.remove('open');
  }

  function handleFabAction(action) {
    document.getElementById('moduleFab')?.classList.remove('open');
    if (action === 'create') {
      resetEditor(false);
      openPriceSetSheet('create');
      return;
    }
    if (!state.activeSet) {
      alert('กรุณาเลือกชุดราคาก่อน');
      return;
    }
    if (action === 'edit') {
      openPriceSetSheet('edit');
      return;
    }
    if (action === 'bind') {
      openBindingSheet();
    }
  }

  function openPriceSetSheet(mode) {
    const title = document.getElementById('priceSetEditorTitle');
    title.textContent = mode === 'edit' ? 'แก้ไขชุดราคา' : 'สร้างชุดราคา';
    showSheet('priceSetEditorSheet');
  }

  function closePriceSetSheet() { hideSheet('priceSetEditorSheet'); }
  function openBindingSheet() {
    if (!state.activeSet) return alert('กรุณาเลือกชุดราคาก่อน');
    document.getElementById('bindingPriceSetSearch').value = priceSetLabel(state.activeSet);
    document.getElementById('bindingTargetSearch').value = '';
    renderBindingTargetList();
    if (state.bindingsLoaded) renderBindings();
    else loadBindingsForActiveSet();
    showSheet('bindingSheet');
  }
  function closeBindingSheet() { hideSheet('bindingSheet'); }

  function resetEditor(resetBindings = true) {
    state.activeSet = null;
    if (resetBindings) {
      state.activeBindings = [];
      state.bindingsLoaded = false;
    }
    document.getElementById('priceSetForm').reset();
    document.getElementById('priceSetId').value = '';
    document.getElementById('priceSetScopeType').value = 'system';
    document.getElementById('priceItemList').innerHTML = '';
    appendPriceItemRow('23.6', '23.6 (23.6 กรัมขึ้นไป)', '', false);
    appendPriceItemRow('23.1', '23.1 (23.10-23.59 กรัม)', '', false);
    document.getElementById('deletePriceSetWrap').classList.add('hidden');
    if (resetBindings) {
      document.getElementById('bindingCountBadge').textContent = 'ยังไม่มีการผูกใช้งาน';
      document.getElementById('bindingList').innerHTML = '<div class="empty-state">ยังไม่มีการผูกชุดราคานี้</div>';
      document.getElementById('bindingPriceSetSearch').value = '';
      document.getElementById('bindingTargetSearch').value = '';
    }
    renderAll();
  }

  function appendPriceItemRow(itemName = '', displayName = '', price = '', scrollIntoView = false) {
    const row = document.createElement('div');
    row.className = 'price-item-row';
    row.innerHTML = `
      <div class="price-item-grid">
        <div class="price-item-field">
          <label class="field-label">ชื่อรายการ</label>
          <input class="price-item-name" type="text" placeholder="เช่น 23.6 หรือ บาง" value="${escapeAttr(itemName)}" />
        </div>
        <div class="price-item-field">
          <label class="field-label">ข้อความที่แสดงบนบิล</label>
          <input class="price-item-display" type="text" placeholder="ข้อความแสดงผลเพิ่มเติม" value="${escapeAttr(displayName)}" />
        </div>
        <div class="price-item-field price-item-field--price">
          <label class="field-label">ราคาต่อฟอง</label>
          <input class="price-item-value" type="number" min="0" step="0.01" placeholder="0.00" value="${price !== '' ? escapeAttr(price) : ''}" />
        </div>
        <div class="price-item-remove-wrap">
          <button type="button" class="secondary-btn price-item-remove" data-action="remove-price-item">ลบรายการ</button>
        </div>
      </div>
    `;
    document.getElementById('priceItemList').appendChild(row);
    if (scrollIntoView) requestAnimationFrame(() => row.scrollIntoView({ behavior: 'smooth', block: 'end' }));
  }

  function onPriceItemListClick(event) {
    const btn = event.target.closest('[data-action="remove-price-item"]');
    if (!btn) return;
    const list = document.getElementById('priceItemList');
    if (list.children.length <= 1) return;
    btn.closest('.price-item-row')?.remove();
  }

  async function onPriceSetListClick(event) {
    const card = event.target.closest('[data-price-set-id]');
    if (!card) return;
    await loadPriceSetDetail(card.dataset.priceSetId);
  }

  async function loadPriceSetDetail(priceSetId) {
    const selectedCard = document.querySelector(`[data-price-set-id="${CSS.escape(String(priceSetId || ''))}"]`);
    const originalText = selectedCard?.textContent || '';
    if (selectedCard) selectedCard.classList.add('is-loading');

    const response = await AppApi.post({ action: 'getPriceSetDetail', price_set_id: priceSetId, include_bindings: 0 }, { timeoutMs: 12000 });
    if (selectedCard) selectedCard.classList.remove('is-loading');
    if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดรายละเอียดชุดราคาไม่สำเร็จ');

    state.activeSet = response.price_set;
    state.activeBindings = [];
    state.bindingsLoaded = false;
    fillEditor(response.price_set, response.items || []);
    renderAll();
    renderBindings();
  }

  function fillEditor(priceSet, items) {
    document.getElementById('priceSetId').value = priceSet.id || '';
    document.getElementById('priceSetName').value = priceSet.name || '';
    document.getElementById('priceSetScopeType').value = priceSet.scope_type || 'system';
    document.getElementById('priceSetRemark').value = priceSet.remark || '';
    const list = document.getElementById('priceItemList');
    list.innerHTML = '';
    if (items.length) items.forEach((item) => appendPriceItemRow(item.item_name, item.display_name, item.current_price));
    else appendPriceItemRow();
    document.getElementById('deletePriceSetWrap').classList.remove('hidden');
  }

  async function onSavePriceSet(event) {
    event.preventDefault();
    const rows = [...document.querySelectorAll('#priceItemList .price-item-row')];
    if (!rows.length) return alert('กรุณาเพิ่มรายการราคาอย่างน้อย 1 รายการ');

    const items = [];
    const seen = new Set();
    for (const row of rows) {
      const itemName = row.querySelector('.price-item-name').value.trim();
      const displayName = row.querySelector('.price-item-display').value.trim();
      const currentPrice = Number(row.querySelector('.price-item-value').value || 0);
      if (!itemName) return alert('กรุณากรอก item_name ทุกแถว');
      if (seen.has(itemName)) return alert(`item_name ซ้ำกัน: ${itemName}`);
      seen.add(itemName);
      if (currentPrice < 0) return alert('ราคาต่อฟองต้องไม่ติดลบ');
      items.push({ item_name: itemName, display_name: displayName, current_price: currentPrice });
    }

    const payload = {
      action: 'savePriceSet',
      price_set_id: document.getElementById('priceSetId').value || '',
      name: document.getElementById('priceSetName').value.trim(),
      scope_type: document.getElementById('priceSetScopeType').value,
      scope_ref_id: '',
      specie: 'duck',
      sale_kind: 'egg_weight',
      remark: document.getElementById('priceSetRemark').value.trim(),
      items
    };
    if (!payload.name) return alert('กรุณากรอกชื่อชุดราคา');

    const btn = document.getElementById('savePriceSetBtn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post(payload);
    btn.disabled = false;
    btn.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกชุดราคาไม่สำเร็จ');

    upsertLocalPriceSet(response.price_set);
    state.activeSet = response.price_set;
    state.activeBindings = [];
    state.bindingsLoaded = false;
    fillEditor(response.price_set, response.items || items);
    writeAdminCache();
    closePriceSetSheet();
    renderAll();
    renderBindings();
    alert('บันทึกชุดราคาเรียบร้อย');
  }

  async function onDeletePriceSet() {
    const id = document.getElementById('priceSetId').value;
    if (!id) return;
    if (!confirm('ต้องการลบชุดราคานี้ใช่ไหม')) return;
    const response = await AppApi.post({ action: 'deletePriceSet', price_set_id: id });
    if (!response || response.status !== 'ok') return alert(response?.message || 'ลบชุดราคาไม่สำเร็จ');
    localStorage.removeItem('ducky:price-admin:data');
    const refresh = await AppApi.post({ action: 'getItemPriceAdminData' });
    if (refresh && refresh.status === 'ok') {
      hydrateState(refresh);
      writeAdminCache();
    }
    closePriceSetSheet();
    resetEditor();
    alert('ลบชุดราคาเรียบร้อย');
  }

  async function loadBindingsForActiveSet() {
    if (!state.activeSet) return alert('กรุณาเลือกชุดราคาก่อน');
    const badge = document.getElementById('bindingCountBadge');
    const oldBadge = badge?.textContent || '';
    if (badge) badge.textContent = 'กำลังโหลด...';
    const response = await AppApi.post({ action: 'getPriceSetDetail', price_set_id: state.activeSet.id, include_bindings: 1 }, { timeoutMs: 15000 });
    if (!response || response.status !== 'ok') {
      if (badge) badge.textContent = oldBadge;
      return alert(response?.message || 'โหลดการผูกใช้งานไม่สำเร็จ');
    }
    state.activeSet = response.price_set;
    state.activeBindings = response.bindings || [];
    state.bindingsLoaded = true;
    upsertLocalPriceSet(response.price_set);
    if (badge) badge.textContent = `${state.activeBindings.length} รายการผูก`;
    renderAll();
    renderBindings();
  }

  async function onSaveBinding(event) {
    event.preventDefault();
    if (!state.activeSet) return alert('กรุณาเลือกชุดราคาก่อน');
    const bindingType = document.getElementById('bindingType').value;
    const target = bindingType === 'user'
      ? resolveUserByLabel(document.getElementById('bindingTargetSearch').value)
      : resolveBatchByLabel(document.getElementById('bindingTargetSearch').value);
    if (!target) return alert(`กรุณาเลือก ${bindingType === 'user' ? 'ผู้ใช้' : 'batch'} ที่ต้องการผูก`);

    const btn = document.getElementById('saveBindingBtn');
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post({
      action: 'savePriceSetBinding',
      price_set_id: state.activeSet.id,
      binding_type: bindingType,
      binding_ref_id: target.id
    });
    btn.disabled = false;
    btn.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกการผูกใช้งานไม่สำเร็จ');
    document.getElementById('bindingTargetSearch').value = '';
    await loadBindingsForActiveSet();
    writeAdminCache();
    alert('บันทึกการผูกใช้งานเรียบร้อย');
  }

  async function onBindingListClick(event) {
    const btn = event.target.closest('[data-binding-id]');
    if (!btn) return;
    if (!confirm('ต้องการยกเลิกการผูกใช้งานนี้ใช่ไหม')) return;
    const response = await AppApi.post({ action: 'removePriceSetBinding', binding_id: btn.dataset.bindingId });
    if (!response || response.status !== 'ok') return alert(response?.message || 'ยกเลิกการผูกใช้งานไม่สำเร็จ');
    await loadBindingsForActiveSet();
  }

  function renderBindings() {
    const target = document.getElementById('bindingList');
    if (!state.activeSet) {
      target.innerHTML = '<div class="empty-state">ยังไม่ได้เลือกชุดราคา</div>';
      return;
    }
    if (!state.bindingsLoaded) {
      target.innerHTML = '<div class="empty-state">กด “โหลดรายการผูก” เพื่อดึงข้อมูลล่าสุด</div>';
      return;
    }
    if (!state.activeBindings.length) {
      target.innerHTML = '<div class="empty-state">ยังไม่มีการผูกชุดราคานี้</div>';
      return;
    }
    target.innerHTML = state.activeBindings.map((binding) => `
      <div class="price-binding-card">
        <div>
          <div class="price-binding-title">${escapeHtml(binding.target_label || binding.binding_ref_id)}</div>
          <div class="muted">${escapeHtml(binding.binding_type)} • ${escapeHtml(binding.binding_ref_id)}</div>
        </div>
        <button type="button" class="secondary-btn price-binding-remove" data-binding-id="${escapeAttr(binding.id)}">ยกเลิกการผูก</button>
      </div>
    `).join('');
    document.getElementById('bindingCountBadge').textContent = `${state.activeBindings.length} รายการผูก`;
  }

  function resolveUserByLabel(label) { return state.users.find((user) => user.label === label) || null; }
  function resolveBatchByLabel(label) { return state.batches.find((batch) => batch.label === label) || null; }

  function priceSetLabel(item) {
    const parts = [item.name || ''];
    if (item.scope_type === 'user' && item.scope_ref_label) parts.push(item.scope_ref_label);
    parts.push(item.id || '');
    return parts.filter(Boolean).join(' • ');
  }

  function upsertLocalPriceSet(priceSet) {
    if (!priceSet || !priceSet.id) return;
    const index = state.priceSets.findIndex((set) => String(set.id) === String(priceSet.id));
    if (index >= 0) state.priceSets[index] = { ...state.priceSets[index], ...priceSet };
    else state.priceSets.unshift(priceSet);
  }

  function writeAdminCache() {
    writeCache('ducky:price-admin:data', {
      users: state.users,
      batches: state.batches,
      price_sets: state.priceSets
    });
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

  function readCache(key) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - Number(parsed.savedAt || 0) > CACHE_TTL_MS) return null;
      return parsed.data || null;
    } catch (_) { return null; }
  }
  function writeCache(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch (_) {}
  }
  function escapeHtml(text) { return String(text || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m])); }
  function escapeAttr(text) { return escapeHtml(String(text || '')); }

  return { bootstrap };
})();

//# sourceURL=js/modules/items-price-manage-page.js


/* ==== js/core/zoom-lock.js ==== */
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

//# sourceURL=js/core/zoom-lock.js


/* ==== js/app.js ==== */
window.addEventListener('DOMContentLoaded', async () => {
  const theme = localStorage.getItem('theme');
  if (theme === 'theme-dark') document.body.classList.add('theme-dark');

  ensureFavicon();
  addPreconnectHints();

  const rawPage = document.body?.dataset?.page || '';
  const page = normalizePageKey(rawPage);

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
  if (page === 'medicine' && window.MedicinePage) return await MedicinePage.bootstrap();
  if (page === 'feed_order_bills' && window.FeedOrderBillsPage) return await FeedOrderBillsPage.bootstrap();

  console.warn('No page bootstrap matched:', { rawPage, page });
});

function normalizePageKey(value) {
  return String(value || '').trim().replace(/-/g, '_');
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

//# sourceURL=js/app.js
