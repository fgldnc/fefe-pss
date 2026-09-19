/**
 * guardado.js — o destino "Guardado" (redesign v2, rodada 5)
 *
 * Funde as duas telas antigas — Metas e Patrimônio — numa folha só. Antes
 * elas eram dois destinos empilhados, cada um com o markup dele no
 * `index.html`; agora este módulo monta `#tab-guardado` inteiro, e
 * `metas.js` / `patrimonio.js` viraram camada de formulário + gravação,
 * exatamente como `gastos.js` / `receitas.js` na rodada 3.
 *
 * Quatro blocos, na ordem da pergunta que cada um responde:
 *   total        — "quanto eu tenho, e de que é feito?"
 *   metas        — "para onde esse dinheiro está indo?"
 *   ativos       — "onde ele está guardado?"
 *   aportes/mês  — "eu tenho guardado com constância?"
 *
 * O VÍNCULO ATIVO → META é o assunto, não um detalhe: aportar num ativo de
 * investimento credita a meta ligada a ele (`db.js:addAporteToAsset`), e até
 * aqui isso vivia escondido num `<select>` que só aparecia quando o tipo era
 * "investimento". Agora os dois lados se nomeiam: a meta diz de que ativo é
 * alimentada, o ativo diz que meta credita.
 *
 * REGRA DE MODELO QUE NÃO MUDA: o app NÃO guarda histórico de valor de ativo.
 * `currentValue` é o valor de hoje; o que existe de histórico são os aportes.
 * Por isso o gráfico é "Aportes por mês" e nunca "patrimônio mês a mês" —
 * desenhar a curva do passado seria inventar número. Para ela existir seria
 * preciso gravar snapshot mensal: mudança de modelo, não de tela.
 */

import { state, fmt, esc, monthLabel, offsetMonth } from './utils.js';
import {
  initMetas, openMetaModal, openAporteMetaModal, excluirMeta, TIPO_META,
} from './metas.js';
import {
  initPatrimonio, openAtivoModal, openAporteAtivoModal, excluirAtivo,
  valorDepreciado, TIPO_ATIVO,
} from './patrimonio.js';

let _init = false;

/** Número sem "R$": na coluna de valor o símbolo se repete em toda linha.
 *  Centavos SEMPRE — é a regra do desenho. */
const num = (v) => new Intl.NumberFormat('pt-BR',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(v || 0));

/** Série de cor por tipo de ativo. Sem azul, como manda o desenho. */
const SERIE_TIPO = { investimento: 's2', caixa: 's4', bem_pessoal: 's6' };

const dataBR = (d) => d
  ? new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
  : '—';

// ═══════════════════════════════════════════════════════════════════════
// DADOS — uma passada só; os quatro blocos consomem o mesmo resultado.
// Dois cálculos para o mesmo patrimônio divergem com o tempo.
// ═══════════════════════════════════════════════════════════════════════

function _dados() {
  // O valor de hoje passa SEMPRE por `valorDepreciado`, importada de
  // patrimonio.js: é a regra única de "quanto este bem vale agora".
  const ativos = state.assets.map(a => ({ ...a, valorHoje: valorDepreciado(a) }));

  const porTipo = (t) => ativos.filter(a => a.type === t).reduce((s, a) => s + a.valorHoje, 0);
  const invest = porTipo('investimento');
  const caixa  = porTipo('caixa');
  const bens   = porTipo('bem_pessoal');
  const total  = invest + caixa + bens;

  // O vínculo nos dois sentidos, para cada lado poder nomear o outro.
  const ativosPorMeta = new Map();
  for (const a of ativos) {
    if (!a.linkedGoalId) continue;
    const lista = ativosPorMeta.get(a.linkedGoalId) || [];
    lista.push(a);
    ativosPorMeta.set(a.linkedGoalId, lista);
  }

  // Meta sem prazo vai para o fim: quem tem data é quem tem urgência.
  const metas = [...state.goals].sort((a, b) =>
    (a.deadline || '9999-99').localeCompare(b.deadline || '9999-99'));

  return { ativos, invest, caixa, bens, total, metas, ativosPorMeta };
}

