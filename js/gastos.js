/**
 * gastos.js — Aba de gastos: tabela, lançamento manual, importação PDF
 */

import { state, fmt, toast, esc } from './utils.js';
import { txOfMonth, saveTx, deleteTx } from './db.js';
import { initPdfImport } from './pdf-import.js';

let _initialized = false;

export function renderGastos() {
  if (!_initialized) {
    _initGastosEvents();
    _initAdvancedFilterEvents();
    _initialized = true;
  }
  _populateCategorySelects();
  _renderTable();
}

// ─── TABELA ────────────────────────────────────────────────────────────────
function _renderTable() {
  const month  = state.currentMonth;
  let txs      = txOfMonth(month);

  // Filtros básicos
  const filterCat   = document.getElementById('filter-categoria')?.value || '';
  const filterTipo  = document.getElementById('filter-tipo-gasto')?.value || '';
  const filterBusca = (document.getElementById('filter-busca')?.value || '').toLowerCase().trim();

  if (filterCat)   txs = txs.filter(t => t.categoryId === filterCat);
  if (filterTipo)  txs = txs.filter(t => t.paymentType === filterTipo);
  if (filterBusca) txs = txs.filter(t => t.description?.toLowerCase().includes(filterBusca));

  // Filtros avançados
  const valMin   = parseFloat(document.getElementById('filter-valor-min')?.value || '');
  const valMax   = parseFloat(document.getElementById('filter-valor-max')?.value || '');
  const dtInicio = document.getElementById('filter-data-inicio')?.value || '';
  const dtFim    = document.getElementById('filter-data-fim')?.value || '';
  const apenasProj = document.getElementById('filter-apenas-projetadas')?.checked;
  const apenasParcelas = document.getElementById('filter-apenas-parcelas')?.checked;

  if (!isNaN(valMin) && valMin > 0) txs = txs.filter(t => (t.amount || 0) >= valMin);
  if (!isNaN(valMax) && valMax > 0) txs = txs.filter(t => (t.amount || 0) <= valMax);
  if (dtInicio) txs = txs.filter(t => (t.date || '') >= dtInicio);
  if (dtFim)    txs = txs.filter(t => (t.date || '') <= dtFim);
  if (apenasProj)     txs = txs.filter(t => t.isProjected);
  if (apenasParcelas) txs = txs.filter(t => t.installmentTotal > 1);

  txs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const tbody = document.getElementById('gastos-tbody');
  const total = txs.reduce((s, t) => s + (t.amount || 0), 0);

  document.getElementById('gastos-total').textContent = fmt(total);

  if (!txs.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-row">Nenhum gasto encontrado para os filtros selecionados.</td></tr>`;
    return;
  }

  tbody.innerHTML = txs.map(tx => {
    const cat   = state.categories.find(c => c.id === tx.categoryId);
    const catDot = cat
      ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${esc(cat.color)};margin-right:0.4rem"></span>${esc(cat.name)}`
      : '—';

    const tipoTag = _tipoTag(tx.paymentType);
    const parcTag = tx.installmentTotal > 1
      ? `<span class="tag-projetada">${tx.installmentCurrent}/${tx.installmentTotal}</span>`
      : '';
    const projTag = tx.isProjected
      ? `<span class="tag-projetada" style="color:var(--gold)">projetada</span>`
      : '';

    const dataFmt = tx.date
      ? new Date(tx.date + 'T12:00:00').toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })
      : '—';

    return `
      <tr>
        <td>${dataFmt}</td>
        <td title="${esc(tx.notes || '')}">${esc(tx.description) || '—'}</td>
        <td>${catDot}</td>
        <td>${tipoTag}</td>
        <td>${parcTag} ${projTag}</td>
        <td class="col-value"><span class="val-mono val-negative">${fmt(tx.amount)}</span></td>
        <td class="col-actions">
          <button class="btn-icon-only" title="Editar" data-action="edit-tx" data-id="${tx.id}">✎</button>
          <button class="btn-icon-only danger" title="Excluir" data-action="delete-tx" data-id="${tx.id}">✕</button>
        </td>
      </tr>`;
  }).join('');
}

function _tipoTag(tipo) {
  const map = {
    cartao:   ['cartao',   'Cartão'],
    pix:      ['pix',      'Pix'],
    debito:   ['debito',   'Débito'],
    dinheiro: ['dinheiro', 'Dinheiro'],
    outro:    ['outro',    'Outro'],
  };
  const [cls, label] = map[tipo] || ['outro', tipo || 'Outro'];
  return `<span class="tag-tipo tag-${cls}">${label}</span>`;
}

// ─── SELECTS DE CATEGORIA ──────────────────────────────────────────────────
function _populateCategorySelects() {
  const opts = state.categories.map(c =>
    `<option value="${esc(c.id)}">${esc(c.name)}</option>`
  ).join('');

  // Filtro
  const filterCat = document.getElementById('filter-categoria');
  const prev = filterCat.value;
  filterCat.innerHTML = '<option value="">Todas as categorias</option>' + opts;
  filterCat.value = prev;

  // Modal
  document.getElementById('gasto-categoria').innerHTML =
    '<option value="">Selecione…</option>' + opts;
}

