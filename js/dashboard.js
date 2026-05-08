/**
 * dashboard.js — Renderiza KPIs, gráficos e cards do dashboard
 *
 * Correções v1.1:
 *  - Investimento detectado por ID ("investimento") OU nome (inclui "investiment")
 *    para funcionar tanto com categorias padrão quanto com as importadas do backup
 *  - Taxa de poupança: mostra quanto foi guardado (investido + saldo livre) sobre a receita
 *  - Gráfico de categorias exclui investimentos (igual ao KPI de despesas)
 *  - Tick do eixo Y do gráfico não divide por 1000 se os valores forem pequenos
 *  - Gráfico de evolução agora inclui barra de Investido separada
 */

import { state, fmt, monthLabel, offsetMonth } from './app.js';
import { txOfMonth, incomesOfMonth } from './db.js';

let chartCategorias = null;
let chartEvolucao   = null;

// ─── HELPER: detecta se uma categoria é de investimento ───────────────────
// Reconhece id="investimento" E name="Investimentos" (backup antigo)
function getInvestCatIds() {
  return state.categories
    .filter(c => {
      const id   = (c.id   || '').toLowerCase();
      const name = (c.name || '').toLowerCase();
      return id.includes('investiment') || name.includes('investiment');
    })
    .map(c => c.id);
}

