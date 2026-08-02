# Prompt — rodada 3, parte 2: distribuição dos gastos e Orçamento × Real

> Cole este arquivo inteiro numa sessão do Claude Code na raiz do repositório.
> Ele carrega sozinho o contexto: **não presuma que quem lê conhece o projeto.**
> Mockup aprovado em 02/08/2026: `MOCKUP-rodada-3-parte2.html` na raiz — abra no
> navegador antes de escrever código.
>
> **Dependência:** a parte 1 (`PROMPT-rodada-3.md`, faixa de KPIs) deve estar
> implementada antes. Esta parte assume que o sparkline dos KPIs já existe — é o
> que justifica a evolução mensal perder o topo da página.

---

## 1. O projeto, em cinco linhas

Radar Financeiro: app web de finanças pessoais, **JavaScript puro com ES modules,
sem build, sem npm, sem framework**. `index.html` é o shell único (todas as telas
e modais vivem lá); os módulos em `js/` preenchem via `innerHTML`. Chart.js 4.4 e
PDF.js 3.11 vêm de CDN como globais. Firebase Auth + Firestore. Estado global em
`state`, exportado de `js/utils.js`. Tema escuro; tokens no `:root` de
`css/style.css`.

**Esta rodada mexe em:** `js/dashboard.js`, `js/orcamento.js`, `js/gastos.js`
(uma adição pontual, item 3.4), `index.html` (ordem dos blocos do Dashboard) e
`css/style.css`. Nenhum outro arquivo.

---

## 2. Os dois problemas que esta parte resolve

**Problema A — "Sem categoria" é indistinguível de "Outras".** A rodada 1 fez o
classificador devolver `category: null` em vez de `'outros'`, para que chute
deixasse de se disfarçar de classificação. Mas em `js/dashboard.js:158-162` a
fatia "Sem categoria" saiu em `#6b6b6b` — **o mesmo cinza de "Outras"**. São
coisas opostas: "Outras" é resíduo que a usuária aceitou; "Sem categoria" é
trabalho pendente.

**Problema B — o card Orçamento × Real não fecha com o KPI de Despesas, em
silêncio.** `js/dashboard.js:315` itera sobre `Object.entries(budgetMonth)`: só
desenha categoria **que tem limite definido**. Logo:

- gasto **sem categoria** cai em `realMap[undefined]` (`js/dashboard.js:313`) e
  nunca é lido;
- gasto em **categoria sem limite** nunca vira linha.

O mesmo padrão está em `js/orcamento.js:30` (`spentByCat[tx.categoryId]`, com a
linha 33 iterando só sobre `state.categories`). Resultado: a soma visível do card
é menor que o KPI de Despesas logo acima, e **nada na tela avisa**. Este é o
achado mais grave da rodada — maior do que o registrado no roteiro, que só
mencionava o gasto sem categoria.

---

## 3. O que construir

### 3.1 Legenda da pizza — "Sem categoria" vira linha de ação

A pizza **continua em Chart.js** (o donut em SVG do mockup é só desenho). O que
muda é a legenda ao lado, que já é HTML gerado em `js/dashboard.js:211-223`.

- **A fatia do gráfico continua neutra**, em `#6b6b6b`, igual a "Outras". No
  desenho as duas são a mesma coisa: sobra. **Não** pinte a fatia de âmbar — a
  pizza não é editável, e alarme sem porta de saída foi o que a rodada 2 proibiu.
- **A linha da legenda de "Sem categoria"** ganha:
  - o losango `◇` e o texto em `--warning` (reusar o vocabulário de
    `.mark-inferido`, criado na rodada 2 em `css/components.css` — **não invente
    símbolo novo**);
  - a **contagem de lançamentos**: `Sem categoria · 7 lançamentos`;
  - `cursor:pointer`, `role="button"`, `tabindex="0"` e o chevron `›`;
  - separador acima (`border-top`), para descolar do resto da legenda.
- **"Outras" continua em `--text-muted`, sem contagem e sem clique.** É resíduo
  aceito, não pendência.
- **Quando não há lançamento sem categoria, a linha some por inteiro.** Silêncio
  é o sinal de que está tudo bem — regra fechada na rodada 2.

