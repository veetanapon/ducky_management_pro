window.AppApi = (() => {
  async function post(payload = {}) {
    const ok = await AppAuth.ensureAuth();
    if (!ok) return null;

    const body = {
      session_token: AppAuth.getSession(),
      ...payload
    };

    try {
      const response = await fetch(AppConfig.GAS_URL, {
        method: 'POST',
        body: JSON.stringify(body)
      });

      const json = await response.json();

      if (json?.code === 'SESSION_EXPIRED' || json?.status === 'session_expired') {
        const refreshed = await AppAuth.silentRefreshSession();
        if (!refreshed) {
          AppAuth.redirectLogin();
          return null;
        }
        return post(payload);
      }

      return json;
    } catch (error) {
      console.error('API error:', error);
      return {
        status: 'error',
        message: error?.message || 'network_error'
      };
    }
  }

  async function postPublic(payload = {}) {
    try {
      const response = await fetch(AppConfig.GAS_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      return await response.json();
    } catch (error) {
      console.error('API public error:', error);
      return {
        status: 'error',
        message: error?.message || 'network_error'
      };
    }
  }

  return { post, postPublic };
})();
