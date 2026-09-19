/**
 * gerar-relatorio.mjs — monta o HTML do relatório e imprime em PDF.
 *
 *   node docs/security-audit/gerar-relatorio.mjs
 *
 * SEM DEPENDÊNCIA NENHUMA, de propósito: o projeto não tem package.json e a
 * regra da casa é não abrir um. O PDF sai do Chrome/Edge que já está instalado,
 * dirigido por CDP com o WebSocket nativo do Node 22+. Os gráficos são SVG
 * escrito à mão pelo mesmo motivo — matplotlib exigiria um venv Python.
 *
 * Cabeçalho e rodapé vêm do `displayHeaderFooter` do Page.printToPDF: é o
 * único jeito de ter número de página em Chrome headless, porque as margin
 * boxes do CSS Paged Media (@page { @bottom-center }) não são suportadas.
 */

import { writeFileSync, existsSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { PROJETO, DATA, CORES, ROTULO_SEV, CATEGORIAS, ACHADOS, FORTES, RECOMENDACOES }
  from './dados-auditoria.mjs';
import { ISSUES } from './issues-github.mjs';

const AQUI  = dirname(fileURLToPath(import.meta.url));
const HTML  = join(AQUI, 'relatorio.html');
const PDF   = join(AQUI, 'relatorio-auditoria-seguranca.pdf');
const TITULO = `Relatório de Auditoria de Segurança — ${PROJETO}`;

// ─── CONTAGENS ──────────────────────────────────────────────────────────────
const SEVS = ['critica', 'alta', 'media', 'baixa', 'informativa'];
const porSev = Object.fromEntries(SEVS.map(s => [s, ACHADOS.filter(a => a.sev === s).length]));
const porCat = CATEGORIAS.map(c => ({
  ...c, n: ACHADOS.filter(a => a.cat === c.id).length,
}));
// Informativa não tem cor na paleta pedida: fica em cinza, e o cinza é o que
// diz "isto não pede ação" sem precisar de legenda.
const corSev = s => CORES[s] || '#64748B';

// ─── GRÁFICO DE ROSCA ───────────────────────────────────────────────────────
// SVG à mão. A rosca NUNCA vem sozinha: a legenda ao lado nomeia cada fatia
// com número — cor não é o único canal.
function rosca() {
  const itens = SEVS.map(s => ({ s, n: porSev[s] })).filter(i => i.n > 0);
  const total = itens.reduce((a, i) => a + i.n, 0);
  const R = 78, r = 48, CX = 100, CY = 100;
  let ang = -Math.PI / 2;
  const fatias = itens.map(({ s, n }) => {
    const passo = (n / total) * Math.PI * 2;
    const a0 = ang, a1 = ang + passo;
    ang = a1;
    // Um único item viraria um arco degenerado (a0 === a1): desenha anel cheio.
    if (itens.length === 1) {
      return `<circle cx="${CX}" cy="${CY}" r="${(R + r) / 2}" fill="none"
                stroke="${corSev(s)}" stroke-width="${R - r}" />`;
    }
    const p = (ra, a) => `${(CX + ra * Math.cos(a)).toFixed(2)},${(CY + ra * Math.sin(a)).toFixed(2)}`;
    const grande = passo > Math.PI ? 1 : 0;
    return `<path d="M ${p(R, a0)} A ${R} ${R} 0 ${grande} 1 ${p(R, a1)}
              L ${p(r, a1)} A ${r} ${r} 0 ${grande} 0 ${p(r, a0)} Z"
              fill="${corSev(s)}" />`;
  }).join('');

  const legenda = itens.map(({ s, n }) => `
    <li><i style="background:${corSev(s)}"></i>${ROTULO_SEV[s]}
      <b>${n}</b><span>${Math.round((n / total) * 100)}%</span></li>`).join('');

  return `
    <div class="gfx">
      <svg viewBox="0 0 200 200" role="img" aria-label="Achados por severidade">
        ${fatias}
        <text x="100" y="96" class="rosca-n">${total}</text>
        <text x="100" y="116" class="rosca-rot">achados</text>
      </svg>
      <ul class="legenda">${legenda}</ul>
    </div>`;
}

// ─── GRÁFICO DE BARRAS ──────────────────────────────────────────────────────
// Barra horizontal: o rótulo da categoria é uma frase, e frase não cabe deitada
// sob uma barra vertical sem virar texto rotacionado.
function barras() {
  const max = Math.max(1, ...porCat.map(c => c.n));
  return `<ul class="barras">${porCat.map(c => {
    const pct = (c.n / max) * 100;
    const cor = c.n === 0 ? CORES.forte : CORES.media;
    return `
      <li>
        <span class="barras-rot">${c.id}. ${c.nome}</span>
        <span class="barras-trilho">
          <span class="barras-barra" style="width:${Math.max(pct, c.n ? 6 : 2)}%;background:${cor}"></span>
        </span>
        <span class="barras-n" style="color:${cor}">${c.n}</span>
      </li>`;
  }).join('')}</ul>`;
}

const chip = s => `<span class="chip" style="background:${corSev(s)}">${ROTULO_SEV[s]}</span>`;

// ─── O QUE FOI FEITO DEPOIS DA AUDITORIA ────────────────────────────────────
// O bloco aparece DENTRO do achado, logo abaixo da correção sugerida, e não
// numa seção de "pendências" no fim: quem lê o achado quer saber ali mesmo se
// ele ainda vale. Achado sem `fechado` não desenha nada — é o estado de quem
// nunca foi revisitado, e um selo "não fechado" em cima dele mentiria sobre ter
// havido revisão.
const ESTADO = {
  sim:     { rot: 'Corrigido',            cor: CORES.forte },
  parcial: { rot: 'Corrigido em parte',   cor: CORES.media },
  nao:     { rot: 'Aberto',               cor: CORES.alta  },
  na:      { rot: 'Revisto — sem ação',   cor: '#64748B'   },
};

function estado(a) {
  const e = ESTADO[a.fechado];
  if (!e) return '';
  return `<div class="estado" style="border-left-color:${e.cor}">
      <span class="estado-selo" style="background:${e.cor}">${e.rot}</span>
      <span class="estado-data">${a.fechadoEm}</span>
      <p>${a.fechadoNota}</p>
    </div>`;
}

// ─── TABELA DE ACHADOS POR CATEGORIA ────────────────────────────────────────
function tabelaAchados() {
  return CATEGORIAS.map(c => {
    const meus = ACHADOS.filter(a => a.cat === c.id);
    if (!meus.length) {
      return `
        <div class="cat-bloco">
          <h3>${c.id}. ${c.nome} <span class="cat-zero">nenhum achado</span></h3>
          <p class="cat-map">${c.mapeamento}</p>
        </div>`;
    }
    const linhas = meus.map(a => `
      <tr>
        <td class="col-sev">${chip(a.sev)}</td>
        <td class="col-arq">${a.arquivos.map(f => `<code>${f}</code>`).join('<br/>')}</td>
        <td class="col-desc">
          <b>${a.id} · ${a.titulo}</b>
          <p>${a.descricao}</p>
          <pre>${esc(a.trecho)}</pre>
          <p><span class="rot-mini">Por que é explorável</span> ${a.explorabilidade}</p>
          <p><span class="rot-mini">Condição</span> ${a.condicao}</p>
          <p><span class="rot-mini">Impacto</span> ${a.impacto}</p>
          <p><span class="rot-mini">Correção</span> ${a.correcao}</p>
          ${estado(a)}
        </td>
      </tr>`).join('');
    return `
      <div class="cat-bloco">
        <h3>${c.id}. ${c.nome} <span class="cat-n">${meus.length}</span></h3>
        <p class="cat-map">${c.mapeamento}</p>
        <table class="achados">
          <!-- As larguras moram no <colgroup>, não nas classes dos <td>: com
               \`table-layout: fixed\` o navegador resolve a coluna pela PRIMEIRA
               linha, que é o <thead> — e os <th> não têm classe. Medido: sem
               isto a coluna "Descrição" ficava com um terço da tabela e o texto
               do achado descia por três folhas numa coluna de 5 cm. -->
          <colgroup><col class="c-sev" /><col class="c-arq" /><col /></colgroup>
          <thead><tr><th>Severidade</th><th>Arquivo:linha</th><th>Descrição</th></tr></thead>
          <tbody>${linhas}</tbody>
        </table>
      </div>`;
  }).join('');
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── HTML ───────────────────────────────────────────────────────────────────
const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8" /><title>${TITULO}</title>
<style>
  @page { size: A4; margin: 2cm 2cm 2cm 2cm; }
  :root {
    --ink: #16202E; --ink2: #3D4A5C; --ink3: #64748B;
    --borda: #E2E8F1; --folha: #FFFFFF; --fundo: #F6F7F9;
    --critica:${CORES.critica}; --alta:${CORES.alta}; --media:${CORES.media};
    --baixa:${CORES.baixa}; --forte:${CORES.forte};
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    color: var(--ink); font-size: 9.6pt; line-height: 1.5; margin: 0;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  h1,h2,h3,h4 { margin: 0 0 .4em; line-height: 1.25; }
  h2 { font-size: 15pt; padding-bottom: .3em; border-bottom: 2px solid var(--borda);
       margin-top: 0; }
  h3 { font-size: 11.5pt; margin-top: 1.4em; }
  p  { margin: 0 0 .6em; }
  code { font-family: Consolas, "Courier New", monospace; font-size: .88em;
         background: var(--fundo); padding: .08em .3em; border-radius: 3px; }
  pre { font-family: Consolas, "Courier New", monospace; font-size: 7.6pt;
        background: #F2F4F7; border-left: 3px solid var(--ink3);
        padding: .55em .7em; border-radius: 0 4px 4px 0; overflow-wrap: break-word;
        white-space: pre-wrap; margin: .5em 0; line-height: 1.45; }
  .quebra { page-break-before: always; }
  section { page-break-inside: auto; }

  /* ── CAPA ───────────────────────────────────────────────────────────── */
  .capa { height: 24.3cm; display: flex; flex-direction: column;
          page-break-after: always; }
  .capa-losango { width: 34px; height: 34px; background: #7A2E52;
                  transform: rotate(45deg); margin-bottom: 1.4cm; }
  .capa h1 { font-size: 25pt; letter-spacing: -.5px; max-width: 15cm; }
  .capa .sub { font-size: 12pt; color: var(--ink3); margin-top: .5em; }
  .capa-meta { margin-top: auto; border-top: 2px solid var(--borda); padding-top: 1em; }
  .capa-meta dl { display: grid; grid-template-columns: 4.2cm 1fr; gap: .45em 0; margin: 0; }
  .capa-meta dt { color: var(--ink3); font-size: 8.6pt; text-transform: uppercase;
                  letter-spacing: .05em; padding-top: .15em; }
  .capa-meta dd { margin: 0; }
  .capa-nota { background: var(--fundo); border-radius: 8px; padding: .9em 1.1em;
               margin-top: 1em; font-size: 8.4pt; line-height: 1.42; color: var(--ink2); }
  .capa-nota ol { margin: .5em 0 0; padding-left: 1.2em; }
  .capa-nota li { margin-bottom: .35em; }

  /* ── RESUMO ─────────────────────────────────────────────────────────── */
  .placar { display: flex; gap: 8px; margin: 1em 0 1.4em; }
  .placar div { flex: 1; border: 1px solid var(--borda); border-radius: 8px;
                padding: .6em .5em; text-align: center; }
  .placar b { display: block; font-size: 19pt; line-height: 1.1; }
  .placar span { font-size: 8pt; color: var(--ink3); }

  .gfx { display: flex; align-items: center; gap: 1.2cm; }
  .gfx svg { width: 4.6cm; height: 4.6cm; flex: none; }
  .rosca-n   { font-size: 30px; font-weight: 700; text-anchor: middle; fill: #16202E; }
  .rosca-rot { font-size: 11px; text-anchor: middle; fill: #64748B;
               letter-spacing: .06em; text-transform: uppercase; }
  .legenda { list-style: none; margin: 0; padding: 0; flex: 1; }
  .legenda li { display: flex; align-items: center; gap: .5em; padding: .3em 0;
                border-bottom: 1px solid var(--borda); }
  .legenda i { width: 11px; height: 11px; border-radius: 3px; flex: none; }
  .legenda b { margin-left: auto; }
  .legenda span { width: 3.1em; text-align: right; color: var(--ink3); font-size: 8.4pt; }

  .barras { list-style: none; margin: .6em 0 0; padding: 0; }
  .barras li { display: grid; grid-template-columns: 7.4cm 1fr 1.1em;
               align-items: center; gap: .6em; padding: .3em 0; }
  .barras-rot { font-size: 8.8pt; }
  .barras-trilho { background: var(--fundo); border-radius: 4px; height: 13px; }
  .barras-barra { display: block; height: 13px; border-radius: 4px; }
  .barras-n { font-weight: 700; text-align: right; font-size: 9.5pt; }

  /* ── FORTES / FRACOS ────────────────────────────────────────────────── */
  .fortes { list-style: none; margin: 0; padding: 0; }
  .fortes li { border-left: 3px solid var(--forte); padding: .35em 0 .5em .7em;
               margin-bottom: .55em; page-break-inside: avoid; }
  .fortes b { display: block; }
  .fortes span { color: var(--ink2); font-size: 8.7pt; }
  .fracos { list-style: none; margin: 0; padding: 0; }
  .fracos li { display: grid; grid-template-columns: 2.4cm 1fr; gap: .7em;
               align-items: start; padding: .5em 0; border-bottom: 1px solid var(--borda);
               page-break-inside: avoid; }

  /* ── ACHADOS ────────────────────────────────────────────────────────── */
  .cat-bloco { margin-bottom: 1.3em; }
  .cat-bloco h3 { display: flex; align-items: center; gap: .55em; }
  .cat-n { background: var(--media); color: #fff; font-size: 8pt; font-weight: 700;
           border-radius: 10px; padding: .05em .6em; }
  .cat-zero { background: var(--forte); color: #fff; font-size: 7.6pt; font-weight: 600;
              border-radius: 10px; padding: .12em .6em; text-transform: uppercase;
              letter-spacing: .04em; }
  .cat-map { color: var(--ink2); font-size: 8.8pt; background: var(--fundo);
             border-radius: 6px; padding: .6em .8em; }
  table.achados { width: 100%; border-collapse: collapse; table-layout: fixed; }
  table.achados th { background: #2B3444; color: #fff; font-size: 8pt; text-align: left;
                     padding: .45em .6em; text-transform: uppercase; letter-spacing: .05em; }
  table.achados td { border-bottom: 1px solid var(--borda); padding: .7em .6em;
                     vertical-align: top; }
  col.c-sev { width: 2.2cm; }

  /* ── Estado pós-auditoria ─────────────────────────────────────────────
     Fundo cinza e barra colorida à esquerda: o bloco precisa se distinguir
     do texto do achado sem competir com o chip de severidade, que é o que
     organiza a página. A cor vem da barra, não do fundo. */
  .estado { background: var(--fundo); border-left: 3px solid var(--ink3);
            padding: .55em .7em; border-radius: 0 4px 4px 0; margin: .7em 0 0; }
  .estado-selo { display: inline-block; color: #fff; font-size: 7.4pt;
                 font-weight: 700; letter-spacing: .02em; text-transform: uppercase;
                 padding: .15em .5em; border-radius: 3px; vertical-align: middle; }
  .estado-data { color: var(--ink3); font-size: 8pt; margin-left: .5em;
                 vertical-align: middle; }
  .estado p { margin: .45em 0 0; font-size: 8.8pt; color: var(--ink2); }
  col.c-arq { width: 3.9cm; }
  .col-arq  { font-size: 7.7pt; overflow-wrap: break-word; }
  .col-arq code { background: none; padding: 0; }
  .col-desc p { margin: .45em 0 0; }
  .chip { display: inline-block; color: #fff; font-size: 7.6pt; font-weight: 700;
          border-radius: 10px; padding: .15em .7em; white-space: nowrap; }
  .rot-mini { display: inline-block; font-size: 7.4pt; font-weight: 700;
              text-transform: uppercase; letter-spacing: .05em; color: var(--ink3); }

  /* ── RECOMENDAÇÕES ──────────────────────────────────────────────────── */
  .recs { list-style: none; margin: 0; padding: 0; counter-reset: r; }
  .recs li { display: grid; grid-template-columns: 1.5cm 1fr; gap: .7em;
             padding: .7em 0; border-bottom: 1px solid var(--borda);
             page-break-inside: avoid; }
  .recs .p { background: #7A2E52; color: #fff; font-weight: 700; text-align: center;
             border-radius: 6px; padding: .2em 0; height: 1.9em; font-size: 9.5pt; }
  .recs b { display: block; }
  .recs .ref { color: var(--ink3); font-size: 8pt; }

  /* ── ISSUES ─────────────────────────────────────────────────────────── */
  /* Sem page-break-inside: avoid — uma issue passa de uma folha, e o pedido
     seria ignorado pelo Chrome depois de empurrar a issue inteira para a
     página seguinte, deixando um buraco branco no meio do relatório. */
  .issue { margin-bottom: 1.1em; }
  .issue-delim { font-family: Consolas, monospace; font-size: 8pt; font-weight: 700;
                 color: var(--ink3); letter-spacing: .05em; }
  .issue pre { background: #FBFCFD; border: 1px solid var(--borda); border-left: 3px solid #7A2E52;
               font-size: 7.3pt; padding: .8em .9em; border-radius: 0 4px 4px 0; }
</style></head><body>

<!-- ── CAPA ──────────────────────────────────────────────────────────── -->
<div class="capa">
  <div class="capa-losango"></div>
  <h1>Relatório de Auditoria de Segurança</h1>
  <p class="sub">${PROJETO}</p>

  <div class="capa-meta">
    <dl>
      <dt>Data</dt><dd>${DATA}</dd>
      <dt>Stack detectada</dt>
      <dd>JavaScript puro com ES modules, sem build step e sem dependências.
          Firebase Auth (Google, <code>signInWithPopup</code>) + Cloud Firestore.
          Hospedagem estática na Vercel. Sem backend próprio, sem ORM, sem Docker.
          <b>Sem CI no momento da auditoria</b> — a rodada de correções do mesmo
          dia acrescentou um workflow, que publica as regras do Firestore e nada
          mais; o app continua sem build step.</dd>
      <dt>Escopo auditado</dt>
      <dd>25 módulos em <code>js/</code> (inclusive <code>js/parsers/</code>),
          <code>index.html</code>, <code>ferramentas/dump-fatura.html</code>,
          <code>firestore.rules</code>, <code>vercel.json</code>,
          <code>.gitignore</code>, os quatro <code>tmp-*.js</code> versionados e
          os 94 commits do histórico.</dd>
      <dt>Achados</dt>
      <dd>${ACHADOS.length} no total — ${porSev.alta} alta, ${porSev.media} média,
          ${porSev.baixa} baixa, ${porSev.informativa} informativa.
          Nenhum crítico. ${FORTES.length} pontos fortes verificados.</dd>
    </dl>
  </div>

  <div class="capa-nota">
    <b>Nota metodológica.</b> As cinco categorias pedidas pressupõem um backend com
    rotas e um banco relacional. Este projeto não tem nenhum dos dois: o cliente
    fala direto com o Firestore. Cada categoria foi traduzida antes de ser
    procurada, e a tradução está impressa no início de cada bloco de achados.
    <ol>
      <li><b>Isolamento de dono</b> → o caminho <code>users/{uid}/…</code> montado
        no cliente, mais as regras do Firestore. Os dois foram auditados.</li>
      <li><b>Permissão no navegador</b> → não há papéis nem área administrativa.
        A pergunta virou: que regra o app aplica só na interface e o servidor não
        repete?</li>
      <li><b>IDOR</b> → acesso direto a documento por id, já que não há rota HTTP.</li>
      <li><b>Chaves expostas</b> → código servido, configs, scripts versionados e
        histórico git; não há <code>.env</code>, Docker, Helm nem CI.</li>
      <li><b>Inputs sem tratamento</b> → as 61 ocorrências de <code>innerHTML</code>
        e a função <code>esc()</code> que é a única defesa do projeto, mais as
        saídas em arquivo (CSV e backup).</li>
    </ol>
    Só entrou no relatório o que foi lido no código. O achado A1 depende de um
    estado fora do repositório e está marcado como não verificável aqui.
  </div>
</div>

<!-- ── RESUMO EXECUTIVO ──────────────────────────────────────────────── -->
<section>
  <h2>Resumo executivo</h2>
  <p>O projeto está <b>bem defendido no que depende do código</b>. Não foi encontrado
     nenhum XSS: a disciplina de <code>esc()</code> em toda interpolação de
     <code>innerHTML</code> se sustentou nas 61 ocorrências verificadas. Não há IDOR:
     o uid vem sempre do token, nunca de entrada. As regras do Firestore, como estão
     escritas no arquivo, isolam corretamente cada usuário e ainda validam campo a
     campo.</p>
  <p>O risco central está <b>fora do código</b>: essas regras não têm caminho de
     publicação automatizado, e nada no repositório prova que o que está publicado é
     o que está escrito. Abaixo dele, dois achados de severidade média em pontos que
     saem da fronteira do app — o CSV que vai para a planilha e os dois scripts que
     entram de CDN sem verificação de integridade.</p>

  <div class="estado" style="border-left-color:${CORES.forte}">
    <span class="estado-selo" style="background:${CORES.forte}">Correções aplicadas</span>
    <span class="estado-data">19/09/2026, no mesmo dia da auditoria</span>
    <p><b>Os dois achados de severidade média estão fechados.</b> O CSV neutraliza
       fórmula (A2, fixado por <code>test/csv.test.mjs</code>) e os três scripts de
       CDN carregam com Subresource Integrity (A3, verificado no navegador, inclusive
       que um hash errado bloqueia). O de severidade alta ganhou o que lhe faltava:
       <code>firebase.json</code>, um workflow que testa as regras contra o emulador
       e as publica a cada merge na <code>main</code>, e uma suíte de 11 casos que
       fixa o isolamento por dono (A1) — <b>fica parcial</b> só porque o que está
       publicado no console não se verifica a partir do repositório.
       <code>img-src</code> foi fechado; <code>style-src</code> segue aberto, com o
       custo medido (100 atributos <code>style=</code>) e registrado na issue 6 (A4).
       A5 é conferência de console e não tem linha de código a mudar; A6 foi revisto
       e deliberadamente não mexido. <b>O estado de cada achado está no fim do bloco
       dele</b>, nos achados detalhados.</p>
  </div>

  <div class="placar">
    ${SEVS.map(s => `<div style="border-top:3px solid ${corSev(s)}">
      <b style="color:${corSev(s)}">${porSev[s]}</b>
      <span>${ROTULO_SEV[s]}</span></div>`).join('')}
    <div style="border-top:3px solid ${CORES.forte}">
      <b style="color:${CORES.forte}">${FORTES.length}</b><span>Pontos fortes</span></div>
  </div>

  <h3>Achados por severidade</h3>
  ${rosca()}

  <h3>Achados por categoria</h3>
  <p style="color:var(--ink3);font-size:8.6pt">Verde significa categoria varrida sem
     achado — não significa categoria não auditada. A cobertura de cada uma está na
     seção de pontos fortes.</p>
  ${barras()}
</section>

<!-- ── FORTES E FRACOS ───────────────────────────────────────────────── -->
<section class="quebra">
  <h2>Pontos fortes</h2>
  <p style="color:var(--ink2)">O que foi verificado e está correto, com a evidência.
     Esta seção é a prova de cobertura da auditoria.</p>
  <ul class="fortes">
    ${FORTES.map(f => `<li><b>${f.t}</b><span>${f.e}</span></li>`).join('')}
  </ul>

  <h2 style="margin-top:1.6em">Pontos fracos</h2>
  <ul class="fracos">
    ${ACHADOS.filter(a => a.sev !== 'informativa').map(a => `
      <li><span>${chip(a.sev)}</span>
        <span><b>${a.id} · ${a.titulo}</b><br/>${a.impacto}</span></li>`).join('')}
  </ul>
</section>

<!-- ── ACHADOS DETALHADOS ────────────────────────────────────────────── -->
<section class="quebra">
  <h2>Achados detalhados, por categoria</h2>
  ${tabelaAchados()}
</section>

<!-- ── RECOMENDAÇÕES ─────────────────────────────────────────────────── -->
<section class="quebra">
  <h2>Recomendações priorizadas</h2>
  <ul class="recs">
    ${RECOMENDACOES.map(r => `
      <li><span class="p">${r.p}</span>
        <span><b>${r.t}</b>${r.d}<br/><span class="ref">Fecha: ${r.ref}</span></span></li>`).join('')}
  </ul>
</section>

<!-- ── ISSUES ────────────────────────────────────────────────────────── -->
<section class="quebra">
  <h2>Issues para o GitHub</h2>
  <p style="color:var(--ink2)">Texto integral, em Markdown, pronto para copiar e colar.
     Cada issue está delimitada. Os achados A4 e A5 foram agrupados na issue 4 — são
     dois itens de configuração, nenhum explorável sozinho, e duas issues para isso
     seriam ruído.</p>
  ${ISSUES.map(i => `
    <div class="issue">
      <p class="issue-delim">--- ISSUE ${i.n} ---</p>
      <pre>${esc(i.md)}</pre>
      <p class="issue-delim">--- FIM ISSUE ${i.n} ---</p>
    </div>`).join('')}
</section>

</body></html>`;

writeFileSync(HTML, html, 'utf8');
console.log('HTML escrito:', HTML);

// ─── IMPRESSÃO ──────────────────────────────────────────────────────────────
const CANDIDATOS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const navegador = CANDIDATOS.find(existsSync);
if (!navegador) { console.error('Nenhum Chrome/Edge encontrado.'); process.exit(1); }

const PORTA = 9333;
const proc = spawn(navegador, [
  '--headless=new', `--remote-debugging-port=${PORTA}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  `--user-data-dir=${join(AQUI, '.chrome-perfil')}`,
  'about:blank',
], { stdio: 'ignore' });

const espera = ms => new Promise(r => setTimeout(r, ms));

async function alvo() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORTA}/json/list`);
      const abas = await r.json();
      const p = abas.find(a => a.type === 'page');
      if (p) return p.webSocketDebuggerUrl;
    } catch { /* ainda subindo */ }
    await espera(250);
  }
  throw new Error('Chrome não abriu a porta de depuração.');
}

try {
  const ws = new WebSocket(await alvo());
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });

  let id = 0;
  const pendentes = new Map();
  const eventos = new Set();
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pendentes.has(m.id)) { pendentes.get(m.id)(m.result); pendentes.delete(m.id); }
    if (m.method) eventos.add(m.method);
  };
  const cmd = (method, params = {}) => new Promise(ok => {
    const meu = ++id;
    pendentes.set(meu, ok);
    ws.send(JSON.stringify({ id: meu, method, params }));
  });

  await cmd('Page.enable');
  await cmd('Page.navigate', { url: 'file:///' + HTML.replace(/\\/g, '/') });
  // Espera o load: a página é estática, sem fonte remota nem script.
  for (let i = 0; i < 40 && !eventos.has('Page.loadEventFired'); i++) await espera(100);
  await espera(400);

  const { data } = await cmd('Page.printToPDF', {
    printBackground: true,
    paperWidth: 8.27, paperHeight: 11.69,           // A4 em polegadas
    marginTop: 0.79, marginBottom: 0.79,            // 2 cm
    marginLeft: 0.79, marginRight: 0.79,
    displayHeaderFooter: true,
    headerTemplate: `<div style="font-size:7px;color:#94A3B8;width:100%;
        padding:0 2cm;font-family:Segoe UI,sans-serif;">
        Relatório de Auditoria de Segurança · ${PROJETO}</div>`,
    footerTemplate: `<div style="font-size:7px;color:#94A3B8;width:100%;
        padding:0 2cm;font-family:Segoe UI,sans-serif;text-align:right;">
        página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`,
  });

  writeFileSync(PDF, Buffer.from(data, 'base64'));
  ws.close();
  console.log('PDF escrito:', PDF, `(${(statSync(PDF).size / 1024).toFixed(0)} KB)`);
} finally {
  proc.kill();
}
