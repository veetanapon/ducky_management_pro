/* Ducky bundle: login
 * Generated: 2026-05-28T05:12:04.817Z
 * Sources:
 * - js/config.js
 * - js/core/state.js
 * - js/core/api.js
 * - js/core/auth.js
 * - js/core/zoom-lock.js
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
