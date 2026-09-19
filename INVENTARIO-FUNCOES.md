# INVENTÁRIO DE FUNÇÕES — o que o Radar faz, ignorando onde mora

Data: 18/09/2026. Método: leitura do código, não da tela. Cada linha cita
`arquivo:linha`. Aparência não entrou aqui.

Legenda das colunas:

- **tipo** — `entrada` (põe dado no sistema), `consulta` (só lê), `config`
  (muda como o sistema se comporta).
- **frequência** — `mensal` (todo começo de mês), `import` (só durante uma
  importação), `raro`, `uma vez`.
- **descobrível?** — a pessoa acha isso sem alguém contar? `não` inclui o que
  só existe atrás de atalho de teclado, dentro de painel fechado, ou numa aba
  que não tem motivo para ser aberta.

---

## 1. Entrada de dado

| # | capacidade | onde vive hoje | tipo | freq. | depende de | descobrível? |
|---|---|---|---|---|---|---|
| E1 | Importar fatura de cartão em PDF | Gastos → modal `#modal-pdf` · `js/gastos.js:148` → `js/pdf-import.js:56` | entrada | mensal | — | sim (botão na aba Gastos) |
| E2 | Extrair e parsear a fatura por banco (seção, ano, competência) | `js/pdf-import.js:266` `_sectionOf`, `:375` `_parseStreams`, `:418` `_applyYear`, `:460` `competenciaDaFatura` | entrada | import | E1 | invisível (é o motor) |
| E3 | Preview editável da fatura, com marca de campo inferido e filtro "só o que precisa de atenção" | `js/pdf-import.js` (`_recomputeAtencao`) + `js/utils.js:463-533` | entrada | import | E1 | sim, dentro do modal |
| E4 | Reconciliar parcela projetada contra a fatura real (converte previsão em fato) | `js/pdf-import.js:541` `_acharParcela` + `saveTx(tx, existente.id)` | entrada | import | E1, E9 | **não** — acontece em silêncio |
| E5 | Projetar as parcelas seguintes na importação | `js/pdf-import.js` (projeção) | entrada | import | E1 | parcial |
| E6 | Importar extrato bancário CSV / OFX / PDF | `js/app.js:~430` (`btn-novo-extrato`) → `js/extratos.js:164` | entrada | mensal | — | sim |
| E7 | Escolher banco e formato do extrato | `js/extratos.js:180-200` | entrada | import | E6 | sim |
| E8 | Preview editável do extrato, com detecção de duplicata e `duplicateOf` | `js/extratos.js` (`_showReview`, `_recomputeAtencaoExtrato`) + `js/parsers/base-parser.js` `detectDuplicates` | entrada | import | E6 | sim, dentro do modal |
| E9 | Lançar gasto manual (com meio de pagamento, parcela, categoria) | `js/gastos.js:143` / `:262` `_salvarGasto` | entrada | mensal | — | sim |
| E10 | Projetar parcelas futuras ao lançar cartão parcelado | `js/gastos.js:337` `_projetarParcelas` | entrada | mensal | E9 | **não** — acontece sozinho |
| E11 | Confirmar manualmente uma parcela projetada | `js/gastos.js:198` `_confirmarProjecao` (botão ✓ na linha âmbar) | entrada | mensal | E10 | parcial (só aparece na linha certa) |
| E12 | Editar / excluir um gasto | `js/gastos.js:154-172` | entrada | mensal | E9 | sim |
| E13 | Vincular gasto de categoria-investimento a um ativo | `js/gastos.js:224` `_toggleAtivoRow` | entrada | raro | E9, E17 | **não** — a linha só aparece se a categoria for de investimento |
| E14 | Lançar / editar / excluir receita | `js/receitas.js:59` / `:84` | entrada | mensal | — | sim |
| E15 | Copiar as receitas manuais do mês anterior | `js/receitas.js:108` | entrada | mensal | E14 | sim |
| E16 | Criar / editar meta e registrar aporte nela | `js/metas.js:141` `_salvarMeta`, `:163` `_salvarAporte` | entrada | raro | — | sim |
| E17 | Criar / editar / excluir ativo ou bem | `js/patrimonio.js:224` `_salvarAtivo` | entrada | raro | — | sim |
| E18 | Registrar aporte num ativo | `js/patrimonio.js:180` → `js/db.js:372` `addAporteToAsset` | entrada | raro | E17 | sim |
| E19 | Vincular ativo → meta (aporte no ativo credita a meta) | `js/patrimonio.js:197` `_populateMetaSelect` | entrada | uma vez | E16, E17 | **não** — campo só aparece com tipo "investimento" |
| E20 | Declarar o saldo inicial do mês | aba Fluxo, `#fx-saldo-inicial` · `js/saldos.js:275` → `js/db.js:184` `saveFluxoConfig` | entrada | mensal | — | sim (mas só quem abre a aba) |
| E21 | Herdar o fechamento do mês anterior como abertura | `js/saldos.js:311` `_fechamentoAnterior` | entrada | mensal | E20 | sim, botão dedicado |
| E22 | Onboarding de 4 passos (banco, salário, primeira meta) | `js/app.js:252-318` `OB_STEPS` | entrada | uma vez | — | forçado |

