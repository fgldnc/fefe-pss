# Roteiro do redesign — Radar Financeiro

Documento de estado entre sessões. Quem abrir uma sessão nova sobre design do
Radar lê este arquivo primeiro e continua daqui, sem precisar refazer o
diagnóstico.

**Última atualização:** 02/08/2026 · rodadas 0, 1, 2, **3 (por inteiro)** e
**4 (Fluxo de Caixa)** concluídas. Rodada 3 — parte 1 (faixa de KPIs), correção 3.1a (modo "mês
encerrado" e investido fora do "Livre") e **parte 2 (pizza "Sem categoria",
Orçamento × Real e reordenação dos blocos), conferida no app**. Divergências
entre documento e código reconferidas nesta data (ver o fim do arquivo).
**Rodada 4 concluída e conferida no app em 02/08/2026** (ver a seção da rodada
4). Próximo passo: **rodada 5** (comprometimento futuro e aging de parcelas).

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
**Estado: CONCLUÍDA (partes 1 e 2) e conferida em 02/08/2026.** Mockups
`MOCKUP-rodada-3-kpis.html` e `MOCKUP-rodada-3-parte2.html`; prompts em
`PROMPT-rodada-3.md` e `PROMPT-rodada-3-parte2.md`. Arquivos tocados na parte 1:
`js/dashboard.js`, `css/style.css`, `js/utils.js` (skeleton), `index.html`
(skeleton estático).

#### Parte 2 — "Sem categoria" e o card que não fechava (02/08/2026)

**O achado maior do que o roteiro registrava.** O roteiro só apontava o gasto
sem categoria sumindo do Orçamento × Real. O buraco era mais largo: o card
iterava sobre `Object.entries(budgetMonth)`, então **também** sumia todo gasto
em categoria *sem limite definido*. A soma visível ficava menor que o KPI de
Despesas logo acima, sem nada na tela avisando. Mesmo padrão em
`js/orcamento.js` (agrupava por `categoryId` e iterava só sobre
`state.categories`).

**Como ficou.** Uma função pura, `splitGastosPorLimite(txs, budgetMonth,
categories)`, devolve `{ porCategoria, semCategoria, semLimite, total }` — uma
partição exata das despesas do mês. Dashboard e aba Orçamento consomem a mesma
função e o mesmo `renderForaDoLimite()`, então não existem duas verdades sobre
o mesmo mês. Ambas moram em **`js/utils.js`**, não em `js/db.js`: são puras
(não leem `state`, não tocam Firestore) e `utils.js` é o único módulo que os
dois já importam sem criar ciclo — recebendo tudo por argumento, não viola a
restrição de `utils.js` não importar módulo do projeto.

**Onde o âmbar entra e onde não entra.** A fatia da pizza continua neutra
(`#6b6b6b`, igual a "Outras"): a pizza não é editável, e a rodada 2 proibiu
alarme sem porta de saída. Quem carrega o âmbar é a **linha da legenda**, que
clica. Fechada, portanto, a pendência 1 herdada da parte 1 — a favor de "fatia
neutra, legenda acionável".

**A armadilha dos universos diferentes, resolvida.** Pizza mede
`allExpensesOfMonth()` (transações **+** extrato); a aba Gastos mede
`txOfMonth()` (**só** transações). Para a contagem nunca mentir sobre o
destino, `db.js` passou a marcar o item normalizado com `_origem: 'extrato'`
(campo só de leitura, nunca gravado) e a linha quebra em `N em Gastos ·
M em Extratos` quando as duas origens existem — nesse caso a linha inteira
**não** clica, porque nenhuma aba sozinha mostra o total anunciado.

**Conferência feita no app** (servidor estático + `state` sintético injetado no
console; sem Firebase, harness descartado no fim):

1. Identidade fechando: 1.450 (categorias com limite) + 700 (fora de qualquer
   limite) = 2.150 = centro da pizza = KPI de Despesas = linha de reconciliação.
   `type: 'transfer'` ficou de fora, como manda a regra.
