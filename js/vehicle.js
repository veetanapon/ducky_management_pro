/* ================= GLOBAL ================= */
let CURRENT_VEHICLE_TYPE = "fuel";
let CURRENT_SUMMARY = null;
let ENERGY_SUBMITTING = false;
let LAST_ENERGY_HASH = null;
let CURRENT_VID = null;
let ALL_LOGS = [];
const ITEM_HEIGHT = 36;
const OFFSET_INDEX = 1; // ⭐ item กลาง

const FUEL_STATIONS_TH = ["PTT", "Bangchak", "Shell", "Caltex", "PT", "Susco"];
const EV_STATIONS_TH = [
  "PTT EV Station",
  "PEA VOLTA",
  "MEA EV",
  "Elex by EGAT",
  "iGreen+",
  "Altervim",
  "EA Anywhere",
  "EVolt",
  "ChargeNow",
  "Tesla Supercharger",
  "IONITY",
];

/* ================= VEHICLE PAGE ================= */
async function initVehiclePage() {
  const vid = new URLSearchParams(location.search).get("vid");
  if (!vid) return;

  // const json = await apiFetch(`${GAS_URL}?action=vehicles`);
  // if (!json?.vehicles) return;

  const dropdown = document.getElementById("carDropdown");
  dropdown.innerHTML = "";
  allVehicles = getSession("vehicles");
  allVehicles.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.vid;
    opt.textContent = v.name;
    if (v.vid === vid) opt.selected = true;
    dropdown.appendChild(opt);
  });

  dropdown.onchange = (e) =>
    (location.href = `vehicle.html?vid=${e.target.value}`);
  loadVehicleDetail(vid);
}

function switchCar(vid) {
  window.location.href = `vehicle.html?vid=${vid}`;
}

function renderEnergyBar(energyData) {
  const bar = document.getElementById("energyBar");
  if (!energyData || energyData.length === 0) {
    bar.innerHTML = "";
    return;
  }
  bar.innerHTML = energyData
    .map((r) => {
      return `
        <div class="energy-seg fuel-${r.type}"
             style="width:${r.percent}%"
             title="${r.type.toUpperCase()} ${r.percent}%">
        </div>`;
    })
    .join("");
}

async function loadVehicleDetail(vid) {
  CURRENT_VID = vid;
  payload = {
    action: "getVehicleFullDetail",
    session_token: getSession(),
    vid: vid,
  };
  const json = await apiFetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  console.log(json);
  if (!json) return;
  const { vehicle, summary, logs, energyBar } = json;
  // console.log(logs);

  CURRENT_VEHICLE_TYPE = vehicle.type === "EV" ? "ev" : "fuel";
  CURRENT_SUMMARY = summary;
  vehicleImage.src = vehicle.imgId
    ? `https://drive.google.com/thumbnail?id=${vehicle.imgId}&sz=w800`
    : "";

  vehicleTitle.innerText = `${vehicle.brand} ${vehicle.model}`;
  lastOdo.innerText = summary.last_odometer + " km";
  totalCost.innerText = summary.total_cost + " ฿";

  const distance = summary.last_odometer - vehicle.initial_odo;
  totalDistance.innerText = distance + " km";
  energyCount.innerText =
    summary.sum_qty.toFixed(2) +
    " " +
    (vehicle.type === "EV" ? "kWh" : "Liter");
  avgCost.innerText =
    distance > 0 ? (summary.total_cost / distance).toFixed(2) + " ฿" : "-";
  efficiency.innerText =
    summary.sum_qty > 0
      ? vehicle.type === "EV"
        ? (distance / summary.sum_qty).toFixed(2) + " km/kWh"
        : (distance / summary.sum_qty).toFixed(2) + " km/L"
      : "-";
  logsCount.innerText = `(${logs.length || 0})`;
  renderEnergyBar(energyBar);
  renderFuelList(logs);
  ALL_LOGS = logs;
}

function renderFuelList(logs) {
  fuelList.innerHTML = logs
    .slice(0, 5)
    .map((l) => {
      const subtype = (
        (l.sub_type || "").length <= 3 ? l.sub_type : "g97"
      ).toLowerCase();
      const iconText = subtype.toUpperCase();
      const unitLabel = l.unit || "";
      return `
      <div class="fuel-row fuel-${subtype}">
      <!-- LEFT -->
      <div class="fuel-icon">${iconText}</div>

      <!-- CENTER -->
      <div class="fuel-info">
        <div class="fuel-station">${l.station || "Unknown"}</div>
        <div class="fuel-meta">
          ${new Date(l.date).toLocaleDateString("th-TH", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })} • ${l.amount} ${unitLabel}
        </div>
      </div>

      <!-- RIGHT -->
      <div class="fuel-price">
        <div class="fuel-total">${l.cost.toFixed(2)} ฿</div>
        <div class="fuel-unit">${l.price_per_unit.toFixed(2)} ฿/Liter</div>
      </div>
    </div>
  `;
    })
    .join("");
}

