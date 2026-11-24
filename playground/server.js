'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8'
};

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload, null, 2));
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;

  if (pathname === '/api/produtos') {
    return sendJson(res, 404, {
      error: 'Catálogo de produtos não encontrado',
      code: 'CATALOG_NOT_FOUND',
      path: pathname
    });
  }

  if (pathname === '/api/checkout') {
    return sendJson(res, 500, {
      error: 'Erro interno ao processar pagamento: NullPointerException em PagamentoService',
      code: 'INTERNAL_PAYMENT_ERROR',
      traceId: 'qa-trace-9012'
    });
  }

  if (pathname === '/api/validar') {
    return sendJson(res, 422, {
      error: 'Falha de validação',
      details: [
        { field: 'cpf', message: 'Dígito verificador inválido' },
        { field: 'email', message: 'Formato de e-mail inválido' }
      ]
    });
  }

  const safePath = path.normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Arquivo não encontrado');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    return res.end(content);
  });
});

if (require.main === module) {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`QA Pocket Playground rodando em http://127.0.0.1:${PORT}`);
  });
}

module.exports = { server };
