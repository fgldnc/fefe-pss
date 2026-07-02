/**
 * ofx-parser.js — Parser OFX/SGML e OFX/XML
 *
 * Itaú e maioria dos bancos BR usam OFX SGML (legado):
 *   - Cabeçalho "OFXHEADER:100"
 *   - Tags sem fechamento: <MEMO>texto (sem </MEMO>)
 *   - DTPOSTED com timezone: 20260504100000[-03:EST]
 *
 * Alguns exportadores modernos usam XML puro (<?xml ...>)
 */

import { parseMoney, parseDate, normalizeDesc, autoClassify, genId } from './base-parser.js';

export function parseOFX(content, bankName = 'Desconhecido', userRules = []) {
  // Detecta formato pelo cabeçalho, NÃO pela presença de <OFX>
  // SGML legado sempre começa com "OFXHEADER:" antes do bloco <OFX>
  const isSgml = /^OFXHEADER:/m.test(content);
  const isXml  = !isSgml && content.trim().startsWith('<?xml');

  const raw = isSgml ? _parseSgml(content)
            : isXml  ? _parseXml(content)
            : _parseSgml(content); // fallback: tenta SGML

  if (!raw.length) return [];

  const batchId = genId();
  const results = [];

  for (const tx of raw) {
    const amount = parseMoney(tx.amount);
    const date   = _parseOFXDate(tx.date);

    if (!date || amount === 0) continue;

    const desc     = (tx.memo || tx.name || 'Sem descrição').trim();
    const normDesc = normalizeDesc(desc);

    // TRNTYPE define direção: CREDIT = entrada, DEBIT/outros = saída
    const trntype   = (tx.trntype || '').toUpperCase();
    const isCredit  = trntype === 'CREDIT' || trntype === 'DEP' || trntype === 'INT' || trntype === 'DIV';
    const finalType = isCredit ? 'income' : 'expense';

    // Auto-classifica para refinar categoria. O TRNTYPE define income/expense,
    // mas regras que classificam como 'transfer' (ex: pagamento de fatura) prevalecem.
    const cls = autoClassify(desc, Math.abs(amount), userRules);
    const category  = cls.category;
    const finalType2 = cls.type === 'transfer' ? 'transfer' : finalType;

    results.push({
      id:                    genId(),
      bankName,
      date,
      description:           desc,
      normalizedDescription: normDesc,
      amount:                Math.abs(amount),
      type:                  finalType2,
      category:              category || (finalType2 === 'income' ? null : 'outros'),
      source:                'statement_import',
      fileType:              'ofx',
      importBatchId:         batchId,
      isReviewed:            false,
      isDuplicate:           false,
      notes:                 '',
      fitid:                 tx.fitid || null,
    });
  }

  return results;
}

// ─── SGML parser ─────────────────────────────────────────────
// OFX SGML: tags sem fechamento, cada campo em linha própria
// Ex:  <TRNTYPE>DEBIT
//      <DTPOSTED>20260504100000[-03:EST]
//      <TRNAMT>-29.43
//      <MEMO>PIX QRS 99 FOOD02 05
function _parseSgml(content) {
  const results = [];

  // Separa o cabeçalho HTTP-like do corpo XML-like
  // O corpo começa depois da linha em branco após o cabeçalho
  const bodyMatch = content.match(/\n\s*\n([\s\S]+)/);
  const body = bodyMatch ? bodyMatch[1] : content;

  // Encontra todos os blocos STMTTRN
  // No SGML legado, o bloco pode ou não ter </STMTTRN>
  // Estratégia: split por <STMTTRN> e pega tudo até o próximo <STMTTRN> ou </BANKTRANLIST>
  const parts = body.split(/<STMTTRN>/i);
  parts.shift(); // descarta tudo antes do primeiro <STMTTRN>

  for (const part of parts) {
    // Pega conteúdo até o fechamento (com ou sem tag de fechamento)
    const block = part.split(/<\/STMTTRN>|<STMTTRN>|<\/BANKTRANLIST>/i)[0];

    const get = (tag) => {
      // Captura valor após <TAG> até fim da linha (ignora timezone e espaços)
      const m = block.match(new RegExp(`<${tag}>([^\\r\\n<]+)`, 'i'));
      return m ? m[1].trim() : null;
    };

    const trntype = get('TRNTYPE');
    const date    = get('DTPOSTED');
    const amount  = get('TRNAMT');
    const fitid   = get('FITID');
    const memo    = get('MEMO');
    const name    = get('NAME');

    if (!amount || !date) continue;

    results.push({ trntype, date, amount, fitid, memo, name });
  }

  return results;
}

// ─── XML parser ──────────────────────────────────────────────
function _parseXml(content) {
  const results = [];
  try {
    const doc   = new DOMParser().parseFromString(content, 'text/xml');
    const nodes = doc.querySelectorAll('STMTTRN');
    nodes.forEach(node => {
      const get = tag => node.querySelector(tag)?.textContent?.trim() || null;
      results.push({
        trntype: get('TRNTYPE'),
        date:    get('DTPOSTED'),
        amount:  get('TRNAMT'),
        fitid:   get('FITID'),
        memo:    get('MEMO'),
        name:    get('NAME'),
      });
    });
  } catch (e) {
    console.warn('OFX XML parse error:', e);
  }
  return results;
}

// ─── Date parser específico para OFX ────────────────────────
// Formatos: "20260504100000[-03:EST]" ou "20260504" ou "20260504100000"
function _parseOFXDate(raw) {
  if (!raw) return null;
  // Pega só os primeiros 8 dígitos: YYYYMMDD
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  const y = digits.slice(0, 4);
  const m = digits.slice(4, 6);
  const d = digits.slice(6, 8);
  // Valida
  if (parseInt(m) < 1 || parseInt(m) > 12) return null;
  if (parseInt(d) < 1 || parseInt(d) > 31) return null;
  return `${y}-${m}-${d}`;
}
