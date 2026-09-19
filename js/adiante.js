/**
 * adiante.js — o destino "Adiante" (redesign v2, rodada 4)
 *
 * Responde, nesta ordem: com quanto o mês abriu · qual o dia mais apertado e
 * por quê · onde o mês fecha · o que acontece dia a dia.
 *
 * Quatro blocos:
 *   ajustes do mês (saldo inicial + dia de vencimento, lado a lado) ·
 *   3 KPIs · curva diária · tabela dos dias com movimento
 *
 * De onde veio cada coisa:
 *  - o cálculo continua em `js/saldos.js`, que virou só cálculo: as quatro
 *    funções puras testadas em `test/saldos.test.mjs`. Este módulo não repete
 *    nenhuma conta delas.
 *  - o **dia de vencimento da fatura** foi trazido de Configurações. Ele é o
 *    que decide se o cartão do mês vira uma linha no vencimento ou dez linhas
 *    no dia da compra; o lugar de mexer nele é onde a consequência aparece.
 *  - **contratos em aberto** (que veio de `js/timeline.js`) e **parcelas
 *    previstas** (de `js/previsoes.js`) passaram por aqui na rodada 4 e
 *    SAÍRAM: foram para `js/cartao.js`. Adiante é sobre o CAIXA do mês;
 *    parcelamento é compromisso do cartão que atravessa meses, e a usuária
 *    disse que não fazia sentido estar aqui. A evolução de 6 meses continua
 *    no fim de Mês, como manda o ARQUITETURA-v2.md.
 *
 * Duas regras que sustentam o arquivo, herdadas da aba antiga:
 *  - SALDO ≠ FLUXO ACUMULADO. Sem saldo inicial declarado, a curva mede fluxo
 *    a partir de um zero fictício: os KPIs de mínimo e de projeção não
 *    aparecem e a coluna passa a se chamar "Acumulado".
 *  - INVESTIMENTO NÃO ENTRA NO SALDO. Sai da tabela e vira linha de rodapé
 *    com o parêntese "(fora do saldo)".
 */

import {
  state, fmt, esc, monthLabel, offsetMonth, toast,
  getInvestCatIds, resolveCategoryId,
} from './utils.js';
import { incomesOfMonth, saveFluxoConfig } from './db.js';
import { buildMovimentos, buildSerie, acharMinimo, contextoDoMinimo } from './saldos.js';

// Chart.js desenha em canvas e NÃO resolve var(--…): a cor chega resolvida, do
// token, no momento de montar o gráfico. HEX literal aqui é regressão conhecida.
function token(nome, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return v || fallback;
}
function coresGrafico() {
  return {
    linha: token('--marca',       '#7A2E52'),
    verm:  token('--saiu',        '#BE3729'),
    cinza: token('--ink-3',       '#616B79'),
    fundo: token('--folha',       '#FFFFFF'),
    grid:  token('--borda',       '#E2E8F1'),
  };
}

let chartSaldo = null;
let _init = false;

/** Número sem "R$" para coluna de valor — mesma regra da tabela de Mês. */
const num = (v) => new Intl.NumberFormat('pt-BR',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v || 0));
const MENOS = '−';

// ═══════════════════════════════════════════════════════════════════════
// DADOS
// ═══════════════════════════════════════════════════════════════════════

function _dados() {
  const month       = state.currentMonth;
  const [ano, mes]  = month.split('-').map(Number);
  const daysInMonth = new Date(ano, mes, 0).getDate();

  const cfg  = state.fluxoConfig || { saldoInicial: {}, faturaVencimentoDia: null };
  const venc = cfg.faturaVencimentoDia || null;

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
  const min   = temAbertura ? acharMinimo(serie) : null;

  const hoje    = new Date();
  const noMes   = hoje.getFullYear() === ano && hoje.getMonth() + 1 === mes;
  const diaHoje = noMes ? hoje.getDate() : null;

  return {
    month, ano, mes, daysInMonth, venc, abertura, temAbertura,
    mov, serie, min, diaHoje, sugerido: _fechamentoAnterior(month),
  };
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
  if (!Object.keys(mov.dias).length) return null;
  return buildSerie(mov.dias, dias, base)[dias - 1].saldo;
}

// ═══════════════════════════════════════════════════════════════════════
// 1. AJUSTES DO MÊS — os dois números que mandam na tela inteira
// ═══════════════════════════════════════════════════════════════════════

