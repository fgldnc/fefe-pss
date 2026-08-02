# Auditoria técnica — fefe-pss (Radar Financeiro)

Data: 02/08/2026 · Base: `C:\Users\fefe\Downloads\github\fefe-pss` (todos os 27 arquivos rastreados foram lidos).
Escopo: correção de bugs, duplicação de parsing, segurança, consistência de dados, performance, acessibilidade, manutenibilidade e deploy. Sem reescrita em framework, sem dependência nova.

Arquivos entregues nesta auditoria:

| Arquivo | Estado |
|---|---|
| `js/parsers/pdf-layout.js` | **novo** — segmentação por coluna, compartilhado |
| `js/pdf-import.fixed.js` | **novo** — substitui `js/pdf-import.js` após validação |
| `firestore.rules` | **novo** — regras completas, ainda não publicadas |
| `js/parsers/base-parser.js` | **alterado** — `parseMoney` corrigido |
| `js/db.js` | **alterado** — `getAll` exportado (1 linha) |

---

## 1. Mapa do projeto

| Arquivo | O que faz |
|---|---|
| `index.html` | Shell único: config do Firebase inline, telas, todos os modais e o `<tbody>` de cada tabela. |
| `vercel.json` | Headers de segurança + CSP. Sem regras de cache. |
| `css/style.css` | Tokens de cor, layout base, sidebar, tabelas. |
| `css/components.css` | Componentes: toast, modal, tags, skeleton, drop zone. |
| `js/app.js` | Bootstrap, roteamento por `switchTab` com `import()` dinâmico, navegação de mês, command palette, onboarding. |
| `js/auth.js` | Login Google, `getUid()`, espera `window._FB` aparecer. |
| `js/db.js` | Toda a leitura/escrita do Firestore, `state` derivado, backup/restore, wipe de coleção. |
| `js/utils.js` | Estado global `state`, `esc`, `fmt`, datas, toast, skeletons e o motor de insights do dashboard. |
| `js/dashboard.js` | KPIs, gráfico de categorias (Chart.js), listas de parcelas e maiores gastos. |
| `js/gastos.js` | Tabela de gastos do mês, filtros básicos e avançados, lançamento manual, projeção de parcelas, gatilho do import de PDF. |
| `js/receitas.js` | CRUD de receitas do mês. |
| `js/orcamento.js` | Editor de limites por categoria do mês. |
| `js/metas.js` | CRUD de metas e aportes. |
| `js/patrimonio.js` | CRUD de ativos, aportes e vínculo com metas. |
| `js/saldos.js` | Fluxo de caixa diário / calendário de saldos (exporta `renderCalendario`). |
| `js/calendario.js` | Renderização de calendário de eventos financeiros. |
| `js/timeline.js` | Linha do tempo de eventos. |
| `js/relatorios.js` | Relatórios comparativos por mês/categoria. |
| `js/extratos.js` | Modal de importação de extrato (OFX/CSV/PDF), revisão, salvamento e exclusão de lote. |
| `js/configuracoes.js` | Categorias, regras de classificação, estatísticas, backup/restore, logout. |
| `js/pdf-import.js` | Importação de **fatura de cartão** em PDF: extração, parse, preview, projeção de parcelas. |
| `js/parsers/base-parser.js` | Utilitários compartilhados dos parsers de **extrato**: `parseMoney`, `parseDate`, `autoClassify`, dedupe. |
| `js/parsers/csv-parser.js` | Extrato em CSV. |
| `js/parsers/ofx-parser.js` | Extrato em OFX. |
| `js/parsers/pdf-statement-parser.js` | Extrato bancário em PDF, com parser por banco. |
| `CHANGELOG-review.md`, `README.md` | Documentação. |

---

## 2. Achados

### Achado 1 — CRÍTICO — Fatura de duas colunas é lida como uma coluna só

**Arquivo:** `js/pdf-import.js`, `_processPdf`, linhas 106–115.

```js
const byY = {};
for (const item of content.items) {
  const y = Math.round(item.transform[5] / 3) * 3;   // ← só Y
  byY[y] = byY[y] || [];
  byY[y].push(item.str);                             // ← X descartado
}
```

**O que está errado.** O agrupamento usa exclusivamente a coordenada Y. Numa fatura de duas colunas, todos os itens que estão na mesma altura da página — venham da coluna esquerda ("Lançamentos: compras e saques") ou da direita ("Compras parceladas - próximas faturas", "Total dos lançamentos atuais", "Limites de crédito") — caem no mesmo balde e são concatenados numa única string. Pior: `push(item.str)` guarda os textos na ordem em que o PDF os emitiu, que não é a ordem visual, então nem dentro da mesma coluna a linha é confiável.

