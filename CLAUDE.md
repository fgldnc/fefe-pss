# CLAUDE.md — Radar Financeiro (fefe-pss)

## O que é

App de **controle financeiro pessoal** (nome exibido: "Radar", `index.html:6` = "Radar Financeiro").

- **JavaScript puro com ES modules**, servido direto do disco. Sem build step, sem `npm install`, sem `package.json`.
- Hospedado na **Vercel** (`vercel.json` só define headers de segurança + CSP; sem regras de cache).
- **Firebase Auth** com login Google (`signInWithPopup`) + **Firestore** para os dados.
- O Firebase é inicializado em **`js/firebase-init.js`**, carregado como `<script type="module" src="js/firebase-init.js">` em `index.html:14`, e exposto como `window._FB`; nenhum outro módulo JS importa o SDK do Firebase diretamente — todos passam por `window._FB` (ver `js/db.js:29` `fb()`). *Já foi um script inline; foi extraído para arquivo próprio para permitir remover `'unsafe-inline'` do `script-src` da CSP.*
- Dados ficam sob `users/{uid}/` nas coleções: `transactions`, `incomes`, `budgets`, `assets`, `goals`, `categories`, `rules`.
- `index.html` é o shell único: todas as telas, todos os modais e o `<tbody>` de cada tabela vivem lá; os módulos só preenchem via `innerHTML`.

## Restrições de arquitetura (qualquer alteração precisa respeitar)

1. **Nenhum framework.** Sem React/Vue/Svelte. A UI é `innerHTML` + `addEventListener`.
2. **Nenhum bundler / build step.** Os módulos são importados por caminho relativo fixo (`./gastos.js`). Qualquer coisa que exija transpilação ou passo de build está fora.
3. **Nenhuma dependência nova sem justificar** por que não dá para resolver com o que já existe. O padrão é resolver com o código atual.
4. **PDF.js e Chart.js vêm de CDN** via `<script>` global em `index.html:9-11` (Chart.js 4.4.0 em `cdn.jsdelivr.net`, PDF.js 3.11.174 em `cdnjs.cloudflare.com`), usados como globais `Chart` e `pdfjsLib`. Esses hosts **já estão refletidos no `script-src` da CSP** em `vercel.json:24` — trocar de CDN ou de biblioteca exige editar a CSP junto.
5. `js/utils.js` **não pode importar** nenhum outro módulo do projeto (dependência circular — ver comentário em `js/utils.js:1-4`).
6. `js/app.js` **não importa** os módulos de aba estaticamente — só por `import()` dinâmico (mesmo motivo).

## Mapa de arquivos — `js/`

