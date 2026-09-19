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
| `conferir.js` | **A tela "Conferir"** (rodada 7): três listas derivadas do `state` — sem categoria · parcela prevista vencida · possível duplicata —, corrigíveis na própria linha. Exporta `contarPendencias()`, a conta do selo da barra. |
| `importar.js` | **A tela "Importar"** (rodada 6): duas abas explícitas (fatura de cartão · extrato bancário), a drop zone de cada uma, o offset de competência da fatura e o histórico de lotes abrível. |
| `extratos.js` | **Parse, revisão e gravação** de extrato bancário (CSV/OFX/PDF): `lotesDeExtrato`, `excluirLoteExtrato`, `importarExtratoDeArquivo`, modal de revisão com marcação de duplicata e de campo inferido, `_recomputeAtencaoExtrato()`. Não desenha tela. |
| `db.js` | Toda leitura/escrita do Firestore, `loadAllData()`, derivados de mês, backup/restore JSON, `wipeCollection`. |
| `utils.js` | `state` global, `esc`, `fmt`, helpers de mês, `toast`, skeletons, `resolveCategoryId` e o motor de insights do dashboard. |
| `mes.js` | **A tela "Mês"** (rodadas 3–4): herói, distribuição (rosca + lista), resultado do mês, miniatura do fluxo, tabela única (gasto + fatura + extrato + receita, com coluna origem) + CSV, e a evolução de 6 meses no fim. |
| `gastos.js` | **Formulário e gravação** de lançamento: modal, validação, projeção de parcelas, aporte no ativo vinculado, confirmar parcela prevista. Não desenha tela. |
| `receitas.js` | **Formulário e gravação** de receita: modal, gravação preservando procedência, copiar do mês anterior. Não desenha tela. |
| `ajustes.js` | **A tela "Ajustes"** (rodada 8): categorias · regras · orçamento · backup/restore + apagar coleção · conta · para onde foram os ajustes que mudaram de casa. Absorveu `configuracoes.js`. |
| `orcamento.js` | **Editor e gravação** de limite por categoria (`renderOrcamento`, `salvarOrcamento`). Não desenha tela: o bloco é de `ajustes.js`. |
| `guardado.js` | **A tela "Guardado"** (rodada 5): total do patrimônio + barra de composição, metas com progresso, tabela de ativos, aportes por mês. |
| `metas.js` | **Formulário e gravação** de meta e de aporte na meta. Não desenha tela. |
| `patrimonio.js` | **Formulário e gravação** de ativo e de aporte no ativo, mais `valorDepreciado()`. Não desenha tela. |
| `adiante.js` | **A tela "Adiante"** (rodada 4): saldo inicial + dia de vencimento, 3 KPIs, curva diária, tabela dos dias com movimento. |
| `cartao.js` | **A tela "Cartão"**: duas abas — *em aberto* (resumo + contratos) e *já pagas*. O bloco "parcelas previstas" foi apagado na rodada 9. |
| `saldos.js` | **Só cálculo**, sem DOM e sem `state`: `buildMovimentos`/`buildSerie`/`acharMinimo`/`contextoDoMinimo`, fixadas por `test/saldos.test.mjs`. |
| `pdf-import.js` | Importação de **fatura de cartão** em PDF: extração, parse por banco, preview editável, projeção de parcelas. O arquivo entra por `importarFaturaDeArquivo` (a tela) desde a rodada 6. Não desenha tela. |
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

**DUAS ABAS desde a rodada 9:** *O mês* (ajustes do mês · 3 KPIs · curva
diária) e *Movimentos* (a tabela dos dias). Mesma razão da tabela de Mês: ela
empurrava a curva — o assunto de Adiante — para longe do topo. O estado vazio
("nenhum movimento em X") é o MESMO nas duas abas, numa função só.

Quatro blocos em `js/adiante.js`: **ajustes do mês · 3 KPIs · curva diária ·
tabela dos dias com movimento**. Contratos em aberto e parcelas previstas
estiveram aqui na rodada 4 e foram para `js/cartao.js`.

- **O bloco de ajustes é uma FAIXA FINA** (`.faixa-fina`): largura inteira,
  altura mínima — pedido da usuária depois da rodada 9, *"o primeiro bloco tem
  que ser uma faixa menor e na largura completa, a fim de que os dois blocos
  debaixo apareçam na tela sem ter que rolar"*. **O eixo é a ALTURA, não a
  largura:** a primeira tentativa encolheu pela horizontal (`max-width`) e não
  resolveu nada, porque o que empurrava os KPIs e a curva para fora da dobra
  eram os 200px de altura. Hoje são **104px**, e a 1420×900 a curva termina em
  897px — a tela cabe inteira sem rolar (medido).
  - O `.rot` entra na PRÓPRIA fileira dos campos (grid `auto 1fr 1fr`) em vez
    de ocupar duas linhas por cima deles, e o parágrafo de explicação virou a
    legenda de cada campo: dito ao lado do campo que ele explica, custa zero
    linha e chega na hora certa.
  - Os dois campos são colunas IGUAIS: são o mesmo tipo de campo, e larguras
    diferentes liam como um sendo mais importante que o outro.

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
- **`getInvestCatIds()` (`js/utils.js`) é a regra única de "categoria é de investimento"**, consumida por `mes.js`, `orcamento.js` e `adiante.js`. Compara `id` e `name` **separadamente**: concatenar casa "investiment" atravessando a fronteira dos dois campos. Investimento sai do total de despesas em toda tela que fala de gasto — duas leituras diferentes viram dois totais para o mesmo mês. **Não existe mais nenhuma cópia local dessa regra:** `gastos.js` e `extratos.js` chamam `getInvestCatIds()`. (`relatorios.js` também a chamava; o arquivo foi apagado na rodada 8.)
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
- `js/cartao.js` (`_dados`) — `previstas` cobre os **3** meses seguintes. Depois da rodada 9 ela só alimenta o KPI "Próximos 3 meses" do resumo: a LISTA das previstas e o `MAX_PREVISTAS` foram apagados.
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
  `saldoInicial` (mapa `"YYYY-MM"` → número), `faturaVencimentoDia` e
  `vencimentoPorCartao` (mapa `nome do cartão` → dia). **Ausente nunca é
  zero:** zero é abertura legítima, ausente esconde os KPIs de mínimo e de
  projeção e troca o cabeçalho da coluna para "Acumulado".
- **Todo dia de vencimento é limitado a 1–28**, no campo geral e no mapa:
  29/30/31 não existem em todo mês e "último dia válido" mentiria sobre a data
  em que o dinheiro sai. Fora da faixa vira `null`.
