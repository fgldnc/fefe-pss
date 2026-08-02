/**
 * pdf-import.fixed.js — Importação de fatura PDF (versão corrigida)
 *
 * SUBSTITUI js/pdf-import.js. Renomeie só depois de validar com uma fatura real.
 * A assinatura pública é a mesma: initPdfImport(onDone).
 *
 * O QUE MUDOU EM RELAÇÃO À VERSÃO ANTERIOR
 * 1. Segmentação por COLUNA antes de montar linhas (js/parsers/pdf-layout.js).
 *    Antes, itens de texto eram agrupados só por Y, o que fundia a coluna
 *    esquerda ("Lançamentos: compras e saques") com a coluna direita
 *    ("Compras parceladas - próximas faturas", "Total dos lançamentos atuais",
 *    "Limites de crédito") na mesma altura.
 * 2. Reconhecimento de SEÇÃO: só a seção de lançamentos vira transação.
 *    A tabela de próximas faturas é informativa e serve apenas para CONFERIR
 *    as projeções que o app já gera — nunca para criar transação nova.
 * 3. Deduplicação de parcela com TOLERÂNCIA de centavos proporcional ao
 *    número de parcelas (ver _tolerancia()).
 * 4. Guarda contra reimportação da mesma fatura (competência + fingerprint
 *    SHA-256 do conjunto de lançamentos).
 * 5. parseMoney/parseInstallment unificados com js/parsers/base-parser.js —
 *    acabou a divergência entre os dois parsers de PDF do projeto.
 * 6. Listeners registrados uma única vez (antes empilhavam a cada abertura
 *    do modal, reprocessando o mesmo arquivo N vezes).
 */

import { state, toast, esc } from './utils.js';
import { saveTx, saveDoc, getAll } from './db.js';
import { parseMoney } from './parsers/base-parser.js';
import { extractColumnStreams } from './parsers/pdf-layout.js';

if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const PDF_MAX_BYTES        = 20 * 1024 * 1024;
const MAX_INSTALLMENTS      = 120;
const DUP_TOLERANCE_FLOOR   = 0.02; // R$ — piso da tolerância de centavos
const DUP_TOLERANCE_CEILING = 1.00; // R$ — teto, para não engolir compra distinta
const INVOICE_COL           = 'importedInvoices';

let _onDoneCallback = null;
let _parsedItems    = [];
let _parsedMeta     = { nextInvoiceRows: [], fingerprint: '', filename: '' };
let _eventsBound    = false;

export function initPdfImport(onDone) {
  _onDoneCallback = onDone;
  _resetModal();
  _attachEvents();
}

// ─── RESET ─────────────────────────────────────────────────────────────────
function _resetModal() {
  document.getElementById('pdf-step-1')?.classList.remove('hidden');
  document.getElementById('pdf-step-2')?.classList.add('hidden');
  document.getElementById('pdf-processing')?.classList.add('hidden');
  document.getElementById('pdf-drop-zone')?.classList.remove('hidden');
  document.getElementById('btn-confirmar-pdf')?.classList.add('hidden');
  const tbody = document.getElementById('pdf-preview-tbody');
  if (tbody) tbody.innerHTML = '';
  const input = document.getElementById('pdf-file-input');
  if (input) input.value = '';
  _parsedItems = [];
  _parsedMeta  = { nextInvoiceRows: [], fingerprint: '', filename: '' };
}

// ─── EVENTOS (registrados UMA vez) ─────────────────────────────────────────
function _attachEvents() {
  if (_eventsBound) return;
  _eventsBound = true;

  const input      = document.getElementById('pdf-file-input');
  const dropZone   = document.getElementById('pdf-drop-zone');
  const confirmBtn = document.getElementById('btn-confirmar-pdf');
  const checkAll   = document.getElementById('pdf-check-all');
  const tbody      = document.getElementById('pdf-preview-tbody');

  input?.addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (f) _processPdf(f);
  });

  dropZone?.addEventListener('click', e => {
    if (e.target === input || e.target.tagName === 'LABEL') return;
    input?.click();
  });
  dropZone?.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('dragover'); });
  dropZone?.addEventListener('dragleave', ()  => dropZone.classList.remove('dragover'));
  dropZone?.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') _processPdf(file);
    else toast('Selecione um arquivo PDF.', 'error');
  });

  confirmBtn?.addEventListener('click', _confirmarImportacao);

  checkAll?.addEventListener('change', e => {
    document.querySelectorAll('#pdf-preview-tbody input[type=checkbox]')
      .forEach(cb => { cb.checked = e.target.checked; });
  });

  // Delegação no tbody: o innerHTML é recriado, mas o tbody não.
  tbody?.addEventListener('input', e => {
    const el = e.target;
    const idx = parseInt(el.dataset.idx, 10);
    if (isNaN(idx) || !_parsedItems[idx]) return;
    if (el.dataset.field === 'description') _parsedItems[idx].description = el.value;
    if (el.dataset.field === 'amount')      _parsedItems[idx].amount = parseFloat(el.value) || 0;
  });
  tbody?.addEventListener('change', e => {
    const el = e.target;
    const idx = parseInt(el.dataset.idx, 10);
    if (isNaN(idx) || !_parsedItems[idx]) return;
    if (el.classList.contains('pdf-cat-select')) _parsedItems[idx]._categoryId = el.value;
  });
}

