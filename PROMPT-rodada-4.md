# Prompt — rodada 4: Fluxo de Caixa

> Cole este arquivo inteiro numa sessão do Claude Code na raiz do repositório.
> Ele carrega sozinho o contexto: **não presuma que quem lê conhece o projeto.**
> Mockup aprovado em 02/08/2026: `MOCKUP-rodada-4.html` na raiz — abra no
> navegador antes de escrever código. Os dois gráficos e os quatro estados
> (carregando, sem saldo inicial, sem movimento, erro) estão todos lá.
>
> **Dependência:** rodadas 1, 2 e 3 (partes 1 e 2 + correção 3.1a) já estão no ar.
> Esta rodada assume que `splitGastosPorLimite()` e `renderForaDoLimite()`
> existem em `js/utils.js` e que o Dashboard e a aba Orçamento consomem as duas.

---

## 1. O projeto, em cinco linhas

Radar Financeiro: app web de finanças pessoais, **JavaScript puro com ES modules,
sem build, sem npm, sem framework**. `index.html` é o shell único (todas as telas
e modais vivem lá); os módulos em `js/` preenchem via `innerHTML`. Chart.js 4.4 e
PDF.js 3.11 vêm de CDN como globais (`Chart`, `pdfjsLib`), já refletidos na CSP
de `vercel.json:24`. Firebase Auth + Firestore, acessado só via `window._FB`
através dos helpers de `js/db.js`. Estado global em `state`, exportado de
`js/utils.js`. Tema escuro; tokens no `:root` de `css/style.css`.

**A aba "Fluxo de Caixa" é servida por `js/saldos.js`**, não por
`js/calendario.js`: `js/app.js:29` faz `calendario: () => import('./saldos.js')`.
O ponto de entrada é `renderCalendario()`, que só chama `renderSaldos()`.

**Esta rodada mexe em:** `js/saldos.js` (reescrita da tela), `js/utils.js`
(helper novo + estado novo), `js/db.js` (leitura/escrita das configurações de
fluxo), `js/configuracoes.js` (campo de dia de vencimento), `js/dashboard.js` e
`js/orcamento.js` (só a troca pelo helper único do item 3.1), `css/style.css`,
`css/components.css` e `index.html` (shell da aba). Mais duas remoções (item 3.2).

---

## 2. O que está errado hoje

Abra `js/saldos.js` antes de ler o resto.

**A tela gasta 31 linhas × 7 colunas para dizer três coisas.** Duas das sete
colunas são constantes ou irrelevantes ao número que a tabela existe para
produzir:

- **"Diário"** (`saldos.js:186-188`) escreve `totalBudget / daysInMonth` em
  **todos os dias**. Trinta e uma repetições do mesmo valor.
- **"Invest."** é declaradamente informativa e **não entra no saldo**
  (`saldos.js:10` e `:63`). Uma coluna que não altera a última coluna, dentro de
  uma tabela cuja razão de existir é a última coluna, é convite a somar errado.

**O saldo começa do zero** (`saldos.js:12` e `:54`). Isto não é um detalhe de
apresentação: significa que a coluna "Saldo" **não é saldo**, é fluxo acumulado
do mês. Marcar "o pior dia" a partir de um zero fictício exibiria em vermelho um
número que não corresponde a dinheiro nenhum.

**A fatura do cartão cai no dia da compra, não no do vencimento.**
`saldos.js:147-162`: a pertinência ao mês vem de `competenceMonth` (correto), mas
o dia vem de `tx.date.slice(8,10)` — o dia da **compra**. Uma parcela comprada em
15/01 com competência em maio aparece no dia 15 de maio. A fatura, porém, sai do
caixa numa data só. Com dez parcelas espalhadas pelo mês, o "menor saldo" pode
apontar o dia errado.

**Parcela projetada e lançamento efetivo aparecem somados na mesma célula, sem
distinção.** Isso contraria uma restrição inegociável do roteiro que já está
valendo em todas as outras telas (a aba Gastos tem `.tag-projetada` desde antes
do redesign).

