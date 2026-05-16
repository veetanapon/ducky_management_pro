window.ReportViewPage = (() => {
  const state = {
    key: '',
    batch: null,
    rows: [],
    chart: { egg: [], feed: [], duck: [] },
    events: [],
    consumption: [],
    feedMovements: [],
    months: [],
    selectedMonth: 'all',
    filters: {
      egg: true,
      eggPercent: true,
      feed: true,
      events: true,
      feedMarkers: true
    },
    daily: [],
    hoverIndex: -1,
    selectedIndex: -1,
    fullscreenChart: ''
  };

  const chartCache = new WeakMap();
  const chartTitles = {
    main: 'ภาพรวมไข่ × อาหาร × เหตุการณ์',
    egg: 'ไข่รายวัน / %ไข่',
    feed: 'เทอาหาร / กินจริง',
    event: 'Timeline เหตุการณ์',
    cost: 'ทุน / ขาย / สุทธิ'
  };
  const eventIconMap = {
    injection: '💉',
    rain: '🌦',
    duck_cull: '🦆',
    vitamin: '✨',
    medicine: '💊',
    feed_swap: '🔁',
    other: '•',
    feed_in: '📦',
    feed_change: '🔁'
  };
  const eventLabelMap = {
    injection: 'ฉีดยา',
    rain: 'ฝนตก',
    duck_cull: 'แตะตูด / คัดเป็ด',
    vitamin: 'ให้วิตามิน',
    medicine: 'ให้ยา',
    feed_swap: 'สลับอาหาร',
    other: 'อื่น ๆ',
    feed_in: 'อาหารเข้า',
    feed_change: 'เปลี่ยนอาหาร'
  };

  async function bootstrap() {
    state.key = new URLSearchParams(location.search).get('key') || '';
    bind();
    if (!state.key) {
      setText('rvSubtitle', 'ไม่พบ key สำหรับเปิดรายงาน');
      renderError('ลิงก์รายงานไม่ถูกต้อง');
      return;
    }
    await load();
  }

  function bind() {
    document.getElementById('rvMonthSelect')?.addEventListener('change', (event) => {
      state.selectedMonth = event.target.value || 'all';
      state.selectedIndex = -1;
      render();
    });
    document.getElementById('rvRefreshBtn')?.addEventListener('click', () => load({ force: true }));
    document.querySelectorAll('[data-rv-filter]').forEach((input) => {
      input.addEventListener('change', () => {
        state.filters[input.dataset.rvFilter] = !!input.checked;
        render();
      });
    });
    document.querySelectorAll('[data-fullscreen-chart]').forEach((button) => {
      button.addEventListener('click', () => openFullscreen(button.dataset.fullscreenChart));
    });
    document.getElementById('rvFullscreenCloseBtn')?.addEventListener('click', closeFullscreen);
    window.addEventListener('resize', debounce(() => renderCharts(), 120));
  }

  async function load({ force = false } = {}) {
    setText('rvSubtitle', force ? 'กำลังโหลดข้อมูลใหม่...' : 'กำลังโหลดข้อมูล...');
    const response = await AppApi.postPublic({ action: 'getReportPublicViewData', view_key: state.key, force: force ? 1 : 0 });
    if (!response || response.status !== 'ok') {
      setText('rvSubtitle', response?.message || 'โหลดรายงานไม่สำเร็จ');
      renderError(response?.message || 'โหลดรายงานไม่สำเร็จ');
      return;
    }

    state.batch = response.batch || null;
    state.rows = Array.isArray(response.rows) ? response.rows : [];
    state.chart = response.chart || { egg: [], feed: [], duck: [] };
    state.events = Array.isArray(response.events) ? response.events : [];
    state.consumption = Array.isArray(response.consumption) ? response.consumption : [];
    state.feedMovements = Array.isArray(response.feed_movements) ? response.feed_movements : [];
    state.months = Array.isArray(response.months) && response.months.length ? response.months : deriveMonths(state.rows);
    state.daily = buildDailyRows();

    renderMonthSelect();
    render();
    setText('rvSubtitle', `${state.batch?.name || 'Batch'} • เปิดดูอย่างเดียว • อัปเดต ${shortDateTime(response.generated_at || '')}`);
  }

  function renderError(message) {
    const summary = document.getElementById('rvSummary');
    if (summary) summary.innerHTML = `<div class="rv-error-card">${esc(message)}</div>`;
  }

  function renderMonthSelect() {
    const select = document.getElementById('rvMonthSelect');
    if (!select) return;
    const current = state.selectedMonth || 'all';
    select.innerHTML = '<option value="all">ทั้งหมด</option>' + state.months.map((month) => `<option value="${esc(month.key)}">${esc(month.label || month.key)}</option>`).join('');
    if (current === 'all' || state.months.some((month) => month.key === current)) state.selectedMonth = current;
    else state.selectedMonth = 'all';
    select.value = state.selectedMonth;
  }

  function render() {
    setText('rvTitle', 'รายงานวิเคราะห์');
    const daily = scopedDaily();
    if (state.selectedIndex >= daily.length) state.selectedIndex = -1;
    renderSummary(daily);
    renderLegend();
    renderEvents(daily);
    renderInspector();
    renderCharts();
  }

  function renderSummary(daily) {
    const totalEgg = sum(daily, 'eggDaily');
    const totalConsumed = sum(daily, 'consumedQty');
    const totalLeftover = sum(daily, 'leftoverQty');
        const totalFeedCost = sum(daily, 'feedCost');
    const totalEventCost = sum(daily, 'eventCost');
    const totalIncome = sum(daily, 'eggIncome');
    const net = sum(daily, 'totalIncome') - totalEventCost;
    const avgPercent = weightedEggPercent(daily);
    const cards = [
      ['ไข่รวม', `${fmt(totalEgg)} ฟอง`, avgPercent ? `เฉลี่ย ${fmt(avgPercent)}%` : '% ไข่ -'],
      ['กินจริง', `${fmt(totalConsumed)} ลูก`, `เหลือ ${fmt(totalLeftover)} ลูก`],
      ['ต้นทุนรวม', money(totalFeedCost + totalEventCost), `อาหาร ${money(totalFeedCost)} • กิจกรรม ${money(totalEventCost)}`],
      ['สุทธิหลัง event', money(net), `ขาย ${money(totalIncome)}`]
    ];
    const target = document.getElementById('rvSummary');
    if (!target) return;
    target.innerHTML = cards.map(([label, value, note]) => `
      <article class="rv-summary-card">
        <span>${esc(label)}</span>
        <strong>${esc(value)}</strong>
        <small>${esc(note)}</small>
      </article>
    `).join('');
  }

  function renderLegend() {
    const legend = document.getElementById('rvMainLegend');
    if (!legend) return;
    legend.innerHTML = [
      ['rv-dot rv-dot--egg', 'ไข่รายวัน: แกนซ้ายบน (ฟอง)'],
      ['rv-dot rv-dot--percent', '%ไข่: แกนขวาบน (%)'],
      ['rv-dot rv-dot--feed', 'อาหาร: แท่งโปร่ง=เทต่อวัน / แท่งเข้ม=กินจริง (ลูก)'],
      ['rv-dot rv-dot--event', 'ไอคอนเหตุการณ์/อาหาร']
    ].map(([cls, text]) => `<span><i class="${cls}"></i>${esc(text)}</span>`).join('');
  }

  function renderEvents(daily) {
    const events = daily.flatMap((day) => day.timeline.map((item) => ({ ...item, dateKey: day.dateKey })));
    setText('rvEventCount', String(events.length));
    const target = document.getElementById('rvEvents');
    if (!target) return;
    if (!events.length) {
      target.innerHTML = '<div class="rv-empty">ไม่มีเหตุการณ์ในช่วงที่เลือก</div>';
      return;
    }
    target.innerHTML = events.slice(0, 220).map((event) => `
      <button type="button" class="rv-event-row" data-date-key="${esc(event.dateKey)}">
        <span class="rv-event-icon">${iconFor(event.type, event.subtype, event.severity)}</span>
        <span class="rv-event-date">${esc(shortDate(event.dateKey))}</span>
        <span class="rv-event-text"><b>${esc(event.title || eventLabel(event.type))}</b><small>${esc(event.detail || '')}</small></span>
        ${event.cost ? `<span class="rv-event-cost">${money(event.cost)}</span>` : ''}
      </button>
    `).join('');
    target.querySelectorAll('[data-date-key]').forEach((button) => {
      button.addEventListener('click', () => selectDate(button.dataset.dateKey));
    });
  }

  function renderInspector() {
    const daily = scopedDaily();
    const selected = state.selectedIndex >= 0 ? daily[state.selectedIndex] : null;
    const target = document.getElementById('rvInspector');
    if (!target) return;
    if (!selected) {
      setText('rvSelectedDateBadge', 'แตะกราฟ');
      target.className = 'rv-inspector-empty';
      target.textContent = 'แตะจุดบนกราฟเพื่อดูว่าในวันนั้นกินอาหารเท่าไหร่ ไข่เท่าไหร่ และมีเหตุการณ์อะไรบ้าง';
      return;
    }
    setText('rvSelectedDateBadge', thaiDate(selected.dateKey));
    target.className = 'rv-inspector';
    target.innerHTML = `
      <div class="rv-inspector-grid">
        <div><span>ไข่</span><strong>${fmt(selected.eggDaily)} ฟอง</strong></div>
        <div><span>%ไข่</span><strong>${fmt(selected.eggPercent)}%</strong></div>
        <div><span>เทออก</span><strong>${fmt(selected.feedOutQty)} ลูก</strong></div>
        <div><span>กินจริง</span><strong>${fmt(selected.consumedQty)} ลูก</strong></div>
        <div><span>เหลือ</span><strong>${fmt(selected.leftoverQty)} ลูก</strong></div>
        <div><span>เป็ดตาย</span><strong>${fmt(selected.duckDead)}</strong></div>
      </div>
      <div class="rv-inspector-events">
        ${selected.timeline.length ? selected.timeline.map((event) => `
          <div class="rv-inspector-event"><span>${iconFor(event.type, event.subtype, event.severity)}</span><div><b>${esc(event.title || eventLabel(event.type))}</b><p>${esc(event.detail || '')}</p></div>${event.cost ? `<strong>${money(event.cost)}</strong>` : ''}</div>
        `).join('') : '<div class="rv-empty">วันนี้ไม่มีเหตุการณ์เพิ่มเติม</div>'}
      </div>
    `;
  }

  function renderCharts() {
    const daily = scopedDaily();
    renderMainChart(document.getElementById('rvMainChart'), daily);
    renderEggChart(document.getElementById('rvEggChart'), daily);
    renderFeedChart(document.getElementById('rvFeedChart'), daily);
    renderEventChart(document.getElementById('rvEventChart'), daily);
    renderCostChart(document.getElementById('rvCostChart'), daily);
    if (state.fullscreenChart) renderFullscreenChart();
  }

  function dailyMarkerCount(day) {
    const eventCount = state.filters.events ? (day.events || []).length : 0;
    const feedCount = state.filters.feedMarkers ? (day.feedMarkers || []).length : 0;
    return eventCount + feedCount;
  }

  function markerRowsForDaily(daily) {
    const maxMarkers = Math.max(0, ...daily.map(dailyMarkerCount));
    return Math.max(1, Math.min(7, maxMarkers || 1));
  }

  function applyMainChartHeight(canvas, daily, options) {
    if (!canvas || !canvas.parentElement) return markerRowsForDaily(daily);
    const markerRows = markerRowsForDaily(daily);
    const extra = Math.max(0, markerRows - 1) * 26;
    const base = options && options.fullscreen ? 560 : 470;
    canvas.parentElement.style.minHeight = `${base + extra}px`;
    canvas.parentElement.dataset.markerRows = String(markerRows);
    return markerRows;
  }


  function renderMainChart(canvas, daily, options = {}) {
    if (!canvas) return;
    const markerRows = applyMainChartHeight(canvas, daily, options);
    const box = prepareCanvas(canvas);
    const ctx = box.ctx;
    const w = box.w;
    const h = box.h;
    clear(ctx, w, h);
    if (!daily.length) return drawNoData(ctx, w, h);

    const eventBandH = 26 + markerRows * 25;
    const m = { l: 72, r: 82, t: Math.max(72, eventBandH + 28), b: 48 };
    const availableH = Math.max(300, h - m.t - m.b);
    const topH = Math.max(160, Math.min(availableH * 0.56, availableH - 120));
    const top = { x: m.l, y: m.t, w: w - m.l - m.r, h: topH };
    const bottom = { x: m.l, y: top.y + top.h + 54, w: top.w, h: Math.max(96, h - (top.y + top.h + 54) - m.b) };
    const eggMax = niceMax(Math.max(...daily.map((d) => d.eggDaily), 1));
    const percentMax = 100;
    const feedMax = niceMax(Math.max(...daily.map((d) => Math.max(d.consumedQty, d.feedOutQty)), 1));

    drawPane(ctx, top, { leftLabel: 'ไข่ (ฟอง)', rightLabel: '% ไข่', leftMax: eggMax, rightMax: percentMax });
    drawPane(ctx, bottom, { leftLabel: 'อาหาร (ลูก)', leftMax: feedMax });
    drawDateAxis(ctx, daily, bottom, options.compact);

    const xAt = makeXMapper(daily, top);
    const barW = Math.max(2, Math.min(20, top.w / Math.max(daily.length, 1) * 0.58));

    if (state.filters.egg) {
      ctx.fillStyle = 'rgba(245, 158, 11, 0.42)';
      daily.forEach((day, index) => {
        const x = xAt(index) - barW / 2;
        const bh = (day.eggDaily / eggMax) * top.h;
        ctx.fillRect(x, top.y + top.h - bh, barW, bh);
      });
    }

    if (state.filters.eggPercent) {
      drawLine(ctx, daily.map((day) => [xAt(day.__index), top.y + top.h - (day.eggPercent / percentMax) * top.h]), '#ef4444', 2.5);
      drawPoints(ctx, daily.map((day) => [xAt(day.__index), top.y + top.h - (day.eggPercent / percentMax) * top.h]), '#ef4444', 2.6);
    }

    const xAtBottom = makeXMapper(daily, bottom);
    const feedBarW = Math.max(3, Math.min(18, bottom.w / Math.max(daily.length, 1) * 0.56));
    if (state.filters.feed) {
      daily.forEach((day, index) => {
        const x = xAtBottom(index) - feedBarW / 2;
        const outH = (day.feedOutQty / feedMax) * bottom.h;
        const consumedH = (day.consumedQty / feedMax) * bottom.h;
        ctx.fillStyle = 'rgba(14, 165, 164, 0.20)';
        ctx.fillRect(x, bottom.y + bottom.h - outH, feedBarW, outH);
        ctx.fillStyle = 'rgba(14, 165, 164, 0.72)';
        ctx.fillRect(x + feedBarW * 0.17, bottom.y + bottom.h - consumedH, feedBarW * 0.66, consumedH);
      });
    }
    const markerList = [];
    const markerTopY = Math.max(18, top.y - eventBandH + 18);
    daily.forEach((day, index) => {
      const stack = [];
      if (state.filters.events) stack.push(...(day.events || []));
      if (state.filters.feedMarkers) stack.push(...(day.feedMarkers || []));
      stack.slice(0, markerRows).forEach((event, eventIndex) => {
        markerList.push({
          x: xAt(index),
          y: markerTopY + eventIndex * 25,
          day,
          type: event.type,
          subtype: event.subtype,
          severity: event.severity,
          title: event.title,
          detail: event.detail
        });
      });
    });
    drawMarkers(ctx, markerList, canvas);
    chartCache.set(canvas, { daily, top, bottom, xAt, xAtBottom, markers: markerList, chartType: 'main' });

    drawSelectedGuide(ctx, canvas, daily, top, bottom);
  }

  function renderEggChart(canvas, daily) {
    renderMiniChart(canvas, daily, {
      tooltipType: 'egg',
      leftLabel: 'ไข่ (ฟอง)',
      rightLabel: '% ไข่',
      series: [
        { key: 'eggDaily', label: 'ไข่', type: 'bar', color: 'rgba(245, 158, 11, .45)' },
        { key: 'eggPercent', label: '%ไข่', type: 'line', color: '#ef4444', axis: 'right', max: 100 }
      ]
    });
  }

  function renderFeedChart(canvas, daily) {
    renderMiniChart(canvas, daily, {
      tooltipType: 'feed',
      leftLabel: 'อาหาร (ลูก)',
      series: [
        { key: 'feedOutQty', label: 'เทออก', type: 'bar', color: 'rgba(14, 165, 164, .22)' },
        { key: 'consumedQty', label: 'กินจริง', type: 'barOverlay', color: 'rgba(14, 165, 164, .72)' }
      ]
    });
  }

  function renderEventChart(canvas, daily) {
    if (!canvas) return;
    const box = prepareCanvas(canvas);
    const ctx = box.ctx;
    const w = box.w;
    const h = box.h;
    clear(ctx, w, h);
    if (!daily.length) return drawNoData(ctx, w, h);

    const pane = { x: 58, y: 32, w: w - 104, h: h - 82 };
    drawEventPane(ctx, pane);
    drawDateAxis(ctx, daily, pane, true);
    const xAt = makeXMapper(daily, pane);
    const rows = Math.max(1, Math.min(5, Math.max(...daily.map((day) => day.timeline.length), 1)));
    const rowGap = pane.h / (rows + 1);
    const markers = [];

    daily.forEach((day, index) => {
      const items = (day.timeline || []).slice(0, rows);
      items.forEach((item, itemIndex) => {
        markers.push({
          x: xAt(index),
          y: pane.y + rowGap * (itemIndex + 1),
          day,
          type: item.type,
          subtype: item.subtype,
          severity: item.severity,
          title: item.title,
          detail: item.detail
        });
      });
    });

    drawMarkers(ctx, markers, canvas);
    drawMiniLegend(ctx, [
      { label: 'อาหารเข้า', color: '#0ea5a4' },
      { label: 'สลับอาหาร', color: '#0ea5a4' },
      { label: 'กิจกรรม', color: '#f59e0b' }
    ], pane);
    chartCache.set(canvas, { daily, pane, xAt, markers, chartType: 'event' });
    attachCanvasInteractions(canvas);
  }

  function renderCostChart(canvas, daily) {
    renderMiniChart(canvas, daily, {
      tooltipType: 'cost',
      leftLabel: 'บาท',
      series: [
        { key: 'feedCost', label: 'ทุน', type: 'bar', color: 'rgba(100, 116, 139, .35)' },
        { key: 'eggIncome', label: 'ขาย', type: 'bar2', color: 'rgba(34, 197, 94, .28)' },
        { key: 'netAfterEvent', label: 'สุทธิ', type: 'lineSigned', color: '#047857', positiveColor: '#047857', negativeColor: '#dc2626' }
      ]
    });
  }

  function renderMiniChart(canvas, daily, config) {
    if (!canvas) return;
    const box = prepareCanvas(canvas);
    const ctx = box.ctx;
    const w = box.w;
    const h = box.h;
    clear(ctx, w, h);
    if (!daily.length) return drawNoData(ctx, w, h);

    const pane = { x: 72, y: 34, w: w - 148, h: h - 86 };
    const leftSeries = config.series.filter((s) => s.axis !== 'right');
    const rightSeries = config.series.filter((s) => s.axis === 'right');
    const leftValues = leftSeries.flatMap((s) => daily.map((d) => Number(d[s.key] || 0)));
    const rightValues = rightSeries.flatMap((s) => daily.map((d) => Number(d[s.key] || 0))).concat(rightSeries.map((s) => Number(s.max || 0)));
    const leftExtent = niceExtent(leftValues);
    const rightExtent = rightSeries.length ? niceExtent(rightValues) : null;

    drawPane(ctx, pane, {
      leftLabel: config.leftLabel,
      rightLabel: config.rightLabel,
      leftMin: leftExtent.min,
      leftMax: leftExtent.max,
      rightMin: rightExtent ? rightExtent.min : null,
      rightMax: rightExtent ? rightExtent.max : null
    });
    drawDateAxis(ctx, daily, pane, true);

    const xAt = makeXMapper(daily, pane);
    const yForLeft = (value) => valueToY(Number(value || 0), leftExtent.min, leftExtent.max, pane);
    const yForRight = (value) => valueToY(Number(value || 0), rightExtent ? rightExtent.min : 0, rightExtent ? rightExtent.max : 1, pane);
    const zeroLeft = yForLeft(0);
    const zeroRight = rightExtent ? yForRight(0) : zeroLeft;
    const barW = Math.max(2, Math.min(18, pane.w / Math.max(1, daily.length) * 0.42));

    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, .18)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.moveTo(pane.x, zeroLeft);
    ctx.lineTo(pane.x + pane.w, zeroLeft);
    ctx.stroke();
    ctx.restore();

    config.series.forEach((s) => {
      const yFor = s.axis === 'right' ? yForRight : yForLeft;
      const zero = s.axis === 'right' ? zeroRight : zeroLeft;
      const points = daily.map((day, index) => [xAt(index), yFor(day[s.key])]);
      if (s.type === 'bar' || s.type === 'bar2' || s.type === 'barOverlay') {
        ctx.fillStyle = s.color;
        daily.forEach((day, index) => {
          const v = Number(day[s.key] || 0);
          const y = yFor(v);
          const xBase = xAt(index);
          let x = xBase - barW * 0.5;
          let width = barW;
          if (s.type === 'bar2') x = xBase + barW * 0.08;
          if (s.type === 'barOverlay') {
            width = barW * 0.58;
            x = xBase - width / 2;
          }
          const topY = Math.min(y, zero);
          const height = Math.max(1, Math.abs(zero - y));
          ctx.fillRect(x, topY, width, height);
        });
      } else if (s.type === 'lineSigned') {
        drawSignedLine(ctx, points, daily.map((day) => Number(day[s.key] || 0)), s.positiveColor || '#047857', s.negativeColor || '#dc2626', 2.4);
        drawSignedPoints(ctx, points, daily.map((day) => Number(day[s.key] || 0)), s.positiveColor || '#047857', s.negativeColor || '#dc2626', 2.5);
      } else {
        drawLine(ctx, points, s.color, 2.2);
        if (s.axis === 'right' || s.key === 'eggPercent') drawPoints(ctx, points, s.color, 2.2);
      }
    });
    drawMiniLegend(ctx, config.series, pane);
    chartCache.set(canvas, { daily, pane, xAt, chartType: config.tooltipType || 'main' });
    attachCanvasInteractions(canvas);
  }

  function openFullscreen(chart) {
    state.fullscreenChart = chart || 'main';
    document.getElementById('rvFullscreen')?.classList.remove('hidden');
    document.getElementById('rvFullscreen')?.setAttribute('aria-hidden', 'false');
    setText('rvFullscreenTitle', chartTitles[state.fullscreenChart] || 'กราฟ');
    setText('rvFullscreenSub', `${state.batch?.name || ''} • ${state.selectedMonth === 'all' ? 'ทั้งหมด' : state.selectedMonth}`);
    renderFullscreenChart();
  }

  function closeFullscreen() {
    state.fullscreenChart = '';
    document.getElementById('rvFullscreen')?.classList.add('hidden');
    document.getElementById('rvFullscreen')?.setAttribute('aria-hidden', 'true');
  }

  function renderFullscreenChart() {
    const canvas = document.getElementById('rvFullscreenCanvas');
    const daily = scopedDaily();
    if (state.fullscreenChart === 'main') renderMainChart(canvas, daily, { fullscreen: true });
    else if (state.fullscreenChart === 'egg') renderEggChart(canvas, daily);
    else if (state.fullscreenChart === 'feed') renderFeedChart(canvas, daily);
    else if (state.fullscreenChart === 'event') renderEventChart(canvas, daily);
    else if (state.fullscreenChart === 'cost') renderCostChart(canvas, daily);
    const legend = document.getElementById('rvFullscreenLegend');
    if (legend) legend.innerHTML = document.getElementById('rvMainLegend')?.innerHTML || '';
  }

  function buildDailyRows() {
    const byDate = new Map();
    const put = (dateKey) => {
      const key = normalizeDateKey(dateKey);
      if (!key) return null;
      if (!byDate.has(key)) {
        byDate.set(key, {
          dateKey: key,
          monthKey: key.slice(0, 7),
          dateLabel: shortDate(key),
          eggDaily: 0,
          eggPercent: 0,
          feedOutQty: 0,
          consumedQty: 0,
          leftoverQty: 0,
          wasteQty: 0,
          feedCost: 0,
          eventCost: 0,
          eggIncome: 0,
          totalIncome: 0,
          duckDead: 0,
          duckRemain: 0,
          eventCount: 0,
          netAfterEvent: 0,
          feedNames: new Set(),
          events: [],
          feedMarkers: [],
          timeline: []
        });
      }
      return byDate.get(key);
    };

    (state.rows || []).forEach((row) => {
      const day = put(row.date_key);
      if (!day) return;
      day.eggDaily = Number(row.egg_daily || 0);
      day.eggPercent = Number(row.egg_percent || 0);
      day.feedOutQty = Number(row.feed_out || 0);
      day.feedCost = Number(row.feed_cost || 0);
      day.eggIncome = Number(row.egg_income || 0);
      day.totalIncome = Number(row.total_income || 0);
      day.duckDead = Number(row.duck_dead || 0);
      day.duckRemain = Number(row.duck_remain || 0);
    });

    (state.chart?.feed || []).forEach((row) => {
      const day = put(row.date_key);
      if (!day) return;
      if (!day.feedOutQty) day.feedOutQty += Number(row.feed_out || 0);
      if (!day.feedCost) day.feedCost += Number(row.feed_cost || 0);
      if (row.feed_name || row.feed_id) day.feedNames.add(String(row.feed_name || row.feed_id));
    });

    (state.consumption || []).forEach((row) => {
      const day = put(row.log_date || row.date_key);
      if (!day) return;
      if (!day._hasConsumption) {
        day._hasConsumption = true;
        day.feedOutQty = 0;
        day.consumedQty = 0;
        day.leftoverQty = 0;
        day.wasteQty = 0;
        day.feedCost = 0;
      }
      day.feedOutQty += Number(row.feed_out_qty || 0);
      day.consumedQty += Number(row.consumed_qty || 0);
      day.leftoverQty += Number(row.leftover_qty || 0);
      day.wasteQty += Number(row.waste_qty || 0);
      if (row.feed_cost) day.feedCost += Number(row.feed_cost || 0);
      if (row.feed_name || row.feed_id) day.feedNames.add(String(row.feed_name || row.feed_id));
    });

    (state.chart?.duck || []).forEach((row) => {
      const day = put(row.date_key);
      if (!day) return;
      day.duckDead = Number(row.duck_dead || day.duckDead || 0);
    });

    (state.events || []).forEach((row) => {
      const day = put(row.date_key || row.log_date);
      if (!day) return;
      const rawType = row.type || row.event_type || 'other';
      const item = {
        type: normalizeEventType(rawType),
        subtype: row.event_subtype || row.subtype || '',
        title: row.title || row.event_title || eventLabel(rawType),
        detail: row.detail || '',
        severity: row.severity || '',
        cost: Number(row.expense_total || 0),
        extra: row.extra || {}
      };
      day.events.push(item);
      day.timeline.push(item);
      day.eventCost += item.cost;
    });

    (state.feedMovements || []).forEach((row) => {
      const day = put(row.date_key || row.log_date);
      if (!day) return;
      const type = normalizeFeedMoveType(row.trans_type || row.type);
      if (type === 'feed_in') {
        const feedQty = Number(row.qty || 0);
        const item = {
          type,
          title: `อาหารเข้า ${fmt(feedQty)} ลูก`,
          detail: `${row.feed_name || row.feed_id || 'Feed'} เข้า ${fmt(feedQty)} ลูก${row.remark ? ' • ' + row.remark : ''}`,
          qty: feedQty,
          cost: 0
        };
        day.feedMarkers.push(item);
        day.timeline.push(item);
      }
      if (row.feed_name || row.feed_id) day.feedNames.add(String(row.feed_name || row.feed_id));
    });

    addFeedChangeMarkers([...byDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey)));

    const daily = [...byDate.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    daily.forEach((day) => {
      if (!day._hasConsumption && Number(day.feedOutQty || 0) > 0) {
        day.consumedQty = Number(day.feedOutQty || 0);
        day.leftoverQty = 0;
        day.wasteQty = 0;
      }
      day.eventCount = day.events.length + day.feedMarkers.length;
      day.netAfterEvent = Number(day.totalIncome || 0) - Number(day.eventCost || 0);
      day.feedNameText = [...day.feedNames].filter(Boolean).join(', ');
      day.timeline.sort((a, b) => eventSortWeight(a.type) - eventSortWeight(b.type));
    });
    return daily;
  }

  function addFeedChangeMarkers(daily) {
    let prev = '';
    daily.forEach((day) => {
      const name = day.feedNameText || [...day.feedNames].join(', ');
      if (name && prev && name !== prev) {
        const item = { type: 'feed_change', title: 'เปลี่ยนอาหาร', detail: `${prev} → ${name}`, cost: 0 };
        day.feedMarkers.push(item);
        day.timeline.push(item);
      }
      if (name) prev = name;
    });
  }

  function scopedDaily() {
    let daily = state.daily || [];
    if (state.selectedMonth !== 'all') daily = daily.filter((day) => day.monthKey === state.selectedMonth);
    return daily.map((day, index) => ({ ...day, __index: index }));
  }

  function selectDate(dateKey) {
    const daily = scopedDaily();
    const index = daily.findIndex((day) => day.dateKey === dateKey);
    if (index >= 0) {
      state.selectedIndex = index;
      renderInspector();
      renderCharts();
    }
  }

  function prepareCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(360, rect.width || canvas.clientWidth || 360);
    const h = Math.max(260, rect.height || canvas.clientHeight || 260);
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.font = '12px system-ui, -apple-system, Segoe UI, sans-serif';
    return { ctx, w, h, ratio };
  }

  function clear(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  }

  function drawPane(ctx, pane, cfg) {
    const leftMin = Number(cfg.leftMin != null ? cfg.leftMin : 0);
    const leftMax = Number(cfg.leftMax != null ? cfg.leftMax : 1);
    const rightMin = Number(cfg.rightMin != null ? cfg.rightMin : 0);
    const rightMax = Number(cfg.rightMax != null ? cfg.rightMax : 1);
    ctx.save();
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px system-ui';
    for (let i = 0; i <= 4; i += 1) {
      const ratio = i / 4;
      const y = pane.y + pane.h - pane.h * ratio;
      ctx.beginPath();
      ctx.moveTo(pane.x, y);
      ctx.lineTo(pane.x + pane.w, y);
      ctx.stroke();
      if (cfg.leftMax != null) {
        ctx.textAlign = 'right';
        ctx.fillText(fmt(leftMin + (leftMax - leftMin) * ratio), pane.x - 8, y + 4);
      }
      if (cfg.rightMax != null) {
        ctx.textAlign = 'left';
        ctx.fillText(fmt(rightMin + (rightMax - rightMin) * ratio), pane.x + pane.w + 8, y + 4);
      }
    }
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(pane.x, pane.y, pane.w, pane.h);
    ctx.fillStyle = '#111827';
    ctx.font = '12px system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(cfg.leftLabel || '', pane.x, pane.y - 10);
    if (cfg.rightLabel) {
      ctx.textAlign = 'right';
      ctx.fillText(cfg.rightLabel, pane.x + pane.w, pane.y - 10);
    }
    ctx.restore();
  }

  function drawEventPane(ctx, pane) {
    ctx.save();
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i += 1) {
      const y = pane.y + (pane.h / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pane.x, y);
      ctx.lineTo(pane.x + pane.w, y);
      ctx.stroke();
    }
    ctx.strokeStyle = '#cbd5e1';
    ctx.strokeRect(pane.x, pane.y, pane.w, pane.h);
    ctx.fillStyle = '#111827';
    ctx.font = '12px system-ui';
    ctx.fillText('Timeline เหตุการณ์', pane.x, pane.y - 10);
    ctx.restore();
  }

  function drawDateAxis(ctx, daily, pane, compact) {
    ctx.save();
    ctx.fillStyle = '#64748b';
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.ceil(daily.length / (compact ? 8 : 14)));
    const xAt = makeXMapper(daily, pane);
    daily.forEach((day, index) => {
      if (index % step !== 0 && index !== daily.length - 1) return;
      ctx.fillText(day.dateLabel, xAt(index), pane.y + pane.h + 20);
    });
    ctx.restore();
  }

  function makeXMapper(daily, pane) {
    const count = Math.max(1, daily.length - 1);
    return (index) => pane.x + (pane.w * index) / count;
  }

  function drawLine(ctx, points, color, width) {
    ctx.save();
    ctx.beginPath();
    points.forEach(([x, y], index) => {
      if (index) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = width || 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.restore();
  }

  function drawSignedLine(ctx, points, values, positiveColor, negativeColor, width) {
    ctx.save();
    ctx.lineWidth = width || 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    for (let i = 1; i < points.length; i += 1) {
      const [x1, y1] = points[i - 1];
      const [x2, y2] = points[i];
      const v1 = Number(values[i - 1] || 0);
      const v2 = Number(values[i] || 0);
      ctx.strokeStyle = (v1 + v2) / 2 >= 0 ? positiveColor : negativeColor;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawSignedPoints(ctx, points, values, positiveColor, negativeColor, radius) {
    ctx.save();
    points.forEach(([x, y], index) => {
      ctx.fillStyle = Number(values[index] || 0) >= 0 ? positiveColor : negativeColor;
      ctx.beginPath();
      ctx.arc(x, y, radius || 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawPoints(ctx, points, color, radius) {
    ctx.save();
    ctx.fillStyle = color;
    points.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, radius || 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  function drawMarkers(ctx, markers, canvas) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '20px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", system-ui, sans-serif';
    markers.forEach((marker) => {
      const icon = iconFor(marker.type, marker.subtype, marker.severity);
      // Plain icon only: no circle/border, so event markers do not compete with the chart.
      ctx.save();
      ctx.shadowColor = 'rgba(15, 23, 42, .16)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = '#111827';
      ctx.fillText(icon, marker.x, marker.y + 0.8);
      ctx.restore();
    });
    ctx.restore();
    attachCanvasInteractions(canvas);
  }

  function drawMarkerGlyph(ctx, marker, color) {
    const x = marker.x;
    const y = marker.y;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (marker.type === 'feed_in') {
      // arrow entering a tray/box: avoids missing emoji fonts on iOS/Edge canvas
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 5);
      ctx.lineTo(x + 2, y + 3);
      ctx.lineTo(x - 2, y + 3);
      ctx.moveTo(x + 2, y + 3);
      ctx.lineTo(x + 2, y - 1);
      ctx.stroke();
      ctx.strokeRect(x - 2, y + 2, 8, 5);
      ctx.restore();
      return;
    }

    if (marker.type === 'feed_change') {
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 3);
      ctx.lineTo(x + 5, y - 3);
      ctx.lineTo(x + 2, y - 6);
      ctx.moveTo(x + 5, y - 3);
      ctx.lineTo(x + 2, y);
      ctx.moveTo(x + 6, y + 4);
      ctx.lineTo(x - 5, y + 4);
      ctx.lineTo(x - 2, y + 1);
      ctx.moveTo(x - 5, y + 4);
      ctx.lineTo(x - 2, y + 7);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const type = normalizeEventType(marker.type);
    if (type === 'rain') {
      ctx.beginPath();
      ctx.moveTo(x - 5, y - 1); ctx.lineTo(x - 7, y + 5);
      ctx.moveTo(x, y - 2); ctx.lineTo(x - 2, y + 6);
      ctx.moveTo(x + 5, y - 1); ctx.lineTo(x + 3, y + 5);
      ctx.stroke();
    } else if (type === 'injection') {
      ctx.beginPath();
      ctx.moveTo(x - 5, y + 5); ctx.lineTo(x + 5, y - 5);
      ctx.moveTo(x + 1, y - 6); ctx.lineTo(x + 6, y - 1);
      ctx.moveTo(x - 6, y + 1); ctx.lineTo(x - 1, y + 6);
      ctx.stroke();
      if (String(marker.subtype || '').toLowerCase() === 'preg') {
        ctx.font = 'bold 8px system-ui';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('P', x + 5, y + 5);
      }
    } else if (type === 'duck_cull') {
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('คัด', x, y + 1);
    } else if (type === 'vitamin') {
      ctx.font = 'bold 13px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('V', x, y + 1);
    } else if (type === 'medicine') {
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('ยา', x, y + 1);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSelectedGuide(ctx, canvas, daily, top, bottom) {
    const idx = state.selectedIndex >= 0 ? state.selectedIndex : state.hoverIndex;
    if (idx < 0 || idx >= daily.length) return;
    const xAt = makeXMapper(daily, top);
    const x = xAt(idx);
    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, .42)';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, top.y - 26);
    ctx.lineTo(x, bottom.y + bottom.h);
    ctx.stroke();
    ctx.restore();
  }

  function drawMiniLegend(ctx, series, pane) {
    ctx.save();
    ctx.font = '11px system-ui';
    let x = pane.x;
    const y = pane.y + pane.h + 38;
    series.forEach((s) => {
      ctx.fillStyle = s.color || '#111827';
      ctx.fillRect(x, y - 9, 10, 10);
      ctx.fillStyle = '#475569';
      ctx.fillText(s.label, x + 14, y);
      x += ctx.measureText(s.label).width + 34;
    });
    ctx.restore();
  }

  function drawNoData(ctx, w, h) {
    ctx.fillStyle = '#64748b';
    ctx.font = '16px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('ไม่มีข้อมูลในช่วงนี้', w / 2, h / 2);
  }

  function attachCanvasInteractions(canvas) {
    if (!canvas || canvas.dataset.rvBound === '1') return;
    canvas.dataset.rvBound = '1';
    const handle = (event, commit) => {
      const meta = chartCache.get(canvas);
      if (!meta || !meta.daily?.length) return;
      const rect = canvas.getBoundingClientRect();
      const clientX = event.touches?.[0]?.clientX ?? event.clientX;
      const x = clientX - rect.left;
      const pane = meta.top || meta.pane || meta.bottom;
      const ratio = Math.max(0, Math.min(1, (x - pane.x) / Math.max(1, pane.w)));
      const idx = Math.round(ratio * (meta.daily.length - 1));
      state.hoverIndex = idx;
      if (commit) state.selectedIndex = idx;
      renderInspector();
      renderCharts();
      showTooltip(meta.daily[idx], event, canvas, meta.chartType || 'main');
    };
    canvas.addEventListener('mousemove', (event) => handle(event, false));
    canvas.addEventListener('mouseleave', () => hideTooltip());
    canvas.addEventListener('click', (event) => handle(event, true));
    canvas.addEventListener('touchstart', (event) => handle(event, true), { passive: true });
  }

  function showTooltip(day, event, canvas, chartType) {
    const tip = tooltipForCanvas(canvas);
    if (!tip || !day) return;
    const rect = canvas.getBoundingClientRect();
    const parentRect = canvas.parentElement.getBoundingClientRect();
    const x = (event.touches?.[0]?.clientX ?? event.clientX) - rect.left;
    const y = (event.touches?.[0]?.clientY ?? event.clientY) - rect.top;
    tip.classList.remove('hidden');
    const leftMax = Math.max(8, parentRect.width - 265);
    const topMax = Math.max(8, parentRect.height - 178);
    tip.style.left = `${Math.min(leftMax, Math.max(8, x + 12))}px`;
    tip.style.top = `${Math.min(topMax, Math.max(8, y + 10))}px`;
    tip.innerHTML = tooltipHtml(day, chartType || 'main');
  }

  function tooltipForCanvas(canvas) {
    if (!canvas?.parentElement) return document.getElementById('rvTooltip');
    let tip = canvas.parentElement.querySelector('.rv-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'rv-tooltip hidden';
      canvas.parentElement.appendChild(tip);
    }
    return tip;
  }

  function hideTooltip() {
    document.querySelectorAll('.rv-tooltip').forEach((tip) => tip.classList.add('hidden'));
    state.hoverIndex = -1;
  }

  function tooltipHtml(day, chartType) {
    const eventLines = day.timeline.slice(0, 6).map((event) => {
      const title = event.title || eventLabel(event.type);
      const detail = event.detail ? `: ${event.detail}` : '';
      return `${iconFor(event.type, event.subtype, event.severity)} ${esc(title)}${esc(detail)}`;
    }).join('<br>');
    const title = `<b>${esc(thaiDate(day.dateKey))}</b>`;

    if (chartType === 'egg') {
      return `
        ${title}
        <div>ไข่ ${fmt(day.eggDaily)} ฟอง</div>
        <div>%ไข่ ${fmt(day.eggPercent)}%</div>
        <div>เป็ดคงเหลือ ${fmt(day.duckRemain || 0)} ตัว</div>
      `;
    }

    if (chartType === 'feed') {
      const names = day.feedNameText ? `<div>อาหาร: ${esc(day.feedNameText)}</div>` : '';
      const feedIn = (day.feedMarkers || [])
        .filter((event) => event.type === 'feed_in')
        .map((event) => `${iconFor(event.type)} ${esc(event.title || 'อาหารเข้า')}${event.detail ? `: ${esc(event.detail)}` : ''}`)
        .join('<br>');
      return `
        ${title}
        <div>เท ${fmt(day.feedOutQty)} ลูก</div>
        <div>กินจริง ${fmt(day.consumedQty)} ลูก</div>
        <div>เหลือ ${fmt(day.leftoverQty)} ลูก</div>
        ${names}
        ${feedIn ? `<hr><div>${feedIn}</div>` : ''}
      `;
    }

    if (chartType === 'event') {
      return `
        ${title}
        ${eventLines ? `<div>${eventLines}</div>` : '<div>ไม่มีเหตุการณ์</div>'}
      `;
    }

    if (chartType === 'cost') {
      return `
        ${title}
        <div>ทุนอาหาร ${money(day.feedCost)}</div>
        <div>ขาย ${money(day.eggIncome)}</div>
        <div>สุทธิ ${money(day.netAfterEvent)}</div>
      `;
    }

    return `
      ${title}
      <div>ไข่ ${fmt(day.eggDaily)} ฟอง • ${fmt(day.eggPercent)}%</div>
      <div>เท ${fmt(day.feedOutQty)} ลูก</div>
      <div>กินจริง ${fmt(day.consumedQty)} ลูก / เหลือ ${fmt(day.leftoverQty)} ลูก</div>
      ${eventLines ? `<hr><div>${eventLines}</div>` : ''}
    `;
  }

  function scopedValue(dateKey) { return String(dateKey || '').slice(0, 7); }
  function normalizeDateKey(value) { return value ? String(value).slice(0, 10) : ''; }
  function scopedByMonth(dateKey) { return state.selectedMonth === 'all' || scopedValue(dateKey) === state.selectedMonth; }
  function normalizeEventType(type) { const t = String(type || 'other').toLowerCase(); if (t === 'vaccine' || t === 'injection_preg' || t === 'injection_flu') return 'injection'; if (t === 'weather') return 'rain'; if (t === 'farm_event' || t === 'sick' || t === 'cleaning') return 'other'; return eventIconMap[t] ? t : 'other'; }
  function normalizeFeedMoveType(type) { const t = String(type || '').toLowerCase(); return ['in', 'เข้า', 'receive', 'stock_in'].includes(t) ? 'feed_in' : 'feed_out'; }
  function eventSortWeight(type) { return type === 'feed_in' ? 1 : type === 'feed_change' ? 2 : 3; }
  function iconFor(type, subtype, severity) { const t = normalizeEventType(type); if (t === 'injection' && subtype === 'preg') return '💉P'; if (t === 'rain' && (severity === 'high' || subtype === 'heavy')) return '⛈'; return eventIconMap[t] || eventIconMap[type] || '•'; }
  function eventLabel(type) { return eventLabelMap[normalizeEventType(type)] || eventLabelMap[type] || 'เหตุการณ์'; }

  function deriveMonths(rows) {
    const map = {};
    (rows || []).forEach((row) => {
      const key = row.month_key || String(row.date_key || '').slice(0, 7);
      if (key) map[key] = { key, label: thaiMonth(key) };
    });
    return Object.keys(map).sort().map((key) => map[key]);
  }

  function weightedEggPercent(daily) {
    const denominator = daily.reduce((sum, day) => sum + (day.eggPercent > 0 ? day.eggDaily / (day.eggPercent / 100) : 0), 0);
    const eggs = sum(daily, 'eggDaily');
    return denominator > 0 ? (eggs / denominator) * 100 : 0;
  }

  function sum(rows, key) { return (rows || []).reduce((s, r) => s + Number(r[key] || 0), 0); }
  function niceExtent(values) {
    const nums = (values || []).map((v) => Number(v || 0)).filter((v) => Number.isFinite(v));
    let min = Math.min(0, ...nums);
    let max = Math.max(1, ...nums);
    if (min < 0) min = -niceMax(Math.abs(min));
    max = niceMax(max);
    if (min === max) max = min + 1;
    return { min, max };
  }

  function valueToY(value, min, max, pane) {
    const span = Math.max(1e-9, Number(max) - Number(min));
    const ratio = (Number(value || 0) - Number(min)) / span;
    return pane.y + pane.h - ratio * pane.h;
  }

  function niceMax(value) { const v = Math.max(1, Number(value || 1)); const pow = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / pow) * pow; }
  function fmt(value) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 1 }); }
  function money(value) { return Number(value || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 }) + ' ฿'; }
  function shortDate(key) { return String(key || '').slice(5); }
  function thaiDate(key) { const d = parseDate(key); if (!d) return key || '-'; const m = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.']; return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear() + 543}`; }
  function thaiMonth(key) { const p = String(key || '').split('-'); const y = Number(p[0] || 0); const m = Number(p[1] || 0); const names = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']; return `${names[m - 1] || key} ${y ? y + 543 : ''}`; }
  function parseDate(key) { const p = String(key || '').slice(0, 10).split('-').map(Number); return p.length === 3 && p[0] ? new Date(p[0], p[1] - 1, p[2]) : null; }
  function shortDateTime(value) { return String(value || '').replace('T', ' ').slice(0, 16) || '-'; }
  function esc(value) { return String(value ?? '').replace(/[&<>'"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[m])); }
  function setText(id, text) { const el = document.getElementById(id); if (el) el.textContent = text || ''; }
  function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }

  return { bootstrap };
})();

window.addEventListener('DOMContentLoaded', () => window.ReportViewPage?.bootstrap?.());
