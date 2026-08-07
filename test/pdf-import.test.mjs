/**
 * Testes de _tolerancia (js/pdf-import.js) — a tolerância de centavos usada na
 * deduplicação de parcelas.
 * Roda com: node --test test/*.test.mjs
 *
 * Critério documentado no módulo: clamp((N-1)/100 + 1 centavo, R$ 0,02, R$ 1,00).
 * Valores fictícios; nenhum dado de fatura real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { _tolerancia, competenciaDaFatura } from '../js/pdf-import.js';

test('1 parcela cai no piso de R$ 0,02', () => {
  // (1-1)/100 + 0,01 = 0,01 → elevado ao piso
  assert.equal(_tolerancia(1), 0.02);
  // Entradas ausentes/inválidas são tratadas como 1 parcela
  assert.equal(_tolerancia(0), 0.02);
  assert.equal(_tolerancia(undefined), 0.02);
  assert.equal(_tolerancia(2), 0.02); // 0,02 exatamente = piso
});

test('6 parcelas dão R$ 0,06', () => {
  // A diferença máxima entre parcelas da mesma compra é (N-1) centavos
  assert.equal(Number(_tolerancia(6).toFixed(2)), 0.06);
});

test('200 parcelas ficam no teto de R$ 1,00', () => {
  assert.equal(_tolerancia(200), 1.00);
  assert.equal(_tolerancia(120), 1.00);
});

test('a tolerância cresce monotonicamente entre piso e teto', () => {
  let anterior = 0;
  for (let n = 1; n <= 200; n++) {
    const t = _tolerancia(n);
    assert.ok(t >= 0.02 && t <= 1.00, `N=${n} fora do intervalo`);
    assert.ok(t >= anterior, `N=${n} regrediu`);
    anterior = t;
  }
});

// ─── COMPETÊNCIA DA FATURA ─────────────────────────────────────────────────
// O caso que motivou a correção: fatura que FECHA em julho e VENCE em agosto.
// Ela traz compras desde o início de junho, então a versão antiga — que somava
// o offset ao mês da PRIMEIRA linha lida — jogava a fatura inteira em maio.

test('a competência sai do vencimento, não da primeira compra lida', () => {
  const itens = [
    { date: '2026-06-08' },  // primeira na ordem de leitura do PDF
    { date: '2026-07-05' },
    { date: '2026-06-20' },
  ];
  const venc = { year: 2026, month: 8 }; // vence em agosto
  const r = competenciaDaFatura(itens, venc, -1);
  assert.equal(r.ym, '2026-07', 'fatura que vence em agosto é a fatura de julho');
  assert.equal(r.origem, 'vencimento');
});

test('a ordem de leitura das linhas não muda a competência', () => {
  const venc = { year: 2026, month: 8 };
  const a = [{ date: '2026-06-08' }, { date: '2026-07-05' }];
  const b = [{ date: '2026-07-05' }, { date: '2026-06-08' }];
  assert.equal(competenciaDaFatura(a, venc, -1).ym, competenciaDaFatura(b, venc, -1).ym);
});

test('offset 0 mantém a competência no mês do vencimento', () => {
  assert.equal(competenciaDaFatura([], { year: 2026, month: 8 }, 0).ym, '2026-08');
});

test('vencimento em janeiro com offset -1 vira dezembro do ano anterior', () => {
  assert.equal(competenciaDaFatura([], { year: 2026, month: 1 }, -1).ym, '2025-12');
});

test('sem vencimento no PDF, a âncora é a compra MAIS RECENTE', () => {
  // A compra mais recente é o mês em que a fatura fechou — nunca a mais antiga,
  // que é o começo do período e fica um mês (ou dois) atrás.
  const itens = [{ date: '2026-06-08' }, { date: '2026-07-05' }, { date: '2026-06-20' }];
  const r = competenciaDaFatura(itens, null, -1);
  assert.equal(r.ym, '2026-07');
  assert.equal(r.origem, 'ultima-compra', 'a dedução mais fraca precisa se declarar');
});

test('vencimento incompleto é tratado como ausente', () => {
  const itens = [{ date: '2026-07-05' }];
  assert.equal(competenciaDaFatura(itens, { year: 2026 }, -1).origem, 'ultima-compra');
  assert.equal(competenciaDaFatura(itens, {}, -1).origem, 'ultima-compra');
});