function _ajustes(d) {
  const mesNome = monthLabel(d.month).split(' ')[0];
  return `
    <div class="folha" id="adiante-ajustes">
      <p class="rot">Os dois números que esta tela precisa</p>
      <p class="rot-sub">Sem o saldo inicial, a curva mede fluxo acumulado e não saldo de conta.
        Sem o dia de vencimento, o cartão do mês cai espalhado nos dias das compras
        em vez de sair de uma vez.</p>
      <div class="adiante-campos">
        <label class="adiante-campo">
          <span>Saldo inicial de ${esc(mesNome)}</span>
          <input type="number" id="fx-saldo-inicial" class="form-input sm" step="0.01" inputmode="decimal"
                 value="${d.temAbertura ? d.abertura : ''}"
                 placeholder="${d.sugerido !== null ? d.sugerido.toFixed(2) : 'não definido'}" />
          ${!d.temAbertura && d.sugerido !== null
            ? `<button type="button" class="btn btn-2" id="fx-usar-fechamento">Usar o fechamento de ${esc(monthLabel(offsetMonth(d.month, -1)).split(' ')[0])}</button>`
            : `<i>Enter ou sair do campo salva. Em branco remove.</i>`}
        </label>
        <label class="adiante-campo">
          <span>Dia de vencimento da fatura</span>
          <input type="number" id="fatura-vencimento-dia" class="form-input sm"
                 min="1" max="28" step="1" placeholder="não definido"
                 value="${d.venc || ''}" />
          <i>De 1 a 28 — 29, 30 e 31 não existem em todo mês.
            ${d.venc ? '' : 'Em branco, o cartão cai no dia da compra.'}</i>
        </label>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 2. OS TRÊS KPIs — o do meio é o único que induz decisão
// ═══════════════════════════════════════════════════════════════════════

function _kpis(d) {
  const mesNome = monthLabel(d.month).split(' ')[0].toLowerCase();
  const ultimo  = `${String(d.daysInMonth).padStart(2, '0')}/${d.month.slice(5)}`;

  const abertura = `
    <div class="folha adiante-kpi">
      <p class="rot">Saldo inicial de ${esc(mesNome)}</p>
      <div class="adiante-kpi-val${d.temAbertura && d.abertura < 0 ? ' menos' : ''}">${
        d.temAbertura ? (d.abertura < 0 ? '(' + num(d.abertura) + ')' : num(d.abertura)) : '—'}</div>
      <p class="adiante-kpi-sub">${
        !d.temAbertura ? 'Não definido'
        : (d.sugerido !== null && Math.abs(d.sugerido - d.abertura) < 0.005
            ? `Fechamento de ${esc(monthLabel(offsetMonth(d.month, -1)).split(' ')[0].toLowerCase())}`
            : 'Definido manualmente')}</p>
    </div>`;

  // Sem abertura, "menor saldo" e "projeção" não são saldo: em vez de exibir um
  // número que não corresponde a dinheiro, a tela pede o dado que falta.
  if (!d.temAbertura) {
    return `
      <div class="adiante-kpis">
        ${abertura}
        <div class="folha adiante-kpi adiante-kpi-hero">
          <p class="rot">Menor saldo do mês</p>
          <p class="rot-sub" style="margin:8px 0 12px">Sem o saldo de abertura, a curva mede fluxo
            acumulado, não caixa — e o “menor saldo” não corresponde a dinheiro nenhum.</p>
          <button type="button" class="btn" id="fx-definir-abertura">Definir saldo inicial</button>
        </div>
        <div class="folha adiante-kpi">
          <p class="rot">Projeção para ${esc(ultimo)}</p>
          <div class="adiante-kpi-val">—</div>
          <p class="adiante-kpi-sub">Depende do saldo inicial</p>
        </div>
      </div>`;
  }

  const fim = d.serie[d.serie.length - 1];
  const ctx = contextoDoMinimo(d.serie, d.min);
  // Âmbar nesta tela significa só "o app deduziu": parcela projetada ainda não
  // conferida contra a fatura. Saldo baixo é fato, não pendência.
  const projetadoTxt = d.mov.projetado > 0
    ? `<span class="marca-d">inclui ${num(d.mov.projetado)} em parcela ainda não conferida</span>`
    : '&nbsp;';

  const valor = (v) => (v < 0 ? `(${num(v)})` : num(v));

  return `
    <div class="adiante-kpis">
      ${abertura}
      <div class="folha adiante-kpi adiante-kpi-hero">
        <p class="rot">Menor saldo do mês</p>
        <div class="adiante-kpi-val${d.min.saldo < 0 ? ' menos' : ''}">${valor(d.min.saldo)}</div>
        <p class="adiante-kpi-sub">no dia <b>${d.min.dia}</b>${ctx ? ` · ${esc(ctx)}` : ''}</p>
      </div>
      <div class="folha adiante-kpi">
        <p class="rot">Projeção para ${esc(ultimo)}</p>
        <div class="adiante-kpi-val${fim.saldo < 0 ? ' menos' : ''}">${valor(fim.saldo)}</div>
        <p class="adiante-kpi-sub">${projetadoTxt}</p>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 3 e 4. CURVA E TABELA
// ═══════════════════════════════════════════════════════════════════════

function _curvaETabela(d) {
  if (!d.serie.some(p => p.temMovimento)) {
    return `
      <div class="folha">
        <p class="rot">Nenhum movimento em ${esc(monthLabel(d.month).split(' ')[0].toLowerCase())}</p>
        <p class="rot-sub" style="margin:0">Importe a fatura ou o extrato do mês para ver o fluxo diário.</p>
        <button type="button" class="btn btn-2" data-goto="extratos" style="margin-top:12px">Ir para Importar</button>
      </div>`;
  }

  return `
    <div class="folha" id="adiante-curva">
      <div class="linha-topo">
        <div>
          <p class="rot">Saldo dia a dia</p>
          <p class="rot-sub" style="margin:0">A curva é o dinheiro na conta a cada dia.
            Traço cheio é o que já aconteceu; tracejado é previsão. O ponto vermelho é o dia mais apertado.</p>
        </div>
      </div>
      <div class="adiante-chart"><canvas id="fx-chart"></canvas></div>
    </div>
    <div class="folha" id="adiante-tabela"></div>`;
}

function _renderTabela(d) {
  const card = document.getElementById('adiante-tabela');
  if (!card) return;

  // Dia 1 (abertura) e o dia de hoje entram mesmo sem movimento: são âncoras de
  // leitura. Todos os outros dias vazios saem — mas o contador diz quantos,
  // senão a tela some com informação em silêncio.
  const exibir = new Set(d.serie.filter(p => p.temMovimento).map(p => p.dia));
  exibir.add(1);
  if (d.diaHoje && d.diaHoje <= d.daysInMonth) exibir.add(d.diaHoje);
  const linhas   = d.serie.filter(p => exibir.has(p.dia));
  const omitidos = d.daysInMonth - linhas.length;

  const primeiraProjetada = linhas.find(p => p.itens.some(i => i.projetada))?.dia ?? null;

  let totalIn = 0, totalOut = 0, sepPosta = false;

  const trs = linhas.map(p => {
    totalIn  += p.entradas;
    totalOut += p.saidas;

    const sep = (!sepPosta && primeiraProjetada === p.dia)
      ? (sepPosta = true, `<tr class="adiante-sep"><td colspan="5">A partir daqui, projetado</td></tr>`)
      : '';

    // Uma linha por DIA, não por lançamento: o item de maior valor nomeia o dia
    // e o resto vira "+N". Linha por lançamento traz de volta a densidade que
    // a tabela de Mês já resolve.
    const ordenados = [...p.itens].sort((a, b) => b.valor - a.valor);
    const principal = ordenados[0];
    const extras    = ordenados.length - 1;

    let desc;
    if (!principal) desc = p.dia === 1 ? (d.temAbertura ? 'Saldo inicial' : 'Início do mês') : 'Hoje';
    else desc = esc(principal.desc) + (extras > 0 ? ` <span class="adiante-nil">+${extras}</span>` : '');

    const tags = [
      principal?.projetada
        ? `<span class="tag-projetada">${esc(principal.parcela || 'projetada')}</span>` : '',
      (d.min && d.min.dia === p.dia) ? `<span class="selo">menor saldo</span>` : '',
    ].join(' ');

    const cls = [
      d.diaHoje === p.dia ? 'adiante-hoje' : '',
      (d.min && d.min.dia === p.dia) ? 'adiante-minimo' : '',
    ].filter(Boolean).join(' ');

    return `${sep}
      <tr class="${cls}">
        <td class="adiante-td-dia">${String(p.dia).padStart(2, '0')}</td>
        <td>${desc} ${tags}</td>
        <td class="v esconde-sm ${p.entradas > 0 ? 'mais' : 'adiante-nil'}">${p.entradas > 0 ? '+' + num(p.entradas) : '—'}</td>
        <td class="v esconde-sm ${p.saidas > 0 ? 'menos' : 'adiante-nil'}">${p.saidas > 0 ? MENOS + num(p.saidas) : '—'}</td>
        <td class="v${p.saldo < 0 ? ' menos' : ''}">${p.saldo < 0 ? '(' + num(p.saldo) + ')' : num(p.saldo)}</td>
      </tr>`;
  }).join('');

  const fim = d.serie[d.serie.length - 1];

  card.innerHTML = `
    <div class="linha-topo">
      <div>
        <p class="rot">Movimentos</p>
        <p class="rot-sub" style="margin:0">Só os dias em que algo entra ou sai. Os dias parados são
          contados abaixo, para você saber que não sumiu nada.</p>
      </div>
    </div>
    <div class="tabela-folha">
      <table>
        <thead><tr>
          <th style="width:52px">Dia</th>
          <th>Movimento</th>
          <th class="v esconde-sm" style="width:110px">Entradas</th>
          <th class="v esconde-sm" style="width:110px">Saídas</th>
          <th class="v" style="width:120px">${d.temAbertura ? 'Saldo' : 'Acumulado'}</th>
        </tr></thead>
        <tbody>${trs}</tbody>
        <tfoot><tr>
          <td>Total</td><td></td>
          <td class="v mais esconde-sm">+${num(totalIn)}</td>
          <td class="v menos esconde-sm">${MENOS}${num(totalOut)}</td>
          <td class="v${fim.saldo < 0 ? ' menos' : ''}">${fim.saldo < 0 ? '(' + num(fim.saldo) + ')' : num(fim.saldo)}</td>
        </tr></tfoot>
      </table>
    </div>
    <div class="rodape">
      <span>${omitidos} ${omitidos === 1 ? 'dia sem movimento omitido' : 'dias sem movimento omitidos'}</span>
      <span>investido no mês, fora do saldo <b>${num(d.mov.investimento)}</b></span>
    </div>`;
}

function _renderChart(d) {
  const C  = coresGrafico();
  const cv = document.getElementById('fx-chart');
  if (!cv || typeof Chart === 'undefined') return;

  // Trocar de mês não pode empilhar instância de Chart.
  if (chartSaldo) { chartSaldo.destroy(); chartSaldo = null; }

  // Mês encerrado: tudo sólido, não há futuro. Mês futuro: tudo tracejado.
  const agora    = new Date();
  const mesAtual = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  const corte = d.diaHoje !== null ? d.diaHoje : (d.month < mesAtual ? d.daysInMonth : 0);

  const dados = d.serie.map(p => p.saldo);
  // O ponto do corte pertence às DUAS séries, senão a linha abre um buraco de
  // um dia exatamente onde o olho procura a transição.
  const efetivado = dados.map((v, i) => (i + 1 <= corte ? v : null));
  const projetado = dados.map((v, i) => (i + 1 >= corte ? v : null));

  chartSaldo = new Chart(cv, {
    type: 'line',
    data: {
      labels: d.serie.map(p => p.dia),
      datasets: [
        { label: 'Efetivado', data: efetivado, borderColor: C.linha, borderWidth: 2.4,
          pointRadius: 0, tension: 0, fill: false },
        { label: 'Projetado', data: projetado, borderColor: C.linha, borderWidth: 2.4,
          borderDash: [6, 5], pointRadius: 0, tension: 0, fill: false },
        { label: 'Menor saldo',
          data: dados.map((v, i) => (d.min && i + 1 === d.min.dia ? v : null)),
          borderColor: 'transparent', pointRadius: 4.5,
          pointBackgroundColor: C.verm, pointBorderColor: C.fundo, pointBorderWidth: 1.5 },
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
          grid: { display: false }, border: { color: C.grid },
          ticks: {
            color: C.cinza, font: { size: 10, family: 'Outfit' },
            maxRotation: 0, autoSkip: false,
            // 31 rótulos não cabem nem no desktop.
            callback: (v, i) => ([0, 4, 9, 14, 19, 24, d.daysInMonth - 1].includes(i) ? i + 1 : ''),
          },
        },
        y: {
          // A linha do zero em vermelho é o que faz "cruzou o zero" virar
          // forma, em vez de uma célula a caçar na tabela.
          grid: {
            color: c => (c.tick.value === 0 ? C.verm : C.grid),
            lineWidth: c => (c.tick.value === 0 ? 1.5 : 1),
          },
          border: { display: false },
          ticks: {
            color: C.cinza, font: { size: 10, family: 'Outfit' },
            // "k" só no eixo; dentro da tabela, nunca.
            callback: v => (v === 0 ? '0' : `${(v / 1000).toLocaleString('pt-BR')}k`),
          },
        },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════

export function renderAdiante() {
  const sec = document.getElementById('tab-adiante');
  if (!sec) return;

  const d = _dados();

  sec.innerHTML = `
    <p class="page-intro">O que ainda vai acontecer com o dinheiro que você tem.
      <b>Olhe o número do meio:</b> ele diz qual é o dia mais apertado do mês e por quê.</p>
    ${_ajustes(d)}
    ${_kpis(d)}
    ${_curvaETabela(d)}`;

  // Erro de leitura não pode deixar número velho ao lado de dado novo: os KPIs
  // acima seguem com o último cálculo válido e só a tabela troca pela mensagem.
  if (d.serie.some(p => p.temMovimento)) {
    try {
      _renderTabela(d);
      _renderChart(d);
    } catch (err) {
      console.error('Erro ao montar o fluxo de caixa:', err);
      const alvo = document.getElementById('adiante-tabela');
      if (alvo) alvo.innerHTML = `
        <p class="rot">Não foi possível montar o dia a dia</p>
        <p class="rot-sub" style="margin:0">Os números acima seguem com o último cálculo válido.</p>
        <button type="button" class="btn btn-2" id="fx-recarregar" style="margin-top:12px">Tentar de novo</button>`;
    }
  } else if (chartSaldo) {
    // Sem gráfico nesta tela, a instância do mês anterior ficaria viva sobre um
    // canvas já removido do DOM — com o listener de resize junto.
    chartSaldo.destroy(); chartSaldo = null;
  }

  if (!_init) { _ligarEventos(); _init = true; }
}

// ═══════════════════════════════════════════════════════════════════════
// EVENTOS — delegados em `document`, registrados uma vez: os campos são
// reinjetados por innerHTML a cada render e a cada troca de mês.
// ═══════════════════════════════════════════════════════════════════════

function _ligarEventos() {
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target?.id === 'fx-saldo-inicial') e.target.blur();
  });
  document.addEventListener('blur', e => {
    if (e.target?.id === 'fx-saldo-inicial') _salvarAbertura(e.target.value);
  }, true); // capture: 'blur' não borbulha

  document.addEventListener('change', e => {
    if (e.target?.id === 'fatura-vencimento-dia') _salvarVencimento(e.target);
  });

  document.addEventListener('click', e => {
    if (e.target.closest('#fx-definir-abertura')) {
      document.getElementById('fx-saldo-inicial')?.focus();
    }
    if (e.target.closest('#fx-usar-fechamento')) {
      const input = document.getElementById('fx-saldo-inicial');
      if (input?.placeholder) { input.value = input.placeholder; _salvarAbertura(input.value); }
    }
    if (e.target.closest('#fx-recarregar')) renderAdiante();
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
    renderAdiante();
  } catch (err) {
    console.error('Erro ao salvar saldo inicial:', err);
    toast('Não foi possível salvar o saldo inicial.', 'error');
  }
}

/** 1–28: 29, 30 e 31 não existem em todo mês, e "último dia válido" mentiria
 *  sobre a data em que o dinheiro sai. Campo vazio é "não definido" de
 *  propósito — deixa o cartão cair no dia da compra, marcado como inferido. */
async function _salvarVencimento(input) {
  const bruto = input.value.trim();
  const n = Math.trunc(Number(bruto));
  const valor = bruto === '' ? null : n;

  if (valor !== null && !(Number.isFinite(n) && n >= 1 && n <= 28)) {
    toast('O dia de vencimento precisa estar entre 1 e 28.', 'error');
    input.value = state.fluxoConfig?.faturaVencimentoDia || '';
    return;
  }
  if ((state.fluxoConfig?.faturaVencimentoDia ?? null) === valor) return;

  try {
    await saveFluxoConfig({ faturaVencimentoDia: valor });
    toast(valor === null ? 'Dia de vencimento removido.' : `Fatura vence no dia ${valor}.`, 'success');
    renderAdiante();
  } catch (err) {
    console.error('Erro ao salvar dia de vencimento:', err);
    toast('Não foi possível salvar o dia de vencimento.', 'error');
  }
}
