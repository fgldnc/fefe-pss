/**
 * app.js — Fluxo v2
 * Sem imports estáticos dos módulos de render para evitar circular dependency.
 * Usa dynamic import() dentro de switchTab().
 */

import { initAuth }    from './auth.js';
import { loadAllData } from './db.js';
import {
  state, thisMonth, monthLabel, offsetMonth,
  showKpiSkeleton, toast,
} from './utils.js';

// Re-exporta utils para quem ainda importa de app.js (compatibilidade)
export { state, thisMonth, monthLabel, offsetMonth, toast } from './utils.js';
export { esc, fmt, showKpiSkeleton, showTableSkeleton, renderInsights } from './utils.js';

// ─── NAVEGAÇÃO COM DYNAMIC IMPORT ──────────────────────────────
const TAB_MODULES = {
  dashboard:     () => import('./dashboard.js').then(m => m.renderDashboard),
  gastos:        () => import('./gastos.js').then(m => m.renderGastos),
  extratos:      () => import('./extratos.js').then(m => m.renderExtratos),
  receitas:      () => import('./receitas.js').then(m => m.renderReceitas),
  orcamento:     () => import('./orcamento.js').then(m => m.renderOrcamento),
  patrimonio:    () => import('./patrimonio.js').then(m => m.renderPatrimonio),
  metas:         () => import('./metas.js').then(m => m.renderMetas),
  configuracoes: () => import('./configuracoes.js').then(m => m.renderConfiguracoes),
};

export async function switchTab(name) {
  // Atualiza nav
  document.querySelectorAll('.nav-link').forEach(el =>
    el.classList.toggle('active', el.dataset.tab === name)
  );
  // Mostra/oculta seções
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('hidden',  el.id !== `tab-${name}`);
    el.classList.toggle('active',  el.id === `tab-${name}`);
  });

  // Carrega e chama o renderer
  const loader = TAB_MODULES[name];
  if (!loader) return;
  try {
    const render = await loader();
    if (typeof render === 'function') render();
  } catch (err) {
    console.error(`Erro ao carregar aba ${name}:`, err);
    toast(`Erro ao carregar ${name}.`, 'error');
  }
}

function updateMonthLabel() {
  const el = document.getElementById('month-label');
  if (el) el.textContent = monthLabel(state.currentMonth);
}

async function refreshCurrentTab() {
  const active = document.querySelector('.nav-link.active');
  if (!active) return;
  await loadAllData();
  await switchTab(active.dataset.tab);
}

// ─── COMMAND PALETTE ───────────────────────────────────────────
let cmdOpen = false;

function openCmd() {
  const overlay = document.getElementById('cmd-overlay');
  if (!overlay) return;
  overlay.classList.remove('hidden');
  const input = document.getElementById('cmd-input');
  if (input) { input.value = ''; input.focus(); }
  renderCmdResults('');
  cmdOpen = true;
}

function closeCmd() {
  document.getElementById('cmd-overlay')?.classList.add('hidden');
  cmdOpen = false;
}

