/* ================= GLOBAL ================= */
let imageBase64 = null;
let currentEditVid = null;
const MONTHS_TH = [
  "มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน",
  "กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"
];
function buildWheel(el, values, defaultIndex = 0) {
  el.innerHTML = "";
  values.forEach((v, i) => {
    const div = document.createElement("div");
    div.className = "wheel-item";
    div.innerText = v;
    el.appendChild(div);
  });

  el.scrollTop = defaultIndex * 40;
  updateActive(el);

  el.addEventListener("scroll", () => {
    clearTimeout(el._t);
    el._t = setTimeout(() => updateActive(el), 80);
  });
}

function updateActive(el) {
  const index = Math.round(el.scrollTop / 40);
  [...el.children].forEach((c, i) =>
    c.classList.toggle("active", i === index)
  );
}

function getWheelValue(el) {
  return Math.round(el.scrollTop / 40);
}

/* ================= API ================= */
async function apiFetch(url, options = {}) {
  await ensureAuth(); // เช็คว่ามี session_token ไหม / หมดอายุรึยัง
  const sessionToken = sessionStorage.getItem('session_token');

  // clone options กัน side effect
  const opts = Object.assign({}, options);
  opts.method = opts.method || 'POST';

  // --- แนบ session_token แบบปลอด CORS ---
  let body = {};
  if (opts.body) {
    try {
      body = typeof opts.body === 'string'
        ? JSON.parse(opts.body)
        : opts.body;
    } catch (e) {
      body = {};
    }
  }
  opts.body = JSON.stringify({
    session_token: sessionToken,
    ...body
  });

  try {
    const res = await fetch(url, options);
    const json = await res.json();

    // --- session หมดอายุ ---
    if (json?.code === 'SESSION_EXPIRED' || json?.status === 'session_expired') {
      const refreshed = await silentRefreshSession();

      if (refreshed) {
        // 🔁 retry ครั้งเดียว
        return apiFetch(url, options);
      }

      // refresh ไม่ผ่าน → ไป login
      redirectToLogin();
      return null;
    }

    return json;

  } catch (err) {
    console.error('Fetch error:', err);

    return {
      status: 'error',
      message: err.message || 'network_error'
    };
  }
  // try {
  //   const res = await fetch(url, options);
  //   const json = await res.json();

  //   if (json && json.status === 'session_expired') {
  //     window.location.href = `${GAS_URL}?action=auth&uid=${USER_ID}`;
  //     return null;
  //   }
  //   return json;
  // } catch (err) {
  //   console.error("Fetch error:", err);
  //   // กรณีที่ fetch พังเพราะ CORS หรือ Network
  //   return { status: 'error', message: err.message };
  // }
}

