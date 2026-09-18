/**
 * patrimonio.js — Aba de patrimônio (investimentos, caixa, bens pessoais)
 */

import { state, fmt, toast, esc, monthLabel, offsetMonth } from './utils.js';
import { saveAsset, deleteAsset, addAporteToAsset } from './db.js';

let _patrimonioInit = false;

export function renderPatrimonio() {
  if (!_patrimonioInit) {
    _initPatrimonioEvents();
    _patrimonioInit = true;
  }
  _renderAtivos();
  _renderGraficos();
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
  const tipoColor = { investimento: 'var(--warning)', caixa: 'var(--success)', bem_pessoal: 'var(--info)' };

  tbody.innerHTML = ativos.map(a => {
    const valorAtual = a.type === 'bem_pessoal' ? _valorDepreciado(a) : (a.currentValue || 0);
    const dateFmt    = a.acquiredAt
      ? new Date(a.acquiredAt + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit', year:'2-digit'})
      : '—';

    const aportes  = a.contributions || [];
    const isInvest = a.type === 'investimento';
    const totalAp  = aportes.reduce((s, x) => s + (x.amount || 0), 0);

    // Meta vinculada (tag informativa abaixo do nome)
    const linkedGoal = a.linkedGoalId ? state.goals.find(g => g.id === a.linkedGoalId) : null;
    const goalTag = linkedGoal
      ? `<div style="font-size:0.68rem;color:var(--text-muted);margin-top:0.15rem">🎯 ${esc(linkedGoal.name)}</div>`
      : '';

    // Nome + toggle do histórico de aportes (quando existir)
    const nameCell = `
      ${esc(a.name)}${goalTag}
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
              <span style="font-family:var(--font-mono);color:var(--warning);flex-shrink:0;margin-left:0.5rem">+${fmt(ap.amount)}</span>
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
          <button class="btn-icon-only" title="Editar" aria-label="Editar ativo ${esc(a.name || '')}" data-action="edit-asset" data-id="${a.id}">✎</button>
          <button class="btn-icon-only danger" title="Excluir" aria-label="Excluir ativo ${esc(a.name || '')}" data-action="delete-asset" data-id="${a.id}">✕</button>
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

  // Mostrar campo de depreciação apenas para bem pessoal;
  // campo de meta vinculada apenas para investimento
  document.getElementById('ativo-tipo').addEventListener('change', (e) => {
    document.getElementById('deprec-row').style.display =
      e.target.value === 'bem_pessoal' ? 'flex' : 'none';
    const metaRow = document.getElementById('ativo-meta-row');
    if (metaRow) metaRow.style.display = e.target.value === 'investimento' ? 'flex' : 'none';
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

function _populateMetaSelect(selectedId) {
  const sel = document.getElementById('ativo-meta');
  if (!sel) return;
  sel.innerHTML = '<option value="">Nenhuma</option>' +
    state.goals.map(g =>
      `<option value="${esc(g.id)}" ${g.id === selectedId ? 'selected' : ''}>${esc(g.name)}</option>`
    ).join('');
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
  _populateMetaSelect(a?.linkedGoalId || '');
  const metaRow = document.getElementById('ativo-meta-row');
  if (metaRow) metaRow.style.display = ((a?.type || 'investimento') === 'investimento') ? 'flex' : 'none';
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
  const linkedGoalId = type === 'investimento'
    ? (document.getElementById('ativo-meta')?.value || null)
    : null;

  if (!name)              return toast('Informe o nome do ativo.', 'error');
  if (!current || current < 0) return toast('Informe o valor atual.', 'error');

  // Preserva o histórico de aportes ao editar (não vem dos inputs do modal)
  const existing = id ? state.assets.find(a => a.id === id) : null;

  await saveAsset({ name, type, initialValue: initial, currentValue: current,
    acquiredAt: date, depreciationRate: deprec, notes, linkedGoalId,
    contributions: existing?.contributions || [] }, id);

  document.getElementById('modal-ativo').classList.add('hidden');
  toast('Ativo salvo!', 'success');
  _renderAtivos();
}


// ═══════════════════════════════════════════════════════════════════════
// GRÁFICOS
// Canvas não resolve var(--…): as cores vêm do token já resolvido, e os
// gráficos são refeitos a cada render — inclusive quando o tema muda, porque
// o botão de tema re-renderiza a aba corrente.
// ═══════════════════════════════════════════════════════════════════════

let chartComposicao = null;
let chartAportes    = null;

function _token(nome, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return v || fallback;
}

function _renderGraficos() {
  if (typeof Chart === 'undefined') return;
  _renderComposicao();
  _renderAportes();
}

function _renderComposicao() {
  const cv = document.getElementById('chart-pat-composicao');
  if (!cv) return;
  if (chartComposicao) { chartComposicao.destroy(); chartComposicao = null; }

  const invest = state.assets.filter(a => a.type === 'investimento').reduce((s, a) => s + (a.currentValue || 0), 0);
  const caixa  = state.assets.filter(a => a.type === 'caixa').reduce((s, a) => s + (a.currentValue || 0), 0);
  const bens   = state.assets.filter(a => a.type === 'bem_pessoal').reduce((s, a) => s + _valorDepreciado(a), 0);

  const dados = [
    { rotulo: 'Investimento', valor: invest, cor: _token('--c5', '#2E8B6E') },
    { rotulo: 'Caixa / conta', valor: caixa, cor: _token('--c4', '#5E8A2C') },
    { rotulo: 'Bens pessoais', valor: bens,  cor: _token('--c2', '#C4661A') },
  ].filter(d => d.valor > 0);

  if (!dados.length) {
    // Rosca cinza em vez de card vazio: mantém a altura da linha e não finge
    // que existe composição de nada.
    chartComposicao = new Chart(cv, {
      type: 'doughnut',
      data: { labels: ['Sem ativos'], datasets: [{ data: [1], backgroundColor: [_token('--bg-hover', '#24242A')], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '64%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } } },
    });
    return;
  }

  chartComposicao = new Chart(cv, {
    type: 'doughnut',
    data: {
      labels: dados.map(d => d.rotulo),
      datasets: [{
        data: dados.map(d => d.valor),
        backgroundColor: dados.map(d => d.cor),
        borderColor: _token('--bg-card', '#141416'),
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '64%',
      plugins: {
        legend: { position: 'right', labels: { color: _token('--text-secondary', '#A9A9B1'),
          font: { family: 'Nunito', size: 11 }, boxWidth: 9, boxHeight: 9, padding: 9 } },
        tooltip: { callbacks: { label: c => `${c.label}: ${fmt(c.parsed)}` } },
      },
    },
  });
}

function _renderAportes() {
  const cv = document.getElementById('chart-pat-aportes');
  if (!cv) return;
  if (chartAportes) { chartAportes.destroy(); chartAportes = null; }

  // Seis meses terminando no mês selecionado no topo — a aba obedece à
  // navegação de mês como todas as outras.
  const meses = [];
  for (let i = 5; i >= 0; i--) meses.push(offsetMonth(state.currentMonth, -i));

  const soma = Object.fromEntries(meses.map(m => [m, 0]));
  for (const ativo of state.assets) {
    for (const ap of (ativo.contributions || [])) {
      const m = String(ap.date || '').slice(0, 7);
      if (m in soma) soma[m] += ap.amount || 0;
    }
  }

  chartAportes = new Chart(cv, {
    type: 'bar',
    data: {
      labels: meses.map(m => monthLabel(m).split(' ')[0].slice(0, 3)),
      datasets: [{
        label: 'Aportes',
        data: meses.map(m => soma[m]),
        backgroundColor: _token('--c5', '#2E8B6E'),
        borderRadius: 3,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: c => fmt(c.parsed.y) } } },
      scales: {
        x: { ticks: { color: _token('--text-muted', '#87878F'), font: { family: 'Nunito', size: 10 } },
             grid: { display: false } },
        y: { beginAtZero: true,
             ticks: { color: _token('--text-muted', '#87878F'), font: { family: 'Nunito', size: 10 },
                      callback: v => (v >= 1000 ? (v / 1000) + 'k' : v) },
             grid: { color: _token('--border-soft', 'rgba(255,255,255,.07)') } },
      },
    },
  });
}
