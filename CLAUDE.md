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
| `mes.js` | **A tela "Mês"** (rodadas 3–4): herói, distribuição (rosca + lista), resultado do mês, miniatura do fluxo, tabela única (gasto + fatura + extrato + receita, com coluna origem) + CSV, e a evolução de 6 meses no fim. |
| `gastos.js` | **Formulário e gravação** de lançamento: modal, validação, projeção de parcelas, aporte no ativo vinculado, confirmar parcela prevista. Não desenha tela. |
| `receitas.js` | **Formulário e gravação** de receita: modal, gravação preservando procedência, copiar do mês anterior. Não desenha tela. |
| `orcamento.js` | Editor de limites por categoria. **Mora em Ajustes** desde a rodada 3. |
| `metas.js` | CRUD de metas financeiras e seus aportes. |
| `patrimonio.js` | CRUD de ativos, aportes e vínculo ativo→meta (`linkedGoalId`). |
| `adiante.js` | **A tela "Adiante"** (rodada 4): saldo inicial + dia de vencimento, 3 KPIs, curva diária, tabela dos dias com movimento. |
| `cartao.js` | **A tela "Cartão"**: resumo, contratos em aberto, parcelas previstas e parcelas já pagas. Os dois do meio vieram de `adiante.js`; o das pagas é novo. |
| `saldos.js` | **Só cálculo**, sem DOM e sem `state`: `buildMovimentos`/`buildSerie`/`acharMinimo`/`contextoDoMinimo`, fixadas por `test/saldos.test.mjs`. |
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

## Vocabulário visual de Adiante (rodada 4 da v2)

Classes `.adiante-*` no fim de `css/style.css`, sobre `.folha`. As antigas
`.fx-*` **foram removidas** junto com a aba "Fluxo de Caixa"; não voltem.

- `.adiante-kpis` é `1fr 1.35fr 1fr`; o do meio (`.adiante-kpi-hero`) fica em
  `--folha-2` porque é o único que induz decisão. Elevação, não cor: cor nesta
  tela já significa dinheiro.
- **Âmbar aqui significa só `.marca-d`** — "o app deduziu isto": parcela
  projetada dentro da projeção, vencimento de fatura não definido. Saldo baixo
  é fato, não pendência.
- **Vermelho só para saldo negativo**, que é fato aritmético sobre dado
  existente. Acompanhado sempre de parênteses: `(5.238,18)` — o segundo canal.
- **Estado de linha é ênfase neutra.** `.adiante-hoje` = fundo elevado + barra
  na borda esquerda. `.adiante-minimo` é a exceção que usa `--saiu-tinta`,
  porque o mínimo é o assunto da tela.
- `.tag-projetada` é reusada de `css/components.css` — não crie outra.
- A curva do saldo é Chart.js e **lê as cores de `getComputedStyle`**
  (`coresGrafico()`): `--marca` para a linha, `--saiu` para o ponto do mínimo e
  para a linha do zero. HEX literal aqui é regressão conhecida deste arquivo.

### A tela "Adiante" (rodada 4)

Quatro blocos em `js/adiante.js`: **ajustes do mês · 3 KPIs · curva diária ·
tabela dos dias com movimento**. Contratos em aberto e parcelas previstas
estiveram aqui na rodada 4 e foram para `js/cartao.js`.

- **`saldos.js` virou só cálculo.** Sem DOM, sem `state`, sem Chart.js: as
  quatro funções puras que `test/saldos.test.mjs` fixa. Nenhuma conta delas é
  repetida em `adiante.js`.
- **O dia de vencimento da fatura veio de Configurações** e fica ao lado do
  saldo inicial. Ele decide se o cartão do mês vira UMA linha no vencimento ou
  dez linhas nos dias das compras — o lugar de mexer nele é onde a consequência
  aparece. Continua limitado a 1–28 e gravado em `settings/fluxo`.
