/**
 * metas.js — formulário e gravação de METAS (redesign v2, rodada 5)
 *
 * Deixou de desenhar tela. A tela é `js/guardado.js`, que funde metas e
 * patrimônio numa folha só; aqui ficou o que é gravação: abrir o modal,
 * validar, somar o aporte no progresso e persistir.
 *
 * É o mesmo recorte que `gastos.js` e `receitas.js` receberam na rodada 3, e
 * pela mesma razão: a tela é remontada por innerHTML a cada gravação, mas os
 * modais moram no `index.html` e NÃO são remontados — então listener no
 * elemento do modal é seguro, e listener no elemento da tela não é.
 *
 * Nenhuma regra mudou: o aporte continua empilhando em `contributions` e
 * somando em `currentAmount`, que é o que `db.js:addAporteToAsset` também faz
 * quando o aporte chega pelo ativo vinculado.
 */

import { state, fmt, toast } from './utils.js';
import { saveGoal, deleteGoal } from './db.js';

let _init = false;
/** Quem redesenha a tela depois de gravar. Quem chama `initMetas` decide. */
let _aoMudar = () => {};

export const TIPO_META = {
  reserva_emergencia: 'Reserva de emergência',
  aposentadoria: 'Aposentadoria',
  viagem: 'Viagem',
  compra: 'Compra de bem',
  outro: 'Outro objetivo',
};

/** Liga os botões DOS MODAIS uma única vez. A tela liga os dela. */
export function initMetas(aoMudar) {
  if (typeof aoMudar === 'function') _aoMudar = aoMudar;
  if (_init) return;
  _init = true;

  document.getElementById('btn-salvar-meta')?.addEventListener('click', _salvarMeta);
  document.getElementById('btn-salvar-aporte')?.addEventListener('click', _salvarAporte);
}

export function openMetaModal(g) {
  document.getElementById('modal-meta-title').textContent = g ? 'Editar Meta' : 'Nova Meta';
  document.getElementById('meta-id').value     = g?.id || '';
  document.getElementById('meta-nome').value   = g?.name || '';
  document.getElementById('meta-tipo').value   = g?.type || 'reserva_emergencia';
  document.getElementById('meta-alvo').value   = g?.targetAmount || '';
  document.getElementById('meta-atual').value  = g?.currentAmount || '';
  document.getElementById('meta-prazo').value  = g?.deadline || '';
  document.getElementById('modal-meta').classList.remove('hidden');
}

export function openAporteMetaModal(goalId) {
  document.getElementById('aporte-meta-id').value = goalId;
  document.getElementById('aporte-valor').value   = '';
  document.getElementById('aporte-data').value    = new Date().toISOString().slice(0, 10);
  document.getElementById('aporte-obs').value     = '';
  document.getElementById('modal-aporte').classList.remove('hidden');
}

/** Exclusão com o `confirm()` nativo, como nas outras exclusões do app. */
export async function excluirMeta(id) {
  if (!confirm('Excluir esta meta?')) return false;
  await deleteGoal(id);
  toast('Meta excluída.', 'success');
  _aoMudar();
  return true;
}

async function _salvarMeta() {
  const id       = document.getElementById('meta-id').value || null;
  const name     = document.getElementById('meta-nome').value.trim();
  const type     = document.getElementById('meta-tipo').value;
  const target   = parseFloat(document.getElementById('meta-alvo').value);
  const current  = parseFloat(document.getElementById('meta-atual').value) || 0;
  const deadline = document.getElementById('meta-prazo').value;

  if (!name)                  return toast('Informe o nome da meta.', 'error');
  if (!target || target <= 0) return toast('Informe o valor alvo.', 'error');

  // O histórico de aportes não vem dos inputs do modal: preservar ao editar.
  const existing = id ? state.goals.find(g => g.id === id) : null;
  await saveGoal({
    name, type, targetAmount: target, currentAmount: current,
    deadline, contributions: existing?.contributions || [],
  }, id);

  document.getElementById('modal-meta').classList.add('hidden');
  toast('Meta salva!', 'success');
  _aoMudar();
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
  await saveGoal({ ...goal, currentAmount: (goal.currentAmount || 0) + amount, contributions }, metaId);

  document.getElementById('modal-aporte').classList.add('hidden');
  toast(`Aporte de ${fmt(amount)} registrado!`, 'success');
  _aoMudar();
}
