/**
 * metas.js — Aba de metas financeiras
 */

import { state, fmt, toast, esc } from './utils.js';
import { saveGoal, deleteGoal } from './db.js';

let _metasInit = false;

export function renderMetas() {
  if (!_metasInit) {
    _initMetasEvents();
    _metasInit = true;
  }
  _renderMetasGrid();
}

function _renderMetasGrid() {
  const grid = document.getElementById('metas-grid');

  if (!state.goals.length) {
    grid.innerHTML = '<p class="empty-state" style="grid-column:1/-1">Nenhuma meta criada ainda. Que tal começar com uma reserva de emergência?</p>';
    return;
  }

  const tipoLabel = {
    reserva_emergencia: 'Reserva de emergência',
    aposentadoria: 'Aposentadoria',
    viagem: 'Viagem',
    compra: 'Compra de bem',
    outro: 'Outro objetivo',
  };

  grid.innerHTML = state.goals.map(g => {
    const pct     = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
    const prazoFmt = g.deadline
      ? new Date(g.deadline + 'T12:00:00').toLocaleDateString('pt-BR', {month:'short', year:'numeric'})
      : 'Sem prazo';
    const aportes  = (g.contributions || []);
    const totalAp  = aportes.reduce((s, a) => s + (a.amount || 0), 0);

    return `
      <div class="meta-card">
        <div class="meta-card-header">
          <span class="meta-nome">${esc(g.name)}</span>
          <span class="meta-tipo-tag">${esc(tipoLabel[g.type] || g.type)}</span>
        </div>
        <div class="meta-values">
          <span class="meta-atual-val">${fmt(g.currentAmount || 0)}</span>
          <span class="meta-alvo-val">de ${fmt(g.targetAmount)}</span>
        </div>
        <div class="meta-progress-bar">
          <div class="meta-progress-fill" style="width:${pct.toFixed(1)}%"></div>
        </div>
        <div class="meta-footer">
          <span>${pct.toFixed(0)}% concluído · Prazo: ${prazoFmt}</span>
          <div class="meta-actions">
            <button class="btn btn-xs btn-secondary" data-action="aporte-meta" data-id="${g.id}">+ Aporte</button>
            <button class="btn-icon-only" data-action="edit-meta" data-id="${g.id}">✎</button>
            <button class="btn-icon-only danger" data-action="delete-meta" data-id="${g.id}">✕</button>
          </div>
        </div>
        ${aportes.length ? `
          <div style="margin-top:0.75rem;border-top:1px solid var(--border);padding-top:0.6rem">
            <span style="font-size:0.72rem;color:var(--text-muted)">${aportes.length} aporte(s) · total: ${fmt(totalAp)}</span>
          </div>` : ''}
      </div>`;
  }).join('');
}

function _initMetasEvents() {
  document.getElementById('btn-nova-meta').addEventListener('click', () => {
    _openMetaModal(null);
  });

  document.getElementById('btn-salvar-meta').addEventListener('click', _salvarMeta);
  document.getElementById('btn-salvar-aporte').addEventListener('click', _salvarAporte);

  document.getElementById('metas-grid').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.dataset.action === 'edit-meta') {
      const g = state.goals.find(x => x.id === id);
      if (g) _openMetaModal(g);
    }
    if (btn.dataset.action === 'delete-meta') {
      if (!confirm('Excluir esta meta?')) return;
      await deleteGoal(id);
      toast('Meta excluída.', 'success');
      _renderMetasGrid();
    }
    if (btn.dataset.action === 'aporte-meta') {
      document.getElementById('aporte-meta-id').value = id;
      document.getElementById('aporte-valor').value   = '';
      document.getElementById('aporte-data').value    = new Date().toISOString().slice(0,10);
      document.getElementById('aporte-obs').value     = '';
      document.getElementById('modal-aporte').classList.remove('hidden');
    }
  });
}

function _openMetaModal(g) {
  document.getElementById('modal-meta-title').textContent = g ? 'Editar Meta' : 'Nova Meta';
  document.getElementById('meta-id').value      = g?.id || '';
  document.getElementById('meta-nome').value    = g?.name || '';
  document.getElementById('meta-tipo').value    = g?.type || 'reserva_emergencia';
  document.getElementById('meta-alvo').value    = g?.targetAmount || '';
  document.getElementById('meta-atual').value   = g?.currentAmount || '';
  document.getElementById('meta-prazo').value   = g?.deadline || '';
  document.getElementById('modal-meta').classList.remove('hidden');
}

async function _salvarMeta() {
  const id      = document.getElementById('meta-id').value || null;
  const name    = document.getElementById('meta-nome').value.trim();
  const type    = document.getElementById('meta-tipo').value;
  const target  = parseFloat(document.getElementById('meta-alvo').value);
  const current = parseFloat(document.getElementById('meta-atual').value) || 0;
  const deadline = document.getElementById('meta-prazo').value;

  if (!name)           return toast('Informe o nome da meta.', 'error');
  if (!target || target <= 0) return toast('Informe o valor alvo.', 'error');

  const existing = id ? state.goals.find(g => g.id === id) : null;
  await saveGoal({
    name, type, targetAmount: target, currentAmount: current,
    deadline, contributions: existing?.contributions || [],
  }, id);

  document.getElementById('modal-meta').classList.add('hidden');
  toast('Meta salva!', 'success');
  _renderMetasGrid();
}

async function _salvarAporte() {
  const metaId = document.getElementById('aporte-meta-id').value;
  const amount = parseFloat(document.getElementById('aporte-valor').value);
  const date   = document.getElementById('aporte-data').value;
  const obs    = document.getElementById('aporte-obs').value.trim();

  if (!amount || amount <= 0) return toast('Informe um valor para o aporte.', 'error');

  const goal = state.goals.find(g => g.id === metaId);
  if (!goal) return;

  const contributions = [...(goal.contributions || []), { amount, date, obs }];
  const newCurrent    = (goal.currentAmount || 0) + amount;

  await saveGoal({ ...goal, currentAmount: newCurrent, contributions }, metaId);

  document.getElementById('modal-aporte').classList.add('hidden');
  toast(`Aporte de ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(amount)} registrado!`, 'success');
  _renderMetasGrid();
}
