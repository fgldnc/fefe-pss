# Changelog — Review 02/07/2026

## Críticos
- **C1** receitas.js não mexe mais em orçamento (editor + listener removidos) — corrigia race que APAGAVA budgets do mês. Texto do dashboard atualizado para "aba Orçamento".
- **C2** Regras de importação agora PERSISTEM no Firestore (coleção `rules`), entram no backup (export/import) e o delete remove do banco.
- **C3** Receitas espelhadas de extrato agora gravam `importBatchId` — excluir o lote remove as receitas junto (antes ficavam órfãs inflando o KPI). *Órfãos antigos: wipe de `incomes` + reimport, ou exclua manualmente.*
- **C4** Slug do parser ('alimentacao'...) agora resolve para o ID real da categoria (novo `resolveCategoryId` em utils.js): dashboard, orçamento, relatórios, tabela e preview de extratos. Dados legados com slug também são resolvidos na leitura.

## Importantes
- **I1** Novas regras padrão: "pagamento de fatura", "pagto cartão", aplicação/resgate automático → tipo `transfer` (fora de despesas/receitas — fim da dupla contagem fatura×extrato). Parsers CSV/OFX/PDF respeitam o tipo transfer vindo de regra.
- **I2** Fatura PDF: campo explícito "Mês de competência" no preview (pré-preenchido com o palpite). Não depende mais do 1º item selecionado.
- **I3** Regex de regra do usuário: try/catch no autoClassify + validação no modal antes de salvar.
- **I4** "Marcar todos" do extrato via delegação — sobrevive à recriação do thead quando há entradas.
- **I5** esc() no command palette (descrições, metas, query) — XSS corrigido.
- **I6** Leitura de CSV/OFX com fallback ISO-8859-1 (acentos não quebram mais a classificação).
- **I7** Detecção de header do CSV não é mais sabotada pelos skipPatterns (Itaú/Bradesco com metadata antes do header funcionam).
- **I8** Nubank: detecta fatura (Título, positivo=despesa) vs NuConta (Descrição, negativo=saída) pelo header.
- **I9** Botão de excluir lote: seletor `data-batchid` corrigido (estado "Excluindo…" volta a funcionar).
- **NOVO (achado nos testes)** parseMoney: "3200,00" virava 320000 (regex exigia máx. 3 dígitos antes da vírgula). Corrigido em base-parser.js e pdf-import.js.

## Menores
- **M1** incomesOfMonth unificado (month > competenceMonth > mês da data, sem dupla contagem) — usado por dashboard, saldos, calendário e relatórios.
- **M2** ALLOWED_TX_FIELDS (código morto) removido.
- **M3** parseDate: branch MM/DD inalcançável removido; desambiguação real de formato americano.
- **M4** Cores do Chart.js em hex (canvas não resolve CSS var).
- **M5** Magenta legado rgba(145,10,103) → rgba(192,24,136) em 10 pontos (CSS + inline em saldos/calendário).
- **M6** Listeners duplicados removidos: filtros de banco (extratos) e ativo-tipo em gastos.js.
- **M7** Botão "⟳ Copiar do mês anterior" na aba Receitas (copia receitas manuais, ignora extratos).
- **M8** Select de moeda decorativo removido das Preferências.
- **M9** pdf-import usa o esc() global (duplicado _esc removido).
- **M10** Nome do app no backup: "Radar Financeiro".
- **M11** Extratos salvos no state com o ID real do Firestore.
- **M12** Transferências aparecem com tag própria (neutra, sem sinal) na tabela de extratos.
- **M13** README com a estrutura de arquivos atual (parsers/, extratos, saldos, vercel.json...).

## Rodada 2 (pós-feedback)
- **Pizza ≠ KPI corrigido**: a pizza cortava em top-8 e o total do centro somava só essas fatias (por isso R$ 2.581 vs R$ 2.673 no KPI). Agora: top 7 + fatia "Outras" cinza — o total do centro sempre bate com o KPI de Despesas.
- **Insights acionáveis**: chip "maior categoria" substituído por (1) anomalia — categoria ±30% fora da sua média dos últimos 3 meses (máx. 2 chips, ignora categorias com média < R$ 80) e (2) projeção — "no ritmo atual, o mês fecha em ~R$X" (só no mês corrente, a partir do dia 5). Insights agora incluem despesas de extrato (antes só transactions).

