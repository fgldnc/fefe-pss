# Prompt — Rodada 2: sinalização visual da revisão de importação

## Contexto do projeto

Radar Financeiro: app web de controle financeiro pessoal. JavaScript puro com ES
modules, servido direto do disco. **Sem build step, sem bundler, sem npm, sem
framework.** A UI é `innerHTML` + `addEventListener`. Firebase Auth + Firestore.
Chart.js e PDF.js vêm de CDN como globais. `js/utils.js` não importa nenhum
outro módulo do projeto. Todo HTML gerado a partir de dado importado passa por
`esc()`. `index.html` é o shell único: todos os modais vivem lá; os módulos
preenchem via `innerHTML`.

Dois fluxos de importação, ambos com uma tela de revisão em modal:

- **Fatura de cartão PDF** — `js/pdf-import.js`, modal `#modal-pdf`,
  preview em `#pdf-preview-tbody`, função `_showPreview()`.
- **Extrato bancário** — `js/extratos.js`, modal `#modal-extrato`,
  preview em `#extrato-preview-tbody`.

A rodada anterior (ver `PROMPT-rodada-1.md`, já executada) criou os campos de
procedência que esta rodada consome. Eles já existem e já são gravados:

| Campo | Valores | Onde |
|---|---|---|
| `classificationOrigin` | `user-rule` · `default-rule` · `fallback` · `manual` | ambos os fluxos |
| `competenceSource` | `inferred` · `manual` | só fatura (`_parsedMeta`) |
| `dateYearSource` | `invoice-header` · `assumed-current` | só fatura, por item |
| `isDuplicate` | boolean | hoje só extrato |
| `isProjected` | boolean | parcelas projetadas |

## Problema a resolver

Os campos de procedência existem na base, mas nada na tela os mostra. A revisão
continua sem dar motivo para desconfiar de uma linha específica, e o usuário
aceita o lote inteiro. Esta rodada torna a procedência visível — e só ela.

## Princípio de desenho (não negociar durante a implementação)

**A marca vai no próprio campo que precisa ser corrigido, não numa coluna de
status separada.** Coluna de status faz o olho ir para a direita e a mão agir na
esquerda. O sinal e a correção ficam no mesmo lugar.

**Silêncio é o sinal de que está tudo bem.** Campo classificado por regra não
recebe marca nenhuma. É a ausência de marca na maioria das linhas que faz as
poucas linhas marcadas saltarem. Não marcar `user-rule` diferente de
`default-rule`: o usuário não age diferente nos dois casos, então distinguir
seria ruído.

**Um símbolo só para "o app deduziu": o losango `◇`.** Aparece na competência,
no ano da data e na categoria vazia. Um vocabulário, três lugares.

## O que mudar

### 1. Vocabulário visual — `css/components.css`

Estender o que já existe (`.tag-projetada`, `.tag-duplicata` nas linhas 105–106).
Não criar sistema paralelo. Adicionar:

- `.mark-inferido` — losango `◇` + texto curto, `font-size: 0.69rem`,
  `color: var(--warning)`. Usado inline, ao lado do campo.
- `.field-inferido` — modificador de `<select>` / `<input>`:
  `border-color: var(--warning)`, `color: var(--warning)`.
- `.field-editado` — modificador para campo que o usuário alterou:
  `border-color: var(--border-strong)` (o azul já existente). Sem texto.
- `.row-atencao` — fundo `rgba(251,191,36,0.05)` na `<tr>` que tem qualquer
  pendência. Sutil: é fundo, não borda.

Cores **apenas** dos tokens já declarados no `:root` de `css/style.css`.
`--warning` (`#fbbf24`) é o único tom de atenção. Nenhum verde e nenhum vermelho
nesta tela: eles significam entrada e saída na identidade do Radar e já estão em
uso na coluna de valor — reusá-los como "ok / problema" criaria dois significados
para a mesma cor na mesma tabela.

### 2. Preview da fatura — `js/pdf-import.js`, `_showPreview()`

