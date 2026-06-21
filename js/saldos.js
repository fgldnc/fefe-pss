/**
 * saldos.js — Visão diária de fluxo de caixa (substitui calendario.js)
 *
 * Mostra dia a dia do mês: Entradas, Saídas, Cartão, Diário (orçamento/dia),
 * Investimento (informativo) e Saldo acumulado.
 *
 * Lógica de saldo:
 *  - Entradas SOMAM ao saldo no dia
 *  - Saídas e Cartão SUBTRAEM do saldo no dia (cartão conta na data da COMPRA)
 *  - Investimento é apenas informativo — não afeta o saldo
 *  - Diário é o orçamento mensal total ÷ número de dias do mês (referência, não afeta saldo)
 *  - Saldo começa do ZERO no primeiro dia do mês
 */

import { state, fmt, monthLabel, offsetMonth, esc } from './utils.js';

export function renderCalendario() {
  // Mantém o nome da função para compatibilidade com app.js (TAB_MODULES)
  renderSaldos();
}

export function renderSaldos() {
  const container = document.getElementById('tab-calendario');
  if (!container) return;

  const month = state.currentMonth;
  const [y, m] = month.split('-').map(Number);

  container.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <h2 class="page-title">Saldos</h2>
        <p class="page-subtitle">Fluxo de caixa diário — ${esc(monthLabel(month))}</p>
      </div>
      <div class="page-actions" style="font-size:0.78rem;color:var(--text-muted)">
        <span>Saldo inicia zerado no dia 1</span>
      </div>
    </div>

    <div class="card" style="overflow-x:auto">
      <div id="saldos-table-wrap"></div>
    </div>`;

  _buildTable(y, m, month);
}

function _buildTable(year, month, ym) {
  const wrap = document.getElementById('saldos-table-wrap');
  if (!wrap) return;

  const daysInMonth = new Date(year, month, 0).getDate();
  const today       = new Date();
  const isToday     = d => today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === d;

  const dayData = _buildDayData(ym, year, month, daysInMonth);

  let runningBalance = 0;
  const rows = [];

  let totalEntradas = 0, totalSaidas = 0, totalCartao = 0, totalDiario = 0, totalInvest = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const day = dayData[d] || { entradas: 0, saidas: 0, cartao: 0, investimento: 0 };
    const diario = day.diario;

    runningBalance += day.entradas - day.saidas - day.cartao;

    totalEntradas += day.entradas;
    totalSaidas   += day.saidas;
    totalCartao   += day.cartao;
    totalDiario   += diario;
    totalInvest   += day.investimento;

    rows.push({ d, ...day, diario, saldo: runningBalance, isToday: isToday(d) });
  }

  // Cor do saldo: amarelo perto de zero, vermelho negativo, neutro positivo alto
  function _saldoStyle(saldo) {
    if (saldo < 0)   return 'background:rgba(248,113,113,0.18);color:var(--danger)';
    if (saldo < 100) return 'background:rgba(251,191,36,0.16);color:var(--warning)';
    return 'color:var(--text-primary)';
  }

  const dayRows = rows.map(r => `
    <tr style="${r.isToday ? 'background:rgba(145,10,103,0.10)' : ''}">
      <td style="font-weight:${r.isToday ? '700' : '500'};color:${r.isToday ? 'var(--accent-bright)' : 'var(--text-secondary)'}">${r.d}</td>
      <td class="val-mono" style="color:${r.entradas > 0 ? 'var(--success)' : 'var(--text-muted)'}">${r.entradas > 0 ? fmt(r.entradas) : '—'}</td>
      <td class="val-mono" style="color:${r.saidas > 0 ? 'var(--danger)' : 'var(--text-muted)'}">${r.saidas > 0 ? fmt(r.saidas) : '—'}</td>
      <td class="val-mono" style="color:${r.cartao > 0 ? 'var(--info)' : 'var(--text-muted)'}">${r.cartao > 0 ? fmt(r.cartao) : '—'}</td>
      <td class="val-mono" style="color:var(--text-muted)">${fmt(r.diario)}</td>
      <td class="val-mono" style="color:${r.investimento > 0 ? 'var(--gold)' : 'var(--text-muted)'}">${r.investimento > 0 ? fmt(r.investimento) : '—'}</td>
      <td class="val-mono" style="font-weight:600;${_saldoStyle(r.saldo)};padding:0.5rem 0.85rem;border-radius:6px">${fmt(r.saldo)}</td>
    </tr>`).join('');

  wrap.innerHTML = `
    <table class="data-table" style="min-width:720px">
      <thead>
        <tr>
          <th style="width:48px">Dia</th>
          <th>↑ Entradas</th>
          <th>↓ Saídas</th>
          <th>💳 Cartão</th>
          <th>Diário</th>
          <th>📈 Invest.</th>
          <th>Saldo</th>
        </tr>
      </thead>
      <tbody>${dayRows}</tbody>
      <tfoot>
        <tr style="border-top:2px solid var(--border-md);font-weight:600">
          <td style="color:var(--text-muted);font-size:0.78rem">Total</td>
          <td class="val-mono" style="color:var(--success)">${fmt(totalEntradas)}</td>
          <td class="val-mono" style="color:var(--danger)">${fmt(totalSaidas)}</td>
          <td class="val-mono" style="color:var(--info)">${fmt(totalCartao)}</td>
          <td class="val-mono" style="color:var(--text-muted)">${fmt(totalDiario)}</td>
          <td class="val-mono" style="color:var(--gold)">${fmt(totalInvest)}</td>
          <td class="val-mono" style="${_saldoStyle(runningBalance)}">${fmt(runningBalance)}</td>
        </tr>
      </tfoot>
    </table>`;
}

function _buildDayData(ym, year, month, daysInMonth) {
  const result = {};
  for (let d = 1; d <= daysInMonth; d++) {
    result[d] = { entradas: 0, saidas: 0, cartao: 0, investimento: 0, diario: 0 };
  }

  const investIds = state.categories
    .filter(c => (c.id + c.name).toLowerCase().includes('investiment'))
    .map(c => c.id);

  // Orçamento total do mês ÷ dias = valor "diário" de referência
  const budgets = state.budgets[ym] || {};
  const totalBudget = Object.values(budgets).reduce((s, v) => s + (v || 0), 0);
  const diarioValue = daysInMonth > 0 ? totalBudget / daysInMonth : 0;

  // Despesas (transactions) — filtra pela DATA REAL (não pela competenceMonth)
  // Saldo diário precisa refletir quando o dinheiro realmente saiu/vai sair,
  // independente do mês de competência usado nos relatórios/dashboard.
  for (const tx of state.transactions.filter(t => t.date && t.date.slice(0, 7) === ym)) {
    const day = parseInt(tx.date.slice(8, 10), 10);
    if (!result[day]) continue;

    const isInvest = investIds.includes(tx.categoryId);
    if (isInvest) {
      result[day].investimento += tx.amount || 0;
    } else if (tx.paymentType === 'cartao') {
      result[day].cartao += tx.amount || 0;
    } else {
      result[day].saidas += tx.amount || 0;
    }
  }

  // Receitas do mês — usa state.incomes como fonte ÚNICA de entradas.
  // IMPORTANTE: entradas vindas de extrato bancário já são espelhadas em
  // state.incomes (ver extratos.js _saveExtrato), então NÃO somamos de novo
  // a partir de state.extratoTransactions — isso duplicaria o valor.
  for (const inc of state.incomes.filter(i => (i.month === ym || i.competenceMonth === ym || (i.date||'').slice(0,7) === ym) && i.date)) {
    const day = parseInt(inc.date.slice(8, 10), 10);
    if (!result[day]) continue;
    result[day].entradas += inc.amount || 0;
  }

  // Transações de extrato bancário — soma SOMENTE as saídas (expense).
  // As entradas (income) já foram contabilizadas acima via state.incomes.
  for (const tx of (state.extratoTransactions || [])) {
    if (!tx.date || tx.date.slice(0, 7) !== ym) continue;
    if (tx.type !== 'expense') continue; // pula income — já contado em incomes
    const day = parseInt(tx.date.slice(8, 10), 10);
    if (!result[day]) continue;
    result[day].saidas += tx.amount || 0;
  }

  // Aplica valor diário de orçamento em todos os dias
  for (let d = 1; d <= daysInMonth; d++) {
    result[d].diario = diarioValue;
  }

  return result;
}
