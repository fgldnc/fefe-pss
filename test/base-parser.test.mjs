/**
 * Testes das funções puras de js/parsers/base-parser.js (+ regex genérico do
 * parser de extrato em PDF).
 * Roda com: node --test test/
 *
 * Todos os valores e nomes de estabelecimento são fictícios — nenhum dado de
 * fatura real entra aqui.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseMoney, parseDate, dedupKey, normalizeDesc, detectDuplicates, autoClassify,
} from '../js/parsers/base-parser.js';
import { GENERIC_LINE_RE } from '../js/parsers/pdf-statement-parser.js';

// ─── parseMoney ─────────────────────────────────────────────────────────────

test('parseMoney — formato BR com separador de milhar', () => {
  assert.equal(parseMoney('1.234,56'), 1234.56);
  assert.equal(parseMoney('1.234.567,89'), 1234567.89);
});

test('parseMoney — formato BR sem milhar', () => {
  assert.equal(parseMoney('12,34'), 12.34);
  assert.equal(parseMoney('0,05'), 0.05);
});

test('parseMoney — valor sem centavos: ponto é milhar, não decimal', () => {
  // Regressão do erro de R$ 1.232,77: "1.234" em documento BR é mil e duzentos.
  assert.equal(parseMoney('1.234'), 1234);
  assert.equal(parseMoney('10.000'), 10000);
  // Duas casas depois do ponto continuam sendo decimal (formato americano)
  assert.equal(parseMoney('1234.56'), 1234.56);
});

test('parseMoney — negativo por sinal', () => {
  assert.equal(parseMoney('-1.234,56'), -1234.56);
  assert.equal(parseMoney('100,00-'), -100);
});

test('parseMoney — negativo entre parênteses (notação contábil)', () => {
  assert.equal(parseMoney('(1.234,56)'), -1234.56);
  assert.equal(parseMoney('(50,00)'), -50);
});

test('parseMoney — string vazia e null devolvem 0', () => {
  assert.equal(parseMoney(''), 0);
  assert.equal(parseMoney(null), 0);
  assert.equal(parseMoney(undefined), 0);
  assert.equal(parseMoney('abc'), 0);
});

test('parseMoney — prefixo R$ e espaços', () => {
  assert.equal(parseMoney('R$ 1.234,56'), 1234.56);
  assert.equal(parseMoney('r$ 250,00'), 250);
  assert.equal(parseMoney('  R$-99,90 '), -99.9);
});

// ─── parseDate ──────────────────────────────────────────────────────────────

test('parseDate — DD/MM/AAAA', () => {
  assert.equal(parseDate('05/03/2026'), '2026-03-05');
});

test('parseDate — DD/MM/AA vira 20AA', () => {
  assert.equal(parseDate('05/03/26'), '2026-03-05');
});

test('parseDate — AAAAMMDD (OFX)', () => {
  assert.equal(parseDate('20260305'), '2026-03-05');
});

test('parseDate — AAAA-MM-DD, com ou sem hora', () => {
  assert.equal(parseDate('2026-03-05'), '2026-03-05');
  assert.equal(parseDate('2026-03-05T10:00:00'), '2026-03-05');
});

test('parseDate — MM/DD americano ambíguo é desambiguado pelo mês', () => {
  // "mês" 25 não existe: a leitura era MM/DD → inverte
  assert.equal(parseDate('03/25/2026'), '2026-03-25');
  assert.equal(parseDate('05/13/26'), '2026-05-13');
  // Quando os dois campos são ≤ 12 não há ambiguidade resolvível: mantém BR
  assert.equal(parseDate('03/05/2026'), '2026-05-03');
});

test('parseDate — entrada inválida devolve null', () => {
  assert.equal(parseDate(''), null);
  assert.equal(parseDate(null), null);
  assert.equal(parseDate('não é data'), null);
  assert.equal(parseDate('99/99/2026'), null); // nenhum dos dois campos é mês
});

// ─── dedupKey / detectDuplicates ────────────────────────────────────────────

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

test('o bucket de 5 centavos não é uma tolerância simétrica', () => {
  // Comportamento conhecido e aceito: o bucket absorve arredondamento, mas
  // 1 centavo pode cruzar a fronteira do bucket (100,02 → 100,00 / 100,03 → 100,05).
  const desc = normalizeDesc('ESTABELECIMENTO A');
  assert.notEqual(
    dedupKey('2026-07-10', 100.02, desc, 'expense'),
    dedupKey('2026-07-10', 100.03, desc, 'expense'),
  );
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

test('detectDuplicates não marca data ou descrição diferente', () => {
  const existentes = [
    { date: '2026-07-10', amount: 100, description: 'Estabelecimento A', type: 'expense' },
  ];
  const novos = [
    { date: '2026-07-11', amount: 100, description: 'Estabelecimento A', type: 'expense' },
    { date: '2026-07-10', amount: 100, description: 'Estabelecimento B', type: 'expense' },
  ];
  const r = detectDuplicates(novos, existentes);
  assert.equal(r[0].isDuplicate, false);
  assert.equal(r[1].isDuplicate, false);
});

// ─── autoClassify ───────────────────────────────────────────────────────────

test('autoClassify — regra de usuário com regex inválido não quebra a classificação', () => {
  const regras = [
    { pattern: '[', category: 'quebrado', type: 'expense' },              // inválida
    { pattern: 'estabelecimento a', category: 'lazer', type: 'expense' }, // válida
  ];
  assert.deepEqual(autoClassify('ESTABELECIMENTO A', 100, regras),
    { type: 'expense', category: 'lazer' });
});

test('autoClassify — regex inválido isolado cai nas regras padrão', () => {
  assert.deepEqual(autoClassify('IFOOD PEDIDO', 50, [{ pattern: '(', category: 'x', type: 'expense' }]),
    { type: 'expense', category: 'alimentacao' });
});

test('autoClassify — regra de usuário tem prioridade sobre a padrão', () => {
  assert.equal(autoClassify('IFOOD PEDIDO', 50, []).category, 'alimentacao');
  assert.equal(
    autoClassify('IFOOD PEDIDO', 50, [{ pattern: 'ifood', category: 'lazer', type: 'expense' }]).category,
    'lazer',
  );
});

test('autoClassify — sem nenhuma regra aplicável, o sinal decide o tipo', () => {
  assert.deepEqual(autoClassify('XPTO NAO CLASSIFICAVEL', 10, []),
    { type: 'expense', category: 'outros' });
  assert.deepEqual(autoClassify('XPTO NAO CLASSIFICAVEL', -10, []),
    { type: 'income', category: 'outros' });
});

// ─── regex genérico do parser de extrato em PDF ─────────────────────────────

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
