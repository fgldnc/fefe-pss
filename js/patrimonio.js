/**
 * patrimonio.js — Aba de patrimônio (investimentos, caixa, bens pessoais)
 */

import { state, fmt, toast, esc } from './app.js';
import { saveAsset, deleteAsset } from './db.js';

let _patrimonioInit = false;

export function renderPatrimonio() {
  if (!_patrimonioInit) {
    _initPatrimonioEvents();
    _patrimonioInit = true;
  }
  _renderAtivos();
}

function _renderAtivos() {
  const ativos = state.assets;

  // KPIs por tipo
  const invest = ativos.filter(a => a.type === 'investimento').reduce((s, a) => s + (a.currentValue || 0), 0);
  const caixa  = ativos.filter(a => a.type === 'caixa').reduce((s, a) => s + (a.currentValue || 0), 0);
  const bens   = ativos.filter(a => a.type === 'bem_pessoal').reduce((s, a) => s + _valorDepreciado(a), 0);

  document.getElementById('pat-investimentos').textContent = fmt(invest);
  document.getElementById('pat-caixa').textContent         = fmt(caixa);
  document.getElementById('pat-bens').textContent          = fmt(bens);

  const tbody = document.getElementById('ativos-tbody');

  if (!ativos.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Nenhum ativo ou bem cadastrado.</td></tr>`;
    return;
  }

  const tipoLabel = { investimento: 'Investimento', caixa: 'Caixa', bem_pessoal: 'Bem pessoal' };
  const tipoColor = { investimento: 'var(--gold)', caixa: 'var(--positive)', bem_pessoal: 'var(--info)' };

  tbody.innerHTML = ativos.map(a => {
    const valorAtual = a.type === 'bem_pessoal' ? _valorDepreciado(a) : (a.currentValue || 0);
    const dateFmt    = a.acquiredAt
      ? new Date(a.acquiredAt + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'2-digit'})
      : '—';

    return `
      <tr>
        <td>${esc(a.name)}</td>
        <td><span style="color:${tipoColor[a.type] || 'var(--text-secondary)'};">${tipoLabel[a.type] || a.type}</span></td>
        <td class="col-value"><span class="val-mono">${fmt(a.initialValue || 0)}</span></td>
        <td class="col-value"><span class="val-mono val-positive">${fmt(valorAtual)}</span></td>
        <td>${dateFmt}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(a.notes || '')}">${esc(a.notes) || '—'}</td>
        <td class="col-actions">
          <button class="btn-icon-only" data-action="edit-asset" data-id="${a.id}">✎</button>
          <button class="btn-icon-only danger" data-action="delete-asset" data-id="${a.id}">✕</button>
        </td>
      </tr>`;
  }).join('');
}

/** Calcula valor depreciado de um bem pessoal */
function _valorDepreciado(a) {
  if (a.type !== 'bem_pessoal' || !a.depreciationRate || !a.acquiredAt) {
    return a.currentValue || 0;
  }
  const years     = (Date.now() - new Date(a.acquiredAt).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const remaining = Math.pow(1 - (a.depreciationRate / 100), years);
  return Math.max(0, (a.initialValue || 0) * remaining);
}

function _initPatrimonioEvents() {
  document.getElementById('btn-novo-ativo').addEventListener('click', () => {
    _openAtivoModal(null);
  });

  // Mostrar campo de depreciação apenas para bem pessoal
  document.getElementById('ativo-tipo').addEventListener('change', (e) => {
    document.getElementById('deprec-row').style.display =
      e.target.value === 'bem_pessoal' ? 'flex' : 'none';
  });

  document.getElementById('btn-salvar-ativo').addEventListener('click', _salvarAtivo);

  document.getElementById('ativos-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit-asset') {
      const a = state.assets.find(x => x.id === id);
      if (a) _openAtivoModal(a);
    }
    if (btn.dataset.action === 'delete-asset') {
      if (!confirm('Excluir este ativo?')) return;
      await deleteAsset(id);
      toast('Ativo excluído.', 'success');
      _renderAtivos();
    }
  });
}

function _openAtivoModal(a) {
  document.getElementById('modal-ativo-title').textContent = a ? 'Editar Ativo' : 'Novo Ativo / Bem';
  document.getElementById('ativo-id').value           = a?.id || '';
  document.getElementById('ativo-nome').value         = a?.name || '';
  document.getElementById('ativo-tipo').value         = a?.type || 'investimento';
  document.getElementById('ativo-valor-inicial').value = a?.initialValue || '';
  document.getElementById('ativo-valor-atual').value  = a?.currentValue || '';
  document.getElementById('ativo-data').value         = a?.acquiredAt || '';
  document.getElementById('ativo-deprec').value       = a?.depreciationRate || '';
  document.getElementById('ativo-obs').value          = a?.notes || '';
  document.getElementById('deprec-row').style.display =
    (a?.type === 'bem_pessoal') ? 'flex' : 'none';
  document.getElementById('modal-ativo').classList.remove('hidden');
}

async function _salvarAtivo() {
  const id      = document.getElementById('ativo-id').value || null;
  const name    = document.getElementById('ativo-nome').value.trim();
  const type    = document.getElementById('ativo-tipo').value;
  const initial = parseFloat(document.getElementById('ativo-valor-inicial').value) || 0;
  const current = parseFloat(document.getElementById('ativo-valor-atual').value);
  const date    = document.getElementById('ativo-data').value;
  const deprec  = parseFloat(document.getElementById('ativo-deprec').value) || 0;
  const notes   = document.getElementById('ativo-obs').value.trim();

  if (!name)              return toast('Informe o nome do ativo.', 'error');
  if (!current || current < 0) return toast('Informe o valor atual.', 'error');

  await saveAsset({ name, type, initialValue: initial, currentValue: current,
    acquiredAt: date, depreciationRate: deprec, notes }, id);

  document.getElementById('modal-ativo').classList.add('hidden');
  toast('Ativo salvo!', 'success');
  _renderAtivos();
}