| Arquivo | Uma linha |
|---|---|
| `app.js` | Bootstrap: `DOMContentLoaded`, auth, roteamento por **destino** (`DESTINOS` + `APELIDOS`, `switchTab()` com `import()` dinâmico), navegação de mês, `_goto`. |
| `auth.js` | Login Google, `getUid()`, espera `window._FB` aparecer (timeout 5 s). |
| `firebase-init.js` | Inicializa o SDK do Firebase (app, auth, firestore) e publica `window._FB`. Carregado direto pelo `index.html`, não importado por nenhum módulo. |
| `extratos.js` | Aba Extratos: importação de extrato bancário (CSV/OFX/PDF), histórico de lotes, modal de revisão/preview editável com marcação de duplicata e de campo inferido, `_recomputeAtencaoExtrato()`. |
| `db.js` | Toda leitura/escrita do Firestore, `loadAllData()`, derivados de mês, backup/restore JSON, `wipeCollection`. |
| `utils.js` | `state` global, `esc`, `fmt`, helpers de mês, `toast`, skeletons, `resolveCategoryId` e o motor de insights do dashboard. |
| `dashboard.js` | KPIs, gráfico de categorias e de evolução (Chart.js), próximas parcelas, maiores gastos. |
| `gastos.js` | Tabela de gastos do mês, filtros simples e avançados, lançamento manual, projeção de parcelas, gatilho do import de fatura PDF. |
| `receitas.js` | CRUD das receitas do mês. |
| `orcamento.js` | Editor de limites de orçamento por categoria do mês. |
| `metas.js` | CRUD de metas financeiras e seus aportes. |
| `patrimonio.js` | CRUD de ativos, aportes e vínculo ativo→meta (`linkedGoalId`). |
| `saldos.js` | Aba "Fluxo de Caixa": 3 KPIs (abertura, menor saldo, projeção), curva do saldo diário (Chart.js) e tabela só dos dias com movimento. Exporta `renderCalendario` (ponto de entrada de `TAB_MODULES`) e as funções puras `buildMovimentos`/`buildSerie`/`acharMinimo`/`contextoDoMinimo`, testadas em `test/saldos.test.mjs`. |
| `timeline.js` | Linha do tempo de eventos financeiros com filtro por tipo. |
| `relatorios.js` | Relatórios exportáveis em CSV e JSON. |
| `configuracoes.js` | Categorias, regras de classificação, estatísticas, backup/restore, preferências, conta. |
| `pdf-import.js` | Importação de **fatura de cartão** em PDF: extração, parse por banco, preview editável, projeção de parcelas. |
| `parsers/base-parser.js` | Utilitários compartilhados dos parsers de extrato: `parseMoney`, `parseDate`, `normalizeDesc`, `autoClassify`, `dedupKey`/`detectDuplicates`, `genId`. |
| `parsers/csv-parser.js` | Extrato em CSV, com esquema de colunas por banco (`BANK_SCHEMAS`). |
| `parsers/ofx-parser.js` | Extrato em OFX, detectando SGML legado vs. XML puro. |
| `parsers/pdf-statement-parser.js` | Extrato bancário em PDF, com parser por banco + genérico. |
| `parsers/pdf-layout.js` | Reconstrução de layout de PDF por colunas a partir de `getTextContent()`. Em uso: `pdf-import.js` depende dele. |

`css/style.css` = tokens de cor, layout, sidebar, tabelas. `css/components.css` = toast, modal, tags, skeleton, drop zone.

## Vocabulário visual da revisão de importação (rodada 2 do redesign)

Definido em `css/components.css`, logo abaixo de `.batch-stat-out`, e consumido
pelos dois modais de importação. **Reusar; não inventar símbolo novo.**

- `.mark-inferido` — losango `◇` (via `::before`) + texto curto em `--warning`.
  Significa "o app deduziu isto". Usado na competência, no ano da data e na
  categoria vazia.
- `.field-inferido` / `.field-editado` — modificadores do próprio `<select>` /
  `<input>`: âmbar enquanto é dedução, azul (`--border-strong`) depois que o
  usuário mexeu. A marca fica **no campo que precisa ser corrigido**, nunca numa
  coluna de status separada.
- `.row-atencao` — fundo âmbar sutil na `<tr>` com qualquer pendência.
  `.row-hidden-filter` — usada pelo filtro "ver só o que precisa de atenção".
- `.import-summary-bar` + `.btn-atencao` — barra de contadores acima da tabela e
  o botão primário quando há pendência (`Salvar assim mesmo · N sem categoria`).
  **Nunca bloquear o salvamento.**
- `.modal-import` — largura dos dois modais de importação (`min(1400px, 98vw)`).

**Silêncio é o sinal de que está tudo bem:** linha classificada por regra não
recebe marca nenhuma. Se a maioria das linhas ficar âmbar, o bug é na leitura de
`classificationOrigin`, não no CSS.

Os helpers compartilhados (`renderImportSummary`, `updateImportSummary`,
`toggleImportFilter`, `updateImportConfirmButton`) ficam no fim de `js/utils.js`
— é o único módulo comum aos dois fluxos que não cria dependência circular.
Cada fluxo tem seu recálculo próprio, que **lê do DOM**: `_recomputeAtencao()`
em `pdf-import.js`, `_recomputeAtencaoExtrato()` em `extratos.js`.

O cabeçalho da tabela de preview do extrato está definido **em dois lugares**:
no `index.html` e na variante montada por `_showReview()` quando o lote tem
receitas. Mexeu num, mexa no outro.

## Vocabulário visual do Fluxo de Caixa (rodada 4)

Classes `.fx-*` em `css/style.css`, no fim do arquivo. **Prefixo próprio de
propósito:** Dashboard e Patrimônio compartilham `.kpi-grid`/`.kpi-card`, e o
roteiro marca Patrimônio como "não mexer" — reaproveitar as classes moveria as
outras duas telas junto.

