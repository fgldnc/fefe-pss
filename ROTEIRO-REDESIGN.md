# Roteiro do redesign — Radar Financeiro

Documento de estado entre sessões. Quem abrir uma sessão nova sobre design do
Radar lê este arquivo primeiro e continua daqui, sem precisar refazer o
diagnóstico.

**Última atualização:** 02/08/2026 · rodadas 0, 1 e 2 concluídas, **rodada 3
parte 1 (faixa de KPIs do Dashboard) concluída e conferida**. Divergências
entre documento e código reconferidas nesta data (ver o fim do arquivo).
Próximo passo: **rodada 3, parte 2** (pizza "Sem categoria", Orçamento × Real) —
mockup aprovado (`MOCKUP-rodada-3-parte2.html`) e prompt escrito
(`PROMPT-rodada-3-parte2.md`).

---

## Como este trabalho funciona

O design é pensado numa sessão de projeto e **implementado pelo Claude Code**,
que é quem altera `index.html`, `css/*.css` e `js/*.js`.

Ordem de cada rodada:

1. **Diagnóstico** — o que muda e por quê, ancorado no que o código faz hoje.
2. **Mockup** — HTML ou SVG na identidade Radar, antes de qualquer prompt.
3. **Aprovação** — a Fefe aprova, ajusta ou recusa. Ajuste → volta ao mockup.
4. **Prompt** — só depois de aprovado. O prompt carrega sozinho o essencial:
   não presuma que o Claude Code conhece o projeto.

**Exceção:** rodada sem efeito visual (a rodada 1 é uma) pula mockup e aprovação
e vai direto ao prompt.

**Bug antes de design, sempre.** Pedido que misture os dois: resolve a correção
primeiro, design vira rodada separada. Design sobre dado errado espalha o erro.

---

## Decisões já tomadas — não reabrir sem motivo novo

**Revisão de importação fica no modal, resolvida antes de salvar.** Nada entra
pendente. Fila de pendências exigiria estado novo no Firestore, superfície em
Extratos e no Dashboard, e dependeria de lembrar de voltar. A importação
acontece uma vez por mês, no computador, com o arquivo aberto — é o momento de
maior contexto sobre aqueles lançamentos.

**Sem abas novas.** Proposta que peça tela nova precisa justificar por que não
cabe em nenhuma das existentes.

**`js/saldos.js` é o módulo ativo da aba "Fluxo de Caixa"** (`app.js:29`:
`calendario: () => import('./saldos.js')`). `js/calendario.js` é código morto —
limpeza, não design; remover junto com alguma rodada que já toque nessa aba.

**Mobile não é rodada.** É critério de aceite de cada rodada: toda proposta
declara o comportamento até 360px. O uso real é desktop no início do mês; o
celular é consulta.

**"Repensar a aba Extratos" não é rodada.** Dissolve-se dentro das rodadas 1 e 2.

---

## Contexto de uso (não está no código)

- Uso concentrado no **computador, no início do mês**, para importar fatura e
  extrato. Celular é consulta, não entrada — não existe import decente no
  celular hoje.
- **O momento de maior erro é a revisão da importação**: aceitar lançamento com
  categoria ou competência errada porque a tela não mostra que aquilo foi chute
  do parser. É o que a rodada 1 e a 2 atacam.

---

## Diagnóstico por aba (rodada 0)

| Aba | Pergunta que responde | Estado |
|---|---|---|
| Dashboard | Como está o mês? | **Mal.** Quatro KPIs de mesmo peso, três em zero no início do mês. "Saldo Livre" negativo é aritmética de receita ainda não cadastrada. Pizza de duas fatias em card de largura inteira. Hierarquia plana. |
| Fluxo de Caixa | Como fica o caixa dia a dia? | **Mal.** 31 linhas × 6 colunas; a coluna Diário repete o mesmo valor em todas as linhas; o Saldo muda em três dias. Rolagem para extrair três fatos. |
| Patrimônio | Quanto eu tenho? | **Bem.** KPIs no topo, tabela na base. Não mexer. |
| Extratos | O que foi importado? | **Metade.** Histórico de lotes claro. A tabela mostra "Outros" sem distinguir classificado de não classificado. |
| Gastos | Para onde foi o dinheiro? | **Bem.** Badge `projetada` já diferencia parcela de lançamento efetivo. |
| Receitas | Quanto entrou? | Não avaliado — sem print com dado. |
| Orçamento | Onde estourei? | **Bem para editar, mal para consultar.** Quinze linhas de mesmo peso; a única com consumo real não se destaca. |
| Metas | Quanto falta? | **Bem.** Não mexer. |
| Timeline | O que aconteceu? | Responde, mas repete o mesmo evento em quatro meses sem indicar que são parcelas do mesmo contrato. |
| Configurações | Cadastro | **Bem.** |
| Relatórios | Como comparar períodos? | Grade de cards de exportação CSV/JSON, sem visualização. Fora do backlog. |

