'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const EdgeData = require('../src/shared/edge-data.js');

test('generateValidCPF gera CPFs matematicamente válidos (Mod-11)', () => {
  for (let i = 0; i < 100; i++) {
    const cpf = EdgeData.generateValidCPF(true);
    assert.match(cpf, /^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
    assert.equal(EdgeData.isValidCPF(cpf), true, `CPF inválido gerado: ${cpf}`);
  }
});

test('generateInvalidCPF gera CPFs que falham na validação Mod-11', () => {
  for (let i = 0; i < 50; i++) {
    const cpf = EdgeData.generateInvalidCPF(true, i);
    assert.equal(EdgeData.isValidCPF(cpf), false, `CPF deveria ser inválido: ${cpf}`);
  }
});

test('generateValidCNPJ gera CNPJs matematicamente válidos', () => {
  for (let i = 0; i < 50; i++) {
    const cnpj = EdgeData.generateValidCNPJ(true);
    assert.match(cnpj, /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/);
    assert.equal(EdgeData.isValidCNPJ(cnpj), true, `CNPJ inválido gerado: ${cnpj}`);
  }
});

test('detectFieldKind identifica tipos semânticos corretamente', () => {
  assert.equal(EdgeData.detectFieldKind({ name: 'cpf_cliente', type: 'text' }), 'cpf');
  assert.equal(EdgeData.detectFieldKind({ id: 'cnpj', type: 'text' }), 'cnpj');
  assert.equal(EdgeData.detectFieldKind({ placeholder: '01001-000', name: 'cep' }), 'cep');
  assert.equal(EdgeData.detectFieldKind({ type: 'email', name: 'user_mail' }), 'email');
  assert.equal(EdgeData.detectFieldKind({ type: 'tel', name: 'whatsapp' }), 'phone');
  assert.equal(EdgeData.detectFieldKind({ tagName: 'textarea', name: 'observacoes' }), 'textarea');
  assert.equal(EdgeData.detectFieldKind({ tagName: 'select', name: 'plano' }), 'select');
});

test('pickValueForField gera dados adequados por perfil', () => {
  const validCpf = EdgeData.pickValueForField({ name: 'cpf', type: 'text' }, 'valid_br', 0);
  assert.equal(EdgeData.isValidCPF(validCpf.value), true);

  const invalidCpf = EdgeData.pickValueForField({ name: 'cpf', type: 'text' }, 'invalid', 1);
  assert.equal(EdgeData.isValidCPF(invalidCpf.value), false);

  const overflowObs = EdgeData.pickValueForField({ tagName: 'textarea', name: 'observacoes' }, 'overflow', 0);
  assert.ok(overflowObs.value.length >= 2000);

  const xssField = EdgeData.pickValueForField({ name: 'nome', type: 'text' }, 'security', 0);
  assert.match(xssField.value, /script|OR|DROP|img|\{\{/i);

  const emojiField = EdgeData.pickValueForField({ name: 'nome', type: 'text' }, 'emojis', 0);
  assert.ok(emojiField.value.length > 0);
});