`js/parsers/pdf-statement-parser.js` (linhas 32–44) tem o mesmo defeito de fundo — ordena por X dentro da faixa de Y, o que conserta a ordem das palavras, mas continua juntando as duas colunas na mesma linha.

**Efeito observável.**

1. Fusão de colunas: a linha montada contém data e descrição de um lançamento e valor de outra tabela. `RE_LINE` casa o último número da string, que pode ser o valor da parcela futura ou um limite de crédito. Valores "se misturam", exatamente como relatado.
2. Duplicação de parcelas: a linha `13/07 <ESTABELECIMENTO> P 01/06 <VALOR>` entra pela seção de lançamentos, e `13/07 <ESTABELECIMENTO> P 02/06 <VALOR−1 centavo>` entra pela tabela de próximas faturas. Como `_confirmarImportacao` já projeta 02/06…06/06 a partir da parcela 01/06, a segunda linha cria uma projeção concorrente.
3. O guard `_parcelaJaExiste` (linha 460) não pega, por dois motivos somados: `Math.abs(t.amount - amount) < 0.02` é menor que a diferença real de arredondamento entre parcelas, e `normDesc` compara a descrição contaminada pela fusão de colunas com a descrição limpa.

**Correção.** Três peças.

**(a) `js/parsers/pdf-layout.js` (novo, já criado).** Detecta as colunas a partir da distribuição real de X:

- monta um histograma de ocupação horizontal em buckets de 4 px usando `item.transform[4]` e `item.width`;
- procura "valas" — sequências de buckets vazios — com largura ≥ 4,5% da largura da página (`page.getViewport({scale:1}).width`), ignorando os 10% de cada borda, que são margem;
- corta no centro das valas mais largas (máx. 3 colunas), descarta faixas com menos de 5 itens (régua, rodapé, código de barras) e devolve as faixas ordenadas da esquerda para a direita;
- reconstrói as linhas **dentro** de cada faixa, agrupando por Y com tolerância de 3 px e ordenando por X;
- `extractColumnStreams(pdf)` devolve os fluxos na ordem de leitura: página 1 coluna esquerda inteira → página 1 coluna direita inteira → página 2 …

Nenhum limiar é fixo em pixels: todos derivam de `viewport.width`.

**(b) Máquina de estados de seção** em `js/pdf-import.fixed.js`:

```js
const SECTION_HEADERS = [
  { re: /lan[çc]amentos\s*:?\s*compras\s+e\s+saques/i,           mode: 'capture' },
  { re: /lan[çc]amentos\s+no\s+cart[aã]o/i,                       mode: 'capture' },
  { re: /lan[çc]amentos\s*:?\s*(nacionais|internacionais)/i,      mode: 'capture' },
  { re: /compras\s+parceladas\s*[-–—]?\s*pr[óo]ximas\s+faturas/i, mode: 'nextinvoice' },
  { re: /total\s+dos\s+lan[çc]amentos\s+atuais/i,                 mode: 'ignore' },
  { re: /limites?\s+de\s+cr[ée]dito/i,                            mode: 'ignore' },
  { re: /resumo\s+da\s+fatura/i,                                  mode: 'ignore' },
  { re: /encargos\s+e\s+juros/i,                                  mode: 'ignore' },
];
```

Cada coluna é processada como um fluxo independente que começa em `unknown` (captura, para não perder a primeira página de faturas que não repetem o cabeçalho) e muda de modo a cada cabeçalho reconhecido. Só `capture` e `unknown` viram transação. `nextinvoice` é coletado em `_parsedMeta.nextInvoiceRows` e usado **apenas** por `_conferirProjecoes()`, que compara com as projeções já geradas e avisa quando falta parcela ou o valor diverge — nunca cria transação.

**(c) Ano do lançamento vindo da própria fatura.** `_guessYear` comparava com a data de hoje; agora `_applyYear` lê o vencimento declarado (`RE_VENCIMENTO`) e só cai na heurística antiga se a fatura não trouxer a data.

**Tolerância de centavos — o critério e o porquê.**

```js
function _tolerancia(parcelaTotal) {
  const n = Math.max(1, parcelaTotal || 1);
  const t = (n - 1) / 100 + 0.01;
  return Math.min(1.00, Math.max(0.02, t));
}
```

