/**
 * app.js — Fluxo v2
 * Sem imports estáticos dos módulos de render para evitar circular dependency.
 * Usa dynamic import() dentro de switchTab().
 */

import { initAuth }    from './auth.js';
import { loadAllData } from './db.js';
import {
  state, thisMonth, monthLabel, offsetMonth,
  showKpiSkeleton, toast, esc,
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
  // Rodada 6: as DUAS portas de entrada viraram UMA tela com duas abas
  // explícitas. A fatura em PDF entrava por um botão dentro de Mês; o extrato,
  // por aqui. `js/importar.js` monta a seção, e `extratos.js`/`pdf-import.js`
  // viraram camada de parse + revisão + gravação, como `gastos.js` na rodada 3.
  importar: [
    { secao: 'importar', mod: () => import('./importar.js').then(m => m.renderImportar) },
  ],
  // Rodada 7: o destino que faltava. `js/conferir.js` é DERIVADO do `state` —
  // nenhum campo novo no Firestore —, e é item fixo da barra: vazio é o estado
  // normal dele, e a tela sabe explicar o próprio vazio.
  conferir: [
    { secao: 'conferir', mod: () => import('./conferir.js').then(m => m.renderConferir) },
  ],
  // Rodada 3: as quatro telas empilhadas viraram UMA. `js/mes.js` monta a
  // seção inteira; `gastos.js` e `receitas.js` continuam vivos como camada de
  // formulário e gravação, chamados de lá.
  mes: [
    { secao: 'mes', mod: () => import('./mes.js').then(m => m.renderMes) },
  ],
  // Pedido da usuária depois da rodada 4: parcelamento saiu de Adiante e
  // virou destino próprio. Adiante é o caixa do MÊS; um parcelamento
  // atravessa meses e é assunto do cartão.
  cartao: [
    { secao: 'cartao', mod: () => import('./cartao.js').then(m => m.renderCartao) },
  ],
  // Rodada 4: a aba Fluxo de Caixa virou UMA tela com os quatro blocos que
  // são sobre caixa. `saldos.js` virou só cálculo.
  adiante: [
    { secao: 'adiante', mod: () => import('./adiante.js').then(m => m.renderAdiante) },
  ],
  // Rodada 5: as duas telas empilhadas viraram UMA. `js/guardado.js` monta a
  // seção; `metas.js` e `patrimonio.js` continuam vivos como camada de
  // formulário e gravação, chamados de lá.
  guardado: [
    { secao: 'guardado', mod: () => import('./guardado.js').then(m => m.renderGuardado) },
  ],
  // Rodada 8, a última: as TRÊS seções empilhadas viraram UMA. `js/ajustes.js`
  // monta a seção inteira; `orcamento.js` continua vivo como editor + gravação,
  // chamado de lá, e `configuracoes.js` foi absorvido e apagado. Relatórios foi
  // apagado de vez (decisão da usuária): seis relatórios fixos para uma pessoa
  // só, e cada tabela do app já exporta o próprio CSV.
  // Com isto NENHUM destino empilha mais de uma seção — o estado intermediário
  // das rodadas 2 a 7 acabou.
  ajustes: [
    { secao: 'ajustes', mod: () => import('./ajustes.js').then(m => m.renderAjustes) },
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
  calendario: 'adiante',
  // A Timeline morreu na rodada 4 e o que sobrou dela — contratos em aberto —
  // está hoje em Cartão, não em Adiante.
  timeline: 'cartao',
  metas: 'guardado', patrimonio: 'guardado',
  // `relatorios` continua aqui de propósito, apontando para Ajustes: a tela
  // morreu na rodada 8, mas um `data-goto="relatorios"` esquecido em algum card
  // antigo tem de levar a algum lugar em vez de não fazer nada.
  orcamento: 'ajustes', configuracoes: 'ajustes', relatorios: 'ajustes',
};

/**
 * Onde parar dentro do destino. Depois da rodada 3 o id antigo já não é o id
 * de uma seção — `gastos` virou um bloco dentro de `#tab-mes` —, então o
 * apelido também precisa dizer a QUE elemento rolar.
 */
const ANCORAS = {
  dashboard: 'mes-heroi', gastos: 'mes-tabela', receitas: 'mes-tabela',
  orcamento: 'ajustes-orcamento', configuracoes: 'ajustes-categorias',
  calendario: 'adiante-curva', timeline: 'cartao-contratos',
  // Rodada 5: `metas` e `patrimonio` deixaram de ser seção e viraram bloco
  // dentro de Guardado — o apelido precisa dizer a que bloco rolar.
  metas: 'guardado-metas', patrimonio: 'guardado-ativos',
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

  // O selo de Conferir é recontado a cada navegação, e não só no login e na
  // virada de mês: uma categoria escolhida no modal de Mês resolve uma
  // pendência, e um selo que só se atualiza em dois momentos passa o resto do
  // tempo mentindo. A conta é uma travessia do `state` em memória — barata o
  // bastante para não valer o risco de ficar velha.
  await atualizarBadgeConferir();
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
    // `scrollIntoView` NÃO serve aqui, e isso foi medido na rodada 8: o
    // `overflow-x: hidden` do `body` (o que corta o estouro horizontal) faz o
    // computed dele virar `hidden auto`, então o body é um contêiner de
    // rolagem — que nunca rola, porque quem rola é o documento. O
    // `scrollIntoView` resolve contra esse scrollport mais próximo e a página
    // fica parada: todo `data-goto` com âncora levava ao destino certo e ao
    // TOPO dele, não ao bloco pedido. Mesma família da armadilha do `<thead>`
    // sticky. Rolar o documento na mão, com a folga da topbar sticky (o
    // `scroll-margin-top` das folhas é para o mesmo fim e também não valia).
    const folga = parseFloat(getComputedStyle(alvo).scrollMarginTop) || 84;
    window.scrollTo({ top: Math.max(0, alvo.getBoundingClientRect().top + window.scrollY - folga), behavior: 'smooth' });
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
 * Contador de pendência ao lado de "Conferir".
 *
 * Na rodada 7 ele saiu de Importar e a conta saiu daqui: quem conta é
 * `contarPendencias()` em `js/conferir.js`, a MESMA travessia que desenha as
 * três listas. Contador que discorda da tela é pior que contador nenhum, e
 * quando a conta vivia em dois arquivos era só questão de tempo.
 *
 * A conta olha a BASE INTEIRA, não o mês do topo — ver o cabeçalho de
 * `conferir.js`. Import dinâmico pelo mesmo motivo dos destinos: `app.js` não
 * importa módulo de aba estaticamente.
 */
async function atualizarBadgeConferir() {
  const el = document.getElementById('nav-badge-conferir');
  if (!el) return;
  let n = 0;
  try {
    const { contarPendencias } = await import('./conferir.js');
    n = contarPendencias();
  } catch (err) {
    console.warn('Não foi possível contar pendências:', err);
    return; // sem número, o selo fica como está em vez de mentir "0"
  }
  el.textContent = n;
  // `hidden` em vez de classe: zero pendência é silêncio, e silêncio é o sinal
  // de que está tudo bem — um "0" âmbar na sidebar seria alarme de nada.
  el.hidden = n === 0;
  el.title = n === 1 ? '1 coisa para conferir' : `${n} coisas para conferir`;
}

async function rerenderCurrentTab() {
  const active = document.querySelector('.nav-link.active');
  if (!active) return;
  await atualizarBadgeConferir();
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

  // `data-proxy-click` saiu na rodada 6: ele existia para o botão do estado
  // vazio de Extratos reencaminhar o clique ao "Importar Extrato" da topbar da
  // aba. Os dois sumiram — a tela "Importar" É a drop zone, e não há mais um
  // botão do qual um segundo botão precise ser eco. Sem nenhum uso no HTML, o
  // listener era um `closest` em todo clique do app para nada.

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    const { auth, signOut } = window._FB;
    await signOut(auth);
  });

  // Os dois atalhos que abriam os modais de importação saíram na rodada 6:
  // `btn-import-pdf-dash` levava a Mês e clicava no botão da fatura, e
  // `btn-novo-extrato` abria o modal do extrato no passo 1. As duas portas
  // agora são a tela "Importar", e o passo 1 dos modais deixou de ser o
  // caminho: o arquivo entra pela tela e o modal abre já na revisão.

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
        // Conferir redesenha a si e pede o selo de volta depois de cada
        // correção: é o único ponto que sabe que a conta mudou.
        const { initConferir } = await import('./conferir.js');
        initConferir(atualizarBadgeConferir);
        await atualizarBadgeConferir();
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
