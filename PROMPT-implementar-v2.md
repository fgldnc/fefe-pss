# PROMPT — aplicar o redesign v2 ao app inteiro

Cole o bloco abaixo numa sessão nova, aberta em `C:\Users\fefe\Downloads\github\fefe-pss`.
Ele é autossuficiente. A rodada anterior foi só de proposta; **esta é de implementação**.

---

## 0. O que já está decidido (não reabrir)

O desenho foi escolhido. Ele existe, pronto e conferido, em
**`redesign-v2/direcoes/hibrido.html`** — um arquivo único que abre direto do
disco. **Abra antes de escrever qualquer linha de código.** Ele é a fonte da
verdade visual; este documento só explica o porquê e diz onde cada coisa vai.

Também são decisões fechadas, registradas em:

- `INVENTARIO-FUNCOES.md` — as 64 capacidades do app com `arquivo:linha`, e a lista do que pode sumir.
- `ARQUITETURA-v2.md` — as três arquiteturas e a escolhida (**B, "o ciclo do mês"**).
- `PESQUISA-UX.md` — a evidência. O que está `[NÃO CONFIRMADO]` lá segue não confirmado.

---

## 1. O que NÃO pode mudar

Isto quebra o app ou quebra número. Não é conservadorismo estético.

1. **JavaScript puro com ES modules. Sem framework, sem bundler, sem build
   step, sem `npm install`.** Import por caminho relativo fixo. Tailwind por
   build ou por CDN está fora (o `script-src` da CSP não o inclui).
2. **Chart.js 4.4.0 e PDF.js 3.11.174 vêm de CDN como globais** (`Chart`,
   `pdfjsLib`), com os hosts travados no `script-src` em `vercel.json:24`.
3. **Fonte pelo `fonts.googleapis.com`.** A CSP já permite (`style-src` inclui
   `fonts.googleapis.com`, `font-src` inclui `fonts.gstatic.com`) — **a troca
   para Outfit não exige mexer na CSP.**
4. `state` global exportado de `js/utils.js`, mutado por todos os módulos.
   `js/utils.js` **não importa** nenhum outro módulo do projeto.
5. **`esc()` obrigatório em toda interpolação de `innerHTML`.** Todo dado vindo
   do Firestore ou de arquivo importado passa por ele.
6. Cada aba exporta uma `render*()` sem argumentos, registrada em `TAB_MODULES`
   (`js/app.js`), carregada por `import()` dinâmico.
7. Firestore só via `window._FB`, pelos helpers de `js/db.js`.
8. **Todas as regras de negócio.** Competência de fatura
   (`competenciaDaFatura`), tolerância de parcela (`_tolerancia`), busca de
   parcela (`_acharParcela`), reconciliação de projeção, `dedupKey`,
   `getInvestCatIds()`, os três critérios de competência em `js/db.js:151,154,197`,
   `faturaVencimentoDia` 1–28, `saveFluxoConfig` sem merge. Estão catalogadas na
   seção "Decisões de negócio escondidas em números literais" do `CLAUDE.md`.
   **Redesenho de tela não altera nenhuma. Se alguma precisar mudar, pare e
   pergunte.**

---

## 2. Arquitetura: de 11 abas para 5 + ajustes

```
Importar  ·  Conferir  ·  Mês  ·  Adiante        Guardado        ⚙ Ajustes
└──────── o ciclo do mês ────────┘              └ longo prazo ┘
```

| destino | o que contém | vem de |
|---|---|---|
| **Importar** | Uma porta só para fatura e extrato: drop zone única (PDF/OFX/CSV), o app decide o que é pelo conteúdo e a pessoa corrige se errar. Revisão em tela, não em modal. Histórico de lotes. **O offset de competência mora aqui.** Frase de privacidade ("roda no seu navegador"). | `js/pdf-import.js`, `js/extratos.js`, `js/configuracoes.js:118` |
| **Conferir** | Tela nova. Três listas: sem categoria · parcela projetada de competência já vencida · possível duplicata. Corrige na própria linha. **Deriva do `state` — não exige campo novo no Firestore.** | `js/app.js:106`, `js/gastos.js:198`, `detectDuplicates` |
| **Mês** | Herói com a frase ("Sobrou R$ …") + dica · distribuição (rosca + lista ordenada) · resultado do mês · miniatura do fluxo · **uma tabela única** de gastos + receitas + extrato, com coluna *origem* · orçamento × real. | `js/dashboard.js`, `js/gastos.js`, `js/receitas.js`, `js/extratos.js`, `js/orcamento.js`, `js/utils.js` |
| **Adiante** | Saldo inicial e **dia de vencimento da fatura lado a lado** · 3 KPIs · curva diária · tabela de dias com movimento · contratos em aberto · parcelas previstas. | `js/saldos.js`, `js/timeline.js:198`, `js/dashboard.js:517`, `js/configuracoes.js:126` |
| **Guardado** | Metas e patrimônio **na mesma tela**, com o vínculo ativo→meta como assunto principal: aportar num ativo credita a meta, e isso precisa ficar visível, não escondido num `<select>` que só aparece com tipo "investimento". | `js/metas.js`, `js/patrimonio.js` |
| **⚙ Ajustes** | Categorias · regras de classificação · backup/restore · conta. | `js/configuracoes.js` |

