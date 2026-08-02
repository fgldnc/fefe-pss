/**
 * Testes de _tolerancia (js/pdf-import.js) — a tolerância de centavos usada na
 * deduplicação de parcelas.
 * Roda com: node --test test/
 *
 * Critério documentado no módulo: clamp((N-1)/100 + 1 centavo, R$ 0,02, R$ 1,00).
 * Valores fictícios; nenhum dado de fatura real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { _tolerancia } from '../js/pdf-import.js';

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
