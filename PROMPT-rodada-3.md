# Prompt — rodada 3, parte 1: faixa de KPIs do Dashboard

> Cole este arquivo inteiro numa sessão do Claude Code na raiz do repositório.
> Ele carrega sozinho o contexto necessário: **não presuma que quem lê conhece o
> projeto.** Mockup aprovado em 02/08/2026: `MOCKUP-rodada-3-kpis.html` na raiz —
> abra no navegador antes de escrever código.

---

## 1. O projeto, em cinco linhas

Radar Financeiro: app web de finanças pessoais, **JavaScript puro com ES modules,
sem build, sem npm, sem framework**. `index.html` é o shell único (todas as telas
e modais vivem lá); os módulos em `js/` preenchem via `innerHTML`. Chart.js 4.4 e
PDF.js 3.11 vêm de CDN como globais. Firebase Auth + Firestore. Estado global em
`state`, exportado de `js/utils.js`. Tema escuro; tokens de cor no `:root` de
`css/style.css`.

**Esta rodada mexe em:** `js/dashboard.js` e `css/style.css`. `index.html` só se o
item 6 exigir. Nenhum outro arquivo.

---

## 2. O problema que esta rodada resolve

O Dashboard abre com quatro cards de peso idêntico e nenhum responde "como está o
mês?" sozinho. No dia 1, três estão em zero e o quarto — **"Saldo livre"** —
anuncia um número negativo em vermelho, porque `js/dashboard.js:46` calcula
`totalIncome − totalExpense − totalInvested` com a receita do mês ainda não
cadastrada. **É aritmética, não fato.** O app acusa um rombo inexistente
exatamente no momento de maior uso.

A proposta: **um número manda, três apoiam.** "Saldo livre" deixa de ser card e
vira a terceira faixa da barra do card principal, onde ele se explica.

---

## 3. O que construir

### 3.1 Card principal (hero) — "Comprometido de {mês}"

Ocupa a primeira coluna da faixa, com peso maior (largura ~1,55× e fundo
`--bg-card-raised`). Conteúdo, de cima para baixo:

1. Rótulo: `Comprometido de {monthLabel(month)}`.
2. Valor grande: **comprometido = despesas efetivas do mês + parcelas projetadas
   do mês**.
3. Barra horizontal de três faixas, sobre a receita do mês:
   - `seg-real` — despesas efetivas, `--accent-primary` sólido;
   - `seg-proj` — parcelas projetadas, `--accent-primary` com `opacity:.38`;
   - o vazio restante da barra é o **livre**.
4. Legenda com os três valores: `Já gasto`, `Parcelas previstas`, `Livre`.
5. Rodapé: `{pct}% da receita de {fmt(totalIncome)} · {n} dias restantes`.

**Definições — sem margem para interpretação:**

- `comprometido = totalExpense + parcelasProjetadasDoMes`, onde `totalExpense` é
  o que `dashboard.js:44` já calcula (despesas do mês **excluindo
  investimentos**, via `getInvestCatIds()`).
- `parcelasProjetadasDoMes` = transações do mês corrente com
  `isProjected === true`. **Cuidado com dupla contagem:** confira se
  `allExpensesOfMonth(month)` já devolve as projetadas do mês corrente. Se
  devolver, elas **já estão** dentro de `totalExpense` e a faixa `seg-proj` é um
  recorte de dentro dele, não uma soma por cima — nesse caso
  `comprometido === totalExpense` e `seg-real` usa
  `totalExpense − parcelasProjetadasDoMes`. **Verifique em `js/db.js` antes de
  escrever a conta e registre no comentário do código qual dos dois casos é.**
- `livre = max(0, totalIncome − comprometido)`. Se `comprometido > totalIncome`,
  a barra fica 100% preenchida e o rodapé mostra o percentual real (ex.: 112%);
  **não** estoure a barra e **não** mostre livre negativo.
- **`type: 'transfer'` fica fora** de tudo: não é despesa nem receita.
  Transferência entre contas e pagamento de fatura não são gasto.
- `n dias restantes` = dias até o fim do mês **de competência exibido**. Se o mês
  exibido não for o mês corrente (a navegação de mês existe), **omita essa parte
  do rodapé** — "13 dias restantes" num mês passado é mentira.

### 3.2 Estado do dia 1 — sem receita cadastrada

Quando `totalIncome === 0`, o hero muda:

- A barra fica com uma faixa só, `seg-proj` a 100% — o comprometido é todo
  parcela já contratada.
- Some o rodapé de percentual (não há denominador).
- Entra a marca `.mark-inferido` (o losango `◇` em `--warning`, **vocabulário já
  existente em `css/components.css`, criado na rodada 2 — reusar, não inventar
  símbolo novo**) com o texto:
  `Receita de {mês} ainda não cadastrada — sem base de comparação`.
