/**
 * saldos.js — o CÁLCULO do fluxo de caixa. Sem DOM, sem `state`, sem Chart.js.
 *
 * Deixou de ser uma aba na rodada 4 do redesign v2: a tela virou
 * `js/adiante.js`. Aqui ficaram as quatro funções puras — que são a parte que
 * erra em silêncio, porque um saldo errado não lança exceção, só mostra o dia
 * errado como "menor saldo do mês". São elas que `test/saldos.test.mjs` fixa.
 *
 * Duas regras que atravessam as quatro:
 *
 * - SALDO ≠ FLUXO ACUMULADO. `buildSerie` recebe a base por argumento; quem
 *   chama é que sabe se existe saldo inicial declarado. Passar zero quando não
 *   há abertura produz fluxo acumulado, não saldo — e a tela precisa dizer isso
 *   em vez de chamar o resultado de "menor saldo".
 * - INVESTIMENTO NÃO ENTRA NO SALDO. `buildMovimentos` o separa em
 *   `investimento`, fora de entradas e saídas, por decisão de produto.
 */

import { isOfMonth } from './utils.js';

// ═══════════════════════════════════════════════════════════════════════
// CÁLCULO — funções puras, sem DOM e sem `state`, para poderem ser testadas
// (test/saldos.test.mjs).
// ═══════════════════════════════════════════════════════════════════════

/**
 * Agrupa os lançamentos do mês por dia.
 *
 * Sobre a divisão das fontes — ela está certa e é frágil, não mexa sem ler:
 * as ENTRADAS vêm só de `incomes`, porque entrada de extrato bancário já é
 * espelhada lá por extratos.js; de `extratos` só entram `type === 'expense'`.
 * Somar as duas duplicaria o salário.
 *
 * Sobre competência × data: a pertinência ao mês vem de `isOfMonth`
 * (competenceMonth vence a data), e `date` entra só com o número do dia, para
 * posicionar a linha. Uma parcela comprada em janeiro com competência em maio
 * pesa na fatura de maio — é lá que ela desconta o caixa.
 *
 * Sobre a fatura: gasto de cartão não sai do caixa no dia da compra, sai no dia
 * do vencimento. Com vencimento definido, todo o cartão do mês vira UMA linha
 * nesse dia. Sem ele, cai no comportamento antigo (dia da compra) e a tela
 * avisa que está inferindo — dez parcelas espalhadas pelo mês fazem o "menor
 * saldo" apontar o dia errado.
 *
 * UM VENCIMENTO POR CARTÃO. Quem tem dois cartões tem duas faturas, em dias
 * diferentes, e somá-las num dia só inventa um aperto que não existe — ou
 * esconde o que existe. `vencimentoPorCartao` é um mapa nome→dia;
 * `faturaVencimentoDia` continua sendo o dia do cartão SEM nome informado,
 * que é o caso de todo mundo que nunca preencheu o campo. Sem nenhum dos dois
 * para um lançamento, ele cai no dia da compra, como sempre foi.
 */
