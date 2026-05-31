/**
 * extratos.js — Módulo de importação de extratos bancários
 * Orquestra: seleção de banco → parse → revisão → salvar no Firestore
 */

import { state, esc, fmt, toast } from './utils.js';
import { detectDuplicates }        from './parsers/base-parser.js';
import { parseOFX }                from './parsers/ofx-parser.js';
import { parseCSV }                from './parsers/csv-parser.js';
import { parsePDFStatement }       from './parsers/pdf-statement-parser.js';

// ─── ESTADO LOCAL ──────────────────────────────────────────────
let selectedBank   = '';
let selectedFormat = 'ofx';
let parsedItems    = [];

const BANK_NAMES = {
  itau: 'Itaú', nubank: 'Nubank', inter: 'Inter',
  santander: 'Santander', bradesco: 'Bradesco', generico: 'Genérico',
};

const FORMAT_ACCEPT = {
  ofx: '.ofx',
  csv: '.csv,.txt',
  pdf: '.pdf',
};

// ─── RENDER DA ABA ─────────────────────────────────────────────
export function renderExtratos() {
  try { _renderImportacoesList(); } catch(e) { console.error('extratos list:', e); }
  try { _renderExtratosTable();   } catch(e) { console.error('extratos table:', e); }
  try { _renderBancoFilters();    } catch(e) { console.error('extratos filters:', e); }
}

function _renderImportacoesList() {
  const container = document.getElementById('importacoes-list');
  if (!container) return;

  const batches = {};
  for (const tx of state.extratoTransactions || []) {
    const id = tx.importBatchId || 'sem-lote';
    if (!batches[id]) batches[id] = { bankName: tx.bankName, fileType: tx.fileType, items: [], date: tx.importedAt };
    batches[id].items.push(tx);
  }

  const batchList = Object.entries(batches);

  if (!batchList.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🏦</div>
        <div class="empty-state-title">Nenhum extrato importado</div>
        <div class="empty-state-text">Importe extratos do Itaú, Nubank, Inter, Santander ou Bradesco em PDF, OFX ou CSV.</div>
        <button class="btn btn-primary btn-sm" onclick="document.getElementById('btn-novo-extrato').click()">Importar agora</button>
      </div>`;
    return;
  }

  const rows = batchList.map(([batchId, batch]) => {
    const inc  = batch.items.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0);
    const exp  = batch.items.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);
    const date = batch.date ? new Date(batch.date).toLocaleDateString('pt-BR') : '—';
    const safeId = batchId.replace(/"/g, '');
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:0.7rem 1.25rem;border-bottom:1px solid var(--border-soft);font-size:0.83rem;gap:1rem">'
      + '<div style="flex:1;min-width:0">'
      +   '<div style="font-weight:600;color:var(--text-primary)">' + esc(BANK_NAMES[batch.bankName] || batch.bankName)
      +   ' <span style="color:var(--text-muted);font-size:0.72rem;font-weight:400">.' + esc(batch.fileType || '') + '</span></div>'
      +   '<div style="color:var(--text-muted);font-size:0.75rem">' + esc(date) + ' · ' + batch.items.length + ' transações</div>'
      + '</div>'
      + '<div style="display:flex;align-items:center;gap:0.75rem">'
      +   '<span style="font-family:var(--font-mono);font-size:0.78rem;color:var(--success)">+' + fmt(inc) + '</span>'
      +   '<span style="font-family:var(--font-mono);font-size:0.78rem;color:var(--danger)">-' + fmt(exp) + '</span>'
      +   '<button class="btn btn-danger btn-xs btn-del-batch" data-batchid="' + safeId + '" style="font-family:var(--font-sans);cursor:pointer">🗑 Excluir</button>'
      + '</div>'
      + '</div>';
  }).join('');

  container.innerHTML = rows;

  container.querySelectorAll('.btn-del-batch').forEach(btn => {
    btn.addEventListener('click', async () => {
      const bid   = btn.dataset.batchid;
      const batch = batches[bid];
      if (!batch) return;
      if (!confirm('Excluir esta importação? Remove ' + batch.items.length + ' transação(ões) do Firestore.')) return;
      await _deleteBatch(bid, batch.items);
    });
  });
}
function _renderExtratosTable() {
  const tbody    = document.getElementById('extratos-tbody');
  const bancoSel = document.getElementById('filter-extrato-banco')?.value || '';
  const tipoSel  = document.getElementById('filter-extrato-tipo')?.value  || '';

  if (!tbody) return;

  let txs = [...(state.extratoTransactions || [])];
  if (bancoSel) txs = txs.filter(t => t.bankName === bancoSel);
  if (tipoSel)  txs = txs.filter(t => t.type    === tipoSel);

  if (!txs.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-row">Nenhuma transação de extrato.</td></tr>`;
    return;
  }

  // Ordena por data desc
  txs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  tbody.innerHTML = txs.map(tx => {
    const cat = state.categories.find(c => c.id === tx.category) || { name: tx.category || '—', color: '#888' };
    const valClass = tx.type === 'income' ? 'val-positive' : 'val-negative';
    const signal   = tx.type === 'income' ? '+' : '-';
    return `<tr>
      <td>${esc(tx.date || '—')}</td>
      <td><span style="font-size:0.72rem;color:var(--text-muted)">${esc(BANK_NAMES[tx.bankName] || tx.bankName || '—')}</span></td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(tx.description || '—')}</td>
      <td><span class="tag-tipo tag-${esc(tx.type === 'income' ? 'pix' : 'outro')}">${esc(tx.type === 'income' ? 'Entrada' : 'Saída')}</span></td>
      <td><span class="cat-dot" style="background:${esc(cat.color || '#888')}"></span>${esc(cat.name)}</td>
      <td class="col-value val-mono ${valClass}">${signal}${fmt(tx.amount)}</td>
    </tr>`;
  }).join('');
}

