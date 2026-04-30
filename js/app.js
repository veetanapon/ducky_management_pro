window.addEventListener('DOMContentLoaded', async () => {
  const theme = localStorage.getItem('theme');
  if (theme === 'theme-dark') {
    document.body.classList.add('theme-dark');
  }

  const page = document.body?.dataset?.page || '';
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
  }
});
