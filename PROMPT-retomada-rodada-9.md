# Retomada da rodada 9 — frentes A, C e D

**Uma frente por sessão quando a frente for pesada.** A rodada 9 tem quatro, e
**só a B (abas dentro da tela) está feita**. Se ao terminar uma destas três a
janela de contexto já estiver comprometida, **NÃO comece a seguinte** — escreva
um prompt de retomada como este, com esta mesma regra dentro, e entregue o link
para ela abrir uma sessão nova.

Ela confia no seu julgamento para as decisões de desenho — não pare para
perguntar coisa que dá para decidir com o que está escrito. **Pare e pergunte
só se alguma REGRA DE NEGÓCIO parecer que precisa mudar.**

---

## 0. UMA REGRA DO `CLAUDE.md` AINDA ESTÁ REVOGADA E NÃO IMPLEMENTADA

**"O tema escuro acabou" está REVOGADO pela usuária.** O `CLAUDE.md` ainda diz,
em "Regras de interface que valem em toda tela": *"Material de papel, um tema
só. (…) O tema escuro acabou."* Isso descreve **o código de hoje**, não a
decisão dela. Ela quer modo escuro de volta — é a **frente D**. Há um aviso em
negrito logo acima da seção "Redesign em andamento" do `CLAUDE.md` dizendo isso.

**Ao terminar a frente D, corrija o contrato** nesse ponto.

A outra revogação da rodada 9 — "sem sub-abas" — **já foi aplicada e o
`CLAUDE.md` já está corrigido**. Não mexa nela.

---

## 1. Leia antes de escrever qualquer linha

Nesta ordem:

1. **`CLAUDE.md`** — o contrato. Já traz a rodada 9 registrada: o vocabulário
   `.abas`/`.aba`/`.painel-aba`, as abas de cada tela, `ABAS_DE_ANCORA` e a
   regra de que a tela monta **só o painel aberto**.
2. **`FECHO-REDESIGN-v2.md`** — as oito rodadas, as pendências e agora **oito
   armadilhas já pagas** (as seis antigas + duas novas da frente B). Não caia
   de novo em nenhuma.
3. **`redesign-v2/direcoes/hibrido.html`** — a fonte da verdade visual.
4. `PROMPT-rodada-9-densidade-abas-escuro.md` — o pedido original das quatro
   frentes, com as palavras da usuária. **Ignore a seção 0 item 2 e a frente B:
   estão feitas.**

**Estado de hoje:** sete destinos, cada um com **uma** `<section>` vazia no
`index.html`, montada inteira pelo módulo da tela, com **um listener só,
delegado na seção**. Seis das sete telas têm abas internas. 68 testes verdes,
zero erro no console nas sete telas × todas as abas, com dados e vazias.

---

## 2. As três frentes que faltam

### A. DENSIDADE — tamanho de fonte e margem por bloco

> *"verificar tamanho de fonte e margem para os blocos ficarem preenchidos
> conforme o tamanho para o layout ficar bonitinho. então sem espaço enorme
> desnecessário. A MENOS QUE FOR NECESSÁRIO TER ESSE ESPAÇO. o bloco do que
> sobrou, por exemplo, tá muito feio por causa disso."*

O caso que ela citou é o **herói de Mês** (`#mes-heroi`, `.heroi` em
`js/mes.js`): sem receita cadastrada o bloco fica com o número, uma frase, **uma
faixa enorme de ameixa vazia**, a marca `◇ Receita ainda não cadastrada` e o
botão — porque o `.dica` tem `margin-top: auto` e o vizinho (Distribuição) é
mais alto. É o pior caso, não o único: **varra as sete telas**, e agora também
**dentro de cada aba**.

- **Espaço vazio que carrega significado FICA.** Silêncio é o sinal de que está
  tudo bem. O que sai é espaço que sobrou de esticar.
- **Meça, não olhe.** `getBoundingClientRect()` no bloco e no conteúdo: a razão
  conteúdo/altura do bloco é o número que denuncia o vazio.
- **Um bloco que estica por causa do vizinho não deve esticar por dentro.** Na
  `.faixa` (grid de duas colunas — hoje usada em Mês e, desde a frente B,
  também na primeira aba de Guardado), considere `align-items: start`.
