/**
 * db.js — Firestore: leitura e escrita de todas as coleções
 *
 * Coleções (sob users/{uid}/):
 *   transactions, incomes, budgets, assets, goals, categories, settings
 */

import { state, resolveCategoryId } from './utils.js';
import { getUid } from './auth.js';

// ─── CATEGORIAS PADRÃO ─────────────────────────────────────────────────────
export const DEFAULT_CATEGORIES = [
  { name: 'Alimentação',  color: '#34d399', order: 1 },
  { name: 'Transporte',   color: '#60a5fa', order: 2 },
  { name: 'Compras',      color: '#f472b6', order: 3 },
  { name: 'Eletrônicos',  color: '#a78bfa', order: 4 },
  { name: 'Educação',     color: '#fbbf24', order: 5 },
  { name: 'Vestuário',    color: '#fb923c', order: 6 },
  { name: 'Assinaturas',  color: '#22d3ee', order: 7 },
  { name: 'Lazer',        color: '#f87171', order: 8 },
  { name: 'Moradia',      color: '#6ee7b7', order: 9 },
  { name: 'Saúde',        color: '#86efac', order: 10 },
  { name: 'Investimento', color: '#fbbf24', order: 11 },
  { name: 'Outros',       color: '#94a3b8', order: 12 },
];

// ─── HELPERS FIRESTORE ─────────────────────────────────────────────────────

function fb() { return window._FB; }

function colRef(colName) {
  const uid = getUid();
  const { db, collection, doc } = fb();
  return collection(doc(collection(db, 'users'), uid), colName);
}

function docRef(colName, id) {
  const uid = getUid();
  const { db, collection, doc } = fb();
  return doc(collection(doc(collection(db, 'users'), uid), colName), id);
}

