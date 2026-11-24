(function () {
  'use strict';

  if (window.__QA_POCKET_ISOLATED_INSTALLED__) return;
  window.__QA_POCKET_ISOLATED_INSTALLED__ = true;

  const WebExt = globalThis.QAWebExt;
  const MAIN_CHANNEL = 'qa-pocket-main';
  const MAX_BREADCRUMBS = 25;
  const breadcrumbs = [];

  function ensureMainInterceptorFallback() {
    try {
      const root = document.documentElement;
      if (root && root.dataset && root.dataset.qaPocketMain === '1') {
        return;
      }
      if (!root) {
        document.addEventListener('DOMContentLoaded', ensureMainInterceptorFallback, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = WebExt ? WebExt.getURL('src/content/page-interceptor.js') : '';
      if (!script.src) return;
      script.async = false;
      script.onload = () => script.remove();
      script.onerror = () => script.remove();
      root.appendChild(script);
    } catch {
      // Páginas com CSP estrito podem bloquear <script src>; world: MAIN já cobre Chrome/Edge/Firefox 128+
    }
  }
  ensureMainInterceptorFallback();

  function safeSendMessage(msg) {
    try {
      if (WebExt) {
        WebExt.sendRuntimeMessage(msg).catch(() => {});
      }
    } catch {
      // Contexto da extensão pode ter sido recarregado
    }
  }

  function pushBreadcrumb(entry) {
    const last = breadcrumbs[breadcrumbs.length - 1];
    if (
      last &&
      last.type === entry.type &&
      last.selector === entry.selector &&
      entry.timestamp - last.timestamp < 500
    ) {
      breadcrumbs[breadcrumbs.length - 1] = entry;
    } else {
      breadcrumbs.push(entry);
      if (breadcrumbs.length > MAX_BREADCRUMBS) {
        breadcrumbs.shift();
      }
    }
    safeSendMessage({ type: 'QA_LOG_EVENT', eventType: 'breadcrumb', payload: entry });
  }

  function cssEscape(value) {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return String(value).replace(/([^\w-])/g, '\\$1');
  }

  function buildSelector(el) {
    if (!el || el.nodeType !== 1) return 'body';
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test');
    if (testId) return `[data-testid="${testId.replace(/"/g, '\\"')}"]`;
    if (el.id) return `#${cssEscape(el.id)}`;

    const tag = el.tagName.toLowerCase();
    const name = el.getAttribute('name');
    if (name) return `${tag}[name="${name.replace(/"/g, '\\"')}"]`;

    const aria = el.getAttribute('aria-label');
    if (aria) return `${tag}[aria-label="${aria.replace(/"/g, '\\"')}"]`;

    const placeholder = el.getAttribute('placeholder');
    if (placeholder) return `${tag}[placeholder="${placeholder.replace(/"/g, '\\"')}"]`;

    const parts = [];
    let current = el;
    let depth = 0;
    while (current && current.nodeType === 1 && depth < 4) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`#${cssEscape(current.id)}`);
        break;
      }
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter((c) => c.tagName === current.tagName);
        if (siblings.length > 1) {
          part += `:nth-of-type(${siblings.indexOf(current) + 1})`;
        }
      }
      parts.unshift(part);
      current = parent;
      depth++;
    }
    return parts.join(' > ') || tag;
  }

  function getLabelText(el) {
    if (!el || el.nodeType !== 1) return '';
    if (el.id) {
      const explicit = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
      if (explicit) return explicit.textContent.trim().slice(0, 80);
    }
    const wrapped = el.closest('label');
    if (wrapped) return wrapped.textContent.trim().slice(0, 80);

    const labelledBy = el.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ref = document.getElementById(labelledBy.split(' ')[0]);
      if (ref) return ref.textContent.trim().slice(0, 80);
    }

    return (
      el.getAttribute('aria-label') ||
      el.getAttribute('placeholder') ||
      (el.textContent ? el.textContent.trim().slice(0, 50) : '') ||
      el.getAttribute('name') ||
      el.id ||
      ''
    );
  }

  // Recebe eventos do script MAIN world
  window.addEventListener('message', function (event) {
    if (event.source !== window || !event.data || event.data.source !== MAIN_CHANNEL) {
      return;
    }
    const { type, payload } = event.data;
    if (type === 'navigation') {
      pushBreadcrumb({
        type: 'navigation',
        url: payload?.url || window.location.href,
        timestamp: payload?.timestamp || Date.now()
      });
      return;
    }
    if (type === 'console' || type === 'network') {
      safeSendMessage({ type: 'QA_LOG_EVENT', eventType: type, payload });
    }
  });

  // Captura breadcrumbs leves de interação do QA
  document.addEventListener(
    'click',
    function (event) {
      const target = event.target && event.target.closest
        ? event.target.closest('button, a, [role="button"], input[type="submit"], input[type="button"], select, summary')
        : null;
      if (!target) return;
      if (target.closest('#qa-pocket-toast-host')) return;

      pushBreadcrumb({
        type: 'click',
        selector: buildSelector(target),
        label: getLabelText(target),
        timestamp: Date.now()
      });
    },
    true
  );

  let inputTimer = null;
  document.addEventListener(
    'change',
    function (event) {
      const el = event.target;
      if (!el || !el.tagName) return;
      const tag = el.tagName.toLowerCase();
      if (!['input', 'textarea', 'select'].includes(tag)) return;

      const isSensitive =
        (el.type || '').toLowerCase() === 'password' ||
        /senha|password|token|secret|cvv|cartao|cartão/i.test(`${el.name || ''} ${el.id || ''}`);

      const sampleValue = isSensitive
        ? '[OCULTO]'
        : String(el.value || '').slice(0, 40);

      clearTimeout(inputTimer);
      inputTimer = setTimeout(() => {
        pushBreadcrumb({
          type: 'input',
          selector: buildSelector(el),
          label: getLabelText(el),
          sampleValue,
          timestamp: Date.now()
        });
      }, 60);
    },
    true
  );

  document.addEventListener(
    'submit',
    function (event) {
      const form = event.target;
      if (!form || form.tagName?.toLowerCase() !== 'form') return;
      pushBreadcrumb({
        type: 'submit',
        selector: buildSelector(form),
        label: form.getAttribute('name') || form.id || 'formulário',
        timestamp: Date.now()
      });
    },
    true
  );

  // ---- Edge-Case Form Filler ----

  function isElementVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  }

  function setNativeValue(el, value) {
    const tag = el.tagName.toLowerCase();
    const proto =
      tag === 'textarea'
        ? window.HTMLTextAreaElement.prototype
        : tag === 'select'
          ? window.HTMLSelectElement.prototype
          : window.HTMLInputElement.prototype;

    const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && typeof descriptor.set === 'function') {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }

    el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  function highlightElement(el) {
    const prevOutline = el.style.outline;
    const prevTransition = el.style.transition;
    const prevBoxShadow = el.style.boxShadow;

    el.style.transition = 'outline 0.2s ease, box-shadow 0.2s ease';
    el.style.outline = '2px solid #10b981';
    el.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.28)';

    setTimeout(() => {
      el.style.outline = prevOutline;
      el.style.boxShadow = prevBoxShadow;
      el.style.transition = prevTransition;
    }, 1800);
  }

  function showPageToast(message, variant = 'success') {
    const existing = document.getElementById('qa-pocket-toast-host');
    if (existing) existing.remove();

    const host = document.createElement('div');
    host.id = 'qa-pocket-toast-host';
    host.style.cssText =
      'position:fixed;bottom:20px;right:20px;z-index:2147483647;pointer-events:none;font-family:system-ui,-apple-system,sans-serif;';

    const shadow = host.attachShadow({ mode: 'open' });
    const bg = variant === 'warn' ? '#78350f' : '#0f172a';
    const border = variant === 'warn' ? '#f59e0b' : '#10b981';

    const box = document.createElement('div');
    box.style.cssText = `background:${bg};color:#f8fafc;border:1px solid ${border};border-left:4px solid ${border};padding:10px 14px;border-radius:10px;box-shadow:0 10px 25px rgba(0,0,0,0.35);font-size:13px;line-height:1.4;max-width:320px;`;
    box.textContent = message;
    shadow.appendChild(box);

    (document.body || document.documentElement).appendChild(host);
    setTimeout(() => host.remove(), 3200);
  }

  function collectFormControls() {
    const selector = 'input, textarea, select, [contenteditable="true"]';
    return Array.from(document.querySelectorAll(selector)).filter((el) => {
      if (el.closest('#qa-pocket-toast-host')) return false;
      if (el.disabled || el.readOnly) return false;
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'reset', 'image', 'file'].includes(type)) return false;
      return isElementVisible(el);
    });
  }

  function fillForms(profileId = 'chaos', options = {}) {
    const edgeData = globalThis.QAEdgeData;
    if (!edgeData) {
      return { ok: false, error: 'QAEdgeData indisponível' };
    }

    const highlight = options.highlightFields !== false;
    const controls = collectFormControls();
    const radioGroupsHandled = new Set();
    let filledCount = 0;

    controls.forEach((el, idx) => {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || 'text').toLowerCase();

      if (el.isContentEditable) {
        const result = edgeData.pickValueForField({ tagName: 'textarea', name: el.id }, profileId, idx);
        el.textContent = result.value;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        if (highlight) highlightElement(el);
        filledCount++;
        return;
      }

      if (type === 'checkbox') {
        const shouldCheck = profileId === 'invalid' ? false : idx % 2 === 0 || profileId === 'valid_br';
        el.checked = shouldCheck;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        if (highlight) highlightElement(el);
        filledCount++;
        return;
      }

      if (type === 'radio') {
        const groupKey = el.name || `__radio_${idx}`;
        if (radioGroupsHandled.has(groupKey)) return;
        const group = el.name
          ? Array.from(document.querySelectorAll(`input[type="radio"][name="${cssEscape(el.name)}"]`)).filter(
              (r) => !r.disabled
            )
          : [el];
        if (group.length > 0) {
          const chosen = profileId === 'valid_br' ? group[0] : group[idx % group.length];
          chosen.checked = true;
          chosen.dispatchEvent(new Event('change', { bubbles: true }));
          if (highlight) highlightElement(chosen);
          radioGroupsHandled.add(groupKey);
          filledCount++;
        }
        return;
      }

      if (tag === 'select') {
        const opts = Array.from(el.options).filter((o) => !o.disabled);
        const nonEmpty = opts.filter((o) => o.value !== '');
        let chosen = null;
        if (profileId === 'invalid' && opts.some((o) => o.value === '')) {
          chosen = opts.find((o) => o.value === '');
        } else if (nonEmpty.length > 0) {
          chosen = nonEmpty[idx % nonEmpty.length];
        } else if (opts.length > 0) {
          chosen = opts[0];
        }
        if (chosen) {
          setNativeValue(el, chosen.value);
          if (highlight) highlightElement(el);
          filledCount++;
        }
        return;
      }

      const meta = {
        tagName: tag,
        type,
        name: el.getAttribute('name') || '',
        id: el.id || '',
        placeholder: el.getAttribute('placeholder') || '',
        autocomplete: el.getAttribute('autocomplete') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        labelText: getLabelText(el),
        min: el.getAttribute('min') || '',
        max: el.getAttribute('max') || ''
      };

      const { value } = edgeData.pickValueForField(meta, profileId, idx);
      setNativeValue(el, value);
      if (highlight) highlightElement(el);
      filledCount++;
    });

    const profileObj = edgeData.PROFILES.find((p) => p.id === profileId);
    const profileLabel = profileObj ? profileObj.label : profileId;

    if (filledCount > 0) {
      showPageToast(`QA Pocket: ${filledCount} campo(s) preenchido(s) [${profileLabel}]`);
    } else {
      showPageToast('QA Pocket: Nenhum campo de formulário visível encontrado.', 'warn');
    }

    return { ok: true, filledCount, profileLabel };
  }

  function clearForms() {
    const controls = collectFormControls();
    let cleared = 0;

    controls.forEach((el) => {
      const tag = el.tagName.toLowerCase();
      const type = (el.getAttribute('type') || 'text').toLowerCase();

      if (el.isContentEditable) {
        el.textContent = '';
        el.dispatchEvent(new Event('input', { bubbles: true }));
        cleared++;
        return;
      }
      if (type === 'checkbox' || type === 'radio') {
        el.checked = false;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        cleared++;
        return;
      }
      if (tag === 'select') {
        el.selectedIndex = 0;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        cleared++;
        return;
      }
      setNativeValue(el, '');
      cleared++;
    });

    showPageToast(`QA Pocket: ${cleared} campo(s) limpo(s).`);
    return { ok: true, cleared };
  }

  function getPageInfo() {
    const controls = collectFormControls();
    const formCount = document.querySelectorAll('form').length;
    return {
      url: window.location.href,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        dpr: window.devicePixelRatio || 1
      },
      userAgent: navigator.userAgent,
      language: navigator.language,
      breadcrumbs: breadcrumbs.slice(),
      formCount,
      fieldCount: controls.length
    };
  }

  const extApi = WebExt ? WebExt.getApi() : globalThis.chrome;
  extApi?.runtime?.onMessage?.addListener(function (msg, _sender, sendResponse) {
    if (!msg || !msg.type) return false;

    if (msg.type === 'QA_GET_PAGE_INFO') {
      sendResponse({ ok: true, data: getPageInfo() });
      return false;
    }

    if (msg.type === 'QA_FILL_FORMS') {
      const res = fillForms(msg.profileId || 'chaos', msg.options || {});
      sendResponse(res);
      return false;
    }

    if (msg.type === 'QA_CLEAR_FORMS') {
      const res = clearForms();
      sendResponse(res);
      return false;
    }

    return false;
  });
})();
