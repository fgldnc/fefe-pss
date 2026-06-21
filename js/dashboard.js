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

import { state, fmt, monthLabel, offsetMonth, esc, renderInsights, showKpiSkeleton } from './utils.js';
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

  const txs     = txOfMonth(month);
  const incomes = incomesOfMonth(month);

  const investIds     = getInvestCatIds();
  const txExpenses    = txs.filter(t => !investIds.includes(t.categoryId));
  const txInvestments = txs.filter(t =>  investIds.includes(t.categoryId));

  const totalIncome   = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpense  = txExpenses.reduce((s, t) => s + (t.amount || 0), 0);
  const totalInvested = txInvestments.reduce((s, t) => s + (t.amount || 0), 0);
  const saldoLivre    = totalIncome - totalExpense - totalInvested;
  const guardado      = totalInvested + Math.max(0, saldoLivre);
  const taxa          = totalIncome > 0 ? Math.round((guardado / totalIncome) * 100) : 0;
  const saldoCls      = saldoLivre >= 0 ? 'positive' : 'negative';

  const totalAssetInvest = state.assets
    .filter(a => a.type === 'investimento')
    .reduce((s, a) => s + (a.currentValue || 0), 0);

  // ── Renderiza HTML dos KPIs (substitui skeleton) ─────────────────────
  const kpiGrid = document.getElementById('kpi-grid');
  if (kpiGrid) {
    kpiGrid.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Receitas</span>
          <div class="kpi-icon">💰</div>
        </div>
        <span class="kpi-value positive" id="kpi-receitas">${fmt(totalIncome)}</span>
        <div class="kpi-delta">mês ${esc(monthLabel(month))}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Despesas</span>
          <div class="kpi-icon">💳</div>
        </div>
        <span class="kpi-value negative" id="kpi-despesas">${fmt(totalExpense)}</span>
        <div class="kpi-delta">excluindo investimentos</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Saldo livre</span>
          <div class="kpi-icon">📊</div>
        </div>
        <span class="kpi-value ${saldoCls}" id="kpi-saldo">${fmt(saldoLivre)}</span>
        <div class="kpi-delta" id="kpi-taxa">${totalIncome === 0 ? 'Cadastre suas receitas' : taxa + '% da renda guardada'}</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-label">Investido</span>
          <div class="kpi-icon">📈</div>
        </div>
        <span class="kpi-value gold" id="kpi-investido">${fmt(totalInvested)}</span>
        <div class="kpi-delta" id="kpi-investido-total">${totalAssetInvest > 0 ? 'Total patrimônio: ' + fmt(totalAssetInvest) : 'no mês'}</div>
      </div>`;
  }

  document.getElementById('chart-cat-month') && (document.getElementById('chart-cat-month').textContent = monthLabel(month));

  // Insights automáticos
  renderInsights();

  renderChartCategorias(txExpenses);
  renderChartEvolucao();
  renderParcelasPrevisao();
  renderOrcamentoDashboard(txExpenses, month);
}

// ─── GRÁFICO DE CATEGORIAS (PIZZA COM TOTAL NO CENTRO) ─────────────────────
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
  const total  = values.reduce((s, v) => s + v, 0);

  const totalEl = document.getElementById('pizza-total-value');
  if (totalEl) totalEl.textContent = fmt(total);

  const canvas = document.getElementById('chart-categorias');
  if (chartCategorias) chartCategorias.destroy();

  if (!values.length) {
    // Empty state: small gray ring placeholder
    chartCategorias = new Chart(canvas, {
      type: 'doughnut',
      data: { labels: ['Sem dados'], datasets: [{ data: [1], backgroundColor: ['#2c2c2c'], borderWidth: 0 }] },
      options: { responsive: true, plugins: { legend: { display: false }, tooltip: { enabled: false } }, cutout: '68%' },
    });
    const legend = document.getElementById('pizza-legend');
    if (legend) legend.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:0.82rem">Sem gastos neste mês</p>';
    return;
  }

  chartCategorias = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: 'var(--bg-card)',
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${fmt(ctx.raw)} (${((ctx.raw/total)*100).toFixed(1)}%)`,
          },
        },
      },
    },
  });

  // Legenda customizada abaixo do gráfico
  const legend = document.getElementById('pizza-legend');
  if (legend) {
    legend.innerHTML = sorted.map(([name, val], i) => {
      const pct = ((val / total) * 100).toFixed(1);
      return `
        <div style="display:flex;align-items:center;gap:0.6rem;padding:0.5rem 0;border-bottom:1px solid var(--border-soft)">
          <span style="width:10px;height:10px;border-radius:50%;background:${colors[i]};flex-shrink:0"></span>
          <span style="flex:1;font-size:0.85rem;color:var(--text-secondary)">${esc(name)}</span>
          <span style="font-size:0.74rem;color:var(--text-muted)">${pct}%</span>
          <span style="font-family:var(--font-mono);font-size:0.85rem;color:var(--text-primary);min-width:80px;text-align:right">${fmt(val)}</span>
        </div>`;
    }).join('');
  }
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
        { label: 'Receitas',  data: receitas,  backgroundColor: 'rgba(30,177,27,0.30)',   borderColor: '#1eb11b', borderWidth: 1.5, borderRadius: 3 },
        { label: 'Despesas',  data: despesas,  backgroundColor: 'rgba(248,113,113,0.25)', borderColor: '#f87171', borderWidth: 1.5, borderRadius: 3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', align: 'end', labels: { color: '#a3a3a3', font: { family: 'Outfit', size: 10 }, boxWidth: 8, boxHeight: 8, padding: 10 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.raw)}` } },
      },
      scales: {
        x: { ticks: { color: '#a3a3a3', font: { family: 'Outfit', size: 10 } }, grid: { display: false } },
        y: {
          ticks: {
            color: '#a3a3a3', font: { family: 'JetBrains Mono', size: 9 },
            callback: v => maxVal >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${v}`,
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
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
      <span class="parcela-desc" title="${esc(p.description)}">${esc(p.description)}</span>
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
              ${esc(cat?.name || catId)}
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
