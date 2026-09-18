(function(){
/* ═══════════════════════════════════════════════════════════════
   RADAR — redesign, etapa 3
   Shell comum aos mockups de tela. JS puro, script clássico, sem build —
   mesma restrição do app real.

   Script clássico e não ES module de propósito: estes arquivos precisam
   abrir por duplo clique, e o Chrome bloqueia import de módulo sobre
   file://. Publica window.Radar; cada 03-*.html chama Radar.mount:

     Radar.mount({
       tab:    'gastos',              // id da aba (marca a sidebar)
       title:  'Gastos',              // título da topbar
       states: { dados, vazio, carregando },   // HTML de cada estado
       modals: '',                    // HTML dos modais (opcional)
       onRender(estado, root) {}      // gráficos etc. (opcional)
     })
════════════════════════════════════════════════════════════════ */

const NAV = [
  ['Este mês', [
    ['dashboard',  'Visão do mês', 'grid'],
    ['gastos',     'Gastos',       'card'],
    ['receitas',   'Receitas',     'cifra'],
    ['extratos',   'Extratos',     'doc', '3'],
  ]],
  ['O que vem', [
    ['calendario', 'Fluxo de Caixa', 'curva'],
    ['orcamento',  'Orçamento',      'barras'],
  ]],
  ['Longo prazo', [
    ['metas',      'Metas',      'alvo'],
    ['patrimonio', 'Patrimônio', 'casa'],
  ]],
  ['Registro', [
    ['timeline',      'Timeline',      'linha'],
    ['relatorios',    'Relatórios',    'doc'],
    ['configuracoes', 'Configurações', 'engrenagem'],
  ]],
];

const ICON = {
  grid:  '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  card:  '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
  cifra: '<path d="M12 2v20M17 7H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  doc:   '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/>',
  curva: '<path d="M3 17l5-6 4 4 5-8"/><path d="M3 21h18"/>',
  barras:'<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>',
  alvo:  '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  casa:  '<path d="M3 21h18M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/>',
  linha: '<line x1="12" y1="3" x2="12" y2="21"/><circle cx="12" cy="8" r="2"/><circle cx="12" cy="16" r="2"/>',
  engrenagem:'<circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/>',
};
const svg = (n, s = 15) =>
  `<svg width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="2"
     stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24">${ICON[n] || ''}</svg>`;

/* Formatador único — todo valor em reais na tela passa por aqui. */
const fmt = v => 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt0 = v => 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 });

/* Lê um token do CSS aplicado. Chart.js é canvas e não resolve var(--…):
   toda cor passada ao gráfico vem daqui já resolvida. */
const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

const MESES = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

function sidebarHTML(active) {
  const grupos = NAV.map(([label, itens]) => {
    const links = itens.map(([id, nome, icone, badge]) => {
      const cls = id === active ? 'sb-link active' : 'sb-link';
      const b = badge ? `<span class="sb-badge">${badge}</span>` : '';
      return `<a class="${cls}" href="03-${id}.html">${svg(icone)}${nome}${b}</a>`;
    }).join('');
    return `<div class="sb-group"><div class="sb-label">${label}</div>${links}</div>`;
  }).join('');

  return `<aside class="sidebar">
    <div class="sb-head"><div class="sb-logo">◈</div><div class="sb-name">Radar</div></div>
    <nav class="sb-nav">${grupos}</nav>
    <div class="sb-foot">
      <div class="sb-av">F</div>
      <div><div class="sb-u1">Fernanda</div><div class="sb-u2">Conta pessoal</div></div>
    </div>
  </aside>`;
}

function tabbarHTML(active) {
  const itens = [['dashboard','Mês','grid'],['gastos','Gastos','card'],['calendario','Fluxo','curva'],['orcamento','Orçam.','barras']];
  return `<nav class="tabbar">${itens.map(([id,n,i]) =>
    `<a href="03-${id}.html" class="${id===active?'active':''}">${svg(i,17)}${n}</a>`).join('')}</nav>`;
}