Ao dividir uma compra em N parcelas, o emissor arredonda cada parcela e concentra o resto em uma delas. O resto máximo possível é de N−1 centavos, então duas parcelas da mesma compra podem diferir em até `(N−1)/100`. O `+0,01` cobre erro de leitura do PDF; o piso de R$ 0,02 mantém o comportamento antigo para compras à vista; o teto de R$ 1,00 impede que duas compras distintas de valor próximo no mesmo estabelecimento sejam tratadas como a mesma parcela. Para 6 parcelas a tolerância é R$ 0,06 — cobre a diferença de 2 centavos do caso relatado sem abrir demais.

**Guarda contra reimportação.** `_fingerprint()` monta a string canônica `data|descrição normalizada|valor` de todos os lançamentos, ordena e aplica `crypto.subtle.digest('SHA-256')` (API nativa do browser, exige https ou localhost — há fallback FNV-1a determinístico). O hash é gravado em `users/{uid}/importedInvoices/{fingerprint}` junto com competência, nome do arquivo e data. Antes de salvar, `_faturaJaImportada()` consulta a coleção e, se houver hash igual, pede confirmação explícita informando quando a fatura foi importada. Como a identidade é o conjunto de lançamentos, renomear o arquivo não engana a guarda. Falha de leitura da coleção não bloqueia a importação — apenas registra aviso no console.

**Como validar antes de trocar o arquivo.** A detecção de coluna é genérica, mas os limiares (`MIN_GAP_RATIO`, `EDGE_MARGIN_RATIO`) não foram calibrados contra a sua fatura real — eu não tenho o dump de `page.getTextContent()`. Rode no console da aplicação, com a fatura carregada:

```js
const { dumpPageItems } = await import('./js/parsers/pdf-layout.js');
const buf = await document.getElementById('pdf-file-input').files[0].arrayBuffer();
const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
console.table(await dumpPageItems(await pdf.getPage(2)));
```

Me mande esse dump (pode trocar a coluna `str` por `<texto>` se quiser preservar os dados) e eu ajusto os limiares e os regex de cabeçalho para os títulos exatos da sua fatura. Só depois disso vale renomear `js/pdf-import.fixed.js` → `js/pdf-import.js`.

---

### Achado 2 — ALTO — Regras do Firestore não existem no repositório

**Arquivo:** nenhum. Não há `firestore.rules` nem `firebase.json` versionados.

**O que está errado.** As regras vivem só no console do Firebase. Não há revisão, histórico nem forma de saber se o banco está fechado. Um projeto criado em modo teste fica aberto por 30 dias e depois nega tudo — em nenhum dos dois estados isso é aceitável para um banco com dados financeiros pessoais.

**Efeito observável.** Se as regras estiverem em modo teste, qualquer pessoa com o `projectId` (que é público, está no `index.html`) lê e escreve toda a base.

**Correção.** Arquivo `firestore.rules` criado na raiz, completo, com: negação global no fim, acesso restrito a `request.auth.uid == uid`, exigência de `email_verified`, e validação de campo por coleção (faixa de `amount`, tamanho de `description`, número de chaves). Deliberadamente **não** há `match /{document=**}` permissivo dentro de `/users/{uid}` — as regras são avaliadas em OR e um curinga anularia todas as validações. Publique com `firebase deploy --only firestore:rules` ou colando em Console → Firestore → Regras.

O `databaseURL` do Realtime Database está na config mas o app nunca usa RTDB. Remova a linha do `firebaseConfig`; enquanto ela existir, o RTDB fica exposto às regras dele, que ninguém está olhando.

---

### Achado 3 — ALTO — `parseMoney` transforma R$ 1.234 em R$ 1,23

**Arquivo:** `js/parsers/base-parser.js` (linhas 94–101, antes da correção) e a cópia divergente em `js/pdf-import.js` (linhas 279–286).

```js
if (/^\-?\d+(\.\d{3})*,\d{2}$/.test(s))
  return parseFloat(s.replace(/\./g, '').replace(',', '.'));
return parseFloat(s.replace(/[^0-9.]/g, '')) || 0;   // ← fallback
```

**O que está errado.** Só o formato `1.234,56` é tratado. Qualquer valor sem os centavos explícitos — `1.234`, comum quando o PDF quebra o texto ou quando o CSV do banco vem sem decimais — cai no fallback, que remove tudo menos dígitos e ponto e devolve `1.234`. A versão de `pdf-import.js` ainda descarta o sinal de menos e não entende parênteses contábeis.

