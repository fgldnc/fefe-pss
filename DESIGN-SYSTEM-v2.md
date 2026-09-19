# DESIGN SYSTEM v2 — "Papel e tinta"

Desenho novo, do zero. A paleta preta-e-branca sem cor da rodada anterior está
revogada. Os contrastes abaixo foram **calculados**, não estimados (fórmula
WCAG 2.x de luminância relativa; script em `redesign-v2/contraste.mjs`).

---

## 1. A ideia

Dois materiais: **papel** e **tinta**.

- O fundo é papel — no claro, um off-white quente (`#F6F5F2`), não branco puro,
  porque branco puro numa tela cheia de número cansa; no escuro, uma tinta
  azulada (`#0E1014`), não preto puro, porque preto puro faz o halo do texto
  branco vibrar em OLED.
- A cor de marca é **índigo**. Escolhida por eliminação, não por gosto: verde já
  é receita, vermelho já é gasto, âmbar já é "o app deduziu". Índigo é o único
  lugar do círculo cromático que sobra sem colidir com significado, e é o que
  permite a navegação ter cor sem que essa cor minta sobre um número.
- **Cor de marca nunca toca número.** Ela pinta navegação, botão primário, foco
  e o traço do gráfico de saldo. Todo valor em R$ é tinta neutra, verde, ou
  vermelho — nunca índigo.

O que mudou de regra em relação ao desenho anterior:

| antes | agora | por quê |
|---|---|---|
| chrome sem cor nenhuma | chrome índigo | 11 destinos cinzentos não davam ponto de fixação; e o dono pediu bonito |
| cor = informação, canal único | cor = **reforço** de informação | WCAG 1.4.1: verde/vermelho sozinho não carrega nada para ~8% dos homens (`PESQUISA-UX.md` §7) |
| a página não rola | **a página rola**, exceto a tabela | §6 |
| Nunito | Fraunces + Inter | §3 |

---

## 2. Tokens de cor

Mesmos nomes nos dois temas. **Escuro continua sendo o padrão** — é como o app
sempre foi, e a pessoa usa isso à noite, depois do trabalho.

```css
/* ESCURO — padrão, em :root */
--bg-app:      #0E1014;   --bg-surface:  #161A21;
--bg-raised:   #1E232C;   --bg-hover:    #272D38;
--text-1:      #EEF0F4;   --text-2:      #A8B0BE;   --text-3:      #828B99;
--line-soft:   #242A34;   --line:        #333A47;   --line-strong: #666F80;
--brand:       #8E9BFF;   --brand-fg:    #0E1014;   --brand-dim:   #1C2140;
--income:      #5BD98C;   --expense:     #FF8A82;   --inferred:    #F0B849;
--c1:#8E9BFF; --c2:#5BD98C; --c3:#F0B849; --c4:#FF8A82; --c5:#5FD0D6; --c6:#D08CE8;

/* CLARO — [data-theme="light"] */
--bg-app:      #F6F5F2;   --bg-surface:  #FFFFFF;
--bg-raised:   #EFEEEA;   --bg-hover:    #E6E5E0;
--text-1:      #15171C;   --text-2:      #555C69;   --text-3:      #636A76;
--line-soft:   #E4E2DC;   --line:        #D4D2CC;   --line-strong: #8C887E;
--brand:       #4A4FD4;   --brand-fg:    #FFFFFF;   --brand-dim:   #E7E8FB;
--income:      #0B7A45;   --expense:     #C0362B;   --inferred:    #8A5A00;
--c1:#4A4FD4; --c2:#0B7A45; --c3:#8A5A00; --c4:#C0362B; --c5:#0E6E77; --c6:#8A3FA8;
```

### O que cada cor significa

