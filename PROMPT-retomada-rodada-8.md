# Retomada — rodada 8 (Ajustes), a última do redesign v2

## REGRA DESTA SEQUÊNCIA (a usuária pediu explicitamente)

**Uma rodada por sessão quando a rodada for pesada.** Se ao terminar a rodada
que você pegou a janela de contexto já estiver comprometida, **NÃO comece a
seguinte**: escreva um prompt de retomada como este, com esta mesma regra
dentro, e entregue o link para ela abrir uma sessão nova.

Ela confia no seu julgamento para as decisões de desenho — não pare para
perguntar coisa que dá para decidir com o que está escrito. **Pare e pergunte
só se alguma REGRA DE NEGÓCIO parecer que precisa mudar.**

**Esta é a ÚLTIMA rodada do redesign v2.** Ao terminar, além de atualizar o
`CLAUDE.md`, vale escrever o fecho: o que a sequência de 8 rodadas mudou e o
que ficou pendente.

---

## 0. Leia antes de escrever qualquer linha

Nesta ordem, sem pular:

1. **`CLAUDE.md`** — é o contrato. As seções que importam agora:
   "Regras de interface que valem em toda tela (redesign v2)",
   "Roteamento por destino", as seções de cada tela já feita (Mês, Adiante,
   Cartão, Guardado, Importar, Conferir) e
   "Decisões da usuária que mudam o plano original".
2. **`redesign-v2/direcoes/hibrido.html`** — a fonte da verdade visual. Abre
   do disco. **Copiar dele é o certo; reinventar não é.**
3. **`PROMPT-implementar-v2.md`** — o plano das 8 rodadas.
4. **`ARQUITETURA-v2.md`** e **`INVENTARIO-FUNCOES.md`** — a arquitetura
   escolhida (B, "o ciclo do mês") e as 64 capacidades com arquivo:linha.

O que está `[NÃO CONFIRMADO]` em `PESQUISA-UX.md` segue não confirmado.

---

## 1. O que já está feito

**Rodadas 1 a 7, todas aplicadas.** A navegação hoje é:

**Importar · Conferir · Mês · Cartão · Adiante · Guardado** na barra, mais
**⚙ Ajustes** no pé da barra lateral (e na topbar abaixo de 900px).

| rodada | o que virou |
|---|---|
| 1 fundação | tokens do híbrido, Outfit, tema escuro removido, "cada tela numa dobra" revogada |
| 2 navegação | `TAB_MODULES` → `DESTINOS`; `APELIDOS` + `ANCORAS`; barra de rodapé no celular |
| 3 Mês | `js/mes.js`; `gastos.js`/`receitas.js` viraram formulário + gravação; `dashboard.js` morreu |
| 4 Adiante | `js/adiante.js`; `saldos.js` virou só cálculo; `timeline.js`/`previsoes.js` morreram |
| Cartão | `js/cartao.js`: resumo · contratos · previstas · **pagas** |
| 5 Guardado | `js/guardado.js`; `metas.js`/`patrimonio.js` viraram formulário + gravação |
| 6 Importar | `js/importar.js`: duas abas explícitas (fatura · extrato), offset de competência, histórico de lotes abrível. `extratos.js`/`pdf-import.js` deixaram de desenhar tela |
| 7 Conferir | `js/conferir.js`: sem categoria · parcela prevista vencida · possível duplicata, tudo derivado do `state`. O selo da barra saiu de Importar e veio para cá |

**O padrão que se repetiu nas seis telas e que você vai repetir:** o módulo da
tela monta a `<section>` inteira por `innerHTML`, a `<section>` no `index.html`
fica **vazia de propósito**, os módulos de formulário/gravação continuam vivos
e são chamados de lá, e a tela tem **um listener só, delegado na seção**,
porque o `innerHTML` é reinjetado a cada gravação.

**Conferência pendente da usuária:** Cartão, Guardado, Importar e Conferir
foram testados com dados injetados no `state` pelo navegador, **não com os
dados reais dela**. O caminho da fatura em PDF foi exercitado só até a costura
(`importarFaturaDeArquivo`); o parse em si não mudou.

