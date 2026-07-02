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
 * Detecta tipo (income/expense/transfer) e categoria a partir da descrição
 */
export function autoClassify(description, amount, userRules = []) {
  const desc = (description || '').toLowerCase();

  // Regras do usuário têm prioridade
  for (const rule of userRules) {
    try {
      if (new RegExp(rule.pattern, 'i').test(desc)) {
        return { type: rule.type || 'expense', category: rule.category || null };
      }
    } catch { /* padrão regex inválido — ignora a regra, não quebra a importação */ }
  }

  // Regras padrão
  for (const rule of DEFAULT_RULES) {
    if (rule.pattern.test(desc)) {
      return { type: rule.type, category: rule.category };
    }
  }

  // Por valor: se negativo → receita, positivo → despesa (padrão OFX)
  // Mas o parser já deve normalizar o sinal
  return { type: amount < 0 ? 'income' : 'expense', category: 'outros' };
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
 * Gera chave de deduplicação
 */
export function dedupKey(date, amount, normalizedDesc) {
  return `${date}|${Math.abs(amount).toFixed(2)}|${normalizedDesc.slice(0, 40)}`;
}

/**
 * Detecta duplicatas contra lista de transações existentes
 */
export function detectDuplicates(newItems, existingTransactions) {
  const existingKeys = new Set(
    existingTransactions.map(t =>
      dedupKey(t.date || '', t.amount || 0, normalizeDesc(t.description || ''))
    )
  );

  return newItems.map(item => {
    const key = dedupKey(item.date, item.amount, normalizeDesc(item.description));
    return { ...item, isDuplicate: existingKeys.has(key) };
  });
}

/**
 * Parseia valor monetário brasileiro ou americano
 */
export function parseMoney(raw) {
  if (!raw) return 0;
  const s = String(raw).trim().replace(/\s/g, '');
  // Formato BR: "1.234,56" OU "3200,56" (sem separador de milhar)
  if (/^\-?\d+(\.\d{3})*,\d{2}$/.test(s))
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return parseFloat(s.replace(/[^0-9.\-]/g, '')) || 0;
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