function renderCmdResults(q) {
  const results = document.getElementById('cmd-results');
  if (!results) return;
  q = (q || '').toLowerCase().trim();

  const sections = [];

  // Navegação
  const navItems = [
    { icon: '📊', label: 'Dashboard',     tab: 'dashboard' },
    { icon: '💳', label: 'Gastos',        tab: 'gastos' },
    { icon: '🏦', label: 'Extratos',      tab: 'extratos' },
    { icon: '💰', label: 'Receitas',      tab: 'receitas' },
    { icon: '📋', label: 'Orçamento',     tab: 'orcamento' },
    { icon: '📈', label: 'Patrimônio',    tab: 'patrimonio' },
    { icon: '🎯', label: 'Metas',         tab: 'metas' },
    { icon: '⚙️',  label: 'Configurações', tab: 'configuracoes' },
  ].filter(n => !q || n.label.toLowerCase().includes(q));

  if (navItems.length) {
    sections.push('<div class="cmd-section-label">Navegar</div>');
    sections.push(navItems.map(n =>
      `<div class="cmd-item" data-tab="${n.tab}">
        <span class="cmd-item-icon">${n.icon}</span>
        <span class="cmd-item-label">${n.label}</span>
       </div>`
    ).join(''));
  }

  // Transações
  if (q.length >= 2) {
    const txs = state.transactions
      .filter(t => (t.description || '').toLowerCase().includes(q))
      .slice(0, 5);
    if (txs.length) {
      const { fmt } = /** @type {any} */ (window);
      sections.push('<div class="cmd-section-label">Transações</div>');
      sections.push(txs.map(t => {
        const val = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount || 0);
        return `<div class="cmd-item" data-tab="gastos">
          <span class="cmd-item-icon">💳</span>
          <span class="cmd-item-label">${(t.description || '').slice(0,40)}</span>
          <span class="cmd-item-sub">${val}</span>
         </div>`;
      }).join(''));
    }

    // Metas
    const goals = state.goals.filter(g => (g.name || '').toLowerCase().includes(q)).slice(0, 3);
    if (goals.length) {
      sections.push('<div class="cmd-section-label">Metas</div>');
      sections.push(goals.map(g =>
        `<div class="cmd-item" data-tab="metas">
          <span class="cmd-item-icon">🎯</span>
          <span class="cmd-item-label">${g.name || ''}</span>
         </div>`
      ).join(''));
    }
  }

  if (!sections.length) {
    results.innerHTML = `<div class="cmd-empty">Sem resultados para "${q}"</div>`;
    return;
  }
  results.innerHTML = sections.join('');
  results.querySelectorAll('.cmd-item[data-tab]').forEach(item => {
    item.addEventListener('click', () => { switchTab(item.dataset.tab); closeCmd(); });
  });
}

// ─── ONBOARDING ────────────────────────────────────────────────
const OB_STEPS = [
  { title: '👋 Bem-vindo ao Fluxo!', sub: 'Seu controle financeiro pessoal. Vamos configurar rapidinho.', content: '' },
  {
    title: '🏦 Qual é seu banco principal?', sub: 'Ajuda a reconhecer seus extratos automaticamente.',
    content: `<div class="bank-selector" style="grid-template-columns:repeat(3,1fr)">
      <div class="bank-card ob-bank" data-val="itau"><div class="bank-card-logo">🟠</div><div class="bank-card-name">Itaú</div></div>
      <div class="bank-card ob-bank" data-val="nubank"><div class="bank-card-logo">🟣</div><div class="bank-card-name">Nubank</div></div>
      <div class="bank-card ob-bank" data-val="inter"><div class="bank-card-logo">🟢</div><div class="bank-card-name">Inter</div></div>
      <div class="bank-card ob-bank" data-val="santander"><div class="bank-card-logo">🔴</div><div class="bank-card-name">Santander</div></div>
      <div class="bank-card ob-bank" data-val="bradesco"><div class="bank-card-logo">🔵</div><div class="bank-card-name">Bradesco</div></div>
      <div class="bank-card ob-bank" data-val="outro"><div class="bank-card-logo">🏦</div><div class="bank-card-name">Outro</div></div>
    </div>`,
  },
  {
    title: '💰 Qual é seu salário mensal?', sub: 'Usado para calcular sua taxa de poupança.',
    content: `<div class="form-row">
      <label class="form-label">Salário líquido (R$)</label>
      <input type="number" id="ob-salary" class="form-input" placeholder="Ex: 5000" step="100" min="0" />
    </div>`,
  },
  {
    title: '🎯 Crie sua primeira meta', sub: 'Um objetivo financeiro aumenta a motivação.',
    content: `<div style="display:flex;flex-direction:column;gap:0.75rem">
      <div class="form-row"><label class="form-label">Nome da meta</label><input type="text" id="ob-meta-nome" class="form-input" placeholder="Ex: Reserva de emergência" /></div>
      <div class="form-row"><label class="form-label">Valor alvo (R$)</label><input type="number" id="ob-meta-valor" class="form-input" placeholder="Ex: 20000" /></div>
    </div>`,
  },
];

let obStep = 0;
const obData = {};

