/**
 * dashboard.js — Renderiza KPIs, gráficos e cards do dashboard
 */

import { state, fmt, monthLabel, offsetMonth } from './app.js';
import { txOfMonth, incomesOfMonth } from './db.js';

let chartCategorias = null;
let chartEvolucao   = null;

export function renderDashboard() {
  const month = state.currentMonth;
  document.getElementById('chart-cat-month').textContent = monthLabel(month);

  const txs     = txOfMonth(month);
  const incomes = incomesOfMonth(month);

  const totalIncome = incomes.reduce((s, i) => s + (i.amount || 0), 0);

  // Gastos excluindo investimentos
  const investCat = state.categories.find(c => c.name.toLowerCase() === 'investimento');
  const txExpenses    = txs.filter(t => t.categoryId !== investCat?.id);
  const txInvestments = txs.filter(t => t.categoryId === investCat?.id);

  const totalExpense  = txExpenses.reduce((s, t) => s + (t.amount || 0), 0);
  const totalInvested = txInvestments.reduce((s, t) => s + (t.amount || 0), 0);
  const saldo         = totalIncome - totalExpense - totalInvested;
  const taxa          = totalIncome > 0 ? Math.round((saldo / totalIncome) * 100) : 0;

  // KPIs
  document.getElementById('kpi-receitas').textContent   = fmt(totalIncome);
  document.getElementById('kpi-despesas').textContent   = fmt(totalExpense);
  document.getElementById('kpi-saldo').textContent      = fmt(saldo);
  document.getElementById('kpi-investido').textContent  = fmt(totalInvested);
  document.getElementById('kpi-taxa').textContent       = `Taxa de poupança ${taxa}%`;

  // Saldo — cor dinâmica
  const saldoEl = document.getElementById('kpi-saldo');
  saldoEl.className = 'kpi-value ' + (saldo >= 0 ? 'positive' : 'negative');

  // Total investimentos no patrimônio
  const totalAssetInvest = state.assets
    .filter(a => a.type === 'investimento')
    .reduce((s, a) => s + (a.currentValue || 0), 0);
  document.getElementById('kpi-investido-total').textContent =
    `Total no patrimônio: ${fmt(totalAssetInvest)}`;

  renderChartCategorias(txExpenses);
  renderChartEvolucao();
  renderParcelasPrevisao();
  renderOrcamentoDashboard(txExpenses, month);
}

// ─── GRÁFICO DE CATEGORIAS ─────────────────────────────────────────────────
function renderChartCategorias(txs) {
  const catMap = {};
  for (const tx of txs) {
    const cat = state.categories.find(c => c.id === tx.categoryId);
    const key = cat?.name || 'Outros';
    catMap[key] = (catMap[key] || 0) + (tx.amount || 0);
  }

  const sorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);
  const colors = sorted.map(([k]) => {
    const cat = state.categories.find(c => c.name === k);
    return cat?.color || '#94a3b8';
  });

  const canvas = document.getElementById('chart-categorias');
  if (chartCategorias) chartCategorias.destroy();

  chartCategorias = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors.map(c => c + '99'),
        borderColor: colors,
        borderWidth: 1.5,
        borderRadius: 5,
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => fmt(ctx.raw),
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { family: 'DM Sans', size: 11 } },
          grid:  { color: 'rgba(148,163,184,0.06)' },
        },
        y: {
          ticks: {
            color: '#94a3b8',
            font: { family: 'DM Mono', size: 11 },
            callback: v => `R$${(v/1000).toFixed(0)}k`,
          },
          grid: { color: 'rgba(148,163,184,0.06)' },
        },
      },
    },
  });
}