---

## 2. A sua rodada: 8 — Ajustes

Hoje o destino `ajustes` **empilha TRÊS seções** (`js/app.js`, `DESTINOS`):

```
ajustes: [ orcamento, configuracoes, relatorios ]
```

Empilhar era o estado intermediário honesto das rodadas 2 a 7. A sua rodada é
a que **funde as três numa tela só** e encerra a lista.

### O que entra na tela

Pela ordem de quanto se mexe: **categorias · regras de classificação ·
orçamento · backup/restore · conta**.

- **Categorias** — `js/configuracoes.js`, sub-aba `cfg-categorias`.
- **Regras de classificação (regex)** — `cfg-regras`.
- **Orçamento** — já mora em Ajustes desde a rodada 3 (decisão da usuária:
  definir teto de categoria se faz uma vez e não se olha de novo). O editor é
  `js/orcamento.js`, escrevendo em `#orcamento-editor`; o markup dele é o único
  de Ajustes que **está no `index.html`** (seção `#tab-orcamento`, já em
  `.folha`, com `id="orcamento-bloco"`).
- **Backup/restore** — `cfg-backup`.
- **Conta** — `cfg-conta`, com "Sair da conta" (que no celular só existe aqui).

### O que SOME — e é a única pergunta pendente do plano

São as **três únicas capacidades que somem de verdade** em toda a sequência de
8 rodadas:

1. **`js/relatorios.js` inteiro** — seis relatórios fixos para uma pessoa só,
   e cada tabela do app já exporta o próprio CSV.
2. **As estatísticas de armazenamento** (`#storage-stats`, em `cfg-backup`).
3. **O wipe de coleção DA INTERFACE** (`#btn-wipe-collection` e
   `#wipe-collection-select`). A função `wipeCollection` **fica em `db.js`**.

**A usuária já foi perguntada no fim da rodada 7 e a resposta ainda não veio.**
Se ela não tiver respondido até você começar: **pergunte antes de apagar**, e
enquanto isso faça todo o resto da rodada. Não é motivo para travar a rodada
inteira — é motivo para não apagar arquivo sem resposta.

Se a resposta for "pode sumir": apague `js/relatorios.js`, tire `relatorios`
de `DESTINOS` e de `APELIDOS`, e tire a `<section id="tab-relatorios">` do
`index.html`.

### Armadilhas desta rodada especificamente

- **`configuracoes.js` monta a seção inteira por JS.** A `<section
  id="tab-configuracoes">` no `index.html` é **vazia de propósito**. Editar
  markup de Configurações no HTML não tem efeito nenhum — já foi tentado uma
  vez e o markup virou cópia morta que divergia do que o módulo montava.
- **As sub-abas de hoje (`.config-tabs` / `.config-section`) são vocabulário
  antigo**, não do híbrido. Decida se a tela nova tem abas ou se são cinco
  `.folha` empilhadas — cinco blocos numa página que rola é mais parecido com
  o resto do app depois da rodada 1 ("A PÁGINA ROLA"), e Ajustes é a tela que
  menos se visita. Se mantiver abas, elas existem no app desde a rodada 6:
  `.imp-abas` / `.imp-aba` em `css/style.css`. **Reusar, não criar um terceiro
  jeito de fazer aba.**
- **`settings` não entra em backup/restore nem no wipe** — mas
  `settings/fluxo` ENTRA no backup/restore e **não** no wipe, indo fora de
  `data` no JSON, e **o que já existe vence o que vem do arquivo**. Está em
  `CLAUDE.md`, "Decisões da rodada A8 que viram regra". Não mexa nisso.
- **O offset de competência da fatura NÃO volta para cá.** Ele foi para
  Importar na rodada 6 e em `cfg-preferencias` ficou só um ponteiro com
  `data-goto="importar"`. Com ele fora, a sub-aba "Preferências" tem só esse
  ponteiro — decida se ela vira um rodapé de "onde foram parar os ajustes que
  mudaram de casa" (o dia de vencimento da fatura foi para Adiante na rodada 4
  pela mesma razão) ou se some, com os ponteiros indo para o pé da tela.
