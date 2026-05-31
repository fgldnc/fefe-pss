/**
 * configuracoes.js — Página de configurações completa v2
 */

import { state, toast, esc } from './utils.js';
import { saveCategory, deleteCategory, exportBackup, importBackup } from './db.js';

export function renderConfiguracoes() {
  const section = document.getElementById('tab-configuracoes');
  if (!section) return;

  section.innerHTML = `
    <div class="page-header">
      <div class="page-header-text">
        <h2 class="page-title">Configurações</h2>
        <p class="page-subtitle">Personalize o Fluxo</p>
      </div>
    </div>

    <div class="config-tabs" id="config-tabs">
      <button class="config-tab active" data-section="categorias">Categorias</button>
      <button class="config-tab" data-section="regras">Regras</button>
      <button class="config-tab" data-section="backup">Backup</button>
      <button class="config-tab" data-section="preferencias">Preferências</button>
      <button class="config-tab" data-section="conta">Conta</button>
    </div>

    <div class="config-section" id="cfg-categorias">
      <div class="config-grid">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Categorias de Gastos</span>
            <button class="btn btn-xs btn-primary" id="btn-nova-categoria">+ Nova</button>
          </div>
          <div id="categorias-list" class="categorias-list"></div>
        </div>
        <div class="card" style="padding:1.25rem">
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:0.75rem">Dicas</div>
          <ul style="font-size:0.82rem;color:var(--text-secondary);line-height:1.7;list-style:none;display:flex;flex-direction:column;gap:0.4rem">
            <li>🎨 A cor aparece nos gráficos e tabelas</li>
            <li>🤖 Usadas para auto-classificação de extratos</li>
            <li>📊 Nome com "Investimento" exclui do total de despesas</li>
            <li>⚠️ Excluir categoria não apaga gastos vinculados</li>
          </ul>
        </div>
      </div>
    </div>

    <div class="config-section hidden" id="cfg-regras">
      <div class="card">
        <div class="card-header">
          <span class="card-title">Regras de categorização automática</span>
          <button class="btn btn-xs btn-primary" id="btn-nova-regra">+ Nova Regra</button>
        </div>
        <p style="padding:0.75rem 1.25rem;font-size:0.82rem;color:var(--text-muted);border-bottom:1px solid var(--border-soft)">
          Quando uma descrição corresponder ao padrão, a categoria e tipo são aplicados automaticamente na importação.
        </p>
        <div id="regras-list" class="categorias-list"></div>
      </div>
    </div>

    <div class="config-section hidden" id="cfg-backup">
      <div class="config-grid">
        <div class="card">
          <div class="card-header"><span class="card-title">Exportar Backup</span></div>
          <div style="padding:1.25rem;display:flex;flex-direction:column;gap:0.85rem">
            <p style="font-size:0.83rem;color:var(--text-secondary);line-height:1.5">Exporta todos seus dados em JSON para migração ou segurança.</p>
            <div class="form-row">
              <label class="form-label">Versão</label>
              <input type="text" id="backup-version" class="form-input" value="1.0.0" style="max-width:150px" />
            </div>
            <button class="btn btn-primary btn-sm" id="btn-export-backup">↓ Exportar JSON</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span class="card-title">Importar Backup</span></div>
          <div style="padding:1.25rem;display:flex;flex-direction:column;gap:0.85rem">
            <p style="font-size:0.83rem;color:var(--text-secondary);line-height:1.5">Dados existentes são mesclados — não apagados.</p>
            <label class="btn btn-ghost btn-sm" style="cursor:pointer;width:fit-content">
              ↑ Selecionar .json
              <input type="file" id="input-import-backup" accept=".json" style="display:none" />
            </label>
            <div id="backup-import-status" style="font-size:0.8rem;color:var(--text-muted)"></div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:1rem;padding:1.25rem">
        <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;color:var(--text-muted);margin-bottom:0.75rem">Dados armazenados</div>
        <div id="storage-stats" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0.6rem"></div>
      </div>
    </div>

    <div class="config-section hidden" id="cfg-preferencias">
      <div class="card" style="max-width:580px">
        <div class="card-header"><span class="card-title">Preferências gerais</span></div>
        <div style="padding:1.25rem;display:flex;flex-direction:column;gap:1rem">
          <div class="form-row">
            <label class="form-label">Offset de competência da fatura</label>
            <select id="billing-offset" class="form-select" style="max-width:350px">
              <option value="-1" selected>Vencimento em mês X → competência X-1</option>
              <option value="0">Sem offset (mesmo mês do vencimento)</option>
            </select>
            <span class="form-hint">Define como faturas importadas são alocadas nos meses.</span>
          </div>
          <div class="form-row">
            <label class="form-label">Moeda</label>
            <select id="pref-moeda" class="form-select" style="max-width:200px">
              <option value="BRL" selected>Real (BRL)</option>
              <option value="USD">Dólar (USD)</option>
              <option value="EUR">Euro (EUR)</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <div class="config-section hidden" id="cfg-conta">
      <div class="card" style="max-width:480px;padding:1.5rem">
        <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.25rem">
          <div style="width:50px;height:50px;border-radius:50%;background:var(--accent-dim);border:2px solid var(--accent-primary);display:flex;align-items:center;justify-content:center;font-size:1.2rem;font-weight:700;color:var(--accent-bright)" id="cfg-avatar">?</div>
          <div>
            <div style="font-weight:600;font-size:1rem;color:var(--text-primary)" id="cfg-user-name">—</div>
            <div style="font-size:0.8rem;color:var(--text-muted)" id="cfg-user-email">—</div>
          </div>
        </div>
        <p style="font-size:0.82rem;color:var(--text-secondary);line-height:1.6;margin-bottom:1.25rem">
          Dados vinculados à sua conta Google e armazenados no Firebase. Nenhum arquivo de extrato é enviado para servidores externos.
        </p>
        <button class="btn btn-danger btn-sm" id="btn-cfg-logout">Sair da conta</button>
        <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border-soft);font-size:0.76rem;color:var(--text-muted)">Fluxo v2.1 — Fase 2</div>
      </div>
    </div>`;

  _renderCategorias();
  _renderRegras();
  _renderStorageStats();

  const user = state.user;
  if (user) {
    const e = (id) => document.getElementById(id);
    if (e('cfg-avatar'))     e('cfg-avatar').textContent     = (user.displayName?.[0] || '?').toUpperCase();
    if (e('cfg-user-name'))  e('cfg-user-name').textContent  = user.displayName || '—';
    if (e('cfg-user-email')) e('cfg-user-email').textContent = user.email || '—';
  }

  _initEvents();
}

