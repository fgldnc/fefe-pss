/**
 * csv-parser.js — Parser CSV com mapeamento específico por banco
 * Santander e Bradesco com lógica robusta
 */

import { parseMoney, parseDate, normalizeDesc, autoClassify, genId } from './base-parser.js';

const BANK_SCHEMAS = {
  nubank: {
    date:        ['Data', 'data'],
    description: ['Título', 'Titulo', 'title', 'Descrição'],
    amount:      ['Valor', 'valor'],
    separator:   ',',
    amountSign:  'nubank', // positivo = despesa no cartão
  },
  itau: {
    date:        ['Data', 'data'],
    description: ['Lançamento', 'Lancamento', 'Histórico', 'Historico'],
    amount:      ['Valor', 'valor'],
    separator:   ';',
    skipPatterns: [/^saldo/i, /^lançamentos/i, /^data/i],
  },
  inter: {
    date:        ['Data Entrada', 'Data', 'data'],
    description: ['Histórico', 'Historico', 'Descrição'],
    amountIn:    ['Valor Entrada', 'Crédito', 'Credito', 'Entrada'],
    amountOut:   ['Valor Saída', 'Saida', 'Débito', 'Debito', 'Saída'],
    separator:   ';',
  },
  santander: {
    // Santander extrato conta: "Data;Histórico;Valor;Saldo"
    // Santander fatura cartão:  "Data;Descrição;Parcela;Valor"
    date:        ['Data', 'DATA', 'data'],
    description: ['Histórico', 'Descrição', 'DESCRICAO', 'Descricao', 'HISTORICO'],
    amount:      ['Valor', 'VALOR', 'valor', 'Valor (R$)'],
    separator:   ';',
    skipPatterns: [/^saldo/i, /^SALDO/i, /^extrato/i, /cliente/i],
    signLogic: 'santander',
  },
  bradesco: {
    // Bradesco: "Data Lançamento;Lançamento;Crédito;Débito;Saldo"
    // Ou formato mais simples: "Data;Descrição;Valor"
    date:        ['Data Lançamento', 'Data Lancamento', 'Data', 'DATA'],
    description: ['Lançamento', 'Lancamento', 'Histórico', 'Descrição', 'DESCRICAO'],
    amountIn:    ['Crédito', 'Credito', 'CREDITO', 'Entrada', 'C'],
    amountOut:   ['Débito', 'Debito', 'DEBITO', 'Saída', 'D'],
    amount:      ['Valor', 'VALOR'],
    separator:   ';',
    skipPatterns: [/^saldo/i, /^total/i, /^data/i, /^---/],
    signLogic: 'bradesco',
  },
  generico: {
    date:        ['Data', 'Date', 'data', 'DT', 'dt'],
    description: ['Descrição', 'Descricao', 'Histórico', 'Description', 'Memo', 'Name', 'Lançamento'],
    amount:      ['Valor', 'Amount', 'Value', 'Quantia'],
    separator:   null, // auto-detect
  },
};