2. Aba Orçamento e Dashboard reportaram **o mesmo** total para o mesmo mês.
3. Mês com tudo classificado e tudo orçado: zero marcas âmbar, bloco "fora de
   qualquer limite" ausente, sobrando só a reconciliação.
4. Split por origem correto (2 em Gastos · 1 em Extratos) e clique levando à aba
   certa já filtrada, com a tabela mostrando exatamente os N prometidos.
5. Ida e volta ao Dashboard e clique de novo: funciona, sem listener duplicado
   (o handler é delegado em `document` e registrado uma única vez em `app.js`).
6. Re-render da aba Orçamento não duplica o bloco de fechamento.
7. Evolução em meia largura: 6 rótulos de mês, 50px de folga entre eles, sem
   sobreposição. Canvas a 220px.
8. Em 360px: sem scroll horizontal, donut em 148px, `.lg-pct` escondido, nenhum
   valor monetário truncado.
9. Patrimônio intacto (4 KPIs, grid próprio). `node --test test/*.mjs`: 35/35.
   Console limpo, sem erro de CSP.

**Desvios do prompt, com o motivo:**

- **Arquivos além dos cinco listados.** O prompt dizia "nenhum outro arquivo",
  mas ele próprio autorizava `js/utils.js` (item 3.3) e exigia navegação sem
  import estático de `app.js` (item 3.4). Tocados também: `js/app.js` (handler
  delegado `[data-goto]` + `_goto()`), `js/db.js` (o campo `_origem`) e
  `css/components.css` (onde `.progress-ok` e o bloco de orçamento já moravam).
- **`.progress-ok` virou azul** (`--accent-primary`) em `css/components.css`.
  Conferido antes, como o prompt mandava: a classe é compartilhada **só** entre
  o card do Dashboard e a aba Orçamento, que devem ler igual — nenhuma outra
  tela usa.
- **Breakpoint do `.dashboard-row` mudou de 1200px para 900px.** O item 5 pede
  `1fr 1fr` acima de 900px; a regra antiga colapsava antes disso.
- **Tick do eixo X da evolução caiu de 10 para 9** (`autoSkip: false`,
  `maxRotation: 0`), exatamente a saída que o prompt autorizava antes de mexer
  no layout. Com a folga medida, os 6 rótulos cabem.
- **Id de categoria órfão** (categoria apagada, `categoryId` apontando para o
  nada) foi classificado como **resíduo**, não como pendência: entra em
  "Outras" na pizza e em "categorias sem limite" no card. Se caísse no balde de
  "sem categoria", a contagem da legenda não bateria com o filtro do destino
  (`!t.categoryId`) — que é justamente o que ela promete.
- **Sentinela do filtro de Gastos:** `__sem-categoria__`, exportada de
  `utils.js` como `SEM_CATEGORIA_FILTRO`. Id de categoria é slug gerado do nome
  (letras, dígitos, hífen), então `__…__` nunca colide.

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

#### Correção 3.1a — mês encerrado e o investido fora do "Livre" (02/08/2026)

Feita depois da parte 1 estar no ar, a partir de um print de junho/2026.
Arquivos: `js/dashboard.js`, `css/style.css`. Sem mockup, a pedido.

**Dois defeitos, um deles introduzido pela parte 1:**

1. **"Comprometido" num mês encerrado é a palavra errada.** Mês fechado não tem
   nada comprometido — tem resultado. Só o rótulo já era mentira.
2. **`livre` não subtraía o investido** (`livre = receita − comprometido`, e
   `comprometido` exclui investimentos). Em junho isso mostrava "Livre
   R$ 2.398,70" quando R$ 1.790,97 já tinham ido para investimento — sobrou
   R$ 607,73. **Regressão da parte 1:** o KPI antigo fazia
   `totalIncome − totalExpense − totalInvested`; o prompt da rodada 3 definiu
   `livre = totalIncome − comprometido` e a implementação seguiu a
   especificação sem levantar a mudança de sentido. O número não estava
   errado — o **nome** estava: R$ 2.398,70 é o *guardado* (investido + sobra),
   que é a taxa de poupança do mês, 47% da receita.

