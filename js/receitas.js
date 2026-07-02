/**
 * receitas.js — Aba de receitas e orçamento mensal
 */

import { state, fmt, toast, esc } from './utils.js';
import { incomesOfMonth, saveIncome, deleteIncome } from './db.js';

let _receitasInit = false;

export function renderReceitas() {
  if (!_receitasInit) {
    _initReceitasEvents();
    _receitasInit = true;
  }
  _renderReceitasTable();
}

function _renderReceitasTable() {
  const month  = state.currentMonth;
  const items  = incomesOfMonth(month);
  const tbody  = document.getElementById('receitas-tbody');
  const total  = items.reduce((s, i) => s + (i.amount || 0), 0);

  document.getElementById('receitas-total').textContent = fmt(total);

  const tipoLabel = {
    salario: 'Salário', vale_alimentacao: 'V. Alimentação', vale_transporte: 'V. Transporte',
    reembolso: 'Reembolso', presente: 'Presente', outro: 'Outra',
  };

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-row">Nenhuma receita registrada neste mês.</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(i => `
    <tr>
      <td>${esc(tipoLabel[i.type] || i.type)}</td>
      <td>${esc(i.description) || '—'}</td>
      <td class="col-value"><span class="val-mono val-positive">${fmt(i.amount)}</span></td>
      <td class="col-actions">
        <button class="btn-icon-only" data-action="edit-income" data-id="${i.id}">✎</button>
        <button class="btn-icon-only danger" data-action="delete-income" data-id="${i.id}">✕</button>
      </td>
    </tr>`).join('');
}

function _initReceitasEvents() {
  document.getElementById('btn-nova-receita').addEventListener('click', () => {
    document.getElementById('receita-id').value    = '';
    document.getElementById('receita-tipo').value  = 'salario';
    document.getElementById('receita-desc').value  = '';
    document.getElementById('receita-valor').value = '';
    document.getElementById('receita-data').value  = _today();
    document.getElementById('modal-receita-title').textContent = 'Nova Receita';
    document.getElementById('modal-receita').classList.remove('hidden');
  });

  document.getElementById('btn-salvar-receita').addEventListener('click', async () => {
    const id     = document.getElementById('receita-id').value || null;
    const tipo   = document.getElementById('receita-tipo').value;
    const desc   = document.getElementById('receita-desc').value.trim();
    const amount = parseFloat(document.getElementById('receita-valor').value);
    const date   = document.getElementById('receita-data').value;

    if (!amount || amount <= 0) return toast('Informe um valor válido.', 'error');

    await saveIncome({ type: tipo, description: desc, amount, date, month: state.currentMonth }, id);
    document.getElementById('modal-receita').classList.add('hidden');
    toast('Receita salva!', 'success');
    _renderReceitasTable();
  });

  document.getElementById('receitas-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit-income') {
      const i = state.incomes.find(x => x.id === id);
      if (!i) return;
      document.getElementById('receita-id').value    = i.id;
      document.getElementById('receita-tipo').value  = i.type;
      document.getElementById('receita-desc').value  = i.description || '';
      document.getElementById('receita-valor').value = i.amount;
      document.getElementById('receita-data').value  = i.date || '';
      document.getElementById('modal-receita-title').textContent = 'Editar Receita';
      document.getElementById('modal-receita').classList.remove('hidden');
    }
    if (btn.dataset.action === 'delete-income') {
      if (!confirm('Excluir esta receita?')) return;
      await deleteIncome(id);
      toast('Receita excluída.', 'success');
      _renderReceitasTable();
    }
  });

  // Copiar receitas do mês anterior (receitas manuais; extratos ficam de fora)
  document.getElementById('btn-copiar-receitas')?.addEventListener('click', async () => {
    const prev = _offsetMonth(state.currentMonth, -1);
    const fromPrev = state.incomes.filter(i =>
      i.month === prev && i.source !== 'statement_import'
    );
    if (!fromPrev.length) return toast('Nenhuma receita manual no mês anterior.', 'warning');
    if (!confirm(`Copiar ${fromPrev.length} receita(s) de ${prev} para ${state.currentMonth}?`)) return;

    for (const inc of fromPrev) {
      // Mantém o dia original, ajustando para o mês atual
      const day = (inc.date || '').slice(8, 10) || '01';
      const [y, m] = state.currentMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const safeDay = Math.min(parseInt(day, 10) || 1, lastDay);
      await saveIncome({
        type: inc.type, description: inc.description, amount: inc.amount,
        date: `${state.currentMonth}-${String(safeDay).padStart(2, '0')}`,
        month: state.currentMonth,
      });
    }
    toast(`${fromPrev.length} receita(s) copiada(s)!`, 'success');
    _renderReceitasTable();
  });
}

function _offsetMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _today() { return new Date().toISOString().slice(0, 10); }