### Os três problemas mais caros, em ordem

1. **A revisão da importação não distingue o que o parser leu do que ele
   chutou.** Contamina Dashboard, Gastos, Orçamento e Fluxo de Caixa de uma vez,
   e o conserto depois custa mais que o acerto na entrada.
2. **O Dashboard mostra a conta errada no momento em que o app é aberto.** No
   dia 1 a receita ainda não existe e o app anuncia saldo livre negativo. O que
   importa nesse instante é quanto já está comprometido.
3. **O Fluxo de Caixa gasta uma tela inteira para dizer três coisas.** Não
   estava no backlog original; fura a fila por ser a aba com pior densidade
   informacional e a que mais se degrada no celular.

### O que não mexer

- **Metas** — dois cards, barra, percentual e prazo; responde em cinco segundos.
- **A barra de filtros de Gastos** — parece candidata a enxugar, mas Gastos é a
  aba de conferência linha a linha; ali controle visível é função, não ruído.
- **Tabela de Patrimônio e estrutura de Configurações** — pirâmide correta, não
  competem por atenção com nada.

---

## Achados de código que sustentam o plano

Verificados no repositório em 02/08/2026:

- **`autoClassify()` não registra procedência.** `base-parser.js:31` retorna só
  `{ type, category }`. A última linha é um fallback silencioso que devolve
  `category: 'outros'` — indistinguível de classificação por regra. É por isso
  que a tabela de Extratos é uma coluna de "Outros".
- **Dois classificadores diferentes.** `pdf-import.js` **não** usa
  `autoClassify()`; tem `catSuggest()` própria, com `includes()` de substring,
  sem regex. O fluxo mais crítico (fatura, início do mês) usa a heurística mais
  fraca.
- **Competência da fatura é inferida e não avisa.** Sai da data do *primeiro*
  lançamento mais o offset de `localStorage.fluxo_billing_offset`, e aparece
  pré-preenchida com aparência de valor confirmado.
- **Ano da data também é inferido.** `_applyYear()` usa o cabeçalho da fatura
  quando existe e o relógio da máquina quando não existe.
- **A revisão de extrato é mais forte que a de fatura**, não mais fraca.
  `extratos.js` já tem `tag-duplicata`, `row-dup`, desmarca duplicata
  automaticamente e edita inline. O modal de fatura tem só checkbox, descrição,
  categoria e valor.
- **`.tag-projetada` e `.tag-duplicata` já existem** em `components.css:105-106`.
  O componente da rodada 2 estende o que existe, não nasce do zero.
- **Categorias "Investimento" e "Investimentos" coexistem**, e `extratos.js:441`
  decide o vínculo com patrimônio por `includes('investiment')` no *nome* da
  categoria. Renomear categoria quebra o comportamento em silêncio.
  **Pré-requisito de dado, não design** — não resolver dentro de uma rodada de
  redesign.
- **`test/base-parser.test.mjs` usa `assert.deepEqual`** contra o retorno inteiro
  de `autoClassify` — qualquer campo novo quebra os testes. Já tratado no prompt
  da rodada 1.

---

## As rodadas

### Rodada 1 — Procedência da classificação · SÓ DADO, SEM PIXEL
**Estado: CONCLUÍDA e conferida em 02/08/2026.**
Prompt em `PROMPT-rodada-1.md`.

