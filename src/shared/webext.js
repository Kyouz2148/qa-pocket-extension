(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.QAWebExt = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function getRawApi() {
    if (typeof globalThis.browser !== 'undefined' && globalThis.browser?.runtime) {
      return { api: globalThis.browser, isPromiseNative: true };
    }
    if (typeof globalThis.chrome !== 'undefined' && globalThis.chrome?.runtime) {
      return { api: globalThis.chrome, isPromiseNative: false };
    }
    return { api: null, isPromiseNative: false };
  }

  function invoke(ctx, methodName, args) {
    const { api, isPromiseNative } = getRawApi();
    if (!api || !ctx || typeof ctx[methodName] !== 'function') {
      return Promise.reject(new Error(`API indisponível: ${methodName}`));
    }

    if (isPromiseNative) {
      try {
        return Promise.resolve(ctx[methodName](...args));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (err, res) => {
        if (settled) return;
        settled = true;
        if (err) reject(err);
        else resolve(res);
      };

      try {
        const ret = ctx[methodName](...args, (result) => {
          const lastErr = api.runtime && api.runtime.lastError;
          if (lastErr) {
            done(new Error(lastErr.message || String(lastErr)));
          } else {
            done(null, result);
          }
        });

        if (ret && typeof ret.then === 'function') {
          ret.then(
            (val) => done(null, val),
            (err) => done(err)
          );
        }
      } catch (err) {
        done(err);
      }
    });
  }

  function getApi() {
    return getRawApi().api;
  }

  function getURL(path) {
    const api = getApi();
    return api?.runtime?.getURL ? api.runtime.getURL(path) : path;
  }

  function sendRuntimeMessage(msg) {
    const api = getApi();
    return invoke(api?.runtime, 'sendMessage', [msg]);
  }

  function sendTabMessage(tabId, msg) {
    const api = getApi();
    return invoke(api?.tabs, 'sendMessage', [tabId, msg]);
  }

  function queryTabs(queryInfo) {
    const api = getApi();
    return invoke(api?.tabs, 'query', [queryInfo]);
  }

  function captureVisibleTab(windowId, options = { format: 'png' }) {
    const api = getApi();
    const args = typeof windowId === 'number' ? [windowId, options] : [options];
    return invoke(api?.tabs, 'captureVisibleTab', args);
  }

  function getStorageArea() {
    const api = getApi();
    if (!api?.storage) return null;
    return api.storage.session || api.storage.local || null;
  }

  function storageGet(area, keys) {
    return invoke(area, 'get', [keys]);
  }

  function storageSet(area, items) {
    return invoke(area, 'set', [items]);
  }

  function storageRemove(area, keys) {
    return invoke(area, 'remove', [keys]);
  }

  function executeScript(injection) {
    const api = getApi();
    if (api?.scripting?.executeScript) {
      return invoke(api.scripting, 'executeScript', [injection]);
    }
    return Promise.reject(new Error('scripting.executeScript indisponível'));
  }

  function setBadgeText(details) {
    const api = getApi();
    const actionApi = api?.action || api?.browserAction;
    if (!actionApi?.setBadgeText) return Promise.resolve();
    return invoke(actionApi, 'setBadgeText', [details]).catch(() => {});
  }

  function setBadgeBackgroundColor(details) {
    const api = getApi();
    const actionApi = api?.action || api?.browserAction;
    if (!actionApi?.setBadgeBackgroundColor) return Promise.resolve();
    return invoke(actionApi, 'setBadgeBackgroundColor', [details]).catch(() => {});
  }

  return {
    getApi,
    getURL,
    sendRuntimeMessage,
    sendTabMessage,
    queryTabs,
    captureVisibleTab,
    getStorageArea,
    storageGet,
    storageSet,
    storageRemove,
    executeScript,
    setBadgeText,
    setBadgeBackgroundColor
  };
});
