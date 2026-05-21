window.addEventListener('DOMContentLoaded', async () => {
  const theme = localStorage.getItem('theme');
  if (theme === 'theme-dark') {
    document.body.classList.add('theme-dark');
  }

  const rawPage = document.body?.dataset?.page || '';
  const page = normalizePageKey(rawPage);

  setupNetworkHints();
  ensureFaviconLink();
  registerDuckyServiceWorker(page);

  // Warm the Apps Script endpoint as early as possible. This is fire-and-forget
  // so the UI can render immediately while GAS connection/runtime warms up.
  if (window.AppApi?.warmup) {
    AppApi.warmup({ reason: `boot:${page || 'unknown'}`, silent: true });
  }

  if (window.NavDrawer) {
    NavDrawer.init({ page });
  }

  if (page === 'index' && window.IndexPage) {
    await IndexPage.bootstrap();
    return;
  }
  if ((page === 'batch' || page === 'batch_dashboard') && window.BatchDashboardPage) {
    await BatchDashboardPage.bootstrap();
    return;
  }
  if (page === 'batch_manage' && window.BatchManagePage) {
    await BatchManagePage.bootstrap();
    return;
  }
  if (page === 'report' && window.ReportPage) {
    await ReportPage.bootstrap();
    return;
  }
  if (page === 'report_view' && window.ReportViewPage) {
    await ReportViewPage.bootstrap();
    return;
  }
  if (page === 'farm_events' && window.BatchEventsPage) {
    await BatchEventsPage.bootstrap();
    return;
  }
  if (page === 'module_calendar' && window.ModuleCalendarPage) {
    await ModuleCalendarPage.bootstrap();
    return;
  }
  if (page === 'batch_access' && window.BatchAccessPage) {
    await BatchAccessPage.bootstrap();
    return;
  }
  if (page === 'admin_permissions' && window.AdminPermissionsPage) {
    await AdminPermissionsPage.bootstrap();
    return;
  }
  if (page === 'items_price_manage' && window.ItemsPriceManagePage) {
    await ItemsPriceManagePage.bootstrap();
    return;
  }
  if (page === 'liff_routes' && window.LiffRoutesPage) {
    await LiffRoutesPage.bootstrap();
    return;
  }
  if (page === 'medicine' && window.MedicinePage) {
    await MedicinePage.bootstrap();
    return;
  }

  if (rawPage) {
    console.warn('No page bootstrap matched:', { rawPage, page });
  }
});

function normalizePageKey(value) {
  const raw = String(value || '').trim();
  const normalized = raw.replace(/-/g, '_');
  const aliases = {
    batch_dashboard: 'batch_dashboard',
    batch_manage: 'batch_manage',
    report_view: 'report_view',
    farm_events: 'farm_events',
    module_calendar: 'module_calendar',
    batch_access: 'batch_access',
    admin_permissions: 'admin_permissions',
    items_price_manage: 'items_price_manage',
    liff_routes: 'liff_routes',
    module_feed: 'module_calendar',
    module_egg_daily: 'module_calendar',
    module_sale: 'module_calendar',
    module_report: 'module_calendar'
  };
  return aliases[normalized] || normalized;
}

function setupNetworkHints() {
  const urls = [
    window.AppConfig?.GAS_URL || '',
    'https://script.google.com',
    'https://script.googleusercontent.com',
    'https://drive.google.com',
    'https://static.line-scdn.net'
  ];

  const origins = Array.from(new Set(urls.map((value) => {
    try { return new URL(value).origin; } catch (_) { return ''; }
  }).filter(Boolean)));

  origins.forEach((origin) => {
    addResourceHint('dns-prefetch', origin);
    addResourceHint('preconnect', origin, true);
  });
}

function addResourceHint(rel, href, crossOrigin = false) {
  if (!href) return;
  const exists = document.head.querySelector(`link[rel="${rel}"][href="${href}"]`);
  if (exists) return;
  const link = document.createElement('link');
  link.rel = rel;
  link.href = href;
  if (crossOrigin) link.crossOrigin = 'anonymous';
  document.head.appendChild(link);
}

function ensureFaviconLink() {
  if (document.head.querySelector('link[rel="icon"], link[rel="shortcut icon"]')) return;
  const link = document.createElement('link');
  link.rel = 'icon';
  link.href = 'favicon.ico';
  document.head.appendChild(link);
}

function canUseServiceWorker() {
  if (!('serviceWorker' in navigator)) return false;
  if (location.protocol === 'https:') return true;
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') return true;
  return false;
}

function registerDuckyServiceWorker(page) {
  if (!canUseServiceWorker()) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', { scope: './' })
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const nextWorker = registration.installing;
          if (!nextWorker) return;
          nextWorker.addEventListener('statechange', () => {
            if (nextWorker.state === 'installed' && navigator.serviceWorker.controller) {
              nextWorker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
  });
}
