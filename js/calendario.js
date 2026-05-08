/**
 * calendario.js — Calendário financeiro mensal
 * Mostra: vencimentos, parcelas, receitas, eventos recorrentes
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
      <div class="page-actions">
        <div style="display:flex;gap:0.4rem;align-items:center;font-size:0.78rem;color:var(--text-muted)">
          <span style="display:inline-flex;align-items:center;gap:0.3rem"><span class="cal-dot-legend" style="background:var(--danger)"></span>Gasto</span>
          <span style="display:inline-flex;align-items:center;gap:0.3rem"><span class="cal-dot-legend" style="background:var(--success)"></span>Receita</span>
          <span style="display:inline-flex;align-items:center;gap:0.3rem"><span class="cal-dot-legend" style="background:var(--info)"></span>Parcela</span>
          <span style="display:inline-flex;align-items:center;gap:0.3rem"><span class="cal-dot-legend" style="background:var(--gold)"></span>Investimento</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div id="cal-grid"></div>
    </div>

    <div class="card" style="margin-top:1rem">
      <div class="card-header"><span class="card-title">Eventos do mês</span></div>
      <div id="cal-events-list"></div>
    </div>`;

  _renderGrid(y, m, month);
  _renderEventsList(month);
  _bindCalEvents();
}

// ─── GRID ─────────────────────────────────────────────────────
function _renderGrid(year, month, ym) {
  const grid = document.getElementById('cal-grid');
  if (!grid) return;

  const firstDay  = new Date(year, month - 1, 1).getDay(); // 0=dom
  const daysInMonth = new Date(year, month, 0).getDate();
  const today     = new Date();
  const isToday   = (d) => today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d;

  // Mapeia eventos por dia
  const eventsByDay = _buildEventMap(ym);

  const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  let html = `
    <div class="cal-header-row">
      ${dayLabels.map(d => `<div class="cal-header-cell">${d}</div>`).join('')}
    </div>
    <div class="cal-days-grid">`;

  // Células vazias antes do primeiro dia
  for (let i = 0; i < firstDay; i++) {
    html += `<div class="cal-cell cal-cell-empty"></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const events  = eventsByDay[dateStr] || [];
    const dots    = _buildDots(events);
    const total   = events.reduce((s, e) => s + (e.type === 'expense' ? -e.amount : e.amount), 0);
    const todayCls = isToday(d) ? 'cal-cell-today' : '';

    html += `
      <div class="cal-cell ${todayCls}" data-date="${dateStr}">
        <span class="cal-day-num">${d}</span>
        ${dots}
        ${events.length ? `<span class="cal-day-total ${total >= 0 ? 'pos' : 'neg'}">${total >= 0 ? '+' : ''}${_shortFmt(total)}</span>` : ''}
      </div>`;
  }

  html += `</div>`;
  grid.innerHTML = html;
}

function _buildDots(events) {
  if (!events.length) return '';
  const types = [...new Set(events.map(e => e.dotColor))].slice(0, 4);
  return `<div class="cal-dots">${types.map(c => `<span class="cal-dot" style="background:${c}"></span>`).join('')}</div>`;
}

function _shortFmt(val) {
  const abs = Math.abs(val);
  if (abs >= 1000) return (val / 1000).toFixed(1) + 'k';
  return abs.toFixed(0);
}

// ─── MAPA DE EVENTOS ──────────────────────────────────────────
function _buildEventMap(ym) {
  const map = {};
  const add = (dateStr, event) => {
    if (!map[dateStr]) map[dateStr] = [];
    map[dateStr].push(event);
  };

  const investIds = state.categories
    .filter(c => (c.id + c.name).toLowerCase().includes('investiment'))
    .map(c => c.id);

  // Transações do mês
  for (const tx of state.transactions.filter(t => t.competenceMonth === ym)) {
    if (!tx.date) continue;
    const isInvest = investIds.includes(tx.categoryId);
    add(tx.date, {
      type:     'expense',
      amount:   tx.amount,
      label:    tx.description,
      dotColor: isInvest ? 'var(--gold)' : tx.installmentTotal > 1 ? 'var(--info)' : 'var(--danger)',
      isParc:   tx.installmentTotal > 1,
      isInvest,
      raw: tx,
    });
  }

  // Receitas do mês
  for (const inc of state.incomes.filter(i => i.month === ym || i.competenceMonth === ym)) {
    const dateStr = inc.date || `${ym}-01`;
    add(dateStr, {
      type:     'income',
      amount:   inc.amount,
      label:    inc.description || inc.type || 'Receita',
      dotColor: 'var(--success)',
      raw: inc,
    });
  }

  return map;
}

// ─── LISTA DE EVENTOS ─────────────────────────────────────────
function _renderEventsList(ym) {
  const list = document.getElementById('cal-events-list');
  if (!list) return;

  const allEvents = [];

  const investIds = state.categories
    .filter(c => (c.id + c.name).toLowerCase().includes('investiment'))
    .map(c => c.id);

  for (const tx of state.transactions.filter(t => t.competenceMonth === ym && t.date)) {
    const cat  = state.categories.find(c => c.id === tx.categoryId);
    const isI  = investIds.includes(tx.categoryId);
    allEvents.push({
      date:    tx.date,
      label:   tx.description,
      cat:     cat?.name || '—',
      amount:  tx.amount,
      type:    'expense',
      color:   isI ? 'var(--gold)' : tx.installmentTotal > 1 ? 'var(--info)' : 'var(--danger)',
      extra:   tx.installmentTotal > 1 ? `parcela ${tx.installmentCurrent}/${tx.installmentTotal}` : '',
    });
  }

  for (const inc of state.incomes.filter(i => i.month === ym || i.competenceMonth === ym)) {
    allEvents.push({
      date:   inc.date || `${ym}-01`,
      label:  inc.description || inc.type || 'Receita',
      cat:    'Receita',
      amount: inc.amount,
      type:   'income',
      color:  'var(--success)',
      extra:  '',
    });
  }

  allEvents.sort((a, b) => a.date.localeCompare(b.date));

  if (!allEvents.length) {
    list.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-title">Sem eventos</div><div class="empty-state-text">Nenhuma transação registrada neste mês.</div></div>`;
    return;
  }

  list.innerHTML = allEvents.map(ev => `
    <div style="display:flex;align-items:center;gap:0.75rem;padding:0.6rem 1.25rem;border-bottom:1px solid var(--border-soft);font-size:0.83rem">
      <span style="width:8px;height:8px;border-radius:50%;background:${ev.color};flex-shrink:0"></span>
      <span style="color:var(--text-muted);font-size:0.75rem;white-space:nowrap;width:70px">${ev.date}</span>
      <span style="flex:1;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(ev.label)}</span>
      ${ev.extra ? `<span style="font-size:0.7rem;color:var(--text-muted)">${esc(ev.extra)}</span>` : ''}
      <span style="color:var(--text-muted);font-size:0.72rem">${esc(ev.cat)}</span>
      <span style="font-family:var(--font-mono);font-size:0.8rem;color:${ev.type === 'income' ? 'var(--success)' : 'var(--danger)'}">
        ${ev.type === 'income' ? '+' : '-'}${fmt(ev.amount)}
      </span>
    </div>`).join('');
}

function _bindCalEvents() {
  document.getElementById('cal-grid')?.addEventListener('click', e => {
    const cell = e.target.closest('[data-date]');
    if (!cell) return;
    // Highlight selected
    document.querySelectorAll('.cal-cell.selected').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
  });
}