/** Lê todos os documentos de uma coleção */
async function getAll(colName) {
  const { getDocs } = fb();
  const snap = await getDocs(colRef(colName));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/** Salva (upsert) um documento com ID auto-gerado ou fornecido */
export async function saveDoc(colName, data, id = null) {
  const { addDoc, setDoc } = fb();
  if (id) {
    await setDoc(docRef(colName, id), data, { merge: true });
    return id;
  } else {
    const ref = await addDoc(colRef(colName), data);
    return ref.id;
  }
}

/** Remove um documento */
export async function removeDoc(colName, id) {
  const { deleteDoc } = fb();
  await deleteDoc(docRef(colName, id));
}

/** Atualiza campos específicos de um documento */
export async function updateFields(colName, id, fields) {
  const { updateDoc } = fb();
  await updateDoc(docRef(colName, id), fields);
}

// ─── CARGA GLOBAL ──────────────────────────────────────────────────────────

/** Carrega todos os dados do Firestore no state global */
export async function loadAllData() {
  const [transactions, incomes, budgetDocs, assets, goals, categories, rules] = await Promise.all([
    getAll('transactions'),
    getAll('incomes'),
    getAll('budgets'),
    getAll('assets'),
    getAll('goals'),
    getAll('categories'),
    getAll('rules').catch(() => []),
  ]);

  // Separa extratos bancários das transações normais
  state.extratoTransactions = transactions.filter(t => t.source === 'statement_import');
  state.transactions        = transactions.filter(t => t.source !== 'statement_import');
  state.incomes             = incomes;
  state.assets              = assets;
  state.goals               = goals;
  state.importRules         = rules;

  // Categorias: semeio padrão apenas se vazio; caso contrário deduplica por nome
  if (categories.length === 0) {
    await seedCategories();
    state.categories = await getAll('categories');
  } else {
    const seen = new Set();
    const deduped = categories.filter(c => {
      const key = (c.name || '').toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    state.categories = deduped.sort((a, b) => (a.order || 0) - (b.order || 0));
  }

  // Budgets: transforma array em mapa { "YYYY-MM": { categoryId: amount } }
  // Normaliza chave "YYYY-M" (sem zero à esquerda) → "YYYY-MM"
  state.budgets = {};
  for (const b of budgetDocs) {
    let month = b.month || '';
    if (/^\d{4}-\d$/.test(month)) month = month.replace(/-(\d)$/, '-0$1');
    state.budgets[month] = state.budgets[month] || {};
    state.budgets[month][b.categoryId] = b.amount;
  }
}

/** Popula categorias padrão no Firestore */
async function seedCategories() {
  const { addDoc } = fb();
  for (const cat of DEFAULT_CATEGORIES) {
    await addDoc(colRef('categories'), cat);
  }
}

// ─── TRANSACTIONS ──────────────────────────────────────────────────────────

/** Retorna transações do mês de competência */
export function txOfMonth(month) {
  return state.transactions.filter(t => t.competenceMonth === month);
}

/**
 * Retorna TODAS as despesas do mês para fins de dashboard/relatórios:
 * transações normais (cartão/manual) + despesas vindas de extrato bancário.
 * Normaliza os campos do extrato (date/category/type) para o formato
 * usado pelo resto do app (competenceMonth/categoryId/amount), sem alterar
 * os dados originais no Firestore — a normalização é só para leitura.
 */
export function allExpensesOfMonth(month) {
  const normais = state.transactions.filter(t => t.competenceMonth === month);

  const doExtrato = (state.extratoTransactions || [])
    .filter(t => t.type === 'expense' && (t.date || '').slice(0, 7) === month)
    .map(t => ({
      ...t,
      // Resolve slug do parser ('alimentacao'...) → ID real da categoria do usuário.
      // Sem isso, todo gasto de extrato caía em "Outros" nos gráficos.
      categoryId: t.categoryId || resolveCategoryId(t.category) || t.category || '',
      competenceMonth: month,
      paymentType: t.paymentType || 'extrato',
    }));

  return [...normais, ...doExtrato];
}

/** Retorna transações que são parcelas projetadas para meses futuros */
export function projectedInstallments(fromMonth) {
  return state.transactions.filter(t =>
    t.isProjected && t.competenceMonth > fromMonth
  );
}

/** Salva transação no Firestore e atualiza state */
export async function saveTx(data, id = null) {
  const savedId = await saveDoc('transactions', data, id);
  if (id) {
    const idx = state.transactions.findIndex(t => t.id === id);
    if (idx >= 0) state.transactions[idx] = { id, ...data };
  } else {
    state.transactions.push({ id: savedId, ...data });
  }
  return savedId;
}

/** Remove transação */
export async function deleteTx(id) {
  await removeDoc('transactions', id);
  state.transactions = state.transactions.filter(t => t.id !== id);
}

// ─── INCOMES ───────────────────────────────────────────────────────────────

export function incomesOfMonth(month) {
  // Critério unificado: 'month' explícito vence; sem 'month', aceita
  // competenceMonth ou o mês da data. Nunca conta a mesma receita duas vezes.
  return state.incomes.filter(i =>
    i.month === month ||
    (!i.month && (i.competenceMonth === month || (i.date || '').slice(0, 7) === month))
  );
}

export async function saveIncome(data, id = null) {
  const savedId = await saveDoc('incomes', data, id);
  if (id) {
    const idx = state.incomes.findIndex(i => i.id === id);
    if (idx >= 0) state.incomes[idx] = { id, ...data };
  } else {
    state.incomes.push({ id: savedId, ...data });
  }
  return savedId;
}

export async function deleteIncome(id) {
  await removeDoc('incomes', id);
  state.incomes = state.incomes.filter(i => i.id !== id);
}

// ─── BUDGETS ───────────────────────────────────────────────────────────────

/** Salva todos os orçamentos de um mês (batch) */
export async function saveBudgets(month, budgetMap) {
  const { getDocs, deleteDoc, addDoc } = fb();

  // Remove orçamentos antigos do mês
  const existing = await getAll('budgets');
  const toDelete = existing.filter(b => b.month === month);
  for (const b of toDelete) {
    await removeDoc('budgets', b.id);
  }

  // Insere novos
  for (const [categoryId, amount] of Object.entries(budgetMap)) {
    if (amount > 0) {
      await saveDoc('budgets', { month, categoryId, amount: Number(amount) });
    }
  }

  // Atualiza state
  state.budgets[month] = budgetMap;
}

// ─── ASSETS ────────────────────────────────────────────────────────────────

export async function saveAsset(data, id = null) {
  const savedId = await saveDoc('assets', data, id);
  if (id) {
    const idx = state.assets.findIndex(a => a.id === id);
    if (idx >= 0) state.assets[idx] = { id, ...data };
  } else {
    state.assets.push({ id: savedId, ...data });
  }
  return savedId;
}

export async function deleteAsset(id) {
  await removeDoc('assets', id);
  state.assets = state.assets.filter(a => a.id !== id);
}

// ─── GOALS ─────────────────────────────────────────────────────────────────

export async function saveGoal(data, id = null) {
  const savedId = await saveDoc('goals', data, id);
  if (id) {
    const idx = state.goals.findIndex(g => g.id === id);
    if (idx >= 0) state.goals[idx] = { id, ...data };
  } else {
    state.goals.push({ id: savedId, ...data });
  }
  return savedId;
}

export async function deleteGoal(id) {
  await removeDoc('goals', id);
  state.goals = state.goals.filter(g => g.id !== id);
}

// ─── CATEGORIES ────────────────────────────────────────────────────────────

export async function saveCategory(data, id = null) {
  const savedId = await saveDoc('categories', data, id);
  if (id) {
    const idx = state.categories.findIndex(c => c.id === id);
    if (idx >= 0) state.categories[idx] = { id, ...data };
  } else {
    state.categories.push({ id: savedId, ...data });
  }
  return savedId;
}

export async function deleteCategory(id) {
  await removeDoc('categories', id);
  state.categories = state.categories.filter(c => c.id !== id);
}

// ─── BACKUP ────────────────────────────────────────────────────────────────

/** Exporta todos os dados como JSON e faz download */
// ─── LIMPAR COLEÇÃO ────────────────────────────────────────────────────────
// Apaga TODOS os documentos de uma coleção do usuário (ex: antes de reimportar backup).
// Usa writeBatch para eficiência — Firestore limita a 500 operações por batch,
// então divide em lotes se necessário.
const WIPABLE_COLLECTIONS = ['transactions', 'incomes', 'budgets', 'assets', 'goals'];

export async function wipeCollection(colName) {
  if (!WIPABLE_COLLECTIONS.includes(colName)) {
    throw new Error(`Coleção "${colName}" não pode ser limpa por aqui.`);
  }

  const { db, collection, getDocs, writeBatch, doc } = fb();
  const uid = getUid();
  if (!uid) throw new Error('Não autenticado.');

  const colRef = collection(db, `users/${uid}/${colName}`);
  const snap   = await getDocs(colRef);

  if (snap.empty) return 0;

  const docs = snap.docs;
  let deleted = 0;

  // Processa em lotes de até 450 (margem de segurança sob o limite de 500 do Firestore)
  for (let i = 0; i < docs.length; i += 450) {
    const chunk = docs.slice(i, i + 450);
    const batch = writeBatch(db);
    for (const d of chunk) {
      batch.delete(doc(db, `users/${uid}/${colName}`, d.id));
    }
    await batch.commit();
    deleted += chunk.length;
  }

  // Limpa o state local também
  if (colName === 'transactions') {
    state.transactions = [];
    state.extratoTransactions = [];
  } else if (colName === 'incomes') {
    state.incomes = [];
  } else if (colName === 'budgets') {
    state.budgets = {};
  } else if (colName === 'assets') {
    state.assets = [];
  } else if (colName === 'goals') {
    state.goals = [];
  }

  return deleted;
}

export async function exportBackup(version) {
  const [transactions, incomes, budgets, assets, goals, categories, rules] = await Promise.all([
    getAll('transactions'),
    getAll('incomes'),
    getAll('budgets'),
    getAll('assets'),
    getAll('goals'),
    getAll('categories'),
    getAll('rules').catch(() => []),
  ]);

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // "2025-04-30"
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, ''); // "143022"

  const payload = {
    meta: {
      version:   version || '1.0.0',
      exportedAt: now.toISOString(),
      exportedBy: window._FB?.auth?.currentUser?.email || 'unknown',
      app: 'Radar Financeiro',
    },
    data: { transactions, incomes, budgets, assets, goals, categories, rules },
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `financas-backup-v${version || '1.0.0'}-${dateStr}-${timeStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── VALIDAÇÃO DO BACKUP ──────────────────────────────────────────────────
const BACKUP_MAX_BYTES  = 50 * 1024 * 1024; // 50 MB
const ALLOWED_COL_NAMES = ['transactions','incomes','budgets','assets','goals','categories','rules'];
function _validateBackupPayload(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('Arquivo inválido.');

  // Bloqueia prototype pollution de forma correta:
  // usa hasOwnProperty para checar APENAS propriedades próprias, não herdadas
  // (todo objeto JS tem 'constructor' herdado do prototype — não é sinal de ataque)
  if (Object.prototype.hasOwnProperty.call(payload, '__proto__') ||
      Object.prototype.hasOwnProperty.call(payload, 'prototype'))
    throw new Error('Payload suspeito bloqueado.');

  // Aceita formato { meta, transactions, incomes, ... } OU { data: { ... } }
  const data = (payload.transactions || payload.incomes || payload.categories)
    ? payload
    : (payload.data || payload);

  if (!data || typeof data !== 'object') throw new Error('Estrutura de backup não reconhecida.');

  for (const col of ALLOWED_COL_NAMES) {
    const items = data[col];
    if (items === undefined) continue;
    if (!Array.isArray(items)) throw new Error(`Campo "${col}" deve ser um array.`);
    if (items.length > 50000) throw new Error(`Array "${col}" excede o limite permitido.`);
    for (const item of items) {
      if (typeof item !== 'object' || item === null) throw new Error(`Item inválido em "${col}".`);
      if (Object.prototype.hasOwnProperty.call(item, '__proto__')) throw new Error('Item suspeito bloqueado.');
      // Valida campos de transação
      if (col === 'transactions') {
        // Aceita negativos — estornos e cancelamentos têm amount < 0
        if (typeof item.amount !== 'number' || Math.abs(item.amount) > 10_000_000)
          throw new Error('Valor de transação fora do intervalo permitido.');
        if (item.description && typeof item.description !== 'string')
          throw new Error('Descrição inválida.');
        if (item.description && item.description.length > 500)
          throw new Error('Descrição muito longa.');
      }
    }
  }
  return data;
}

/** Importa backup JSON e restaura dados no Firestore */
export async function importBackup(file) {
  // Valida tamanho do arquivo
  if (file.size > BACKUP_MAX_BYTES)
    throw new Error('Arquivo de backup muito grande (máx. 50 MB).');
  if (file.type && file.type !== 'application/json' && !file.name?.endsWith('.json'))
    throw new Error('O arquivo precisa ser um JSON.');

  const text = await file.text();

  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('JSON inválido ou corrompido.');
  }

  // Valida estrutura e bloqueia prototype pollution
  const data = _validateBackupPayload(payload);

  const { db, collection, doc, writeBatch } = fb();
  const uid = getUid();

  for (const colName of ALLOWED_COL_NAMES) {
    const items = data[colName] || [];
    if (!items.length) continue;

    // Batch write (max 490 por batch, limite Firestore é 500)
    let batch = writeBatch(db);
    let count = 0;

    for (const item of items) {
      const { id, ...fields } = item;
      // Só escreve se o id for uma string simples (sem path traversal)
      if (!id || typeof id !== 'string' || id.includes('/') || id.length > 200) continue;
      const ref = doc(collection(doc(collection(db, 'users'), uid), colName), id);
      batch.set(ref, fields, { merge: true });
      count++;
      if (count === 490) {
        await batch.commit();
        batch = writeBatch(db);
        count = 0;
      }
    }
    if (count > 0) await batch.commit();
  }

  // Recarrega state
  await loadAllData();
  return payload.meta?.version || '?';
}
