/**
 * timeline.js — Timeline de eventos financeiros
 */

import { state, fmt, esc, monthLabel, offsetMonth } from './utils.js';

export function renderTimeline() {
  const container = document.getElementById('tab-timeline');
  if (!container) return;

  container.innerHTML = `
    <div class="page-header" style="justify-content:flex-end">
      <div class="page-actions">
        <select id="timeline-filter" class="filter-select">
          <option value="all">Todos os eventos</option>
          <option value="expense">Gastos</option>
          <option value="income">Receitas</option>
          <option value="import">Importações</option>
          <option value="goal">Metas</option>
          <option value="asset">Patrimônio</option>
        </select>
      </div>
    </div>
    <div class="card">
      <div id="timeline-feed" style="padding:0.5rem 0"></div>
    </div>`;

  _renderFeed('all');

  document.getElementById('timeline-filter')?.addEventListener('change', e => {
    _renderFeed(e.target.value);
  });
}

const EVENT_META = {
  expense:  { icon: '💳', color: 'var(--danger)',   label: 'Gasto' },
  income:   { icon: '💰', color: 'var(--success)',  label: 'Receita' },
  import:   { icon: '📥', color: 'var(--info)',     label: 'Importação' },
  goal:     { icon: '🎯', color: 'var(--accent-primary)', label: 'Meta' },
  asset:    { icon: '🏦', color: 'var(--gold)',     label: 'Patrimônio' },
  backup:   { icon: '💾', color: 'var(--text-muted)', label: 'Backup' },
  budget:   { icon: '📋', color: 'var(--warning)',  label: 'Orçamento' },
};

function _renderFeed(filter) {
  const feed = document.getElementById('timeline-feed');
  if (!feed) return;

  const events = _buildEvents(filter);

  if (!events.length) {
    feed.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📜</div><div class="empty-state-title">Sem eventos</div><div class="empty-state-text">Nenhuma atividade registrada ainda.</div></div>`;
    return;
  }

  // Agrupa por mês
  const grouped = {};
  for (const ev of events) {
    const ym = (ev.date || '').slice(0, 7);
    if (!grouped[ym]) grouped[ym] = [];
    grouped[ym].push(ev);
  }

  let html = '';
  for (const [ym, evList] of Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]))) {
    html += `<div class="timeline-month-label">${monthLabel(ym)}</div>`;
    for (const ev of evList) {
      const meta = EVENT_META[ev.type] || EVENT_META.expense;
      html += `
        <div class="timeline-item">
          <div class="timeline-icon" style="background:${meta.color}20;border-color:${meta.color}40">
            <span>${meta.icon}</span>
          </div>
          <div class="timeline-line"></div>
          <div class="timeline-body">
            <div class="timeline-title">${esc(ev.title)}</div>
            ${ev.subtitle ? `<div class="timeline-sub">${esc(ev.subtitle)}</div>` : ''}
            <div class="timeline-meta">
              <span>${esc(ev.date || '—')}</span>
              ${ev.amount ? `<span class="timeline-amount" style="color:${meta.color}">${ev.type === 'income' ? '+' : ev.type === 'expense' ? '-' : ''}${fmt(ev.amount)}</span>` : ''}
            </div>
          </div>
        </div>`;
    }
  }

  feed.innerHTML = html;
}

function _buildEvents(filter) {
  const events = [];
  const include = (type) => filter === 'all' || filter === type;

  // Transações (últimos 6 meses)
  if (include('expense')) {
    const cutoff = offsetMonth(state.currentMonth, -6);
    for (const tx of state.transactions.filter(t => (t.competenceMonth || '') >= cutoff)) {
      const cat = state.categories.find(c => c.id === tx.categoryId);
      events.push({
        type:     'expense',
        date:     tx.date || tx.competenceMonth,
        title:    tx.description || 'Gasto',
        subtitle: cat?.name,
        amount:   tx.amount,
      });
    }
  }

  if (include('income')) {
    const cutoff = offsetMonth(state.currentMonth, -6);
    for (const inc of state.incomes.filter(i => (i.month || i.competenceMonth || '') >= cutoff)) {
      events.push({
        type:     'income',
        date:     inc.date || inc.month || inc.competenceMonth,
        title:    inc.description || inc.type || 'Receita',
        subtitle: null,
        amount:   inc.amount,
      });
    }
  }

  if (include('import')) {
    // Importações de extrato — agrupadas por batch
    const batches = {};
    for (const tx of state.extratoTransactions || []) {
      const id = tx.importBatchId || 'x';
      if (!batches[id]) batches[id] = { bank: tx.bankName, count: 0, date: tx.importedAt || tx.date, fmt: tx.fileType };
      batches[id].count++;
    }
    for (const [, b] of Object.entries(batches)) {
      events.push({
        type:     'import',
        date:     (b.date || '').slice(0, 10),
        title:    `Extrato importado — ${b.bank || 'banco'}`,
        subtitle: `${b.count} transações · .${b.fmt || 'arquivo'}`,
        amount:   null,
      });
    }
  }

  if (include('goal')) {
    for (const g of state.goals) {
      if (!g.contributions?.length) continue;
      for (const contrib of g.contributions) {
        events.push({
          type:     'goal',
          date:     contrib.date,
          title:    `Aporte em "${g.name}"`,
          subtitle: null,
          amount:   contrib.amount,
        });
      }
    }
  }

  if (include('asset')) {
    for (const a of state.assets) {
      if (!a.acquisitionDate && !a.createdAt) continue;
      events.push({
        type:     'asset',
        date:     (a.acquisitionDate || a.createdAt || '').slice(0, 10),
        title:    `${a.name} adicionado ao patrimônio`,
        subtitle: a.type || null,
        amount:   a.currentValue || a.initialValue,
      });
    }
  }

  return events.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
