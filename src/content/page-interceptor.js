(function () {
  'use strict';

  if (window.__QA_POCKET_MAIN_INSTALLED__) return;
  window.__QA_POCKET_MAIN_INSTALLED__ = true;

  function markMainInstalled() {
    try {
      if (document.documentElement) {
        document.documentElement.dataset.qaPocketMain = '1';
      }
    } catch {
      // noop
    }
  }
  markMainInstalled();
  if (!document.documentElement) {
    document.addEventListener('DOMContentLoaded', markMainInstalled, { once: true });
  }

  const CHANNEL = 'qa-pocket-main';

  function emit(type, payload) {
    try {
      window.postMessage({ source: CHANNEL, type, payload }, '*');
    } catch {
      // Nunca interferir com a página hospedeira
    }
  }

  function truncate(str, max = 1200) {
    const s = String(str || '');
    return s.length > max ? `${s.slice(0, max)}… [truncado]` : s;
  }

  function serializeArg(arg, depth = 0) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    const t = typeof arg;
    if (t === 'string') return truncate(arg, 600);
    if (t === 'number' || t === 'boolean' || t === 'bigint') return String(arg);
    if (t === 'symbol') return arg.toString();
    if (t === 'function') return `[Function ${arg.name || 'anonymous'}]`;

    if (arg instanceof Error) {
      return `${arg.name || 'Error'}: ${arg.message || ''}`;
    }

    if (typeof HTMLElement !== 'undefined' && arg instanceof HTMLElement) {
      const id = arg.id ? `#${arg.id}` : '';
      return `<${arg.tagName.toLowerCase()}${id}>`;
    }

    if (depth >= 2) return '[Object]';

    try {
      const seen = new WeakSet();
      const json = JSON.stringify(
        arg,
        function (_k, v) {
          if (typeof v === 'object' && v !== null) {
            if (seen.has(v)) return '[Circular]';
            seen.add(v);
          }
          if (typeof v === 'bigint') return String(v);
          return v;
        },
        2
      );
      return truncate(json || String(arg), 800);
    } catch {
      return String(arg);
    }
  }

  function extractStack(args) {
    for (const a of args) {
      if (a instanceof Error && a.stack) {
        return truncate(a.stack, 1000);
      }
    }
    return '';
  }

  // 1. Hook console.error & console.warn
  const origError = console.error;
  const origWarn = console.warn;

  console.error = function (...args) {
    try {
      emit('console', {
        level: 'error',
        message: truncate(args.map((a) => serializeArg(a)).join(' '), 1400),
        stack: extractStack(args),
        timestamp: Date.now()
      });
    } catch {
      // noop
    }
    return origError.apply(console, args);
  };

  console.warn = function (...args) {
    try {
      emit('console', {
        level: 'warn',
        message: truncate(args.map((a) => serializeArg(a)).join(' '), 1400),
        stack: extractStack(args),
        timestamp: Date.now()
      });
    } catch {
      // noop
    }
    return origWarn.apply(console, args);
  };

  // 2. Exceções não tratadas e recursos quebrados (<img>, <script>, etc.)
  window.addEventListener(
    'error',
    function (event) {
      try {
        if (event instanceof ErrorEvent || event.message) {
          const source = event.filename
            ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}`
            : '';
          emit('console', {
            level: 'error',
            message: truncate(event.message || 'Erro de execução não tratado', 1200),
            stack: event.error && event.error.stack ? truncate(event.error.stack, 1000) : '',
            source,
            timestamp: Date.now()
          });
        } else if (event.target && event.target !== window) {
          const el = event.target;
          const tag = el.tagName ? el.tagName.toLowerCase() : 'recurso';
          const resourceUrl = el.src || el.href || '';
          if (resourceUrl) {
            emit('console', {
              level: 'error',
              message: `Falha ao carregar <${tag}>: ${resourceUrl}`,
              source: resourceUrl,
              timestamp: Date.now()
            });
          }
        }
      } catch {
        // noop
      }
    },
    true
  );

  // 3. Promises rejeitadas sem .catch()
  window.addEventListener('unhandledrejection', function (event) {
    try {
      const reason = event.reason;
      const msg =
        reason instanceof Error
          ? `UnhandledRejection: ${reason.name}: ${reason.message}`
          : `UnhandledRejection: ${serializeArg(reason)}`;
      emit('console', {
        level: 'error',
        message: truncate(msg, 1200),
        stack: reason instanceof Error && reason.stack ? truncate(reason.stack, 1000) : '',
        timestamp: Date.now()
      });
    } catch {
      // noop
    }
  });

  // 4. Hook window.fetch
  if (typeof window.fetch === 'function') {
    const origFetch = window.fetch;
    window.fetch = function (input, init) {
      const startedAt = performance.now();
      let method = 'GET';
      let url = '';

      try {
        if (typeof input === 'string') {
          url = input;
        } else if (input && typeof input.url === 'string') {
          url = input.url;
          method = input.method || method;
        } else if (input instanceof URL) {
          url = input.toString();
        }
        if (init && init.method) {
          method = String(init.method).toUpperCase();
        }
        url = new URL(url, window.location.href).href;
      } catch {
        url = String(input || '');
      }

      return origFetch.apply(this, arguments).then(
        function (response) {
          try {
            if (!response.ok && response.status >= 400) {
              const durationMs = Math.round(performance.now() - startedAt);
              const cloned = response.clone();
              cloned
                .text()
                .then(function (text) {
                  emit('network', {
                    kind: 'fetch',
                    method: String(method || 'GET').toUpperCase(),
                    url,
                    status: response.status,
                    statusText: response.statusText || '',
                    durationMs,
                    responseSnippet: truncate(text, 700),
                    timestamp: Date.now()
                  });
                })
                .catch(function () {
                  emit('network', {
                    kind: 'fetch',
                    method: String(method || 'GET').toUpperCase(),
                    url,
                    status: response.status,
                    statusText: response.statusText || '',
                    durationMs,
                    responseSnippet: '',
                    timestamp: Date.now()
                  });
                });
            }
          } catch {
            // noop
          }
          return response;
        },
        function (err) {
          try {
            const durationMs = Math.round(performance.now() - startedAt);
            emit('network', {
              kind: 'fetch',
              method: String(method || 'GET').toUpperCase(),
              url,
              status: 0,
              statusText: 'Network Error',
              error: err && err.message ? err.message : 'Fetch failed',
              durationMs,
              responseSnippet: '',
              timestamp: Date.now()
            });
          } catch {
            // noop
          }
          throw err;
        }
      );
    };
  }

  // 5. Hook XMLHttpRequest
  const xhrMeta = new WeakMap();
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    try {
      const resolved = new URL(String(url || ''), window.location.href).href;
      xhrMeta.set(this, {
        method: String(method || 'GET').toUpperCase(),
        url: resolved,
        aborted: false,
        startedAt: 0
      });
    } catch {
      xhrMeta.set(this, {
        method: String(method || 'GET').toUpperCase(),
        url: String(url || ''),
        aborted: false,
        startedAt: 0
      });
    }
    return origOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    const meta = xhrMeta.get(this);
    if (meta) {
      meta.startedAt = performance.now();
      this.addEventListener(
        'abort',
        function () {
          meta.aborted = true;
        },
        { once: true }
      );
      this.addEventListener(
        'loadend',
        function () {
          try {
            if (meta.aborted) return;
            const status = this.status;
            if (status >= 400 || status === 0) {
              const durationMs = Math.round(performance.now() - meta.startedAt);
              let snippet = '';
              try {
                if (!this.responseType || this.responseType === 'text') {
                  snippet = truncate(this.responseText, 700);
                } else if (this.responseType === 'json' && this.response) {
                  snippet = truncate(JSON.stringify(this.response), 700);
                }
              } catch {
                snippet = '';
              }
              emit('network', {
                kind: 'xhr',
                method: meta.method,
                url: meta.url,
                status,
                statusText: this.statusText || (status === 0 ? 'Network Error' : ''),
                error: status === 0 ? 'XHR Network/CORS Error' : '',
                durationMs,
                responseSnippet: snippet,
                timestamp: Date.now()
              });
            }
          } catch {
            // noop
          }
        },
        { once: true }
      );
    }
    return origSend.apply(this, arguments);
  };

  // 6. SPA Navigation tracking para breadcrumbs
  const origPushState = history.pushState;
  const origReplaceState = history.replaceState;

  history.pushState = function () {
    const res = origPushState.apply(this, arguments);
    emit('navigation', { url: window.location.href, timestamp: Date.now() });
    return res;
  };

  history.replaceState = function () {
    const res = origReplaceState.apply(this, arguments);
    emit('navigation', { url: window.location.href, timestamp: Date.now() });
    return res;
  };

  window.addEventListener('popstate', function () {
    emit('navigation', { url: window.location.href, timestamp: Date.now() });
  });
})();