- Abaixo dela, um botão de contorno azul que leva à aba Receitas.

**O que não fazer:** nada de número negativo, nada de vermelho. Zero continua
sendo zero; o que sai é a conta negativa anunciada.

### 3.3 Os três cards de apoio — Receitas, Despesas, Investido

Mantêm rótulo e valor. Mudam em quatro pontos:

1. **Emoji fora.** Remover `.kpi-icon` com 💰 💳 📊 📈 dos quatro cards do
   Dashboard. Não carregam informação e competem com a tipografia.
   **Não remover `.kpi-icon` do CSS** — a aba Patrimônio usa (ver item 6).
2. **Delta encurtado.** `_delta()` (`js/dashboard.js:62-70`) hoje devolve
   `▲ 12% vs mês anterior`. Passa a devolver só `▲ 12%`, com a frase completa no
   atributo `title` do elemento. Repetida em quatro cards, ela vira ruído.
   A lógica de cor (`goodWhenUp`) **não muda**: receita subir é verde, despesa
   subir é vermelho.
3. **Sparkline de 6 meses** ao lado do delta, alinhado à direita.
4. **Delta em todos os três.** Hoje só Receitas e Despesas têm; Investido mostra
   texto fixo. Passa a ter, com `goodWhenUp = true`.

### 3.4 Sparkline — reaproveitar a série, não recalcular

`renderChartEvolucao()` (`js/dashboard.js:227-234`) **já monta** os três arrays de
6 meses: `receitas`, `despesas`, `investido`, a partir de
`offsetMonth(state.currentMonth, -i)`.

**Extraia essa montagem para uma função** — por exemplo
`getSeries6m(investIds)`, devolvendo `{ months, labels, receitas, despesas,
investido }` — e faça `renderChartEvolucao()` **e** os sparklines consumirem a
mesma função. Duas contas separadas para o mesmo número divergem com o tempo;
já aconteceu neste projeto (comentário em `js/dashboard.js:112-114`).

O sparkline é **SVG inline gerado em string**, não Chart.js: são 6 pontos num
retângulo de 66×26px, e instanciar três gráficos Chart.js para isso é caro e
obriga a destruir/recriar a cada troca de mês.

- Escala: `min`/`max` da própria série, com padding vertical de ~15%. Série toda
  igual (max === min) → linha reta no meio.
- Cor: `--danger` quando o delta é ruim, `--success` quando é bom,
  `--text-muted` quando o delta é `=` ou não existe. **Hex literal não é
  necessário aqui** — SVG inline no DOM resolve `var(--…)` normalmente. A regra
  do hex literal vale para Chart.js, que é canvas.
- Ponta: círculo cheio no último ponto. **Se o mês exibido for o mês corrente**,
  o círculo é vazado com `stroke-dasharray` — o mês ainda está incompleto, e um
  ponto cheio lá embaixo lê como queda, não como "ainda não terminou".
- `role="img"` + `aria-label` descrevendo a tendência em texto.

---

## 4. Restrições inegociáveis

- **pt-BR** em toda string de interface.
- **Sem build, sem npm, sem biblioteca nova.** ES modules nativos.
- **Só os tokens do `:root`** de `css/style.css`. Precisa de um tom novo? Pare e
  proponha como adição ao `:root`, com nome de token e justificativa.
- **Azul é navegação e quantidade neutra.** Verde e vermelho carregam juízo de
  valor — só no delta e no sparkline. Nada de verde/vermelho na barra do hero.
- **`esc()` em toda interpolação** de `innerHTML` que venha de dado do usuário
  (nome de mês, descrição). `esc()` está em `js/utils.js:44`.
- **Compatibilidade retroativa:** registro antigo sem `isProjected` não pode
  quebrar a tela. Trate ausente como `false`.
- **Competência manda sobre data:** `competenceMonth` agrupa o mês; `date` é do
  fluxo diário em Saldos. Não misture.
- **Responsivo até 360px** — comportamento no item 5.
- **Estado vazio e de carregamento previstos** — item 6.
- **Só design.** Não reescrever parser, regra de classificação ou projeção de
  parcela. Se algo exigir isso, **pare e declare como pré-requisito** em vez de
  fazer.
- **Dado financeiro real nunca aparece** em comentário, exemplo ou commit.

---

## 5. Responsivo

`css/style.css:575` e `:595` já têm os breakpoints da `.kpi-grid`. Estender:

- **Acima de 900px:** `1.55fr 1fr 1fr 1fr`.
- **481–900px:** duas colunas; o hero ocupa `grid-column: 1 / -1`.
- **Até 480px:** hero em largura total; os três apoios em 2×2 (o terceiro fica
  sozinho na última linha, o que está certo — é o menos importante).
  A legenda do hero colapsa para mostrar **só "Livre"**; `Já gasto` e
  `Parcelas previstas` ficam escondidos (`display:none`), não reflowados.