- `.fx-kpis` é `1fr 1.35fr 1fr`; `.fx-kpi.fx-hero` é o do meio, em
  `--bg-card-raised`, porque é o único que induz decisão.
- **Âmbar nesta aba significa só `.mark-inferido`** (vencimento de fatura não
  definido, projeção com parcela não conferida). Saldo baixo é fato, não
  pendência: a faixa `saldo < 100` foi removida.
- **Vermelho só para saldo negativo**, que é fato aritmético sobre dado
  existente — não é a "aritmética de dado faltando" que a rodada 3 proibiu no
  Dashboard.
- Sem `--gold` (o token não existe mais, virou `--warning`) e sem emoji. Estado
  de linha (`.fx-hoje`) é ênfase neutra — fundo elevado mais barra na borda
  esquerda. Já foi ciano; ciano é azul, e a paleta A não tem azul em papel
  nenhum. Magenta segue proibido ali: é acento de série categórica.
- `.tag-projetada` é reusada de `css/components.css:105` — não crie outra.

**Chart.js é canvas e não resolve `var(--…)`:** as cores da curva estão em HEX
literal no topo de `js/saldos.js` (`HEX_LINHA`, `HEX_VERM`…; `HEX_AZUL` foi
renomeada porque a linha deixou de ser azul), espelhando os
tokens do `:root`. Já houve regressão por passar `var(--accent-primary)`.

## Convenções observadas no código

- **`state` global exportado de `utils.js`** (`js/utils.js:7`). Todos os módulos importam e mutam o mesmo objeto: `user`, `currentMonth`, `categories`, `transactions`, `incomes`, `budgets`, `assets`, `goals`, `extratoTransactions`, `importRules`, `fluxoConfig`. Não há encapsulamento nem notificação de mudança.
- **`getInvestCatIds()` (`js/utils.js`) é a regra única de "categoria é de investimento"**, consumida por `dashboard.js`, `orcamento.js` e `saldos.js`. Compara `id` e `name` **separadamente**: concatenar casa "investiment" atravessando a fronteira dos dois campos. Investimento sai do total de despesas em toda tela que fala de gasto — duas leituras diferentes viram dois totais para o mesmo mês. **Não existe mais nenhuma cópia local dessa regra:** `gastos.js`, `extratos.js` e `relatorios.js` chamam `getInvestCatIds()`. `relatorios.js` também parou de somar investimento dentro de "despesa" — a evolução mensal tem coluna `investido` própria, como o gráfico do Dashboard.
- **`esc()` obrigatório em toda interpolação de `innerHTML`** (`js/utils.js:44`). Escapa `& < > " ' /`. Todo dado vindo do Firestore ou de arquivo importado passa por `esc()` antes de entrar no HTML.
- **`toast(msg, type)`** (`js/utils.js:76`) é o canal padrão de feedback — tipos `success | error | warning | info`. `alert()` só sobrevive no erro de login (`js/auth.js:23`); `confirm()` nativo é usado nas exclusões, deliberadamente.
- **Cada módulo de aba exporta uma função `render*`** sem argumentos (`renderDashboard`, `renderGastos`, `renderMetas`, …), registrada em `TAB_MODULES` (`js/app.js:19-31`). É o único ponto de entrada da aba.
- **`app.js` carrega as abas com `import()` dinâmico** para evitar dependência circular (comentado em `js/app.js:2-4`). Nunca adicione um import estático de módulo de aba em `app.js`.
- **Guard de inicialização única por módulo**: `let _initialized = false` / `_metasInit` / `_patrimonioInit` — os listeners são registrados na primeira chamada do `render*` e a re-renderização só reconstrói o HTML.
- **Firestore só via `window._FB`**, através dos helpers `colRef`/`docRef`/`getAll`/`saveDoc`/`removeDoc` de `js/db.js`.
- Escritas atualizam o `state` local em seguida (`saveTx`, `saveIncome`, `saveAsset`, `saveGoal`, `saveCategory`), evitando recarga.
- Comentários em português explicando o **porquê** da decisão, não o quê. Manter esse registro ao alterar lógica de parsing ou de competência.
- Preferências do usuário em `localStorage` com prefixo `fluxo_` (`fluxo_onboarding_done`, `fluxo_billing_offset`).