## 2. Consulta

| # | capacidade | onde vive hoje | tipo | freq. | depende de | descobrível? |
|---|---|---|---|---|---|---|
| C1 | 4 KPIs do mês (sobra/comprometido, receitas, despesas, investido) | `js/dashboard.js:128-216` | consulta | mensal | E9, E14 | sim |
| C2 | Sparkline de 6 meses dentro de cada KPI | `js/dashboard.js:443` `_sparkline`, `:427` `getSeries6m` | consulta | mensal | C1 | parcial |
| C3 | Chips de insight (variação >5%, anomalia ≥30%, projeção a partir do dia 5, orçamento ≥90%) | `js/utils.js:196` `renderInsights` | consulta | mensal | — | sim |
| C4 | Rosca de distribuição por categoria + legenda clicável | `js/dashboard.js:267` `renderChartCategorias` | consulta | mensal | E9 | sim |
| C5 | Barras de evolução de 6 meses (receita / despesa / investido) | `js/dashboard.js:476` `renderChartEvolucao` | consulta | mensal | — | sim |
| C6 | Parcelas previstas dos próximos 3 meses (máx. 10) | `js/dashboard.js:517` `renderParcelasPrevisao` | consulta | mensal | E10 | sim |
| C7 | Orçamento × real no Dashboard | `js/dashboard.js:547` `renderOrcamentoDashboard` | consulta | mensal | E23 | sim |
| C8 | Bloco "fora de qualquer limite" / sem categoria | `js/utils.js:326` `splitGastosPorLimite`, `:419` `renderForaDoLimite` | consulta | mensal | E23 | sim |
| C9 | Tabela de gastos do mês + total no rodapé | `js/gastos.js:22` `_renderTable` | consulta | mensal | E9 | sim |
| C10 | Filtros simples (categoria, meio de pagamento, busca) | `js/gastos.js:135-141` | consulta | mensal | C9 | sim |
| C11 | Filtros avançados (faixa de valor, faixa de data, só projetadas, só parceladas) | `js/gastos.js:362` `_initAdvancedFilterEvents` | consulta | raro | C9 | **não** — painel fechado atrás de "Filtros avançados ▾" |
| C12 | Tabela de receitas + total | `js/receitas.js:18` | consulta | mensal | E14 | sim |
| C13 | Editor de orçamento com barra de uso e faixas 80/100% | `js/orcamento.js:8` / `:37` | consulta+entrada | mensal | E23 | sim |
| C14 | Grid de metas com progresso | `js/metas.js:18` | consulta | raro | E16 | sim |
| C15 | 4 KPIs de patrimônio (total, investimentos, caixa, bens) | `js/patrimonio.js:19` | consulta | raro | E17 | sim |
| C16 | Gráfico "Composição" do patrimônio | `js/patrimonio.js:274` `_renderComposicao` | consulta | raro | E17 | sim |
| C17 | Gráfico "Aportes por mês" (6 meses) | `js/patrimonio.js:323` `_renderAportes` | consulta | raro | E18 | sim |
| C18 | Tabela de ativos com depreciação aplicada | `js/patrimonio.js:19` + `:129` `_valorDepreciado` | consulta | raro | E17 | sim |
| C19 | Fluxo: 3 KPIs (abertura, menor saldo do mês, projeção do fechamento) | `js/saldos.js:334` `_renderKpis` | consulta | mensal | E20 | sim |
| C20 | Fluxo: curva do saldo diário | `js/saldos.js` `_renderCorpo` (Chart.js) | consulta | mensal | E20 | sim |
| C21 | Fluxo: tabela só dos dias com movimento + contador de dias omitidos | `js/saldos.js` `_renderCorpo` | consulta | mensal | E20 | sim |
| C22 | Contexto do menor saldo ("véspera de entrada em até 3 dias") | `js/saldos.js:211` `contextoDoMinimo` | consulta | mensal | C19 | sim |
| C23 | Lista de importações recentes (lotes) | `js/extratos.js:44` `_renderImportacoesList` | consulta | mensal | E6 | sim |
| C24 | Tabela de transações de extrato + filtro por banco e por tipo | `js/extratos.js:38` | consulta | mensal | E6 | sim |
| C25 | Timeline de eventos (gasto, receita, importação) dos últimos 6 meses | `js/timeline.js:51` `_renderFeed`, `:96` `_buildEvents` | consulta | raro | — | sim, se abrir a aba |
| C26 | **Contratos em aberto** — quanto falta de cada parcelamento | `js/timeline.js:198` `_renderContratos` | consulta | mensal | E10 | **não** — escondido no fim da aba Timeline |
| C27 | 6 relatórios exportáveis em CSV e JSON | `js/relatorios.js:97` `_runExport` | consulta | raro | — | sim, se abrir a aba |
| C28 | Estatísticas de armazenamento (contagem por coleção) | `js/configuracoes.js:213` | consulta | raro | — | não |
| C29 | Badge de pendência de extrato na sidebar | `js/app.js:106` `_pendenciasExtrato` | consulta | mensal | E6 | sim |

