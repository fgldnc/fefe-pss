/**
 * app.js — Fluxo v2
 * Inicialização, roteamento, toast, command palette, onboarding, skeleton
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
  extratoTransactions: [], // transações de extrato bancário
  importRules: [],         // regras de categorização automática
};

// ─── IMPORTS ───────────────────────────────────────────────────
import { initAuth, getUid }       from './auth.js';
import { loadAllData }             from './db.js';
import { renderDashboard }         from './dashboard.js';
import { renderGastos }            from './gastos.js';
import { renderReceitas }          from './receitas.js';
import { renderOrcamento }         from './orcamento.js';
import { renderPatrimonio }        from './patrimonio.js';
import { renderMetas }             from './metas.js';
import { renderConfiguracoes }     from './configuracoes.js';
import { renderExtratos }          from './extratos.js';

// ─── UTILITÁRIOS ───────────────────────────────────────────────

/** Escapa HTML para prevenir XSS */
export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g, '&#x2F;');
}

/** Formata BRL */
export function fmt(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

/** Mês atual "YYYY-MM" */
export function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Rótulo do mês */
export function monthLabel(ym) {
  const [y, m] = ym.split('-');
  const names = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${names[parseInt(m, 10) - 1]} ${y}`;
}

/** Avança/recua mês */
export function offsetMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════
// TOAST SYSTEM
// ═══════════════════════════════════════════════════════════════
const TOAST_ICONS = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    '◈',
};

export function toast(msg, type = 'info', title = '', duration = 4000) {
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
  return el;
}

function removeToast(el) {
  if (!el.parentNode) return;
  el.classList.add('hiding');
  setTimeout(() => el.parentNode?.removeChild(el), 250);
}

// ═══════════════════════════════════════════════════════════════
// SKELETON HELPERS
// ═══════════════════════════════════════════════════════════════
export function showKpiSkeleton() {
  const grid = document.getElementById('kpi-grid');
  if (!grid) return;
  grid.innerHTML = Array(4).fill(`
    <div class="kpi-skeleton">
      <div class="skeleton sk-title" style="width:55%"></div>
      <div class="skeleton sk-value" style="margin-top:8px"></div>
      <div class="skeleton sk-text" style="width:50%;margin-top:8px"></div>
    </div>`).join('');
}

export function showTableSkeleton(tbodyId, cols = 6) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = Array(5).fill(`
    <tr>${Array(cols).fill(`<td><div class="skeleton sk-text"></div></td>`).join('')}</tr>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
// COMMAND PALETTE
// ═══════════════════════════════════════════════════════════════
let cmdOpen = false;
let cmdSelected = 0;

function openCommandPalette() {
  document.getElementById('cmd-overlay').classList.remove('hidden');
  document.getElementById('cmd-input').value = '';
  document.getElementById('cmd-input').focus();
  renderCmdResults('');
  cmdOpen = true;
}

function closeCommandPalette() {
  document.getElementById('cmd-overlay').classList.add('hidden');
  cmdOpen = false;
}

function renderCmdResults(query) {
  const q = query.toLowerCase().trim();
  const results = document.getElementById('cmd-results');

  const sections = [];

  // Navegação rápida
  const navItems = [
    { icon: '📊', label: 'Dashboard',    tab: 'dashboard' },
    { icon: '💳', label: 'Gastos',       tab: 'gastos' },
    { icon: '🏦', label: 'Extratos',     tab: 'extratos' },
    { icon: '💰', label: 'Receitas',     tab: 'receitas' },
    { icon: '📈', label: 'Patrimônio',   tab: 'patrimonio' },
    { icon: '🎯', label: 'Metas',        tab: 'metas' },
    { icon: '⚙️',  label: 'Configurações',tab: 'configuracoes' },
  ].filter(n => !q || n.label.toLowerCase().includes(q));

  if (navItems.length) {
    sections.push(`<div class="cmd-section-label">Navegar</div>`);
    sections.push(navItems.map(n =>
      `<div class="cmd-item" data-action="tab" data-tab="${esc(n.tab)}">
        <span class="cmd-item-icon">${esc(n.icon)}</span>
        <span class="cmd-item-label">${esc(n.label)}</span>
       </div>`
    ).join(''));
  }

  // Transações
  if (q.length >= 2) {
    const txMatches = state.transactions
      .filter(t => (t.description || '').toLowerCase().includes(q))
      .slice(0, 5);

    if (txMatches.length) {
      sections.push(`<div class="cmd-section-label">Transações</div>`);
      sections.push(txMatches.map(t =>
        `<div class="cmd-item" data-action="tab" data-tab="gastos">
          <span class="cmd-item-icon">💳</span>
          <span class="cmd-item-label">${esc(t.description)}</span>
          <span class="cmd-item-sub">${esc(fmt(t.amount))}</span>
         </div>`
      ).join(''));
    }

    // Metas
    const goalMatches = state.goals.filter(g => g.name?.toLowerCase().includes(q)).slice(0, 3);
    if (goalMatches.length) {
      sections.push(`<div class="cmd-section-label">Metas</div>`);
      sections.push(goalMatches.map(g =>
        `<div class="cmd-item" data-action="tab" data-tab="metas">
          <span class="cmd-item-icon">🎯</span>
          <span class="cmd-item-label">${esc(g.name)}</span>
         </div>`
      ).join(''));
    }
  }

  if (!sections.length) {
    results.innerHTML = `<div class="cmd-empty">Nenhum resultado para "${esc(query)}"</div>`;
    return;
  }

  results.innerHTML = sections.join('');

  // Eventos nos itens
  results.querySelectorAll('.cmd-item[data-action="tab"]').forEach(item => {
    item.addEventListener('click', () => {
      switchTab(item.dataset.tab);
      closeCommandPalette();
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// INSIGHTS AUTOMÁTICOS
// ═══════════════════════════════════════════════════════════════
export function renderInsights() {
  const strip = document.getElementById('insights-strip');
  if (!strip) return;

  const month = state.currentMonth;
  const prevMonth = offsetMonth(month, -1);

  const investIds = state.categories
    .filter(c => (c.id + c.name).toLowerCase().includes('investiment'))
    .map(c => c.id);

  const txs     = state.transactions.filter(t => t.competenceMonth === month && !investIds.includes(t.categoryId));
  const txsPrev = state.transactions.filter(t => t.competenceMonth === prevMonth && !investIds.includes(t.categoryId));

  const totalNow  = txs.reduce((s, t) => s + (t.amount || 0), 0);
  const totalPrev = txsPrev.reduce((s, t) => s + (t.amount || 0), 0);

  const chips = [];

  // Comparação com mês anterior
  if (totalPrev > 0 && totalNow > 0) {
    const delta = ((totalNow - totalPrev) / totalPrev) * 100;
    if (Math.abs(delta) > 5) {
      chips.push({
        type: delta > 0 ? 'warn' : 'good',
        icon: delta > 0 ? '📈' : '📉',
        text: `Gastos ${delta > 0 ? '+' : ''}${delta.toFixed(0)}% vs mês anterior`,
      });
    }
  }

  // Categoria mais cara
  const catTotals = {};
  for (const tx of txs) {
    catTotals[tx.categoryId] = (catTotals[tx.categoryId] || 0) + (tx.amount || 0);
  }
  const topEntry = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];
  if (topEntry) {
    const cat = state.categories.find(c => c.id === topEntry[0]);
    if (cat) {
      chips.push({ type: 'info', icon: '💡', text: `${esc(cat.name)} é sua maior categoria: ${fmt(topEntry[1])}` });
    }
  }

  // Orçamento
  const budgets = state.budgets[month] || {};
  for (const [catId, limit] of Object.entries(budgets)) {
    if (limit <= 0) continue;
    const spent = catTotals[catId] || 0;
    const pct   = (spent / limit) * 100;
    const cat   = state.categories.find(c => c.id === catId);
    if (pct >= 90 && cat) {
      chips.push({ type: 'warn', icon: '⚠️', text: `Orçamento de ${esc(cat.name)} ${pct >= 100 ? 'ultrapassado' : 'quase no limite'}` });
    }
  }

  // Parcelas futuras
  const nextMonth = offsetMonth(month, 1);
  const parcelas  = state.transactions.filter(t => t.competenceMonth === nextMonth && t.installmentTotal > 1);
  const totalParc = parcelas.reduce((s, t) => s + (t.amount || 0), 0);
  if (totalParc > 0) {
    chips.push({ type: 'info', icon: '📅', text: `${fmt(totalParc)} em parcelas no próximo mês` });
  }

  if (!chips.length) {
    strip.innerHTML = `<div class="insight-chip info"><span>✨</span> Tudo em ordem por aqui!</div>`;
    return;
  }

  strip.innerHTML = chips.map(c =>
    `<div class="insight-chip ${esc(c.type)}"><span>${esc(c.icon)}</span>${esc(c.text)}</div>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
// ONBOARDING
// ═══════════════════════════════════════════════════════════════
const ONBOARDING_STEPS = [
  {
    title: '👋 Bem-vindo ao Fluxo!',
    sub: 'Seu controle financeiro pessoal. Vamos configurar rapidinho para você começar com tudo.',
    content: '',
  },
  {
    title: '🏦 Qual é seu banco principal?',
    sub: 'Isso nos ajuda a reconhecer seus extratos automaticamente.',
    content: `<div class="bank-selector" style="grid-template-columns:repeat(3,1fr)">
      <div class="bank-card" data-ob="bank" data-val="itau"><div class="bank-card-logo">🟠</div><div class="bank-card-name">Itaú</div></div>
      <div class="bank-card" data-ob="bank" data-val="nubank"><div class="bank-card-logo">🟣</div><div class="bank-card-name">Nubank</div></div>
      <div class="bank-card" data-ob="bank" data-val="inter"><div class="bank-card-logo">🟢</div><div class="bank-card-name">Inter</div></div>
      <div class="bank-card" data-ob="bank" data-val="santander"><div class="bank-card-logo">🔴</div><div class="bank-card-name">Santander</div></div>
      <div class="bank-card" data-ob="bank" data-val="bradesco"><div class="bank-card-logo">🔵</div><div class="bank-card-name">Bradesco</div></div>
      <div class="bank-card" data-ob="bank" data-val="outro"><div class="bank-card-logo">🏦</div><div class="bank-card-name">Outro</div></div>
    </div>`,
  },
  {
    title: '💰 Qual é seu salário mensal?',
    sub: 'Usado para calcular sua taxa de poupança. Você pode ajustar depois.',
    content: `<div class="form-row">
      <label class="form-label">Salário líquido (R$)</label>
      <input type="number" id="ob-salary" class="form-input" placeholder="Ex: 5000" step="100" min="0" />
    </div>`,
  },
  {
    title: '🎯 Crie sua primeira meta',
    sub: 'Ter um objetivo financeiro aumenta muito a motivação.',
    content: `<div style="display:flex;flex-direction:column;gap:0.75rem">
      <div class="form-row"><label class="form-label">Nome da meta</label><input type="text" id="ob-meta-nome" class="form-input" placeholder="Ex: Reserva de emergência" /></div>
      <div class="form-row"><label class="form-label">Valor alvo (R$)</label><input type="number" id="ob-meta-valor" class="form-input" placeholder="Ex: 20000" /></div>
    </div>`,
  },
];

let obStep = 0;
const obData = {};

function showOnboarding() {
  const overlay = document.getElementById('onboarding-overlay');
  overlay.classList.remove('hidden');
  renderOnboardingStep();
}

function renderOnboardingStep() {
  const step = ONBOARDING_STEPS[obStep];
  document.getElementById('onboarding-content').innerHTML = `
    <div class="onboarding-title">${step.title}</div>
    <div class="onboarding-sub">${step.sub}</div>
    ${step.content ? `<div style="margin-top:1.25rem">${step.content}</div>` : ''}`;

  // Dots
  document.getElementById('onboarding-dots').innerHTML =
    ONBOARDING_STEPS.map((_, i) =>
      `<div class="onboarding-dot ${i === obStep ? 'active' : ''}"></div>`
    ).join('');

  // Banco selector inside onboarding
  document.querySelectorAll('[data-ob="bank"]').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('[data-ob="bank"]').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      obData.bank = card.dataset.val;
    });
  });

  // Last step
  const btnNext = document.getElementById('btn-onboarding-next');
  btnNext.textContent = obStep === ONBOARDING_STEPS.length - 1 ? 'Começar →' : 'Próximo →';
}

async function finishOnboarding() {
  // Salva salário como receita do mês
  const salary = parseFloat(document.getElementById('ob-salary')?.value);
  if (salary > 0) {
    const { saveIncome } = await import('./db.js');
    await saveIncome({
      type: 'salario', description: 'Salário', amount: salary,
      date: new Date().toISOString().slice(0, 10), month: state.currentMonth,
    });
  }

  // Salva meta
  const metaNome  = document.getElementById('ob-meta-nome')?.value?.trim();
  const metaValor = parseFloat(document.getElementById('ob-meta-valor')?.value);
  if (metaNome && metaValor > 0) {
    const { saveGoal } = await import('./db.js');
    await saveGoal({ name: metaNome, type: 'outro', targetAmount: metaValor, currentAmount: 0, deadline: '', contributions: [] });
  }

  document.getElementById('onboarding-overlay').classList.add('hidden');
  localStorage.setItem('fluxo_onboarding_done', '1');
  await loadAllData();
  renderDashboard();
  toast('Tudo pronto! Bem-vindo ao Fluxo.', 'success');
}

// ═══════════════════════════════════════════════════════════════
// NAVEGAÇÃO
// ═══════════════════════════════════════════════════════════════
const TAB_RENDERERS = {
  dashboard:     renderDashboard,
  gastos:        renderGastos,
  extratos:      renderExtratos,
  receitas:      renderReceitas,
  orcamento:     renderOrcamento,
  patrimonio:    renderPatrimonio,
  metas:         renderMetas,
  configuracoes: renderConfiguracoes,
};

export function switchTab(name) {
  document.querySelectorAll('.nav-link').forEach(el =>
    el.classList.toggle('active', el.dataset.tab === name)
  );
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('hidden',  el.id !== `tab-${name}`);
    el.classList.toggle('active',  el.id === `tab-${name}`);
  });
  const render = TAB_RENDERERS[name];
  if (render) render();
}

function updateMonthLabel() {
  document.getElementById('month-label').textContent = monthLabel(state.currentMonth);
}

async function refreshCurrentTab() {
  const activeLink = document.querySelector('.nav-link.active');
  if (!activeLink) return;
  await loadAllData();
  const render = TAB_RENDERERS[activeLink.dataset.tab];
  if (render) render();
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  state.currentMonth = thisMonth();
  updateMonthLabel();

  // Navegação por mês
  document.getElementById('btn-prev-month').addEventListener('click', async () => {
    state.currentMonth = offsetMonth(state.currentMonth, -1);
    updateMonthLabel();
    await refreshCurrentTab();
  });
  document.getElementById('btn-next-month').addEventListener('click', async () => {
    state.currentMonth = offsetMonth(state.currentMonth, 1);
    updateMonthLabel();
    await refreshCurrentTab();
  });

  // Abas
  document.querySelectorAll('.nav-link[data-tab]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      switchTab(link.dataset.tab);
      document.getElementById('sidebar').classList.remove('open');
      document.querySelector('.sidebar-overlay')?.classList.remove('active');
    });
  });

  // Menu mobile
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('btn-menu-toggle');
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);
  menuBtn.addEventListener('click', () => { sidebar.classList.toggle('open'); overlay.classList.toggle('active'); });
  overlay.addEventListener('click', () => { sidebar.classList.remove('open'); overlay.classList.remove('active'); });

  // Fecha modais
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-modal]');
    if (btn) document.getElementById(btn.dataset.modal)?.classList.add('hidden');
    if (e.target.classList.contains('modal-overlay')) e.target.classList.add('hidden');
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    const { auth, signOut } = window._FB;
    await signOut(auth);
  });

  // Importar fatura no dashboard
  document.getElementById('btn-import-pdf-dash')?.addEventListener('click', () => {
    switchTab('gastos');
    setTimeout(() => document.getElementById('btn-import-pdf')?.click(), 100);
  });

  // Importar extrato
  document.getElementById('btn-novo-extrato')?.addEventListener('click', () => {
    document.getElementById('modal-extrato').classList.remove('hidden');
    import('./extratos.js').then(m => m.initExtratoModal?.());
  });

  // ── Command Palette ──
  document.getElementById('btn-search')?.addEventListener('click', openCommandPalette);

  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      cmdOpen ? closeCommandPalette() : openCommandPalette();
    }
    if (e.key === 'Escape' && cmdOpen) closeCommandPalette();
  });

  document.getElementById('cmd-overlay')?.addEventListener('click', e => {
    if (e.target.id === 'cmd-overlay') closeCommandPalette();
  });

  document.getElementById('cmd-input')?.addEventListener('input', e => {
    renderCmdResults(e.target.value);
  });

  // ── Onboarding ──
  document.getElementById('btn-onboarding-skip')?.addEventListener('click', () => {
    document.getElementById('onboarding-overlay').classList.add('hidden');
    localStorage.setItem('fluxo_onboarding_done', '1');
  });

  document.getElementById('btn-onboarding-next')?.addEventListener('click', async () => {
    if (obStep < ONBOARDING_STEPS.length - 1) {
      obStep++;
      renderOnboardingStep();
    } else {
      await finishOnboarding();
    }
  });

  // ── Auth ──
  await initAuth(async user => {
    if (user) {
      state.user = user;
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');

      const firstName = user.displayName?.split(' ')[0] || 'Usuário';
      const initial   = (user.displayName?.[0] || '?').toUpperCase();

      document.getElementById('user-name').textContent  = firstName;
      document.getElementById('user-avatar').textContent = initial;
      document.getElementById('sidebar-name').textContent = user.displayName || firstName;
      document.getElementById('sidebar-avatar').textContent = initial;

      showKpiSkeleton();
      await loadAllData();
      switchTab('dashboard');

      // Onboarding no primeiro acesso
      if (!localStorage.getItem('fluxo_onboarding_done') && state.transactions.length === 0) {
        setTimeout(showOnboarding, 600);
      }
    } else {
      state.user = null;
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('app').classList.add('hidden');
    }
  });
});
