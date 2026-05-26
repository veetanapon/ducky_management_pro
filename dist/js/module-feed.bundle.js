/* Ducky bundle: module-feed
 * Generated: 2026-05-26T09:41:55.711Z
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
 * - js/modules/module-calendar-page.js
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
    'rebuildReportForBatch','saveFeedConsumptionLog','approvePreFeedConsumption','rejectPreFeedConsumption','saveBatchEvent','saveMedicalInventoryLog','deleteBatchEvent','createReportViewLink','saveFeedOrderLot','saveFeedOrderBill','createFeedOrderBill','allocateFeedOrderToBatch','allocateFeedOrderBillToBatch','saveFeedOrderAllocation','saveFeedOrderPayment','recordFeedOrderPayment','createFeedOrderPayment','saveFeedOrderClaim','recordFeedOrderClaim','createFeedOrderClaim','setFeedOrderLotVisibility','updateFeedOrderLotVisibility','hideFeedOrderLot'
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
    const metrics = ctx.measureText(safeText);
    const visualWidth = Math.abs(metrics.actualBoundingBoxLeft || 0) + Math.abs(metrics.actualBoundingBoxRight || metrics.width || 0);
    const x = centerX - visualWidth / 2 - (metrics.actualBoundingBoxLeft || 0);
    const previousAlign = ctx.textAlign;
    ctx.textAlign = 'left';
    ctx.fillText(safeText, x, y);
    ctx.textAlign = previousAlign;
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
    ctx.textAlign = 'center';
    ctx.font = 'bold 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    ctx.fillStyle = '#0f766e';
    ctx.fillText(helpers.thankYouText || 'ขอบคุณที่อุดหนุน', width / 2, thankYouY);
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


/* ==== js/modules/module-calendar-page.js ==== */
window.ModuleCalendarPage = (() => {
  const state = { batch: null, moduleType: '', month: '', permission: 'none', data: null, feedLots: [], feedLotMap: {}, feedLotById: {}, feedEditDate: '', feedEditRows: [], saleType: '', salePriceSet: null, salePriceItems: [], salePriceLoaded: false, billDraft: null, billPreviewImage: '', saleEditBillId: '', saleRangeRows: [], saleRangeTotals: null, saleRangeImage: '', preBillReviewId: '', pendingFeed: [], priceLoadPromise: null, logoUrl: 'assets/farm-logo.png' };
  const CACHE_TTL_MS = 60 * 1000;
  const EGG_TYPE_OPTIONS = [
    { key: 'qty_all', label: 'ไข่รวม' },
    { key: 'qty_big', label: 'ไข่ใหญ่/แฝด' },
    { key: 'qty_small', label: 'ไข่เล็ก' },
    { key: 'qty_cracked', label: 'ไข่บุบ' },
    { key: 'qty_broken', label: 'ไข่แตก' },
    { key: 'qty_remain', label: 'ไข่คงเหลือ' }
  ];

  async function bootstrap() {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    state.moduleType = document.body?.dataset?.module || 'feed_manage';
    state.month = monthKey(new Date());
    bindBaseEvents();
    const batchId = new URLSearchParams(location.search).get('bid');
    if (!batchId) {
      document.getElementById('moduleSubtitle').textContent = 'ไม่พบ batch id';
      return;
    }

    const cachedContext = readCache(`ducky:batch-dashboard:${batchId}`);
    const expectedPermission = pickModulePermission(cachedContext?.module_permissions || {}, state.moduleType, cachedContext?.batch?.specie || cachedContext?.batch?.specie, cachedContext?.batch?.specie);
    if (cachedContext && expectedPermission === 'none' && !cachedContext.is_owner && !cachedContext.is_admin) {
      renderNoAccess();
      return;
    }

    await load(batchId);
  }

  
function bindBaseEvents() {
    document.getElementById('backBtn')?.addEventListener('click', () => history.back());
    document.getElementById('logoutBtn')?.addEventListener('click', AppAuth.logout);
    document.getElementById('calendarPrevBtn')?.addEventListener('click', () => changeMonth(-1));
    document.getElementById('calendarNextBtn')?.addEventListener('click', () => changeMonth(1));
    document.getElementById('moduleCalendarGrid')?.addEventListener('click', onCalendarCellClick);

    document.getElementById('feedLogCloseBtn')?.addEventListener('click', closeFeedSheet);
    document.getElementById('feedLogBackdrop')?.addEventListener('click', closeFeedSheet);
    document.getElementById('feedLogCancelBtn')?.addEventListener('click', closeFeedSheet);
    document.getElementById('feedLogForm')?.addEventListener('submit', submitFeedLog);
    document.getElementById('addFeedEntryBtn')?.addEventListener('click', () => appendFeedEntryRow());
    document.getElementById('feedEntryList')?.addEventListener('click', onFeedEntryListClick);
    document.getElementById('feedEntryList')?.addEventListener('change', onFeedEntryListChange);
    document.getElementById('feedEntryList')?.addEventListener('input', onFeedEntryListInput);
    document.addEventListener('click', onPendingFeedClick);
    document.addEventListener('change', onPendingFeedChange);
    document.addEventListener('input', onPendingFeedInput);

    document.getElementById('eggDailyCloseBtn')?.addEventListener('click', closeEggDailySheet);
    document.getElementById('eggDailyBackdrop')?.addEventListener('click', closeEggDailySheet);
    document.getElementById('eggDailyCancelBtn')?.addEventListener('click', closeEggDailySheet);
    document.getElementById('eggDailyForm')?.addEventListener('submit', submitEggDailyLog);
    document.getElementById('addEggEntryBtn')?.addEventListener('click', () => appendEggEntryRow());
    document.getElementById('eggEntryList')?.addEventListener('click', onEggListClick);
    document.getElementById('eggEntryList')?.addEventListener('change', onEggListChange);

    document.getElementById('saleBillCloseBtn')?.addEventListener('click', closeSaleBillSheet);
    document.getElementById('saleBillBackdrop')?.addEventListener('click', closeSaleBillSheet);
    document.getElementById('saleBillForm')?.addEventListener('submit', onPreviewBillSubmit);
    document.getElementById('addSaleItemBtn')?.addEventListener('click', () => appendSaleItemRow());
    document.getElementById('saleTypeEggBtn')?.addEventListener('click', async () => { await loadEffectiveEggPriceSet(true); setSaleType('egg', true); });
    document.getElementById('saleTypeDuckBtn')?.addEventListener('click', () => setSaleType('duck', true));
    document.getElementById('billPreviewCloseBtn')?.addEventListener('click', closeBillPreview);
    document.getElementById('billPreviewBackdrop')?.addEventListener('click', closeBillPreview);
    document.getElementById('billBackToEditBtn')?.addEventListener('click', backToEditBill);
    document.getElementById('billDownloadBtn')?.addEventListener('click', downloadBillImage);
    document.getElementById('billConfirmBtn')?.addEventListener('click', confirmBill);
    document.getElementById('saleBillPickerCloseBtn')?.addEventListener('click', closeSaleBillPicker);
    document.getElementById('saleBillPickerBackdrop')?.addEventListener('click', closeSaleBillPicker);
    document.getElementById('saleBillPickerList')?.addEventListener('click', onSaleBillPickerClick);
    document.getElementById('saleRangeSearchBtn')?.addEventListener('click', searchSaleRangeSummary);
    document.getElementById('saleRangePreviewBtn')?.addEventListener('click', previewSaleRangeSummaryImage);
    document.getElementById('saleRangeSummaryList')?.addEventListener('click', onSaleRangeListClick);
    document.getElementById('saleRangePreviewCloseBtn')?.addEventListener('click', closeSaleRangePreview);
    document.getElementById('saleRangePreviewBackdrop')?.addEventListener('click', closeSaleRangePreview);
    document.getElementById('saleRangeBackBtn')?.addEventListener('click', closeSaleRangePreview);
    document.getElementById('saleRangeDownloadBtn')?.addEventListener('click', downloadSaleRangeSummaryImage);
    ensureSaleDiscountField();
    normalizeSaleLayout();
  }

  async function load(batchId) {
    const cacheKey = `ducky:module:${state.moduleType}:${batchId}:${state.month}`;
    const cached = readCache(cacheKey, { allowStale: true });
    const cachedData = cached?.data || null;

    if (cachedData) {
      renderAll(cachedData);
      setSyncHint(cached.isStale ? 'กำลังซิงก์ข้อมูลล่าสุด...' : 'กำลังตรวจสอบข้อมูลล่าสุด...');
    } else {
      setSyncHint('กำลังโหลดข้อมูล...');
    }

    const response = await AppApi.post({ action: 'getModuleCalendarData', batch_id: batchId, module_type: state.moduleType, month: state.month });
    if (!response || response.status !== 'ok') {
      if (!cachedData) {
        document.getElementById('moduleSubtitle').textContent = response?.message || 'โหลดข้อมูลไม่สำเร็จ';
      } else {
        setSyncHint('แสดงข้อมูลจากเครื่องอยู่ ยังซิงก์ล่าสุดไม่ได้');
      }
      return;
    }
    writeCache(cacheKey, response);
    renderAll(response);
  }

  function renderAll(response) {
    state.batch = response.batch;
    state.permission = response.permission || 'none';
    state.data = response;
    setFeedLots(response.feed_lots);
    state.pendingFeed = Array.isArray(response.pending_feed_consumptions) ? response.pending_feed_consumptions : [];

    if (state.permission === 'none') {
      renderNoAccess();
      return;
    }

    renderHeader();
    renderSummary();
    renderPendingFeedPanel();
    renderCalendar();
    initSaleRangeSummaryDefaults();
    // renderRecentLogs();
    renderFab();
    if (state.moduleType === 'sale_manage' && String(state.batch?.specie || '').toLowerCase() === 'duck') warmSalePriceCache();
    if (window.NavDrawer) {
      NavDrawer.setBatchContext({
        id: state.batch.id,
        specie: state.batch.specie,
        permission: response.batch_permission || response.permission,
        isOwner: !!response.is_owner,
        isAdmin: !!response.is_admin,
        module_permissions: response.module_permissions || {}
      });
    }
  }

  async function changeMonth(offset) {
    const [year, month] = state.month.split('-').map(Number);
    const next = new Date(year, month - 1 + offset, 1);
    state.month = monthKey(next);
    await load(state.batch.id);
  }

  function renderHeader() {
    const labels = {
      feed_manage: ['จัดการอาหาร', ''],
      egg_daily: ['บันทึกจำนวนไข่รายวัน', ''],
      sale_manage: ['ขายออก / บิล', ''],
      report: ['รายงาน', '']
      // feed_manage: ['จัดการอาหาร', 'สรุปคลังอาหารและวันที่มีการบันทึกของ batch นี้'],
      // egg_daily: ['บันทึกจำนวนไข่รายวัน', 'สรุปการบันทึกไข่และวันที่ยังไม่ได้กรอก'],
      // sale_manage: ['ขายออก / บิล', 'สรุปการขายและเอกสารของ batch นี้'],
      // report: ['รายงาน', 'สรุปภาพรวมสำหรับใช้ทำรายงาน']
    };
    const [title, subtitle] = labels[state.moduleType] || ['โมดูล', 'กำลังโหลดข้อมูล'];
    document.getElementById('moduleTitle').textContent = title;
    document.getElementById('moduleSubtitle').textContent = `• ${state.batch.name}  ${subtitle}`;
    document.getElementById('modulePermissionBadge').className = `badge-inline ${badgeClass(state.permission)}`;
    document.getElementById('modulePermissionBadge').textContent = permissionLabel(state.permission);
    document.getElementById('moduleHint').textContent = state.data.hint || subtitle;
    document.getElementById('calendarMonthLabel').textContent = formatThaiMonth(state.month);
    document.getElementById('calendarTitle').textContent = `ปฏิทิน ${formatThaiMonth(state.month)}`;
  }

  function renderSummary() {
    let cards = state.data.summary_cards || [];
    const container = document.getElementById('moduleSummaryCards');

    if (state.moduleType === 'feed_manage') {
      container.className = 'module-summary-grid module-summary-grid--3';
      cards = cards.slice(0, 3);
    } else if (state.moduleType === 'egg_daily') {
      container.className = 'module-summary-grid module-summary-grid--3';
      cards = cards.slice(0, 3);
    } else if (state.moduleType === 'sale_manage') {
      container.className = 'module-summary-grid module-summary-grid--2';
      cards = cards.slice(0, 2);
    } else {
      container.className = 'module-summary-grid';
    }

    container.innerHTML = cards.map((card) => `
      <div class="module-summary-card">
        <span class="module-summary-label">${escapeHtml(card.label)}</span>
        <strong class="module-summary-value">${escapeHtml(card.value)}</strong>
        <span class="muted">${escapeHtml(card.note || '')}</span>
      </div>
    `).join('');
  }

  

  function ensurePendingFeedPanel() {
    let panel = document.getElementById('pendingFeedPanel');
    const summary = document.getElementById('moduleSummaryCards');
    if (!summary || state.moduleType !== 'feed_manage') {
      if (panel) panel.remove();
      return null;
    }
    if (!panel) {
      panel = document.createElement('section');
      panel.id = 'pendingFeedPanel';
      panel.className = 'card-panel pre-feed-panel hidden';
      summary.insertAdjacentElement('afterend', panel);
    }
    return panel;
  }

  function renderPendingFeedPanel() {
    const panel = ensurePendingFeedPanel();
    if (!panel) return;
    const rows = Array.isArray(state.pendingFeed) ? state.pendingFeed : [];
    panel.classList.toggle('hidden', !rows.length);
    if (!rows.length) {
      panel.innerHTML = '';
      return;
    }
    const options = renderFeedLotSelectOptions('');
    panel.innerHTML = `
      <div class="pre-feed-warning-head">
        <div class="pre-feed-warning-icon">!</div>
        <div class="pre-feed-warning-title">
          <h3>อาหารจาก LIFF รอผูก lot (${rows.length})</h3>
          <p>ยังไม่หักสต็อกและยังไม่คิดต้นทุน จนกว่าจะตรวจสอบและเลือก lot อาหาร</p>
        </div>
        <button type="button" class="pre-feed-toggle" data-pre-feed-action="toggle">show more</button>
      </div>
      <div class="pre-feed-list hidden" id="pendingFeedList">
        ${rows.map((item) => {
          const feedOut = Number(item.feed_out_qty || 0);
          const leftover = Number(item.leftover_qty || 0);
          const consumed = Math.max(0, feedOut - leftover);
          return `
          <article class="pre-feed-card" data-pre-feed-id="${escapeAttr(item.id || item.pre_feed_id || '')}">
            <div class="pre-feed-card__main">
              <div class="pre-feed-card__title">
                <span>วันที่ ${escapeHtml(item.log_date || '-')}</span>
                <b>ยังไม่ได้ผูกกับชุดอาหาร</b>
              </div>
              <div class="pre-feed-edit-grid">
                <label class="pre-feed-edit-field">
                  <div class="pre-feed-input-shell">
                    <span class="pre-feed-input-prefix">เท</span>
                    <input class="pre-feed-input" data-pre-feed-field="feed_out_qty" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeAttr(feedOut)}" />
                    <span class="pre-feed-input-unit">ลูก</span>
                  </div>
                </label>
                <label class="pre-feed-edit-field">
                  <div class="pre-feed-input-shell">
                    <span class="pre-feed-input-prefix">เหลือ</span>
                    <input class="pre-feed-input" data-pre-feed-field="leftover_qty" type="number" min="0" step="0.01" inputmode="decimal" value="${escapeAttr(leftover)}" />
                    <span class="pre-feed-input-unit">ลูก</span>
                  </div>
                </label>
                <div class="pre-feed-consumed-box" aria-hidden="true">
                  <span>กินจริง</span>
                  <b data-pre-feed-consumed>${escapeHtml(formatCompactNumber(consumed))} ลูก</b>
                </div>
              </div>
              <input class="pre-feed-remark-input" data-pre-feed-field="feed_remark" type="text" value="${escapeAttr(item.remark || item.feed_remark || '')}" placeholder="หมายเหตุอาหารจาก LIFF" />
              ${item.line_display_name ? `<p class="muted">ผู้กรอก: ${escapeHtml(item.line_display_name)}</p>` : ''}
            </div>
            <div class="pre-feed-actions">
              <select class="pre-feed-lot-select" aria-label="เลือก lot อาหาร">${options}</select>
              <button type="button" class="secondary-btn pre-feed-approve" data-pre-feed-action="approve">ผูกกับ lot</button>
              <button type="button" class="secondary-btn pre-feed-reject" data-pre-feed-action="reject">ปฏิเสธ</button>
            </div>
          </article>`;
        }).join('')}
      </div>
    `;
  }

  function onPendingFeedChange(event) {
    if (!event.target.classList?.contains('pre-feed-lot-select')) return;
    const card = event.target.closest('.pre-feed-card');
    if (!card) return;
    const lot = state.feedLotById[String(event.target.value || '')] || null;
    card.classList.toggle('has-selected-lot', !!lot);
  }

  function onPendingFeedInput(event) {
    const input = event.target.closest('[data-pre-feed-field]');
    if (!input || state.moduleType !== 'feed_manage') return;
    const card = input.closest('.pre-feed-card');
    if (!card) return;
    const out = Number(card.querySelector('[data-pre-feed-field="feed_out_qty"]')?.value || 0);
    const leftover = Number(card.querySelector('[data-pre-feed-field="leftover_qty"]')?.value || 0);
    const consumed = Math.max(0, out - leftover);
    const target = card.querySelector('[data-pre-feed-consumed]');
    if (target) target.textContent = `${formatCompactNumber(consumed)} ลูก`;
  }

  function getPendingFeedEditedPayload(card) {
    const feedOut = Number(card.querySelector('[data-pre-feed-field="feed_out_qty"]')?.value || 0);
    const leftover = Number(card.querySelector('[data-pre-feed-field="leftover_qty"]')?.value || 0);
    const remark = card.querySelector('[data-pre-feed-field="feed_remark"]')?.value?.trim() || '';
    return { feed_out_qty: feedOut, leftover_qty: leftover, feed_remark: remark };
  }

  async function onPendingFeedClick(event) {
    const actionBtn = event.target.closest('[data-pre-feed-action]');
    if (!actionBtn || state.moduleType !== 'feed_manage') return;
    if (actionBtn.dataset.preFeedAction === 'toggle') {
      const panel = actionBtn.closest('.pre-feed-panel');
      const list = panel?.querySelector('#pendingFeedList');
      const willShow = list?.classList.contains('hidden');
      list?.classList.toggle('hidden', !willShow);
      actionBtn.textContent = willShow ? 'show less' : 'show more';
      panel?.classList.toggle('is-expanded', !!willShow);
      return;
    }
    const card = actionBtn.closest('.pre-feed-card');
    if (!card || !state.batch) return;
    const preFeedId = card.dataset.preFeedId || '';
    if (!preFeedId) return;
    const action = actionBtn.dataset.preFeedAction;
    if (action === 'approve') {
      const select = card.querySelector('.pre-feed-lot-select');
      const feedId = select?.value || '';
      if (!feedId) return alert('กรุณาเลือก lot อาหารก่อนผูกข้อมูล');
      const lot = state.feedLotById[String(feedId)] || null;
      if (!lot) return alert('ไม่พบ lot อาหารที่เลือก');
      const edited = getPendingFeedEditedPayload(card);
      if (!(edited.feed_out_qty > 0)) return alert('จำนวนที่เทต้องมากกว่า 0');
      if (edited.leftover_qty > edited.feed_out_qty) return alert('จำนวนเหลือต้องไม่มากกว่าจำนวนที่เท');
      const consumed = Math.max(0, edited.feed_out_qty - edited.leftover_qty);
      const ok = confirm(`ผูกข้อมูลอาหารนี้กับ lot "${lot.name || feedId}" ใช่หรือไม่?\nเท ${formatCompactNumber(edited.feed_out_qty)} ลูก เหลือ ${formatCompactNumber(edited.leftover_qty)} ลูก กินจริง ${formatCompactNumber(consumed)} ลูก`);
      if (!ok) return;
      await submitPendingFeedAction(actionBtn, { action: 'approvePreFeedConsumption', batch_id: state.batch.id, pre_feed_id: preFeedId, feed_id: feedId, ...edited });
      return;
    }
    if (action === 'reject') {
      const reason = prompt('เหตุผลที่ปฏิเสธข้อมูลอาหารนี้ (ไม่บังคับ)', '') || '';
      const ok = confirm('ยืนยันปฏิเสธข้อมูลอาหารจาก LIFF รายการนี้?');
      if (!ok) return;
      await submitPendingFeedAction(actionBtn, { action: 'rejectPreFeedConsumption', batch_id: state.batch.id, pre_feed_id: preFeedId, reject_reason: reason });
    }
  }

  async function submitPendingFeedAction(button, payload) {
    const old = button.textContent;
    button.disabled = true;
    button.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post(payload, { timeoutMs: 30000 });
    button.disabled = false;
    button.textContent = old;
    if (!response || response.status !== 'ok') return alert(response?.message || 'จัดการข้อมูลอาหารไม่สำเร็จ');
    clearModuleCaches(state.batch.id, ['feed_manage']);
    await load(state.batch.id);
  }

function renderCalendar() {
    const calendarPanel = document.querySelector('.module-calendar-panel');
    if (calendarPanel) calendarPanel.classList.toggle('hidden', state.moduleType === 'report');
    if (state.moduleType === 'report') return;

    const grid = document.getElementById('moduleCalendarGrid');
    const month = state.month;
    const map = state.data.calendar_map || {};
    const [year, monthNum] = month.split('-').map(Number);
    const firstDay = new Date(year, monthNum - 1, 1);
    const lastDay = new Date(year, monthNum, 0).getDate();
    const startWeekday = firstDay.getDay();
    const cells = [];
    for (let i = 0; i < startWeekday; i += 1) cells.push('<div class="module-day module-day--empty"></div>');
    for (let day = 1; day <= lastDay; day += 1) {
      const key = `${month}-${String(day).padStart(2, '0')}`;
      const item = map[key] || null;
      const canQuickEdit = !!item && ['egg_daily', 'feed_manage', 'sale_manage'].includes(state.moduleType) && state.permission === 'write';
      const cls = item ? 'module-day module-day--filled' : 'module-day module-day--missing';
      const meta = item ? `${escapeHtml(item.meta || '')}` : 'ยังไม่บันทึก';
      const plusLine = item?.plus_text ? `<div class="module-day-total module-day-total--plus">${escapeHtml(item.plus_text)}</div>` : '';
      const minusLine = item?.minus_text ? `<div class="module-day-total module-day-total--minus">${escapeHtml(item.minus_text)}</div>` : '';
      const iconLine = renderCalendarIconLine(item);
      const plainLine = (!item?.plus_text && !item?.minus_text && !item?.icon && !item?.icon_top && !item?.icon_bottom)
        ? `<div class="module-day-total">${escapeHtml(item?.value || '-')}</div>`
        : '';
      cells.push(`<div class="${cls}${canQuickEdit ? ' module-day--clickable' : ''}" title="${meta}" ${canQuickEdit ? `data-log-date="${key}"` : ''}><div class="module-day-number">${day}</div>${plusLine}${minusLine}${iconLine}${plainLine}</div>`);
    }
    grid.innerHTML = cells.join('');
  }


  function renderCalendarIconLine(item) {
    if (!item) return '';
    if (item.icon_top || item.icon_bottom) {
      return `<div class="module-day-icons"><div class="module-day-icon-line module-day-icon-line--top">${escapeHtml(item.icon_top || '')}</div><div class="module-day-icon-line module-day-icon-line--bottom">${escapeHtml(item.icon_bottom || '')}</div></div>`;
    }
    if (item.icon) return `<div class="module-day-total module-day-total--icon">${escapeHtml(item.icon)}</div>`;
    return '';
  }

  function renderRecentLogs() {
    const list = document.getElementById('recentLogList');
    const badge = document.getElementById('recentCountBadge');
    const rows = state.data.recent_logs || [];
    badge.textContent = `${rows.length} รายการ`;
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">ยังไม่มีรายการในช่วงที่เลือก</div>';
      return;
    }
    list.innerHTML = rows.map((row) => `
      <div class="log-item">
        <div class="log-item__head"><strong>${escapeHtml(row.title || '-')}</strong><span>${escapeHtml(row.log_date || '-')}</span></div>
        <div class="log-item__body">${(row.lines || []).map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>
      </div>
    `).join('');
  }

  function renderFab() {
    const root = document.getElementById('moduleFabRoot');
    if (!root) return;
    if (state.permission !== 'write' || state.moduleType === 'report') {
      root.innerHTML = '';
      return;
    }
    let actions;
    if (state.moduleType === 'feed_manage') {
      actions = [{ label: 'รับเข้า', code: 'feed-in' }, { label: 'ตัดจ่าย', code: 'feed-out' }];
    } else if (state.moduleType === 'sale_manage') {
      actions = [{ label: 'ขายออก', code: 'sale-create' }];
    } else {
      actions = [{ label: 'บันทึกวันนี้', code: 'egg-add' }, { label: 'แก้ไขล่าสุด', code: 'egg-edit' }];
    }
    root.innerHTML = `
      <div class="module-fab" id="moduleFab">
        <div class="module-fab-actions">${actions.map((item) => `<button type="button" class="module-fab-action" data-module-action="${item.code}">${item.label}</button>`).join('')}</div>
        <button type="button" class="fab module-fab-main" id="moduleFabToggle">＋</button>
      </div>
    `;
    document.getElementById('moduleFabToggle')?.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleFab();
    });
    root.querySelectorAll('[data-module-action]').forEach((button) => {
      button.addEventListener('click', async () => {
        const code = button.dataset.moduleAction;
        document.getElementById('moduleFab')?.classList.remove('open');
        if (code === 'sale-create') return openSaleBillSheet();
        if (code === 'feed-in') return openFeedSheet('in');
        if (code === 'feed-out') return openFeedSheet('out');
        if (code === 'egg-add') return openEggDailySheet();
        if (code === 'egg-edit') return editLatestEggDaily();
      });
    });
    document.addEventListener('click', onOutsideFabClick, { capture: true });
  }

  function onOutsideFabClick(event) {
    const root = document.getElementById('moduleFab');
    if (root && !root.contains(event.target)) root.classList.remove('open');
  }
  function toggleFab() { document.getElementById('moduleFab')?.classList.toggle('open'); }

  
