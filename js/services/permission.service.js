window.PermissionApi = {
  adminOptions: () => AppApi.postCached({ action: 'getPermissionAdminOptions' }, { ttlMs: 5 * 60 * 1000, background: false }),
  accessList: (batchId) => AppApi.post({ action: 'getBatchAccessList', batch_id: batchId }),
  accessSummary: (batchId) => AppApi.post({ action: 'getBatchAccessSummary', batch_id: batchId })
};
