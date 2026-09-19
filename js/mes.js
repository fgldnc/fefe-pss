/**
 * mes.js — o destino "Mês" (redesign v2, rodada 3)
 *
 * Substitui as quatro telas que a rodada 2 empilhava: Visão do mês, Gastos,
 * Receitas e Orçamento. Seis blocos, na ordem de leitura do
 * redesign-v2/direcoes/hibrido.html:
 *
 *   herói · distribuição · resultado do mês · miniatura do fluxo ·
 *   tabela única
 *
 * O orçamento NÃO está aqui: por decisão da usuária no meio da rodada 3, ele
 * mora em Ajustes. Definir teto é configuração, não leitura do mês.
 *
 * O que ESTE módulo NÃO faz, de propósito:
 *  - não persiste nada. Salvar gasto e receita continua em `gastos.js` e
 *    `receitas.js`, que viraram a camada de formulário + gravação. Este
 *    módulo abre o modal deles e passa `renderMes` como callback.
 *  - não recalcula competência, investimento nem nada de negócio. Os totais
 *    saem de `allExpensesOfMonth` + `incomesOfMonth` + `getInvestCatIds()`,
 *    exatamente como o dashboard antigo fazia — dois cálculos para o mesmo
 *    número divergem com o tempo.
 */

import {
  state, fmt, esc, monthLabel, offsetMonth, toast,
  getInvestCatIds, renderInsights, resolveCategoryId, SEM_CATEGORIA_FILTRO,
} from './utils.js';
import { allExpensesOfMonth, incomesOfMonth, deleteTx, deleteIncome } from './db.js';
import { buildMovimentos, buildSerie, acharMinimo, contextoDoMinimo } from './saldos.js';
import { initGastos, openGastoModal, confirmarProjecao } from './gastos.js';
import { initReceitas, openReceitaModal, copiarReceitasDoMesAnterior } from './receitas.js';
import { initPdfImport } from './pdf-import.js';

let _init = false;

/**
 * Filtros da tabela. Moram no módulo, não no DOM: salvar um lançamento
 * remonta a tela inteira por innerHTML, e um filtro que se apaga sozinho
 * depois de cada edição faz a pessoa perder o lugar na lista.
 */
const _filtros = {
  busca: '', categoria: '', origem: '', tipo: '',
  valorMin: '', valorMax: '', dataInicio: '', dataFim: '',
  soProjetadas: false, soParceladas: false, avancadoAberto: false,
};

/** Número sem "R$": na coluna de valor o símbolo se repete em toda linha e
 *  só rouba a largura que o algarismo usa melhor. Centavos SEMPRE. */
const num = (v) => new Intl.NumberFormat('pt-BR',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v || 0));

/** U+2212 (menos de verdade), não hífen: é o segundo canal da cor na coluna
 *  de valor, e hífen em fonte proporcional fica menor que o sinal de mais. */
const MENOS = '−';

// ═══════════════════════════════════════════════════════════════════════
// DADOS — uma passada só, consumida pelos cinco blocos
// ═══════════════════════════════════════════════════════════════════════