//---------------------------- Energy FAB Sheet ---------------------------//
function openEnergySheet(type) {
  const sheet = document.getElementById("energySheet");
  if (!sheet) return;

  sheet.classList.remove("hidden");
  requestAnimationFrame(() => {
    sheet.classList.add("show");
    applyEnergyTypeUI(type);
    autoSetDate();
  });
  //   applyEnergyTypeUI(type);
  //   autoSetDate();

  //   sheet.classList.remove("hidden");
  //   requestAnimationFrame(() => sheet.classList.add("show"));
}

function closeEnergySheet() {
  const sheet = document.getElementById("energySheet");
  if (!sheet) return;
  sheet.classList.remove("show");
  setTimeout(() => {
    sheet.classList.add("hidden");
    resetEnergyForm();
    ENERGY_SUBMITTING = false;
    LAST_ENERGY_HASH = null;
  }, 300);
}

/* ===== SHOW / HIDE ตามประเภทรถ ===== */
function applyEnergyTypeUI(type) {
  const etype = document.getElementById("e_etype");
  const ftype = document.getElementById("e_ftype");
  const unitLabel = document.getElementById("e_unit_label");
  const station = document.getElementById("e_station_name");
  const eTypeInput = document.getElementById("e_type");

  if (!etype || !ftype || !unitLabel || !station || !eTypeInput) return;
  station.innerHTML = `<option value="">เลือกสถานี</option>`;
  const list = type === "ev" ? EV_STATIONS_TH : FUEL_STATIONS_TH;
  list.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    station.appendChild(opt);
  });
  if (type === "ev") {
    etype.style.display = "block";
    ftype.style.display = "none";
    unitLabel.innerText = "kWh";
    eTypeInput.value = "ev";
  } else {
    etype.style.display = "none";
    ftype.style.display = "block";
    unitLabel.innerText = "Liter";
    eTypeInput.value = "fuel";
  }
}

function calcTotal() {
  const qty = Number(document.getElementById("e_qty")?.value || 0);
  const price = Number(document.getElementById("e_price_per_unit")?.value || 0);
  const total = qty * price;
  const label = document.getElementById("e_total_price_label");
  if (label) {
    // label.inn = total.toFixed(2) + " ฿";
    label.value = total.toFixed(2);
  }
}

/* ===== วันที่ปัจจุบัน ===== */
function autoSetDate() {
  //   const now = new Date();
  //   const iso = now.toISOString().slice(0, 16);
  //   e_date.value = getLocalDatetimeValue();
  //   e_createdAt.value = now.toISOString();
  const el = document.getElementById("e_date");
  if (el) el.value = getLocalDatetimeValue();
}

/* ===== Submit (ตัวอย่าง) ===== */
async function submitEnergy() {
  if (ENERGY_SUBMITTING) return;

  if (!validateOdometer(CURRENT_SUMMARY.last_odometer)) return;

  const payload = {
    action: "add_energy_log",
    // uid: USER_ID,
    vid: new URLSearchParams(location.search).get("vid"),
    energy_type: e_type.value,
    fuel_type: e_type.value === "ev" ? "" : e_ftype.value,
    charge_type: e_type.value === "ev" ? e_etype.value : "",
    odometer_km: Number(e_odometer.value),
    quantity: Number(e_qty.value),
    unit: e_unit_label.innerText,
    price_per_unit: Number(e_price_per_unit.value),
    total_price: Number(e_total_price_label.value), //.replace(" ฿", "")),
    isFull: false, //e_isfull.checked,
    station_name: e_station_name.value,
    note: e_notes.value,
    logged_at: e_date.value,
  };

  const hash = JSON.stringify(payload);
  if (hash === LAST_ENERGY_HASH) {
    alert("⚠️ ข้อมูลซ้ำ ยังไม่ได้เปลี่ยนแปลง");
    return;
  }

  ENERGY_SUBMITTING = true;
  LAST_ENERGY_HASH = hash;

  const btn = document.querySelector(".sheet-body button");
  btn.disabled = true;
  btn.innerText = "กำลังบันทึก...";

  try {
    const res = await apiFetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (!res || res.status !== "ok") {
      throw new Error("API error");
    }

    alert("✅ บันทึกเรียบร้อย");
    closeEnergySheet();
    loadVehicleDetail(payload.vid); // refresh summary
  } catch (err) {
    //console.error(err);
    alert("❌ บันทึกไม่สำเร็จ");
  } finally {
    btn.disabled = false;
    btn.innerText = "บันทึก";
    ENERGY_SUBMITTING = false;
  }
}

