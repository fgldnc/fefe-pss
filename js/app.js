/**
 * app.js — Fluxo v2
 * Sem imports estáticos dos módulos de render para evitar circular dependency.
 * Usa dynamic import() dentro de switchTab().
 */

import { initAuth }    from './auth.js';
import { loadAllData } from './db.js';
import {
  state, thisMonth, monthLabel, offsetMonth,
  showKpiSkeleton, toast, esc, resolveCategoryId,
} from './utils.js';

// Re-exporta utils para quem ainda importa de app.js (compatibilidade)
export { state, thisMonth, monthLabel, offsetMonth, toast } from './utils.js';
export { esc, fmt, showKpiSkeleton, showTableSkeleton, renderInsights } from './utils.js';

// ─── NAVEGAÇÃO COM DYNAMIC IMPORT ──────────────────────────────
/**
 * DESTINOS — a arquitetura v2 (ARQUITETURA-v2.md, opção B).
 *
 * Um destino é uma ou mais das `<section class="tab-content">` do index.html,
 * mostradas juntas e renderizadas na ordem em que aparecem aqui. Enquanto as
 * rodadas 3 a 8 não fundem as telas de verdade, EMPILHAR é o passo
 * intermediário honesto: a navegação já é a nova, e nenhuma capacidade fica
 * inalcançável no caminho.
 *
 * Cada `render*` continua escrevendo na seção dele, por id — foi isso que
 * permitiu trocar o roteamento sem tocar em nenhum módulo de aba.
 */
const DESTINOS = {
  importar: [
    { secao: 'extratos', mod: () => import('./extratos.js').then(m => m.renderExtratos) },
  ],
  // Rodada 3: as quatro telas empilhadas viraram UMA. `js/mes.js` monta a
  // seção inteira; `gastos.js` e `receitas.js` continuam vivos como camada de
  // formulário e gravação, chamados de lá.
  mes: [
    { secao: 'mes', mod: () => import('./mes.js').then(m => m.renderMes) },
  ],
  adiante: [
    { secao: 'calendario', mod: () => import('./saldos.js').then(m => m.renderCalendario) },
    { secao: 'timeline',   mod: () => import('./timeline.js').then(m => m.renderTimeline) },
    // Os dois cards do dashboard antigo que não falam do mês corrente
    // (parcelas dos próximos 3 meses, evolução de 6). A rodada 4 decide onde
    // eles ficam dentro de Adiante; até lá, ficam no fim, inteiros.
    { secao: 'previsoes',  mod: () => import('./previsoes.js').then(m => m.renderPrevisoes) },
  ],
  guardado: [
    { secao: 'metas',      mod: () => import('./metas.js').then(m => m.renderMetas) },
    { secao: 'patrimonio', mod: () => import('./patrimonio.js').then(m => m.renderPatrimonio) },
  ],
  ajustes: [
    // Orçamento é ajuste, não leitura do mês: definir teto de categoria se faz
    // uma vez e não se olha de novo. Decisão da usuária na rodada 3.
    { secao: 'orcamento',     mod: () => import('./orcamento.js').then(m => m.renderOrcamento) },
    { secao: 'configuracoes', mod: () => import('./configuracoes.js').then(m => m.renderConfiguracoes) },
    { secao: 'relatorios',    mod: () => import('./relatorios.js').then(m => m.renderRelatorios) },
  ],
};

/**
 * Os ids de aba antigos continuam válidos como endereço: há `data-goto="gastos"`
 * espalhado pelos cards e `switchTab('dashboard')` em meia dúzia de lugares.
 * Em vez de caçar todas as chamadas agora — e voltar a mexer nelas quando a
 * rodada da tela reescrever o card —, o id antigo vira um APELIDO do destino
 * que hoje o contém, e a rolagem leva à seção certa dentro dele.
 */
const APELIDOS = {
  dashboard: 'mes', gastos: 'mes', receitas: 'mes',
  extratos: 'importar',
  calendario: 'adiante', timeline: 'adiante', previsoes: 'adiante',
  metas: 'guardado', patrimonio: 'guardado',
  orcamento: 'ajustes', configuracoes: 'ajustes', relatorios: 'ajustes',
};

/**
 * Onde parar dentro do destino. Depois da rodada 3 o id antigo já não é o id
 * de uma seção — `gastos` virou um bloco dentro de `#tab-mes` —, então o
 * apelido também precisa dizer a QUE elemento rolar.
 */
const ANCORAS = {
  dashboard: 'mes-heroi', gastos: 'mes-tabela', receitas: 'mes-tabela',
  orcamento: 'orcamento-bloco',
};

/** Destino de `name`, seja ele um destino ou um id de aba antigo. */
function destinoDe(name) {
  return DESTINOS[name] ? name : APELIDOS[name] || null;
}