## 3. Configuração

| # | capacidade | onde vive hoje | tipo | freq. | depende de | descobrível? |
|---|---|---|---|---|---|---|
| E23 | Definir limite de orçamento por categoria do mês | `js/orcamento.js:68` → `js/db.js:306` `saveBudgets` | config | mensal | E24 | sim |
| E24 | CRUD de categorias (nome, cor, ícone) | `js/configuracoes.js:31`, `:185` | config | raro | — | sim |
| E25 | CRUD de regras de classificação automática (regex) | `js/configuracoes.js:51`, `:206` | config | raro | E24 | sim |
| E26 | Offset de competência da fatura (`fluxo_billing_offset`) | `js/configuracoes.js:118` → `localStorage` · lido em `js/pdf-import.js:460` | config | uma vez | E1 | **não** — muda o mês de toda fatura e vive na 4ª sub-aba de Configurações |
| E27 | Dia de vencimento da fatura (1–28) | `js/configuracoes.js:126` → `js/db.js:184` | config | uma vez | E20 | **não** — decide metade da aba Fluxo e não fica na aba Fluxo |
| E28 | Exportar backup JSON completo | `js/configuracoes.js:71` → `js/db.js:535` `exportBackup` | config | raro | — | sim |
| E29 | Importar backup JSON (restore) | `js/configuracoes.js:81` → `js/db.js:633` `importBackup` | config | raro | E28 | sim |
| E30 | Apagar toda uma coleção (wipe) | `js/configuracoes.js:106` → `js/db.js:485` `wipeCollection` | config | raro | — | sim (zona de risco) |
| E31 | Excluir um lote de importação inteiro | `js/extratos.js:~300` | config | raro | E6 | sim |
| E32 | Login Google / logout | `js/auth.js:23` · `js/app.js` (`btn-logout`, `btn-cfg-logout`) | config | uma vez | — | sim |
| E33 | Trocar tema claro/escuro | `js/app.js:~340` (`btn-tema`) → `localStorage.fluxo_tema` | config | raro | — | sim |
| E34 | Navegar de mês (setas + `<input type=month>` nativo) | `js/app.js:~360-390` | config | mensal | — | sim, setas; o picker por clique no rótulo, **não** |
| E35 | Command palette (Ctrl/Cmd+K) — navegar, buscar transação, buscar meta | `js/app.js:135-250` | config | raro | — | **não** (há o botão de lupa, mas o atalho não é dito) |
| E36 | Atalhos `data-goto` entre abas, com filtro pré-aplicado | `js/app.js:63` `_goto` | config | mensal | — | parcial |

---

## 4. O que pode sumir

### 4.1 Código morto confirmado

- **`obData.bank` do onboarding** (`js/app.js:289`). O passo 2 pergunta o banco
  principal, grava em `obData.bank` — e **nada lê essa variável** (`grep obData`
  devolve só a declaração em `:272` e a escrita em `:289`). Uma tela inteira do
  onboarding que não faz nada. Some, ou passa a pré-selecionar o banco no modal
  de extrato (E7).

### 4.2 Duas capacidades fazendo a mesma coisa

