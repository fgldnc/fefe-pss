# Rodada 9 — densidade, abas internas, tela fluida e modo escuro

**Uma rodada por sessão quando a rodada for pesada.** Esta é pesada: são quatro
frentes. Se ao terminar uma delas a janela de contexto já estiver comprometida,
**NÃO comece a seguinte** — escreva um prompt de retomada como este, com esta
mesma regra dentro, e entregue o link para ela abrir uma sessão nova.

Ela confia no seu julgamento para as decisões de desenho — não pare para
perguntar coisa que dá para decidir com o que está escrito. **Pare e pergunte
só se alguma REGRA DE NEGÓCIO parecer que precisa mudar.**

---

## 0. DUAS REGRAS DO `CLAUDE.md` FORAM REVOGADAS PELA USUÁRIA

Leia isto antes do `CLAUDE.md`, senão você vai obedecer ao contrato antigo e
fazer o contrário do que foi pedido.

1. **"O tema escuro acabou" está REVOGADO.** O `CLAUDE.md` diz, na seção
   "Regras de interface que valem em toda tela": *"Material de papel, um tema
   só. (…) O tema escuro acabou — a direção escolhida tem um tema só, o seletor
   `[data-theme="light"]` sumiu do CSS e o botão `#btn-tema` saiu da topbar."*
   **A usuária quer modo escuro de volta.** Ver a frente D.

2. **"Sem sub-abas" está REVOGADO, e virou o contrário.** A rodada 8 decidiu
   que Ajustes seria cinco folhas empilhadas porque "A PÁGINA ROLA". A usuária
   olhou e disse, com estas palavras: *"deve tb separar por abas tudo da
   ajustes. rolar tudo pra encontrar o que quer é muito paia."* **Sub-aba dentro
   da tela agora é o padrão em Ajustes, Cartão, Conferir, Mês e Adiante.** Ver
   a frente B.
   - "A PÁGINA ROLA" **continua valendo** para o que sobra dentro de cada aba:
     a revogação de v1 era sobre espremer a linha da tabela para caber numa
     dobra, e isso segue proibido. O que muda é que a tela deixa de empilhar
     TUDO de uma vez.

**Ao terminar, atualize o `CLAUDE.md` nos dois pontos** — não deixe o contrato
dizendo o oposto do código.

---

## 1. Leia antes de escrever qualquer linha

Nesta ordem:

1. **`CLAUDE.md`** — o contrato, com as duas revogações acima em mente. As
   seções que mais importam: "Regras de interface que valem em toda tela",
   "Roteamento por destino" e a seção de cada tela.
2. **`FECHO-REDESIGN-v2.md`** — o que as 8 rodadas mudaram, o que ficou
   pendente e as **seis armadilhas já pagas**. Não caia de novo em nenhuma.
3. **`redesign-v2/direcoes/hibrido.html`** — a fonte da verdade visual. Abre do
   disco. Copiar dele é o certo; reinventar não é.
4. `ARQUITETURA-v2.md` e `INVENTARIO-FUNCOES.md` quando precisar.

O que está `[NÃO CONFIRMADO]` em `PESQUISA-UX.md` segue não confirmado.

**Estado de hoje:** as 8 rodadas do v2 estão aplicadas. Sete destinos
(Importar · Conferir · Mês · Cartão · Adiante · Guardado · Ajustes), cada um
com **uma** `<section>` vazia no `index.html`, montada inteira pelo módulo da
tela, com **um listener só, delegado na seção**. 68 testes verdes.

---

## 2. As quatro frentes

### A. DENSIDADE — tamanho de fonte e margem por bloco

> *"verificar tamanho de fonte e margem para os blocos ficarem preenchidos
> conforme o tamanho para o layout ficar bonitinho. então sem espaço enorme
> desnecessário. A MENOS QUE FOR NECESSÁRIO TER ESSE ESPAÇO. o bloco do que
> sobrou, por exemplo, tá muito feio por causa disso."*

O caso que ela citou é o **herói de Mês** (`#mes-heroi`, `.heroi` em
`js/mes.js`): quando não há receita cadastrada, o bloco fica com o número, uma
frase, **uma faixa enorme de ameixa vazia**, a marca `◇ Receita ainda não
cadastrada` e o botão. O vizinho (Distribuição) é mais alto e o herói estica
para acompanhar, então o vazio cresce junto. É o pior caso, não o único —
**varra as sete telas** procurando o mesmo padrão.