function openFeedSheet(mode) {
    const sheet = document.getElementById('feedLogSheet');
    if (!sheet) return;
    document.getElementById('feedEditMode').value = 'create';
    document.getElementById('feedEditDate').value = '';
    document.getElementById('feedTransType').value = mode;
    document.getElementById('feedLogTitle').textContent = mode === 'in' ? 'รับเข้าอาหาร' : 'ตัดจ่ายอาหาร';
    document.getElementById('feedLogDate').value = todayString();
    document.getElementById('feedRemark').value = '';
    document.getElementById('feedFormHint').textContent = mode === 'in'
      ? 'เพิ่มอาหารเข้าได้หลาย lot ในครั้งเดียว'
      : 'ตัดจ่ายได้หลาย lot ในครั้งเดียว และเลือกจาก lot ที่มีอยู่';
    const list = document.getElementById('feedEntryList');
    list.innerHTML = '';
    appendFeedEntryRow({ trans_type: mode });
    refreshFeedLotDatalist();
    showSheet(sheet);
  }

  function openFeedSheetForEdit(payload) {
    const sheet = document.getElementById('feedLogSheet');
    if (!sheet) return;
    document.getElementById('feedEditMode').value = 'replace_day';
    document.getElementById('feedEditDate').value = payload.log_date || '';
    document.getElementById('feedTransType').value = 'mixed';
    document.getElementById('feedLogTitle').textContent = `แก้ไขรายการอาหาร ${payload.log_date || ''}`;
    document.getElementById('feedLogDate').value = payload.log_date || todayString();
    document.getElementById('feedRemark').value = payload.remark || '';
    document.getElementById('feedFormHint').textContent = 'แก้ไขรายการทั้งหมดของวันนั้น แล้วระบบจะบันทึกทับรายการเดิมทั้งวัน';
    const list = document.getElementById('feedEntryList');
    list.innerHTML = '';
    const rows = Array.isArray(payload.records) ? payload.records : [];
    if (rows.length) {
      rows.forEach((row) => appendFeedEntryRow(row));
    } else {
      appendFeedEntryRow({ trans_type: 'out' });
    }
    refreshFeedLotDatalist();
    showSheet(sheet);
  }

  function closeFeedSheet() {
    hideSheet(document.getElementById('feedLogSheet'));
  }

  function setFeedLots(lots) {
    state.feedLots = Array.isArray(lots) ? lots : [];
    state.feedLotMap = Object.fromEntries(state.feedLots.map((lot) => [lot.label, lot]));
    state.feedLotById = Object.fromEntries(state.feedLots.map((lot) => [String(lot.id || ''), lot]));
  }

  function feedLotOptionLabel(lot) {
    const name = lot?.name || lot?.label || lot?.id || '-';
    const remain = formatCompactNumber(lot?.current_qty || 0);
    const price = formatCompactNumber(lot?.unit_price || 0);
    const date = lot?.start_date ? ` • เข้า ${lot.start_date}` : '';
    return `${name}${date} • เหลือ ${remain} ลูก • ${price} บาท/ลูก`;
  }

  function renderFeedLotSelectOptions(selectedId = '') {
    const selected = String(selectedId || '');
    const options = ['<option value="">เลือก lot อาหารที่มีอยู่</option>'];
    state.feedLots.forEach((lot) => {
      const id = String(lot.id || '');
      const remain = Number(lot.current_qty || 0);
      const isSelected = id && id === selected;
      const disabled = !isSelected && !(remain > 0) ? ' disabled' : '';
      options.push(`<option value="${escapeAttr(id)}" ${isSelected ? 'selected' : ''}${disabled}>${escapeHtml(feedLotOptionLabel(lot))}</option>`);
    });
    return options.join('');
  }

  function refreshFeedLotDatalist() {
    const datalist = document.getElementById('feedLotOptions');
    if (!datalist) return;
    datalist.innerHTML = state.feedLots.map((lot) => `<option value="${escapeAttr(lot.label)}"></option>`).join('');
  }

  function appendFeedEntryRow(entry = {}) {
    const list = document.getElementById('feedEntryList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'feed-entry-row';
    row.innerHTML = `
      <div class="feed-entry-head">
        <span class="feed-entry-badge">รายการ lot อาหาร</span>
        <button type="button" class="secondary-btn entry-remove-btn entry-remove-btn--feed" data-feed-action="remove">ลบ lot นี้</button>
      </div>
      <div class="feed-entry-grid">
        <div>
          <label class="field-label">ประเภท</label>
          <select class="feed-entry-type">
            <option value="in" ${String(entry.trans_type || 'out') === 'in' ? 'selected' : ''}>รับเข้า</option>
            <option value="out" ${String(entry.trans_type || 'out') === 'out' ? 'selected' : ''}>ตัดจ่าย</option>
          </select>
        </div>
        <div>
          <label class="field-label">จำนวน</label>
          <input class="feed-entry-qty" type="number" min="0.01" step="0.01" placeholder="จำนวน" value="${entry.qty != null ? escapeAttr(entry.qty) : ''}" />
        </div>
      </div>
      <div>
        <label class="field-label feed-entry-name-label">ชื่ออาหาร / lot</label>
        <input class="feed-entry-name" type="text" list="feedLotOptions" placeholder="พิมพ์ชื่ออาหาร / lot ใหม่" value="${escapeAttr(entry.feed_label || entry.feed_name || '')}" />
        <select class="feed-entry-lot-select hidden">
          ${renderFeedLotSelectOptions(entry.feed_id || '')}
        </select>
        <input class="feed-entry-feed-id" type="hidden" value="${escapeAttr(entry.feed_id || '')}" />
        <div class="feed-entry-lot-info muted"></div>
      </div>
      <div class="feed-entry-grid feed-entry-grid--unit">
        <div>
          <label class="field-label">ราคาต่อหน่วย</label>
          <input class="feed-entry-unit-price" type="number" min="0" step="0.01" placeholder="ราคาต่อหน่วย" value="${entry.unit_price != null ? escapeAttr(entry.unit_price) : ''}" />
        </div>
      </div>
      <div class="feed-entry-consume-grid">
        <div>
          <label class="field-label">เหลือ</label>
          <input class="feed-entry-leftover" type="number" min="0" step="0.01" placeholder="เหลือ (ลูก)" value="${entry.leftover_qty != null ? escapeAttr(entry.leftover_qty) : ''}" />
        </div>
        <div>
          <label class="field-label">เสีย/หก</label>
          <input class="feed-entry-waste" type="number" min="0" step="0.01" placeholder="เสีย/หก (ลูก)" value="${entry.waste_qty != null ? escapeAttr(entry.waste_qty) : ''}" />
        </div>
        <div class="feed-consumed-note">กินจริงจะคำนวณจาก จำนวนที่ตัดจ่าย - เหลือ - เสีย</div>
      </div>
    `;
    list.appendChild(row);
    syncFeedEntryRow(row);
  }

  function onFeedEntryListClick(event) {
    const removeBtn = event.target.closest('[data-feed-action="remove"]');
    if (!removeBtn) return;
    const list = document.getElementById('feedEntryList');
    if (list.children.length <= 1) return;
    removeBtn.closest('.feed-entry-row')?.remove();
  }

  function onFeedEntryListChange(event) {
    const row = event.target.closest('.feed-entry-row');
    if (!row) return;
    if (event.target.classList.contains('feed-entry-type') || event.target.classList.contains('feed-entry-name') || event.target.classList.contains('feed-entry-lot-select')) {
      syncFeedEntryRow(row);
    }
  }

  function onFeedEntryListInput(event) {
    const row = event.target.closest('.feed-entry-row');
    if (!row) return;
    if (event.target.classList.contains('feed-entry-name')) {
      syncFeedEntryRow(row, true);
    }
  }

  function syncFeedEntryRow(row, preserveTyping = false) {
    const type = row.querySelector('.feed-entry-type')?.value || 'out';
    const nameInput = row.querySelector('.feed-entry-name');
    const lotSelect = row.querySelector('.feed-entry-lot-select');
    const feedIdInput = row.querySelector('.feed-entry-feed-id');
    const unitInput = row.querySelector('.feed-entry-unit-price');
    const info = row.querySelector('.feed-entry-lot-info');
    const consumeGrid = row.querySelector('.feed-entry-consume-grid');
    if (!nameInput || !feedIdInput || !unitInput) return;

    if (consumeGrid) consumeGrid.classList.toggle('hidden', type !== 'out');

    if (type === 'out') {
      if (lotSelect) {
        lotSelect.classList.remove('hidden');
        // Rebuild options so newly synced stock is always visible.
        const selected = lotSelect.value || feedIdInput.value || '';
        lotSelect.innerHTML = renderFeedLotSelectOptions(selected);
      }
      nameInput.classList.add('hidden');
      unitInput.readOnly = true;
      const selectedId = String(lotSelect?.value || feedIdInput.value || '');
      const matched = selectedId ? state.feedLotById[selectedId] : null;
      if (matched) {
        feedIdInput.value = matched.id || '';
        nameInput.value = matched.label || matched.name || '';
        unitInput.value = matched.unit_price || 0;
        if (info) info.textContent = `${matched.name} • วันที่เข้า ${matched.start_date || '-'} • ${formatCompactNumber(matched.unit_price || 0)} บาท/ลูก • คงเหลือ ${formatCompactNumber(matched.current_qty || 0)} ลูก`;
      } else {
        feedIdInput.value = '';
        if (!preserveTyping) unitInput.value = '';
        if (info) info.textContent = state.feedLots.length
          ? 'เลือก lot จากรายการที่มีอยู่ เพื่อใช้ตัดจ่าย'
          : 'ยังไม่มี lot อาหารคงเหลือให้เลือก กรุณารับเข้าอาหารก่อน';
      }
      return;
    }

    if (lotSelect) lotSelect.classList.add('hidden');
    nameInput.classList.remove('hidden');
    nameInput.placeholder = 'เช่น อาหารขุน A lot 2026-01';
    const matched = state.feedLotMap[nameInput.value] || null;
    if (matched) {
      feedIdInput.value = matched.id || '';
      if (!preserveTyping && !unitInput.value) unitInput.value = matched.unit_price || 0;
      if (info) info.textContent = `${matched.name} • วันที่เข้า ${matched.start_date || '-'} • ${formatCompactNumber(matched.unit_price || 0)} บาท/ลูก • คงเหลือ ${formatCompactNumber(matched.current_qty || 0)} ลูก`;
    } else {
      feedIdInput.value = '';
      if (info) info.textContent = 'พิมพ์ชื่ออาหารใหม่หรือใช้ชื่อเดิมได้';
    }
    unitInput.readOnly = false;
  }

  async function submitFeedLog(event) {
    event.preventDefault();
    if (!state.batch) return;
    const rows = [...document.querySelectorAll('.feed-entry-row')];
    if (!rows.length) return alert('กรุณาเพิ่มรายการอย่างน้อย 1 lot');
    const entries = [];
    for (const row of rows) {
      const transType = row.querySelector('.feed-entry-type')?.value || 'out';
      const label = row.querySelector('.feed-entry-name')?.value.trim() || '';
      const selectedFeedId = row.querySelector('.feed-entry-lot-select')?.value || '';
      const matched = transType === 'out'
        ? (state.feedLotById[String(selectedFeedId || row.querySelector('.feed-entry-feed-id')?.value || '')] || null)
        : (state.feedLotMap[label] || null);
      const feedId = transType === 'out' ? (matched?.id || selectedFeedId || '') : (row.querySelector('.feed-entry-feed-id')?.value || matched?.id || '');
      const feedName = transType === 'out' ? (matched?.name || '') : (matched?.name || label);
      const qty = Number(row.querySelector('.feed-entry-qty')?.value || 0);
      const unitPrice = Number(row.querySelector('.feed-entry-unit-price')?.value || matched?.unit_price || 0);
      const leftoverQty = Number(row.querySelector('.feed-entry-leftover')?.value || 0);
      const wasteQty = Number(row.querySelector('.feed-entry-waste')?.value || 0);
      if (!feedName) return alert('กรุณาระบุชื่ออาหาร / lot ทุกรายการ');
      if (!(qty > 0)) return alert('จำนวนอาหารต้องมากกว่า 0');
      if (transType === 'out' && !feedId) return alert('รายการตัดจ่ายต้องเลือก lot ที่มีอยู่จากรายการ');
      if (transType === 'out' && leftoverQty + wasteQty > qty) return alert('จำนวนเหลือ + เสีย ต้องไม่มากกว่าจำนวนที่ตัดจ่าย');
      entries.push({ trans_type: transType, feed_id: feedId, feed_name: feedName, qty, unit_price: unitPrice, leftover_qty: leftoverQty, waste_qty: wasteQty });
    }
    const payload = {
      action: 'saveFeedLog',
      batch_id: state.batch.id,
      log_date: document.getElementById('feedLogDate').value,
      remark: document.getElementById('feedRemark').value.trim(),
      mode: document.getElementById('feedEditMode').value,
      entries
    };
    const submit = document.getElementById('feedLogSubmitBtn');
    const original = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post(payload);
    submit.disabled = false;
    submit.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกข้อมูลอาหารไม่สำเร็จ');
    closeFeedSheet();
    clearModuleCaches(state.batch.id, ['feed_manage']);
    state.month = String(payload.log_date || state.month).slice(0, 7);
    await load(state.batch.id);
  }

  async function onCalendarCellClick(event) {
    const cell = event.target.closest('.module-day[data-log-date]');
    if (!cell || state.permission !== 'write') return;
    const logDate = cell.dataset.logDate;
    if (!logDate) return;
    if (state.moduleType === 'egg_daily') {
      const ok = confirm(`ต้องการแก้ไขข้อมูลไข่ประจำวันที่ ${logDate} ใช่หรือไม่`);
      if (!ok) return;
      const response = await AppApi.post({ action: 'getEggDailyRecord', batch_id: state.batch.id, log_date: logDate });
      if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดข้อมูลไม่สำเร็จ');
      if (!response.record) return alert('ไม่พบข้อมูลของวันที่เลือก');
      openEggDailySheet(response.record);
      return;
    }
    if (state.moduleType === 'feed_manage') {
      const ok = confirm(`ต้องการแก้ไขรายการอาหารประจำวันที่ ${logDate} ใช่หรือไม่`);
      if (!ok) return;
      const response = await AppApi.post({ action: 'getFeedLogRecord', batch_id: state.batch.id, log_date: logDate });
      if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดข้อมูลอาหารไม่สำเร็จ');
      if (Array.isArray(response.feed_lots)) setFeedLots(response.feed_lots);
      openFeedSheetForEdit(response);
      return;
    }
    if (state.moduleType === 'sale_manage') {
      const ok = confirm(`ต้องการแก้ไขบิลประจำวันที่ ${logDate} ใช่หรือไม่`);
      if (!ok) return;
      const response = await AppApi.post({ action: 'getSaleBillsForDate', batch_id: state.batch.id, log_date: logDate });
      if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดรายการบิลไม่สำเร็จ');
      const bills = Array.isArray(response.bills) ? response.bills : [];
      const prebills = Array.isArray(response.prebills) ? response.prebills : [];
      if (!bills.length && !prebills.length) return alert('ไม่พบบิลหรือ PreBill ของวันที่เลือก');
      if (bills.length === 1 && !prebills.length) { await loadAndOpenSaleBillById(bills[0].bill_id); return; }
      if (!bills.length && prebills.length === 1) { await loadAndOpenPreBillById(prebills[0].pre_bill_id || prebills[0].id); return; }
      openSaleBillPicker(logDate, bills, prebills);
    }
  }


  function openSaleBillPicker(logDate, bills = [], prebills = []) {
    const sheet = document.getElementById('saleBillPickerSheet');
    const hint = document.getElementById('saleBillPickerHint');
    const list = document.getElementById('saleBillPickerList');
    if (!sheet || !list) return;
    if (hint) hint.textContent = `พบ ${bills.length} บิลจริง และ ${prebills.length} PreBill รอตรวจ ในวันที่ ${logDate}`;
    const billCards = bills.map((bill) => {
      const icon = saleTypeIcon(bill.sale_type);
      const buyer = bill.buyer || bill.sale_name || 'ไม่ระบุผู้ซื้อ';
      const itemText = (bill.items || []).slice(0, 2).map((item) => {
        const name = item.display_name || item.item_name || item.sale_item || '-';
        const qty = item.sale_qty != null ? item.sale_qty : item.qty;
        const unit = item.sale_unit || item.unit || '';
        return `${name} ${formatNumber(qty)} ${saleUnitLabel(unit)}`;
      }).join(' • ');
      const more = (bill.items || []).length > 2 ? ` +${(bill.items || []).length - 2} รายการ` : '';
      return `
        <button type="button" class="sale-bill-picker-card" data-bill-id="${escapeAttr(bill.bill_id)}">
          <div class="sale-bill-picker-icon">${escapeHtml(icon)}</div>
          <div class="sale-bill-picker-main">
            <div class="sale-bill-picker-head">
              <strong>${escapeHtml(formatThaiDate(bill.log_date))}</strong>
              <span>${escapeHtml(saleTypeLabel(bill.sale_type))}</span>
            </div>
            <div class="sale-bill-picker-buyer">${escapeHtml(buyer)}</div>
            <div class="sale-bill-picker-items">${escapeHtml(itemText || 'ไม่มีรายละเอียดรายการ')}${escapeHtml(more)}</div>
          </div>
          <div class="sale-bill-picker-side">
            <span>${escapeHtml(bill.bill_id || '-')}</span>
            <strong>${escapeHtml(formatMoney(bill.grand_total || 0))} ฿</strong>
          </div>
        </button>`;
    });
    const preBillCards = prebills.map((bill) => `
        <button type="button" class="sale-bill-picker-card sale-bill-picker-card--prebill" data-prebill-id="${escapeAttr(bill.pre_bill_id || bill.id)}">
          <div class="sale-bill-picker-icon">🧾</div>
          <div class="sale-bill-picker-main"><div class="sale-bill-picker-head"><strong>${escapeHtml(formatThaiDate(bill.log_date))}</strong><span>PreBill รอตรวจ</span></div><div class="sale-bill-picker-buyer">${escapeHtml(bill.buyer || bill.sale_name || bill.line_display_name || 'ไม่ระบุผู้ซื้อ')}</div><div class="sale-bill-picker-items">${escapeHtml(bill.raw_message || 'แตะเพื่อตรวจ PreBill')}</div></div>
          <div class="sale-bill-picker-side"><span>${escapeHtml(bill.pre_bill_id || bill.id || '-')}</span><strong>${escapeHtml(formatMoney(bill.grand_total || 0))} ฿</strong></div>
        </button>`);
    list.innerHTML = [...preBillCards, ...billCards].join('');
    showSheet(sheet);
  }

  function closeSaleBillPicker() { hideSheet(document.getElementById('saleBillPickerSheet')); }

  async function onSaleBillPickerClick(event) {
    const preBillCard = event.target.closest('[data-prebill-id]');
    if (preBillCard) { closeSaleBillPicker(); await loadAndOpenPreBillById(preBillCard.dataset.prebillId); return; }
    const card = event.target.closest('[data-bill-id]');
    if (!card) return;
    const billId = card.dataset.billId;
    closeSaleBillPicker();
    await loadAndOpenSaleBillById(billId);
  }

  async function loadAndOpenSaleBillById(billId) {
    if (!billId) return alert('ไม่พบรหัสบิล');
    const response = await AppApi.post({ action: 'getSaleBillRecord', batch_id: state.batch.id, bill_id: billId });
    if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดบิลไม่สำเร็จ');
    await openSaleBillSheetForEdit(response.bill, response.items || []);
  }


  async function loadAndOpenPreBillById(preBillId) {
    if (!preBillId) return alert('ไม่พบรหัส PreBill');
    const response = await AppApi.post({ action: 'getPreBillRecord', batch_id: state.batch.id, pre_bill_id: preBillId });
    if (!response || response.status !== 'ok') return alert(response?.message || 'โหลด PreBill ไม่สำเร็จ');
    await openSaleBillSheetForPreBill(response.bill, response.items || []);
  }

  async function openSaleBillSheetForPreBill(bill, items) {
    state.preBillReviewId = bill.pre_bill_id || bill.id || ''; state.saleEditBillId = '';
    document.getElementById('saleBillDate').value = bill.log_date || todayString();
    document.getElementById('saleBuyerName').value = bill.buyer || bill.sale_name || '';
    document.getElementById('saleBillRemark').value = bill.raw_message ? `PreBill: ${bill.raw_message}` : '';
    if (document.getElementById('saleDiscount')) document.getElementById('saleDiscount').value = Number(bill.discount || 0);
    document.getElementById('saleItemsList').innerHTML = '';
    document.getElementById('saleTypeWrap')?.classList.toggle('hidden', false);
    await loadEffectiveEggPriceSet(false);
    ensureSalePriceItemsFromBill(items || []);
    setSaleType('egg', false);
    document.getElementById('saleItemsList').innerHTML = '';
    (items || []).forEach((item) => appendSaleItemRow({ item_name: item.item_name || item.sale_item || '', unit: item.unit || item.sale_unit || '', qty: item.qty != null ? item.qty : item.sale_qty, unit_price: item.unit_price, total_qty: item.total_qty, display_name: item.display_name || item.sale_item || '' }));
    if (!document.querySelector('#saleItemsList .sale-item-card')) appendSaleItemRow();
    const note = document.getElementById('salePriceSetNote'); if (note) { note.classList.remove('hidden'); note.textContent = `กำลังตรวจ PreBill ${state.preBillReviewId} • แก้ไขได้ก่อนกดยืนยัน`; }
    normalizeSaleLayout(); showSheet(document.getElementById('saleBillSheet'));
  }

  function saleTypeIcon(type) {
    if (type === 'egg') return '🥚';
    if (type === 'fish') return '🐟';
    return '🦆';
  }

  function saleTypeLabel(type) {
    if (type === 'egg') return 'ขายไข่';
    if (type === 'fish') return 'ขายปลา';
    if (type === 'duck') return 'ขายเป็ด';
    return 'บิลขาย';
  }

  function openEggDailySheet(record = null) {
    const sheet = document.getElementById('eggDailySheet');
    if (!sheet) return;
    document.getElementById('eggDailyTitle').textContent = record ? 'แก้ไขบันทึกไข่รายวัน' : 'บันทึกจำนวนไข่รายวัน';
    document.getElementById('eggDailyDate').value = record?.log_date || todayString();
    const list = document.getElementById('eggEntryList');
    list.innerHTML = '';
    const rows = buildEggRowsFromRecord(record);
    rows.forEach((row) => appendEggEntryRow(row.key, row.value));
    if (!rows.length) appendEggEntryRow();
    syncEggTypeOptions();
    showSheet(sheet);
  }

  function closeEggDailySheet() {
    hideSheet(document.getElementById('eggDailySheet'));
  }

  async function editLatestEggDaily() {
    if (!state.batch) return;
    const response = await AppApi.post({ action: 'getEggDailyRecord', batch_id: state.batch.id, mode: 'latest' });
    if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดข้อมูลล่าสุดไม่สำเร็จ');
    if (!response.record) return alert('ยังไม่มีข้อมูลไข่รายวันให้แก้ไข');
    openEggDailySheet(response.record);
  }

  function buildEggRowsFromRecord(record) {
    if (!record) return [];
    return EGG_TYPE_OPTIONS
      .map((item) => ({ key: item.key, value: Number(record[item.key] || 0) }))
      .filter((item) => item.value > 0);
  }

  function appendEggEntryRow(typeKey = 'qty_all', qtyValue = '') {
    const list = document.getElementById('eggEntryList');
    if (!list) return;
    const row = document.createElement('div');
    row.className = 'module-entry-row';
    row.innerHTML = `
      <select class="egg-entry-type"></select>
      <input class="egg-entry-qty" type="number" min="0" step="1" placeholder="จำนวน" value="${qtyValue !== '' ? escapeAttr(qtyValue) : ''}" />
      <button type="button" class="secondary-btn entry-remove-btn" data-egg-action="remove">ลบ</button>
    `;
    list.appendChild(row);
    fillEggTypeOptions(row.querySelector('.egg-entry-type'), typeKey);
    syncEggTypeOptions();
  }

  function onEggListClick(event) {
    const button = event.target.closest('[data-egg-action="remove"]');
    if (!button) return;
    const list = document.getElementById('eggEntryList');
    if (list.children.length <= 1) return;
    button.closest('.module-entry-row')?.remove();
    syncEggTypeOptions();
  }

  function onEggListChange(event) {
    if (event.target.closest('.egg-entry-type')) syncEggTypeOptions();
  }

  function fillEggTypeOptions(select, selectedValue) {
    if (!select) return;
    select.innerHTML = EGG_TYPE_OPTIONS.map((item) => `
      <option value="${item.key}" ${item.key === selectedValue ? 'selected' : ''}>${item.label}</option>
    `).join('');
  }

  function syncEggTypeOptions() {
    const selects = [...document.querySelectorAll('.egg-entry-type')];
    const picked = selects.map((select) => select.value).filter(Boolean);
    selects.forEach((select) => {
      const own = select.value;
      [...select.options].forEach((option) => {
        option.disabled = option.value !== own && picked.includes(option.value);
      });
    });
  }

  async function submitEggDailyLog(event) {
    event.preventDefault();
    if (!state.batch) return;
    const rows = [...document.querySelectorAll('.module-entry-row')];
    if (!rows.length) return alert('กรุณาเพิ่มรายการอย่างน้อย 1 รายการ');
    const payload = {
      action: 'saveEggDailyLog',
      batch_id: state.batch.id,
      log_date: document.getElementById('eggDailyDate').value,
      qty_all: 0,
      qty_big: 0,
      qty_small: 0,
      qty_cracked: 0,
      qty_broken: 0,
      qty_remain: 0
    };
    const used = new Set();
    for (const row of rows) {
      const type = row.querySelector('.egg-entry-type')?.value;
      const qty = Number(row.querySelector('.egg-entry-qty')?.value || 0);
      if (!type) return alert('กรุณาเลือกชนิดไข่ทุกรายการ');
      if (used.has(type)) return alert('ชนิดไข่ซ้ำกัน กรุณาเลือกไม่ให้ซ้ำ');
      used.add(type);
      if (qty < 0) return alert('จำนวนไข่ต้องไม่ติดลบ');
      payload[type] = qty;
    }
    const submit = document.getElementById('eggDailySubmitBtn');
    const original = submit.textContent;
    submit.disabled = true;
    submit.textContent = 'กำลังบันทึก...';
    const response = await AppApi.post(payload);
    submit.disabled = false;
    submit.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกไข่รายวันไม่สำเร็จ');
    closeEggDailySheet();
    clearModuleCaches(state.batch.id, ['egg_daily']);
    state.month = String(payload.log_date || state.month).slice(0, 7);
    await load(state.batch.id);
  }


  async function openSaleBillSheet() {
    if (!state.batch) return;
    state.saleEditBillId = '';
    state.preBillReviewId = '';
    document.getElementById('saleBillDate').value = todayString();
    document.getElementById('saleBuyerName').value = '';
    document.getElementById('saleBillRemark').value = '';
    if (document.getElementById('saleDiscount')) document.getElementById('saleDiscount').value = '0';
    document.getElementById('saleItemsList').innerHTML = '';

    const isDuck = String(state.batch.specie || '').toLowerCase() === 'duck';
    const isFish = String(state.batch.specie || '').toLowerCase() === 'fish';
    const typeWrap = document.getElementById('saleTypeWrap');
    typeWrap?.classList.toggle('hidden', !isDuck);

    if (isDuck) {
      setSaleType('egg', false);
      normalizeSaleLayout();
      showSheet(document.getElementById('saleBillSheet'));
      await loadEffectiveEggPriceSet(false);
      if (!document.querySelector('#saleItemsList .sale-item-card')) appendSaleItemRow();
      return;
    } else if (isFish) {
      setSaleType('fish', false);
    } else {
      setSaleType('duck', false);
    }

    normalizeSaleLayout();
    showSheet(document.getElementById('saleBillSheet'));
  }


  async function openSaleBillSheetForEdit(bill, items) {
    if (!bill) return;
    state.saleEditBillId = bill.bill_id || '';
    document.getElementById('saleBillDate').value = bill.log_date || todayString();
    document.getElementById('saleBuyerName').value = bill.buyer || bill.sale_name || '';
    document.getElementById('saleBillRemark').value = bill.remark || '';
    if (document.getElementById('saleDiscount')) document.getElementById('saleDiscount').value = Number(bill.discount || 0);
    document.getElementById('saleItemsList').innerHTML = '';

    const isDuck = String(state.batch?.specie || '').toLowerCase() === 'duck';
    document.getElementById('saleTypeWrap')?.classList.toggle('hidden', !isDuck);
    const billType = bill.sale_type || (state.batch?.specie === 'fish' ? 'fish' : 'duck');
    if (billType === 'egg') {
      await loadEffectiveEggPriceSet(true);
      ensureSalePriceItemsFromBill(items || []);
    }
    setSaleType(billType, false);
    document.getElementById('saleItemsList').innerHTML = '';
    (items || []).forEach((item) => appendSaleItemRow({
      item_name: item.item_name || item.sale_item || '',
      unit: item.unit || item.sale_unit || '',
      qty: item.qty != null ? item.qty : item.sale_qty,
      unit_price: item.unit_price,
      total_qty: item.total_qty,
      display_name: item.display_name || item.sale_item || ''
    }));
    if (!document.querySelector('#saleItemsList .sale-item-card')) appendSaleItemRow();
    normalizeSaleLayout();
    showSheet(document.getElementById('saleBillSheet'));
  }

  function closeSaleBillSheet() { hideSheet(document.getElementById('saleBillSheet')); }
  function closeBillPreview() { hideSheet(document.getElementById('billPreviewSheet')); }
  function backToEditBill() { hideSheet(document.getElementById('billPreviewSheet')); showSheet(document.getElementById('saleBillSheet')); }

  async function loadEffectiveEggPriceSet(force = false) {
    const batchId = state.batch?.id || '';
    const cacheKey = `ducky:price:egg:${batchId}`;
    const maxAgeMs = 12 * 60 * 60 * 1000;
    const note = document.getElementById('salePriceSetNote');
    if (!force && batchId) {
      const cached = AppCache?.read?.(cacheKey, null);
      const fresh = cached?.fetchedAt && (Date.now() - Number(cached.fetchedAt) < maxAgeMs);
      if (cached?.items?.length) {
        state.salePriceLoaded = true; state.salePriceSet = cached.price_set || null; state.salePriceItems = cached.items || [];
        renderSalePriceNote(fresh ? 'cached' : 'stale');
        if (fresh) return;
      }
    }
    if (state.priceLoadPromise && !force) return state.priceLoadPromise;
    if (note) { note.classList.remove('hidden'); note.textContent = state.salePriceItems.length ? 'กำลังตรวจสอบราคาใหม่...' : 'กำลังโหลดชุดราคาไข่...'; }
    state.priceLoadPromise = (async () => {
      const response = await AppApi.post({ action: 'getEffectiveEggPriceSet', batch_id: state.batch.id });
      if (!response || response.status !== 'ok') { if (note && !state.salePriceItems.length) note.textContent = response?.message || 'โหลดชุดราคาไข่ไม่สำเร็จ'; return; }
      state.salePriceLoaded = true; state.salePriceSet = response.price_set || null; state.salePriceItems = Array.isArray(response.items) ? response.items : [];
      AppCache?.write?.(cacheKey, { price_set: state.salePriceSet, items: state.salePriceItems, fetchedAt: Date.now() });
      renderSalePriceNote('fresh');
    })().finally(() => { state.priceLoadPromise = null; });
    return state.priceLoadPromise;
  }

  function warmSalePriceCache() { if (state.batch) loadEffectiveEggPriceSet(false); }
  function renderSalePriceNote(source = '') {
    const note = document.getElementById('salePriceSetNote'); if (!note) return; note.classList.remove('hidden');
    if (state.salePriceSet && state.salePriceItems.length) {
      const suffix = source === 'cached' ? ' • จาก cache' : (source === 'stale' ? ' • แสดงจาก cache ระหว่างอัปเดต' : '');
      note.textContent = `ใช้ชุดราคาไข่: ${state.salePriceSet.name || '-'} • ${state.salePriceItems.length} รายการราคา${suffix}`;
    } else note.textContent = 'ยังไม่พบชุดราคาไข่ที่ผูกกับ batch/user นี้ กรุณาให้ admin ผูกชุดราคาก่อนขายไข่';
  }


  function ensureSalePriceItemsFromBill(items) {
    if (!Array.isArray(state.salePriceItems)) state.salePriceItems = [];
    const existing = new Set(state.salePriceItems.map((item) => String(item.item_name || '')));
    (items || []).forEach((item) => {
      const name = String(item.item_name || item.sale_item || '').trim();
      if (!name || existing.has(name)) return;
      existing.add(name);
      state.salePriceItems.push({
        item_name: name,
        display_name: item.display_name || name,
        current_price: Number(item.unit_price || 0),
        from_bill: true
      });
    });
  }

  function setSaleType(type, resetItems = true) {
    state.saleType = type;
    document.getElementById('saleTypeEggBtn')?.classList.toggle('is-active', type === 'egg');
    document.getElementById('saleTypeDuckBtn')?.classList.toggle('is-active', type === 'duck');
    const stockNote = document.getElementById('saleBillStockNote');
    const priceNote = document.getElementById('salePriceSetNote');
    if (type === 'egg') {
      // ขายไข่เป็นการเก็บ log และออกบิลเท่านั้น ไม่ผูกกับจำนวนไข่ที่เก็บได้ 
      if (stockNote) stockNote.textContent = `• ฟาร์มบนบิล: ${state.data?.farm_name || state.batch?.owner_name || '-'}`;
      priceNote?.classList.remove('hidden');
    } else if (type === 'fish') {
      // ขายปลาเป็นการเก็บ log และออกบิลเท่านั้น ไม่หักจำนวนสัตว์ใน batch เพราะขายเหมาเป็นน้ำหนักกิโล 
      if (stockNote) stockNote.textContent = `• ฟาร์มบนบิล: ${state.data?.farm_name || '-'}`;
      priceNote?.classList.add('hidden');
    } else {
      if (stockNote) stockNote.textContent = `คงเหลือปัจจุบัน ${formatCompactNumber(state.batch.current_qty || 0)} ตัว • ขายเป็ดจะหักจำนวนคงเหลือใน batch`;
      priceNote?.classList.add('hidden');
    }
    if (resetItems) {
      document.getElementById('saleItemsList').innerHTML = '';
      appendSaleItemRow();
    } else if (!document.querySelector('#saleItemsList .sale-item-card')) {
      appendSaleItemRow();
    }
  }

  function appendSaleItemRow(seed = {}) {
    const type = state.saleType || (state.batch?.specie === 'fish' ? 'fish' : 'duck');
    if (type === 'egg' && !state.salePriceItems.length) {
      alert('ยังไม่มีรายการราคาไข่สำหรับชุดนี้ กรุณาให้ admin ผูกชุดราคาก่อน');
      return;
    }
    const wrap = document.createElement('div');
    wrap.className = `sale-item-card sale-item-card--${escapeAttr(type)}`;
    if (type === 'egg') renderEggSaleRow(wrap, seed);
    else renderManualSaleRow(wrap, seed, type);
    const list = document.getElementById('saleItemsList');
    list.appendChild(wrap);
    requestAnimationFrame(() => wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
    syncSaleItemRow(wrap);
  }

  function renderEggSaleRow(wrap, seed = {}) {
    const selectedName = seed.item_name || (state.salePriceItems[0]?.item_name || '');
    const selectedPrice = seed.unit_price != null ? Number(seed.unit_price || 0) : Number((getPriceItemByName(selectedName) || state.salePriceItems[0] || {}).current_price || 0);
    const options = state.salePriceItems.map((item) => {
      const label = item.display_name || item.item_name;
      return `<option value="${escapeAttr(item.item_name)}" ${String(selectedName || '') === String(item.item_name) ? 'selected' : ''}>${escapeHtml(label)} • ${formatMoney(item.current_price)} บาท/ฟอง</option>`;
    }).join('');
    wrap.innerHTML = `
      <div class="sale-item-head">
        <span class="feed-entry-badge">รายการขายไข่</span>
        <button class="remove-line-btn" type="button">ลบรายการ</button>
      </div>
      <div class="sale-egg-grid sale-egg-grid--top">
        <div class="sale-grid-field sale-grid-field--item">
          <label class="field-label">น้ำหนัก/ชนิดไข่</label>
          <select class="sale-item-name" required>${options}</select>
        </div>
        <div class="sale-grid-field sale-grid-field--unit">
          <label class="field-label">รูปแบบ</label>
          <select class="sale-item-unit" required>
            <option value="full_set" ${seed.unit === 'full_set' ? 'selected' : ''}>เต็มตั้ง</option>
            <option value="tray" ${seed.unit === 'tray' ? 'selected' : ''}>เศษแผง</option>
            <option value="piece" ${seed.unit === 'piece' ? 'selected' : ''}>เศษฟอง</option>
          </select>
        </div>
      </div>
      <div class="sale-egg-grid sale-egg-grid--bottom">
        <div class="sale-grid-field">
          <label class="field-label">จำนวน</label>
          <input class="sale-item-qty" type="number" min="1" step="1" value="${Number(seed.qty || 1)}" required>
        </div>
        <div class="sale-grid-field">
          <label class="field-label">ราคาต่อฟอง</label>
          <input class="sale-item-price" type="number" min="0" step="0.01" value="${selectedPrice || ''}" required>
        </div>
        <div class="sale-grid-field">
          <label class="field-label">จำนวนรวม</label>
          <div class="line-total-badge sale-total-qty-badge">0</div>
        </div>
        <div class="sale-grid-field">
          <label class="field-label">เป็นเงิน</label>
          <div class="line-total-badge sale-line-total-badge">0.00 ฿</div>
        </div>
      </div>
    `;
    bindSaleRowEvents(wrap);
  }

  function renderManualSaleRow(wrap, seed = {}, type = 'duck') {
    const isFish = type === 'fish';
    wrap.innerHTML = `
      <div class="sale-item-head">
        <span class="feed-entry-badge">${isFish ? 'รายการขายปลา' : 'รายการขายเป็ด'}</span>
        <button class="remove-line-btn" type="button">ลบรายการ</button>
      </div>
      <div class="sale-manual-grid sale-manual-grid--top">
        <div class="sale-grid-field sale-grid-field--wide">
          <label class="field-label">รายการ</label>
          <input class="sale-item-name" type="text" placeholder="${isFish ? 'เช่น ปลานิล ไซส์ใหญ่' : 'เช่น ขายเป็ด'}" value="${escapeAttr(seed.item_name || (isFish ? 'ขายปลา' : 'ขายเป็ด'))}" required>
        </div>
        <div class="sale-grid-field">
          <label class="field-label">หน่วย</label>
          <input class="sale-item-unit" type="text" value="${escapeAttr(seed.unit || (isFish ? 'กก.' : 'ตัว'))}" required>
        </div>
      </div>
      <div class="sale-manual-grid sale-manual-grid--bottom">
        <div class="sale-grid-field">
          <label class="field-label">จำนวน</label>
          <input class="sale-item-qty" type="number" min="0.01" step="0.01" value="${Number(seed.qty || 1)}" required>
        </div>
        <div class="sale-grid-field">
          <label class="field-label">ราคาต่อหน่วย</label>
          <input class="sale-item-price" type="number" min="0" step="0.01" value="${Number(seed.unit_price || 0) || ''}" required>
        </div>
        <div class="sale-grid-field">
          <label class="field-label">เป็นเงิน</label>
          <div class="line-total-badge sale-line-total-badge">0.00 ฿</div>
        </div>
      </div>
    `;
    bindSaleRowEvents(wrap);
  }

  function bindSaleRowEvents(wrap) {
    wrap.querySelectorAll('input, select').forEach((input) => {
      input.addEventListener('input', () => syncSaleItemRow(wrap));
      input.addEventListener('change', () => {
        if (state.saleType === 'egg' && input.classList.contains('sale-item-name')) applyEggDefaultPrice(wrap);
        syncSaleItemRow(wrap);
      });
    });
    wrap.querySelector('.remove-line-btn')?.addEventListener('click', () => {
      if (document.querySelectorAll('#saleItemsList .sale-item-card').length <= 1) return alert('ต้องมีอย่างน้อย 1 รายการ');
      wrap.remove();
    });
  }

  function applyEggDefaultPrice(row) {
    const itemName = row.querySelector('.sale-item-name')?.value || '';
    const priceItem = getPriceItemByName(itemName);
    const priceInput = row.querySelector('.sale-item-price');
    if (priceItem && priceInput) priceInput.value = Number(priceItem.current_price || 0);
  }

  function syncSaleItemRow(row) {
    const type = state.saleType;
    const qty = Number(row.querySelector('.sale-item-qty')?.value || 0);
    let unitPrice = Number(row.querySelector('.sale-item-price')?.value || 0);
    let totalQty = qty;
    if (type === 'egg') {
      const itemName = row.querySelector('.sale-item-name')?.value || '';
      const unit = row.querySelector('.sale-item-unit')?.value || 'piece';
      totalQty = qty * saleUnitMultiplier(unit);
      const qtyBadge = row.querySelector('.sale-total-qty-badge');
      if (qtyBadge) qtyBadge.textContent = `${formatCompactNumber(totalQty)} ฟอง`;
    }
    const lineTotal = round2(totalQty * unitPrice);
    const totalBadge = row.querySelector('.sale-line-total-badge') || row.querySelector('.line-total-badge');
    if (totalBadge) totalBadge.textContent = `${formatMoney(lineTotal)} ฿`;
  }

  function getPriceItemByName(itemName) {
    return state.salePriceItems.find((item) => String(item.item_name || '') === String(itemName || '')) || null;
  }
  function saleUnitMultiplier(unit) { return unit === 'full_set' ? 300 : (unit === 'tray' ? 30 : 1); }
  function saleUnitLabel(unit) { return unit === 'full_set' ? 'ตั้ง' : (unit === 'tray' ? 'แผง' : (unit === 'piece' ? 'ฟอง' : (unit || ''))); }

  async function onPreviewBillSubmit(event) {
    event.preventDefault();
    const draft = collectBillDraft();
    if (!draft) return;
    state.billDraft = draft;
    const dataUrl = await renderBillImage(draft);
    state.billPreviewImage = dataUrl;
    document.getElementById('billPreviewImage').src = dataUrl;
    document.getElementById('billPreviewImage').classList.remove('hidden');
    document.getElementById('billPreviewMeta').textContent = `ก่อนหักส่วนลด ${formatMoney(draft.sub_total)} บาท • ส่วนลด ${formatMoney(draft.discount || 0)} บาท • สุทธิ ${formatMoney(draft.grand_total)} บาท`;
    hideSheet(document.getElementById('saleBillSheet'));
    showSheet(document.getElementById('billPreviewSheet'));
  }

  function collectBillDraft() {
    const logDate = document.getElementById('saleBillDate').value;
    if (!logDate) { alert('กรุณาเลือกวันที่ขาย'); return null; }
    const buyerName = document.getElementById('saleBuyerName').value.trim();
    const remark = document.getElementById('saleBillRemark').value.trim();
    const billDiscount = Math.max(0, Number(document.getElementById('saleDiscount')?.value || 0));
    const rows = [...document.querySelectorAll('#saleItemsList .sale-item-card')];
    if (!rows.length) { alert('กรุณาเพิ่มรายการขาย'); return null; }
    const items = [];
    let totalQty = 0;
    let subTotal = 0;
    for (const row of rows) {
      const rawItemName = row.querySelector('.sale-item-name')?.value?.trim() || '';
      const unit = row.querySelector('.sale-item-unit')?.value?.trim() || 'ตัว';
      const qty = Number(row.querySelector('.sale-item-qty')?.value || 0);
      let unitPrice = Number(row.querySelector('.sale-item-price')?.value || 0);
      if (!rawItemName || qty <= 0) { alert('กรุณากรอกข้อมูลรายการขายให้ครบ'); return null; }
      let itemName = rawItemName;
      let displayName = rawItemName;
      let totalQtyLine = qty;
      if (state.saleType === 'egg') {
        const priceItem = getPriceItemByName(rawItemName);
        if (!priceItem) { alert('ไม่พบราคาของรายการไข่ที่เลือก'); return null; }
        itemName = priceItem.item_name;
        displayName = priceItem.display_name || priceItem.item_name;
        totalQtyLine = qty * saleUnitMultiplier(unit);
      }
      const lineTotal = round2(totalQtyLine * unitPrice);
      totalQty += totalQtyLine;
      subTotal += lineTotal;
      items.push({ item_name: itemName, display_name: displayName, unit, unit_label: saleUnitLabel(unit), qty, total_qty: round2(totalQtyLine), unit_price: unitPrice, discount: 0, line_total: lineTotal });
    }
    if (state.saleType === 'duck' && totalQty > Number(state.batch.current_qty || 0)) { alert('จำนวนขายเป็ดรวมมากกว่าคงเหลือปัจจุบัน'); return null; }
    const grandTotal = Math.max(0, round2(subTotal - billDiscount));
    return { batch_id: state.batch.id, bill_id: state.saleEditBillId || '', mode: state.saleEditBillId ? 'replace_bill' : 'create', sale_type: state.saleType, bill_title: 'บิลเงินสด', farm_name: state.data?.farm_name || state.batch?.owner_name || 'FARM', logo_url: state.logoUrl, batch_name: state.batch.name, log_date: logDate, issue_date: nowDateTimeDisplay(), sale_name: buyerName, remark, items, total_qty: round2(totalQty), sub_total: round2(subTotal), discount: round2(billDiscount), grand_total: grandTotal };
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
    button.disabled = true; button.textContent = 'กำลังบันทึก...';
    const action = state.preBillReviewId ? 'approvePreBill' : 'saveBatchSaleBill';
    const response = await AppApi.post({ action, pre_bill_id: state.preBillReviewId || '', batch_id: state.billDraft.batch_id, bill_id: state.billDraft.bill_id || '', mode: state.billDraft.mode || 'create', log_date: state.billDraft.log_date, sale_name: state.billDraft.sale_name, remark: state.billDraft.remark, sale_type: state.billDraft.sale_type, discount: state.billDraft.discount || 0, items: state.billDraft.items });
    button.disabled = false; button.textContent = original;
    if (!response || response.status !== 'ok') return alert(response?.message || 'บันทึกบิลไม่สำเร็จ');
    closeBillPreview(); closeSaleBillSheet();
    clearModuleCaches(state.batch.id, ['sale_manage']);
    state.month = String(state.billDraft.log_date || state.month).slice(0, 7);
    await load(state.batch.id);
    alert(`${state.preBillReviewId ? 'อนุมัติ PreBill และสร้างบิลสำเร็จ' : 'บันทึกบิลสำเร็จ'} เลขที่ ${response.bill?.bill_id || '-'}`);
    state.preBillReviewId = '';
  }

  function downloadBillImage() { if (!state.billPreviewImage) return; const link = document.createElement('a'); link.href = state.billPreviewImage; link.download = `cash-bill-${state.batch.id}-${Date.now()}.png`; link.click(); }
  function ensureSaleDiscountField() {
    const form = document.getElementById('saleBillForm');
    if (!form || document.getElementById('saleDiscount')) return;
    const stockNote = document.getElementById('saleBillStockNote');
    const discountWrap = document.createElement('div');
    discountWrap.className = 'sale-discount-wrap';
    discountWrap.innerHTML = `<label class="field-label" for="saleDiscount">ส่วนลดรวม</label><input id="saleDiscount" type="number" min="0" step="0.01" placeholder="ส่วนลดรวม (บาท)" value="0" />`;
    if (stockNote && stockNote.parentNode === form) form.insertBefore(discountWrap, stockNote); else form.appendChild(discountWrap);
  }
  function normalizeSaleLayout() {
    const addBtn = document.getElementById('addSaleItemBtn'); const footer = document.querySelector('#saleBillSheet .sheet-footer');
    if (!addBtn || !footer) return;
    let row = footer.querySelector('.sale-bill-footer-row');
    if (!row) { row = document.createElement('div'); row.className = 'sale-bill-footer-row'; footer.prepend(row); }
    const submitBtn = footer.querySelector('#salePreviewBtn'); addBtn.type = 'button';
    if (!row.contains(addBtn)) row.appendChild(addBtn);
    if (submitBtn && !row.contains(submitBtn)) row.appendChild(submitBtn);
  }


  function initSaleRangeSummaryDefaults() {
    if (state.moduleType !== 'sale_manage' || !state.batch) return;
    const start = document.getElementById('saleRangeStartDate');
    const end = document.getElementById('saleRangeEndDate');
    if (start && !start.value) start.value = state.month + '-01';
    if (end && !end.value) {
      const [y, m] = state.month.split('-').map(Number);
      end.value = state.month + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0');
    }
  }

  async function searchSaleRangeSummary() {
    if (!state.batch) return;
    const startDate = document.getElementById('saleRangeStartDate')?.value || '';
    const endDate = document.getElementById('saleRangeEndDate')?.value || '';
    const buyerSearch = document.getElementById('saleRangeBuyerSearch')?.value?.trim() || '';
    if (!startDate || !endDate) return alert('กรุณาเลือกวันที่เริ่มและวันที่สิ้นสุด');
    if (startDate > endDate) return alert('วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด');
    const btn = document.getElementById('saleRangeSearchBtn');
    const original = btn?.textContent || 'ค้นหา';
    if (btn) { btn.disabled = true; btn.textContent = 'กำลังค้นหา...'; }
    const response = await AppApi.post({ action: 'getSaleBillRangeSummary', batch_id: state.batch.id, start_date: startDate, end_date: endDate, buyer_search: buyerSearch });
    if (btn) { btn.disabled = false; btn.textContent = original; }
    if (!response || response.status !== 'ok') return alert(response?.message || 'โหลดสรุปบิลไม่สำเร็จ');
    state.saleRangeRows = (Array.isArray(response.rows) ? response.rows : []).map((row) => ({ ...row, selected: true }));
    state.saleRangeTotals = calculateSelectedSaleRangeTotals();
    renderSaleRangeSummary({ rows: state.saleRangeRows, totals: state.saleRangeTotals });
  }

  function onSaleRangeListClick(event) {
    const card = event.target.closest('[data-sale-range-bill-id]');
    if (!card) return;
    const billId = card.dataset.saleRangeBillId;
    state.saleRangeRows = (state.saleRangeRows || []).map((row) => String(row.bill_id) === String(billId) ? { ...row, selected: !row.selected } : row);
    state.saleRangeTotals = calculateSelectedSaleRangeTotals();
    renderSaleRangeSummary({ rows: state.saleRangeRows, totals: state.saleRangeTotals });
  }

  function calculateSelectedSaleRangeTotals() {
    const selected = (state.saleRangeRows || []).filter((row) => row.selected !== false);
    const totals = selected.reduce((acc, row) => {
      acc.bill_count += 1;
      acc.gross_total += Number(row.gross_total || 0);
      acc.discount_total += Number(row.discount_total || 0);
      acc.grand_total += Number(row.grand_total || 0);
      return acc;
    }, { bill_count: 0, gross_total: 0, discount_total: 0, grand_total: 0 });
    totals.gross_total = round2(totals.gross_total);
    totals.discount_total = round2(totals.discount_total);
    totals.grand_total = round2(totals.grand_total);
    return totals;
  }

  function renderSaleRangeSummary(response) {
    const list = document.getElementById('saleRangeSummaryList');
    const badge = document.getElementById('saleRangeSummaryBadge');
    const footer = document.getElementById('saleRangeSummaryFooter');
    const grand = document.getElementById('saleRangeGrandTotal');
    if (!list) return;
    const rows = Array.isArray(response.rows) ? response.rows : [];
    const selectedRows = rows.filter((row) => row.selected !== false);
    const totals = response.totals || calculateSelectedSaleRangeTotals();
    if (badge) badge.textContent = rows.length ? (`เลือก ${selectedRows.length}/${rows.length} บิล`) : 'ไม่พบข้อมูล';
    if (grand) grand.textContent = formatMoney(totals.grand_total || 0) + ' ฿';
    footer?.classList.toggle('hidden', !rows.length);
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state">ไม่พบข้อมูลบิลในช่วงวันที่เลือก</div>';
      return;
    }
    list.innerHTML = rows.map((row) => {
      const selected = row.selected !== false;
      const icon = row.sale_type === 'egg' ? '🥚' : (row.sale_type === 'fish' ? '🐟' : (row.sale_type === 'duck' ? '🦆' : '🧾'));
      const buyer = row.buyer || row.sale_name || 'ไม่ระบุผู้ซื้อ';
      const itemText = (row.items || []).slice(0, 3).map((item) => `${item.sale_item || item.item_name || '-'} ${formatCompactNumber(item.sale_qty || item.qty || 0)} ${saleUnitLabel(item.sale_unit || item.unit || '')}`).join(' • ');
      const moreText = (row.items || []).length > 3 ? ` • +${(row.items || []).length - 3} รายการ` : '';
      return `
        <button type="button" class="sale-range-bill-card${selected ? ' is-selected' : ' is-deselected'}" data-sale-range-bill-id="${escapeAttr(row.bill_id)}">
          <div class="sale-range-bill-icon">${icon}</div>
          <div class="sale-range-bill-main">
            <div class="sale-range-bill-head">
              <strong class="sale-range-bill-date">${escapeHtml(formatThaiDate(row.log_date))}</strong>
              <span class="sale-range-bill-buyer">${escapeHtml(buyer)}</span>
            </div>
            <div class="sale-range-bill-body">
              <div class="sale-range-bill-detail">ยอดเต็ม ${escapeHtml(formatMoney(row.gross_total || 0))} ฿ • ส่วนลด ${escapeHtml(formatMoney(row.discount_total || 0))} ฿</div>
              <div class="sale-range-bill-items">${escapeHtml(itemText || 'ไม่มีรายละเอียดรายการ')}${escapeHtml(moreText)}</div>
            </div>
          </div>
          <div class="sale-range-bill-side">
            <span class="sale-range-bill-id">${escapeHtml(row.bill_id || '-')}</span>
            <strong class="sale-range-bill-total">${escapeHtml(formatMoney(row.grand_total || 0))} ฿</strong>
          </div>
        </button>`;
    }).join('');
  }

  async function previewSaleRangeSummaryImage() {
    const selected = (state.saleRangeRows || []).filter((row) => row.selected !== false);
    if (!selected.length) return alert('กรุณาเลือกอย่างน้อย 1 บิล');
    const startDate = document.getElementById('saleRangeStartDate')?.value || '';
    const endDate = document.getElementById('saleRangeEndDate')?.value || '';
    const totals = calculateSelectedSaleRangeTotals();
    const img = await renderSaleRangeSummaryImage({ startDate, endDate, rows: selected, totals });
    state.saleRangeImage = img;
    const image = document.getElementById('saleRangePreviewImage');
    if (image) { image.src = img; image.classList.remove('hidden'); }
    const meta = document.getElementById('saleRangePreviewMeta');
    if (meta) meta.textContent = `เลือก ${selected.length} บิล • สุทธิ ${formatMoney(totals.grand_total)} บาท`;
    showSheet(document.getElementById('saleRangePreviewSheet'));
  }

  function closeSaleRangePreview() { hideSheet(document.getElementById('saleRangePreviewSheet')); }

  function downloadSaleRangeSummaryImage() {
    if (!state.saleRangeImage) return alert('กรุณา Preview สรุปยอดก่อน');
    const startDate = document.getElementById('saleRangeStartDate')?.value || '';
    const endDate = document.getElementById('saleRangeEndDate')?.value || '';
    const link = document.createElement('a');
    link.href = state.saleRangeImage;
    link.download = `bill-summary-${state.batch?.id || 'batch'}-${startDate}-${endDate}.png`;
    link.click();
  }

  async function renderSaleRangeSummaryImage(payload) {
    const rows = payload.rows || [];
    const totals = payload.totals || {};
    const width = 430, padding = 22, lineGap = 20;
    const height = 194 + rows.length * 58 + 102;
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#111827'; ctx.textBaseline = 'top';
    let y = padding;
    try { const logo = await loadImage(state.logoUrl); const logoSize = 48; ctx.drawImage(logo, (width - logoSize) / 2, y, logoSize, logoSize); y += logoSize + 8; } catch (_) {}
    drawCenteredFitText(ctx, state.data?.farm_name || state.batch?.owner_name || 'FARM', width / 2, y, width - (padding * 2), 'bold', 20, 13); y += 28;
    drawCenteredFitText(ctx, 'สรุปยอดบิล', width / 2, y, width - (padding * 2), 'bold', 16, 13); y += 24;
    drawCenteredFitText(ctx, formatThaiDate(payload.startDate) + ' ถึง ' + formatThaiDate(payload.endDate), width / 2, y, width - (padding * 2), '', 13, 11); y += 26;
    ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke(); y += 12;
    rows.forEach((row) => {
      const icon = row.sale_type === 'egg' ? 'ไข่' : (row.sale_type === 'fish' ? 'ปลา' : (row.sale_type === 'duck' ? 'เป็ด' : 'บิล'));
      ctx.textAlign = 'left'; ctx.font = 'bold 13px system-ui'; ctx.fillStyle = '#111827'; ctx.fillText(formatThaiDate(row.log_date) + ' • ' + icon, padding, y, width - (padding * 2) - 112);
      ctx.textAlign = 'right'; ctx.fillText(formatMoney(row.grand_total || 0), width - padding, y, 108); y += 18;
      ctx.textAlign = 'left'; ctx.font = '12px system-ui'; ctx.fillStyle = '#6b7280';
      const buyer = row.buyer || row.sale_name || 'ไม่ระบุผู้ซื้อ';
      ctx.fillText(buyer, padding, y, width - (padding * 2)); y += 16;
      ctx.fillText('ยอดเต็ม ' + formatMoney(row.gross_total || 0) + ' • ส่วนลด ' + formatMoney(row.discount_total || 0), padding, y, width - (padding * 2));
      y += 24;
    });
    ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.moveTo(padding, y); ctx.lineTo(width - padding, y); ctx.stroke(); y += 14;
    ctx.fillStyle = '#111827'; ctx.font = '14px system-ui'; ctx.textAlign = 'left'; ctx.fillText('ยอดเต็มรวม', padding, y); ctx.textAlign = 'right'; ctx.fillText(formatMoney(totals.gross_total || 0), width - padding, y); y += lineGap;
    ctx.textAlign = 'left'; ctx.fillText('ส่วนลดรวม', padding, y); ctx.textAlign = 'right'; ctx.fillText('-' + formatMoney(totals.discount_total || 0), width - padding, y); y += lineGap;
    ctx.font = 'bold 17px system-ui'; ctx.textAlign = 'left'; ctx.fillText('ยอดสุทธิรวม', padding, y); ctx.textAlign = 'right'; ctx.fillText(formatMoney(totals.grand_total || 0), width - padding, y);
    return canvas.toDataURL('image/png');
  }

  function round2(value) { return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100; }
  function formatMoney(value) { return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function formatNumber(value) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  function nowDateTimeDisplay() { const now = new Date(); return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; }
  function formatThaiDate(dateStr) { if (!dateStr) return '-'; const [year, month, day] = String(dateStr).split('-').map(Number); const months = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']; return `${day} ${months[(month || 1) - 1]} ${year + 543}`; }

  function drawCenteredFitText(ctx, text, centerX, y, maxWidth, weight, baseSize, minSize) {
    text = String(text || '').trim();
    weight = weight || 'bold';
    baseSize = Number(baseSize || 18);
    minSize = Number(minSize || 12);
    maxWidth = Number(maxWidth || 0);

    var size = baseSize;
    do {
      ctx.font = weight + ' ' + size + 'px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
      if (!maxWidth || ctx.measureText(text).width <= maxWidth || size <= minSize) break;
      size -= 1;
    } while (size >= minSize);

    // Do not pass maxWidth to fillText for centered headers.
    // Some mobile/LIFF WebViews visually scale centered canvas text with maxWidth,
    // which makes subtitle/date lines look off-center even when textAlign is center.
    if (maxWidth && ctx.measureText(text).width > maxWidth) {
      text = truncateCanvasText_(ctx, text, maxWidth);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    if ('direction' in ctx) ctx.direction = 'ltr';
    ctx.fillText(text, Math.round(centerX), Math.round(y));
    return size;
  }

  function truncateCanvasText_(ctx, text, maxWidth) {
    text = String(text || '');
    if (!maxWidth || ctx.measureText(text).width <= maxWidth) return text;
    var ellipsis = '…';
    var next = text;
    while (next.length > 1 && ctx.measureText(next + ellipsis).width > maxWidth) {
      next = next.slice(0, -1);
    }
    return next + ellipsis;
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) { const words = String(text || '').split(' '); let line = ''; for (let n = 0; n < words.length; n += 1) { const testLine = line + words[n] + ' '; const metrics = ctx.measureText(testLine); if (metrics.width > maxWidth && n > 0) { ctx.fillText(line, x, y); line = words[n] + ' '; y += lineHeight; } else { line = testLine; } } ctx.fillText(line, x, y); }
  function loadImage(src) { return new Promise((resolve, reject) => { if (!src) return reject(new Error('missing image')); const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; }); }

  function showSheet(sheet) {
    if (!sheet) return;
    sheet.classList.remove('hidden');
    requestAnimationFrame(() => sheet.classList.add('show'));
  }

  function hideSheet(sheet) {
    if (!sheet) return;
    sheet.classList.remove('show');
    setTimeout(() => sheet.classList.add('hidden'), 220);
  }

  function clearModuleCaches(batchId, modules) {
    try {
      const prefixes = (modules || []).map((moduleKey) => `ducky:module:${moduleKey}:${batchId}:`);
      Object.keys(localStorage).forEach((key) => {
        if (prefixes.some((prefix) => key.indexOf(prefix) === 0)) localStorage.removeItem(key);
      });
      localStorage.removeItem(`ducky:batch-dashboard:${batchId}`);
    } catch (_) {}
  }

  function renderNoAccess() {
    document.getElementById('moduleSubtitle').textContent = 'คุณไม่มีสิทธิ์เข้าถึงโมดูลนี้';
    const intro = document.querySelector('.module-page-intro');
    if (intro) {
      intro.querySelector('#modulePermissionBadge').className = 'badge-inline danger-soft';
      intro.querySelector('#modulePermissionBadge').textContent = 'ไม่มีสิทธิ์';
      intro.querySelector('#moduleHint').textContent = 'ระบบจะไม่ดึงข้อมูลเชิงลึกของโมดูลนี้เพิ่มเติม';
    }
    document.getElementById('moduleSummaryCards').innerHTML = '<div class="empty-state">ไม่มีข้อมูลสำหรับโมดูลนี้</div>';
    document.querySelector('.module-calendar-panel')?.classList.add('hidden');
    document.getElementById('recentLogList') && (document.getElementById('recentLogList').innerHTML = '<div class="empty-state">ไม่มีข้อมูลสำหรับโมดูลนี้</div>');
    document.getElementById('moduleFabRoot')?.replaceChildren();
  }

  function monthKey(date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; }
  function todayString() { return monthKey(new Date()) + '-' + String(new Date().getDate()).padStart(2, '0'); }
  function formatThaiMonth(month) {
    const [year, m] = month.split('-').map(Number);
    const months = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];
    return `${months[m - 1]} ${year + 543}`;
  }
  function permissionLabel(value) { return value === 'write' ? 'ดูและแก้ไข' : (value === 'view' ? 'ดูอย่างเดียว' : 'ไม่มีสิทธิ์'); }
  function badgeClass(value) { return value === 'write' ? 'success' : (value === 'view' ? 'muted-badge' : 'danger-soft'); }
  function formatCompactNumber(value) { return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }
  function escapeHtml(text) { return String(text || '').replace(/[&<>"']/g, (m) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m])); }
  function escapeAttr(text) { return escapeHtml(String(text || '')); }
  function setSyncHint(message) {
    const el = document.getElementById('moduleHint');
    if (!el || !message) return;
    el.dataset.syncHint = message;
    el.textContent = message;
  }

  function readCache(key, options = {}) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return options.meta ? { data: null, isStale: false, age: Infinity } : null;
      const parsed = JSON.parse(raw);
      const savedAt = Number(parsed.savedAt || parsed.saved_at || 0);
      const age = savedAt ? Date.now() - savedAt : Infinity;
      const isStale = age > CACHE_TTL_MS;
      const data = parsed.data || null;
      if (options.meta || options.allowStale) return { data, isStale, age, savedAt };
      if (isStale) return null;
      return data;
    } catch (_) { return options.meta || options.allowStale ? { data: null, isStale: false, age: Infinity } : null; }
  }
  function writeCache(key, data) {
    try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch (_) {}
  }
  function pickModulePermission(perms, moduleType, specie) {
    if (moduleType === 'sale_manage') return perms[(specie === 'fish' ? 'fish_sale' : 'egg_sale')] || 'none';
    if (moduleType === 'feed_manage' && specie === 'fish') return perms['fish_feed_manage'] || 'none';
    return perms[moduleType] || 'none';
  }

  return { bootstrap };
})();

//# sourceURL=js/modules/module-calendar-page.js


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
