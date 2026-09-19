/**
 * ajustes.js — o destino "Ajustes" (redesign v2, rodada 8, a última)
 *
 * Funde as TRÊS seções que o destino empilhava desde a rodada 2 — orçamento,
 * configurações e relatórios — numa tela só, e encerra a lista de destinos
 * empilhados. Relatórios não foi absorvido: foi apagado (ver abaixo).
 *
 * Seis blocos, na ordem de quanto se mexe em cada um, cada um com id próprio
 * (as âncoras de `data-goto`):
 *   ajustes-categorias — as categorias e suas cores
 *   ajustes-regras     — as regras de classificação automática
 *   ajustes-orcamento  — o teto por categoria (o editor continua em orcamento.js)
 *   ajustes-backup     — exportar, restaurar, o que está guardado e o apagar tudo
 *   ajustes-conta      — quem está logado, e o sair
 *   ajustes-mudou      — para onde foram os ajustes que mudaram de casa
 *
 * SEM SUB-ABAS. As `.config-tabs` eram vocabulário anterior ao híbrido, e um
 * terceiro jeito de fazer aba (depois de `.imp-abas`) não se justifica: desde a
 * rodada 1 A PÁGINA ROLA, e Ajustes é a tela que menos se visita — cinco folhas
 * empilhadas se leem de uma vez, cinco abas escondem quatro delas.
 *
 * RELATÓRIOS MORREU (decisão da usuária, perguntada no fim da rodada 7). Eram
 * seis relatórios fixos para uma pessoa só, e cada tabela do app já exporta o
 * próprio CSV com o que está na tela. `js/relatorios.js` foi apagado.
 *
 * `js/configuracoes.js` foi absorvido inteiro por este arquivo e apagado, como
 * `dashboard.js` na rodada 3. `js/orcamento.js` seguiu o caminho de
 * `gastos.js`: deixou de ter tela própria e virou editor + gravação, chamado
 * daqui.
 *
 * Os MODAIS (categoria, e o de regra que este módulo cria na hora) continuam
 * fora da seção: ali listener preso ao elemento é seguro, ao contrário do que
 * vale na tela, que é reinjetada por innerHTML a cada gravação.
 */

import { state, toast, esc } from './utils.js';
import {
  saveCategory, deleteCategory, exportBackup, importBackup, saveDoc, removeDoc,
} from './db.js';
import { renderOrcamento, salvarOrcamento } from './orcamento.js';

let _init = false;

/** Cor de uma categoria nova. Era `#3982f7` — azul, que não entra em papel
 *  nenhum nesta pele. A primeira da série categórica é o default agora. */
const COR_PADRAO = '#A8336B';

// ═══════════════════════════════════════════════════════════════════════
// BLOCOS
// ═══════════════════════════════════════════════════════════════════════

function _categorias() {
  // Cópia antes de ordenar: `sort()` ordena NO LUGAR, e `state.categories` é o
  // mesmo array que todas as outras telas leem. Abrir Ajustes reordenava
  // silenciosamente as opções de todos os selects do app.
  const cats = [...state.categories].sort((a, b) => (a.order || 0) - (b.order || 0));

  const corpo = cats.length
    ? cats.map(c => `
      <div class="aj-item">
        <span class="aj-cor" style="background:${esc(c.color || '#616B79')}"></span>
        <span class="aj-item-nome">${esc(c.name)}</span>
        <span class="aj-item-nota">${esc(c.color || '')}</span>
        <span class="aj-item-acoes">
          <button class="btn-icon-only" title="Editar" aria-label="Editar categoria ${esc(c.name)}"
            data-aj="edit-cat" data-id="${esc(c.id)}">✎</button>
          <button class="btn-icon-only danger" title="Excluir" aria-label="Excluir categoria ${esc(c.name)}"
            data-aj="del-cat" data-id="${esc(c.id)}">✕</button>
        </span>
      </div>`).join('')
    : `<p class="nota" style="margin:0">Nenhuma categoria ainda.</p>`;

  return `
    <div class="folha" id="ajustes-categorias">
      <div class="linha-topo">
        <div>
          <p class="rot">Categorias</p>
          <p class="rot-sub" style="margin:0">São elas que repartem a rosca de Mês e recebem teto no
            orçamento. Categoria com <b>“Investimento”</b> no nome fica fora do total de despesas em
            toda tela. Excluir uma categoria <b>não</b> apaga os gastos ligados a ela — eles ficam sem
            categoria, e aparecem em Conferir.</p>
        </div>
        <button class="btn" data-aj="nova-cat">+ Nova categoria</button>
      </div>
      <div class="aj-lista">${corpo}</div>
    </div>`;
}

