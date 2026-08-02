/**
 * pdf-layout.js — Reconstrução de layout a partir de page.getTextContent()
 *
 * Compartilhado por pdf-import.js (fatura de cartão) e
 * pdf-statement-parser.js (extrato bancário).
 *
 * PROBLEMA QUE RESOLVE
 * Agrupar os itens de texto só pela coordenada Y funde colunas que estão
 * lado a lado na mesma altura. Na fatura do Itaú (layout de duas colunas),
 * isso funde uma linha de "Lançamentos: compras e saques" (coluna esquerda)
 * com uma linha de "Compras parceladas - próximas faturas" (coluna direita).
 * Os regex de data/valor então casam pedaços de colunas diferentes.
 *
 * SOLUÇÃO
 * 1. Detecta as faixas (bands) de X a partir da distribuição real de
 *    ocupação horizontal da página — não com um valor fixo em pixels.
 * 2. Reconstrói as linhas DENTRO de cada faixa, ordenando por X.
 * 3. Devolve as colunas na ordem de leitura: coluna esquerda inteira,
 *    depois coluna direita inteira.
 *
 * API do PDF.js usada (v3.11, já carregada via CDN no index.html):
 *   page.getViewport({ scale: 1 }).width
 *   page.getTextContent() → { items: [{ str, width, height, transform }] }
 *   item.transform[4] = X, item.transform[5] = Y (origem no canto inferior esq.)
 */

// ─── PARÂMETROS DE LAYOUT ──────────────────────────────────────────────────
// Todos relativos à largura da página, para não depender do tamanho do papel.
const Y_TOL_PX          = 3;     // itens dentro desta faixa vertical = mesma linha
const BUCKET_PX         = 4;     // resolução do histograma horizontal
const MIN_GAP_RATIO     = 0.045; // "vala" ≥ 4,5% da largura separa colunas
const EDGE_MARGIN_RATIO = 0.10;  // ignora valas nos 10% das bordas (são margens)
const MAX_COLUMNS       = 3;     // teto de segurança
const MIN_ITEMS_PER_COL = 5;     // faixa com menos itens que isso é ruído, funde

/**
 * Detecta faixas de coluna a partir do histograma de ocupação horizontal.
 * @param {Array} items itens de page.getTextContent().items
 * @param {number} pageWidth largura do viewport em escala 1
 * @returns {Array<{x0:number,x1:number}>} faixas ordenadas da esquerda p/ direita
 */
export function detectColumnBands(items, pageWidth) {
  const ALL = [{ x0: -Infinity, x1: Infinity }];
  if (!items?.length || !pageWidth) return ALL;

  const nBuckets = Math.ceil(pageWidth / BUCKET_PX) + 1;
  const occupied = new Uint8Array(nBuckets);

  for (const it of items) {
    if (!it.str || !it.str.trim()) continue;
    const x = it.transform[4];
    const w = it.width || 0;               // VERIFICAR: item.width existe no PDF.js 3.x
    const b0 = Math.max(0, Math.floor(x / BUCKET_PX));
    const b1 = Math.min(nBuckets - 1, Math.ceil((x + w) / BUCKET_PX));
    for (let b = b0; b <= b1; b++) occupied[b] = 1;
  }

  const minGapBuckets = Math.max(2, Math.round((pageWidth * MIN_GAP_RATIO) / BUCKET_PX));
  const edgeBuckets   = Math.round((pageWidth * EDGE_MARGIN_RATIO) / BUCKET_PX);

  // Coleta as "valas" (sequências de buckets vazios) fora das margens
  const gaps = [];
  let run = 0;
  for (let b = 0; b <= nBuckets; b++) {
    const isOccupied = b < nBuckets ? occupied[b] : 1;
    if (!isOccupied) { run++; continue; }
    if (run >= minGapBuckets) {
      const gStart = b - run;
      const gEnd   = b - 1;
      if (gStart > edgeBuckets && gEnd < nBuckets - edgeBuckets) {
        gaps.push({ center: ((gStart + gEnd) / 2) * BUCKET_PX, width: run * BUCKET_PX });
      }
    }
    run = 0;
  }

  if (!gaps.length) return ALL;

  // Mantém apenas as valas mais largas (as colunas de verdade)
  const cuts = gaps
    .sort((a, b) => b.width - a.width)
    .slice(0, MAX_COLUMNS - 1)
    .map(g => g.center)
    .sort((a, b) => a - b);

  const bands = [];
  let prev = -Infinity;
  for (const c of cuts) { bands.push({ x0: prev, x1: c }); prev = c; }
  bands.push({ x0: prev, x1: Infinity });

  // Descarta faixas com poucos itens (ruído: régua, rodapé, código de barras)
  const counted = bands.map(band => ({
    band,
    n: items.filter(it => it.str?.trim() && it.transform[4] >= band.x0 && it.transform[4] < band.x1).length,
  }));
  const kept = counted.filter(c => c.n >= MIN_ITEMS_PER_COL).map(c => c.band);
  if (kept.length < 2) return ALL;

  // Recola os limites para não perder itens que caíam nas faixas descartadas
  for (let i = 0; i < kept.length; i++) {
    kept[i].x0 = i === 0 ? -Infinity : kept[i - 1].x1;
    if (i === kept.length - 1) kept[i].x1 = Infinity;
  }
  return kept;
}

