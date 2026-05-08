/**
 * ofx-parser.js — Parser universal para arquivos OFX (Open Financial Exchange)
 * Suporta: Itaú, Nubank, Inter, Santander, Bradesco e OFX genérico
 */

import { parseMoney, parseDate, normalizeDesc, autoClassify, genId } from './base-parser.js';

/**
 * Parseia conteúdo OFX e retorna array de transações normalizadas
 * @param {string} content - texto do arquivo OFX
 * @param {string} bankName - nome do banco identificado
 * @param {Array}  userRules - regras de categorização do usuário
 */
export function parseOFX(content, bankName = 'Desconhecido', userRules = []) {
  const transactions = [];

  // Detecta se é OFX/SGML (legado) ou XML
  const isXml = content.trim().startsWith('<?xml') || content.includes('<OFX>');

  const stmttrns = isXml
    ? _parseXml(content)
    : _parseSgml(content);

  const batchId = genId();

  for (const tx of stmttrns) {
    const amount = typeof tx.amount === 'number' ? tx.amount : parseMoney(tx.amount);
    const date   = parseDate(tx.date);
    if (!date || amount === 0) continue;

    const desc       = (tx.name || tx.memo || 'Sem descrição').trim();
    const normDesc   = normalizeDesc(desc);
    const { type, category } = autoClassify(desc, amount, userRules);

    // No OFX: DEBIT = saída (expense), CREDIT = entrada (income)
    const finalType = tx.trntype
      ? (tx.trntype === 'CREDIT' || tx.trntype === 'DEP' || tx.trntype === 'INT' ? 'income' : 'expense')
      : type;

    transactions.push({
      id:                    genId(),
      bankName,
      date,
      description:           desc,
      normalizedDescription: normDesc,
      amount:                Math.abs(amount),
      type:                  finalType,
      category:              category || (finalType === 'income' ? null : 'outros'),
      source:                'statement_import',
      fileType:              'ofx',
      importBatchId:         batchId,
      isReviewed:            false,
      isDuplicate:           false,
      notes:                 '',
      fitid:                 tx.fitid || null,
    });
  }

  return transactions;
}

// ─── SGML parser (OFX legado) ─────────────────────────────────
function _parseSgml(content) {
  const transactions = [];
  // Extrai todos os blocos <STMTTRN>...</STMTTRN>
  const blocks = content.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];

  for (const block of blocks) {
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}>([^<\\n\\r]+)`, 'i'));
      return m ? m[1].trim() : null;
    };

    transactions.push({
      trntype: get('TRNTYPE'),
      date:    get('DTPOSTED'),
      amount:  get('TRNAMT'),
      fitid:   get('FITID'),
      name:    get('NAME'),
      memo:    get('MEMO'),
    });
  }

  return transactions;
}

// ─── XML parser (OFX moderno) ─────────────────────────────────
function _parseXml(content) {
  const transactions = [];
  try {
    const parser = new DOMParser();
    const doc    = parser.parseFromString(content, 'text/xml');
    const nodes  = doc.querySelectorAll('STMTTRN');

    nodes.forEach(node => {
      const get = (tag) => node.querySelector(tag)?.textContent?.trim() || null;
      transactions.push({
        trntype: get('TRNTYPE'),
        date:    get('DTPOSTED'),
        amount:  get('TRNAMT'),
        fitid:   get('FITID'),
        name:    get('NAME'),
        memo:    get('MEMO'),
      });
    });
  } catch (e) {
    console.warn('OFX XML parse error:', e);
  }
  return transactions;
}