### O que some

| sai | por quê |
|---|---|
| Feed da aba Timeline (`js/timeline.js:51-190`) | é Gastos + Receitas outra vez, sem nenhuma ação possível. **`_renderContratos` (`:198`) sobrevive e vai para Adiante.** |
| Aba Relatórios inteira (`js/relatorios.js`) | seis relatórios fixos para uma pessoa. Vira **um** "Exportar CSV" no cabeçalho de cada tabela. |
| Tabela "Transações importadas" (`js/extratos.js:38`) | mesmo gasto do mês que a tabela de Gastos já mostra. Funde na tabela única de Mês. |
| Estatísticas de armazenamento (`js/configuracoes.js:213`) | "você tem 1.204 transações" não muda decisão nenhuma. |
| Wipe de coleção (`js/configuracoes.js:106`, `js/db.js:485`) | backup + restore cobrem "quero recomeçar", com risco muito menor. **Apagar só `wipeCollection` da interface; a função em `db.js` pode ficar.** |
| Onboarding de 4 passos (`js/app.js:252-318`) | roda uma vez e um dos passos é morto: `obData.bank` (`:289`) é escrito e **nunca lido**. Estado vazio bom em cada tela resolve. |
| Command palette (`js/app.js:135-250`) | fazia sentido com 11 destinos. Com 5, a busca pertence à tabela. |
| Rosca "Composição" do patrimônio (`js/patrimonio.js:274`) | os KPIs já *são* a composição. Vira a barra empilhada de uma linha. |

### Custo de roteamento

`TAB_MODULES` (`js/app.js:19-31`) cai de 11 para 6 entradas. Caminho:
**módulo-casca** — um arquivo novo por destino que chama os `render*` atuais,
cada um apontado para um container próprio. Os módulos existentes continuam
existindo; o que muda é que precisam **aceitar um container** em vez de
escrever em `#tab-<nome>` por id fixo (hoje `renderRelatorios`,
`renderTimeline`, `renderCalendario` e `renderConfiguracoes` fazem isso).

Arquivo novo: `js/conferir.js`.
`js/relatorios.js` some (vira um `exportarCSV` em `js/utils.js`).
`js/timeline.js` reduz a `_renderContratos`.

---

## 3. O desenho

### 3.1 O material

Fundo cinza-claro, **folha branca** com raio 16 e sombra quase invisível.
A folha é lida como papel, não como cartão flutuante — é a diferença entre
isto e o visual genérico de dashboard.

### 3.2 Tokens

```css
:root{
  /* malha e ritmo */
  --coluna:1180px; --margem:32px; --goteira:20px; --u:8px;
  --ar-secao:40px; --linha:52px; --nav:232px;
  --raio:16px; --raio-sm:10px;

  /* superfícies */
  --fundo:#F3F5F9; --folha:#FFFFFF; --folha-2:#EDF1F8;
  --borda:#E2E8F1; --borda-forte:#7E8999;

  /* tinta */
  --ink:#141821; --ink-2:#4A5265; --ink-3:#616B79;

  /* significado */
  --entrou:#0E7C4C; --saiu:#BE3729; --deduzido:#8F5C00;

  /* série categórica — SEM AZUL */
  --s1:#A8336B; --s2:#12915A; --s3:#E0553F; --s4:#B97A0C; --s5:#6B4BC9; --s6:#79838F;
  --s1-chip:#F7E5EE; --s2-chip:#DEF0E8; --s3-chip:#FBE7E4;
  --s4-chip:#F5ECDD; --s5-chip:#E9E4F7; --s6-chip:#ECEEEF;

  --sombra:0 1px 2px rgba(20,24,33,.04), 0 6px 20px rgba(20,24,33,.05);
}

/* marca: pinta navegação, botão, foco e a curva do saldo. NUNCA um valor em R$ */
html[data-marca="ameixa"] { --marca:#7A2E52; --marca-2:#9A3E6E; --marca-tinta:#F6E8F0; }
html[data-marca="roxo"]   { --marca:#6B3FA0; --marca-2:#8557C4; --marca-tinta:#EFE8F8; }
html[data-marca="grafite"]{ --marca:#2E3440; --marca-2:#41485A; --marca-tinta:#E7E9EE; }
```

