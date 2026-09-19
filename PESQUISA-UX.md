# Pesquisa de usabilidade — apps de finanças pessoais vs. Radar

Data: 18/09/2026. Método: busca na web, documentação oficial dos apps quando
existe. **Tudo que não deu para verificar está marcado `[NÃO CONFIRMADO]`** —
vários blocos renderam pouco e isso está dito em cada seção.

---

## 1. Sumário executivo — 8 achados, do maior efeito para o menor

1. **O Radar não tem o conceito de "não aprovado", e é o que falta.** YNAB
   separa *importado* de *aprovado*: a transação entra no saldo mas fica com
   pendência explícita até alguém confirmar, com um banner contando quantas
   faltam. No Radar a revisão é um modal que acontece uma vez; depois de salvar,
   o âmbar some e não sobra rastro de "isto o app deduziu".
2. **Os apps que ganham no terceiro mês aprendem da correção, não de regex.**
   Lunch Money cria a regra sozinho quando você troca a categoria (com toggle
   para desligar); Copilot e Monarch aprendem do histórico. O Radar exige ir a
   Configurações escrever a regra — trabalho manual num momento diferente do
   momento da correção.
3. **O parcelamento é a única coisa em que o app brasileiro está à frente do
   americano, e vale copiar do Mobills.** Mobills tem "editar só esta parcela /
   esta e as futuras" e "antecipar parcela". Firefly III **não tem** parcelamento
   (issue aberta #10073). O Radar já cria N transações independentes, que é o
   desenho do Mobills; falta a edição em cascata.
4. **Competência já é vocabulário de mercado no Brasil — dá para nomear.** A
   ajuda do Mobills usa literalmente "Competência (quando o gasto ocorreu)" vs.
   "Caixa (quando o dinheiro saiu)". O Radar pode usar essas duas palavras na
   interface em vez de explicar do zero.
5. **A dobra de 5–7 números está apoiada em evidência; acima disso degrada.** O
   consenso de design de dashboard é 5–7 métricas primárias por tela. A regra
   "não rola" do Radar é compatível, mas o limite real é de *números*, não de
   pixels.
6. **Verde/vermelho sozinho falha WCAG 1.4.1.** A convenção é universal em
   fintech, mas a orientação é explícita: sinal, seta ou parênteses **junto** com
   a cor. O Radar usa cor como canal único na coluna de valor e no gráfico.
7. **Algarismo tabular é o padrão de fato — e o Radar já está certo.** Nenhuma
   fonte recomenda monoespaçada para dinheiro; `lining-nums tabular-nums` é
   descrito como o padrão-ouro de UI financeira. Nada a mudar.
8. **Processamento local é argumento de confiança com frase pronta.** "Runs in
   your browser", "your files never leave your device", mais a dica de conferir
   na aba Network. O Radar faz isso e não diz.

---

## 2. Importação e revisão

**YNAB** — existe um estado `approved` separado do `cleared`. A visão de conta
mostra "N new transactions to import, approve, or categorize" com um botão
"View" que abre uma tabela com coluna dizendo o que falta (approve, categorize,
ou os dois), mais antiga primeiro, com linha de resumo contando. A API expõe
`get_unapproved_transactions` e aprovação em lote. Transação que faz *match* com
uma já lançada à mão deixou de exigir aprovação.
→ **Revisão em lote, tabela editável, contador — é o desenho do Radar.** O que o
Radar não tem é a persistência do estado: lá a pendência sobrevive ao salvamento.

**Lunch Money** — auto-categorização roda **antes** das regras; regras
sobrescrevem. Por padrão, *"Auto-create rule when updating category"* está
ligado: trocar a categoria de uma transação já cria a regra. O app também
**sugere** regras ao longo do tempo.
→ Para o Radar: em vez de mandar escrever regex, oferecer "sempre classificar
'DROGASIL*' como Saúde?" no próprio momento da correção.

**Copilot Money / Monarch** — Copilot aprende passivamente das correções;
Monarch combina aprendizado com regras explícitas por comerciante. Números de
acurácia citados em reviews (95%+) vêm de review comercial, não de fonte
primária — `[NÃO CONFIRMADO]`.

**Actual Budget** — deduplicação em duas camadas: primeiro o `FITID` do OFX/QFX,
e **só se não houver id** procura transação de data próxima, mesmo valor e
*payee* parecido. Há opção de **desligar** a reconciliação no import (PR #2717,
release 24.5.0), e uma tela separada de *merging duplicate transactions*.
→ Duas coisas para o Radar: (a) extrato OFX **tem** `FITID` e o `dedupKey` atual
o ignora — usar o id quando existir é dedupe exato de graça; (b) poder desligar o
dedupe é opção legítima, hoje inexistente.

**Maybe Finance** — "smart rules engine" para categorização, tags e comerciante.
Projeto arquivado sob AGPLv3, seguido pelo fork `Sure`. Detalhe da tela de
revisão `[NÃO CONFIRMADO]`.

**Quem bloqueia salvamento:** não encontrei app que bloqueie. YNAB permite
transação sem categoria (cai em "Uncategorized" e entra no contador). A decisão
do Radar de nunca bloquear **tem respaldo**.

**Guiabolso, Meu Dinheiro, Itaú, Inter:** rendeu pouco. Não achei documentação
pública de tela de revisão de importação. `[NÃO CONFIRMADO]`

---

## 3. Parcelamento e cartão

**Mobills** (documentação oficial): cria automaticamente todas as parcelas,
**distribuídas nas faturas futuras** — ou seja, N transações, não um contrato com
id. Ao editar, pergunta *somente esta despesa* ou *esta despesa e as futuras*.
Permite **excluir parcelas que ainda não entraram na fatura** e **antecipar**
parcelas, escolhendo para qual fatura mandar. Há artigo específico da ajuda:
*"Despesas do cartão de crédito aparecem no dia do vencimento, não no dia da
compra"* — é dúvida frequente o bastante para ter virado artigo.
→ O Radar acerta o modelo (N transações). Falta: editar em cascata, cancelar
parcelas futuras, e a frase de ajuda sobre o dia do vencimento.

**Nubank**: parcela a **fatura** em até 12x com escolha de começar na fatura
atual ou futura; "Meus limites"; "Organizar Gastos" com limite por categoria,
detalhe por categoria e export de PDF.

**Firefly III**: recomenda modelar cartão como **conta de ativo**, não passivo, e
**não suporta parcelamento** — a issue #10073 pede exatamente o caso brasileiro
("comum em muitos países, 3/6/12 parcelas… ver o saldo restante e quantas
faltam"). É a confirmação de que "quanto ainda devo neste parcelamento" é um
número que os apps americanos simplesmente não têm.
→ O card "Contratos em aberto" do `timeline.js` é, por isso, diferencial real do
Radar. Vale promovê-lo, não deixá-lo escondido no grupo Registro.

**"Fatura vira uma linha só no fluxo de caixa":** o artigo do Mobills sobre a
despesa aparecer no vencimento indica que o comportamento padrão dele é a data de
vencimento — mesma escolha do `faturaVencimentoDia` do Radar. Confirmação direta
em outros apps: `[NÃO CONFIRMADO]`.

---

## 4. Projeção e fluxo de caixa

**Bloco fraco.** Não achei fonte primária de app pessoal documentando como marca
a fronteira entre realizado e previsto. O que achei é do mundo corporativo
(rolling forecast; banda de incerteza que **alarga com o prazo**) e um app de
nicho, Centinel, descrito como "projeção dia a dia, de dois meses, de uma conta
corrente" — confirma que a ideia da aba Fluxo de Caixa existe no mercado, mas não
como é desenhada. `[NÃO CONFIRMADO]` para linha tracejada, faixa, opacidade, e
para "alguém deduz o saldo inicial do mês anterior".

Único achado usável: a incerteza cresce com o horizonte, não é constante. Se o
Radar marcar previsão, a marcação deveria ficar mais forte quanto mais longe.

---

## 5. Tela inicial

- **Quantos números:** consenso de 5–7 métricas primárias, justificado por
  memória de trabalho; 3–5 para painel executivo, 7–9 para operacional; acima de
  7, grade de 2 linhas em vez de fileira única. É guidance agregada em blogs de
  dashboard que citam o NN/g — **a citação ao NN/g é de segunda mão**
  `[NÃO CONFIRMADO]`.
- **Pizza:** Monarch oferece **Pie, Breakdown, Trend Bars e Treemap**; o
  "Breakdown" é barra horizontal ordenada da maior para a menor, "para ver o
  maior de relance". Quem tem escolha, oferece a barra ordenada ao lado da pizza.
  Não achei app que tenha **removido** a pizza. `[NÃO CONFIRMADO]`
- **Dia 1 do mês / número falso:** nada encontrado. Bloco vazio.
- **Categoria "Outros":** nada encontrado. Bloco vazio.

---

## 6. Densidade e tabela

- **Algarismo tabular:** `font-variant-numeric: lining-nums tabular-nums` é
  descrito como padrão de UI financeira; "a maioria dos sites financeiros usa
  figuras tabulares por padrão". Alerta útil: muitas fontes aplicam largura
  tabular também à vírgula e ao ponto, o que espaça demais — vale conferir no
  Nunito. Recomendação conhecida: **sempre mostrar o zero final** (54,00) para o
  número não dançar.
- **Monoespaçada para dinheiro:** nenhuma fonte recomenda. O Radar já abandonou.
- **Altura de linha, linhas por tela, rodapé de total fixo:** `[NÃO CONFIRMADO]`
  — não achei medida publicada de app real.

---

## 7. Cor, acessibilidade e tema

- Verde/vermelho é convenção "profundamente entranhada" em UI financeira, e
  quebrá-la gera desconfiança — mas a orientação é explícita: **lucro/prejuízo
  precisa de um segundo canal** (seta, sinal, parênteses) além da cor.
- WCAG 1.4.1: falha qualquer coisa cujo significado suma quando a cor sai —
  inclusive **série de gráfico**. O gráfico de categorias do Radar depende só de
  cor.
- Deuteranopia atinge ~8% dos homens.
- **Chrome sem cor vs. cor de marca na navegação, e conformidade AA dos apps nos
  dois temas:** `[NÃO CONFIRMADO]`.

---

## 8. Celular

- Material Design 3: barra de navegação para **3 a 5 destinos**. Menos que 3, use
  abas; mais que 5, não use barra — os itens colidem e não há espaço para texto
  traduzido.
- O Radar tem **11 telas em 4 grupos**. Num celular, 4 grupos cabem numa barra;
  11 telas não.
- **"No celular é consulta, não entrada" — dado público:** não achei.
  `[NÃO CONFIRMADO]`. Contra-indício: Mobills e Nubank são apps primeiro móveis,
  com entrada manual completa.

---

## 9. Confiança e explicabilidade

- **Processamento local:** o vocabulário estabelecido é "runs in your browser",
  "no upload", "your files never leave your device", com o enquadramento forte —
  não é promessa de proteger o dado, é arquitetura em que o dado nunca é
  coletado. Duas provas que esses sites oferecem: abrir a aba **Network** do
  devtools, ou **desconectar da internet** e ver que a ferramenta continua
  funcionando.
- **"De onde veio este número" / erro isolado por bloco / onde fica o backup:**
  `[NÃO CONFIRMADO]`. Bloco fraco.

---

## 10. Recomendações

| mudança | qual problema resolve | evidência | esforço | risco | conflita? |
|---|---|---|---|---|---|
| Estado "a conferir" que **sobrevive ao salvamento** (campo na transação + contador na sidebar), no lugar do âmbar só no modal | hoje a dedução vira fato no instante em que se salva; ninguém revisita | YNAB: `approved` separado, banner "N to import, approve, or categorize" | médio | contador que nunca zera vira ruído | não — estende o âmbar |
| Ao corrigir a categoria de uma linha, oferecer "sempre classificar assim?" e gravar a regra | regex em Configurações é trabalho no momento errado | Lunch Money: *auto-create rule when updating category*, ligado por padrão, com toggle | médio | regra criada por engano; mitigar com o toggle | não |
| Usar `FITID` do OFX no `dedupKey` quando existir | dedupe heurístico mesmo quando o arquivo traz id único | Actual: id primeiro, heurística só na falta dele | baixo | nenhum — é caminho a mais | não |
| Checkbox "não deduplicar neste import" | quando a heurística erra, hoje não há saída | Actual PR #2717 / release 24.5.0 | baixo | import duplicado por descuido | não |
| Editar parcela em cascata ("só esta" / "esta e as futuras") e cancelar parcelas futuras | corrigir 12 linhas à mão | Mobills, ajuda oficial | médio | escrita em lote no Firestore | não |
| Segundo canal além da cor: sinal `+`/`−` explícito na coluna de valor e rótulo direto no gráfico de categorias | WCAG 1.4.1 | orientação de UI financeira e o próprio SC | baixo | nenhum | **sim, de leve** — "cor significa informação" vira "cor *reforça* informação" |
| Promover "Contratos em aberto" de Timeline para Gastos ou Fluxo | "quanto ainda devo" é número que app nenhum dá | Firefly III #10073 pedindo exatamente isso | baixo | mais um bloco na dobra | não |
| Frase de privacidade na tela de import + "confira na aba Network" | o app faz e não diz | vocabulário estabelecido em ferramentas client-side | baixo | nenhum | não |
| Usar as palavras "competência" e "caixa" na interface | explicar do zero o que já tem nome | ajuda do Mobills usa os dois termos | baixo | jargão para quem não conhece | não |
| Barra inferior no celular com os **4 grupos**, não com 11 abas | 11 destinos não cabem | Material Design 3: 3–5 destinos | médio | navegação em dois toques | não |

---

## 11. O que a pesquisa sugere ABANDONAR

1. **Âmbar que só existe dentro do modal de revisão.** "Silêncio é o sinal de que
   está tudo bem" continua certo *dentro* da revisão, mas o estado morrer no
   salvamento contraria o desenho do YNAB, onde a pendência é **do registro**, não
   da tela. A pendência deveria ser um campo, não um `<tr>`.
2. **"Cor só significa informação" como regra absoluta.** A evidência de
   acessibilidade é direta: cor como canal único falha 1.4.1. Não é caso de
   abandonar a paleta — é caso de aceitar que o significado precisa estar também
   em outro canal, e a cor passa a ser reforço. Para ~8% dos homens a coluna de
   valor do Radar hoje não carrega informação nenhuma.
3. **Regex em Configurações como caminho principal de classificação.** Todos os
   apps que documentam isso (Lunch Money, Monarch, Copilot) movem a criação da
   regra para o momento da correção, ou dispensam a regra. `DEFAULT_RULES`
   continua útil como semente; o que não se sustenta é ela ser o único jeito de
   ensinar o app.
4. **Sidebar de 11 abas no celular.** Não é opinião de layout: é o limite
   publicado do Material Design.

Não sugiro abandonar: o não-bloqueio do salvamento (nenhum app bloqueia), a
revisão em lote (é o que o YNAB faz), N transações por parcelamento (é o que o
Mobills faz), nem o algarismo tabular (é o padrão).

---

## 12. Perguntas que a pesquisa não respondeu

| pergunta | que evidência resolveria |
|---|---|
| Como apps marcam realizado vs. projetado no gráfico de saldo | captura de tela de Centinel, Mobills "previsão" ou Monarch cash flow; ou o app instalado |
| Alguém deduz o saldo inicial do mês anterior | documentação de onboarding de Mobills/Organizze |
| O que aparece no dia 1 do mês, sem receita lançada | uso real no dia 1 — só observação direta resolve |
| Como tratam a categoria "Outros" | fórum de usuários de Mobills/YNAB |
| Celular é consulta ou entrada | dado de uso publicado; não achei nenhum |
| Densidade de linha praticada (px, fonte) | inspeção de DOM dos apps web (Monarch, Lunch Money) |
| Conformidade WCAG AA dos apps nos dois temas | auditoria própria com contrast checker |
| Guiabolso, Meu Dinheiro, Itaú, Inter: telas de importação | apps fechados; só captura de tela ou review com imagem |

Os blocos 4 (projeção), 5 (tela inicial, em parte) e 9 (explicabilidade)
renderam pouco. Estão curtos de propósito.

---

## Fontes

- [Approving and Matching Transactions in YNAB](https://support.ynab.com/en_us/approving-and-matching-transactions-a-guide-ByYNZaQ1i)
- [ynab_get_unapproved_transactions / bulk approve (MCP)](https://glama.ai/mcp/servers/@calebl/ynab-mcp-server/tools/ynab_bulk_approve_transactions)
- [Lunch Money — Rules](https://support.lunchmoney.app/setup/rules) · [Auto-Categorization](https://support.lunchmoney.app/setup/categories/auto-categorization)
- [Actual Budget — Importing Transactions](https://actualbudget.org/docs/transactions/importing/) · [Merging Duplicate Transactions](https://actualbudget.org/docs/transactions/merging/) · [PR #2717](https://github.com/actualbudget/actual/pull/2717) · [Release 24.5.0](https://actualbudget.org/blog/release-24.5.0/)
- [Mobills — Transação parcelada no cartão manual](https://mobills.zendesk.com/hc/pt-br/articles/44243003508123-Como-criar-uma-transa%C3%A7%C3%A3o-parcelada-no-cart%C3%A3o-de-cr%C3%A9dito-manual) · [Antecipar parcelas](https://mobills.zendesk.com/hc/pt-br/articles/4405267061787-Como-antecipar-parcelas-no-cart%C3%A3o-de-cr%C3%A9dito) · [Despesa aparece no dia do vencimento](https://mobills.zendesk.com/hc/en-us/articles/360051942134-Credit-card-charges-appearing-on-the-due-date-not-the-day-of-purchase)
- [Firefly III — Accounts](https://docs.firefly-iii.org/how-to/firefly-iii/finances/accounts/) · [Issue #10073 — installments](https://github.com/firefly-iii/firefly-iii/issues/10073)
- [Maybe Finance](https://openalternative.co/maybe)
- [Monarch — Using Reports](https://help.monarch.com/hc/en-us/articles/21846787088916-Using-Reports)
- [Nubank — Organizar Gastos](https://comunidade.nubank.com.br/t/chegou-o-organizar-gastos-perfeito-para-as-finan%C3%A7as-%F0%9F%A4%91/456471)
- [Color in Financial UI — red/green convention](https://colorarchive.org/guides/financial-ui-color-guide/) · [Understanding WCAG SC 1.4.1](https://www.digitala11y.com/understanding-sc-1-4-1-use-of-color/)
- [Fintech typography — readable money](https://medium.com/design-bootcamp/the-elements-of-fintech-typography-part-1-readable-money-b6c1226acbde) · [MDN font-variant-numeric](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-variant-numeric)
- [Material Design 3 — Navigation bar](https://m3.material.io/components/navigation-bar/guidelines)
- [How Many KPIs Should Be on a Dashboard](https://www.datawirefra.me/blog/how-many-kpis-on-a-dashboard)
- [Client-Side Data Conversion: privacy and security](https://inventivehq.com/blog/client-side-data-conversion-privacy-and-security)
- [Best Personal Cash Flow Forecast Apps (Centinel)](https://www.centinelmoney.com/resources/best-personal-cash-flow-forecast-apps)