**Três violações de decisões já fechadas nas rodadas 2 e 3:**

- `--gold` decorativo na coluna Invest. (`saldos.js:88` e `:113`). `--gold` e
  `--warning` são **o mesmo hex** (`#fbbf24`, `style.css:40` e `:44`); a rodada 3
  tirou o dourado do Dashboard exatamente para o âmbar não ter dois significados.
- Âmbar em `saldo < 100` (`saldos.js:77`). Desde a rodada 2, âmbar significa
  "dado deduzido / exige ação" (`.mark-inferido`). Saldo baixo é **fato**, não
  pendência, e não há nada a corrigir na tela.
- Emoji nos cabeçalhos (`💳 Cartão`, `📈 Invest.`, `saldos.js:99` e `:101`). A
  rodada 3 os removeu dos KPIs por não carregarem informação.

---

## 3. O que construir

### 3.1 Helper único de "categoria de investimento" — faça isto primeiro

A mesma regra está escrita **três vezes, em duas implementações diferentes**:

- `js/dashboard.js:24` (`getInvestCatIds`): `id.includes('investiment') || name.includes('investiment')`
- `js/orcamento.js:16`: `(c.id + c.name).toLowerCase().includes('investiment')`
- `js/saldos.js:126`: idem à de `orcamento.js`

Hoje dão o mesmo resultado, mas é o padrão de "duas verdades sobre o mesmo mês"
que a rodada 3 eliminou ao criar `splitGastosPorLimite()`.

**Faça:** exporte `getInvestCatIds(categories = state.categories)` de
`js/utils.js`, com a lógica de `dashboard.js` (campos separados, não
concatenados — concatenar pode casar através da fronteira entre os dois campos).
Troque os três pontos de uso. `js/utils.js` **não pode importar nenhum outro
módulo do projeto** (dependência circular, ver comentário em `js/utils.js:1-4`);
como o helper só lê `state` e o argumento, isso é respeitado.

**Critério:** depois da troca, o KPI de Despesas do Dashboard, o total da aba
Orçamento e o total de saídas do Fluxo de Caixa continuam idênticos para o mesmo
mês. É a identidade da rodada 3 e ela não pode se mover nesta rodada.

### 3.2 Remoção de código morto

Verificado em 02/08/2026: **nenhum arquivo importa** `js/calendario.js` nem
`js/pdf-import.legacy.js`. Confirme você mesmo antes de apagar
(`grep -rn "calendario\.js\|pdf-import\.legacy" --include=*.js --include=*.html .`)
e então remova os dois. `js/pdf-import.legacy.js` ainda referencia
`#pdf-info-text`, elemento que a rodada 2 removeu do `index.html` — ele quebraria
se alguém o carregasse. Atualize o mapa de arquivos de `CLAUDE.md`.

### 3.3 Pré-requisito de dado — saldo inicial e dia de vencimento

Sem isto o resto da rodada não tem sentido. **Dois campos, um documento.**

Use a subcoleção **`settings`, que já existe nas regras**
(`firestore.rules:116-118`, `allow read, write: if isOwner(uid) && verified()`) e
que **nenhum módulo usa hoje**. Assim esta rodada **não exige alterar nem
republicar `firestore.rules`** — o que importa, porque a publicação das regras no
console do Firebase é um item aberto do `RELATORIO-AUDITORIA.md` que não dá para
verificar pelo código.

Documento: `users/{uid}/settings/fluxo`

```
{
  saldoInicial: { "2026-08": 1240.00, "2026-09": 847.30 },  // por mês, em reais
  faturaVencimentoDia: 10                                    // 1–28, ou null
}
```

- Em `js/db.js`: carregue em `loadAllData()` (junto do `Promise.all` existente,
  com `.catch(() => null)` como já é feito para `rules`) para
  `state.fluxoConfig = { saldoInicial: {}, faturaVencimentoDia: null }`. Escreva
  com um `saveFluxoConfig(patch)` que faz merge e atualiza o `state` local em
  seguida, como fazem `saveBudgets`/`saveTx`.