// ─── GRÁFICO DE EVOLUÇÃO MENSAL ─────────────────────────────────────────────
function renderChartEvolucao() {
  const months = [];
  for (let i = 5; i >= 0; i--) {
    months.push(offsetMonth(state.currentMonth, -i));
  }

  const investCat = state.categories.find(c => c.name.toLowerCase() === 'investimento');

  const receitas  = months.map(m => incomesOfMonth(m).reduce((s, i) => s + (i.amount || 0), 0));
  const despesas  = months.map(m =>
    txOfMonth(m)
      .filter(t => t.categoryId !== investCat?.id)
      .reduce((s, t) => s + (t.amount || 0), 0)
  );
  const labels    = months.map(m => monthLabel(m).slice(0, 3));

  const canvas = document.getElementById('chart-evolucao');
  if (chartEvolucao) chartEvolucao.destroy();

  chartEvolucao = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Receitas',
          data: receitas,
          backgroundColor: 'rgba(52,211,153,0.25)',
          borderColor: '#34d399',
          borderWidth: 1.5,
          borderRadius: 4,
        },
        {
          label: 'Despesas',
          data: despesas,
          backgroundColor: 'rgba(248,113,113,0.22)',
          borderColor: '#f87171',
          borderWidth: 1.5,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: {
            color: '#94a3b8',
            font: { family: 'DM Sans', size: 11 },
            boxWidth: 10,
            boxHeight: 10,
          },
        },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.raw)}` } },
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { family: 'DM Sans', size: 11 } },
          grid:  { display: false },
        },
        y: {
          ticks: {
            color: '#94a3b8',
            font: { family: 'DM Mono', size: 11 },
            callback: v => `R$${(v/1000).toFixed(0)}k`,
          },
          grid: { color: 'rgba(148,163,184,0.06)' },
        },
      },
    },
  });
}

// ─── PARCELAS FUTURAS ──────────────────────────────────────────────────────
function renderParcelasPrevisao() {
  const current = state.currentMonth;
  const next3   = [
    offsetMonth(current, 1),
    offsetMonth(current, 2),
    offsetMonth(current, 3),
  ];

  const parcelas = state.transactions.filter(t =>
    next3.includes(t.competenceMonth) &&
    t.installmentTotal > 1
  );

  const list = document.getElementById('parcelas-list');

  if (!parcelas.length) {
    list.innerHTML = '<p class="empty-state">Nenhuma parcela prevista nos próximos 3 meses.</p>';
    return;
  }

  // Ordena por mês de competência
  parcelas.sort((a, b) => a.competenceMonth.localeCompare(b.competenceMonth));

  list.innerHTML = parcelas.slice(0, 10).map(p => {
    const mesLabel = monthLabel(p.competenceMonth).slice(0, 3).toLowerCase();
    return `
      <div class="parcela-item">
        <span class="parcela-desc" title="${p.description}">${p.description}</span>
        <div class="parcela-info">
          <span class="parcela-num">${p.installmentCurrent}/${p.installmentTotal}</span>
          <span class="parcela-val">${fmt(p.amount)}</span>
          <span class="parcela-mes">${mesLabel}</span>
        </div>
      </div>`;
  }).join('');
}

// ─── ORÇAMENTO × REAL ─────────────────────────────────────────────────────
function renderOrcamentoDashboard(txs, month) {
  const budgetMonth = state.budgets[month] || {};
  const list = document.getElementById('orcamento-list');

  if (!Object.keys(budgetMonth).length) {
    list.innerHTML = '<p class="empty-state">Defina um orçamento na aba Receitas.</p>';
    return;
  }

  // Agrupa gastos reais por categoria
  const realMap = {};
  for (const tx of txs) {
    realMap[tx.categoryId] = (realMap[tx.categoryId] || 0) + (tx.amount || 0);
  }

  const rows = Object.entries(budgetMonth)
    .filter(([, v]) => v > 0)
    .map(([catId, target]) => {
      const real  = realMap[catId] || 0;
      const cat   = state.categories.find(c => c.id === catId);
      const pct   = target > 0 ? Math.min((real / target) * 100, 100) : 0;
      const cls   = pct > 100 ? 'progress-over' : pct > 80 ? 'progress-warn' : 'progress-ok';
      return `
        <div class="orcamento-item">
          <div class="orcamento-row">
            <span class="orcamento-cat">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cat?.color || '#94a3b8'};margin-right:0.4rem"></span>
              ${cat?.name || 'Categoria'}
            </span>
            <span class="orcamento-vals">
              <span class="orcamento-real">${fmt(real)}</span>
              <span class="orcamento-sep">/</span>
              <span class="orcamento-tgt">${fmt(target)}</span>
            </span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${cls}" style="width:${pct.toFixed(1)}%"></div>
          </div>
        </div>`;
    });

  list.innerHTML = rows.join('') || '<p class="empty-state">Nenhuma categoria com orçamento definido.</p>';
}
