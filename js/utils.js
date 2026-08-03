/**
 * utils.js — Utilitários e estado global compartilhados
 * SEM imports de outros módulos do projeto para evitar circular dependency.
 */

// ─── ESTADO GLOBAL ─────────────────────────────────────────────
export const state = {
  user: null,
  currentMonth: '',
  categories: [],
  transactions: [],
  incomes: [],
  budgets: {},
  assets: [],
  goals: [],
  extratoTransactions: [],
  importRules: [],
  // Configurações de fluxo de caixa (users/{uid}/settings/fluxo).
  // saldoInicial é por mês e "ausente" NÃO é zero: zero é abertura legítima,
  // ausente é a tela que ainda não pode chamar a curva de "saldo".
  fluxoConfig: { saldoInicial: {}, faturaVencimentoDia: null },
};

// ─── CATEGORIA DE INVESTIMENTO (regra única) ───────────────────
// A mesma regra estava escrita em quatro lugares, em duas implementações.
// Investimento sai do total de despesas em toda tela que fala de gasto, então
// duas leituras diferentes do que é "investimento" viram dois totais diferentes
// para o mesmo mês — foi o que a rodada 3 eliminou no orçamento.
//
// Compara id e name SEPARADAMENTE, nunca concatenados: `id + name` casa
// "investiment" atravessando a fronteira dos dois campos (id "…invest" +
// name "iment…") e classificaria como investimento algo que não é.
export function getInvestCatIds(categories = state.categories) {
  return (categories || [])
    .filter(c => {
      const id   = (c.id   || '').toLowerCase();
      const name = (c.name || '').toLowerCase();
      return id.includes('investiment') || name.includes('investiment');
    })
    .map(c => c.id);
}

// ─── CATEGORIAS: RESOLVE SLUG → ID REAL ───────────────────────
// Os parsers de extrato classificam com slugs ('alimentacao', 'transporte'...),
// mas as categorias no Firestore têm IDs auto-gerados. Esta função mapeia
// slug (ou nome) → ID real da categoria do usuário, por nome normalizado.
const _SLUG_TO_NAME = {
  alimentacao: 'alimentação', transporte: 'transporte', assinatura: 'assinaturas',
  saude: 'saúde', compras: 'compras', eletronicos: 'eletrônicos', educacao: 'educação',
  moradia: 'moradia', lazer: 'lazer', investimento: 'investimento',
  vestuario: 'vestuário', encargos: 'outros', outros: 'outros',
};
const _norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

export function resolveCategoryId(slugOrId) {
  if (!slugOrId) return '';
  // Já é um ID válido?
  if (state.categories.some(c => c.id === slugOrId)) return slugOrId;
  const target = _norm(_SLUG_TO_NAME[slugOrId] ?? slugOrId);
  if (!target) return '';
  const cat = state.categories.find(c => _norm(c.name) === target)
           || state.categories.find(c => _norm(c.name).includes(target) || target.includes(_norm(c.name)));
  return cat?.id || '';
}

// ─── FORMATAÇÃO ────────────────────────────────────────────────
export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g, '&#x2F;');
}

