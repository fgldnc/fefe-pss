# PROMPT — parte 2: inventário de funções, arquitetura de abas e desenho novo do zero

Cole o bloco abaixo numa sessão nova, aberta na pasta do projeto
(`C:\Users\fefe\Downloads\github\fefe-pss`). Ele é autossuficiente.

**O que esta rodada NÃO é:** não é continuação do redesign anterior. O desenho
atual deve ser desconsiderado por inteiro — paleta, tipografia, gráficos,
agrupamento de abas, tudo. O que fica de pé é o que o app **faz**.

---

## Parte 0 — o que preservar e o que jogar fora

Antes de qualquer coisa, entenda a divisão. Ela é a regra desta rodada.

### Jogue fora sem cerimônia (é decisão de gosto, e o dono quer refazer)

- A paleta inteira. Hoje o chrome é preto/branco/grafite, sem azul, com cor só
  para receita/gasto/inferido. **Essa regra está revogada nesta rodada.** Pode
  haver cor de marca, pode haver azul, pode haver gradiente — se você defender.
- A tipografia (hoje Nunito) e toda a escala de tamanhos.
- A regra "a página não rola, cada tela cabe numa dobra".
- O agrupamento das abas em quatro grupos por horizonte de tempo.
- O estilo dos gráficos (Chart.js cru, cores lidas de `getComputedStyle`).
- Os arquivos `ROTEIRO-REDESIGN.md`, `PROMPT-rodada-*.md`, `MOCKUP-*.html` e a
  pasta `redesign/` — são história da rodada anterior. **Leia se quiser saber o
  porquê de alguma decisão, mas não se sinta obrigado a herdar nenhuma.**
- As seções do `CLAUDE.md` chamadas "Vocabulário visual…", "Regras de interface
  que valem em toda tela" e "Decisões da rodada A8" — são o desenho antigo.

### Preserve, porque é arquitetura e não gosto

Isto não é conservadorismo estético; é o que quebra o app se mudar.

1. **JavaScript puro com ES modules. Sem framework, sem bundler, sem build
   step, sem `npm install`.** Os módulos se importam por caminho relativo fixo.
   Qualquer proposta que exija React, Vue, Tailwind por build, Sass ou um passo
   de compilação está fora. Tailwind via CDN também está fora (o `script-src` da
   CSP em `vercel.json` não o inclui).
2. **Chart.js 4.4.0 e PDF.js 3.11.174 vêm de CDN como globais** (`Chart`,
   `pdfjsLib`), e os hosts estão travados na CSP em `vercel.json`. Trocar de
   biblioteca de gráfico **exige editar a CSP junto** — e justificar por que
   Chart.js não resolve.
3. **Fonte via `fonts.googleapis.com`** — conferir se o `style-src`/`font-src`
   da CSP permite antes de propor uma fonte nova.
4. `state` global exportado de `js/utils.js`, mutado por todos os módulos.
5. `esc()` obrigatório em toda interpolação de `innerHTML`.
6. Cada aba exporta uma `render*()` sem argumentos, registrada em `TAB_MODULES`
   (`js/app.js`), carregada por `import()` dinâmico. `js/utils.js` não importa
   nenhum outro módulo do projeto (dependência circular).
7. Firestore só via `window._FB`, através dos helpers de `js/db.js`.
8. **As regras de negócio.** Competência de fatura, tolerância de parcela,
   deduplicação, `getInvestCatIds()`, os três critérios de competência em
   `db.js`. Estão catalogadas na seção "Decisões de negócio escondidas em
   números literais" do `CLAUDE.md`. Redesenho de tela não pode alterar nenhuma.

---

## Parte 1 — inventário funcional (olhe só o que o app faz)

Leia o código **ignorando a aparência**. Objetivo: saber exatamente que
capacidades existem hoje, independentemente de em que aba elas estão.

Onde olhar:

- `index.html` — shell único: todas as 11 telas, todos os 9 modais e o `<tbody>`
  de cada tabela vivem lá. Abas: `dashboard`, `gastos`, `receitas`, `extratos`,
  `calendario` (rotulada "Fluxo de Caixa"), `orcamento`, `metas`, `patrimonio`,
  `timeline`, `relatorios`, `configuracoes`.
  **Exceção:** a aba Configurações é um `<section>` vazio de propósito — é
  montada inteira por `js/configuracoes.js`.