function renderObStep() {
  const step = OB_STEPS[obStep];
  if (!step) return;
  document.getElementById('onboarding-content').innerHTML = `
    <div class="onboarding-title">${step.title}</div>
    <div class="onboarding-sub">${step.sub}</div>
    ${step.content ? `<div style="margin-top:1.25rem">${step.content}</div>` : ''}`;
  document.getElementById('onboarding-dots').innerHTML =
    OB_STEPS.map((_, i) =>
      `<div class="onboarding-dot ${i === obStep ? 'active' : ''}"></div>`
    ).join('');
  document.querySelectorAll('.ob-bank').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.ob-bank').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      obData.bank = card.dataset.val;
    });
  });
  document.getElementById('btn-onboarding-next').textContent =
    obStep === OB_STEPS.length - 1 ? 'Começar →' : 'Próximo →';
}

async function finishOnboarding() {
  const salary = parseFloat(document.getElementById('ob-salary')?.value || '0');
  if (salary > 0) {
    const { saveIncome } = await import('./db.js');
    await saveIncome({
      type: 'salario', description: 'Salário', amount: salary,
      date: new Date().toISOString().slice(0, 10), month: state.currentMonth,
    });
  }
  const metaNome  = document.getElementById('ob-meta-nome')?.value?.trim();
  const metaValor = parseFloat(document.getElementById('ob-meta-valor')?.value || '0');
  if (metaNome && metaValor > 0) {
    const { saveGoal } = await import('./db.js');
    await saveGoal({ name: metaNome, type: 'outro', targetAmount: metaValor, currentAmount: 0, deadline: '', contributions: [] });
  }
  document.getElementById('onboarding-overlay').classList.add('hidden');
  localStorage.setItem('fluxo_onboarding_done', '1');
  await loadAllData();
  switchTab('dashboard');
  toast('Tudo pronto! Bem-vindo ao Fluxo.', 'success');
}

// ─── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  state.currentMonth = thisMonth();
  updateMonthLabel();

  // Navegação por mês
  document.getElementById('btn-prev-month')?.addEventListener('click', async () => {
    state.currentMonth = offsetMonth(state.currentMonth, -1);
    updateMonthLabel();
    await refreshCurrentTab();
  });
  document.getElementById('btn-next-month')?.addEventListener('click', async () => {
    state.currentMonth = offsetMonth(state.currentMonth, 1);
    updateMonthLabel();
    await refreshCurrentTab();
  });

  // Clique nas abas da sidebar
  document.querySelectorAll('.nav-link[data-tab]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      switchTab(link.dataset.tab);
      document.getElementById('sidebar')?.classList.remove('open');
      document.querySelector('.sidebar-overlay')?.classList.remove('active');
    });
  });

  // Menu mobile
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('btn-menu-toggle');
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);
  menuBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
    overlay.classList.toggle('active');
  });
  overlay.addEventListener('click', () => {
    sidebar?.classList.remove('open');
    overlay.classList.remove('active');
  });

  // Fecha modais via [data-modal] ou clique no overlay
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-modal]');
    if (btn) document.getElementById(btn.dataset.modal)?.classList.add('hidden');
    if (e.target.classList.contains('modal-overlay')) e.target.classList.add('hidden');
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

  // Command Palette
  document.getElementById('btn-search')?.addEventListener('click', openCmd);
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); cmdOpen ? closeCmd() : openCmd(); }
    if (e.key === 'Escape' && cmdOpen) closeCmd();
  });
  document.getElementById('cmd-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'cmd-overlay') closeCmd();
  });
  document.getElementById('cmd-input')?.addEventListener('input', e => renderCmdResults(e.target.value));

  // Onboarding
  document.getElementById('btn-onboarding-skip')?.addEventListener('click', () => {
    document.getElementById('onboarding-overlay').classList.add('hidden');
    localStorage.setItem('fluxo_onboarding_done', '1');
  });
  document.getElementById('btn-onboarding-next')?.addEventListener('click', async () => {
    if (obStep < OB_STEPS.length - 1) { obStep++; renderObStep(); }
    else await finishOnboarding();
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
        await switchTab('dashboard');

        if (!localStorage.getItem('fluxo_onboarding_done') && state.transactions.length === 0) {
          setTimeout(() => {
            obStep = 0;
            document.getElementById('onboarding-overlay')?.classList.remove('hidden');
            renderObStep();
          }, 700);
        }
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