// ─── LEITURA DO PDF ────────────────────────────────────────────────────────
async function _processPdf(file) {
  if (typeof pdfjsLib === 'undefined') {
    toast('PDF.js não carregou. Verifique a conexão.', 'error');
    return;
  }
  if (file.type !== 'application/pdf') {
    toast('O arquivo precisa ser um PDF válido.', 'error');
    return;
  }
  if (file.size > PDF_MAX_BYTES) {
    toast('O PDF excede o limite de 20 MB.', 'error');
    return;
  }

  document.getElementById('pdf-processing')?.classList.remove('hidden');
  document.getElementById('pdf-drop-zone')?.classList.add('hidden');

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    // Fluxos de linha por coluna, na ordem de leitura
    const streams = await extractColumnStreams(pdf);

    const { lancamentos, proximasFaturas, anoBase } = _parseStreams(streams);

    if (!lancamentos.length) {
      toast('Nenhum lançamento reconhecido. Verifique se o PDF não é escaneado (imagem).', 'error');
      _resetModal();
      return;
    }

    const items = _dedup(_applyYear(lancamentos, anoBase));

    _parsedItems = items;
    _parsedMeta  = {
      nextInvoiceRows: proximasFaturas,
      fingerprint:     await _fingerprint(items),
      filename:        file.name,
    };

    _showPreview(items, file.name, proximasFaturas);

  } catch (err) {
    console.error('Erro ao ler PDF:', err);
    toast('Erro ao processar o PDF. Veja o console para detalhes.', 'error');
    _resetModal();
  }
}

// ─── SEÇÕES DA FATURA ──────────────────────────────────────────────────────
// Só CAPTURA vira transação. INFO é lido para conferência. IGNORE é descartado.
//
// TOLERÂNCIA A ACENTO FRAGMENTADO: o PDF.js entrega palavra acentuada em itens
// separados ("Lan" + "ç" + "amentos"). O join de pdf-layout.js já recola isso
// medindo o vão entre os itens, mas esse recolamento depende de heurística
// (SPACE_GAP_PX) e pode falhar em fatura de outro banco. Por isso todo caractere
// acentuado aqui aceita espaço em volta: /lan\s*[çc]\s*amentos/ casa tanto com
// "Lançamentos" quanto com "Lan ç amentos". Mesmo espírito do [çc]/[aã] que já
// existia — tolerar a variação sem depender de uma única camada.
const SECTION_HEADERS = [
  { re: /lan\s*[çc]\s*amentos\s*:?\s*compras\s+e\s+saques/i,            mode: 'capture' },
  { re: /lan\s*[çc]\s*amentos\s+no\s+cart\s*[aã]\s*o/i,                 mode: 'capture' },
  { re: /lan\s*[çc]\s*amentos\s*:?\s*(nacionais|internacionais)/i,      mode: 'capture' },
  { re: /compras\s+parceladas\s*[-–—]?\s*pr\s*[óo]\s*ximas\s+faturas/i, mode: 'nextinvoice' },
  { re: /total\s+dos\s+lan\s*[çc]\s*amentos\s+atuais/i,                 mode: 'ignore' },
  // Coluna esquerda da fatura Itaú: seção de créditos/pagamentos que precede
  // "Lançamentos: compras e saques". Sem esta regra a seção não trocava de
  // modo e as linhas dependiam só do amount <= 0 para serem descartadas.
  { re: /pagamentos\s+efetuados/i,                                      mode: 'ignore' },
  { re: /total\s+d[oa]s\s+pagamentos/i,                                 mode: 'ignore' },
  { re: /limites?\s+de\s+cr\s*[ée]\s*dito/i,                            mode: 'ignore' },
  { re: /resumo\s+da\s+fatura/i,                                        mode: 'ignore' },
  { re: /encargos\s+e\s+juros/i,                                        mode: 'ignore' },
];

