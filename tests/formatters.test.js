'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Formatters = require('../src/shared/formatters.js');

const sampleReport = {
  capturedAt: 1764000000000,
  notes: 'Falha ao finalizar compra com cupom.',
  hasScreenshot: true,
  page: {
    url: 'https://app.exemplo.com/checkout?token=secret_123&cupom=QA10',
    title: 'Checkout - Exemplo',
    viewport: { width: 1366, height: 768 },
    screen: { width: 1920, height: 1080, dpr: 2 },
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    language: 'pt-BR'
  },
  consoleLogs: [
    {
      level: 'error',
      message: 'TypeError: Cannot read properties of null ```hack```',
      stack: 'TypeError: x\n  at checkout.js:42',
      timestamp: 1764000000000
    },
    {
      level: 'warn',
      message: 'Aviso de deprecation',
      timestamp: 1764000000500
    }
  ],
  networkErrors: [
    {
      kind: 'fetch',
      method: 'POST',
      url: 'https://api.exemplo.com/checkout?api_key=abc999&step=2',
      status: 500,
      statusText: 'Internal Server Error',
      durationMs: 145,
      responseSnippet: '{"error":"NullPointerException"}',
      timestamp: 1764000001000
    }
  ],
  breadcrumbs: [
    { type: 'input', selector: '#email', label: 'E-mail', sampleValue: 'qa@teste.com' },
    { type: 'click', selector: '#btnSubmitForm', label: 'Finalizar Cadastro' }
  ]
};

test('redactUrl oculta parâmetros sensíveis e mantém parâmetros comuns', () => {
  const redacted = Formatters.redactUrl('https://site.com/a?token=123&page=2&api_key=xyz');
  assert.match(redacted, /token=%5BOCULTO%5D|token=\[OCULTO\]/);
  assert.match(redacted, /api_key=%5BOCULTO%5D|api_key=\[OCULTO\]/);
  assert.match(redacted, /page=2/);
});

test('parseUserAgent identifica navegador e sistema operacional', () => {
  const info = Formatters.parseUserAgent(sampleReport.page.userAgent);
  assert.equal(info.browser, 'Google Chrome 131.0.0.0');
  assert.equal(info.os, 'Linux');
});

test('formatGitHubMarkdown gera relatório completo e mascara tokens', () => {
  const md = Formatters.formatGitHubMarkdown(sampleReport, {
    includeWarnings: false,
    includeBreadcrumbs: true,
    redactTokens: true
  });
  assert.match(md, /# \[Bug\] Falha HTTP 500 em \/checkout/);
  assert.match(md, /1366x768/);
  assert.match(md, /POST/);
  assert.match(md, /NullPointerException/);
  assert.doesNotMatch(md, /secret_123/);
  assert.doesNotMatch(md, /abc999/);
  assert.doesNotMatch(md, /Aviso de deprecation/);
  assert.doesNotMatch(md, /```hack```/);
});

test('formatJiraMarkup gera sintaxe Jira válida', () => {
  const jira = Formatters.formatJiraMarkup(sampleReport, { redactTokens: true });
  assert.match(jira, /^h2\. \[Bug\]/);
  assert.match(jira, /\|\| Campo \|\| Valor \|\|/);
  assert.match(jira, /\{code:title=Console Errors\}/);
  assert.doesNotMatch(jira, /secret_123/);
});

test('formatPlaywrightDraft gera teste Playwright TypeScript válido', () => {
  const spec = Formatters.formatPlaywrightDraft(sampleReport, { redactTokens: true });
  assert.match(spec, /import \{ test, expect \} from '@playwright\/test';/);
  assert.match(spec, /viewport: \{ width: 1366, height: 768 \}/);
  assert.match(spec, /page\.locator\('#email'\)\.first\(\)\.fill\('qa@teste\.com'\);/);
  assert.match(spec, /page\.locator\('#btnSubmitForm'\)\.first\(\)\.click\(\);/);
  assert.match(spec, /expect\(failedResponses/);
  assert.match(spec, /expect\(consoleErrors/);
});