## Decisões de negócio escondidas em números literais

Cada item abaixo é uma regra de negócio real codificada como literal, sem constante nomeada:

**Insights do dashboard — `js/utils.js`**
- `js/utils.js:162` — variação de gastos vs. mês anterior só vira chip se `|delta| > 5%`.
- `js/utils.js:189` — anomalia de categoria ignorada se a média de 3 meses for `< R$ 80`.
- `js/utils.js:191` — anomalia só é reportada se o desvio for `≥ 30%`.
- `js/utils.js:197` — no máximo **2** anomalias exibidas.
- `js/utils.js:214` — projeção de fechamento do mês só aparece a partir do **dia 5**.
- `js/utils.js:232` — alerta de orçamento dispara em `≥ 90%` do limite (`≥ 100%` = "ultrapassado").
- `js/utils.js:76` — toast dura `4500 ms`.

**Orçamento e dashboard**
- `js/orcamento.js:37` — faixas de status do orçamento: `≥ 100%` over, `≥ 80%` warn, resto ok.
- `js/dashboard.js:65` — variação `< 0,5%` é exibida como "= mês anterior".
- `js/dashboard.js:212` — gráfico de evolução usa **6** meses.
- `js/dashboard.js:246` — eixo Y muda para formato "k" quando o máximo é `≥ 1000`.
- `js/dashboard.js:258` — card de próximas parcelas cobre os **3** meses seguintes.
- `js/dashboard.js:272` — lista no máx. **10** parcelas.

**Importação de fatura — `js/pdf-import.js`**
- `competenciaDaFatura(items, vencimento, offset)` — competência = **mês do vencimento declarado na fatura** + offset (`localStorage.fluxo_billing_offset`, default `-1`). Fatura que vence em agosto é a fatura de julho. Sem vencimento no PDF, a âncora é a compra **mais recente** (o mês em que a fatura fechou), e a tela declara qual das duas deduções usou. *Já foi `items[0].date + offset` — a primeira linha na ordem de leitura do PDF, que numa fatura de julho é de junho: a fatura inteira caía dois meses atrás e o usuário não a encontrava. Testado em `test/pdf-import.test.mjs`.*
- `js/pdf-import.js` (`_tolerancia`) — parcela é considerada a mesma se a diferença de valor couber na tolerância: `clamp((N-1)/100 + R$ 0,01, R$ 0,02, R$ 1,00)`, onde N é o total de parcelas.
- `SECTION_HEADERS` — **a ordem do array é a regra**, `_sectionOf` devolve o primeiro casamento. `Lançamentos no cartão Crediário (próximo período)` precisa vir antes da regra genérica `lançamentos no cartão`, senão cobrança de período futuro entra como gasto do mês. Está nas faturas Itaú reais de jun e jul/2026.
- `_acharParcela(desc, amount, num, total, date)` — a data é ignorada para as parcelas **seguintes** (a projeção tem data estimada) mas vale para a **parcela 1**, onde é a data da compra dos dois lados. Sem esse recorte, uma recompra idêntica some: R$ 267,30 em 6x no SENAC comprado em jan/2026 e de novo em jul/2026 era lido como "1/6 já registrada". Janela em `DIAS_MESMA_COMPRA` (45 dias, folga para registro legado normalizado no dia 15).
- **Parcela projetada não é duplicata — é previsão a confirmar.** `_acharParcela` devolve o registro que bateu (não um booleano) justamente para distinguir os dois casos:
  - o registro é `isProjected` → a fatura **reconcilia**: `saveTx(tx, existente.id)` atualiza a linha no lugar, com valor/data reais e `isProjected: false`. É o único ponto do app que converte projeção em fato.
  - o registro **não** é projetado → duplicata de verdade, pulada, e a mensagem nomeia o mês e o valor.
  *A versão anterior tratava os dois como duplicata e pulava em silêncio. Como o próprio app cria todas as parcelas futuras como projeção, toda fatura seguinte era acusada de já ter sido importada — e não havia duplicata nenhuma para o usuário achar.*