**Efeito observável.** Um lançamento de mil e duzentos reais entra como um real e vinte e três. Erro silencioso: não há exceção, o valor simplesmente aparece errado no dashboard.

**Correção (já aplicada em `js/parsers/base-parser.js`).** Decide o separador decimal pela posição relativa da última vírgula e do último ponto, trata parênteses contábeis e sinal à direita, e trata explicitamente o caso `1.234` como milhar brasileiro:

```js
export function parseMoney(raw) {
  if (raw === null || raw === undefined || raw === '') return 0;
  let s = String(raw).trim().replace(/\s/g, '').replace(/^R\$/i, '');
  const negative = /^-/.test(s) || /^\(.*\)$/.test(s) || /-$/.test(s);
  s = s.replace(/[()]/g, '').replace(/[^0-9.,]/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot   = s.lastIndexOf('.');
  let normalized;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    const decimals = s.length - lastDot - 1;
    normalized = (decimals === 3 && lastComma === -1) ? s.replace(/\./g, '') : s.replace(/,/g, '');
  } else {
    normalized = s;
  }
  const v = parseFloat(normalized);
  if (!isFinite(v)) return 0;
  return negative ? -Math.abs(v) : v;
}
```

`js/pdf-import.fixed.js` importa essa função em vez de manter cópia — resolve o item 2 do escopo (duplicação entre `pdf-import.js` e `js/parsers/*`) para `parseMoney`. `_parseInstallment`, `_normDesc` e o dedupe também foram unificados dentro do arquivo corrigido; a próxima etapa natural é mover os três para `base-parser.js` e fazer `pdf-statement-parser.js` consumi-los (custo estimado: meia hora, ver seção 4).

---

### Achado 4 — ALTO — Listeners empilham a cada abertura do modal de fatura

**Arquivo:** `js/pdf-import.js`, `_attachEvents` (linhas 45–74) e `_showPreview` (linhas 405–415).

**O que está errado.** `initPdfImport` é chamado toda vez que o botão "Importar fatura" é clicado (`js/gastos.js:139`). Dentro de `_attachEvents`, só `pdf-file-input` e `btn-confirmar-pdf` são clonados para limpar handlers; `pdf-drop-zone` e `pdf-check-all` recebem `addEventListener` novo a cada chamada, sem remoção. Em `_showPreview`, os dois `tbody.addEventListener` são registrados a cada preview, e o `tbody` nunca é recriado — só o `innerHTML`.

**Efeito observável.** Abrir o modal N vezes na mesma sessão: um clique na drop zone dispara N vezes o seletor de arquivo; um drop processa o mesmo PDF N vezes; marcar/desmarcar "todos" percorre a tabela N vezes. Com `_parsedItems` sendo reatribuído entre as chamadas, handlers antigos podem escrever em índices de um lote que não existe mais.

**Correção (em `js/pdf-import.fixed.js`).** Um único `_eventsBound` guarda todo o `_attachEvents`, os handlers do `tbody` viram delegação registrada uma vez, e cada handler valida `_parsedItems[idx]` antes de escrever:

```js
let _eventsBound = false;

function _attachEvents() {
  if (_eventsBound) return;
  _eventsBound = true;
  // ... registro único de input/dropZone/confirm/checkAll/tbody
}
```

`js/extratos.js` tem o mesmo padrão de `cloneNode/replaceChild` (linhas 160–239) — funciona, mas é frágil pelo mesmo motivo. O `window.__extratoCheckAllBound` da linha 226 já é a solução certa; vale generalizá-la para os outros elementos do modal.

---

### Achado 5 — MÉDIO — Recarga total do Firestore a cada clique de mês

**Arquivo:** `js/app.js`, `refreshCurrentTab` (linhas 63–68), chamada pelos botões de mês anterior/próximo e pelo month picker.

```js
async function refreshCurrentTab() {
  const active = document.querySelector('.nav-link.active');
  if (!active) return;
  await loadAllData();          // ← lê as 7 coleções inteiras
  await switchTab(active.dataset.tab);
}
```

**O que está errado.** `loadAllData` faz `getDocs` em `transactions`, `incomes`, `budgets`, `assets`, `goals`, `categories` e `rules` — sem `where`, sem cache. Trocar o mês não muda nenhum dado no servidor; só muda o filtro local (`state.currentMonth`), já que todas as telas filtram em memória por `competenceMonth`.

**Efeito observável.** Navegar seis meses para trás dispara 42 leituras de coleção completa e um render travado a cada clique. Em plano gratuito, o custo é a cota de leituras; a percepção é latência.