| duplicação | linhas | veredito |
|---|---|---|
| **C9 (tabela de Gastos) × C24 (tabela de "Transações importadas")** | `js/gastos.js:22` vs `js/extratos.js:38` | O mesmo gasto do mês aparece em duas abas, com colunas quase iguais. `allExpensesOfMonth` (`js/db.js:221`) já junta as duas fontes — a tabela de Extratos é uma segunda visão de um dado que Gastos já mostra. **Fundir:** uma tabela só, com uma coluna/filtro "origem". |
| **C7 (Orçamento × Real no Dashboard) × C13 (aba Orçamento)** | `js/dashboard.js:547` vs `js/orcamento.js:8` | Mesmo cálculo, duas telas. A de Configurações-do-limite é entrada; a do Dashboard é consulta. Mantê-las separadas só se a edição for inline na consulta. |
| **C6 (parcelas previstas, 3 meses) × C26 (contratos em aberto) × C11 (filtro "só projetadas")** | `js/dashboard.js:517`, `js/timeline.js:198`, `js/gastos.js:362` | Três leituras do mesmo parcelamento em três telas. C26 é a melhor das três (agrupa por contrato em vez de repetir mês a mês) e é a mais escondida. |
| **C2 (sparkline no KPI) × C5 (barras de 6 meses)** | `js/dashboard.js:443` vs `:476` | Mesma série `getSeries6m` (`:427`), desenhada duas vezes na mesma dobra. |
| **C15/C16 (KPIs × gráfico de composição do patrimônio)** | `js/patrimonio.js:19` vs `:274` | Os quatro KPIs *são* a composição, em número. A rosca repete em desenho. |

### 4.3 Existe e ninguém usaria duas vezes

| # | por quê |
|---|---|
| **C25 — feed da Timeline** | Lista gasto + receita + importação em ordem de data, sem nenhuma ação: não dá para editar, filtrar por valor, nem corrigir categoria dali. É o conteúdo de Gastos e Receitas outra vez, em formato pior. O que vale naquela aba é C26, que está **abaixo** do feed. **Recomendação: matar o feed, promover C26.** |
| **C27 — os 6 relatórios** | `js/relatorios.js:97` gera CSV/JSON de seis recortes fixos. O backup (E28) já exporta tudo, e um CSV do que está na tela resolveria os seis. Seis cards para uma pessoa só é catálogo, não ferramenta. **Reduzir a um "Exportar esta tela em CSV".** |
| **C28 — estatísticas de armazenamento** | "Você tem 1.204 transações" não muda decisão nenhuma. É métrica de vaidade dentro da aba de backup. |
| **E30 — wipe de coleção** | Duas confirmações `confirm()` nativas para apagar tudo de uma coleção. Existe backup+restore (E28/E29) que cobre o caso real ("quero recomeçar"). Risco alto, uso ~zero. **Candidata a sumir**; se ficar, sai da navegação e vira algo acionado por digitar o nome da coleção. |
| **E22 — onboarding de 4 passos** | Roda uma vez, para quem tem zero transações, e um de seus quatro passos é morto (§4.1). Os outros três (salário, meta) são dois formulários que já existem. Um estado vazio bom em cada tela substitui o wizard inteiro. |
| **E35 — command palette** | Faz sentido com 11 destinos. Com 4 ou 5, o teclado compete com a barra lateral e perde. A parte que sobreviveria é a **busca de transação** — que pertence à tabela, não a um overlay. |
| **C22 — contexto do mínimo** | Não é para matar: é para dizer que ela é a melhor frase do app inteiro (`js/saldos.js:211`) e está no subtítulo de um KPI, em corpo 12px. |

### 4.4 Escondido a ponto de valer como "não existe"

Estas não devem sumir — devem sair do esconderijo. Em ordem de gravidade:

1. **E27, dia de vencimento da fatura** (`js/configuracoes.js:126`). Decide se o
   cartão do mês vira uma linha no vencimento ou dez linhas espalhadas — ou
   seja, decide se o "menor saldo" da aba Fluxo aponta o dia certo. Mora em
   Configurações → Preferências. **Pertence à aba Fluxo**, ao lado do saldo
   inicial, que é o outro número declarado pela pessoa.
2. **E26, offset de competência** (`js/configuracoes.js:118`). Decide em que mês
   cai a fatura inteira. Se estiver errado, a fatura "some" — que é exatamente o
   bug histórico registrado no `CLAUDE.md`. Pertence à tela de importação, onde
   a consequência é visível na hora.
3. **C26, contratos em aberto** (`js/timeline.js:198`). O `PESQUISA-UX.md` §3
   mostra que "quanto ainda devo neste parcelamento" é número que o Firefly III
   não tem e que a issue #10073 pede. É o diferencial do app e está no fim da
   aba menos visitada.
4. **E4, reconciliação de parcela projetada** (`js/pdf-import.js:541`). O app
   converte previsão em fato durante a importação e **não conta isso a ninguém**
   — nem no resumo do import. É a operação mais inteligente do código.
5. **C11, filtros avançados** (`js/gastos.js:362`). Painel fechado; quem não
   clica em "Filtros avançados ▾" não sabe que existe faixa de valor e de data.
