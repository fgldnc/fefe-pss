/**
 * patrimonio.js — formulário e gravação de ATIVOS (redesign v2, rodada 5)
 *
 * Deixou de desenhar tela, pela mesma razão que `metas.js`: quem desenha é
 * `js/guardado.js`. Aqui ficaram o modal de ativo, o modal de aporte, a
 * gravação e o cálculo de depreciação — que a tela precisa importar em vez de
 * recalcular, porque duas leituras diferentes do mesmo bem viram dois
 * patrimônios totais.
 *
 * O gráfico "Composição" MORREU nesta rodada: os quatro números do topo de
 * Guardado já SÃO a composição, em número. A rosca repetia em desenho o que
 * já estava escrito, e ela pintava com `--c2/--c4/--c5` — cor de tema antigo.
 * No lugar ficou uma barra empilhada de uma linha, em `guardado.js`.
 * O gráfico "Aportes por mês" continua existindo e mudou de arquivo.
 */

import { state, fmt, toast, esc } from './utils.js';
import { saveAsset, deleteAsset, addAporteToAsset } from './db.js';

let _init = false;
let _aoMudar = () => {};

export const TIPO_ATIVO = {
  investimento: 'Investimento',
  caixa: 'Caixa / conta',
  bem_pessoal: 'Bem pessoal',
};

/**
 * Valor de hoje de um ativo. Bem pessoal com taxa de depreciação decai
 * exponencialmente a partir da aquisição; o resto vale o `currentValue`
 * declarado — o app NÃO guarda histórico de valor de ativo.
 */
export function valorDepreciado(a) {
  if (a.type !== 'bem_pessoal' || !a.depreciationRate || !a.acquiredAt) {
    return a.currentValue || 0;
  }
  const years     = (Date.now() - new Date(a.acquiredAt).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  const remaining = Math.pow(1 - (a.depreciationRate / 100), years);
  return Math.max(0, (a.initialValue || 0) * remaining);
}

/** Liga os controles DOS MODAIS uma única vez. A tela liga os dela. */
export function initPatrimonio(aoMudar) {
  if (typeof aoMudar === 'function') _aoMudar = aoMudar;
  if (_init) return;
  _init = true;

  // Depreciação só faz sentido em bem pessoal; meta vinculada, só em
  // investimento — é o aporte no investimento que credita a meta.
  document.getElementById('ativo-tipo')?.addEventListener('change', (e) => {
    _alternarCamposPorTipo(e.target.value);
  });

  document.getElementById('btn-salvar-ativo')?.addEventListener('click', _salvarAtivo);
  document.getElementById('btn-salvar-aporte-ativo')?.addEventListener('click', _salvarAporteAtivo);
}

function _alternarCamposPorTipo(tipo) {
  const deprec = document.getElementById('deprec-row');
  if (deprec) deprec.style.display = tipo === 'bem_pessoal' ? 'flex' : 'none';
  const metaRow = document.getElementById('ativo-meta-row');
  if (metaRow) metaRow.style.display = tipo === 'investimento' ? 'flex' : 'none';
}

function _populateMetaSelect(selectedId) {
  const sel = document.getElementById('ativo-meta');
  if (!sel) return;
  sel.innerHTML = '<option value="">Nenhuma</option>' +
    state.goals.map(g =>
      `<option value="${esc(g.id)}" ${g.id === selectedId ? 'selected' : ''}>${esc(g.name)}</option>`
    ).join('');
}

export function openAtivoModal(a) {
  document.getElementById('modal-ativo-title').textContent = a ? 'Editar Ativo' : 'Novo Ativo / Bem';
  document.getElementById('ativo-id').value            = a?.id || '';
  document.getElementById('ativo-nome').value          = a?.name || '';
  document.getElementById('ativo-tipo').value          = a?.type || 'investimento';
  document.getElementById('ativo-valor-inicial').value = a?.initialValue || '';
  document.getElementById('ativo-valor-atual').value   = a?.currentValue || '';
  document.getElementById('ativo-data').value          = a?.acquiredAt || '';
  document.getElementById('ativo-deprec').value        = a?.depreciationRate || '';
  document.getElementById('ativo-obs').value           = a?.notes || '';
  _populateMetaSelect(a?.linkedGoalId || '');
  _alternarCamposPorTipo(a?.type || 'investimento');
  document.getElementById('modal-ativo').classList.remove('hidden');
}

export function openAporteAtivoModal(assetId) {
  const a = state.assets.find(x => x.id === assetId);
  if (!a) return;
  document.getElementById('modal-aporte-ativo-title').textContent = `Aporte em "${a.name}"`;
  document.getElementById('aporte-ativo-id').value    = assetId;
  document.getElementById('aporte-ativo-valor').value = '';
  document.getElementById('aporte-ativo-data').value  = new Date().toISOString().slice(0, 10);
  document.getElementById('aporte-ativo-obs').value   = '';
  document.getElementById('modal-aporte-ativo').classList.remove('hidden');
}

export async function excluirAtivo(id) {
  if (!confirm('Excluir este ativo?')) return false;
  await deleteAsset(id);
  toast('Ativo excluído.', 'success');
  _aoMudar();
  return true;
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

  if (!name)                   return toast('Informe o nome do ativo.', 'error');
  if (!current || current < 0) return toast('Informe o valor atual.', 'error');

  // Preserva o histórico de aportes ao editar (não vem dos inputs do modal)
  const existing = id ? state.assets.find(a => a.id === id) : null;

  await saveAsset({
    name, type, initialValue: initial, currentValue: current,
    acquiredAt: date, depreciationRate: deprec, notes, linkedGoalId,
    contributions: existing?.contributions || [],
  }, id);

  document.getElementById('modal-ativo').classList.add('hidden');
  toast('Ativo salvo!', 'success');
  _aoMudar();
}

async function _salvarAporteAtivo() {
  const assetId = document.getElementById('aporte-ativo-id').value;
  const amount  = parseFloat(document.getElementById('aporte-ativo-valor').value);
  const date    = document.getElementById('aporte-ativo-data').value;
  const obs     = document.getElementById('aporte-ativo-obs').value.trim();
  if (!amount || amount <= 0) return toast('Informe um valor para o aporte.', 'error');

  try {
    // `addAporteToAsset` é quem credita a meta vinculada — a regra mora no
    // db.js de propósito, para valer venha o aporte de onde vier.
    const novoValor = await addAporteToAsset(assetId, { amount, date, obs, source: 'manual' });
    document.getElementById('modal-aporte-ativo').classList.add('hidden');
    toast(`Aporte registrado! Novo valor: ${fmt(novoValor)}`, 'success');
    _aoMudar();
  } catch (err) {
    toast(`Erro: ${err.message}`, 'error');
  }
}
