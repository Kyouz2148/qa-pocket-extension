(function () {
  'use strict';

  const WebExt = globalThis.QAWebExt;
  const Formatters = globalThis.QAFormatters;
  const EdgeData = globalThis.QAEdgeData;

  const state = {
    tab: null,
    tabState: { consoleLogs: [], networkErrors: [], breadcrumbs: [] },
    pageInfo: null,
    activeTabName: 'reporter',
    activeFormat: 'markdown',
    selectedProfile: 'chaos',
    screenshotDataUrl: null,
    restricted: false
  };

  const els = {
    tabHost: document.getElementById('tabHost'),
    globalStatusPill: document.getElementById('globalStatusPill'),
    restrictedBanner: document.getElementById('restrictedBanner'),
    tabButtons: document.querySelectorAll('.tab-btn'),
    panels: {
      reporter: document.getElementById('panel-reporter'),
      filler: document.getElementById('panel-filler')
    },
    countConsoleErrors: document.getElementById('countConsoleErrors'),
    countConsoleWarns: document.getElementById('countConsoleWarns'),
    countNetErrors: document.getElementById('countNetErrors'),
    countBreadcrumbs: document.getElementById('countBreadcrumbs'),
    viewportBadge: document.getElementById('viewportBadge'),
    eventsList: document.getElementById('eventsList'),
    btnClearLogs: document.getElementById('btnClearLogs'),
    customTitle: document.getElementById('customTitle'),
    customNotes: document.getElementById('customNotes'),
    optIncludeWarnings: document.getElementById('optIncludeWarnings'),
    optIncludeBreadcrumbs: document.getElementById('optIncludeBreadcrumbs'),
    optRedactTokens: document.getElementById('optRedactTokens'),
    btnCaptureScreenshot: document.getElementById('btnCaptureScreenshot'),
    screenshotActions: document.getElementById('screenshotActions'),
    screenshotThumb: document.getElementById('screenshotThumb'),
    btnDownloadScreenshot: document.getElementById('btnDownloadScreenshot'),
    btnCopyScreenshot: document.getElementById('btnCopyScreenshot'),
    fmtButtons: document.querySelectorAll('.fmt-btn'),
    reportPreview: document.getElementById('reportPreview'),
    btnCopyReport: document.getElementById('btnCopyReport'),
    btnDownloadReport: document.getElementById('btnDownloadReport'),
    formDetectionText: document.getElementById('formDetectionText'),
    optHighlightFields: document.getElementById('optHighlightFields'),
    profilesGrid: document.getElementById('profilesGrid'),
    btnFillForms: document.getElementById('btnFillForms'),
    btnClearForms: document.getElementById('btnClearForms'),
    snippetsGrid: document.getElementById('snippetsGrid'),
    popupToast: document.getElementById('popupToast')
  };

  let toastTimer = null;
  function showToast(text) {
    els.popupToast.textContent = text;
    els.popupToast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.popupToast.classList.add('hidden');
    }, 2100);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback abaixo
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }

  function sendTabMessage(tabId, msg) {
    return WebExt.sendTabMessage(tabId, msg).catch(() => null);
  }

  function sendRuntimeMessage(msg) {
    return WebExt.sendRuntimeMessage(msg).catch(() => null);
  }

  async function ensureContentScriptsInjected(tab) {
    if (!tab || !tab.id || !tab.url) return false;
    if (!/^https?:/i.test(tab.url)) return false;

    try {
      await WebExt.executeScript({
        target: { tabId: tab.id },
        files: ['src/content/page-interceptor.js'],
        world: 'MAIN'
      }).catch(() => {});

      await WebExt.executeScript({
        target: { tabId: tab.id },
        files: ['src/shared/webext.js', 'src/shared/edge-data.js', 'src/content/isolated-bridge.js']
      });
      return true;
    } catch {
      return false;
    }
  }

  function getHostLabel(url) {
    try {
      const u = new URL(url);
      if (u.protocol === 'file:') return 'Arquivo local (file://)';
      return u.host || u.href;
    } catch {
      return url || 'Aba atual';
    }
  }

  function getMergedBreadcrumbs() {
    const fromPage = state.pageInfo?.breadcrumbs || [];
    const fromBg = state.tabState?.breadcrumbs || [];
    return fromPage.length >= fromBg.length ? fromPage : fromBg;
  }

  function buildCurrentReport() {
    const fallbackPage = {
      url: state.tab?.url || '',
      title: state.tab?.title || '',
      viewport: null,
      screen: null,
      userAgent: navigator.userAgent,
      language: navigator.language
    };

    return {
      customTitle: els.customTitle.value,
      notes: els.customNotes.value,
      capturedAt: Date.now(),
      hasScreenshot: Boolean(state.screenshotDataUrl),
      page: state.pageInfo || fallbackPage,
      consoleLogs: state.tabState?.consoleLogs || [],
      networkErrors: state.tabState?.networkErrors || [],
      breadcrumbs: getMergedBreadcrumbs()
    };
  }

  function getFormatOptions() {
    return {
      includeWarnings: els.optIncludeWarnings.checked,
      includeBreadcrumbs: els.optIncludeBreadcrumbs.checked,
      redactTokens: els.optRedactTokens.checked
    };
  }

  function generateReportText() {
    const report = buildCurrentReport();
    const opts = getFormatOptions();

    if (state.activeFormat === 'jira') {
      return Formatters.formatJiraMarkup(report, opts);
    }
    if (state.activeFormat === 'playwright') {
      return Formatters.formatPlaywrightDraft(report, opts);
    }
    return Formatters.formatGitHubMarkdown(report, opts);
  }

  function renderEventsList() {
    const consoleLogs = state.tabState?.consoleLogs || [];
    const netErrors = state.tabState?.networkErrors || [];

    const errCount = consoleLogs.filter((c) => c.level === 'error').length;
    const warnCount = consoleLogs.filter((c) => c.level === 'warn').length;
    const netCount = netErrors.length;
    const stepsCount = getMergedBreadcrumbs().length;
    const totalIssues = errCount + netCount;

    els.countConsoleErrors.textContent = String(errCount);
    els.countConsoleWarns.textContent = String(warnCount);
    els.countNetErrors.textContent = String(netCount);
    els.countBreadcrumbs.textContent = String(stepsCount);

    els.globalStatusPill.textContent =
      totalIssues === 0 ? 'Sem erros' : totalIssues === 1 ? '1 erro' : `${totalIssues} erros`;
    els.globalStatusPill.classList.toggle('has-errors', totalIssues > 0);

    if (state.pageInfo?.viewport) {
      els.viewportBadge.textContent = `${state.pageInfo.viewport.width}×${state.pageInfo.viewport.height}`;
    }

    const merged = [
      ...netErrors.map((n) => ({
        ts: n.timestamp || 0,
        badge: n.status ? `HTTP ${n.status}` : 'NET',
        cls: 'badge-net',
        text: `${n.method || 'GET'} ${n.url}`
      })),
      ...consoleLogs.map((c) => ({
        ts: c.timestamp || 0,
        badge: c.level === 'warn' ? 'WARN' : 'ERR',
        cls: c.level === 'warn' ? 'badge-warn' : 'badge-err',
        text: String(c.message || '').split('\n')[0]
      }))
    ]
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 12);

    els.eventsList.innerHTML = '';
    if (merged.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty-state';
      li.textContent = 'Nenhum erro capturado até o momento.';
      els.eventsList.appendChild(li);
      return;
    }

    merged.forEach((item) => {
      const li = document.createElement('li');
      li.className = 'event-item';

      const badge = document.createElement('span');
      badge.className = `event-badge ${item.cls}`;
      badge.textContent = item.badge;

      const txt = document.createElement('span');
      txt.className = 'event-text';
      txt.textContent = item.text;
      txt.title = item.text;

      li.appendChild(badge);
      li.appendChild(txt);
      els.eventsList.appendChild(li);
    });
  }

  function renderReportPreview() {
    els.reportPreview.textContent = generateReportText();
  }

  function renderFormSummary() {
    if (state.restricted || !state.pageInfo) {
      els.formDetectionText.textContent = 'Página restrita ou sem acesso ao DOM.';
      return;
    }
    const { formCount, fieldCount } = state.pageInfo;
    els.formDetectionText.textContent = `${formCount} formulário(s) • ${fieldCount} campo(s) visíveis`;
  }

  function renderProfiles() {
    els.profilesGrid.innerHTML = '';
    EdgeData.PROFILES.forEach((profile) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `profile-card ${state.selectedProfile === profile.id ? 'selected' : ''}`;
      btn.dataset.profileId = profile.id;

      const top = document.createElement('div');
      top.className = 'profile-card-top';

      const title = document.createElement('span');
      title.className = 'profile-title';
      title.textContent = `${profile.icon} ${profile.label}`;

      const badge = document.createElement('span');
      badge.className = 'profile-badge';
      badge.textContent = profile.badge;

      const desc = document.createElement('span');
      desc.className = 'profile-desc';
      desc.textContent = profile.shortDesc;

      top.appendChild(title);
      top.appendChild(badge);
      btn.appendChild(top);
      btn.appendChild(desc);

      btn.addEventListener('click', () => {
        state.selectedProfile = profile.id;
        renderProfiles();
      });

      els.profilesGrid.appendChild(btn);
    });
  }

  function renderSnippets() {
    els.snippetsGrid.innerHTML = '';
    EdgeData.getQuickSnippets().forEach((snippet) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'snippet-btn';
      btn.textContent = snippet.label;
      btn.addEventListener('click', async () => {
        const val = snippet.getValue();
        await copyText(val);
        showToast(`${snippet.label} copiado!`);
      });
      els.snippetsGrid.appendChild(btn);
    });
  }

  function switchMainTab(tabName) {
    state.activeTabName = tabName;
    els.tabButtons.forEach((b) => {
      const active = b.dataset.tab === tabName;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    });
    Object.entries(els.panels).forEach(([key, panel]) => {
      panel.classList.toggle('active', key === tabName);
    });
  }

  async function refreshAll() {
    const [tab] = (await WebExt.queryTabs({ active: true, currentWindow: true }).catch(() => [])) || [];
    state.tab = tab || null;

    if (!tab) return;
    els.tabHost.textContent = getHostLabel(tab.url);

    const bgResp = await sendRuntimeMessage({ type: 'QA_GET_TAB_STATE', tabId: tab.id });
    if (bgResp && bgResp.ok) {
      state.tabState = bgResp.state;
    }

    let pageResp = await sendTabMessage(tab.id, { type: 'QA_GET_PAGE_INFO' });
    if (!pageResp || !pageResp.ok) {
      const injected = await ensureContentScriptsInjected(tab);
      if (injected) {
        pageResp = await sendTabMessage(tab.id, { type: 'QA_GET_PAGE_INFO' });
      }
    }

    if (pageResp && pageResp.ok) {
      state.pageInfo = pageResp.data;
      state.restricted = false;
      els.restrictedBanner.classList.add('hidden');
    } else {
      state.pageInfo = null;
      state.restricted = true;
      els.restrictedBanner.classList.remove('hidden');
    }

    renderEventsList();
    renderReportPreview();
    renderFormSummary();
  }

  function bindEvents() {
    els.tabButtons.forEach((btn) => {
      btn.addEventListener('click', () => switchMainTab(btn.dataset.tab));
    });

    els.fmtButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        state.activeFormat = btn.dataset.format;
        els.fmtButtons.forEach((b) => b.classList.toggle('active', b === btn));
        renderReportPreview();
      });
    });

    [els.customTitle, els.customNotes].forEach((input) => {
      input.addEventListener('input', renderReportPreview);
    });

    [els.optIncludeWarnings, els.optIncludeBreadcrumbs, els.optRedactTokens].forEach((chk) => {
      chk.addEventListener('change', renderReportPreview);
    });

    els.btnClearLogs.addEventListener('click', async () => {
      if (!state.tab) return;
      const resp = await sendRuntimeMessage({ type: 'QA_CLEAR_TAB_STATE', tabId: state.tab.id });
      if (resp && resp.ok) {
        state.tabState = resp.state;
        if (state.pageInfo) state.pageInfo.breadcrumbs = [];
        renderEventsList();
        renderReportPreview();
        showToast('Logs limpos!');
      }
    });

    els.btnCopyReport.addEventListener('click', async () => {
      const text = generateReportText();
      await copyText(text);
      showToast('Relatório copiado!');
    });

    els.btnDownloadReport.addEventListener('click', () => {
      const text = generateReportText();
      const ext =
        state.activeFormat === 'playwright'
          ? 'spec.ts'
          : state.activeFormat === 'jira'
            ? 'jira.txt'
            : 'md';
      const mime = 'text/plain;charset=utf-8';
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qa-bug-report-${Date.now()}.${ext}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(`Arquivo .${ext} baixado!`);
    });

    els.btnCaptureScreenshot.addEventListener('click', async () => {
      if (!state.tab) return;
      const resp = await sendRuntimeMessage({
        type: 'QA_CAPTURE_SCREENSHOT',
        windowId: state.tab.windowId
      });
      if (resp && resp.ok && resp.dataUrl) {
        state.screenshotDataUrl = resp.dataUrl;
        els.screenshotThumb.src = resp.dataUrl;
        els.screenshotActions.classList.remove('hidden');
        renderReportPreview();
        showToast('Screenshot capturado!');
      } else {
        showToast('Falha ao capturar tela');
      }
    });

    els.btnDownloadScreenshot.addEventListener('click', () => {
      if (!state.screenshotDataUrl) return;
      const a = document.createElement('a');
      a.href = state.screenshotDataUrl;
      a.download = `qa-screenshot-${Date.now()}.png`;
      a.click();
      showToast('PNG baixado!');
    });

    els.btnCopyScreenshot.addEventListener('click', async () => {
      if (!state.screenshotDataUrl) return;
      try {
        const res = await fetch(state.screenshotDataUrl);
        const blob = await res.blob();
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        showToast('Imagem copiada!');
      } catch {
        showToast('Use Baixar PNG neste navegador');
      }
    });

    els.btnFillForms.addEventListener('click', async () => {
      if (!state.tab) return;
      let resp = await sendTabMessage(state.tab.id, {
        type: 'QA_FILL_FORMS',
        profileId: state.selectedProfile,
        options: { highlightFields: els.optHighlightFields.checked }
      });

      if (!resp) {
        const injected = await ensureContentScriptsInjected(state.tab);
        if (injected) {
          resp = await sendTabMessage(state.tab.id, {
            type: 'QA_FILL_FORMS',
            profileId: state.selectedProfile,
            options: { highlightFields: els.optHighlightFields.checked }
          });
        }
      }

      if (resp && resp.ok) {
        showToast(`${resp.filledCount} campo(s) preenchido(s)!`);
      } else {
        showToast('Não foi possível acessar o formulário');
      }
    });

    els.btnClearForms.addEventListener('click', async () => {
      if (!state.tab) return;
      const resp = await sendTabMessage(state.tab.id, { type: 'QA_CLEAR_FORMS' });
      if (resp && resp.ok) {
        showToast(`${resp.cleared} campo(s) limpo(s)!`);
      }
    });
  }

  renderProfiles();
  renderSnippets();
  bindEvents();
  refreshAll();
})();
