'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { server } = require('../playground/server.js');

const ROOT = path.resolve(__dirname, '..');

test('manifest.json segue Manifest V3 e todos os arquivos referenciados existem', () => {
  const manifestPath = path.join(ROOT, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.background?.service_worker);
  assert.ok(manifest.action?.default_popup);

  const filesToCheck = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...manifest.content_scripts.flatMap((cs) => cs.js)
  ];

  for (const rel of filesToCheck) {
    const abs = path.join(ROOT, rel);
    assert.equal(fs.existsSync(abs), true, `Arquivo ausente referenciado no manifest: ${rel}`);
  }
});

test('playground/server.js serve index.html e responde 404, 422 e 500 nos endpoints de teste', async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  async function request(reqPath, method = 'GET') {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: reqPath, method }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      });
      req.on('error', reject);
      req.end();
    });
  }

  try {
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.match(home.body, /QA Pocket — Playground de Testes/);

    const r404 = await request('/api/produtos');
    assert.equal(r404.status, 404);

    const r500 = await request('/api/checkout', 'POST');
    assert.equal(r500.status, 500);

    const r422 = await request('/api/validar', 'POST');
    assert.equal(r422.status, 422);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
