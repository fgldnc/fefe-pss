/**
 * Testes das correções de dedupe e do regex genérico ancorado.
 * Todos os valores e nomes de estabelecimento são fictícios.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { dedupKey, normalizeDesc, detectDuplicates } from '../js/parsers/base-parser.js';
import { GENERIC_LINE_RE } from '../js/parsers/pdf-statement-parser.js';

test('entrada e saída de mesmo valor não colidem', () => {
  const desc = normalizeDesc('TRANSFERENCIA CONTA LOJA EXEMPLO');
  const saida   = dedupKey('2026-07-10', -250.00, desc, 'expense');
  const entrada = dedupKey('2026-07-10',  250.00, desc, 'income');
  assert.notEqual(saida, entrada);
});

test('diferença de 1 centavo cai no mesmo bucket de 5 centavos', () => {
  const desc = normalizeDesc('MERCADO FICTICIO LTDA');
  const a = dedupKey('2026-07-10', 100.00, desc, 'expense');
  const b = dedupKey('2026-07-10', 100.01, desc, 'expense');
  assert.equal(a, b);
});

test('detectDuplicates separa entrada de saída de mesmo valor', () => {
  const existentes = [
    { date: '2026-07-10', amount: -250.00, description: 'Transferencia Loja Exemplo', type: 'expense' },
  ];
  const novos = [
    { date: '2026-07-10', amount: -250.01, description: 'Transferencia Loja Exemplo', type: 'expense' },
    { date: '2026-07-10', amount:  250.00, description: 'Transferencia Loja Exemplo', type: 'income'  },
  ];
  const r = detectDuplicates(novos, existentes);
  assert.equal(r[0].isDuplicate, true);   // 1 centavo de diferença = mesma transação
  assert.equal(r[1].isDuplicate, false);  // sentido oposto = transação distinta
});

test('regex ancorado rejeita linha de limite de crédito', () => {
  assert.equal(GENERIC_LINE_RE.test('Limite de credito ate 10/08/2026 ..... 5.000,00 disponivel'), false);
  assert.equal(GENERIC_LINE_RE.test('Resumo da fatura 10/07/2026 total 1.234,56 vencimento 20/07/2026'), false);
});

test('regex ancorado aceita lançamento normal', () => {
  const m = '10/07/2026  PADARIA FICTICIA        123,45 D'.match(GENERIC_LINE_RE);
  assert.ok(m);
  assert.equal(m[2].trim(), 'PADARIA FICTICIA');
  assert.equal(m[3], '123,45');
  assert.equal(m[4], 'D');
});
