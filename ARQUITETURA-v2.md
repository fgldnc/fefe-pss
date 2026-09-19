# ARQUITETURA v2 — três propostas, uma recomendação

Base: `INVENTARIO-FUNCOES.md` (as referências `E*` e `C*` abaixo são daquela
tabela). Critério: o ciclo real de uso, nesta ordem —

1. importar fatura PDF + extrato;
2. conferir o que o app deduziu;
3. durante o mês, conferir gasto linha a linha e corrigir categoria;
4. ver em que dia o caixa aperta.

Uso de uma pessoa só. Tudo que não serve a esses quatro passos é secundário
por definição.

## O problema de hoje, em números

- **11 destinos de primeiro nível** numa sidebar (`index.html:60-124`).
  Material Design 3 recomenda **3 a 5** numa barra de navegação
  (`PESQUISA-UX.md` §8). Abaixo de 768px a sidebar vira gaveta: 11 itens em
  gaveta são 2 toques para qualquer coisa.
- **Cliques até cada passo do ciclo, hoje** (partindo da tela inicial):

  | passo | cliques | caminho |
  |---|---|---|
  | 1a. importar fatura | 3 | Gastos → Importar Fatura PDF → escolher arquivo |
  | 1b. importar extrato | 4 | Extratos → Importar Extrato → banco → formato → arquivo |
  | 2. conferir a dedução | 0 extra | o modal já abre na revisão |
  | 3. corrigir categoria de um gasto | 3 | Gastos → ✎ na linha → salvar |
  | 4. ver o dia apertado | 1 | Fluxo de Caixa |

  O ciclo não está lento. O que está errado é que **duas portas diferentes**
  fazem a mesma coisa (fatura entra por Gastos, extrato entra por Extratos), e
  que dois números que mandam no resultado (E26 offset, E27 vencimento) estão
  na 4ª sub-aba de Configurações.

## Restrições de roteamento (valem para as três)

`TAB_MODULES` (`js/app.js:19-31`) mapeia `data-tab` → `import()` dinâmico →
`render*()` sem argumentos. Fundir telas tem exatamente dois caminhos, ambos
possíveis sem build step:

- **(a) módulo-casca**: um novo arquivo (ex. `js/tela-mes.js`) exporta
  `renderMes()`, e dentro dele chama os `render*` existentes, cada um apontado
  para um `<section>` diferente. Os módulos atuais continuam existindo
  intactos. Custo baixo, risco baixo. **Só funciona se cada `render*` escrever
  num container próprio** — hoje `renderRelatorios`, `renderTimeline`,
  `renderCalendario` e `renderConfiguracoes` escrevem em
  `#tab-<nome>` por id fixo, então o casca precisa criar esses ids dentro de
  si, ou os módulos passam a aceitar um container.
- **(b) sub-rota**: `switchTab(name)` ganha um segundo nível
  (`switchTab('mes', 'gastos')`), e a sub-navegação vira parte do shell. Custo
  médio: mexe em `switchTab`, nos listeners de `.nav-link`, no `_goto`
  (`js/app.js:63`, que hoje passa só `data-goto`) e no command palette.

Nas três propostas, `index.html` perde a sidebar de 4 grupos e ganha uma
navegação curta; as `<section id="tab-*">` existentes **não precisam mudar de
id** — mudam de pai.

---

# Alternativa A — "Quatro destinos" (fusão por objeto)

Agrupa pelo **tipo de coisa** que a tela trata.

```
Mês        Fluxo        Planos        Ajustes
```

| destino | 1º nível | 2º nível (segmento dentro da tela) | modal |
|---|---|---|---|
| **Mês** | KPIs (C1, C3) + registro único | segmentos `Gastos · Receitas · Importações` sobre UMA tabela | importar (E1/E6), novo lançamento (E9/E14), editar (E12) |
| **Fluxo** | 3 KPIs (C19) + curva (C20) + tabela de dias (C21) | seção "Contratos em aberto" (C26) e "Parcelas previstas" (C6) abaixo | — |
| **Planos** | Orçamento (C13/E23) | seções roláveis: Metas (C14), Patrimônio (C15-C18) | meta (E16), ativo (E17), aporte (E18) |
| **Ajustes** | Categorias (E24), Regras (E25), Preferências (E26/E27), Backup (E28/E29), Conta | — | — |