// ═══════════════════════════════════════════════════════════════════════
// 1. TOTAL — o número grande e de que ele é feito
//
// A rosca "Composição" foi embora: os três números do `.apoio` já SÃO a
// composição, em número, e a rosca repetia em desenho o que já estava
// escrito. No lugar ficou uma barra empilhada de uma linha — que ocupa
// 10px de altura em vez de 240 e diz a mesma proporção.
// ═══════════════════════════════════════════════════════════════════════

function _total(d) {
  const fatias = [
    { rot: 'Investimento',  val: d.invest, tipo: 'investimento' },
    { rot: 'Caixa / conta', val: d.caixa,  tipo: 'caixa' },
    { rot: 'Bens pessoais', val: d.bens,   tipo: 'bem_pessoal' },
  ].filter(f => f.val > 0);

  // A barra só existe se houver o que repartir; com um tipo só ela é uma
  // barra cheia que não informa nada.
  const barra = d.total > 0 && fatias.length > 1 ? `
    <div class="guardado-barra" role="img"
      aria-label="${esc(fatias.map(f => `${f.rot}: ${Math.round((f.val / d.total) * 100)}%`).join(', '))}">
      ${fatias.map(f => `<span style="flex:${f.val};background:var(--${SERIE_TIPO[f.tipo]})"></span>`).join('')}
    </div>
    <div class="guardado-legenda">
      ${fatias.map(f => `
        <span><i style="background:var(--${SERIE_TIPO[f.tipo]})"></i>${esc(f.rot)}
          <b>${Math.round((f.val / d.total) * 100)}%</b></span>`).join('')}
    </div>` : '';

  return `
    <div class="folha" id="guardado-total">
      <div class="linha-topo">
        <div>
          <p class="rot">O que você tem guardado</p>
          <p class="rot-sub" style="margin:0">É o valor de HOJE, não o histórico:
            bem com taxa de depreciação já vem depreciado.</p>
        </div>
      </div>
      <p class="guardado-total-val">${num(d.total)}</p>
      ${barra}
      <dl class="apoio" style="margin-top:18px">
        <div><dt>Investimento</dt><dd>${num(d.invest)}</dd></div>
        <div><dt>Caixa / conta</dt><dd>${num(d.caixa)}</dd></div>
        <div><dt>Bens pessoais</dt><dd>${num(d.bens)}</dd></div>
      </dl>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 2. METAS
// ═══════════════════════════════════════════════════════════════════════

function _metas(d) {
  const corpo = !d.metas.length
    ? `<p class="rot-sub" style="margin:0">Nenhuma meta ainda. Uma reserva de emergência
         é o começo de sempre — três a seis meses do que você gasta por mês.</p>`
    : d.metas.map(g => _umaMeta(g, d)).join('');

  return `
    <div class="folha" id="guardado-metas">
      <div class="linha-topo">
        <div>
          <p class="rot">Metas</p>
          <p class="rot-sub" style="margin:0">Alvos com prazo. Aporte feito num ativo vinculado
            credita a meta sozinho — não precisa lançar duas vezes.</p>
        </div>
        <button type="button" class="btn btn-2" data-guardado="nova-meta">+ Meta</button>
      </div>
      ${corpo}
    </div>`;
}

function _umaMeta(g, d) {
  const alvo  = g.targetAmount || 0;
  const atual = g.currentAmount || 0;
  const pct   = alvo > 0 ? Math.min(100, (atual / alvo) * 100) : 0;
  const falta = Math.max(0, alvo - atual);
  const pronta = alvo > 0 && atual >= alvo;

  // Sem prazo a frase não leva o rótulo: "prazo sem prazo" é o que sai de
  // grudar prefixo em valor que já é uma frase inteira.
  const prazo = g.deadline
    ? `prazo ${new Date(g.deadline + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })}`
    : 'sem prazo';

  // O lado do vínculo que faltava: a meta diz de onde o dinheiro dela vem.
  const fontes = d.ativosPorMeta.get(g.id) || [];
  const linhaFonte = fontes.length
    ? `<p class="guardado-vinculo">↳ alimentada por ${fontes.map(a => esc(a.name)).join(' · ')}</p>`
    : '';

  const aportes = g.contributions || [];

  // O selo do tipo só aparece quando ACRESCENTA: "Reserva de emergência ·
  // RESERVA DE EMERGÊNCIA" e "Viagem Japão · VIAGEM" são a mesma palavra duas
  // vezes. Silêncio quando não há o que dizer.
  const tipoRot = TIPO_META[g.type] || g.type || '';
  const semAcento = (s) => String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const selo = tipoRot && !semAcento(g.name).includes(semAcento(tipoRot.split(' ')[0]))
    ? `<span class="selo">${esc(tipoRot)}</span>` : '';

  return `
    <div class="guardado-meta">
      <div class="guardado-meta-topo">
        <span class="guardado-meta-nome">${esc(g.name)}</span>
        ${selo}
        <span class="guardado-meta-val">${num(atual)} <em>de ${num(alvo)}</em></span>
      </div>
      <div class="guardado-progresso ${pronta ? 'pronta' : ''}">
        <span style="width:${pct.toFixed(1)}%"></span>
      </div>
      <div class="guardado-meta-pe">
        <span>
          ${pronta
            ? '<b class="mais">Meta alcançada</b>'
            : `<b>${pct.toFixed(0)}%</b> · faltam ${num(falta)}`} · ${esc(prazo)}
        </span>
        <span class="guardado-acoes">
          ${aportes.length ? `
            <button type="button" class="guardado-toggle" data-guardado="aportes-meta" data-id="${esc(g.id)}"
              aria-expanded="false" title="Ver os aportes desta meta">${aportes.length} aporte${aportes.length === 1 ? '' : 's'} ▾</button>` : ''}
          <button type="button" class="btn btn-2 btn-xs" data-guardado="aporte-meta" data-id="${esc(g.id)}">+ Aporte</button>
          <button type="button" class="btn-icon-only" data-guardado="edit-meta" data-id="${esc(g.id)}"
            title="Editar" aria-label="Editar meta ${esc(g.name || '')}">✎</button>
          <button type="button" class="btn-icon-only danger" data-guardado="del-meta" data-id="${esc(g.id)}"
            title="Excluir" aria-label="Excluir meta ${esc(g.name || '')}">✕</button>
        </span>
      </div>
      ${linhaFonte}
      ${aportes.length ? _listaAportes(aportes, `meta-${g.id}`) : ''}
    </div>`;
}

/** Histórico de aportes, escondido por padrão. Vale para meta e para ativo. */
function _listaAportes(aportes, chave, escondido = true) {
  const origem = { statement_import: 'extrato', gasto_manual: 'gasto', manual: 'manual' };
  return `
    <div class="guardado-aportes${escondido ? ' hidden' : ''}" data-aportes="${esc(chave)}">
      ${[...aportes].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).map(ap => `
        <div class="guardado-aporte">
          <span>${esc(dataBR(ap.date))}${ap.obs ? ` · ${esc(ap.obs)}` : ''}
            ${ap.source ? `<i>(${esc(origem[ap.source] || ap.source)})</i>` : ''}</span>
          <span class="v mais">+${num(ap.amount)}</span>
        </div>`).join('')}
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════
// 3. ATIVOS
// ═══════════════════════════════════════════════════════════════════════

