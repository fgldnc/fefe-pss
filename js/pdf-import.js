/**
 * pdf-import.js — Importação de fatura PDF
 *
 * Parsers suportados (em ordem de tentativa):
 *  1. Itaú Personnalité / Itaú padrão
 *  2. Nubank
 *  3. Santander
 *  4. Genérico (DD/MM/YYYY valor)
 *
 * Linhas ignoradas automaticamente:
 *  - Total da fatura, vencimento, saldo anterior, crédito, pagamento, IOF avulso
 *  - Valores negativos (estorno/crédito)
 *  - Linhas com valor zerado
 */

import { state, toast } from './utils.js';
import { saveTx } from './db.js';

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

// ─── RESET ─────────────────────────────────────────────────────────────────
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
  const input      = document.getElementById('pdf-file-input');
  const dropZone   = document.getElementById('pdf-drop-zone');
  const confirmBtn = document.getElementById('btn-confirmar-pdf');
  const checkAll   = document.getElementById('pdf-check-all');

  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  newInput.addEventListener('change', e => { if (e.target.files[0]) _processPdf(e.target.files[0]); });

  dropZone.addEventListener('click', () => newInput.click());
  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') _processPdf(file);
    else toast('Selecione um arquivo PDF.', 'error');
  });

  const newConfirm = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newConfirm, confirmBtn);
  newConfirm.addEventListener('click', _confirmarImportacao);

  checkAll.addEventListener('change', e => {
    document.querySelectorAll('#pdf-preview-tbody input[type=checkbox]').forEach(cb => {
      cb.checked = e.target.checked;
    });
  });
}

// ─── LEITURA DO PDF ────────────────────────────────────────────────────────
const PDF_MAX_BYTES = 20 * 1024 * 1024; // 20 MB

async function _processPdf(file) {
  if (typeof pdfjsLib === 'undefined') {
    toast('PDF.js não carregou. Verifique a conexão.', 'error');
    return;
  }
  // Valida MIME type e tamanho máximo
  if (file.type !== 'application/pdf') {
    toast('O arquivo precisa ser um PDF válido.', 'error');
    return;
  }
  if (file.size > PDF_MAX_BYTES) {
    toast('O PDF excede o limite de 20 MB.', 'error');
    return;
  }
  document.getElementById('pdf-processing').classList.remove('hidden');
  document.getElementById('pdf-drop-zone').classList.add('hidden');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Extrai texto preservando posição Y para reconstruir linhas
    let allLines = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Agrupa itens por linha (Y aproximado, tolerância de 3px)
      const byY = {};
      for (const item of content.items) {
        const y = Math.round(item.transform[5] / 3) * 3;
        byY[y] = byY[y] || [];
        byY[y].push(item.str);
      }
      // Ordena do topo para baixo (Y maior = mais alto na página)
      const sorted = Object.keys(byY).sort((a,b) => b - a);
      for (const y of sorted) allLines.push(byY[y].join(' '));
    }

    const fullText = allLines.join('\n');
    const items    = _parseStatement(fullText);

    if (!items.length) {
      toast('Nenhum lançamento reconhecido. Verifique se o PDF não é escaneado (imagem).', 'error');
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

// ─── PALAVRAS QUE INDICAM QUE A LINHA NÃO É UMA DESPESA ──────────────────
const SKIP_PATTERNS = [
  /total\s+da\s+(sua\s+)?fatura/i,
  /vencimento/i,
  /pagamento\s+(deb|em\s+conta|recebido|efetuado)/i,
  /saldo\s+anterior/i,
  /cr[eé]dito\s+(no\s+)?limit/i,
  /fatura\s+anterior/i,
  /limite\s+dis/i,
  /pre[vv]is[aã]o/i,          // "Previsão de fatura"
  /d[eé]bito\s+autom/i,       // "Débito automático" (é o pagamento)
  /^pagamento\b/i,
  /^cr[eé]dito\b/i,
  /estorno/i,
  /^a\s*$/i,                   // linha "a" isolada (artefato de PDF)
];

function _shouldSkip(desc, amount) {
  if (!desc || !amount) return true;
  if (amount <= 0) return true;                   // crédito/estorno
  if (desc.trim().length <= 1) return true;        // caractere solto
  return SKIP_PATTERNS.some(re => re.test(desc));
}

// ─── PARSER PRINCIPAL ──────────────────────────────────────────────────────
function _parseStatement(text) {
  let items = [];

  // 1 — Itaú: "DD/MM DESCRIÇÃO 9.999,99" ou "DD/MM DESCRIÇÃO (9.999,99)"
  //     O Itaú às vezes coloca o valor na mesma linha ou na próxima
  items = _parseItau(text);
  if (items.length >= 3) return _dedup(items);

  // 2 — Nubank: "DD MÊS DESCRIÇÃO R$ 9,99"
  items = _parseNubank(text);
  if (items.length >= 3) return _dedup(items);

  // 3 — Genérico DD/MM/YYYY
  items = _parseGenerico(text);
  return _dedup(items);
}

// ─── PARSER ITAÚ ───────────────────────────────────────────────────────────
function _parseItau(text) {
  const items = [];
  const lines = text.split('\n');

  // Padrão Itaú linha única: "07/04 DESCRICAO   1.234,56"
  // Também captura: "07/04 DESCRICAO   1.234,56 D" (D = débito)
  const reLine = /^(\d{2})\/(\d{2})\s+(.+?)\s+([\d.,]+(?:\s*[DC])?)\s*$/;

  // Itaú também pode ter parcelas como "07/04 DESCRICAO 03/12  1.234,56"
  const reLineParc = /^(\d{2})\/(\d{2})\s+(.+?)\s+(\d{2})\/(\d{2,3})\s+([\d.,]+)\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Tenta com parcela explícita
    let m = line.match(reLineParc);
    if (m) {
      const [, dd, mm,, pcA, pcT, valRaw] = m;
      const desc   = m[3].trim();
      const amount = _parseMoney(valRaw);
      if (!_shouldSkip(desc, amount)) {
        const { cleanDesc } = _parseInstallment(desc);
        items.push({
          date: _buildDate(dd, mm),
          description: cleanDesc || desc,
          amount,
          installmentCurrent: parseInt(pcA, 10),
          installmentTotal:   parseInt(pcT, 10),
        });
        continue;
      }
    }

    // Tenta linha simples
    m = line.match(reLine);
    if (m) {
      const [, dd, mm, descRaw, valRaw] = m;
      const amount = _parseMoney(valRaw.replace(/\s*[DC]$/,''));
      const desc   = descRaw.trim();
      if (!_shouldSkip(desc, amount)) {
        const { current, total, cleanDesc } = _parseInstallment(desc);
        items.push({
          date: _buildDate(dd, mm),
          description: cleanDesc || desc,
          amount,
          installmentCurrent: current,
          installmentTotal:   total,
        });
      }
    }
  }
  return items;
}