function _regras() {
  const rules = state.importRules || [];

  const corpo = rules.length
    ? rules.map((r, i) => {
        const cat = state.categories.find(c => c.id === r.category);
        return `
        <div class="aj-item">
          <code class="aj-padrao">${esc(r.pattern)}</code>
          <span class="aj-seta" aria-hidden="true">→</span>
          <span class="aj-item-nome">${cat ? esc(cat.name) : '<span class="marca-d">sem categoria</span>'}</span>
          <span class="selo">${r.type === 'income' ? 'Receita' : 'Despesa'}</span>
          <span class="aj-item-acoes">
            <button class="btn-icon-only danger" title="Excluir" aria-label="Excluir regra ${esc(r.pattern)}"
              data-aj="del-regra" data-idx="${i}">✕</button>
          </span>
        </div>`;
      }).join('')
    : `<p class="nota" style="margin:0">Sem regras suas. As de fábrica (iFood, Uber, farmácia…) já
         funcionam sozinhas — estas aqui são as que você acrescenta por cima.</p>`;

  return `
    <div class="folha" id="ajustes-regras">
      <div class="linha-topo">
        <div>
          <p class="rot">Regras de classificação</p>
          <p class="rot-sub" style="margin:0"><b>É o que mais muda resultado nesta tela.</b> Quando a
            descrição de um lançamento importado casar com o padrão, a categoria entra sozinha — e a
            linha não vira pendência em Conferir.</p>
        </div>
        <button class="btn" data-aj="nova-regra">+ Nova regra</button>
      </div>
      <div class="aj-lista">${corpo}</div>
    </div>`;
}

/**
 * O markup do orçamento veio do index.html para cá, e `orcamento.js` continua
 * preenchendo `#orcamento-editor` — mesma divisão de `gastos.js` na rodada 3.
 * O botão de salvar NÃO leva listener próprio: a seção é reinjetada a cada
 * gravação e o listener morreria com o elemento. Vai pelo delegado, como tudo.
 */
function _orcamento() {
  return `
    <div class="folha" id="ajustes-orcamento">
      <div class="linha-topo">
        <div>
          <p class="rot">Orçamento por categoria</p>
          <p class="rot-sub" style="margin:0">Quanto você pretende gastar em cada categoria, e quanto já
            foi <b>no mês do topo</b>. Em branco é válido — significa que a categoria não tem teto.</p>
        </div>
        <button class="btn" data-aj="salvar-orcamento">Salvar orçamento</button>
      </div>
      <div id="orcamento-editor" class="orcamento-editor"></div>
    </div>`;
}

