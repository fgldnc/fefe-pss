/**
 * patrimonio.js — Aba de patrimônio (investimentos, caixa, bens pessoais)
 */

import { state, fmt, toast, esc } from './utils.js';
import { saveAsset, deleteAsset, addAporteToAsset } from './db.js';

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

  const total = invest + caixa + bens;

  document.getElementById('pat-investimentos').textContent = fmt(invest);
  document.getElementById('pat-caixa').textContent         = fmt(caixa);
  document.getElementById('pat-bens').textContent          = fmt(bens);

  // Total do patrimônio
  const totalEl = document.getElementById('pat-total');
  if (totalEl) totalEl.textContent = fmt(total);
  const totalDeltaEl = document.getElementById('pat-total-sub');
  if (totalDeltaEl) {
    const parts = [];
    if (invest > 0) parts.push(`Invest: ${fmt(invest)}`);
    if (caixa  > 0) parts.push(`Caixa: ${fmt(caixa)}`);
    if (bens   > 0) parts.push(`Bens: ${fmt(bens)}`);
    totalDeltaEl.textContent = parts.join(' · ') || 'Nenhum ativo cadastrado';
  }

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

    const aportes  = a.contributions || [];
    const isInvest = a.type === 'investimento';
    const totalAp  = aportes.reduce((s, x) => s + (x.amount || 0), 0);

    // Nome + toggle do histórico de aportes (quando existir)
    const nameCell = `
      ${esc(a.name)}
      ${aportes.length ? `
        <button class="btn-toggle-aportes-ativo" data-asset-id="${a.id}"
          style="display:flex;align-items:center;gap:0.35rem;background:none;border:none;cursor:pointer;padding:0.2rem 0 0;color:var(--text-muted);font-family:var(--font-sans)">
          <span class="aporte-chevron" style="font-size:0.6rem;transition:transform 0.15s">▶</span>
          <span style="font-size:0.7rem">${aportes.length} aporte(s) · ${fmt(totalAp)}</span>
        </button>` : ''}`;

    // Linha expansível com o histórico (escondida por padrão)
    const sourceLabel = { statement_import: 'extrato', gasto_manual: 'gasto', manual: 'manual' };
    const detailRow = aportes.length ? `
      <tr class="aportes-ativo-row hidden" data-asset-id="${a.id}">
        <td colspan="7" style="padding:0.4rem 1.25rem 0.8rem;background:rgba(255,255,255,0.02)">
          ${[...aportes].sort((x, y) => (y.date || '').localeCompare(x.date || '')).map(ap => `
            <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:0.76rem;padding:0.32rem 0;border-bottom:1px solid var(--border-soft)">
              <span style="color:var(--text-secondary)">
                ${ap.date ? new Date(ap.date + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                ${ap.obs ? `<span style="color:var(--text-muted)"> · ${esc(ap.obs)}</span>` : ''}
                <span style="color:var(--text-muted);font-size:0.68rem"> (${sourceLabel[ap.source] || ap.source || 'manual'})</span>
              </span>
              <span style="font-family:var(--font-mono);color:var(--gold);flex-shrink:0;margin-left:0.5rem">+${fmt(ap.amount)}</span>
            </div>`).join('')}
        </td>
      </tr>` : '';

    return `
      <tr>
        <td>${nameCell}</td>
        <td><span style="color:${tipoColor[a.type] || 'var(--text-secondary)'};">${tipoLabel[a.type] || a.type}</span></td>
        <td class="col-value"><span class="val-mono">${fmt(a.initialValue || 0)}</span></td>
        <td class="col-value"><span class="val-mono val-positive">${fmt(valorAtual)}</span></td>
        <td>${dateFmt}</td>
        <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(a.notes || '')}">${esc(a.notes) || '—'}</td>
        <td class="col-actions">
          ${isInvest ? `<button class="btn btn-xs btn-secondary" data-action="aporte-asset" data-id="${a.id}">+ Aporte</button>` : ''}
          <button class="btn-icon-only" data-action="edit-asset" data-id="${a.id}">✎</button>
          <button class="btn-icon-only danger" data-action="delete-asset" data-id="${a.id}">✕</button>
        </td>
      </tr>${detailRow}`;
  }).join('');

  // Toggle do histórico de aportes
  tbody.querySelectorAll('.btn-toggle-aportes-ativo').forEach(btn => {
    btn.addEventListener('click', () => {
      const id  = btn.dataset.assetId;
      const row = tbody.querySelector(`.aportes-ativo-row[data-asset-id="${id}"]`);
      const chevron = btn.querySelector('.aporte-chevron');
      if (!row) return;
      const willShow = row.classList.contains('hidden');
      row.classList.toggle('hidden', !willShow);
      if (chevron) chevron.style.transform = willShow ? 'rotate(90deg)' : 'rotate(0deg)';
    });
  });
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
    if (btn.dataset.action === 'aporte-asset') {
      const a = state.assets.find(x => x.id === id);
      if (!a) return;
      document.getElementById('modal-aporte-ativo-title').textContent = `Aporte em "${a.name}"`;
      document.getElementById('aporte-ativo-id').value    = id;
      document.getElementById('aporte-ativo-valor').value = '';
      document.getElementById('aporte-ativo-data').value  = new Date().toISOString().slice(0, 10);
      document.getElementById('aporte-ativo-obs').value   = '';
      document.getElementById('modal-aporte-ativo').classList.remove('hidden');
    }
  });

  document.getElementById('btn-salvar-aporte-ativo')?.addEventListener('click', async () => {
    const assetId = document.getElementById('aporte-ativo-id').value;
    const amount  = parseFloat(document.getElementById('aporte-ativo-valor').value);
    const date    = document.getElementById('aporte-ativo-data').value;
    const obs     = document.getElementById('aporte-ativo-obs').value.trim();
    if (!amount || amount <= 0) return toast('Informe um valor para o aporte.', 'error');
    try {
      const novoValor = await addAporteToAsset(assetId, { amount, date, obs, source: 'manual' });
      document.getElementById('modal-aporte-ativo').classList.add('hidden');
      toast(`Aporte registrado! Novo valor: ${fmt(novoValor)}`, 'success');
      _renderAtivos();
    } catch (err) {
      toast(`Erro: ${err.message}`, 'error');
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
