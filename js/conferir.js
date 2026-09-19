/**
 * conferir.js — o destino "Conferir" (redesign v2, rodada 7)
 *
 * A tela que não existia. Até aqui, uma pendência só aparecia onde ela por
 * acaso passava: o lançamento sem categoria era uma linha âmbar no meio da
 * tabela de Mês, a parcela projetada que já venceu ficava indistinguível de
 * uma que ainda vai vencer, e duplicata só era detectada NA HORA da importação
 * — depois de salva, ninguém mais olhava. Aqui as três viram lista, e cada uma
 * se corrige NA PRÓPRIA LINHA.
 *
 * Três blocos, cada um com id próprio (as âncoras de `data-goto`):
 *   conferir-sem-categoria — "o Radar não soube classificar"
 *   conferir-projetadas    — "o app previu; já venceu, aconteceu mesmo?"
 *   conferir-duplicatas    — "isto parece estar lançado duas vezes"
 *
 * TUDO É DERIVADO DO `state`. Nenhum campo novo no Firestore, nenhuma coleção
 * nova: as três listas são três travessias sobre o que já está lá. É o que
 * permite a tela existir sem migração e sem risco de o dado divergir.
 *
 * CONFERIR OLHA A BASE INTEIRA, NÃO O MÊS DO TOPO. É a única tela do app assim,
 * e de propósito: pendência escondida atrás da navegação de mês é pendência que
 * não se acha. Se o contador da barra falasse só do mês selecionado, ele
 * mudaria ao trocar de mês e deixaria de ser "o que falta fazer" para virar
 * "o que falta fazer aqui" — que é exatamente o que a tabela de Mês já diz.
 *
 * SILÊNCIO É O SINAL DE QUE ESTÁ TUDO CERTO: bloco zerado não aparece, e com
 * os três zerados a tela diz isso com todas as letras — ela é um item fixo da
 * barra e precisa explicar o próprio vazio, senão parece quebrada.
 */

import {
  state, esc, fmt, toast, monthLabel, thisMonth, competenceOf, resolveCategoryId,
} from './utils.js';
import { saveTx, deleteTx, updateFields } from './db.js';
import { normalizeDesc, dedupKey } from './parsers/base-parser.js';
import { confirmarProjecao } from './gastos.js';

let _init = false;
let _aoMudar = null;

/**
 * Teto por lista. A base inteira pode trazer centenas de linhas sem categoria
 * no primeiro uso, e uma tela de 400 linhas não se confere — se desiste dela.
 * O rodapé diz "N de M": a omissão NUNCA é silenciosa, como em `MAX_PAGAS`.
 */
const MAX_LISTA = 40;

/**
 * Pares que a usuária já olhou e disse que não são duplicata.
 *
 * Mora no `localStorage` e não no Firestore porque a tela é derivada e não
 * pode inventar campo — e porque isto é um julgamento sobre um par, não um
 * dado do lançamento. O custo é conhecido: não viaja entre dispositivos. O
 * julgamento é barato de refazer; um campo novo no modelo, não.
 */
const CHAVE_OK = 'fluxo_conferir_nao_duplicata';

function _dispensadas() {
  try { return new Set(JSON.parse(localStorage.getItem(CHAVE_OK) || '[]')); }
  catch { return new Set(); }
}
function _dispensar(chave) {
  const s = _dispensadas();
  s.add(chave);
  try { localStorage.setItem(CHAVE_OK, JSON.stringify([...s])); } catch { /* cota cheia: segue */ }
}

const dataBR = (d) => d
  ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  : '—';

/**
 * Chave de "é o mesmo lançamento". É `dedupKey` — a regra única do app —, MAIS
 * o número da parcela quando existe.
 *
 * O acréscimo não é enfeite: as parcelas de um mesmo contrato compartilham a
 * DATA DA COMPRA, a descrição e o valor, e diferem só no número. Sem o
 * acréscimo, um parcelado em 10x virava um grupo de 10 "duplicatas" — a tela
 * acusaria como erro exatamente o que o app acabou de criar de propósito.
 * (Medido: 2/10 e 3/10 do mesmo notebook caíam no mesmo grupo.)
 *
 * Duas importações da MESMA parcela 2/10 continuam colidindo, que é o caso
 * que a lista existe para achar.
 */
function _chaveDup(t) {
  const base = dedupKey(t.date || '', t.amount || 0, normalizeDesc(t.description || ''), t.type || '');
  return t.installmentTotal > 1
    ? `${base}|${t.installmentCurrent}/${t.installmentTotal}`
    : base;
}

/** De onde veio a linha. Mesma derivação de `_origem()` em `mes.js` — a coluna
 *  existe pela mesma razão: sem ela, o mesmo "Carrefour" à mão e vindo do
 *  extrato viram duas linhas sem explicação. */