function _renderBancoFilters() {
  const sel = document.getElementById('filter-extrato-banco');
  if (!sel || sel.children.length > 1) return;
  const banks = [...new Set((state.extratoTransactions || []).map(t => t.bankName))];
  banks.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b; opt.textContent = BANK_NAMES[b] || b;
    sel.appendChild(opt);
  });
  sel.addEventListener('change', _renderExtratosTable);
  document.getElementById('filter-extrato-tipo')?.addEventListener('change', _renderExtratosTable);
}

// ─── MODAL DE IMPORTAÇÃO ───────────────────────────────────────
export function initExtratoModal() {
  selectedBank   = '';
  selectedFormat = 'ofx';
  parsedItems    = [];

  _resetModal();

  // ── Limpa listeners antigos clonando elementos ──────────────
  // (evita empilhamento ao abrir o modal várias vezes)
  function _fresh(id) {
    const el = document.getElementById(id);
    if (!el) return el;
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    return clone;
  }

  // Seleção de banco — usa delegação no container
  const bankSelector = document.getElementById('bank-selector');
  const freshBankSelector = bankSelector?.cloneNode(true);
  if (bankSelector && freshBankSelector) {
    bankSelector.parentNode.replaceChild(freshBankSelector, bankSelector);
    freshBankSelector.addEventListener('click', e => {
      const card = e.target.closest('.bank-card');
      if (!card) return;
      freshBankSelector.querySelectorAll('.bank-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedBank = card.dataset.bank;
    });
  }

  // Seleção de formato — delegação no container
  const formatTabs = document.getElementById('format-tabs');
  const freshFormatTabs = formatTabs?.cloneNode(true);
  if (formatTabs && freshFormatTabs) {
    formatTabs.parentNode.replaceChild(freshFormatTabs, formatTabs);
    freshFormatTabs.addEventListener('click', e => {
      const tab = e.target.closest('.format-tab');
      if (!tab) return;
      freshFormatTabs.querySelectorAll('.format-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      selectedFormat = tab.dataset.format;
      _updateFormatHint();
    });
  }

  // Drop zone e file input — clona para limpar listeners
  const dropZone  = _fresh('extrato-drop-zone');
  const fileInput = _fresh('extrato-file-input');

  if (dropZone && fileInput) {
    dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) _handleFile(file);
    });

    // Clique na área abre file picker — mas evita acionar se clicou no label/input diretamente
    dropZone.addEventListener('click', e => {
      if (e.target === fileInput || e.target.tagName === 'LABEL') return;
      fileInput.click();
    });

    // Mudança de arquivo
    fileInput.addEventListener('change', () => {
      if (fileInput.files[0]) _handleFile(fileInput.files[0]);
      fileInput.value = ''; // reset para poder re-selecionar o mesmo arquivo
    });
  }

  // Checkbox "marcar todos"
  const checkAll = _fresh('extrato-check-all');
  checkAll?.addEventListener('change', e => {
    document.querySelectorAll('#extrato-preview-tbody .row-check').forEach(cb => {
      cb.checked = e.target.checked;
    });
  });

  // Botão confirmar
  const btnConfirmar = _fresh('btn-confirmar-extrato');
  btnConfirmar?.addEventListener('click', _saveExtrato);
}

