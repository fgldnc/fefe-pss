/**
 * utils.js — Utilitários e estado global compartilhados
 * SEM imports de outros módulos do projeto para evitar circular dependency.
 */

// ─── ESTADO GLOBAL ─────────────────────────────────────────────
export const state = {
  user: null,
  currentMonth: '',
  categories: [],
  transactions: [],
  incomes: [],
  budgets: {},
  assets: [],
  goals: [],
  extratoTransactions: [],
  importRules: [],
};

// ─── CATEGORIAS: RESOLVE SLUG → ID REAL ───────────────────────
// Os parsers de extrato classificam com slugs ('alimentacao', 'transporte'...),
// mas as categorias no Firestore têm IDs auto-gerados. Esta função mapeia
// slug (ou nome) → ID real da categoria do usuário, por nome normalizado.
const _SLUG_TO_NAME = {
  alimentacao: 'alimentação', transporte: 'transporte', assinatura: 'assinaturas',
  saude: 'saúde', compras: 'compras', eletronicos: 'eletrônicos', educacao: 'educação',
  moradia: 'moradia', lazer: 'lazer', investimento: 'investimento',
  vestuario: 'vestuário', encargos: 'outros', outros: 'outros',
};
const _norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

export function resolveCategoryId(slugOrId) {
  if (!slugOrId) return '';
  // Já é um ID válido?
  if (state.categories.some(c => c.id === slugOrId)) return slugOrId;
  const target = _norm(_SLUG_TO_NAME[slugOrId] ?? slugOrId);
  if (!target) return '';
  const cat = state.categories.find(c => _norm(c.name) === target)
           || state.categories.find(c => _norm(c.name).includes(target) || target.includes(_norm(c.name)));
  return cat?.id || '';
}

// ─── FORMATAÇÃO ────────────────────────────────────────────────
export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g, '&#x2F;');
}

