/**
 * dashboard.js — Renderiza KPIs, gráficos e cards do dashboard
 *
 * Correções v1.1:
 *  - Investimento detectado por ID ("investimento") OU nome (inclui "investiment")
 *    para funcionar tanto com categorias padrão quanto com as importadas do backup
 *  - Taxa de poupança: mostra quanto foi guardado (investido + saldo livre) sobre a receita
 *  - Gráfico de categorias exclui investimentos (igual ao KPI de despesas)
 *  - Tick do eixo Y do gráfico não divide por 1000 se os valores forem pequenos
 *  - Gráfico de evolução agora inclui barra de Investido separada
 */

import {
  state, fmt, monthLabel, offsetMonth, esc, renderInsights, showKpiSkeleton,
  splitGastosPorLimite, renderForaDoLimite, SEM_CATEGORIA_FILTRO, getInvestCatIds,
} from './utils.js';
import { txOfMonth, allExpensesOfMonth, incomesOfMonth } from './db.js';

let chartCategorias = null;
let chartEvolucao   = null;

// A detecção de categoria de investimento (id="investimento" ou
// name="Investimentos" de backup antigo) vive em utils.js: Dashboard, Orçamento
// e Fluxo de Caixa precisam da MESMA regra para os totais baterem.

// ─── RENDER PRINCIPAL ─────────────────────────────────────────────────────
export function renderDashboard() {
  const month = state.currentMonth;

  // Inclui despesas normais (cartão/manual) + despesas vindas de extrato bancário
  const txs     = allExpensesOfMonth(month);
  const incomes = incomesOfMonth(month);

  const investIds     = getInvestCatIds();
  const txExpenses    = txs.filter(t => !investIds.includes(t.categoryId));
  const txInvestments = txs.filter(t =>  investIds.includes(t.categoryId));

  const totalIncome   = incomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpense  = txExpenses.reduce((s, t) => s + (t.amount || 0), 0);
  const totalInvested = txInvestments.reduce((s, t) => s + (t.amount || 0), 0);

  // ── Hero ──────────────────────────────────────────────────────────────
  // allExpensesOfMonth() filtra state.transactions só por competência
  // (db.js:151, isOfMonth) — NÃO exclui isProjected. Logo a parcela projetada
  // do mês corrente JÁ está dentro de totalExpense: `projetado` é um recorte
  // de dentro dele, nunca uma soma por cima. Somar daria dupla contagem.
  // `transfer` já fica de fora: db.js:154 só aceita type === 'expense' do
  // extrato, e transação normal não tem tipo de transferência.
  const projetado    = txExpenses.filter(t => t.isProjected === true) // ausente = false (registro antigo)
                                 .reduce((s, t) => s + (t.amount || 0), 0);
  const comprometido = totalExpense;
  const jaGasto      = Math.max(0, comprometido - projetado);

  // A barra decompõe a receita INTEIRA: gasto + investido + sobra. O investido
  // precisa ser segmento próprio porque sai da receita como qualquer saída —
  // deixá-lo fora fazia "Livre" contar dinheiro que já tinha ido para o
  // investimento (num mês fechado, "livre" lê como "o que ficou", e não era).
  // `resultado` é assinado; `livre` é o que a barra desenha.
  const resultado  = totalIncome - totalExpense - totalInvested;
  const livre      = Math.max(0, resultado);
  const guardado   = totalInvested + livre;
  const pctReceita = totalIncome > 0 ? Math.round((comprometido  / totalIncome) * 100) : null;
  const pctGuardado= totalIncome > 0 ? Math.round((guardado      / totalIncome) * 100) : null;
  const pctLivre   = totalIncome > 0 ? Math.round((livre         / totalIncome) * 100) : null;
  // Denominador da barra: se as saídas estouram a receita, elas viram a escala.
  const barBase    = Math.max(totalIncome, totalExpense + totalInvested, 1);
  const pctW       = v => ((v / barBase) * 100).toFixed(2);

  // Posição do mês exibido. O rótulo do hero segue daqui: mês encerrado não
  // tem nada "comprometido" — o que ele tem é resultado. Mês futuro, ao
  // contrário, é comprometido no sentido literal: só parcela já contratada.
  const hoje        = new Date();
  const mesCorrente = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const isMesAtual  = month === mesCorrente;
  const isEncerrado = month < mesCorrente;
  const diasRest    = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate() - hoje.getDate();

  const totalAssetInvest = state.assets
    .filter(a => a.type === 'investimento')
    .reduce((s, a) => s + (a.currentValue || 0), 0);

  // ── Comparativo com o mês anterior (delta % nos KPIs) ────────────────
  const prevMonth    = offsetMonth(month, -1);
  const prevTxs      = allExpensesOfMonth(prevMonth);
  const prevIncome   = incomesOfMonth(prevMonth).reduce((s, i) => s + (i.amount || 0), 0);
  const prevExpense  = prevTxs.filter(t => !investIds.includes(t.categoryId)).reduce((s, t) => s + (t.amount || 0), 0);
  const prevInvested = prevTxs.filter(t =>  investIds.includes(t.categoryId)).reduce((s, t) => s + (t.amount || 0), 0);

  // goodWhenUp: receita subir é bom (verde); despesa subir é ruim (vermelho).
  // Devolve o tom além do HTML porque o sparkline ao lado usa a MESMA cor —
  // delta e linha discordando de cor no mesmo card é ruído puro.
  // A frase "vs mês anterior" foi para o title: repetida em três cards, some
  // do olho e ocupa a largura que o sparkline usa melhor.
  const _delta = (now, prev, goodWhenUp) => {
    if (!prev || prev <= 0) return { html: '', tone: 'flat' };
    const pct = ((now - prev) / prev) * 100;
    if (Math.abs(pct) < 0.5) {
      return { html: `<span class="kpi-delta flat" title="Igual ao mês anterior">= mês anterior</span>`, tone: 'flat' };
    }
    const up   = pct > 0;
    const good = goodWhenUp ? up : !up;
    const cls  = good ? 'up-good' : 'up-bad';
    const txt  = `${up ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%`;
    return {
      html: `<span class="kpi-delta ${cls}" title="${txt} vs mês anterior">${txt}</span>`,
      tone: good ? 'good' : 'bad',
    };
  };

  const dReceita  = _delta(totalIncome,   prevIncome,   true);
  const dDespesa  = _delta(totalExpense,  prevExpense,  false);
  const dInvest   = _delta(totalInvested, prevInvested, true);

  // Mesma série do gráfico de evolução logo abaixo — uma conta só (ver
  // getSeries6m). Duas contas para o mesmo número divergem com o tempo.
  const serie = getSeries6m(investIds);

  // ── Renderiza HTML dos KPIs (substitui skeleton) ─────────────────────
  const kpiGrid = document.getElementById('kpi-grid');
  if (kpiGrid) {
    // Mês encerrado responde "como fechou?", não "quanto ainda posso gastar?".
    // O rótulo, o número grande e o rodapé mudam; a barra é a MESMA nos dois
    // modos — muda só o nome do que sobra (Livre → Sobrou).
    const heroRotulo = isEncerrado
      ? `Resultado de ${esc(monthLabel(month))}`
      : `Comprometido de ${esc(monthLabel(month))}`;

    // No mês encerrado o número grande é a sobra: é o único valor da faixa que
    // nenhum outro card mostra (o comprometido é sempre igual ao card Despesas).
    // Negativo aqui é FATO verificado, não a aritmética de dado faltando do
    // dia 1 — por isso ganha vermelho, ao contrário do estado sem receita.
    const heroValor = isEncerrado
      ? `<span class="kpi-value ${resultado < 0 ? 'negative' : ''}" id="kpi-resultado">${fmt(resultado)}</span>`
      : `<span class="kpi-value" id="kpi-comprometido">${fmt(comprometido)}</span>`;

    const heroRodape = isEncerrado
      ? (resultado < 0
          ? `Gastou ${fmt(Math.abs(resultado))} além da receita de ${fmt(totalIncome)}`
          : `${pctGuardado}% da receita guardada · ${pctLivre}% ficou livre`)
      : `${pctReceita}% da receita de ${fmt(totalIncome)}${isMesAtual ? ` · ${diasRest} ${diasRest === 1 ? 'dia restante' : 'dias restantes'}` : ''}`;

    // Parcela projetada nunca é reconciliada (nada no app vira isProjected de
    // volta para false). Num mês fechado ela não é previsão: é a parte do mês
    // que continua sendo estimativa. Nome honesto, cor neutra — marcar de
    // âmbar viraria ruído permanente, já que não há ação que resolva.
    const rotuloProj = isEncerrado ? 'Não conferido' : 'Parcelas previstas';
    const rotuloSobra = isEncerrado ? 'Sobrou' : 'Livre';

    const heroCorpo = totalIncome === 0
      ? `<div class="hero-bar" aria-hidden="true"><i class="seg-proj" style="width:100%"></i></div>
         <div class="hero-legend"><span><i class="dot proj"></i>Tudo em despesa já lançada ou contratada</span></div>
         <span class="mark-inferido">Receita de ${esc(monthLabel(month))} ainda não cadastrada — sem base de comparação</span>
         <button class="hero-cta" type="button" id="hero-cta-receita">Cadastrar receita</button>`
      : `<div class="hero-bar" aria-hidden="true">
           <i class="seg-real" style="width:${pctW(jaGasto)}%"></i>
           <i class="seg-proj" style="width:${pctW(projetado)}%"></i>
           <i class="seg-invest" style="width:${pctW(totalInvested)}%"></i>
         </div>
         <div class="hero-legend">
           <span class="leg-real"><i class="dot real"></i>Já gasto <b class="num">${fmt(jaGasto)}</b></span>
           ${projetado > 0 ? `<span class="leg-proj"><i class="dot proj"></i>${rotuloProj} <b class="num">${fmt(projetado)}</b></span>` : ''}
           ${totalInvested > 0 ? `<span class="leg-invest"><i class="dot invest"></i>Investido <b class="num">${fmt(totalInvested)}</b></span>` : ''}
           <span class="leg-livre"><i class="dot livre"></i>${rotuloSobra} <b class="num">${fmt(livre)}</b></span>
         </div>
         <div class="kpi-foot">${heroRodape}</div>`;

    kpiGrid.innerHTML = `
      <div class="kpi-card kpi-hero">
        <span class="kpi-label">${heroRotulo}</span>
        ${heroValor}
        ${heroCorpo}
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Receitas</span>
        <span class="kpi-value positive" id="kpi-receitas">${fmt(totalIncome)}</span>
        <div class="kpi-trend">
          ${dReceita.html || `<span class="kpi-delta flat">mês ${esc(monthLabel(month))}</span>`}
          ${_sparkline(serie.receitas, dReceita.tone, isMesAtual, 'Receitas nos últimos 6 meses')}
        </div>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Despesas</span>
        <span class="kpi-value negative" id="kpi-despesas">${fmt(totalExpense)}</span>
        <div class="kpi-trend">
          ${dDespesa.html || `<span class="kpi-delta flat">excluindo investimentos</span>`}
          ${_sparkline(serie.despesas, dDespesa.tone, isMesAtual, 'Despesas nos últimos 6 meses')}
        </div>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Investido</span>
        <span class="kpi-value" id="kpi-investido">${fmt(totalInvested)}</span>
        <div class="kpi-trend">
          ${dInvest.html || `<span class="kpi-delta flat" id="kpi-investido-total">${totalAssetInvest > 0 ? 'Patrimônio: ' + fmt(totalAssetInvest) : 'no mês'}</span>`}
          ${_sparkline(serie.investido, dInvest.tone, isMesAtual, 'Investimento nos últimos 6 meses')}
        </div>
      </div>`;

    // import() dinâmico: app.js é quem carrega este módulo, importá-lo
    // estaticamente aqui fecharia o ciclo.
    kpiGrid.querySelector('#hero-cta-receita')?.addEventListener('click', () => {
      import('./app.js').then(m => m.switchTab('receitas'));
    });
  }

  document.getElementById('chart-cat-month') && (document.getElementById('chart-cat-month').textContent = monthLabel(month));

  // Insights automáticos — usa a MESMA fonte de dados dos KPIs
  // (allExpensesOfMonth com categoryId resolvido e investimentos excluídos),
  // garantindo que chip e KPI nunca divirjam.
  renderInsights(m =>
    allExpensesOfMonth(m).filter(t => !investIds.includes(t.categoryId))
  );

  // Categorias sem as de investimento: os dois cards abaixo precisam bater com
  // o KPI de Despesas, que também exclui investimento.
  const catsSemInvest = state.categories.filter(c => !investIds.includes(c.id));

  // Erro de leitura não pode deixar número velho ao lado de dado novo: o card
  // mantém o título e troca o corpo pela mensagem.
  _guard('pizza-legend', () => renderChartCategorias(txExpenses));
  renderChartEvolucao();
  renderParcelasPrevisao();
  _guard('orcamento-list', () => renderOrcamentoDashboard(txExpenses, month, catsSemInvest));
}