| token | significado | onde aparece |
|---|---|---|
| `--brand` | **nada sobre o dinheiro.** É identidade e navegação. | item ativo da barra, botão primário, anel de foco, traço da curva de saldo |
| `--income` | entrou dinheiro | valor de receita, série de receita |
| `--expense` | saiu dinheiro **ou** saldo negativo | valor de despesa, trecho negativo da curva |
| `--inferred` | **o app deduziu isto** — não é erro, é dedução a conferir | campo inferido, linha pendente, chip de pendência |
| `--c1..c6` | série categórica de gráfico. Sem juízo: `--c4` numa rosca não significa "ruim". | rosca de categorias, barras de evolução |
| `--text-3` | texto de apoio, rótulo, unidade | subtítulos, "no dia 14" |

`--income` e `--expense` reaproveitam `--c2`/`--c4` **de propósito**: a rosca
não pode ter um verde diferente do verde de receita, senão a tela ensina dois
significados para a mesma cor.

### Tabela de contraste (calculada)

Texto: mínimo **4,5:1** (AA). Elemento gráfico e borda de campo: **3:1**.
Três colunas porque o app empilha três fundos (app → card → card elevado).

**ESCURO**

| cor | sobre `--bg-app` | sobre `--bg-surface` | sobre `--bg-raised` | exigido | passa? |
|---|---|---|---|---|---|
| `--text-1` | 16,69 | 15,29 | 13,82 | 4,5 | ✓ |
| `--text-2` | 8,72 | 7,99 | 7,22 | 4,5 | ✓ |
| `--text-3` | 5,53 | 5,07 | 4,58 | 4,5 | ✓ |
| `--brand` | 7,51 | 6,88 | 6,22 | 4,5 | ✓ |
| `--income` | 10,65 | 9,76 | 8,82 | 4,5 | ✓ |
| `--expense` | 8,35 | 7,65 | 6,91 | 4,5 | ✓ |
| `--inferred` | 10,57 | 9,68 | 8,75 | 4,5 | ✓ |
| `--c5` | 10,41 | 9,54 | 8,62 | 3 | ✓ |
| `--c6` | 7,80 | 7,14 | 6,46 | 3 | ✓ |
| `--line-strong` | 3,76 | 3,45 | 3,12 | 3 | ✓ |
| `--line` | 1,67 | 1,53 | 1,38 | — | decorativa (§2.1) |
| `--brand-fg` sobre `--brand` | 7,51 | — | — | 4,5 | ✓ |

**CLARO**

| cor | sobre `--bg-app` | sobre `--bg-surface` | sobre `--bg-raised` | exigido | passa? |
|---|---|---|---|---|---|
| `--text-1` | 16,45 | 17,93 | 15,44 | 4,5 | ✓ |
| `--text-2` | 6,17 | 6,73 | 5,80 | 4,5 | ✓ |
| `--text-3` | 5,00 | 5,45 | 4,69 | 4,5 | ✓ |
| `--brand` | 5,73 | 6,25 | 5,38 | 4,5 | ✓ |
| `--income` | 4,96 | 5,41 | 4,66 | 4,5 | ✓ |
| `--expense` | 5,06 | 5,52 | 4,76 | 4,5 | ✓ |
| `--inferred` | 5,44 | 5,93 | 5,11 | 4,5 | ✓ |
| `--c5` | 5,48 | 5,97 | 5,15 | 3 | ✓ |
| `--c6` | 5,74 | 6,26 | 5,39 | 3 | ✓ |
| `--line-strong` | 3,24 | 3,54 | 3,05 | 3 | ✓ |
| `--line` | 1,39 | 1,51 | 1,30 | — | decorativa |
| `--brand-fg` sobre `--brand` | — | 6,25 | — | 4,5 | ✓ |

O caso mais apertado do sistema é `--income` no tema claro sobre `--bg-raised`:
**4,66:1**. Passa, com folga de 0,16. Qualquer clareamento futuro daquele verde
quebra AA — está registrado aqui para não acontecer por acidente.

### 2.1 Bordas