function _ativos(d) {
  if (!d.ativos.length) {
    return `
      <div class="folha" id="guardado-ativos">
        <div class="linha-topo">
          <div>
            <p class="rot">Onde está guardado</p>
            <p class="rot-sub" style="margin:0">Nenhum ativo ou bem cadastrado ainda.</p>
          </div>
          <button type="button" class="btn btn-2" data-guardado="novo-ativo">+ Ativo</button>
        </div>
      </div>`;
  }

  // Investimento primeiro, bem por último: é a ordem de quanto aquilo é
  // dinheiro disponível de verdade.
  const ordem = { investimento: 0, caixa: 1, bem_pessoal: 2 };
  const linhas = [...d.ativos]
    .sort((a, b) => (ordem[a.type] ?? 9) - (ordem[b.type] ?? 9) || b.valorHoje - a.valorHoje)
    .map(a => _umAtivo(a)).join('');

  return `
    <div class="folha" id="guardado-ativos">
      <div class="linha-topo">
        <div>
          <p class="rot">Onde está guardado</p>
          <p class="rot-sub" style="margin:0">Use o + para registrar um aporte e o ✎ para atualizar
            o valor atual. Bem com taxa de depreciação se atualiza sozinho.</p>
        </div>
        <button type="button" class="btn btn-2" data-guardado="novo-ativo">+ Ativo</button>
      </div>
      <div class="tabela-folha">
        <table>
          <thead><tr>
            <th>Ativo</th>
            <th class="esconde-sm">Tipo</th>
            <th class="v esconde-sm">Inicial</th>
            <th class="v">Hoje</th>
            <th class="esconde-sm">Aquisição</th>
            <th></th>
          </tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>
      <div class="rodape">
        <span>${d.ativos.length} ${d.ativos.length === 1 ? 'ativo' : 'ativos'}</span>
        <span>total <strong>${num(d.total)}</strong></span>
      </div>
    </div>`;
}