function _guard(elId, fn) {
  try {
    fn();
  } catch (err) {
    console.error(`Erro ao montar #${elId}:`, err);
    const el = document.getElementById(elId);
    if (el) el.innerHTML = `<p class="card-error">Não foi possível carregar estes dados.</p>`;
  }
}

// ─── GRÁFICO DE CATEGORIAS (PIZZA COM TOTAL NO CENTRO) ─────────────────────
function renderChartCategorias(txs) {
  // Lançamento SEM categoria não pode cair na fatia "Outros": "Outros" é uma
  // categoria que o usuário escolhe de propósito, e misturar as duas esconde
  // exatamente o chute que a procedência da importação passou a expor.
  // Bucket próprio, com chave impossível de colidir com nome de categoria.
  const SEM_CAT = ' sem-categoria';
  const catMap = {};
  // Contagem por origem: a legenda promete "N lançamentos" e o clique leva a
  // uma aba que precisa mostrar exatamente esses N (ver semCategoriaLinksHTML).
  const semCat = { total: 0, count: 0, countGastos: 0, countExtratos: 0 };
  for (const tx of txs) {
    const cat = tx.categoryId ? state.categories.find(c => c.id === tx.categoryId) : null;
    // Id órfão (categoria apagada) NÃO é "sem categoria": vira resíduo. Se
    // entrasse no balde de pendência, a contagem da legenda não bateria com o
    // filtro do destino (`!t.categoryId`), que é justamente o que ela promete.
    const key = cat?.name || (tx.categoryId ? 'Outras' : SEM_CAT);
    catMap[key] = (catMap[key] || 0) + (tx.amount || 0);
    if (!tx.categoryId) {
      semCat.count++;
      if (tx._origem === 'extrato') semCat.countExtratos++;
      else                          semCat.countGastos++;
    }
  }

  // "Sem categoria" sai da disputa por espaço antes do corte, senão o resíduo
  // "Outras" o reabsorveria e o problema voltaria uma camada adiante.
  const semCatTotal = catMap[SEM_CAT] || 0;
  semCat.total = semCatTotal;
  delete catMap[SEM_CAT];

  // Top 7 categorias + agrupa o resto em "Outras" — antes o slice(0,8)
  // DESCARTAVA as categorias menores e o total do centro não batia com o KPI
  const allSorted = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
  const sorted    = allSorted.slice(0, 7);
  const resto     = allSorted.slice(7).reduce((s, [, v]) => s + v, 0);
  if (resto > 0) sorted.push(['Outras', resto]);
  // Sempre por último, para ficar adjacente ao resíduo e legível como "sobra"
  if (semCatTotal > 0) sorted.push(['Sem categoria', semCatTotal]);

  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);
  // Hex literal: canvas do Chart.js não resolve var(--text-muted).
  // Resíduo e ausência de categoria em cinza apagado, nunca em cor de série —
  // cor de série sugeriria que são categorias como as outras.
  const colors = sorted.map(([k]) =>
    (k === 'Outras' || k === 'Sem categoria')
      ? '#6b6b6b'
      : (state.categories.find(c => c.name === k)?.color || '#94a3b8')
  );
  const total  = values.reduce((s, v) => s + v, 0); // = total real de despesas do mês

  const totalEl = document.getElementById('pizza-total-value');
  if (totalEl) totalEl.textContent = fmt(total);

  const canvas = document.getElementById('chart-categorias');
  // O anel cinza do skeleton só existe até o primeiro render; depois dele o
  // canvas ocupa o mesmo espaço e a página não pula.
  document.getElementById('pizza-skeleton-ring')?.remove();
  if (chartCategorias) chartCategorias.destroy();

  if (!values.length) {
    // Empty state: small gray ring placeholder
    chartCategorias = new Chart(canvas, {
      type: 'doughnut',
      data: { labels: ['Sem dados'], datasets: [{ data: [1], backgroundColor: ['#2c2c2c'], borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { enabled: false } }, cutout: '68%' },
    });
    const legend = document.getElementById('pizza-legend');
    if (legend) legend.innerHTML = '<p style="text-align:center;color:var(--text-muted);font-size:0.82rem">Sem gastos neste mês</p>';
    return;
  }

  chartCategorias = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: '#1f1f1f', // hex direto: canvas do Chart.js não resolve var(--bg-card)
        borderWidth: 2,
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.label}: ${fmt(ctx.raw)} (${((ctx.raw/total)*100).toFixed(1)}%)`,
          },
        },
      },
    },
  });

  // Legenda customizada ao lado do gráfico. A fatia de "Sem categoria" segue
  // neutra no canvas: a pizza não é editável, e âmbar sem porta de saída é
  // alarme sem ação. Quem carrega o âmbar é a linha da legenda, que clica.
  const legend = document.getElementById('pizza-legend');
  if (legend) {
    legend.innerHTML = sorted.map(([name, val], i) => {
      const pct = ((val / total) * 100).toFixed(1);
      if (name === 'Sem categoria') return _legendaSemCategoria(semCat, pct);
      const clsNome = name === 'Outras' ? 'lg-name lg-resto' : 'lg-name';
      return `
        <div class="lg-row">
          <span class="lg-dot" style="background:${colors[i]}"></span>
          <span class="${clsNome}">${esc(name)}</span>
          <span class="lg-pct">${pct}%</span>
          <span class="lg-val">${fmt(val)}</span>
        </div>`;
    }).join('');
  }
}

/**
 * A linha de "Sem categoria" é a única acionável da legenda: é pendência, não
 * navegação (drill-down geral é outra rodada). Some por inteiro quando não há
 * pendência — silêncio é o sinal de que está tudo bem.
 */
function _legendaSemCategoria(sc, pct) {
  const plural = sc.count === 1 ? 'lançamento' : 'lançamentos';
  const rotulo = `Sem categoria · ${sc.count} ${plural}`;
  const linha = `
        <span class="lg-dot" style="background:#6b6b6b"></span>
        <span class="lg-name mark-inferido">${esc(rotulo)}</span>
        <span class="lg-pct">${pct}%</span>
        <span class="lg-val">${fmt(sc.total)}</span>`;

  // Duas origens: a linha inteira não pode clicar, porque nenhuma aba sozinha
  // mostra os N do rótulo. O split abaixo leva cada parte ao seu destino.
  if (sc.countGastos > 0 && sc.countExtratos > 0) {
    return `
      <div class="lg-row lg-sem">${linha}</div>
      <div class="lg-split">
        <button type="button" class="orc-link" data-goto="gastos" data-filtro-cat="${SEM_CATEGORIA_FILTRO}">${sc.countGastos} em Gastos</button>
        <span class="orc-split-sep">·</span>
        <button type="button" class="orc-link" data-goto="extratos">${sc.countExtratos} em Extratos</button>
      </div>`;
  }

  const goto = sc.countExtratos > 0
    ? `data-goto="extratos"`
    : `data-goto="gastos" data-filtro-cat="${SEM_CATEGORIA_FILTRO}"`;
  return `
      <div class="lg-row lg-sem lg-sem-click" role="button" tabindex="0" ${goto}
           title="Ver os lançamentos sem categoria">
        ${linha}
        <span class="lg-chevron" aria-hidden="true">›</span>
      </div>`;
}

// ─── SÉRIE DE 6 MESES — FONTE ÚNICA ────────────────────────────────────────
// Consumida pelos sparklines dos KPIs E pelo gráfico de evolução. Duas contas
// separadas para o mesmo número divergem com o tempo (foi o que aconteceu
// entre KPI e insight — ver comentário em renderDashboard).
function getSeries6m(investIds = getInvestCatIds()) {
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(offsetMonth(state.currentMonth, -i));
  return {
    months,
    labels:    months.map(m => monthLabel(m).slice(0, 3)),
    receitas:  months.map(m => incomesOfMonth(m).reduce((s, i) => s + (i.amount || 0), 0)),
    despesas:  months.map(m => allExpensesOfMonth(m).filter(t => !investIds.includes(t.categoryId)).reduce((s, t) => s + (t.amount || 0), 0)),
    investido: months.map(m => allExpensesOfMonth(m).filter(t =>  investIds.includes(t.categoryId)).reduce((s, t) => s + (t.amount || 0), 0)),
  };
}

// ─── SPARKLINE (SVG inline, 6 pontos) ──────────────────────────────────────
// SVG inline, não Chart.js: instanciar três gráficos de canvas para 66×26px é
// caro e obrigaria a destruir/recriar a cada troca de mês. SVG no DOM resolve
// var(--…) normalmente — a regra do hex literal vale só para o canvas.
function _sparkline(serie, tone, isMesAtual, label, w = 66, h = 26) {
  const stroke = tone === 'good' ? 'var(--success)'
               : tone === 'bad'  ? 'var(--danger)'
               : 'var(--text-muted)';
  const n   = serie.length;
  const max = Math.max(...serie);
  const min = Math.min(...serie);
  const y0 = 3, y1 = h - 3;
  // Padding vertical de 15% para a linha não encostar na borda. Série toda
  // igual (max === min) vira linha reta no meio — sem divisão por zero.
  const meio = (y0 + y1) / 2;
  const span = max - min;
  const lo = min - span * 0.15, hi = max + span * 0.15;
  // Termina em w-4, não em w-2: o círculo da ponta tem raio 2.4 e encostaria
  // na borda do viewBox.
  const px = i => (2 + i * ((w - 6) / (n - 1))).toFixed(1);
  const py = v => (span === 0 ? meio : y1 - ((v - lo) / (hi - lo)) * (y1 - y0)).toFixed(1);

  const pts = serie.map((v, i) => `${px(i)},${py(v)}`).join(' ');
  const cx = px(n - 1), cy = py(serie[n - 1]);
  // Ponta vazada no mês corrente: o mês ainda está incompleto, e um ponto
  // cheio lá embaixo lê como queda em vez de "ainda não terminou".
  const ponta = isMesAtual
    ? `<circle cx="${cx}" cy="${cy}" r="2.4" fill="none" stroke="${stroke}" stroke-width="1.3" stroke-dasharray="2 1.6"/>`
    : `<circle cx="${cx}" cy="${cy}" r="2.4" fill="${stroke}"/>`;

  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
    <polyline points="${pts}" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    ${ponta}
  </svg>`;
}