**O rótulo passa a seguir a posição do mês exibido** (`isEncerrado = month <
mesCorrente`):

| Mês | Rótulo | Número grande |
|---|---|---|
| Passado | `Resultado de {mês}` | sobra (assinada) |
| Corrente | `Comprometido de {mês}` | comprometido |
| Futuro | `Comprometido de {mês}` | comprometido |

Futuro não muda: mês que só tem parcela contratada é comprometido no sentido
literal. O único modo novo é o do mês encerrado.

**A sobra vira o número grande no mês fechado** porque `comprometido ===
totalExpense` sempre — o hero repetia exatamente o número do card Despesas.
A sobra é o único valor da faixa que nenhum outro card mostra.

**A barra ganhou um quarto segmento (`.seg-invest`, `--accent-bright`)** e passa
a decompor a receita inteira: `já gasto + projetado + investido + sobra =
receita`. Sem isso, tirar o investido do livre quebraria o fechamento que o
critério de pronto da parte 1 exigia. Ciano e não `--gold` de propósito: âmbar
na faixa significa "falta um dado" (`.mark-inferido`), e a rodada 3 já tinha
tirado o dourado do card Investido por causa dessa colisão.

**Vermelho volta a ser permitido — só no mês encerrado.** Resultado negativo ali
é fato verificado, não a aritmética de dado faltando do dia 1. É o caso oposto
ao que motivou a proibição, e por isso recebe tratamento oposto: número em
`--danger` e rodapé `Gastou R$ X além da receita de R$ Y`.

**`Parcelas previstas` → `Não conferido` em mês fechado.** Confirmado que nada
no app reverte `isProjected` (só é escrito na criação, `gastos.js:287` e
`pdf-import.js:807`): parcela projetada continua projetada para sempre. Em
junho isso eram R$ 755,93, ~28% do mês, que nunca foram conferidos contra
fatura. Segmento mantido em cor neutra, **sem** `.mark-inferido` — âmbar
apareceria em todo mês fechado com parcelamento, e não há ação que resolva.
A reconciliação de verdade é assunto da rodada 5.

**Dois estouros de layout a 360px, achados na conferência e corrigidos:**
`.mark-inferido` é `white-space: nowrap` (certo para rótulo curto em célula de
tabela, errado para a frase inteira do hero — 370px num card de 286px); e o
texto de fallback `excluindo investimentos` não cabia em card de ~150px. Os
dois `white-space: normal` são escopados (`.kpi-hero .mark-inferido` e
`#kpi-grid .kpi-delta` dentro do breakpoint) — os modais de importação seguem
com `nowrap`, verificado.

**Conferido** com os números reais do print de junho:
`1.917,65 + 755,93 + 1.790,97 + 607,73 = 5.072,28` fecha exatamente com a
receita; rodapé `47% da receita guardada · 12% ficou livre`. Mês corrente
fecha em 6.500 com o livre já líquido de investimento. Mês encerrado negativo
mostra `-R$ 500,00` em vermelho com a barra em 100%. Futuro sem receita segue
sem negativo, com marca e CTA. Patrimônio reconferido em iframes (26 elementos,
22 props + caixa): idêntico. 35 testes passando.

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

Herdava três pendências. **1 e 2 foram fechadas na parte 2** (ver acima); 3 foi
respeitada — a parte 2 reusou `.mark-inferido` em vez de inventar símbolo novo.

1. ~~**A fatia "Sem categoria" da pizza**~~ **Fechada:** fatia neutra, legenda
   acionável em âmbar.