`--line` e `--line-soft` são **decorativas**: separam blocos que já estão
separados por fundo diferente, e o SC 1.4.11 não as cobre. `--line-strong` é a
que carrega significado — borda de `<input>`, `<select>` e checkbox, onde a
borda é o único sinal de que existe um campo ali — e por isso passa 3:1 nos
três fundos.

### 2.2 O segundo canal (WCAG 1.4.1)

Cor nunca é o único canal. Em cada lugar:

| onde | canal 1 | canal 2 |
|---|---|---|
| valor na tabela | cor | **sinal explícito**: `+1.240,00` / `−89,90` (U+2212, menos de verdade, que alinha com o dígito) |
| KPI negativo | cor | parênteses: `(R$ 312,40)` |
| série da rosca | cor | **rótulo direto** na barra ordenada ao lado (§5.1) |
| série da evolução | cor | rótulo no fim da série, sem legenda separada |
| curva de saldo | cor | traço **tracejado** no trecho projetado; marcador no ponto de mínimo |
| linha pendente | fundo âmbar | ícone `◇` + texto "a conferir" |

---

## 3. Tipografia

Duas famílias, ambas no Google Fonts (o `style-src` da CSP em `vercel.json:24`
já permite `fonts.googleapis.com`, e `font-src` permite `fonts.gstatic.com` —
**nenhuma mudança de CSP é necessária**).

```css
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400..700&family=Inter:wght@400;500;600;700&display=swap');

--font-display: 'Fraunces', Georgia, 'Times New Roman', serif;
--font-ui:      'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
--font-num:     'Inter', system-ui, sans-serif;  /* = UI, com tnum ligado */
```

**Fraunces** é a face de exibição: nome do app, título de tela, e **só o número
herói** de cada tela (o menor saldo do mês, a sobra do mês). É um serif com eixo
óptico variável — em corpo grande ele ganha contraste de traço e fica bonito;
em corpo pequeno ficaria ilegível, e por isso não desce abaixo de 28px.

**Inter** é todo o resto: interface, tabela e todos os outros números. Foi
escolhida porque documenta `tnum` e `lnum` como features reais, não porque é
neutra.

```css
/* global, como hoje */
body { font-variant-numeric: lining-nums tabular-nums; }
```

**Verificado, não suposto.** O `PESQUISA-UX.md` §6 avisa que muitas fontes
aplicam largura tabular também à vírgula e ao ponto, o que abre um vão feio em
`1.234,56`. Medido na Inter carregada do Google Fonts, em 18px/600:

| string | com `tabular-nums` | sem |
|---|---|---|
| `1.111,11` | **79,55px** | 53,95px |
| `9.999,99` | **79,55px** | 79,18px |

Larguras idênticas com tabular ligado, e o `1` estreito sem ele — a Inter
entrega figuras tabulares de verdade, e os separadores não incham. A medição
está em `redesign-v2/00-tipografia.html` (seção 1) e dá para repetir no
console. Se uma versão futura da fonte regredir, a troca é para Source Sans 3
ou IBM Plex Sans, **nunca** para monoespaçada.

Regra fixa: **sempre mostrar os centavos** (`54,00`, não `54`), senão a coluna
dança.

### Escala

| papel | família | tamanho | peso | line-height | uso |
|---|---|---|---|---|---|
| `display` | Fraunces | 40px / 2.5rem | 600 | 1.05 | número herói da tela |
| `h1` | Fraunces | 26px | 600 | 1.15 | título da tela |
| `h2` | Inter | 17px | 600 | 1.3 | título de bloco |
| `kpi` | Inter | 24px | 600 | 1.1 | valor de KPI não-herói |
| `body` | Inter | 14px | 400 | 1.5 | texto corrido, célula de tabela |
| `body-strong` | Inter | 14px | 600 | 1.5 | valor na tabela |
| `label` | Inter | 12px | 500 | 1.35 | rótulo de campo, cabeçalho de tabela |
| `caption` | Inter | 12px | 400 | 1.4 | apoio, unidade, "no dia 14" |
| `micro` | Inter | 11px | 600 | 1.2 | tag, chip; sempre com `letter-spacing: .04em` |