// ─── PARSER NUBANK ─────────────────────────────────────────────────────────
function _parseNubank(text) {
  const items = [];
  const re    = /(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(.+?)\s+R?\$?\s*([\d.,]+)/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    const [, dd, mon, descRaw, valRaw] = m;
    const amount = _parseMoney(valRaw);
    const desc   = descRaw.trim();
    if (_shouldSkip(desc, amount)) continue;
    const { current, total, cleanDesc } = _parseInstallment(desc);
    items.push({
      date: _buildDate(dd, String(_monthNum(mon)).padStart(2,'0')),
      description: cleanDesc || desc,
      amount,
      installmentCurrent: current,
      installmentTotal:   total,
    });
  }
  return items;
}

// ─── PARSER GENÉRICO ───────────────────────────────────────────────────────
function _parseGenerico(text) {
  const items = [];
  const re    = /(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\s+(.+?)\s+([\d.,]+)\s*(?:[DC])?/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const [, dd, mm, yy, descRaw, valRaw] = m;
    const amount = _parseMoney(valRaw);
    const desc   = descRaw.trim();
    if (_shouldSkip(desc, amount)) continue;
    const year = yy ? (yy.length === 2 ? `20${yy}` : yy) : _guessYear(parseInt(mm,10));
    const { current, total, cleanDesc } = _parseInstallment(desc);
    items.push({
      date: `${year}-${mm}-${dd}`,
      description: cleanDesc || desc,
      amount,
      installmentCurrent: current,
      installmentTotal:   total,
    });
  }
  return items;
}

// ─── HELPERS ───────────────────────────────────────────────────────────────
function _parseMoney(raw) {
  if (!raw) return 0;
  const s = raw.trim().replace(/\s/g,'');
  if (/^\d{1,3}(\.\d{3})*,\d{2}$/.test(s))
    return parseFloat(s.replace(/\./g,'').replace(',','.'));
  return parseFloat(s.replace(/[^0-9.]/g,'')) || 0;
}

function _parseInstallment(desc) {
  // Reconhece "03/12", "3/12", "parcela 3 de 12", "03-12" no meio ou fim da string
  const re = /\s*[-–]?\s*(?:parcela\s*)?(\d{1,2})[\/\-](\d{1,3})\s*/i;
  const m  = desc.match(re);
  if (m) {
    const current = parseInt(m[1], 10);
    const total   = parseInt(m[2], 10);
    const clean   = desc.replace(re, ' ').trim();
    if (total >= current && total > 1 && total <= 120)
      return { current, total, cleanDesc: clean };
  }
  return { current: 1, total: 1, cleanDesc: desc };
}

function _buildDate(dd, mm) {
  const year = _guessYear(parseInt(mm, 10));
  return `${year}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`;
}

function _monthNum(abbr) {
  const map = { JAN:1, FEV:2, MAR:3, ABR:4, MAI:5, JUN:6,
                JUL:7, AGO:8, SET:9, OUT:10, NOV:11, DEZ:12 };
  return map[(abbr||'').toUpperCase()] || 1;
}

function _guessYear(month) {
  const now = new Date();
  // Mês futuro → provavelmente ano passado
  return month > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear();
}