2. ~~**Lançamento sem categoria some do Orçamento × Real**~~ **Fechada, e o
   buraco era maior:** gasto em categoria sem limite também sumia. Partição
   exata em `splitGastosPorLimite()`.

Texto original das pendências, para referência:

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
**Estado: CONCLUÍDA em 02/08/2026.** Mockup em `MOCKUP-rodada-4.html`, prompt em
`PROMPT-rodada-4.md`. Conferida no app com `state` sintético (harness
descartado, não comitado): aritmética do fluxo, os quatro estados, mês que cruza
o zero, mês encerrado, mês futuro, empate no mínimo, 360px sem scroll
horizontal, dez trocas de mês sem empilhar instância de Chart e console limpo.
`node --test test/*.mjs` em **54/54** (eram 35; `test/saldos.test.mjs` cobre a
série diária, a busca do mínimo, a fatura no vencimento e o contexto da
sublinha).

**Correção de escopo: NÃO é "layout puro" e NÃO é "sem campo novo", como este
roteiro dizia.** Verificado no código em 02/08/2026: `saldos.js:12` e `:54`
iniciam o saldo em **zero** no dia 1. Logo a coluna "Saldo" não é saldo, é fluxo
acumulado — e "marcar o pior saldo do mês", que era o entregável central da
rodada, exibiria em vermelho um número que não corresponde a caixa nenhum.
**Decidido:** entra `saldo inicial por mês` como pré-requisito de dado declarado.

Segundo pré-requisito, achado ao desenhar: **`saldos.js:147-162` posiciona a
fatura no dia da *compra*** (pertinência pelo `competenceMonth`, dia pelo
`date`), mas a fatura sai do caixa numa data só. Sem `faturaVencimentoDia`, o
mínimo pode apontar o dia errado. Degradação prevista: sem o campo, cai no
comportamento atual com `.mark-inferido`.

Os dois campos vão para `users/{uid}/settings/fluxo`. A subcoleção `settings`
**já está liberada** em `firestore.rules:116-118` e não é usada por módulo
nenhum — então a rodada **não depende de republicar as regras**, que é item
aberto e não verificável pelo código.

Entregáveis de layout: três KPIs no topo (saldo inicial · **menor saldo do mês
com o dia** · projeção de fechamento); curva do saldo diário em Chart.js com
linha do zero e trecho projetado tracejado; tabela reduzida a cinco colunas e
**só dias com movimento**. Saem da tabela: "Diário" (mesmo valor em 31 linhas,
`saldos.js:186-188`) vira nota de cabeçalho, e "Invest." (não afeta o saldo,
`saldos.js:10`) vira rodapé.

**Três violações de decisões já fechadas, corrigidas nesta rodada:** `--gold`
decorativo (`saldos.js:88`, `:113` — mesmo hex de `--warning`); âmbar em
`saldo < 100` (`:77` — âmbar é "exige ação" desde a rodada 2, e saldo baixo é
fato); emoji nos cabeçalhos (`:99`, `:101`). Mais uma restrição inegociável
violada hoje, em produção: **parcela projetada e lançamento efetivo somados na
mesma célula sem distinção**.

Momento de remover `js/calendario.js` e `js/pdf-import.legacy.js` (zero
importadores, reconfirmado em 02/08/2026) e de unificar `getInvestCatIds` — ver
divergência abaixo.

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
> `CLAUDE.md` e `RELATORIO-AUDITORIA.md` na raiz do repositório. Rodadas 0, 1, 2,
> **3 (partes 1 e 2)** e **4 (Fluxo de Caixa)** estão concluídas e no ar. A
> próxima é a **rodada 5** (comprometimento futuro e aging de parcelas), que
> reusa o formato de KPI da rodada 3 e as classes `.fx-*` da rodada 4. Antes de
> propor qualquer coisa, verifique se a identidade "categorias com limite + fora
> de qualquer limite = total de despesas do mês" continua fechando no Dashboard,
> na aba Orçamento e no total de saídas do Fluxo de Caixa: ela é o contrato que a
> rodada 3 estabeleceu e que a rodada 4 estendeu ao Fluxo. Rode
> `node --test test/*.mjs` (54/54) antes de começar. Se algum achado do roteiro
> não bater mais com o código, aponte a divergência em vez de seguir o roteiro.

