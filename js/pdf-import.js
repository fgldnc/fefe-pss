/**
 * pdf-import.js — Importação de fatura PDF (Nubank, Santander, genérico)
 *
 * Fluxo:
 *  1. Usuário seleciona / arrasta o PDF
 *  2. PDF.js extrai texto de todas as páginas
 *  3. Parser tenta identificar lançamentos (data, descrição, valor, parcelas)
 *  4. Usuário revisa na tabela (pode editar categoria e descrição)
 *  5. Confirmação salva no Firestore com projeção de parcelas futuras
 */

import { state, toast } from './app.js';
import { saveTx } from './db.js';

// Configura o worker do PDF.js
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

let _onDoneCallback = null;
let _parsedItems    = [];

export function initPdfImport(onDone) {
  _onDoneCallback = onDone;
  _resetModal();
  _attachEvents();
}

// ─── RESET DO MODAL ────────────────────────────────────────────────────────
function _resetModal() {
  document.getElementById('pdf-step-1').classList.remove('hidden');
  document.getElementById('pdf-step-2').classList.add('hidden');
  document.getElementById('pdf-processing').classList.add('hidden');
  document.getElementById('btn-confirmar-pdf').classList.add('hidden');
  document.getElementById('pdf-preview-tbody').innerHTML = '';
  document.getElementById('pdf-file-input').value = '';
  _parsedItems = [];
}

// ─── EVENTOS ───────────────────────────────────────────────────────────────
function _attachEvents() {
  // Evita duplicar listeners
  const input    = document.getElementById('pdf-file-input');
  const dropZone = document.getElementById('pdf-drop-zone');
  const confirmBtn = document.getElementById('btn-confirmar-pdf');
  const checkAll   = document.getElementById('pdf-check-all');

  // Substitui o elemento para limpar listeners anteriores
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);

  newInput.addEventListener('change', (e) => {
    if (e.target.files[0]) _processPdf(e.target.files[0]);
  });

  dropZone.addEventListener('click', () => newInput.click());
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') _processPdf(file);
    else toast('Selecione um arquivo PDF.', 'error');
  });

  // Re-registra confirmar (cloneNode limpa listeners)
  const newConfirm = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
  newConfirm.addEventListener('click', _confirmarImportacao);

  // Selecionar / desmarcar todos
  checkAll.addEventListener('change', (e) => {
    document.querySelectorAll('#pdf-preview-tbody input[type=checkbox]').forEach(cb => {
      cb.checked = e.target.checked;
    });
  });
}

// ─── LEITURA DO PDF ────────────────────────────────────────────────────────
async function _processPdf(file) {
  if (typeof pdfjsLib === 'undefined') {
    toast('PDF.js não carregou. Verifique a conexão.', 'error');
    return;
  }

  document.getElementById('pdf-processing').classList.remove('hidden');
  document.getElementById('pdf-drop-zone').classList.add('hidden');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      const lines   = content.items.map(item => item.str).join(' ');
      fullText += lines + '\n';
    }

    const items = _parseStatement(fullText);

    if (!items.length) {
      toast('Não foi possível identificar lançamentos neste PDF. Tente lançar manualmente.', 'error');
      _resetModal();
      return;
    }

    _parsedItems = items;
    _showPreview(items, file.name);

  } catch (err) {
    console.error('Erro ao ler PDF:', err);
    toast('Erro ao processar o PDF. Veja o console para detalhes.', 'error');
    _resetModal();
  }
}

// ─── PARSER GENÉRICO ───────────────────────────────────────────────────────
/**
 * Tenta reconhecer padrões comuns de faturas brasileiras.
 * Suporta: Nubank (date desc value), Santander, e padrão genérico.
 *
 * Retorna: [{ date, description, amount, installmentCurrent, installmentTotal }]
 */