**Fundido:** C9+C24 numa tabela (§4.2 do inventário) · C12 vira segmento dessa
tabela · C23 vira o terceiro segmento · Dashboard deixa de ser destino e vira
o topo de "Mês" · Orçamento+Metas+Patrimônio numa tela.
**Eliminado:** C25 (feed da Timeline), C28 (estatísticas), E22 (onboarding),
E35 (command palette), C16 (rosca de composição do patrimônio, redundante com
C15). C27 vira um botão "Exportar CSV" no cabeçalho de cada tabela.
**Promovido:** C26 para dentro de Fluxo.

**Mais rápido:** uma porta só para dado que entra; gasto e receita do mês na
mesma tabela (hoje são duas abas para responder "o que aconteceu em março").
**Mais lento:** Planos vira uma tela longa com três assuntos; quem quer só
mexer no orçamento rola por metas e patrimônio. Dashboard perde a "capa" — o
gráfico de evolução (C5) desce para o fim de Mês.

**Cliques no ciclo:** 1a/1b = 2 (Mês → Importar; o modal detecta fatura vs.
extrato pelo formato escolhido) · 2 = 0 · 3 = 2 (a tabela já é a tela inicial
de Mês) · 4 = 1.

**Custo:** caminho (a), módulo-casca. `TAB_MODULES` cai de 11 para 4 entradas.
`js/gastos.js`, `js/receitas.js` e `js/extratos.js` precisam aceitar um
container e um filtro de segmento — mudança real, mas dentro de cada módulo.
`js/timeline.js` perde `_renderFeed` (`:51`-`:190`) e sobra `_renderContratos`
(`:198`), que passa a ser chamado por Fluxo. `index.html` perde a sidebar e as
seções `#tab-timeline` e `#tab-relatorios`.

---

# Alternativa B — "O ciclo do mês" (fusão por momento de uso) ★

Agrupa pelo **momento** em que a pessoa está. É a lista dos quatro passos, na
ordem deles, mais os ajustes.

```
Importar      Conferir      Mês      Adiante      ⚙
   (1)           (2)        (3)        (4)
```

| destino | o que é | capacidades |
|---|---|---|
| **Importar** | Tela de verdade, não modal. Drop zone única para PDF/OFX/CSV; o app decide se é fatura ou extrato pelo conteúdo, e a pessoa corrige se errar. Abaixo, o histórico de lotes. A revisão abre em tela cheia dentro desta tela. Aqui moram o offset de competência (E26) e a frase de privacidade ("roda no seu navegador"). | E1-E8, E31, C23, E26 |
| **Conferir** | A fila do que ficou pendente **depois** de salvar, não só dentro do modal. Três listas: sem categoria, parcela projetada de mês já vencido, possível duplicata. Cada linha corrige no lugar. Zera → estado vazio comemorativo. | E11, E12, C29, C8 |
| **Mês** | KPIs (C1, C3), uma tabela única de gastos+receitas com filtros, rosca (C4) e evolução (C5), orçamento × real (C7). | C1-C12, E9, E14, E15, E23 |
| **Adiante** | Tudo que é futuro: curva de saldo (C19-C22) com saldo inicial (E20/E21) e **dia de vencimento (E27) ao lado dele**; contratos em aberto (C26); parcelas previstas (C6); metas (C14/E16); patrimônio (C15/C17/C18). | C6, C14-C22, C26, E16-E21, E27 |
| **⚙** | Categorias (E24), regras (E25), backup (E28/E29), conta (E32), tema (E33). | E24-E33 |

