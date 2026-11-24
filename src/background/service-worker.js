'use strict';

if (typeof importScripts === 'function' && !globalThis.QAWebExt) {
  importScripts('../shared/webext.js');
}

const WebExt = globalThis.QAWebExt;
const api = WebExt ? WebExt.getApi() : globalThis.chrome;

const MAX_CONSOLE_LOGS = 60;
const MAX_NETWORK_ERRORS = 60;
const MAX_BREADCRUMBS = 30;

const storageArea = WebExt ? WebExt.getStorageArea() : (api?.storage?.session || api?.storage?.local);
const tabQueues = new Map();

function storageKey(tabId) {
  return `qa_tab_${tabId}`;
}

function emptyState() {
  return {
    consoleLogs: [],
    networkErrors: [],
    breadcrumbs: []
  };
}

function enqueueTabUpdate(tabId, mutator) {
  if (typeof tabId !== 'number' || tabId < 0 || !storageArea) {
    return Promise.resolve(emptyState());
  }
  const prev = tabQueues.get(tabId) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(async () => {
      const key = storageKey(tabId);
      const data = await WebExt.storageGet(storageArea, key);
      const state = (data && data[key]) || emptyState();
      mutator(state);
      await WebExt.storageSet(storageArea, { [key]: state });
      await updateBadge(tabId, state);
      return state;
    });
  tabQueues.set(tabId, next);
  return next;
}

async function getTabState(tabId) {
  if (typeof tabId !== 'number' || tabId < 0 || !storageArea) return emptyState();
  const pending = tabQueues.get(tabId);
  if (pending) {
    await pending.catch(() => {});
  }
  const key = storageKey(tabId);
  const data = await WebExt.storageGet(storageArea, key);
  return (data && data[key]) || emptyState();
}

async function updateBadge(tabId, state) {
  try {
    const consoleErrorCount = (state.consoleLogs || []).filter((c) => c.level === 'error').length;
    const netCount = (state.networkErrors || []).length;
    const total = consoleErrorCount + netCount;

    await WebExt.setBadgeText({
      tabId,
      text: total > 0 ? (total > 99 ? '99+' : String(total)) : ''
    });

    if (total > 0) {
      await WebExt.setBadgeBackgroundColor({
        tabId,
        color: '#e11d48'
      });
    }
  } catch {
    // Aba pode ter sido fechada
  }
}

function pushCapped(arr, item, max) {
  arr.push(item);
  if (arr.length > max) {
    arr.splice(0, arr.length - max);
  }
}

function upsertNetworkError(state, incoming) {
  const now = incoming.timestamp || Date.now();
  const existingIdx = state.networkErrors.findIndex((item) => {
    const closeInTime = Math.abs((item.timestamp || 0) - now) <= 1500;
    return (
      closeInTime &&
      item.url === incoming.url &&
      item.method === incoming.method &&
      item.status === incoming.status
    );
  });

  if (existingIdx !== -1) {
    const existing = state.networkErrors[existingIdx];
    if (!existing.responseSnippet && incoming.responseSnippet) {
      state.networkErrors[existingIdx] = { ...existing, ...incoming };
    } else if (typeof existing.durationMs !== 'number' && typeof incoming.durationMs === 'number') {
      state.networkErrors[existingIdx] = { ...existing, durationMs: incoming.durationMs };
    }
    return;
  }

  pushCapped(state.networkErrors, incoming, MAX_NETWORK_ERRORS);
}

function isInternalExtensionUrl(url) {
  const s = String(url || '');
  return (
    s.startsWith('chrome-extension://') ||
    s.startsWith('moz-extension://') ||
    s.startsWith('safari-web-extension://')
  );
}

// Observa requisições HTTP 4xx/5xx em navegadores que expõem webRequest (Chromium / Firefox)
if (api?.webRequest?.onCompleted) {
  api.webRequest.onCompleted.addListener(
    (details) => {
      if (details.tabId < 0) return;
      if (details.statusCode < 400) return;
      if (isInternalExtensionUrl(details.url)) return;

      enqueueTabUpdate(details.tabId, (state) => {
        upsertNetworkError(state, {
          kind: details.type === 'xmlhttprequest' ? 'xhr/fetch' : details.type || 'webRequest',
          method: details.method || 'GET',
          url: details.url,
          status: details.statusCode,
          statusText: details.statusLine ? details.statusLine.replace(/^HTTP\/[\d.]+\s+\d+\s*/, '') : '',
          timestamp: Date.now()
        });
      });
    },
    { urls: ['<all_urls>'] }
  );
}

if (api?.webRequest?.onErrorOccurred) {
  api.webRequest.onErrorOccurred.addListener(
    (details) => {
      if (details.tabId < 0) return;
      if (isInternalExtensionUrl(details.url)) return;
      if (details.error === 'net::ERR_ABORTED' || details.error === 'NS_BINDING_ABORTED') return;

      enqueueTabUpdate(details.tabId, (state) => {
        upsertNetworkError(state, {
          kind: details.type || 'webRequest',
          method: details.method || 'GET',
          url: details.url,
          status: 0,
          statusText: 'Network Error',
          error: details.error || 'Falha de rede',
          timestamp: Date.now()
        });
      });
    },
    { urls: ['<all_urls>'] }
  );
}

api?.tabs?.onRemoved?.addListener((tabId) => {
  tabQueues.delete(tabId);
  if (storageArea) {
    WebExt.storageRemove(storageArea, storageKey(tabId)).catch(() => {});
  }
});

api?.runtime?.onMessage?.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  if (msg.type === 'QA_LOG_EVENT') {
    const tabId = sender?.tab?.id;
    if (typeof tabId !== 'number' || tabId < 0) {
      sendResponse({ ok: false });
      return false;
    }

    enqueueTabUpdate(tabId, (state) => {
      if (msg.eventType === 'console' && msg.payload) {
        pushCapped(state.consoleLogs, msg.payload, MAX_CONSOLE_LOGS);
      } else if (msg.eventType === 'network' && msg.payload) {
        upsertNetworkError(state, msg.payload);
      } else if (msg.eventType === 'breadcrumb' && msg.payload) {
        pushCapped(state.breadcrumbs, msg.payload, MAX_BREADCRUMBS);
      }
    }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (msg.type === 'QA_GET_TAB_STATE') {
    getTabState(msg.tabId).then((state) => {
      sendResponse({ ok: true, state });
    });
    return true;
  }

  if (msg.type === 'QA_CLEAR_TAB_STATE') {
    enqueueTabUpdate(msg.tabId, (state) => {
      state.consoleLogs = [];
      state.networkErrors = [];
      state.breadcrumbs = [];
    }).then((state) => {
      sendResponse({ ok: true, state });
    });
    return true;
  }

  if (msg.type === 'QA_CAPTURE_SCREENSHOT') {
    WebExt.captureVisibleTab(msg.windowId, { format: 'png' })
      .then((dataUrl) => {
        if (!dataUrl) {
          sendResponse({ ok: false, error: 'Não foi possível capturar a tela.' });
        } else {
          sendResponse({ ok: true, dataUrl });
        }
      })
      .catch((err) => {
        sendResponse({
          ok: false,
          error: err?.message || 'Não foi possível capturar a tela.'
        });
      });
    return true;
  }

  return false;
});