function mockbarHTML(title) {
  return `<div class="mockbar">
    <span class="tag">mockup</span>
    <span class="ttl">${title}</span>
    <a href="index.html">← todas as telas</a>
    <button class="icon-btn" id="btn-fn">Conferência</button>
    <span class="sp"></span>
    <div class="seg" role="group" aria-label="Estado">
      <button data-state="dados" aria-pressed="true">Com dados</button>
      <button data-state="vazio" aria-pressed="false">Vazio</button>
      <button data-state="carregando" aria-pressed="false">Carregando</button>
    </div>
    <div class="seg" role="group" aria-label="Largura">
      <button data-w="desk" aria-pressed="true">Desktop</button>
      <button data-w="mob" aria-pressed="false">390px</button>
    </div>
    <div class="seg" role="group" aria-label="Tema">
      <button data-t="light" aria-pressed="true">Claro</button>
      <button data-t="dark" aria-pressed="false">Escuro</button>
    </div>
  </div>`;
}

function mount(S) {
  const mes = S.month || { i: 7, ano: 2026 };
  document.body.insertAdjacentHTML('afterbegin', `
    ${mockbarHTML(S.title)}
    <div class="app">
      ${sidebarHTML(S.tab)}
      <div class="main">
        <div class="topbar">
          <h1>${S.title}</h1>
          <div class="monthnav">
            <button aria-label="Mês anterior">‹</button>
            <span class="lbl">${MESES[mes.i]} ${mes.ano}</span>
            <button aria-label="Próximo mês">›</button>
          </div>
          <span class="sp"></span>
          ${S.topbarExtra || ''}
          <button class="icon-btn" id="btn-cmd">Buscar <span class="kbd">Ctrl K</span></button>
        </div>
        <div class="screen" id="screen-wrap">
          ${S.intro ? `<p class="page-intro">${S.intro}</p>` : ''}
          <div id="screen"></div>
        </div>
        ${tabbarHTML(S.tab)}
      </div>
    </div>
    ${S.modals || ''}
    <aside class="fnpanel" id="fnpanel" hidden></aside>
    <div class="modal" id="cmd-modal" hidden>
      <div class="modal-box" style="width:min(520px,94vw);align-self:start;margin-top:12vh">
        <div class="modal-head"><input class="form-input" placeholder="Ir para…  (Ctrl/Cmd+K)" autofocus></div>
        <div class="modal-body" style="padding-top:8px">
          <ul class="cmd-list">${NAV.flatMap(([g, itens]) =>
            itens.map(([id, nome], k) =>
              `<li class="${id === 'gastos' ? 'sel' : ''}">${svg('grid')}${nome}<span class="grp">${g}</span></li>`)
          ).join('')}</ul>
        </div>
      </div>
    </div>`);

  const screen = document.getElementById('screen');

  function show(estado) {
    screen.innerHTML = S.states[estado] || '';
    document.querySelectorAll('[data-state]').forEach(b =>
      b.setAttribute('aria-pressed', b.dataset.state === estado));
    if (S.onRender) S.onRender(estado, screen);
  }

  document.querySelectorAll('[data-state]').forEach(b => b.onclick = () => show(b.dataset.state));
  document.querySelectorAll('[data-w]').forEach(b => b.onclick = () => {
    document.body.classList.toggle('mobile', b.dataset.w === 'mob');
    document.querySelectorAll('[data-w]').forEach(x => x.setAttribute('aria-pressed', x === b));
    const est = document.querySelector('[data-state][aria-pressed="true"]').dataset.state;
    show(est);
  });
  document.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    document.documentElement.dataset.theme = b.dataset.t;
    document.querySelectorAll('[data-t]').forEach(x => x.setAttribute('aria-pressed', x === b));
    const est = document.querySelector('[data-state][aria-pressed="true"]').dataset.state;
    show(est);   // re-render: o gráfico é canvas e não reage à troca de tokens
  });

  // Modais: [data-open] abre, [data-close] e o fundo fecham.
  document.body.addEventListener('click', e => {
    const o = e.target.closest('[data-open]');
    if (o) {
      // Um botão pode abrir o próximo passo e fechar o atual (passo 1 → revisão).
      o.closest('.modal') && (o.closest('.modal').hidden = true);
      document.getElementById(o.dataset.open).hidden = false;
      return;
    }
    const c = e.target.closest('[data-close]');
    if (c) { c.closest('.modal').hidden = true; return; }
    if (e.target.classList.contains('modal')) e.target.hidden = true;
  });
  document.getElementById('btn-fn').onclick = () => { const p = document.getElementById('fnpanel'); p.hidden = !p.hidden; };
  document.getElementById('btn-cmd').onclick = () => document.getElementById('cmd-modal').hidden = false;
  addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault(); document.getElementById('cmd-modal').hidden = false;
    }
    if (e.key === 'Escape') document.querySelectorAll('.modal').forEach(m => m.hidden = true);
  });

  show('dados');
}

