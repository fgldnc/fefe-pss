# Testes das regras do Firestore

`firestore.rules` é o **único** controle de acesso do projeto: não há servidor
próprio, o cliente inteiro roda na máquina do usuário e fala direto com o
Firestore. Até aqui a garantia de que ele estava certo era uma leitura humana.

## Rodar

```
npm install --prefix test/rules
npm test --prefix test/rules
```

Precisa do Firebase CLI e do emulador (`firebase setup:emulators:firestore`).
O `firebase emulators:exec` sobe o emulador, roda a suíte e derruba tudo.

## Por que não na raiz

A Vercel publica a raiz do repositório. Um `package.json` ali entraria no
caminho servido — e a restrição 2 de `CLAUDE.md` é que o app não tem build
step nem dependência. Esta é de desenvolvimento, e só.