function _origem(tx) {
  if (tx._origem === 'extrato' || tx.source === 'statement_import') return 'extrato';
  if (tx.importedFrom === 'pdf') return 'fatura';
  return 'manual';
}

// ═══════════════════════════════════════════════════════════════════════
// DADOS — uma passada só. As três listas saem da mesma base unificada.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Despesa de qualquer procedência, com a marca de onde ela vive. `extrato`
 * importa: a linha de extrato mora em `state.extratoTransactions`, e gravar
 * nela é outro caminho — por isso a marca viaja junto até a hora de salvar.
 */
function _todasDespesas() {
  const normais = state.transactions.map(t => ({ ...t, _lista: 'transactions' }));
  const extrato = (state.extratoTransactions || [])
    .filter(t => t.type === 'expense')
    .map(t => ({ ...t, _lista: 'extrato', _origem: 'extrato' }));
  return [...normais, ...extrato];
}

function _dados() {
  const todas = _todasDespesas();
  const mesAtual = thisMonth();
  const dispensadas = _dispensadas();

  // ── 1. sem categoria ────────────────────────────────────────────────
  // Mesma regra do contador da barra e da tela de revisão (`semCat` em
  // extratos.js): despesa sem categoria resolvida. Receita não entra — a
  // revisão nunca exigiu categoria dela, e uma lista que discorda da tela
  // que a gerou é pior que lista nenhuma.
  const semCategoria = todas
    .filter(t => t.type !== 'income' && !(t.categoryId || resolveCategoryId(t.category)))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // ── 2. parcela projetada de competência já vencida ──────────────────
  // O app cria TODAS as parcelas futuras como projeção. Enquanto a competência
  // é futura, a projeção está fazendo o trabalho dela. Vencida, ela virou uma
  // pergunta: a parcela saiu mesmo, e por esse valor? Importar a fatura
  // responde sozinho (`_acharParcela` reconcilia); quem não importa, confirma
  // aqui. O mês de comparação é o mês DE HOJE, não o do topo — ver o cabeçalho.
  const projetadas = state.transactions
    .filter(t => t.isProjected && competenceOf(t) && competenceOf(t) < mesAtual)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  // ── 3. possível duplicata ───────────────────────────────────────────
  // A chave é a MESMA de `dedupKey` — a regra única do app para "isto é o
  // mesmo lançamento". Data, tipo, valor em centavos EXATOS e os 40 primeiros
  // caracteres da descrição. Valores diferentes no mesmo dia nunca colidem,
  // que é o caso de salário, VA e VT creditados juntos.
  const porChave = new Map();
  for (const t of todas) {
    if (!porChave.has(_chaveDup(t))) porChave.set(_chaveDup(t), []);
    porChave.get(_chaveDup(t)).push(t);
  }
  const duplicatas = [...porChave.entries()]
    .filter(([k, itens]) => itens.length > 1 && !dispensadas.has(k))
    .map(([chave, itens]) => ({ chave, itens }))
    .sort((a, b) => (b.itens[0].date || '').localeCompare(a.itens[0].date || ''));

  return { semCategoria, projetadas, duplicatas, mesAtual };
}