/**
 * Reconstrói as linhas de texto de uma faixa de X, de cima para baixo.
 * @returns {string[]}
 */
export function linesOfBand(items, band) {
  const inBand = items.filter(it =>
    it.str?.trim() && it.transform[4] >= band.x0 && it.transform[4] < band.x1
  );
  if (!inBand.length) return [];

  const byY = new Map();
  for (const it of inBand) {
    const key = Math.round(it.transform[5] / Y_TOL_PX) * Y_TOL_PX;
    if (!byY.has(key)) byY.set(key, []);
    byY.get(key).push({ x: it.transform[4], text: it.str });
  }

  return [...byY.entries()]
    .sort((a, b) => b[0] - a[0])                 // Y maior = mais alto na página
    .map(([, cells]) => cells
      .sort((a, b) => a.x - b.x)
      .map(c => c.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim())
    .filter(Boolean);
}

/**
 * Extrai o layout de uma página já segmentado por coluna.
 * @param {object} page objeto de página do PDF.js
 * @returns {Promise<{pageNumber:number, columns: Array<{band:object, lines:string[]}>}>}
 */
export async function extractPageLayout(page) {
  const viewport = page.getViewport({ scale: 1 });
  const content  = await page.getTextContent();
  const bands    = detectColumnBands(content.items, viewport.width);
  return {
    pageNumber: page.pageNumber,
    columns: bands.map(band => ({ band, lines: linesOfBand(content.items, band) })),
  };
}

/**
 * Percorre o documento inteiro e devolve os fluxos de linha por coluna,
 * na ordem de leitura (página 1 col. esq. → página 1 col. dir. → página 2 ...).
 * @returns {Promise<Array<{page:number, column:number, lines:string[]}>>}
 */
export async function extractColumnStreams(pdf) {
  const streams = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page   = await pdf.getPage(i);
    const layout = await extractPageLayout(page);
    layout.columns.forEach((col, idx) => {
      if (col.lines.length) streams.push({ page: i, column: idx, lines: col.lines });
    });
  }
  return streams;
}

/**
 * Diagnóstico: dump cru de X/Y/largura de uma página, para calibrar os
 * parâmetros acima contra uma fatura real. Use no console:
 *   const pdf = await pdfjsLib.getDocument({data}).promise;
 *   console.table(await dumpPageItems(await pdf.getPage(2)));
 */
export async function dumpPageItems(page) {
  const viewport = page.getViewport({ scale: 1 });
  const content  = await page.getTextContent();
  return content.items
    .filter(it => it.str?.trim())
    .map(it => ({
      x: Math.round(it.transform[4]),
      y: Math.round(it.transform[5]),
      w: Math.round(it.width || 0),
      pageWidth: Math.round(viewport.width),
      str: it.str,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
}