### 3.2 Card "Orçamento × Real" — passa a fechar com o total

Reescrever `renderOrcamentoDashboard()` (`js/dashboard.js:301-346`):

1. As linhas de categoria **com limite** continuam como hoje (barra, real/meta).
2. Entra o bloco **"Fora de qualquer limite"**, com o total e as duas causas
   separadas em uma linha de detalhe:
   `R$ X em N lançamentos sem categoria · R$ Y em categorias sem limite definido`
   Cada trecho sublinhado é um link (item 3.4).
3. Entra a **linha de reconciliação** no rodapé:
   `Total de despesas de {mês} — {fmt(totalDespesas)}`.

**Regras duras:**

- `soma das categorias com limite + fora de qualquer limite === total de
  despesas do mês`. **Essa identidade é o ponto da mudança.** Se ela não fechar
  na tela, a implementação está errada — não ajuste o número, ache a causa.
- O "total de despesas do mês" é o **mesmo** que alimenta o KPI de Despesas:
  `allExpensesOfMonth(month)` **excluindo investimentos** via `getInvestCatIds()`.
  Reaproveite o array `txs` que `renderDashboard()` já passa como argumento; não
  recalcule por outro caminho.
- **`type: 'transfer'` fica fora** de tudo — não é despesa.
- O bloco "Fora de qualquer limite" **não tem barra de progresso**, de propósito:
  barra exige denominador e aqui não há meta.
- Cada uma das duas causas **some individualmente quando é zero**; o bloco
  inteiro some quando as duas são zero, sobrando só a reconciliação.
- **Faixas da barra de categoria:** `< 80%` azul (`--accent-primary`),
  `80–99%` âmbar (`--warning`), `≥ 100%` vermelho (`--danger`). Mantém as faixas
  que `js/orcamento.js:37` já usa. **Azul no lugar de verde**: "dentro do limite"
  é o esperado, não conquista — e verde aqui competiria com o verde de receita.
  Hoje `js/dashboard.js:322` usa `progress-ok`; ajuste a cor dessa classe **só
  se ela não for compartilhada com outra tela** — verifique antes.

### 3.3 A mesma correção na aba Orçamento

`js/orcamento.js` tem o mesmo buraco (linha 30 + linha 33). Aplique lá o
equivalente: ao fim da lista de categorias, o bloco "Fora de qualquer limite"
com as mesmas duas causas, e a linha de reconciliação.

**Não** replique código: extraia o cálculo para uma função só — sugestão,
`splitGastosPorLimite(txs, budgetMonth, categories)` devolvendo
`{ porCategoria, semCategoria, semLimite, total }`. Ela pode viver em
`js/utils.js` (que **não pode importar nenhum módulo do projeto** — restrição de
dependência circular documentada em `js/utils.js:1-4`; a função é pura, então
cabe) ou em `js/db.js`. Escolha e justifique num comentário.

### 3.4 O clique — e uma armadilha que precisa ser tratada

**Leia inteiro antes de implementar.** A pizza do Dashboard mede
`allExpensesOfMonth(month)`, que é `state.transactions` **mais**
`state.extratoTransactions` (ver `js/db.js:150-165`). A aba Gastos usa
`txOfMonth(month)`, que é **só** `state.transactions` (`js/db.js:140`).

Ou seja: se a legenda disser "7 lançamentos sem categoria" e o clique levar a
Gastos, a usuária pode ver 5 linhas e concluir que o app perdeu duas. **Contagem
que não bate com o destino é pior que não ter clique.**

**Solução, e é obrigatória:** quebre o número por origem quando as duas existirem.

- Só transações: linha única → clica e vai para Gastos filtrado.
- Só extrato: linha única → clica e vai para a aba Extratos.
- As duas: a linha mostra o total e, abaixo, o detalhe
  `5 em Gastos · 2 em Extratos`, cada trecho clicando para a sua aba.

Para o filtro em Gastos: `#filter-categoria` (`index.html:325`) hoje só tem
`""` = todas + uma opção por categoria, e `js/gastos.js:30` filtra com
`t.categoryId === filterCat`. **Adicione uma opção sentinela** — sugestão,
`value="__sem-categoria__"` com rótulo `Sem categoria` — montada em
`js/gastos.js:110-118`, e o `if` correspondente em `_renderTable()`
(`t => !t.categoryId`). Escolha um valor sentinela que **não possa colidir com um
id real de categoria** e comente por quê.

