/**
 * configuracoes.js — Aba de configurações: categorias, backup, preferências
 */

import { state, toast } from './app.js';
import { saveCategory, deleteCategory } from './db.js';
import { exportBackup, importBackup } from './db.js';

let _configInit = false;

export function renderConfiguracoes() {
  if (!_configInit) {
    _initConfigEvents();
    _configInit = true;
  }
  _renderCategorias();
}

// ─── CATEGORIAS ────────────────────────────────────────────────────────────
function _renderCategorias() {
  const list = document.getElementById('categorias-list');

  if (!state.categories.length) {
    list.innerHTML = '<p class="empty-state">Nenhuma categoria.</p>';
    return;
  }

  list.innerHTML = state.categories
    .sort((a, b) => (a.order || 0) - (b.order || 0))
    .map(c => `
      <div class="categoria-item">
        <span class="categoria-dot" style="background:${c.color}"></span>
        <span class="categoria-nome">${c.name}</span>
        <button class="btn-icon-only" style="margin-left:auto" data-action="edit-cat" data-id="${c.id}">✎</button>
        <button class="btn-icon-only danger" data-action="delete-cat" data-id="${c.id}">✕</button>
      </div>`).join('');
}

function _initConfigEvents() {
  // Nova categoria
  document.getElementById('btn-nova-categoria').addEventListener('click', () => {
    document.getElementById('cat-id').value   = '';
    document.getElementById('cat-nome').value = '';
    document.getElementById('cat-cor').value  = '#34d399';
    document.getElementById('modal-categoria').classList.remove('hidden');
  });

  document.getElementById('btn-salvar-categoria').addEventListener('click', async () => {
    const id   = document.getElementById('cat-id').value || null;
    const name = document.getElementById('cat-nome').value.trim();
    const color = document.getElementById('cat-cor').value;

    if (!name) return toast('Informe o nome da categoria.', 'error');

    const existing = id ? state.categories.find(c => c.id === id) : null;
    const order    = existing?.order || state.categories.length + 1;

    await saveCategory({ name, color, order }, id);
    document.getElementById('modal-categoria').classList.add('hidden');
    toast('Categoria salva!', 'success');
    _renderCategorias();
  });

  document.getElementById('categorias-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;

    if (btn.dataset.action === 'edit-cat') {
      const c = state.categories.find(x => x.id === id);
      if (!c) return;
      document.getElementById('cat-id').value   = c.id;
      document.getElementById('cat-nome').value = c.name;
      document.getElementById('cat-cor').value  = c.color || '#34d399';
      document.getElementById('modal-categoria').classList.remove('hidden');
    }
    if (btn.dataset.action === 'delete-cat') {
      if (!confirm(`Excluir a categoria "${state.categories.find(c=>c.id===id)?.name}"?\nOs gastos vinculados perderão a categoria.`)) return;
      await deleteCategory(id);
      toast('Categoria excluída.', 'success');
      _renderCategorias();
    }
  });

  // Exportar backup
  document.getElementById('btn-export-backup').addEventListener('click', async () => {
    const version = document.getElementById('backup-version').value.trim() || '1.0.0';
    try {
      await exportBackup(version);
      toast('Backup exportado com sucesso!', 'success');
    } catch (err) {
      console.error(err);
      toast('Erro ao exportar backup.', 'error');
    }
  });

  // Importar backup
  document.getElementById('input-import-backup').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('Importar backup? Os dados existentes serão mesclados (não apagados).')) {
      e.target.value = '';
      return;
    }
    try {
      const version = await importBackup(file);
      toast(`Backup v${version} importado com sucesso! Recarregue a página.`, 'success');
    } catch (err) {
      console.error(err);
      toast('Erro ao importar backup. Verifique se o arquivo é válido.', 'error');
    }
    e.target.value = '';
  });
}