function _sectionOf(line) {
  for (const h of SECTION_HEADERS) if (h.re.test(line)) return h.mode;
  return null;
}

// Palavras que indicam que a linha não é uma despesa
const SKIP_PATTERNS = [
  /total\s+d[ao]s?\s+(sua\s+)?fatura/i,
  /vencimento/i,
  /pagamento\s+(deb|em\s+conta|recebido|efetuado)/i,
  /saldo\s+anterior/i,
  /cr[eé]dito\s+(no\s+)?limit/i,
  /fatura\s+anterior/i,
  /limite\s+dis/i,
  /pre[vv]is[aã]o/i,
  /d[eé]bito\s+autom/i,
  /^pagamento\b/i,
  /^cr[eé]dito\b/i,
  /estorno/i,
  /^a\s*$/i,
];

function _shouldSkip(desc, amount) {
  if (!desc || !amount) return true;
  if (amount <= 0) return true;
  if (desc.trim().length <= 1) return true;
  return SKIP_PATTERNS.some(re => re.test(desc));
}

// ─── PARSER DE LINHA ───────────────────────────────────────────────────────
// "13/07 ESTABELECIMENTO 01/06 267,30"  (parcela explícita)
const RE_LINE_PARC = /^(\d{2})\/(\d{2})\s+(.+?)\s+(\d{1,2})\s*\/\s*(\d{1,3})\s+(-?[\d.,]+)\s*$/;
// "13/07 ESTABELECIMENTO 267,30" ou "... 267,30 D"
const RE_LINE      = /^(\d{2})\/(\d{2})\s+(.+?)\s+(-?[\d.,]+)\s*([DC])?\s*$/;
// Data de vencimento / competência declarada na fatura
const RE_VENCIMENTO = /vencimento[^\d]{0,20}(\d{2})\/(\d{2})\/(\d{4})/i;

function _parseLine(line) {
  let m = line.match(RE_LINE_PARC);
  if (m) {
    const [, dd, mm, descRaw, pcA, pcT, valRaw] = m;
    const amount = parseMoney(valRaw);
    const desc   = descRaw.trim();
    const current = parseInt(pcA, 10);
    const total   = parseInt(pcT, 10);
    if (!_shouldSkip(desc, amount) && total > 1 && total <= MAX_INSTALLMENTS && total >= current) {
      return { dd, mm, description: desc, amount, installmentCurrent: current, installmentTotal: total };
    }
  }

  m = line.match(RE_LINE);
  if (m) {
    const [, dd, mm, descRaw, valRaw] = m;
    const amount = parseMoney(valRaw);
    const desc   = descRaw.trim();
    if (_shouldSkip(desc, amount)) return null;
    const { current, total, cleanDesc } = _parseInstallment(desc);
    return {
      dd, mm,
      description: cleanDesc || desc,
      amount,
      installmentCurrent: current,
      installmentTotal:   total,
    };
  }
  return null;
}

function _parseInstallment(desc) {
  const re = /\s*[-–]?\s*(?:parcela\s*)?(\d{1,2})\s*[\/\-]\s*(\d{1,3})\s*/i;
  const m  = desc.match(re);
  if (m) {
    const current = parseInt(m[1], 10);
    const total   = parseInt(m[2], 10);
    if (total >= current && total > 1 && total <= MAX_INSTALLMENTS) {
      return { current, total, cleanDesc: desc.replace(re, ' ').replace(/\s+/g, ' ').trim() };
    }
  }
  return { current: 1, total: 1, cleanDesc: desc };
}

/**
 * Percorre os fluxos de coluna aplicando a máquina de estados de seção.
 * Cada coluna começa em 'unknown' (captura, para não perder a primeira página
 * de faturas que não repetem o cabeçalho) e muda a cada cabeçalho reconhecido.
 */
