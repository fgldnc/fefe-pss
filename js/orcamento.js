/**
 * orcamento.js — Aba de orçamento mensal
 */

import { state, esc, fmt, toast } from './app.js';
import { saveBudgets }             from './db.js';

export function renderOrcamento() {
  const editor = document.getElementById('orcamento-editor');
  if (!editor) return;

  const month   = state.currentMonth;
  const budgets = state.budgets[month] || {};

  const investIds = state.categories
    .filter(c => (c.id + c.name).toLowerCase().includes('investiment'))
    .map(c => c.id);

  const cats = state.categories.filter(c => !investIds.includes(c.id));

  if (!cats.length) {
    editor.innerHTML = `<p style="color:var(--text-muted);font-size:0.83rem;padding:1rem">Nenhuma categoria cadastrada. Crie categorias em Configurações.</p>`;
    return;
  }

  // Total gasto por categoria no mês
  const spentByCat = {};
  for (const tx of state.transactions.filter(t => t.competenceMonth === month)) {
    spentByCat[tx.categoryId] = (spentByCat[tx.categoryId] || 0) + (tx.amount || 0);
  }

  editor.innerHTML = cats.map(cat => {
    const spent  = spentByCat[cat.id] || 0;
    const limit  = budgets[cat.id]    || 0;
    const pct    = limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
    const cls    = pct >= 100 ? 'over' : pct >= 80 ? 'warn' : 'ok';

    return `
      <div class="orcamento-input-row">
        <span class="orcamento-input-label">
          <span class="cat-dot" style="background:${esc(cat.color || '#888')}"></span>
          ${esc(cat.name)}
          ${limit > 0 ? `<span style="font-size:0.72rem;color:var(--text-muted);margin-left:0.4rem">${fmt(spent)} / ${fmt(limit)}</span>` : ''}
        </span>
        ${limit > 0 ? `
          <div style="flex:1;max-width:180px;margin:0 1rem">
            <div class="progress-bar"><div class="progress-fill progress-${cls}" style="width:${pct}%"></div></div>
          </div>` : '<div style="flex:1"></div>'}
        <input type="number" class="form-input sm budget-input"
          data-cat="${esc(cat.id)}"
          value="${limit > 0 ? limit : ''}"
          placeholder="Sem limite"
          step="50" min="0"
          style="width:130px"
        />
      </div>`;
  }).join('');
}

// Salvar orçamento
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-salvar-orcamento')?.addEventListener('click', async () => {
    const inputs  = document.querySelectorAll('.budget-input');
    const budgetMap = {};
    inputs.forEach(inp => {
      const val = parseFloat(inp.value);
      if (inp.dataset.cat && val > 0) budgetMap[inp.dataset.cat] = val;
    });

    try {
      await saveBudgets(state.currentMonth, budgetMap);
      if (!state.budgets[state.currentMonth]) state.budgets[state.currentMonth] = {};
      Object.assign(state.budgets[state.currentMonth], budgetMap);
      toast('Orçamento salvo com sucesso!', 'success');
      renderOrcamento();
    } catch (err) {
      toast(`Erro ao salvar: ${err.message}`, 'error');
    }
  });
});
