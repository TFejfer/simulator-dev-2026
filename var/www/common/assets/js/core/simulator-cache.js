/* /var/www/common/assets/js/core/simulator-cache.js
 *
 * Small cache utilities for browser-side caching of JSON payloads.
 * Used by simulator-ajax.js in "cache" mode (ETag + session/memory store).
 *
 * Stores: { etag: string, data: any, ts: number }
 */

(() => {
  'use strict';

  const safeJsonParse = (raw) => {
    try { return JSON.parse(raw); } catch { return null; }
  };

  const safeJsonStringify = (obj) => {
    try { return JSON.stringify(obj); } catch { return ''; }
  };

  const createMemoryStore = () => {
    const m = new Map();
    return {
      get: (key) => m.get(key) || null,
      set: (key, value) => { m.set(key, value); },
      del: (key) => { m.delete(key); },
      clear: () => { m.clear(); }
    };
  };

  const createSessionStore = (prefix = 'simcache:') => {
    const k = (key) => `${prefix}${key}`;

    return {
      get: (key) => {
        const raw = sessionStorage.getItem(k(key));
        return raw ? safeJsonParse(raw) : null;
      },
      set: (key, value) => {
        const raw = safeJsonStringify(value);
        if (raw) sessionStorage.setItem(k(key), raw);
      },
      del: (key) => {
        sessionStorage.removeItem(k(key));
      },
      clearByPrefix: () => {
        const keys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const kk = sessionStorage.key(i);
          if (kk && kk.startsWith(prefix)) keys.push(kk);
        }
        keys.forEach((kk) => sessionStorage.removeItem(kk));
      }
    };
  };

  // Public singleton
  window.simulatorCache = Object.freeze({
    mem: createMemoryStore(),
    session: createSessionStore('simcache:'),
    createSessionStore,
    createMemoryStore
  });
})();