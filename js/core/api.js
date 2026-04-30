window.AppApi = (() => {
  const DEFAULT_TIMEOUT_MS = 18000;
  const inflight = new Map();
  const READ_ACTIONS = new Set(['getAllBatches','getBatchFullDetail','getBatchDashboardSummary','getBatchManagePageData','getModuleCalendarData','getSaleBillsForDate','getSaleBillRecord','getSaleBillRangeSummary','getEggDailyRecord','getFeedLogRecord','getBatchAccessList','getBatchAccessSummary','getPermissionAdminOptions','getItemPriceAdminData','getPriceSetDetail','getEffectiveEggPriceSet','getPreBillRecord']);
  function stableKey(payload) { return Object.keys(payload || {}).sort().map((k) => `${k}:${JSON.stringify(payload[k])}`).join('|'); }
  async function fetchJson(payload = {}, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(AppConfig.GAS_URL, { method: 'POST', body: JSON.stringify(payload), signal: controller.signal });
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  async function fetchWithRetry(payload, options = {}) {
    try { return await fetchJson(payload, options); }
    catch (error) { if (error?.name === 'AbortError') throw error; await new Promise((r) => setTimeout(r, 350)); return await fetchJson(payload, options); }
  }
  async function post(payload = {}) {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return null;
    const body = { session_token: AppAuth.getSession(), ...payload };
    const dedupe = READ_ACTIONS.has(String(payload.action || ''));
    const key = dedupe ? stableKey(body) : '';
    if (dedupe && inflight.has(key)) return inflight.get(key);
    const task = (async () => {
      try {
        const json = await fetchWithRetry(body);
        if (json?.code === 'SESSION_EXPIRED' || json?.status === 'session_expired') {
          const refreshed = await AppAuth.silentRefreshSession();
          if (!refreshed) { AppAuth.redirectLogin(); return null; }
          return post(payload);
        }
        return json;
      } catch (error) {
        console.error('API error:', error);
        return { status: 'error', message: error?.name === 'AbortError' ? 'request_timeout' : (error?.message || 'network_error') };
      } finally { if (dedupe) inflight.delete(key); }
    })();
    if (dedupe) inflight.set(key, task);
    return task;
  }
  async function postPublic(payload = {}) {
    try { return await fetchWithRetry(payload); }
    catch (error) { console.error('API public error:', error); return { status: 'error', message: error?.name === 'AbortError' ? 'request_timeout' : (error?.message || 'network_error') }; }
  }
  return { post, postPublic };
})();
