//================= NEW AUTH ================= */
const REFRESH_BEFORE_MS = 5 * 60 * 1000; // 5 นาที
let refreshing = false;
let refreshQueue = [];
let _refreshing = false;

// ================= LOGIN GUARD =================
(function guardLoginPage() {
  if (!location.pathname.includes('login')) return;

  try {
    const session = JSON.parse(sessionStorage.getItem('session') || 'null');
    if (!session?.session_token || !session?.session_expire) return;

    const expireAt = new Date(session.session_expire).getTime();
    if (expireAt > Date.now()) {
      // ✅ session ยังอยู่ → ไม่ต้อง login
      location.href = 'index.html';
    }
  } catch (e) {
    // ignore
  }
})();

/* ================= SESSION STORAGE ================= */
function getSession(session_name='session_token') {
  return JSON.parse(sessionStorage.getItem(session_name) || 'null');
}

function clearSession() {
  sessionStorage.removeItem('session_token');
  sessionStorage.removeItem('user_id');
  sessionStorage.removeItem('session_expire');
  sessionStorage.removeItem('vehicles');
}

/* ================= CHECK SESSION ================= */
async function ensureAuth() {
  const session_token = getSession();
  //console.log(session_token);
  // ❌ ไม่มี session → login
  if (!session_token) {
    redirectLogin();
    return false;
  }

  const expireAt = new Date(getSession('session_expire')).getTime();
  const now = Date.now();

  // ✅ ยังไม่ใกล้หมด
  if (expireAt - now > REFRESH_BEFORE_MS) {
    return true;
  }

  // 🔁 ใกล้หมด → silent refresh
  return await silentRefreshSession();
}

/* ================= SILENT REFRESH ================= */

async function silentRefreshSession() {
  if (_refreshing) return false;
  _refreshing = true;

  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'refresh_session',
        session_token: getSession()
      })
    });

    const json = await res.json();

    if (json?.status === 'ok' && json.session_token) {
      sessionStorage.setItem('session_token', json.session_token);
      sessionStorage.setItem('session_expire', json.session_expire);
      sessionStorage.setItem('user_id', json.user_id);
      return true;
    }

    return false;
  } catch (e) {
    return false;
  } finally {
    _refreshing = false;
  }
}

function redirectLogin() {
  clearSession();
  if (!location.pathname.includes('login')) {
    location.href = 'login.html';
  }
}

/* ================= LOGIN ================= */

async function login() {
  const emailInput = document.getElementById('email');
  const statusEl = document.getElementById('status');
  const loginEl = document.getElementById('submitLogin');
  loginEl.disabled = true;
  loginEl.style.background = '#8b8b8b';
  statusEl.innerText = 'กำลังเข้าใช้งาน...';

  const email = emailInput.value.trim();
  if (!email) {
    statusEl.innerText = 'กรุณากรอกอีเมล';
    return;
  }
  //console.log('Logging in with email:', email);

  let device_id = localStorage.getItem('device_id');
  if (!device_id) {
    device_id = crypto.randomUUID();
    localStorage.setItem('device_id', device_id);
  }

  const payload = {
    action: 'auth',
    email,
    device_id
  };
  try {
    const res = await fetch(GAS_URL, {
      method: 'POST',
        body: JSON.stringify(payload)
    });

    const json = await res.json();
    //console.log('Login response:', json);

    if (json.status === 'ok') {
      sessionStorage.setItem('user_id', JSON.stringify(json.user_id));
      sessionStorage.setItem('session_token', JSON.stringify(json.session_token));
      sessionStorage.setItem('session_expire', JSON.stringify(json.session_expire));

      setTimeout(() => {
        location.href = 'index.html';
      }, 500);
    } else {
      statusEl.innerText = 'อีเมลไม่ถูกต้อง';
    }
  } catch (err) {
    statusEl.innerText = 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ';
  }
  loginEl.disabled = false;
}