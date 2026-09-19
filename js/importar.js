/**
 * importar.js — o destino "Importar" (redesign v2, rodada 6)
 *
 * Funde as DUAS portas de entrada de dado que viviam em lugares diferentes:
 * a fatura de cartão em PDF entrava por um botão dentro de Mês, e o extrato
 * bancário por uma aba própria. Agora é uma tela só, com DUAS ABAS EXPLÍCITAS
 * — "Fatura de cartão" e "Extrato bancário" —, decisão da usuária na rodada 3.
 * Não é uma drop zone que adivinha o tipo do arquivo: as duas coisas têm
 * regras de competência diferentes, e adivinhar erra em silêncio.
 *
 * Três blocos, cada um com id próprio (as âncoras de `data-goto`):
 *   importar-portas         — as duas abas e a drop zone de cada uma
 *   importar-fatura-ajuste  — o offset de competência da fatura
 *   importar-historico      — os lotes já trazidos, cada um abrível
 *
 * O OFFSET DE COMPETÊNCIA VEIO DE AJUSTES pelo mesmo motivo que o dia de
 * vencimento da fatura veio para Adiante na rodada 4: ele decide em que mês
 * uma fatura INTEIRA cai, e o lugar de mexer nele é onde a consequência
 * aparece. Ele só existe na aba da fatura — no extrato a competência é a data
 * de cada lançamento, e ali o offset não significa nada.
 *
 * NADA DE PARSING MUDOU. `competenciaDaFatura`, `_tolerancia`, `_acharParcela`,
 * a reconciliação de parcela projetada, `dedupKey`, `detectDuplicates` e
 * `SECTION_HEADERS` continuam intactos, fixados pelos testes. Esta rodada mexe
 * em QUEM chama e ONDE fica a porta, não em como se lê o arquivo.
 *
 * A REVISÃO CONTINUA NO MODAL. O vocabulário dela (`.mark-inferido`,
 * `.field-inferido`, `.row-atencao`, `.import-summary-bar`, `.btn-atencao`)
 * está fixado no CLAUDE.md e não foi reinventado aqui. O que a tela faz é
 * receber o arquivo e abrir o modal JÁ NO PASSO 2 — um clique a menos que
 * antes, não um a mais.
 */

import {
  state, esc, fmt, toast, abas, painelAba, ligarAbas, focarAba,
  datalistCartoes, normCartao, ultimoCartao, lembrarCartao,
} from './utils.js';
import { getAll } from './db.js';
import {
  BANK_NAMES, lotesDeExtrato, excluirLoteExtrato, importarExtratoDeArquivo,
} from './extratos.js';
import { importarFaturaDeArquivo } from './pdf-import.js';

let _init = false;

/** Aba aberta. Mora no módulo, não no DOM: a tela é remontada por innerHTML a
 *  cada importação, e uma aba que se fecha sozinha faz perder o lugar. */
let _aba = 'fatura';

/** Banco e formato escolhidos na aba do extrato — mesma razão do `_aba`. */
let _banco   = '';
let _formato = 'ofx';

/** Cartão a que a fatura pertence. Começa no ultimo usado — quem tem dois
 *  cartões importa quase sempre o mesmo, e digitar o nome inteiro a cada
 *  fatura é atrito sem contrapartida. */
let _cartao = ultimoCartao();

/** Faturas já importadas. Vêm do Firestore (`importedInvoices`), que não está
 *  no `state`: o render desenha o que tem em mãos e a leitura repinta o bloco
 *  quando chega. Tela que espera rede para aparecer parece quebrada. */
let _faturas = null;

/* Só o nome, sem o círculo colorido que o modal usava. Dois motivos: o
   círculo do Bradesco é azul, e azul não entra em papel nenhum nesta pele; e
   a cor de marca de banco não identifica melhor que o nome escrito ao lado
   dela — só repete. O mesmo argumento da rosca com legenda. */
const BANCOS = [
  ['itau', 'Itaú'], ['nubank', 'Nubank'], ['inter', 'Inter'],
  ['santander', 'Santander'], ['bradesco', 'Bradesco'], ['generico', 'Outro'],
];

const FORMATOS = [
  ['ofx', 'OFX', 'o mais fiel — baixe no internet banking'],
  ['csv', 'CSV', 'exportado pelo app do banco'],
  ['pdf', 'PDF', 'funciona, mas o resultado varia'],
];