- **Compatibilidade retroativa:** documento ausente, campo ausente ou mês ausente
  → tratados como "não definido", **nunca como zero**. A distinção importa: zero
  é um saldo inicial legítimo; ausente aciona o estado do item 6.2.
- `faturaVencimentoDia` limitado a **1–28** — 29, 30 e 31 não existem em todo mês
  e a regra de "último dia válido" não vale a pele aqui. Fora da faixa, `null`.
- **Não** entra no backup/restore desta rodada (`js/db.js`, `ALLOWED_COL_NAMES`
  na linha 471 e `WIPABLE_COLLECTIONS` na 388 seguem como estão). Configuração
  não é dado financeiro e ampliar a superfície do restore é risco fora do escopo.
  Registre isso como pendência conhecida no roteiro.

**Onde a usuária edita:**

- **Saldo inicial:** campo na própria aba Fluxo de Caixa, no cabeçalho, editável
  inline (`input` numérico + salvar no `blur`/`Enter`, com `toast()` de
  confirmação). É onde o número é olhado; mandar para Configurações a cada mês
  seria atrito mensal. **Herda por padrão:** se o mês anterior tem saldo inicial
  **e** movimentos, ofereça o fechamento dele como valor sugerido — sugerido,
  não gravado em silêncio.
- **Dia de vencimento da fatura:** `js/configuracoes.js`, junto de
  `fluxo_billing_offset`, que é vizinho conceitual (offset de **competência**;
  este é dia de **caixa** — deixe claro na label que são coisas diferentes).

### 3.4 Os três KPIs

Acima do gráfico, grid `1fr 1.35fr 1fr`. O do meio é o hero, em
`--bg-card-raised`, porque é o único que induz decisão.

| KPI | Valor | Sublinha |
|---|---|---|
| Saldo inicial de {mês} | `state.fluxoConfig.saldoInicial[month]` | `Fechamento de {mês anterior}` quando herdado; senão `Definido manualmente` |
| **Menor saldo do mês** | mínimo da série diária | `no dia {D} · {contexto}` |
| Projeção para {último dia}/{MM} | saldo do último dia | `inclui R$ X projetados`, com `.mark-inferido` |

- **Contexto da sublinha do hero**, nesta ordem de precedência:
  1. mínimo negativo → `fica negativo por N dias, até a entrada do dia D`
     (ou `e não volta ao positivo dentro do mês`, se não voltar);
  2. mínimo positivo com entrada logo depois → `véspera da entrada do dia D`;
  3. sem nada disso → só `no dia {D}`.
- **Negativo em `--danger`** no valor do hero. Diferente do Dashboard, aqui
  vermelho é permitido em qualquer mês: saldo negativo é fato aritmético sobre
  dado existente, não a "aritmética de dado faltando" que a rodada 3 proibiu.
- **`inclui R$ X projetados` só aparece se X > 0**, e X é a soma dos
  `isProjected === true` do mês (ausente = `false`, registro antigo).
- Sem emoji. Sem `--gold`. Valores em `var(--font-mono)`.

### 3.5 O gráfico do saldo diário

Chart.js `line`, canvas, altura 230px (190px em ≤480px). **Chart.js não resolve
`var(--…)`: cores em HEX literal no JS** — já houve regressão por isso. O mockup
traz o objeto de configuração inteiro; copie de lá e adapte.

- **Dois datasets sobre a mesma série:** efetivado (sólido, `#3982f7`) até o dia
  de hoje; projetado (tracejado `[5,4]`, mesma cor) de hoje em diante. Os dois
  **compartilham o ponto de hoje** para não abrir buraco na linha.
- **Mês encerrado:** tudo sólido (não há futuro). **Mês futuro:** tudo tracejado.
- **Linha do zero em `#f87171`**, via `scales.y.grid.color` condicional
  (`c.tick.value === 0`), `lineWidth` 1.5. É o que faz "cruzou o zero" virar
  forma em vez de célula a caçar.