function _renderCategorias() {
  const list = document.getElementById('categorias-list');
  if (!list) return;
  if (!state.categories.length) {
    list.innerHTML = '<p style="padding:1rem;font-size:0.83rem;color:var(--text-muted)">Nenhuma categoria.</p>';
    return;
  }
  list.innerHTML = state.categories
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(c => `
      <div class="categoria-item">
        <span class="categoria-dot" style="background:${esc(c.color || '#888')}"></span>
        <span class="categoria-nome">${esc(c.name)}</span>
        <span style="font-size:0.7rem;color:var(--text-muted);margin-left:auto;margin-right:0.5rem">${esc(c.color || '')}</span>
        <button class="btn-icon-only" data-action="edit-cat" data-id="${esc(c.id)}">✎</button>
        <button class="btn-icon-only danger" data-action="delete-cat" data-id="${esc(c.id)}">✕</button>
      </div>`).join('');
}

function _renderRegras() {
  const list = document.getElementById('regras-list');
  if (!list) return;
  const rules = state.importRules || [];
  if (!rules.length) {
    list.innerHTML = `<div class="empty-state" style="padding:2rem">
      <div class="empty-state-icon">🤖</div>
      <div class="empty-state-title">Sem regras personalizadas</div>
      <div class="empty-state-text">As regras padrão (iFood, Uber, Farmácia...) já estão ativas. Adicione as suas.</div>
    </div>`;
    return;
  }
  list.innerHTML = rules.map((r, i) => `
    <div class="categoria-item">
      <span style="font-family:var(--font-mono);font-size:0.78rem;color:var(--info)">${esc(r.pattern)}</span>
      <span style="color:var(--text-muted);margin:0 0.4rem">→</span>
      <span style="font-size:0.82rem;color:var(--text-secondary)">${esc(state.categories.find(c=>c.id===r.category)?.name || r.category || '—')}</span>
      <span style="margin-left:auto;font-size:0.7rem;padding:0.1rem 0.45rem;border-radius:20px;background:var(--accent-dim);color:var(--accent-bright);margin-right:0.5rem">${esc(r.type || 'expense')}</span>
      <button class="btn-icon-only danger" data-action="delete-rule" data-idx="${i}">✕</button>
    </div>`).join('');
}