export function fmt(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

export function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-');
  const names = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

export function offsetMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ─── COMPETÊNCIA (critério único) ─────────────────────────────
// Antes existiam três critérios diferentes para "este lançamento é deste mês?":
// gasto de cartão por competenceMonth, gasto de extrato por date.slice(0,7) e
// receita por month/competenceMonth/date. O resultado era Dashboard e Relatórios
// discordando entre si sobre o mesmo lançamento.
//
// Ordem de precedência: o campo mais específico vence. competenceMonth é uma
// decisão explícita do usuário (a parcela pesa em maio mesmo comprada em janeiro);
// month é o mês declarado da receita; date é o último recurso, o mês do fato.
//
// Hoje nenhuma coleção grava dois desses campos ao mesmo tempo, então unificar
// não move nenhum lançamento de mês — a função existe para impedir que voltem
// a divergir quando um novo fluxo passar a gravar competenceMonth.

/** Mês de competência de um lançamento (transação, extrato ou receita). */
export function competenceOf(tx) {
  return tx.competenceMonth || tx.month || (tx.date || '').slice(0, 7);
}

/** O lançamento pertence ao mês `month` ('YYYY-MM')? */
export function isOfMonth(tx, month) {
  return competenceOf(tx) === month;
}

// ─── TOAST ────────────────────────────────────────────────────
const TOAST_ICONS = { success: '✓', error: '✕', warning: '⚠', info: '◈' };

export function toast(msg, type = 'info', title = '', duration = 4500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const autoTitle = title || { success: 'Sucesso', error: 'Erro', warning: 'Atenção', info: 'Aviso' }[type] || '';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <span class="toast-icon">${esc(TOAST_ICONS[type] || '●')}</span>
    <div class="toast-body">
      ${autoTitle ? `<div class="toast-title">${esc(autoTitle)}</div>` : ''}
      <div class="toast-msg">${esc(msg)}</div>
    </div>
    <button class="toast-close" aria-label="Fechar">✕</button>`;
  el.querySelector('.toast-close').addEventListener('click', () => removeToast(el));
  container.appendChild(el);
  if (duration > 0) setTimeout(() => removeToast(el), duration);
}

function removeToast(el) {
  if (!el.parentNode) return;
  el.classList.add('hiding');
  setTimeout(() => el.parentNode?.removeChild(el), 260);
}

// ─── SKELETON ─────────────────────────────────────────────────
export function showKpiSkeleton() {
  const grid = document.getElementById('kpi-grid');
  if (!grid) return;
  // O primeiro skeleton acompanha a proporção do hero (card mais largo e mais
  // alto do dashboard). Quatro esqueletos iguais fariam a tela "pular" no
  // momento em que o render real os substitui.
  const apoio = `
    <div class="kpi-skeleton">
      <div class="skeleton sk-title" style="width:55%"></div>
      <div class="skeleton sk-value" style="margin-top:8px"></div>
      <div class="skeleton sk-text" style="width:50%;margin-top:8px"></div>
    </div>`;
  grid.innerHTML = `
    <div class="kpi-skeleton sk-hero">
      <div class="skeleton sk-title" style="width:45%"></div>
      <div class="skeleton sk-value" style="margin-top:10px;height:34px"></div>
      <div class="skeleton sk-text" style="width:100%;margin-top:12px;height:8px"></div>
      <div class="skeleton sk-text" style="width:80%;margin-top:10px"></div>
    </div>` + Array(3).fill(apoio).join('');
}

export function showTableSkeleton(tbodyId, cols = 6) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = Array(5).fill(
    `<tr>${Array(cols).fill(`<td><div class="skeleton sk-text"></div></td>`).join('')}</tr>`
  ).join('');
}

// ─── INSIGHTS AUTOMÁTICOS ─────────────────────────────────────
// Fallback: despesas do mês (transactions + extrato) sem investimentos.
// Usado APENAS se o chamador não passar getExpenses — o dashboard sempre
// passa o callback baseado em allExpensesOfMonth (fonte única dos KPIs).
// utils.js não pode importar db.js (dependência circular).
function _expensesFallback(month, investIds) {
  const normais = state.transactions.filter(t =>
    isOfMonth(t, month) && !investIds.includes(t.categoryId));
  const extrato = (state.extratoTransactions || []).filter(t =>
    t.type === 'expense' && isOfMonth(t, month) &&
    !investIds.includes(resolveCategoryId(t.categoryId || t.category)));
  // Resolve categoryId dos itens de extrato (slug → ID real) para os
  // agrupamentos por categoria baterem com o resto do app
  return [...normais, ...extrato.map(t => ({
    ...t, categoryId: t.categoryId || resolveCategoryId(t.category) || t.category || '',
  }))];
}

export function renderInsights(getExpenses = null) {
  const strip = document.getElementById('insights-strip');
  if (!strip) return;

  const month     = state.currentMonth;
  const prevMonth = offsetMonth(month, -1);

  const investIds = getInvestCatIds();

  // Fonte única: mesmo cálculo dos KPIs quando o dashboard fornece o callback
  const expensesOf = getExpenses || (m => _expensesFallback(m, investIds));
  const txs     = expensesOf(month);
  const txsPrev = expensesOf(prevMonth);

  const totalNow  = txs.reduce((s, t) => s + (t.amount || 0), 0);
  const totalPrev = txsPrev.reduce((s, t) => s + (t.amount || 0), 0);

  const chips = [];

  if (totalPrev > 0 && totalNow > 0) {
    const delta = ((totalNow - totalPrev) / totalPrev) * 100;
    if (Math.abs(delta) > 5) {
      chips.push({ type: delta > 0 ? 'warn' : 'good', icon: delta > 0 ? '📈' : '📉',
        text: `Gastos ${delta > 0 ? '+' : ''}${delta.toFixed(0)}% vs mês anterior` });
    }
  }

  const catTotals = {};
  for (const tx of txs) catTotals[tx.categoryId] = (catTotals[tx.categoryId] || 0) + (tx.amount || 0);

  // ── ANOMALIA: categoria fora da média dos últimos 3 meses ──────────
  // Mais útil que "X é sua maior categoria" (ranking que você já conhece).
  // Regras: média ≥ R$ 80 (ignora categorias irrelevantes), desvio ≥ 30%,
  // mostra no máx. as 2 maiores anomalias para não poluir a faixa.
  {
    const histTotals = {}; // categoria → [total m-1, m-2, m-3]
    for (let i = 1; i <= 3; i++) {
      const m = offsetMonth(month, -i);
      for (const tx of expensesOf(m)) {
        const k = tx.categoryId || '_sem';
        (histTotals[k] = histTotals[k] || []).push(tx.amount || 0);
      }
    }
    const anomalies = [];
    for (const [catId, val] of Object.entries(catTotals)) {
      const hist = histTotals[catId];
      if (!hist || !hist.length) continue;
      const avg = hist.reduce((s, v) => s + v, 0) / 3; // média mensal (3 meses)
      if (avg < 80) continue;
      const dev = ((val - avg) / avg) * 100;
      if (Math.abs(dev) < 30) continue;
      const cat = state.categories.find(c => c.id === catId);
      if (!cat) continue;
      anomalies.push({ dev, cat, val });
    }
    anomalies.sort((a, b) => Math.abs(b.dev) - Math.abs(a.dev));
    for (const a of anomalies.slice(0, 2)) {
      chips.push({
        type: a.dev > 0 ? 'warn' : 'good',
        icon: a.dev > 0 ? '🔺' : '🔻',
        text: `${a.cat.name} ${a.dev > 0 ? '+' : ''}${a.dev.toFixed(0)}% vs sua média de 3 meses (${fmt(a.val)})`,
      });
    }
  }

  // ── PROJEÇÃO: no ritmo atual, o mês fecha em ~R$X ──────────────────
  // Só faz sentido no mês corrente, com o mês já rodando (dia ≥ 5) e ainda
  // com dias pela frente. Projeção linear simples: gasto ÷ dias corridos × dias do mês.
  {
    const now = new Date();
    const isCurrent = month === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const dayNow = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    if (isCurrent && dayNow >= 5 && dayNow < daysInMonth && totalNow > 0) {
      const projected = (totalNow / dayNow) * daysInMonth;
      // Compara com o mês anterior para dar referência de cor
      const worse = totalPrev > 0 && projected > totalPrev;
      chips.push({
        type: worse ? 'warn' : 'info',
        icon: '🔮',
        text: `No ritmo atual, o mês fecha em ~${fmt(projected)}`,
      });
    }
  }

  const budgets = state.budgets[month] || {};
  for (const [catId, limit] of Object.entries(budgets)) {
    if (limit <= 0) continue;
    const spent = catTotals[catId] || 0;
    const pct   = (spent / limit) * 100;
    const cat   = state.categories.find(c => c.id === catId);
    if (pct >= 90 && cat) {
      chips.push({ type: 'warn', icon: '⚠️',
        text: `Orçamento de ${cat.name} ${pct >= 100 ? 'ultrapassado' : 'quase no limite'}` });
    }
  }

  const nextMonth = offsetMonth(month, 1);
  const parcelas  = state.transactions.filter(t => isOfMonth(t, nextMonth) && t.installmentTotal > 1);
  const totalParc = parcelas.reduce((s, t) => s + (t.amount || 0), 0);
  if (totalParc > 0) chips.push({ type: 'info', icon: '📅', text: `${fmt(totalParc)} em parcelas no próximo mês` });

  if (!chips.length) {
    strip.innerHTML = `<div class="insight-chip info"><span>✨</span> Tudo em ordem por aqui!</div>`;
    return;
  }

  strip.innerHTML = chips.map(c =>
    `<div class="insight-chip ${esc(c.type)}"><span>${esc(c.icon)}</span>${esc(c.text)}</div>`
  ).join('');
}

// ─── ORÇAMENTO: PARTIÇÃO DO GASTO DO MÊS ───────────────────────────────────
/**
 * Divide as despesas do mês em três baldes que somam EXATAMENTE o total:
 * categorias com limite, gasto sem categoria e gasto em categoria sem limite.
 *
 * Mora aqui, e não em db.js, porque é função pura — não lê `state`, não toca
 * Firestore — e utils.js é o único módulo que dashboard.js e orcamento.js já
 * importam sem criar ciclo. (utils.js não pode importar módulo do projeto;
 * como a função recebe tudo por argumento, cabe sem violar a regra.)
 *
 * A identidade `porCategoria + semCategoria + semLimite === total` é o ponto
 * da função: antes, o card iterava só sobre as categorias COM limite e o resto
 * do gasto sumia da tela sem aviso.
 *
 * `txs` deve chegar já sem investimentos, para bater com o KPI de Despesas.
 * `categories` também: categoria de investimento com limite entraria em
 * porCategoria e quebraria a identidade contra o total.
 */
export function splitGastosPorLimite(txs, budgetMonth = {}, categories = []) {
  const catById = new Map(categories.map(c => [c.id, c]));

  // Só limite > 0 conta como "tem limite": zero é ausência de meta, não meta de
  // zero — é assim que orcamento.js grava (só persiste val > 0).
  const comLimite = new Map(
    Object.entries(budgetMonth).filter(([id, v]) => v > 0 && catById.has(id))
  );

  const realPorCat  = new Map();
  let total         = 0;
  const semCategoria = { total: 0, count: 0, countGastos: 0, countExtratos: 0 };
  const semLimite    = { total: 0, count: 0 };

  for (const tx of txs) {
    if (tx.type === 'transfer') continue; // transferência não é despesa
    const val = tx.amount || 0;
    total += val;

    if (!tx.categoryId) {
      semCategoria.total += val;
      semCategoria.count++;
      // Origem separada porque os dois destinos de clique são abas diferentes:
      // a aba Gastos só enxerga state.transactions (db.js, txOfMonth).
      if (tx._origem === 'extrato') semCategoria.countExtratos++;
      else                          semCategoria.countGastos++;
      continue;
    }
    if (comLimite.has(tx.categoryId)) {
      realPorCat.set(tx.categoryId, (realPorCat.get(tx.categoryId) || 0) + val);
    } else {
      semLimite.total += val;
      semLimite.count++;
    }
  }

  const porCategoria = [...comLimite.entries()]
    .map(([id, limite]) => {
      const real = realPorCat.get(id) || 0;
      const pct  = (real / limite) * 100;
      return {
        cat: catById.get(id),
        limite, real, pct,
        // Faixas iguais às da aba Orçamento. Azul (progress-ok) para "dentro
        // do limite": é o esperado, não conquista — e verde competiria com o
        // verde de receita.
        cls: pct >= 100 ? 'progress-over' : pct >= 80 ? 'progress-warn' : 'progress-ok',
      };
    })
    .sort((a, b) => b.real - a.real);

  return { porCategoria, semCategoria, semLimite, total };
}

/**
 * Links do bloco "fora de qualquer limite" / da legenda da pizza.
 * Só devolve HTML: quem navega é o handler delegado de app.js, que lê
 * `data-goto` (aba) e `data-filtro-cat` (filtro a aplicar na aba Gastos).
 * Assim nenhum módulo de aba precisa importar app.js — o ciclo que o
 * import() dinâmico existe para evitar.
 */
export function semCategoriaLinksHTML(sc) {
  const n = sc.count;
  const plural = n === 1 ? 'lançamento' : 'lançamentos';
  const valor  = `${fmt(sc.total)} em ${n} ${plural} sem categoria`;

  // As duas origens existem: o número total não bate com nenhuma aba sozinha,
  // então ele não vira link — quem vira são os dois trechos, cada um com o
  // número que a sua aba realmente mostra.
  if (sc.countGastos > 0 && sc.countExtratos > 0) {
    return `
      <span class="orc-fora-item mark-inferido">${esc(valor)}</span>
      <span class="orc-split">
        <button type="button" class="orc-link" data-goto="gastos" data-filtro-cat="${SEM_CATEGORIA_FILTRO}">${sc.countGastos} em Gastos</button>
        <span class="orc-split-sep">·</span>
        <button type="button" class="orc-link" data-goto="extratos">${sc.countExtratos} em Extratos</button>
      </span>`;
  }

  const soExtrato = sc.countExtratos > 0;
  const goto = soExtrato
    ? `data-goto="extratos"`
    : `data-goto="gastos" data-filtro-cat="${SEM_CATEGORIA_FILTRO}"`;
  return `<button type="button" class="orc-link orc-link-atencao" ${goto}>${esc(valor)} ›</button>`;
}

/**
 * Bloco "fora de qualquer limite" + linha de reconciliação. É o que faz a conta
 * fechar: categorias com limite + este bloco = total de despesas do mês =
 * KPI de Despesas. Sem barra de progresso de propósito — barra exige
 * denominador, e aqui não há meta. Compartilhado pelo card do Dashboard e pela
 * aba Orçamento para não existirem duas verdades sobre o mesmo mês.
 */
export function renderForaDoLimite(split, month) {
  const { semCategoria: sc, semLimite: sl } = split;
  const foraTotal = sc.total + sl.total;

  const partes = [];
  if (sc.count > 0) partes.push(semCategoriaLinksHTML(sc));
  if (sl.count > 0) {
    partes.push(`<button type="button" class="orc-link" data-goto="orcamento">${esc(`${fmt(sl.total)} em categorias sem limite definido`)}</button>`);
  }

  // Cada causa some sozinha quando zera; o bloco inteiro some quando as duas
  // zeram, sobrando só a reconciliação.
  const bloco = partes.length ? `
      <div class="orcamento-item orc-fora">
        <div class="orcamento-row">
          <span class="orcamento-cat">Fora de qualquer limite</span>
          <span class="orcamento-vals"><span class="orcamento-real">${fmt(foraTotal)}</span></span>
        </div>
        <div class="orc-fora-detalhe">${partes.join('<span class="orc-split-sep">·</span>')}</div>
      </div>` : '';

  return `${bloco}
      <div class="orc-reconcilia">
        <span>Total de despesas de ${esc(monthLabel(month))}</span>
        <span class="orc-reconcilia-val">${fmt(split.total)}</span>
      </div>`;
}

/**
 * Valor sentinela do filtro "sem categoria" da aba Gastos. Começa com `__` e
 * termina com `__`: id de categoria é slug gerado a partir do nome (letras,
 * dígitos e hífen), então nunca colide com um id real.
 */
export const SEM_CATEGORIA_FILTRO = '__sem-categoria__';

// ─── REVISÃO DE IMPORTAÇÃO: BARRA DE RESUMO E FILTRO DE ATENÇÃO ─────────────
/**
 * Monta a barra de resumo acima da tabela de preview (fatura e extrato usam a
 * mesma). Os contadores de pendência ficam sempre no DOM, mas escondidos
 * enquanto valem zero: assim dá para atualizar o número sem recriar o nó do
 * botão de filtro — recriar perderia o estado ligado/desligado do filtro.
 *
 * prefixHtml e statsHtml chegam já escapados pelo chamador.
 */
export function renderImportSummary(bar, { prefixHtml = '', statsHtml = '' } = {}) {
  if (!bar) return;
  bar.innerHTML = `
    <div class="import-summary-meta">
      ${prefixHtml}
      <span class="import-summary-total import-summary-count"></span>
      <span class="import-summary-cat mark-inferido hidden"></span>
      <span class="import-summary-dup mark-inferido hidden"></span>
    </div>
    ${statsHtml}
    <button type="button" class="btn btn-ghost btn-sm import-filter-btn hidden" data-on="0">Ver só o que precisa de atenção</button>`;
}

/** Atualiza só os números da barra. Contador zerado some — silêncio é o sinal. */
export function updateImportSummary(bar, { total = 0, semCategoria = 0, duplicatas = 0 } = {}) {
  if (!bar) return;
  const elTotal = bar.querySelector('.import-summary-total');
  const elCat   = bar.querySelector('.import-summary-cat');
  const elDup   = bar.querySelector('.import-summary-dup');
  const btn     = bar.querySelector('.import-filter-btn');

  if (elTotal) elTotal.textContent = `${total} lançamento${total === 1 ? '' : 's'}`;
  if (elCat) {
    elCat.textContent = `${semCategoria} sem categoria`;
    elCat.classList.toggle('hidden', semCategoria === 0);
  }
  if (elDup) {
    elDup.textContent = `${duplicatas} possível duplicata${duplicatas === 1 ? '' : 's'}`;
    elDup.classList.toggle('hidden', duplicatas === 0);
  }
  if (btn) {
    const temPendencia = semCategoria + duplicatas > 0;
    btn.classList.toggle('hidden', !temPendencia);
    // Sem pendência não existe o que filtrar: desliga antes de sumir, senão as
    // linhas escondidas ficariam invisíveis sem botão para trazê-las de volta.
    if (!temPendencia && btn.dataset.on === '1') resetImportFilter(bar);
  }
}

/** Liga/desliga o filtro escondendo <tr> — sem re-render, para não perder edição. */
export function toggleImportFilter(bar, tbody) {
  const btn = bar?.querySelector('.import-filter-btn');
  if (!btn || !tbody) return;
  const on = btn.dataset.on !== '1';
  btn.dataset.on = on ? '1' : '0';
  btn.textContent = on ? 'Ver todos' : 'Ver só o que precisa de atenção';
  tbody.querySelectorAll('tr').forEach(tr => {
    tr.classList.toggle('row-hidden-filter', on && !tr.classList.contains('row-atencao'));
  });
}

function resetImportFilter(bar) {
  const btn = bar?.querySelector('.import-filter-btn');
  if (!btn) return;
  btn.dataset.on = '0';
  btn.textContent = 'Ver só o que precisa de atenção';
  document.querySelectorAll('.row-hidden-filter').forEach(tr => tr.classList.remove('row-hidden-filter'));
}

/**
 * O botão de confirmação nomeia o que está sendo aceito. Nunca desabilita:
 * salvar sem categoria é escolha legítima; o botão só obriga a ler o número.
 */
export function updateImportConfirmButton(btn, semCategoria, labelPadrao = 'Confirmar e Salvar') {
  if (!btn) return;
  if (semCategoria > 0) {
    btn.textContent = `Salvar assim mesmo · ${semCategoria} sem categoria`;
    btn.classList.add('btn-atencao');
  } else {
    btn.textContent = labelPadrao;
    btn.classList.remove('btn-atencao');
  }
}
