/**
 * cartao.js — o destino "Cartão" (redesign v2, rodada extra, pedida pela usuária)
 *
 * Por que existe: Adiante é sobre o CAIXA do mês — com quanto abriu, qual o dia
 * mais apertado, onde fecha. Parcelamento não é caixa do mês: é um compromisso
 * do cartão que atravessa meses. A usuária disse, depois da rodada 4, que as
 * parcelas não faziam sentido lá. Saíram de `js/adiante.js` inteiras:
 * `_contratos()` e `_parcelas()` estão aqui com a mesma lógica.
 *
 * DUAS ABAS desde a rodada 9 — a usuária disse que a tela estava "super
 * confusa" com quatro blocos empilhados:
 *   em aberto  — resumo + os contratos que ainda não terminaram
 *   já pagas   — o que já saiu, parcela a parcela
 *
 * O BLOCO "PARCELAS PREVISTAS" FOI APAGADO, também por decisão dela: "a
 * contratos em aberto já mostra isso". Ele listava parcela a parcela dos
 * próximos 3 meses o que o contrato já resume em uma linha ("3 de 10 pagas ·
 * falta X · termina em nov/26"). O número dos próximos 3 meses sobreviveu
 * onde ele é resumo, no bloco de cima.
 *
 * "Parcelas já pagas" continua sendo a parte nova de verdade: até a rodada do
 * Cartão elas só apareciam diluídas entre as outras linhas da tabela de Mês,
 * sem nada dizendo que aquela linha era a 3/10 de alguma coisa.
 *
 * REGRA DE MODELO QUE NÃO MUDA: contrato de parcelamento NÃO TEM ID. Cada
 * parcela é uma transação independente, e o agrupamento é descrição
 * normalizada + total de parcelas + valor em centavos — o mesmo risco de
 * colisão que `_acharParcela` em `pdf-import.js` já corre. Inventar id de
 * contrato é mudança de modelo de dado, não de tela.
 */

import {
  state, esc, monthLabel, offsetMonth,
  abas, painelAba, ligarAbas, focarAba, pegarAbaPedida,
} from './utils.js';

/** Aba aberta. Mora no módulo, não no DOM: a tela é remontada por innerHTML a
 *  cada navegação de mês, e aba que se fecha sozinha faz perder o lugar. */
let _aba = 'aberto';
let _init = false;

/** Número sem "R$" para coluna de valor — mesma regra das outras tabelas. */
const num = (v) => new Intl.NumberFormat('pt-BR',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v || 0));
const MENOS = '−';

/** Quantas parcelas pagas a tabela mostra antes de cortar. O histórico inteiro
 *  numa folha só vira rolagem sem fim; o rodapé diz que foi cortado. */
const MAX_PAGAS = 24;

/** Competência da parcela, com a mesma queda que o resto do app usa. */
const compet = (t) => t.competenceMonth || String(t.date || '').slice(0, 7);

/** "2026-11" → "nov/2026". Usa monthLabel para não ter uma segunda tabela de
 *  nomes de mês no projeto. */
function _mesCurto(ym) {
  if (!/^\d{4}-\d{2}$/.test(ym)) return '—';
  const [ano] = ym.split('-');
  return `${monthLabel(ym).split(' ')[0].slice(0, 3).toLowerCase()}/${ano}`;
}

// ═══════════════════════════════════════════════════════════════════════
// DADOS — uma passada só; os quatro blocos consomem o mesmo resultado.
// ═══════════════════════════════════════════════════════════════════════