Cada lançamento importado passa a carregar como o app chegou na categoria, no
tipo e na competência: `classificationOrigin`, `competenceSource`,
`dateYearSource`. `autoClassify()` passa a devolver `origin`
(`user-rule` / `default-rule` / `fallback`) e, no fallback, `category: null` em
vez de `'outros'`. `pdf-import.js` abandona `catSuggest()` e passa a usar
`autoClassify()` + `resolveCategoryId()`.

Sem mockup — não há efeito visual, exceto a consequência pretendida: lançamento
sem regra chega ao preview com categoria em branco em vez de "Outros".

**Conferência da entrega:**

- `autoClassify()` devolve `origin` nos três valores; fallback devolve
  `category: null`. Os três parsers de extrato propagam `classificationOrigin`.
- `pdf-import.js` abandonou `catSuggest()` e usa `autoClassify()` +
  `resolveCategoryId()`; grava `classificationOrigin`, `competenceSource` e
  `dateYearSource`, e as parcelas projetadas herdam os três via spread de `tx`.
- Edição manual de categoria marca `'manual'` nos dois fluxos
  (`pdf-import.js:120`, `extratos.js:509`).
- 34 testes passam. `git diff` em `css/` e `index.html` está vazio: nenhuma
  mudança visual, como pedido.
- **Atenção ao rodar os testes:** `node --test test/` falha com
  `MODULE_NOT_FOUND` — o Node tenta resolver `test` como módulo. Use
  `node --test test/*.mjs`. É invocação, não teste quebrado.

**Correção aplicada depois da entrega (não estava no prompt):**
`dashboard.js` fazia `const key = cat?.name || 'Outros'` ao montar a pizza. Com
o fallback devolvendo `null`, todo lançamento sem categoria passaria a ser
lavado dentro da fatia "Outros" — o mesmo problema que a rodada existe para
desfazer, reaparecendo uma camada adiante. Agora "Sem categoria" é bucket
próprio, retirado da disputa antes do corte do top 7 (senão o resíduo "Outras"
o reabsorveria), sempre em último e em `#6b6b6b`, nunca em cor de série.
**O tratamento visual dessa fatia é provisório** — a rodada 2 decide se ela
merece cor semântica de atenção.

**Verificado e sem ação:** `gastos.js` já renderiza "—" para categoria ausente,
sem lavagem. `orcamento.js` agrupa por `categoryId` e simplesmente não casa com
nenhum limite — lançamento sem categoria some do Orçamento × Real. Comportamento
pré-existente, mas que a rodada 1 tornou mais frequente. **Decidir na rodada 3.**

Bloqueava as rodadas 2 e 3 — desbloqueadas.

### Rodada 2 — Sinalização visual da revisão de importação
**Estado: CONCLUÍDA e conferida em 02/08/2026.** Prompt em `PROMPT-rodada-2.md`.

Decisões de design fechadas na aprovação do mockup:

- **A marca vai no campo que precisa ser corrigido**, não numa coluna de status
  separada — sinal e correção no mesmo lugar.
- **Silêncio é o sinal de que está tudo bem.** Campo classificado por regra não
  recebe marca. `user-rule` e `default-rule` são marcados igual (ou seja, não
  marcados): o usuário não age diferente nos dois casos.
- **Um símbolo para "o app deduziu": o losango `◇`**, usado na competência, no
  ano da data e na categoria vazia.
- **Âmbar (`--warning`) só onde exige ação; azul onde o usuário já agiu.** Nada
  de verde ou vermelho nesta tela: já significam entrada e saída na coluna de
  valor da mesma tabela.
- **Nunca bloquear o salvamento.** O botão primário vira
  `Salvar assim mesmo · N sem categoria` em âmbar, e volta ao azul padrão sem
  pendência.
- **Duplicata provável passa a existir na fatura**, reusando `_parcelaJaExiste()`
  (parcelados) e `detectDuplicates()` (à vista), movidos do save para o preview.
  **Na fatura a linha duplicada permanece marcada** — diverge do extrato de
  propósito: o fingerprint já bloqueia reimportar o arquivo, então repetição
  dentro de uma fatura nova é mais provavelmente compra real, e desmarcar
  perderia um gasto em silêncio.

Fica pendente para a rodada 3: o tratamento definitivo da fatia "Sem categoria"
na pizza do Dashboard, hoje provisória.