const ACEITA = { ofx: '.ofx', csv: '.csv,.txt', pdf: '.pdf' };

const dataBR = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d) ? '—' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

/** Offset de competência da fatura. Default −1: fatura que vence em agosto é a
 *  fatura de julho. Mesma leitura de `_billingOffset()` em pdf-import.js. */
function _offset() {
  const n = parseInt(localStorage.getItem('fluxo_billing_offset') ?? '-1', 10);
  return n === 0 ? 0 : -1;
}

// ═══════════════════════════════════════════════════════════════════════
// BLOCOS
// ═══════════════════════════════════════════════════════════════════════

function _portas() {
  const ehFatura = _aba === 'fatura';
  return `
    <div class="folha" id="importar-portas">
      <div class="linha-topo">
        <div>
          <p class="rot">Trazer do banco</p>
          <p class="rot-sub" style="margin:0">Duas portas, porque são duas coisas diferentes:
            a fatura conta no mês em que ela fecha, o extrato conta no dia de cada lançamento.</p>
        </div>
      </div>

      ${abas('imp', [
        { id: 'fatura',  nome: 'Fatura de cartão' },
        { id: 'extrato', nome: 'Extrato bancário' },
      ], _aba, 'O que você vai trazer')}

      ${ehFatura
        ? painelAba('imp', 'fatura', _zona('fatura', 'Arraste a fatura em PDF',
            'PDF de Itaú, Nubank, Santander e outros · máx. 20 MB', '.pdf') + _ajusteFatura())
        : painelAba('imp', 'extrato', _escolhaExtrato() + _zona('extrato',
            'Arraste o arquivo do extrato', 'OFX, CSV ou PDF · máx. 20 MB',
            ACEITA[_formato] || '.ofx,.csv,.pdf'))}

      <p class="nota imp-privacidade">
        O arquivo é lido <b>aqui, no seu navegador</b>. Ele não é enviado para nenhum servidor —
        o que vai para a nuvem são só os lançamentos que você confirmar.
      </p>
    </div>`;
}

/** A drop zone. `qual` distingue as duas; o `<input>` segue o padrão do modal. */
function _zona(qual, titulo, hint, accept) {
  return `
    <div class="imp-zona" id="imp-zona-${esc(qual)}" data-imp="zona" data-qual="${esc(qual)}"
      role="button" tabindex="0" aria-label="${esc(titulo)}">
      <svg width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <p class="imp-zona-titulo">${esc(titulo)} <span class="imp-zona-ou">ou clique para escolher</span></p>
      <span class="imp-zona-hint">${esc(hint)}</span>
      <input type="file" id="imp-file-${esc(qual)}" accept="${esc(accept)}" data-imp="file" data-qual="${esc(qual)}" hidden />
    </div>`;
}

/**
 * O offset vive AQUI e não em Ajustes: ele decide em que mês a fatura inteira
 * cai. A frase diz a consequência com mês de verdade, não a regra em abstrato
 * — "X−1" não se confere; "vence em setembro → conta em agosto" se confere.
 */
function _ajusteFatura() {
  const off = _offset();
  return `
    <div class="imp-ajuste" id="importar-fatura-cartao">
      <label class="imp-ajuste-rot" for="imp-cartao">De qual cartão é esta fatura</label>
      <input id="imp-cartao" class="form-input sm" data-imp="cartao" list="imp-cartoes"
             placeholder="Nubank, Itaú, cartão da loja…" value="${esc(_cartao)}"
             autocomplete="off" />
      ${datalistCartoes('imp-cartoes')}
      <p class="nota" style="margin:8px 0 0">Vale para a fatura inteira. <b>Em branco também
        funciona</b> — a fatura entra sem cartão marcado, como sempre foi. Serve para separar
        as telas de Cartão quando você tem mais de um.</p>
    </div>

    <div class="imp-ajuste" id="importar-fatura-ajuste">
      <label class="imp-ajuste-rot" for="imp-offset">Em que mês a fatura conta</label>
      <select id="imp-offset" class="form-input sm" data-imp="offset">
        <option value="-1"${off === -1 ? ' selected' : ''}>No mês anterior ao vencimento</option>
        <option value="0"${off === 0 ? ' selected' : ''}>No próprio mês do vencimento</option>
      </select>
      <p class="nota" style="margin:8px 0 0">
        ${off === -1
          ? 'Uma fatura que <b>vence em setembro</b> entra como gasto de <b>agosto</b> — o mês em que as compras foram feitas.'
          : 'Uma fatura que <b>vence em setembro</b> entra como gasto de <b>setembro</b> — o mês em que ela é paga.'}
        Na revisão você ainda confere o mês antes de salvar.
      </p>
    </div>`;
}