Regras para esta frente:

- **Espaço vazio que carrega significado FICA.** Silêncio é o sinal de que está
  tudo bem, e isso é regra do contrato. O que sai é espaço que sobrou de
  esticar, não espaço que diz alguma coisa.
- **Meça, não olhe.** `getBoundingClientRect()` no bloco e no conteúdo dele: a
  razão conteúdo/altura do bloco é o número que denuncia o vazio. Screenshot
  serve para conferir depois, não para decidir.
- **Um bloco que estica por causa do vizinho não deve esticar por dentro.** Na
  `.faixa` (grid de duas colunas), considere `align-items: start` ou distribuir
  o ar de propósito — nunca deixar um `margin` sozinho comendo 120px.
- **Escala tipográfica:** hoje há números soltos por todo o CSS (`13.5px`,
  `12.5px`, `11.5px`, `30px`, `38px`, `46px`). Se criar tokens de tamanho,
  crie-os no `:root` junto dos outros e **documente no `CLAUDE.md`** — não
  espalhe um segundo sistema.

### B. ABAS DENTRO DA TELA

**Reuse `.imp-abas` / `.imp-aba`** (`css/style.css`, perto do fim), que é o
vocabulário de aba do app desde a rodada 6. **NÃO crie um terceiro jeito de
fazer aba** — foi o argumento que matou as `.config-tabs`, e ele continua
valendo contra você. Se a classe precisar servir fora de Importar, **renomeie
para um nome neutro** (ex.: `.abas`/`.aba`) e troque os usos, como
`.adiante-tabela-rolagem` virou `.tabela-folha` quando deixou de ser de uma
tela só.

Padrão que já está provado em `js/importar.js` e deve se repetir:
- a aba aberta mora **no módulo** (`let _aba = '…'`), **não no DOM** — a tela é
  reinjetada por `innerHTML` a cada gravação, e aba que se fecha sozinha faz
  perder o lugar;
- `role="tablist"` / `role="tab"` / `aria-selected` / `role="tabpanel"` /
  `aria-controls`, como lá;
- o clique vai pelo **listener delegado da seção**, nunca no elemento.

O que ela pediu, tela por tela:

| tela | o que fazer |
|---|---|
| **Ajustes** | *"separar por abas tudo da ajustes"*. Os seis blocos de hoje (categorias · regras · orçamento · backup · conta · o que mudou de casa) viram abas. Você decide o agrupamento — "o que mudou de casa" provavelmente não merece aba própria; pode virar rodapé de uma delas. |
| **Cartão** | *"tá super confusa"*. Duas abas: **em aberto** e **já pagas**. No bloco de em aberto, **tire o nome "Contratos em aberto"** e **APAGUE o bloco "Parcelas previstas"** — *"a contratos em aberto já mostra isso"*. Cuidado: `_previstas()` e `MAX_PREVISTAS` saem junto; confira se mais alguém os usa antes de apagar. |
| **Conferir** | *"é ok, mas um pouco informação demais"*. As três listas viram três abas (sem categoria · parcela prevista vencida · possível duplicata). **O selo da barra continua sendo a soma das três** — `contarPendencias()` não muda, e a conta segue vindo de uma travessia só. Cada aba deve dizer quantas tem, senão a pessoa não sabe onde olhar. |
| **Mês** | A tabela "Tudo que entrou e saiu" **não deve ficar à vista**: *"poderia ser outra aba dentro do mês, se realmente for necessário"*. Os outros blocos (herói, distribuição, resultado, o dia a dia, evolução) ficam na primeira aba. **`data-goto="gastos"` aponta para `mes-tabela`** via `ANCORAS` — ele tem de abrir a aba certa antes de rolar, senão o atalho leva a um bloco escondido. Vale para toda âncora que cair dentro de aba. |
| **Adiante** | O bloco **Movimentos** (a tabela dos dias) vira outra aba. Ajustes do mês + KPIs + curva ficam na primeira. |
| **Guardado** | Ver abaixo — ela descreveu o layout. |