**Correção.** Separar troca de mês de recarga de dados:

```js
// js/app.js — substitui refreshCurrentTab
async function rerenderCurrentTab() {
  const active = document.querySelector('.nav-link.active');
  if (!active) return;
  await switchTab(active.dataset.tab);      // só re-renderiza
}

async function reloadAndRerender() {
  await loadAllData();
  await rerenderCurrentTab();
}
```

e trocar as três chamadas de `refreshCurrentTab()` (linhas 252, 259, 265) por `rerenderCurrentTab()`. Chame `reloadAndRerender()` apenas depois de escrita externa (import de extrato, restore de backup). As escritas normais já atualizam `state` dentro de `saveTx`/`saveIncome`/etc.

---

### Achado 6 — MÉDIO — Deduplicação de extrato é sensível a centavo e ignora o tipo

**Arquivo:** `js/parsers/base-parser.js`, `dedupKey`/`detectDuplicates` (linhas 71–89).

```js
export function dedupKey(date, amount, normalizedDesc) {
  return `${date}|${Math.abs(amount).toFixed(2)}|${normalizedDesc.slice(0, 40)}`;
}
```

**O que está errado.** Dois problemas opostos. `Math.abs` faz uma entrada e uma saída de mesmo valor e descrição no mesmo dia colidirem como duplicata — cenário real de transferência entre contas próprias. E a comparação de valor é exata, então um centavo de diferença de conversão ou arredondamento passa como transação nova.

**Efeito observável.** Estorno marcado como duplicata da compra original e escondido do usuário; ou reimportação parcial de extrato criando linhas repetidas.

**Correção.**

```js
// js/parsers/base-parser.js
export function dedupKey(date, amount, normalizedDesc, type = '') {
  // centavo arredondado para 5 → tolera divergência de arredondamento
  const bucket = (Math.round(Math.abs(amount) * 20) / 20).toFixed(2);
  return `${date}|${type}|${bucket}|${normalizedDesc.slice(0, 40)}`;
}

export function detectDuplicates(newItems, existingTransactions) {
  const existingKeys = new Set(
    existingTransactions.map(t =>
      dedupKey(t.date || '', t.amount || 0, normalizeDesc(t.description || ''), t.type || '')
    )
  );
  return newItems.map(item => ({
    ...item,
    isDuplicate: existingKeys.has(dedupKey(item.date, item.amount, normalizeDesc(item.description), item.type || '')),
  }));
}
```

O bucket de 5 centavos é uma escolha, não uma verdade: se você importa muitos valores próximos no mesmo dia e estabelecimento, baixe para `* 100 / 100` (exato) e aceite os falsos negativos.

---

### Achado 7 — MÉDIO — `_parseGenerico` roda sobre o texto inteiro sem âncora

**Arquivo:** `js/pdf-import.js`, linhas 256–276.

```js
const re = /(\d{2})\/(\d{2})(?:\/(\d{2,4}))?\s+(.+?)\s+([\d.,]+)\s*(?:[DC])?/g;
```

**O que está errado.** Regex global, sem `^`/`$`, aplicada ao texto inteiro. Casa qualquer par "data … número" dentro de uma linha, inclusive no meio de blocos que não são lançamentos (limites, resumo, código de barras). É o parser de último recurso, acionado quando Itaú e Nubank devolvem menos de 3 itens — justamente quando o PDF é o mais estranho.

**Efeito observável.** Em faturas fora do padrão, entra lixo com valores arbitrários. O usuário vê linhas plausíveis no preview e aceita sem desconfiar.

**Correção.** Ancorar por linha e exigir estrutura mínima, como o `_parseLine` do arquivo corrigido faz. Se quiser manter um genérico separado:

```js
function _parseGenerico(lines) {
  const re = /^(\d{2})[\/\-](\d{2})(?:[\/\-](\d{2,4}))?\s+(.{3,60}?)\s+(-?[\d.,]{4,})\s*[DC]?$/;
  return lines.map(l => l.trim().match(re)).filter(Boolean).map(m => ({ /* ... */ }));
}
```

Note que `js/parsers/pdf-statement-parser.js:117` tem exatamente o mesmo problema no `_genericParser` — ali o `re` não é global, mas também não é ancorado.

---

### Achado 8 — MÉDIO — `unsafe-inline` no `script-src` da CSP

**Arquivo:** `vercel.json`, linha 24.

```
script-src 'self' 'unsafe-inline' https://apis.google.com ... ;
```