**Categoria.** Hoje o `<select>` é preenchido com a sugestão de `autoClassify()`.
Passa a variar conforme `classificationOrigin` do item:

- `fallback` → `<select>` vazio com classe `.field-inferido` e a opção vazia
  rotulada `◇ escolher` em vez de `—`. A linha ganha `.row-atencao`.
- `user-rule` / `default-rule` → sem classe extra, sem marca. Estado atual.
- `manual` (usuário mexeu) → troca para `.field-editado` e remove
  `.field-inferido` e o `.row-atencao` daquela linha, se ela não tiver outra
  pendência. O listener que já grava `'manual'` (`pdf-import.js:120`) é onde
  isso acontece.

**Ano deduzido.** Quando `item.dateYearSource === 'assumed-current'`, acrescentar
`<span class="mark-inferido">◇ ano deduzido</span>` ao lado da descrição, e
`.row-atencao` na linha. Quando for `'invoice-header'`, nada.

**Competência.** O `<input type="month" id="pdf-competencia">` recebe
`.field-inferido` enquanto `_parsedMeta.competenceSource === 'inferred'`, com a
frase `◇ deduzido do 1º lançamento · confirme` abaixo, em `.mark-inferido`.
No primeiro `input`/`change` do usuário, `competenceSource` vira `'manual'` (já
implementado) e ambos são removidos.

### 3. Duplicata provável na fatura — mover a checagem para o preview

Hoje a fatura só detecta repetição em dois momentos: o `fingerprint`, que bloqueia
o arquivo inteiro, e `_parcelaJaExiste()`, chamada em `_confirmarImportacao()`,
que **silenciosamente pula** parcelas já existentes e só reporta via toast depois
do fato. O usuário nunca vê qual linha foi ignorada.

Mudança: rodar a checagem no preview, não só no save.

- **Item parcelado** (`installmentTotal > 1`): reusar `_parcelaJaExiste()` como
  está. Não alterar a função, a tolerância nem `_tolerancia()`.
- **Item à vista**: usar `detectDuplicates()` de `parsers/base-parser.js` contra
  `[...state.transactions, ...(state.extratoTransactions || [])]`, do mesmo modo
  que `extratos.js:356` já faz.

Marcar o item com `isDuplicate: true` e exibir a `.tag-duplicata` já existente ao
lado da descrição, com `.row-atencao` na linha.

**A linha duplicada da fatura permanece MARCADA para importar.** Isto é
deliberado e diverge do extrato, onde a duplicata vem desmarcada. Motivo: o
`fingerprint` já impede reimportar o mesmo arquivo, então uma linha repetida
dentro de uma fatura nova é mais provavelmente uma compra genuinamente repetida
(mesmo dia, mesmo valor, mesmo estabelecimento) do que um erro. Desmarcar por
padrão perderia um gasto real em silêncio, que é pior que um aviso a mais.
Comentar esse porquê no código.

`_confirmarImportacao()` continua chamando `_parcelaJaExiste()` antes de gravar —
a checagem no preview é aviso, não substitui a proteção na escrita.

### 4. Preview do extrato — `js/extratos.js`

Aplicar o mesmo vocabulário ao `<select>` de categoria conforme
`classificationOrigin`. `isDuplicate` já é calculado e já desmarca a linha:
**manter esse comportamento**, só acrescentar `.row-atencao`. Não mexer em
`detectDuplicates()` nem no `dedupKey`.

### 5. Barra de resumo, nos dois modais

Acima da tabela de preview. No fluxo de extrato, substitui o
`#extrato-batch-header` atual (classe `.import-batch-header`, já estilizada);
no fluxo de fatura, substitui o `#pdf-info-text`.

Conteúdo: `N lançamentos` · `N sem categoria` · `N possível duplicata`, sendo
que os contadores de pendência só aparecem quando forem maiores que zero, e em
`--warning`. À direita, um botão `Ver só o que precisa de atenção`, que filtra a
tabela para as linhas com `.row-atencao` e alterna para `Ver todos`. Filtro
puramente client-side, escondendo `<tr>`; não re-renderizar a tabela, para não
perder edição em andamento.