- **Um vencimento POR CARTÃO** (ver "Mais de um cartão", adiante).
  `faturaVencimentoDia` é o dia do cartão **sem nome marcado**;
  `vencimentoPorCartao` cobre quem tem mais de um. A queda é em três degraus —
  dia do cartão → dia geral → dia da compra —, e cada fatura vira **uma linha**
  no dia dela. Sem nenhum dos dois, o gasto cai no dia da compra e a tela marca
  `.mark-inferido`.
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
(navegação)** — o roteamento —, **rodada 3 (Mês)**, **rodada 4 (Adiante)**,
**Cartão**, **rodada 5 (Guardado)**, **rodada 6 (Importar)**,
**rodada 7 (Conferir)** e **rodada 8 (Ajustes)** — a última.
**A sequência acabou.** Nenhum destino empilha mais de uma seção, e não sobrou
nenhuma `<section class="tab-content">` com markup no `index.html`: todas as
sete são vazias de propósito e montadas pelo módulo da tela.

- **Material de papel, DOIS TEMAS.** No claro: fundo cinza-claro (`--fundo`),
  folha branca (`--folha`), raio 16, sombra quase invisível. No escuro o mesmo
  material com os mesmos nomes de token e outros valores. *A regra "o tema
  escuro acabou" (rodada 1 da v2) foi REVOGADA pela usuária e o escuro voltou
  na rodada 9, frente D.*
  - **Um tema é REDEFINIÇÃO DE TOKEN, não regra nova.** Todo o conjunto
    (`--fundo`, `--folha*`, `--borda*`, `--ink*`, `--entrou`/`--saiu`/
    `--deduzido` e as tintas, `--s1…--s6` e os `-chip`, `--sombra`) é reescrito
    sob `html[data-tema="escuro"]`. **Regra que precisa de conserto extra no
    bloco escuro é regra errada** — está usando cor literal onde devia usar
    token. Foi assim que `.aj-btn-risco:hover` apareceu: tinha `color: #fff`
    sobre `--saiu`, que no escuro é salmão claro (2,18:1). Virou
    `--text-inverse`.
  - **`data-tema` no `<html>` é SEMPRE `claro` ou `escuro`, já resolvido.** A
    preferência tem três valores (`auto` · `claro` · `escuro`) e mora em
    `localStorage.fluxo_tema`; quem resolve `auto` contra `prefers-color-scheme`
    é `aplicarTema()` em `js/utils.js`, chamado no TOPO de `js/app.js` (fora do
    `DOMContentLoaded`: módulo executa antes dele, e o atributo precisa existir
    quando a folha de estilo pintar a primeira tela). Resolver no JS existe para
    o CSS ter **um seletor só** em vez do bloco duplicado dentro de um `@media`.
  - **A escolha fica em Ajustes → Conta**, três botões (`.aj-tema`), não um
    interruptor: `auto` é escolha de verdade. A marcação da escolhida é
    atualizada na mão porque o evento só sai quando o tema RESOLVIDO muda.
  - **TROCAR DE TEMA REPINTA A TELA INTEIRA.** Chart.js pinta em canvas e não
    resolve `var(--…)`: a cor foi lida por `getComputedStyle` na montagem, e
    trocar de tema não repinta um pixel. `aplicarTema()` dispara `tema-mudou`,
    `app.js` ouve e chama `rerenderCurrentTab()`. **Tem de ser o `render*` da
    tela, nunca um `chart.update()`:** cada tela monta só o gráfico do painel
    ABERTO e destrói a instância quando a aba dele fecha.
  - **`--marca` tem DOIS papéis e, no escuro, duas cores.** `--marca` é a marca
    como TINTA (item ativo, foco, a curva do saldo); `--marca-fundo` é a marca
    como SUPERFÍCIE, com branco por cima (botão primário, botão de login,
    losango do logo, faixa do herói, `.btn-atencao`, dia de hoje do calendário).
    No claro são a mesma cor. **No escuro não podem ser:** uma cor que dá 4,5:1
    com o branco por cima nunca dá 4,5:1 como texto sobre a folha escura — é
    aritmética de luminância. Barra de progresso NÃO entra em `--marca-fundo`:
    não tem texto em cima, e no escuro é a tinta clara que a faz aparecer.
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
- **A MALHA RESPONDE À VIEWPORT (rodada 9, frente C).** `--coluna`,
  `--margem`, `--goteira`, `--ar-secao` e `html { font-size }` são `clamp()`
  sobre `vw`, não número fixo. **A coluna tem teto de 1560px e é centrada**
  (`width: 100%` + `margin-inline: auto` em `.tab-content`/`.topbar`): linha de
  tabela mais larga não se lê, e o que sobra do teto se divide pelos dois
  lados. Antes eram 1180px fixos e **1148px de cinza morto à direita a 2560px**.
  - **O `width: 100%` não é enfeite:** `.main-content` é flex em coluna, e
    margem automática no eixo cruzado DESLIGA o stretch — sem ela o bloco
    encolhia para o conteúdo (medido: 1448px onde cabiam 1560px).
  - Abaixo de 900px `--margem`/`--goteira` são fixados no piso (16/14px): ali
    a largura é toda do conteúdo.
  - Tamanho novo entra como token no `:root`, junto dos outros. **Não abrir um
    segundo sistema tipográfico** espalhado em `13.5px`/`30px` pelo arquivo.
- **BLOCO NÃO ESTICA POR DENTRO (rodada 9, frente A).** `.faixa` é
  `align-items: start`. Sem isso o grid esticava os dois blocos até a altura do
  mais alto e o herói de Mês sem receita virava 370px para 214px de conteúdo,
  com 156px de ameixa vazia no meio (`.dica` tem `margin-top: auto`). Sobra de
  grade lê-se como grade; vazio DENTRO do bloco lê-se como bloco quebrado.
  **Espaço vazio que carrega significado fica** — o que sai é o de esticar.
- **`--ar-bloco` é o ar ENTRE blocos de topo de uma tela**
  (`clamp(20px, 2vw, 32px)`), maior que a goteira de propósito: goteira separa
  colunas de uma mesma linha, isto separa dois assuntos. Vale só para filho
  direto de `.tab-content`/`.painel-aba` — `.folha` dentro de `.faixa` é coluna,
  e margem ali desalinha as duas. Antes blocos empilhados nasciam **colados**
  (medido: 0px entre `importar-portas` e `importar-historico`), e duas folhas
  brancas encostadas leem-se como uma folha só interrompida. **Ar, régua ou
  rótulo — nunca borda nova inventada.**
