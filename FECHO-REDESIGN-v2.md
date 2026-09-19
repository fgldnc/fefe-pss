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