function _renderStorageStats() {
  const el = document.getElementById('storage-stats');
  if (!el) return;
  const stats = [
    { label: 'Transações',   val: state.transactions.length },
    { label: 'Receitas',     val: state.incomes.length },
    { label: 'Meses c/ orçamento', val: Object.keys(state.budgets).length },
    { label: 'Ativos',       val: state.assets.length },
    { label: 'Metas',        val: state.goals.length },
    { label: 'Categorias',   val: state.categories.length },
    { label: 'Extratos importados', val: (state.extratoTransactions || []).length },
    { label: 'Regras',       val: (state.importRules || []).length },
  ];
  el.innerHTML = stats.map(s => `
    <div style="background:var(--bg-card-raised);border:1px solid var(--border-soft);border-radius:var(--radius-md);padding:0.75rem 1rem">
      <div style="font-size:1.1rem;font-weight:700;font-family:var(--font-mono);color:var(--text-primary)">${s.val}</div>
      <div style="font-size:0.71rem;color:var(--text-muted);margin-top:0.1rem">${s.label}</div>
    </div>`).join('');
}

function _initEvents() {
  document.getElementById('config-tabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.config-tab');
    if (!tab) return;
    document.querySelectorAll('.config-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.config-section').forEach(s => s.classList.add('hidden'));
    tab.classList.add('active');
    document.getElementById(`cfg-${tab.dataset.section}`)?.classList.remove('hidden');
  });

  document.getElementById('btn-nova-categoria')?.addEventListener('click', () => {
    document.getElementById('cat-id').value   = '';
    document.getElementById('cat-nome').value = '';
    document.getElementById('cat-cor').value  = '#910A67';
    document.getElementById('modal-categoria').classList.remove('hidden');
  });

  document.getElementById('btn-salvar-categoria')?.addEventListener('click', async () => {
    const id    = document.getElementById('cat-id').value || null;
    const name  = document.getElementById('cat-nome').value.trim();
    const color = document.getElementById('cat-cor').value;
    if (!name) return toast('Informe o nome.', 'error');
    const existing = id ? state.categories.find(c => c.id === id) : null;
    await saveCategory({ name, color, order: existing?.order || state.categories.length + 1 }, id);
    document.getElementById('modal-categoria').classList.add('hidden');
    toast('Categoria salva!', 'success');
    _renderCategorias();
  });

  document.getElementById('categorias-list')?.addEventListener('click', async e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === 'edit-cat') {
      const c = state.categories.find(x => x.id === id);
      if (!c) return;
      document.getElementById('cat-id').value   = c.id;
      document.getElementById('cat-nome').value = c.name;
      document.getElementById('cat-cor').value  = c.color || '#910A67';
      document.getElementById('modal-categoria').classList.remove('hidden');
    }
    if (btn.dataset.action === 'delete-cat') {
      if (!confirm(`Excluir "${state.categories.find(c=>c.id===id)?.name}"?`)) return;
      await deleteCategory(id);
      toast('Categoria excluída.', 'success');
      _renderCategorias();
    }
  });

  document.getElementById('btn-nova-regra')?.addEventListener('click', () => {
    _openRuleModal();
  });

  document.getElementById('regras-list')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.dataset.action !== 'delete-rule') return;
    const idx = parseInt(btn.dataset.idx);
    if (isNaN(idx)) return;
    if (!confirm('Excluir esta regra?')) return;
    state.importRules?.splice(idx, 1);
    toast('Regra removida.', 'success');
    _renderRegras();
  });

  document.getElementById('btn-export-backup')?.addEventListener('click', async () => {
    const version = document.getElementById('backup-version')?.value?.trim() || '1.0.0';
    try { await exportBackup(version); toast('Backup exportado!', 'success'); }
    catch (err) { toast('Erro ao exportar.', 'error'); }
  });

  document.getElementById('input-import-backup')?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById('backup-import-status');
    if (!confirm('Importar backup? Os dados serão mesclados.')) { e.target.value = ''; return; }
    try {
      if (status) status.textContent = 'Importando…';
      const version = await importBackup(file);
      toast(`Backup v${version} importado! Recarregue.`, 'success');
      if (status) status.textContent = `Backup v${version} importado com sucesso.`;
    } catch (err) {
      toast('Erro ao importar backup.', 'error');
      if (status) status.textContent = `Erro: ${err.message}`;
    }
    e.target.value = '';
  });

  // Salva offset no localStorage ao mudar
  document.getElementById('billing-offset')?.addEventListener('change', e => {
    localStorage.setItem('fluxo_billing_offset', e.target.value);
    toast('Preferência salva!', 'success');
  });

  // Carrega valor salvo ao abrir configurações
  const savedOffset = localStorage.getItem('fluxo_billing_offset') ?? '-1';
  const offsetSel = document.getElementById('billing-offset');
  if (offsetSel) offsetSel.value = savedOffset;

  document.getElementById('btn-cfg-logout')?.addEventListener('click', async () => {
    const { auth, signOut } = window._FB;
    await signOut(auth);
  });
}