Consome os campos da rodada 1 e unifica o vocabulário visual de estado de
linha: inferido, chute, duplicata provável, projetada. Estende
`.tag-projetada` / `.tag-duplicata`. Fecha a assimetria entre o modal de fatura
e o de extrato. Aviso de duplicata provável por linha no fluxo de fatura, que
hoje só tem bloqueio da fatura inteira via fingerprint.

Mockup obrigatório. Componente definido aqui é consumido pelas rodadas 3 e 6.

**Conferência da entrega:**

- Vocabulário em `css/components.css`, logo abaixo de `.batch-stat-out`:
  `.mark-inferido` (losango via `::before`), `.field-inferido`, `.field-editado`,
  `.row-atencao`, `.row-hidden-filter`, `.row-marks`, `.import-summary-bar`,
  `.btn-atencao`. Só tokens do `:root`.
- Helpers compartilhados pelos dois modais ficaram em `js/utils.js`, no fim do
  arquivo: `renderImportSummary`, `updateImportSummary`, `toggleImportFilter`,
  `updateImportConfirmButton`. Foi para lá porque `utils.js` não importa nenhum
  módulo do projeto — é o único lugar comum aos dois fluxos sem criar ciclo.
- A barra de resumo mantém os contadores sempre no DOM, escondidos em zero, e
  só troca o texto. Recriar o `innerHTML` a cada recálculo apagaria o estado
  ligado/desligado do botão de filtro.
- `pdf-import.js`: `_classificarEDetectarDuplicatas()` roda antes de montar o
  HTML (a marca precisa da procedência no momento em que a linha é escrita) e
  `_recomputeAtencao()` relê o DOM a cada mudança de checkbox ou categoria.
  `extratos.js` tem o par simétrico `_recomputeAtencaoExtrato()`.
- 35 testes passam (`node --test test/*.mjs`).

**Desvios do prompt, decididos durante a execução:**

1. **A coluna "Status" do preview de extrato foi removida** e a `.tag-duplicata`
   passou para junto da descrição. Manter a coluna contrariava o princípio da
   própria rodada — marca longe do campo — e ela ficaria vazia em toda linha sem
   duplicata. `index.html` e a variante de `thead` montada em `_showReview()`
   quando há receitas foram ajustados juntos: são **duas** definições do mesmo
   cabeçalho, quem mexer numa precisa mexer na outra.
2. **Largura do modal.** `modal-lg` (740px) truncava a descrição. Os dois modais
   de importação passaram a usar `.modal-import`
   (`max-width: min(1400px, 98vw)`), com padding de célula da tabela de preview
   reduzido para `0.45rem` e `select` elástico (`width:100%`), sobrepondo o
   `max-width:140px` do `.select-inline`. Sem isso a tabela exigia scroll
   lateral mesmo com o modal largo.
3. **`dedupKey` foi alterado — furando a restrição "só design".** Pedido
   explícito da Fefe depois de ver falso positivo de duplicata na tela. O valor
   entrava num *bucket de 5 centavos*, o que juntava lançamentos legitimamente
   distintos do mesmo estabelecimento no mesmo dia (ex.: 594,04 e 594,06). Agora
   entra em **centavos exatos**. Verificado antes de mexer: mesma data + mesma
   descrição + valores diferentes **nunca** colidiram — a hipótese de "a regra só
   olha o nome" não se sustentou.
4. **`detectDuplicates` passou a devolver `duplicateOf`**, o registro que bateu,
   e a tag deixou de ser um "Possível duplicata" genérico: diz o valor e a data
   do lançamento que já existe, com a frase completa no `title`. Aviso sem
   evidência é ruído — o usuário não consegue distinguir "já importei este
   arquivo" de "a regra errou". Na fatura a tag de parcelado tem texto próprio
   (`Parcela x/y já registrada`), porque a regra é outra: compara nº de parcela e
   ignora a data, já que a parcela projetada tem data futura.

**Pendente que a rodada 2 não resolveu:** se uma linha continuar sendo acusada
de duplicata sem que o lançamento esteja na base, o `title` da tag agora mostra
contra qual registro ela bateu — é o dado que falta para fechar o diagnóstico.

