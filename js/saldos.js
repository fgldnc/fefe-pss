/**
 * saldos.js — Aba "Fluxo de Caixa": quando o dinheiro entra, quando sai e em
 * que dia o caixa chega no fundo do poço.
 *
 * A tela responde três perguntas, nesta ordem:
 *   1. com quanto o mês abriu (saldo inicial, declarado pela usuária);
 *   2. qual o menor saldo do mês e em que dia — é o que induz decisão;
 *   3. onde o mês fecha.
 *
 * Duas regras que sustentam o resto do arquivo:
 *
 * - SALDO ≠ FLUXO ACUMULADO. Sem o saldo inicial do mês, a curva mede fluxo a
 *   partir de um zero fictício e "menor saldo" não corresponde a dinheiro
 *   nenhum. Por isso os KPIs de mínimo e de projeção só aparecem quando existe
 *   abertura declarada, e a coluna passa a se chamar "Acumulado" enquanto ela
 *   não existir.
 * - INVESTIMENTO NÃO ENTRA NO SALDO. Ele sai da tabela e vira uma linha de
 *   rodapé com o parêntese "(fora do saldo)" — o parêntese é o que impede a
 *   soma errada, e foi o motivo de a coluna antiga ser removida.
 */

import {
  state, fmt, esc, monthLabel, offsetMonth, isOfMonth, toast,
  getInvestCatIds, resolveCategoryId,
} from './utils.js';
import { incomesOfMonth, saveFluxoConfig } from './db.js';

// Chart.js desenha em canvas e não resolve var(--…): as cores vão em HEX
// literal, iguais aos tokens do :root de css/style.css. Já houve regressão por
// passar `var(--accent-primary)` para cá e a linha sumir.
const HEX_AZUL  = '#3982f7';  // --accent-primary
const HEX_VERM  = '#f87171';  // --danger
const HEX_CINZA = '#6b6b6b';  // --text-muted
const HEX_FUNDO = '#161616';  // --bg-main
const HEX_GRID  = 'rgba(255,255,255,.07)'; // --border-soft

let chartSaldo   = null;
let _initialized = false;

export function renderCalendario() {
  // Mantém o nome da função para compatibilidade com app.js (TAB_MODULES)
  renderSaldos();
}

// ═══════════════════════════════════════════════════════════════════════
// CÁLCULO — funções puras, sem DOM e sem `state`, para poderem ser testadas
// (test/saldos.test.mjs). É a parte que erra em silêncio.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Agrupa os lançamentos do mês por dia.
 *
 * Sobre a divisão das fontes — ela está certa e é frágil, não mexa sem ler:
 * as ENTRADAS vêm só de `incomes`, porque entrada de extrato bancário já é
 * espelhada lá por extratos.js; de `extratos` só entram `type === 'expense'`.
 * Somar as duas duplicaria o salário.
 *
 * Sobre competência × data: a pertinência ao mês vem de `isOfMonth`
 * (competenceMonth vence a data), e `date` entra só com o número do dia, para
 * posicionar a linha. Uma parcela comprada em janeiro com competência em maio
 * pesa na fatura de maio — é lá que ela desconta o caixa.
 *
 * Sobre a fatura: gasto de cartão não sai do caixa no dia da compra, sai no dia
 * do vencimento. Com `faturaVencimentoDia` definido, todo o cartão do mês vira
 * UMA linha nesse dia. Sem ele, cai no comportamento antigo (dia da compra) e a
 * tela avisa que está inferindo — dez parcelas espalhadas pelo mês fazem o
 * "menor saldo" apontar o dia errado.
 */