/** Quantas pendências no total — é o número do selo na barra de navegação. */
export function contarPendencias() {
  try {
    const d = _dados();
    return d.semCategoria.length + d.projetadas.length + d.duplicatas.length;
  } catch (err) {
    console.warn('Não foi possível contar pendências:', err);
    return 0;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// BLOCOS
// ═══════════════════════════════════════════════════════════════════════

/** Rodapé de omissão: "mostrando 40 de 137". Nunca cortar em silêncio. */
function _rodapeCorte(total) {
  return total > MAX_LISTA
    ? `<p class="nota" style="margin:12px 0 0">Mostrando ${MAX_LISTA} de ${total}.
         Resolva estes e os próximos aparecem.</p>`
    : '';
}

function _semCategoria(d) {
  if (!d.semCategoria.length) return '';

  const opcoes = state.categories
    .map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');

  const linhas = d.semCategoria.slice(0, MAX_LISTA).map(t => `
    <tr class="conferir">
      <td>${esc(dataBR(t.date))}<span class="sub">${esc(_origem(t))}</span></td>
      <td>${esc(t.description || '—')}</td>
      <td>
        <select class="form-input sm" data-conf="cat" data-id="${esc(t.id)}"
          data-lista="${esc(t._lista)}" aria-label="Categoria de ${esc(t.description || 'lançamento')}">
          <option value="">Escolher…</option>${opcoes}
        </select>
      </td>
      <td class="v menos esconde-sm">−${fmt(t.amount)}</td>
    </tr>`).join('');

  return `
    <div class="folha" id="conferir-sem-categoria">
      <div class="linha-topo">
        <div>
          <p class="rot">Sem categoria <span class="selo">${d.semCategoria.length}</span></p>
          <p class="rot-sub" style="margin:0">O Radar não reconheceu estes. Sem categoria eles
            entram no total do mês mas somem da distribuição — escolher aqui já grava.</p>
        </div>
      </div>
      <div class="tabela-folha conferir-tabela" id="conferir-tab-cat">
        <table>
          <thead><tr>
            <th scope="col">Data</th><th scope="col">Descrição</th>
            <th scope="col">Categoria</th><th scope="col" class="v esconde-sm">Valor</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
      ${_rodapeCorte(d.semCategoria.length)}
    </div>`;
}

function _projetadas(d) {
  if (!d.projetadas.length) return '';

  const linhas = d.projetadas.slice(0, MAX_LISTA).map(t => {
    const parcela = t.installmentTotal > 1
      ? `${t.installmentCurrent}/${t.installmentTotal}` : '—';
    // A competência e o número da parcela repetem na descrição de propósito:
    // abaixo de 900px a coluna Data some (`esconde-sm`), e sem esta repetição
    // a linha deixaria de dizer de que mês é a parcela — que é a pergunta.
    return `
    <tr class="conferir">
      <td class="esconde-sm">${esc(dataBR(t.date))}<span class="sub">compra</span></td>
      <td>${esc(t.description || '—')}<span class="sub">parcela ${esc(parcela)} · ${esc(monthLabel(competenceOf(t)))}</span></td>
      <td class="v">−${fmt(t.amount)}</td>
      <td class="conferir-acoes">
        <button class="conferir-btn" data-conf="confirmar" data-id="${esc(t.id)}">Aconteceu</button>
        <button class="conferir-btn conferir-btn-nao" data-conf="excluir" data-id="${esc(t.id)}">Não aconteceu</button>
      </td>
    </tr>`;
  }).join('');

  return `
    <div class="folha" id="conferir-projetadas">
      <div class="linha-topo">
        <div>
          <p class="rot">Parcelas previstas que já venceram <span class="selo">${d.projetadas.length}</span></p>
          <p class="rot-sub" style="margin:0">O app projetou estas parcelas quando a compra foi
            lançada. A competência delas já passou e elas continuam como <span class="marca-d">previsão</span>.
            Importar a fatura confirma sozinho; sem ela, responda aqui.</p>
        </div>
      </div>
      <div class="tabela-folha conferir-tabela" id="conferir-tab-proj">
        <table>
          <thead><tr>
            <th scope="col" class="esconde-sm">Data</th><th scope="col">Descrição</th>
            <th scope="col" class="v">Valor</th><th scope="col">Aconteceu?</th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
      ${_rodapeCorte(d.projetadas.length)}
    </div>`;
}

function _duplicatas(d) {
  if (!d.duplicatas.length) return '';

  const grupos = d.duplicatas.slice(0, MAX_LISTA).map(g => {
    const linhas = g.itens.map(t => `
      <div class="conferir-dup-linha">
        <div class="conferir-dup-quem">
          <span class="selo">${esc(_origem(t))}</span>
          <span class="conferir-dup-desc">${esc(t.description || '—')}</span>
        </div>
        <span class="conferir-dup-val menos">−${fmt(t.amount)}</span>
        <button class="conferir-btn conferir-btn-nao" data-conf="excluir-dup"
          data-id="${esc(t.id)}" data-lista="${esc(t._lista)}">Apagar esta</button>
      </div>`).join('');

    return `
      <div class="conferir-dup">
        <div class="conferir-dup-topo">
          <span class="conferir-dup-data">${esc(dataBR(g.itens[0].date))}</span>
          <span class="nota" style="margin:0">${g.itens.length} lançamentos com a mesma data,
            a mesma descrição e o mesmo valor.</span>
          <button class="conferir-btn" data-conf="nao-e-dup" data-chave="${esc(g.chave)}">São dois mesmo</button>
        </div>
        ${linhas}
      </div>`;
  }).join('');

  return `
    <div class="folha" id="conferir-duplicatas">
      <div class="linha-topo">
        <div>
          <p class="rot">Parece lançado duas vezes <span class="selo">${d.duplicatas.length}</span></p>
          <p class="rot-sub" style="margin:0">Mesma data, mesma descrição e o mesmo valor até o
            centavo. Às vezes são dois gastos iguais de verdade — nesse caso diga que são dois
            e o par sai da lista.</p>
        </div>
      </div>
      ${grupos}
      ${_rodapeCorte(d.duplicatas.length)}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════

export function renderConferir() {
  const sec = document.getElementById('tab-conferir');
  if (!sec) return;
  if (!_init) { _ligarTela(sec); _init = true; }

  const d = _dados();
  const total = d.semCategoria.length + d.projetadas.length + d.duplicatas.length;

  // Item fixo da barra: vazio é o estado normal e precisa dizer o que é. Uma
  // tela em branco num destino sempre visível parece quebrada.
  if (!total) {
    sec.innerHTML = `
      <p class="page-intro">O que ficou pela metade — e não está em lugar nenhum esperando
        você tropeçar nele.</p>
      <div class="folha">
        <p class="rot">Nada para conferir</p>
        <p class="rot-sub" style="margin:0">Tudo classificado, nenhuma parcela prevista vencida
          sem resposta e nenhum lançamento repetido. Quando algo ficar pendente, aparece aqui e
          o número sobe ao lado de “Conferir” na barra.</p>
      </div>`;
    return;
  }

  sec.innerHTML = `
    <p class="page-intro">O que ficou pela metade. <b>Esta tela olha a base inteira</b>,
      não o mês do topo — pendência escondida atrás da navegação de mês é pendência que não se acha.</p>
    ${_semCategoria(d)}
    ${_projetadas(d)}
    ${_duplicatas(d)}`;
}

/** Quem redesenha a barra e a tela depois de cada correção. Ligado por app.js. */
export function initConferir(aoMudar) {
  if (typeof aoMudar === 'function') _aoMudar = aoMudar;
}

function _refazer() {
  renderConferir();
  _aoMudar?.();
}

/**
 * Um listener só, delegado na seção: a tela é reinjetada por innerHTML a cada
 * correção, e listener preso ao elemento morre junto com o elemento.
 */
function _ligarTela(sec) {
  // `change` e não `click` para o <select>: escolher com o teclado precisa
  // gravar igual a escolher com o mouse.
  sec.addEventListener('change', async (e) => {
    const sel = e.target;
    if (sel?.dataset?.conf !== 'cat' || !sel.value) return;
    await _gravarCategoria(sel.dataset.id, sel.dataset.lista, sel.value, sel);
  });

  sec.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-conf]');
    if (!btn || btn.tagName === 'SELECT') return;
    const id = btn.dataset.id;

    switch (btn.dataset.conf) {
      case 'confirmar':
        // A confirmação mora em `gastos.js` desde a rodada 3 e é a MESMA que a
        // tabela de Mês usa. Duas conversões de projeção em fato viram duas
        // regras que divergem com o tempo.
        await confirmarProjecao(id);
        _refazer();
        return;

      case 'excluir': {
        const tx = state.transactions.find(t => t.id === id);
        if (!tx) return;
        if (!confirm(`Apagar a previsão "${tx.description}" de ${fmt(tx.amount)}?\n\n`
          + 'Use isto quando a parcela não foi cobrada. Se ela foi cobrada por outro valor, '
          + 'cancele e edite o lançamento em Mês.')) return;
        await deleteTx(id);
        toast('Previsão apagada.', 'success');
        _refazer();
        return;
      }

      case 'excluir-dup': {
        if (btn.dataset.lista === 'extrato') {
          // Mesma recusa da tabela de Mês: a linha de extrato pertence a um
          // lote, e apagá-la sozinha deixaria o contador do lote mentindo.
          toast('Esta linha veio de um extrato. Apague o lote inteiro em Importar.', 'warning');
          return;
        }
        if (!confirm('Apagar este lançamento? O outro do par continua.')) return;
        await deleteTx(id);
        toast('Lançamento apagado.', 'success');
        _refazer();
        return;
      }

      case 'nao-e-dup':
        _dispensar(btn.dataset.chave);
        toast('Combinado — este par não volta a aparecer.', 'success');
        _refazer();
        return;
    }
  });
}

/**
 * Grava a categoria escolhida. Dois caminhos, porque a linha de extrato mora
 * em `state.extratoTransactions` e não em `state.transactions` — embora o
 * documento dela esteja na mesma coleção `transactions` do Firestore.
 */
async function _gravarCategoria(id, lista, categoryId, sel) {
  sel.disabled = true;
  try {
    if (lista === 'extrato') {
      await updateFields('transactions', id, { categoryId, updatedAt: new Date().toISOString() });
      const i = (state.extratoTransactions || []).findIndex(t => t.id === id);
      if (i >= 0) state.extratoTransactions[i] = { ...state.extratoTransactions[i], categoryId };
    } else {
      const tx = state.transactions.find(t => t.id === id);
      if (!tx) return;
      const { id: _ignorado, ...dados } = tx;
      await saveTx({ ...dados, categoryId }, id);
    }
    toast('Categoria salva.', 'success');
    _refazer();
  } catch (err) {
    console.error('Erro ao salvar categoria:', err);
    toast('Não foi possível salvar a categoria.', 'error');
    sel.disabled = false;
  }
}
