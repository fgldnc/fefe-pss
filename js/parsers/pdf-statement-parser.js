/**
 * pdf-statement-parser.js — Extrai transações de extratos bancários em PDF
 *
 * Diferente do pdf-import.js (fatura de cartão), este parser lida com
 * extratos de conta corrente/poupança que têm entradas E saídas.
 */

import { parseMoney, parseDate, normalizeDesc, autoClassify, genId } from './base-parser.js';

const PDF_MAX_BYTES = 20 * 1024 * 1024;

/**
 * Extrai transações de um extrato bancário em PDF
 */
export async function parsePDFStatement(file, bankName = 'generico', userRules = []) {
  if (file.size > PDF_MAX_BYTES) throw new Error('PDF excede 20 MB.');
  if (file.type !== 'application/pdf') throw new Error('Arquivo não é um PDF válido.');

  if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js não carregou.');

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let lines = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Agrupa por linha (Y coordenada)
    const byY = {};
    for (const item of content.items) {
      const y = Math.round(item.transform[5] / 2) * 2;
      byY[y] = (byY[y] || []);
      byY[y].push({ x: item.transform[4], text: item.str });
    }

    Object.keys(byY)
      .sort((a, b) => b - a)  // de cima para baixo
      .forEach(y => {
        const sorted = byY[y].sort((a, b) => a.x - b.x);
        const line   = sorted.map(s => s.text).join(' ').trim();
        if (line) lines.push(line);
      });
  }

  const fullText = lines.join('\n');

  // Tenta parser específico por banco
  const parser = BANK_PARSERS[bankName] || BANK_PARSERS.generico;
  return parser(lines, fullText, bankName, userRules);
}

// ─── PARSERS POR BANCO ────────────────────────────────────────
const BANK_PARSERS = {

  itau(lines, fullText, bankName, userRules) {
    const items = [];
    const batchId = genId();

    // Padrão Itaú extrato: "DD/MM/YYYY DESCRIÇÃO VALOR C/D"
    const re = /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d.,]+)\s*([CD])/;
    for (const line of lines) {
      const m = line.match(re);
      if (!m) continue;
      const date   = parseDate(m[1]);
      const desc   = m[2].trim();
      const amount = parseMoney(m[3]);
      const isIn   = m[4] === 'C'; // C = Crédito = entrada
      if (!date || amount === 0) continue;
      const { category } = autoClassify(desc, amount, userRules);
      items.push(_buildItem(date, desc, amount, isIn ? 'income' : 'expense', category, bankName, batchId));
    }
    return items;
  },

  nubank(lines, fullText, bankName, userRules) {
    return _genericParser(lines, bankName, userRules);
  },

  inter(lines, fullText, bankName, userRules) {
    const items = [];
    const batchId = genId();
    // Inter: "DD/MM/YYYY DESCRIÇÃO VALOR ENTRADA/SAÍDA"
    const re = /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d.,]+)/;
    for (const line of lines) {
      const m = line.match(re);
      if (!m) continue;
      const date   = parseDate(m[1]);
      const desc   = m[2].trim();
      const amount = parseMoney(m[3]);
      if (!date || amount === 0) continue;
      const lower  = line.toLowerCase();
      const isIn   = /entrada|crédito|credito|receb/.test(lower);
      const { category } = autoClassify(desc, amount, userRules);
      items.push(_buildItem(date, desc, amount, isIn ? 'income' : 'expense', category, bankName, batchId));
    }
    return items;
  },

  santander: _genericParser,
  bradesco:  _genericParser,
  generico:  _genericParser,
};

function _genericParser(lines, bankName, userRules) {
  if (typeof lines === 'string') {
    // chamado como banco-parser com fullText
    lines = lines.split('\n');
  }
  const items   = [];
  const batchId = genId();

  // Padrão genérico: linha com data + texto + valor
  const re = /(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})\s+(.{5,60}?)\s+([\d.,]+(?:,\d{2})?)\s*([CDcd]?)/;

  for (const line of lines) {
    const m = line.match(re);
    if (!m) continue;
    const date   = parseDate(m[1]);
    const desc   = m[2].trim();
    const amount = parseMoney(m[3]);
    if (!date || amount === 0 || desc.length < 3) continue;

    const marker = m[4]?.toUpperCase();
    const lower  = line.toLowerCase();
    let isIn     = marker === 'C' || /crédito|credito|entrada|receb/.test(lower);
    if (marker === 'D') isIn = false;

    const { category } = autoClassify(desc, amount, userRules);
    items.push(_buildItem(date, desc, amount, isIn ? 'income' : 'expense', category, bankName || 'generico', batchId));
  }

  return items;
}

function _buildItem(date, description, amount, type, category, bankName, batchId) {
  return {
    id:                    genId(),
    bankName,
    date,
    description,
    normalizedDescription: normalizeDesc(description),
    amount,
    type,
    category:              category || (type === 'income' ? null : 'outros'),
    source:                'statement_import',
    fileType:              'pdf',
    importBatchId:         batchId,
    isReviewed:            false,
    isDuplicate:           false,
    notes:                 '',
  };
}