**Fundido:** as duas portas de importação numa só · gastos+receitas+extratos
numa tabela · orçamento passa para Mês (é leitura do mês, não plano) · metas e
patrimônio descem para Adiante.
**Eliminado:** os mesmos de A, mais E30 (wipe).
**Promovido:** E27 sai de Configurações e encosta em E20, que é o outro número
declarado à mão; E26 sai de Configurações e encosta na importação; C26 ganha
bloco próprio; **E4 ganha voz** — o resumo do import passa a dizer "3 parcelas
previstas foram confirmadas pela fatura".

**O "Conferir" não exige mudança de modelo.** A fila é derivável do `state` de
hoje: `_pendenciasExtrato` (`js/app.js:106`) já calcula a primeira lista;
"parcela projetada de competência ≤ mês atual" é `tx.isProjected &&
competenceMonth <= currentMonth`; duplicata sai de `detectDuplicates`
(`js/parsers/base-parser.js`). O campo persistente que o `PESQUISA-UX.md` §10
recomenda (o `approved` do YNAB) melhora a tela, mas não é pré-requisito.

**Mais rápido:** o app passa a ter uma tela que responde "o que ainda falta de
mim?" — hoje não existe nenhuma, e o âmbar morre no instante em que se salva
(`PESQUISA-UX.md` §11.1). Importar deixa de exigir que a pessoa saiba de
antemão se o arquivo é fatura ou extrato.
**Mais lento:** ver o dashboard no dia 20, com nada a conferir, custa passar
por uma aba "Conferir" vazia na barra. E "Adiante" acumula quatro assuntos
(fluxo, contratos, metas, patrimônio) — é a tela mais longa das cinco.

**Cliques no ciclo:** 1a/1b = 2 (Importar → arrastar arquivo) · 2 = 0 (a
revisão é a própria tela) e **re-conferir depois custa 1**, o que hoje é
impossível · 3 = 2 (Mês → ✎) ou 1 a partir de Conferir · 4 = 1.

**Custo:** caminho (a) para Mês e Adiante, caminho (b) só se quiser deep-link
para uma seção. `TAB_MODULES` fica com 5 entradas. Arquivo novo
`js/conferir.js` (tela que não existe hoje; ~150 linhas, toda derivada de
`state`). `js/extratos.js` se divide: a parte de importação vai para a tela
Importar, a tabela (C24) morre fundida em Mês. `js/pdf-import.js` passa a
renderizar na tela, não no `#modal-pdf` — é o maior item de trabalho da
proposta, e não toca em nenhuma regra de negócio (`competenciaDaFatura`,
`_tolerancia`, `_acharParcela` ficam como estão).

---

# Alternativa C — "Duas telas" (mínima)

```
Mês          Adiante          ⚙
```

Tudo que é do passado numa tela, tudo que é do futuro em outra, ajustes na
engrenagem. Importar e conferir voltam a ser modal, mas com **uma** porta.

| destino | conteúdo |
|---|---|
| **Mês** | KPIs · botão Importar (abre modal com revisão) · tabela única · rosca · evolução · orçamento × real |
| **Adiante** | Curva de saldo · contratos em aberto · parcelas previstas · metas · patrimônio |
| **⚙** | categorias, regras, preferências, backup, conta |

**Eliminado:** tudo de A e B, mais a tela de conferência (volta a ser um
banner "3 lançamentos sem categoria · corrigir" no topo de Mês).

**Mais rápido:** no celular cabe folgado em barra inferior (3 destinos, dentro
do limite do MD3); o app inteiro passa a ser duas páginas e nunca se perde
nada de vista.
**Mais lento:** "Mês" carrega sete blocos e **volta a rolar muito**; a
pendência vira um banner que dá para ignorar, que é o problema que o
`PESQUISA-UX.md` §1 identifica; e patrimônio/metas (uso raro) ficam grudados
em fluxo de caixa (uso mensal) só porque ambos "são futuro".

**Cliques:** 1 = 2 · 2 = 0 · 3 = 2 · 4 = 1. Igual a B no papel — e pior na
prática, porque o passo 2 deixa de ter endereço.