**Ameixa é o padrão.** As outras duas ficam no CSS porque custam três linhas;
não precisa haver botão de troca na interface do app.

**Regra dura: NADA DE AZUL, em papel nenhum** — nem chrome, nem série de
gráfico. A série categórica foi redesenhada sem ele. Se precisar de uma sétima
cor, use marrom ou oliva, nunca azul nem ciano.

**A marca nunca toca um valor em R$.** Todo número de dinheiro é `--ink`,
`--entrou` ou `--saiu`.

### 3.3 Tipografia

```css
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300..700&display=swap');
--fonte:'Outfit', system-ui, -apple-system, 'Segoe UI', sans-serif;
body{ font-variant-numeric: lining-nums tabular-nums; }
```

Outfit em tudo, inclusive número. **Foi testada, não suposta:** `1.111,11` e
`9.999,99` medem os mesmos 82,30px com `tabular-nums` (teste em
`redesign-v2/direcoes/fontes.html`). Nunito, DM Mono e as fontes antigas saem.

Escala: herói 46px/600 · h1 24px/600 · rótulo de seção 10,5px/600 em versalete
com `letter-spacing:.16em` · corpo 14px · apoio 12,5px · micro 10,5px.
**Sempre mostrar os centavos** (`54,00`, não `54`).

### 3.4 As decisões de leitura que precisam sobreviver

- **O número grande é uma frase**, não um quadradinho de KPI:
  "Sobrou **R$ 1.842,60** · de R$ 7.400,00 que entraram · o mês fecha em 16 dias".
- **A rosca nunca vem sozinha.** Ao lado dela, a lista ordenada da maior para a
  menor, com pastilha colorida, nome escrito, percentual e valor. A rosca diz o
  peso; a lista diz o que é o maior.
- **"Outros" não é inventado pelo gráfico:** desenhe as **6 maiores** e depois
  uma fatia neutra `--s6` chamada "**+N categorias menores**", que é o nome do
  que ela é. Categoria realmente chamada "Outros" no cadastro disputa as 6
  maiores como qualquer outra.
- **Gráfico sem grade.** Só o fio do zero. Traço cheio = realizado, **tracejado
  = previsão**, e o ponto de mínimo é marcado e rotulado direto no gráfico —
  não pode depender de passar o mouse.
- **Segundo canal em tudo** (WCAG 1.4.1, achado nº 6 da pesquisa):
  sinal `+` / `−` (U+2212) explícito na coluna de valor; parênteses no KPI
  negativo; `◇` + texto + barra na borda esquerda na linha pendente; tracejado
  na tag de parcela prevista; nome escrito na série do gráfico.
- **Investimento não entra em "saiu"** e aparece sem cor de gasto.
- **Silêncio quando está tudo certo.** Contador zerado não aparece como "0" —
  some, como `atualizarBadgeExtratos` (`js/app.js:118`) já faz hoje.

### 3.5 Malha e separação

| | |
|---|---|
| Coluna de conteúdo | 1180px · margem 32px (16px abaixo de 900px) |
| Goteira | 20px |
| Ritmo vertical | múltiplos de 8px |
| Linha de tabela | 52px (alvo de toque) |
| Cabeçalho de tabela | fio de 1px em `--borda-forte` |
| Linha de tabela | fio de 1px em `--borda` · **sem zebra** (faixa alternada compete com o âmbar de pendência) |
| Total | régua de 2px em `--ink` |

**A página rola.** A regra antiga de "cada tela cabe numa dobra" está revogada:
ela espremia a linha da tabela, que é o que o app existe para ler. O cabeçalho
da tela é `sticky`; a tabela rola com a página, com `<thead>` preso.

### 3.6 Celular (abaixo de 900px)

A sidebar vira **barra inferior fixa com os 5 destinos** (Ajustes sai da barra
e vira item do topo). As duas colunas empilham a partir de 1120px. A tabela
perde *categoria* e *origem*, que descem como segunda linha dentro da
descrição. **Nunca é cortado:** valor, data e a marca de pendência.

### 3.7 Chart.js