### Rodada 3 — Recorte do Dashboard e micro-contexto nos KPIs
**Estado: parte 1 CONCLUÍDA e conferida em 02/08/2026.** Mockup
`MOCKUP-rodada-3-kpis.html`, prompt em `PROMPT-rodada-3.md`. Arquivos tocados:
`js/dashboard.js`, `css/style.css`, `js/utils.js` (skeleton), `index.html`
(skeleton estático). **Parte 2 (pizza, Orçamento × Real) segue pendente.**

**Como o comprometido é calculado (o ponto que o prompt mandava verificar):**
`allExpensesOfMonth()` filtra `state.transactions` só por competência
(`db.js:151`, `isOfMonth`) — **não** exclui `isProjected`. Logo a parcela
projetada do mês corrente **já está dentro** de `totalExpense`. Portanto
`comprometido === totalExpense`, e a faixa `seg-real` é
`totalExpense − projetadas`, um recorte de dentro, nunca uma soma por cima.
Somar daria dupla contagem. Registrado em comentário no código.
`transfer` já ficava de fora: `db.js:154` só aceita `type === 'expense'` do
extrato, e transação normal não tem tipo de transferência — nenhuma mudança
foi necessária.

**Conferência feita (harness temporário com `state` sintético, descartado):**
com receita 6.500 e mês de 3.000 efetivos + 800 projetados,
`já gasto + parcelas previstas = comprometido` e
`já gasto + previstas + livre = receita` fecharam exatamente; investido (500)
ficou fora do comprometido; rodapé "58% da receita … · 29 dias restantes".
Mês futuro sem receita: **nenhum valor negativo na tela**, `.mark-inferido`
presente, rodapé de percentual omitido, ponta do sparkline cheia (não é o mês
corrente) contra vazada no mês corrente. Zero emoji e zero classe `gold` na
faixa. **Regressão de Patrimônio testada em iframes lado a lado (CSS antigo ×
novo, após `fonts.ready`): 25 elementos, 21 propriedades + caixa, zero
diferença.** 35 testes de `node --test test/*.mjs` seguem passando.

**Desvios do prompt, decididos durante a execução:**

- **≤480px: `.kpi-trend` passa a `flex-wrap: wrap`**, com o sparkline caindo
  para a segunda linha alinhado à direita. O prompt pedia "sparkline ao lado do
  delta" e "sem texto truncado"; em card de ~143px o delta mais longo
  (`= mês anterior`, 92px) + sparkline (52px) + gap davam 154px e estouravam o
  card. Entre truncar texto e quebrar a linha, quebrou-se a linha — nada some,
  que era a restrição declarada ("nada some além da legenda").
- **Sparkline termina em `x = w − 4`, não `w − 2`.** O círculo da ponta tem
  raio 2.4 e encostava na borda do `viewBox`. Mantém os pontos do mockup
  (2 … 62 em 66px de largura).
- **`--gold` do card Investido:** o valor foi para `--text-primary` como o
  prompt pedia (remoção da classe só no HTML gerado; `.kpi-value.gold`
  intacto no CSS).

**Decisões de design fechadas na aprovação do mockup (parte 1):**

- **"Saldo livre" deixa de ser card** e vira a terceira faixa da barra do card
  principal ("Comprometido do mês"). Mesmo número, num lugar onde ele se
  explica — e o negativo do dia 1 desaparece sem inventar dado.
- **Hierarquia por tamanho e fundo, não por cor.** Hero em `--bg-card-raised`,
  ~1,55× de largura; os três apoios ficam iguais entre si.
- **Emoji fora dos KPIs do Dashboard** (💰💳📊📈). Não carregam informação.
  `.kpi-icon` permanece no CSS porque a aba Patrimônio usa (💎).
- **Delta encurtado** para `▲ 12%`, com "vs mês anterior" no `title`. Repetido
  em quatro cards vira ruído. Cor do delta mantém `goodWhenUp`.
- **Sparkline é SVG inline gerado em string, não Chart.js** — 6 pontos em
  66×26px não justificam três instâncias de gráfico com destroy/recreate a cada
  troca de mês. Sendo SVG no DOM, resolve `var(--…)` normalmente: a regra do hex
  literal continua valendo só para canvas.
- **Ponta do sparkline vazada quando o mês exibido é o corrente.** Ponto cheio
  num mês incompleto lê como queda.