**Custo:** o menor dos três. `TAB_MODULES` com 3 entradas, dois módulos-casca,
nenhum arquivo novo, nenhum módulo reescrito. `js/pdf-import.js` e
`js/extratos.js` continuam em modal exatamente como estão.

---

# Recomendação: **B**

O que decidiu:

1. **A navegação passa a ser a lista do que a pessoa faz, na ordem em que
   faz.** A e C agrupam por tipo de objeto ("coisas do mês", "coisas do
   futuro") — uma taxonomia que só existe para quem já conhece o app. B nomeia
   os quatro passos do ciclo e põe cada um no seu lugar. Quem abre o app no dia
   3 do mês lê "Importar" primeiro; quem abre no dia 20 lê "Mês".
2. **É a única das três que resolve o achado nº 1 da pesquisa.** Hoje a dedução
   do app vira fato no instante em que o modal fecha, e não sobra rastro
   (`PESQUISA-UX.md` §1 e §11.1). "Conferir" dá endereço a essa pendência sem
   exigir mudança de modelo de dados.
3. **Tira os dois números perigosos do porão.** E27 (vencimento) e E26 (offset)
   decidem, respectivamente, o "menor saldo" da curva e o mês inteiro de uma
   fatura — e hoje moram na 4ª sub-aba de Configurações, longe da consequência.
   Em B eles ficam encostados no dado que afetam.
4. **Cinco destinos está dentro do limite publicado** (MD3: 3 a 5), então a
   mesma barra serve de sidebar no desktop e de barra inferior no celular sem
   inventar um segundo nível.
5. **O custo cabe.** Um módulo novo pequeno, dois módulos-casca, e uma migração
   de modal para tela em `pdf-import.js` — nenhuma regra de negócio tocada.

O que B custa e eu aceito: a aba "Conferir" vazia na maior parte do mês. A
mitigação é o contador — sem pendência, o item fica apagado e sem número, do
mesmo jeito que `atualizarBadgeExtratos` (`js/app.js:118`) já esconde o zero
hoje. Silêncio quando está tudo certo continua sendo a regra.

**Se o trabalho de tirar a importação do modal for grande demais para uma
rodada**, a degradação limpa é: adotar a navegação de B, manter `#modal-pdf` e
`#modal-extrato` como estão e fazer "Importar" ser uma tela com a drop zone e o
histórico, que abre o modal existente. Os cliques do ciclo não mudam.

## Resumo do custo em `js/app.js` e `index.html` (proposta B)

| arquivo | mudança |
|---|---|
| `js/app.js:19-31` | `TAB_MODULES` de 11 para 5: `importar`, `conferir`, `mes`, `adiante`, `ajustes` |
| `js/app.js:63` `_goto` | continua valendo; os `data-goto` existentes (`calendario`, `gastos`, `patrimonio`) passam a apontar para `adiante`/`mes` |
| `js/app.js:106` `_pendenciasExtrato` | vira a base da tela Conferir; sai de `app.js` para `js/conferir.js` e `app.js` só lê o total para o badge |
| `js/app.js:135-250` | command palette removida (E35) |
| `js/app.js:252-318` | onboarding removido (E22) |
| `js/app.js:~430` `btn-novo-extrato` | some: a importação deixa de ser modal aberto pelo shell |
| `index.html:60-124` | sidebar de 4 grupos → barra de 5 destinos (mesma marcação serve para `<aside>` no desktop e `<nav>` fixo no rodapé abaixo de 768px) |
| `index.html:257,496,498,500` | `#tab-calendario`, `#tab-configuracoes`, `#tab-timeline`, `#tab-relatorios` → renomeados/absorvidos |
| `index.html:508-745` | os 9 modais caem para 5 (gasto, receita, ativo, meta, aporte); `#modal-pdf` e `#modal-extrato` viram tela; `#modal-categoria` vai para Ajustes |
| arquivo novo | `js/conferir.js` |
| arquivos que somem | `js/relatorios.js` (vira um `exportarCSV` em `utils.js`); `js/timeline.js` reduz a `_renderContratos` |
