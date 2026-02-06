/* /common/assets/js/simulator-terms.js
 *
 * Term registry + loaders.
 * Supports multiple term groups ("buckets") that may come from different AJAX calls.
 *
 * Key principles:
 * - The server returns already translated text.
 * - Each bucket is a plain object: { "2": "Estimated duration", ... }
 * - Pages/modules decide WHICH buckets to load (course/skill dependent).
 * - This file provides the engine: register loaders, load buckets, lookup terms.
 *
 * Dependencies:
 * - Requires simulatorAjaxRequest(url, method, body) to exist (from simulator.js).
 *
 * Usage (on a page/module):
 *   simulatorTerms.defineLoader('common', async () => {
 *     const shared = await simulatorAjaxRequest('/ajax/shared_content.php','POST',{});
 *     return shared.common_terms;
 *   });
 *
 *   await simulatorTerms.ensure('common');
 *   el.textContent = simulatorTerm(539);            // default bucket: common
 *   el.textContent = simulatorTerm(12, 'problem');  // other bucket
 *
 * Debug:
 * - Add ?debug to URL to enable console logs.
 */

/* global simulatorAjaxRequest */

(function () {
  'use strict';

  // Avoid re-defining if loaded twice
  if (window.simulatorTerms && window.simulatorTerm) return;

  // -----------------------------
  // Private registries
  // -----------------------------
  const buckets = Object.create(null);      // bucketName -> { "id": "text", ... }
  const loaders = Object.create(null);      // bucketName -> async () => data
  const loadPromises = Object.create(null); // bucketName -> Promise in flight

  // -----------------------------
  // Debug helpers
  // -----------------------------
  const isDebug = () => {
    try { return new URLSearchParams(window.location.search).has('debug'); }
    catch { return false; }
  };
  const dlog = (...args) => { if (isDebug()) console.log('[terms]', ...args); };

  // -----------------------------
  // Normalize input to a plain object with string keys
  // Accepts:
  //  - plain object: { "2": "text" }
  //  - array rows:   [{id:2,text:"..."}, ...] (legacy convenience)
  //  - Map:          new Map([[2,"text"], ...])
  // Returns:
  //  - null-prototype object: { "2": "text", ... }
  // -----------------------------
  const normalize = (data) => {
    const out = Object.create(null);
    if (!data) return out;

    // Map -> object
    if (data instanceof Map) {
      for (const [k, v] of data.entries()) out[String(k)] = String(v ?? '');
      return out;
    }

    // Array rows -> object
    if (Array.isArray(data)) {
      for (const row of data) {
        const id = Number(row?.id);
        if (Number.isFinite(id)) out[String(id)] = String(row?.text ?? '');
      }
      return out;
    }

    // Plain object -> clone
    if (typeof data === 'object') {
      for (const [k, v] of Object.entries(data)) out[String(k)] = String(v ?? '');
      return out;
    }

    return out;
  };

  // -----------------------------
  // Public API: set bucket directly (no AJAX)
  // -----------------------------
  const set = (bucketName, data) => {
    if (!bucketName) return;
    buckets[bucketName] = normalize(data);
    dlog('set bucket', bucketName, 'size', Object.keys(buckets[bucketName]).length);
  };

  // -----------------------------
  // Public API: define a loader for a bucket
  // loaderFn must return bucket data in any supported format.
  // -----------------------------
  const defineLoader = (bucketName, loaderFn) => {
    if (!bucketName || typeof loaderFn !== 'function') return;
    loaders[bucketName] = loaderFn;
    dlog('defined loader', bucketName);
  };

  // -----------------------------
  // Public API: ensure bucket loaded
  // - returns bucket object
  // - caches in-flight promise to avoid duplicate calls
  // -----------------------------
  const ensure = async (bucketName = 'common') => {
    // Already loaded
    if (buckets[bucketName]) return buckets[bucketName];

    // In flight
    if (loadPromises[bucketName]) return loadPromises[bucketName];

    const loader = loaders[bucketName];
    if (!loader) {
      throw new Error(`No loader defined for terms bucket "${bucketName}"`);
    }

    loadPromises[bucketName] = (async () => {
      dlog('loading bucket', bucketName);
      const data = await loader();
      buckets[bucketName] = normalize(data);
      dlog('loaded bucket', bucketName, 'size', Object.keys(buckets[bucketName]).length);
      return buckets[bucketName];
    })();

    try {
      return await loadPromises[bucketName];
    } finally {
      loadPromises[bucketName] = null;
    }
  };

  // -----------------------------
  // Public API: lookup term (sync)
  // Note: if bucket not loaded yet, returns fallback marker.
  // -----------------------------
  const term = (id, bucketName = 'common', fallback = '') => {
    const b = buckets[bucketName];
    const v = b ? b[String(id)] : undefined;

    if (typeof v === 'string' && v !== '') return v;
    if (fallback !== '') return fallback;

    // Visible marker to spot missing loads/ids during migration
    return `[${bucketName}:${id}]`;
  };

  // -----------------------------
  // Optional: inspect what is configured/loaded (debugging)
  // -----------------------------
  const info = () => ({
    loadedBuckets: Object.keys(buckets),
    definedLoaders: Object.keys(loaders)
  });

  // Expose module
  window.simulatorTerms = { set, defineLoader, ensure, term, info };

  // Global convenience wrapper used everywhere
  window.simulatorTerm = (id, bucket = 'common', fallback = '') =>
    window.simulatorTerms.term(id, bucket, fallback);

  // Global DataTables language helper using the loaded common terms bucket.
  const datatableTerms = () => {
    const t = typeof window.simulatorTerm === 'function'
      ? (id, fallback = '') => window.simulatorTerm(id, 'common', fallback)
      : (_id, fallback = '') => fallback;

    return {
      search: t(431, 'Search'),
      info: `${t(432, 'Showing')} _TOTAL_ ${t(433, 'entries')}`,
      emptyTable: t(434, 'No data available'),
      infoEmpty: t(437, 'No entries'),
      infoFiltered: `(${t(436, 'Filtered from')} _MAX_ ${t(433, 'entries')})`,
      zeroRecords: t(434, 'No matching records'),
    };
  };

  window.datatableTerms = datatableTerms;

})();