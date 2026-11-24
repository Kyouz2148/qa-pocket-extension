(function () {
  'use strict';

  const logList = document.getElementById('localLogList');
  const obsInput = document.getElementById('observacoes');
  const obsCounter = document.getElementById('obsCounter');
  const form = document.getElementById('qaTestForm');
  const feedback = document.getElementById('formFeedback');

  function addLocalLog(msg) {
    const li = document.createElement('li');
    const time = new Date().toLocaleTimeString('pt-BR');
    li.textContent = `[${time}] ${msg}`;
    logList.prepend(li);
  }

  document.getElementById('btnClearLocalLog').addEventListener('click', () => {
    logList.innerHTML = '';
  });

  document.getElementById('btnConsoleError').addEventListener('click', () => {
    const err = new Error('Falha simulada ao calcular frete no checkout');
    console.error('[CheckoutService]', err);
    addLocalLog('console.error() disparado');
  });

  document.getElementById('btnConsoleWarn').addEventListener('click', () => {
    console.warn('[Deprecation] Método calcularDescontoV1() será removido na v2.4');
    addLocalLog('console.warn() disparado');
  });

  document.getElementById('btnThrowError').addEventListener('click', () => {
    addLocalLog('Lançando ReferenceError não tratado...');
    setTimeout(() => {
      throw new ReferenceError('carrinhoTotal is not defined em Checkout.render()');
    }, 20);
  });

  document.getElementById('btnPromiseReject').addEventListener('click', () => {
    addLocalLog('Rejeitando Promise sem .catch()...');
    Promise.reject(new Error('Timeout ao conectar no gateway de pagamento (5000ms)'));
  });

  document.getElementById('btnFetch404').addEventListener('click', async () => {
    addLocalLog('GET /api/produtos?token=segredo_qa_123 -> aguardando...');
    try {
      const res = await fetch('/api/produtos?token=segredo_qa_123');
      addLocalLog(`Fetch retornou HTTP ${res.status}`);
    } catch (e) {
      addLocalLog(`Fetch falhou: ${e.message}`);
    }
  });

  document.getElementById('btnFetch500').addEventListener('click', async () => {
    addLocalLog('POST /api/checkout -> aguardando...');
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pedidoId: 9012, valor: -50 })
      });
      addLocalLog(`Fetch POST retornou HTTP ${res.status}`);
    } catch (e) {
      addLocalLog(`Fetch POST falhou: ${e.message}`);
    }
  });

  document.getElementById('btnXhr422').addEventListener('click', () => {
    addLocalLog('XHR POST /api/validar -> aguardando...');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/validar');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.onloadend = () => {
      addLocalLog(`XHR retornou HTTP ${xhr.status}`);
    };
    xhr.send(JSON.stringify({ cpf: '111.111.111-11' }));
  });

  document.getElementById('btnBrokenImg').addEventListener('click', () => {
    const slot = document.getElementById('brokenMediaSlot');
    const img = document.createElement('img');
    img.src = `/assets/banner-inexistente-${Date.now()}.png`;
    img.alt = 'Imagem quebrada de teste';
    img.width = 1;
    img.height = 1;
    slot.appendChild(img);
    addLocalLog('Tag <img> com src quebrado inserida no DOM');
  });

  document.getElementById('btnFullFlow').addEventListener('click', async () => {
    addLocalLog('Executando fluxo completo de bug...');
    console.warn('Tentativa de pagamento com sessão prestes a expirar');
    await fetch('/api/checkout', { method: 'POST', body: '{}' }).catch(() => {});
    console.error(new TypeError("Cannot read properties of null (reading 'parcelas')"));
  });

  obsInput.addEventListener('input', () => {
    const len = obsInput.value.length;
    obsCounter.textContent = `${len} / 200`;
    obsCounter.classList.toggle('over', len > 200);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    const nome = String(data.get('nome') || '');
    const email = String(data.get('email') || '');
    const cpf = String(data.get('cpf') || '');
    const orcamento = Number(data.get('orcamento') || 0);
    const obs = String(data.get('observacoes') || '');

    const bugsEncontrados = [];

    if (!nome.trim()) {
      bugsEncontrados.push('Nome vazio foi submetido mesmo com atributo required (novalidate ativo).');
    }
    if (/<script|onerror=|drop table/i.test(`${nome} ${email} ${obs}`)) {
      bugsEncontrados.push('Payload XSS/SQLi aceito sem sanitização no frontend!');
      console.error('Falha de sanitização detectada no formulário:', { nome, email });
    }
    if (/^(\d)\1{10}$/.test(cpf.replace(/\D/g, ''))) {
      bugsEncontrados.push(`CPF com dígitos repetidos (${cpf}) passou pela validação ingênua!`);
    }
    if (obs.length > 200) {
      bugsEncontrados.push(`Campo Observações aceitou ${obs.length} caracteres (limite esperado: 200).`);
      console.error(`Overflow de campo: observacoes=${obs.length} chars`);
    }
    if (orcamento < 0) {
      bugsEncontrados.push(`Orçamento negativo (${orcamento}) não bloqueado!`);
    }

    feedback.classList.remove('hidden', 'ok', 'bug');

    if (bugsEncontrados.length > 0) {
      feedback.classList.add('bug');
      feedback.innerHTML =
        `<strong>🚨 ${bugsEncontrados.length} comportamento(s) anômalo(s) exposto(s):</strong><br>` +
        bugsEncontrados.map((b) => `• ${b.replace(/</g, '&lt;')}`).join('<br>');

      await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, email, cpf, orcamento })
      }).catch(() => {});
    } else {
      feedback.classList.add('ok');
      feedback.textContent = '✅ Formulário validado e enviado sem anomalias detectadas.';
    }
  });
})();