**O que está errado.** `'unsafe-inline'` anula a principal proteção da CSP contra XSS. Ele é necessário hoje por dois motivos concretos: o bloco `<script type="module">` inline no `index.html` (linhas 14–46) que inicializa o Firebase, e o `onclick="..."` em `js/extratos.js:55` (mais 2 ocorrências de handler inline no `index.html`).

**Efeito observável.** Nada quebra hoje — a superfície de XSS do app é pequena porque quase todo `innerHTML` passa por `esc()`. O risco é futuro: a primeira interpolação esquecida vira execução de script.

**Correção, em três passos que podem ser feitos separados.**

1. Mover o bloco inline para `js/firebase-init.js` e carregá-lo com `<script type="module" src="js/firebase-init.js"></script>`.
2. Trocar o `onclick` de `js/extratos.js:55` por delegação:

```js
// js/extratos.js — no lugar do onclick inline
container.innerHTML = `
  <div class="empty-state">
    <div class="empty-state-icon">🏦</div>
    <div class="empty-state-title">Nenhum extrato importado</div>
    <div class="empty-state-text">Importe extratos do Itaú, Nubank, Inter, Santander ou Bradesco em PDF, OFX ou CSV.</div>
    <button class="btn btn-primary btn-sm" id="btn-empty-import">Importar agora</button>
  </div>`;
container.querySelector('#btn-empty-import')
  ?.addEventListener('click', () => document.getElementById('btn-novo-extrato')?.click());
```

3. Remover `'unsafe-inline'` do `script-src` no `vercel.json` (manter no `style-src` — o app usa `style="..."` em dezenas de lugares e tirar isso é um projeto à parte).

---

### Achado 9 — MÉDIO — `vercel.json` sem regras de cache, com ES modules sem versão

**Arquivo:** `vercel.json` — só há bloco `headers` de segurança.

**O que está errado.** `index.html` e os `js/*.js` são servidos com o default da Vercel. Como os módulos são importados por caminho fixo (`./gastos.js`), um browser que cacheou `gastos.js` pode ficar com uma versão antiga enquanto o `index.html` já é novo — combinação que produz erro de import ou, pior, comportamento inconsistente sem erro.

**Correção.** Acrescente ao `vercel.json`, dentro do array `headers`:

```json
{
  "source": "/index.html",
  "headers": [{ "key": "Cache-Control", "value": "no-cache, must-revalidate" }]
},
{
  "source": "/js/(.*)",
  "headers": [{ "key": "Cache-Control", "value": "no-cache, must-revalidate" }]
},
{
  "source": "/css/(.*)",
  "headers": [{ "key": "Cache-Control", "value": "no-cache, must-revalidate" }]
}
```

`no-cache` não desliga o cache: obriga revalidação com `ETag`, então a resposta normal é 304 e o custo é um round-trip. É a escolha certa enquanto os arquivos não tiverem hash no nome. Se um dia adicionar build step com hash, troque por `max-age=31536000, immutable`.

---

### Achado 10 — BAIXO — `saveBudgets` faz N leituras e N escritas sem batch

**Arquivo:** `js/db.js`, linhas 222–241.

```js
const existing = await getAll('budgets');           // lê TODOS os meses
const toDelete = existing.filter(b => b.month === month);
for (const b of toDelete) await removeDoc('budgets', b.id);   // serial
for (const [categoryId, amount] of Object.entries(budgetMap)) { ... await saveDoc(...) }
```

**Efeito observável.** Salvar o orçamento de um mês com 12 categorias: 1 leitura da coleção inteira + 12 deletes + 12 writes, todos em série. Se falhar no meio, o mês fica com orçamento parcial e não há rollback.

**Correção.** Usar `writeBatch`, que já é importado em `window._FB`, e um ID determinístico por mês+categoria — assim o upsert dispensa o delete prévio:

```js
export async function saveBudgets(month, budgetMap) {
  const { db, writeBatch, collection, doc } = fb();
  const uid = getUid();
  if (!uid) throw new Error('Não autenticado.');

  const existing = await getAll('budgets');
  const batch = writeBatch(db);
  const colPath = `users/${uid}/budgets`;

  for (const b of existing.filter(b => b.month === month)) {
    batch.delete(doc(db, colPath, b.id));
  }
  for (const [categoryId, amount] of Object.entries(budgetMap)) {
    if (!(amount > 0)) continue;
    batch.set(doc(db, colPath, `${month}__${categoryId}`), { month, categoryId, amount: Number(amount) });
  }
  await batch.commit();   // atômico
  state.budgets[month] = budgetMap;
}
```

---