function _updateFormatHint() {
  const hints = {
    ofx: 'OFX — formato recomendado, disponível no internet banking',
    csv: 'CSV — exportado pelo app ou internet banking',
    pdf: 'PDF — extrato em PDF (resultados podem variar)',
  };
  const el = document.getElementById('extrato-format-hint');
  if (el) el.textContent = hints[selectedFormat] || '';

  const input = document.getElementById('extrato-file-input');
  if (input) input.accept = FORMAT_ACCEPT[selectedFormat] || '*';
}

function _resetModal() {
  document.getElementById('extrato-step-1')?.classList.remove('hidden');
  document.getElementById('extrato-step-2')?.classList.add('hidden');
  document.getElementById('btn-confirmar-extrato')?.classList.add('hidden');
  document.getElementById('extrato-processing')?.classList.add('hidden');
  document.getElementById('extrato-preview-tbody')  && (document.getElementById('extrato-preview-tbody').innerHTML = '');
}


// ─── EXCLUIR LOTE DE IMPORTAÇÃO ───────────────────────────────
async function _deleteBatch(batchId, items) {
  const { db, doc, deleteDoc, collection, query, where, getDocs } = window._FB;
  const uid = window._FB.auth.currentUser?.uid;
  if (!uid) { toast('Não autenticado.', 'error'); return; }

  const btn = document.querySelector(`[data-batch="${batchId}"]`);
  if (btn) { btn.disabled = true; btn.textContent = 'Excluindo…'; }

  try {
    // Deleta de transactions
    const txRef = collection(db, `users/${uid}/transactions`);
    const q     = query(txRef, where('importBatchId', '==', batchId));
    const snap  = await getDocs(q);
    for (const d of snap.docs) await deleteDoc(d.ref);

    // Deleta de incomes (entradas que foram espelhadas)
    const incRef = collection(db, `users/${uid}/incomes`);
    const qInc   = query(incRef, where('importBatchId', '==', batchId));
    const snapInc = await getDocs(qInc).catch(() => ({ docs: [] }));
    for (const d of snapInc.docs) await deleteDoc(d.ref);

    // Atualiza state
    state.extratoTransactions = (state.extratoTransactions || []).filter(t => t.importBatchId !== batchId);
    state.incomes = (state.incomes || []).filter(i => i.importBatchId !== batchId);

    toast(`Importação excluída — ${snap.docs.length} transações removidas.`, 'success');
    renderExtratos();

  } catch (err) {
    console.error('Erro ao excluir batch:', err);
    toast(`Erro ao excluir: ${err.message}`, 'error');
    if (btn) { btn.disabled = false; btn.textContent = '🗑 Excluir'; }
  }
}

// ─── PROCESSAR ARQUIVO ────────────────────────────────────────
async function _handleFile(file) {
  // Validação básica
  const ext = file.name.split('.').pop().toLowerCase();
  if (file.size > 20 * 1024 * 1024) { toast('Arquivo muito grande (máx. 20 MB).', 'error'); return; }

  // Detecta formato pelo arquivo se não selecionado explicitamente
  const autoFormat = ext === 'ofx' ? 'ofx' : ext === 'csv' ? 'csv' : ext === 'pdf' ? 'pdf' : selectedFormat;
  selectedFormat = autoFormat;

  // Detecta banco se não selecionado
  const bank = selectedBank || _detectBankFromFile(file.name);

  // Mostra spinner
  document.getElementById('extrato-drop-zone').classList.add('hidden');
  document.getElementById('extrato-processing').classList.remove('hidden');

  try {
    let items = [];

    if (autoFormat === 'ofx') {
      const text = await file.text();
      items = parseOFX(text, bank, state.importRules || []);
    } else if (autoFormat === 'csv') {
      const text = await _readFileAsText(file);
      items = parseCSV(text, bank, state.importRules || []);
    } else if (autoFormat === 'pdf') {
      items = await parsePDFStatement(file, bank, state.importRules || []);
    }

    if (!items.length) {
      toast('Nenhuma transação encontrada no arquivo. Verifique o banco e formato.', 'warning');
      _resetModal();
      document.getElementById('extrato-drop-zone').classList.remove('hidden');
      return;
    }

    // Anti-duplicidade
    parsedItems = detectDuplicates(items, [...state.transactions, ...(state.extratoTransactions || [])]);

    _showReview(parsedItems, bank, autoFormat);

  } catch (err) {
    console.error('Erro ao processar extrato:', err);
    toast(`Erro ao processar arquivo: ${err.message}`, 'error');
    _resetModal();
    document.getElementById('extrato-drop-zone').classList.remove('hidden');
  } finally {
    document.getElementById('extrato-processing').classList.add('hidden');
  }
}