- **Escala tipográfica:** há números soltos por todo o CSS (`13.5px`, `12.5px`,
  `11.5px`, `30px`, `38px`, `46px`). Se criar tokens de tamanho, crie-os no
  `:root` junto dos outros e **documente no `CLAUDE.md`** — não espalhe um
  segundo sistema.
- **Separação entre blocos** foi reclamação explícita dela em Importar: *"essa
  falta de separação entre os blocos de algumas abas tá me irritando, esse do
  trazer do banco e do o que já entrou por exemplo"*. Duas folhas brancas
  coladas com 20px de fundo cinza entre elas não se leem como duas coisas.
  Resolva com ar, régua ou rótulo — **não com borda nova inventada**.

### C. A TELA SE AJUSTA À RESOLUÇÃO

> *"tem que sempre estar no melhor tamanho possível independente da tela. deve
> ter uma margem para início e fim das coisas e não deve ter espaço branco
> demais no fim. deve se ajustar à tela todos os blocos."*

Hoje o layout é de largura **fixa**: `--coluna: 1180px`, `--margem: 32px`,
`--goteira: 20px`, `--nav: 232px`, e `html { font-size: 15px }`. Numa tela de
2560px sobra cinza dos dois lados; numa de 1366px aperta.

- Largura de coluna, goteira, margem e passo tipográfico devem **responder à
  viewport** — `clamp()` sobre `vw` é o caminho natural, sem build step.
- **Teto continua existindo:** linha larga demais não se lê. Decida o teto e
  **escreva o porquê no CSS**.
- **Margem de início e de fim** é pedido explícito. O `padding-bottom: 80px` do
  último `.tab-content` existe para a barra de rodapé do celular — confira o
  que acontece no desktop.
- **Meça em 2560, 1420, 1366, 1120, 1000, 900 e 375px, com `resize_window` de
  verdade** — encolher o `#app` por JS não faz o `<canvas>` do Chart.js refluir
  e dá falso positivo.
- **Novo nesta frente:** a fileira de `.abas` tem `flex-wrap: wrap`. Confira
  que a 375px as **quatro abas de Ajustes** e as **três de Conferir** não viram
  três linhas de aba antes de qualquer conteúdo.

### D. MODO ESCURO

O v1 tinha tema escuro; ele foi removido na rodada 1 do v2 — o seletor
`[data-theme="light"]` saiu do CSS e o `#btn-tema` saiu da topbar.
**`aplicarTema` NÃO existe mais em `js/app.js`** (foi conferido): não há gancho
pronto, ele precisa ser criado.

- Os tokens de superfície e tinta estão todos no `:root` de `css/style.css`
  (`--fundo`, `--folha`, `--folha-2`, `--folha-3`, `--borda*`, `--ink*`,
  `--entrou`, `--saiu`, `--deduzido` e as tintas de cada um, `--s1…--s6` e os
  `-chip`). **Um tema escuro é redefinir esse conjunto sob um seletor**, não
  reescrever regra por regra. Se alguma regra usa cor literal em vez de token,
  é ela que está errada.
- **Tokens que a frente B acrescentou e que precisam do escuro:** `.aba-conta`
  (fundo `--folha-3`, tinta `--ink-3`) e `.aba-conta.alerta`
  (`--deduzido-tinta` / `--deduzido`). Os dois são só token — devem seguir
  sozinhos se os tokens forem redefinidos.
- **`--marca` continua sem tocar em dinheiro.** Vale igual no escuro.
- **Nada de azul**, no escuro também.
- **CONTRASTE SE RODA:** `node redesign-v2/direcoes/contraste-hibrido.mjs`
  (texto 4,5:1 · gráfico, borda e glifo 3:1). O script de hoje confere o tema
  claro — **ele vai precisar conferir os dois**. Estender o script faz parte da
  frente. Sem isso, "tem modo escuro" é chute.
