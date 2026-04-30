(() => {
  const state = { routeKey: '', profile: null, profileReady: null };
  const qs = (id) => document.getElementById(id);
  const today = () => new Date().toISOString().slice(0, 10);
  const num = (id) => Number(qs(id)?.value || 0);

  function setStatus(text) {
    const el = qs('statusText');
    if (el) el.textContent = text || '';
  }

  function parseRouteFromSearch(search) {
    const params = new URLSearchParams(search || '');
    return params.get('route') || params.get('rt') || params.get('route_key') || '';
  }

  function getRouteKey() {
    let route = parseRouteFromSearch(location.search);
    if (route) return route.trim();

    const params = new URLSearchParams(location.search || '');
    const liffState = params.get('liff.state');
    if (liffState) {
      try {
        const decoded = decodeURIComponent(liffState);
        route = parseRouteFromSearch(decoded.includes('?') ? decoded.slice(decoded.indexOf('?')) : decoded);
        if (route) return route.trim();
      } catch (_) {}
    }
    return '';
  }

  async function initLiffProfileInBackground() {
    try {
      if (!window.liff || !AppConfig.LIFF_ID) return;
      await liff.init({ liffId: AppConfig.LIFF_ID });
      if (liff.isInClient()) liff.window.setLayout('tall');
      if (liff.isLoggedIn()) {
        try { state.profile = await liff.getProfile(); } catch (_) {}
      }
    } catch (error) {
      console.warn('LIFF init skipped/failed', error);
    }
  }

  function init() {
    state.routeKey = getRouteKey();
    qs('logDate').value = today();

    if (!state.routeKey) {
      qs('routeBadge').textContent = 'ลิงก์ไม่ถูกต้อง';
      qs('batchName').textContent = 'ไม่พบ route_key กรุณาใช้ลิงก์ที่เจ้าของสร้างให้';
      setStatus('ลิงก์นี้ไม่มี route_key');
      qs('submitBtn').disabled = true;
      return;
    }

    qs('routeBadge').textContent = 'พร้อมบันทึก';
    qs('batchName').textContent = 'ข้อมูลจะถูกส่งไปตรวจสอบ';
    setStatus('');

    // Do not block the form with route/batch/price loading. Backend resolves those on submit.
    state.profileReady = initLiffProfileInBackground();
  }

  async function onSubmit(event) {
    event.preventDefault();

    const rawMessage = qs('rawMessage').value.trim();
    const eggDaily = {
      qty_all: num('qty_all'),
      qty_cracked: num('qty_cracked'),
      qty_big: num('qty_big'),
      qty_small: num('qty_small'),
      qty_broken: num('qty_broken'),
      qty_remain: num('qty_remain')
    };

    if (!Object.values(eggDaily).some((v) => Number(v) > 0) && !rawMessage) {
      alert('กรุณากรอกจำนวนไข่ หรือรายการส่งขายอย่างน้อย 1 อย่าง');
      return;
    }

    const btn = qs('submitBtn');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';
    setStatus('กำลังส่งข้อมูล');

    if (state.profileReady) {
      await Promise.race([state.profileReady, new Promise((resolve) => setTimeout(resolve, 250))]);
    }

    const res = await AppApi.postPublic({
      action: 'createLiffPreBill',
      route_key: state.routeKey,
      log_date: qs('logDate').value || today(),
      raw_message: rawMessage,
      egg_daily: eggDaily,
      line_user_id: state.profile?.userId || '',
      line_display_name: state.profile?.displayName || ''
    });

    btn.disabled = false;
    btn.textContent = 'บันทึกข้อมูล';

    if (!res || res.status !== 'ok') {
      const message = res?.message || 'บันทึกไม่สำเร็จ';
      setStatus(message);
      alert(message);
      return;
    }

    setStatus('บันทึกสำเร็จแล้ว');
    alert('บันทึกสำเร็จแล้ว');
    event.target.reset();
    qs('logDate').value = today();

    if (window.liff?.isInClient?.()) setTimeout(() => liff.closeWindow(), 700);
  }

  document.addEventListener('DOMContentLoaded', () => {
    init();
    qs('liffWorkerForm')?.addEventListener('submit', onSubmit);
  });
})();
