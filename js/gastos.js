/**
 * gastos.js — formulário e gravação de lançamento
 *
 * Deixou de ser uma aba na rodada 3 do redesign v2: a tabela de gastos foi
 * absorvida pela tabela única de `js/mes.js`. O que ficou aqui é o que a
 * tabela não sabe fazer — abrir o modal, validar, gravar preservando
 * procedência, projetar as parcelas futuras, creditar o aporte no ativo
 * vinculado e confirmar uma parcela prevista.
 *
 * Quem desenha chama `initGastos(aoMudar)` uma vez e depois
 * `openGastoModal(tx)`; o callback é chamado depois de cada gravação.
 */

import {
  state, fmt, toast, esc, getInvestCatIds, cartoesConhecidos, normCartao,
} from './utils.js';
import { saveTx, addAporteToAsset } from './db.js';

/** Quem redesenha a tela depois de uma gravação. Trocado por `initGastos`. */
let _aoMudar = () => {};
let _initialized = false;

export function initGastos(aoMudar) {
  if (typeof aoMudar === 'function') _aoMudar = aoMudar;
  if (_initialized) return;
  _initialized = true;

  // Os dois listeners do modal — e só eles. O modal mora no index.html e não é
  // remontado por innerHTML, então aqui listener no elemento é seguro.
  document.getElementById('btn-salvar-gasto')?.addEventListener('click', _salvarGasto);
  document.getElementById('gasto-categoria')?.addEventListener('change', _toggleAtivoRow);
  document.getElementById('gasto-tipo')?.addEventListener('change', _toggleCartaoRow);
}

/** A linha do cartão só existe quando o pagamento é cartão de crédito. */
function _toggleCartaoRow() {
  const ehCartao = document.getElementById('gasto-tipo')?.value === 'cartao';
  document.getElementById('gasto-cartao-row')?.classList.toggle('hidden', !ehCartao);
}

/** As opções do campo de cartão saem dos lançamentos que já existem — não há
 *  cadastro de cartão, e não deve haver: o campo continua livre. */
function _popularCartoes() {
  const dl = document.getElementById('gasto-cartoes');
  if (!dl) return;
  dl.innerHTML = cartoesConhecidos().map(c => `<option value="${esc(c)}"></option>`).join('');
}

/** Preenche o <select> de categoria do modal. */
function _popularCategorias() {
  const sel = document.getElementById('gasto-categoria');
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecione…</option>' +
    state.categories.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
}