## Rodada 3 (chips × KPIs × orçamentos órfãos)
- **Insights com fonte única**: renderInsights agora recebe os dados do dashboard (mesmo `allExpensesOfMonth` dos KPIs, com categoryId resolvido). Fim do "+10%" no chip com "▼34%" no KPI e dos valores parciais por categoria (Compras R$ 152 quando o real era R$ 429 — o chip não enxergava a parte vinda de extrato).
- **Strip com quebra de linha**: chips não são mais cortados na margem; empilham em várias linhas (flex-wrap).
- **Orçamentos órfãos com chave-slug**: docs antigos de budget com categoryId 'assinatura'/'lazer'/'saude'/'moradia'/'vestuario' (herança do bug do botão duplo) são remapeados para o ID real na carga — as "categorias" minúsculas fantasmas somem do Orçamento×Real e o gasto aparece na linha certa. Salvar o orçamento do mês regrava os docs limpos no Firestore. Chaves irrecuperáveis não renderizam mais o slug cru.

## Rodada 4 — Aportes automáticos em investimentos
- **Novo fluxo**: gasto classificado como Investimento pode ser vinculado a um ativo do Patrimônio. O valor é somado ao "valor atual" do ativo e registrado no histórico de aportes automaticamente.
- **Importação de extrato**: quando a categoria da linha é investimento, aparece o seletor "→ qual ativo?" abaixo da categoria (some/aparece ao trocar a categoria). Ao confirmar a importação, os aportes vinculados são aplicados nos ativos.
- **Lançamento manual**: o modal de gasto ganha o campo "Aportar em qual investimento?" quando a categoria escolhida é investimento. O aporte só é aplicado em lançamento NOVO (editar um gasto não soma de novo).
- **Patrimônio**: ativos de investimento ganham botão "+ Aporte" (aporte manual direto) e histórico expansível por ativo (data, valor, observação e origem: extrato/gasto/manual), no mesmo padrão das Metas. Os KPIs e o total do patrimônio refletem o novo valor na hora.
- **Regras**: aportes acumulam no currentValue (testado: 1500 + 500 + 250,50 = 2250,50). Vincular é opcional — "sem vínculo com ativo" mantém o comportamento antigo. Excluir a transação depois NÃO desfaz o aporte no ativo (ajuste manual se precisar).

## Rodada 5 — Ativo vinculado a Meta (cascata completa)
- **Novo campo "Meta vinculada"** no modal do ativo (só para investimentos): vincule "Tesouro IPCA 2050" → meta Aposentadoria, "CDB Reserva" → Reserva de emergência, etc.
- **Cascata automática**: extrato/gasto → aporte no ativo → aporte na meta vinculada. O progresso da meta soma o valor e o histórico dela registra "via {nome do ativo}" para rastreio.
- Ativo sem vínculo continua como antes (só o ativo muda). Meta excluída/vínculo quebrado não trava o aporte — é ignorado silenciosamente.
- **Fix de preservação**: editar um ativo pelo modal não apaga mais o histórico de aportes do state (contributions preservadas no save).
- Tabela do Patrimônio mostra 🎯 com o nome da meta vinculada abaixo do nome do ativo.

## Dashboard / visual
- Delta ▲/▼ % vs mês anterior nos KPIs de Receitas e Despesas (verde/vermelho conforme direção boa/ruim).
- Barra "Investido" (dourada) no gráfico de evolução — o dado já era calculado e nunca usado.
- Empty-states padronizados (ícone+título+texto) em Parcelas e Orçamento×Real.
- Month picker: clicar no nome do mês no topo abre o seletor nativo (pular vários meses de uma vez).

## Rodada 6 — Correções da auditoria de 02/08/2026 (`RELATORIO-AUDITORIA.md`)

### Bug
- Segmentação por coluna antes de montar as linhas do PDF (`js/parsers/pdf-layout.js` + `js/pdf-import.js`) → lançamento da coluna esquerda não é mais fundido com valor da tabela de próximas faturas; o `pdf-import.js` antigo virou `js/pdf-import.legacy.js`.
- Máquina de estados de seção na fatura → só "Lançamentos" vira transação; "Compras parceladas – próximas faturas" passou a ser usada só para conferir as projeções, nunca para criar lançamento.
- Tolerância de centavos proporcional ao número de parcelas (`_tolerancia`, piso R$ 0,02 / teto R$ 1,00) → parcela de compra parcelada deixa de entrar duplicada por diferença de arredondamento.
- Fingerprint SHA-256 do conjunto de lançamentos gravado em `importedInvoices` → reimportar a mesma fatura (mesmo renomeada) passa a pedir confirmação explícita.
- `parseMoney` unificado em `base-parser.js` e consumido pelo import de fatura → `1.234` volta a ser mil duzentos e trinta e quatro, e o sinal negativo (hífen ou parênteses contábeis) para de ser descartado.
- `dedupKey` passou a incluir o `type` e a arredondar o valor em bucket de 5 centavos → estorno não é mais escondido como duplicata da compra, e 1 centavo de divergência não cria linha repetida.
- Regex do parser genérico ancorado por linha em `pdf-import.js` e em `pdf-statement-parser.js` (`GENERIC_LINE_RE`) → linha de limite de crédito e de resumo da fatura não viram mais lançamento.
- `_eventsBound` único + delegação no `tbody` em `js/pdf-import.js` e `js/extratos.js` → abrir o modal N vezes não dispara mais N processamentos do mesmo arquivo.
- Critério único de competência (`competenceOf`/`isOfMonth` em `js/utils.js`), adotado por `db.js`, `saldos.js`, `calendario.js`, `relatorios.js` e `receitas.js` → dashboard, gastos e relatórios param de divergir entre gasto de cartão e gasto de extrato.
- `saveBudgets` reescrito com `writeBatch` → salvar o orçamento do mês virou uma operação atômica, sem deixar o mês pela metade se falhar no meio.

