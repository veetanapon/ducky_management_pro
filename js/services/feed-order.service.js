window.FeedOrderService = (() => {
  function normalizeActionText(res) {
    return String(res?.code || res?.message || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_');
  }

  function shouldTryNextAction(res) {
    const text = normalizeActionText(res);
    return (
      !res ||
      text.includes('INVALID_ACTION') ||
      text.includes('UNKNOWN_ACTION') ||
      text.includes('ACTION_NOT_FOUND') ||
      text.includes('NOT_FOUND_ACTION')
    );
  }

  async function postAction(actions, payload = {}, options = {}) {
    const list = Array.isArray(actions) ? actions : [actions];
    let last = null;
    for (const action of list) {
      const res = await AppApi.post({ ...payload, action }, options);
      last = res;
      if (res && res.status === 'ok') return res;
      if (!shouldTryNextAction(res)) return res;
    }
    return last;
  }

  function normalizeLotPayload(payload = {}) {
    const out = { ...payload };
    if (out.feed_order_id && !out.purchase_lot_id) out.purchase_lot_id = out.feed_order_id;
    if (out.purchase_lot_id && !out.lot_id) out.lot_id = out.purchase_lot_id;
    if (out.lot_id && !out.purchase_lot_id) out.purchase_lot_id = out.lot_id;
    delete out.feed_order_id;
    return out;
  }

  function getPageData(options = {}) {
    return postAction([
      'getFeedOrderBillPageData',
      'getFeedOrderBillsPageData',
      'getFeedOrderPageData'
    ], {}, { timeoutMs: 20000, ...options });
  }

  function saveLot(payload) {
    return postAction([
      'saveFeedOrderLot',
      'saveFeedOrderBill',
      'createFeedOrderBill',
      'createFeedOrderLot'
    ], payload, { timeoutMs: 25000, dedupe: false });
  }

  function allocate(payload) {
    return postAction([
      'allocateFeedOrderToBatch',
      'allocateFeedOrderBillToBatch',
      'allocateFeedOrderLot',
      'saveFeedOrderAllocation'
    ], normalizeLotPayload(payload), { timeoutMs: 25000, dedupe: false });
  }

  function savePayment(payload) {
    return postAction([
      'saveFeedOrderPayment',
      'recordFeedOrderPayment',
      'createFeedOrderPayment'
    ], normalizeLotPayload(payload), { timeoutMs: 25000, dedupe: false });
  }

  function setVisibility(payload) {
    return postAction([
      'setFeedOrderLotVisibility',
      'updateFeedOrderLotVisibility',
      'hideFeedOrderLot'
    ], normalizeLotPayload(payload), { timeoutMs: 25000, dedupe: false });
  }

  function saveClaim(payload) {
    return postAction([
      'saveFeedOrderClaim',
      'recordFeedOrderClaim',
      'createFeedOrderClaim'
    ], normalizeLotPayload(payload), { timeoutMs: 25000, dedupe: false });
  }

  return { getPageData, saveLot, allocate, savePayment, saveClaim, setVisibility };
})();