function _parseStatement(text) {
  const items = [];

  // Padrão 1 — Nubank: "01 ABR Descrição do gasto R$ 99,99"
  const nubank = /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.+?)\s+R?\$?\s*(\d[\d.,]+)/gi;
  let m;
  while ((m = nubank.exec(text)) !== null) {
    const [, day, mon, desc, valRaw] = m;
    const amount = _parseMoney(valRaw);
    if (!amount || amount <= 0) continue;

    const monthNum = _monthNum(mon);
    const year     = _guessYear(monthNum);
    const date     = `${year}-${String(monthNum).padStart(2,'0')}-${day.padStart(2,'0')}`;

    const { current, total, cleanDesc } = _parseInstallment(desc.trim());

    items.push({ date, description: cleanDesc, amount, installmentCurrent: current, installmentTotal: total });
  }

  if (items.length) return _dedup(items);

  // Padrão 2 — genérico: "DD/MM/YYYY descrição 999,99" ou "DD/MM descrição 999,99"
  const generic = /(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\s+(.+?)\s+(\d[\d.,]+)\s*(?:D|C)?/g;
  while ((m = generic.exec(text)) !== null) {
    const [, dd, mm, yy, desc, valRaw] = m;
    const amount = _parseMoney(valRaw);
    if (!amount || amount <= 0) continue;

    const year = yy ? (yy.length === 2 ? `20${yy}` : yy) : _guessYear(parseInt(mm, 10));
    const date = `${year}-${mm}-${dd}`;

    const { current, total, cleanDesc } = _parseInstallment(desc.trim());
    items.push({ date, description: cleanDesc, amount, installmentCurrent: current, installmentTotal: total });
  }

  return _dedup(items);
}

/** Converte "1.234,56" ou "1234.56" para number */
function _parseMoney(raw) {
  if (!raw) return 0;
  const s = raw.trim().replace(/\s/g, '');
  // Formato brasileiro: ponto como milhar, vírgula como decimal
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.'));
  }
  // Formato americano ou simples
  return parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
}

/** Detecta "Parcela 2/5" ou "02/06" no início/fim da descrição */
function _parseInstallment(desc) {
  const re = /\s*[- ]?(?:parcela\s*)?(\d{1,2})[\/\-](\d{1,2})\s*/i;
  const m  = desc.match(re);
  if (m) {
    const current    = parseInt(m[1], 10);
    const total      = parseInt(m[2], 10);
    const cleanDesc  = desc.replace(re, ' ').trim();
    if (total >= current && total > 1) return { current, total, cleanDesc };
  }
  return { current: 1, total: 1, cleanDesc: desc };
}

function _monthNum(abbr) {
  const map = { JAN:1, FEV:2, MAR:3, ABR:4, MAI:5, JUN:6, JUL:7, AGO:8, SET:9, OUT:10, NOV:11, DEZ:12 };
  return map[abbr.toUpperCase()] || 1;
}

function _guessYear(month) {
  const now = new Date();
  // Se o mês do lançamento for maior que o mês atual, provavelmente é do ano passado
  return month > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear();
}

