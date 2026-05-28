/* Ducky bundle: feed-order-bills
 * Generated: 2026-05-28T05:12:04.640Z
 * Sources:
 * - js/config.js
 * - js/core/cache.js
 * - js/core/api.js
 * - js/core/auth.js
 * - js/core/dom.js
 * - js/core/format.js
 * - js/services/menu-permission.service.js
 * - js/modules/nav.js
 * - js/services/feed-order.service.js
 * - js/modules/feed-order-bills-page.js
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


/* ==== js/services/feed-order.service.js ==== */
window.FeedOrderBillsPage = (() => {
  const state = {
    rows: [],
    batches: [],
    summary: {},
    filter: 'pending',
    showHidden: false,
    bootstrapped: false,
    lastUpdated: '',
    permission: 'none',
    expandedLots: new Set()
  };

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const n = (v) => Number(v || 0);
  const fmt = (v, digits = 0) => n(v).toLocaleString('th-TH', { maximumFractionDigits: digits });
  const money = (v) => n(v).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = () => new Date().toISOString().slice(0, 10);
  const nowText = () => new Date().toLocaleString('th-TH', { hour12: false });

  function readLot(raw = {}) {
    const purchaseQty = n(raw.purchase_qty ?? raw.qty_total ?? raw.total_qty ?? raw.qty ?? raw.feed_qty);
    const returnedQty = n(raw.returned_qty ?? raw.returned_total ?? raw.return_qty ?? raw.claim_return_qty);
    const replacementQty = n(raw.replacement_qty ?? raw.replacement_total ?? raw.claim_replacement_qty ?? raw.received_back_qty);
    const netQty = n(raw.net_qty ?? raw.effective_qty ?? (purchaseQty - returnedQty + replacementQty));
    const unitPrice = n(raw.unit_price ?? raw.purchase_unit_price ?? raw.price_per_unit);
    const purchaseValue = n(raw.purchase_value ?? raw.gross_total ?? raw.grand_total ?? (purchaseQty * unitPrice));
    const returnValue = n(raw.return_value ?? raw.claim_return_value ?? returnedQty * unitPrice);
    const replacementValue = n(raw.replacement_value ?? raw.claim_replacement_value ?? raw.replacement_total_value);
    const netValue = n(raw.net_value ?? raw.net_total ?? raw.effective_total ?? (purchaseValue - returnValue + replacementValue));
    const paid = n(raw.paid_total ?? raw.payment_total ?? raw.paid_amount);
    const outstanding = Math.max(0, n(raw.debt_total ?? raw.outstanding_total ?? raw.payable_total ?? (netValue - paid)));

    const allocations = Array.isArray(raw.allocations) ? raw.allocations : [];
    const payments = Array.isArray(raw.payments) ? raw.payments : [];
    const claims = Array.isArray(raw.claims) ? raw.claims : [];
    const allocated = n(raw.allocated_qty ?? raw.allocated_total ?? raw.qty_allocated ?? raw.allocation_total ?? allocations.reduce((s, a) => s + n(a.qty_allocated ?? a.qty ?? 0), 0));
    const allocationCount = n(raw.allocation_count ?? allocations.length);
    const claimCount = n(raw.claim_count ?? claims.length);
    const isHidden = ['0', 'false', 'hidden', 'hide'].includes(String(raw.is_visible ?? raw.visible ?? 1).trim().toLowerCase());

    const allocationDestinations = allocations
      .map((a) => {
        const name = String(a.batch_name || a.external_name || a.destination_name || a.batch_id || '').trim();
        const qty = n(a.qty_allocated ?? a.qty ?? 0);
        const date = String(a.allocation_date || a.log_date || '').trim();
        if (!name && !qty) return null;
        return {
          date,
          name: name || 'ไม่ระบุเล้า',
          qty,
          text: `${date ? date + ' • ' : ''}${name || 'ไม่ระบุเล้า'} ${fmt(qty, 2)} ลูก`
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

    const paymentRows = payments
      .map((p) => ({
        payment_date: String(p.payment_date || p.date || '').trim(),
        amount: n(p.amount || p.payment_amount || 0),
        payment_method: String(p.payment_method || '').trim(),
        payment_group_id: String(p.payment_group_id || '').trim(),
        remark: String(p.remark || '').trim()
      }))
      .filter((p) => p.payment_date || p.amount)
      .sort((a, b) => String(a.payment_date || '').localeCompare(String(b.payment_date || '')));

    const latestPayment = paymentRows[paymentRows.length - 1] || payments[0] || null;
    const latestPaymentDate = String(raw.last_payment_date || raw.payment_date_latest || latestPayment?.payment_date || '').trim();
    const latestPaymentAmount = n(raw.last_payment_amount ?? latestPayment?.amount ?? 0);

    // สถานะการจ่ายยึดจากยอดค้างจริงก่อนเสมอ
    // ห้ามให้ข้อความ status จาก backend เช่น CLEARED มาทับ ถ้ายังมียอดค้างจ่ายอยู่
    const isCleared = outstanding <= 0.0001 && netValue > 0;
    const statusLabel = isCleared ? 'เคลียร์แล้ว' : (paid > 0 ? 'จ่ายบางส่วน' : 'ยังไม่จ่าย');

    const title = String(raw.feed_name || raw.name || raw.lot_name || raw.title || 'ล็อตอาหาร').trim();
    const supplier = String(raw.supplier_name || raw.supplier || raw.vendor_name || '').trim();
    return {
      ...raw,
      id: String(raw.id || raw.lot_id || raw.feed_order_id || ''),
      title,
      supplier,
      purchaseDate: raw.purchase_date || raw.log_date || raw.date || '',
      purchaseQty,
      returnedQty,
      replacementQty,
      netQty,
      allocated,
      allocationCount,
      allocationDestinations,
      paymentRows,
      isHidden,
      unitPrice,
      purchaseValue,
      netValue,
      paid,
      outstanding,
      latestPaymentDate,
      latestPaymentAmount,
      claimCount,
      isCleared,
      statusLabel,
      creatorLabel: String(raw.created_user_label || raw.created_user_name || raw.created_user_email || raw.created_user_id || '').trim(),
      isOwnLot: raw.is_own_lot === 1 || raw.is_own_lot === true || raw.is_own_lot === '1',
      allocations,
      payments,
      claims
    };
  }

  function normalizePayload(res = {}) {
    const rows = (res.lots || res.bills || res.rows || res.feed_order_bills || [])
      .map(readLot)
      .filter((row) => !row.isHidden);
    const summary = res.summary || calcSummary(rows);
    state.rows = rows;
    state.showHidden = false;
    state.batches = res.batches || res.batch_options || [];
    state.summary = { ...calcSummary(rows), ...summary };
    if (res.permission) state.permission = String(res.permission || state.permission || 'none').toLowerCase();
    state.lastUpdated = res.generated_at || res.updated_at || nowText();
  }

  function calcSummary(rows) {
    return {
      lot_count: rows.length,
      purchase_qty: rows.reduce((s, r) => s + n(r.purchaseQty), 0),
      net_qty: rows.reduce((s, r) => s + n(r.netQty), 0),
      purchase_value: rows.reduce((s, r) => s + n(r.purchaseValue), 0),
      net_value: rows.reduce((s, r) => s + n(r.netValue), 0),
      paid_total: rows.reduce((s, r) => s + n(r.paid), 0),
      debt_total: rows.reduce((s, r) => s + n(r.outstanding), 0)
    };
  }

  function displayRows() {
    return state.rows.filter((r) => !r.isHidden);
  }

  function pendingRowsForSummary() {
    return state.rows
      .filter((r) => !r.isHidden && !r.isCleared && n(r.outstanding) > 0)
      .sort((a, b) => String(a.purchaseDate || '').localeCompare(String(b.purchaseDate || '')) || String(a.id || '').localeCompare(String(b.id || '')));
  }

  async function bootstrap() {
    if (state.bootstrapped) return;
    state.bootstrapped = true;
    const ok = await AppAuth.ensureAuth();
    if (!ok) return;
    if (window.MenuPermissionApi?.ensureLoaded) await MenuPermissionApi.ensureLoaded().catch(() => null);
    state.permission = getProgramMenuPermission('feed_order_bills');
    if (!canViewFeedOrder()) {
      renderAccessDenied('ไม่มีสิทธิ์เข้าถึงเมนูบิลอาหารกลาง');
      return;
    }
    bind();
    applyPermissionUI();
    await load();
  }

  function bind() {
    $('backBtn')?.addEventListener('click', () => history.back());
    $('logoutBtn')?.addEventListener('click', AppAuth.logout);
    $('reloadBtn')?.addEventListener('click', () => load({ force: true }));
    $('openLotBtn')?.addEventListener('click', () => { if (canWriteFeedOrder()) openLotSheet(); else alert('ไม่มีสิทธิ์เพิ่มล็อตอาหาร'); });
    $('openBulkPaymentBtn')?.addEventListener('click', () => { if (canWriteFeedOrder()) openBulkPaymentSheet(); else alert('ไม่มีสิทธิ์จ่ายยอดบิลอาหารกลาง'); });
    $('feedOrderFab')?.addEventListener('click', () => { if (canWriteFeedOrder()) openLotSheet(); else alert('ไม่มีสิทธิ์เพิ่มล็อตอาหาร'); });
    document.addEventListener('click', onDocumentClick);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeSheet();
    });
  }

  async function load({ force = false } = {}) {
    if (!canViewFeedOrder()) {
      renderAccessDenied('ไม่มีสิทธิ์เข้าถึงเมนูบิลอาหารกลาง');
      return;
    }
    setSubtitle(force ? 'กำลังโหลดใหม่...' : 'กำลังโหลดข้อมูล...');
    const btn = $('reloadBtn');
    await withButton(btn, 'กำลังโหลด...', async () => {
      const res = await FeedOrderService.getPageData({ include_hidden: 0, dedupe: false });
      if (!res || res.status !== 'ok') {
        setSubtitle(res?.message || 'โหลดข้อมูลไม่สำเร็จ');
        return;
      }
      normalizePayload(res);
      render();
    });
  }

  function setSubtitle(text) {
    const el = $('feedOrderSubtitle');
    if (el) el.textContent = text || '';
  }

  function render() {
    applyPermissionUI();
    setSubtitle(`อัปเดต ${state.lastUpdated || nowText()}`);
    renderSummary();
    renderList();
  }

  function renderSummary() {
    const pending = pendingRowsForSummary();
    const s = { ...calcSummary(pending) };
    const target = $('feedOrderSummary');
    if (!target) return;
    target.innerHTML = [
      summaryCard('บิลค้างจ่าย', `${fmt(s.lot_count)} ล็อต`, 'เฉพาะบิลที่ยังค้างและไม่ถูกซ่อน'),
      summaryCard('จำนวนสุทธิค้าง', `${fmt(s.net_qty, 2)} ลูก`, `ซื้อเข้า ${fmt(s.purchase_qty, 2)} ลูก`),
      summaryCard('ยอดค้างรวม', `${money(s.debt_total)} ฿`, `จ่ายแล้ว ${money(s.paid_total)} บาท`)
    ].join('');
  }

  function summaryCard(label, value, sub) {
    return `<article class="feed-order-summary-card"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(sub)}</small></article>`;
  }

  function filteredRows() {
    const base = displayRows();
    if (state.filter === 'cleared') return base.filter((r) => r.isCleared);
    if (state.filter === 'pending') return base.filter((r) => !r.isCleared);
    return base;
  }

  function renderList() {
    document.querySelectorAll('[data-feed-order-filter]').forEach((btn) => btn.classList.toggle('is-active', btn.dataset.feedOrderFilter === state.filter));
    const hiddenToggle = $('feedOrderHiddenToggle');
    if (hiddenToggle) hiddenToggle.hidden = true;
    const hint = $('feedOrderFilterHint');
    if (hint) {
      const count = filteredRows().length;
      hint.textContent = `${fmt(count)} รายการ`;
    }
    const target = $('feedOrderList');
    if (!target) return;
    const rows = filteredRows();
    if (!rows.length) {
      target.innerHTML = '<div class="feed-order-empty">ยังไม่มีรายการตามเงื่อนไขนี้</div>';
      return;
    }
    target.innerHTML = rows.map(renderLotCard).join('');
  }

  function renderLotCard(row) {
    const statusClass = row.isHidden ? 'is-hidden' : (row.isCleared ? 'is-cleared' : (row.paid > 0 ? 'is-partial' : 'is-unpaid'));
    const isExpanded = state.expandedLots.has(String(row.id));
    const allocationList = row.allocationDestinations.length
      ? row.allocationDestinations.map((a) => `<li><strong>${esc(a.text)}</strong></li>`).join('')
      : '<li><span>-</span><strong>ยังไม่ได้แบ่งเข้าเล้า</strong></li>';
    const paymentList = row.paymentRows.length
      ? row.paymentRows.map((p) => `<li><strong>${esc(p.payment_date || '-')} • ${money(p.amount)} บาท${p.payment_method ? ' • ' + esc(p.payment_method) : ''}</strong></li>`).join('')
      : '<li><span>-</span><strong>ยังไม่มีประวัติจ่ายเงิน</strong></li>';
    const claimChips = [
      row.returnedQty ? `<span>เคลม/คืน ${fmt(row.returnedQty, 2)} ลูก</span>` : '',
      row.replacementQty ? `<span>รับคืน ${fmt(row.replacementQty, 2)} ลูก</span>` : '',
      row.claimCount ? `<span>ประวัติเคลม ${fmt(row.claimCount)} รายการ</span>` : ''
    ].filter(Boolean).join('');

    const compactSummary = `
        <button type="button" class="feed-order-card-compact-summary" data-feed-action="toggle" data-id="${esc(row.id)}" aria-expanded="false" aria-label="ดูรายละเอียดล็อตอาหาร">
          <span class="feed-order-compact-metric">
            <small>จำนวนสุทธิ</small>
            <strong>${fmt(row.netQty, 2)} ลูก</strong>
          </span>
          <span class="feed-order-compact-metric">
            <small>มูลค่าสุทธิ</small>
            <strong>${money(row.netValue)}</strong>
          </span>
          <span class="feed-order-compact-metric ${row.outstanding > 0 ? 'is-danger' : 'is-good'}">
            <small>ค้างจ่าย</small>
            <strong>${money(row.outstanding)}</strong>
          </span>
          <span class="feed-order-show-more" aria-hidden="true">เพิ่ม ▼</span>
        </button>`;

    const expandedContent = `
        <div class="feed-order-expanded-toolbar">
          <button type="button" class="feed-order-show-less" data-feed-action="toggle" data-id="${esc(row.id)}" aria-expanded="true">
            ลด ▲
          </button>
        </div>

        <div class="feed-order-card-grid">
          ${metric('จำนวนซื้อเข้า', `${fmt(row.purchaseQty, 2)} ลูก`)}
          ${metric('จำนวนสุทธิ', `${fmt(row.netQty, 2)} ลูก`)}
          ${metric('แบ่งแล้ว', `${fmt(row.allocated, 2)} ลูก`)}
          ${metric('มูลค่าซื้อเข้า', money(row.purchaseValue))}
          ${metric('มูลค่าสุทธิ', money(row.netValue))}
          ${metric('ค้างจ่าย', money(row.outstanding), row.outstanding > 0 ? 'danger' : 'good')}
        </div>

        <div class="feed-order-card-notes feed-order-card-notes--stacked">
          <div>
            <span>แบ่งไป</span>
            <ul class="feed-order-mini-list">${allocationList}</ul>
          </div>
          <div>
            <span>การจ่ายเงิน</span>
            <ul class="feed-order-mini-list">${paymentList}</ul>
          </div>
        </div>

        ${claimChips ? `<div class="feed-order-chip-row">${claimChips}</div>` : ''}

        <div class="feed-order-actions">
          ${canWriteFeedOrder() ? `
            <button type="button" data-feed-action="allocate" data-id="${esc(row.id)}">แบ่งเข้าเล้า</button>
            <button type="button" data-feed-action="payment" data-id="${esc(row.id)}">จ่ายเงิน</button>
            <button type="button" data-feed-action="claim" data-id="${esc(row.id)}">เคลม/คืน</button>
            <button type="button" data-feed-action="visibility" data-id="${esc(row.id)}">${row.isHidden ? 'แสดงอีกครั้ง' : 'ซ่อน'}</button>
          ` : ''}
          <button type="button" class="feed-order-detail-btn" data-feed-action="detail" data-id="${esc(row.id)}">รายละเอียด</button>
        </div>`;

    return `
      <article class="feed-order-card ${isExpanded ? 'is-expanded' : 'is-collapsed'}" data-lot-id="${esc(row.id)}">
        <div class="feed-order-card__head">
          <div class="feed-order-title-wrap">
            <h3>${esc(row.title)}</h3>
            <div class="feed-order-card__meta">${esc([row.purchaseDate, row.supplier, row.creatorLabel ? 'ผู้บันทึก ' + row.creatorLabel : ''].filter(Boolean).join(' • ') || '-')}</div>
          </div>
          <span class="feed-order-status ${statusClass}">${esc(row.isHidden ? 'ซ่อนไว้' : row.statusLabel)}</span>
        </div>
        ${isExpanded ? expandedContent : compactSummary}
      </article>`;
  }

  function metric(label, value, tone = '') {
    return `<div class="feed-order-metric ${tone ? `is-${tone}` : ''}"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }

  function onDocumentClick(event) {
    const filter = event.target.closest('[data-feed-order-filter]');
    if (filter) {
      state.filter = filter.dataset.feedOrderFilter || 'pending';
      renderList();
      return;
    }
    const action = event.target.closest('[data-feed-action]');
    if (!action) return;
    const lot = state.rows.find((r) => String(r.id) === String(action.dataset.id));
    if (!lot) return;
    const type = action.dataset.feedAction;
    if (['allocate', 'payment', 'claim', 'visibility'].includes(type) && !canWriteFeedOrder()) {
      alert('ไม่มีสิทธิ์แก้ไขบิลอาหารกลาง');
      return;
    }
    if (type === 'toggle') toggleCard(lot);
    else if (type === 'allocate') openAllocateSheet(lot);
    else if (type === 'payment') openPaymentSheet(lot);
    else if (type === 'claim') openClaimSheet(lot);
    else if (type === 'visibility') toggleLotVisibility(lot);
    else if (type === 'detail') openDetailSheet(lot);
  }

  function toggleCard(lot) {
    const id = String(lot.id || '');
    if (!id) return;
    if (state.expandedLots.has(id)) state.expandedLots.delete(id);
    else state.expandedLots.add(id);
    renderList();
  }

  async function toggleLotVisibility(lot) {
    const nextVisible = lot.isHidden ? 1 : 0;
    const message = nextVisible
      ? `ต้องการแสดงล็อต "${lot.title}" กลับมาในรายการใช่ไหม?`
      : `ต้องการซ่อนล็อต "${lot.title}" จากหน้ารายการใช่ไหม?`;
    if (!confirm(message)) return;
    const res = await FeedOrderService.setVisibility({
      purchase_lot_id: lot.id,
      lot_id: lot.id,
      is_visible: nextVisible
    });
    if (!res || res.status !== 'ok') {
      alert(res?.message || 'ปรับสถานะการแสดงผลไม่สำเร็จ');
      return;
    }
    if (nextVisible) state.showHidden = true;
    await load({ force: true });
  }

  function batchOptions() {
    return (state.batches || []).map((b) => {
      const id = b.id || b.batch_id || b.value || '';
      const label = b.name || b.batch_name || b.label || id;
      return `<option value="${esc(id)}">${esc(label)}</option>`;
    }).join('');
  }

  function openLotSheet() {
    if (!canWriteFeedOrder()) {
      alert('ไม่มีสิทธิ์เพิ่มล็อตอาหาร');
      return;
    }
    openSheet('เพิ่มล็อตอาหาร', `
      <form id="feedOrderLotForm" class="feed-order-form">
        <label>วันที่ซื้อ<input name="purchase_date" type="date" value="${today()}" required></label>
        <label>ชื่ออาหาร<input name="feed_name" type="text" placeholder="เช่น S9 A" required></label>
        <label>Supplier / ร้าน<input name="supplier_name" type="text" placeholder="ชื่อร้านหรือโรงงาน"></label>
        <div class="feed-order-form-grid">
          <label>จำนวนซื้อเข้า<input name="qty_total" type="number" min="0" step="0.01" required></label>
          <label>ราคาต่อหน่วย<input name="unit_price" type="number" min="0" step="0.01" required></label>
        </div>
        <label>หมายเหตุ<textarea name="remark" rows="3" placeholder="รายละเอียดเพิ่มเติม"></textarea></label>
        <div class="sheet-footer-row"><button type="button" class="btn secondary" data-sheet-close>ยกเลิก</button><button class="btn primary" type="submit">บันทึกล็อตอาหาร</button></div>
      </form>`, async (sheet) => {
        sheet.querySelector('#feedOrderLotForm')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          await submitForm(e.currentTarget, 'กำลังบันทึก...', async (payload) => FeedOrderService.saveLot(payload));
        });
      });
  }

  function openAllocateSheet(lot) {
    openSheet(`แบ่งเข้าเล้า • ${lot.title}`, `
      <form id="feedOrderAllocateForm" class="feed-order-form">
        <input name="purchase_lot_id" type="hidden" value="${esc(lot.id)}"><input name="lot_id" type="hidden" value="${esc(lot.id)}">
        <label>วันที่แบ่ง<input name="allocation_date" type="date" value="${today()}" required></label>
        <label>เลือก batch / เล้า<select name="batch_id" required data-allocation-target><option value="">เลือก batch</option>${batchOptions()}<option value="outside">เล้านอกระบบ / ไม่ใช้ Ducky</option></select></label>
        <div class="feed-order-form-grid">
          <label>จำนวนที่แบ่ง<input name="qty_allocated" type="number" min="0" step="0.01" max="${esc(lot.netQty)}" required></label>
          <label>ราคาต่อหน่วย<input name="unit_price" type="number" min="0" step="0.01" value="${esc(lot.unitPrice)}"></label>
        </div>
        <label>ชื่อ lot ที่จะเข้า batch<input name="feed_name" type="text" value="${esc(lot.title)}"></label>
        <label>ชื่อเล้า/ปลายทางภายนอก<input name="external_name" type="text" placeholder="กรอกเมื่อเลือกเล้านอกระบบ"></label>
        <label class="check-line"><input name="create_feed_lot" type="checkbox" value="1" checked><span>สร้าง lot ใน Ducky สำหรับ batch ที่เลือก</span></label>
        <label>หมายเหตุ<textarea name="remark" rows="3" placeholder="เช่น แบ่งจากบิลอาหารกลาง"></textarea></label>
        <div class="sheet-footer-row"><button type="button" class="btn secondary" data-sheet-close>ยกเลิก</button><button class="btn primary" type="submit">บันทึกการแบ่ง</button></div>
      </form>`, async (sheet) => {
        const select = sheet.querySelector('[data-allocation-target]');
        const externalName = sheet.querySelector('input[name="external_name"]');
        const createLot = sheet.querySelector('input[name="create_feed_lot"]');
        const syncDestination = () => {
          const isOutside = select?.value === 'outside';
          if (externalName) externalName.required = !!isOutside;
          if (createLot) {
            createLot.disabled = !!isOutside;
            if (isOutside) createLot.checked = false;
          }
        };
        select?.addEventListener('change', syncDestination);
        syncDestination();

        sheet.querySelector('#feedOrderAllocateForm')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          await submitForm(e.currentTarget, 'กำลังบันทึก...', async (payload) => FeedOrderService.allocate(payload));
        });
      });
  }

  function renderBulkPaymentPlan(plan = {}) {
    const rows = Array.isArray(plan.payments) ? plan.payments : [];
    const list = rows.length
      ? rows.map((item, index) => `
        <li>
          <div>
            <strong>${index + 1}. ${esc(item.purchase_date || '-')} • ${esc(item.feed_name || 'ล็อตอาหาร')}</strong>
            <small>ค้างก่อนจ่าย ${money(item.outstanding_before)} บาท → เหลือ ${money(item.outstanding_after)} บาท</small>
          </div>
          <span>${money(item.amount)} บาท</span>
        </li>
      `).join('')
      : '<li><div><strong>ยังไม่มีบิลที่ถูกหัก</strong><small>กรุณาตรวจสอบยอดเงิน</small></div><span>0.00 บาท</span></li>';
    const unapplied = n(plan.unapplied_amount || 0);
    return `
      <div class="feed-order-bulk-plan-head">
        <div><span>รหัสกลุ่มจ่าย</span><strong>${esc(plan.payment_group_id || '-')}</strong></div>
        <div><span>ยอดที่จะหักจริง</span><strong>${money(plan.applied_amount || 0)} บาท</strong></div>
      </div>
      <ul class="feed-order-bulk-plan-list">${list}</ul>
      ${unapplied > 0 ? `<p class="feed-order-bulk-warning">ยอดที่เกินและยังไม่ถูกใช้ ${money(unapplied)} บาท</p>` : ''}
      <small>ตรวจสอบรายการด้านบนก่อนกด “ยืนยันหักยอด” ระบบจะบันทึกตามลำดับบิลเก่าสุดก่อน</small>
    `;
  }

  function openBulkPaymentSheet() {
    const pending = pendingRowsForSummary();
    if (!pending.length) return alert('ยังไม่มีบิลค้างจ่ายให้หักยอด');
    const totalOutstanding = pending.reduce((sum, row) => sum + n(row.outstanding), 0);
    const previewRows = pending.slice(0, 5).map((row, index) => `
      <li><strong>${index + 1}. ${esc(row.purchaseDate || '-')} • ${esc(row.title)}</strong><span>${money(row.outstanding)} บาท</span></li>
    `).join('');
    const moreText = pending.length > 5 ? `<small>และอีก ${fmt(pending.length - 5)} บิล ระบบจะหักจากบิลเก่าสุดก่อน</small>` : '<small>ระบบจะหักจากบิลเก่าสุดก่อน</small>';
    openSheet('จ่ายยอดรวม / Preview ก่อนบันทึก', `
      <form id="feedOrderBulkPaymentForm" class="feed-order-form">
        <input name="payment_group_id" type="hidden" value="">
        <label>วันที่จ่าย<input name="payment_date" type="date" value="${today()}" required></label>
        <label>จำนวนเงินที่จะหัก<input name="amount" type="number" min="0" step="0.01" max="${esc(totalOutstanding)}" placeholder="เช่น 120000" required></label>
        <label>วิธีจ่าย<input name="payment_method" type="text" placeholder="เงินสด / โอน / เครดิต"></label>
        <label>หมายเหตุ<textarea name="remark" rows="3" placeholder="เช่น โอนยอดรวมจากร้านอาหาร"></textarea></label>
        <div class="feed-order-bulk-preview">
          <div><span>ยอดค้างทั้งหมด</span><strong>${money(totalOutstanding)} บาท</strong></div>
          <ul>${previewRows}</ul>
          ${moreText}
        </div>
        <div id="feedOrderBulkPaymentPreviewResult" class="feed-order-bulk-preview-result" hidden></div>
        <div class="sheet-footer-row feed-order-bulk-footer">
          <button type="button" class="btn secondary" data-sheet-close>ยกเลิก</button>
          <button type="button" class="btn secondary" data-preview-bulk-payment>ดูตัวอย่าง</button>
          <button class="btn primary" type="submit" data-confirm-bulk-payment disabled>ยืนยันหักยอด</button>
        </div>
      </form>`, async (sheet) => {
        const form = sheet.querySelector('#feedOrderBulkPaymentForm');
        const previewBtn = sheet.querySelector('[data-preview-bulk-payment]');
        const confirmBtn = sheet.querySelector('[data-confirm-bulk-payment]');
        const resultBox = sheet.querySelector('#feedOrderBulkPaymentPreviewResult');
        const groupInput = form?.querySelector('input[name="payment_group_id"]');
        const resetPreview = () => {
          if (confirmBtn) confirmBtn.disabled = true;
          if (groupInput) groupInput.value = '';
          if (resultBox) {
            resultBox.hidden = true;
            resultBox.innerHTML = '';
          }
        };
        form?.querySelectorAll('input[name="amount"], input[name="payment_date"], input[name="payment_method"], textarea[name="remark"]').forEach((el) => {
          el.addEventListener('input', resetPreview);
          el.addEventListener('change', resetPreview);
        });
        previewBtn?.addEventListener('click', async () => {
          if (!form) return;
          const payload = formToObject(form);
          if (!(n(payload.amount) > 0)) return alert('กรุณากรอกจำนวนเงินที่จะหักก่อน');
          await withButton(previewBtn, 'กำลังคำนวณ...', async () => {
            const res = await FeedOrderService.previewBulkPayment(payload);
            if (!res || res.status !== 'ok') {
              alert(res?.message || 'ดูตัวอย่างไม่สำเร็จ');
              resetPreview();
              return;
            }
            if (groupInput) groupInput.value = res.payment_group_id || '';
            if (resultBox) {
              resultBox.hidden = false;
              resultBox.innerHTML = renderBulkPaymentPlan(res);
            }
            if (confirmBtn) confirmBtn.disabled = !(Array.isArray(res.payments) && res.payments.length);
          });
        });
        form?.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (confirmBtn?.disabled || !groupInput?.value) {
            alert('กรุณากด “ดูตัวอย่าง” และตรวจสอบรายการก่อนยืนยัน');
            return;
          }
          await submitForm(e.currentTarget, 'กำลังหักยอด...', async (payload) => FeedOrderService.saveBulkPayment(payload), (res) => {
            const applied = money(res.applied_amount || 0);
            const count = fmt((res.payments || []).length);
            const group = res.payment_group_id ? `\nรหัสกลุ่มจ่าย: ${res.payment_group_id}` : '';
            const extra = n(res.unapplied_amount) > 0 ? `\nยอดที่เกินและยังไม่ได้ใช้: ${money(res.unapplied_amount)} บาท` : '';
            alert(`หักยอดสำเร็จ ${applied} บาท ใน ${count} บิล${group}${extra}`);
          });
        });
      });
  }

  function openPaymentSheet(lot) {
    openSheet(`จ่ายเงิน • ${lot.title}`, `
      <form id="feedOrderPaymentForm" class="feed-order-form">
        <input name="purchase_lot_id" type="hidden" value="${esc(lot.id)}"><input name="lot_id" type="hidden" value="${esc(lot.id)}">
        <label>วันที่จ่าย<input name="payment_date" type="date" value="${today()}" required></label>
        <label>จำนวนเงิน<input name="amount" type="number" min="0" step="0.01" max="${esc(lot.outstanding || lot.netValue)}" required></label>
        <label>วิธีจ่าย<input name="payment_method" type="text" placeholder="เงินสด / โอน / เครดิต"></label>
        <label>หมายเหตุ<textarea name="remark" rows="3"></textarea></label>
        <div class="sheet-footer-row"><button type="button" class="btn secondary" data-sheet-close>ยกเลิก</button><button class="btn primary" type="submit">บันทึกจ่ายเงิน</button></div>
      </form>`, async (sheet) => {
        sheet.querySelector('#feedOrderPaymentForm')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          await submitForm(e.currentTarget, 'กำลังบันทึก...', async (payload) => FeedOrderService.savePayment(payload));
        });
      });
  }

  function openClaimSheet(lot) {
    openSheet(`เคลม/คืน • ${lot.title}`, `
      <form id="feedOrderClaimForm" class="feed-order-form">
        <input name="purchase_lot_id" type="hidden" value="${esc(lot.id)}"><input name="lot_id" type="hidden" value="${esc(lot.id)}">
        <label>วันที่เคลม<input name="claim_date" type="date" value="${today()}" required></label>
        <div class="feed-order-form-grid">
          <label>จำนวนส่งคืน<input name="return_qty" type="number" min="0" step="0.01" required></label>
          <label>จำนวนรับกลับ<input name="replacement_qty" type="number" min="0" step="0.01"></label>
        </div>
        <label>ชื่ออาหารที่รับกลับ<input name="replacement_feed_name" type="text" value="${esc(lot.title)}"></label>
        <label>ราคาอาหารที่รับกลับ<input name="replacement_unit_price" type="number" min="0" step="0.01" value="${esc(lot.unitPrice)}"></label>
        <label>สาเหตุ / หมายเหตุ<textarea name="remark" rows="3" placeholder="เช่น อาหารมีกลิ่น / เปียก / คุณภาพไม่ดี"></textarea></label>
        <div class="sheet-footer-row"><button type="button" class="btn secondary" data-sheet-close>ยกเลิก</button><button class="btn primary" type="submit">บันทึกเคลม/คืน</button></div>
      </form>`, async (sheet) => {
        sheet.querySelector('#feedOrderClaimForm')?.addEventListener('submit', async (e) => {
          e.preventDefault();
          await submitForm(e.currentTarget, 'กำลังบันทึก...', async (payload) => FeedOrderService.saveClaim(payload));
        });
      });
  }

  function openDetailSheet(lot) {
    const allocationText = lot.allocationDestinations.length
      ? lot.allocationDestinations.map((a, idx) => `${idx + 1}. ${a.text}`).join('\\n')
      : 'ยังไม่ได้แบ่งเข้าเล้า';
    const paymentText = lot.paymentRows.length
      ? lot.paymentRows.map((p, idx) => `${idx + 1}. ${p.payment_date || '-'} • ${money(p.amount)} บาท${p.payment_method ? ' • ' + p.payment_method : ''}`).join('\\n')
      : '-';
    openSheet(`รายละเอียด • ${lot.title}`, `
      <div class="feed-order-detail-list">
        ${detailRow('วันที่ซื้อ', lot.purchaseDate || '-')}
        ${detailRow('Supplier', lot.supplier || '-')}
        ${detailRow('สถานะการแสดงผล', lot.isHidden ? 'ซ่อนไว้' : 'แสดงอยู่')}
        ${detailRow('จำนวนซื้อเข้า', `${fmt(lot.purchaseQty, 2)} ลูก`)}
        ${detailRow('จำนวนสุทธิ', `${fmt(lot.netQty, 2)} ลูก`)}
        ${detailRow('จำนวนแบ่งแล้ว', `${fmt(lot.allocated, 2)} ลูก`)}
        ${detailRow('แบ่งไป', allocationText)}
        ${detailRow('มูลค่าซื้อเข้า', `${money(lot.purchaseValue)} บาท`)}
        ${detailRow('มูลค่าสุทธิ', `${money(lot.netValue)} บาท`)}
        ${detailRow('จ่ายไปแล้ว', `${money(lot.paid)} บาท`)}
        ${detailRow('การจ่ายเงิน', paymentText)}
        ${detailRow('ค้างจ่าย', `${money(lot.outstanding)} บาท`)}
        ${detailRow('เคลม/คืน', lot.claimCount ? `${fmt(lot.claimCount)} รายการ • คืน ${fmt(lot.returnedQty, 2)} ลูก • รับคืน ${fmt(lot.replacementQty, 2)} ลูก` : '-')}
      </div>`);
  }

  function detailRow(label, value) {
    return `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`;
  }

  async function submitForm(form, loadingText, callback, onSuccess) {
    const btn = form.querySelector('button[type="submit"]');
    const oldText = btn?.textContent || '';
    const payload = formToObject(form);
    await withButton(btn, loadingText, async () => {
      const res = await callback(payload);
      if (!res || res.status !== 'ok') {
        alert(res?.message || 'บันทึกไม่สำเร็จ');
        return;
      }
      closeSheet();
      if (onSuccess) await onSuccess(res);
      await load({ force: true });
    }, oldText);
  }

  function formToObject(form) {
    const out = {};
    new FormData(form).forEach((value, key) => { out[key] = value; });
    form.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      out[input.name] = input.checked ? 1 : 0;
    });
    ['qty_total', 'unit_price', 'grand_total', 'qty_allocated', 'amount', 'return_qty', 'replacement_qty', 'replacement_unit_price', 'replacement_value'].forEach((key) => {
      if (out[key] != null && out[key] !== '') out[key] = Number(out[key]);
    });

    if (out.feed_order_id && !out.purchase_lot_id) out.purchase_lot_id = out.feed_order_id;
    if (out.purchase_lot_id && !out.lot_id) out.lot_id = out.purchase_lot_id;
    if (out.lot_id && !out.purchase_lot_id) out.purchase_lot_id = out.lot_id;
    delete out.feed_order_id;

    if (out.batch_id === 'outside') {
      out.destination_type = 'external';
      out.batch_id = '';
      out.create_feed_lot = 0;
    } else if (out.batch_id) {
      out.destination_type = 'batch';
    }
    return out;
  }

  async function withButton(button, loadingText, task, restoreText) {
    if (!button) return task();
    const oldText = restoreText || button.textContent;
    button.disabled = true;
    button.textContent = loadingText || oldText;
    try { return await task(); }
    finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  function openSheet(title, body, onReady) {
    closeSheet(true);
    const wrap = document.createElement('div');
    wrap.id = 'feedOrderDynamicSheet';
    wrap.className = 'sheet-root feed-order-sheet-root';
    wrap.innerHTML = `
      <div class="sheet-backdrop" data-sheet-close></div>
      <section class="sheet-panel feed-order-sheet-panel">
        <header class="sheet-header"><h3>${esc(title)}</h3><button type="button" class="icon-btn" data-sheet-close>×</button></header>
        <div class="sheet-body">${body}</div>
      </section>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', (event) => {
      if (event.target.closest('[data-sheet-close]')) closeSheet();
    });
    requestAnimationFrame(() => wrap.classList.add('show'));
    if (onReady) onReady(wrap);
  }

  function closeSheet(immediate = false) {
    const sheet = $('feedOrderDynamicSheet');
    if (!sheet) return;
    sheet.classList.remove('show');
    if (immediate) sheet.remove();
    else setTimeout(() => sheet.remove(), 180);
  }


  function getProgramMenuPermission(menuKey) {
    if (typeof window.AppAuth?.isAdminSession === 'function' && AppAuth.isAdminSession()) return 'write';
    const role = String(window.AppAuth?.getSession?.('role') || '').trim().toLowerCase();
    const admin = String(window.AppAuth?.getSession?.('is_admin') ?? '').trim().toLowerCase();
    if (role === 'admin' || role === 'system_admin' || admin === 'true' || admin === '1' || admin === 'yes') return 'write';
    return window.MenuPermissionApi?.permissionOf?.(menuKey) || 'none';
  }

  function canViewFeedOrder() {
    return state.permission === 'view' || state.permission === 'write' || getProgramMenuPermission('feed_order_bills') === 'write' || getProgramMenuPermission('feed_order_bills') === 'view';
  }

  function canWriteFeedOrder() {
    return state.permission === 'write' || getProgramMenuPermission('feed_order_bills') === 'write';
  }

  function applyPermissionUI() {
    const writable = canWriteFeedOrder();
    const openBtn = $('openLotBtn');
    const bulkBtn = $('openBulkPaymentBtn');
    const fab = $('feedOrderFab');
    if (openBtn) openBtn.hidden = !writable;
    if (bulkBtn) bulkBtn.hidden = !writable;
    if (fab) fab.hidden = !writable;
  }

  function renderAccessDenied(message) {
    setSubtitle(message || 'ไม่มีสิทธิ์เข้าถึงเมนูนี้');
    const summary = $('feedOrderSummary');
    const list = $('feedOrderList');
    if (summary) summary.innerHTML = '';
    if (list) list.innerHTML = `<div class="feed-order-empty">${esc(message || 'ไม่มีสิทธิ์เข้าถึงเมนูนี้')}</div>`;
    const openBtn = $('openLotBtn');
    const bulkBtn = $('openBulkPaymentBtn');
    const fab = $('feedOrderFab');
    if (openBtn) openBtn.hidden = true;
    if (bulkBtn) bulkBtn.hidden = true;
    if (fab) fab.hidden = true;
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (document.body?.dataset?.page === 'feed_order_bills') bootstrap();
  });

  return { bootstrap, load };
})();