async function loadCars() {
  const list = document.getElementById('carList');
  if (!list) return;
  // 1. โชว์ Skeleton
  if (list.innerHTML.trim() === "") renderSkeleton(3);

  payload = {
    action: 'getAllVehicles',
    session_token: getSession()
  };
  // 2. ดึงข้อมูลครั้งเดียว (Single API Call)
  //const json = await apiFetch(`${GAS_URL}?action=vehicles`);
  const json = await apiFetch(GAS_URL, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
  if (!json || !Array.isArray(json.vehicles)) {
    list.innerHTML = '<p>ไม่พบข้อมูลรถ</p>';
    return;
  }
  // 3. สร้าง HTML ของ Card ทั้งหมดในลูปเดียว
  let allCardsHTML = "";
  sessionStorage.setItem('vehicles', JSON.stringify(json.vehicles)); // เก็บสำรองไว้ใช้ที่อื่นได้
  json.vehicles.forEach(v => {
    const img = v.imgId 
      ? `https://drive.google.com/thumbnail?id=${v.imgId}&sz=w400` 
      : 'https://via.placeholder.com/400x200?text=No+Image';

    const lastOdo = Number(v.summary?.last_odometer || 0);
    const totalCost = Number(v.summary?.total_cost || 0);
    
    allCardsHTML += `
      <div class="swipe-wrap" id="card-${v.vid}">
        <div class="swipe-actions">
          <div class="swipe-btn edit" onclick="editVehicle('${v.vid}')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
          </div>
          <div class="swipe-btn delete" onclick="deleteVehicle(event, '${v.vid}')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
          </div>
        </div>
        <div class="car-card compact swipe-content" onclick="openVehicle('${v.vid}')">
          <div class="car-thumb"><img src="${img}"></div>
          <div class="car-info">
            <div class="car-header-row">
               <span class="car-title">${v.name}</span>
               <span class="car-subtitle">(${v.brand || ''} ${v.model || ''})</span>
            </div>
            <div class="car-stats-row">
              <div class="car-stat">
                <span class="label">เลขไมล์ปัจจุบัน</span>
                <span class="value">${lastOdo.toLocaleString()} <small>km</small></span>
              </div>
              <div class="car-stat text-right">
                <span class="label">ค่าใช้จ่ายรวม</span>
                <span class="value">${totalCost.toLocaleString()} <small>฿</small></span>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  });
  
  list.innerHTML = allCardsHTML;
}

function openVehicle(vid) {
  window.location.href = `vehicle.html?vid=${vid}`;
}

function openAddVehicle() {
  currentEditVid = null;
  // Reset Form
  document.getElementById('v_name').value = '';
  document.getElementById('v_brand').value = '';
  document.getElementById('v_model').value = '';
  document.getElementById('v_odometer').value = '';
  document.getElementById('v_type').value = 'FUEL'; // Default ให้ตรงกับ value ใน HTML
  
  // แก้ไขจุดที่ Error: ใช้ span แทน h3 ให้ตรงกับ HTML ของคุณ
  const headerSpan = document.querySelector('.sheet-header span');
  if (headerSpan) headerSpan.innerText = "เพิ่มรถใหม่";

  const btn = document.querySelector('.sheet-body button:last-child');
  if (btn) {
    btn.innerText = "บันทึกข้อมูล";
    btn.onclick = () => submitVehicle('add_vehicle');
  }

  const s = document.getElementById('addSheet');
  s.classList.remove('hidden');
  requestAnimationFrame(() => s.classList.add('show'));
}

function closeAddVehicle() {
  const s = document.getElementById('addSheet');
  s.classList.remove('show');
  setTimeout(() => {
    s.classList.add('hidden');
    // Clear ข้อมูลหลังปิด
    imageBase64 = null;
    currentEditVid = null;
    document.getElementById('imagePreview').src = '';
    document.getElementById('imagePreview').classList.add('hidden');
  }, 300);
}

/* ================= VEHICLE ================= */
async function submitVehicle(mode = 'add_vehicle') {
  if (!v_name.value || !v_brand.value) {
    alert("กรุณากรอกชื่อและยี่ห้อรถ");
    return;
  }

  const btn = document.querySelector('.sheet-body button:last-child');
  const originalText = btn.innerText;
  btn.innerText = "กำลังประมวลผล...";
  btn.disabled = true;

  const data = {
    action: mode,
    // uid: USER_ID,
    vid: currentEditVid, // จะเป็น NULL ถ้าเป็น add_vehicle
    name: v_name.value.trim(),
    brand: v_brand.value.trim(),
    model: v_model.value.trim(),
    vehicle_type: v_type.value.toUpperCase(),
    initial_odometer: Number(v_odometer.value) || 0,
    image_base64: imageBase64 // ถ้าไม่ได้เลือกใหม่ จะส่ง NULL ไป (Backend จะใช้รูปเดิม)
  };

  try {
    const json = await apiFetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (json && json.status === 'ok') {
      alert(mode === 'add_vehicle' ? 'เพิ่มรถเรียบร้อย' : 'แก้ไขข้อมูลสำเร็จ');
      closeAddVehicle();
      loadCars();
    } else {
      throw new Error(json?.message || 'Error');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาด: ' + err.message);
  } finally {
    btn.innerText = originalText;
    btn.disabled = false;
  }
}

function toBase64(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.readAsDataURL(file);
  });
}

/* ================= IMAGE ================= */
function resizeImage(base64, maxW, maxH, cb) {
  const img = new Image();
  img.onerror = () => {
    alert('ไม่สามารถโหลดรูปภาพได้');
  };
  img.onload = () => {
    let { width, height } = img;

    if (width > maxW || height > maxH) {
      const scale = Math.min(maxW / width, maxH / height);
      width *= scale;
      height *= scale;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    cb(canvas.toDataURL('image/png', 0.85));
  };
  img.src = base64;
}

/* ================= IMAGE HANDLER (UPDATED) ================= */
const vehicleInput = document.getElementById('vehicleImage');
if (vehicleInput) { // ตรวจสอบก่อนว่ามีไหม (ในหน้า vehicle.html จะไม่มี)
    vehicleInput.addEventListener('change', e => {
        const file = e.target.files[0];
        const preview = document.getElementById('imagePreview');
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            resizeImage(event.target.result, 400, 300, (resizedBase64) => {
                imageBase64 = resizedBase64;
                if(preview) {
                    preview.src = resizedBase64;
                    preview.classList.remove('hidden');
                }
            });
        };
        reader.readAsDataURL(file);
    });
}
// document.getElementById('vehicleImage').addEventListener('change', e => {
//   const file = e.target.files[0];
//   const preview = document.getElementById('imagePreview');

//   if (!file) return;

//   const reader = new FileReader();
//   reader.onload = (event) => {
//     // ใช้ฟังก์ชัน resizeImage ที่คุณมีอยู่แล้ว เพื่อบีบอัดให้เหลือขนาดไม่เกิน 800px
//     resizeImage(event.target.result, 400, 300, (resizedBase64) => {
//       imageBase64 = resizedBase64;
//       preview.src = resizedBase64;
//       preview.classList.remove('hidden');
//     });
//   };
//   reader.readAsDataURL(file);
// });

/* ================= NOTIFICATION ================= */
async function loadNotifications() {
  const json = await apiFetch(
    `${GAS_URL}?action=notifications`
  );
  if (!json) return;
  alert(json.notifications.map(n => n[4] + '\n' + n[5]).join('\n\n'));
}

const THEMES = ['theme-dark'];

function applyTheme(theme) {
  document.body.classList.toggle('theme-dark', theme === 'theme-dark');
  localStorage.setItem('theme', theme);
}

function toggleTheme() {
  const current = localStorage.getItem('theme') || 'light';
  const next = current === 'light' ? 'theme-dark' : 'light';
  applyTheme(next);
}

function renderSkeleton(count = 3) {
  const list = document.getElementById('carList');
  list.innerHTML = '';

  for (let i = 0; i < count; i++) {
    list.innerHTML += `
      <div class="skeleton-wrap">
        <div class="car-card skeleton-card">
          <div class="skeleton skeleton-thumb"></div>
          <div style="flex:1">
            <div class="skeleton skeleton-line long"></div>
            <div class="skeleton skeleton-line short"></div>
          </div>
        </div>
      </div>
    `;
  }
}
let startX = 0;

document.addEventListener('touchstart', e => {
  const card = e.target.closest('.swipe-content');
  if (!card) return;
  startX = e.touches[0].clientX;
});

document.addEventListener('touchend', e => {
  const card = e.target.closest('.swipe-content');
  if (!card) return;

  const endX = e.changedTouches[0].clientX;
  const diff = endX - startX;

  card.style.transform =
    diff < -60 ? 'translateX(-128px)' : 'translateX(0)';
});

/* ================= INIT ================= */
applyTheme(localStorage.getItem('theme') || 'light');
(async () => {
  const ok = await ensureAuth();
  if (!ok) {
    console.log("Not authenticated", ok);
    location.href = 'login.html';
    return;
  }
  loadCars();
})();

async function editVehicle(vid) {
  // 1. เปิด Sheet ทันที
  const s = document.getElementById('addSheet');
  s.classList.remove('hidden');
  requestAnimationFrame(() => s.classList.add('show'));

  // 2. ดึงข้อมูล "ที่มีอยู่แล้วบนหน้าจอ" มาโชว์ก่อน
  // ค้นหา Card element ของรถคันนี้
  const card = document.getElementById(`card-${vid}`);
  if (!card) {
    alert('ไม่พบข้อมูลรถ');
    return;
  }
  const name = card.querySelector('.car-title').innerText;
  const brandModel = card.querySelector('.car-subtitle').innerText;
  const imgUrl = card.querySelector('.car-thumb img').src;

  // หยอดข้อมูลพื้นฐานลง Form ทันที
  document.getElementById('v_name').value = name;
  // ตัดวงเล็บออกเพื่อแยก Brand/Model (ถ้าต้องการความเป๊ะ)
  const bm = brandModel.replace('(', '').replace(')', '').split(' ');
  document.getElementById('v_brand').value = bm[0] || '';
  document.getElementById('v_model').value = bm[1] || '';
  
  // โชว์รูปที่มีอยู่แล้วก่อน
  const preview = document.getElementById('imagePreview');
  preview.src = imgUrl;
  preview.classList.remove('hidden');

  // ตั้งค่าปุ่มและ Header รอไว้
  const headerSpan = document.querySelector('.sheet-header span');
  headerSpan.innerText = "แก้ไขข้อมูลรถ";
  currentEditVid = vid;

  const btn = document.querySelector('.sheet-body button:last-child');
  btn.innerText = "บันทึกการแก้ไข";
  btn.onclick = () => submitVehicle('edit_vehicle');

  // 3. (Background) ค่อยไปโหลดข้อมูลเชิงลึกจาก Server มาทับ
  try {
    const json = await apiFetch(`${GAS_URL}?action=vehicles`);
    const fullData = json.vehicles.find(v => v.vid === vid);
    
    if (fullData) {
      // อัปเดตข้อมูลที่เหลือ (เช่น Type และ Odometer ตัวจริง)
      document.getElementById('v_type').value = fullData.type ? fullData.type.toLowerCase() : 'fuel';
      document.getElementById('v_odometer').value = fullData.initial_odo || 0;
      
      // ถ้าในเครื่องมีรูปใหม่กว่า (Drive ID) ก็โหลดทับ
      if (fullData.imgId) {
        preview.src = `https://drive.google.com/thumbnail?id=${fullData.imgId}&sz=w400`;
      }
    }
  } catch (err) {
    console.warn("Background fetch failed, but user can still edit basic info.");
  }
}

