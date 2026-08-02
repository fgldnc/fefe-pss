# Prompt — Rodada 1: procedência da classificação na importação

## Contexto do projeto

Radar Financeiro: app web de controle financeiro pessoal. JavaScript puro com ES
modules, servido direto do disco. **Sem build step, sem bundler, sem npm, sem
framework.** Firebase Auth + Firestore, dados sob `users/{uid}/`. Chart.js e
PDF.js vêm de CDN como globais. `js/utils.js` não pode importar nenhum outro
módulo do projeto (dependência circular). Todo HTML gerado a partir de dado
importado passa por `esc()`.

Há dois fluxos de importação:

- **Extrato bancário** — `js/extratos.js` + `js/parsers/{csv,ofx,pdf-statement}-parser.js`,
  que classificam via `autoClassify()` de `js/parsers/base-parser.js`.
- **Fatura de cartão em PDF** — `js/pdf-import.js`, que **não** usa
  `autoClassify()`; tem uma heurística própria, `catSuggest()`, baseada em
  `descrição.includes(nome_da_categoria)`.

## Problema a resolver

Quando o app classifica um lançamento na importação, a interface não distingue
uma classificação por regra de um chute. O usuário aceita o lote inteiro porque
nenhuma linha lhe dá motivo para desconfiar. O erro entra na base e contamina
Dashboard, Gastos, Orçamento e Fluxo de Caixa.

Esta rodada resolve **só a camada de dado**. Nenhuma mudança visual. A
sinalização na tela é a rodada seguinte e depende dos campos criados aqui.

## O que mudar

### 1. `js/parsers/base-parser.js` — `autoClassify()` passa a declarar a origem

Assinatura permanece `autoClassify(description, amount, userRules = [])`.
O retorno passa de `{ type, category }` para `{ type, category, origin }`:

| `origin`         | Quando                                                     |
|------------------|------------------------------------------------------------|
| `'user-rule'`    | Casou uma regra do usuário (`userRules`)                    |
| `'default-rule'` | Casou uma regra de `DEFAULT_RULES`                          |
| `'fallback'`     | Nenhuma regra casou; o tipo saiu do sinal do valor          |

**Mudança de comportamento deliberada:** hoje o ramo de fallback retorna
`category: 'outros'`. Passa a retornar `category: null`. O motivo: `'outros'` é
uma categoria legítima que o usuário pode escolher de propósito; usá-la também
como "não sei" torna as duas situações indistinguíveis, e é exatamente essa
confusão que a rodada existe para desfazer. A partir daqui, categoria vazia
significa "o app não sabe" e a rodada 2 vai marcá-la visualmente.

Uma regra que casa e define `category: null` de propósito (as de `transfer`, as
de receita genérica) continua devolvendo `null` — mas com `origin` de regra, não
de fallback. A distinção entre "null porque casou uma regra sem categoria" e
"null porque nada casou" é lida pelo `origin`, nunca pela categoria.

Comentar no código o **porquê** dessa escolha, no padrão dos comentários já
existentes no arquivo.

### 2. Os três parsers de extrato propagam a origem

Em `csv-parser.js`, `ofx-parser.js` e `pdf-statement-parser.js`, onde hoje se lê
`const cls = autoClassify(...)`, gravar no item um campo plano:

```js
classificationOrigin: cls.origin,
```

Campo plano, não objeto aninhado — o item já é gravado direto no Firestore e
objeto aninhado complica consulta e restore. Manter ao lado de `source`, que já
existe e continua significando outra coisa (`'statement_import'` = de onde veio o
arquivo; `classificationOrigin` = como a categoria foi decidida).

### 3. `js/pdf-import.js` usa a mesma heurística do extrato

Remover `catSuggest()`. Em `_showPreview()`, substituir a sugestão de categoria
por:

```js
import { autoClassify } from './parsers/base-parser.js';
import { resolveCategoryId, state } from './utils.js';

const cls = autoClassify(item.description, item.amount, state.importRules);
const sugId = resolveCategoryId(cls.category);
```

`autoClassify` devolve **slug** (`'alimentacao'`); `resolveCategoryId()` de
`utils.js` traduz slug → ID real da categoria do usuário. Guardar
`_parsedItems[idx]._categoryId = sugId` como já é feito hoje, e também
`_parsedItems[idx].classificationOrigin = cls.origin`.

Fatura de cartão é sempre despesa: **ignorar** o `cls.type` neste fluxo e manter
`paymentType: 'cartao'` como está. Só a categoria e a origem vêm do
`autoClassify`.

Se o usuário alterar a categoria no `<select>` da linha, `classificationOrigin`
daquele item passa a `'manual'`. Vale para os dois fluxos de importação — no
extrato, o listener de `data-field="categoryId"` em `extratos.js` faz o mesmo.

