window.AppApi = (() => {
  const DEFAULT_TIMEOUT_MS = 15000;
  const COLD_START_TIMEOUT_MS = 45000;
  const WARMUP_TIMEOUT_MS = 45000;
  const IDLE_COLD_MS = 5 * 60 * 1000;

  const inflight = new Map();
  const writeInflight = new Map();
  let warmupPromise = null;

  const runtime = {
    lastSuccessAt: Number(sessionStorage.getItem('ducky:api:lastSuccessAt') || 0)
  };

  const READ_ACTIONS = new Set([
    'getAllBatches','getBatchFullDetail','getBatchDashboardSummary','getBatchManagePageData','getModuleCalendarData',
    'getSaleBillsForDate','getSaleBillRecord','getSaleBillRangeSummary','getEggDailyRecord','getFeedLogRecord',
    'getBatchAccessList','getBatchAccessSummary','getPermissionAdminOptions','getItemPriceAdminData','getPriceSetDetail',
    'getEffectiveEggPriceSet','getPreBillRecord','getReportPageData','getLiffBatchRoutePageData','getBatchEventsPageData',
    'getReportPublicViewData'
  ]);

  const WRITE_ACTIONS = new Set([
    'add_batch','edit_batch','delete_batch','saveBatchMovement','saveBatchSaleBill','deleteBatchSaleBill','saveFeedLog',
    'saveEggDailyLog','approvePreBill','rejectPreBill','upsertBatchModulePermission','revokeBatchUserPermissions',
    'saveLiffBatchRoute','deactivateLiffBatchRoute','savePriceSet','savePriceSetBinding','removePriceSetBinding','deletePriceSet',
    'rebuildReportForBatch','saveFeedConsumptionLog','approvePreFeedConsumption','rejectPreFeedConsumption','saveBatchEvent','saveMedicalInventoryLog','deleteBatchEvent','createReportViewLink'
  ]);

  const CACHE_TTL = {
    getAllBatches: 5 * 60 * 1000,
    getBatchDashboardSummary: 60 * 1000,
    getBatchManagePageData: 60 * 1000,
    getModuleCalendarData: 60 * 1000,
    getEffectiveEggPriceSet: 12 * 60 * 60 * 1000,
    getPermissionAdminOptions: 5 * 60 * 1000,
    getItemPriceAdminData: 5 * 60 * 1000,
    getReportPageData: 2 * 60 * 1000,
    getLiffBatchRoutePageData: 2 * 60 * 1000,
    getBatchEventsPageData: 60 * 1000
  };

  function stableKey(payload) {
    return Object.keys(payload || {})
      .sort()
      .map((k) => `${k}:${JSON.stringify(payload[k])}`)
      .join('|');
  }

  function cacheKey(body) {
    return `ducky:api:${String(body.action || '')}:${btoa(unescape(encodeURIComponent(stableKey(body)))).slice(0, 160)}`;
  }

  function isColdConnection() {
    const last = Number(runtime.lastSuccessAt || 0);
    return !last || Date.now() - last > IDLE_COLD_MS;
  }

  function markConnectionWarm() {
    runtime.lastSuccessAt = Date.now();
    try { sessionStorage.setItem('ducky:api:lastSuccessAt', String(runtime.lastSuccessAt)); } catch (_) {}
  }

  function resolveTimeout(payload = {}, options = {}) {
    const action = String(payload.action || '');
    const explicit = Number(options.timeoutMs || 0);

    if (action === 'ping' || action === 'warmup') {
      return explicit > 0 ? explicit : WARMUP_TIMEOUT_MS;
    }

    // The first Apps Script request after idle can spend 20-40s in Initial
    // connection / redirect / cold runtime before GAS even starts work.
    if (isColdConnection() && options.adaptive !== false) {
      return Math.max(explicit || 0, COLD_START_TIMEOUT_MS);
    }

    return explicit > 0 ? explicit : DEFAULT_TIMEOUT_MS;
  }

  async function fetchJson(payload = {}, options = {}) {
    const timeoutMs = resolveTimeout(payload, options);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(AppConfig.GAS_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const json = await response.json();
      markConnectionWarm();
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
      await new Promise((r) => setTimeout(r, Number(options.retryDelayMs || 350)));
      return await fetchJson(payload, options);
    }
  }

  async function warmup(meta = {}) {
    if (!isColdConnection()) return { status: 'ok', skipped: true, warm: true };
    if (warmupPromise) return warmupPromise;

    warmupPromise = fetchWithRetry({
      action: 'ping',
      client_time: new Date().toISOString(),
      page: document.body?.dataset?.page || '',
      reason: typeof meta === 'string' ? meta : (meta.reason || 'warmup')
    }, {
      timeoutMs: WARMUP_TIMEOUT_MS,
      adaptive: false,
      silent: true
    })
      .then((json) => {
        if (json?.status === 'ok') markConnectionWarm();
        return json;
      })
      .catch((error) => {
        if (!meta?.silent && error?.name !== 'AbortError') console.warn('API warmup failed:', error);
        return { status: 'error', message: error?.name === 'AbortError' ? 'request_timeout' : (error?.message || 'network_error') };
      })
      .finally(() => { warmupPromise = null; });

    return warmupPromise;
  }

  async function post(payload = {}, options = {}) {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return null;

    const body = { session_token: AppAuth.getSession(), ...payload };
    const action = String(payload.action || '');
    const isRead = READ_ACTIONS.has(action);
    const isWrite = WRITE_ACTIONS.has(action);
    const allowDedupe = options.dedupe !== false;
    const key = stableKey(body);

    if (allowDedupe && isRead && inflight.has(key)) return inflight.get(key);
    if (allowDedupe && isWrite && writeInflight.has(key)) return writeInflight.get(key);

    const task = (async () => {
      try {
        const json = await fetchWithRetry(body, options);
        if (json?.code === 'SESSION_EXPIRED' || json?.status === 'session_expired') {
          const refreshed = await AppAuth.silentRefreshSession();
          if (!refreshed) { AppAuth.redirectLogin(); return null; }
          return post(payload, { ...options, dedupe: false });
        }
        if (isWrite && json?.status === 'ok' && window.AppCache) AppCache.invalidateByPayload(payload);
        return json;
      } catch (error) {
        const isAbort = error?.name === 'AbortError';
        if (!isAbort && !options.silent) console.error('API error:', error);
        return {
          status: 'error',
          code: isAbort ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
          message: isAbort ? 'request_timeout' : (error?.message || 'network_error')
        };
      } finally {
        if (allowDedupe && isRead) inflight.delete(key);
        if (allowDedupe && isWrite) setTimeout(() => writeInflight.delete(key), 500);
      }
    })();

    if (allowDedupe && isRead) inflight.set(key, task);
    if (allowDedupe && isWrite) writeInflight.set(key, task);
    return task;
  }

  async function postPublic(payload = {}, options = {}) {
    try {
      return await fetchWithRetry(payload, options);
    } catch (error) {
      const isAbort = error?.name === 'AbortError';
      if (!isAbort && !options.silent) console.error('API public error:', error);
      return {
        status: 'error',
        code: isAbort ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
        message: isAbort ? 'request_timeout' : (error?.message || 'network_error')
      };
    }
  }

  async function postCached(payload = {}, { ttlMs, background = false, onUpdate, allowStale = false, timeoutMs } = {}) {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return null;

    const body = { session_token: AppAuth.getSession(), ...payload };
    const action = String(payload.action || '');
    const ttl = ttlMs ?? CACHE_TTL[action] ?? 0;
    const key = cacheKey(body);

    let cached = null;
    if (ttl > 0 && window.AppCache) {
      cached = AppCache.readEnvelope(key, ttl, null);
      if (!cached && allowStale && AppCache.read) {
        const envelope = AppCache.read(key, null);
        cached = envelope && typeof envelope === 'object' && Object.prototype.hasOwnProperty.call(envelope, 'value') ? envelope.value : null;
      }
    }

    if (cached && background) {
      post(payload, { timeoutMs, silent: true }).then((fresh) => {
        if (fresh?.status === 'ok') {
          AppCache.writeEnvelope(key, fresh);
          if (typeof onUpdate === 'function') onUpdate(fresh);
        }
      });
      return cached;
    }

    if (cached) return cached;

    const fresh = await post(payload, { timeoutMs });
    if (fresh?.status === 'ok' && ttl > 0 && window.AppCache) AppCache.writeEnvelope(key, fresh);
    return fresh;
  }

  return {
    post,
    postPublic,
    postCached,
    warmup,
    READ_ACTIONS,
    WRITE_ACTIONS,
    isColdConnection
  };
})();