async function deleteVehicle(event, vid) {
  if (!confirm('ลบรถคันนี้?')) return;
  // 1. ค้นหา HTML Element ของ Card นี้
  // เราจะหาปุ่มที่ถูกกด แล้วไล่ขึ้นไปหาตัวที่เป็น .swipe-wrap
  const btn = event.target.closest('.swipe-btn'); 
  const cardElement = event.target.closest('.swipe-wrap');

  if (cardElement) {
    // 2. ซ่อน Card ทันที (Optimistic Update)
    cardElement.style.transition = 'all 0.4s ease';
    cardElement.style.opacity = '0';
    cardElement.style.transform = 'translateX(-100%)';
    
    // หลังจาก Animation จบ ให้เอาออกไปเลยเพื่อให้พื้นที่ขยับขึ้นมา
    setTimeout(() => {
      cardElement.style.display = 'none';
    }, 400);
  }

  // 3. ส่งข้อมูลไปบอก Server เบื้องหลัง
  const data = {
    action: 'delete_vehicle',
    // uid: USER_ID,
    vid: vid
  };

  try {
    const json = await apiFetch(GAS_URL, {
      method: 'POST',
      body: JSON.stringify(data)
    });

    if (json && json.status === 'ok') {
      //console.log(`Vehicle ${vid} is now inactive.`);
    } else {
      throw new Error(json?.message || 'Delete failed');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการลบ: ' + err.message);
    // ถ้าลบไม่สำเร็จจริงๆ อาจจะโชว์ Card กลับมา (Optional)
    if (cardElement) {
      cardElement.style.display = 'block';
      cardElement.style.opacity = '1';
      cardElement.style.transform = 'translateX(0)';
    }
  }
}