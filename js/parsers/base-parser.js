/**
 * base-parser.js — Utilitários compartilhados por todos os parsers de extrato
 */

// ─── CATEGORIZAÇÃO AUTOMÁTICA ─────────────────────────────────
const DEFAULT_RULES = [
  // Transferências internas — NÃO são gasto nem receita (evita dupla contagem
  // do pagamento de fatura quando fatura e extrato são importados juntos)
  { pattern: /pagamento\s+(de\s+)?fatura|pagto?\s*(de\s*)?(fatura|cart[aã]o)|pag\s*cart[aã]o|fatura\s+cart[aã]o/i, category: null, type: 'transfer' },
  { pattern: /aplica[cç][aã]o\s*(rdb|cdb|autom)|resgate\s*(rdb|autom)|transf(er[eê]ncia)?\s*(entre\s*contas|mesma\s*titular)/i, category: null, type: 'transfer' },
  { pattern: /ifood|rappi|uber\s*eat|delivery|restaura|padaria|lanchon|mercado|supermercado|hortifruti|açougue|panificadora/i, category: 'alimentacao', type: 'expense' },
  { pattern: /uber|99\s*pop|cabify|taxi|metrô|metro|ônibus|onibus|transfacil|passagem|estacion|combustivel|gasolina|etanol|posto/i, category: 'transporte', type: 'expense' },
  { pattern: /spotify|netflix|disney|prime video|hbo|globoplay|youtube|apple tv|deezer|twitch|steam|psn|xbox|google one|icloud/i, category: 'assinatura', type: 'expense' },
  { pattern: /farmácia|farmacia|droga|medic|consulta|exame|hospital|clínica|clinica|odonto|dentist|academia|smart fit|bluefit/i, category: 'saude', type: 'expense' },
  { pattern: /amazon|shopee|aliexpress|magalu|magazine|americanas|casas bahia|mercado livre|shein|renner|youcom|zara|c&a|riachuelo/i, category: 'compras', type: 'expense' },
  { pattern: /dell|apple|samsung|kabum|pichau|terabyte|notebook|tablet|celular|smartphone|iphone|positivo|multilaser/i, category: 'eletronicos', type: 'expense' },
  { pattern: /senac|udemy|curso|escola|faculdade|livro|amazon kindle|coursera|alura|dio\.|rocketseat/i, category: 'educacao', type: 'expense' },
  { pattern: /net|claro|vivo|tim|oi |sky|nextel|água|luz|energia|gas\b|aluguel|condomínio|condominio|internet|fibra|celular|plano/i, category: 'moradia', type: 'expense' },
  { pattern: /ticketmaster|sympla|ingresso|cinemark|kinoplex|show|festival|balada|bar\b|happy hour|festa/i, category: 'lazer', type: 'expense' },
  { pattern: /tesouro|lci|lca|cdb|ações|acoes|fii|fundo|investimento|previdência|previdencia|reserva|poupança|poupanca/i, category: 'investimento', type: 'expense' },
  { pattern: /salário|salario|folha|holerite|pgto\s*sal/i, category: 'salario', type: 'income' },
  { pattern: /pix\s*recebido|transferencia\s*recebida|ted\s*recebido|doc\s*recebido|receb|créd\b|cred\b/i, category: null, type: 'income' },
  { pattern: /estorno|devoluç|devoluc|reembolso|cashback|volta\s*valor/i, category: null, type: 'income' },
  { pattern: /saque|saque\s*caixa|saque\s*24h/i, category: 'outros', type: 'expense' },
  { pattern: /iof|juros|encargo|mora\b|multa\b|tarifa/i, category: 'encargos', type: 'expense' },
];

/**
 * Detecta tipo (income/expense/transfer) e categoria a partir da descrição.
 *
 * Devolve também `origin`, declarando COMO a decisão foi tomada:
 *   'user-rule'    — casou uma regra cadastrada pelo usuário
 *   'default-rule' — casou uma regra de DEFAULT_RULES
 *   'fallback'     — nada casou; o tipo veio só do sinal do valor
 *
 * Por que o fallback devolve `category: null` e não 'outros': "Outros" é uma
 * categoria legítima, que o usuário escolhe de propósito. Usá-la também como
 * "não sei" torna as duas situações indistinguíveis na tela e o chute entra na
 * base sem dar motivo de desconfiança. A partir daqui, categoria vazia significa
 * "o app não sabe".
 *
 * Uma regra pode casar e definir `category: null` de propósito (transferências,
 * receita genérica). Esse null NÃO é desconhecimento — a diferença entre os dois
 * nulls é lida pelo `origin`, nunca pela categoria.
 */
