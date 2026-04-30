(() => {
  const state = { routeKey: '', profile: null, bootstrap: null };
  const qs = (id) => document.getElementById(id);
  const today = () => new Date().toISOString().slice(0, 10);
  const num = (id) => Number(qs(id)?.value || 0);
  function setStatus(text) { qs('statusText').textContent = text || ''; }
  async function init() {
    const params = new URLSearchParams(location.search);
    state.routeKey = params.get('route') || params.get('rt') || params.get('route_key') || '';
    qs('logDate').value = today();
    if (!state.routeKey) { setStatus('ลิงก์นี้ไม่มี route_key กรุณาใช้ลิงก์ที่เจ้าของสร้างให้'); qs('submitBtn').disabled = true; return; }
    try {
      if (window.liff && AppConfig.LIFF_ID) {
        await liff.init({ liffId: AppConfig.LIFF_ID });
        if (liff.isInClient()) liff.window.setLayout('tall');
        if (liff.isLoggedIn()) { try { state.profile = await liff.getProfile(); } catch (_) {} }
      }
    } catch (error) { console.warn('LIFF init failed', error); }
    const res = await AppApi.postPublic({ action: 'getLiffRouteBootstrap', route_key: state.routeKey });
    if (!res || res.status !== 'ok') { setStatus(res?.message || 'โหลดข้อมูลลิงก์ไม่สำเร็จ'); qs('submitBtn').disabled = true; return; }
    state.bootstrap = res;
    qs('routeBadge').textContent = res.route?.route_name || state.routeKey;
    qs('batchName').textContent = `${res.batch?.name || '-'} • ${res.batch?.id || ''}`;
    qs('priceNote').textContent = res.price_set ? `ใช้ชุดราคา: ${res.price_set.name || '-'} • ${res.price_items?.length || 0} รายการ` : 'ยังไม่พบชุดราคาที่ผูกกับ batch นี้';
    setStatus('');
  }
  async function onSubmit(event) {
    event.preventDefault();
    const rawMessage = qs('rawMessage').value.trim();
    const eggDaily = { qty_all: num('qty_all'), qty_cracked: num('qty_cracked'), qty_big: num('qty_big'), qty_small: num('qty_small'), qty_broken: num('qty_broken'), qty_remain: num('qty_remain') };
    if (!Object.values(eggDaily).some((v) => Number(v) > 0) && !rawMessage) { alert('กรุณากรอกจำนวนไข่ หรือรายการส่งขายอย่างน้อย 1 อย่าง'); return; }
    const btn = qs('submitBtn'); btn.disabled = true; btn.textContent = 'กำลังบันทึก...'; setStatus('กำลังส่งข้อมูล');
    const res = await AppApi.postPublic({ action: 'createLiffPreBill', route_key: state.routeKey, log_date: qs('logDate').value || today(), buyer: qs('buyer').value.trim(), raw_message: rawMessage, egg_daily: eggDaily, line_user_id: state.profile?.userId || '', line_display_name: state.profile?.displayName || '' });
    btn.disabled = false; btn.textContent = 'บันทึกข้อมูล';
    if (!res || res.status !== 'ok') { setStatus(res?.message || 'บันทึกไม่สำเร็จ'); alert(res?.message || 'บันทึกไม่สำเร็จ'); return; }
    setStatus(`บันทึกสำเร็จ${res.pre_bill_id ? ' • PreBill ' + res.pre_bill_id : ''}`);
    alert(`บันทึกสำเร็จ\n${res.pre_bill_id ? 'PreBill: ' + res.pre_bill_id + '\n' : ''}ยอดรวม ${Number(res.grand_total || 0).toLocaleString()} บาท`);
    event.target.reset(); qs('logDate').value = today();
    if (window.liff?.isInClient?.()) setTimeout(() => liff.closeWindow(), 900);
  }
  document.addEventListener('DOMContentLoaded', () => { init(); qs('liffWorkerForm')?.addEventListener('submit', onSubmit); });
})();