function _detectBankFromFile(filename) {
  const f = filename.toLowerCase();
  if (f.includes('itau') || f.includes('itaú'))      return 'itau';
  if (f.includes('nubank'))                           return 'nubank';
  if (f.includes('inter'))                            return 'inter';
  if (f.includes('santander'))                        return 'santander';
  if (f.includes('bradesco'))                         return 'bradesco';
  return 'generico';
}

function _readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    // Tenta detectar encoding
    reader.readAsText(file, 'UTF-8');
  });
}

// ─── REVISÃO ─────────────────────────────────────────────────
function _showReview(items, bank, format) {
  document.getElementById('extrato-step-1').classList.add('hidden');
  document.getElementById('extrato-step-2').classList.remove('hidden');
  document.getElementById('btn-confirmar-extrato').classList.remove('hidden');

  const dupCount  = items.filter(t => t.isDuplicate).length;
  const incCount  = items.filter(t => t.type === 'income').length;
  const expCount  = items.filter(t => t.type === 'expense').length;
  const totalIn   = items.filter(t => t.type === 'income').reduce((s,t) => s+t.amount, 0);
  const totalOut  = items.filter(t => t.type === 'expense').reduce((s,t) => s+t.amount, 0);

  document.getElementById('extrato-batch-header').innerHTML = `
    <div class="batch-meta">
      <strong>${esc(BANK_NAMES[bank] || bank)}</strong> — <span style="text-transform:uppercase;font-size:0.75rem">${esc(format)}</span>
      · ${items.length} transações${dupCount ? ` · <span style="color:var(--warning)">${dupCount} possível(is) duplicata(s)</span>` : ''}
    </div>
    <div class="batch-stats">
      <span class="batch-stat-in">↑ ${incCount} entradas ${fmt(totalIn)}</span>
      <span class="batch-stat-out">↓ ${expCount} saídas ${fmt(totalOut)}</span>
    </div>`;

  const tbody = document.getElementById('extrato-preview-tbody');
  const cats  = state.categories;

  // Cabeçalho da tabela — mostra coluna extra "Tipo de receita" se houver entradas
  const hasIncomes = items.some(t => t.type === 'income');
  const theadEl = document.querySelector('#extrato-preview-tbody')?.closest('table')?.querySelector('thead tr');
  if (theadEl && hasIncomes) {
    theadEl.innerHTML = '<th><input type="checkbox" id="extrato-check-all" checked /></th><th>Data</th><th>Descrição</th><th>Tipo</th><th>Categoria / Tipo receita</th><th class="col-value">Valor</th><th>Status</th>';
  }

  const INCOME_TYPES = [
    ['salario',        'Salário'],
    ['vale_alimentacao','Vale Alimentação'],
    ['vale_transporte', 'Vale Transporte'],
    ['reembolso',      'Reembolso / Estorno'],
    ['investimento',   'Resgate Investimento'],
    ['transferencia',  'Transferência recebida'],
    ['outro',          'Outra receita'],
  ];

  tbody.innerHTML = items.map((tx, idx) => {
    const isIncome = tx.type === 'income';

    const catOptions = cats.map(c =>
      `<option value="${esc(c.id)}" ${c.id === tx.category ? 'selected' : ''}>${esc(c.name)}</option>`
    ).join('');

    const incomeTypeOptions = INCOME_TYPES.map(([val, label]) =>
      `<option value="${val}" ${(tx.incomeType || _classifyIncomeType(tx.description)) === val ? 'selected' : ''}>${label}</option>`
    ).join('');

    const typeOptions = `
      <option value="expense"  ${tx.type === 'expense'  ? 'selected' : ''}>Saída</option>
      <option value="income"   ${tx.type === 'income'   ? 'selected' : ''}>Entrada</option>
      <option value="transfer" ${tx.type === 'transfer' ? 'selected' : ''}>Transferência</option>`;

    const dupBadge = tx.isDuplicate
      ? `<span class="tag-duplicata">Possível duplicata</span>` : '';

    // Coluna 5: categoria (saída) ou tipo de receita (entrada)
    const col5 = isIncome
      ? `<select class="select-inline" data-field="incomeType" data-idx="${idx}" style="max-width:180px">
           ${incomeTypeOptions}
         </select>`
      : `<select class="select-inline" data-field="category" data-idx="${idx}">
           <option value="">—</option>${catOptions}
         </select>`;

    const valColor = tx.type === 'income' ? 'var(--success)' : 'var(--danger)';

    return `<tr class="${tx.isDuplicate ? 'row-dup' : ''}">
      <td><input type="checkbox" class="row-check" data-idx="${idx}" ${tx.isDuplicate ? '' : 'checked'} /></td>
      <td style="font-size:0.8rem;white-space:nowrap">${esc(tx.date)}</td>
      <td style="max-width:180px">
        <input type="text" class="form-input" style="padding:0.25rem 0.5rem;font-size:0.78rem;width:100%"
          data-field="description" data-idx="${idx}" value="${esc(tx.description)}" />
      </td>
      <td><select class="select-inline" data-field="type" data-idx="${idx}">${typeOptions}</select></td>
      <td>${col5}</td>
      <td class="col-value val-mono" style="white-space:nowrap;color:${valColor}">${fmt(tx.amount)}</td>
      <td>${dupBadge}</td>
    </tr>`;
  }).join('');

  // Edição inline — inclui incomeType
  tbody.querySelectorAll('[data-field]').forEach(el => {
    el.addEventListener('change', () => {
      const idx   = parseInt(el.dataset.idx);
      const field = el.dataset.field;
      parsedItems[idx][field] = el.value;
      // Ao mudar tipo de entrada/saída, atualiza a cor do valor
      if (field === 'type') {
        const row = el.closest('tr');
        const valCell = row?.querySelector('.val-mono');
        if (valCell) valCell.style.color = el.value === 'income' ? 'var(--success)' : 'var(--danger)';
      }
    });
  });
}

