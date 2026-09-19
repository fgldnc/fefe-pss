# Fecho do redesign v2

Escrito no fim da **rodada 8 (Ajustes)**, a última. As oito rodadas estão
aplicadas. Este arquivo é o fecho: o que a sequência mudou, e o que ficou
pendente. A fonte da verdade visual continua sendo
`redesign-v2/direcoes/hibrido.html`; o contrato do código continua sendo o
`CLAUDE.md`.

---

## O que a sequência mudou

**De 11 abas para 7 destinos.** A navegação virou o ciclo do mês:

> Importar · Conferir · Mês · Cartão · Adiante · Guardado — e ⚙ Ajustes no pé
> (na topbar abaixo de 900px).

| rodada | o que virou |
|---|---|
| 1 fundação | tokens do híbrido, Outfit em tudo (inclusive número), tema escuro removido, "cada tela numa dobra" revogada — **a página rola** |
| 2 navegação | `TAB_MODULES` → `DESTINOS`; `APELIDOS` + `ANCORAS` mantêm todo endereço antigo válido; barra de rodapé no celular; saíram a command palette, o onboarding, o botão de tema e a gaveta |
| 3 Mês | `js/mes.js`; `gastos.js`/`receitas.js` viraram formulário + gravação; `dashboard.js` morreu |
| 4 Adiante | `js/adiante.js`; `saldos.js` virou só cálculo; `timeline.js`/`previsoes.js` morreram |
| Cartão | `js/cartao.js`, pedido da usuária: resumo · contratos · previstas · **pagas** (esta não existia em tela nenhuma) |
| 5 Guardado | `js/guardado.js`; `metas.js`/`patrimonio.js` viraram formulário + gravação |
| 6 Importar | `js/importar.js`: duas abas explícitas, offset de competência, histórico de lotes abrível; `extratos.js`/`pdf-import.js` deixaram de desenhar tela |
| 7 Conferir | `js/conferir.js`: sem categoria · parcela prevista vencida · possível duplicata, tudo derivado do `state`, olhando a base inteira |
| 8 Ajustes | `js/ajustes.js`: categorias · regras · orçamento · backup · conta · o que mudou de casa. `configuracoes.js` absorvido, `relatorios.js` apagado |

**O padrão que se repetiu nas sete telas:** o módulo da tela monta a `<section>`
inteira por `innerHTML`, a `<section>` no `index.html` é vazia de propósito, os
módulos de formulário/gravação continuam vivos e são chamados de lá, e a tela
tem **um listener só, delegado na seção**. Só os modais continuam no HTML — e
por isso só neles vale listener preso ao elemento.

**Empilhar acabou.** Nenhum destino tem mais de uma seção. O estado
intermediário das rodadas 2 a 7 — mostrar duas ou três telas antigas juntas
para que nenhuma capacidade ficasse inalcançável no caminho — encerrou aqui.

## O que sumiu de verdade em oito rodadas

Três coisas, e só três:

1. **Relatórios** (`js/relatorios.js`) — seis relatórios fixos para uma pessoa
   só; cada tabela do app já exporta o próprio CSV com o que está na tela.
2. **A command palette e o onboarding de 4 passos** (rodada 2) — a palette
   fazia sentido com 11 destinos; um dos passos do onboarding era morto
   (`obData.bank` era escrito e nunca lido).
3. **O tema escuro** (rodada 1) — a direção escolhida tem um tema só.

Tudo o mais mudou de endereço, não de existência. As estatísticas de
armazenamento e o apagar-coleção **ficaram** (decisão da usuária na rodada 8).

## O que ficou pendente

- **A conferência com os dados reais.** Cartão, Guardado, Importar, Conferir e
  Ajustes foram exercitados com dados injetados no `state` pelo navegador. O
  caminho da fatura em PDF foi exercitado só até a costura
  (`importarFaturaDeArquivo`); o parse não mudou e os 68 testes seguem verdes,
  mas **ninguém passou uma fatura de verdade por essas telas ainda**.
- **`firestore.rules` publicado.** O arquivo existe no repositório; se está
  publicado no console do Firebase só dá para confirmar fora daqui. Tratar como
  aberto (`RELATORIO-AUDITORIA.md`).