export function autoClassify(description, amount, userRules = []) {
  const desc = (description || '').toLowerCase();

  // Regras do usuário têm prioridade
  for (const rule of userRules) {
    try {
      if (new RegExp(rule.pattern, 'i').test(desc)) {
        return { type: rule.type || 'expense', category: rule.category || null, origin: 'user-rule' };
      }
    } catch { /* padrão regex inválido — ignora a regra, não quebra a importação */ }
  }

  // Regras padrão
  for (const rule of DEFAULT_RULES) {
    if (rule.pattern.test(desc)) {
      return { type: rule.type, category: rule.category, origin: 'default-rule' };
    }
  }

  // Por valor: se negativo → receita, positivo → despesa (padrão OFX)
  // Mas o parser já deve normalizar o sinal
  return { type: amount < 0 ? 'income' : 'expense', category: null, origin: 'fallback' };
}

/**
 * Normaliza a descrição: remove caracteres especiais, espaços duplos, trunca
 */
export function normalizeDesc(str) {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // remove acentos
    .replace(/[^a-zA-Z0-9 *\/\-\.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 100);
}

/**
 * Gera chave de deduplicação.
 * `type` entra na chave porque entrada e saída de mesmo valor/data/descrição são
 * um cenário real (transferência entre contas próprias) e não podem colidir.
 * O valor entra em CENTAVOS EXATOS. Antes era um bucket de 5 centavos, para
 * absorver arredondamento — mas as duas pontas vêm do mesmo dado do banco, não
 * há arredondamento a absorver, e o bucket só criava falso positivo: quem
 * recebe salário, VA e VT no mesmo dia tem três lançamentos de mesma data e
 * mesma descrição em que a ÚNICA diferença é o valor.
 * `type` é opcional para manter compatibilidade com chamadas antigas.
 */
export function dedupKey(date, amount, normalizedDesc, type = '') {
  const cents = (Math.abs(Math.round((Number(amount) || 0) * 100)) / 100).toFixed(2);
  return `${date}|${type}|${cents}|${normalizedDesc.slice(0, 40)}`;
}

/**
 * Detecta duplicatas contra lista de transações existentes.
 * Devolve também `duplicateOf` — o registro que bateu — para a tela de revisão
 * poder DIZER contra o quê bateu. Aviso sem evidência vira ruído: o usuário
 * não tem como julgar se é engano ou se o lançamento já está mesmo lá.
 */
export function detectDuplicates(newItems, existingTransactions) {
  const existing = new Map();
  for (const t of existingTransactions) {
    const k = dedupKey(t.date || '', t.amount || 0, normalizeDesc(t.description || ''), t.type || '');
    if (!existing.has(k)) existing.set(k, t);
  }

  return newItems.map(item => {
    const key = dedupKey(item.date, item.amount, normalizeDesc(item.description), item.type || '');
    const hit = existing.get(key);
    return {
      ...item,
      isDuplicate: !!hit,
      duplicateOf: hit ? { date: hit.date || '', amount: hit.amount || 0, description: hit.description || '' } : null,
    };
  });
}

/**
 * Parseia valor monetário brasileiro ou americano
 */
export function parseMoney(raw) {
  if (raw === null || raw === undefined || raw === '') return 0;

  let s = String(raw).trim().replace(/\s/g, '').replace(/^R\$/i, '');
  // Negativo por sinal OU por parênteses contábeis: "(1.234,56)"
  const negative = /^-/.test(s) || /^\(.*\)$/.test(s) || /-$/.test(s);
  s = s.replace(/[()]/g, '').replace(/[^0-9.,]/g, '');
  if (!s) return 0;

  const lastComma = s.lastIndexOf(',');
  const lastDot   = s.lastIndexOf('.');
  let normalized;

  if (lastComma > lastDot) {
    // Decimal é a vírgula (BR): "1.234,56" → 1234.56
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    const decimals = s.length - lastDot - 1;
    // "1.234" (3 casas depois do ponto, sem vírgula) em documento BR é
    // separador de MILHAR, não decimal. Antes virava 1.234 — erro de R$ 1.232,77
    // num lançamento de mil reais.
    normalized = (decimals === 3 && lastComma === -1)
      ? s.replace(/\./g, '')
      : s.replace(/,/g, '');
  } else {
    normalized = s; // só dígitos
  }

  const v = parseFloat(normalized);
  if (!isFinite(v)) return 0;
  return negative ? -Math.abs(v) : v;
}

/**
 * Parseia data em vários formatos → "YYYY-MM-DD"
 */
export function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  // YYYYMMDD
  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;

  // DD/MM/YYYY ou DD/MM/YY (com desambiguação de MM/DD americano)
  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (m1) {
    let [, dd, mm, yy] = m1;
    // Se "mês" > 12 e "dia" <= 12, o formato era MM/DD (americano) → inverte
    if (parseInt(mm) > 12 && parseInt(dd) <= 12) [dd, mm] = [mm, dd];
    const y = yy.length === 2 ? `20${yy}` : yy;
    if (parseInt(mm) < 1 || parseInt(mm) > 12) return null;
    return `${y}-${mm}-${dd}`;
  }

  // YYYY-MM-DD
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

  return null;
}

/**
 * Gera ID único para a transação
 */
export function genId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