- `js/pdf-import.js` (`SECTION_HEADERS`/`_parseStreams`) — o parser de um banco só é aceito se devolver `≥ 3` itens; abaixo disso cai no genérico.
- `js/pdf-import.js` (`PDF_MAX_BYTES`) — PDF limitado a **20 MB**.

**Parsers de extrato**
- `js/parsers/base-parser.js` (`dedupKey`) — chave de deduplicação: `data | tipo | valor em centavos exatos | 40 primeiros caracteres da descrição`. O valor já esteve num **bucket de 5 centavos**; foi removido em 02/08/2026 porque juntava lançamentos legitimamente distintos (mesmo estabelecimento, mesmo dia, valores a 2 centavos de distância). Mesma data + mesma descrição + valores diferentes **nunca** colidem — é o caso de salário, VA e VT creditados no mesmo dia.
- `js/parsers/base-parser.js` (`detectDuplicates`) — devolve `duplicateOf` com o registro que bateu, para a tela de revisão poder dizer contra o quê bateu. Aviso de duplicata sem evidência é ruído.
- `js/parsers/base-parser.js` (`DEFAULT_RULES`, a partir da linha ~6) — toda a classificação automática por categoria é uma lista de regex literais; é aqui que se mexe para mudar como um gasto é categorizado.
- `js/parsers/pdf-statement-parser.js:10` — PDF limitado a **20 MB**.
- `js/parsers/pdf-statement-parser.js:125` — linha descartada se a descrição tiver `< 3` caracteres.
- `js/parsers/pdf-layout.js:31-32` — `MIN_GAP_RATIO = 0.045` (vala mínima entre colunas, 4,5% da largura) e `EDGE_MARGIN_RATIO = 0.10` (bordas ignoradas). **Não calibrados contra fatura real.**

**Persistência — `js/db.js`**
- `js/db.js:368` — wipe em lotes de **450** (limite Firestore é 500).
- `js/db.js:510` — restore em lotes de **490**.
- `js/db.js:430` — backup limitado a **50 MB**.
- `js/db.js:453` — máx. **50.000** itens por coleção no restore.
- `js/db.js:460` — transação rejeitada no restore se `|amount| > 10.000.000`.
- `js/db.js:465` — descrição limitada a **500** caracteres.
- `js/db.js:12-25` — `DEFAULT_CATEGORIES`: as 12 categorias padrão e suas cores, semeadas no primeiro login.
- `js/utils.js:24-29` — `_SLUG_TO_NAME`: mapa slug-do-parser → nome de categoria, base do `resolveCategoryId`.

**Fluxo de caixa — `js/saldos.js` e `js/db.js`**
- `settings/fluxo` (documento único, `users/{uid}/settings/fluxo`) guarda
  `saldoInicial` (mapa `"YYYY-MM"` → número) e `faturaVencimentoDia`. **Ausente
  nunca é zero:** zero é abertura legítima, ausente esconde os KPIs de mínimo e
  de projeção e troca o cabeçalho da coluna para "Acumulado".
- `faturaVencimentoDia` limitado a **1–28**: 29/30/31 não existem em todo mês.
  Fora da faixa vira `null`. Com o dia definido, todo o cartão do mês vira **uma
  linha** nele; sem ele, cai no dia da compra e a tela marca `.mark-inferido`.
- `saveFluxoConfig` usa `setDoc` **sem** merge (ao contrário de `saveDoc`): com
  merge, um mês removido de `saldoInicial` sobreviveria no Firestore.
- `contextoDoMinimo` considera "entrada logo depois" até **3 dias** após o
  mínimo; além disso não é véspera de nada.
- Empate no menor saldo resolve pela **primeira** ocorrência — é o que mantém o
  ponto do gráfico, a linha destacada e o dia citado no KPI sendo o mesmo dia.
- A tabela mostra só dias com movimento, mais o dia 1 e o dia de hoje; o
  contador `N dias sem movimento omitidos` existe para a omissão não ser
  silenciosa.
- `settings` **não** entra em backup/restore (`ALLOWED_COL_NAMES`) nem em
  `WIPABLE_COLLECTIONS`. Pendência conhecida, registrada no roteiro.