function _backup() {
  const stats = [
    ['Transações',      state.transactions.length],
    ['Receitas',        state.incomes.length],
    ['Meses com orçamento', Object.keys(state.budgets).length],
    ['Ativos',          state.assets.length],
    ['Metas',           state.goals.length],
    ['Categorias',      state.categories.length],
    ['Linhas de extrato', (state.extratoTransactions || []).length],
    ['Regras',          (state.importRules || []).length],
  ];

  const quadros = stats.map(([rot, n]) => `
    <div class="aj-stat">
      <div class="aj-stat-val">${n}</div>
      <div class="aj-stat-rot">${esc(rot)}</div>
    </div>`).join('');

  return `
    <div class="folha" id="ajustes-backup">
      <div class="linha-topo">
        <div>
          <p class="rot">Backup</p>
          <p class="rot-sub" style="margin:0">Baixe antes de qualquer mudança grande — <b>é o seu
            desfazer</b>. Restaurar <b>soma</b> ao que já existe, não substitui: para trocar os dados
            por completo, apague a coleção primeiro.</p>
        </div>
      </div>

      <div class="aj-duplo">
        <div class="aj-bloco">
          <p class="aj-bloco-rot">Exportar</p>
          <p class="nota" style="margin:0 0 10px">Todos os seus dados num arquivo JSON.</p>
          <div class="aj-linha-form">
            <label class="aj-rotulo" for="backup-version">Versão</label>
            <input type="text" id="backup-version" class="form-input sm" value="1.0.0" style="max-width:110px" />
            <button class="btn" data-aj="exportar">↓ Exportar JSON</button>
          </div>
        </div>

        <div class="aj-bloco">
          <p class="aj-bloco-rot">Restaurar</p>
          <p class="nota" style="margin:0 0 10px">Use o arquivo baixado ao lado.</p>
          <label class="btn btn-2" style="cursor:pointer;display:inline-flex">
            ↑ Escolher .json
            <input type="file" id="input-import-backup" accept=".json" data-aj="arquivo-backup" hidden />
          </label>
          <p class="nota" id="backup-import-status" style="margin:10px 0 0"></p>
        </div>
      </div>

      <p class="aj-bloco-rot" style="margin-top:var(--goteira)">O que está guardado</p>
      <div class="aj-stats">${quadros}</div>

      <div class="aj-risco">
        <p class="aj-risco-rot">Apagar tudo de uma coleção</p>
        <p class="nota" style="margin:0 0 12px">Existe para você <b>substituir</b> os dados em vez de
          somar: apague a coleção e só então restaure o backup, senão tudo entra duas vezes.
          <b>Não dá para desfazer</b> — exporte antes.</p>
        <div class="aj-linha-form">
          <select id="wipe-collection-select" class="form-input sm" style="max-width:250px">
            <option value="transactions">Transações (gastos + extratos)</option>
            <option value="incomes">Receitas</option>
            <option value="budgets">Orçamentos</option>
            <option value="assets">Patrimônio (ativos)</option>
            <option value="goals">Metas</option>
          </select>
          <button class="btn-2 aj-btn-risco" id="btn-wipe-collection" data-aj="wipe">Apagar tudo desta coleção</button>
        </div>
        <p class="nota" id="wipe-status" style="margin:10px 0 0"></p>
      </div>
    </div>`;
}

function _conta() {
  const u = state.user || {};
  const inicial = (u.displayName?.[0] || '?').toUpperCase();
  return `
    <div class="folha" id="ajustes-conta">
      <div class="linha-topo">
        <div>
          <p class="rot">Conta</p>
          <p class="rot-sub" style="margin:0">Os dados ficam na sua conta Google, no Firebase. Nenhum
            extrato ou fatura é enviado para servidor nenhum — <b>o arquivo é lido no seu navegador</b>,
            e só os lançamentos que você confirma vão para a nuvem.</p>
        </div>
      </div>
      <div class="aj-conta">
        <span class="aj-conta-avatar">${esc(inicial)}</span>
        <span class="aj-conta-quem">
          <b>${esc(u.displayName || '—')}</b>
          <i>${esc(u.email || '—')}</i>
        </span>
        <button class="btn-2 aj-btn-risco" data-aj="sair">Sair da conta</button>
      </div>
      <p class="nota" style="margin:12px 0 0">Radar v1.0</p>
    </div>`;
}

/**
 * Dois ajustes saíram desta tela nas rodadas 4 e 6, pela mesma razão: cada um
 * decide uma coisa que só se confere onde a consequência aparece. Um rodapé
 * que diz para onde foram custa menos que a pessoa procurar e não achar.
 */
function _mudouDeCasa() {
  return `
    <div class="folha" id="ajustes-mudou">
      <p class="rot">Ajustes que moram em outra tela</p>
      <p class="rot-sub">Não sumiram — foram para onde dá para ver o efeito deles.</p>
      <div class="aj-mudou">
        <div>
          <p class="aj-bloco-rot">Em que mês a fatura conta</p>
          <p class="nota" style="margin:0 0 10px">Fica em <b>Importar</b>, na aba “Fatura de cartão”,
            ao lado de onde o arquivo entra.</p>
          <button class="btn-2" data-goto="importar">Ir para Importar</button>
        </div>
        <div>
          <p class="aj-bloco-rot">Dia de vencimento da fatura</p>
          <p class="nota" style="margin:0 0 10px">Fica em <b>Adiante</b>, ao lado do saldo inicial — é
            ele que decide em que dia o cartão sai do caixa.</p>
          <button class="btn-2" data-goto="adiante">Ir para Adiante</button>
        </div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════

export function renderAjustes() {
  const sec = document.getElementById('tab-ajustes');
  if (!sec) return;
  if (!_init) { _ligarTela(sec); _ligarModais(); _init = true; }

  sec.innerHTML = `
    <p class="page-intro">Onde se ajusta o que as outras telas usam. <b>A que mais muda resultado são as
      regras</b>, que classificam a importação sozinhas.</p>
    ${_categorias()}
    ${_regras()}
    ${_orcamento()}
    ${_backup()}
    ${_conta()}
    ${_mudouDeCasa()}`;

  // O editor do orçamento é de `orcamento.js` — ele preenche o `#orcamento-editor`
  // que o bloco acabou de criar. Falha dele não pode derrubar o resto da tela.
  try { renderOrcamento(); }
  catch (err) { console.error('Erro no editor de orçamento:', err); }
}