function _umAtivo(a) {
  const aportes  = a.contributions || [];
  const isInvest = a.type === 'investimento';
  const totalAp  = aportes.reduce((s, x) => s + (x.amount || 0), 0);

  // O outro lado do vínculo: o ativo diz que meta ele credita.
  const meta = a.linkedGoalId ? state.goals.find(g => g.id === a.linkedGoalId) : null;

  // Bem depreciado é dedução do app, não número declarado: `◇` + texto, como
  // em toda a interface.
  const depreciado = a.type === 'bem_pessoal' && a.depreciationRate && a.acquiredAt;

  const subs = [
    meta ? `<span class="sub">↳ credita a meta <b>${esc(meta.name)}</b></span>` : '',
    a.notes ? `<span class="sub">${esc(a.notes)}</span>` : '',
    aportes.length ? `
      <button type="button" class="guardado-toggle" data-guardado="aportes-ativo" data-id="${esc(a.id)}"
        aria-expanded="false" title="Ver os aportes deste ativo">${aportes.length} aporte${aportes.length === 1 ? '' : 's'} · ${num(totalAp)} ▾</button>` : '',
  ].join('');

  const detalhe = aportes.length ? `
    <tr class="guardado-detalhe hidden" data-aportes="ativo-${esc(a.id)}">
      <td colspan="6">${_listaAportes(aportes, `interno-${a.id}`, false)}</td>
    </tr>` : '';

  return `
    <tr>
      <td><span class="guardado-ativo-nome">${esc(a.name)}</span>${subs}</td>
      <td class="esconde-sm">
        <span class="chip-tipo" style="background:var(--${SERIE_TIPO[a.type]}-chip);color:var(--${SERIE_TIPO[a.type]})">
          ${esc(TIPO_ATIVO[a.type] || a.type)}</span>
      </td>
      <td class="v esconde-sm">${num(a.initialValue || 0)}</td>
      <td class="v">${num(a.valorHoje)}${depreciado ? '<span class="sub marca-d">depreciado</span>' : ''}</td>
      <td class="esconde-sm">${esc(dataBR(a.acquiredAt))}</td>
      <td class="guardado-acoes-td">
        ${isInvest ? `<button type="button" class="btn btn-2 btn-xs" data-guardado="aporte-ativo" data-id="${esc(a.id)}">+ Aporte</button>` : ''}
        <button type="button" class="btn-icon-only" data-guardado="edit-ativo" data-id="${esc(a.id)}"
          title="Editar" aria-label="Editar ativo ${esc(a.name || '')}">✎</button>
        <button type="button" class="btn-icon-only danger" data-guardado="del-ativo" data-id="${esc(a.id)}"
          title="Excluir" aria-label="Excluir ativo ${esc(a.name || '')}">✕</button>
      </td>
    </tr>${detalhe}`;
}

// ═══════════════════════════════════════════════════════════════════════
// 4. APORTES POR MÊS — o gráfico que veio de patrimonio.js
// ═══════════════════════════════════════════════════════════════════════

function _aportesBloco() {
  return `
    <div class="folha" id="guardado-aportes-mes">
      <p class="rot">Aportes por mês</p>
      <p class="rot-sub">Quanto entrou nos ativos em cada um dos últimos 6 meses.
        <b>Não é o valor do patrimônio no passado</b> — esse histórico o app não guarda.</p>
      <div class="guardado-chart"><canvas id="chart-guardado-aportes"></canvas></div>
    </div>`;
}

let _chartAportes = null;

// Chart.js pinta em canvas e NÃO resolve var(--…): a cor vem do token no
// momento de montar o gráfico. HEX literal aqui é regressão conhecida.
function _token(nome, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return v || fallback;
}

