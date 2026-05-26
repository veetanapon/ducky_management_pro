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