Isso é adição, não redesenho: o roteiro registra "não enxugar a barra de filtros
de Gastos", porque ali controle visível é função. Uma opção a mais no `select`
não contraria isso.

A navegação entre abas é `switchTab(name)`, exportada de `js/app.js:33`.
**Atenção à restrição:** `js/app.js` carrega os módulos de aba só por `import()`
dinâmico, para evitar dependência circular (comentado em `js/app.js:2-4`).
`dashboard.js` importar `switchTab` de `app.js` **cria o ciclo que essa regra
existe para evitar**. Resolva por `import()` dinâmico no handler do clique, ou
disparando um `CustomEvent` que `app.js` escuta. **Escolha uma, e não crie import
estático de `app.js` em módulo de aba.**

### 3.5 Ordem dos blocos do Dashboard

Em `index.html:180-222`, a ordem hoje é: evolução (largura inteira, 260px) →
pizza (largura inteira) → `.dashboard-row` com parcelas + orçamento. Passa a ser:

1. Faixa de KPIs (parte 1, já feita).
2. `.dashboard-row`: **Distribuição dos gastos** | **Orçamento × Real**.
3. `.dashboard-row`: **Parcelas previstas** | **Evolução (6 meses)**.

A evolução desce e perde a largura inteira porque o sparkline de cada KPI, feito
na parte 1, já entrega a tendência nos primeiros 30 segundos; mantê-la grande no
topo passou a repetir a mesma informação ocupando 260px de altura.

`.dashboard-row` (`css/style.css:373`) já é `1fr 1fr` — reusar, não criar grid
novo. A altura do canvas da evolução cai de 260px para ~220px em meia largura;
**confira se os rótulos do eixo X (6 meses abreviados) ainda cabem sem
sobreposição.** Se não couberem, reduza o `font.size` dos ticks antes de mexer no
layout, e registre isso como desvio.

---

## 4. Restrições inegociáveis

- **pt-BR** em toda string de interface.
- **Sem build, sem npm, sem biblioteca nova.**
- **Só os tokens do `:root`.** Precisa de tom novo? Pare e proponha como adição
  ao `:root`, com nome de token e justificativa.
- **Chart.js é canvas e não resolve `var(--…)`**: cor de gráfico vai em **hex
  literal** no JS. Já houve regressão por isso. HTML/SVG no DOM (legenda,
  barras do orçamento) resolve variável normalmente — a regra vale só para o
  canvas.
- **Azul é navegação e quantidade neutra.** Verde e vermelho carregam juízo de
  valor. **Série categórica da pizza usa a escala de azuis + magenta, nunca
  verde/vermelho** — senão a usuária lê juízo onde não há. Resíduo e "Sem
  categoria" em `--text-muted` / `#6b6b6b`.
- **Âmbar só onde existe ação.** É a regra da rodada 2, e é o motivo de a fatia
  ficar neutra e a legenda ficar âmbar.
- **`esc()` em toda interpolação** de `innerHTML` com dado do usuário — nome de
  categoria vem do Firestore e é entrada não confiável. `esc()` em
  `js/utils.js:44`.
- **Compatibilidade retroativa:** registro antigo sem `categoryId` não pode
  quebrar a tela — é justamente o caso central desta rodada.
- **Competência manda sobre data:** `competenceMonth` agrupa o mês.
- **Responsivo até 360px** — item 5.
- **Só design.** Não reescrever parser, regra de classificação ou projeção de
  parcela. Se algo exigir, **pare e declare como pré-requisito**.
- **Dado financeiro real nunca aparece** em comentário, exemplo ou commit.

---

## 5. Responsivo

- **Acima de 900px:** as duas `.dashboard-row` em `1fr 1fr`. Donut 168px + legenda
  ao lado.
- **481–900px:** `.dashboard-row` vira coluna única; dentro do card de
  distribuição, donut centralizado e legenda **abaixo** dele.