// ─── EVENTOS ───────────────────────────────────────────────────────────────
function _initGastosEvents() {
  // Filtros
  ['filter-categoria','filter-tipo-gasto','filter-busca'].forEach(id => {
    document.getElementById(id).addEventListener('input', _renderTable);
    document.getElementById(id).addEventListener('change', _renderTable);
  });

  // Botão novo lançamento manual
  document.getElementById('btn-novo-gasto').addEventListener('click', () => {
    _openGastoModal(null);
  });

  // Botão importar PDF
  document.getElementById('btn-import-pdf').addEventListener('click', () => {
    document.getElementById('modal-pdf').classList.remove('hidden');
    initPdfImport(_renderTable);
  });

  // Delegação: editar / deletar
  document.getElementById('gastos-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === 'edit-tx') {
      const tx = state.transactions.find(t => t.id === id);
      if (tx) _openGastoModal(tx);
    }
    if (action === 'delete-tx') {
      if (!confirm('Excluir este lançamento?')) return;
      await deleteTx(id);
      toast('Lançamento excluído.', 'success');
      _renderTable();
    }
  });

  // Salvar gasto
  document.getElementById('btn-salvar-gasto').addEventListener('click', _salvarGasto);

}

function _openGastoModal(tx) {
  document.getElementById('modal-gasto-title').textContent = tx ? 'Editar Lançamento' : 'Novo Lançamento';
  document.getElementById('gasto-id').value            = tx?.id || '';
  document.getElementById('gasto-data').value          = tx?.date || _today();
  document.getElementById('gasto-desc').value          = tx?.description || '';
  document.getElementById('gasto-valor').value         = tx?.amount || '';
  document.getElementById('gasto-categoria').value     = tx?.categoryId || '';
  document.getElementById('gasto-tipo').value          = tx?.paymentType || 'pix';
  document.getElementById('gasto-parcela-atual').value = tx?.installmentCurrent || '';
  document.getElementById('gasto-parcela-total').value = tx?.installmentTotal || '';
  document.getElementById('gasto-mes').value           = tx?.competenceMonth || '';
  document.getElementById('gasto-obs').value           = tx?.notes || '';

  _populateCategorySelects();
  document.getElementById('gasto-categoria').value = tx?.categoryId || '';

  document.getElementById('modal-gasto').classList.remove('hidden');
}

async function _salvarGasto() {
  const id     = document.getElementById('gasto-id').value || null;
  const date   = document.getElementById('gasto-data').value;
  const desc   = document.getElementById('gasto-desc').value.trim();
  const amount = parseFloat(document.getElementById('gasto-valor').value);
  const catId  = document.getElementById('gasto-categoria').value;
  const tipo   = document.getElementById('gasto-tipo').value;
  const parcA  = parseInt(document.getElementById('gasto-parcela-atual').value) || 1;
  const parcT  = parseInt(document.getElementById('gasto-parcela-total').value) || 1;
  const mes    = document.getElementById('gasto-mes').value || state.currentMonth;
  const notes  = document.getElementById('gasto-obs').value.trim();

  if (!desc)           return toast('Preencha a descrição.', 'error');
  if (!amount || amount <= 0) return toast('Informe um valor válido.', 'error');
  if (!catId)          return toast('Selecione uma categoria.', 'error');

  const data = {
    date,
    description: desc,
    amount,
    categoryId: catId,
    paymentType: tipo,
    installmentCurrent: parcA,
    installmentTotal:   parcT,
    competenceMonth:    mes,
    notes,
    isProjected: false,
    importedFrom: 'manual',
  };

  try {
    await saveTx(data, id);

    // Projeta parcelas futuras automaticamente (apenas em novo lançamento de cartão)
    if (!id && tipo === 'cartao' && parcT > 1) {
      await _projetarParcelas(data, parcA, parcT);
    }

    document.getElementById('modal-gasto').classList.add('hidden');
    toast('Lançamento salvo!', 'success');
    _renderTable();
  } catch (err) {
    console.error(err);
    toast('Erro ao salvar. Verifique o console.', 'error');
  }
}

/** Cria lançamentos projetados para as parcelas futuras */
async function _projetarParcelas(base, currentParcela, totalParcelas) {
  for (let p = currentParcela + 1; p <= totalParcelas; p++) {
    const delta = p - currentParcela;
    const futureMonth = _offsetMonth(base.competenceMonth, delta);
    await saveTx({
      ...base,
      installmentCurrent: p,
      competenceMonth: futureMonth,
      isProjected: true,
    });
  }
}

function _offsetMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _today() {
  return new Date().toISOString().slice(0, 10);
}


// ─── FILTROS AVANÇADOS ─────────────────────────────────────────
function _initAdvancedFilterEvents() {
  const btn = document.getElementById('btn-filtros-avancados');
  const panel = document.getElementById('advanced-filter-panel');
  if (!btn || !panel) return;

  btn.addEventListener('click', () => {
    const visible = !panel.classList.contains('hidden');
    panel.classList.toggle('hidden', visible);
    btn.textContent = visible ? 'Filtros avançados ▾' : 'Filtros avançados ▴';
  });

  // Valor mín/máx
  ['filter-valor-min', 'filter-valor-max'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', _renderTable);
  });

  // Data início/fim
  ['filter-data-inicio', 'filter-data-fim'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', _renderTable);
  });

  // Checkboxes
  ['filter-apenas-projetadas', 'filter-apenas-parcelas'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', _renderTable);
  });

  // Limpar filtros avançados
  document.getElementById('btn-limpar-filtros')?.addEventListener('click', () => {
    ['filter-valor-min','filter-valor-max','filter-data-inicio','filter-data-fim'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['filter-apenas-projetadas','filter-apenas-parcelas'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = false;
    });
    _renderTable();
  });
}
