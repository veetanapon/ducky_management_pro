window.AppAuth = (() => {
  const REFRESH_BEFORE_MS = 5 * 60 * 1000;
  let refreshing = false;

  function getSession(name = 'session_token') {
    try {
      return JSON.parse(sessionStorage.getItem(name) || 'null');
    } catch (error) {
      return null;
    }
  }

  function setSession(payload) {
    sessionStorage.setItem('user_id', JSON.stringify(payload.user_id));
    sessionStorage.setItem('session_token', JSON.stringify(payload.session_token));
    sessionStorage.setItem('session_expire', JSON.stringify(payload.session_expire));
    sessionStorage.setItem('role', JSON.stringify(payload.role || 'guest'));
    sessionStorage.setItem('is_admin', JSON.stringify(!!payload.is_admin));
    sessionStorage.setItem('display_name', JSON.stringify(payload.display_name || ''));
    sessionStorage.setItem('farm_name', JSON.stringify(payload.farm_name || ''));
    sessionStorage.setItem('bill_note', JSON.stringify(payload.bill_note || ''));

    if (window.AppState) {
      AppState.merge({
        auth: {
          userId: payload.user_id,
          sessionToken: payload.session_token,
          sessionExpire: payload.session_expire
        }
      });
    }
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
  }

  async function ensureAuth() {
    const sessionToken = getSession();
    if (!sessionToken) {
      redirectLogin();
      return false;
    }

    const expireAt = new Date(getSession('session_expire')).getTime();
    if (!expireAt || Number.isNaN(expireAt)) {
      redirectLogin();
      return false;
    }

    if (expireAt - Date.now() > REFRESH_BEFORE_MS) {
      return true;
    }

    return await silentRefreshSession();
  }

  async function silentRefreshSession() {
    if (refreshing) return false;
    refreshing = true;

    try {
      const json = await AppApi.postPublic({
        action: 'refresh_session',
        session_token: getSession()
      });

      if (json?.status === 'ok' && json.session_token) {
        setSession(json);
        return true;
      }
      return false;
    } catch (error) {
      return false;
    } finally {
      refreshing = false;
    }
  }

  function redirectLogin() {
    clearSession();
    if (!location.pathname.includes('login.html')) {
      location.href = 'login.html';
    }
  }

  function logout() {
    clearSession();
    if (window.AppCache) AppCache.clearBatchCache();
    redirectLogin();
  }

  async function login(email, deviceName) {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = crypto.randomUUID();
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
    const expireAt = new Date(getSession('session_expire')).getTime();

    if (token && expireAt > Date.now()) {
      location.href = 'index.html';
      return;
    }

    const form = document.getElementById('loginForm');
    const status = document.getElementById('status');
    const button = document.getElementById('submitLogin');
    if (!form) return;

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
        location.href = 'index.html';
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
    bootstrapLoginPage
  };
})();