// ─── SALVAR ───────────────────────────────────────────────────

// Classifica tipo de receita pela descrição
function _classifyIncomeType(desc) {
  const d = (desc || '').toLowerCase();
  if (/salário|salario|folha|holerite/.test(d))          return 'salario';
  if (/vale.aliment/.test(d))                            return 'vale_alimentacao';
  if (/vale.transp/.test(d))                             return 'vale_transporte';
  if (/reembolso|ressarcimento|estorno|devolu/.test(d))  return 'reembolso';
  if (/resgate|rendimento|rend|cdb|lci|lca|aplica/.test(d)) return 'investimento';
  if (/ted|pix|transfere|transf/.test(d))                return 'transferencia';
  return 'outro';
}

async function _saveExtrato() {
  const { db, collection, addDoc } = window._FB;
  const uid = window._FB.auth.currentUser?.uid;
  if (!uid) { toast('Não autenticado.', 'error'); return; }

  // Itens selecionados
  const checks    = document.querySelectorAll('#extrato-preview-tbody .row-check');
  const selected  = parsedItems.filter((_, i) => checks[i]?.checked);

  if (!selected.length) { toast('Nenhuma transação selecionada.', 'warning'); return; }

  const btn = document.getElementById('btn-confirmar-extrato');
  btn.disabled    = true;
  btn.textContent = 'Salvando…';

  try {
    const now = new Date().toISOString();
    const txRef  = collection(db, `users/${uid}/transactions`);
    const incRef = collection(db, `users/${uid}/incomes`);

    for (const tx of selected) {
      const base = { ...tx, isReviewed: true, importedAt: now, updatedAt: now, createdAt: now };

      // Salva em transactions (sempre)
      await addDoc(txRef, base);

      // Entradas também salvam em incomes para aparecer no dashboard de receitas
      if (tx.type === 'income' && tx.amount > 0) {
        const incomeData = {
          type:        tx.incomeType || _classifyIncomeType(tx.description),
          description: tx.description,
          amount:      tx.amount,
          date:        tx.date,
          month:       tx.date ? tx.date.slice(0, 7) : now.slice(0, 7),
          source:      'statement_import',
          bankName:    tx.bankName,
          importedAt:  now,
          createdAt:   now,
        };
        await addDoc(incRef, incomeData);
        state.incomes = state.incomes || [];
        state.incomes.push(incomeData);
      }
    }

    // Atualiza state local
    if (!state.extratoTransactions) state.extratoTransactions = [];
    state.extratoTransactions.push(...selected.map(tx => ({ ...tx, isReviewed: true, importedAt: now })));

    const dupSkipped = parsedItems.length - selected.length;
    toast(
      `${selected.length} transação(ões) salva(s).${dupSkipped ? ` ${dupSkipped} ignorada(s).` : ''}`,
      'success',
      'Extrato importado!'
    );

    document.getElementById('modal-extrato').classList.add('hidden');
    renderExtratos();

  } catch (err) {
    console.error('Erro ao salvar extrato:', err);
    toast(`Erro ao salvar: ${err.message}`, 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Confirmar e Salvar';
  }
}