// ─── GRÁFICO DE EVOLUÇÃO MENSAL ─────────────────────────────────────────────
function renderChartEvolucao() {
  const { labels, receitas, despesas, investido } = getSeries6m();
  const maxVal = Math.max(...receitas, ...despesas, ...investido, 1);

  const canvas = document.getElementById('chart-evolucao');
  if (chartEvolucao) chartEvolucao.destroy();

  chartEvolucao = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Receitas',  data: receitas,  backgroundColor: 'rgba(30,177,27,0.30)',   borderColor: '#1eb11b', borderWidth: 1.5, borderRadius: 3 },
        { label: 'Despesas',  data: despesas,  backgroundColor: 'rgba(248,113,113,0.25)', borderColor: '#f87171', borderWidth: 1.5, borderRadius: 3 },
        { label: 'Investido', data: investido, backgroundColor: 'rgba(251,191,36,0.22)',  borderColor: '#fbbf24', borderWidth: 1.5, borderRadius: 3 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', align: 'end', labels: { color: '#a3a3a3', font: { family: 'Outfit', size: 10 }, boxWidth: 8, boxHeight: 8, padding: 10 } },
        tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.raw)}` } },
      },
      scales: {
        // size 9: em meia largura os 6 rótulos de mês encostavam um no outro.
        // Reduzir o tick antes de mexer no layout — o layout é a decisão cara.
        x: { ticks: { color: '#a3a3a3', font: { family: 'Outfit', size: 9 }, maxRotation: 0, autoSkip: false }, grid: { display: false } },
        y: {
          ticks: {
            color: '#a3a3a3', font: { family: 'JetBrains Mono', size: 9 },
            callback: v => maxVal >= 1000 ? `R$${(v/1000).toFixed(1)}k` : `R$${v}`,
          },
          grid: { color: 'rgba(255,255,255,0.05)' },
        },
      },
    },
  });
}

// ─── PARCELAS FUTURAS ──────────────────────────────────────────────────────
function renderParcelasPrevisao() {
  const current = state.currentMonth;
  const next3   = [offsetMonth(current,1), offsetMonth(current,2), offsetMonth(current,3)];
  const parcelas = state.transactions
    .filter(t => next3.includes(t.competenceMonth) && t.installmentTotal > 1)
    .sort((a, b) => a.competenceMonth.localeCompare(b.competenceMonth));

  const list = document.getElementById('parcelas-list');
  if (!parcelas.length) {
    list.innerHTML = `<div class="empty-state" style="padding:1.5rem">
      <div class="empty-state-icon">📅</div>
      <div class="empty-state-title">Sem parcelas futuras</div>
      <div class="empty-state-text">Nenhuma parcela prevista nos próximos 3 meses.</div>
    </div>`;
    return;
  }
  list.innerHTML = parcelas.slice(0,10).map(p => `
    <div class="parcela-item">
      <span class="parcela-desc" title="${esc(p.description)}">${esc(p.description)}</span>
      <div class="parcela-info">
        <span class="parcela-num">${p.installmentCurrent}/${p.installmentTotal}</span>
        <span class="parcela-val">${fmt(p.amount)}</span>
        <span class="parcela-mes">${monthLabel(p.competenceMonth).slice(0,3).toLowerCase()}</span>
      </div>
    </div>`).join('');
}

// ─── ORÇAMENTO × REAL ─────────────────────────────────────────────────────
function renderOrcamentoDashboard(txs, month, categories) {
  const list = document.getElementById('orcamento-list');
  const split = splitGastosPorLimite(txs, state.budgets[month] || {}, categories);

  // Só o mês sem NADA — nem gasto, nem limite — merece o empty state. Antes,
  // "sem orçamento definido" escondia o gasto inteiro do mês atrás de um ícone.
  if (!split.porCategoria.length && split.total === 0) {
    list.innerHTML = `<div class="empty-state" style="padding:1.5rem">
      <div class="empty-state-icon">🎯</div>
      <div class="empty-state-title">Sem orçamento definido</div>
      <div class="empty-state-text">Defina limites por categoria na aba Orçamento.</div>
    </div>`;
    return;
  }

  const rows = split.porCategoria.map(({ cat, limite, real, pct, cls }) => `
        <div class="orcamento-item">
          <div class="orcamento-row">
            <span class="orcamento-cat">
              <span class="cat-dot" style="background:${esc(cat.color || '#94a3b8')}"></span>
              ${esc(cat.name)}
            </span>
            <span class="orcamento-vals">
              <span class="orcamento-real">${fmt(real)}</span>
              <span class="orcamento-sep">/</span>
              <span class="orcamento-tgt">${fmt(limite)}</span>
            </span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill ${cls}" style="width:${Math.min(pct, 100).toFixed(1)}%"></div>
          </div>
        </div>`).join('');

  list.innerHTML = rows + renderForaDoLimite(split, month);
}

