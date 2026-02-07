/* /var/www/common/assets/js/core/simulator-ajax.js
 *
 * Unified AJAX request helper.
 *
 * Supports two modes:
 * - mode: "dynamic" => no caching, always fetch fresh, sends no-store.
 * - mode: "cache"   => uses ETag with If-None-Match + a provided cacheStore.
 *
 * Returns a consistent object:
 * { ok, status, data, error, fromCache }
 *
 * Notes:
 * - Never throws (returns ok:false on errors).
 * - Assumes endpoints return JSON { ok, data, error }.
 *   If endpoint returns raw JSON/text, it is wrapped as data.
 */

(() => {
  'use strict';

  const DEFAULT_TIMEOUT_MS = 10000;

  const isObject = (x) => x !== null && typeof x === 'object';

  const stripQuotes = (s) => String(s || '').replaceAll('"', '').trim();

  const normalizePayload = (payload) => {
    // If server returns {ok,data,error}, keep it.
    if (isObject(payload) && Object.prototype.hasOwnProperty.call(payload, 'ok')) {
      return {
        ok: Boolean(payload.ok),
        data: Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : null,
        error: Object.prototype.hasOwnProperty.call(payload, 'error') ? payload.error : null
      };
    }
    // Otherwise treat payload as data
    return { ok: true, data: payload, error: null };
  };

  const safeParseBody = async (res) => {
    const contentType = res.headers.get('Content-Type') || '';
    try {
      if (contentType.includes('application/json')) return await res.json();
      return await res.text();
    } catch (e) {
      // If parsing fails (invalid JSON / empty body), return null
      return null;
    }
  };

  /**
   * simulatorAjaxRequest(url, method, body, options)
   *
   * options:
   * - mode: "dynamic" | "cache" (default: "dynamic")
   * - timeoutMs: number (default 10000)
   * - headers: object
   * - csrfToken: string (optional) -> sets X-CSRF-Token if provided
   * - cacheKey: string (required for mode "cache")
   * - cacheStore: { get(key), set(key,val) } (required for mode "cache")
   */
  const simulatorAjaxRequest = async (url, method = 'POST', body = null, options = {}) => {
    // Respect global unload flag if present
    if (typeof window.simulatorIsUnloading !== 'undefined' && window.simulatorIsUnloading) {
      return { ok: false, status: 0, data: null, error: 'unloading', fromCache: false };
    }

    const mode = options.mode || 'dynamic';
    const timeoutMs = Number(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    const cacheKey = String(options.cacheKey || '');
    const cacheStore = options.cacheStore || null;

    // Guard cache mode config
    if (mode === 'cache') {
      if (!cacheKey || !cacheStore || typeof cacheStore.get !== 'function' || typeof cacheStore.set !== 'function') {
        return { ok: false, status: 0, data: null, error: 'cache_mode_requires_cacheKey_and_cacheStore', fromCache: false };
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const isFormData = body instanceof FormData;

      const headers = new Headers(options.headers || {});
      if (!isFormData && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      // Optional CSRF
      const csrfToken = options.csrfToken || window.SIM_CSRF_TOKEN || '';
      if (csrfToken && !headers.has('X-CSRF-Token')) {
        headers.set('X-CSRF-Token', csrfToken);
      }

      // Mode-specific headers
      if (mode === 'dynamic') {
        headers.set('Cache-Control', 'no-store');
        headers.set('Pragma', 'no-cache');
      }

      if (mode === 'cache') {
        const cached = cacheStore.get(cacheKey);
        if (cached?.etag) {
          headers.set('If-None-Match', `"${stripQuotes(cached.etag)}"`);
        }
      }

      const res = await fetch(url, {
        method,
        headers,
        body: isFormData ? body : body ? JSON.stringify(body) : null,
        cache: 'no-store', // we manage caching explicitly
        credentials: 'include',
        signal: controller.signal
      });

      const requestId = res.headers.get('X-Request-Id') || '';

      // 304 => return from cache (cache mode only)
      if (res.status === 304 && mode === 'cache') {
        const cached = cacheStore.get(cacheKey);
        if (cached && Object.prototype.hasOwnProperty.call(cached, 'data')) {
          return { ok: true, status: 304, data: cached.data, error: null, fromCache: true };
        }
        return { ok: false, status: 304, data: null, error: 'not_modified_no_cache', fromCache: false };
      }

      if (!res.ok) {
        // Do not throw, return structured error
        // Try to parse backend payload so callers can show meaningful messages.
        const payload = await safeParseBody(res);
        const normalized = normalizePayload(payload);
        return {
          ok: false,
          status: res.status,
          data: normalized.data,
          error: normalized.error || `http_${res.status}`,
          fromCache: false,
          request_id: (normalized?.data && typeof normalized.data === 'object' && normalized.data.request_id)
            ? normalized.data.request_id
            : (payload && typeof payload === 'object' && payload.request_id)
              ? payload.request_id
              : requestId
        };
      }

      const contentType = res.headers.get('Content-Type') || '';
      const etagHeader = res.headers.get('ETag') || '';
      const etag = stripQuotes(etagHeader);

      let payload;
      if (contentType.includes('application/json')) payload = await res.json();
      else payload = await res.text();

      const normalized = normalizePayload(payload);
      const out = {
        ok: normalized.ok,
        status: res.status,
        data: normalized.data,
        error: normalized.error,
        fromCache: false,
        request_id: requestId
      };

      // Store cache only in cache mode + ok + has ETag
      if (mode === 'cache' && out.ok && etag) {
        cacheStore.set(cacheKey, { etag, data: out.data, ts: Date.now() });
      }

      return out;

    } catch (e) {
      if (e?.name === 'AbortError') {
        return { ok: false, status: 0, data: null, error: 'aborted', fromCache: false };
      }
      return { ok: false, status: 0, data: null, error: e?.message || 'network_error', fromCache: false };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  // Export as global (so legacy/page scripts can use it without module bundling)
  window.simulatorAjaxRequest = simulatorAjaxRequest;
})();