**Competência (três critérios coexistindo — mudar um sem os outros desalinha os totais)**
- `js/db.js:151` — gasto normal: `competenceMonth === month`.
- `js/db.js:154` — gasto de extrato: `date.slice(0,7) === month`.
- `js/db.js:197-200` — receita: `month`, senão `competenceMonth`, senão `date.slice(0,7)`.

## Regras de interface que valem em toda tela (redesign v2 — rodadas 1 e 2)

O redesign v1 (`/redesign`, paleta A "Galo", 7 rodadas A1–A7) foi **substituído**
pelo redesign v2. A fonte da verdade visual é
`redesign-v2/direcoes/hibrido.html` — arquivo único, abre do disco. **Abrir
antes de escrever qualquer linha de CSS.** O plano das 8 rodadas está em
`PROMPT-implementar-v2.md`; a arquitetura de 5 destinos, em `ARQUITETURA-v2.md`.

Aplicado até aqui: **rodada 1 (fundação)** — a pele — e **rodada 2
(navegação)** — o roteamento. As `<section class="tab-content">` das 11 abas
continuam no `index.html` e os `render*` continuam escrevendo nelas por id: o
que mudou foi quem as mostra e quando.

- **Material de papel, um tema só.** Fundo cinza-claro (`--fundo`), folha branca
  (`--folha`) com raio 16 e sombra quase invisível. **O tema escuro acabou** — a
  direção escolhida tem um tema só, o seletor `[data-theme="light"]` sumiu do
  CSS e o botão `#btn-tema` saiu da topbar. `aplicarTema` ainda existe em
  `js/app.js` escrevendo um atributo que ninguém lê; sai na rodada 2.
- **A marca tem endereço.** Ameixa (`--marca` `#7A2E52`) pinta navegação, botão,
  foco e a curva do saldo — e **NUNCA um valor em R$**. Todo número de dinheiro
  é `--ink`, `--entrou` ou `--saiu`. Foi por isso que `.val-accent` deixou de ser
  cor de acento e virou `--ink`. Trocar de marca é um atributo no `<html>`
  (`data-marca="roxo|grafite"`); não há botão na interface.
- **Nada de azul em papel nenhum** — nem chrome, nem série de gráfico. A série
  categórica `--s1…--s6` foi redesenhada sem ele. Se faltar uma sétima cor, use
  marrom ou oliva.
- **Os nomes de token antigos viraram apelidos.** `--bg-card`, `--text-muted`,
  `--danger`, `--c1…--c6`, `--font-mono`, `--radius-*` continuam existindo no
  `:root` apontando para os nomes novos (`--folha`, `--ink-3`, `--saiu`,
  `--s1…`, `--fonte`, `--raio*`). É o que permitiu trocar a pele sem tocar nas
  ~30 referências a token dentro de `js/`. **Código novo usa os nomes novos.**
- **Outfit em tudo, inclusive número.** `--fonte`. Nunito e DM Mono saíram;
  `--font-code` virou a monoespaçada do sistema, sem webfont. A coluna de
  valores alinha por `font-variant-numeric: lining-nums tabular-nums`, aplicado
  globalmente e conferido no navegador (`1.111,11` e `9.999,99` medem o mesmo).
- **A PÁGINA ROLA.** A regra v1 ("cada tela cabe numa dobra só") está
  **revogada**: para caber, ela espremia a linha da tabela, que é o que o app
  existe para ler. Agora só a `.topbar` é `sticky`, e o `<thead>` de
  `.data-table` fica preso enquanto o corpo desce. As classes `.fit` e `.grow`
  continuam no HTML e **não fazem mais nada** — somem com o markup de cada aba.
- **Contraste se roda, não se supõe:** `node redesign-v2/direcoes/contraste-hibrido.mjs`
  (texto 4,5:1 · gráfico, borda e glifo 3:1). Borda de campo de formulário usa
  `--borda-forte`, não `--borda`: `--borda` é 1,3:1 no branco e reprova em
  WCAG 1.4.11.
- **Chart.js pinta em canvas e não resolve `var(--…)`.** As cores vêm de
  `getComputedStyle` na hora de montar o gráfico — `coresGrafico()` em
  `js/saldos.js`, `token()` em `js/dashboard.js`, `_token()` em
  `js/patrimonio.js`. HEX literal no código é regressão conhecida.