`Chart.js` pinta em `<canvas>` e **não resolve `var(--…)`**. As cores vêm de
`getComputedStyle` no momento de montar o gráfico — é o que `token()` em
`js/saldos.js:32` e `js/dashboard.js:22` já fazem — e o gráfico é **destruído e
refeito** quando o tema muda. **HEX literal no código é regressão conhecida;
não reintroduza.**

---

## 4. Ordem de trabalho

Uma rodada por vez, cada uma terminando com o app funcionando.

1. **Fundação.** `css/style.css` e `css/components.css` reescritos com os
   tokens acima e as classes do `hibrido.html` (`.folha`, `.rot`, `.heroi`,
   `.dist`, `.cat`, `.chip`, `.apoio`, `.selo`, `.rodape`, `.nota`). Outfit no
   lugar de Nunito. **Sem tocar em `js/` ainda** — o app fica com a cara nova e
   as abas antigas.
2. **Navegação.** `index.html` e `js/app.js`: sidebar de 5 + ⚙,
   `TAB_MODULES` reduzido, barra inferior no celular. Remover command palette e
   onboarding.
3. **Mês.** A fusão maior: uma tabela única (gastos + receitas + extrato, com
   coluna *origem*), herói, distribuição, orçamento × real.
4. **Adiante.** `js/saldos.js` redesenhada, com o dia de vencimento trazido de
   Configurações e `_renderContratos` trazido de `js/timeline.js`.
5. **Guardado.** `js/metas.js` + `js/patrimonio.js` numa tela, com o vínculo
   ativo→meta explícito.
6. **Importar.** Tirar `pdf-import` e `extratos` do modal e pôr em tela, com o
   offset de competência junto. É o item mais pesado; **nenhuma regra de
   parsing muda**.
7. **Conferir.** `js/conferir.js`, derivado do `state`.
8. **Ajustes.** Limpeza de `js/configuracoes.js`; apagar `js/relatorios.js`.

Se o item 6 ficar grande demais para uma rodada, a degradação limpa é: tela
"Importar" com a drop zone e o histórico, que **abre o modal existente**. Os
cliques do ciclo não mudam.

---

## 5. Critérios de aceitação

Rodada nenhuma fecha sem isto:

- [ ] `node redesign-v2/direcoes/contraste-hibrido.mjs` diz "Tudo passa no
      mínimo exigido" (texto 4,5:1 · gráfico, borda e glifo 3:1).
- [ ] **Nenhum azul** em `css/` nem em `js/` — `grep -iE '#[0-9a-f]*(3[0-9a-f]|4[0-9a-f])[0-9a-f]*(e|f)[0-9a-f]|azul|blue'` revisado à mão.
- [ ] **Sem rolagem horizontal** em 1420, 1120, 1000, 900 e 375px de largura
      (`document.documentElement.scrollWidth <= innerWidth`).
- [ ] Coluna de valor alinhada: `tabular-nums` ativo e centavos sempre visíveis.
- [ ] Todo `innerHTML` com dado externo passa por `esc()`.
- [ ] Gráfico lê cor por `getComputedStyle`, não HEX literal.
- [ ] `node --test test/` continua passando — os testes de
      `saldos`, `pdf-import`, `base-parser` e `pdf-layout` fixam as regras de
      negócio, e **nenhum deles pode precisar de alteração**. Se um quebrar,
      você mexeu em regra de negócio: desfaça.
- [ ] O app carrega, loga com Google, e as 6 telas renderizam sem erro no console.

---

## 6. Como quero que você trabalhe

- **Abra `redesign-v2/direcoes/hibrido.html` primeiro.** Copiar dele é o certo;
  reinventar não é.
- **Uma rodada por vez**, terminando com o app funcionando. Não comece a
  seguinte sem eu ver a anterior.
- **Comentário em português explicando o porquê**, não o quê — é a convenção do
  projeto e o que torna as decisões recuperáveis.
- **Conferir, não supor.** Contraste se roda; largura de fonte se mede;
  rolagem horizontal se testa. Foi assim que apareceram, na rodada de proposta,
  um overflow em 1000px, um degradê com 3,87:1 e um seletor de paleta que
  casava com os próprios botões.
- **Atualizar o `CLAUDE.md` ao fim de cada rodada.** As seções "Vocabulário
  visual…", "Regras de interface que valem em toda tela" e "Decisões da rodada
  A8" descrevem o desenho **antigo** e vão sendo substituídas.
- Se alguma regra de negócio parecer que precisa mudar, **pare e pergunte**.
