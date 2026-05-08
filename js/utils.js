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
export function renderInsights() {
  const strip = document.getElementById('insights-strip');
  if (!strip) return;

  const month     = state.currentMonth;
  const prevMonth = offsetMonth(month, -1);

  const investIds = state.categories
    .filter(c => (c.id + c.name).toLowerCase().includes('investiment'))
    .map(c => c.id);

  const txs     = state.transactions.filter(t => t.competenceMonth === month && !investIds.includes(t.categoryId));
  const txsPrev = state.transactions.filter(t => t.competenceMonth === prevMonth && !investIds.includes(t.categoryId));

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

  const topEntry = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  if (topEntry) {
    const cat = state.categories.find(c => c.id === topEntry[0]);
    if (cat) chips.push({ type: 'info', icon: '💡', text: `${cat.name} é sua maior categoria: ${fmt(topEntry[1])}` });
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