---

## Registro de divergências conhecidas

- **Contrato da rodada 3 reconferido em 02/08/2026 — fechando.**
  `splitGastosPorLimite()` (`utils.js:305`) fecha **por construção**, não por
  coincidência: `total` soma toda despesa não-`transfer` e cada lançamento cai
  em exatamente um dos três baldes, então
  `Σ porCategoria.real + semCategoria.total + semLimite.total ≡ total`.
  Dashboard (`dashboard.js:231`) e aba Orçamento (`orcamento.js:29-30`) consomem
  a **mesma base**: `allExpensesOfMonth(month)` menos investimentos, e as mesmas
  categorias menos investimentos. 35/35 testes passando.
  **Risco registrado, não achado:** `split` pula `type === 'transfer'` e
  `totalExpense` (`dashboard.js:47`) não pula. Hoje é inócuo porque `transfer` só
  é gravado pelos parsers de extrato (`base-parser.js:9-10`) e
  `allExpensesOfMonth` (`db.js:152`) já filtra `type === 'expense'` do extrato.
  **Se algum dia um lançamento manual puder ser marcado como transferência, o
  KPI de Despesas e a linha de reconciliação divergem em silêncio.**
- ~~**`getInvestCatIds` está triplicado, em duas implementações diferentes.**~~
  **Resolvido na rodada 4:** `getInvestCatIds(categories = state.categories)` é
  exportado de `js/utils.js` e consumido por `dashboard.js`, `orcamento.js` e
  `saldos.js`. Ficou a implementação de campos separados — concatenar casa
  "investiment" atravessando a fronteira entre `id` e `name`. **Sobram três
  cópias da versão concatenada**, todas fora do escopo declarado da rodada 4:
  `gastos.js:177` e `extratos.js:463` (checam UMA categoria, outro formato) e
  `relatorios.js:153` (mesmo formato de lista — candidata natural da próxima
  rodada que tocar em Relatórios). Texto original, para referência:
  `dashboard.js:24` usa `id.includes(…) || name.includes(…)`; `orcamento.js:16` e
  `saldos.js:126` usam `(c.id + c.name).includes(…)`. Mesmo resultado hoje, mas é
  o padrão de "duas verdades sobre o mesmo mês" que a rodada 3 eliminou ao criar
  `splitGastosPorLimite()`. **Unificação em `utils.js` faz parte da rodada 4**
  (item 3.1 do prompt), e vem **antes** do resto porque mexe na base do contrato.
- **`users/{uid}/settings/fluxo` não entra no backup/restore da rodada 4**
  (`db.js:471` `ALLOWED_COL_NAMES` e `db.js:388` `WIPABLE_COLLECTIONS` seguem
  como estão). Configuração não é dado financeiro e ampliar a superfície do
  restore é risco fora do escopo de uma rodada de design. **Consequência:**
  restaurar um backup não traz de volta saldo inicial nem dia de vencimento.

- ~~`CLAUDE.md` cita `js/pdf-import.fixed.js` como arquivo entregue e não
  ativado.~~ **Resolvido em 02/08/2026:** o "fixed" foi promovido a
  `js/pdf-import.js` (o cabeçalho do arquivo ainda descreve a promoção) e o
  antigo virou `js/pdf-import.legacy.js`, que não é importado por ninguém.
  `js/parsers/pdf-layout.js` está em uso de verdade. `CLAUDE.md` atualizado.
- ~~**`js/pdf-import.legacy.js` é código morto.**~~ **Removido na rodada 4**,
  junto de `js/calendario.js`. O grep de `calendario.js` e `pdf-import.legacy`
  não retorna nada fora do histórico do git.
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