**Guardado** (*"está MUITO feia. sem a separação entre os blocos e tá muito
bloco sem mostrar nada"*):

- **Aba 1:** "o que você tem guardado" **dividido com "aportes por mês" ao
  lado** (duas colunas, como a `.faixa` de Mês), e **as metas embaixo**.
- **Aba 2:** "onde está guardado" (a tabela de ativos).
- Bloco vazio continua sumindo; a tela inteira vazia continua se explicando.

**Separação entre blocos** foi reclamação explícita dela em Importar também:
*"essa falta de separação entre os blocos de algumas abas tá me irritando, esse
do trazer do banco e do o que já entrou por exemplo"*. Duas folhas brancas
coladas com 20px de fundo cinza entre elas não se leem como duas coisas. Isso
é da frente A tanto quanto da B — resolva com ar, régua ou rótulo, **não com
borda nova inventada**.

### C. A TELA SE AJUSTA À RESOLUÇÃO

> *"tem que sempre estar no melhor tamanho possível independente da tela. deve
> ter uma margem para início e fim das coisas e não deve ter espaço branco
> demais no fim. deve se ajustar à tela todos os blocos."*

Hoje o layout é de largura **fixa**: `--coluna: 1180px`, `--margem: 32px`,
`--goteira: 20px`, `--nav: 232px`, e `html { font-size: 15px }`. Numa tela de
2560px sobra cinza dos dois lados; numa de 1366px aperta.

- A largura da coluna, a goteira, a margem e o passo tipográfico devem
  **responder à viewport** — `clamp()` sobre `vw` é o caminho natural e não
  precisa de build step.
- **Teto continua existindo:** linha de texto larga demais não se lê. Não é
  "ocupar tudo", é "ocupar bem". Decida o teto e **escreva o porquê** no CSS.
- **Margem de início e de fim** é pedido explícito. O `padding-bottom: 80px` do
  último `.tab-content` existe hoje para a barra de rodapé do celular — confira
  o que acontece no desktop.
- **Meça em 1420, 1120, 1000, 900 e 375px, com `resize_window` de verdade** —
  encolher o `#app` por JS não faz o `<canvas>` do Chart.js refluir e dá falso
  positivo. Acrescente **2560px e 1366px** a essa lista nesta rodada.

### D. MODO ESCURO

O v1 tinha tema escuro e ele foi **removido** na rodada 1 do v2: o seletor
`[data-theme="light"]` saiu do CSS e o `#btn-tema` saiu da topbar. Sobrou
`aplicarTema` em `js/app.js` escrevendo um atributo que ninguém lê — confira se
ainda está lá; é o gancho natural.

- Os tokens de superfície e tinta estão todos no `:root` de `css/style.css`
  (`--fundo`, `--folha`, `--folha-2`, `--folha-3`, `--borda*`, `--ink*`,
  `--entrou`, `--saiu`, `--deduzido` e as tintas de cada um, `--s1…--s6` e os
  `-chip`). **Um tema escuro é redefinir esse conjunto sob um seletor**, não
  reescrever regra por regra. Se alguma regra usa cor literal em vez de token,
  é ela que está errada.
- **`--marca` continua sem tocar em dinheiro.** A regra vale igual no escuro.
- **Nada de azul**, no escuro também. A série `--s1…--s6` foi redesenhada sem
  ele de propósito.
- **CONTRASTE SE RODA:** `node redesign-v2/direcoes/contraste-hibrido.mjs`
  (texto 4,5:1 · gráfico, borda e glifo 3:1). O script de hoje confere o tema
  claro — **ele vai precisar conferir os dois**. Estender o script faz parte da
  frente. Sem isso, "tem modo escuro" é chute.
- **ARMADILHA REAL, e é a que mais custa:** *"Chart.js pinta em canvas e não
  resolve `var(--…)`"*. As cores vêm de `getComputedStyle` na hora de montar o
  gráfico (`coresGrafico()` em `adiante.js`, `_token()` em `mes.js` e em
  `guardado.js`). **Trocar de tema NÃO repinta um gráfico já montado** — os
  quatro gráficos do app ficariam com as cores do tema anterior até a próxima
  renderização. Resolva de propósito (re-render na troca) e **escreva o porquê
  no código**.
- Como se troca: ela não pediu botão. Decida entre seguir
  `prefers-color-scheme`, ter um controle em Ajustes (que agora tem abas), ou
  os dois — e **registre a decisão no `CLAUDE.md`**.

---

## 3. Como trabalhar

- **Terminar com o app funcionando.**
- **Conferir, não supor.** Contraste se roda, largura se mede, rolagem
  horizontal se testa no navegador.
- **Comentário em português explicando o PORQUÊ, não o quê.**
- **Atualizar o `CLAUDE.md` ao fim** — inclusive as duas revogações da seção 0,
  e o `FECHO-REDESIGN-v2.md` se algo da lista de pendências mudar.
- **Se alguma regra de negócio parecer que precisa mudar, pare e pergunte.**

### Critérios de aceitação

```bash
node --test test/*.test.mjs
```

```bash
node redesign-v2/direcoes/contraste-hibrido.mjs
```

- **68/68, e nenhum teste pode precisar mudar.** Nada aqui toca em parsing,
  competência, dedupe ou saldo. Se um teste quebrar, você mexeu em regra de
  negócio sem querer — pare e investigue.
- Contraste: "Tudo passa no mínimo exigido", **nos dois temas**.
- Sem rolagem horizontal em 2560, 1420, 1366, 1120, 1000, 900 e 375px.
- Nenhum azul em `css/` nem em `js/`, em tema nenhum. (Exceção conhecida e
  aceita: `DEFAULT_CATEGORIES` em `js/db.js` — é dado semeado, não pele.)
- Todo `innerHTML` com dado externo passa por `esc()`.
- Gráfico lê cor por `getComputedStyle`, nunca HEX literal — **e repinta na
  troca de tema**.
- Coluna de valor com `tabular-nums` e centavos sempre visíveis.
- Larguras de coluna **no CSS**, nunca em `style=`.
- **As sete telas renderizam sem erro no console — com dados e vazias, nos dois
  temas, e com cada aba interna aberta pelo menos uma vez.**
- Toda âncora de `data-goto` que cair dentro de uma aba **abre a aba antes de
  rolar**.

### As seis armadilhas já pagas

Estão no `FECHO-REDESIGN-v2.md` com o detalhe. Resumo:

1. `overflow` em contêiner de tabela mata o `<thead>` sticky.
2. `esconde-sm` vai no `<th>` **E** no `<td>`.
3. O `top` do `<thead>` sticky é `var(--topbar-h)`, não 0.
4. `.ir` é um quadrado de 28px — botão de texto pequeno precisa de classe
   própria (já pago três vezes).
5. O `padding-left: 16px` de `td + td` come 48px antes de qualquer coluna; a
   375px a folha tem ~343px por dentro.
6. `scrollIntoView` **não rola esta página** (o `overflow-x: hidden` do `body`
   torna o body um scrollport que nunca rola). `_goto` rola o documento na mão.

### Como testar sem login

Não dá para logar com Google no preview. O caminho das rodadas 3 a 8:

1. `preview_start` — há uma entrada por porta em `.claude/launch.json`
   (4321–4326). Use uma livre e acrescente outra se precisar.
2. No navegador: esconder `#login-screen`, mostrar `#app`, e injetar dados pelo
   próprio módulo — `const u = await import('/js/utils.js')` devolve a MESMA
   instância que o app usa, então mutar `u.state` e chamar `switchTab(...)`
   re-renderiza com os dados de teste. **Atenção:** o callback de auth pode
   reesconder o `#app` logo depois do load; reinjete antes de medir.
3. Meça largura e altura pelo DOM (`getBoundingClientRect`), não pelo olho no
   screenshot.
4. **`window.scrollTo({behavior:'smooth'})` é inerte no painel do navegador
   embutido** — use `behavior:'instant'` para conferir a matemática de rolagem.
5. Se `computer:screenshot` devolver imagem congelada, meia pintada ou
   repetida, é o painel e não a página: confira por `get_page_text` e por
   medição no DOM.
6. O buffer de `read_console_messages` sobrevive a navegações. Para confirmar
   "zero erro no console", abra uma aba nova.

**Isso NÃO substitui a conferência dela com os dados reais** — diga isso no fim
da rodada. Seguem pendentes dessa olhada, desde a v2: **Cartão, Guardado,
Importar, Conferir e Ajustes**, e o caminho da fatura em PDF, que foi
exercitado só até a costura.