export function buildMovimentos({
  ym, daysInMonth, transactions = [], extratos = [], incomes = [],
  investIds = [], faturaVencimentoDia = null, vencimentoPorCartao = {},
  resolveCat = id => id,
}) {
  const dias = {};
  const dia = d => (dias[d] = dias[d] || { entradas: 0, saidas: 0, itens: [] });

  let investimento = 0;
  let projetado    = 0;

  // Uma fatura POR CARTÃO. A chave é o nome em minúsculas ('' = cartão não
  // informado), e cada uma carrega o dia em que ela vence.
  const faturas = new Map();
  const diaDaFatura = (cartao) => {
    const nome = String(cartao || '').trim();
    if (!nome) return faturaVencimentoDia;
    // Cartão nomeado sem dia próprio usa o dia geral: é melhor agrupar no dia
    // provável do que espalhar a fatura pelos dias das compras.
    const proprio = vencimentoPorCartao?.[nome] ?? vencimentoPorCartao?.[nome.toLowerCase()];
    return proprio ?? faturaVencimentoDia;
  };

  const diaDe = (dataISO) => {
    const d = parseInt(String(dataISO).slice(8, 10), 10);
    if (!Number.isFinite(d) || d < 1) return null;
    // Dia 31 num mês de 30: encosta no último dia em vez de sumir da tabela.
    return Math.min(d, daysInMonth);
  };

  for (const tx of transactions) {
    if (!isOfMonth(tx, ym) || !tx.date) continue;
    if (tx.source === 'statement_import') continue; // tratado no laço de extratos
    if (tx.type === 'transfer') continue;           // transferência não é despesa
    const valor = tx.amount || 0;

    if (investIds.includes(tx.categoryId)) {
      investimento += valor;
      continue; // informativo: fora do saldo, por decisão de produto
    }
    if (tx.isProjected) projetado += valor;

    const vencDele = tx.paymentType === 'cartao' ? diaDaFatura(tx.card) : null;
    if (vencDele) {
      const nome  = String(tx.card || '').trim();
      const chave = nome.toLowerCase();
      const f = faturas.get(chave) || { nome, dia: vencDele, total: 0, itens: 0, projetado: 0 };
      f.total += valor;
      f.itens++;
      if (tx.isProjected) f.projetado += valor;
      faturas.set(chave, f);
      continue;
    }

    const d = diaDe(tx.date);
    if (d === null) continue;
    dia(d).saidas += valor;
    dia(d).itens.push({
      desc: tx.description || 'Lançamento',
      valor, tipo: 'out',
      projetada: !!tx.isProjected,
      parcela: tx.installmentTotal > 1 ? `${tx.installmentCurrent}/${tx.installmentTotal}` : null,
    });
  }

  // Uma linha por fatura. O nome do cartão entra na descrição só quando há mais
  // de uma: com uma só, "Fatura do cartão · Nubank" repete o que já é único.
  const varias = faturas.size > 1;
  for (const f of faturas.values()) {
    if (f.itens === 0) continue;
    const d = Math.min(f.dia, daysInMonth);
    dia(d).saidas += f.total;
    dia(d).itens.push({
      desc: varias && f.nome ? `Fatura do cartão · ${f.nome}`
          : varias          ? 'Fatura do cartão · sem cartão informado'
          :                   'Fatura do cartão',
      valor: f.total, tipo: 'out',
      projetada: f.projetado > 0,
      parcela: null,
      agrupados: f.itens,
      cartao: f.nome || null,
    });
  }

  for (const inc of incomes) {
    if (!inc.date) continue;
    const d = diaDe(inc.date);
    if (d === null) continue;
    dia(d).entradas += inc.amount || 0;
    dia(d).itens.push({
      desc: inc.description || inc.source || 'Receita',
      valor: inc.amount || 0, tipo: 'in', projetada: false, parcela: null,
    });
  }

  for (const tx of extratos) {
    if (!tx.date || !isOfMonth(tx, ym)) continue;
    if (tx.type !== 'expense') continue; // income já veio de `incomes`
    // O extrato classifica com slug do parser ('investimento'), não com o ID
    // real da categoria — sem resolver, o aporte entraria como saída e o total
    // de saídas desta aba divergiria do KPI de Despesas do Dashboard.
    if (investIds.includes(resolveCat(tx.categoryId || tx.category))) {
      investimento += tx.amount || 0;
      continue;
    }
    const d = diaDe(tx.date);
    if (d === null) continue;
    dias[d] = dias[d] || { entradas: 0, saidas: 0, itens: [] };
    dias[d].saidas += tx.amount || 0;
    dias[d].itens.push({
      desc: tx.description || 'Lançamento do extrato',
      valor: tx.amount || 0, tipo: 'out', projetada: false, parcela: null,
    });
  }

  // `faturaAgrupada` continua sendo um booleano: quem consome só quer saber se
  // houve agrupamento, para dizer se está mostrando fatura ou dia da compra.
  const faturaAgrupada = [...faturas.values()].some(f => f.itens > 0);
  return { dias, investimento, projetado, faturaAgrupada };
}

/**
 * Série diária de saldo: `base` no dia 1, mais entradas, menos saídas.
 * Devolve um ponto por dia do mês, sempre — o gráfico precisa da série cheia
 * mesmo quando a tabela mostra só os dias com movimento.
 */
export function buildSerie(dias, daysInMonth, base = 0) {
  const serie = [];
  let saldo = base;
  for (let d = 1; d <= daysInMonth; d++) {
    const mov = dias[d] || { entradas: 0, saidas: 0, itens: [] };
    saldo += (mov.entradas || 0) - (mov.saidas || 0);
    serie.push({
      dia: d,
      entradas: mov.entradas || 0,
      saidas: mov.saidas || 0,
      itens: mov.itens || [],
      saldo,
      temMovimento: (mov.itens || []).length > 0,
    });
  }
  return serie;
}

/** Menor saldo do mês. Empate: a PRIMEIRA ocorrência, para o dia citado no KPI,
 *  o ponto do gráfico e a linha destacada serem sempre o mesmo. */
export function acharMinimo(serie) {
  if (!serie.length) return null;
  let min = serie[0];
  for (const p of serie) if (p.saldo < min.saldo) min = p;
  return min;
}

/**
 * Contexto da sublinha do herói. O dia sozinho não decide nada; o que decide é
 * saber se o buraco fecha e quando.
 * Precedência: negativo → véspera de entrada → só o dia.
 */
export function contextoDoMinimo(serie, min) {
  if (!min) return '';

  if (min.saldo < 0) {
    // Extensão do trecho negativo que CONTÉM o mínimo, não do mês inteiro.
    let ini = min.dia, fim = min.dia;
    while (ini > 1 && serie[ini - 2].saldo < 0) ini--;
    while (fim < serie.length && serie[fim].saldo < 0) fim++;
    const dias = fim - ini + 1;
    const volta = serie.find(p => p.dia > min.dia && p.saldo >= 0);
    return volta
      ? `fica negativo por ${dias} ${dias === 1 ? 'dia' : 'dias'}, até a entrada do dia ${volta.dia}`
      : `fica negativo por ${dias} ${dias === 1 ? 'dia' : 'dias'} e não volta ao positivo dentro do mês`;
  }

  // "Logo depois" = até 3 dias. Além disso não é véspera de nada, é coincidência.
  const entrada = serie.find(p => p.dia > min.dia && p.dia <= min.dia + 3 && p.entradas > 0);
  return entrada ? `véspera da entrada do dia ${entrada.dia}` : '';
}