export function openGastoModal(tx) {
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

  _popularCategorias();
  document.getElementById('gasto-categoria').value = tx?.categoryId || '';
  _toggleAtivoRow();
  document.getElementById('gasto-ativo').value = tx?.assetId || '';

  _popularCartoes();
  document.getElementById('gasto-cartao').value = tx?.card || '';
  _toggleCartaoRow();

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
  const assetId = document.getElementById('gasto-ativo')?.value || '';
  // Cartão só vale para pagamento em cartão: guardar o texto que sobrou no
  // campo depois de trocar o tipo para Pix seria gravar uma informação falsa.
  const cartao = tipo === 'cartao' ? normCartao(document.getElementById('gasto-cartao')?.value) : '';

  if (!desc)           return toast('Preencha a descrição.', 'error');
  if (!amount || amount <= 0) return toast('Informe um valor válido.', 'error');
  if (!catId)          return toast('Selecione uma categoria.', 'error');

  // Editar preserva o que o formulário não mostra. Montar o objeto do zero
  // apagava, a cada edição, `importedFrom`, `invoiceFingerprint`,
  // `classificationOrigin`, `competenceSource` e `dateYearSource` — toda a
  // procedência do lançamento — e ainda virava `isProjected: false` em
  // silêncio: corrigir o valor de uma parcela prevista a promovia a confirmada
  // sem ninguém pedir. Promover é o botão ✓, que pergunta antes.
  const anterior = id ? state.transactions.find(t => t.id === id) : null;
  const { id: _ignorado, ...preservado } = anterior || {};

  const data = {
    ...preservado,
    date,
    description: desc,
    amount,
    categoryId: catId,
    paymentType: tipo,
    installmentCurrent: parcA,
    installmentTotal:   parcT,
    competenceMonth:    mes,
    notes,
    assetId: assetId || null,
    card: cartao,
    isProjected:  anterior ? !!anterior.isProjected : false,
    importedFrom: anterior?.importedFrom || 'manual',
  };

  try {
    await saveTx(data, id);

    // Aporte automático no ativo vinculado — SOMENTE em lançamento novo,
    // para não somar de novo a cada edição do mesmo gasto
    if (!id && assetId && amount > 0 && _isInvestCat(catId)) {
      try {
        const novoValor = await addAporteToAsset(assetId, {
          amount, date, obs: desc, source: 'gasto_manual',
        });
        const ativo = state.assets.find(a => a.id === assetId);
        toast(`Aporte registrado em "${ativo?.name}". Novo valor: ${fmt(novoValor)}`, 'success');
      } catch (err) {
        console.error('Aporte falhou:', err);
        toast(`Gasto salvo, mas o aporte no ativo falhou: ${err.message}`, 'warning');
      }
    }

    // Projeta parcelas futuras automaticamente (apenas em novo lançamento de cartão)
    if (!id && tipo === 'cartao' && parcT > 1) {
      await _projetarParcelas(data, parcA, parcT);
    }

    document.getElementById('modal-gasto').classList.add('hidden');
    toast('Lançamento salvo!', 'success');
    _aoMudar();
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



/**
 * Tira uma parcela do estado "projetada" — a única saída manual que existe.
 *
 * O app cria as parcelas futuras como projeção e, até a rodada desta correção,
 * NADA as convertia de volta em lançamento confirmado: uma parcela de fevereiro
 * seguia marcada como previsão em agosto, contando no total de um mês que já
 * fechou. Importar a fatura correspondente reconcilia automaticamente
 * (js/pdf-import.js); este botão é para quem não vai reimportar a fatura antiga.
 *
 * Só mexe em `isProjected`. Valor, data, categoria e procedência ficam como
 * estão — confirmar é dizer "foi isto mesmo", não é uma edição.
 */
export async function confirmarProjecao(id) {
  const tx = state.transactions.find(t => t.id === id);
  if (!tx) return;
  const parcela = tx.installmentTotal > 1
    ? ` (parcela ${tx.installmentCurrent}/${tx.installmentTotal})` : '';
  if (!confirm(
    `Confirmar "${tx.description}"${parcela} no valor de ${fmt(tx.amount)}?\n\n`
    + `Deixa de ser parcela prevista e passa a contar como gasto confirmado. `
    + `Se o valor cobrado foi outro, cancele e use Editar.`
  )) return;

  try {
    const { id: _ignorado, ...dados } = tx;
    await saveTx({ ...dados, isProjected: false }, id);
    toast('Parcela confirmada.', 'success');
    _aoMudar();
  } catch (err) {
    console.error('Erro ao confirmar parcela:', err);
    toast('Não foi possível confirmar a parcela.', 'error');
  }
}

function _isInvestCat(catId) {
  return !!catId && getInvestCatIds().includes(catId);
}

function _toggleAtivoRow() {
  const catId = document.getElementById('gasto-categoria').value;
  const row   = document.getElementById('gasto-ativo-row');
  const sel   = document.getElementById('gasto-ativo');
  if (!row || !sel) return;

  if (_isInvestCat(catId)) {
    const invest = state.assets.filter(a => a.type === 'investimento');
    sel.innerHTML = '<option value="">Não vincular a um ativo</option>' +
      invest.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
    row.classList.remove('hidden');
  } else {
    row.classList.add('hidden');
    sel.value = '';
  }
}