- **Ponto do mínimo** como terceiro dataset de um ponto só, `pointRadius: 4.5`,
  `pointBackgroundColor: '#f87171'`, borda `#161616`.
- `pointRadius: 0` nos dois datasets de linha, `tension: 0`, `legend: false`,
  tooltip `mode: 'index'` filtrando `raw !== null`.
- **Ticks do eixo X esparsos** (dias 1, 5, 10, 15, 20, 25 e último) — 31 rótulos
  não cabem nem no desktop. Eixo Y em `k` com separador brasileiro, exceto o
  zero, que sai como `0`.
- **`destroy()` da instância anterior antes de recriar**, como `dashboard.js` já
  faz com `chartCategorias`/`chartEvolucao`. Trocar de mês não pode empilhar
  instância.

### 3.6 A tabela — só dias com movimento

- **Colunas:** Dia · Movimento · Entradas · Saídas · Saldo. Cinco, não sete.
- **"Diário" sai da tabela** e vira nota no cabeçalho:
  `Referência de orçamento: R$ X/dia`. Mesmo cálculo de hoje
  (`totalBudget / daysInMonth`), um lugar só.
- **"Invest." sai da tabela** e vira rodapé:
  `Investido no mês (fora do saldo): R$ X`. O parêntese é obrigatório — é ele
  que impede a soma errada.
- **Só dias com movimento**, mais o dia 1 (saldo inicial) e o dia de hoje quando
  cai no mês exibido. Contador no cabeçalho:
  `N dias sem movimento omitidos`. Sem o contador, some informação em silêncio.
- **Dia com mais de um movimento:** uma linha por dia, com a descrição do maior
  valor e `+N` para o resto; o saldo é o do fim do dia. Não invente linha por
  lançamento — isso traria de volta a densidade que a rodada existe para cortar.
- **Linha do mínimo:** fundo `--danger-dim` e tag `menor saldo`. **Uma só** — se
  houver empate, a primeira ocorrência.
- **Linha de hoje:** fundo `rgba(62,194,252,.07)`, dia em `--accent-bright` e
  peso 700. Não use magenta (hoje é `rgba(192,24,136,.10)` em `saldos.js:82`):
  magenta é acento de série categórica, não estado de linha.
- **Projetado:** separador `A partir daqui, projetado` (linha de tabela sem
  borda, texto em `--text-muted`, caixa alta pequena) e `.tag-projetada` com
  `N/M` na linha. `.tag-projetada` **já existe** em `css/components.css:105` —
  reuse, não crie.
- **Fatura do cartão:** linha única no `faturaVencimentoDia`. Se ele for `null`,
  caia no comportamento atual (dia da compra) e marque a nota do cabeçalho com
  `.mark-inferido` dizendo que o vencimento não está definido, com link para
  Configurações. **Nunca bloqueie a tela por causa disso.**
- **Valores monetários em `var(--font-mono)`, alinhados à direita**, com
  `font-variant-numeric: tabular-nums`. Duas casas e separador brasileiro, sempre
  — a abreviação `k` só vale para o eixo do gráfico, nunca dentro da tabela.
- **`tfoot`** com Total de entradas, total de saídas e saldo final.

### 3.7 Cores — o que sai

- **`--gold` sai da aba inteira.** O investido do rodapé vai para
  `--text-secondary`. `.kpi-value.gold` continua no CSS (não é assunto desta
  rodada), só não é mais usado aqui.
- **Âmbar sai do saldo.** Remova a faixa `saldo < 100` de `_saldoStyle`
  (`saldos.js:77`). Âmbar nesta aba passa a significar **só** `.mark-inferido`:
  vencimento de fatura não definido e projeção que inclui parcela não conferida.
- **Vermelho só para saldo negativo**, que é fato verificado.
- **Emoji fora** dos cabeçalhos e dos rótulos.

---

## 4. Restrições inegociáveis