export function buildMovimentos({
  ym, daysInMonth, transactions = [], extratos = [], incomes = [],
  investIds = [], faturaVencimentoDia = null, resolveCat = id => id,
}) {
  const dias = {};
  const dia = d => (dias[d] = dias[d] || { entradas: 0, saidas: 0, itens: [] });

  let investimento = 0;
  let projetado    = 0;
  const fatura     = { total: 0, itens: 0, projetado: 0 };

  const diaDe = (dataISO) => {
    const d = parseInt(String(dataISO).slice(8, 10), 10);
    if (!Number.isFinite(d) || d < 1) return null;
    // Dia 31 num mês de 30: encosta no último dia em vez de sumir da tabela.
    return Math.min(d, daysInMonth);
  };

  for (const tx of transactions) {
    if (!isOfMonth(tx, ym) || !tx.date) continue;
    if (tx.source === 'statement_import') continue; // tratado no laço de extratos
    if (tx.type === 'transfer') continue;           // transferência não é despesa
    const valor = tx.amount || 0;

    if (investIds.includes(tx.categoryId)) {
      investimento += valor;
      continue; // informativo: fora do saldo, por decisão de produto
    }
    if (tx.isProjected) projetado += valor;

    if (tx.paymentType === 'cartao' && faturaVencimentoDia) {
      fatura.total += valor;
      fatura.itens++;
      if (tx.isProjected) fatura.projetado += valor;
      continue;
    }

    const d = diaDe(tx.date);
    if (d === null) continue;
    dia(d).saidas += valor;
    dia(d).itens.push({
      desc: tx.description || 'Lançamento',
      valor, tipo: 'out',
      projetada: !!tx.isProjected,
      parcela: tx.installmentTotal > 1 ? `${tx.installmentCurrent}/${tx.installmentTotal}` : null,
    });
  }

  if (fatura.itens > 0) {
    const d = Math.min(faturaVencimentoDia, daysInMonth);
    dia(d).saidas += fatura.total;
    dia(d).itens.push({
      desc: 'Fatura do cartão',
      valor: fatura.total, tipo: 'out',
      projetada: fatura.projetado > 0,
      parcela: null,
      agrupados: fatura.itens,
    });
  }

  for (const inc of incomes) {
    if (!inc.date) continue;
    const d = diaDe(inc.date);
    if (d === null) continue;
    dia(d).entradas += inc.amount || 0;
    dia(d).itens.push({
      desc: inc.description || inc.source || 'Receita',
      valor: inc.amount || 0, tipo: 'in', projetada: false, parcela: null,
    });
  }

  for (const tx of extratos) {
    if (!tx.date || !isOfMonth(tx, ym)) continue;
    if (tx.type !== 'expense') continue; // income já veio de `incomes`
    // O extrato classifica com slug do parser ('investimento'), não com o ID
    // real da categoria — sem resolver, o aporte entraria como saída e o total
    // de saídas desta aba divergiria do KPI de Despesas do Dashboard.
    if (investIds.includes(resolveCat(tx.categoryId || tx.category))) {
      investimento += tx.amount || 0;
      continue;
    }
    const d = diaDe(tx.date);
    if (d === null) continue;
    dias[d] = dias[d] || { entradas: 0, saidas: 0, itens: [] };
    dias[d].saidas += tx.amount || 0;
    dias[d].itens.push({
      desc: tx.description || 'Lançamento do extrato',
      valor: tx.amount || 0, tipo: 'out', projetada: false, parcela: null,
    });
  }

  return { dias, investimento, projetado, faturaAgrupada: fatura.itens > 0 };
}

/**
 * Série diária de saldo: `base` no dia 1, mais entradas, menos saídas.
 * Devolve um ponto por dia do mês, sempre — o gráfico precisa da série cheia
 * mesmo quando a tabela mostra só os dias com movimento.
 */
export function buildSerie(dias, daysInMonth, base = 0) {
  const serie = [];
  let saldo = base;
  for (let d = 1; d <= daysInMonth; d++) {
    const mov = dias[d] || { entradas: 0, saidas: 0, itens: [] };
    saldo += (mov.entradas || 0) - (mov.saidas || 0);
    serie.push({
      dia: d,
      entradas: mov.entradas || 0,
      saidas: mov.saidas || 0,
      itens: mov.itens || [],
      saldo,
      temMovimento: (mov.itens || []).length > 0,
    });
  }
  return serie;
}

/** Menor saldo do mês. Empate: a PRIMEIRA ocorrência, para o dia citado no KPI,
 *  o ponto do gráfico e a linha destacada serem sempre o mesmo. */
export function acharMinimo(serie) {
  if (!serie.length) return null;
  let min = serie[0];
  for (const p of serie) if (p.saldo < min.saldo) min = p;
  return min;
}

/**
 * Contexto da sublinha do herói. O dia sozinho não decide nada; o que decide é
 * saber se o buraco fecha e quando.
 * Precedência: negativo → véspera de entrada → só o dia.
 */