function _escolhaExtrato() {
  const bancos = BANCOS.map(([id, nome]) => `
    <button class="imp-banco${_banco === id ? ' ativo' : ''}" data-imp="banco" data-banco="${esc(id)}"
      aria-pressed="${_banco === id}">${esc(nome)}</button>`).join('');

  const formatos = FORMATOS.map(([id, nome, nota]) => `
    <button class="imp-formato${_formato === id ? ' ativo' : ''}" data-imp="formato" data-formato="${esc(id)}"
      aria-pressed="${_formato === id}">${esc(nome)}</button>`).join('');

  const nota = FORMATOS.find(f => f[0] === _formato)?.[2] || '';

  return `
    <div class="imp-escolhas">
      <div>
        <p class="imp-ajuste-rot">Banco</p>
        <div class="imp-bancos">${bancos}</div>
        <p class="nota" style="margin:8px 0 0">${_banco
          ? 'Clique de novo para desmarcar.'
          : 'Não escolher também funciona — o Radar tenta reconhecer pelo nome do arquivo.'}</p>
      </div>
      <div>
        <p class="imp-ajuste-rot">Formato</p>
        <div class="imp-formatos">${formatos}</div>
        <p class="nota" style="margin:8px 0 0">${esc(nota)}</p>
      </div>
    </div>`;
}

// ── HISTÓRICO ────────────────────────────────────────────────────────────

/**
 * Um lote é um arquivo que entrou. A linha diz de onde veio, quando e quanto;
 * abrir mostra os lançamentos DAQUELE arquivo — a pergunta de Importar é "o
 * que veio neste arquivo?", enquanto a tabela de Mês responde "o que aconteceu
 * neste mês?". Foi por isso que a lista solta de transações de extrato saiu
 * daqui: ela repetia a tabela de Mês sem dizer de que importação vinha a linha.
 */
function _historico() {
  const lotes   = lotesDeExtrato();
  const faturas = _faturas || [];

  const linhas = [
    ...faturas.map(f => ({
      chave:   'fatura:' + f.id,
      titulo:  f.filename || 'Fatura em PDF',
      selo:    'Fatura',
      quando:  f.importedAt,
      detalhe: `${f.itemCount || 0} lançamento${f.itemCount === 1 ? '' : 's'}`
             + (f.competenceMonth ? ` · competência ${f.competenceMonth}` : ''),
      itens: null, lote: null,
    })),
    ...lotes.map(l => ({
      chave:   'extrato:' + l.id,
      titulo:  (BANK_NAMES[l.bankName] || l.bankName || 'Banco')
             + (l.fileType ? ` · ${String(l.fileType).toUpperCase()}` : ''),
      selo:    'Extrato',
      quando:  l.importedAt,
      detalhe: `${l.itens.length} lançamento${l.itens.length === 1 ? '' : 's'}`,
      ent:     l.itens.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
      sai:     l.itens.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
      itens:   l.itens, lote: l,
    })),
  ].sort((a, b) => (b.quando || '').localeCompare(a.quando || ''));

  const corpo = linhas.length
    ? linhas.map(_linhaLote).join('')
    : `<p class="nota" style="margin:0">Nada importado ainda. O primeiro arquivo que você trouxer
         aparece aqui — e é por aqui que se desfaz uma importação inteira de uma vez.</p>`;

  return `
    <div class="folha" id="importar-historico">
      <div class="linha-topo">
        <div>
          <p class="rot">O que já entrou</p>
          <p class="rot-sub" style="margin:0">Cada linha é um arquivo. Se trouxe o errado,
            excluir o lote desfaz aquele arquivo inteiro de uma vez.</p>
        </div>
      </div>
      <div class="imp-lotes">${corpo}</div>
    </div>`;
}