export function fmt(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

export function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-');
  const names = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

export function offsetMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── TOAST ────────────────────────────────────────────────────
const TOAST_ICONS = { success: '✓', error: '✕', warning: '⚠', info: '◈' };

export function toast(msg, type = 'info', title = '', duration = 4500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const autoTitle = title || { success: 'Sucesso', error: 'Erro', warning: 'Atenção', info: 'Aviso' }[type] || '';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="toast-icon">${esc(TOAST_ICONS[type] || '●')}</span>
    <div class="toast-body">
      ${autoTitle ? `<div class="toast-title">${esc(autoTitle)}</div>` : ''}
      <div class="toast-msg">${esc(msg)}</div>
    </div>
    <button class="toast-close" aria-label="Fechar">✕</button>`;
  el.querySelector('.toast-close').addEventListener('click', () => removeToast(el));
  container.appendChild(el);
  if (duration > 0) setTimeout(() => removeToast(el), duration);
}

function removeToast(el) {
  if (!el.parentNode) return;
  el.classList.add('hiding');
  setTimeout(() => el.parentNode?.removeChild(el), 260);
}

// ─── SKELETON ─────────────────────────────────────────────────
export function showKpiSkeleton() {
  const grid = document.getElementById('kpi-grid');
  if (!grid) return;
  grid.innerHTML = Array(4).fill(`
    <div class="kpi-skeleton">
      <div class="skeleton sk-title" style="width:55%"></div>
      <div class="skeleton sk-value" style="margin-top:8px"></div>
      <div class="skeleton sk-text" style="width:50%;margin-top:8px"></div>
    </div>`).join('');
}

export function showTableSkeleton(tbodyId, cols = 6) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = Array(5).fill(
    `<tr>${Array(cols).fill(`<td><div class="skeleton sk-text"></div></td>`).join('')}</tr>`
  ).join('');
}

// ─── INSIGHTS AUTOMÁTICOS ─────────────────────────────────────
// Fallback: despesas do mês (transactions + extrato) sem investimentos.
// Usado APENAS se o chamador não passar getExpenses — o dashboard sempre
// passa o callback baseado em allExpensesOfMonth (fonte única dos KPIs).
// utils.js não pode importar db.js (dependência circular).
function _expensesFallback(month, investIds) {
  const normais = state.transactions.filter(t =>
    t.competenceMonth === month && !investIds.includes(t.categoryId));
  const extrato = (state.extratoTransactions || []).filter(t =>
    t.type === 'expense' && (t.date || '').slice(0, 7) === month &&
    !investIds.includes(resolveCategoryId(t.categoryId || t.category)));
  // Resolve categoryId dos itens de extrato (slug → ID real) para os
  // agrupamentos por categoria baterem com o resto do app
  return [...normais, ...extrato.map(t => ({
    ...t, categoryId: t.categoryId || resolveCategoryId(t.category) || t.category || '',
  }))];
}

export function renderInsights(getExpenses = null) {
  const strip = document.getElementById('insights-strip');
  if (!strip) return;

  const month     = state.currentMonth;
  const prevMonth = offsetMonth(month, -1);

  const investIds = state.categories
    .filter(c => (c.id + c.name).toLowerCase().includes('investiment'))
    .map(c => c.id);

  // Fonte única: mesmo cálculo dos KPIs quando o dashboard fornece o callback
  const expensesOf = getExpenses || (m => _expensesFallback(m, investIds));
  const txs     = expensesOf(month);
  const txsPrev = expensesOf(prevMonth);

  const totalNow  = txs.reduce((s, t) => s + (t.amount || 0), 0);
  const totalPrev = txsPrev.reduce((s, t) => s + (t.amount || 0), 0);

  const chips = [];

  if (totalPrev > 0 && totalNow > 0) {
    const delta = ((totalNow - totalPrev) / totalPrev) * 100;
    if (Math.abs(delta) > 5) {
      chips.push({ type: delta > 0 ? 'warn' : 'good', icon: delta > 0 ? '📈' : '📉',
        text: `Gastos ${delta > 0 ? '+' : ''}${delta.toFixed(0)}% vs mês anterior` });
    }
  }

  const catTotals = {};
  for (const tx of txs) catTotals[tx.categoryId] = (catTotals[tx.categoryId] || 0) + (tx.amount || 0);

  // ── ANOMALIA: categoria fora da média dos últimos 3 meses ──────────
  // Mais útil que "X é sua maior categoria" (ranking que você já conhece).
  // Regras: média ≥ R$ 80 (ignora categorias irrelevantes), desvio ≥ 30%,
  // mostra no máx. as 2 maiores anomalias para não poluir a faixa.
  {
    const histTotals = {}; // categoria → [total m-1, m-2, m-3]
    for (let i = 1; i <= 3; i++) {
      const m = offsetMonth(month, -i);
      for (const tx of expensesOf(m)) {
        const k = tx.categoryId || '_sem';
        (histTotals[k] = histTotals[k] || []).push(tx.amount || 0);
      }
    }
    const anomalies = [];
    for (const [catId, val] of Object.entries(catTotals)) {
      const hist = histTotals[catId];
      if (!hist || !hist.length) continue;
      const avg = hist.reduce((s, v) => s + v, 0) / 3; // média mensal (3 meses)
      if (avg < 80) continue;
      const dev = ((val - avg) / avg) * 100;
      if (Math.abs(dev) < 30) continue;
      const cat = state.categories.find(c => c.id === catId);
      if (!cat) continue;
      anomalies.push({ dev, cat, val });
    }
    anomalies.sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev));
    for (const a of anomalies.slice(0, 2)) {
      chips.push({
        type: a.dev > 0 ? 'warn' : 'good',
        icon: a.dev > 0 ? '🔺' : '🔻',
        text: `${a.cat.name} ${a.dev > 0 ? '+' : ''}${a.dev.toFixed(0)}% vs sua média de 3 meses (${fmt(a.val)})`,
      });
    }
  }

  // ── PROJEÇÃO: no ritmo atual, o mês fecha em ~R$X ──────────────────
  // Só faz sentido no mês corrente, com o mês já rodando (dia ≥ 5) e ainda
  // com dias pela frente. Projeção linear simples: gasto ÷ dias corridos × dias do mês.
  {
    const now = new Date();
    const isCurrent = month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dayNow = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (isCurrent && dayNow >= 5 && dayNow < daysInMonth && totalNow > 0) {
      const projected = (totalNow / dayNow) * daysInMonth;
      // Compara com o mês anterior para dar referência de cor
      const worse = totalPrev > 0 && projected > totalPrev;
      chips.push({
        type: worse ? 'warn' : 'info',
        icon: '🔮',
        text: `No ritmo atual, o mês fecha em ~${fmt(projected)}`,
      });
    }
  }

  const budgets = state.budgets[month] || {};
  for (const [catId, limit] of Object.entries(budgets)) {
    if (limit <= 0) continue;
    const spent = catTotals[catId] || 0;
    const pct   = (spent / limit) * 100;
    const cat   = state.categories.find(c => c.id === catId);
    if (pct >= 90 && cat) {
      chips.push({ type: 'warn', icon: '⚠️',
        text: `Orçamento de ${cat.name} ${pct >= 100 ? 'ultrapassado' : 'quase no limite'}` });
    }
  }

  const nextMonth = offsetMonth(month, 1);
  const parcelas  = state.transactions.filter(t => t.competenceMonth === nextMonth && t.installmentTotal > 1);
  const totalParc = parcelas.reduce((s, t) => s + (t.amount || 0), 0);
  if (totalParc > 0) chips.push({ type: 'info', icon: '📅', text: `${fmt(totalParc)} em parcelas no próximo mês` });

  if (!chips.length) {
    strip.innerHTML = `<div class="insight-chip info"><span>✨</span> Tudo em ordem por aqui!</div>`;
    return;
  }

  strip.innerHTML = chips.map(c =>
    `<div class="insight-chip ${esc(c.type)}"><span>${esc(c.icon)}</span>${esc(c.text)}</div>`
  ).join('');
}
