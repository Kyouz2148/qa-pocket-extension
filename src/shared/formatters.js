(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.QAFormatters = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SENSITIVE_PARAMS = new Set([
    'token',
    'access_token',
    'refresh_token',
    'id_token',
    'apikey',
    'api_key',
    'key',
    'secret',
    'password',
    'senha',
    'auth',
    'authorization',
    'jwt',
    'session',
    'session_id',
    'code'
  ]);

  function redactUrl(rawUrl) {
    if (!rawUrl) return '';
    try {
      const parsed = new URL(rawUrl);
      let changed = false;
      for (const [k] of parsed.searchParams.entries()) {
        if (SENSITIVE_PARAMS.has(k.toLowerCase())) {
          parsed.searchParams.set(k, '[OCULTO]');
          changed = true;
        }
      }
      return changed ? parsed.toString() : rawUrl;
    } catch {
      return String(rawUrl);
    }
  }

  function parseUserAgent(ua) {
    const str = String(ua || '');
    let browser = 'Desconhecido';
    let os = 'Desconhecido';

    const edge = str.match(/Edg\/([\d.]+)/);
    const opera = str.match(/(?:OPR|Opera)\/([\d.]+)/);
    const firefox = str.match(/Firefox\/([\d.]+)/);
    const chrome = str.match(/Chrome\/([\d.]+)/);
    const safari = str.match(/Version\/([\d.]+).*Safari/);

    if (edge) browser = `Microsoft Edge ${edge[1]}`;
    else if (opera) browser = `Opera ${opera[1]}`;
    else if (firefox) browser = `Firefox ${firefox[1]}`;
    else if (chrome) browser = `Google Chrome ${chrome[1]}`;
    else if (safari) browser = `Safari ${safari[1]}`;

    if (/Windows NT 10\.0/.test(str)) os = 'Windows 10/11';
    else if (/Windows NT/.test(str)) os = 'Windows';
    else if (/Mac OS X ([\d_]+)/.test(str)) {
      const m = str.match(/Mac OS X ([\d_]+)/);
      os = `macOS ${m[1].replace(/_/g, '.')}`;
    } else if (/Android ([\d.]+)/.test(str)) {
      const m = str.match(/Android ([\d.]+)/);
      os = `Android ${m[1]}`;
    } else if (/iPhone OS ([\d_]+)/.test(str)) {
      const m = str.match(/iPhone OS ([\d_]+)/);
      os = `iOS ${m[1].replace(/_/g, '.')}`;
    } else if (/Linux/.test(str)) {
      os = 'Linux';
    }

    return { browser, os };
  }

  function formatTimestampBR(ts) {
    try {
      const d = ts ? new Date(ts) : new Date();
      return d.toLocaleString('pt-BR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
    } catch {
      return String(ts || '');
    }
  }

  function safeCodeBlock(text) {
    return String(text || '').replace(/```/g, '`\u200B``');
  }

  function safeJiraCode(text) {
    return String(text || '').replace(/\{code/gi, '{_code');
  }

  function escapeMarkdownPipe(text) {
    return String(text || '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
  }

  function filterLogs(report, options = {}) {
    const includeWarnings = options.includeWarnings !== false;
    const includeBreadcrumbs = options.includeBreadcrumbs !== false;
    const redactTokens = options.redactTokens !== false;

    const consoleLogs = (report.consoleLogs || []).filter((item) => {
      if (item.level === 'warn' && !includeWarnings) return false;
      return true;
    });

    const networkErrors = (report.networkErrors || []).map((req) => ({
      ...req,
      url: redactTokens ? redactUrl(req.url) : req.url
    }));

    const breadcrumbs = includeBreadcrumbs ? report.breadcrumbs || [] : [];
    const pageUrl = redactTokens ? redactUrl(report.page?.url) : report.page?.url || '';

    return { consoleLogs, networkErrors, breadcrumbs, pageUrl };
  }

  function suggestTitle(report) {
    if (report.customTitle && report.customTitle.trim()) {
      return report.customTitle.trim();
    }
    const netErr = (report.networkErrors || [])[0];
    const conErr = (report.consoleLogs || []).find((c) => c.level === 'error');

    let host = 'página';
    try {
      host = new URL(report.page?.url || '').pathname || '/';
    } catch {
      host = report.page?.title || 'página';
    }

    if (netErr) {
      return `[Bug] Falha HTTP ${netErr.status || 'Network'} em ${host}`;
    }
    if (conErr) {
      const shortMsg = String(conErr.message || '').split('\n')[0].slice(0, 60);
      return `[Bug] Erro de console em ${host}: ${shortMsg}`;
    }
    return `[Bug] Relatório de QA em ${host}`;
  }

  function formatBreadcrumbsList(breadcrumbs) {
    if (!breadcrumbs || breadcrumbs.length === 0) {
      return ['Acessar a URL informada e observar os logs capturados.'];
    }
    return breadcrumbs.map((b) => {
      if (b.type === 'click') return `Clicar em \`${b.label || b.selector}\``;
      if (b.type === 'input') return `Preencher campo \`${b.label || b.selector}\``;
      if (b.type === 'submit') return `Enviar formulário \`${b.selector}\``;
      if (b.type === 'navigation') return `Navegar para \`${b.url}\``;
      return `${b.type}: ${b.selector || b.label || ''}`;
    });
  }

  function formatGitHubMarkdown(report, options = {}) {
    const { consoleLogs, networkErrors, breadcrumbs, pageUrl } = filterLogs(report, options);
    const { browser, os } = parseUserAgent(report.page?.userAgent);
    const title = suggestTitle(report);
    const viewport = report.page?.viewport
      ? `${report.page.viewport.width}x${report.page.viewport.height}`
      : 'N/A';
    const screen = report.page?.screen
      ? `${report.page.screen.width}x${report.page.screen.height} (DPR ${report.page.screen.dpr || 1})`
      : 'N/A';

    const lines = [];
    lines.push(`# ${title}`);
    lines.push('');

    if (report.notes && report.notes.trim()) {
      lines.push('## 📝 Descrição / Observações');
      lines.push(report.notes.trim());
      lines.push('');
    }

    lines.push('## 🔁 Passos para Reproduzir');
    const customSteps = (report.customSteps || '').trim();
    if (customSteps) {
      lines.push(customSteps);
    } else {
      formatBreadcrumbsList(breadcrumbs).forEach((step, idx) => {
        lines.push(`${idx + 1}. ${step}`);
      });
    }
    lines.push('');

    lines.push('## 🖥️ Ambiente');
    lines.push('| Campo | Valor |');
    lines.push('| :--- | :--- |');
    lines.push(`| **URL** | ${escapeMarkdownPipe(pageUrl || 'N/A')} |`);
    lines.push(`| **Título da Página** | ${escapeMarkdownPipe(report.page?.title || 'N/A')} |`);
    lines.push(`| **Navegador** | ${escapeMarkdownPipe(browser)} |`);
    lines.push(`| **Sistema Operacional** | ${escapeMarkdownPipe(os)} |`);
    lines.push(`| **Viewport** | ${viewport} |`);
    lines.push(`| **Tela** | ${screen} |`);
    lines.push(`| **Idioma** | ${escapeMarkdownPipe(report.page?.language || 'N/A')} |`);
    lines.push(`| **Data/Hora** | ${formatTimestampBR(report.capturedAt)} |`);
    lines.push('');

    lines.push(`## 🌐 Requisições HTTP com Falha (${networkErrors.length})`);
    if (networkErrors.length === 0) {
      lines.push('_Nenhuma requisição com falha (4xx/5xx ou erro de rede) capturada._');
    } else {
      lines.push('| Método | Status | Duração | Origem | URL |');
      lines.push('| :--- | :--- | :--- | :--- | :--- |');
      networkErrors.forEach((req) => {
        const statusLabel = req.status ? `${req.status} ${req.statusText || ''}`.trim() : req.error || 'Erro de Rede';
        const dur = typeof req.durationMs === 'number' ? `${req.durationMs} ms` : '-';
        lines.push(
          `| \`${req.method || 'GET'}\` | **${escapeMarkdownPipe(statusLabel)}** | ${dur} | ${req.kind || 'net'} | \`${escapeMarkdownPipe(req.url)}\` |`
        );
      });
      const withBody = networkErrors.filter((r) => r.responseSnippet);
      if (withBody.length > 0) {
        lines.push('');
        lines.push('<details>');
        lines.push(`<summary>Ver payload/resposta das falhas HTTP (${withBody.length})</summary>`);
        lines.push('');
        withBody.forEach((req, idx) => {
          lines.push(`**#${idx + 1} ${req.method || 'GET'} ${req.status} — ${req.url}**`);
          lines.push('```text');
          lines.push(safeCodeBlock(req.responseSnippet));
          lines.push('```');
        });
        lines.push('</details>');
      }
    }
    lines.push('');

    lines.push(`## 🪵 Logs de Console (${consoleLogs.length})`);
    if (consoleLogs.length === 0) {
      lines.push('_Nenhum erro ou aviso de console capturado._');
    } else {
      lines.push('<details open>');
      lines.push(`<summary>Últimos logs capturados (${consoleLogs.length})</summary>`);
      lines.push('');
      lines.push('```text');
      consoleLogs.forEach((entry) => {
        const tag = entry.level === 'warn' ? 'WARN' : 'ERROR';
        const time = formatTimestampBR(entry.timestamp);
        lines.push(`[${time}] [${tag}] ${safeCodeBlock(entry.message)}`);
        if (entry.source) {
          lines.push(`  Fonte: ${entry.source}`);
        }
        if (entry.stack) {
          const shortStack = String(entry.stack).split('\n').slice(0, 5).join('\n  ');
          lines.push(`  Stack:\n  ${safeCodeBlock(shortStack)}`);
        }
      });
      lines.push('```');
      lines.push('</details>');
    }
    lines.push('');

    if (report.hasScreenshot) {
      lines.push('## 📸 Evidência Visual');
      lines.push('_Screenshot capturado via QA Pocket (anexar arquivo PNG abaixo)._');
      lines.push('');
    }

    lines.push('---');
    lines.push('_Gerado com **QA Pocket**_');

    return lines.join('\n');
  }

  function formatJiraMarkup(report, options = {}) {
    const { consoleLogs, networkErrors, breadcrumbs, pageUrl } = filterLogs(report, options);
    const { browser, os } = parseUserAgent(report.page?.userAgent);
    const title = suggestTitle(report);
    const viewport = report.page?.viewport
      ? `${report.page.viewport.width}x${report.page.viewport.height}`
      : 'N/A';

    const lines = [];
    lines.push(`h2. ${title}`);
    lines.push('');

    if (report.notes && report.notes.trim()) {
      lines.push('{panel:title=Descrição / Observações|borderStyle=solid|bgColor=#F8FAFC}');
      lines.push(report.notes.trim());
      lines.push('{panel}');
      lines.push('');
    }

    lines.push('h3. Passos para Reproduzir');
    const customSteps = (report.customSteps || '').trim();
    if (customSteps) {
      lines.push(customSteps);
    } else {
      formatBreadcrumbsList(breadcrumbs).forEach((step) => {
        lines.push(`# ${step.replace(/`/g, '{{').replace(/`/g, '}}')}`);
      });
    }
    lines.push('');

    lines.push('h3. Ambiente');
    lines.push('|| Campo || Valor ||');
    lines.push(`| *URL* | ${pageUrl || 'N/A'} |`);
    lines.push(`| *Navegador* | ${browser} |`);
    lines.push(`| *SO* | ${os} |`);
    lines.push(`| *Viewport* | ${viewport} |`);
    lines.push(`| *Data/Hora* | ${formatTimestampBR(report.capturedAt)} |`);
    lines.push('');

    lines.push(`h3. Requisições HTTP com Falha (${networkErrors.length})`);
    if (networkErrors.length === 0) {
      lines.push('_Nenhuma requisição com falha capturada._');
    } else {
      lines.push('|| Método || Status || Duração || URL ||');
      networkErrors.forEach((req) => {
        const statusLabel = req.status ? `${req.status} ${req.statusText || ''}`.trim() : req.error || 'Erro de Rede';
        const dur = typeof req.durationMs === 'number' ? `${req.durationMs} ms` : '-';
        lines.push(`| {{${req.method || 'GET'}}} | *${statusLabel}* | ${dur} | {{${req.url}}} |`);
      });
      networkErrors
        .filter((r) => r.responseSnippet)
        .forEach((req) => {
          lines.push(`{code:title=${req.method || 'GET'} ${req.status} - Resposta}`);
          lines.push(safeJiraCode(req.responseSnippet));
          lines.push('{code}');
        });
    }
    lines.push('');

    lines.push(`h3. Logs de Console (${consoleLogs.length})`);
    if (consoleLogs.length === 0) {
      lines.push('_Nenhum log de erro capturado._');
    } else {
      lines.push('{code:title=Console Errors}');
      consoleLogs.forEach((entry) => {
        const tag = entry.level === 'warn' ? 'WARN' : 'ERROR';
        lines.push(`[${formatTimestampBR(entry.timestamp)}] [${tag}] ${safeJiraCode(entry.message)}`);
        if (entry.stack) {
          lines.push(safeJiraCode(String(entry.stack).split('\n').slice(0, 4).join('\n')));
        }
      });
      lines.push('{code}');
    }

    lines.push('');
    lines.push('_Gerado com QA Pocket_');
    return lines.join('\n');
  }

  function escapeSingleQuoteTS(str) {
    return String(str || '')
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/\r?\n/g, ' ');
  }

  function formatPlaywrightDraft(report, options = {}) {
    const { breadcrumbs, pageUrl, networkErrors, consoleLogs } = filterLogs(report, options);
    const width = report.page?.viewport?.width || 1280;
    const height = report.page?.viewport?.height || 720;
    const title = suggestTitle(report).replace(/'/g, "\\'");

    const lines = [];
    lines.push(`import { test, expect } from '@playwright/test';`);
    lines.push('');
    lines.push(`test.use({ viewport: { width: ${width}, height: ${height} } });`);
    lines.push('');
    lines.push(`test('${title}', async ({ page }) => {`);
    lines.push('  const consoleErrors: string[] = [];');
    lines.push('  const failedResponses: { url: string; status: number }[] = [];');
    lines.push('');
    lines.push("  page.on('console', (msg) => {");
    lines.push("    if (msg.type() === 'error') {");
    lines.push('      consoleErrors.push(msg.text());');
    lines.push('    }');
    lines.push('  });');
    lines.push('');
    lines.push("  page.on('response', (res) => {");
    lines.push('    if (res.status() >= 400) {');
    lines.push('      failedResponses.push({ url: res.url(), status: res.status() });');
    lines.push('    }');
    lines.push('  });');
    lines.push('');
    lines.push(`  await page.goto('${escapeSingleQuoteTS(pageUrl || 'http://localhost:3000')}');`);

    if (breadcrumbs.length > 0) {
      lines.push('');
      lines.push('  // Passos capturados pelo QA Pocket');
      breadcrumbs.forEach((b) => {
        const sel = escapeSingleQuoteTS(b.selector || 'body');
        if (b.type === 'click') {
          lines.push(`  await page.locator('${sel}').first().click();`);
        } else if (b.type === 'input') {
          const val = escapeSingleQuoteTS(b.sampleValue || 'teste-qa');
          lines.push(`  await page.locator('${sel}').first().fill('${val}');`);
        } else if (b.type === 'submit') {
          lines.push(`  // Submissão em ${sel}`);
        } else if (b.type === 'navigation' && b.url) {
          lines.push(`  await page.goto('${escapeSingleQuoteTS(b.url)}');`);
        }
      });
    } else {
      lines.push('');
      lines.push('  // TODO: Adicione as interações que disparam o bug abaixo');
    }

    if (consoleLogs.length > 0 || networkErrors.length > 0) {
      lines.push('');
      lines.push('  // Evidências observadas no momento da captura:');
      networkErrors.slice(0, 3).forEach((req) => {
        lines.push(`  // - HTTP ${req.status || 'ERR'} ${req.method || 'GET'} ${req.url}`);
      });
      consoleLogs.slice(0, 3).forEach((c) => {
        lines.push(`  // - Console ${c.level}: ${String(c.message || '').split('\n')[0].slice(0, 90)}`);
      });
    }

    lines.push('');
    lines.push('  expect(failedResponses, `Respostas HTTP >= 400: ${JSON.stringify(failedResponses)}`).toEqual([]);');
    lines.push('  expect(consoleErrors, `Erros de console: ${consoleErrors.join(" | ")}`).toEqual([]);');
    lines.push('});');

    return lines.join('\n');
  }

  return {
    redactUrl,
    parseUserAgent,
    formatTimestampBR,
    suggestTitle,
    formatGitHubMarkdown,
    formatJiraMarkup,
    formatPlaywrightDraft
  };
});
