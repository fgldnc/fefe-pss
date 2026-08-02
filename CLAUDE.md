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
| `app.js` | Bootstrap: `DOMContentLoaded`, auth, roteamento `switchTab()` com `import()` dinâmico, navegação de mês, command palette (Ctrl/Cmd+K), onboarding. |
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
| `saldos.js` | Fluxo de caixa diário do mês; exporta `renderCalendario` (é o módulo usado pela aba "Fluxo de Caixa"). |
| `calendario.js` | Calendário financeiro mensal — **não está registrado em `TAB_MODULES`** (`js/app.js:29` aponta a aba `calendario` para `saldos.js`). **Código morto** — verificado em 02/08/2026: nenhum import aponta para ele. Remoção prevista para a rodada 4 do redesign. |
| `timeline.js` | Linha do tempo de eventos financeiros com filtro por tipo. |
| `relatorios.js` | Relatórios exportáveis em CSV e JSON. |
| `configuracoes.js` | Categorias, regras de classificação, estatísticas, backup/restore, preferências, conta. |
| `pdf-import.js` | Importação de **fatura de cartão** em PDF: extração, parse por banco, preview editável, projeção de parcelas. |
| `pdf-import.legacy.js` | Versão anterior do import de fatura, substituída pelo antigo `pdf-import.fixed.js` (promovido a `pdf-import.js`). **Código morto** — não é importado por ninguém e ainda referencia `#pdf-info-text`, elemento removido do `index.html`. |
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

## Convenções observadas no código

- **`state` global exportado de `utils.js`** (`js/utils.js:7`). Todos os módulos importam e mutam o mesmo objeto: `user`, `currentMonth`, `categories`, `transactions`, `incomes`, `budgets`, `assets`, `goals`, `extratoTransactions`, `importRules`. Não há encapsulamento nem notificação de mudança.
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
- `js/pdf-import.js` (`_showPreview` e `_confirmarImportacao`) — competência da fatura = mês da 1ª transação **−1** (offset lido de `localStorage.fluxo_billing_offset`, default `'-1'`); só usado quando o campo de competência não está preenchido.
- `js/pdf-import.js` (`_tolerancia`) — parcela é considerada já existente se a diferença de valor couber na tolerância: `clamp((N-1)/100 + R$ 0,01, R$ 0,02, R$ 1,00)`, onde N é o total de parcelas. A checagem roda no preview (aviso) **e** no save (proteção).
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

**Competência (três critérios coexistindo — mudar um sem os outros desalinha os totais)**
- `js/db.js:151` — gasto normal: `competenceMonth === month`.
- `js/db.js:154` — gasto de extrato: `date.slice(0,7) === month`.
- `js/db.js:197-200` — receita: `month`, senão `competenceMonth`, senão `date.slice(0,7)`.

## Redesign em andamento

`ROTEIRO-REDESIGN.md` é o estado do redesign entre sessões: diagnóstico por aba,
decisões já fechadas, as 7 rodadas e suas dependências, e o prompt de retomada.
**Ler antes de propor qualquer mudança de interface.** A rodada corrente e seu
prompt ficam em `PROMPT-rodada-N.md`.

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
