# PROMPT — pesquisa de usabilidade e UX em apps de finanças pessoais

Cole o bloco abaixo numa sessão nova, com acesso a busca na web. Ele é
autossuficiente: não presume que a sessão conhece o Radar.

O objetivo **não** é uma lista de boas práticas genéricas. É descobrir o que os
apps de finanças pessoais que dão certo fazem em decisões concretas, e comparar
com o que o Radar faz hoje, para virar uma fila de mudanças.

---

## Contexto: o que é o app avaliado

**Radar Financeiro** — app pessoal de controle financeiro, uso de uma pessoa só
(não é produto comercial). JavaScript puro com ES modules, sem framework e sem
build step, Firebase Auth + Firestore, hospedado na Vercel.

**Onze telas**, agrupadas por horizonte de tempo:

- **Este mês** — Visão do mês (dashboard), Gastos, Receitas, Extratos
- **O que vem** — Fluxo de Caixa, Orçamento
- **Longo prazo** — Metas, Patrimônio
- **Registro** — Timeline, Relatórios, Configurações

**O ciclo de uso real**, que é o que importa avaliar:

1. No começo do mês, importar a fatura do cartão em PDF e o extrato do banco
   (CSV/OFX/PDF). O app lê o arquivo **no navegador** — nada sobe para servidor
   de terceiro — classifica por regras de regex e abre uma tela de revisão.
2. Na revisão, conferir o que o app deduziu. O que ele deduziu fica marcado em
   âmbar; o que ele classificou por regra não recebe marca nenhuma.
3. Durante o mês, conferir Gastos linha a linha e corrigir categoria.
4. Olhar o Fluxo de Caixa para saber em que dia do mês o caixa fica mais
   apertado.

**Decisões de design já tomadas**, que a pesquisa deve testar em vez de repetir:

- **Cor só significa informação.** O chrome é preto, branco e grafites; a ação
  primária é o próprio contraste. Cor na tela é sempre uma coisa: receita
  (verde), gasto (vermelho), inferido pelo app (âmbar), ou série categórica de
  gráfico. Não há azul em nenhum papel.
- **Âmbar significa uma coisa só:** o app deduziu isto e você precisa conferir.
  Linha classificada corretamente não recebe marca. Silêncio é o sinal de que
  está tudo bem.
- **A página não rola.** Cada tela cabe numa dobra; quem rola é a região com
  lista longa (a tabela dentro do card), nunca a página. No celular a página
  rola, porque não há dobra que caiba tudo.
- **Toda tela abre com uma frase** dizendo o que ela responde e o que fazer
  nela, com a ação em negrito.
- **Nunca bloquear o salvamento por pendência.** Importar com categoria faltando
  é permitido; o app conta quantas faltam e deixa salvar assim mesmo.
- **Competência vence data.** Uma compra parcelada pesa no mês da fatura em que
  ela cai, não no mês em que foi comprada.

---

## O que pesquisar

Investigue **apps reais**, com nome e evidência, não categorias abstratas.
Cubra pelo menos: **Mobills, Organizze, Meu Dinheiro, Guiabolso (histórico), Wise,
Nubank, Inter, Itaú, YNAB, Monarch Money, Copilot Money, Lunch Money, Actual
Budget, Firefly III, Maybe Finance**. Inclua os brasileiros de verdade — o
contexto é fatura de cartão, Pix e boleto, que muda o desenho.

Para cada bloco abaixo, responda **o que os apps fazem**, **quem faz diferente e
por quê**, e **o que isso sugere para o Radar**.

### 1. A importação e a revisão do que foi importado

É o momento mais crítico do app e o que mais dá errado.

- Como os apps mostram a diferença entre "eu li isto no arquivo" e "eu deduzi
  isto"? Alguém marca a **procedência** da classificação, ou todos apresentam o
  palpite com cara de fato consumado?
- Revisão em lote (tabela editável) versus uma transação por vez: qual ganha em
  volume de 100+ linhas?
- Como avisam duplicata, e como mostram **contra o quê** a linha bateu?
- Alguém deixa salvar com pendência? Quem bloqueia, bloqueia por quê?
- Regras de classificação: o usuário escreve regex, escolhe de uma lista, ou o
  app aprende sozinho da correção? Qual dá menos trabalho no terceiro mês?

### 2. Parcelamento e cartão de crédito

É o que mais diferencia app brasileiro de app americano.

- Como tratam compra parcelada: uma transação com N parcelas, N transações, ou
  um "contrato" com id próprio? Quem tem entidade de contrato explícita?
- Como mostram "quanto ainda devo neste parcelamento"?
- Como resolvem **competência**: a compra pesa no mês da compra ou no mês da
  fatura? Como explicam isso para quem não é contador?