- **`'unsafe-inline'` no `style-src` da CSP** (`vercel.json`). O do `script-src`
  foi fechado com a extração de `js/firebase-init.js`; o do estilo continua, e
  fechá-lo exige tirar todo `style="…"` gerado em `js/`.
- **`settings` fora do backup/restore.** `settings/fluxo` entra (fora de `data`
  no JSON, e o que já existe vence o que vem do arquivo); o resto de `settings`
  não entra em backup nem em wipe. Registrado desde a rodada A8.
- **Contrato de parcelamento continua sem id.** Descrição normalizada + total de
  parcelas + valor em centavos, com o risco de colisão de `_acharParcela`.
  Inventar id é mudança de modelo de dado.
- **O app não guarda histórico de valor de ativo.** Por isso Guardado tem
  "aportes por mês" e não "patrimônio mês a mês". Só existe com snapshot mensal.
- **`"São dois mesmo"` de Conferir mora no `localStorage`** — não viaja entre
  dispositivos. Custo conhecido e aceito.
- **Azul ainda existe em `DEFAULT_CATEGORIES`** (`js/db.js`): Transporte
  `#60a5fa` e Assinaturas `#22d3ee`, semeados no primeiro login. É dado, não
  pele — e é por isso que a rosca de Mês pinta por posto da série, não pela cor
  gravada. Trocar as sementes muda o que usuários novos recebem; quem já tem as
  cores continua com elas.
- **Vocabulário antigo ainda no CSS.** `.card`, `.kpi-*`, `.data-table`,
  `.receitas-grid`, `.extratos-grid`, `.fit`/`.grow` e os apelidos de token
  (`--bg-card`, `--danger`, …) sobrevivem. Os apelidos são de propósito — foram
  o que permitiu trocar a pele sem tocar em ~30 referências dentro de `js/`. O
  resto é limpeza que não foi feita porque não havia mais tela usando.

## Cinco armadilhas que a sequência pagou

Valem para qualquer mudança futura:

1. **`overflow` em contêiner de tabela mata o `<thead>` sticky.** Nenhum
   overflow, `table-layout: fixed`, larguras **no CSS**, `overflow-wrap`.
2. **`esconde-sm` vai no `<th>` E no `<td>`**, senão as colunas desalinham.
3. **O `top` do `<thead>` sticky é `var(--topbar-h)`, não 0.**
4. **`.ir` é um quadrado de 28px** para o glifo "↗". Botão de texto pequeno
   precisa de classe própria — paga em `.guardado-toggle`, `.imp-lote-btn`,
   `.conferir-btn`.
5. **O `padding-left: 16px` de `td + td` come 48px antes de qualquer coluna.**
   A 375px a folha tem ~343px por dentro.

E a sexta, descoberta na rodada 8: **`scrollIntoView` não rola nesta página.**
O `overflow-x: hidden` do `body` faz o computed virar `hidden auto`, o que
torna o body um contêiner de rolagem que nunca rola — e `scrollIntoView`
resolve contra ele. `_goto` passou a rolar o documento na mão, com a folga da
topbar. Mesma família da armadilha 1.

---

# Rodada 9 — depois do fecho

A usuária olhou as sete telas prontas e pediu quatro frentes. **As quatro
estão feitas.**

| frente | estado |
|---|---|
| **A — densidade** (fonte e margem por bloco; o herói de Mês sem receita é o pior caso) | **feita** |
| **B — abas dentro da tela** | **feita** |
| **C — a tela se ajustar à resolução** (era `--coluna: 1180px` fixo) | **feita** |
| **D — modo escuro de volta** | **feita** |

O plano das quatro está em `PROMPT-rodada-9-densidade-abas-escuro.md`.

## O que a frente B mudou

**Duas regras deste documento e do `CLAUDE.md` foram REVOGADAS pela usuária:**

1. **"Sem sub-abas"** (rodada 8) virou o contrário: *"deve tb separar por abas
   tudo da ajustes. rolar tudo pra encontrar o que quer é muito paia."* Sub-aba
   dentro da tela é o padrão agora. **"A PÁGINA ROLA" continua valendo para o
   que sobra DENTRO de cada aba** — a revogação da v1 era contra espremer a
   linha da tabela para caber numa dobra, e isso segue proibido.