export async function switchTab(name) {
  const destino = destinoDe(name);
  if (!destino) return;
  const partes = DESTINOS[destino];

  document.querySelectorAll('.nav-link').forEach(el =>
    el.classList.toggle('active', el.dataset.tab === destino)
  );

  const ids = partes.map(p => `tab-${p.secao}`);
  document.querySelectorAll('.tab-content').forEach(el => {
    const dentro = ids.includes(el.id);
    el.classList.toggle('hidden', !dentro);
    el.classList.toggle('active',  dentro);
  });

  // Em série, não em paralelo: a ordem do array é a ordem de leitura da tela,
  // e um erro no meio não pode deixar metade do destino renderizada em branco
  // sem avisar. Cada parte falha por conta própria.
  for (const parte of partes) {
    try {
      const render = await parte.mod();
      if (typeof render === 'function') render();
    } catch (err) {
      console.error(`Erro ao carregar ${parte.secao} (destino ${destino}):`, err);
      const msg = err?.message ? `${parte.secao}: ${err.message}` : `Erro ao carregar ${parte.secao}.`;
      toast(msg, 'error');
    }
  }
}

/**
 * Leva à aba pedida e, se houver, aplica o filtro de categoria. O filtro é
 * aplicado DEPOIS do switchTab porque a opção sentinela só existe no <select>
 * depois que renderGastos() o remonta; disparar 'change' reaproveita o listener
 * que a própria aba já registrou, sem exportar nada novo.
 */
