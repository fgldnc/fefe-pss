# O que sobrou — e só você pode fazer

Três coisas. Nenhuma tem linha de código: todas são clique em console, fora
do repositório. Por isso a auditoria não pôde verificá-las e por isso elas
continuam abertas no relatório.

Ordem de importância: **1 é urgente, 2 é hoje-ou-amanhã, 3 pode esperar.**

---

## 1. Conferir as regras do Firestore  ⚠️ o único achado de severidade ALTA

**Onde:** console.firebase.google.com → projeto `fefe-df577` →
Firestore Database → aba **Regras**.

**O que você tem de ver lá:**

```
rules_version = '2';
...
function isOwner(uid) { ... }
function verified()   { ... }
...
match /{document=**} {
  allow read, write: if false;
}
```

**SINAL DE PERIGO.** Se aparecer QUALQUER uma destas duas linhas:

```
allow read, write: if true;
allow read, write: if request.auth != null;
```

…então o banco está aberto: qualquer pessoa com uma conta Google lê e escreve
o ramo de qualquer outra. A chave do Firebase é pública por desenho (está no
código servido, e isso está certo) — o que separa os dados de um usuário dos
de outro são **só** essas regras.

**Se estiver errado, o conserto é copiar e colar:** abra `firestore.rules`
deste repositório, copie o arquivo inteiro, cole na caixa do console e clique
em **Publicar**.

Depois disso o item 2 garante que nunca mais volte a divergir.

---

## 2. O token que faz a publicação automática funcionar

Já existe `.github/workflows/firestore-rules.yml`: ele testa as regras contra
o emulador e as publica a cada merge na `main` — testa antes de publicar, de
propósito. Só falta o token.

**Passo 1 — gerar.** No terminal, na pasta do projeto:

```
firebase login:ci
```

Abre o navegador, você faz login, e ele imprime um token no terminal.

**Passo 2 — guardar.** No GitHub do repositório:

```
Settings → Secrets and variables → Actions → New repository secret

Nome:   FIREBASE_TOKEN
Valor:  o token impresso no passo 1
```

**NUNCA commite o token.** O workflow já o lê de `secrets.FIREBASE_TOKEN`.

Enquanto o secret não existir, o job de *publicar* falha e os de *testar*
passam normalmente — nada quebra, só não publica sozinho.

---

## 3. Os três controles do achado A5 (severidade baixa)

A chave em `js/firebase-init.js` é a chave **Web** do Firebase: pública por
desenho, identifica o projeto e não autoriza nada. **"Esconder" a chave não é
correção e não deve ser tentado.** O que protege são estes três, todos fora do
repositório:

**a) Domínios autorizados**
Firebase → Authentication → Settings → **Authorized domains**.
Deve ter só o domínio da Vercel e `localhost`. Apague qualquer outro.
*Se houver domínio de terceiro na lista, alguém pode hospedar uma tela de
login que parece a sua e falar com o seu projeto.*

**b) Restringir a chave por referenciador**
console.cloud.google.com → APIs e serviços → **Credenciais** → a chave Web.
Em "Restrições de aplicativo", escolher **Referenciadores HTTP** e listar o
domínio da Vercel.
*Sem isso, a chave funciona a partir de qualquer site.*

**c) App Check — decidir, não necessariamente adotar**
Hoje o projeto não tem App Check. Ele prova ao Firebase que quem está
chamando é o seu app de verdade, e não um script.
**O item fecha com a decisão escrita, seja qual for.** Para um app de uso
pessoal, "dispensar porque as regras já isolam por dono e o custo de operar
reCAPTCHA Enterprise não se paga" é uma resposta perfeitamente válida — o que
não vale é deixar sem resposta.

---

## Uma coisa que eu não consegui verificar

A suíte `test/rules/rules.test.mjs` (11 casos) está escrita e as dependências
instalam, **mas ela não rodou nesta máquina: o emulador do Firestore precisa
de Java, e não há Java instalado aqui.** Quem vai rodá-la é o CI — o workflow
instala o Java sozinho. Se quiser rodar local um dia:

```
npm install --prefix test/rules
npm test --prefix test/rules
```