### 4. Competência da fatura declara se foi inferida

Em `pdf-import.js`, `#pdf-competencia` é pré-preenchido a partir da data do
primeiro lançamento mais o offset de `localStorage.fluxo_billing_offset`. Como
o campo aparece preenchido, tem aparência de valor confirmado.

Registrar em `_parsedMeta` um `competenceSource`, inicialmente `'inferred'`, que
vira `'manual'` no primeiro evento `input` ou `change` disparado pelo usuário
sobre `#pdf-competencia`. Gravar o valor final em cada transação salva
(`tx.competenceSource`), incluindo as parcelas projetadas.

### 5. Ano da data também é inferido — registrar como

`_applyYear(items, anoBase)` deduz o ano de cada lançamento. Quando `anoBase`
existe, a dedução vem do cabeçalho da fatura; quando é `null`, vem do relógio da
máquina, que é bem menos confiável. Gravar no item:

```js
dateYearSource: anoBase ? 'invoice-header' : 'assumed-current'
```

e propagar para a transação salva em `_confirmarImportacao()`, inclusive nas
projetadas.

### 6. Persistência e compatibilidade retroativa

Os campos novos (`classificationOrigin`, `competenceSource`, `dateYearSource`)
são gravados em `saveTx()` junto com o resto. Registro antigo não tem nenhum
deles: **toda leitura precisa tratar ausência como desconhecido e nunca quebrar
a tela**. Não escrever migração e não retroagir dado existente.

Conferir se `js/db.js` tem alguma allowlist de campos no caminho de escrita ou de
restore de backup que precise incluir os três — se tiver, incluir; se não tiver,
não criar uma.

### 7. Testes

`test/base-parser.test.mjs` compara o retorno de `autoClassify` com
`assert.deepEqual` contra o objeto inteiro. Esses casos vão falhar assim que o
campo `origin` entrar. Atualizá-los e acrescentar cobertura para:

- regra do usuário casou → `origin === 'user-rule'`
- regra padrão casou → `origin === 'default-rule'`
- descrição sem correspondência → `origin === 'fallback'` **e** `category === null`
- regra de transferência (`pagamento de fatura`) → `category === null` **e**
  `origin === 'default-rule'`, provando que os dois `null` se distinguem
- regex de usuário inválido → cai nas regras padrão, `origin === 'default-rule'`

## Restrições

- Sem framework, sem bundler, sem npm, sem dependência nova.
- ES modules com caminho relativo fixo; `utils.js` continua sem importar módulo
  do projeto; `app.js` continua sem import estático de módulo de aba.
- **Nenhuma mudança de CSS e nenhuma mudança visual.** Se algo na tela mudar de
  aparência nesta rodada, o escopo foi ultrapassado. A única alteração visível
  aceitável é o `<select>` de categoria vir vazio onde antes vinha "Outros" por
  fallback — que é a consequência pretendida do item 1.
- `esc()` em toda interpolação de `innerHTML` com dado importado.
- Não mexer em regra de projeção de parcela, em dedupe, em `_tolerancia()` nem no
  fingerprint de fatura.
- Comentários em português explicando o porquê, não o quê.

## Critério de pronto

1. `node --test test/` passa inteiro, com os casos novos.
2. Importando uma fatura PDF de teste, `_parsedItems` no console mostra
   `classificationOrigin` preenchido em todos os itens, com pelo menos um
   `'fallback'` e pelo menos um `'default-rule'` num PDF com estabelecimentos
   variados.
3. Um lançamento cuja descrição não casa com nenhuma regra chega ao preview com
   o `<select>` de categoria vazio — não em "Outros".
4. Alterar a categoria de uma linha no preview muda o `classificationOrigin`
   daquele item para `'manual'`.
5. Salvando o lote, os documentos gravados no Firestore contêm
   `classificationOrigin`, `competenceSource` e `dateYearSource`, e as parcelas
   projetadas herdam os três.
6. Abrir Dashboard, Gastos, Extratos, Fluxo de Caixa e Timeline com dados antigos
   (sem os campos novos) não gera erro no console nem célula vazia inesperada.
7. Diff não contém alteração em `css/style.css` nem em `css/components.css`.

## Sinal de que NÃO funcionou

Categoria "Outros" continuando a aparecer preenchida em lançamentos que nenhuma
regra reconhece. Se isso acontecer, o fallback do `autoClassify` não foi trocado
ou o `resolveCategoryId` está resolvendo `null` para a categoria "Outros" por
aproximação de nome — checar `_SLUG_TO_NAME` em `utils.js`, que mapeia
`encargos` e `outros` ambos para `'outros'`.