function _parseStreams(streams) {
  const lancamentos     = [];
  const proximasFaturas = [];
  let anoBase = null;

  for (const stream of streams) {
    let mode = 'unknown';

    for (const rawLine of stream.lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Ano de referência declarado na fatura (mais confiável que adivinhar)
      if (!anoBase) {
        const v = line.match(RE_VENCIMENTO);
        if (v) anoBase = { year: parseInt(v[3], 10), month: parseInt(v[2], 10) };
      }

      const header = _sectionOf(line);
      if (header) { mode = header; continue; }
      if (mode === 'ignore') continue;

      const parsed = _parseLine(line);
      if (!parsed) continue;

      parsed._origin = { page: stream.page, column: stream.column, line };

      if (mode === 'nextinvoice') proximasFaturas.push(parsed);
      else lancamentos.push(parsed);      // 'capture' e 'unknown'
    }
  }

  return { lancamentos, proximasFaturas, anoBase };
}

/**
 * Resolve o ano de cada lançamento.
 * Preferência: ano do vencimento declarado na fatura. Se o mês do lançamento
 * for MAIOR que o mês do vencimento, a compra é do ano anterior (virada de ano).
 * Sem vencimento na fatura, cai na heurística antiga baseada na data de hoje.
 */
function _applyYear(items, anoBase) {
  return items.map(it => {
    const mm = parseInt(it.mm, 10);
    let year;
    if (anoBase) {
      year = mm > anoBase.month ? anoBase.year - 1 : anoBase.year;
    } else {
      const now = new Date();
      year = mm > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear();
    }
    return {
      date: `${year}-${String(it.mm).padStart(2, '0')}-${String(it.dd).padStart(2, '0')}`,
      description: it.description,
      amount: it.amount,
      installmentCurrent: it.installmentCurrent,
      installmentTotal:   it.installmentTotal,
      _origin: it._origin,
    };
  });
}

