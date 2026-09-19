/**
 * receitas.js — formulário e gravação de receita
 *
 * Deixou de ser uma aba na rodada 3 do redesign v2: a lista de receitas foi
 * absorvida pela tabela única de `js/mes.js`, onde entrada e saída aparecem
 * lado a lado com o sinal e a origem. Aqui ficou o modal, a gravação e o
 * "copiar do mês anterior".
 *
 * Quem desenha chama `initReceitas(aoMudar)` uma vez e depois
 * `openReceitaModal(inc)`; o callback roda depois de cada gravação.
 */

import { state, toast, isOfMonth } from './utils.js';
import { saveIncome } from './db.js';

let _aoMudar = () => {};
let _initialized = false;

export function initReceitas(aoMudar) {
  if (typeof aoMudar === 'function') _aoMudar = aoMudar;
  if (_initialized) return;
  _initialized = true;

  // O modal mora no index.html e não é remontado por innerHTML: listener no
  // elemento é seguro aqui, ao contrário do que vale na tela.
  document.getElementById('btn-salvar-receita')?.addEventListener('click', _salvarReceita);
}

/** `inc` nulo abre em branco; com registro, abre para editar. */
export function openReceitaModal(inc) {
  document.getElementById('receita-id').value    = inc?.id || '';
  document.getElementById('receita-tipo').value  = inc?.type || 'salario';
  document.getElementById('receita-desc').value  = inc?.description || '';
  document.getElementById('receita-valor').value = inc?.amount ?? '';
  document.getElementById('receita-data').value  = inc?.date || _today();
  document.getElementById('modal-receita-title').textContent = inc ? 'Editar Receita' : 'Nova Receita';
  document.getElementById('modal-receita').classList.remove('hidden');
}

async function _salvarReceita() {
  const id     = document.getElementById('receita-id').value || null;
  const tipo   = document.getElementById('receita-tipo').value;
  const desc   = document.getElementById('receita-desc').value.trim();
  const amount = parseFloat(document.getElementById('receita-valor').value);
  const date   = document.getElementById('receita-data').value;

  if (!amount || amount <= 0) return toast('Informe um valor válido.', 'error');

  // Editar preserva a procedência. saveIncome grava o objeto inteiro; montar
  // um objeto só com os campos do formulário apagava `source`, `bankName` e
  // `importBatchId` de uma receita vinda de extrato — e sem importBatchId
  // "Excluir importação" deixava a receita órfã no Firestore para sempre.
  const anterior = id ? state.incomes.find(i => i.id === id) : null;
  const { id: _ignorado, ...preservado } = anterior || {};

  await saveIncome({
    ...preservado,
    type: tipo, description: desc, amount, date, month: state.currentMonth,
  }, id);
  document.getElementById('modal-receita').classList.add('hidden');
  toast('Receita salva!', 'success');
  _aoMudar();
}

/**
 * Copia as receitas MANUAIS do mês anterior. As de extrato ficam de fora: elas
 * voltam sozinhas na próxima importação, e copiá-las criaria uma segunda
 * linha do mesmo salário quando o extrato chegasse.
 */
export async function copiarReceitasDoMesAnterior() {
  const prev = _offsetMonth(state.currentMonth, -1);
  const fromPrev = state.incomes.filter(i =>
    isOfMonth(i, prev) && i.source !== 'statement_import'
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
  _aoMudar();
}

function _offsetMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _today() { return new Date().toISOString().slice(0, 10); }