### Segurança
- `'unsafe-inline'` removido do `script-src` da CSP; bloco inline do Firebase extraído para `js/firebase-init.js` e `onclick` inline do empty-state de extratos trocado por listener → a CSP volta a barrar script injetado. (`style-src` mantém `'unsafe-inline'` de propósito — o app usa `style="..."` em dezenas de pontos.)
- `firestore.rules` versionado na raiz (acesso restrito a `request.auth.uid`, exigência de `email_verified`, validação de campo por coleção, negação global no fim) → as regras deixam de existir só dentro do console.
- `databaseURL` removido da config do Firebase → o Realtime Database, que o app nunca usou, não fica mais pendurado em regras que ninguém revisa.
- `.gitignore` trocou o `*.json` genérico por `financas-backup-*.json` / `*-backup-*.json` → backup pessoal continua fora do repositório sem esconder JSON de configuração.

### Performance
- Troca de mês passou a só re-renderizar (`rerenderCurrentTab`), em vez de rodar `loadAllData()` → deixa de reler as 7 coleções inteiras do Firestore a cada clique de mês anterior/próximo. Redução de leituras por construção; **latência não foi medida**.
- `saveBudgets` deixou de fazer 1 leitura + N deletes + N writes em série, passando a um único `writeBatch` → menos round-trips por salvamento; **tempo não medido**.
- Headers `Cache-Control: no-cache, must-revalidate` para `/index.html`, `/js/*` e `/css/*` no `vercel.json` → some o risco de módulo antigo em cache contra `index.html` novo; o custo é uma revalidação (304), **não é ganho de velocidade**.

### Acessibilidade
- `aria-label` nos botões que só têm símbolo (✎/✕) em gastos, receitas, metas, patrimônio, configurações e extratos → o leitor de tela anuncia a ação e o item, não só o caractere.
- `aria-label` em cada célula editável do preview de fatura e de extrato → checkbox, descrição, categoria e valor deixam de ser campos sem rótulo.
- `role="dialog"`, `aria-modal="true"` e `aria-labelledby` nos 9 modais + `Escape` global fechando o modal aberto (com prioridade para o command palette) → o modal é anunciado como diálogo e dá para sair pelo teclado.
- `scope="col"` nos 37 `<th>` do `index.html` → navegação por leitor de tela associa a célula ao cabeçalho certo.

### Verificação — o que foi de fato testado
- Suíte `node --test "test/*.test.mjs"` (32 casos, sem dependência): `parseMoney`, `parseDate`, `dedupKey`/`detectDuplicates`, `autoClassify`, `GENERIC_LINE_RE`, `detectColumnBands` (itens sintéticos) e `_tolerancia`.
- `detectColumnBands` foi calibrado contra o dump real de `getTextContent()` da pág. 2 de uma fatura (`ferramentas/dump-fatura.html` + `scripts/tmp-calibrar.mjs`); os três defeitos medidos estão documentados no cabeçalho de `js/parsers/pdf-layout.js`.
- A unificação de competência foi conferida antes com `scripts/tmp-diagnostico-competencia.mjs` sobre um backup real, em modo somente leitura.
- **Não verificado nesta rodada:** importação de uma fatura de ponta a ponta no app publicado; publicação efetiva do `firestore.rules` no projeto Firebase; qualquer medição de tempo ou de cota de leitura.

## Nota de migração
1. Regras antigas criadas na memória não existem — recrie na aba Regras (agora salvam de verdade).
2. Receitas órfãs de lotes excluídos antes do fix: Configurações → Zona de risco → wipe de `incomes` + reimport, ou exclusão manual na aba Receitas.
3. Pagamentos de fatura já importados como despesa: exclua o lote do extrato e reimporte — agora entram como Transferência.