- **Contraste se roda, não se supõe:** `node redesign-v2/direcoes/contraste-hibrido.mjs`
  (texto 4,5:1 · gráfico, borda e glifo 3:1), **nos DOIS temas** — o script
  varre claro e escuro, inclusive os dois papéis da marca em cada um. Mexeu em
  token de cor no CSS, mexa na tabela do script e rode: "tem modo escuro" sem
  rodar isto é chute. Borda de campo de formulário usa
  `--borda-forte`, não `--borda`: `--borda` é 1,3:1 no branco e reprova em
  WCAG 1.4.11.
- **Chart.js pinta em canvas e não resolve `var(--…)`.** As cores vêm de
  `getComputedStyle` na hora de montar o gráfico — `coresGrafico()` em
  `js/adiante.js`, `_token()` em `js/mes.js`, `_token()` em
  `js/guardado.js`. HEX literal no código é regressão conhecida.
- **Segundo canal em tudo** (WCAG 1.4.1): sinal `+` / `−` (U+2212) na coluna de
  valor, parênteses no KPI negativo, `◇` + texto + barra na borda esquerda da
  linha pendente (`.marca-d`, `tr.conferir`), tracejado na projeção, nome escrito
  na série do gráfico. **A rosca nunca vem sozinha**: ao lado dela vai a lista
  ordenada com nome, percentual e valor (`.dist` / `.cat`).
- **Silêncio quando está tudo certo.** Contador zerado não aparece como "0" —
  some, como `atualizarBadgeExtratos` (`js/app.js:118`) já faz.
- **ABA DENTRO DA TELA é `.abas` / `.aba` / `.painel-aba`, e só.** Nasceu como
  `.imp-abas` em Importar (rodada 6) e foi RENOMEADA na rodada 9, quando
  deixou de ser de uma tela só — o mesmo caminho de `.adiante-tabela-rolagem`
  → `.tabela-folha`. **Não invente um terceiro jeito de fazer aba:** foi o
  argumento que matou as `.config-tabs`, e ele vale contra qualquer um.
  - Os helpers são `abas()`, `painelAba()`, `ligarAbas()`, `focarAba()` e
    `pegarAbaPedida()`, no fim de `js/utils.js` — o único módulo comum às
    telas que não fecha ciclo de import, como os helpers da revisão de
    importação logo acima deles.
  - **A tela monta SÓ O PAINEL ABERTO.** Não é economia: Chart.js mede o
    `<canvas>` na hora, e canvas dentro de `display:none` mede zero — e fica
    zero. Renderizar só o painel visível resolve na raiz, e cada tela **destrói
    a instância do gráfico** quando a aba dele fecha (o listener de resize
    ficaria vivo sobre um canvas já removido).
  - **A ABA ABERTA MORA NO MÓDULO** (`let _aba = '…'`), nunca no DOM: a tela é
    reinjetada por `innerHTML` a cada gravação, e aba que se fecha sozinha faz
    perder o lugar logo depois de uma edição — que é quando se quer fazer a
    próxima. Mesma razão dos `_filtros` de Mês.
  - **O clique vai pelo listener delegado da seção** (`ligarAbas(sec, grupo, …)`,
    chamado UMA vez no init), nunca no elemento. As setas ← → andam entre as
    abas.
  - **O contador da aba é NEUTRO** (`.aba-conta`). Âmbar (`.alerta`) só em
    Conferir, onde o número É pendência: "3 contratos" é informação, e âmbar
    num número que não pede nada de ninguém é alarme de nada. Zero não aparece.
  - **O bloco não repete o nome da aba.** `.rot` que diga a mesma coisa que a
    aba aberta sai; sobra a `.rot-sub`. Paga em Cartão e nas três de Conferir.
- **TODA ÂNCORA DE `data-goto` QUE CAIA DENTRO DE UMA ABA ABRE A ABA ANTES DE
  ROLAR.** O mapa é `ABAS_DE_ANCORA` em `js/app.js`, ao lado de `ANCORAS`, e a
  entrega é `abaPedida` em `utils.js`: `app.js` escreve ANTES do `switchTab`,
  a tela lê no começo do render e apaga. Depois do render já é tarde — o bloco
  não existe no DOM para rolar até ele. Sem isto, `data-goto="gastos"` chegava
  a Mês e rolava até uma tabela escondida.
- **`.faixa-par` é a linha de DOIS BLOCOS IRMÃOS:** colunas iguais (`1fr 1fr`)
  e alturas iguais (`align-items: stretch`). Contradiz de propósito o `start`
  da `.faixa` comum — ali o par é número + desenho, e esticar deixava o herói
  oco; aqui os dois blocos são da mesma natureza e a diferença de altura é que
  lia como desalinho (*"está tudo de tamanho diferente"*). Quem estica ganha
  `.apoio { margin-top: auto }`: a sobra vai para ANTES da régua de números e
  assenta a última linha no pé da folha, alinhada com o pé do vizinho.
  **Sobra empurrada para o fim do bloco parece bloco que acabou cedo; sobra que
  assenta a última linha parece espaçamento.**
- **`.btn-2` FUNCIONA SOZINHO** — está no seletor base junto de `.btn`, em
  `css/components.css`. Era só modificador, e quatro botões de Ajustes escritos
  com `class="btn-2"` apareciam como texto cru com um fio em volta.
  Modificador que só funciona acompanhado é armadilha que se paga toda vez que
  alguém escreve o markup de memória. **A aparência de `.btn-2` mora em
  `components.css`, não em `style.css`:** ela carrega depois, e a regra base
  zerava a borda.
- **Largura de coluna de tabela é POR CLASSE, não por `nth-child`**, onde a
  tabela tem coluna que entra e sai (`col-cartao`, `col-parc`, `col-val`,
  `col-mes` em Cartão). Com posição, cada coluna passava a medir a largura da
  vizinha quando a opcional aparecia.
- **Vocabulário v2 disponível em `css/style.css`** (fim do arquivo): `.folha`,
  `.rot`, `.rot-sub`, `.linha-topo`, `.ir`, `.nota`, `.faixa`, `.heroi`,
  `.dica`, `.apoio`, `.mais`/`.menos`/`.alerta`, `.pilula`, `.dist`, `.cat`,
  `.chip`, `.selo`, `.rodape`, `.marca-d`, `tr.conferir`, `.esconde-sm`. Copiado
  do `hibrido.html`, **não reinventado** — reusar, não criar símbolo novo. Os
  seletores de elemento (`table`, `th`, `td`) estão escopados em `.folha` para
  não pegarem as `.data-table` das abas antigas.
