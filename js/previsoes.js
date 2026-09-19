/**
 * previsoes.js — o que sobrou do antigo dashboard.js
 *
 * Na rodada 3 do redesign v2 a "Visão do mês" virou `js/mes.js`. Dos seis
 * blocos daquele dashboard, quatro foram absorvidos por lá (KPIs, rosca,
 * insights, orçamento × real) e dois NÃO falam do mês corrente: as parcelas
 * dos próximos 3 meses e a evolução dos últimos 6. Esses dois são assunto de
 * "Adiante", e é para lá que eles vieram — inteiros, sem recalcular nada.
 *
 * A rodada 4 redesenha Adiante e decide onde eles ficam dentro dela; até lá
 * continuam sendo os mesmos dois cards, com a mesma conta.
 */

import { state, fmt, esc, monthLabel, offsetMonth, getInvestCatIds } from './utils.js';
import { allExpensesOfMonth, incomesOfMonth } from './db.js';

// Chart.js pinta em canvas e NÃO resolve var(--…). A cor é lida do token no
// momento de montar o gráfico, nunca fixada em hex aqui: hex literal é a
// regressão conhecida deste arquivo.
function token(nome, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return v || fallback;
}

/** Mesma cor do traço, translúcida, para o corpo da barra. */
function suave(nome, alpha) {
  const hex = token(nome, '#7E8999').replace('#', '');
  const n = parseInt(hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex, 16);
  return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${alpha})`;
}

let chartEvolucao = null;

export function renderPrevisoes() {
  const sec = document.getElementById('tab-previsoes');
  if (!sec) return;

  sec.innerHTML = `
    <div class="faixa">
      <div class="folha">
        <p class="rot">Parcelas previstas</p>
        <p class="rot-sub">O que já está contratado para os próximos 3 meses — dinheiro
          que sai mesmo sem ninguém decidir nada.</p>
        <div id="parcelas-list" class="parcelas-list"></div>
      </div>
      <div class="folha">
        <p class="rot">Evolução — 6 meses</p>
        <p class="rot-sub">Receita, despesa e investimento mês a mês. Investimento é barra
          própria: ele não é gasto.</p>
        <div class="evolucao-box"><canvas id="chart-evolucao"></canvas></div>
      </div>
    </div>`;

  _renderParcelas();
  _renderEvolucao();
}

// ─── SÉRIE DE 6 MESES ──────────────────────────────────────────────────────
function getSeries6m(investIds = getInvestCatIds()) {
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(offsetMonth(state.currentMonth, -i));
  return {
    months,
    labels:    months.map(m => monthLabel(m).slice(0, 3)),
    receitas:  months.map(m => incomesOfMonth(m).reduce((s, i) => s + (i.amount || 0), 0)),
    despesas:  months.map(m => allExpensesOfMonth(m).filter(t => !investIds.includes(t.categoryId)).reduce((s, t) => s + (t.amount || 0), 0)),
    investido: months.map(m => allExpensesOfMonth(m).filter(t =>  investIds.includes(t.categoryId)).reduce((s, t) => s + (t.amount || 0), 0)),
  };
}

// ─── PARCELAS FUTURAS ──────────────────────────────────────────────────────
function _renderParcelas() {
  const current = state.currentMonth;
  const next3   = [offsetMonth(current, 1), offsetMonth(current, 2), offsetMonth(current, 3)];
  const parcelas = state.transactions
    .filter(t => next3.includes(t.competenceMonth) && t.installmentTotal > 1)
    .sort((a, b) => a.competenceMonth.localeCompare(b.competenceMonth));

  const list = document.getElementById('parcelas-list');
  if (!parcelas.length) {
    list.innerHTML = `<p class="rot-sub" style="margin:0">Nenhuma parcela prevista nos próximos 3 meses.</p>`;
    return;
  }
  list.innerHTML = parcelas.slice(0, 10).map(p => `
    <div class="parcela-item">
      <span class="parcela-desc" title="${esc(p.description)}">${esc(p.description)}</span>
      <div class="parcela-info">
        <span class="parcela-num">${p.installmentCurrent}/${p.installmentTotal}</span>
        <span class="parcela-val">${fmt(p.amount)}</span>
        <span class="parcela-mes">${monthLabel(p.competenceMonth).slice(0, 3).toLowerCase()}</span>
      </div>
    </div>`).join('')
    + `<button type="button" class="kpi-goto parcelas-goto" data-goto="gastos" data-filtro-proj="1">ver todas em Mês</button>`;
}

// ─── EVOLUÇÃO MENSAL ───────────────────────────────────────────────────────
function _renderEvolucao() {
  const { labels, receitas, despesas, investido } = getSeries6m();
  const maxVal = Math.max(...receitas, ...despesas, ...investido, 1);

  const canvas = document.getElementById('chart-evolucao');
  if (chartEvolucao) chartEvolucao.destroy();

  const tinta  = token('--ink-3', '#616B79');
  const grade  = token('--borda', '#E2E8F1');
  const fonte  = 'Outfit';

  chartEvolucao = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Receitas',  data: receitas,  backgroundColor: suave('--entrou', 0.22),   borderColor: token('--entrou', '#0E7C4C'),   borderWidth: 1.5, borderRadius: 3 },
        { label: 'Despesas',  data: despesas,  backgroundColor: suave('--saiu', 0.20),     borderColor: token('--saiu', '#BE3729'),     borderWidth: 1.5, borderRadius: 3 },
        // Investimento não é gasto: cor de série, não a de saída.
        { label: 'Investido', data: investido, backgroundColor: suave('--s5', 0.18),       borderColor: token('--s5', '#6B4BC9'),       borderWidth: 1.5, borderRadius: 3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', align: 'end', labels: { color: tinta, font: { family: fonte, size: 10 }, boxWidth: 8, boxHeight: 8, padding: 10 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.raw)}` } },
      },
      scales: {
        x: { ticks: { color: tinta, font: { family: fonte, size: 9 }, maxRotation: 0, autoSkip: false }, grid: { display: false } },
        y: {
          ticks: {
            color: tinta, font: { family: fonte, size: 9 },
            callback: v => maxVal >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v}`,
          },
          grid: { color: grade },
        },
      },
    },
  });
}