- A fatura fechada vira uma linha só no fluxo de caixa, ou cada compra desconta
  no dia em que foi feita?

### 3. Projeção e fluxo de caixa

- Quem projeta saldo futuro dia a dia, e como marca visualmente a fronteira
  entre o que já aconteceu e o que é previsão?
- Como comunicam **incerteza** sem poluir? (linha tracejada, faixa, opacidade,
  rótulo)
- Como pedem o saldo inicial, que é o dado que ninguém quer digitar? Alguém
  deduz do mês anterior?
- Que número eles escolhem como "o número que induz decisão"? (saldo hoje,
  menor saldo do mês, quanto sobra, taxa de queima)

### 4. A tela inicial

- Quantos números cabem antes de virar painel de avião? Existe pesquisa ou
  consenso sobre isso?
- O que aparece no **dia 1 do mês**, quando ainda não há receita lançada e
  qualquer conta de "quanto sobra" dá negativo? Como os apps evitam anunciar um
  número assustador e falso?
- Gráfico de pizza de categorias: quem ainda usa, quem abandonou, com que
  argumento?
- Como lidam com a categoria "Outros", que sempre fica grande demais?

### 5. Densidade, dobra e leitura de tabela

- A regra de "caber numa dobra" se sustenta com dados reais, ou os apps deixam
  rolar?
- Cabeçalho de tabela preso, rodapé de total sempre visível, linhas por tela:
  o que é praticado?
- Alinhamento de coluna de valor: alguém usa monoespaçada, ou todos usam
  algarismo tabular?
- Que densidade de linha (altura em px, tamanho de fonte) os apps de
  conferência linha a linha praticam?

### 6. Cor, acessibilidade e tema

- Verde/vermelho para entrada/saída é universal? Como os apps atendem quem não
  distingue as duas cores — forma, sinal, posição?
- Quem faz o chrome sem cor, e quem usa cor de marca na navegação? O que se
  ganha e o que se perde?
- Contraste: os apps passam em WCAG AA nos dois temas? Onde costumam falhar?
- Tema claro e escuro: qual é o padrão hoje em app financeiro, e por quê?

### 7. Celular

- O uso no celular é de **consulta**, não de entrada? Há dado público sobre
  isso?
- O que as barras inferiores carregam, e quantos itens?
- O que os apps cortam primeiro quando a largura aperta — e o que nunca cortam?

### 8. Confiança e explicabilidade

- Como o app explica **de onde veio um número**? Existe "clique e veja a
  origem"?
- Como comunicam que leram o arquivo localmente, sem subir para servidor?
- Como tratam erro de leitura de um bloco: a tela inteira quebra, ou só o bloco?
- Onde colocam o backup/exportação, e como convencem alguém a fazer?

---

## Formato da resposta

1. **Sumário executivo** — no máximo 10 achados, cada um em uma frase, ordenados
   pelo tamanho do efeito sobre o Radar.
2. **Um bloco por seção acima**, com os apps nomeados e o que cada um faz. Cite
   a fonte de tudo que for verificável (documentação, changelog, review, captura
   de tela, artigo). **Marque `[NÃO CONFIRMADO]` o que você não conseguiu
   verificar** em vez de preencher com o plausível.
3. **Tabela de recomendações para o Radar**, com estas colunas:
   `mudança` · `qual problema resolve` · `evidência (quem faz e onde)` ·
   `esforço (baixo/médio/alto)` · `risco` · `conflita com decisão já tomada?`
4. **Seção separada: "o que a pesquisa sugere ABANDONAR"** — decisões atuais do
   Radar que a evidência contraria. Esta seção é a mais valiosa; não a deixe
   vazia por educação, e não a encha por esporte.
5. **Seção separada: "perguntas que a pesquisa não respondeu"** — o que
   continuou incerto e que tipo de evidência resolveria.

## Como quero que você trabalhe

- **Evidência antes de opinião.** Toda recomendação precisa apontar quem faz
  aquilo e onde isso pode ser visto. "É boa prática" sem dono não serve.
- **Não recomende framework, biblioteca nem redesenho total.** O app é
  JavaScript puro sem build step, por decisão. Recomendação que exija React,
  bundler ou dependência nova precisa justificar por que não dá para resolver
  com o que existe.
- **Priorize o que muda decisão**, não o que muda aparência. Uma mudança que
  evita a pessoa importar a fatura no mês errado vale mais que dez ajustes de
  espaçamento.
- **Contexto brasileiro é requisito, não bônus.** Fatura de cartão com
  parcelamento, Pix, boleto e competência de fatura não têm equivalente direto
  nos apps americanos, e é onde o Radar mais pode errar.
- Se um bloco da pesquisa render pouco, diga que rendeu pouco. Preferimos oito
  achados sólidos a vinte e cinco genéricos.