- **Âmbar do dia 1 é o `.mark-inferido` da rodada 2**, reusado sem símbolo novo,
  com o botão de ação logo abaixo — a marca só aparece onde há o que corrigir.

**Parte 2 — mockup `MOCKUP-rodada-3-parte2.html` aprovado em 02/08/2026, prompt
em `PROMPT-rodada-3-parte2.md`. Decisões fechadas:**

- **A fatia "Sem categoria" continua neutra (`#6b6b6b`); quem fica âmbar é a
  linha da legenda.** Resolve a pendência herdada da rodada 1. A pizza não é
  editável — âmbar no desenho seria alarme sem porta de saída. Na legenda cabe,
  porque a linha é clicável e leva ao lugar onde se corrige. Ganha contagem de
  lançamentos e some inteira quando é zero.
- **"Outras" continua em `--text-muted`, sem contagem e sem clique** — resíduo
  aceito não é pendência. A distinção entre as duas passa a ser a cor da linha e
  o clique, não a cor da fatia.
- **Bloco "Fora de qualquer limite" + linha de reconciliação** no card
  Orçamento × Real e na aba Orçamento. Sem barra de progresso, de propósito:
  barra exige denominador e ali não há meta.
- **Barra da categoria fica azul abaixo de 80%**, não verde: estar dentro do
  limite é o esperado, não conquista, e verde competiria com o verde de receita.
- **Evolução mensal desce para meia largura**, ao lado de Parcelas. O sparkline
  dos KPIs (parte 1) já entrega a tendência; manter o gráfico grande no topo
  virou repetir a mesma informação em 260px de altura.

**Achado da parte 2, mais grave do que o roteiro registrava:** o card
Orçamento × Real não esconde só o gasto **sem categoria** — esconde também todo
gasto em **categoria sem limite definido**, porque `dashboard.js:315` itera sobre
`Object.entries(budgetMonth)`. A soma visível do card é menor que o KPI de
Despesas logo acima e nada avisa. Mesmo padrão em `orcamento.js:30` e `:33`.
A identidade `categorias + fora = total de despesas` virou critério de pronto.

**Armadilha registrada no prompt da parte 2 — universos diferentes:** a pizza do
Dashboard mede `allExpensesOfMonth()` (transações **+** extrato, `db.js:150`); a
aba Gastos mede `txOfMonth()` (**só** transações, `db.js:140`). Um clique que
anuncie "7 sem categoria" e leve a uma tela com 5 linhas parece bug. Por isso a
linha quebra por origem (`N em Gastos · M em Extratos`) quando as duas existem.
**Corrigido em relação ao que foi dito na aprovação do mockup**, onde o clique
tinha sido descrito como indo simplesmente para Gastos.

**Descoberto ao escrever o prompt da parte 1, não estava no diagnóstico:**

- **`--gold` e `--warning` são o mesmo hex** (`#fbbf24`, `style.css:40` e `:44`).
  `.kpi-value.gold` pinta "Investido" decorativamente; com o âmbar do
  `.mark-inferido` entrando na mesma faixa, a cor passaria a ter dois
  significados lado a lado. **Decidido:** o valor de "Investido" vai para
  `--text-primary` e quem carrega cor no card é o delta. `.kpi-value.gold`
  permanece no CSS, só sai do Dashboard.
- **`.kpi-grid` / `.kpi-card` são compartilhados com a aba Patrimônio**
  (`index.html:235`), que o roteiro marca como "não mexer". Todo seletor novo é
  escopado em `#kpi-grid` ou usa classe nova. É a regressão mais provável da
  rodada, e virou item do critério de pronto.
- **`showKpiSkeleton()`** (`utils.js:126`) monta 4 skeletons iguais; com o hero
  mais largo o layout pula na carga. Ajustar junto — e o skeleton estático de
  `index.html:174-178` também.

Herda três pendências que precisam ser resolvidas dentro dela:

1. **A fatia "Sem categoria" da pizza** (`dashboard.js`, correção aplicada na
   rodada 1) está em `#6b6b6b` como tratamento provisório. A rodada 2 fechou que
   âmbar significa "exige ação" — decidir se a fatia herda isso ou continua
   neutra. Cuidado: no Dashboard o âmbar ainda não tem esse significado, e a
   pizza não é editável, então a marca ali não leva a lugar nenhum.