// ═══════════════════════════════════════════════════════════════════════
// EVENTOS
// ═══════════════════════════════════════════════════════════════════════

/** Um listener só, delegado na seção: ela é reinjetada por innerHTML a cada
 *  gravação, e listener preso ao elemento morre junto com o elemento. */
function _ligarTela(sec) {
  sec.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-aj]');
    if (!el) return;

    switch (el.dataset.aj) {
      case 'nova-cat':  return _abrirModalCategoria(null);
      case 'edit-cat':  return _abrirModalCategoria(state.categories.find(c => c.id === el.dataset.id));

      case 'del-cat': {
        const cat = state.categories.find(c => c.id === el.dataset.id);
        if (!cat) return;
        if (!confirm(`Excluir "${cat.name}"? Os gastos dela ficam sem categoria.`)) return;
        await deleteCategory(cat.id);
        toast('Categoria excluída.', 'success');
        return renderAjustes();
      }

      case 'nova-regra': return _abrirModalRegra();

      case 'del-regra': {
        const idx = parseInt(el.dataset.idx, 10);
        if (isNaN(idx)) return;
        if (!confirm('Excluir esta regra?')) return;
        const regra = state.importRules?.[idx];
        try {
          // A regra é persistida na coleção `rules` — antes vivia só na memória
          // e sumia no reload.
          if (regra?.id) await removeDoc('rules', regra.id);
          state.importRules?.splice(idx, 1);
          toast('Regra removida.', 'success');
          renderAjustes();
        } catch (err) {
          console.error('Erro ao remover regra:', err);
          toast(`Erro ao remover: ${err.message}`, 'error');
        }
        return;
      }

      case 'salvar-orcamento':
        return salvarOrcamento();

      case 'exportar': {
        const version = document.getElementById('backup-version')?.value?.trim() || '1.0.0';
        try { await exportBackup(version); toast('Backup exportado!', 'success'); }
        catch (err) { toast(`Erro ao exportar: ${err.message}`, 'error'); }
        return;
      }

      case 'wipe':  return _wipe(el);
      case 'sair':  return window._FB?.signOut(window._FB.auth);
    }
  });

  sec.addEventListener('change', async (e) => {
    if (e.target?.dataset?.aj !== 'arquivo-backup') return;
    const file = e.target.files?.[0];
    if (!file) return;
    const status = document.getElementById('backup-import-status');
    if (!confirm('Restaurar este backup? O que vier soma ao que já existe.')) { e.target.value = ''; return; }
    try {
      if (status) status.textContent = 'Restaurando…';
      const version = await importBackup(file);
      toast(`Backup v${version} restaurado! Recarregue a página.`, 'success');
      if (status) status.textContent = `Backup v${version} restaurado. Recarregue a página para ver.`;
    } catch (err) {
      toast(`Erro ao restaurar: ${err.message}`, 'error');
      if (status) status.textContent = `Erro: ${err.message}`;
    }
    e.target.value = '';
  });
}

/**
 * O wipe continua na interface (decisão da usuária na rodada 8): é o que torna
 * "restaurar backup" utilizável sem duplicar tudo. Duas confirmações, de
 * propósito — é a única ação do app que apaga em massa e sem desfazer.
 */