function _linhaLote(l) {
  // A fatura não guarda os lançamentos junto do registro dela — esse registro
  // existe para travar reimportação, não para listar. Por isso só o lote de
  // extrato abre: botão que não abre nada é pior que botão nenhum.
  const podeAbrir = !!(l.itens && l.itens.length);

  // Lado zerado não aparece: "+R$ 0,00" num lote só de despesas é ruído, e
  // silêncio é o sinal de que não há nada daquele lado.
  const valores = [
    l.ent > 0 ? `<span class="imp-lote-val mais">+${fmt(l.ent)}</span>` : '',
    l.sai > 0 ? `<span class="imp-lote-val menos">−${fmt(l.sai)}</span>` : '',
  ].join('');

  return `
    <div class="imp-lote">
      <div class="imp-lote-topo">
        <div class="imp-lote-nome">
          <span class="selo">${esc(l.selo)}</span>
          <div style="min-width:0">
            <div class="imp-lote-titulo">${esc(l.titulo)}</div>
            <div class="sub">${esc(dataBR(l.quando))} · ${esc(l.detalhe)}</div>
          </div>
        </div>
        <div class="imp-lote-dir">
          ${valores}
          ${podeAbrir ? `<button class="imp-lote-btn" data-imp="abrir-lote" data-chave="${esc(l.chave)}"
              aria-expanded="false">Ver linhas ▾</button>` : ''}
          ${l.lote ? `<button class="imp-lote-btn imp-lote-excluir" data-imp="excluir-lote"
              data-id="${esc(l.lote.id)}">Excluir lote</button>` : ''}
        </div>
      </div>
      ${podeAbrir ? `<div class="imp-lote-linhas hidden" data-linhas="${esc(l.chave)}">${_tabelaLote(l.itens)}</div>` : ''}
    </div>`;
}