### Achado 11 — BAIXO — Competência: três critérios diferentes convivendo

**Arquivos:** `js/db.js` `allExpensesOfMonth` (150–165), `incomesOfMonth` (194–201), `js/utils.js` `_expensesFallback` (126–137).

**O que está errado.** Gasto de cartão é classificado por `competenceMonth`; gasto de extrato, por `date.slice(0,7)`; receita aceita `month`, `competenceMonth` ou `date`, nessa ordem. Três regras para a mesma pergunta "este lançamento é deste mês?".

**Efeito observável.** Uma compra no cartão em 28/07 com competência agosto aparece em agosto na aba Gastos e no KPI; a mesma compra, se tiver vindo pelo extrato (débito), aparece em julho. Os totais de dashboard e relatórios não batem entre si e a usuária não tem como saber qual está certo.

**Correção.** Uma função única em `js/utils.js`, usada por todos os módulos:

```js
// js/utils.js
export function competenceOf(tx) {
  if (tx.competenceMonth) return tx.competenceMonth;
  if (tx.month) return tx.month;
  return (tx.date || '').slice(0, 7);
}
export function isOfMonth(tx, month) { return competenceOf(tx) === month; }
```

e trocar os três filtros por `isOfMonth(t, month)`. Isso não muda o dado no Firestore — muda só a leitura, e passa a ser possível corrigir a competência de um lançamento de extrato editando o campo. Faça essa troca junto com uma conferência manual de um mês fechado, porque os totais históricos vão mudar.

---

### Achado 12 — BAIXO — Acessibilidade das telas

**Arquivos:** `index.html`, `js/gastos.js` (89–90), `js/configuracoes.js` (166–167), `js/extratos.js` (465–474).

Pontos concretos, do mais barato ao mais caro:

1. **Botões só com símbolo.** `✎` e `✕` têm `title`, que o leitor de tela nem sempre anuncia. Acrescente `aria-label`:
   ```js
   <button class="btn-icon-only" title="Editar" aria-label="Editar lançamento ${esc(tx.description)}" data-action="edit-tx" data-id="${tx.id}">✎</button>
   ```
2. **Checkbox e inputs das tabelas de preview sem rótulo.** Já corrigido em `js/pdf-import.fixed.js` (`aria-label` em cada célula editável); replicar em `js/extratos.js:465-471`.
3. **Modais sem semântica.** Nenhum `.modal-overlay` tem `role="dialog"`, `aria-modal="true"` ou `aria-labelledby`, e não há trap de foco nem `Escape` para fechar (só o command palette trata `Escape`). Um handler global resolve os dois casos mais visíveis:
   ```js
   // js/app.js, dentro do DOMContentLoaded
   document.addEventListener('keydown', e => {
     if (e.key !== 'Escape') return;
     document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
   });
   ```
4. **Tabelas sem `scope`.** Adicionar `scope="col"` nos `<th>` do `index.html` é uma troca mecânica e melhora a navegação por leitor de tela.
5. **`confirm()` nativo** para exclusão (`js/gastos.js:156`, `js/extratos.js:86`) bloqueia a thread e não é estilizável, mas é acessível e previsível — deixar como está (ver seção 5).

---

### Achado 13 — BAIXO — `.gitignore` ignora todo `*.json`

**Arquivo:** `.gitignore`, linha 8.

```
*.json
!package.json
```

A intenção era não commitar backup de dados pessoais — correta. O efeito colateral é que qualquer JSON de configuração futuro (`firebase.json`, `.vercel/project.json`, `tsconfig.json`) é ignorado silenciosamente. `vercel.json` só sobreviveu porque já estava rastreado antes da regra.

**Correção:**

```gitignore
# Backups de dados pessoais — só o padrão de nome do export
financas-backup-*.json
*-backup-*.json

# (remover a regra genérica *.json e a exceção !package.json)
```

---

## 3. Melhorias estruturais

Só compensam se o app for evoluir. Custo é tempo seu, estimado por comparação com o que já existe no repositório.