- `js/` (~9.900 linhas no total com CSS). Um módulo por aba, mais
  `app.js` (bootstrap, roteamento, navegação de mês, command palette Ctrl/Cmd+K,
  onboarding), `db.js` (699 linhas — todo o Firestore, backup/restore),
  `utils.js` (535 — `state`, helpers, motor de insights), `pdf-import.js`
  (982 — fatura de cartão em PDF), `extratos.js` (723 — importação de extrato) e
  `js/parsers/` (CSV, OFX, PDF de extrato, layout de PDF).
- `test/` — os testes existentes dizem quais funções puras já estão fixadas.
- `CLAUDE.md` — seção "Mapa de arquivos" e "Decisões de negócio".

**Entregue uma tabela de capacidades**, uma linha por função real do app, com
estas colunas:

`capacidade` · `onde vive hoje (aba + arquivo:linha)` · `é entrada de dado,
consulta, ou configuração?` · `com que frequência a pessoa usa (mensal, no
import, raramente, uma vez)` · `depende de qual outra capacidade` · `é
descobrível hoje?`

Regras para essa tabela:

- **Capacidade, não tela.** "Editar o limite de orçamento de uma categoria" é
  uma linha; "aba Orçamento" não é.
- Inclua o que está escondido: command palette, atalhos `data-goto` entre abas,
  backup/restore, wipe de coleção, offset de competência em `localStorage`,
  `faturaVencimentoDia`, vínculo ativo→meta, reconciliação de parcela projetada.
- **Marque o que é funcionalidade morta ou quase** — coisa que existe no código
  e que ninguém usaria duas vezes. Dizer "isto pode sumir" é resultado válido e
  desejado.
- Se duas abas fazem a mesma coisa com nomes diferentes, diga.

---

## Parte 2 — arquitetura de abas, do zero

Com a tabela na mão, **esqueça que existem 11 abas** e proponha a distribuição.

O ciclo de uso real, que é o critério:

1. No começo do mês, importar a fatura do cartão em PDF e o extrato do banco
   (CSV/OFX/PDF). O app lê o arquivo **no navegador**, classifica por regras e
   abre uma tela de revisão.
2. Na revisão, conferir o que o app deduziu.
3. Durante o mês, conferir gastos linha a linha e corrigir categoria.
4. Olhar o fluxo de caixa para saber em que dia o caixa aperta.

Tudo o mais é secundário. Uso de uma pessoa só, não é produto comercial.

**Entregue duas ou três arquiteturas alternativas** — não uma. Para cada uma:

- o mapa de navegação (quantos destinos de primeiro nível, o que fica em segundo
  nível, o que vira modal, o que vira seção dentro de outra tela);
- que capacidades foram fundidas, movidas ou eliminadas, citando a linha da
  tabela da Parte 1;
- o que essa arquitetura torna **mais rápido** e o que torna mais lento;
- quantos cliques até cada um dos quatro passos do ciclo acima.

Pelo menos uma das alternativas deve ser agressiva — reduzir bastante o número
de destinos de primeiro nível. Material Design 3 recomenda **3 a 5 destinos**
numa barra de navegação, e o app tem 11 telas; isso é um problema real no
celular e está registrado em `PESQUISA-UX.md`.

Depois **recomende uma**, e diga o que te fez escolhê-la.

Restrições técnicas do roteamento: `TAB_MODULES` e `switchTab()` em `js/app.js`
mapeiam `data-tab` → módulo. Fundir abas significa fundir módulos ou fazer um
módulo renderizar duas seções; ambos são possíveis sem build step. Diga qual
caminho cada proposta exige.

---

## Parte 3 — o desenho novo

Agora o visual, do zero. **Justifique cada escolha**; "achei bonito" não é
justificativa, mas "bonito" é objetivo legítimo desta rodada e não precisa ser
disfarçado de funcional.

### Paleta

- Proponha a paleta completa em tokens CSS, com os dois temas (claro e escuro) e
  os mesmos nomes de token nos dois. Escuro é o padrão hoje; pode mudar se
  defender.
- Diga o que cada cor **significa** — e se a resposta for "nada, é decoração",
  diga isso também, é uma escolha válida.
- Confira contraste WCAG AA (4.5:1 para texto, 3:1 para elemento gráfico) nos
  dois temas e mostre os números. Isto não é opcional.