function _dedup(items) {
  const seen = new Set();
  return items.filter(it => {
    const key = `${it.date}|${it.description}|${it.amount}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── PREVIEW ───────────────────────────────────────────────────────────────
function _showPreview(items, filename) {
  document.getElementById('pdf-step-1').classList.add('hidden');
  document.getElementById('pdf-step-2').classList.remove('hidden');
  document.getElementById('pdf-processing').classList.add('hidden');
  document.getElementById('btn-confirmar-pdf').classList.remove('hidden');
  document.getElementById('pdf-info-text').textContent =
    `${items.length} lançamentos encontrados em "${filename}"`;

  const catOpts = state.categories
    .map(c => `<option value="${c.id}">${c.name}</option>`).join('');

  // Tenta sugerir categoria automaticamente por palavra-chave
  const catSuggest = (desc) => {
    const d = desc.toLowerCase();
    for (const cat of state.categories) {
      const kws = (cat.keywords || [cat.name.toLowerCase()]);
      if (kws.some(kw => d.includes(kw.toLowerCase()))) return cat.id;
    }
    return '';
  };

  const tbody = document.getElementById('pdf-preview-tbody');
  tbody.innerHTML = items.map((item, idx) => {
    const dateFmt  = item.date
      ? new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})
      : '—';
    const parcTag  = item.installmentTotal > 1
      ? `${item.installmentCurrent}/${item.installmentTotal}` : '—';
    const sugCat   = catSuggest(item.description);

    return `
      <tr>
        <td><input type="checkbox" class="pdf-row-check" data-idx="${idx}" checked /></td>
        <td>${dateFmt}</td>
        <td>
          <input type="text" class="filter-input pdf-desc-input"
            style="font-size:0.78rem;padding:0.25rem 0.5rem;min-width:0;width:100%"
            value="${_esc(item.description)}" data-idx="${idx}" data-field="description" />
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
            value="${item.amount.toFixed(2)}" step="0.01" min="0"
            data-idx="${idx}" data-field="amount" />
        </td>
        <td>${parcTag}</td>
      </tr>`;
  }).join('');

  // Aplica sugestão de categoria
  tbody.querySelectorAll('.pdf-cat-select').forEach(sel => {
    const idx = parseInt(sel.dataset.idx, 10);
    const sug = catSuggest(_parsedItems[idx]?.description || '');
    if (sug) { sel.value = sug; _parsedItems[idx]._categoryId = sug; }
  });

  tbody.addEventListener('input', e => {
    const el = e.target; const idx = parseInt(el.dataset.idx, 10);
    if (isNaN(idx)) return;
    if (el.dataset.field === 'description') _parsedItems[idx].description = el.value;
    if (el.dataset.field === 'amount')      _parsedItems[idx].amount = parseFloat(el.value) || 0;
  });
  tbody.addEventListener('change', e => {
    const el = e.target; const idx = parseInt(el.dataset.idx, 10);
    if (isNaN(idx)) return;
    if (el.classList.contains('pdf-cat-select')) _parsedItems[idx]._categoryId = el.value;
  });
}

function _esc(str) {
  return (str||'').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── CONFIRMAR E SALVAR ────────────────────────────────────────────────────
async function _confirmarImportacao() {
  const checkboxes = document.querySelectorAll('#pdf-preview-tbody .pdf-row-check');
  const catSelects = document.querySelectorAll('#pdf-preview-tbody .pdf-cat-select');

  const selected = [];
  checkboxes.forEach((cb, i) => {
    if (cb.checked) selected.push({ ..._parsedItems[i], categoryId: catSelects[i]?.value || '' });
  });

  if (!selected.length) { toast('Selecione ao menos um lançamento.', 'error'); return; }

  const btn = document.getElementById('btn-confirmar-pdf');
  btn.disabled = true; btn.textContent = 'Salvando…';

  try {
    // Calcula mês de competência = mês da fatura - 1 (offset padrão)
    const refDate = selected[0].date || '';
    const [refY, refM] = (refDate || `${new Date().getFullYear()}-${new Date().getMonth()+1}`).split('-').map(Number);
    const compM  = refM === 1 ? 12 : refM - 1;
    const compY  = refM === 1 ? refY - 1 : refY;
    const competenceMonth = `${compY}-${String(compM).padStart(2,'0')}`;

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

      // Projeta parcelas restantes
      if (item.installmentTotal > 1) {
        for (let p = item.installmentCurrent + 1; p <= item.installmentTotal; p++) {
          const delta = p - item.installmentCurrent;
          const [y, mo] = competenceMonth.split('-').map(Number);
          const d = new Date(y, mo - 1 + delta, 1);
          const futureMonth = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
          await saveTx({ ...tx, installmentCurrent: p, competenceMonth: futureMonth, isProjected: true });
        }
      }
    }

    document.getElementById('modal-pdf').classList.add('hidden');
    toast(`${saved} lançamentos importados!`, 'success');
    if (_onDoneCallback) _onDoneCallback();

  } catch (err) {
    console.error(err);
    toast('Erro ao salvar. Veja o console.', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Confirmar e Salvar';
  }
}
