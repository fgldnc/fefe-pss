/**
 * Testes de detectColumnBands (js/parsers/pdf-layout.js).
 * Roda com: node --test test/
 *
 * Os itens são construídos programaticamente com coordenadas sintéticas —
 * nenhum dump de fatura real. O formato imita o de page.getTextContent().items:
 *   { str, width, transform: [a,b,c,d, X, Y] }
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectColumnBands, linesOfBand } from '../js/parsers/pdf-layout.js';

const PAGE_W = 600;

/** Item sintético do PDF.js: X = transform[4], Y = transform[5]. */
const item = (x, y, w, str = 'TEXTO') => ({ str, width: w, height: 8, transform: [1, 0, 0, 1, x, y] });

/** Uma linha por índice, do topo para baixo, espaçadas o bastante (Y_TOL_PX = 3). */
const yAt = i => 700 - i * 10;

test('página de uma coluna devolve uma faixa única', () => {
  // Todo o conteúdo entre x=100 e x=200: as valas restantes ficam nas bordas
  // e são descartadas por EDGE_MARGIN_RATIO.
  const items = [];
  for (let i = 0; i < 10; i++) items.push(item(100, yAt(i), 100, `LINHA ${i}`));

  const bands = detectColumnBands(items, PAGE_W);
  assert.equal(bands.length, 1);
  assert.equal(bands[0].x0, -Infinity);
  assert.equal(bands[0].x1, Infinity);
});

test('duas colunas separadas por uma vala larga devolvem duas faixas', () => {
  // Coluna esquerda: x 80–180. Coluna direita: x 300–400. Vala de 120pt no miolo.
  // As colunas são escalonadas verticalmente porque o critério de corte é a vala
  // MENOS atravessada — um separador de coluna real quase nunca é cruzado.
  const items = [];
  for (let i = 0; i < 8; i++)  items.push(item(80,  yAt(i), 100, `ESQUERDA ${i}`));
  for (let i = 8; i < 16; i++) items.push(item(300, yAt(i), 100, `DIREITA ${i}`));

  const bands = detectColumnBands(items, PAGE_W);
  assert.equal(bands.length, 2);
  assert.equal(bands[0].x0, -Infinity);
  assert.equal(bands[1].x1, Infinity);
  assert.equal(bands[0].x1, bands[1].x0, 'as faixas se encostam, sem buraco');
  assert.ok(bands[0].x1 > 180 && bands[0].x1 < 300, 'o corte cai dentro da vala');

  // A segmentação de fato separa o conteúdo
  assert.deepEqual(linesOfBand(items, bands[0]).slice(0, 2), ['ESQUERDA 0', 'ESQUERDA 1']);
  assert.deepEqual(linesOfBand(items, bands[1]).slice(0, 2), ['DIREITA 8', 'DIREITA 9']);
});

test('faixa com menos de MIN_ITEMS_PER_COL itens não vira coluna', () => {
  // Mesma geometria do teste anterior, mas a "coluna" da direita tem só 3 itens:
  // é ruído (rodapé, régua), então as faixas são fundidas de volta em uma só.
  const items = [];
  for (let i = 0; i < 10; i++) items.push(item(80,  yAt(i), 100, `ESQUERDA ${i}`));
  for (let i = 10; i < 13; i++) items.push(item(300, yAt(i), 100, `RUIDO ${i}`));

  const bands = detectColumnBands(items, PAGE_W);
  assert.equal(bands.length, 1);
  assert.equal(bands[0].x0, -Infinity);
  assert.equal(bands[0].x1, Infinity);
});

test('entrada degenerada devolve a faixa única de segurança', () => {
  assert.equal(detectColumnBands([], PAGE_W).length, 1);
  assert.equal(detectColumnBands(null, PAGE_W).length, 1);
  // Menos de 4 linhas: amostra pequena demais para o histograma por votação
  assert.equal(detectColumnBands([item(80, yAt(0), 100), item(300, yAt(1), 100)], PAGE_W).length, 1);
});