function fillStationOptions(type) {
  const select = document.getElementById("e_station_name");
  select.innerHTML = "";

  const list = type === "ev" ? EV_STATIONS_TH : FUEL_STATIONS_TH;

  list.forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });
}
function validateOdometer(currentOdo) {
  const input = Number(document.getElementById("e_odometer")?.value || 0);
  if (input < currentOdo) {
    alert("❌ เลขไมล์น้อยกว่าครั้งก่อน");
    return false;
  }
  return true;
}
function getLocalDatetimeValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().slice(0, 16);
}
function resetEnergyForm() {
  e_station_name.value = "";
  e_etype.value = "dc";
  e_ftype.value = "g95";
  e_odometer.value = "";
  e_qty.value = "";
  e_price_per_unit.value = "";
  e_total_price_label.value = "";
  e_notes.value = "";
  autoSetDate();
}

document.addEventListener("DOMContentLoaded", async () => {
  const ok = await ensureAuth?.();
  if (!ok) {
    //console.log("Not authenticated", ok);
    location.href = "login.html";
    return;
  }
  initVehiclePage();

  ["e_qty", "e_price_per_unit"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", calcTotal);
  });
});

/* ================= Date Filter ================= */
function getCenterItem(el) {
  const centerY = el.scrollTop + el.clientHeight / 2;

  let closest = null;
  let min = Infinity;

  [...el.children].forEach(item => {
    const itemCenter =
      item.offsetTop + item.offsetHeight / 2;

    const dist = Math.abs(centerY - itemCenter);

    if (dist < min) {
      min = dist;
      closest = item;
    }
  });

  return closest;
}
function buildWheel(el, values, defaultIndex) {
  el.innerHTML = "";

  values.forEach((v) => {
    const div = document.createElement("div");
    div.className = "wheel-item";
    div.innerText = v;
    el.appendChild(div);
  });

  requestAnimationFrame(() => {
    el.scrollTop = defaultIndex * ITEM_HEIGHT;
    updateActive(el);
  });

  el.addEventListener("scroll", () => {
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    snap(el);
    updateActive(el);
  }, 80);
});
}
function snapToItem(el) {
  const index = Math.round((el.scrollTop - ITEM_HEIGHT) / ITEM_HEIGHT);
  el.scrollTo({
    top: index * ITEM_HEIGHT + ITEM_HEIGHT,
    behavior: "smooth",
  });
  updateActive(el);
}
function updateActive(el) {
  const activeItem = getCenterItem(el);

  [...el.children].forEach(item =>
    item.classList.toggle("active", item === activeItem)
  );
}
function snap(el) {
  const active = getCenterItem(el);
  if (!active) return;

  const top =
    active.offsetTop -
    (el.clientHeight / 2 - active.offsetHeight / 2);

  el.scrollTo({
    top,
    behavior: "smooth"
  });
}
function getWheelIndex(el) {
  return Math.round(el.scrollTop / ITEM_HEIGHT);
}

function openDateFilter() {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-11
  const currentYear = now.getFullYear();

  const years = [];
  for (let y = currentYear - 10; y <= currentYear + 1; y++) {
    years.push(y);
  }

  buildWheel(document.getElementById("fromMonth"), MONTHS_TH, currentMonth);
  buildWheel(document.getElementById("fromYear"), years, years.indexOf(currentYear));

  buildWheel(document.getElementById("toMonth"), MONTHS_TH, currentMonth);
  buildWheel(document.getElementById("toYear"), years, years.indexOf(currentYear));

  document.getElementById("dateFilterModal").classList.add("show");
  //document.getElementById("dateFilterModal").classList.remove("hidden");
}

function closeDateFilter() {
  document.getElementById("dateFilterModal").classList.remove("show");
}

async function applyDateFilter() {
  const fm = getWheelIndex(document.getElementById("fromMonth")) + 1;
  const fy = parseInt(
    document.getElementById("fromYear")
      .children[getWheelIndex(document.getElementById("fromYear"))].innerText
  );

  const tm = getWheelIndex(document.getElementById("toMonth")) + 1;
  const ty = parseInt(
    document.getElementById("toYear")
      .children[getWheelIndex(document.getElementById("toYear"))].innerText
  );

  closeDateFilter();

  reloadVehicleDetailWithFilter(fy, fm, ty, tm);
}

async function reloadVehicleDetailWithFilter(fy, fm, ty, tm) {
  const payload = {
    action: "getVehicleFullDetail",
    session_token: getSession(),
    vid: CURRENT_VID,
    from_year: fy,
    from_month: fm,
    to_year: ty,
    to_month: tm,
  };

  const json = await apiFetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!json) return;
  //console.log(json);

  logsCount.innerText = `(${json.logs?.length || 0})`;
  renderFuelList(json.logs);
  //renderEnergyBar(json.energyBar);
}