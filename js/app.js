/**
 * app.js — Inicialização principal, roteamento e estado global
 */

// ─── ESTADO GLOBAL ─────────────────────────────────────────────────────────
export const state = {
  user: null,
  currentMonth: '',  // formato: "2025-04"
  categories: [],
  transactions: [],
  incomes: [],
  budgets: {},
  assets: [],
  goals: [],
};

// ─── IMPORTAÇÕES ───────────────────────────────────────────────────────────
import { initAuth, getUid }    from './auth.js';
import { loadAllData }          from './db.js';
import { renderDashboard }      from './dashboard.js';
import { renderGastos }         from './gastos.js';
import { renderReceitas }       from './receitas.js';
import { renderPatrimonio }     from './patrimonio.js';
import { renderMetas }          from './metas.js';
import { renderConfiguracoes }  from './configuracoes.js';

// ─── UTILITÁRIOS GLOBAIS ───────────────────────────────────────────────────

/** Escapa caracteres HTML para prevenir XSS em innerHTML */
export function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/** Formata número como moeda BRL */
export function fmt(val) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}

/** Retorna "YYYY-MM" do mês atual */
export function thisMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Rótulo legível do mês: "Abril 2025" */
export function monthLabel(ym) {
  const [y, m] = ym.split('-');
  const names = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  return `${names[parseInt(m,10)-1]} ${y}`;
}

/** Avança ou recua um mês */
export function offsetMonth(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Exibe toast de notificação */
export function toast(msg, type = 'default') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type}`;
  el.classList.remove('hidden');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.add('hidden'), 3000);
}

// ─── NAVEGAÇÃO ENTRE ABAS ──────────────────────────────────────────────────
const TAB_RENDERERS = {
  dashboard:      renderDashboard,
  gastos:         renderGastos,
  receitas:       renderReceitas,
  patrimonio:     renderPatrimonio,
  metas:          renderMetas,
  configuracoes:  renderConfiguracoes,
};

export function switchTab(name) {
  // Atualiza links
  document.querySelectorAll('.nav-link').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === name);
  });
  // Mostra/oculta seções
  document.querySelectorAll('.tab-content').forEach(el => {
    el.classList.toggle('hidden', el.id !== `tab-${name}`);
    el.classList.toggle('active', el.id === `tab-${name}`);
  });
  // Renderiza aba
  const render = TAB_RENDERERS[name];
  if (render) render();
}

// ─── NAVEGAÇÃO DE MÊS ──────────────────────────────────────────────────────
function updateMonthLabel() {
  document.getElementById('month-label').textContent = monthLabel(state.currentMonth);
}

async function refreshCurrentTab() {
  const activeLink = document.querySelector('.nav-link.active');
  if (activeLink) {
    const tab = activeLink.dataset.tab;
    await loadAllData();
    const render = TAB_RENDERERS[tab];
    if (render) render();
  }
}

// ─── INIT ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Mês inicial
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

  // Navegação por abas (sidebar)
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', async (e) => {
      e.preventDefault();
      const tab = link.dataset.tab;
      if (!tab) return;
      switchTab(tab);
      // Fecha sidebar mobile
      document.getElementById('sidebar').classList.remove('open');
      document.querySelector('.sidebar-overlay')?.classList.remove('active');
    });
  });

  // Menu mobile
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('btn-menu-toggle');

  // Cria overlay de sidebar
  const overlay = document.createElement('div');
  overlay.className = 'sidebar-overlay';
  document.body.appendChild(overlay);

  menuBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
    overlay.classList.toggle('active');
  });
  overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  });

  // Fecha modais pelo botão X ou "Cancelar"
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-modal]');
    if (btn) {
      document.getElementById(btn.dataset.modal)?.classList.add('hidden');
    }
    // Fecha clicando fora do modal
    if (e.target.classList.contains('modal-overlay')) {
      e.target.classList.add('hidden');
    }
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    const { auth, signOut } = window._FB;
    await signOut(auth);
  });

  // Inicializa autenticação — quando logado, carrega dados e renderiza
  await initAuth(async (user) => {
    if (user) {
      state.user = user;
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');

      // Atualiza header
      document.getElementById('user-name').textContent = user.displayName?.split(' ')[0] || 'Usuário';
      document.getElementById('user-avatar').textContent = (user.displayName?.[0] || '?').toUpperCase();

      // Carrega todos os dados e renderiza dashboard
      await loadAllData();
      switchTab('dashboard');

    } else {
      state.user = null;
      document.getElementById('login-screen').classList.remove('hidden');
      document.getElementById('app').classList.add('hidden');
    }
  });
});