- **Segundo canal em tudo** (WCAG 1.4.1): sinal `+` / `−` (U+2212) na coluna de
  valor, parênteses no KPI negativo, `◇` + texto + barra na borda esquerda da
  linha pendente (`.marca-d`, `tr.conferir`), tracejado na projeção, nome escrito
  na série do gráfico. **A rosca nunca vem sozinha**: ao lado dela vai a lista
  ordenada com nome, percentual e valor (`.dist` / `.cat`).
- **Silêncio quando está tudo certo.** Contador zerado não aparece como "0" —
  some, como `atualizarBadgeExtratos` (`js/app.js:118`) já faz.
- **Vocabulário v2 disponível em `css/style.css`** (fim do arquivo): `.folha`,
  `.rot`, `.rot-sub`, `.linha-topo`, `.ir`, `.nota`, `.faixa`, `.heroi`,
  `.dica`, `.apoio`, `.mais`/`.menos`/`.alerta`, `.pilula`, `.dist`, `.cat`,
  `.chip`, `.selo`, `.rodape`, `.marca-d`, `tr.conferir`, `.esconde-sm`. Copiado
  do `hibrido.html`, **não reinventado** — reusar, não criar símbolo novo. Os
  seletores de elemento (`table`, `th`, `td`) estão escopados em `.folha` para
  não pegarem as `.data-table` das abas antigas.
### Roteamento por destino (rodada 2)

- **`DESTINOS` em `js/app.js` é o mapa da navegação.** Um destino é uma LISTA de
  seções do `index.html`, mostradas juntas e renderizadas na ordem do array:
  `importar` = extratos · `mes` = dashboard, gastos, receitas, orcamento ·
  `adiante` = calendario, timeline · `guardado` = metas, patrimonio ·
  `ajustes` = configuracoes, relatorios. **Empilhar é o estado intermediário**:
  as rodadas 3 a 8 fundem cada destino numa tela só, e a lista encolhe junto.
  Os `render*` são chamados **em série** — a ordem é a de leitura da tela, e
  cada parte falha sozinha, com toast, sem derrubar as outras.
- **`APELIDOS` mantém os ids de aba antigos válidos como endereço.**
  `switchTab('gastos')` e `data-goto="gastos"` continuam funcionando: resolvem
  para o destino que hoje contém a seção, e `_goto` **rola até a seção** dentro
  dele (`scroll-margin-top` cobre a topbar sticky). Não vale a pena caçar as
  chamadas agora — a rodada da tela reescreve o card que as contém.
- **CONFERIR ainda não está na navegação.** O destino existe no plano
  (ARQUITETURA-v2.md) mas quem o preenche é `js/conferir.js`, da rodada 7.
  Item de navegação que leva a tela vazia é pior que navegação que cresce.
- **Saíram**: a command palette (Ctrl+K), o onboarding de 4 passos (um dos
  passos era morto — `obData.bank` era escrito e nunca lido), o botão de tema,
  a gaveta lateral do celular e o hamburguer. O salário e a primeira meta que o
  onboarding coletava entram pelos botões normais.
- **Celular (< 900px): a barra lateral vira barra fixa no rodapé.** Somem a
  marca, os rótulos de grupo e o rodapé de conta; "Sair da conta" continua em
  Ajustes, onde já estava. Ajustes fica na barra enquanto forem 4 destinos;
  com Conferir serão 5 e ele sobe para o topo.
- **`.main-content` não pode ter `overflow-x`.** Qualquer `overflow` diferente
  de `visible` ali faz dele um contêiner de rolagem que nunca rola, e tudo que
  é `position: sticky` dentro — a topbar, o `<thead>` — gruda NELE e some com a
  página. Foi medido: a topbar descia junto. Quem corta o estouro horizontal é
  o `overflow-x: hidden` do `body`.
- **O `<thead>` ainda NÃO gruda.** As tabelas antigas moram em
  `.table-wrapper { overflow-x: auto }` dentro de `.card { overflow: hidden }`,
  e `position: sticky` num `<th>` resolve contra esse scrollport. A regra foi
  **removida** em vez de ficar sem efeito; volta na rodada 3, com a tabela de
  Mês remontada numa `.folha` sem os dois embrulhos.