- Receita/gasto em verde/vermelho é convenção entranhada em fintech, mas cor
  como canal único falha WCAG 1.4.1 — proponha o segundo canal (sinal, seta,
  parênteses, posição).

### Tipografia

- Uma ou duas famílias, do Google Fonts, com fallback real na stack.
- Escala de tamanhos e pesos, dita por inteiro.
- Números: `font-variant-numeric: lining-nums tabular-nums` é o padrão de UI
  financeira e resolve o alinhamento da coluna de valor sem monoespaçada.
  Confira se a fonte escolhida tem figuras tabulares de verdade — muitas não
  têm, e algumas aplicam largura tabular também à vírgula, o que espaça demais.

### Gráficos

O app tem hoje: rosca de categorias e barras de evolução (Dashboard), curva de
saldo diário (Fluxo de Caixa), aportes por mês (Patrimônio).

- Proponha o tratamento visual de cada um: paleta categórica, grade, eixos,
  rótulos, tooltip, estado vazio.
- **Chart.js pinta em canvas e não resolve `var(--…)`** — as cores precisam vir
  de `getComputedStyle` no momento de montar o gráfico, e o gráfico precisa ser
  refeito quando o tema muda. HEX fixo no código é regressão conhecida.
- Série de gráfico distinguida só por cor falha WCAG 1.4.1. Rótulo direto,
  ordem, ou padrão de traço.
- Diga o que você faria com a categoria "Outros", que sempre fica grande demais,
  e com o gráfico de rosca — `PESQUISA-UX.md` tem o que a pesquisa achou sobre
  isso (Monarch oferece barra horizontal ordenada ao lado da pizza).

### Layout

- Grade, espaçamento, densidade de linha de tabela (altura em px e tamanho de
  fonte), raio de borda, sombra, estados de foco.
- Decida se a página rola ou não, e **defenda a decisão** — a regra antiga era
  "não rola", e ela está revogada até você reafirmá-la com argumento.
- Cabeçalho de tabela preso, rodapé de total, quantas linhas cabem.
- O que acontece abaixo de 768px, e o que é cortado primeiro.

---

## Parte 4 — entregáveis

1. **`INVENTARIO-FUNCOES.md`** — a tabela da Parte 1, mais a lista do que pode
   sumir.
2. **`ARQUITETURA-v2.md`** — as alternativas da Parte 2, a recomendação, e o que
   cada uma custa em `js/app.js` e `index.html`.
3. **Mockups HTML estáticos** numa pasta nova (`redesign-v2/`), um arquivo por
   tela da arquitetura recomendada, **abríveis direto no navegador, sem servidor
   e sem dados reais** — dados fictícios embutidos. É assim que a rodada
   anterior trabalhou (`redesign/03-*.html`) e funcionou.
4. **`DESIGN-SYSTEM-v2.md`** — tokens, tipografia, componentes, com a tabela de
   contraste.

**Não altere nenhum arquivo de `js/`, `css/` ou o `index.html` nesta rodada.**
Ela é de proposta. A implementação é uma sessão separada, depois que o dono
escolher a arquitetura.

---

## Como quero que você trabalhe

- **Leia o código antes de opinar.** Proposta de arquitetura que não cita
  `arquivo:linha` da capacidade que está movendo não serve.
- **Duas ou três alternativas, não uma.** Alternativa única é decisão
  disfarçada de análise.
- **Diga o que deve sumir.** O app tem 11 telas para uma pessoa só; a chance de
  todas se justificarem é baixa. Essa é a parte mais valiosa da rodada.
- **Bonito é requisito explícito nesta rodada.** O dono está pedindo paleta mais
  bonita, fonte mais bonita, gráfico mais bonito, layout mais bonito. Não
  transforme isso em austeridade funcional por reflexo — mas também não sacrifique
  legibilidade de número, que é a razão de ser do app.
- **Contexto brasileiro é requisito:** fatura de cartão com parcelamento, Pix,
  boleto, competência de fatura. Nenhuma referência americana cobre isso.
- **Leia `PESQUISA-UX.md` antes de começar** — é a parte 1 desta pesquisa, com
  evidência já levantada sobre importação, parcelamento, cor, tipografia de
  número e limite de destinos de navegação. O que estiver marcado
  `[NÃO CONFIRMADO]` lá continua não confirmado; não trate como fato.