- **`.btn-2` (botão secundário) só entrou no CSS na rodada 5.** Ele existe no
  `hibrido.html` desde a primeira versão, mas nunca tinha sido copiado: os
  botões `class="btn btn-2"` de Mês, Adiante e Cartão caíam no `.btn`
  genérico, que tem `border-color: transparent` — apareciam como texto solto
  sobre a folha branca. O contorno é `--borda-forte`, não `--borda`, pela
  mesma razão do campo de formulário.

### Roteamento por destino (rodada 2)

- **`DESTINOS` em `js/app.js` é o mapa da navegação.** Um destino é uma LISTA de
  seções do `index.html`, mostradas juntas e renderizadas na ordem do array:
  `importar` = a tela de Importar · `conferir` = a tela de Conferir ·
  `mes` = a tela de Mês · `cartao` = a tela de Cartão ·
  `adiante` = a tela de Adiante · `guardado` = a tela de Guardado ·
  `ajustes` = configuracoes, relatorios. **Empilhar é o estado intermediário**:
  as rodadas 3 a 8 fundem cada destino numa tela só, e a lista encolhe junto.
  Os `render*` são chamados **em série** — a ordem é a de leitura da tela, e
  cada parte falha sozinha, com toast, sem derrubar as outras.
- **`APELIDOS` mantém os ids de aba antigos válidos como endereço.**
  `switchTab('gastos')` e `data-goto="gastos"` continuam funcionando: resolvem
  para o destino que hoje contém a seção, e `_goto` **rola até a seção** dentro
  dele (`scroll-margin-top` cobre a topbar sticky). Não vale a pena caçar as
  chamadas agora — a rodada da tela reescreve o card que as contém.
- **CONFERIR entrou na navegação na rodada 7**, como item FIXO — visível mesmo
  vazio. São 6 destinos na barra do celular; medido a 375px, cada alvo tem
  **61px**, acima do mínimo de toque, e Ajustes já morava na topbar desde o
  Cartão. Navegação que aparece e some é navegação que não se aprende, e a tela
  sabe explicar o próprio vazio.
- **`APELIDOS.timeline` aponta para `cartao`**, não para `adiante`: o que
  sobrou da Timeline — contratos em aberto — mora lá agora.
- **Saíram**: a command palette (Ctrl+K), o onboarding de 4 passos (um dos
  passos era morto — `obData.bank` era escrito e nunca lido), o botão de tema,
  a gaveta lateral do celular e o hamburguer. O salário e a primeira meta que o
  onboarding coletava entram pelos botões normais.
