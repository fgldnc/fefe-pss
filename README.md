# 💰 Finanças Pessoais — Guia de Instalação

Este guia vai te levar do zero até o app funcionando no seu celular e computador,
sem precisar entender de programação. Siga os passos na ordem.

**Tempo estimado:** 30 a 45 minutos na primeira vez.

---

## O que você vai precisar

- Uma conta Google (Gmail)
- Um computador com acesso à internet
- Nada instalado — tudo é feito pelo navegador

---

## Visão geral do processo

Você vai criar contas em três serviços gratuitos:

| Serviço | Para que serve |
|---------|----------------|
| **Firebase** (Google) | Guardar seus dados na nuvem e fazer o login funcionar |
| **GitHub** | Guardar o código do app (como um "Google Drive para programas") |
| **Vercel** | Publicar o app na internet para você acessar de qualquer lugar |

---

## PARTE 1 — Configurar o Firebase (banco de dados)

O Firebase é o serviço do Google que vai guardar todas as suas informações financeiras com segurança.

### Passo 1 — Criar o projeto Firebase

1. Acesse **[console.firebase.google.com](https://console.firebase.google.com)**
2. Clique em **"Criar um projeto"**
3. Dê um nome qualquer, por exemplo: `minhas-financas`
4. Na tela do Google Analytics, clique em **"Continuar"** sem ativar nada
5. Clique em **"Criar projeto"** e aguarde alguns segundos
6. Clique em **"Continuar"** quando aparecer o botão

---

### Passo 2 — Ativar o login com Google

1. No menu da esquerda, clique em **"Authentication"**
2. Clique em **"Primeiros passos"**
3. Na aba **"Método de login"**, clique em **"Google"**
4. Ative o botão no canto superior direito (fica verde)
5. Coloque seu e-mail no campo **"E-mail de suporte do projeto"**
6. Clique em **"Salvar"**

---

### Passo 3 — Criar o banco de dados

1. No menu da esquerda, clique em **"Firestore Database"**
2. Clique em **"Criar banco de dados"**
3. Selecione **"Iniciar no modo de produção"** e clique em **"Próximo"**
4. Escolha a região **`southamerica-east1`** (São Paulo) e clique em **"Ativar"**
5. Aguarde o banco criar (pode levar 1 minutinho)

---

### Passo 4 — Configurar as regras de segurança

Isso garante que só **você** consiga ver e editar os seus dados.

1. Dentro do Firestore, clique na aba **"Regras"**
2. Você vai ver um texto lá. **Apague tudo** e cole exatamente isso no lugar:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

3. Clique em **"Publicar"**

---

### Passo 5 — Pegar as credenciais do Firebase

Agora você vai copiar uma "chave de acesso" que o app usa para se conectar ao seu banco.

1. Clique na **engrenagem** ⚙️ no canto superior esquerdo → **"Configurações do projeto"**
2. Role a página para baixo até ver **"Seus aplicativos"**
3. Clique no ícone **`</>`** (Web)
4. No campo "Apelido do app", coloque qualquer nome, ex: `financas-web`
5. **Não** marque a opção do Firebase Hosting
6. Clique em **"Registrar app"**
7. Você vai ver um bloco de código parecido com isso:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "seu-projeto.firebaseapp.com",
  projectId: "seu-projeto",
  storageBucket: "seu-projeto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

8. **Copie esse bloco inteiro** — você vai precisar dele no Passo 9
9. Clique em **"Continuar no console"**

---

## PARTE 2 — Colocar o código no GitHub

O GitHub é onde o código do app fica guardado. A Vercel vai buscar o código de lá para publicar.

### Passo 6 — Criar conta no GitHub

1. Acesse **[github.com](https://github.com)**
2. Clique em **"Sign up"** e crie uma conta gratuita
3. Confirme o e-mail se pedir

---

### Passo 7 — Criar um repositório (pasta no GitHub)

1. Depois de entrar, clique no botão verde **"New"** ou no **"+"** no canto superior direito → **"New repository"**
2. Em **"Repository name"**, coloque: `financas-pessoais`
3. Deixe marcado como **"Public"**
4. Marque a opção **"Add a README file"**
5. Clique em **"Create repository"**

---

### Passo 8 — Instalar o GitHub Desktop e enviar os arquivos

O GitHub Desktop é um programa gratuito que facilita o envio de arquivos para o GitHub, especialmente quando existem subpastas (como `css/` e `js/`).

1. Baixe o **[GitHub Desktop](https://desktop.github.com)** e instale
2. Abra o programa e clique em **"Sign in to GitHub.com"** — vai abrir o navegador para autorizar
3. Depois de entrar, clique em **"Clone a repository from the Internet..."**
4. Selecione o repositório `financas-pessoais` que você criou
5. Escolha uma pasta no seu computador onde os arquivos vão ficar (ex: `Documentos/financas-pessoais`)
6. Clique em **"Clone"**

Agora **copie todos os arquivos do app** para essa pasta, mantendo a estrutura:

```
financas-pessoais/        ← pasta que o GitHub Desktop criou
├── index.html
├── README.md
├── vercel.json
├── css/
│   ├── style.css
│   └── components.css
└── js/
    ├── app.js
    ├── auth.js
    ├── db.js
    ├── utils.js
    ├── dashboard.js
    ├── gastos.js
    ├── extratos.js
    ├── receitas.js
    ├── orcamento.js
    ├── saldos.js
    ├── calendario.js
    ├── timeline.js
    ├── relatorios.js
    ├── patrimonio.js
    ├── metas.js
    ├── configuracoes.js
    ├── pdf-import.js
    └── parsers/
        ├── base-parser.js
        ├── csv-parser.js
        ├── ofx-parser.js
        └── pdf-statement-parser.js
```

7. Volte ao GitHub Desktop — você vai ver a lista de arquivos novos aparecer
8. No campo **"Summary"** (canto inferior esquerdo), escreva qualquer coisa, ex: `primeiro upload`
9. Clique em **"Commit to main"**
10. Clique em **"Push origin"** (botão azul que vai aparecer)

Os arquivos agora estão no GitHub. ✅

---

### Passo 9 — Colocar as credenciais do Firebase no código

1. Vá para **[github.com](https://github.com)** no navegador e abra o repositório `financas-pessoais`
2. Clique no arquivo **`index.html`**
3. Clique no ícone de **lápis** ✏️ (canto superior direito do arquivo) para editar
4. Use `Ctrl+F` (ou `Cmd+F` no Mac) para buscar por: `COLE_AQUI`
5. Você vai encontrar esse trecho:

```javascript
const firebaseConfig = {
  apiKey:            "COLE_AQUI",
  authDomain:        "COLE_AQUI",
  projectId:         "COLE_AQUI",
  storageBucket:     "COLE_AQUI",
  messagingSenderId: "COLE_AQUI",
  appId:             "COLE_AQUI"
};
```

6. **Substitua esse bloco inteiro** pelo bloco que você copiou no Passo 5
7. Role até o final da página → em **"Commit changes"**, escreva qualquer mensagem e clique em **"Commit changes"**

---

## PARTE 3 — Publicar na Vercel

A Vercel vai pegar seu código do GitHub e publicar na internet automaticamente.

### Passo 10 — Criar conta na Vercel

1. Acesse **[vercel.com](https://vercel.com)**
2. Clique em **"Sign Up"**
3. Escolha **"Continue with GitHub"** — vai conectar as duas contas automaticamente

---

### Passo 11 — Publicar o app

1. No painel da Vercel, clique em **"Add New..."** → **"Project"**
2. Você vai ver uma lista dos seus repositórios do GitHub
3. Encontre **`financas-pessoais`** e clique em **"Import"**
4. Na próxima tela, **não mude nada** — clique direto em **"Deploy"**
5. Aguarde 1 a 2 minutos
6. Quando aparecer a tela com confetes 🎉, seu app está no ar!
7. Clique em **"Visit"** para abrir — copie esse endereço (algo como `financas-pessoais-abc.vercel.app`)

---

### Passo 12 — Liberar o endereço da Vercel no Firebase

Para o login funcionar, você precisa avisar o Firebase que esse endereço é confiável.

1. Volte para o **[console.firebase.google.com](https://console.firebase.google.com)**
2. Abra seu projeto → clique em **"Authentication"** no menu esquerdo
3. Clique na aba **"Settings"** (ou "Configurações")
4. Role até **"Domínios autorizados"** e clique em **"Adicionar domínio"**
5. Cole o endereço da Vercel, ex: `financas-pessoais-abc.vercel.app`
6. Clique em **"Adicionar"**

---

## Pronto! 🎉

Agora acesse o endereço da Vercel, faça login com sua conta Google e o app está funcionando.

### Salvar como aplicativo no celular

- **iPhone (Safari):** toque em compartilhar → "Adicionar à Tela de Início"
- **Android (Chrome):** toque no menu ⋮ → "Adicionar à tela inicial"

Vai aparecer como um ícone de app normal, sem precisar da loja de aplicativos.

---

## Como fazer backup dos seus dados

1. Abra o app → menu **Configurações**
2. Em "Versão do backup", coloque um número (ex: `1.0.0`)
3. Clique em **"Exportar Backup"**
4. Um arquivo vai ser baixado com nome no formato: `financas-backup-v1.0.0-2025-04-30.json`
5. Guarde esse arquivo em um lugar seguro (Google Drive, por exemplo)

Para restaurar: clique em **"Importar Backup"** e selecione o arquivo.

---

## Perguntas frequentes

**Isso custa alguma coisa?**
Não. Firebase, GitHub e Vercel têm planos gratuitos mais do que suficientes para uso pessoal.

**Meus dados ficam seguros?**
Sim. As regras que você configurou no Passo 4 garantem que só você, logado com seu Google, consegue ver seus dados.

**E se eu esquecer o endereço do app?**
Acesse [vercel.com](https://vercel.com), entre com sua conta GitHub e o projeto vai estar lá com o link.

**O login deu erro. O que fazer?**
O erro mais comum é não ter feito o Passo 12 (liberar o domínio no Firebase). Refaça esse passo.

**Quero atualizar o app com uma versão nova. Como faço?**
Copie os arquivos novos para a mesma pasta do GitHub Desktop e repita os itens 7 a 10 do Passo 8. A Vercel detecta automaticamente e publica a atualização.

**Preciso deixar o computador ligado para o app funcionar?**
Não. O app fica hospedado nos servidores da Vercel e do Firebase — funciona 24h por dia independente do seu computador.
