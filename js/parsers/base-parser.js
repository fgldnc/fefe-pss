const DEFAULT_RULES = [
  { pattern: /pagamento\s+(de\s+)?fatura|pagto?\s*(de\s*)?(fatura|cart[aã]o)|pag\s*cart[aã]o|fatura\\s+cart[aã]o/i, category: null, type: 'transfer' },
  { pattern: /aplica[cç][aã]o\\s*(rdb|cdb|autom)|resgate\\s*(rdb|autom)|transf(er[eê]ncia)?\\s*(entre\\s*contas|mesma\\s*titular)/i, category: null, type: 'transfer' },
  { pattern: /ifood|rappi|uber\s*eat|delivery|restaura|padaria|lanchon|mercado|supermercado|hortifruti|açougue|panificadora/i, category: 'alimentacao', type: 'expense' },
  { pattern: /uber|99\s*pop|cabify|taxi|metrô|metro|ônibus|onibus|transfacil|passagem|estacion|combustivel|gasolina|etanol|posto/i, category: 'transporte', type: 'expense' },
  { pattern: /spotify|netflix|disney|prime video|hbomax|crunchyroll|apple\s*bill|youtube\s*premium|google\s*storage|icloud|github/i, category: 'assinatura', type: 'expense' },
  { pattern: /drogaria|farmacia|medcam|hospital|clinica|unimed|pague\s*menos|raia|drogasil|pacheco|consulta|exame/i, category: 'saude', type: 'expense' },
  { pattern: /amazon|mercado\s*livre|shopee|aliexpress|shein|magalu|magazine|casas\s*bahia|loja|venda|shopping/i, category: 'compras', type: 'expense' },
  { pattern: /apple|samsung|kabum|pichau|terabyte|dell|eletr[oô]n|computador|celular|fone|mouse|teclado/i, category: 'eletronicos', type: 'expense' },
  { pattern: /faculdade|escola|curso|udemy|alura|hotmart|livraria|matricula|mensalidade/i, category: 'educacao', type: 'expense' },
  { pattern: /aluguel|condominio|iptu|celg|equatorial|copasa|cemig|sabesp|enel|light|net\s*combo|claro|vivo|oi\s*fibra/i, category: 'moradia', type: 'expense' },
  { pattern: /cinema|teatro|show|evento|ingresso|sympla|eventim|pub|bar\s+|churras|clube|viagem|hosped|airbnb|booking/i, category: 'lazer', type: 'expense' },
  { pattern: /tesouro|b3|clear|xp\s*invest|rico|nu\s*invest|inter\s*dtvm|corretora|ações|fii/i, category: 'investimento', type: 'expense' },
  { pattern: /renner|riachuelo|c&a|zara|nike|adidas|centauro|roupa|calcado|tenis|vestuario/i, category: 'vestuario', type: 'expense' },
  { pattern: /iof|tar\s*mens|anuidade|juros|multa|banco/i, category: 'encargos', type: 'expense' }
];

export function autoClassify(description, type = 'expense', userRules = []) {
  const desc = String(description || '').trim();
  if (!desc) return { category: 'outros', type };

  for (const r of userRules) {
    if (r.type && r.type !== type) continue;
    try {
      const rx = new RegExp(r.pattern, 'i');
      if (rx.test(desc)) return { category: r.category ? r.category.toLowerCase().trim() : null, type: r.type || type };
    } catch (e) {
      console.error('Erro na regra do usuário:', r.pattern, e);
    }
  }

  for (const r of DEFAULT_RULES) {
    if (r.pattern.test(desc)) {
      return { 
        category: r.category ? r.category.toLowerCase().trim() : null, 
        type: r.type || type 
      };
    }
  }

  return { category: 'outros', type };
}

export function normalizeDesc(raw) {
  if (!raw) return '';
  return String(raw)
    .replace(/\s+/g, ' ')
    .replace(/compra\s+com\s+cartao\s+de\s+(credito|debito)\s+/i, '')
    .replace(/pago\s+via\s+pix\s+(enviado|recebido)\s+/i, '')
    .replace(/transferencia\s+(enviada|recebida)\s+(pelo\s+pix\s+)?/i, '')
    .replace(/\d{2}\/\d{2}\s+\d{2}:\d{2}/g, '')
    .replace(/\s*-\s*$/, '')
    .trim();
}

export function genId() {
  return Math.random().toString(36).substring(2, 11);
}

export function findDuplicates(items, existingTransactions) {
  const existingKeys = new Set(
    existingTransactions.map(t => `${t.date}_${t.amount}_${normalizeDesc(t.description)}`)
  );
  return items.map(item => {
    const key = `${item.date}_${item.amount}_${normalizeDesc(item.description)}`;
    return { ...item, isDuplicate: existingKeys.has(key) };
  });
}

export function parseMoney(raw) {
  if (!raw) return 0;
  const s = String(raw).trim().replace(/\s/g, '');
  if (/^\-?\d+(\.\d{3})*,\d{2}$/.test(s))
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return parseFloat(s.replace(/[^0-9.\-]/g, '')) || 0;
}

export function parseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();

  if (/^\d{8}$/.test(s)) return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;

  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{2,4})$/);
  if (m1) {
    let [, dd, mm, yy] = m1;
    if (yy.length === 2) yy = '20' + yy;
    if (parseInt(mm, 10) > 12 && parseInt(dd, 10) <= 12) {
      const tmp = dd; dd = mm; mm = tmp;
    }
    return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const m2 = s.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;

  return null;
}