Nada abaixo de 11px. Cabeçalho de tabela é `label` em `--text-3`, **sem
maiúsculas forçadas** — versalete espalhado é o que fazia a tabela antiga
parecer relatório de banco.

---

## 4. Layout

### 4.1 Grade e espaço

Escala de 4px: `4 · 8 · 12 · 16 · 24 · 32 · 48`. Conteúdo com
`max-width: 1180px` centralizado — acima disso a linha da tabela fica larga
demais para o olho voltar ao começo.

Raio: `--r-sm: 8px` (campo, tag) · `--r-md: 14px` (card) · `--r-lg: 20px`
(modal, bloco herói). Sem `border-radius` acima de 20px: cartão muito
arredondado é estética de app de banco de 2019 e come área útil de tabela.

Sombra: **uma só**, e fraca.
`--shadow: 0 1px 2px rgba(0,0,0,.06), 0 8px 24px rgba(0,0,0,.08)` no claro;
no escuro a elevação é feita por `--bg-raised`, não por sombra — sombra em
fundo escuro não aparece, só suja.

Foco: `outline: 2px solid var(--brand); outline-offset: 2px`. Nunca
`outline: none`. No escuro o índigo dá 7,51:1 contra o fundo; no claro, 5,73:1.

### 4.2 A página rola. Defendendo a mudança

A regra antiga era "a página não rola; cada tela cabe numa dobra". **Está
revogada**, por três motivos:

1. **O limite real é de números, não de pixels.** O consenso é 5–7 métricas
   primárias por tela (`PESQUISA-UX.md` §5). Travar a altura em `100vh` não
   garante 5–7 números — garante que, num monitor de 1080px, cinco blocos sejam
   espremidos até cada um ficar ilegível.
2. **Custou densidade de tabela.** Para a dobra fechar, a linha da tabela de
   gastos encolheu. Numa tela que existe para ler número, foi a coisa errada a
   espremer.
3. **A regra já se desligava abaixo de 768px** — ou seja, já se admitia que ela
   não é princípio, é acomodação de desktop.

O que fica no lugar:

- **A página rola.** Cabeçalho da tela (título + navegação de mês) é `sticky` no
  topo, com 56px de altura.
- **A tabela não rola dentro de si mesma.** Ela rola com a página, e o seu
  `<thead>` é `position: sticky; top: 56px`. Isso resolve o problema que a
  região rolante resolvia (perder o cabeçalho) sem criar duas barras de rolagem
  concorrentes, que era o custo.
- **Rodapé de total é `sticky; bottom: 0`** dentro do card da tabela, com o
  fundo opaco de `--bg-surface`. O total é o número que se procura depois de
  filtrar; ele não pode estar 40 linhas abaixo.

### 4.3 Densidade de tabela

| medida | valor | por quê |
|---|---|---|
| altura da linha | **44px** (padding vertical 12px, fonte 14px) | alvo de toque mínimo de 44px no celular, e no desktop cabem ~14 linhas numa dobra de 1080px depois do cabeçalho e dos KPIs |
| altura do `<thead>` | 36px | menor que a linha; é rótulo, não dado |
| separador | `1px solid var(--line-soft)`, só entre linhas | sem zebra: faixa alternada compete com o fundo âmbar de pendência, que é o destaque que importa |
| hover | `--bg-hover` na linha inteira | |
| coluna de valor | `text-align: right`, `body-strong`, tabular | |
| coluna de ação | 88px fixos, ícones aparecem no hover e **sempre** no foco por teclado | |

O `PESQUISA-UX.md` §6 registra que não há medida publicada de app real para
densidade de linha — 44px vem do alvo de toque, que tem fonte, e não de
imitação.

### 4.4 Abaixo de 768px