function _dados() {
  const month     = state.currentMonth;
  const investIds = getInvestCatIds();

  const txs     = allExpensesOfMonth(month);
  const incomes = incomesOfMonth(month);

  const despesas    = txs.filter(t => !investIds.includes(t.categoryId));
  const investidos  = txs.filter(t =>  investIds.includes(t.categoryId));

  const totalIncome   = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpense  = despesas.reduce((s, t) => s + (t.amount || 0), 0);
  const totalInvested = investidos.reduce((s, t) => s + (t.amount || 0), 0);

  // `projetado` é um RECORTE de dentro de totalExpense, nunca uma soma por
  // cima: allExpensesOfMonth não exclui isProjected. Somar daria dupla
  // contagem — é a mesma conta do dashboard antigo.
  const projetado = despesas.filter(t => t.isProjected === true)
                            .reduce((s, t) => s + (t.amount || 0), 0);

  const resultado = totalIncome - totalExpense - totalInvested;

  const hoje        = new Date();
  const mesCorrente = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const isMesAtual  = month === mesCorrente;
  const isEncerrado = month < mesCorrente;
  const diasRest    = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate() - hoje.getDate();

  const prevMonth   = offsetMonth(month, -1);
  const prevTxs     = allExpensesOfMonth(prevMonth);
  const prevExpense = prevTxs.filter(t => !investIds.includes(t.categoryId))
                             .reduce((s, t) => s + (t.amount || 0), 0);

  return {
    month, investIds, txs, incomes, despesas, investidos,
    totalIncome, totalExpense, totalInvested, projetado, resultado,
    isMesAtual, isEncerrado, diasRest, prevExpense,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. HERÓI — a frase, não a fileira de KPI
// ═══════════════════════════════════════════════════════════════════════

function _heroi(d) {
  // Sem receita lançada não existe "sobrou": o número seria a receita que
  // falta, não dinheiro que faltou. Estado próprio, com a ação que resolve —
  // é a regra contra "a aritmética de dado faltando".
  if (d.totalIncome === 0) {
    return `
      <div class="heroi" id="mes-heroi">
        <p class="rot">${esc(monthLabel(d.month))}</p>
        <h2><em>Saiu</em>${fmt(d.totalExpense + d.totalInvested)}</h2>
        <div class="de">Quanto sobrou ainda não dá para dizer — falta a receita do mês.</div>
        <div class="dica">
          <span class="marca-d" style="color:#fff">Receita de ${esc(monthLabel(d.month))} ainda não cadastrada</span>
          <button type="button" class="btn btn-2" id="mes-cta-receita">Cadastrar receita</button>
        </div>
      </div>`;
  }

  const negativo = d.resultado < 0;
  // Parênteses, não só a cor: no herói o texto é branco sobre a marca, e
  // vermelho ali não existe. O sinal é o único canal que sobra.
  const valor = negativo ? `(${fmt(Math.abs(d.resultado))})` : fmt(d.resultado);

  const rotulo = d.isEncerrado ? 'Como o mês fechou'
               : negativo      ? 'Passou da receita'
               :                 'Ainda dá para gastar';
  const verbo  = d.isEncerrado ? (negativo ? 'Faltou' : 'Sobrou')
               : (negativo ? 'Faltam' : 'Sobra');

  const prazo = d.isMesAtual
    ? ` · o mês fecha em ${d.diasRest} ${d.diasRest === 1 ? 'dia' : 'dias'}`
    : '';

  return `
    <div class="heroi" id="mes-heroi">
      <p class="rot">${esc(rotulo)}</p>
      <h2><em>${verbo}</em>${valor}</h2>
      <div class="de">de ${fmt(d.totalIncome)} que entraram${prazo}</div>
      <div class="dica">
        <div class="insights-strip" id="insights-strip"></div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 2. DISTRIBUIÇÃO — rosca + lista ordenada com o nome escrito
// ═══════════════════════════════════════════════════════════════════════

/** Circunferência do anel de r=45 usado no SVG. */
const C = 2 * Math.PI * 45;

function _distribuicao(d) {
  // Sem categoria tem balde próprio: "Outros" é uma categoria que a pessoa
  // escolhe de propósito, e misturar as duas esconde exatamente o chute que a
  // importação deixou para conferir.
  const porCat = new Map();
  let semCatTotal = 0, semCatN = 0;

  for (const tx of d.despesas) {
    if (!tx.categoryId) { semCatTotal += tx.amount || 0; semCatN++; continue; }
    const cat = state.categories.find(c => c.id === tx.categoryId);
    const nome = cat?.name || 'Outras';
    porCat.set(nome, (porCat.get(nome) || 0) + (tx.amount || 0));
  }

  const total = d.totalExpense;
  const ordenado = [...porCat.entries()].sort((a, b) => b[1] - a[1]);
  const top   = ordenado.slice(0, 5);
  const resto = ordenado.slice(5);
  const restoTotal = resto.reduce((s, [, v]) => s + v, 0);

  const fatias = top.map(([nome, valor], i) => ({ nome, valor, s: i + 1 }));
  if (restoTotal > 0) {
    fatias.push({
      nome: `+${resto.length} ${resto.length === 1 ? 'categoria menor' : 'categorias menores'}`,
      valor: restoTotal, s: 6, resto: true,
    });
  }

  if (!total) {
    return `
      <div class="folha" id="mes-dist">
        <p class="rot">Distribuição dos gastos</p>
        <p class="rot-sub" style="margin:0">Nada lançado em ${esc(monthLabel(d.month))} ainda.
          Importe a fatura ou o extrato, ou lance à mão na tabela abaixo.</p>
      </div>`;
  }

  // A rosca usa a SÉRIE do sistema (--s1…--s6) por posto, não a cor gravada na
  // categoria: a cor do cadastro é dado antigo, tem azul no meio, e o desenho
  // não admite azul em papel nenhum. A lista ao lado é que identifica — a
  // rosca só reparte.
  let off = 0;
  const aneis = fatias.map(f => {
    const len = (f.valor / total) * C;
    const el = `<circle cx="60" cy="60" r="45" stroke="var(--s${f.s})"
      stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}"
      stroke-dashoffset="${(-off).toFixed(2)}"></circle>`;
    off += len;
    return el;
  }).join('');

  const linhas = fatias.map(f => `
    <div class="cat${f.resto ? ' resto' : ''}">
      <span class="chip" style="background:var(--s${f.s}-chip);color:var(--s${f.s})" aria-hidden="true">${f.resto ? '+' : '■'}</span>
      <span class="nome">${esc(f.nome)}</span>
      <span class="pct">${Math.round((f.valor / total) * 100)}%</span>
      <span class="val">${num(f.valor)}</span>
    </div>`).join('');

  // Sem categoria não é fatia de série: é pendência, e pendência é âmbar com
  // losango em toda a interface. É também a única linha daqui que leva a uma
  // ação — a tabela abaixo, já filtrada.
  const linhaSemCat = semCatTotal > 0 ? `
    <div class="cat">
      <span class="chip" style="background:var(--deduzido-tinta);color:var(--deduzido)" aria-hidden="true">◇</span>
      <span class="nome">
        <button type="button" class="cat-goto" data-goto="gastos" data-filtro-cat="${esc(SEM_CATEGORIA_FILTRO)}"
          title="Ver na tabela os lançamentos sem categoria">Sem categoria</button>
        <span class="marca-d">${semCatN} ${semCatN === 1 ? 'lançamento' : 'lançamentos'}</span>
      </span>
      <span class="val">${num(semCatTotal)}</span>
    </div>` : '';

  return `
    <div class="folha" id="mes-dist">
      <div class="linha-topo">
        <div>
          <p class="rot">Distribuição dos gastos</p>
          <p class="rot-sub" style="margin:0">Da maior para a menor, com o nome escrito na linha —
            não há legenda para procurar.</p>
        </div>
      </div>
      <div class="dist">
        <svg viewBox="0 0 120 120" width="186" height="186" role="img"
             aria-label="Rosca da distribuição dos gastos de ${esc(monthLabel(d.month))}">
          <g transform="rotate(-90 60 60)" fill="none" stroke-width="15">
            <circle cx="60" cy="60" r="45" stroke="var(--folha-2)"></circle>
            ${aneis}
          </g>
          <text x="60" y="54" text-anchor="middle" font-size="6.5" fill="var(--ink-3)"
                letter-spacing=".8">GASTO NO MÊS</text>
          <text x="60" y="69" text-anchor="middle" font-size="12" font-weight="600"
                fill="var(--ink)">${num(total)}</text>
        </svg>
        <div>${linhas}${linhaSemCat}</div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 3. RESULTADO DO MÊS
// ═══════════════════════════════════════════════════════════════════════

function _resultado(d) {
  const delta = d.prevExpense > 0
    ? ((d.totalExpense - d.prevExpense) / d.prevExpense) * 100
    : null;
  // Abaixo de 0,5% é ruído de arredondamento, não variação — mesma faixa que
  // o dashboard antigo usava para dizer "= mês anterior".
  const pilula = delta === null ? ''
    : Math.abs(delta) < 0.5
      ? `<span class="pilula" style="background:var(--folha-2);color:var(--ink-3)">= mês anterior</span>`
      : `<span class="pilula${delta > 0 ? ' baixa' : ''}">${delta > 0 ? '+' : MENOS}${Math.abs(delta).toFixed(0)}%</span>`;

  return `
    <div class="folha" id="mes-resultado">
      <p class="rot">Resultado do mês</p>
      <p class="rot-sub">Investimento não entra em “saiu” — é dinheiro que mudou de lugar,
        não que sumiu. O sinal + e ${MENOS} é o segundo canal da cor.</p>
      <dl class="apoio">
        <div><dt>Entrou</dt><dd class="mais">+${num(d.totalIncome)}</dd></div>
        <div><dt>Saiu</dt><dd class="menos">${MENOS}${num(d.totalExpense)} ${pilula}</dd></div>
        <div><dt>Investido</dt><dd>${num(d.totalInvested)}</dd></div>
      </dl>
      ${d.projetado > 0 ? `
        <div class="nota">Dentro de “saiu”, <b style="color:var(--ink-2)">${num(d.projetado)}</b>
          ainda é parcela prevista, não conferida.
          <button type="button" class="cat-goto" data-goto="gastos" data-filtro-proj="1">ver quais</button></div>` : ''}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 4. MINIATURA DO FLUXO — a curva do saldo, em miniatura
// ═══════════════════════════════════════════════════════════════════════

function _fluxo(d) {
  const [ano, mes]  = d.month.split('-').map(Number);
  const daysInMonth = new Date(ano, mes, 0).getDate();

  const cfg = state.fluxoConfig || { saldoInicial: {}, faturaVencimentoDia: null };
  const temAbertura = Object.prototype.hasOwnProperty.call(cfg.saldoInicial || {}, d.month);
  const abertura = temAbertura ? cfg.saldoInicial[d.month] : 0;

  const mov = buildMovimentos({
    ym: d.month, daysInMonth,
    transactions: state.transactions,
    extratos: state.extratoTransactions || [],
    incomes: d.incomes,
    investIds: d.investIds,
    resolveCat: resolveCategoryId,
    faturaVencimentoDia: cfg.faturaVencimentoDia || null,
  });
  const serie = buildSerie(mov.dias, daysInMonth, abertura);

  // Sem abertura declarada o mínimo é mínimo de fluxo acumulado, não de caixa:
  // não vira afirmação sobre o dia mais apertado. Mesma regra da aba Adiante.
  const min = temAbertura ? acharMinimo(serie) : null;

  const temMov = serie.some(p => p.temMovimento);
  if (!temMov) {
    return `
      <div class="folha" id="mes-fluxo">
        <p class="rot">O dia a dia do mês</p>
        <p class="rot-sub" style="margin:0">Nenhum movimento com data em ${esc(monthLabel(d.month))}.</p>
      </div>`;
  }

  const W = 560, H = 140, PAD = 6;
  const saldos = serie.map(p => p.saldo);
  const hi = Math.max(...saldos, 0), lo = Math.min(...saldos, 0);
  const span = (hi - lo) || 1;
  const x = (dia) => (PAD + ((dia - 1) / Math.max(daysInMonth - 1, 1)) * (W - PAD * 2)).toFixed(1);
  const y = (v) => (PAD + (1 - (v - lo) / span) * (H - PAD * 2 - 16)).toFixed(1);

  const hojeDia = d.isMesAtual ? new Date().getDate() : null;
  const real = serie.filter(p => hojeDia === null || p.dia <= hojeDia);
  const prev = serie.filter(p => hojeDia !== null && p.dia >= hojeDia);

  const pts = (arr) => arr.map(p => `${x(p.dia)},${y(p.saldo)}`).join(' ');

  const titulo = min && min.saldo < 0
    ? `O mês fica negativo no dia ${min.dia}`
    : min
      ? `O dia mais apertado é ${min.dia}`
      : 'O dia a dia do mês';
  const sub = min
    ? `Menor saldo: ${min.saldo < 0 ? '(' + num(min.saldo) + ')' : num(min.saldo)}${
        contextoDoMinimo(serie, min) ? ' — ' + esc(contextoDoMinimo(serie, min)) : ''}`
    : 'Sem saldo inicial declarado, a linha é fluxo acumulado, não saldo de conta.';

  return `
    <div class="folha" id="mes-fluxo">
      <div class="linha-topo">
        <div>
          <p class="rot">${esc(titulo)}</p>
          <p class="rot-sub" style="margin:0">${sub}</p>
        </div>
        <button type="button" class="ir" data-goto="calendario" title="Ver o dia a dia em Adiante">↗</button>
      </div>
      <svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img"
           aria-label="Curva do saldo diário de ${esc(monthLabel(d.month))}">
        <line x1="0" y1="${y(0)}" x2="${W}" y2="${y(0)}" stroke="var(--borda-forte)" stroke-width="1"/>
        <polyline points="${pts(real)}" fill="none" stroke="var(--marca)" stroke-width="2.4"
                  stroke-linejoin="round"/>
        ${prev.length > 1
          ? `<polyline points="${pts(prev)}" fill="none" stroke="var(--marca)" stroke-width="2.4"
               stroke-dasharray="6 5" stroke-linejoin="round"/>` : ''}
        ${min ? `
          <circle cx="${x(min.dia)}" cy="${y(min.saldo)}" r="4"
                  fill="${min.saldo < 0 ? 'var(--saiu)' : 'var(--marca)'}"/>
          <text x="${x(min.dia)}" y="${H - 3}" text-anchor="middle" font-size="11" font-weight="600"
                fill="${min.saldo < 0 ? 'var(--saiu)' : 'var(--ink-3)'}">dia ${min.dia}</text>` : ''}
      </svg>
      <div class="nota">Traço cheio é o que já aconteceu; tracejado é previsão.
        Sem grade — só o fio do zero, que é a única linha que significa alguma coisa.</div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 5. TABELA ÚNICA — gasto manual, fatura, extrato e receita na mesma tabela
// ═══════════════════════════════════════════════════════════════════════

/**
 * De onde veio a linha. É a coluna que a fusão das três tabelas tornou
 * obrigatória: sem ela, "Carrefour" lançado à mão e "Carrefour" vindo do
 * extrato viram a mesma linha duas vezes sem explicação.
 */
function _origem(item) {
  if (item._origem === 'extrato' || item.source === 'statement_import') return 'extrato';
  if (item.importedFrom === 'pdf') return 'fatura';
  return 'manual';
}

/** Lançamentos do mês — despesa, investimento e receita — numa lista só. */
function _linhas(d) {
  const desp = d.txs.map(t => ({
    id: t.id, tipo: 'tx', data: t.date, desc: t.description, categoryId: t.categoryId,
    valor: t.amount || 0, entrada: false,
    investimento: d.investIds.includes(t.categoryId),
    paymentType: t.paymentType, isProjected: !!t.isProjected,
    parcA: t.installmentCurrent, parcT: t.installmentTotal,
    origem: _origem(t), _raw: t,
  }));

  const rec = d.incomes.map(i => ({
    id: i.id, tipo: 'income', data: i.date, desc: i.description, categoryId: '',
    valor: i.amount || 0, entrada: true, investimento: false,
    paymentType: i.type, isProjected: false,
    origem: _origem(i), _raw: i,
  }));

  return [...desp, ...rec].sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
}

function _aplicarFiltros(linhas) {
  const f = _filtros;
  let out = linhas;

  if (f.busca) out = out.filter(l => (l.desc || '').toLowerCase().includes(f.busca));
  if (f.categoria === SEM_CATEGORIA_FILTRO) out = out.filter(l => !l.entrada && !l.categoryId);
  else if (f.categoria)                     out = out.filter(l => l.categoryId === f.categoria);
  if (f.origem) out = out.filter(l => l.origem === f.origem);
  if (f.tipo)   out = out.filter(l => l.paymentType === f.tipo);

  const vMin = parseFloat(f.valorMin), vMax = parseFloat(f.valorMax);
  if (!isNaN(vMin) && vMin > 0) out = out.filter(l => l.valor >= vMin);
  if (!isNaN(vMax) && vMax > 0) out = out.filter(l => l.valor <= vMax);
  if (f.dataInicio) out = out.filter(l => (l.data || '') >= f.dataInicio);
  if (f.dataFim)    out = out.filter(l => (l.data || '') <= f.dataFim);
  if (f.soProjetadas) out = out.filter(l => l.isProjected);
  if (f.soParceladas) out = out.filter(l => l.parcT > 1);

  return out;
}

function _tabela(d) {
  const cats = state.categories.map(c =>
    `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');

  return `
    <div class="folha" id="mes-tabela">
      <div class="linha-topo">
        <div>
          <p class="rot">Tudo que entrou e saiu</p>
          <p class="rot-sub" style="margin:0">Gasto manual, fatura, extrato e receita na mesma tabela.
            A coluna <i>origem</i> diz de onde veio cada linha.</p>
        </div>
        <div class="mes-acoes">
          <button class="btn btn-2" id="btn-exportar-csv">Exportar CSV</button>
          <button class="btn btn-2" id="btn-import-pdf">Importar fatura PDF</button>
          <button class="btn btn-2" id="btn-copiar-receitas"
            title="Copia as receitas manuais do mês anterior para este mês">Copiar receitas</button>
          <button class="btn btn-2" id="btn-nova-receita">+ Receita</button>
          <button class="btn" id="btn-novo-gasto">+ Lançamento</button>
        </div>
      </div>

      <div class="mes-filtros">
        <input type="text" id="filter-busca" class="form-input sm" placeholder="Buscar descrição…" />
        <select id="filter-categoria" class="form-input sm">
          <option value="">Todas as categorias</option>${cats}
          <option value="${esc(SEM_CATEGORIA_FILTRO)}">Sem categoria</option>
        </select>
        <select id="filter-origem" class="form-input sm">
          <option value="">Toda origem</option>
          <option value="manual">Manual</option>
          <option value="fatura">Fatura</option>
          <option value="extrato">Extrato</option>
        </select>
        <select id="filter-tipo-gasto" class="form-input sm">
          <option value="">Todos os meios</option>
          <option value="cartao">Cartão</option>
          <option value="pix">Pix</option>
          <option value="debito">Débito</option>
          <option value="ted">TED</option>
          <option value="dinheiro">Dinheiro</option>
          <option value="outro">Outro</option>
        </select>
        <button class="btn btn-2" id="btn-filtros-avancados">Mais filtros ▾</button>
      </div>

      <div id="advanced-filter-panel" class="advanced-filter-panel hidden">
        <div class="filter-group">
          <div class="filter-group-label">Valor mínimo</div>
          <input type="number" id="filter-valor-min" class="form-input sm" placeholder="0,00" min="0" step="1" />
        </div>
        <div class="filter-group">
          <div class="filter-group-label">Valor máximo</div>
          <input type="number" id="filter-valor-max" class="form-input sm" placeholder="9999" min="0" step="1" />
        </div>
        <div class="filter-group">
          <div class="filter-group-label">Data início</div>
          <input type="date" id="filter-data-inicio" class="form-input sm" />
        </div>
        <div class="filter-group">
          <div class="filter-group-label">Data fim</div>
          <input type="date" id="filter-data-fim" class="form-input sm" />
        </div>
        <div class="filter-group" style="justify-content:flex-end;gap:0.6rem">
          <label class="mes-check"><input type="checkbox" id="filter-apenas-projetadas" /> Só previstas</label>
          <label class="mes-check"><input type="checkbox" id="filter-apenas-parcelas" /> Só parceladas</label>
          <button class="btn btn-2" id="btn-limpar-filtros">Limpar</button>
        </div>
      </div>

      <div class="mes-tabela-rolagem">
        <table>
          <thead><tr>
            <th>Data</th>
            <th>Descrição</th>
            <th class="esconde-sm">Categoria</th>
            <th class="esconde-sm">Origem</th>
            <th class="v">Valor</th>
            <th></th>
          </tr></thead>
          <tbody id="mes-tbody"></tbody>
        </table>
      </div>
      <div class="rodape" id="mes-rodape"></div>
    </div>`;
}

function _renderLinhas(d) {
  const tbody = document.getElementById('mes-tbody');
  const rodape = document.getElementById('mes-rodape');
  if (!tbody) return;

  const todas = _linhas(d);
  const linhas = _aplicarFiltros(todas);

  if (!linhas.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--ink-3);text-align:center">
      ${todas.length ? 'Nenhum lançamento bate com os filtros.' : 'Nada lançado neste mês ainda.'}</td></tr>`;
    rodape.innerHTML = '';
    return;
  }

  tbody.innerHTML = linhas.map(l => {
    const cat = l.categoryId ? state.categories.find(c => c.id === l.categoryId) : null;
    const dataFmt = l.data
      ? new Date(l.data + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
      : '—';

    // Pendência é só o que tem conserto: despesa sem categoria. Receita não
    // exige categoria, e marcar tudo de âmbar apaga o sinal.
    const pendente = !l.entrada && !l.categoryId;

    const subs = [];
    if (l.parcT > 1) subs.push(`parcela ${l.parcA} de ${l.parcT}`);
    if (l.isProjected) subs.push('prevista, não conferida');
    if (l.entrada) subs.push('receita');

    const catCel = cat
      ? `<button type="button" class="cat-goto" data-goto="orcamento"
           title="Ver o limite de ${esc(cat.name)}">${esc(cat.name)}</button>`
      : (pendente ? `<span class="marca-d">sem categoria</span>` : '—');

    // Investimento sai sem cor de gasto: o dinheiro mudou de lugar, não sumiu.
    const classeValor = l.entrada ? 'mais' : l.investimento ? '' : 'menos';
    const sinal = l.entrada ? '+' : MENOS;

    return `
      <tr${pendente ? ' class="conferir"' : ''}>
        <td>${dataFmt}</td>
        <td>${esc(l.desc) || '—'}${subs.length ? `<span class="sub">${esc(subs.join(' · '))}</span>` : ''}</td>
        <td class="esconde-sm">${catCel}</td>
        <td class="esconde-sm"><span class="selo">${l.origem}</span></td>
        <td class="v ${classeValor}">${sinal}${num(l.valor)}</td>
        <td class="mes-acoes-linha">
          ${l.isProjected ? `<button class="btn-icon-only" data-mes-acao="confirmar" data-id="${esc(l.id)}"
             title="Confirmar: este valor saiu mesmo" aria-label="Confirmar parcela prevista">✓</button>` : ''}
          <button class="btn-icon-only" data-mes-acao="editar" data-tipo="${l.tipo}" data-id="${esc(l.id)}"
            title="Editar" aria-label="Editar ${esc(l.desc || '')}">✎</button>
          <button class="btn-icon-only danger" data-mes-acao="excluir" data-tipo="${l.tipo}" data-id="${esc(l.id)}"
            title="Excluir" aria-label="Excluir ${esc(l.desc || '')}">✕</button>
        </td>
      </tr>`;
  }).join('');

  const entrou = linhas.filter(l => l.entrada).reduce((s, l) => s + l.valor, 0);
  const saiu   = linhas.filter(l => !l.entrada && !l.investimento).reduce((s, l) => s + l.valor, 0);
  rodape.innerHTML = `
    <span>${linhas.length} de ${todas.length} ${todas.length === 1 ? 'lançamento' : 'lançamentos'}</span>
    <span>entrou <b class="mais">+${num(entrou)}</b></span>
    <span>saiu <strong class="menos">${MENOS}${num(saiu)}</strong></span>`;
}

/** CSV do que está NA TELA: exportar o que os filtros escondem seria entregar
 *  um arquivo que não corresponde ao que a pessoa está vendo. */
function _exportarCSV(d) {
  const linhas = _aplicarFiltros(_linhas(d));
  const cabec = ['data', 'descricao', 'categoria', 'origem', 'tipo', 'valor'];
  const celula = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const corpo = linhas.map(l => {
    const cat = l.categoryId ? state.categories.find(c => c.id === l.categoryId) : null;
    return [
      l.data || '', l.desc || '', cat?.name || '', l.origem,
      l.entrada ? 'receita' : l.investimento ? 'investimento' : 'despesa',
      // Ponto decimal e sinal: planilha lê número, não texto formatado.
      (l.entrada ? 1 : -1) * (l.valor || 0),
    ].map(celula).join(';');
  });

  const csv = '﻿' + [cabec.join(';'), ...corpo].join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `radar-${d.month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast(`${linhas.length} ${linhas.length === 1 ? 'linha exportada' : 'linhas exportadas'}.`, 'success');
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════

export function renderMes() {
  const sec = document.getElementById('tab-mes');
  if (!sec) return;

  const d = _dados();

  sec.innerHTML = `
    <p class="page-intro">O mês inteiro numa tela. <b>Comece pelo número grande</b> —
      ele diz quanto ainda dá para gastar; a tabela embaixo diz por onde foi.</p>
    <div class="faixa">${_heroi(d)}${_distribuicao(d)}</div>
    <div class="faixa">${_resultado(d)}${_fluxo(d)}</div>
    ${_tabela(d)}`;

  // A dica do herói é o motor de insights de utils.js, com a MESMA base dos
  // números da tela (despesas sem investimento) — chip e total que discordam
  // são pior que chip nenhum.
  renderInsights(m => allExpensesOfMonth(m).filter(t => !d.investIds.includes(t.categoryId)));

  _restaurarFiltros();
  _renderLinhas(d);

  if (!_init) {
    _ligarEventos();
    initGastos(renderMes);
    initReceitas(renderMes);
    _init = true;
  }
}

/** Devolve aos controles o que estava filtrado antes do innerHTML. */
function _restaurarFiltros() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  set('filter-busca', _filtros.busca);
  set('filter-categoria', _filtros.categoria);
  set('filter-origem', _filtros.origem);
  set('filter-tipo-gasto', _filtros.tipo);
  set('filter-valor-min', _filtros.valorMin);
  set('filter-valor-max', _filtros.valorMax);
  set('filter-data-inicio', _filtros.dataInicio);
  set('filter-data-fim', _filtros.dataFim);
  const proj = document.getElementById('filter-apenas-projetadas');
  const parc = document.getElementById('filter-apenas-parcelas');
  if (proj) proj.checked = _filtros.soProjetadas;
  if (parc) parc.checked = _filtros.soParceladas;
  if (_filtros.avancadoAberto) {
    document.getElementById('advanced-filter-panel')?.classList.remove('hidden');
  }
}

/**
 * Tudo delegado em `document` e registrado UMA vez: a tela é remontada por
 * innerHTML a cada gravação, e listener no elemento duplicaria o handler a
 * cada volta. Mesmo motivo do `data-goto` em app.js.
 */
function _ligarEventos() {
  // ── filtros ──────────────────────────────────────────────────────────
  const campos = {
    'filter-busca':  v => (_filtros.busca = String(v).toLowerCase().trim()),
    'filter-categoria': v => (_filtros.categoria = v),
    'filter-origem': v => (_filtros.origem = v),
    'filter-tipo-gasto': v => (_filtros.tipo = v),
    'filter-valor-min': v => (_filtros.valorMin = v),
    'filter-valor-max': v => (_filtros.valorMax = v),
    'filter-data-inicio': v => (_filtros.dataInicio = v),
    'filter-data-fim': v => (_filtros.dataFim = v),
  };
  const aplica = (e) => {
    const alvo = e.target;
    if (!alvo || !alvo.id) return;
    if (campos[alvo.id]) { campos[alvo.id](alvo.value); _renderLinhas(_dados()); return; }
    if (alvo.id === 'filter-apenas-projetadas') { _filtros.soProjetadas = alvo.checked; _renderLinhas(_dados()); }
    if (alvo.id === 'filter-apenas-parcelas')   { _filtros.soParceladas = alvo.checked; _renderLinhas(_dados()); }
  };
  document.addEventListener('input', aplica);
  document.addEventListener('change', aplica);

  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    if (btn.id === 'btn-filtros-avancados') {
      const p = document.getElementById('advanced-filter-panel');
      _filtros.avancadoAberto = p.classList.contains('hidden');
      p.classList.toggle('hidden');
      btn.textContent = _filtros.avancadoAberto ? 'Mais filtros ▴' : 'Mais filtros ▾';
      return;
    }
    if (btn.id === 'btn-limpar-filtros') {
      Object.assign(_filtros, {
        valorMin: '', valorMax: '', dataInicio: '', dataFim: '',
        soProjetadas: false, soParceladas: false,
      });
      _restaurarFiltros();
      _renderLinhas(_dados());
      return;
    }
    if (btn.id === 'btn-exportar-csv') { _exportarCSV(_dados()); return; }
    if (btn.id === 'btn-novo-gasto')   { openGastoModal(null); return; }
    if (btn.id === 'btn-nova-receita') { openReceitaModal(null); return; }
    if (btn.id === 'btn-copiar-receitas') { await copiarReceitasDoMesAnterior(); return; }
    if (btn.id === 'mes-cta-receita')  { openReceitaModal(null); return; }
    if (btn.id === 'btn-import-pdf') {
      document.getElementById('modal-pdf').classList.remove('hidden');
      initPdfImport(renderMes);
      return;
    }

    // ── ações de linha ─────────────────────────────────────────────────
    const acao = btn.dataset.mesAcao;
    if (!acao) return;
    const id = btn.dataset.id;

    if (acao === 'confirmar') { await confirmarProjecao(id); return; }

    if (acao === 'editar') {
      if (btn.dataset.tipo === 'income') openReceitaModal(state.incomes.find(i => i.id === id));
      else openGastoModal(state.transactions.find(t => t.id === id));
      return;
    }

    if (acao === 'excluir') {
      const ehReceita = btn.dataset.tipo === 'income';
      if (!confirm(ehReceita ? 'Excluir esta receita?' : 'Excluir este lançamento?')) return;
      // Linha de extrato não vive em `transactions`: quem a apaga é "excluir
      // importação", em Importar — apagar aqui deixaria o lote sem a linha e o
      // contador do lote mentindo.
      if (!ehReceita && !state.transactions.some(t => t.id === id)) {
        toast('Esta linha veio de um extrato. Apague o lote inteiro em Importar.', 'warning');
        return;
      }
      if (ehReceita) await deleteIncome(id); else await deleteTx(id);
      toast(ehReceita ? 'Receita excluída.' : 'Lançamento excluído.', 'success');
      renderMes();
    }
  });
}