async function _wipe(btn) {
  const sel    = document.getElementById('wipe-collection-select');
  const col    = sel?.value;
  const label  = sel?.options[sel.selectedIndex]?.text || col;
  const status = document.getElementById('wipe-status');
  if (!col) return;

  if (!confirm(`Apagar PERMANENTEMENTE todos os dados de "${label}"? Não dá para desfazer.`)) return;
  if (!confirm(`Confirma de novo: apagar TUDO de "${label}"? O recomendado é exportar o backup antes.`)) return;

  const rotulo = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Apagando…';
  if (status) status.textContent = 'Apagando documentos…';

  try {
    // `wipeCollection` mora em db.js, com o limite de lote do Firestore.
    const { wipeCollection } = await import('./db.js');
    const n = await wipeCollection(col);
    toast(`${n} documento(s) apagado(s) de "${label}".`, 'success');
    if (status) status.textContent = `✓ ${n} documento(s) removido(s). Agora dá para restaurar um backup sem duplicar.`;
  } catch (err) {
    console.error('Erro ao apagar coleção:', err);
    toast(`Erro: ${err.message}`, 'error');
    if (status) status.textContent = `Erro: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = rotulo;
  }
}

// ── MODAIS ───────────────────────────────────────────────────────────────
// O de categoria mora no index.html e NÃO é remontado: ali listener preso ao
// elemento é seguro, e é registrado uma vez só, junto com a tela.

function _ligarModais() {
  document.getElementById('btn-salvar-categoria')?.addEventListener('click', async () => {
    const id    = document.getElementById('cat-id').value || null;
    const name  = document.getElementById('cat-nome').value.trim();
    const color = document.getElementById('cat-cor').value;
    if (!name) return toast('Informe o nome.', 'error');
    const existente = id ? state.categories.find(c => c.id === id) : null;
    await saveCategory({ name, color, order: existente?.order || state.categories.length + 1 }, id);
    document.getElementById('modal-categoria').classList.add('hidden');
    toast('Categoria salva!', 'success');
    renderAjustes();
  });
}

function _abrirModalCategoria(cat) {
  document.getElementById('cat-id').value   = cat?.id   || '';
  document.getElementById('cat-nome').value = cat?.name || '';
  document.getElementById('cat-cor').value  = cat?.color || COR_PADRAO;
  document.getElementById('modal-categoria').classList.remove('hidden');
}

function _abrirModalRegra() {
  const cats = state.categories
    .map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', '_rc-title');
  overlay.innerHTML = `
    <div class="modal modal-sm">
      <div class="modal-header"><h3 id="_rc-title">Nova regra</h3><button id="_rc" title="Fechar" aria-label="Fechar">✕</button></div>
      <div class="modal-body">
        <div class="form-row">
          <label class="form-label" for="_rp">Padrão (texto na descrição)</label>
          <input type="text" id="_rp" class="form-input" placeholder="Ex: IFOOD|RAPPI" />
          <span class="form-hint">Use | para vários termos. Não diferencia maiúsculas.</span>
        </div>
        <div class="form-row">
          <label class="form-label" for="_rcat">Categoria</label>
          <select id="_rcat" class="form-select"><option value="">Sem categoria</option>${cats}</select>
        </div>
        <div class="form-row">
          <label class="form-label" for="_rtype">Tipo</label>
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
  const fechar = () => overlay.remove();
  overlay.querySelector('#_rc').onclick      = fechar;
  overlay.querySelector('#_rcancel').onclick = fechar;
  overlay.querySelector('#_rsave').onclick   = async () => {
    const pattern  = overlay.querySelector('#_rp').value.trim();
    const category = overlay.querySelector('#_rcat').value;
    const type     = overlay.querySelector('#_rtype').value;
    if (!pattern) { toast('Informe o padrão.', 'error'); return; }

    // Valida o regex ANTES de salvar: um padrão inválido quebraria TODAS as
    // importações futuras dentro do `autoClassify`.
    try { new RegExp(pattern, 'i'); }
    catch { toast('Padrão inválido. Para texto literal, use só palavras separadas por |.', 'error'); return; }

    try {
      const id = await saveDoc('rules', { pattern, category, type });
      if (!state.importRules) state.importRules = [];
      state.importRules.push({ id, pattern, category, type });
      toast('Regra adicionada!', 'success');
      fechar();
      renderAjustes();
    } catch (err) {
      console.error('Erro ao salvar regra:', err);
      toast(`Erro ao salvar: ${err.message}`, 'error');
    }
  };
}