/* Linhas de skeleton — o app real já mostra skeleton por KPI e por tabela. */
const skKpis = (n = 4) => `<div class="kpi-grid">${Array.from({length:n}, () =>
  `<div class="kpi"><span class="sk sk-line" style="width:45%"></span>
   <span class="sk sk-line" style="height:22px;width:75%"></span>
   <span class="sk sk-line" style="width:60%"></span></div>`).join('')}</div>`;

const skTable = (rows = 6, cols = 4) => `<div class="card">
  <div class="card-head"><span class="sk sk-line" style="width:130px"></span></div>
  <table class="data"><tbody>${Array.from({length:rows}, () =>
    `<tr>${Array.from({length:cols}, (_, i) =>
      `<td><span class="sk sk-line" style="width:${[55,85,60,45][i % 4]}%"></span></td>`).join('')}</tr>`).join('')}
  </tbody></table></div>`;

const skChart = (h = 200) => `<div class="card">
  <div class="card-head"><span class="sk sk-line" style="width:120px"></span></div>
  <div class="sk" style="height:${h}px"></div></div>`;

const skRing = () => `<div class="card">
  <div class="card-head"><span class="sk sk-line" style="width:120px"></span></div>
  <span class="sk sk-ring"></span>
  ${Array.from({length:4}, () => '<span class="sk sk-line" style="width:100%"></span>').join('')}</div>`;

/* Checklist de funções — todo mockup termina com a conferência
   contra o módulo js/ correspondente, como o briefing pede. */
/* A conferência é metadado do mockup, não faz parte da tela. Se ficar no
   fluxo, ela sozinha obriga a rolar a página — o oposto do que a tela
   precisa ser. Vai para um painel lateral, aberto pelo botão da barra
   cinza. Por isso esta função devolve string vazia: quem chama continua
   fazendo insertAdjacentHTML e não insere nada. */
function checklist(modulo, linhas) {
  const alvo = document.getElementById('fnpanel');
  if (alvo) {
    alvo.innerHTML = checklistHTML(modulo, linhas);
    const faltam = linhas.filter(l => l[2] === false).length;
    const btn = document.getElementById('btn-fn');
    if (btn) btn.textContent = faltam
      ? `Conferência · ${faltam} sem desenho`
      : `Conferência · ${linhas.length} funções`;
  }
  return '';
}