O botão de filtro só aparece quando há pelo menos uma pendência.

### 6. Botão de confirmação nomeia o que está sendo aceito

Enquanto houver item selecionado com categoria vazia, o botão primário do modal
(`#btn-confirmar-pdf` e `#btn-confirmar-extrato`) muda para:

- rótulo `Salvar assim mesmo · N sem categoria`
- fundo `var(--warning)` com texto `var(--text-inverse)`

Sem pendência, volta a ser o botão azul padrão com o rótulo atual
(`Confirmar e Salvar`). **Nunca bloquear o salvamento** — salvar sem categoria é
uma escolha legítima; o botão só obriga a ler o número antes de clicar.
O rótulo recalcula a cada mudança de checkbox e de categoria.

### 7. Responsivo até 360px

Abaixo de 480px, a tabela de preview colapsa em cartão por lançamento:
descrição e valor na primeira linha, data e categoria na segunda, marcas de
atenção logo abaixo da descrição. A barra de resumo quebra em duas linhas, com o
botão de filtro em largura total. Nenhum scroll horizontal.

## Restrições

- Sem framework, sem bundler, sem npm, sem dependência nova.
- `esc()` em toda interpolação com dado importado — descrição de PDF, CSV e OFX
  é entrada não confiável.
- Só as cores do `:root` de `css/style.css`. Nenhum tom novo sem propor token.
- Raio: `--radius-sm` (6px) para controle, `--radius-md` (10px) para card.
- Outfit para texto, JetBrains Mono para valor, data e qualquer número em coluna.
- **Não reescrever parser, regra de classificação, projeção de parcela,
  `dedupKey`, `detectDuplicates`, `_tolerancia()` nem o fingerprint.** A rodada
  usa o que já existe; o único deslocamento permitido é chamar `_parcelaJaExiste()`
  e `detectDuplicates()` mais cedo, no preview.
- Estado de carregamento, vazio e erro previstos: preview sem nenhuma pendência
  não mostra barra de contadores de atenção nem botão de filtro.
- Compatibilidade retroativa: item sem `classificationOrigin` (importado antes
  da rodada 1) é tratado como sem marca, nunca como pendência.
- Dado financeiro real não aparece em exemplo nem em comentário.
- Comentários em português, explicando o porquê.

## Critério de pronto

1. Importando uma fatura com pelo menos um lançamento que nenhuma regra
   reconhece: a linha aparece com fundo âmbar sutil, `<select>` de categoria
   vazio com borda âmbar e a opção `◇ escolher`.
2. Escolher a categoria nessa linha remove a borda âmbar, remove o fundo da
   linha e decrementa o contador da barra de resumo e o rótulo do botão.
3. Linha classificada por regra não tem nenhuma marca visual.
4. Competência pré-preenchida aparece com borda âmbar e a frase de dedução;
   digitar um mês remove ambos.
5. Importar uma fatura contendo um lançamento já presente em
   `state.transactions` marca a linha com `.tag-duplicata` — e a linha continua
   **marcada** para importar.
6. No extrato, a duplicata continua vindo **desmarcada**, como hoje.
7. `Ver só o que precisa de atenção` esconde as linhas sem pendência e alterna
   o rótulo; editar uma categoria com o filtro ligado não perde a edição.
8. Sem nenhuma pendência: botão azul, rótulo `Confirmar e Salvar`, sem barra de
   atenção e sem botão de filtro.
9. Em 360px de largura, nenhum scroll horizontal em nenhum dos dois modais.
10. `node --test test/*.mjs` continua passando, com os 34 testes.
    (`node --test test/` falha por resolução de módulo — use o glob.)

## Sinal de que NÃO funcionou

Marca âmbar aparecendo na maioria das linhas. Se isso acontecer, ou
`classificationOrigin` não está sendo lido no preview e tudo caiu em `fallback`,
ou a regra de "sem marca quando veio de regra" foi invertida. Conferir no
console: `_parsedItems.map(i => i.classificationOrigin)` deve trazer maioria
`default-rule` num PDF de estabelecimentos comuns.
