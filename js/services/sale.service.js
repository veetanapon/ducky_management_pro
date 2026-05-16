window.SaleApi = {
  pageData: (batchId, month) => AppApi.postCached({ action: 'getModuleCalendarData', batch_id: batchId, module_type: 'sale_manage', month }, { background: false }),
  saveBill: (payload) => AppApi.post({ action: 'saveBatchSaleBill', ...payload }),
  billRecord: (payload) => AppApi.post({ action: 'getSaleBillRecord', ...payload }),
  billsForDate: (payload) => AppApi.post({ action: 'getSaleBillsForDate', ...payload }),
  rangeSummary: (payload) => AppApi.post({ action: 'getSaleBillRangeSummary', ...payload })
};