- **ARMADILHA REAL, e é a que mais custa:** Chart.js pinta em canvas e não
  resolve `var(--…)`. As cores vêm de `getComputedStyle` na hora de montar o
  gráfico (`coresGrafico()` em `adiante.js`, `_token()` em `mes.js` e em
  `guardado.js`). **Trocar de tema NÃO repinta um gráfico já montado.** Resolva
  de propósito (re-render na troca) e **escreva o porquê no código**.
  - Atenção: depois da frente B, **cada tela só monta o gráfico do painel
    aberto** e destrói a instância quando a aba dele fecha. A re-renderização
    na troca de tema precisa passar pelo `render*` da tela, não por um
    `chart.update()` — senão ela repinta um gráfico que pode nem existir.
- Como se troca: ela não pediu botão. Decida entre seguir `prefers-color-scheme`,
  ter um controle em Ajustes (**que agora tem quatro abas — "Conta" é o lugar
  natural**), ou os dois — e **registre a decisão no `CLAUDE.md`**.

---

## 3. Como trabalhar

- **Terminar com o app funcionando.**
- **Conferir, não supor.** Contraste se roda, largura se mede, rolagem
  horizontal se testa no navegador.
- **Comentário em português explicando o PORQUÊ, não o quê.**
- **Atualizar o `CLAUDE.md` ao fim** — inclusive a revogação da seção 0 quando
  a frente D rodar — e o `FECHO-REDESIGN-v2.md` (a tabela "Rodada 9 — depois do
  fecho" tem uma linha por frente; troque "pendente" por "feita").

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
  rolar** (isso já funciona; não quebre).

### As oito armadilhas já pagas

Estão no `FECHO-REDESIGN-v2.md` com o detalhe. Resumo:

1. `overflow` em contêiner de tabela mata o `<thead>` sticky.
2. `esconde-sm` vai no `<th>` **E** no `<td>`.
3. O `top` do `<thead>` sticky é `var(--topbar-h)`, não 0.
4. `.ir` é um quadrado de 28px — botão de texto pequeno precisa de classe
   própria (já pago três vezes).
5. O `padding-left: 16px` de `td + td` come 48px antes de qualquer coluna; a
   375px a folha tem ~343px por dentro.
6. `scrollIntoView` **não rola esta página**; `_goto` rola o documento na mão.
7. **Canvas dentro de aba fechada mede zero — e fica zero.** Por isso a tela
   monta só o painel aberto e destrói o gráfico quando a aba dele fecha.
8. **Crase dentro de comentário HTML fecha o template literal.** Comentário que
   explica decisão de código vira comentário de **JS**, acima do `return`.

### Como testar sem login

Não dá para logar com Google no preview. O caminho:

1. `preview_start` — há uma entrada por porta em `.claude/launch.json`
   (4321–4326). Use uma livre e acrescente outra se precisar.
2. No navegador: esconder `#login-screen`, mostrar `#app`, e injetar dados pelo
   próprio módulo — `const u = await import('/js/utils.js')` devolve a MESMA
   instância que o app usa, então mutar `u.state` e chamar `switchTab(...)`
   re-renderiza com os dados de teste. **Atenção:** o callback de auth pode
   reesconder o `#app` logo depois do load; reinjete antes de medir.
3. Para percorrer as abas internas: `document.getElementById('tab-'+t)
   .querySelectorAll('.aba')[i].click()`, com uma espera de ~180ms entre uma e
   outra (o render é síncrono, mas o Chart.js não).
4. Meça largura e altura pelo DOM (`getBoundingClientRect`), não pelo olho no
   screenshot. **Se `innerWidth` vier 0, o painel do navegador está escondido e
   nenhuma medida de layout vale** — `resize_window` com largura explícita
   antes de medir.
5. `window.scrollTo({behavior:'smooth'})` é inerte no painel embutido — use
   `behavior:'instant'`.
6. O buffer de `read_console_messages` sobrevive a navegações. Para confirmar
   "zero erro no console", abra uma aba nova.

**Isso NÃO substitui a conferência dela com os dados reais** — diga isso no fim
da rodada. Seguem pendentes dessa olhada, desde a v2: **Cartão, Guardado,
Importar, Conferir e Ajustes**, e o caminho da fatura em PDF, que foi
exercitado só até a costura.