- **Atalho entre abas é `data-goto`**, delegado uma única vez em `document` por
  `app.js` (`_goto`), com `data-filtro-cat` e `data-filtro-proj` para chegar já
  filtrado. Nunca ligar listener no elemento: os cards são reinjetados por
  `innerHTML` a cada render.
- **Configurações é montada inteira por `js/configuracoes.js`** — a seção em
  `index.html` é um `<section>` vazio de propósito. Editar markup de
  Configurações no HTML não tem efeito nenhum.

### Decisões da rodada A8 que viram regra

- **O app não guarda histórico de valor de ativo.** `currentValue` é o valor de
  hoje; `contributions` é o histórico de aportes. Por isso o segundo gráfico de
  Patrimônio é **"Aportes por mês"**, não "patrimônio mês a mês": a curva do
  passado não existe no dado e desenhá-la seria inventar número. Para ela
  existir é preciso gravar snapshot mensal — mudança de modelo, não de tela.
- **Contrato de parcelamento não tem id.** Cada parcela é uma transação
  independente. O card "Contratos em aberto" (`js/timeline.js`) agrupa por
  descrição normalizada + total de parcelas + valor em centavos, e assume o
  mesmo risco de colisão que `_acharParcela` em `pdf-import.js`.
- **O contador da sidebar usa a mesma regra da tela de revisão** (`semCat` em
  `extratos.js`): despesa do mês sem categoria resolvida; receita não conta.
  Contador que discorda da tela é pior que contador nenhum. Zero esconde o selo.
- **`settings/fluxo` entra no backup/restore, mas NÃO no wipe.** No JSON vai
  fora de `data` (é documento, não coleção), passa pelo mesmo
  `_normalizeFluxoConfig` e **o que já existe vence o que vem do arquivo** —
  restaurar backup antigo não pode apagar abertura declarada depois.
  `WIPABLE_COLLECTIONS` segue sem ele: apagar transação não é apagar ajuste.

## Redesign em andamento

O redesign **v2** está em curso. Ler, nesta ordem, antes de propor qualquer
mudança de interface:

| arquivo | o que fixa |
|---|---|
| `redesign-v2/direcoes/hibrido.html` | **a fonte da verdade visual.** Abrir primeiro; copiar dele é o certo. |
| `PROMPT-implementar-v2.md` | as 8 rodadas, a ordem e os critérios de aceitação. |
| `ARQUITETURA-v2.md` | as 3 arquiteturas e a escolhida (B, "o ciclo do mês"): 5 destinos + Ajustes. |
| `INVENTARIO-FUNCOES.md` | as 64 capacidades com arquivo:linha, e o que pode sumir. |
| `PESQUISA-UX.md` | a evidência. O que está `[NÃO CONFIRMADO]` lá segue não confirmado. |

Rodadas: **1 fundação (feita)** · **2 navegação (feita)** · 3 Mês · 4 Adiante ·
5 Guardado · 6 Importar · 7 Conferir · 8 Ajustes. Uma por vez, cada uma
terminando com o app funcionando.

`ROTEIRO-REDESIGN.md` e os `PROMPT-rodada-N.md` são o registro do redesign **v1**
(rodadas A1–A8), já substituído. Valem como histórico do *porquê* de cada
decisão antiga, não como plano.

## Contexto pendente

`RELATORIO-AUDITORIA.md` (02/08/2026) lista 13 achados. Ler antes de mexer em
parsing de PDF, dedupe ou segurança — **mas conferir contra o código antes de
agir**, porque parte já foi fechada:

- **Fechados:** `js/pdf-import.fixed.js` e `js/parsers/pdf-layout.js` foram
  ativados (o "fixed" virou `js/pdf-import.js`); achado 6 (dedupe por bucket de
  5 centavos e ignorando o tipo) corrigido na rodada 2 — hoje é centavo exato;
  achado 8 (`'unsafe-inline'` no `script-src`) fechado com a extração de
  `js/firebase-init.js` — a CSP em `vercel.json:24` já não tem `unsafe-inline`
  em `script-src` (segue em `style-src`, o que é outro item).
- **Aberto e não verificável pelo código:** `firestore.rules` existe no
  repositório, mas se está **publicado** no console do Firebase só dá para
  confirmar fora do repositório. Tratar como aberto até confirmação.