function _renderAportes() {
  const cv = document.getElementById('chart-guardado-aportes');
  if (!cv || typeof Chart === 'undefined') return;
  if (_chartAportes) { _chartAportes.destroy(); _chartAportes = null; }

  // Seis meses terminando no mês selecionado no topo: a tela obedece à
  // navegação de mês como todas as outras.
  const meses = [];
  for (let i = 5; i >= 0; i--) meses.push(offsetMonth(state.currentMonth, -i));

  const soma = Object.fromEntries(meses.map(m => [m, 0]));
  for (const ativo of state.assets) {
    for (const ap of (ativo.contributions || [])) {
      const m = String(ap.date || '').slice(0, 7);
      if (m in soma) soma[m] += ap.amount || 0;
    }
  }

  const tinta = _token('--ink-3', '#616B79');
  const grade = _token('--borda', '#E2E8F1');
  const valores = meses.map(m => soma[m]);
  const maxVal = Math.max(...valores, 1);

  _chartAportes = new Chart(cv, {
    type: 'bar',
    data: {
      labels: meses.map(m => monthLabel(m).split(' ')[0].slice(0, 3)),
      // Aporte é dinheiro guardado, não gasto nem receita: cor de série.
      datasets: [{ label: 'Aportes', data: valores, backgroundColor: _token('--s2', '#12915A'), borderRadius: 3 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => fmt(c.parsed.y) } },
      },
      scales: {
        x: { ticks: { color: tinta, font: { family: 'Outfit', size: 10 } }, grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: {
            color: tinta, font: { family: 'Outfit', size: 10 },
            callback: v => (maxVal >= 1000 ? `${(v / 1000).toFixed(1)}k` : v),
          },
          grid: { color: grade },
        },
      },
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════════════════════════════════

export function renderGuardado() {
  const sec = document.getElementById('tab-guardado');
  if (!sec) return;

  // Os modais moram no index.html e não são remontados: ligar uma vez basta.
  // `renderGuardado` é o callback dos dois — gravar redesenha a tela inteira.
  initMetas(renderGuardado);
  initPatrimonio(renderGuardado);
  if (!_init) { _ligarTela(sec); _init = true; }

  const d = _dados();

  sec.innerHTML = `
    <p class="page-intro">O que você já tem e para onde está indo. <b>Atualize o valor atual
      de vez em quando</b> — é o que mantém o total honesto.</p>
    ${_total(d)}
    ${_metas(d)}
    ${_ativos(d)}
    ${_aportesBloco()}`;

  _renderAportes();
}

/**
 * Um listener só, delegado na seção. A tela é reinjetada por innerHTML a cada
 * gravação: listener no elemento morre junto com o elemento.
 */
function _ligarTela(sec) {
  sec.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-guardado]');
    if (!btn) return;
    const id = btn.dataset.id;

    switch (btn.dataset.guardado) {
      case 'nova-meta':     return openMetaModal(null);
      case 'edit-meta':     return openMetaModal(state.goals.find(g => g.id === id));
      case 'aporte-meta':   return openAporteMetaModal(id);
      case 'del-meta':      { await excluirMeta(id); return; }
      case 'novo-ativo':    return openAtivoModal(null);
      case 'edit-ativo':    return openAtivoModal(state.assets.find(a => a.id === id));
      case 'aporte-ativo':  return openAporteAtivoModal(id);
      case 'del-ativo':     { await excluirAtivo(id); return; }
      case 'aportes-meta':  return _alternar(sec, `meta-${id}`, btn);
      case 'aportes-ativo': return _alternar(sec, `ativo-${id}`, btn);
    }
  });
}

/** Abre/fecha o histórico de aportes. O `▾ / ▴` é o segundo canal do estado. */
function _alternar(sec, chave, btn) {
  const alvo = sec.querySelector(`[data-aportes="${CSS.escape(chave)}"]`);
  if (!alvo) return;
  const vaiAbrir = alvo.classList.contains('hidden');
  alvo.classList.toggle('hidden', !vaiAbrir);
  btn.setAttribute('aria-expanded', String(vaiAbrir));
  btn.textContent = vaiAbrir
    ? btn.textContent.replace('▾', '▴')
    : btn.textContent.replace('▴', '▾');
}
