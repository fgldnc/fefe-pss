/**
 * csv-parser.js — Parser CSV com mapeamento por banco
 */

import { parseMoney, parseDate, normalizeDesc, autoClassify, genId } from './base-parser.js';

// Mapeamento de colunas por banco
const BANK_SCHEMAS = {
  nubank: {
    // "Data","Categoria","Título","Valor"
    date:        ['Data', 'data', 'Date'],
    description: ['Título', 'Titulo', 'title', 'description', 'Descrição', 'Descricao'],
    amount:      ['Valor', 'valor', 'amount', 'Value'],
    type:        null, // Nubank: valor positivo = despesa (cartão)
  },
  itau: {
    // Data;Lançamento;Valor
    date:        ['Data', 'data'],
    description: ['Lançamento', 'Lancamento', 'Histórico', 'Historico'],
    amount:      ['Valor', 'valor'],
    type:        null,
    separator:   ';',
  },
  inter: {
    // Data Entrada;Data Saída;Histórico;Valor Entrada;Valor Saída;Saldo
    date:        ['Data Entrada', 'Data', 'data'],
    description: ['Histórico', 'Historico', 'Descrição'],
    amountIn:    ['Valor Entrada', 'Crédito', 'Credito'],
    amountOut:   ['Valor Saída', 'Saida', 'Débito', 'Debito'],
    separator:   ';',
  },
  santander: {
    date:        ['Data', 'data'],
    description: ['Descrição', 'Descricao', 'Histórico'],
    amount:      ['Valor', 'valor'],
    separator:   ';',
  },
  bradesco: {
    date:        ['Data Lançamento', 'Data', 'data'],
    description: ['Histórico', 'Lancamento'],
    amount:      ['Valor (R$)', 'Valor'],
    separator:   ';',
  },
  generico: {
    date:        ['Data', 'Date', 'data', 'dt', 'DT'],
    description: ['Descrição', 'Descricao', 'Histórico', 'Description', 'Memo', 'Name'],
    amount:      ['Valor', 'Amount', 'Value', 'Quantia'],
    type:        null,
  },
};

/**
 * Parseia CSV e retorna transações normalizadas
 */
export function parseCSV(content, bankName = 'generico', userRules = []) {
  const schema    = BANK_SCHEMAS[bankName] || BANK_SCHEMAS.generico;
  const sep       = schema.separator || _detectSeparator(content);
  const lines     = content.split(/\r?\n/).filter(l => l.trim());

  if (lines.length < 2) return [];

  // Pula linhas de cabeçalho do banco (Itaú tem várias linhas de info antes do header)
  const headerIdx = _findHeaderLine(lines, sep);
  if (headerIdx < 0) return [];

  const headers   = _parseRow(lines[headerIdx], sep).map(h => h.trim());
  const batchId   = genId();
  const results   = [];

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const cols = _parseRow(line, sep);
    const row  = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] || '').trim(); });

    // Extrai data
    const dateRaw = _pick(row, schema.date || []);
    const date    = parseDate(dateRaw);
    if (!date) continue;

    // Extrai descrição
    const desc = _pick(row, schema.description || []) || 'Sem descrição';

    // Extrai valor
    let amount = 0;
    let type   = 'expense';

    if (schema.amountIn && schema.amountOut) {
      // Banco Inter: colunas separadas para entrada e saída
      const inVal  = parseMoney(_pick(row, schema.amountIn  || []));
      const outVal = parseMoney(_pick(row, schema.amountOut || []));
      if (inVal > 0)  { amount = inVal;  type = 'income'; }
      if (outVal > 0) { amount = outVal; type = 'expense'; }
    } else {
      const raw = _pick(row, schema.amount || []);
      amount    = parseMoney(raw);

      // Valor negativo → saída (despesa)
      if (amount < 0) { type = 'expense'; amount = Math.abs(amount); }
      else if (amount > 0) {
        // Nubank cartão: positivo = despesa
        type = bankName === 'nubank' ? 'expense' : 'income';
      }
    }

    if (amount === 0) continue;

    const { type: inferredType, category } = autoClassify(desc, amount, userRules);
    const finalType = type || inferredType;

    results.push({
      id:                    genId(),
      bankName,
      date,
      description:           desc,
      normalizedDescription: normalizeDesc(desc),
      amount,
      type:                  finalType,
      category:              category || (finalType === 'income' ? null : 'outros'),
      source:                'statement_import',
      fileType:              'csv',
      importBatchId:         batchId,
      isReviewed:            false,
      isDuplicate:           false,
      notes:                 '',
    });
  }

  return results;
}

// ─── HELPERS ─────────────────────────────────────────────────
function _detectSeparator(content) {
  const firstLine = content.split(/\r?\n/)[0];
  const commas    = (firstLine.match(/,/g) || []).length;
  const semicolons= (firstLine.match(/;/g) || []).length;
  return semicolons >= commas ? ';' : ',';
}

function _parseRow(line, sep) {
  const result = [];
  let current  = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === sep && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function _pick(row, candidates) {
  for (const key of candidates) {
    if (row[key] !== undefined && row[key] !== '') return row[key];
  }
  return null;
}

function _findHeaderLine(lines, sep) {
  const dateWords = ['data', 'date', 'dt'];
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const lower = lines[i].toLowerCase();
    if (dateWords.some(w => lower.includes(w))) return i;
  }
  return 0;
}