- **`timeline.js` e `previsoes.js` morreram.** O que sobrou dos dois —
  contratos em aberto e parcelas previstas — passou por Adiante na rodada 4 e
  **hoje está em `js/cartao.js`**: Adiante é o caixa do mês, parcelamento
  atravessa meses. A **evolução de 6 meses desceu para o fim de Mês**, como manda o `ARQUITETURA-v2.md` ("o
  gráfico de evolução (C5) desce para o fim de Mês"). É retrospectiva: fica
  depois da tabela, porque responde "e nos meses anteriores?".
- As duas regras antigas continuam valendo: **saldo ≠ fluxo acumulado** (sem
  abertura declarada, sem KPI de mínimo e de projeção, e a coluna vira
  "Acumulado") e **investimento não entra no saldo** (sai para o rodapé, com o
  parêntese "fora do saldo").
- A tabela de Adiante segue a mesma regra da de Mês: **nenhum `overflow` no
  contêiner**, `table-layout: fixed`, larguras no CSS, `<thead>` sticky em
  `top: var(--topbar-h)`. E as colunas Entradas/Saídas somem abaixo de 900px —
  `esconde-sm` no `<th>` **e no `<td>`**, senão o corpo fica com mais células
  que o cabeçalho e as colunas desalinham (foi medido).

## Convenções observadas no código

- **`state` global exportado de `utils.js`** (`js/utils.js:7`). Todos os módulos importam e mutam o mesmo objeto: `user`, `currentMonth`, `categories`, `transactions`, `incomes`, `budgets`, `assets`, `goals`, `extratoTransactions`, `importRules`, `fluxoConfig`. Não há encapsulamento nem notificação de mudança.
- **`getInvestCatIds()` (`js/utils.js`) é a regra única de "categoria é de investimento"**, consumida por `mes.js`, `orcamento.js` e `adiante.js`. Compara `id` e `name` **separadamente**: concatenar casa "investiment" atravessando a fronteira dos dois campos. Investimento sai do total de despesas em toda tela que fala de gasto — duas leituras diferentes viram dois totais para o mesmo mês. **Não existe mais nenhuma cópia local dessa regra:** `gastos.js`, `extratos.js` e `relatorios.js` chamam `getInvestCatIds()`. `relatorios.js` também parou de somar investimento dentro de "despesa" — a evolução mensal tem coluna `investido` própria, como o gráfico de evolução em Mês.
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
- `js/mes.js` (`_resultado`) — variação `< 0,5%` é exibida como "= mês anterior".
- `js/mes.js` (`_serie6m`) — gráfico de evolução usa **6** meses.
- `js/mes.js` (`_renderEvolucao`) — eixo Y muda para formato "k" quando o máximo é `≥ 1000`.
- `js/cartao.js` (`_previstas`) — parcelas previstas cobrem os **3** meses seguintes.
- `js/cartao.js` (`MAX_PREVISTAS`) — lista no máx. **10** parcelas previstas.
- `js/cartao.js` (`MAX_PAGAS`) — a tabela de parcelas já pagas mostra no máx. **24**; o rodapé diz "24 de N", a omissão nunca é silenciosa.

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

**Fluxo de caixa — `js/saldos.js` (cálculo), `js/adiante.js` (tela) e `js/db.js`**
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

## Regras de interface que valem em toda tela (redesign v2 — rodadas 1 a 4)

O redesign v1 (`/redesign`, paleta A "Galo", 7 rodadas A1–A7) foi **substituído**
pelo redesign v2. A fonte da verdade visual é
`redesign-v2/direcoes/hibrido.html` — arquivo único, abre do disco. **Abrir
antes de escrever qualquer linha de CSS.** O plano das 8 rodadas está em
`PROMPT-implementar-v2.md`; a arquitetura de 5 destinos, em `ARQUITETURA-v2.md`.

Aplicado até aqui: **rodada 1 (fundação)** — a pele —, **rodada 2
(navegação)** — o roteamento —, **rodada 3 (Mês)** e **rodada 4 (Adiante)**.
As `<section class="tab-content">` das abas que ainda não foram refeitas
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
  `js/adiante.js`, `_token()` em `js/mes.js`, `_token()` em
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
  `importar` = extratos · `mes` = a tela de Mês · `cartao` = a tela de Cartão ·
  `adiante` = a tela de Adiante · `guardado` = metas, patrimonio ·
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
- **`APELIDOS.timeline` aponta para `cartao`**, não para `adiante`: o que
  sobrou da Timeline — contratos em aberto — mora lá agora.
- **Saíram**: a command palette (Ctrl+K), o onboarding de 4 passos (um dos
  passos era morto — `obData.bank` era escrito e nunca lido), o botão de tema,
  a gaveta lateral do celular e o hamburguer. O salário e a primeira meta que o
  onboarding coletava entram pelos botões normais.
- **Celular (< 900px): a barra lateral vira barra fixa no rodapé.** Somem a
  marca, os rótulos de grupo e o rodapé de conta; "Sair da conta" continua em
  Ajustes, onde já estava. Com Cartão são **5 destinos na barra**, e **Ajustes
  subiu para a topbar** (`.nav-topo` no `index.html`, `display:none` acima de
  900px): um sexto item deixaria cada alvo de toque estreito demais.
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

### A tela "Mês" (rodada 3)

Cinco blocos em `js/mes.js`, na ordem de leitura do `hibrido.html`: **herói ·
distribuição · resultado do mês · miniatura do fluxo · tabela única**. Cada um
tem id próprio (`mes-heroi`, `mes-dist`, `mes-resultado`, `mes-fluxo`,
`mes-tabela`) — são as âncoras de `data-goto`.

- **Uma conta só por número.** `_dados()` faz uma passada e os cinco blocos
  consomem o resultado: `allExpensesOfMonth` + `incomesOfMonth` +
  `getInvestCatIds()`, a mesma base do dashboard antigo. `projetado` é um
  RECORTE de dentro de `totalExpense`, nunca uma soma por cima.
- **A rosca usa a série do sistema (`--s1…--s6`) por posto, não a cor gravada
  na categoria.** A cor do cadastro é dado antigo e tem azul no meio
  (`DEFAULT_CATEGORIES` em `db.js:12`: Transporte `#60a5fa`, Assinaturas
  `#22d3ee`). A lista ao lado é que identifica; a rosca só reparte. As 5
  maiores + `+N categorias menores`; "Sem categoria" é linha à parte, em âmbar
  com `◇`, e leva à tabela já filtrada — é a única linha dali com ação.
- **Tabela única com coluna `origem`** (`manual` · `fatura` · `extrato`),
  derivada em `_origem()`: `_origem === 'extrato'` ou
  `source === 'statement_import'` → extrato; `importedFrom === 'pdf'` → fatura;
  resto manual. Sem essa coluna, o mesmo "Carrefour" lançado à mão e vindo do
  extrato viram duas linhas sem explicação.
- **Investimento aparece sem cor de gasto** (só o sinal `−`), e não entra no
  "saiu" do rodapé. Receita é `+` em `--entrou`, despesa `−` em `--saiu`.
- **Excluir linha de extrato pela tabela é recusado com aviso**: ela não vive
  em `transactions`, e apagá-la deixaria o lote em Importar com contador
  mentindo. O caminho é "excluir importação".
- **Os filtros moram no módulo (`_filtros`), não no DOM.** Gravar remonta a
  tela por innerHTML, e filtro que se apaga sozinho depois de cada edição faz
  perder o lugar na lista. `_restaurarFiltros()` devolve os valores.
- **O CSV exporta o que está na tela** — o que os filtros escondem não entra,
  senão o arquivo não corresponde ao que se está vendo.

**`gastos.js` e `receitas.js` deixaram de desenhar tela.** Viraram camada de
formulário + gravação: `initGastos(aoMudar)` / `initReceitas(aoMudar)` uma vez,
depois `openGastoModal(tx)` / `openReceitaModal(inc)`. Toda a validação, a
preservação de procedência, a projeção de parcelas, o aporte no ativo vinculado
e `confirmarProjecao` continuam lá, intactos. Os modais seguem no `index.html`
e não são remontados — por isso ali listener no elemento é seguro, ao contrário
do que vale na tela.

**`dashboard.js` não existe mais.** Quatro dos seis blocos foram absorvidos por
`mes.js`. Os dois que falam do futuro passaram pela rodada 4: parcelas dos
próximos 3 meses foram para `adiante.js`, e a evolução de 6 meses voltou para o
fim de `mes.js`. As cores do Chart.js nos dois passaram a vir de
`getComputedStyle` (eram `rgba(255,255,255,…)` e hex do tema escuro), a fonte
virou Outfit e a grade, `--borda`.

**O `<thead>` gruda agora — e só porque a tabela não está embrulhada.**
`position: sticky` num `<th>` resolve contra o scrollport mais próximo:
`.table-wrapper { overflow-x: auto }` e `.card { overflow: hidden }` o
quebravam, e um `overflow-x: auto` no contêiner novo quebrou de novo (medido:
`top` −1080 a 2200px de rolagem). A tabela de Mês não tem contêiner de
rolagem: `table-layout: fixed` + larguras de coluna no CSS (não em `style=`,
para a media query poder encolher) + `overflow-wrap: break-word`. O `top` do
sticky é `var(--topbar-h)`, não 0 — com 0 ele grudaria ATRÁS da topbar.

### A tela "Cartão" (pedida pela usuária depois da rodada 4)

Quatro blocos em `js/cartao.js`, cada um com id próprio (`cartao-resumo`,
`cartao-contratos`, `cartao-previstas`, `cartao-pagas` — as âncoras de
`data-goto`): **resumo · contratos em aberto · parcelas previstas · parcelas
já pagas**.

- **Por que existe:** Adiante é sobre o CAIXA do mês. Um parcelamento atravessa
  meses e é assunto do cartão; a usuária disse que não fazia sentido estar lá.
  `_contratos()` e `_parcelas()` saíram de `js/adiante.js` inteiras — mesma
  lógica, mesma chave de agrupamento.
- **"Parcelas já pagas" é o bloco novo.** Até aqui a parcela paga só aparecia
  diluída na tabela de Mês, sem dizer de que contrato era nem em que ponto dele
  estava. Aqui ela é "3/10", com o mês. Da mais recente para a mais antiga.
- **Paga = já aconteceu E não é projeção** (`!isProjected` e competência ≤ mês
  atual). Projeção do mês corrente não é dinheiro que saiu: ela está no
  contrato, não na lista de pagas. **"Restante" do contrato** segue somando só
  o que ainda não foi pago — parcela paga não é dívida.
- **Contrato de parcelamento continua sem id.** Descrição normalizada + total
  de parcelas + valor em centavos, com o mesmo risco de colisão de
  `_acharParcela`. Inventar id é mudança de modelo de dado, não de tela.
- **Bloco vazio some** (silêncio é o sinal de que não há nada), mas a tela
  inteira vazia diz o que é — senão parece quebrada.
- **As larguras de coluna estão no CSS, por id de bloco**, não em `style=`: em
  atributo a media query não consegue encolher a coluna e no celular a
  descrição da compra fica com quatro linhas. Foi medido a 375px.
- A classe de tabela `.adiante-tabela-rolagem` virou **`.tabela-folha`** quando
  deixou de ser de uma tela só. Vale a mesma regra: nenhum `overflow` no
  contêiner, `table-layout: fixed`, `<thead>` sticky em `top: var(--topbar-h)`.

### Onde o orçamento mora (decisão da usuária, rodada 3)

**Orçamento é ajuste, não leitura do mês.** Definir teto de categoria se faz uma
vez e não se olha de novo; sai de Mês e vive em Ajustes (`#tab-orcamento`,
desenhado por `orcamento.js` nos ids que ele já esperava). `data-goto="orcamento"`
leva a Ajustes. O plano original listava "orçamento × real" como sexto bloco de
Mês — foi revogado.

### Decisões da rodada A8 que viram regra

- **O app não guarda histórico de valor de ativo.** `currentValue` é o valor de
  hoje; `contributions` é o histórico de aportes. Por isso o segundo gráfico de
  Patrimônio é **"Aportes por mês"**, não "patrimônio mês a mês": a curva do
  passado não existe no dado e desenhá-la seria inventar número. Para ela
  existir é preciso gravar snapshot mensal — mudança de modelo, não de tela.
- **Contrato de parcelamento não tem id.** Cada parcela é uma transação
  independente. O card "Contratos em aberto" (`js/adiante.js`) agrupa por
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

Rodadas: **1 fundação (feita)** · **2 navegação (feita)** · **3 Mês (feita)** ·
**4 Adiante (feita)** ·
5 Guardado · 6 Importar · 7 Conferir · 8 Ajustes. Uma por vez, cada uma
terminando com o app funcionando.

### Decisões da usuária que mudam o plano original

- **Importar leva fatura E extrato, com uma aba para trocar entre os dois**
  (dito na rodada 3, vale para a rodada 6). Os dois fluxos ficam no mesmo
  destino, não em telas separadas: hoje a fatura em PDF entra por um botão de
  Mês (`initPdfImport`) e o extrato por `extratos.js`. `PROMPT-implementar-v2.md`
  já previa a porta única; o que está fechado agora é que ela tem **duas abas
  explícitas**, e não uma drop zone que adivinha sozinha o que é o arquivo.
- **Orçamento mora em Ajustes**, não em Mês (aplicado na rodada 3). O plano
  original listava "orçamento × real" como sexto bloco de Mês; foi revogado.
- **Cartão virou destino próprio** (dito na rodada 4, **implementado**).
  As parcelas — as previstas E as já pagas — saem de Adiante e vão para uma
  tela só de cartão. Adiante é sobre o caixa do mês; parcelamento é sobre o
  cartão, e a usuária disse que não faz sentido estar lá. O que sai de
  `js/adiante.js` foram `_contratos()` e `_parcelas()`; a tela nova ganhou a
  lista das parcelas **já pagas**, que não existia em lugar nenhum. A barra tem
  hoje 5 destinos (Importar · Mês · Cartão · Adiante · Guardado) e serão 6 com
  Conferir; no celular **Ajustes já saiu da barra de baixo e subiu para a
  topbar** (`.nav-topo`, escondido acima de 900px).

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