function _dedup(items) {
  const seen = new Set();
  return items.filter(it => {
    const key = `${it.date}|${_normDesc(it.description)}|${it.amount.toFixed(2)}|${it.installmentCurrent}/${it.installmentTotal}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const _normDesc = (s) => (s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// ─── TOLERÂNCIA DE CENTAVOS NA DEDUPLICAÇÃO ────────────────────────────────
/**
 * Por que a tolerância existe: ao dividir uma compra em N parcelas, o emissor
 * arredonda cada parcela e joga o resto em uma delas. A diferença máxima
 * possível entre duas parcelas da MESMA compra é (N-1) centavos.
 * Ex.: R$ 1.603,79 em 6x → 5 parcelas de X,30 e uma de X,28.
 *
 * Critério: tolerância = clamp((N-1)/100 + 1 centavo, R$ 0,02, R$ 1,00).
 * O piso cobre erro de leitura do PDF; o teto impede que duas compras
 * distintas de valor próximo no mesmo estabelecimento sejam fundidas.
 */
function _tolerancia(parcelaTotal) {
  const n = Math.max(1, parcelaTotal || 1);
  const t = (n - 1) / 100 + 0.01;
  return Math.min(DUP_TOLERANCE_CEILING, Math.max(DUP_TOLERANCE_FLOOR, t));
}

function _parcelaJaExiste(desc, amount, parcelaNum, parcelaTotal) {
  const nd  = _normDesc(desc);
  const tol = _tolerancia(parcelaTotal);
  return state.transactions.some(t => {
    if ((t.installmentTotal || 1) <= 1) return false;
    if (t.installmentCurrent !== parcelaNum) return false;
    if (t.installmentTotal   !== parcelaTotal) return false;
    if (_normDesc(t.description) !== nd) return false;
    return Math.abs((t.amount || 0) - amount) <= tol;
  });
}

// ─── FINGERPRINT DA FATURA (anti-reimportação) ─────────────────────────────
/**
 * Identidade da fatura = conjunto ordenado de (data|descrição normalizada|valor).
 * Independe da ordem de leitura e da competência escolhida no preview, então
 * reimportar o mesmo arquivo — mesmo com outro nome — gera o mesmo hash.
 */
async function _fingerprint(items) {
  const canon = items
    .map(i => `${i.date}|${_normDesc(i.description)}|${i.amount.toFixed(2)}`)
    .sort()
    .join('\n');
  try {
    const buf  = new TextEncoder().encode(canon);
    const hash = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    // crypto.subtle exige contexto seguro (https/localhost). Fallback determinístico.
    let h = 0x811c9dc5;
    for (let i = 0; i < canon.length; i++) {
      h ^= canon.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return 'fnv' + h.toString(16);
  }
}

async function _faturaJaImportada(competenceMonth, fingerprint) {
  try {
    const docs = await getAll(INVOICE_COL);
    return docs.find(d => d.fingerprint === fingerprint) || null;
  } catch (err) {
    console.warn('Não foi possível verificar reimportação:', err);
    return null; // falha de leitura não pode bloquear a importação
  }
}

// ─── PREVIEW ───────────────────────────────────────────────────────────────
function _showPreview(items, filename, proximasFaturas) {
  document.getElementById('pdf-step-1').classList.add('hidden');
  document.getElementById('pdf-step-2').classList.remove('hidden');
  document.getElementById('pdf-processing').classList.add('hidden');
  document.getElementById('btn-confirmar-pdf').classList.remove('hidden');

  const infoEl = document.getElementById('pdf-info-text');
  if (infoEl) {
    const extra = proximasFaturas.length
      ? ` · ${proximasFaturas.length} linha(s) de "próximas faturas" ignorada(s) (usadas só para conferir as projeções)`
      : '';
    infoEl.textContent = `${items.length} lançamentos encontrados em "${filename}"${extra}`;
  }

  const compInput = document.getElementById('pdf-competencia');
  if (compInput) {
    const refDate = items[0]?.date || new Date().toISOString().slice(0, 10);
    const [gy, gm] = refDate.split('-').map(Number);
    const offset = parseInt(localStorage.getItem('fluxo_billing_offset') ?? '-1', 10);
    let cy = gy, cm = gm + offset;
    if (cm < 1)  { cm += 12; cy -= 1; }
    if (cm > 12) { cm -= 12; cy += 1; }
    compInput.value = `${cy}-${String(cm).padStart(2, '0')}`;
  }

  const catOpts = state.categories
    .map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');

  const catSuggest = (desc) => {
    const d = (desc || '').toLowerCase();
    for (const cat of state.categories) {
      const kws = (cat.keywords || [cat.name.toLowerCase()]);
      if (kws.some(kw => d.includes(String(kw).toLowerCase()))) return cat.id;
    }
    return '';
  };

  const tbody = document.getElementById('pdf-preview-tbody');
  tbody.innerHTML = items.map((item, idx) => {
    const dateFmt = item.date
      ? new Date(item.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      : '—';
    const parcTag = item.installmentTotal > 1
      ? `${item.installmentCurrent}/${item.installmentTotal}` : '—';

    return `
      <tr>
        <td><input type="checkbox" class="pdf-row-check" data-idx="${idx}" checked
                   aria-label="Importar lançamento ${idx + 1}" /></td>
        <td>${esc(dateFmt)}</td>
        <td>
          <input type="text" class="filter-input pdf-desc-input" aria-label="Descrição"
            style="font-size:0.78rem;padding:0.25rem 0.5rem;min-width:0;width:100%"
            value="${esc(item.description)}" data-idx="${idx}" data-field="description" />
        </td>
        <td>
          <select class="select-inline pdf-cat-select" data-idx="${idx}" aria-label="Categoria">
            <option value="">—</option>
            ${catOpts}
          </select>
        </td>
        <td class="col-value">
          <input type="number" class="filter-input pdf-val-input" aria-label="Valor"
            style="font-size:0.78rem;padding:0.25rem 0.5rem;width:90px;text-align:right"
            value="${item.amount.toFixed(2)}" step="0.01" min="0"
            data-idx="${idx}" data-field="amount" />
        </td>
        <td>${esc(parcTag)}</td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('.pdf-cat-select').forEach(sel => {
    const idx = parseInt(sel.dataset.idx, 10);
    const sug = catSuggest(_parsedItems[idx]?.description || '');
    if (sug) { sel.value = sug; _parsedItems[idx]._categoryId = sug; }
  });
}

// ─── CONFERÊNCIA CONTRA "PRÓXIMAS FATURAS" ─────────────────────────────────
/**
 * A tabela "Compras parceladas - próximas faturas" NÃO gera transação.
 * Ela é usada só para avisar quando a projeção do app diverge do que o banco
 * informa (parcela faltando, valor fora da tolerância).
 */
function _conferirProjecoes(projetadas, proximasFaturas) {
  const avisos = [];
  for (const ref of proximasFaturas) {
    const nd  = _normDesc(ref.description);
    const tol = _tolerancia(ref.installmentTotal);
    const match = projetadas.find(p =>
      _normDesc(p.description) === nd &&
      p.installmentCurrent === ref.installmentCurrent &&
      p.installmentTotal   === ref.installmentTotal
    );
    if (!match) {
      avisos.push(`Parcela ${ref.installmentCurrent}/${ref.installmentTotal} de "${ref.description}" aparece na fatura mas não foi projetada.`);
    } else if (Math.abs(match.amount - ref.amount) > tol) {
      avisos.push(`Valor projetado de "${ref.description}" (${ref.installmentCurrent}/${ref.installmentTotal}) diverge do informado pelo banco.`);
    }
  }
  return avisos;
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
    let competenceMonth = document.getElementById('pdf-competencia')?.value || '';
    if (!/^\d{4}-\d{2}$/.test(competenceMonth)) {
      const refDate = selected[0].date || new Date().toISOString().slice(0, 10);
      const [refY, refM] = refDate.split('-').map(Number);
      const offset = parseInt(localStorage.getItem('fluxo_billing_offset') ?? '-1', 10);
      let compY = refY, compM = refM + offset;
      if (compM < 1)  { compM += 12; compY -= 1; }
      if (compM > 12) { compM -= 12; compY += 1; }
      competenceMonth = `${compY}-${String(compM).padStart(2, '0')}`;
    }

    // ── Guarda contra reimportação da mesma fatura ────────────────────────
    const jaImportada = await _faturaJaImportada(competenceMonth, _parsedMeta.fingerprint);
    if (jaImportada) {
      const quando = jaImportada.importedAt
        ? new Date(jaImportada.importedAt).toLocaleString('pt-BR') : 'anteriormente';
      const ok = confirm(
        `Esta fatura já foi importada em ${quando} (competência ${jaImportada.competenceMonth}).\n\n` +
        `Importar de novo vai duplicar os lançamentos. Continuar mesmo assim?`
      );
      if (!ok) { toast('Importação cancelada — fatura já registrada.', 'info'); return; }
    }

    let saved = 0;
    let skippedDuplicates = 0;
    const projetadas = [];

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
        invoiceFingerprint: _parsedMeta.fingerprint,
      };

      if (item.installmentTotal > 1 &&
          _parcelaJaExiste(item.description, item.amount, item.installmentCurrent, item.installmentTotal)) {
        skippedDuplicates++;
      } else {
        await saveTx(tx);
        saved++;
      }

      if (item.installmentTotal > 1) {
        for (let p = item.installmentCurrent + 1; p <= item.installmentTotal; p++) {
          if (_parcelaJaExiste(item.description, item.amount, p, item.installmentTotal)) {
            skippedDuplicates++;
            continue;
          }
          const delta = p - item.installmentCurrent;
          const [y, mo] = competenceMonth.split('-').map(Number);
          const futureDate = new Date(y, mo - 1 + delta, 1);
          const futureMonth = `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}`;

          // Mantém o DIA da compra, avançando mês/ano — necessário para a aba Saldos
          const origDate  = item.date ? new Date(item.date + 'T00:00:00') : new Date();
          const lastDay   = new Date(futureDate.getFullYear(), futureDate.getMonth() + 1, 0).getDate();
          const safeDay   = Math.min(origDate.getDate(), lastDay);
          const projectedDateStr =
            `${futureDate.getFullYear()}-${String(futureDate.getMonth() + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;

          const proj = {
            ...tx,
            date: projectedDateStr,
            installmentCurrent: p,
            competenceMonth: futureMonth,
            isProjected: true,
          };
          await saveTx(proj);
          projetadas.push(proj);
        }
      }
    }

    // Registra a fatura para bloquear reimportação futura
    try {
      await saveDoc(INVOICE_COL, {
        fingerprint:     _parsedMeta.fingerprint,
        competenceMonth,
        filename:        _parsedMeta.filename,
        itemCount:       selected.length,
        importedAt:      new Date().toISOString(),
      }, _parsedMeta.fingerprint);
    } catch (err) {
      console.warn('Não foi possível registrar o fingerprint da fatura:', err);
    }

    // Conferência informativa contra a tabela de próximas faturas
    const avisos = _conferirProjecoes(projetadas, _parsedMeta.nextInvoiceRows);
    if (avisos.length) {
      console.warn('Divergências entre projeção e "próximas faturas":', avisos);
      toast(`${avisos.length} divergência(s) entre a projeção e a tabela de próximas faturas. Veja o console.`, 'warning');
    }

    if (skippedDuplicates > 0) {
      toast(`${skippedDuplicates} parcela(s) já existente(s) foram ignoradas para evitar duplicidade.`, 'info');
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
