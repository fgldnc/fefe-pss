/**
 * Testes de `firestore.rules` contra o emulador do Firestore.
 *
 * Por que existem: as regras são o ÚNICO controle de acesso do projeto — não há
 * servidor próprio, o cliente roda na máquina do usuário e fala direto com o
 * Firestore, e `apiKey`/`projectId` são públicos por desenho. Uma regra
 * afrouxada por engano abre o ramo `users/{uid}` de todo mundo, e erra em
 * silêncio: nada no app quebra.
 *
 * Roda com:  npm test --prefix test/rules
 * (o `emulators:exec` sobe o emulador, roda isto e derruba tudo)
 *
 * Valores fictícios; nenhum dado financeiro real.
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';

const RULES = fileURLToPath(new URL('../../firestore.rules', import.meta.url));

let env;
/** A (dono), B (outro usuário) e um sem e-mail verificado. */
let A, B, semVerificar;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'radar-test',
    firestore: { rules: readFileSync(RULES, 'utf8') },
  });
  A = env.authenticatedContext('userA', { email_verified: true }).firestore();
  B = env.authenticatedContext('userB', { email_verified: true }).firestore();
  semVerificar = env.authenticatedContext('userA', { email_verified: false }).firestore();

  // Semeia o ramo do A por baixo das regras, para o B ter o que tentar ler.
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'users/userA/transactions/t1'),
      { amount: -50, description: 'Padaria', competenceMonth: '2026-09' });
    await setDoc(doc(db, 'users/userA/incomes/i1'), { amount: 5000 });
  });
});

after(async () => { await env?.cleanup(); });

const tx = (o = {}) => ({ amount: -10, description: 'x', competenceMonth: '2026-09', ...o });

// ─── fronteira de dono ──────────────────────────────────────────────────

test('A não lê users/{B}/transactions', async () => {
  await assertFails(getDoc(doc(B, 'users/userA/transactions/t1')));
  await assertFails(getDocs(collection(B, 'users/userA/transactions')));
});

test('A não escreve em users/{B}/*', async () => {
  await assertFails(setDoc(doc(B, 'users/userA/transactions/invadida'), tx()));
  await assertFails(setDoc(doc(B, 'users/userA/incomes/invadida'), { amount: 1 }));
  await assertFails(setDoc(doc(B, 'users/userA/settings/fluxo'), { saldoInicial: {} }));
  await assertFails(setDoc(doc(B, 'users/userA'), { nome: 'invadido' }));
});

test('o dono lê e escreve o próprio ramo', async () => {
  await assertSucceeds(getDoc(doc(A, 'users/userA/transactions/t1')));
  await assertSucceeds(setDoc(doc(A, 'users/userA/transactions/t2'), tx()));
});

// ─── e-mail verificado ──────────────────────────────────────────────────

test('usuário sem email_verified é negado, mesmo sendo o dono', async () => {
  await assertFails(getDoc(doc(semVerificar, 'users/userA/transactions/t1')));
  await assertFails(setDoc(doc(semVerificar, 'users/userA/transactions/t3'), tx()));
});

test('usuário não autenticado é negado', async () => {
  const anon = env.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(anon, 'users/userA/transactions/t1')));
});

// ─── validação de campo ─────────────────────────────────────────────────

test('amount acima de 10.000.000 é rejeitado', async () => {
  await assertFails(setDoc(doc(A, 'users/userA/transactions/grande'),
    tx({ amount: 10000001 })));
  await assertFails(setDoc(doc(A, 'users/userA/transactions/grande2'),
    tx({ amount: -10000001 })));
  // O limite em si passa: é o teto, não o primeiro valor proibido.
  await assertSucceeds(setDoc(doc(A, 'users/userA/transactions/noLimite'),
    tx({ amount: 10000000 })));
});

test('descrição acima de 500 caracteres é rejeitada', async () => {
  await assertFails(setDoc(doc(A, 'users/userA/transactions/longa'),
    tx({ description: 'x'.repeat(501) })));
  await assertSucceeds(setDoc(doc(A, 'users/userA/transactions/limite'),
    tx({ description: 'x'.repeat(500) })));
});

test('a mesma validação vale para receitas', async () => {
  await assertFails(setDoc(doc(A, 'users/userA/incomes/grande'), { amount: 10000001 }));
  await assertFails(setDoc(doc(A, 'users/userA/incomes/longa'),
    { amount: 1, description: 'x'.repeat(501) }));
});

// ─── fora de /users ─────────────────────────────────────────────────────

test('documento fora de /users é negado', async () => {
  await assertFails(getDoc(doc(A, 'qualquerColecao/doc1')));
  await assertFails(setDoc(doc(A, 'qualquerColecao/doc1'), { x: 1 }));
  await assertFails(setDoc(doc(A, 'admin/config'), { x: 1 }));
});

test('subcoleção NÃO declarada dentro do próprio ramo também é negada', async () => {
  // O comentário em firestore.rules avisa: sem `match` explícito, a subcoleção
  // nova não herda permissão nenhuma. Este teste é o que torna o aviso verdade.
  await assertFails(setDoc(doc(A, 'users/userA/colecaoNova/d1'), { x: 1 }));
});
