window.ReportApi = {
  pageData: (batchId) => AppApi.postCached({ action: 'getReportPageData', batch_id: batchId }, { ttlMs: 2 * 60 * 1000, background: false }),
  rebuild: (batchId) => AppApi.post({ action: 'rebuildReportForBatch', batch_id: batchId }, { timeoutMs: 30000 }),
  exportExcel: (batchId, month) => AppApi.post({ action: 'exportReportExcel', batch_id: batchId, month }, { timeoutMs: 30000 }),
  publicView: (key) => AppApi.postPublic({ action: 'getReportPublicViewData', key })
};