- **Até 360px:** sparkline encolhe para 52×22px. Nada some além da legenda.

---

## 6. Armadilha: `.kpi-grid` e `.kpi-card` são compartilhados

**Leia isto antes de tocar no CSS.** As classes `.kpi-grid`, `.kpi-card`,
`.kpi-header`, `.kpi-label`, `.kpi-value` e `.kpi-icon` **também são usadas pela
aba Patrimônio** (`index.html:235` em diante, com 💎 no `.kpi-icon`). O roteiro
do redesign registra Patrimônio como **"bem resolvida, não mexer"**.

Portanto:

- Todo seletor novo é escopado em **`#kpi-grid`** (o `id` do grid do Dashboard,
  `index.html:173`) ou usa **classe nova** (`.kpi-hero`, `.kpi-trend`,
  `.spark`, `.hero-bar`, `.hero-legend`).
- **Não altere** `.kpi-icon`, `.kpi-value.accent` nem a regra base de
  `.kpi-card`. A remoção do emoji é feita **no HTML gerado por
  `dashboard.js`**, não apagando a classe do CSS.
- Depois de implementar, **abra a aba Patrimônio e confira que ela está idêntica**.
  É o teste de regressão mais provável desta rodada.

**Segunda armadilha — `showKpiSkeleton()`** (`js/utils.js:126`) monta 4 skeletons
iguais e é chamada antes do render. Com o hero mais largo, o skeleton passa a não
bater com o layout final e a tela "pula". Ajuste a função para que o primeiro
skeleton acompanhe a proporção do hero. O mesmo vale para o skeleton estático em
`index.html:174-178`.

**Terceira armadilha — `--gold` e `--warning` são o mesmo hex** (`#fbbf24`,
`css/style.css:40` e `:44`). Hoje `.kpi-value.gold` pinta o valor de "Investido"
nessa cor, decorativamente. Com o `.mark-inferido` âmbar entrando no hero — onde
âmbar significa **"falta um dado, existe ação a tomar"** —, a mesma cor passa a
ter dois significados na mesma faixa da tela.

**Decisão:** o valor de "Investido" passa a `--text-primary`; quem carrega a cor
nesse card é o delta (verde/vermelho) e o sparkline. Remova a classe `gold`
**apenas do card do Dashboard**. Não mexa em `.kpi-value.gold` no CSS — outras
telas podem usar.

---

## 7. Critério de pronto

Confira cada item abrindo o app, não só lendo o código:

1. Mês com dado: hero mostra comprometido, barra em três faixas, e
   `real + projetado + livre` **fecha exatamente** com a receita do mês. Some os
   três na mão e compare.
2. **Nenhum card mostra número negativo em vermelho quando a receita é zero.**
   Teste navegando para um mês futuro sem receita cadastrada.
3. Os três cards de apoio têm delta e sparkline; nenhum tem emoji.
4. O sparkline de um mês corrente termina em círculo vazado; o de um mês passado,
   em círculo cheio.
5. Série do sparkline **bate com o gráfico de evolução** logo abaixo — mesmo
   número, porque agora vêm da mesma função. Compare o último ponto com a última
   barra.
6. **Aba Patrimônio idêntica ao que era antes.** `git stash` e compare se
   precisar.
7. Em 360px: hero em largura total, apoios em 2×2, sem scroll horizontal e sem
   texto truncado.
8. `node --test test/*.mjs` — **35 testes continuam passando.**
   (`node --test test/` falha com `MODULE_NOT_FOUND`: o Node tenta resolver
   `test` como módulo. É invocação, não teste quebrado.)
9. Console do navegador limpo, sem erro de CSP.

---

## 8. Fora do escopo — não faça

Estes itens são da **parte 2** do mockup, ainda não desenhada. Se você mexer
neles agora, a parte 2 vai ter que desfazer:

- A fatia **"Sem categoria"** da pizza (`js/dashboard.js:151-160`, hoje em
  `#6b6b6b` como tratamento provisório da rodada 1).
- **Gasto sem categoria sumindo do Orçamento × Real** (`js/orcamento.js:30`
  acumula em `spentByCat[undefined]` e a linha 33 itera só sobre
  `state.categories`; o valor existe e nunca aparece).
- Gráfico de evolução, card de parcelas futuras, drill-down por clique
  (rodada 6), aging de parcelas (rodada 5).

Terminada a implementação, **atualize `ROTEIRO-REDESIGN.md`**: marque a rodada 3
parte 1 como concluída, registre a conferência e **qualquer desvio deste prompt
decidido durante a execução**, com o motivo.