- **Celular (< 900px): a barra lateral vira barra fixa no rodapé.** Somem a
  marca, os rótulos de grupo e o rodapé de conta; "Sair da conta" continua em
  Ajustes, onde já estava. Com Cartão e Conferir são **6 destinos na barra**
  (61px de alvo a 375px, medido), e **Ajustes subiu para a topbar** (`.nav-topo` no `index.html`, `display:none` acima de
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
- **Toda seção de tela é montada pelo módulo dela** — as sete `<section>` do
  `index.html` são vazias de propósito. Editar markup de tela no HTML não tem
  efeito nenhum. Só os MODAIS continuam no HTML, e por isso só neles vale
  listener preso ao elemento.
- **`_goto` rola o documento na mão, não com `scrollIntoView`.** Medido na
  rodada 8: o `overflow-x: hidden` do `body` faz o computed virar `hidden auto`,
  o que torna o body um contêiner de rolagem que nunca rola — e
  `scrollIntoView` resolve contra ele. Toda âncora de `data-goto` levava ao
  destino certo e ao TOPO dele. Mesma família da armadilha do `<thead>` sticky.

### A tela "Mês" (rodada 3)

**DUAS ABAS desde a rodada 9:** *O mês* (herói · distribuição · resultado ·
miniatura do fluxo · evolução de 6 meses) e *Tudo que entrou e saiu* (a tabela
única). Pedido da usuária: a tabela **não deve ficar à vista** — ela é a coisa
mais alta da tela e empurrava a evolução para fora de qualquer dobra.
`data-goto="gastos"` aponta para `mes-tabela` e abre a segunda aba antes de
rolar; o `data-filtro-proj` continua funcionando porque o `<select>` já existe
quando os filtros são aplicados.

Cinco blocos em `js/mes.js`: **herói · distribuição · resultado do mês ·
miniatura do fluxo · tabela única**. Cada um tem id próprio (`mes-heroi`,
`mes-dist`, `mes-resultado`, `mes-fluxo`, `mes-tabela`) — são as âncoras de
`data-goto`.

**A GRADE MUDOU DE PAR depois da rodada 9** (*"a página de mês ficou bem
feinha, está tudo de tamanho diferente"*). Cada linha junta agora dois blocos
**da mesma natureza**, em `.faixa-par` (colunas e alturas iguais):

| linha | blocos |
|---|---|
| os dois números do mês | herói · resultado do mês |
| os dois desenhos | distribuição · miniatura do fluxo |
| a retrospectiva | evolução de 6 meses, sozinha e larga |

Antes as linhas eram número + desenho (herói+distribuição, resultado+fluxo), e
a coluna estreita de uma era a larga da outra — foi isso que leu como "tamanho
diferente". A ordem de leitura do `hibrido.html` cedeu para o emparelhamento:
ela continua sendo herói → distribuição → resultado → fluxo na LEITURA, só que
em coluna, não em linha.

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

### Mais de um cartão (pedido da usuária, depois da rodada 9)

> *"na hora de importar cartão e na aba de cartão, deve ter como escolher mais
> de um cartão para visualizar caso a pessoa tenha 2. tem outras pessoas que
> usam meu site e talvez eles tenham mais cartões."*

- **O MODELO É UM CAMPO DE TEXTO `card` NA TRANSAÇÃO — e nada mais.** Sem
  coleção nova, sem id de cartão. A mesma escolha que o contrato de
  parcelamento já faz, e pela mesma razão: é o que permite o recurso nascer
  **sem migração**.
- **A lista de cartões é DERIVADA** dos lançamentos (`cartoesConhecidos()` em
  `js/utils.js`), como as três listas de Conferir são derivadas do `state`. Um
  cartão some sozinho quando o último lançamento dele sai. Não há cadastro de
  cartão, e não deve haver: o campo é livre, com `<datalist>` das grafias já
  usadas — `<select>` obrigaria a cadastrar antes de usar.
- **`card` ausente é "não informado", nunca erro.** Todo o histórico anterior a
  este recurso não tem o campo. Ele aparece em **"Todos"** e em nenhum cartão
  específico; escondê-lo de "Todos" faria a tela mentir para quem nunca
  preencheu o campo.
- **Onde se informa:** (1) em Importar, na aba da fatura, um campo que vale
  para a **fatura inteira** — uma fatura é de um cartão só, e perguntar linha a
  linha seria perguntar 40 vezes a mesma coisa; o último usado fica em
  `localStorage.fluxo_ultimo_cartao`. (2) no modal de lançamento, **só quando o
  tipo é cartão de crédito** — em Pix não existe cartão para nomear, e trocar o
  tipo para Pix apaga o cartão na gravação, para não guardar informação falsa.
  As parcelas projetadas herdam o cartão da compra pelo spread do `tx`.
- **O cartão entra na CHAVE do contrato** em `cartao.js`: a mesma compra
  parcelada em dois cartões são dois contratos, e somá-los daria um "falta
  pagar" que não existe em conta nenhuma.
- **A fileira de cartões só aparece com DOIS OU MAIS** (`.cartao-fileira`), com
  "Todos" primeiro e o contador neutro (`.aba-conta`) em cada um. **Não é um
  terceiro jeito de fazer aba:** aba troca o ASSUNTO da tela, a fileira troca o
  RECORTE do mesmo assunto — daí a pílula contornada, o desenho de
  `.aj-tema-op` e `.imp-banco`.
- **A coluna "Cartão" nas tabelas só existe quando distingue algo** (dois ou
  mais cartões E sem filtro ativo): filtrada num deles, repetiria a mesma
  palavra em toda linha. Mesma regra do selo do tipo da meta em Guardado.
- **Filtro que esvazia a tela NÃO pode esconder a fileira**, senão escolher um
  cartão sem parcelas vira beco sem saída — some o conteúdo e some junto o
  botão de voltar para "Todos".

**UM VENCIMENTO POR CARTÃO** (a consequência que a usuária apontou: *"se tiver
mais de um cartão fica meio pá né"*). Duas faturas em dias diferentes somadas
num dia só **inventam um aperto que não existe** naquele dia — e escondem o que
existe no outro. Era exatamente o que acontecia: `faturaVencimentoDia` era um
número só.

- `settings/fluxo` ganhou **`vencimentoPorCartao`**, mapa `nome → dia`.
  **`faturaVencimentoDia` continua existindo e não mudou de sentido:** é o dia
  do cartão **sem nome marcado**, que é o caso de todo mundo que nunca
  preencheu o campo. Documento sem o mapa novo se comporta exatamente como
  antes.
- **A queda é em três degraus:** dia do cartão → dia geral → dia da compra.
  Cartão nomeado sem dia próprio usa o geral (melhor agrupar no dia provável do
  que espalhar a fatura pelos dias das compras); sem nenhum dos dois, cai no
  dia da compra e a tela marca que está inferindo, como sempre foi.
- **`buildMovimentos` devolve UMA LINHA POR FATURA**, cada uma no dia dela. O
  nome do cartão só entra na descrição quando há mais de uma — com uma só,
  "Fatura do cartão · Nubank" repete o que já é único. `faturaAgrupada` segue
  booleano: quem consome só quer saber se houve agrupamento.
- **O mapa é mesclado cartão a cartão** em `saveFluxoConfig`, como
  `saldoInicial` é mês a mês: gravar o dia do Nubank não pode apagar o do Itaú.
  `null` num cartão remove aquele cartão. No restore de backup vale a mesma
  regra dos outros dois campos — **o que já existe vence o que vem do arquivo**.
- Em Adiante a faixa ganha **um campo por cartão** mais o "sem cartão marcado".
  O campo de dia é mais estreito que o de saldo (`.adiante-campo-dia`): com a
  largura do saldo, quatro campos não caberiam numa fileira só e a faixa
  voltaria a ter duas linhas. A 375px o saldo toma a linha inteira e os dias
  ficam dois por linha.
- Fixado por `test/saldos.test.mjs` (três casos novos): dois cartões em dias
  diferentes, a queda em três degraus, e a descrição sem o nome quando o cartão
  é único.

### A tela "Cartão" (pedida pela usuária depois da rodada 4)

**DUAS ABAS desde a rodada 9** (`.abas`/`.aba`, o vocabulário único):

- **em aberto** — `cartao-resumo` + `cartao-contratos`
- **já pagas** — `cartao-pagas`

- **O bloco "Parcelas previstas" foi APAGADO** (decisão da usuária: *"a
  contratos em aberto já mostra isso"*). Ele listava parcela a parcela dos
  próximos 3 meses o que o contrato já resume numa linha. `MAX_PREVISTAS` saiu
  junto; `d.previstas` sobreviveu só como o KPI "Próximos 3 meses" do resumo.
- **O `.rot` "Contratos em aberto" saiu:** a aba aberta já diz o nome, e
  repeti-lo 20px abaixo é a mesma palavra duas vezes — a regra que já tinha
  tirado o selo do tipo da meta em Guardado. Sobra a `.rot-sub`.
- **Aba sem nada dentro não se abre:** com só uma das duas com conteúdo, a que
  tem é a que vale, venha o `_aba` de onde vier. Com as duas vazias, a tela
  inteira se explica, como antes.

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

### A tela "Guardado" (rodada 5)

**DUAS ABAS desde a rodada 9**, no arranjo que a usuária descreveu (*"está
MUITO feia. sem a separação entre os blocos e tá muito bloco sem mostrar
nada"*):

- **O que você tem guardado** — `guardado-total` e `guardado-aportes-mes`
  **lado a lado** na `.faixa` de duas colunas (a mesma de Mês), e
  `guardado-metas` embaixo. O total é um número curto e o gráfico é largo:
  juntos preenchem uma linha que nenhum dos dois preenchia sozinho.
- **Onde está guardado** — `guardado-ativos`, a tabela, que é alta e não
  divide bem com nada.

`APELIDOS.metas` cai na primeira aba, `APELIDOS.patrimonio` na segunda.

Quatro blocos em `js/guardado.js`, cada um com id próprio (`guardado-total`,
`guardado-metas`, `guardado-ativos`, `guardado-aportes-mes` — as âncoras de
`data-goto`): **total · metas · onde está guardado · aportes por mês**.
`APELIDOS.metas` e `APELIDOS.patrimonio` apontam para `guardado`, e as
`ANCORAS` levam a `guardado-metas` e `guardado-ativos`.

- **`metas.js` e `patrimonio.js` deixaram de desenhar tela**, como
  `gastos.js`/`receitas.js` na rodada 3: viraram `initMetas(aoMudar)` /
  `openMetaModal` / `openAporteMetaModal` / `excluirMeta` e
  `initPatrimonio(aoMudar)` / `openAtivoModal` / `openAporteAtivoModal` /
  `excluirAtivo` / `valorDepreciado`. Os modais seguem no `index.html` e não
  são remontados — ali listener no elemento é seguro. Na TELA não é: um
  listener só, delegado em `#tab-guardado` por `data-guardado="…"`.
- **`valorDepreciado()` é a regra única de "quanto este bem vale hoje"**, e a
  tela a importa em vez de repetir a conta. Duas leituras do mesmo bem viram
  dois patrimônios totais.
- **A rosca "Composição" morreu.** Os três números do `.apoio` já SÃO a
  composição, em número; a rosca repetia em desenho o que já estava escrito, e
  pintava com `--c2/--c4/--c5`, cor do tema antigo. No lugar ficou
  `.guardado-barra`: uma barra empilhada de 10px, com `.guardado-legenda`
  nomeando cada parte ao lado — cor nunca sozinha.
- **"Aportes por mês" continua sendo o único gráfico de série**, e continua
  pelo mesmo motivo: **o app não guarda histórico de valor de ativo**.
  `currentValue` é o valor de hoje; o histórico que existe é o de aportes.
  Desenhar "patrimônio mês a mês" seria inventar número. Só existe com
  snapshot mensal — mudança de modelo, não de tela.
- **O vínculo ativo→meta se nomeia dos dois lados**: a meta diz "↳ alimentada
  por *ativo*", o ativo diz "↳ credita a meta *meta*". Antes isso só existia
  dentro de um `<select>` que só aparecia com tipo "investimento". Quem
  credita continua sendo `db.js:addAporteToAsset` — a regra mora lá de
  propósito, para valer venha o aporte de onde vier.
- **A barra de progresso da meta usa `--marca`**; meta cumprida vira
  `--entrou` com "Meta alcançada" escrito ao lado. O valor em R$ ao lado
  segue em `--ink`: a marca nunca toca um número de dinheiro.
- **O selo do tipo da meta só aparece quando acrescenta.** "Reserva de
  emergência · RESERVA DE EMERGÊNCIA" é a mesma palavra duas vezes; se o nome
  já contém a primeira palavra do tipo, o selo some.
- **`.guardado-toggle` NÃO é `.ir`.** `.ir` é um quadrado de 28px para o glifo
  "↗": texto dentro dele quebra em três linhas ("2 / aport / e"). Foi medido.
- A tabela de ativos segue a regra das outras: `.tabela-folha`, **nenhum
  `overflow` no contêiner**, `table-layout: fixed`, larguras **no CSS por id
  de bloco**, `<thead>` sticky em `top: var(--topbar-h)`, e `esconde-sm` no
  `<th>` **e no `<td>`**. Abaixo de 900px sobram Ativo · Hoje · ações, e o
  "+ Aporte" da linha some para os dois ícones caberem inteiros.

### A tela "Conferir" (rodada 7)

**TRÊS ABAS desde a rodada 9** — a usuária disse que a tela era *"ok, mas um
pouco informação demais"*. Cada aba diz **quantas tem** (`.aba-conta.alerta`),
senão não se sabe onde olhar. **O selo da barra continua sendo a SOMA das
três:** `contarPendencias()` não mudou e segue vindo da mesma travessia que
desenha as listas. **Aba vazia não se abre:** corrigir a última linha de uma
lista esvazia a aba em que se está, e a tela cai para a primeira que ainda tem
algo — ficar olhando um painel em branco não diz o que fazer a seguir.

Três blocos em `js/conferir.js`, cada um com id próprio (as âncoras de
`data-goto`): **sem categoria** (`conferir-sem-categoria`) · **parcelas
previstas que já venceram** (`conferir-projetadas`) · **parece lançado duas
vezes** (`conferir-duplicatas`).

- **Por que existe:** até aqui uma pendência só aparecia onde ela por acaso
  passava — o lançamento sem categoria era uma linha âmbar no meio da tabela
  de Mês, a parcela projetada vencida ficava indistinguível de uma que ainda
  vai vencer, e duplicata só era detectada NA HORA da importação; depois de
  salva, ninguém mais olhava.
- **TUDO É DERIVADO DO `state`.** Nenhum campo novo no Firestore, nenhuma
  coleção nova: as três listas são três travessias sobre o que já existe. É o
  que permitiu a tela nascer sem migração.
- **CONFERIR OLHA A BASE INTEIRA, NÃO O MÊS DO TOPO.** É a única tela do app
  assim, e de propósito: pendência escondida atrás da navegação de mês é
  pendência que não se acha. Se o selo falasse só do mês selecionado, ele
  mudaria ao trocar de mês e deixaria de ser "o que falta fazer". A tela diz
  isso em negrito no `page-intro`, porque contraria a expectativa do resto do app.
- **O selo de pendência saiu de Importar e veio para Conferir**, e a conta saiu
  de `app.js`: quem conta é `contarPendencias()`, a MESMA travessia que desenha
  as três listas. Quando a conta vivia em dois arquivos era só questão de tempo
  até divergir. O selo é **recontado a cada `switchTab`** — antes só no login e
  na virada de mês, e uma categoria escolhida no modal de Mês o deixava velho.
  Import dinâmico, como todo módulo de aba.
- **A regra de "sem categoria" é a mesma do resto do app** (`semCat` em
  `extratos.js`): despesa sem categoria resolvida; receita não conta.
- **Parcela prevista vencida é pergunta, não erro.** `isProjected` e
  competência **menor que o mês DE HOJE** (não o do topo). Enquanto a
  competência é futura a projeção está fazendo o trabalho dela. Importar a
  fatura responde sozinho — `_acharParcela` reconcilia —; quem não importa
  responde aqui, e o "Aconteceu" chama a MESMA `confirmarProjecao` de
  `gastos.js` que a tabela de Mês usa. Duas conversões de projeção em fato
  viram duas regras que divergem.
- **A chave de duplicata é `dedupKey` MAIS o número da parcela.** O acréscimo
  não é enfeite: as parcelas de um contrato compartilham a data da compra, a
  descrição e o valor, e diferem só no número — sem ele, um parcelado em 10x
  virava um grupo de 10 "duplicatas", e a tela acusaria como erro exatamente o
  que o app acabou de criar de propósito. **Medido:** 2/10 e 3/10 do mesmo
  notebook caíam no mesmo grupo. Duas importações da mesma parcela 2/10
  continuam colidindo, que é o caso que a lista existe para achar.
- **"São dois mesmo" mora no `localStorage`** (`fluxo_conferir_nao_duplicata`),
  não no Firestore: a tela é derivada e não pode inventar campo, e isto é um
  julgamento sobre um PAR, não um dado do lançamento. O custo é conhecido — não
  viaja entre dispositivos. Refazer o julgamento é barato; mudar o modelo, não.
- **Apagar linha de extrato é recusado com aviso**, a mesma recusa da tabela de
  Mês: ela pertence a um lote, e apagá-la sozinha deixaria o contador do lote
  mentindo. O caminho é "excluir lote", em Importar.
- **Teto de 40 por lista** (`MAX_LISTA`), com rodapé "mostrando 40 de N" — a
  omissão nunca é silenciosa, como em `MAX_PAGAS`. Uma tela de 400 linhas não
  se confere: desiste-se dela.
- **Bloco zerado some; a tela inteira zerada diz o que é.** Ela é item fixo da
  barra, então vazio é o estado NORMAL dela e precisa se explicar, senão parece
  quebrada — mesma regra de `cartao.js`.
- **`tr.conferir` pinta TODA linha das duas tabelas.** Não é redundância: é o
  que amarra esta tela à linha âmbar que ela já viu em Mês e na revisão de
  importação — o mesmo símbolo significando a mesma coisa nos três lugares.
- **`.conferir-btn` NÃO é `.ir`** — armadilha já paga em `.guardado-toggle`
  (rodada 5) e `.imp-lote-btn` (rodada 6).
- **A 375px a goteira da tabela cai para 8px e a coluna VALOR some** em "sem
  categoria" (`esconde-sm` no `<th>` E no `<td>`): para escolher categoria quem
  identifica é a descrição, e o valor está em Mês. Nas previstas quem some é a
  coluna **Data**, com a competência passando a viver no `.sub` da descrição.
  **Medido:** o `padding-left: 16px` de `td + td` come 48px antes de qualquer
  coluna, e sem isso a descrição ficava com 41px — uma letra por linha.

### A tela "Importar" (rodada 6)

Dois blocos em `js/importar.js`, cada um com id próprio (as âncoras de
`data-goto`): **portas** (`importar-portas`, com `importar-fatura-ajuste`
dentro) e **histórico** (`importar-historico`).

- **Duas abas explícitas, não uma drop zone que adivinha.** Decisão da usuária.
  Fatura e extrato leem PDF os dois, e as regras de competência são diferentes:
  a fatura conta no mês em que FECHA, o extrato no dia de cada lançamento.
  Adivinhar pelo arquivo erraria em silêncio, e o erro só apareceria depois —
  como gasto no mês errado, que é exatamente o que a rodada da competência foi
  corrigir. Por isso quem decide para onde o arquivo vai é a **aba aberta**.
- **O botão "Importar fatura PDF" saiu de Mês** e `btn-novo-extrato` saiu do
  `index.html`: as duas portas são esta tela. Os dois atalhos de `app.js`
  (`btn-import-pdf-dash` e `btn-novo-extrato`) saíram junto.
- **O passo 1 dos modais deixou de ser o caminho.** A drop zone mora na tela; o
  arquivo entra por `importarFaturaDeArquivo` / `importarExtratoDeArquivo` e o
  modal abre **já no passo 2**, a revisão. O ciclo ficou com um clique a MENOS,
  não a mais. O markup do passo 1 continua nos modais como caminho de recuo.
- **A REVISÃO CONTINUA NO MODAL, com o mesmo vocabulário** — `.mark-inferido`,
  `.field-inferido`/`.field-editado`, `.row-atencao`, `.import-summary-bar`,
  `.btn-atencao`, `.modal-import` e os helpers no fim de `js/utils.js`. Nada foi
  reinventado, e **salvar continua nunca sendo bloqueado**.
- **NADA DE PARSING MUDOU.** `competenciaDaFatura`, `_tolerancia`,
  `_acharParcela`, a reconciliação de parcela projetada, `dedupKey`,
  `detectDuplicates` e a ordem de `SECTION_HEADERS` estão intactos, e nenhum
  teste precisou mudar (68/68).
- **O offset de competência da fatura veio de Ajustes** (era a 4ª sub-aba de
  Configurações), pelo mesmo motivo que o dia de vencimento veio para Adiante na
  rodada 4: ele decide em que mês uma fatura INTEIRA cai, e o lugar de mexer
  nele é onde a consequência aparece. Fica **só na aba da fatura** — no extrato
  a competência é a data de cada lançamento e o offset não significa nada. A
  frase diz a consequência com mês de verdade ("vence em setembro → conta em
  agosto"), porque "X−1" não se confere. Em Ajustes ficou um ponteiro com
  `data-goto="importar"`; o `localStorage.fluxo_billing_offset` é o mesmo.
- **A lista solta de "transações importadas" morreu.** Ela repetia a tabela de
  Mês — que já traz os lançamentos de extrato, com coluna `origem` — sem dizer
  de que importação vinha cada linha. No lugar, **cada lote abre**: a pergunta
  de Importar é "o que veio neste arquivo?", a de Mês é "o que aconteceu neste
  mês?". Os filtros por banco e por tipo saíram junto — o lote já nomeia o banco.
- **O lote de FATURA não abre**, e é de propósito: o registro dela
  (`importedInvoices`) existe para travar reimportação e não guarda os
  lançamentos. Botão que não abre nada é pior que botão nenhum. Esse histórico
  vem do Firestore e não do `state`, então a tela desenha sem ele e **repinta só
  o bloco** quando a leitura chega — tela que espera rede parece quebrada.
- **Lado zerado não aparece** no lote: "+R$ 0,00" num lote só de despesas é
  ruído, e silêncio é o sinal de que não há nada daquele lado.
- **Os círculos coloridos de banco saíram.** O do Bradesco é azul, e azul não
  entra em papel nenhum nesta pele; e cor de marca de banco não identifica
  melhor que o nome escrito ao lado dela — é o mesmo argumento da rosca com a
  legenda. O banco também virou opcional (clicar de novo desmarca): o parser
  reconhece pelo nome do arquivo.
- **`.imp-lote-btn` NÃO é `.ir`**, pela razão já paga em `.guardado-toggle` na
  rodada 5: `.ir` é um quadrado de 28px para o glifo "↗" e texto dentro dele
  quebra em três linhas.
- A tabela do lote segue a regra das outras: `.tabela-folha`, **nenhum
  `overflow` no contêiner**, `table-layout: fixed`, larguras **no CSS por id de
  bloco**, `<thead>` sticky em `top: var(--topbar-h)`, `esconde-sm` no `<th>`
  **e no `<td>`**. Medido: sem rolagem horizontal em 1420, 1120, 1000, 900 e
  375px, e o sticky resolve em 60px.

### A tela "Ajustes" (rodada 8 — a última)

**QUATRO ABAS desde a rodada 9** — a rodada 8 tinha decidido o contrário, e a
usuária REVOGOU: *"deve tb separar por abas tudo da ajustes. rolar tudo pra
encontrar o que quer é muito paia."* Os seis blocos viraram:

| aba | blocos |
|---|---|
| Categorias e regras | `ajustes-categorias` + `ajustes-regras` |
| Orçamento | `ajustes-orcamento` |
| Backup | `ajustes-backup` |
| Conta | `ajustes-conta` + `ajustes-mudou` (rodapé) |

- **Categorias e regras andam juntas** porque são a mesma pergunta ("em que
  caixa cai este gasto?") respondida de dois jeitos, e a regra aponta para a
  categoria: separá-las obrigaria a trocar de aba no meio de uma tarefa só.
- **"O que mudou de casa" não merece aba própria:** ninguém vem a Ajustes
  procurar por ele; ele existe para ser encontrado por quem procurava outra
  coisa. Fica como rodapé de "Conta".
- **O editor do orçamento (`renderOrcamento`) só é chamado com a aba dele
  aberta** — o `#orcamento-editor` que ele preenche não existe nas outras.
- **NÃO é um terceiro jeito de fazer aba.** É o MESMO vocabulário de Importar,
  renomeado de `.imp-abas` para `.abas`. O argumento que matou as
  `.config-tabs` continua valendo contra quem inventar um terceiro, e o CSS
  delas segue **removido**, não sem uso.
- **`configuracoes.js` morreu**, absorvido inteiro por `ajustes.js` (como
  `dashboard.js` na rodada 3). **`relatorios.js` morreu de vez** — decisão da
  usuária: seis relatórios fixos para uma pessoa só, e cada tabela do app já
  exporta o próprio CSV com o que está na tela. `APELIDOS.relatorios` continua
  apontando para `ajustes`, para um `data-goto` esquecido não virar clique
  morto.
- **`orcamento.js` seguiu `gastos.js`:** virou editor + gravação. O markup do
  bloco saiu do `index.html` e é de `ajustes.js`; o botão de salvar **não tem
  listener próprio** (é reinjetado a cada render) e chama `salvarOrcamento()`
  pelo delegado da tela.
- **Salvar orçamento SUBSTITUI o mês no `state`, não mescla.** `saveBudgets`
  apaga no Firestore o teto que saiu da tela; com o `Object.assign` antigo o
  teto apagado sobrevivia em memória até o reload, e a barra media contra um
  limite que já não existia.
- **As estatísticas e o apagar-coleção FICARAM** (decisão da usuária): o wipe é
  o que torna "restaurar backup" utilizável sem duplicar tudo. Duas
  confirmações, de propósito. `wipeCollection` continua morando em `db.js`.
- **Vermelho na zona de risco não é dinheiro negativo** — é borda de bloco, e
  vem com a palavra "Apagar" escrita: o segundo canal, como em toda tela.
- **O offset de competência e o dia de vencimento NÃO voltaram.** O bloco
  `ajustes-mudou` é um rodapé que diz para onde cada um foi (Importar, rodada
  6; Adiante, rodada 4) com um botão `data-goto`. Custa menos que a pessoa
  procurar e não achar.
- **A cor padrão de categoria nova era `#3982f7`** — azul, que não entra em
  papel nenhum nesta pele. Virou `#A8336B`, a primeira da série categórica, no
  módulo e no `value` do `<input type="color">` do modal.
- **Nenhuma tabela nesta tela** — são listas (`.aj-lista`/`.aj-item`). Por isso
  Ajustes não tem `<thead>` sticky, largura de coluna nem `esconde-sm`.
  **Medido a 375px:** o padrão do regex toma a linha inteira (em linha com o
  nome da categoria ficava com 92px, e um regex de 11 caracteres não cabe
  nisso), e a cor em hex some — o círculo ao lado já mostra a cor.


### Onde o orçamento mora (decisão da usuária, rodada 3)

**Orçamento é ajuste, não leitura do mês.** Definir teto de categoria se faz uma
vez e não se olha de novo; sai de Mês e vive em Ajustes. Desde a rodada 8 é o
terceiro bloco de `#tab-ajustes` (`#ajustes-orcamento`), montado por
`ajustes.js`; `orcamento.js` só preenche `#orcamento-editor` e grava.
`data-goto="orcamento"` leva a Ajustes, no bloco. O plano original listava "orçamento × real" como sexto bloco de
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
**4 Adiante (feita)** · **Cartão (feita)** · **5 Guardado (feita)** ·
**6 Importar (feita)** · **7 Conferir (feita)** · **8 Ajustes (feita)**.
**As oito estão feitas — o redesign v2 acabou.** O fecho da sequência, com o
que mudou e o que ficou pendente, está em `FECHO-REDESIGN-v2.md`.

**Rodada 9 (depois do fecho)** — quatro frentes pedidas pela usuária:
**A densidade · B abas dentro da tela · C a tela se ajustar à resolução ·
D o modo escuro de volta. AS QUATRO ESTÃO FEITAS.** O plano original está em
`PROMPT-rodada-9-densidade-abas-escuro.md` e o registro do que cada frente
mudou, no fim de `FECHO-REDESIGN-v2.md`.

### Decisões da usuária que mudam o plano original

- **Importar leva fatura E extrato, com uma aba para trocar entre os dois**
  (dito na rodada 3, **implementado na rodada 6**). Os dois fluxos ficam no
  mesmo destino, não em telas separadas. `PROMPT-implementar-v2.md` já previa a
  porta única; o que a usuária fechou é que ela tem **duas abas explícitas**, e
  não uma drop zone que adivinha sozinha o que é o arquivo.
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