- **Idioma:** pt-BR.
- **Sem build.** ES modules nativos, sem framework, sem bundler, sem npm.
  Nenhuma biblioteca nova — o que esta rodada precisa, Chart.js já faz.
- **Chart.js é canvas** e não resolve CSS variable: HEX literal no JS.
- **`esc()` em todo HTML** montado a partir de dado do Firestore ou de arquivo
  importado — descrição de lançamento vem de PDF/CSV/OFX e é entrada não
  confiável. Isto inclui a coluna "Movimento".
- **Só as cores do `:root`** de `css/style.css`. Precisa de tom novo → proponha
  como token, não use inline.
- **Raio:** `--radius-md` (10px) card, `--radius-sm` (6px) controle. Sem valores
  intermediários.
- **Nada de dupla contagem.** `type: 'transfer'` fica fora de entrada e de saída.
  A entrada vem **só** de `state.incomes` (`saldos.js:165-173` explica: extrato
  já é espelhado lá por `extratos.js`); de `state.extratoTransactions` só entram
  `type === 'expense'`. **Não mexa nessa divisão** — ela está certa e é frágil.
- **Competência manda sobre data** para decidir o mês (`isOfMonth`); `date` serve
  só para posicionar o dia. Não misture.
- **Parcela projetada visualmente distinta** do efetivo — é o ponto do item 3.6.
- **Compatibilidade retroativa:** registro sem `isProjected`, mês sem saldo
  inicial e documento `settings/fluxo` inexistente não podem quebrar a tela.
- **Dado financeiro real nunca aparece** em exemplo, comentário ou commit.
- **Nenhuma credencial** em código.
- **Comentários em português explicando o porquê**, não o quê — é a convenção do
  repositório e o motivo de `saldos.js:135-146` ser legível hoje. **Preserve o
  comentário sobre competência × data e o sobre não duplicar entradas**: os dois
  registram armadilhas reais.

---

## 5. Responsivo

Declare e teste em **360px**, além de 480 e 900.

- **≤900px:** KPIs em `1fr 1fr`, hero ocupando a linha inteira (`grid-column: 1/-1`).
- **≤480px:** KPIs empilham, hero primeiro. Gráfico a 190px. A coluna
  "Movimento" some (`.col-desc { display: none }`) — sobram Dia, Entradas,
  Saídas, Saldo, todas em mono. As tags de parcela migram para junto do valor.
- **Nenhum scroll horizontal em 360px** e **nenhum valor monetário truncado**.
  Hoje a tabela tem `min-width: 720px` (`saldos.js:93`) e força scroll no
  celular — isso precisa desaparecer, não ser escondido.
- `.mark-inferido` é `white-space: nowrap` (certo para rótulo curto de tabela).
  Se você usar a marca numa frase inteira, escope um `white-space: normal` como
  a rodada 3 fez em `.kpi-hero .mark-inferido` — **sem tocar** na regra global,
  que os modais de importação usam.

---

## 6. Estados — nenhum pode cair só no caso feliz

Os quatro estão desenhados no mockup.

1. **Carregando:** skeleton dos três KPIs + bloco do gráfico. Reuse os helpers de
   skeleton de `js/utils.js`.
2. **Sem saldo inicial definido:** os KPIs de mínimo e de projeção **não são
   exibidos**, porque sem a abertura eles não são saldo. No lugar, o card com
   `Definir saldo inicial` e a explicação. O gráfico e a tabela **continuam
   aparecendo** — o fluxo do mês é informação verdadeira por si.
3. **Sem movimento no mês:** empty state com `Ir para Extratos`.
4. **Erro:** os KPIs mantêm o último valor válido e só o corpo troca pela
   mensagem, com botão de recarregar — mesmo padrão de `_guard()` em
   `js/dashboard.js:233`. **Erro de leitura não pode deixar número velho ao lado
   de dado novo sem aviso.**

---

## 7. Critério de pronto

Conferir **no app**, não no código. Servidor estático e `state` sintético
injetado pelo console é aceito (foi como as rodadas 2 e 3 foram conferidas);
descarte o harness no fim e não o comite.

