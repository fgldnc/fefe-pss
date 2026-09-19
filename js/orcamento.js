/**
 * orcamento.js — o editor de orçamento (redesign v2, rodada 8)
 *
 * Deixou de ter tela própria: o bloco `#ajustes-orcamento` é montado por
 * `js/ajustes.js`, e este módulo só preenche o `#orcamento-editor` dentro dele
 * e grava. Mesma divisão de `gastos.js` e `receitas.js` na rodada 3.
 *
 * O botão de salvar NÃO leva listener daqui: ele é reinjetado por innerHTML a
 * cada render de Ajustes, e listener preso ao elemento morre com o elemento.
 * Quem chama `salvarOrcamento()` é o listener delegado da tela.
 */

import { state, esc, fmt, toast, splitGastosPorLimite, renderForaDoLimite, getInvestCatIds } from './utils.js';
import { saveBudgets, allExpensesOfMonth } from './db.js';

export function renderOrcamento() {
  const editor = document.getElementById('orcamento-editor');
  if (!editor) return;

  const month   = state.currentMonth;
  const budgets = state.budgets[month] || {};

  const investIds = getInvestCatIds();

  const cats = state.categories.filter(c => !investIds.includes(c.id));

  if (!cats.length) {
    editor.innerHTML = `<p style="color:var(--text-muted);font-size:0.83rem;padding:1rem">Nenhuma categoria cadastrada. O bloco “Categorias”, aqui em cima, é onde se cria a primeira.</p>`;
    return;
  }

  // Mesma partição do card do Dashboard, sobre a mesma base (despesas do mês
  // sem investimento): o número dos dois tem de ser idêntico para o mesmo mês.
  const txs   = allExpensesOfMonth(month).filter(t => !investIds.includes(t.categoryId));
  const split = splitGastosPorLimite(txs, budgets, cats);
  const spentByCat = {};
  for (const tx of txs) {
    if (tx.type === 'transfer' || !tx.categoryId) continue;
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
          <span class="cat-dot" style="background:${esc(cat.color || '#616B79')}"></span>
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
  }).join('') + `<div class="orcamento-list orc-fechamento">${renderForaDoLimite(split, month)}</div>`;
}

/**
 * Lê os campos da tela e grava o orçamento do mês do topo. Exportada porque
 * quem dispara é o listener delegado de `js/ajustes.js` — o botão é reinjetado
 * a cada render e não pode carregar listener próprio.
 */
export async function salvarOrcamento() {
  const budgetMap = {};
  document.querySelectorAll('.budget-input').forEach(inp => {
    const val = parseFloat(inp.value);
    if (inp.dataset.cat && val > 0) budgetMap[inp.dataset.cat] = val;
  });

  try {
    await saveBudgets(state.currentMonth, budgetMap);
    // O mês inteiro é SUBSTITUÍDO, não mesclado. `saveBudgets` apaga no
    // Firestore o teto que saiu da tela; com `Object.assign` o teto apagado
    // sobrevivia no `state` até o próximo reload, e a barra de progresso
    // continuava medindo contra um limite que já não existia.
    state.budgets[state.currentMonth] = { ...budgetMap };
    toast('Orçamento salvo!', 'success');
    renderOrcamento();
  } catch (err) {
    toast(`Erro ao salvar: ${err.message}`, 'error');
  }
}