async function _goto(el) {
  const tab = el.dataset.goto;
  if (!tab) return;
  await switchTab(tab);

  // O destino empilha várias telas antigas: chegar nele não é chegar na tela
  // pedida. Sem isto, "ver em Gastos" deixa o usuário no topo da Visão do mês,
  // com a tabela que ele pediu meia tela abaixo e sem nada dizendo isso.
  const alvo = document.getElementById(ANCORAS[tab] || `tab-${tab}`);
  if (alvo && !alvo.closest('.tab-content')?.classList.contains('hidden')) {
    alvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const filtroCat = el.dataset.filtroCat;
  if (filtroCat) {
    const sel = document.getElementById('filter-categoria');
    if (sel) {
      sel.value = filtroCat;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  // `data-filtro-proj` leva à aba Gastos já filtrada nas parcelas projetadas.
  // Mesmo mecanismo do filtro de categoria: liga o controle que a própria aba
  // já registrou e dispara 'change' — nada novo precisa ser exportado.
  if (el.dataset.filtroProj) {
    const cb = document.getElementById('filter-apenas-projetadas');
    const painel = document.getElementById('advanced-filter-panel');
    if (cb) {
      // O checkbox mora no painel avançado: abrir junto, senão o usuário chega
      // numa tabela filtrada sem enxergar o filtro que a está filtrando.
      painel?.classList.remove('hidden');
      cb.checked = true;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
}

function updateMonthLabel() {
  const el = document.getElementById('month-label');
  if (el) el.textContent = monthLabel(state.currentMonth);
}

// Trocar de mês não muda dado no servidor: todas as telas filtram `state`
// por competência em memória. Re-renderizar basta — recarregar as 7 coleções
// a cada clique de mês era ida ao Firestore sem ganho nenhum.
/**
 * Contador de pendência na aba Extratos.
 *
 * A fonte é a MESMA regra que a tela de revisão usa para pintar o campo de
 * âmbar (`extratos.js`, `semCat`): despesa importada sem categoria resolvida.
 * Receita não conta — a revisão não exige categoria dela, e um contador que
 * discorda da tela seria pior que contador nenhum.
 *
 * Só o mês corrente: a sidebar fala do mês que está selecionado no topo, como
 * todas as telas.
 */
function _pendenciasExtrato() {
  return (state.extratoTransactions || []).filter(tx =>
    tx.type === 'expense' &&
    String(tx.date || '').slice(0, 7) === state.currentMonth &&
    !(tx.categoryId || resolveCategoryId(tx.category))
  ).length;
}

function atualizarBadgeExtratos() {
  const el = document.getElementById('nav-badge-extratos');
  if (!el) return;
  const n = _pendenciasExtrato();
  el.textContent = n;
  // `hidden` em vez de classe: zero pendência é silêncio, e silêncio é o sinal
  // de que está tudo bem — um "0" âmbar na sidebar seria alarme de nada.
  el.hidden = n === 0;
  el.title = n === 1 ? '1 lançamento sem categoria' : `${n} lançamentos sem categoria`;
}

async function rerenderCurrentTab() {
  const active = document.querySelector('.nav-link.active');
  if (!active) return;
  atualizarBadgeExtratos();
  await switchTab(active.dataset.tab);
}

// Use só depois de escrita externa que não atualizou `state` (import de
// extrato, restore de backup).
export async function reloadAndRerender() {
  await loadAllData();
  await rerenderCurrentTab();
}

// A COMMAND PALETTE (Ctrl+K), o ONBOARDING de 4 passos e a TROCA DE TEMA
// saíram na rodada 2 da v2:
//
// - palette: era atalho para 11 destinos; com 4 + Ajustes na barra lateral
//   não sobrou o que atalhar, e a busca que resta é a da tabela.
// - onboarding: rodava uma vez, e um dos quatro passos era morto — `obData.bank`
//   era escrito e nunca lido por ninguém. Estado vazio bom em cada tela
//   resolve o mesmo problema sem bloquear o primeiro uso.
// - tema: a direção escolhida (hibrido.html) tem um tema só, e `data-theme`
//   deixou de ser lido por qualquer regra de CSS na rodada 1.
//
// O salário e a primeira meta que o onboarding coletava continuam entrando
// pelos botões normais de Receitas e de Guardado.

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  state.currentMonth = thisMonth();
  updateMonthLabel();

  // Month picker: clicar no nome do mês abre o seletor nativo (pula N meses de uma vez)
  const monthPicker = document.getElementById('month-picker');
  document.getElementById('month-label')?.addEventListener('click', () => {
    if (!monthPicker) return;
    monthPicker.value = state.currentMonth;
    if (typeof monthPicker.showPicker === 'function') monthPicker.showPicker();
    else monthPicker.focus();
  });
  monthPicker?.addEventListener('change', async () => {
    if (!/^\d{4}-\d{2}$/.test(monthPicker.value)) return;
    state.currentMonth = monthPicker.value;
    updateMonthLabel();
    await rerenderCurrentTab();
  });

  // Navegação por mês
  document.getElementById('btn-prev-month')?.addEventListener('click', async () => {
    state.currentMonth = offsetMonth(state.currentMonth, -1);
    updateMonthLabel();
    await rerenderCurrentTab();
  });
  document.getElementById('btn-next-month')?.addEventListener('click', async () => {
    state.currentMonth = offsetMonth(state.currentMonth, 1);
    updateMonthLabel();
    await rerenderCurrentTab();
  });

  // Clique nos destinos. A gaveta lateral do celular saiu junto com o menu
  // hamburguer: abaixo de 900px a mesma barra vira barra fixa no rodape, e o
  // destino fica a um toque em vez de dois.
  document.querySelectorAll('.nav-link[data-tab]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      switchTab(link.dataset.tab);
    });
  });

  // Fecha modais via [data-modal] ou clique no overlay
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-modal]');
    if (btn) document.getElementById(btn.dataset.modal)?.classList.add('hidden');
    if (e.target.classList.contains('modal-overlay')) e.target.classList.add('hidden');
  });

  // Navegação por [data-goto] — legenda da pizza e bloco "fora de qualquer
  // limite". Delegado em document e registrado UMA vez: os cards são
  // reinjetados por innerHTML a cada render, e ligar o listener no elemento
  // duplicaria o handler a cada volta ao Dashboard.
  // Mora aqui, e não no módulo da aba, porque só app.js pode chamar switchTab
  // sem fechar o ciclo de import que o import() dinâmico existe para evitar.
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-goto]');
    if (el) _goto(el);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest?.('[data-goto][role="button"]');
    if (!el) return;
    e.preventDefault();
    _goto(el);
  });

  // Botões de empty-state que apenas reencaminham o clique para o botão real.
  // Delegação em document porque esses templates são reinjetados via innerHTML.
  document.addEventListener('click', e => {
    const proxy = e.target.closest('[data-proxy-click]');
    if (proxy) document.getElementById(proxy.dataset.proxyClick)?.click();
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    const { auth, signOut } = window._FB;
    await signOut(auth);
  });

  // Atalho: importar fatura no dashboard
  document.getElementById('btn-import-pdf-dash')?.addEventListener('click', () => {
    switchTab('gastos');
    setTimeout(() => document.getElementById('btn-import-pdf')?.click(), 200);
  });

  // Extrato
  document.getElementById('btn-novo-extrato')?.addEventListener('click', async () => {
    document.getElementById('modal-extrato').classList.remove('hidden');
    const { initExtratoModal } = await import('./extratos.js');
    initExtratoModal();
  });

  // Escape fecha modal. Era do bloco da command palette, que tinha prioridade
  // sobre os modais; sem ela, o Escape vai direto ao modal aberto.
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.modal-overlay:not(.hidden)')
      .forEach(m => m.classList.add('hidden'));
  });

  // ── Auth ──────────────────────────────────────────────────────
  try {
    await initAuth(async user => {
      if (user) {
        state.user = user;
        document.getElementById('login-screen')?.classList.add('hidden');
        document.getElementById('app')?.classList.remove('hidden');

        const firstName = user.displayName?.split(' ')[0] || 'Usuário';
        const initial   = (user.displayName?.[0] || '?').toUpperCase();

        document.getElementById('user-name')    && (document.getElementById('user-name').textContent    = firstName);
        document.getElementById('user-avatar')  && (document.getElementById('user-avatar').textContent  = initial);
        document.getElementById('sidebar-name') && (document.getElementById('sidebar-name').textContent = user.displayName || firstName);
        document.getElementById('sidebar-avatar')&& (document.getElementById('sidebar-avatar').textContent = initial);

        showKpiSkeleton();
        await loadAllData();
        atualizarBadgeExtratos();
        await switchTab('mes');
      } else {
        state.user = null;
        document.getElementById('login-screen')?.classList.remove('hidden');
        document.getElementById('app')?.classList.add('hidden');
      }
    });
  } catch (err) {
    console.error('Erro de autenticação:', err);
    toast(`Erro ao inicializar: ${err.message}`, 'error');
  }
});
