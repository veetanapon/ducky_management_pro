window.AppCache = (() => {
  function read(key, fallback = null) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      console.warn('Cache read failed', key, error);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn('Cache write failed', key, error);
      return false;
    }
  }

  function remove(key) {
    localStorage.removeItem(key);
  }

  function loadBatchCache() {
    const batches = read(AppConfig.CACHE_KEYS.BATCHES, []);
    const meta = read(AppConfig.CACHE_KEYS.BATCHES_META, null);
    return { batches, meta };
  }

  function saveBatchCache(batches, meta) {
    write(AppConfig.CACHE_KEYS.BATCHES, batches || []);
    write(AppConfig.CACHE_KEYS.BATCHES_META, meta || {});
  }

  function clearBatchCache() {
    remove(AppConfig.CACHE_KEYS.BATCHES);
    remove(AppConfig.CACHE_KEYS.BATCHES_META);
  }

  return {
    read,
    write,
    remove,
    loadBatchCache,
    saveBatchCache,
    clearBatchCache
  };
})();