/** Remove duplicatas (mesma data, desc, valor) */
function _dedup(items) {
  const seen = new Set();
  return items.filter(it => {
    const key = `${it.date}|${it.description}|${it.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── PREVIEW NA TABELA ─────────────────────────────────────────────────────
function _showPreview(items, filename) {
  document.getElementById('pdf-step-1').classList.add('hidden');
  document.getElementById('pdf-step-2').classList.remove('hidden');
  document.getElementById('pdf-processing').classList.add('hidden');
  document.getElementById('btn-confirmar-pdf').classList.remove('hidden');

  document.getElementById('pdf-info-text').textContent =
    `${items.length} lançamentos encontrados em "${filename}"`;

  const catOpts = state.categories.map(c =>
    `<option value="${c.id}">${c.name}</option>`
  ).join('');

  const tbody = document.getElementById('pdf-preview-tbody');
  tbody.innerHTML = items.map((item, idx) => {
    const dateFmt = item.date
      ? new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})
      : '—';
    const parcTag = item.installmentTotal > 1
      ? `${item.installmentCurrent}/${item.installmentTotal}`
      : '—';

    return `
      <tr>
        <td><input type="checkbox" class="pdf-row-check" data-idx="${idx}" checked /></td>
        <td>${dateFmt}</td>
        <td>
          <input type="text" class="filter-input pdf-desc-input"
            style="font-size:0.78rem;padding:0.25rem 0.5rem;min-width:0;width:100%"
            value="${_escAttr(item.description)}" data-idx="${idx}" data-field="description" />
        </td>
        <td>
          <select class="select-inline pdf-cat-select" data-idx="${idx}">
            <option value="">—</option>
            ${catOpts}
          </select>
        </td>
        <td class="col-value">
          <input type="number" class="filter-input pdf-val-input"
            style="font-size:0.78rem;padding:0.25rem 0.5rem;width:90px;text-align:right"
            value="${item.amount.toFixed(2)}" step="0.01" min="0" data-idx="${idx}" data-field="amount" />
        </td>
        <td>${parcTag}</td>
      </tr>`;
  }).join('');

  // Atualiza _parsedItems ao editar campos
  tbody.addEventListener('input', (e) => {
    const el  = e.target;
    const idx = parseInt(el.dataset.idx, 10);
    if (isNaN(idx)) return;
    if (el.dataset.field === 'description') _parsedItems[idx].description = el.value;
    if (el.dataset.field === 'amount')      _parsedItems[idx].amount = parseFloat(el.value) || 0;
  });
  tbody.addEventListener('change', (e) => {
    const el  = e.target;
    const idx = parseInt(el.dataset.idx, 10);
    if (isNaN(idx)) return;
    if (el.classList.contains('pdf-cat-select')) _parsedItems[idx]._categoryId = el.value;
  });
}

function _escAttr(str) {
  return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── CONFIRMAÇÃO E SAVE ────────────────────────────────────────────────────
async function _confirmarImportacao() {
  const checkboxes = document.querySelectorAll('#pdf-preview-tbody .pdf-row-check');
  const catSelects = document.querySelectorAll('#pdf-preview-tbody .pdf-cat-select');

  const selected = [];
  checkboxes.forEach((cb, i) => {
    if (cb.checked) {
      selected.push({
        ..._parsedItems[i],
        categoryId: catSelects[i]?.value || null,
      });
    }
  });

  if (!selected.length) {
    toast('Selecione ao menos um lançamento.', 'error');
    return;
  }

  const btn = document.getElementById('btn-confirmar-pdf');
  btn.disabled = true;
  btn.textContent = 'Salvando…';

  try {
    // Aplica offset de competência (fatura vence em mês X → competência X-1)
    // Usa a data do primeiro item para detectar o mês da fatura
    const refDate = selected[0].date;
    const [refY, refM] = refDate.split('-').map(Number);
    const competenceM  = refM === 1 ? 12 : refM - 1;
    const competenceY  = refM === 1 ? refY - 1 : refY;
    const competenceMonth = `${competenceY}-${String(competenceM).padStart(2,'0')}`;

    let saved = 0;
    for (const item of selected) {
      const tx = {
        date: item.date,
        description: item.description,
        amount: item.amount,
        categoryId: item.categoryId || '',
        paymentType: 'cartao',
        installmentCurrent: item.installmentCurrent,
        installmentTotal:   item.installmentTotal,
        competenceMonth,
        notes: '',
        isProjected: false,
        importedFrom: 'pdf',
      };

      await saveTx(tx);
      saved++;

      // Projeta parcelas futuras
      if (item.installmentTotal > 1) {
        for (let p = item.installmentCurrent + 1; p <= item.installmentTotal; p++) {
          const delta = p - item.installmentCurrent;
          const [y, m] = competenceMonth.split('-').map(Number);
          const d = new Date(y, m - 1 + delta, 1);
          const futureMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          await saveTx({ ...tx, installmentCurrent: p, competenceMonth: futureMonth, isProjected: true });
        }
      }
    }

    document.getElementById('modal-pdf').classList.add('hidden');
    toast(`${saved} lançamentos importados com sucesso!`, 'success');
    if (_onDoneCallback) _onDoneCallback();

  } catch (err) {
    console.error('Erro ao salvar importação:', err);
    toast('Erro ao salvar. Veja o console.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Confirmar e Salvar';
  }
}