| # | O que | Por que | Custo |
|---|---|---|---|
| 1 | **Mover `parseInstallment`, `normDesc` e o dedupe para `base-parser.js`** e fazer `pdf-import` e `pdf-statement-parser` consumirem. | Elimina o resto da divergência apontada no escopo 2. Hoje uma correção de parsing precisa ser feita em dois lugares e um sempre fica para trás. | ~30 min |
| 2 | **Testes dos parsers com `node --test`**, sem npm install. As funções puras (`parseMoney`, `parseDate`, `_parseLine`, `_tolerancia`, `detectColumnBands`) são testáveis isoladamente. Fixtures com valores fictícios. | Hoje não há nenhum teste. Cada ajuste de regex é validado abrindo o app e olhando o preview. | ~2 h para a primeira suíte, 10 min por caso novo |
| 3 | **Encapsular `state`** em `utils.js` atrás de `getState()/setState()` com notificação de mudança. Hoje 12 módulos mutam o mesmo objeto exportado. | Bug de estado é o mais caro de achar: qualquer módulo pode ter escrito. | ~3 h, toca todos os arquivos |
| 4 | **Quebrar `_confirmarImportacao` e `_saveExtrato`** (≈120 e ≈95 linhas) em funções de 20 linhas com uma responsabilidade cada. | São as duas funções onde os bugs de duplicação nascem, e são as menos testáveis do projeto. | ~1 h |
| 5 | **Constantes nomeadas** para os números mágicos que ainda estão soltos: `< 0.02` (dedupe), `>= 3` (limiar de parser), `avg < 80` e `dev < 30` (anomalia de insight), `dayNow >= 5` (projeção), `-1` (offset de fatura). | Cada um desses é uma decisão de negócio escondida num literal. | ~30 min |
| 6 | **Cache de leitura no `db.js`** com invalidação por escrita, para que `loadAllData` só vá ao servidor quando algo mudou. | Complementa o achado 5; só vale se o volume de transações crescer. | ~2 h |
| 7 | **Extrair o `index.html`** (797 linhas, todas as telas e modais) em fragmentos carregados sob demanda junto com o módulo da aba. | Manutenção: hoje achar um `id` exige varrer o arquivo inteiro. Ganho de carga inicial não medido. | ~4 h, risco de quebrar `getElementById` espalhado |

---

## 4. O que eu NÃO mexeria

**1. A `apiKey` do Firebase exposta no `index.html`.** Parece credencial vazada, não é. A chave de API web do Firebase é um identificador público de projeto, desenhada para ir no cliente — quem protege os dados é a regra do Firestore (achado 2) e o Firebase Auth. Tirar do repositório e injetar por variável de ambiente exigiria build step, que o projeto não tem, e não aumentaria a segurança em nada. O que **vale** fazer, e é rápido: no Google Cloud Console, restringir a chave por referenciador HTTP para o domínio da Vercel e `localhost`, e conferir a lista de domínios autorizados no Firebase Auth. Isso limita abuso de cota, que é o risco real.

**2. O `esc()` escapando `/` como `&#x2F;`.** Parece exagero que quebra a exibição de descrições com barra, mas em contexto HTML e em atributo `value=` a entidade é decodificada pelo browser e o usuário vê a barra normalmente. É defesa contra injeção de tag de fechamento em contextos ambíguos. Custo zero, benefício pequeno mas real — não toque.

**3. O `confirm()` nativo nas exclusões.** É feio e bloqueia a thread, mas é acessível por padrão, impossível de suprimir por acidente e o usuário já sabe o que ele significa. Trocar por modal customizado significa escrever trap de foco, `role="alertdialog"` e gestão de `Promise` — trabalho real para piorar a acessibilidade se feito às pressas. Se um dia incomodar, é o último item da fila.

**4. O `import()` dinâmico por aba em `js/app.js`.** Sem bundler, cada aba é um round-trip de rede na primeira visita, o que parece candidato a otimização. Não é: os arquivos são pequenos, o cache do browser resolve a partir da segunda visita, e a alternativa (concatenar tudo) reintroduziria a dependência circular que o comentário no topo do arquivo diz ter sido o motivo original da escolha. Está certo como está.

---

## 5. Ordem sugerida de execução

1. Publicar `firestore.rules` (achado 2) — é o único item com risco de exposição de dados.
2. Validar o parser de fatura com o dump da página 2 e trocar `pdf-import.js` (achado 1).
3. `parseMoney` já está corrigido; conferir um mês fechado para ver se algum total antigo muda.
4. Achados 4, 5 e 9 — baratos, sem risco de dado.
5. Achados 6, 7, 11 — mexem em como o dado é lido; faça um backup pelo próprio app antes.

## 6. Reutilizável

Esta auditoria seguiu um roteiro que serve para qualquer entregável de código seu. Se quiser, eu transformo em skill (`/auditoria-codigo`) com o checklist fixo: mapa de arquivos → achados por impacto com trecho + efeito + correção colável → melhorias estruturais com custo → o que não mexer. Diz que eu monto.