export function parseCSV(content, bankName = 'generico', userRules = []) {
  const schema  = BANK_SCHEMAS[bankName] || BANK_SCHEMAS.generico;
  const sep     = schema.separator || _detectSeparator(content);
  const lines   = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headerIdx = _findHeaderLine(lines, sep);
  if (headerIdx < 0) return [];

  const headers = _parseRow(lines[headerIdx], sep).map(h => h.trim().replace(/"/g, ''));
  const batchId = genId();
  const results = [];

  // Nubank: CSV da FATURA tem coluna "Título" (positivo = despesa);
  // CSV do EXTRATO da NuConta tem "Descrição" (negativo = saída) — sinais opostos.
  const nubankConta = bankName === 'nubank' && !headers.some(h => /t[ií]tulo|title/i.test(h));

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Pula linhas que correspondem a padrões a ignorar
    if (schema.skipPatterns?.some(p => p.test(line))) continue;

    const cols = _parseRow(line, sep);
    const row  = {};
    headers.forEach((h, idx) => { row[h] = (cols[idx] || '').trim().replace(/"/g, ''); });

    const dateRaw = _pick(row, schema.date || []);
    const date    = parseDate(dateRaw);
    if (!date) continue;

    const desc = _pick(row, schema.description || []) || 'Sem descrição';
    if (desc.length < 2) continue;

    let amount = 0;
    let type   = 'expense';

    // Bancos com colunas separadas entrada/saída (Inter, Bradesco formato longo)
    if (schema.amountIn && schema.amountOut) {
      const inRaw  = _pick(row, schema.amountIn  || []);
      const outRaw = _pick(row, schema.amountOut || []);
      const inVal  = inRaw  ? parseMoney(inRaw)  : 0;
      const outVal = outRaw ? parseMoney(outRaw) : 0;

      if (outVal > 0) { amount = outVal; type = 'expense'; }
      else if (inVal > 0) { amount = inVal; type = 'income'; }

      // Fallback: tenta coluna "Valor" se ambas forem zero
      if (amount === 0 && schema.amount) {
        const raw = _pick(row, schema.amount);
        if (raw) {
          amount = Math.abs(parseMoney(raw));
          type   = parseMoney(raw) < 0 ? 'expense' : 'income';
        }
      }
    } else {
      const raw  = _pick(row, schema.amount || []);
      const val  = parseMoney(raw || '0');
      amount     = Math.abs(val);

      if (schema.amountSign === 'nubank') {
        if (nubankConta) {
          // Extrato NuConta: negativo = saída, positivo = entrada
          type = val < 0 ? 'expense' : 'income';
        } else {
          // Fatura de cartão: positivo = despesa, negativo = estorno/pagamento
          type = val >= 0 ? 'expense' : 'income';
        }
      } else if (schema.signLogic === 'santander') {
        // Santander: valor negativo = débito (saída), positivo = crédito
        type = val < 0 ? 'expense' : 'income';
      } else if (schema.signLogic === 'bradesco') {
        type = val < 0 ? 'expense' : 'income';
      } else {
        type = val < 0 ? 'expense' : (val === 0 ? 'expense' : 'income');
      }
    }

    if (amount === 0) continue;

    const cls = autoClassify(desc, amount, userRules);
    const category = cls.category;
    // Regras podem forçar 'transfer' (ex: pagamento de fatura) — evita dupla contagem
    if (cls.type === 'transfer') type = 'transfer';

    results.push({
      id:                    genId(),
      bankName,
      date,
      description:           desc,
      normalizedDescription: normalizeDesc(desc),
      amount,
      type,
      category:              category || (type === 'income' ? null : 'outros'),
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

function _detectSeparator(content) {
  const line = content.split(/\r?\n/)[0];
  const semicolons = (line.match(/;/g) || []).length;
  const commas     = (line.match(/,/g) || []).length;
  const tabs       = (line.match(/\t/g) || []).length;
  if (tabs > semicolons && tabs > commas) return '\t';
  return semicolons >= commas ? ';' : ',';
}

function _parseRow(line, sep) {
  const result = [];
  let current  = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === sep && !inQuotes) { result.push(current); current = ''; continue; }
    current += ch;
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
  // NÃO aplica skipPatterns aqui: eles são para linhas de DADOS.
  // O header do Itaú/Bradesco começa com "Data..." e seria pulado
  // pelo /^data/i, quebrando arquivos com linhas de metadata antes do header.
  const dateWords = ['data', 'date', 'dt', 'fecha'];
  for (let i = 0; i < Math.min(lines.length, 25); i++) {
    const lower = lines[i].toLowerCase();
    // Header precisa ter uma palavra de data E o separador (evita pegar título solto)
    if (dateWords.some(w => lower.includes(w)) && lines[i].includes(sep)) return i;
  }
  return 0; // fallback: assume primeira linha
}