//# sourceURL=js/services/feed-order.service.js


/* ==== js/modules/feed-order-bills-page.js ==== */
window.FeedOrderService = (() => {
  function normalizeActionText(res) {
    return String(res?.code || res?.message || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');
  }

  function shouldTryNextAction(res) {
    const text = normalizeActionText(res);
    return (
      !res ||
      text.includes('INVALID_ACTION') ||
      text.includes('UNKNOWN_ACTION') ||
      text.includes('ACTION_NOT_FOUND') ||
      text.includes('NOT_FOUND_ACTION')
    );
  }

  async function postAction(actions, payload = {}, options = {}) {
    const list = Array.isArray(actions) ? actions : [actions];
    let last = null;
    for (const action of list) {
      const res = await AppApi.post({ ...payload, action }, options);
      last = res;
      if (res && res.status === 'ok') return res;
      if (!shouldTryNextAction(res)) return res;
    }
    return last;
  }

  function normalizeLotPayload(payload = {}) {
    const out = { ...payload };
    if (out.feed_order_id && !out.purchase_lot_id) out.purchase_lot_id = out.feed_order_id;
    if (out.purchase_lot_id && !out.lot_id) out.lot_id = out.purchase_lot_id;
    if (out.lot_id && !out.purchase_lot_id) out.purchase_lot_id = out.lot_id;
    delete out.feed_order_id;
    return out;
  }

  function getPageData(options = {}) {
    const { include_hidden, ...apiOptions } = options || {};
    return postAction([
      'getFeedOrderBillPageData',
      'getFeedOrderBillsPageData',
      'getFeedOrderPageData'
    ], { include_hidden: include_hidden == null ? 0 : include_hidden }, { timeoutMs: 20000, ...apiOptions });
  }

  function saveLot(payload) {
    return postAction([
      'saveFeedOrderLot',
      'saveFeedOrderBill',
      'createFeedOrderBill',
      'createFeedOrderLot'
    ], payload, { timeoutMs: 25000, dedupe: false });
  }

  function allocate(payload) {
    return postAction([
      'allocateFeedOrderToBatch',
      'allocateFeedOrderBillToBatch',
      'allocateFeedOrderLot',
      'saveFeedOrderAllocation'
    ], normalizeLotPayload(payload), { timeoutMs: 25000, dedupe: false });
  }

  function savePayment(payload) {
    return postAction([
      'saveFeedOrderPayment',
      'recordFeedOrderPayment',
      'createFeedOrderPayment'
    ], normalizeLotPayload(payload), { timeoutMs: 25000, dedupe: false });
  }

  function previewBulkPayment(payload) {
    return postAction([
      'previewFeedOrderBulkPayment',
      'previewFeedOrderBulkPaymentPlan'
    ], payload, { timeoutMs: 25000, dedupe: false });
  }

  function saveBulkPayment(payload) {
    return postAction([
      'saveFeedOrderBulkPayment',
      'recordFeedOrderBulkPayment',
      'applyFeedOrderBulkPayment'
    ], payload, { timeoutMs: 35000, dedupe: false });
  }

  function setVisibility(payload) {
    return postAction([
      'setFeedOrderLotVisibility',
      'updateFeedOrderLotVisibility',
      'hideFeedOrderLot'
    ], normalizeLotPayload(payload), { timeoutMs: 25000, dedupe: false });
  }

  function saveClaim(payload) {
    return postAction([
      'saveFeedOrderClaim',
      'recordFeedOrderClaim',
      'createFeedOrderClaim'
    ], normalizeLotPayload(payload), { timeoutMs: 25000, dedupe: false });
  }

  return { getPageData, saveLot, allocate, savePayment, previewBulkPayment, saveBulkPayment, saveClaim, setVisibility };
})();

//# sourceURL=js/modules/feed-order-bills-page.js


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
