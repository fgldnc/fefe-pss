/**
 * calendario.js — Calendário financeiro mensal
 */

import { state, monthLabel, offsetMonth, fmt, esc } from './utils.js';

export function renderCalendario() {
  const container = document.getElementById('tab-calendario');
  if (!container) return;

  const month = state.currentMonth;
  const [y, m] = month.split('-').map(Number);

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <h2 class="page-title">Calendário Financeiro</h2>
        <p class="page-subtitle">${monthLabel(month)}</p>
      </div>
      <div class="page-actions" style="font-size:0.78rem;color:var(--text-muted);display:flex;gap:1rem;align-items:center">
        <span style="display:flex;align-items:center;gap:0.3rem"><span style="width:8px;height:8px;border-radius:50%;background:var(--danger);display:inline-block"></span>Gasto</span>
        <span style="display:flex;align-items:center;gap:0.3rem"><span style="width:8px;height:8px;border-radius:50%;background:var(--success);display:inline-block"></span>Receita</span>
        <span style="display:flex;align-items:center;gap:0.3rem"><span style="width:8px;height:8px;border-radius:50%;background:var(--info);display:inline-block"></span>Parcela</span>
        <span style="display:flex;align-items:center;gap:0.3rem"><span style="width:8px;height:8px;border-radius:50%;background:var(--gold);display:inline-block"></span>Investimento</span>
      </div>
    </div>

    <div class="card" style="overflow:hidden">
      <div id="cal-grid-wrap"></div>
    </div>

    <div class="card" style="margin-top:1rem">
      <div class="card-header"><span class="card-title">Todos os eventos do mês</span></div>
      <div id="cal-events-list"></div>
    </div>`;

  _buildCalendar(y, m, month);
  _buildEventsList(month);
}

function _buildCalendar(year, month, ym) {
  const wrap = document.getElementById('cal-grid-wrap');
  if (!wrap) return;

  const firstDay    = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const today       = new Date();
  const isToday     = d => today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d;

  const eventsByDay = _buildEventMap(ym);
  const DAY_NAMES   = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // ── Header row (uses inline grid on the wrapper)
  let html = `
    <div style="display:grid;grid-template-columns:repeat(7,1fr);border-bottom:1px solid var(--border-soft)">
      ${DAY_NAMES.map(d => `
        <div style="padding:0.55rem 0;text-align:center;font-size:0.7rem;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px">
          ${d}
        </div>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr)">`;

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) {
    html += `<div style="min-height:72px;border-right:1px solid var(--border-soft);border-bottom:1px solid var(--border-soft);background:rgba(0,0,0,0.15)"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const events  = eventsByDay[dateStr] || [];
    const todayCls = isToday(d);
    const numTotal = events.reduce((s, e) => s + (e.type === 'income' ? e.amount : -e.amount), 0);
    const hasMoney = events.length > 0;
    const totalColor = numTotal >= 0 ? 'var(--success)' : 'var(--danger)';
    const totalSign  = numTotal >= 0 ? '+' : '';

    const dayNumStyle = todayCls
      ? `width:22px;height:22px;border-radius:50%;background:var(--accent-primary);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:700`
      : `font-size:0.78rem;font-weight:600;color:var(--text-secondary);width:22px;height:22px;display:flex;align-items:center;justify-content:center`;

    // Dots for event types (max 4)
    const uniqueColors = [...new Set(events.map(e => e.dotColor))].slice(0, 4);
    const dots = uniqueColors.map(c =>
      `<span style="width:5px;height:5px;border-radius:50%;background:${c};display:inline-block"></span>`
    ).join('');

    // Border on last column
    const col = (firstDay + d - 1) % 7;
    const borderRight = col === 6 ? '' : 'border-right:1px solid var(--border-soft);';

    html += `
      <div style="min-height:72px;${borderRight}border-bottom:1px solid var(--border-soft);padding:0.4rem 0.45rem;display:flex;flex-direction:column;gap:0.2rem;transition:background 0.15s;cursor:default"
        onmouseenter="this.style.background='rgba(145,10,103,0.07)'" onmouseleave="this.style.background=''">
        <span style="${dayNumStyle}">${d}</span>
        ${dots ? `<div style="display:flex;gap:2px;flex-wrap:wrap">${dots}</div>` : ''}
        ${hasMoney ? `<span style="font-size:0.63rem;font-family:var(--font-mono);color:${totalColor};margin-top:auto">${totalSign}${_shortFmt(numTotal)}</span>` : ''}
      </div>`;
  }

  html += `</div>`;
  wrap.innerHTML = html;
}

function _shortFmt(val) {
  const abs = Math.abs(val);
  if (abs >= 1000) return (val / 1000).toFixed(1) + 'k';
  return Math.abs(Math.round(val)).toString();
}

function _buildEventMap(ym) {
  const map = {};
  const add = (dateStr, ev) => { if (!map[dateStr]) map[dateStr] = []; map[dateStr].push(ev); };

  const investIds = state.categories
    .filter(c => (c.id + c.name).toLowerCase().includes('investiment'))
    .map(c => c.id);

  for (const tx of state.transactions.filter(t => t.competenceMonth === ym && t.date)) {
    const isInvest = investIds.includes(tx.categoryId);
    add(tx.date, {
      type:     'expense',
      amount:   tx.amount,
      label:    tx.description,
      dotColor: isInvest ? 'var(--gold)' : tx.installmentTotal > 1 ? 'var(--info)' : 'var(--danger)',
    });
  }

  for (const inc of state.incomes.filter(i => (i.month === ym || i.competenceMonth === ym) && i.date)) {
    add(inc.date, { type: 'income', amount: inc.amount, label: inc.description || 'Receita', dotColor: 'var(--success)' });
  }

  return map;
}

function _buildEventsList(ym) {
  const list = document.getElementById('cal-events-list');
  if (!list) return;

  const events = [];
  const investIds = state.categories
    .filter(c => (c.id + c.name).toLowerCase().includes('investiment'))
    .map(c => c.id);

  for (const tx of state.transactions.filter(t => t.competenceMonth === ym && t.date)) {
    const cat   = state.categories.find(c => c.id === tx.categoryId);
    const isInv = investIds.includes(tx.categoryId);
    events.push({
      date:   tx.date,
      label:  tx.description,
      cat:    cat?.name || '—',
      amount: tx.amount,
      type:   'expense',
      color:  isInv ? 'var(--gold)' : tx.installmentTotal > 1 ? 'var(--info)' : 'var(--danger)',
      extra:  tx.installmentTotal > 1 ? `${tx.installmentCurrent}/${tx.installmentTotal}` : '',
    });
  }

  for (const inc of state.incomes.filter(i => (i.month === ym || i.competenceMonth === ym) && i.date)) {
    events.push({
      date:   inc.date,
      label:  inc.description || inc.type || 'Receita',
      cat:    'Receita',
      amount: inc.amount,
      type:   'income',
      color:  'var(--success)',
      extra:  '',
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));

  if (!events.length) {
    list.innerHTML = `<div class="empty-state">
      <div class="empty-state-icon">📅</div>
      <div class="empty-state-title">Sem eventos neste mês</div>
      <div class="empty-state-text">Lance gastos ou receitas para ver o calendário preenchido.</div>
    </div>`;
    return;
  }

  list.innerHTML = events.map(ev => `
    <div style="display:flex;align-items:center;gap:0.75rem;padding:0.58rem 1.25rem;border-bottom:1px solid var(--border-soft);font-size:0.82rem">
      <span style="width:8px;height:8px;border-radius:50%;background:${ev.color};flex-shrink:0"></span>
      <span style="color:var(--text-muted);font-size:0.74rem;white-space:nowrap;width:75px;flex-shrink:0">${ev.date}</span>
      <span style="flex:1;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ev.label)}</span>
      ${ev.extra ? `<span style="font-size:0.7rem;color:var(--text-muted)">${esc(ev.extra)}</span>` : ''}
      <span style="font-size:0.72rem;color:var(--text-muted);flex-shrink:0">${esc(ev.cat)}</span>
      <span style="font-family:var(--font-mono);font-size:0.8rem;color:${ev.color};flex-shrink:0">
        ${ev.type === 'income' ? '+' : '-'}${fmt(ev.amount)}
      </span>
    </div>`).join('');
}
