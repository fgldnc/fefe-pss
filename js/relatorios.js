/**
 * relatorios.js — Relatórios exportáveis (CSV e JSON)
 */

import { state, fmt, monthLabel, offsetMonth, esc, toast, isOfMonth, getInvestCatIds } from './utils.js';
import { allExpensesOfMonth, incomesOfMonth } from './db.js';

// ─── RENDER DA SEÇÃO ──────────────────────────────────────────
export function renderRelatorios() {
  const container = document.getElementById('tab-relatorios');
  if (!container) return;

  const month = state.currentMonth;

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem">

      ${_reportCard({
        icon: '📊',
        title: 'Gastos por categoria',
        desc: `Resumo de ${monthLabel(month)} com total por categoria e percentual.`,
        id: 'rel-cat',
      })}

      ${_reportCard({
        icon: '📈',
        title: 'Evolução mensal',
        desc: 'Receitas, despesas e saldo dos últimos 12 meses.',
        id: 'rel-evolucao',
      })}

      ${_reportCard({
        icon: '📋',
        title: 'Orçamento × Realizado',
        desc: `Comparativo do mês ${monthLabel(month)}.`,
        id: 'rel-orcamento',
      })}

      ${_reportCard({
        icon: '📅',
        title: 'Parcelas futuras',
        desc: 'Todas as parcelas projetadas nos próximos 6 meses.',
        id: 'rel-parcelas',
      })}

      ${_reportCard({
        icon: '🏦',
        title: 'Todas as transações',
        desc: `Lançamentos de ${monthLabel(month)} em detalhes.`,
        id: 'rel-transacoes',
      })}

      ${_reportCard({
        icon: '🎯',
        title: 'Metas',
        desc: 'Status e progresso de todas as metas.',
        id: 'rel-metas',
      })}

    </div>`;

  // Bind buttons
  container.querySelectorAll('[data-export]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id     = btn.dataset.export;
      const format = btn.dataset.format;
      _runExport(id, format);
    });
  });
}

function _reportCard({ icon, title, desc, id }) {
  return `
    <div class="card" style="padding:1.25rem">
      <div style="display:flex;align-items:flex-start;gap:0.75rem;margin-bottom:0.75rem">
        <div style="font-size:1.5rem;flex-shrink:0">${icon}</div>
        <div>
          <div style="font-weight:600;font-size:0.9rem;color:var(--text-primary)">${title}</div>
          <div style="font-size:0.78rem;color:var(--text-muted);margin-top:0.2rem;line-height:1.4">${desc}</div>
        </div>
      </div>
      <div style="display:flex;gap:0.5rem">
        <button class="btn btn-ghost btn-sm" data-export="${id}" data-format="csv">
          ↓ CSV
        </button>
        <button class="btn btn-ghost btn-sm" data-export="${id}" data-format="json">
          ↓ JSON
        </button>
      </div>
    </div>`;
}

// ─── EXPORTS ──────────────────────────────────────────────────
function _runExport(id, format) {
  const month = state.currentMonth;
  let data, filename;

  try {
    switch (id) {
      case 'rel-cat': {
        const rows = _gastosPorCategoria(month);
        data     = rows;
        filename = `gastos-categoria-${month}`;
        break;
      }
      case 'rel-evolucao': {
        data     = _evolucaoMensal();
        filename = `evolucao-mensal`;
        break;
      }
      case 'rel-orcamento': {
        data     = _orcamentoRealizado(month);
        filename = `orcamento-${month}`;
        break;
      }
      case 'rel-parcelas': {
        data     = _parcelasFuturas(month);
        filename = `parcelas-futuras`;
        break;
      }
      case 'rel-transacoes': {
        data     = _todasTransacoes(month);
        filename = `transacoes-${month}`;
        break;
      }
      case 'rel-metas': {
        data     = _statusMetas();
        filename = `metas`;
        break;
      }
      default:
        toast('Relatório não encontrado.', 'error');
        return;
    }

    if (!data || !data.length) {
      toast('Sem dados para exportar neste período.', 'warning');
      return;
    }

    if (format === 'csv')  _downloadCSV(data, filename);
    if (format === 'json') _downloadJSON(data, filename);

  } catch (err) {
    console.error('Erro ao gerar relatório:', err);
    toast(`Erro ao gerar: ${err.message}`, 'error');
  }
}

// ─── BUILDERS DE DADOS ────────────────────────────────────────
function _gastosPorCategoria(month) {
  // Regra única do app (js/utils.js). A cópia local aqui comparava `id + name`
  // concatenados — ver o comentário em getInvestCatIds.
  const investIds = getInvestCatIds();

  const txs = allExpensesOfMonth(month).filter(t => !investIds.includes(t.categoryId));
  const total = txs.reduce((s, t) => s + (t.amount || 0), 0);

  const catMap = {};
  for (const tx of txs) {
    catMap[tx.categoryId] = (catMap[tx.categoryId] || 0) + (tx.amount || 0);
  }

  return Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .map(([catId, val]) => {
      const cat = state.categories.find(c => c.id === catId);
      return {
        categoria:  cat?.name || catId,
        valor:      val.toFixed(2),
        percentual: total > 0 ? ((val / total) * 100).toFixed(1) + '%' : '0%',
      };
    });
}

function _evolucaoMensal() {
  // Investimento sai da despesa e vira coluna própria — mesma decomposição do
  // KPI e do gráfico de evolução do Dashboard. Antes o relatório somava tudo
  // junto: a mesma pessoa exportava um CSV que discordava da tela que estava
  // olhando, e o "saldo" descontava o aporte como se fosse consumo.
  const investIds = getInvestCatIds();
  const rows = [];
  for (let i = 11; i >= 0; i--) {
    const m     = offsetMonth(state.currentMonth, -i);
    const txs   = allExpensesOfMonth(m);
    const receita   = incomesOfMonth(m).reduce((s, t) => s + (t.amount || 0), 0);
    const despesa   = txs.filter(t => !investIds.includes(t.categoryId))
                         .reduce((s, t) => s + (t.amount || 0), 0);
    const investido = txs.filter(t =>  investIds.includes(t.categoryId))
                         .reduce((s, t) => s + (t.amount || 0), 0);
    rows.push({
      mes:       monthLabel(m),
      receita:   receita.toFixed(2),
      despesa:   despesa.toFixed(2),
      investido: investido.toFixed(2),
      saldo:     (receita - despesa - investido).toFixed(2),
    });
  }
  return rows;
}

function _orcamentoRealizado(month) {
  const budgets = state.budgets[month] || {};
  // Mesma base da aba Orçamento: despesas do mês sem investimento. Sem o filtro,
  // uma categoria de investimento com limite legado aparecia aqui e não lá.
  const investIds = getInvestCatIds();
  const catTotals = {};
  for (const tx of allExpensesOfMonth(month)) {
    if (investIds.includes(tx.categoryId)) continue;
    catTotals[tx.categoryId] = (catTotals[tx.categoryId] || 0) + (tx.amount || 0);
  }
  return Object.entries(budgets).map(([catId, limit]) => {
    const cat   = state.categories.find(c => c.id === catId);
    const real  = catTotals[catId] || 0;
    const delta = limit - real;
    return {
      categoria:    cat?.name || catId,
      orcado:       limit.toFixed(2),
      realizado:    real.toFixed(2),
      diferenca:    delta.toFixed(2),
      status:       real > limit ? 'Acima' : real >= limit * 0.9 ? 'Atenção' : 'OK',
    };
  });
}

function _parcelasFuturas(fromMonth) {
  const rows = [];
  for (let i = 1; i <= 6; i++) {
    const m    = offsetMonth(fromMonth, i);
    const txs  = state.transactions.filter(t => isOfMonth(t, m) && t.installmentTotal > 1);
    for (const tx of txs) {
      const cat = state.categories.find(c => c.id === tx.categoryId);
      rows.push({
        mes:      monthLabel(m),
        descricao: tx.description,
        categoria: cat?.name || '—',
        parcela:  tx.installmentCurrent && tx.installmentTotal
          ? `${tx.installmentCurrent}/${tx.installmentTotal}` : '—',
        valor:    (tx.amount || 0).toFixed(2),
      });
    }
  }
  return rows;
}

function _todasTransacoes(month) {
  return allExpensesOfMonth(month)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map(tx => {
      const cat = state.categories.find(c => c.id === tx.categoryId);
      return {
        data:       tx.date || '',
        descricao:  tx.description || '',
        categoria:  cat?.name || '—',
        tipo:       tx.paymentType || '—',
        valor:      (tx.amount || 0).toFixed(2),
        parcela:    tx.installmentTotal > 1 ? `${tx.installmentCurrent}/${tx.installmentTotal}` : '',
        observacao: tx.notes || '',
      };
    });
}

function _statusMetas() {
  return state.goals.map(g => ({
    meta:       g.name || '—',
    tipo:       g.type || '—',
    alvo:       (g.targetAmount || 0).toFixed(2),
    atual:      (g.currentAmount || 0).toFixed(2),
    progresso:  g.targetAmount > 0
      ? ((g.currentAmount / g.targetAmount) * 100).toFixed(1) + '%' : '0%',
    prazo:      g.deadline || '—',
  }));
}

// ─── DOWNLOAD ─────────────────────────────────────────────────
/**
 * Uma célula que começa com = + - @ (ou tab/CR) é lida como FÓRMULA pelo Excel
 * e pelo Sheets. A descrição vem de fatura e extrato importados, texto que o
 * app não escreveu — prefixar com apóstrofo mantém o conteúdo visível e o
 * desarma. Também trata 0 e false: `row[h] || ''` transformava um zero
 * legítimo em célula vazia.
 */
function _celulaCSV(v) {
  const s = v === null || v === undefined ? '' : String(v);
  const perigosa = /^[=+\-@\t\r]/.test(s);
  return `"${(perigosa ? `'${s}` : s).replace(/"/g, '""')}"`;
}

function _downloadCSV(data, filename) {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows    = [
    headers.join(';'),
    ...data.map(row => headers.map(h => _celulaCSV(row[h])).join(';')),
  ];
  _download(rows.join('\r\n'), `${filename}.csv`, 'text/csv;charset=utf-8');
  toast(`${filename}.csv exportado!`, 'success');
}

function _downloadJSON(data, filename) {
  const json = JSON.stringify({ exportedAt: new Date().toISOString(), data }, null, 2);
  _download(json, `${filename}.json`, 'application/json');
  toast(`${filename}.json exportado!`, 'success');
}

function _download(content, filename, mime) {
  const bom  = mime.includes('csv') ? '\uFEFF' : ''; // BOM para Excel abrir CSV em UTF-8
  const blob = new Blob([bom + content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