- A navegação vira **barra inferior fixa** com os 5 destinos da arquitetura B —
  ícone + rótulo, que é o que o MD3 descreve. Cinco cabem; onze não cabiam, e é
  por isso que a arquitetura mudou antes do visual.
- O seletor de mês sobe para o cabeçalho `sticky`, encolhido para `‹ set/26 ›`.
- **O que é cortado, em ordem:** (1) gráficos de composição e evolução viram um
  bloco recolhido com "ver gráfico"; (2) a tabela perde as colunas *tipo* e
  *parcela*, que descem para uma segunda linha de texto de apoio dentro da
  célula de descrição; (3) os KPIs passam de fileira a grade 2×2, com o herói
  ocupando a linha inteira.
- **Nunca é cortado:** o valor, a data, a categoria e a marca de pendência.

---

## 5. Gráficos

Chart.js 4.4.0, como hoje — não há motivo para trocar, e trocar exigiria editar
o `script-src` da CSP (`vercel.json:24`).

**Regra que vale para os quatro gráficos:** Chart.js pinta em `<canvas>` e não
resolve `var(--…)`. As cores vêm de `getComputedStyle` no momento de montar o
gráfico — é o que `token()` em `js/saldos.js:32` e em `js/dashboard.js:22` já
fazem — e o gráfico é **destruído e refeito** quando o tema muda. HEX literal
no código é regressão conhecida.

Comum a todos: sem grade vertical; grade horizontal em `--line-soft` com 1px;
eixo sem linha de domínio; tooltip com fundo `--bg-raised`, borda `--line`,
raio 8px, valor em `body-strong`; animação de 200ms só na entrada.

### 5.1 Rosca de categorias — e o que fazer com "Outros"

A rosca **fica**, mas deixa de ser a única leitura. Ao lado dela, uma **barra
horizontal ordenada da maior para a menor**, com o nome da categoria e o valor
escritos na própria barra. É o "Breakdown" do Monarch (`PESQUISA-UX.md` §5), e
é o que dá o segundo canal que a rosca sozinha não tem: quem não distingue
`--c2` de `--c4` lê a ordem e o rótulo.

Divisão de trabalho: a **rosca** responde "que fatia do mês foi comida por
uma coisa só"; a **barra** responde "o que é o maior gasto". O centro da rosca
carrega o total do mês.

**"Outros" nunca é agregado pelo gráfico.** O gráfico desenha as **6 maiores
categorias** e depois uma fatia neutra (`--text-3`, sem cor de série) chamada
"**+N categorias menores**" — nome que diz que é um resto de desenho, não uma
categoria de verdade. Clicar nela expande a barra lateral para a lista
completa; não abre uma tela nova. Se existir uma categoria realmente chamada
"Outros" no cadastro do usuário, ela é uma categoria comum, entra na disputa
das 6 maiores como qualquer outra, e recebe uma marca `◇ categoria genérica`
com o atalho "revisar estes lançamentos" — porque um "Outros" grande é quase
sempre classificação faltando, não um gasto real de nome "outros".

**Estado vazio:** anel cinza fino, sem fatia, com "Nenhum gasto neste mês
ainda" e o botão de importar. Nunca uma rosca de 100% de uma categoria só
porque só existe um lançamento.

### 5.2 Barras de evolução (6 meses)

Barras agrupadas: receita (`--income`), despesa (`--expense`), investido
(`--c1`). Rótulo direto no fim de cada série no último mês, em vez de legenda
separada — legenda obriga a ida e volta entre a cor e o nome. O mês corrente
recebe hachura diagonal e o rótulo "parcial", porque comparar um mês pela
metade com cinco meses inteiros é a leitura errada mais fácil de fazer.

Eixo Y: formato "k" a partir de 1.000, como hoje (`js/dashboard.js:246`).

**Estado vazio:** as barras de meses sem dado não desaparecem — ficam como
contorno tracejado em `--line`, para o eixo não mentir sobre o intervalo.