2. **"O tema escuro acabou"** (rodada 1) está revogado — e desde a frente D
   está **implementado**: o app tem dois temas.

**Seis das sete telas ganharam abas** (Importar já tinha):

| tela | abas |
|---|---|
| Mês | O mês · Tudo que entrou e saiu |
| Cartão | Em aberto · Já pagas |
| Adiante | O mês · Movimentos |
| Guardado | O que você tem guardado · Onde está guardado |
| Conferir | Sem categoria · Parcela prevista · Parece repetido |
| Ajustes | Categorias e regras · Orçamento · Backup · Conta |

**Uma coisa sumiu de verdade:** o bloco **"Parcelas previstas"** de Cartão
(*"a contratos em aberto já mostra isso"*). `MAX_PREVISTAS` saiu junto;
`d.previstas` sobreviveu só como o KPI "Próximos 3 meses" do resumo.

**O vocabulário é UM:** `.imp-abas`/`.imp-aba` foram renomeadas para
`.abas`/`.aba`/`.painel-aba`, com os helpers `abas()`, `painelAba()`,
`ligarAbas()`, `focarAba()` e `pegarAbaPedida()` no fim de `js/utils.js`.
Mesmo caminho de `.adiante-tabela-rolagem` → `.tabela-folha`.

## Duas armadilhas novas, pagas nesta rodada

7. **Canvas dentro de aba fechada mede zero — e fica zero.** Chart.js mede o
   `<canvas>` na hora de montar. Por isso a tela renderiza **só o painel
   aberto**, e destrói a instância do gráfico quando a aba dele fecha (senão o
   listener de resize fica vivo sobre um canvas já removido do DOM).
8. **Crase dentro de comentário HTML fecha o template literal.** Um
   `<!-- Sem \`.rot\` aqui -->` no meio de uma `` ` ``-string vira erro de
   sintaxe silencioso em runtime (`"…" is not a function`, um tagged template).
   Comentário que explica decisão de código vira comentário de **JS**, acima do
   `return` — e de quebra deixa de viajar no `innerHTML` a cada render.

## O que as frentes A e C mudaram

Nenhuma linha de `js/` foi tocada: as duas são de CSS, e por isso os 68 testes
passaram sem precisar mudar.

**C — a malha responde à viewport.** `--coluna`, `--margem`, `--goteira` e
`--ar-secao` eram números fixos; viraram `clamp()` sobre `vw`, e
`html { font-size }` também (14px no celular, 15px no notebook de 1400px — o
valor de sempre —, 16,5px no monitor grande).

- **O que estava errado, medido:** a 2560px sobravam **1148px de cinza morto à
  direita**. A coluna parava em 1180px e nem sequer era centrada.
- **Agora:** teto de **1560px**, centrada (`width: 100%` + `margin-inline: auto`).
  A 2560px sobram 381px de cada lado. **O `width: 100%` é obrigatório:** a
  `.main-content` é flex em coluna, e margem automática no eixo cruzado desliga
  o stretch — sem a largura declarada o bloco encolhia para o conteúdo (1448px
  onde cabiam 1560px).
- **Por que 1560 e não mais:** linha de tabela mais larga que isso não se lê.
- Os 80px de rodapé da última seção são da barra fixa do celular; acima de
  900px viraram `var(--ar-secao)` — eram parte do "espaço branco no fim".
- **Medido sem rolagem horizontal** em 2560, 1420, 1366, 1120, 1000, 900 e
  375px, nas sete telas, com dados e vazias.
- A fileira de `.abas` a 375px: **nunca três linhas**. Uma linha em cinco telas;
  **duas** em Ajustes (4 abas, 421px de aba para 343px de folha) e em Guardado
  (rótulos longos). Nenhuma aba fica escondida, e apertar o alvo de toque para
  ganhar uma linha custaria mais do que ganha.

**A — densidade.** O caso que ela citou era o herói de Mês sem receita: bloco de
**370px para 214px de conteúdo**, com **156px de ameixa vazia no meio**, porque
`.dica` tem `margin-top: auto` e o vizinho (Distribuição) é mais alto.

- **`align-items: start` na `.faixa`.** O herói passou a 231px, com sobra **0**.
  Bloco que estica por causa do vizinho não deve esticar por dentro: sobra de
  grade lê-se como grade, vazio dentro do bloco lê-se como bloco quebrado.
- **Varredura nas sete telas × todas as abas:** nenhum outro bloco com mais de
  24px de vazio interno. O herói era o caso, não um exemplo.
- **`--ar-bloco` (`clamp(20px, 2vw, 32px)`) entre blocos de topo.** A queixa
  dela em Importar (*"essa falta de separação entre os blocos"*) era literal:
  `importar-portas` e `importar-historico` estavam a **0px** um do outro.
  Agora 28px num notebook. Ar, não borda nova — e só em filho direto da seção
  ou do painel de aba, porque `.folha` dentro de `.faixa` é coluna de uma linha
  só e margem ali desalinharia as duas colunas.

## O que a frente D mudou — o modo escuro

**Um tema é redefinição de token, não regra nova.** Todo o conjunto de
superfície, tinta, dinheiro, série e sombra é reescrito sob
`html[data-tema="escuro"]`. Só **duas** regras do arquivo precisaram de conserto
— e as duas estavam erradas antes, usando cor literal onde cabia token:

- `.aj-btn-risco:hover` tinha `color: #fff` sobre `--saiu`. No escuro `--saiu` é
  um salmão claro: **2,18:1**. Virou `--text-inverse`.
