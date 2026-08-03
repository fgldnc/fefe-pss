/**
 * Testes das funções puras do fluxo de caixa (js/saldos.js): agrupamento por
 * dia, série diária de saldo, busca do mínimo e contexto da sublinha.
 * Roda com: node --test test/
 *
 * É a parte que erra em silêncio — um saldo errado não lança exceção, só mostra
 * o dia errado como "menor saldo do mês".
 *
 * Valores fictícios; nenhum dado financeiro real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMovimentos, buildSerie, acharMinimo, contextoDoMinimo } from '../js/saldos.js';

const MES  = '2026-08';
const DIAS = 31;

const tx = (o) => ({ competenceMonth: MES, amount: 0, ...o });

// ─── buildMovimentos ────────────────────────────────────────────────────

test('entradas vêm só de incomes; extrato só contribui com expense', () => {
  const mov = buildMovimentos({
    ym: MES, daysInMonth: DIAS,
    incomes: [{ date: '2026-08-05', amount: 5200, description: 'Salário' }],
    // O mesmo crédito espelhado no extrato NÃO pode somar de novo
    extratos: [
      tx({ date: '2026-08-05', amount: 5200, type: 'income' }),
      tx({ date: '2026-08-02', amount: 86.4, type: 'expense', description: 'Mercado' }),
    ],
  });
  assert.equal(mov.dias[5].entradas, 5200);
  assert.equal(mov.dias[5].saidas, 0);
  assert.equal(mov.dias[2].saidas, 86.4);
});

test('transferência fica fora de entradas e de saídas', () => {
  const mov = buildMovimentos({
    ym: MES, daysInMonth: DIAS,
    transactions: [
      tx({ date: '2026-08-03', amount: 500, type: 'transfer' }),
      tx({ date: '2026-08-03', amount: 40, description: 'Padaria' }),
    ],
  });
  assert.equal(mov.dias[3].saidas, 40);
  assert.equal(mov.dias[3].itens.length, 1);
});

test('investimento sai do saldo e vira só um total informativo', () => {
  const mov = buildMovimentos({
    ym: MES, daysInMonth: DIAS, investIds: ['cat-inv'],
    transactions: [
      tx({ date: '2026-08-10', amount: 600, categoryId: 'cat-inv' }),
      tx({ date: '2026-08-10', amount: 90, categoryId: 'cat-mercado' }),
    ],
  });
  assert.equal(mov.investimento, 600);
  assert.equal(mov.dias[10].saidas, 90);
});

test('extrato com slug de investimento é resolvido antes de virar saída', () => {
  const mov = buildMovimentos({
    ym: MES, daysInMonth: DIAS, investIds: ['id-real-invest'],
    resolveCat: slug => (slug === 'investimento' ? 'id-real-invest' : slug),
    extratos: [tx({ date: '2026-08-12', amount: 300, type: 'expense', category: 'investimento' })],
  });
  assert.equal(mov.investimento, 300);
  assert.equal(mov.dias[12], undefined);
});

test('competência manda sobre a data para decidir o mês; a data só posiciona o dia', () => {
  const mov = buildMovimentos({
    ym: MES, daysInMonth: DIAS,
    transactions: [
      // Parcela comprada em janeiro, competência em agosto: pesa em agosto,
      // no dia 15 (dia da compra), porque não há vencimento definido.
      tx({ date: '2026-01-15', amount: 200, competenceMonth: MES }),
      tx({ date: '2026-08-20', amount: 50, competenceMonth: '2026-07' }),
    ],
  });
  assert.equal(mov.dias[15].saidas, 200);
  assert.equal(mov.dias[20], undefined);
});

test('dia 31 num mês de 30 encosta no último dia em vez de sumir', () => {
  const mov = buildMovimentos({
    ym: '2026-09', daysInMonth: 30,
    transactions: [tx({ competenceMonth: '2026-09', date: '2026-09-31', amount: 70 })],
  });
  assert.equal(mov.dias[30].saidas, 70);
});

// ─── Fatura do cartão ───────────────────────────────────────────────────

test('sem vencimento definido, cada gasto de cartão cai no dia da compra', () => {
  const mov = buildMovimentos({
    ym: MES, daysInMonth: DIAS, faturaVencimentoDia: null,
    transactions: [
      tx({ date: '2026-08-03', amount: 100, paymentType: 'cartao' }),
      tx({ date: '2026-08-19', amount: 250, paymentType: 'cartao' }),
    ],
  });
  assert.equal(mov.dias[3].saidas, 100);
  assert.equal(mov.dias[19].saidas, 250);
  assert.equal(mov.faturaAgrupada, false);
});

test('com vencimento definido, o cartão do mês vira uma linha só no dia certo', () => {
  const mov = buildMovimentos({
    ym: MES, daysInMonth: DIAS, faturaVencimentoDia: 10,
    transactions: [
      tx({ date: '2026-08-03', amount: 100, paymentType: 'cartao' }),
      tx({ date: '2026-08-19', amount: 250, paymentType: 'cartao', isProjected: true }),
    ],
  });
  assert.equal(mov.dias[3], undefined);
  assert.equal(mov.dias[19], undefined);
  assert.equal(mov.dias[10].saidas, 350);
  assert.equal(mov.dias[10].itens.length, 1);
  assert.equal(mov.dias[10].itens[0].desc, 'Fatura do cartão');
  assert.equal(mov.dias[10].itens[0].agrupados, 2);
  // Fatura com qualquer parcela projetada dentro é marcada como projetada
  assert.equal(mov.dias[10].itens[0].projetada, true);
  assert.equal(mov.faturaAgrupada, true);
});

test('o total projetado do mês soma só o que entra no saldo', () => {
  const mov = buildMovimentos({
    ym: MES, daysInMonth: DIAS, investIds: ['cat-inv'],
    transactions: [
      tx({ date: '2026-08-22', amount: 476.9, isProjected: true }),
      tx({ date: '2026-08-26', amount: 289, isProjected: true }),
      tx({ date: '2026-08-27', amount: 900, isProjected: true, categoryId: 'cat-inv' }),
      tx({ date: '2026-08-28', amount: 120 }), // registro antigo: sem isProjected
    ],
  });
  assert.equal(Number(mov.projetado.toFixed(2)), 765.9);
});

// ─── buildSerie ─────────────────────────────────────────────────────────

test('a série cobre todos os dias do mês, mesmo os sem movimento', () => {
  const serie = buildSerie({ 5: { entradas: 100, saidas: 0, itens: [{}] } }, DIAS, 0);
  assert.equal(serie.length, DIAS);
  assert.equal(serie[0].dia, 1);
  assert.equal(serie[DIAS - 1].dia, DIAS);
  assert.equal(serie[3].temMovimento, false);
  assert.equal(serie[4].temMovimento, true);
});

test('saldo inicial + entradas − saídas = saldo do último dia', () => {
  const dias = {
    2:  { entradas: 0,    saidas: 86.4,  itens: [{}] },
    5:  { entradas: 5200, saidas: 0,     itens: [{}] },
    14: { entradas: 0,    saidas: 318,   itens: [{}] },
  };
  const serie = buildSerie(dias, DIAS, 1240);
  const fim = serie[DIAS - 1].saldo;
  assert.equal(Number(fim.toFixed(2)), Number((1240 + 5200 - 86.4 - 318).toFixed(2)));
  // O saldo é acumulado, não o movimento do dia
  assert.equal(Number(serie[1].saldo.toFixed(2)), 1153.6);
  assert.equal(Number(serie[4].saldo.toFixed(2)), 6353.6);
});

test('abertura zero é abertura legítima, não ausência de dado', () => {
  const serie = buildSerie({ 3: { entradas: 0, saidas: 50, itens: [{}] } }, DIAS, 0);
  assert.equal(serie[2].saldo, -50);
});

// ─── acharMinimo ────────────────────────────────────────────────────────

test('o mínimo é o menor saldo, não o maior gasto', () => {
  const serie = buildSerie({
    4:  { entradas: 0,    saidas: 990, itens: [{}] },
    5:  { entradas: 5200, saidas: 0,   itens: [{}] },
    20: { entradas: 0,    saidas: 3000, itens: [{}] }, // maior saída, saldo alto
  }, DIAS, 1240);
  const min = acharMinimo(serie);
  assert.equal(min.dia, 4);
  assert.equal(Number(min.saldo.toFixed(2)), 250);
});

test('empate no mínimo resolve pela primeira ocorrência', () => {
  // Dia 3 cai para 100; dia 10 sobe 50 e dia 11 desce 50 → volta a 100.
  const serie = buildSerie({
    3:  { entradas: 0,  saidas: 900, itens: [{}] },
    10: { entradas: 50, saidas: 0,   itens: [{}] },
    11: { entradas: 0,  saidas: 50,  itens: [{}] },
  }, DIAS, 1000);
  const min = acharMinimo(serie);
  assert.equal(min.dia, 3);
  assert.equal(min.saldo, 100);
});

test('mínimo no dia 1 é encontrado', () => {
  const serie = buildSerie({
    1: { entradas: 0,   saidas: 500, itens: [{}] },
    9: { entradas: 800, saidas: 0,   itens: [{}] },
  }, DIAS, 600);
  const min = acharMinimo(serie);
  assert.equal(min.dia, 1);
  assert.equal(min.saldo, 100);
});

test('série vazia não quebra a busca do mínimo', () => {
  assert.equal(acharMinimo([]), null);
});

// ─── contextoDoMinimo ───────────────────────────────────────────────────

test('mínimo negativo conta os dias no vermelho e o dia da recuperação', () => {
  const serie = buildSerie({
    3:  { entradas: 0,    saidas: 500,  itens: [{}] },  // 310 → -190
    9:  { entradas: 0,    saidas: 552,  itens: [{}] },  // -742,10
    13: { entradas: 2722, saidas: 0,    itens: [{}] },  // volta ao positivo
  }, 30, 310);
  const min = acharMinimo(serie);
  assert.equal(min.dia, 9);
  // Negativo do dia 3 ao dia 12 = 10 dias, recuperação no 13
  assert.equal(contextoDoMinimo(serie, min), 'fica negativo por 10 dias, até a entrada do dia 13');
});

test('negativo que não fecha dentro do mês diz isso explicitamente', () => {
  const serie = buildSerie({ 28: { entradas: 0, saidas: 500, itens: [{}] } }, 30, 100);
  const min = acharMinimo(serie);
  // Do dia 28 ao 30 o saldo não se move: o empate resolve pelo primeiro dia
  assert.equal(min.dia, 28);
  assert.equal(contextoDoMinimo(serie, min), 'fica negativo por 3 dias e não volta ao positivo dentro do mês');
});

test('mínimo positivo com entrada logo depois é véspera; longe depois, não', () => {
  const perto = buildSerie({
    4: { entradas: 0,    saidas: 990, itens: [{}] },
    5: { entradas: 5200, saidas: 0,   itens: [{}] },
  }, DIAS, 1153.6);
  assert.equal(contextoDoMinimo(perto, acharMinimo(perto)), 'véspera da entrada do dia 5');

  const longe = buildSerie({
    4:  { entradas: 0,    saidas: 990, itens: [{}] },
    25: { entradas: 5200, saidas: 0,   itens: [{}] },
  }, DIAS, 1153.6);
  assert.equal(contextoDoMinimo(longe, acharMinimo(longe)), '');
});