### 5.3 Curva de saldo diário (Fluxo)

O gráfico mais importante do app, e o único com tratamento próprio:

- **Traço sólido em `--brand`** até hoje; **tracejado** daí em diante. O
  tracejado é o segundo canal do "isto é previsão".
- **A incerteza cresce com o horizonte** (`PESQUISA-UX.md` §4, único achado
  usável do bloco): a faixa de incerteza atrás do tracejado **alarga** conforme
  se afasta de hoje, em vez de ser uma faixa de largura constante.
- **Trecho abaixo de zero em `--expense`**, com preenchimento a 12% de opacidade
  até a linha do zero. Vermelho aqui é fato aritmético sobre dado existente, não
  alarme de dado faltando.
- **O ponto de mínimo é marcado** com um círculo de 5px preenchido e um rótulo
  ancorado: `menor saldo · dia 14`. É o número que induz decisão; ele não pode
  depender de a pessoa passar o mouse.
- **Sem saldo de abertura declarado, não há curva de saldo** — há curva de fluxo
  acumulado, com o eixo renomeado e um aviso. A regra é de `js/saldos.js:11-17`
  e continua valendo inteira.

### 5.4 Aportes por mês (Patrimônio)

Barras simples em `--c1`. O nome continua sendo "Aportes por mês" e não
"patrimônio mês a mês" — o app não guarda histórico de valor de ativo, e
desenhar essa curva seria inventar número.

---

## 6. Componentes

| componente | especificação |
|---|---|
| **Botão primário** | fundo `--brand`, texto `--brand-fg`, altura 36px (32px em `.btn-sm`), raio 8px, peso 600, sem sombra |
| **Botão fantasma** | transparente, borda `--line-strong`, texto `--text-1` |
| **Botão de risco** | texto `--expense`, borda `--expense`; fundo cheio só dentro de diálogo de confirmação |
| **Campo** | altura 36px, borda `--line-strong` 1px, foco troca a borda por `--brand` **e** aplica o anel de foco |
| **Campo inferido** | borda `--inferred` + `◇` antes do rótulo. Depois que a pessoa mexe, borda `--brand` — a marca sai do campo porque deixou de ser dedução |
| **Chip de pendência** | fundo `--inferred` a 14%, texto `--inferred`, `◇` + contagem. Zero pendência = chip ausente, nunca "0" |
| **Linha pendente** | `background: color-mix(in srgb, var(--inferred) 8%, transparent)` + barra de 3px em `--inferred` na borda esquerda |
| **Tag de meio de pagamento** | `micro`, fundo `--bg-raised`, texto `--text-2`. Sem cor: "pix" não é melhor nem pior que "débito" |
| **Tag "projetada"** | `micro`, borda tracejada 1px `--inferred`, fundo transparente — tracejado é o mesmo vocabulário da curva |
| **Card** | `--bg-surface`, raio 14px, borda `--line-soft` 1px, padding 20px; título `h2` + linha de apoio em `caption` |
| **Toast** | canto inferior direito (inferior central no celular, acima da barra), 4500ms como hoje, borda esquerda de 3px na cor do tipo, ícone + texto |
| **Estado vazio** | ilustração não; uma frase em `body` dizendo o que falta, e **um** botão que resolve. Nunca dois |

---

## 7. O que este sistema proíbe

1. **Índigo em número.** Cor de marca não toca valor em R$.
2. **Cor sozinha.** Nenhum significado pode depender só de matiz — a tabela §2.2
   lista o segundo canal de cada caso.
3. **HEX literal em código de gráfico.** Só `getComputedStyle`.
4. **Duas barras de rolagem concorrentes.** Rola a página; a tabela acompanha,
   com `<thead>` e rodapé de total presos.
5. **Fraunces abaixo de 28px.**
6. **Número sem centavos.**
7. **Contador zerado visível.** Silêncio segue sendo o sinal de que está tudo
   bem — a única regra da rodada anterior que sobrevive inteira.