- `.heroi` continua com `#fff` de propósito — a faixa do herói é sempre uma
  superfície funda de marca, nos dois temas.

**`--marca` virou dois tokens.** `--marca` é a marca como TINTA (item ativo,
foco, curva do saldo); `--marca-fundo`/`--marca-fundo-2` é a marca como
SUPERFÍCIE, com branco por cima. No claro são a mesma cor — por isso ninguém
tinha notado. **No escuro não podem ser:** para o branco ler por cima, a
luminância tem de ser ≤ 0,183; para a cor ler como texto sobre a folha escura,
≥ 0,232. Uma cor só não resolve — é aritmética, não gosto. Sem os dois tokens,
ou o botão primário some ou o item ativo do menu some.

Quem trocou para `--marca-fundo`: botão primário, botão de login, losango do
logo, faixa do herói, `.btn-atencao` e o dia de hoje do calendário. **Barra de
progresso não trocou:** não tem texto em cima, e no escuro é a tinta clara que
a faz aparecer.

**A preferência tem três valores** (`auto` · `claro` · `escuro`) em
`localStorage.fluxo_tema`; o atributo `data-tema` no `<html>` é sempre um dos
**dois resolvidos**. Resolver `auto` no JS (`aplicarTema()` em `js/utils.js`)
e não com `@media (prefers-color-scheme: dark)` existe para o CSS ter **um
seletor só** em vez do bloco de tokens duplicado dentro da media query.
`aplicarTema()` é chamado no TOPO de `js/app.js`, fora do `DOMContentLoaded`:
módulo executa antes dele, e sem isso o app abre claro e pisca para escuro.
A escolha fica em **Ajustes → Conta**, três botões — `auto` é escolha de
verdade e não cabe num liga-desliga.

**A armadilha que mais custa, resolvida de propósito:** Chart.js pinta em canvas
e não resolve `var(--…)`. As cores foram lidas por `getComputedStyle` na
montagem, e trocar de tema **não repinta um pixel**. `aplicarTema()` dispara
`tema-mudou`, `app.js` ouve e chama `rerenderCurrentTab()`. **Tem de ser o
`render*` da tela, nunca um `chart.update()`** — desde a frente B cada tela
monta só o gráfico do painel aberto e destrói a instância quando a aba dele
fecha, então um update repintaria um gráfico que pode nem existir. **Medido:**
a linha do gráfico de Mês foi de `#0E7C4C` para `#5FCB99` e a grade de
`#E2E8F1` para `#2B3038` sem recarregar a página.

**O script de contraste agora varre os dois temas**, inclusive os dois papéis da
marca em cada um e nas três famílias (ameixa · roxo · grafite). Sem isso, "tem
modo escuro" é chute.
