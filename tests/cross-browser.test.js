'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

test('QAWebExt suporta API Promise (browser.*) e callback (chrome.*)', async () => {
  const prevBrowser = globalThis.browser;
  const prevChrome = globalThis.chrome;

  try {
    // 1. Simula Firefox/Safari (browser.* com Promises)
    delete globalThis.chrome;
    globalThis.browser = {
      runtime: {
        getURL: (p) => `moz-extension://uuid/${p}`,
        sendMessage: async (msg) => ({ via: 'browser', msg })
      },
      storage: {
        local: {
          get: async (k) => ({ [k]: { ok: true } }),
          set: async () => undefined,
          remove: async () => undefined
        }
      },
      tabs: {
        query: async () => [{ id: 1, url: 'https://exemplo.com' }]
      }
    };

    delete require.cache[require.resolve('../src/shared/webext.js')];
    const WebExtBrowser = require('../src/shared/webext.js');

    assert.equal(WebExtBrowser.getURL('a.js'), 'moz-extension://uuid/a.js');
    const r1 = await WebExtBrowser.sendRuntimeMessage({ ping: 1 });
    assert.equal(r1.via, 'browser');
    assert.ok(WebExtBrowser.getStorageArea(), 'Deve fazer fallback para storage.local se storage.session não existir');

    // 2. Simula Chromium (chrome.* com callback + lastError)
    delete globalThis.browser;
    globalThis.chrome = {
      runtime: {
        lastError: null,
        getURL: (p) => `chrome-extension://id/${p}`,
        sendMessage: (msg, cb) => cb({ via: 'chrome', msg })
      },
      tabs: {
        sendMessage: (_tabId, _msg, cb) => {
          globalThis.chrome.runtime.lastError = { message: 'Could not establish connection' };
          cb(undefined);
          globalThis.chrome.runtime.lastError = null;
        }
      }
    };

    const r2 = await WebExtBrowser.sendRuntimeMessage({ ping: 2 });
    assert.equal(r2.via, 'chrome');

    await assert.rejects(
      () => WebExtBrowser.sendTabMessage(99, { type: 'TEST' }),
      /Could not establish connection/
    );
  } finally {
    if (prevBrowser === undefined) delete globalThis.browser;
    else globalThis.browser = prevBrowser;
    if (prevChrome === undefined) delete globalThis.chrome;
    else globalThis.chrome = prevChrome;
  }
});

test('scripts/build-browsers.mjs gera pacotes válidos para Chromium, Firefox e Safari', async () => {
  const { buildAllBrowsers } = await import('../scripts/build-browsers.mjs');
  const { chromiumDir, firefoxDir, safariDir } = buildAllBrowsers();

  const cm = JSON.parse(fs.readFileSync(path.join(chromiumDir, 'manifest.json'), 'utf8'));
  assert.equal(cm.background.service_worker, 'src/background/service-worker.js');
  assert.equal(cm.background.scripts, undefined);
  assert.equal(cm.browser_specific_settings, undefined);

  const fm = JSON.parse(fs.readFileSync(path.join(firefoxDir, 'manifest.json'), 'utf8'));
  assert.equal(fm.background.service_worker, undefined);
  assert.deepEqual(fm.background.scripts, ['src/shared/webext.js', 'src/background/service-worker.js']);
  assert.ok(fm.browser_specific_settings?.gecko?.id);

  const sm = JSON.parse(fs.readFileSync(path.join(safariDir, 'manifest.json'), 'utf8'));
  assert.equal(sm.background.service_worker, 'src/background/service-worker.js');
  assert.equal(sm.content_scripts.length, 1);
  assert.equal(sm.content_scripts[0].world, undefined);
  assert.ok(fs.existsSync(path.join(safariDir, 'src/shared/webext.js')));
});