function _openRuleModal() {
  const cats = state.categories.map(c =>
    `<option value="${esc(c.id)}">${esc(c.name)}</option>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-header"><h3>Nova Regra</h3><button id="_rc">✕</button></div>
      <div class="modal-body">
        <div class="form-row">
          <label class="form-label">Padrão (texto na descrição)</label>
          <input type="text" id="_rp" class="form-input" placeholder="Ex: IFOOD|RAPPI" />
          <span class="form-hint">Use | para múltiplos termos. Não diferencia maiúsculas.</span>
        </div>
        <div class="form-row">
          <label class="form-label">Categoria</label>
          <select id="_rcat" class="form-select"><option value="">Sem categoria</option>${cats}</select>
        </div>
        <div class="form-row">
          <label class="form-label">Tipo</label>
          <select id="_rtype" class="form-select">
            <option value="expense">Despesa</option>
            <option value="income">Receita</option>
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" id="_rcancel">Cancelar</button>
        <button class="btn btn-primary" id="_rsave">Salvar</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#_rc').onclick      = close;
  overlay.querySelector('#_rcancel').onclick = close;
  overlay.querySelector('#_rsave').onclick   = () => {
    const pattern  = overlay.querySelector('#_rp').value.trim();
    const category = overlay.querySelector('#_rcat').value;
    const type     = overlay.querySelector('#_rtype').value;
    if (!pattern) { toast('Informe o padrão.', 'error'); return; }
    if (!state.importRules) state.importRules = [];
    state.importRules.push({ pattern, category, type });
    toast('Regra adicionada!', 'success');
    close();
    _renderRegras();
  };
}