- **Até 480px:** o percentual da legenda (`.lg-pct`) some; sobram nome e valor.
  O detalhe do bloco "Fora de qualquer limite" quebra em duas linhas.
- **Até 360px:** donut 148px. Nada mais some. **Sem scroll horizontal** e sem
  valor truncado — valor monetário em tabela nunca é abreviado.

---

## 6. Estados — nenhum pode cair só no caso feliz

- **Sem gasto no mês:** anel cinza cheio (`#2C2C2C`) + "Sem gastos neste mês".
  É o que `js/dashboard.js:171-181` já faz. **Mantenha**, só confira que continua
  funcionando depois da mudança na legenda.
- **Sem orçamento definido, mas com gasto:** o card **deixa** de mostrar só o
  empty state com 🎯. Passa a mostrar o bloco "Fora de qualquer limite" com o
  total do mês e o convite a definir limites. Hoje ele esconde o gasto inteiro
  atrás de um ícone — é o mesmo erro do problema B, na sua forma extrema.
- **Sem gasto e sem orçamento:** aí sim, empty state como hoje.
- **Carregando:** skeleton de donut (círculo cinza) + 5 linhas de legenda **na
  altura final**, para a página não pular. Use as classes `.skeleton`,
  `.sk-text`, `.sk-title` que já existem em `css/style.css`.
- **Erro de leitura:** o card mantém o título e mostra a mensagem em
  `--text-muted`, **sem número**. Número velho ao lado de dado novo é pior que
  nenhum número.

---

## 7. Critério de pronto

Confira abrindo o app, não só lendo o código:

1. **A identidade fecha:** soma das categorias com limite + "fora de qualquer
   limite" = total de despesas do mês = KPI de Despesas. Some na mão.
2. A mesma identidade fecha na **aba Orçamento**, e o número é idêntico ao do
   Dashboard para o mesmo mês.
3. Mês com tudo classificado e tudo orçado: **nenhum âmbar aparece** — nem na
   legenda, nem no card de orçamento.
4. Mês com lançamento sem categoria: a linha âmbar aparece, a **contagem bate**
   com o que o destino do clique mostra, e o split "N em Gastos · M em Extratos"
   aparece só quando as duas origens existem.
5. Clicar na linha leva à aba certa **já filtrada**. Voltar ao Dashboard e clicar
   de novo continua funcionando (cuidado com listener registrado duas vezes — os
   módulos usam guard de inicialização única, padrão `let _initialized = false`).
6. A pizza continua Chart.js e **nenhuma fatia ficou âmbar**.
7. Evolução em meia largura: 6 rótulos de mês legíveis, sem sobreposição.
8. Em 360px: sem scroll horizontal, sem valor truncado.
9. `node --test test/*.mjs` — **35 testes continuam passando**.
   (`node --test test/` falha com `MODULE_NOT_FOUND`: o Node tenta resolver
   `test` como módulo. É invocação, não teste quebrado.)
10. **Aba Patrimônio intacta** — ela compartilha `.kpi-grid` / `.kpi-card` com o
    Dashboard e o roteiro a marca como "não mexer".
11. Console limpo, sem erro de CSP.

---

## 8. Fora do escopo — não faça

- **Drill-down geral por clique** (clicar em qualquer fatia da pizza para filtrar
  Gastos) é a **rodada 6**. Aqui só a linha "Sem categoria" e os dois links do
  bloco de orçamento são clicáveis, porque são pendências, não navegação.
- **Aging de parcelas e comprometimento futuro** — rodada 5.
- **Fluxo de Caixa** — rodada 4, junto com a remoção de `js/calendario.js`
  (código morto) e de `js/pdf-import.legacy.js`.
- **Categorias "Investimento" e "Investimentos" coexistindo**, com
  `js/extratos.js:441` decidindo o vínculo com patrimônio por
  `includes('investiment')` no **nome** — renomear categoria quebra em silêncio.
  É **pré-requisito de dado, não design**; está registrado no roteiro e não se
  resolve dentro de uma rodada de redesign.

Terminada a implementação, **atualize `ROTEIRO-REDESIGN.md`**: marque a rodada 3
como concluída, registre a conferência e **qualquer desvio deste prompt decidido
durante a execução**, com o motivo.