// ─── RENDER PRINCIPAL ─────────────────────────────────────────────────────
export function renderDashboard() {
  const month = state.currentMonth;
  document.getElementById('chart-cat-month').textContent = monthLabel(month);

  const txs     = txOfMonth(month);
  const incomes = incomesOfMonth(month);

  const investIds     = getInvestCatIds();
  const txExpenses    = txs.filter(t => !investIds.includes(t.categoryId));
  const txInvestments = txs.filter(t =>  investIds.includes(t.categoryId));

  const totalIncome   = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpense  = txExpenses.reduce((s, t) => s + (t.amount || 0), 0);
  const totalInvested = txInvestments.reduce((s, t) => s + (t.amount || 0), 0);
  const saldoLivre    = totalIncome - totalExpense - totalInvested;

  // Taxa de poupança = quanto da renda não foi em despesas (investido + sobra)
  const guardado = totalInvested + Math.max(0, saldoLivre);
  const taxa     = totalIncome > 0 ? Math.round((guardado / totalIncome) * 100) : 0;

  // ── KPIs ────────────────────────────────────────────────────────────────
  document.getElementById('kpi-receitas').textContent  = fmt(totalIncome);
  document.getElementById('kpi-despesas').textContent  = fmt(totalExpense);
  document.getElementById('kpi-investido').textContent = fmt(totalInvested);

  const saldoEl = document.getElementById('kpi-saldo');
  saldoEl.textContent  = fmt(saldoLivre);
  saldoEl.className    = 'kpi-value ' + (saldoLivre >= 0 ? 'positive' : 'negative');

  const taxaEl = document.getElementById('kpi-taxa');
  taxaEl.textContent = totalIncome === 0
    ? 'Cadastre suas receitas para ver a taxa'
    : `${taxa}% da renda guardada`;

  const totalAssetInvest = state.assets
    .filter(a => a.type === 'investimento')
    .reduce((s, a) => s + (a.currentValue || 0), 0);
  document.getElementById('kpi-investido-total').textContent =
    totalAssetInvest > 0 ? `Total no patrimônio: ${fmt(totalAssetInvest)}` : '';

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
  const colors = sorted.map(([k]) => state.categories.find(c => c.name === k)?.color || '#94a3b8');
  const maxVal = Math.max(...values, 1);

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
        tooltip: { callbacks: { label: ctx => fmt(ctx.raw) } },
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { family: 'DM Sans', size: 11 } }, grid: { color: 'rgba(148,163,184,0.06)' } },
        y: {
          ticks: {
            color: '#94a3b8', font: { family: 'DM Mono', size: 11 },
            callback: v => maxVal >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${v}`,
          },
          grid: { color: 'rgba(148,163,184,0.06)' },
        },
      },
    },
  });
}

// ─── GRÁFICO DE EVOLUÇÃO MENSAL ─────────────────────────────────────────────
function renderChartEvolucao() {
  const months    = [];
  for (let i = 5; i >= 0; i--) months.push(offsetMonth(state.currentMonth, -i));
  const investIds = getInvestCatIds();

  const receitas  = months.map(m => incomesOfMonth(m).reduce((s, i) => s + (i.amount||0), 0));
  const despesas  = months.map(m => txOfMonth(m).filter(t => !investIds.includes(t.categoryId)).reduce((s,t)=>s+(t.amount||0),0));
  const investido = months.map(m => txOfMonth(m).filter(t =>  investIds.includes(t.categoryId)).reduce((s,t)=>s+(t.amount||0),0));
  const labels    = months.map(m => monthLabel(m).slice(0,3));
  const maxVal    = Math.max(...receitas, ...despesas, ...investido, 1);

  const canvas = document.getElementById('chart-evolucao');
  if (chartEvolucao) chartEvolucao.destroy();

  chartEvolucao = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Receitas',  data: receitas,  backgroundColor: 'rgba(52,211,153,0.25)',  borderColor: '#34d399', borderWidth: 1.5, borderRadius: 4 },
        { label: 'Despesas',  data: despesas,  backgroundColor: 'rgba(248,113,113,0.22)', borderColor: '#f87171', borderWidth: 1.5, borderRadius: 4 },
        { label: 'Investido', data: investido, backgroundColor: 'rgba(251,191,36,0.20)',  borderColor: '#fbbf24', borderWidth: 1.5, borderRadius: 4 },
      ],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'DM Sans', size: 11 }, boxWidth: 10, boxHeight: 10 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.raw)}` } },
      },
      scales: {
        x: { ticks: { color: '#94a3b8', font: { family: 'DM Sans', size: 11 } }, grid: { display: false } },
        y: {
          ticks: {
            color: '#94a3b8', font: { family: 'DM Mono', size: 11 },
            callback: v => maxVal >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${v}`,
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
  const next3   = [offsetMonth(current,1), offsetMonth(current,2), offsetMonth(current,3)];
  const parcelas = state.transactions
    .filter(t => next3.includes(t.competenceMonth) && t.installmentTotal > 1)
    .sort((a, b) => a.competenceMonth.localeCompare(b.competenceMonth));

  const list = document.getElementById('parcelas-list');
  if (!parcelas.length) {
    list.innerHTML = '<p class="empty-state">Nenhuma parcela prevista nos próximos 3 meses.</p>';
    return;
  }
  list.innerHTML = parcelas.slice(0,10).map(p => `
    <div class="parcela-item">
      <span class="parcela-desc" title="${p.description}">${p.description}</span>
      <div class="parcela-info">
        <span class="parcela-num">${p.installmentCurrent}/${p.installmentTotal}</span>
        <span class="parcela-val">${fmt(p.amount)}</span>
        <span class="parcela-mes">${monthLabel(p.competenceMonth).slice(0,3).toLowerCase()}</span>
      </div>
    </div>`).join('');
}

// ─── ORÇAMENTO × REAL ─────────────────────────────────────────────────────
function renderOrcamentoDashboard(txs, month) {
  const budgetMonth = state.budgets[month] || {};
  const list = document.getElementById('orcamento-list');
  if (!Object.keys(budgetMonth).length) {
    list.innerHTML = '<p class="empty-state">Defina um orçamento na aba Receitas.</p>';
    return;
  }
  const realMap = {};
  for (const tx of txs) realMap[tx.categoryId] = (realMap[tx.categoryId]||0) + (tx.amount||0);

  const rows = Object.entries(budgetMonth)
    .filter(([,v]) => v > 0)
    .map(([catId, target]) => {
      const real = realMap[catId] || 0;
      const cat  = state.categories.find(c => c.id === catId);
      const pct  = target > 0 ? Math.min((real/target)*100, 100) : 0;
      const cls  = pct > 100 ? 'progress-over' : pct > 80 ? 'progress-warn' : 'progress-ok';
      return `
        <div class="orcamento-item">
          <div class="orcamento-row">
            <span class="orcamento-cat">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${cat?.color||'#94a3b8'};margin-right:0.4rem"></span>
              ${cat?.name || catId}
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