function _dados() {
  const mesAtual = state.currentMonth;
  const next3 = [offsetMonth(mesAtual, 1), offsetMonth(mesAtual, 2), offsetMonth(mesAtual, 3)];

  const parcelas = state.transactions.filter(t => t.installmentTotal > 1);

  // ── contratos, agrupados pela chave sem id (ver cabeçalho do arquivo) ──
  const grupos = new Map();
  for (const tx of parcelas) {
    const desc  = String(tx.description || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const chave = `${desc}|${tx.installmentTotal}|${Math.round((tx.amount || 0) * 100)}`;
    const g = grupos.get(chave) || {
      desc: tx.description || 'Compra parcelada',
      total: tx.installmentTotal, valor: tx.amount || 0,
      pagas: 0, restante: 0, ultimaCompetencia: '',
    };
    const c = compet(tx);
    if (c > g.ultimaCompetencia) g.ultimaCompetencia = c;
    // "Restante" soma só o que ainda NÃO foi pago: competência futura e
    // projeção. Parcela já paga não é dívida.
    if (c > mesAtual || tx.isProjected) g.restante += tx.amount || 0;
    else g.pagas++;
    grupos.set(chave, g);
  }

  // Contrato encerrado não é "em aberto": sai da lista.
  const contratos = [...grupos.values()]
    .filter(g => g.pagas < g.total)
    .sort((a, b) => a.ultimaCompetencia.localeCompare(b.ultimaCompetencia));

  const previstas = parcelas
    .filter(t => next3.includes(t.competenceMonth))
    .sort((a, b) => a.competenceMonth.localeCompare(b.competenceMonth));

  // Paga = já aconteceu e não é projeção. Projeção do mês corrente ainda não
  // saiu da conta de ninguém; ela está no contrato, não aqui.
  const pagas = parcelas
    .filter(t => !t.isProjected && compet(t) <= mesAtual)
    .sort((a, b) => (compet(b) + (b.date || '')).localeCompare(compet(a) + (a.date || '')));

  const totalRestante = contratos.reduce((s, g) => s + g.restante, 0);
  const totalNext3    = previstas.reduce((s, p) => s + (p.amount || 0), 0);
  const totalNoMes    = pagas
    .filter(p => compet(p) === mesAtual)
    .reduce((s, p) => s + (p.amount || 0), 0);

  return { mesAtual, next3, contratos, previstas, pagas, totalRestante, totalNext3, totalNoMes };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. RESUMO — os três números que resumem o cartão
// ═══════════════════════════════════════════════════════════════════════

function _resumo(d) {
  const mesNome = monthLabel(d.mesAtual).split(' ')[0].toLowerCase();
  return `
    <div class="folha" id="cartao-resumo">
      <p class="rot">Onde o parcelamento está</p>
      <dl class="apoio">
        <div><dt>Falta pagar</dt><dd>${num(d.totalRestante)}</dd></div>
        <div><dt>Próximos 3 meses</dt><dd>${num(d.totalNext3)}</dd></div>
        <div><dt>Pago em ${esc(mesNome)}</dt><dd>${num(d.totalNoMes)}</dd></div>
      </dl>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 2. CONTRATOS EM ABERTO — veio de js/adiante.js
// ═══════════════════════════════════════════════════════════════════════

function _contratos(d) {
  // Silêncio quando não há nada: bloco vazio é ruído.
  if (!d.contratos.length) return '';

  // Sem `.rot` aqui: a aba aberta já diz "Em aberto", e repetir o nome 20px
  // abaixo dele é a mesma palavra duas vezes — a regra que já tirou o selo do
  // tipo da meta em Guardado. Sobra a linha de apoio.
  return `
    <div class="folha" id="cartao-contratos">
      <p class="rot-sub" style="margin:0 0 16px">As compras parceladas que ainda não terminaram,
        agrupadas por contrato em vez de repetidas mês a mês.</p>
      <div class="tabela-folha">
        <table>
          <thead><tr>
            <th>Compra</th>
            <th class="esconde-sm">Parcelas</th>
            <th class="v">Restante</th>
            <th>Termina em</th>
          </tr></thead>
          <tbody>
            ${d.contratos.map(g => `
              <tr>
                <td>${esc(g.desc)}</td>
                <td class="esconde-sm">${g.pagas} de ${g.total} pagas</td>
                <td class="v">${num(g.restante)}</td>
                <td>${esc(_mesCurto(g.ultimaCompetencia))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="rodape">
        <span>${d.contratos.length} ${d.contratos.length === 1 ? 'contrato' : 'contratos'}</span>
        <span>falta pagar <strong>${num(d.totalRestante)}</strong></span>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 3. PARCELAS JÁ PAGAS — o bloco novo
//
// Até aqui isto não existia em tela nenhuma: a parcela paga virava uma linha
// como outra qualquer na tabela de Mês, sem dizer de que contrato era nem em
// que ponto dele estava. Aqui ela aparece como parcela: "3/10", com o mês.
// ═══════════════════════════════════════════════════════════════════════

function _pagas(d) {
  if (!d.pagas.length) return '';

  const total = d.pagas.reduce((s, p) => s + (p.amount || 0), 0);

  return `
    <div class="folha" id="cartao-pagas">
      <div class="linha-topo">
        <div>
          <p class="rot">O que já saiu</p>
          <p class="rot-sub" style="margin:0">Da mais recente para a mais antiga.
            São as mesmas linhas da tabela de Mês — aqui dá para ver de que contrato cada uma é.</p>
        </div>
      </div>
      <div class="tabela-folha">
        <table>
          <thead><tr>
            <th>Compra</th>
            <th class="esconde-sm">Parcela</th>
            <th class="v">Valor</th>
            <th>Mês</th>
          </tr></thead>
          <tbody>
            ${d.pagas.slice(0, MAX_PAGAS).map(p => `
              <tr>
                <td>${esc(p.description)}</td>
                <td class="esconde-sm">${p.installmentCurrent}/${p.installmentTotal}</td>
                <td class="v menos">${MENOS}${num(p.amount)}</td>
                <td>${esc(_mesCurto(compet(p)))}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="rodape">
        <span>${d.pagas.length > MAX_PAGAS
          ? `${MAX_PAGAS} de ${d.pagas.length} parcelas pagas`
          : `${d.pagas.length} ${d.pagas.length === 1 ? 'parcela paga' : 'parcelas pagas'}`}</span>
        <span>já saiu <strong>${num(total)}</strong></span>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════

export function renderCartao() {
  const sec = document.getElementById('tab-cartao');
  if (!sec) return;

  // Uma vez só: a `<section>` sobrevive ao innerHTML, os botões de aba não.
  if (!_init) {
    ligarAbas(sec, 'cartao', (id) => { _aba = id; renderCartao(); focarAba('cartao', id); });
    _init = true;
  }

  // `data-goto="timeline"` (e qualquer âncora que caia aqui dentro) precisa
  // abrir a aba certa ANTES de rolar, senão o atalho leva a um bloco escondido.
  _aba = pegarAbaPedida('cartao') || _aba;

  const d = _dados();

  // Sem nenhuma compra parcelada a tela inteira é silêncio — e aí ela precisa
  // dizer o que é, senão parece quebrada.
  if (!d.contratos.length && !d.pagas.length) {
    sec.innerHTML = `
      <p class="page-intro">As compras parceladas: o que ainda falta pagar e o que já saiu.</p>
      <div class="folha">
        <p class="rot">Nenhuma compra parcelada</p>
        <p class="rot-sub" style="margin:0">Quando um gasto for lançado em mais de uma parcela —
          à mão ou vindo de uma fatura — o contrato aparece aqui.</p>
      </div>`;
    return;
  }

  // Aba sem nada dentro não se abre: com só uma das duas com conteúdo, a que
  // tem é a que vale, venha o `_aba` de onde vier.
  if (_aba === 'aberto' && !d.contratos.length) _aba = 'pagas';
  if (_aba === 'pagas'  && !d.pagas.length)     _aba = 'aberto';

  const painel = _aba === 'aberto'
    ? _resumo(d) + _contratos(d)
    : _pagas(d);

  sec.innerHTML = `
    <p class="page-intro">As compras parceladas. <b>Olhe o “falta pagar”:</b> é o compromisso
      que já está assumido, independente do que você decidir gastar daqui para frente.</p>
    ${abas('cartao', [
      { id: 'aberto', nome: 'Em aberto', conta: d.contratos.length },
      { id: 'pagas',  nome: 'Já pagas',  conta: d.pagas.length },
    ], _aba, 'O que ver do cartão')}
    ${painelAba('cartao', _aba, painel)}`;
}