- **`.btn-2` e `.imp-lote-btn`/`.conferir-btn` já existem.** `.ir` é um
  quadrado de 28px para o glifo "↗" e texto dentro dele quebra em três linhas —
  armadilha já paga três vezes (`.guardado-toggle`, `.imp-lote-btn`,
  `.conferir-btn`). Não caia na quarta.
- **`confirm()` nativo continua sendo o certo nas exclusões**, deliberadamente.

---

## 3. Como trabalhar

- **Terminar com o app funcionando.**
- **Conferir, não supor.** Contraste se roda, largura se mede, rolagem
  horizontal se testa no navegador.
- **Comentário em português explicando o PORQUÊ, não o quê.**
- **Atualizar o `CLAUDE.md` ao fim da rodada** — e, por ser a última, escrever
  o fecho da sequência.
- **Se alguma regra de negócio parecer que precisa mudar, pare e pergunte.**

### Critérios de aceitação

```bash
node redesign-v2/direcoes/contraste-hibrido.mjs   # "Tudo passa no mínimo exigido"
node --test test/*.test.mjs                        # 68/68, e nenhum teste pode precisar mudar
```

- Sem rolagem horizontal em 1420, 1120, 1000, 900 e 375px.
- Nenhum azul em `css/` nem em `js/`, em papel nenhum.
- Todo `innerHTML` com dado externo passa por `esc()`.
- Gráfico lê cor por `getComputedStyle`, nunca HEX literal.
- Coluna de valor com `tabular-nums` e centavos sempre visíveis.
- Larguras de coluna **no CSS**, nunca em `style=`.
- As telas renderizam sem erro no console — **todas as sete**, com dados e
  vazias.

### Quatro armadilhas já pagas, não caia de novo

1. **`overflow` em contêiner de tabela mata o `<thead>` sticky.** Nenhum
   overflow, `table-layout: fixed`, larguras no CSS, `overflow-wrap: break-word`.
2. **`esconde-sm` tem que ir no `<th>` E no `<td>`**, senão as colunas
   desalinham no celular.
3. **O `top` do `<thead>` sticky é `var(--topbar-h)`, não 0.**
4. **`.ir` é um quadrado de 28px.** Botão de texto pequeno precisa de classe
   própria.

E uma quinta, medida na rodada 7: **o `padding-left: 16px` de `td + td` come
48px antes de qualquer coluna.** A 375px a folha tem ~343px por dentro — some
as larguras fixas ANTES de escolhê-las, senão a descrição quebra uma letra por
linha.

### Como testar sem login

Não dá para logar com Google no preview. O caminho usado nas rodadas 3 a 7:

1. `preview_start` — há uma entrada por porta em `.claude/launch.json`
   (4321 a 4325). Use uma livre e adicione outra se precisar.
2. No navegador: esconder `#login-screen`, mostrar `#app`, e injetar dados
   pelo próprio módulo — `const u = await import('/js/utils.js')` devolve a
   MESMA instância que o app usa, então mutar `u.state` e chamar
   `switchTab('ajustes')` re-renderiza com os dados de teste.
3. Para medir rolagem horizontal, **use `resize_window` de verdade**: encolher
   o `#app` por JS não faz o `<canvas>` do Chart.js refluir e dá falso
   positivo.
4. Meça largura de célula pelo DOM (`getBoundingClientRect`), não pelo olho no
   screenshot: foi assim que o bug de "uma letra por linha" apareceu.
5. Se `computer:screenshot` devolver imagem congelada, meia pintada ou
   repetida em mosaico, é o pane e não a página: confira por `get_page_text` e
   por medição no DOM.
6. O buffer de `read_console_messages` **sobrevive a navegações**. Para
   confirmar "zero erro no console", abra uma aba nova.

**Isso NÃO substitui a conferência dela com os dados reais** — diga isso no
fim da rodada, junto com a lista das telas que seguem pendentes dessa olhada:
Cartão, Guardado, Importar e Conferir.