export function contextoDoMinimo(serie, min) {
  if (!min) return '';

  if (min.saldo < 0) {
    // Extensão do trecho negativo que CONTÉM o mínimo, não do mês inteiro.
    let ini = min.dia, fim = min.dia;
    while (ini > 1 && serie[ini - 2].saldo < 0) ini--;
    while (fim < serie.length && serie[fim].saldo < 0) fim++;
    const dias = fim - ini + 1;
    const volta = serie.find(p => p.dia > min.dia && p.saldo >= 0);
    return volta
      ? `fica negativo por ${dias} ${dias === 1 ? 'dia' : 'dias'}, até a entrada do dia ${volta.dia}`
      : `fica negativo por ${dias} ${dias === 1 ? 'dia' : 'dias'} e não volta ao positivo dentro do mês`;
  }

  // "Logo depois" = até 3 dias. Além disso não é véspera de nada, é coincidência.
  const entrada = serie.find(p => p.dia > min.dia && p.dia <= min.dia + 3 && p.entradas > 0);
  return entrada ? `véspera da entrada do dia ${entrada.dia}` : '';
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════

export function renderSaldos() {
  const container = document.getElementById('tab-calendario');
  if (!container) return;

  const month       = state.currentMonth;
  const [ano, mes]  = month.split('-').map(Number);
  const daysInMonth = new Date(ano, mes, 0).getDate();

  const cfg   = state.fluxoConfig || { saldoInicial: {}, faturaVencimentoDia: null };
  const venc  = cfg.faturaVencimentoDia || null;
  // `undefined` é "não definido"; zero é uma abertura legítima. A distinção
  // manda em metade da tela, então nunca use `|| 0` aqui.
  const abertura = Object.prototype.hasOwnProperty.call(cfg.saldoInicial || {}, month)
    ? cfg.saldoInicial[month] : undefined;
  const temAbertura = typeof abertura === 'number';

  const mov = buildMovimentos({
    ym: month, daysInMonth,
    transactions: state.transactions,
    extratos: state.extratoTransactions || [],
    incomes: incomesOfMonth(month),
    investIds: getInvestCatIds(),
    resolveCat: resolveCategoryId,
    faturaVencimentoDia: venc,
  });

  const serie = buildSerie(mov.dias, daysInMonth, temAbertura ? abertura : 0);
  // Sem abertura declarada, o mínimo da série é mínimo de fluxo acumulado, não
  // de caixa: não marca linha, não marca ponto, não vira KPI.
  const min   = temAbertura ? acharMinimo(serie) : null;

  const sugerido = _fechamentoAnterior(month);

  container.innerHTML = `
    <div class="page-header">
      <div class="fx-abertura">
        <label for="fx-saldo-inicial">Saldo inicial de ${esc(monthLabel(month).split(' ')[0])}</label>
        <input type="number" id="fx-saldo-inicial" step="0.01" inputmode="decimal"
               value="${temAbertura ? abertura : ''}"
               placeholder="${sugerido !== null ? sugerido.toFixed(2) : 'não definido'}" />
        ${!temAbertura && sugerido !== null
          ? `<button type="button" class="btn btn-ghost btn-sm" id="fx-usar-fechamento">Usar fechamento de ${esc(monthLabel(offsetMonth(month, -1)).split(' ')[0])}</button>`
          : '<span class="fx-hint">Enter ou sair do campo para salvar</span>'}
      </div>
    </div>
    <div id="fx-kpis"></div>
    <div id="fx-corpo"></div>`;

  _renderKpis({ month, daysInMonth, abertura, temAbertura, sugerido, serie, min, mov });

  // Erro de leitura não pode deixar número velho ao lado de dado novo: os KPIs
  // acima seguem com o último cálculo válido e só o corpo troca pela mensagem.
  // Mesmo padrão de _guard() no dashboard.
  try {
    _renderCorpo({ month, ano, mes, daysInMonth, serie, min, mov, venc, temAbertura });
  } catch (err) {
    console.error('Erro ao montar o fluxo de caixa:', err);
    document.getElementById('fx-corpo').innerHTML = `
      <div class="fx-card"><div class="fx-empty">
        <div class="fx-empty-t erro">Não foi possível montar o fluxo</div>
        <div class="fx-empty-x">Os KPIs acima seguem com o último cálculo válido.
          Recarregue a aba para tentar de novo.</div>
        <button type="button" class="btn btn-ghost" id="fx-recarregar">Recarregar</button>
      </div></div>`;
  }

  _initEvents();
}

/** Fechamento do mês anterior, se ele tiver abertura declarada E movimento.
 *  Sugestão, nunca gravada em silêncio: herdar um número errado é pior que
 *  não herdar nada. */
function _fechamentoAnterior(month) {
  const prev = offsetMonth(month, -1);
  const cfg  = state.fluxoConfig || { saldoInicial: {} };
  const base = (cfg.saldoInicial || {})[prev];
  if (typeof base !== 'number') return null;

  const [ano, mes] = prev.split('-').map(Number);
  const dias = new Date(ano, mes, 0).getDate();
  const mov = buildMovimentos({
    ym: prev, daysInMonth: dias,
    transactions: state.transactions,
    extratos: state.extratoTransactions || [],
    incomes: incomesOfMonth(prev),
    investIds: getInvestCatIds(),
    resolveCat: resolveCategoryId,
    faturaVencimentoDia: cfg.faturaVencimentoDia || null,
  });
  const temMovimento = Object.keys(mov.dias).length > 0;
  if (!temMovimento) return null;

  const serie = buildSerie(mov.dias, dias, base);
  return serie[serie.length - 1].saldo;
}

function _renderKpis({ month, daysInMonth, abertura, temAbertura, sugerido, serie, min, mov }) {
  const alvo = document.getElementById('fx-kpis');
  if (!alvo) return;

  const mesNome = monthLabel(month).split(' ')[0].toLowerCase();
  const fim     = serie[serie.length - 1];
  const ultimo  = `${String(daysInMonth).padStart(2, '0')}/${month.slice(5)}`;

  const kpiAbertura = `
    <div class="fx-kpi">
      <div class="fx-kpi-label">Saldo inicial de ${esc(mesNome)}</div>
      <div class="fx-kpi-val${temAbertura && abertura < 0 ? ' neg' : ''}">${temAbertura ? esc(fmt(abertura)) : '—'}</div>
      <div class="fx-kpi-sub">${
        !temAbertura ? 'Não definido'
        : (sugerido !== null && Math.abs(sugerido - abertura) < 0.005
            ? `Fechamento de ${esc(monthLabel(offsetMonth(month, -1)).split(' ')[0].toLowerCase())}`
            : 'Definido manualmente')
      }</div>
    </div>`;

  // Sem abertura, "menor saldo" e "projeção" não são saldo: em vez de exibir um
  // número que não corresponde a dinheiro, a tela pede o dado que falta.
  if (!temAbertura) {
    alvo.innerHTML = `
      <div class="fx-kpis">
        ${kpiAbertura}
        <div class="fx-kpi fx-hero">
          <div class="fx-kpi-label">Menor saldo do mês</div>
          <div class="fx-empty" style="padding:0.4rem 0 0;text-align:left">
            <div class="fx-empty-x" style="margin:0">Sem o saldo de abertura, a curva mede fluxo
              acumulado, não caixa — e o "menor saldo" não corresponde a dinheiro nenhum.</div>
            <button type="button" class="btn" id="fx-definir-abertura">Definir saldo inicial</button>
          </div>
        </div>
      </div>`;
    return;
  }

  const ctx = contextoDoMinimo(serie, min);
  const projetadoTxt = mov.projetado > 0
    ? `<span class="mark-inferido" title="Parcelas projetadas ainda não conferidas contra a fatura">inclui ${esc(fmt(mov.projetado))} projetados</span>`
    : '&nbsp;';

  alvo.innerHTML = `
    <div class="fx-kpis">
      ${kpiAbertura}
      <div class="fx-kpi fx-hero">
        <div class="fx-kpi-label">Menor saldo do mês</div>
        <div class="fx-kpi-val${min.saldo < 0 ? ' neg' : ''}">${esc(fmt(min.saldo))}</div>
        <div class="fx-kpi-sub">no dia <span class="fx-dia">${min.dia}</span>${ctx ? ` · ${esc(ctx)}` : ''}</div>
      </div>
      <div class="fx-kpi">
        <div class="fx-kpi-label">Projeção para ${esc(ultimo)}</div>
        <div class="fx-kpi-val${fim.saldo < 0 ? ' neg' : ''}">${esc(fmt(fim.saldo))}</div>
        <div class="fx-kpi-sub">${projetadoTxt}</div>
      </div>
    </div>`;
}

function _renderCorpo({ month, ano, mes, daysInMonth, serie, min, mov, venc, temAbertura }) {
  const alvo = document.getElementById('fx-corpo');

  const comMovimento = serie.filter(p => p.temMovimento);
  if (!comMovimento.length) {
    // Sem gráfico nesta tela, a instância do mês anterior ficaria viva sobre um
    // canvas já removido do DOM — com o listener de resize junto.
    if (chartSaldo) { chartSaldo.destroy(); chartSaldo = null; }
    alvo.innerHTML = `
      <div class="fx-card"><div class="fx-empty">
        <div class="fx-empty-t">Nenhum movimento em ${esc(monthLabel(month).split(' ')[0].toLowerCase())}</div>
        <div class="fx-empty-x">Importe a fatura ou o extrato do mês para ver o fluxo diário.</div>
        <button type="button" class="btn btn-ghost" data-goto="extratos">Ir para Extratos</button>
      </div></div>`;
    return;
  }

  const hoje    = new Date();
  const noMes   = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
  const diaHoje = noMes ? hoje.getDate() : null;

  alvo.innerHTML = `
    <div class="fx-card">
      <div class="fx-card-head">
        <span class="fx-card-title">Saldo dia a dia</span>
        <span class="fx-legend">
          <span><i></i>efetivado</span>
          <span><i class="proj"></i>projetado</span>
          <span><i class="zero"></i>zero</span>
        </span>
      </div>
      <div class="fx-chart-box"><canvas id="fx-chart"></canvas></div>
    </div>
    <div class="fx-card" id="fx-tabela-card"></div>`;

  _renderTabela({ month, daysInMonth, serie, min, mov, venc, diaHoje, temAbertura });
  _renderChart({ serie, daysInMonth, diaHoje, min, month });
}

function _renderTabela({ month, daysInMonth, serie, min, mov, venc, diaHoje, temAbertura }) {
  const card = document.getElementById('fx-tabela-card');
  if (!card) return;

  // "Diário" era uma coluna que repetia o mesmo número 31 vezes. O número
  // continua útil como referência; a repetição não era.
  const budgets = state.budgets[month] || {};
  const totalBudget = Object.values(budgets).reduce((s, v) => s + (v || 0), 0);
  const diario = daysInMonth > 0 ? totalBudget / daysInMonth : 0;

  // Dia 1 (abertura) e o dia de hoje entram mesmo sem movimento: são âncoras de
  // leitura. Todos os outros dias vazios saem — mas o contador diz quantos,
  // senão a tela some com informação em silêncio.
  const exibir = new Set(serie.filter(p => p.temMovimento).map(p => p.dia));
  exibir.add(1);
  if (diaHoje && diaHoje <= daysInMonth) exibir.add(diaHoje);
  const linhas   = serie.filter(p => exibir.has(p.dia));
  const omitidos = daysInMonth - linhas.length;

  const primeiraProjetada = linhas.find(p => p.itens.some(i => i.projetada))?.dia ?? null;

  let totalIn = 0, totalOut = 0;
  let sepPosta = false;

  const trs = linhas.map(p => {
    totalIn  += p.entradas;
    totalOut += p.saidas;

    const sep = (!sepPosta && primeiraProjetada === p.dia)
      ? (sepPosta = true, `<tr class="fx-sep"><td colspan="5">A partir daqui, projetado</td></tr>`)
      : '';

    // Uma linha por DIA, não por lançamento: o item de maior valor nomeia o dia
    // e o resto vira "+N". Linha por lançamento traria de volta exatamente a
    // densidade que esta rodada existe para cortar.
    const ordenados = [...p.itens].sort((a, b) => b.valor - a.valor);
    const principal = ordenados[0];
    const extras    = ordenados.length - 1;

    let desc;
    if (!principal) desc = p.dia === 1 ? (temAbertura ? 'Saldo inicial' : 'Início do mês') : 'Hoje';
    else desc = esc(principal.desc) + (extras > 0 ? ` <span class="fx-v-nil">+${extras}</span>` : '');

    const tags = [
      principal?.projetada
        ? `<span class="tag-projetada fx-tag">${esc(principal.parcela || 'projetada')}</span>` : '',
      (min && min.dia === p.dia) ? `<span class="fx-tag fx-tag-min">menor saldo</span>` : '',
    ].join('');

    const cls = [
      diaHoje === p.dia ? 'fx-hoje' : '',
      (min && min.dia === p.dia) ? 'fx-minimo' : '',
    ].filter(Boolean).join(' ');

    return `${sep}
      <tr class="${cls}">
        <td class="fx-td-dia">${String(p.dia).padStart(2, '0')}</td>
        <td class="col-desc fx-td-desc">${desc}${tags}</td>
        <td class="num ${p.entradas > 0 ? 'fx-v-in' : 'fx-v-nil'}">${p.entradas > 0 ? esc(fmt(p.entradas)) : '—'}</td>
        <td class="num ${p.saidas > 0 ? 'fx-v-out' : 'fx-v-nil'}">${p.saidas > 0 ? esc(fmt(p.saidas)) : '—'}</td>
        <td class="num fx-v-saldo${p.saldo < 0 ? ' neg' : ''}">${esc(fmt(p.saldo))}</td>
      </tr>`;
  }).join('');

  // Vencimento não definido é pendência de dado, e pendência de dado é âmbar
  // (.mark-inferido) — o único âmbar que sobrou nesta aba.
  const notaFatura = venc
    ? ''
    : ` · <span class="mark-inferido">cartão no dia da compra — <button type="button" class="orc-link" data-goto="configuracoes">definir o dia de vencimento</button></span>`;

  card.innerHTML = `
    <div class="fx-table-head">
      <span class="fx-card-title">Movimentos</span>
      <span class="fx-ref">Referência de orçamento: <b>${esc(fmt(diario))}</b>/dia · ${omitidos} ${omitidos === 1 ? 'dia sem movimento omitido' : 'dias sem movimento omitidos'}${notaFatura}</span>
    </div>
    <table class="fx-table">
      <thead>
        <tr>
          <th>Dia</th>
          <th class="col-desc">Movimento</th>
          <th class="num">Entradas</th>
          <th class="num">Saídas</th>
          <th class="num">${temAbertura ? 'Saldo' : 'Acumulado'}</th>
        </tr>
      </thead>
      <tbody>${trs}</tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td class="col-desc"></td>
          <td class="num fx-v-in">${esc(fmt(totalIn))}</td>
          <td class="num fx-v-out">${esc(fmt(totalOut))}</td>
          <td class="num fx-v-saldo${serie[serie.length - 1].saldo < 0 ? ' neg' : ''}">${esc(fmt(serie[serie.length - 1].saldo))}</td>
        </tr>
      </tfoot>
    </table>
    <div class="fx-rodape">
      <span>Investido no mês (fora do saldo): <b>${esc(fmt(mov.investimento))}</b></span>
      <span>Dias com movimento: <b>${serie.filter(p => p.temMovimento).length} de ${daysInMonth}</b></span>
    </div>`;
}

function _renderChart({ serie, daysInMonth, diaHoje, min, month }) {
  const cv = document.getElementById('fx-chart');
  if (!cv || typeof Chart === 'undefined') return;

  // Trocar de mês não pode empilhar instância de Chart (mesmo cuidado de
  // chartCategorias/chartEvolucao no dashboard).
  if (chartSaldo) { chartSaldo.destroy(); chartSaldo = null; }

  // Mês encerrado: tudo sólido, não há futuro. Mês futuro: tudo tracejado.
  const hojeAgora = new Date();
  const mesAtual  = `${hojeAgora.getFullYear()}-${String(hojeAgora.getMonth() + 1).padStart(2, '0')}`;
  const corte = diaHoje !== null ? diaHoje
    : (month < mesAtual ? daysInMonth : 0);

  const dados = serie.map(p => p.saldo);
  // O ponto do corte pertence às DUAS séries, senão a linha abre um buraco de
  // um dia exatamente onde o olho procura a transição.
  const efetivado = dados.map((v, i) => (i + 1 <= corte ? v : null));
  const projetado = dados.map((v, i) => (i + 1 >= corte ? v : null));

  chartSaldo = new Chart(cv, {
    type: 'line',
    data: {
      labels: serie.map(p => p.dia),
      datasets: [
        { label: 'Efetivado', data: efetivado, borderColor: HEX_AZUL, borderWidth: 2,
          pointRadius: 0, tension: 0, fill: false },
        { label: 'Projetado', data: projetado, borderColor: HEX_AZUL, borderWidth: 2,
          borderDash: [5, 4], pointRadius: 0, tension: 0, fill: false },
        { label: 'Menor saldo',
          data: dados.map((v, i) => (min && i + 1 === min.dia ? v : null)),
          borderColor: 'transparent', pointRadius: 4.5,
          pointBackgroundColor: HEX_VERM, pointBorderColor: HEX_FUNDO, pointBorderWidth: 1.5 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: it => it.raw !== null,
          callbacks: {
            title: it => `Dia ${it[0].label}`,
            label: it => `${it.dataset.label}: ${fmt(it.raw)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false }, border: { color: HEX_GRID },
          ticks: {
            color: HEX_CINZA, font: { size: 10, family: 'JetBrains Mono' },
            maxRotation: 0, autoSkip: false,
            // 31 rótulos não cabem nem no desktop.
            callback: (v, i) => ([0, 4, 9, 14, 19, 24, daysInMonth - 1].includes(i) ? i + 1 : ''),
          },
        },
        y: {
          // A linha do zero em vermelho é o que faz "cruzou o zero" virar forma,
          // em vez de uma célula a caçar na tabela.
          grid: {
            color: c => (c.tick.value === 0 ? HEX_VERM : HEX_GRID),
            lineWidth: c => (c.tick.value === 0 ? 1.5 : 1),
          },
          border: { display: false },
          ticks: {
            color: HEX_CINZA, font: { size: 10, family: 'JetBrains Mono' },
            // "k" só no eixo; dentro da tabela, nunca.
            callback: v => (v === 0 ? '0' : `${(v / 1000).toLocaleString('pt-BR')}k`),
          },
        },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════
// EVENTOS
// ═══════════════════════════════════════════════════════════════════════

function _initEvents() {
  // O <input> é reinjetado por innerHTML a cada render, então o listener vai no
  // document, uma vez só — ligar no elemento duplicaria o handler a cada troca
  // de mês (guard _initialized, como no resto do projeto).
  if (_initialized) return;
  _initialized = true;

  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target?.id === 'fx-saldo-inicial') e.target.blur();
  });
  document.addEventListener('blur', e => {
    if (e.target?.id === 'fx-saldo-inicial') _salvarAbertura(e.target.value);
  }, true); // capture: 'blur' não borbulha

  document.addEventListener('click', e => {
    if (e.target.closest('#fx-definir-abertura')) {
      document.getElementById('fx-saldo-inicial')?.focus();
    }
    if (e.target.closest('#fx-usar-fechamento')) {
      const input = document.getElementById('fx-saldo-inicial');
      if (input?.placeholder) { input.value = input.placeholder; _salvarAbertura(input.value); }
    }
    if (e.target.closest('#fx-recarregar')) renderSaldos();
  });
}

async function _salvarAbertura(bruto) {
  const month = state.currentMonth;
  const cfg   = state.fluxoConfig || { saldoInicial: {} };
  const atual = (cfg.saldoInicial || {})[month];

  const txt = String(bruto ?? '').trim();
  // Campo esvaziado remove a abertura do mês: é como a usuária desfaz um número
  // digitado por engano. Não é zero.
  const valor = txt === '' ? null : Number(txt.replace(',', '.'));
  if (valor !== null && !Number.isFinite(valor)) {
    toast('Saldo inicial inválido.', 'error');
    return;
  }
  // Sem mudança, sem escrita: o blur dispara em toda saída do campo.
  if (valor === null && atual === undefined) return;
  if (valor !== null && atual === valor) return;

  try {
    await saveFluxoConfig({ saldoInicial: { [month]: valor } });
    toast(valor === null
      ? `Saldo inicial de ${monthLabel(month)} removido.`
      : `Saldo inicial de ${monthLabel(month)}: ${fmt(valor)}`, 'success');
    renderSaldos();
  } catch (err) {
    console.error('Erro ao salvar saldo inicial:', err);
    toast('Não foi possível salvar o saldo inicial.', 'error');
  }
}