1. **O contrato da rodada 3 continua fechando.** Para o mesmo mês:
   `Σ categorias com limite + fora de qualquer limite = total de despesas =
   KPI de Despesas do Dashboard = total da aba Orçamento`. Confira **depois** de
   trocar os três `investIds` pelo helper único. Este item é o motivo de o
   item 3.1 vir primeiro.
2. **Aritmética do fluxo:** `saldo inicial + Σ entradas − Σ saídas = saldo do
   último dia`, e esse valor é exatamente o KPI de projeção. Investimento **não**
   entra na conta. `transfer` **não** entra na conta.
3. **O mínimo é o mínimo:** o dia marcado no gráfico, o dia da linha destacada e
   o dia citado na sublinha do hero são o mesmo. Testar com empate e com mínimo
   no dia 1.
4. **Mês que cruza o zero:** linha vermelha do zero visível, valor do hero em
   `--danger`, contagem de dias negativos correta.
5. **Mês sem saldo inicial:** dois KPIs somem, o card de ação aparece, gráfico e
   tabela seguem, **nenhum número enganoso na tela**.
6. **Mês futuro:** série inteira tracejada, sem valor negativo inventado.
   **Mês encerrado:** série inteira sólida, sem linha "hoje".
7. **Vencimento de fatura `null`:** cai no dia da compra, com `.mark-inferido`
   no cabeçalho e link para Configurações. Definido: uma linha só, no dia certo,
   e o mínimo se move para o dia correto.
8. **Projetado distinto:** separador presente, `.tag-projetada` nas linhas,
   trecho tracejado no gráfico, `inclui R$ X projetados` no KPI. Mês sem parcela
   projetada: nada disso aparece.
9. **Persistência:** saldo inicial editado inline sobrevive a `F5` e a troca de
   mês; mês vizinho não é afetado. Dia de vencimento idem.
10. **Troca de mês repetida** (ida e volta 5×): nenhuma instância de Chart
    empilhada, nenhum listener duplicado (guard `_initialized` por módulo, como
    o resto do projeto), console limpo.
11. **360px:** sem scroll horizontal, sem valor truncado, gráfico legível.
12. **Zero `--gold`, zero âmbar fora de `.mark-inferido`, zero emoji** na aba.
13. **`grep -rn "calendario\.js\|pdf-import\.legacy"` não retorna nada** além do
    histórico do git.
14. **`node --test test/*.mjs` continua em 35/35** (ou mais, se você adicionar).
    **Adicione teste** para o cálculo da série diária e para a busca do mínimo:
    são funções puras se você as escrever recebendo argumentos, e é a parte que
    silenciosamente erra.
15. **Console sem erro de CSP.** Nada de novo em `vercel.json`.
16. **Regressão:** Dashboard, Orçamento e Patrimônio inalterados. Patrimônio
    compartilha `.kpi-grid`/`.kpi-card` com o Dashboard e o roteiro o marca como
    "não mexer" — **use classes novas (`.fx-*`) para os KPIs desta aba**, não
    reaproveite `.kpi-card`.

---

## 8. Fora do escopo — não faça

- **Não reescreva parser, regra de classificação nem a projeção de parcela.**
  Esta é uma rodada de design; dependência disso vira pré-requisito declarado.
- **Não mexa em `js/extratos.js`, `js/pdf-import.js` nem em `js/parsers/`.**
- **Não altere `firestore.rules`.** O item 3.3 foi desenhado para caber na regra
  `settings` que já existe, justamente para não depender de republicação.
- **Não amplie backup/restore** para `settings` (item 3.3).
- **Não crie aba nova.** Decisão fechada do roteiro.
- **Não toque na aba Metas nem na tabela de Patrimônio.**
- **Não resolva** a coexistência de "Investimento"/"Investimentos" como
  categorias distintas. É pré-requisito de dado conhecido, registrado no roteiro,
  e o helper do item 3.1 apenas preserva o comportamento atual.