function _tabelaLote(itens) {
  const linhas = [...itens]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .map(t => {
      const cat = state.categories.find(c => c.id === (t.categoryId || t.category));
      const receita = t.type === 'income';
      // Sinal antes do número: o segundo canal da cor, como em toda tela.
      return `<tr>
        <td>${esc(t.date || '—')}</td>
        <td>${esc(t.description || '—')}</td>
        <td class="esconde-sm">${cat ? esc(cat.name) : '<span class="marca-d">sem categoria</span>'}</td>
        <td class="v ${receita ? 'mais' : 'menos'}">${receita ? '+' : '−'}${fmt(t.amount)}</td>
      </tr>`;
    }).join('');

  return `
    <div class="tabela-folha imp-lote-tabela">
      <table>
        <thead><tr>
          <th scope="col">Data</th><th scope="col">Descrição</th>
          <th scope="col" class="esconde-sm">Categoria</th><th scope="col" class="v">Valor</th>
        </tr></thead>
        <tbody>${linhas}</tbody>
      </table>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════

export function renderImportar() {
  const sec = document.getElementById('tab-importar');
  if (!sec) return;
  if (!_init) { _ligarTela(sec); _init = true; }

  sec.innerHTML = `
    <p class="page-intro">A porta de entrada dos dados. <b>Traga o arquivo do banco</b> —
      o Radar lê aqui mesmo, classifica o que reconhece e marca em âmbar só o que ficou em dúvida.</p>
    ${_portas()}
    ${_historico()}`;

  // As faturas vêm do Firestore, não do `state`: lê uma vez por sessão e
  // repinta só o bloco do histórico quando chegar.
  if (_faturas === null) {
    _faturas = [];
    getAll('importedInvoices')
      .then(docs => { _faturas = docs || []; _repintarHistorico(); })
      .catch(err => console.warn('Histórico de faturas indisponível:', err));
  }
}

function _repintarHistorico() {
  const alvo = document.getElementById('importar-historico');
  if (alvo) alvo.outerHTML = _historico();
}

/**
 * Um listener só, delegado na seção: a tela é reinjetada por innerHTML a cada
 * importação, e listener preso ao elemento morre junto com o elemento.
 */
function _ligarTela(sec) {
  // As abas passaram a usar o vocabulário compartilhado (`.abas`/`.aba`), e o
  // clique delas vem de `ligarAbas` em utils.js — a mesma travessia das outras
  // seis telas. O `case 'aba'` daqui saiu junto.
  ligarAbas(sec, 'imp', (id) => { _aba = id; renderImportar(); focarAba('imp', id); });

  sec.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-imp]');
    if (!el) return;

    switch (el.dataset.imp) {
      case 'banco':
        // Clicar de novo no banco escolhido desmarca: "não sei" é resposta
        // válida aqui, e o parser reconhece pelo nome do arquivo.
        _banco = _banco === el.dataset.banco ? '' : el.dataset.banco;
        renderImportar();
        return;

      case 'formato':
        _formato = el.dataset.formato;
        renderImportar();
        return;

      case 'zona':
        if (e.target.closest('input')) return;
        document.getElementById(`imp-file-${el.dataset.qual}`)?.click();
        return;

      case 'abrir-lote':
        return _alternarLote(sec, el);

      case 'excluir-lote': {
        const lote = lotesDeExtrato().find(l => l.id === el.dataset.id);
        if (!lote) return;
        if (!confirm(`Excluir esta importação? Remove ${lote.itens.length} lançamento(s) do Firestore.`)) return;
        await excluirLoteExtrato(lote.id, lote.itens, renderImportar);
        return;
      }
    }
  });

  sec.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const zona = e.target.closest?.('[data-imp="zona"]');
    if (!zona) return;
    e.preventDefault();
    document.getElementById(`imp-file-${zona.dataset.qual}`)?.click();
  });

  // O cartão é lido no `input`, não no `change`: quem arrasta o PDF direto
  // depois de digitar nunca dispara o `change` do campo — o foco vai para a
  // drop zone sem passar por "sair do campo" em alguns navegadores.
  sec.addEventListener('input', (e) => {
    if (e.target?.dataset?.imp === 'cartao') _cartao = e.target.value;
  });

  sec.addEventListener('change', (e) => {
    if (e.target?.dataset?.imp === 'offset') {
      localStorage.setItem('fluxo_billing_offset', e.target.value);
      renderImportar();
      toast('Guardado. Vale para a próxima fatura que você importar.', 'success');
      return;
    }
    if (e.target?.dataset?.imp === 'file') {
      const file = e.target.files?.[0];
      e.target.value = ''; // permite reescolher o MESMO arquivo depois
      if (file) _receber(file, e.target.dataset.qual);
    }
  });

  // Arrastar direto sobre a zona. Delegado, como o clique.
  sec.addEventListener('dragover', (e) => {
    const z = e.target.closest?.('[data-imp="zona"]');
    if (!z) return;
    e.preventDefault();
    z.classList.add('arrastando');
  });
  sec.addEventListener('dragleave', (e) => {
    e.target.closest?.('[data-imp="zona"]')?.classList.remove('arrastando');
  });
  sec.addEventListener('drop', (e) => {
    const z = e.target.closest?.('[data-imp="zona"]');
    if (!z) return;
    e.preventDefault();
    z.classList.remove('arrastando');
    const file = e.dataTransfer?.files?.[0];
    if (file) _receber(file, z.dataset.qual);
  });
}

/** Abre/fecha as linhas do lote. O `▾ / ▴` é o segundo canal do estado. */
function _alternarLote(sec, btn) {
  const alvo = sec.querySelector(`[data-linhas="${CSS.escape(btn.dataset.chave)}"]`);
  if (!alvo) return;
  const vaiAbrir = alvo.classList.contains('hidden');
  alvo.classList.toggle('hidden', !vaiAbrir);
  btn.setAttribute('aria-expanded', String(vaiAbrir));
  btn.textContent = vaiAbrir ? 'Ver linhas ▴' : 'Ver linhas ▾';
}

/**
 * Entrega o arquivo à porta certa. A ABA é que decide, não a extensão: um PDF
 * é fatura numa aba e extrato na outra, e as duas leem PDF. Adivinhar pelo
 * arquivo erraria em silêncio, e o erro só apareceria depois — como gasto no
 * mês errado, que é exatamente o que a rodada da competência foi corrigir.
 */
function _receber(file, qual) {
  if (file.size > 20 * 1024 * 1024) { toast('Arquivo muito grande (máx. 20 MB).', 'error'); return; }

  if (qual === 'fatura') {
    if (!/\.pdf$/i.test(file.name)) {
      toast('A fatura precisa ser um PDF. Para OFX ou CSV, use a aba "Extrato bancário".', 'error');
      return;
    }
    // O cartão vale para a FATURA INTEIRA, não por linha: uma fatura é de um
    // cartão só, e perguntar linha a linha seria perguntar 40 vezes a mesma coisa.
    lembrarCartao(_cartao);
    importarFaturaDeArquivo(file, renderImportar, { card: normCartao(_cartao) });
    return;
  }

  importarExtratoDeArquivo(file, { bank: _banco, format: _formato }, renderImportar);
}
