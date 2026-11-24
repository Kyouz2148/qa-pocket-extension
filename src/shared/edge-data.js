(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }
  root.QAEdgeData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PROFILES = [
    {
      id: 'chaos',
      label: 'Caos (Misto)',
      icon: '🌪️',
      shortDesc: 'Combina bordas, emojis, XSS e formatos extremos para achar bugs rápido.',
      badge: 'Recomendado'
    },
    {
      id: 'overflow',
      label: 'Textos Gigantes',
      icon: '📏',
      shortDesc: 'Strings de 500 a 2.500 chars sem quebra para testar layout e maxLength.',
      badge: 'Overflow'
    },
    {
      id: 'security',
      label: 'Especiais & XSS/SQLi',
      icon: '🛡️',
      shortDesc: 'Payloads inofensivos para testar escape HTML, SQLi, template injection e acentos.',
      badge: 'Sanitização'
    },
    {
      id: 'emojis',
      label: 'Emojis & Unicode',
      icon: '🧪',
      shortDesc: 'Emojis compostos, Zalgo, caracteres RTL e Unicode multibyte.',
      badge: 'Encoding'
    },
    {
      id: 'valid_br',
      label: 'Dados BR Válidos',
      icon: '🇧🇷',
      shortDesc: 'CPF/CNPJ matematicamente válidos (Mod-11), CEP, telefone e e-mail válidos.',
      badge: 'Caminho Feliz'
    },
    {
      id: 'invalid',
      label: 'Dados Inválidos',
      icon: '🚫',
      shortDesc: 'CPFs com dígito errado, e-mails quebrados, espaços em branco e negativos.',
      badge: 'Validação'
    },
    {
      id: 'extremes',
      label: 'Datas & Números Extremos',
      icon: '⏱️',
      shortDesc: 'Anos 1900/2099, ano bissexto, zero, decimais minúsculos e valores gigantes.',
      badge: 'Limites'
    }
  ];

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function pickRandom(list, index) {
    if (typeof index === 'number') {
      return list[Math.abs(index) % list.length];
    }
    return list[randomInt(0, list.length - 1)];
  }

  function formatCPF(digits) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }

  function computeCPFDigits(base9) {
    let sum1 = 0;
    for (let i = 0; i < 9; i++) {
      sum1 += Number(base9[i]) * (10 - i);
    }
    const rem1 = (sum1 * 10) % 11;
    const d1 = rem1 === 10 ? 0 : rem1;

    const base10 = base9 + String(d1);
    let sum2 = 0;
    for (let i = 0; i < 10; i++) {
      sum2 += Number(base10[i]) * (11 - i);
    }
    const rem2 = (sum2 * 10) % 11;
    const d2 = rem2 === 10 ? 0 : rem2;

    return `${base9}${d1}${d2}`;
  }

  function generateValidCPF(formatted = true) {
    let base9 = '';
    do {
      base9 = Array.from({ length: 9 }, () => String(randomInt(0, 9))).join('');
    } while (/^(\d)\1{8}$/.test(base9));
    const full = computeCPFDigits(base9);
    return formatted ? formatCPF(full) : full;
  }

  function isValidCPF(cpf) {
    const clean = String(cpf || '').replace(/\D/g, '');
    if (clean.length !== 11 || /^(\d)\1{10}$/.test(clean)) return false;
    const expected = computeCPFDigits(clean.slice(0, 9));
    return clean === expected;
  }

  function generateInvalidCPF(formatted = true, index) {
    const fixedInvalids = [
      '11111111111',
      '00000000000',
      '12345678900',
      '98765432199'
    ];
    if (typeof index === 'number' && index % 2 === 0) {
      const candidate = pickRandom(fixedInvalids, index);
      return formatted ? formatCPF(candidate) : candidate;
    }
    const valid = generateValidCPF(false);
    const lastDigit = (Number(valid[10]) + 1) % 10;
    const broken = valid.slice(0, 10) + String(lastDigit);
    return formatted ? formatCPF(broken) : broken;
  }

  function formatCNPJ(digits) {
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  function computeCNPJDigits(base12) {
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

    let s1 = 0;
    for (let i = 0; i < 12; i++) s1 += Number(base12[i]) * w1[i];
    const r1 = s1 % 11;
    const d1 = r1 < 2 ? 0 : 11 - r1;

    const base13 = base12 + String(d1);
    let s2 = 0;
    for (let i = 0; i < 13; i++) s2 += Number(base13[i]) * w2[i];
    const r2 = s2 % 11;
    const d2 = r2 < 2 ? 0 : 11 - r2;

    return `${base12}${d1}${d2}`;
  }

  function generateValidCNPJ(formatted = true) {
    const branch = '0001';
    let root8 = '';
    do {
      root8 = Array.from({ length: 8 }, () => String(randomInt(0, 9))).join('');
    } while (/^(\d)\1{7}$/.test(root8));
    const full = computeCNPJDigits(root8 + branch);
    return formatted ? formatCNPJ(full) : full;
  }

  function isValidCNPJ(cnpj) {
    const clean = String(cnpj || '').replace(/\D/g, '');
    if (clean.length !== 14 || /^(\d)\1{13}$/.test(clean)) return false;
    return clean === computeCNPJDigits(clean.slice(0, 12));
  }

  function generateValidCEP(formatted = true) {
    const digits = `${randomInt(10, 99)}${randomInt(100, 999)}${randomInt(100, 999)}`;
    return formatted ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
  }

  function generateValidPhone(formatted = true) {
    const ddd = pickRandom(['11', '21', '31', '41', '51', '61', '71', '81']);
    const body = `9${randomInt(1000, 9999)}${randomInt(1000, 9999)}`;
    return formatted ? `(${ddd}) ${body.slice(0, 5)}-${body.slice(5)}` : `${ddd}${body}`;
  }

  const SECURITY_PAYLOADS = [
    `<script>alert('qa')</script>`,
    `' OR '1'='1`,
    `"; DROP TABLE usuarios;--`,
    `<img src=x onerror=alert(1)>`,
    `{{7*7}} \${7*7} #{7*7}`,
    `C:\\fakepath\\"teste'\\n\\t`
  ];

  const EMOJI_PAYLOADS = [
    'QA Teste 👨‍👩‍👧‍👦🚀🔥🧪',
    '𝔘𝔫𝔦𝔠𝔬𝔡𝔢 ✨ 🇧🇷 🇯🇵 🛠️',
    'T̸e̸s̸t̸e̸ ̶Z̶a̶l̶g̶o̶ 💥',
    'Ação & Reação — “aspas” € ¥ £',
    'Texto\u200Bcom\u200Bzero-width\u200Bspace ⚡'
  ];

  const INVALID_EMAILS = [
    'sem-arroba.com',
    'usuario@.com',
    '@dominio.com',
    'usuario com espaco@teste.com',
    'duplo@@teste.com',
    'teste@localhost',
    '   '
  ];

  const EDGE_VALID_EMAILS = [
    'qa.edge+tag2026@sub.dominio-teste.com.br',
    'maria_silva-99@empresa.io',
    'user+teste.123@exemplo.org'
  ];

  const EXTREME_DATES = [
    '1900-01-01',
    '1970-01-01',
    '2000-02-29',
    '2099-12-31',
    '1899-12-31'
  ];

  const VALID_NAMES = [
    'Ana Beatriz Conceição',
    'João Pedro D\'Ávila',
    'Mariana Albuquerque Júnior',
    'Lucas Henrique Sá-Pinto'
  ];

  function buildOverflowText(length = 600, withSpaces = false) {
    if (withSpaces) {
      const chunk = 'Lorem ipsum QA stress test acentuação çãõéü🚀 ';
      return chunk.repeat(Math.ceil(length / chunk.length)).slice(0, length);
    }
    return `QA_${'X'.repeat(Math.max(0, length - 7))}_END`;
  }

  function detectFieldKind(meta) {
    const type = String(meta.type || 'text').toLowerCase();
    const tag = String(meta.tagName || 'input').toLowerCase();
    const hint = [
      meta.name,
      meta.id,
      meta.placeholder,
      meta.autocomplete,
      meta.ariaLabel,
      meta.labelText
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (tag === 'select') return 'select';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'range') return 'range';
    if (type === 'color') return 'color';
    if (type === 'date') return 'date';
    if (type === 'datetime-local') return 'datetime';
    if (type === 'month') return 'month';
    if (type === 'time') return 'time';

    if (/(?:^|[^a-z])cpf(?:[^a-z]|$)|cadastro.*pessoa/.test(hint)) return 'cpf';
    if (/(?:^|[^a-z])cnpj(?:[^a-z]|$)|empresa.*doc/.test(hint)) return 'cnpj';
    if (/(?:^|[^a-z])cep(?:[^a-z]|$)|postal|zip/.test(hint)) return 'cep';
    if (/tel|fone|cel|whats|phone|mobile/.test(hint) || type === 'tel') return 'phone';
    if (type === 'email' || /e-?mail|correio/.test(hint)) return 'email';
    if (type === 'password' || /senha|pass(word)?/.test(hint)) return 'password';
    if (type === 'url' || /site|url|website|link|http/.test(hint)) return 'url';
    if (type === 'number' || /valor|preco|preço|price|amount|qtd|quant|idade|age|numero|número|orcamento|orçamento/.test(hint)) {
      return type === 'number' ? 'number' : 'numeric_text';
    }
    if (tag === 'textarea' || /obs|coment|descri|mensagem|msg|bio|nota|detalhe/.test(hint)) return 'textarea';
    if (/sobrenome|last.?name/.test(hint)) return 'lastName';
    if (/nome|name|usuario|usuário|cliente/.test(hint)) return 'fullName';
    if (type === 'search' || /busca|search|pesquisa/.test(hint)) return 'search';

    return 'text';
  }

  function pickValueForField(fieldMeta, profileId, index = 0) {
    const kind = detectFieldKind(fieldMeta);
    const effectiveProfile =
      profileId === 'chaos'
        ? pickRandom(['overflow', 'security', 'emojis', 'invalid', 'extremes', 'valid_br'], index)
        : profileId;

    if (kind === 'color') {
      return { value: pickRandom(['#ff0055', '#000000', '#ffffff', '#10b981'], index), kind };
    }

    if (kind === 'time') {
      return {
        value: effectiveProfile === 'extremes' ? pickRandom(['00:00', '23:59'], index) : '14:35',
        kind
      };
    }

    if (kind === 'month') {
      return {
        value: effectiveProfile === 'extremes' ? pickRandom(['1900-01', '2099-12'], index) : '2026-11',
        kind
      };
    }

    if (kind === 'datetime') {
      return {
        value: effectiveProfile === 'extremes' ? '2099-12-31T23:59' : '2026-11-24T12:30',
        kind
      };
    }

    if (kind === 'date') {
      if (effectiveProfile === 'valid_br') return { value: '1994-05-18', kind };
      if (effectiveProfile === 'invalid') return { value: '2099-12-31', kind };
      return { value: pickRandom(EXTREME_DATES, index), kind };
    }

    if (kind === 'number' || kind === 'range' || kind === 'numeric_text') {
      if (effectiveProfile === 'valid_br') return { value: '150', kind };
      if (effectiveProfile === 'invalid') return { value: pickRandom(['-999', '-0.01', '0'], index), kind };
      if (effectiveProfile === 'extremes') {
        const min = fieldMeta.min !== '' && fieldMeta.min !== undefined ? Number(fieldMeta.min) : null;
        const max = fieldMeta.max !== '' && fieldMeta.max !== undefined ? Number(fieldMeta.max) : null;
        if (kind === 'range' && min !== null && max !== null) {
          return { value: String(index % 2 === 0 ? max : min), kind };
        }
        return { value: pickRandom(['0', '-999999999', '999999999999', '0.000001'], index), kind };
      }
      if (effectiveProfile === 'overflow') return { value: '999999999999999', kind };
      return { value: pickRandom(['-1', '0', '9999999'], index), kind };
    }

    if (kind === 'cpf') {
      if (effectiveProfile === 'valid_br') return { value: generateValidCPF(true), kind };
      if (effectiveProfile === 'invalid') return { value: generateInvalidCPF(true, index), kind };
      if (effectiveProfile === 'security') return { value: `' OR '1'='1`, kind };
      if (effectiveProfile === 'emojis') return { value: '123.456.🧪🚀-00', kind };
      if (effectiveProfile === 'overflow') return { value: '1'.repeat(60), kind };
      return { value: generateInvalidCPF(true, index), kind };
    }

    if (kind === 'cnpj') {
      if (effectiveProfile === 'valid_br') return { value: generateValidCNPJ(true), kind };
      if (effectiveProfile === 'invalid') return { value: '11.111.111/0001-11', kind };
      if (effectiveProfile === 'overflow') return { value: '9'.repeat(60), kind };
      return { value: '00.000.000/0000-00', kind };
    }

    if (kind === 'cep') {
      if (effectiveProfile === 'valid_br') return { value: generateValidCEP(true), kind };
      if (effectiveProfile === 'invalid') return { value: '00000-000', kind };
      if (effectiveProfile === 'overflow') return { value: '123456789012345', kind };
      return { value: '99999-999', kind };
    }

    if (kind === 'phone') {
      if (effectiveProfile === 'valid_br') return { value: generateValidPhone(true), kind };
      if (effectiveProfile === 'invalid') return { value: '123', kind };
      if (effectiveProfile === 'security') return { value: '+55 (11) <script>', kind };
      if (effectiveProfile === 'overflow') return { value: '5511999999999'.repeat(5), kind };
      return { value: '(00) 00000-0000', kind };
    }

    if (kind === 'email') {
      if (effectiveProfile === 'valid_br') return { value: pickRandom(EDGE_VALID_EMAILS, index), kind };
      if (effectiveProfile === 'invalid') return { value: pickRandom(INVALID_EMAILS, index), kind };
      if (effectiveProfile === 'security') return { value: `"<script>alert(1)</script>"@teste.com`, kind };
      if (effectiveProfile === 'emojis') return { value: 'qa🚀@teste🧪.com', kind };
      if (effectiveProfile === 'overflow') return { value: `${'a'.repeat(180)}@${'b'.repeat(80)}.com`, kind };
      return { value: pickRandom(INVALID_EMAILS, index), kind };
    }

    if (kind === 'url') {
      if (effectiveProfile === 'valid_br') return { value: 'https://qa-teste.exemplo.com.br/caminho?a=1', kind };
      if (effectiveProfile === 'invalid') return { value: 'htp:/url-invalida sem-esquema', kind };
      if (effectiveProfile === 'security') return { value: 'javascript:alert(1)', kind };
      if (effectiveProfile === 'overflow') return { value: `https://exemplo.com/${'a'.repeat(800)}`, kind };
      return { value: 'https://🚀.exemplo.com', kind };
    }

    if (kind === 'password') {
      if (effectiveProfile === 'valid_br') return { value: 'Qa#2026!Forte99', kind };
      if (effectiveProfile === 'invalid') return { value: '   ', kind };
      if (effectiveProfile === 'emojis') return { value: 'Senh@🚀🔥2026!', kind };
      if (effectiveProfile === 'overflow') return { value: 'P@ss1'.repeat(60), kind };
      return { value: `' OR '1'='1 -- !@#$`, kind };
    }

    if (kind === 'textarea') {
      if (effectiveProfile === 'valid_br') {
        return { value: 'Cadastro de teste automatizado QA Pocket — validação completa de fluxo.', kind };
      }
      if (effectiveProfile === 'overflow') return { value: buildOverflowText(2200, true), kind };
      if (effectiveProfile === 'security') return { value: SECURITY_PAYLOADS.join('\n'), kind };
      if (effectiveProfile === 'emojis') return { value: EMOJI_PAYLOADS.join('\n'), kind };
      if (effectiveProfile === 'invalid') return { value: '     \n   \t  ', kind };
      return { value: buildOverflowText(500, false), kind };
    }

    // Generic text / fullName / lastName / search
    if (effectiveProfile === 'valid_br') {
      if (kind === 'lastName') return { value: 'Albuquerque', kind };
      return { value: pickRandom(VALID_NAMES, index), kind };
    }
    if (effectiveProfile === 'overflow') {
      return { value: buildOverflowText(650, false), kind };
    }
    if (effectiveProfile === 'security') {
      return { value: pickRandom(SECURITY_PAYLOADS, index), kind };
    }
    if (effectiveProfile === 'emojis') {
      return { value: pickRandom(EMOJI_PAYLOADS, index), kind };
    }
    if (effectiveProfile === 'invalid') {
      return { value: pickRandom(['   ', 'a', '123456', '!@#$%¨&*()'], index), kind };
    }
    if (effectiveProfile === 'extremes') {
      return { value: pickRandom(['0', '99999999999999999999', '1900-01-01'], index), kind };
    }

    return { value: pickRandom(EMOJI_PAYLOADS, index), kind };
  }

  function getQuickSnippets() {
    return [
      { id: 'cpf_valid', label: 'CPF Válido', getValue: () => generateValidCPF(true) },
      { id: 'cpf_invalid', label: 'CPF Inválido', getValue: () => generateInvalidCPF(true, 1) },
      { id: 'cnpj_valid', label: 'CNPJ Válido', getValue: () => generateValidCNPJ(true) },
      { id: 'email_edge', label: 'E-mail Borda', getValue: () => pickRandom(EDGE_VALID_EMAILS) },
      { id: 'xss', label: 'XSS Probe', getValue: () => `<script>alert('qa')</script>` },
      { id: 'sqli', label: 'SQLi Probe', getValue: () => `' OR '1'='1` },
      { id: 'emojis', label: 'Emojis', getValue: () => EMOJI_PAYLOADS[0] },
      { id: 'long_500', label: '500 chars', getValue: () => buildOverflowText(500, false) }
    ];
  }

  return {
    PROFILES,
    generateValidCPF,
    isValidCPF,
    generateInvalidCPF,
    generateValidCNPJ,
    isValidCNPJ,
    generateValidCEP,
    generateValidPhone,
    detectFieldKind,
    pickValueForField,
    buildOverflowText,
    getQuickSnippets
  };
});