2. **Lançamento sem categoria some do Orçamento × Real** (`orcamento.js` agrupa
   por `categoryId` e simplesmente não casa). Comportamento pré-existente que a
   rodada 1 tornou mais frequente.
3. **Vocabulário da rodada 2 no Dashboard.** `.mark-inferido`, `.row-atencao` e
   `.btn-atencao` existem e são de uso geral. Se o Dashboard precisar sinalizar
   dado deduzido, reusa — não inventa outro símbolo.

Seta de tendência e sparkline vs. mês anterior; revisão do que merece ser KPI
no dia 1 do mês. Depois de 1 e 2 porque tendência sobre número contaminado é
pior que número sem tendência.

**Pré-requisito de cálculo — reavaliado em 02/08/2026, escopo menor do que o
roteiro supunha.** `dashboard.js:56-59` **já** calcula o mês anterior
(`offsetMonth(month,-1)`) e `_delta()` (linhas 62-70) já renderiza ▲/▼ com o
percentual. Mas:

- Só **Receitas** e **Despesas** recebem delta. **Saldo livre** e **Investido**
  mostram texto fixo (`kpi-taxa`, `kpi-investido-total`), sem comparação.
- `_delta()` devolve string vazia quando `prev <= 0`, e o card cai num texto
  genérico. No primeiro mês de uso todos os quatro cards ficam sem contexto.
- **Não existe sparkline em lugar nenhum** do projeto (`grep sparkline` em `js/`
  e `css/` não retorna nada) — componente nasce do zero.
- A série de 6 meses para o sparkline **já é montada** em
  `renderChartEvolucao()` (`dashboard.js:228-234`), por mês, para receita,
  despesa e investido. Reaproveitar essa montagem em vez de recalcular: é a
  mesma conta, e duas contas separadas divergem com o tempo.

Ou seja: estender a série aos 4 KPIs e desenhar o sparkline é design em cima de
cálculo existente. Só vira mudança de cálculo se algum KPI novo for proposto.

Fecha também o formato de KPI que a rodada 5 vai reusar e o layout que a
rodada 6 vai tornar clicável.

### Rodada 4 — Fluxo de Caixa
**Estado: não iniciada. Independente de dado; depois das anteriores na fila.**

Layout puro: eliminar colunas constantes, marcar o pior saldo do mês, tornar a
resposta ("chego no fim do mês?") legível sem varrer 31 linhas. Sem campo novo.
Momento de remover `js/calendario.js`.

### Rodada 5 — Comprometimento futuro e aging de parcelas
**Estado: não iniciada. Depende do formato de KPI da rodada 3.**

Quanto da renda dos próximos meses já está comprometida; barra empilhada por
faixa (este mês, 1–3, 4–6, 7+). Campos já existem:
`installmentCurrent`, `installmentTotal`, `competenceMonth`.

### Rodada 6 — Drill-down por clique
**Estado: não iniciada. Depende do layout fechado na rodada 3.**

Clicar numa categoria da pizza filtra Gastos, em vez de trocar de aba e
refiltrar.

### Rodada 7 — Estado vazio e primeiro uso
**Estado: não iniciada. Por último de propósito.**

Só faz sentido desenhar o vazio depois que o cheio estiver certo.

---

## Restrições inegociáveis (checklist de toda proposta)

- **Idioma:** pt-BR.
- **Sem build.** ES modules nativos, sem framework, sem bundler, sem npm.
  Biblioteca nova só se não der para resolver com Chart.js — e, se entrar,
  precisa entrar na CSP de `vercel.json`.
- **Chart.js é canvas** e não resolve CSS variable: cor de gráfico vai em HEX
  literal no JS.
- **`esc()` em todo HTML** gerado a partir de dado importado.
- **Identidade Radar:** Outfit para texto, JetBrains Mono para número, e só as
  cores do `:root` de `css/style.css`. Azul é navegação; verde e vermelho
  carregam juízo de valor. Série categórica usa a escala de azuis mais o
  magenta, nunca verde/vermelho. Resíduo e "Outras" em `--text-muted`.