function checklistHTML(modulo, linhas) {
  const rows = linhas.map(([fn, desc, onde]) => {
    const ok = onde !== false;
    return `<tr><td>${fn}</td><td>${desc}</td>
      <td class="${ok ? 'yes' : 'no'}">${ok ? onde : 'FALTA DESENHAR'}</td></tr>`;
  }).join('');
  const faltam = linhas.filter(l => l[2] === false).length;
  return `<section class="fnlist">
    <h2>Conferência contra <code>${modulo}</code></h2>
    <p class="lede">Toda função que a aba tem hoje, lida do módulo, e onde ela aparece neste mockup.
      ${faltam ? `<strong class="no">${faltam} sem representação.</strong>` : 'Nenhuma função ficou de fora.'}</p>
    <table class="fn"><thead><tr><th style="width:26%">Função / controle</th><th>O que faz</th><th style="width:30%">Onde está no mockup</th></tr></thead>
    <tbody>${rows}</tbody></table>
  </section>`;
}

/* ═══════════ estilo comum dos gráficos ═══════════
   Chart.js sai "de fábrica" com grade dura, eixos com borda, legenda em
   caixinha e tooltip preta padrão — é boa parte do que fazia os gráficos
   parecerem feios. Estas duas funções concentram o acabamento:

   - grade só na horizontal, tracejada e clara; nenhuma borda de eixo;
   - rótulo sem excesso, na cor terciária;
   - tooltip na superfície do tema, com canto macio e valor formatado;
   - linha grossa com ponto só no hover, e área com degradê que morre no fundo.

   As cores continuam vindo de tok(): canvas não resolve var(--…). */
function chartBase(extra = {}) {
  const grid = tok('--border'), t3 = tok('--text-3'), t1 = tok('--text-1'), surf = tok('--surface');
  const font = { family: "'Nunito', system-ui, sans-serif", size: 11.5, weight: '600' };
  return {
    responsive: true, maintainAspectRatio: false,
    layout: { padding: { top: 6, right: 6 } },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: surf, titleColor: t1, bodyColor: t1,
        borderColor: grid, borderWidth: 1, cornerRadius: 10,
        padding: 11, boxPadding: 5, displayColors: true, usePointStyle: true,
        titleFont: { ...font, size: 12 }, bodyFont: { ...font, weight: '400' },
        callbacks: { label: c => ' ' + (c.dataset.label ? c.dataset.label + ': ' : '') + fmt(c.parsed.y ?? c.parsed) },
      },
      ...(extra.plugins || {}),
    },
    scales: extra.scales === null ? undefined : {
      x: { grid: { display: false }, border: { display: false },
           ticks: { color: t3, font, maxRotation: 0, autoSkipPadding: 14 } },
      y: { grid: { color: grid, drawTicks: false, tickBorderDash: [3, 4] },
           border: { display: false },
           ticks: { color: t3, font, padding: 8, maxTicksLimit: 6,
                    callback: v => v >= 1000 || v <= -1000 ? (v / 1000).toLocaleString('pt-BR') + 'k' : v } },
      ...(extra.scales || {}),
    },
  };
}

/* Degradê vertical para a área sob uma linha: forte em cima, some embaixo. */
function fade(ctx, hex, forte = 0.22) {
  const a = ctx.chart.chartArea;
  if (!a) return 'transparent';
  const g = ctx.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
  const rgb = hex.replace('#','').match(/../g).map(h => parseInt(h,16)).join(',');
  g.addColorStop(0, `rgba(${rgb},${forte})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  return g;
}

/* Linha padrão: grossa, macia, sem ponto até o hover. */
function linha(label, data, cor, { area = true, tracejada = false } = {}) {
  return {
    label, data, borderColor: cor, borderWidth: 2.5, tension: 0.35,
    pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 2.5,
    pointHoverBackgroundColor: tok('--surface'), pointHoverBorderColor: cor,
    borderDash: tracejada ? [6, 5] : undefined,
    fill: area, backgroundColor: area ? (ctx => fade(ctx, cor)) : 'transparent',
  };
}

window.Radar = { NAV, fmt, fmt0, tok, mount, checklist, skKpis, skTable, skChart, skRing,
                 chartBase, fade, linha };
})();