- **Raio:** `--radius-md` (10px) card, `--radius-sm` (6px) controle,
  `--radius-xl` (20px) modal. Sem valores intermediários.
- **Só design.** Não reescrever parser, regra de classificação ou projeção de
  parcela dentro de uma rodada de design. Dependência disso vira pré-requisito
  declarado. **Exceção com precedente (rodada 2):** correção de regra pedida
  explicitamente pela Fefe depois de ver o erro na tela entra na rodada, mas
  precisa ser (a) verificada no código antes — a hipótese de quem reporta pode
  não ser a causa —, (b) coberta por teste e (c) registrada como desvio aqui.
- **Dado financeiro real nunca aparece** em mockup, exemplo ou prompt. Valores
  fictícios e estabelecimentos genéricos.
- **Nenhuma credencial** em código de exemplo.
- **Nada de dupla contagem.** `type: 'transfer'` fica fora de despesa e receita.
  Todo KPI novo declara se inclui `transfer` e se inclui `isProjected`.
- **Competência manda sobre data.** `competenceMonth` agrupa o mês; `date` serve
  ao fluxo diário em Saldos. Não misturar.
- **Parcela projetada é visualmente distinta** de lançamento efetivo em qualquer
  tela onde as duas apareçam juntas.
- **Compatibilidade retroativa:** registro antigo sem o campo novo não pode
  quebrar a tela.
- **Responsivo até 360px**, declarado na proposta.
- **Estado de carregamento, vazio e erro** previstos. Tela que só desenha o caso
  feliz volta para a rodada de mockup.

---

## Prompt de retomada

Cole numa sessão nova:

> Estou retomando o redesign do Radar Financeiro. Leia `ROTEIRO-REDESIGN.md`,
> `CLAUDE.md` e `RELATORIO-AUDITORIA.md` na raiz do repositório. Rodadas 0, 1 e 2
> estão concluídas, e a **rodada 3 parte 1** (faixa de KPIs do Dashboard) já está
> no ar. A próxima é a **rodada 3 parte 2** (fatia "Sem categoria" da pizza e
> Orçamento × Real), com mockup já aprovado e prompt em
> `PROMPT-rodada-3-parte2.md`. Antes de propor qualquer coisa, diga o que a parte
> 2 herda de pendência da parte 1. Se algum achado do roteiro não bater mais com
> o código, aponte a divergência em vez de seguir o roteiro.

---

## Registro de divergências conhecidas

- ~~`CLAUDE.md` cita `js/pdf-import.fixed.js` como arquivo entregue e não
  ativado.~~ **Resolvido em 02/08/2026:** o "fixed" foi promovido a
  `js/pdf-import.js` (o cabeçalho do arquivo ainda descreve a promoção) e o
  antigo virou `js/pdf-import.legacy.js`, que não é importado por ninguém.
  `js/parsers/pdf-layout.js` está em uso de verdade. `CLAUDE.md` atualizado.
- **`js/pdf-import.legacy.js` é código morto.** Ainda referencia
  `#pdf-info-text`, elemento que a rodada 2 removeu do `index.html`. Remover
  numa rodada que já toque no fluxo de fatura — limpeza, não design.
- `RELATORIO-AUDITORIA.md` (02/08/2026) lista 13 achados. Ler antes de mexer em
  parsing de PDF, dedupe ou segurança. Achado aberto ≠ item de design.
  **Não são mais 13 abertos:** o achado 6 (dedupe) foi fechado na rodada 2 e o
  achado 8 (`'unsafe-inline'` no `script-src`) foi fechado com a extração de
  `js/firebase-init.js` — `vercel.json:24` já não tem `unsafe-inline` em
  `script-src`. O achado 2 (`firestore.rules`) mudou de natureza: o arquivo
  **existe** no repositório; o que segue sem confirmação é a publicação no
  console do Firebase, que não dá para verificar pelo código.
- ~~`CLAUDE.md` descrevia o Firebase como script inline em `index.html:14-46`.~~
  **Resolvido em 02/08/2026:** hoje é `js/firebase-init.js`, carregado em
  `index.html:14`. O mapa de arquivos de `CLAUDE.md` também não listava
  `js/extratos.js` nem `js/firebase-init.js` — corrigido.
