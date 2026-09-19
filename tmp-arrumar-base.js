/**
 * tmp-arrumar-base.js — arrumação pontual, NÃO faz parte do app.
 *
 * Roda DEPOIS de tmp-limpar-fatura.js. Três frentes, independentes entre si:
 *
 *   1. FUNDE 8 CATEGORIAS DUPLICADAS. A base tem dois ids para Assinaturas,
 *      Lazer, Vestuário, Saúde, Moradia, Educação, Outros e Investimento.
 *      Não é cosmético, e o sintoma não é ver a categoria duas vezes: o
 *      `loadAllData` já deduplica por NOME e fica com a primeira (db.js:103).
 *      O lado escondido continua gravado nos lançamentos, e HOJE 40 deles —
 *      11 Assinaturas, 12 Lazer, 12 Moradia, 5 Saúde — apontam para um id que
 *      a tela filtrou fora: têm categoria no banco e aparecem sem nome. Pior,
 *      qual dos dois lados sobrevive depende da ordem em que o Firestore
 *      devolve os documentos, que não é garantida — pode inverter entre dois
 *      carregamentos e levar os 40 órfãos para o outro lado.
 *      SOBREVIVE O ID-SLUG (`lazer`, `saude`, …) e não o id aleatório: os
 *      parsers emitem o slug, e `resolveCategoryId` tem atalho por id exato
 *      (utils.js:58) — mantendo o slug, a classificação automática acerta sem
 *      depender da busca por nome.
 *
 *   2. MIGRA 17 LANÇAMENTOS DE INVESTIMENTO PARA APORTE. O app não separava
 *      "aporte" de "entrada de investimento", então o histórico de 2025 ficou
 *      como despesa e nunca virou aporte no ativo. As 5 aplicações de julho/26
 *      que JÁ têm aporte ficam de fora — migrar de novo contaria em dobro.
 *      O `currentValue` NÃO é tocado: a usuária confirmou que o saldo da
 *      Reserva já contém esses R$ 18.500. É por isso que este script escreve
 *      as `contributions` direto em vez de chamar `addAporteToAsset`, que
 *      somaria o aporte no saldo (db.js:382) e inflaria o patrimônio.
 *
 *   3. TIRA OS 2 RESGATES DA LISTA DE DESPESAS. "RESGATE CDB Cofrinhos" é
 *      dinheiro saindo do Cofrinho Itaú para a conta — não é gasto, e estava
 *      contando como despesa de investimento. O ativo não é tocado: o saldo
 *      dele já reflete a saída.
 *
 * SOBRE APAGAR LINHA DE EXTRATO: cinco das linhas mexidas aqui vieram de
 * extrato, e o app recusa apagá-las pela tabela de Mês. A recusa é de UX — o
 * lote de Importar é DERIVADO das linhas (`lotesDeExtrato`, extratos.js:56),
 * não tem contador gravado —, então o lote simplesmente passa a mostrar menos
 * itens. Nada fica mentindo; só não dá para desfazer pelo "excluir lote".
 *
 * Uso: abrir o app logado, colar no console:
 *   await import('/tmp-arrumar-base.js'); await window.__arrumarBase();
 *   await window.__arrumarBase({ executar: true });
 *
 * Volta atrás: restaurar financas-backup-v6-2026-09-19-140119.json.
 */

/** id que some  →  id que fica. O que fica é sempre o slug (ver cabeçalho). */
const FUSAO = {
  '0vcL7DcvvTrH3NquqSFi': 'assinatura',
  '2rL6gn6gdH1GKI4UGbXQ': 'lazer',
  '0Dh2uP2QRSFaux92iJSC': 'vestuario',
  '1g3QLx6uJ2vnhOxYDDUR': 'saude',
  'Q6hObJpom83U51HYF6YP': 'moradia',
  'wtk1z6KW51pnGuOWRt5V': 'educacao',
  'q2ObsG8PXtEbAe3W4DR1': 'outros',
  'PeN4LIxUoj7ZiolRLCl5': 'investimento',
};

/** Os 17 a migrar, por data+valor. O destino veio da usuária: tudo na Reserva,
 *  menos a linha de aposentadoria, que vai para o Tesouro IPCA 2050. */
const RESERVA = 'a2';
const APOSENTADORIA = 'a6';
const APORTES = [
  ['2025-01-15', 1500.00, RESERVA], ['2025-02-15', 1500.00, RESERVA],
  ['2025-03-15', 1500.00, RESERVA], ['2025-04-15', 1500.00, RESERVA],
  ['2025-05-15', 1500.00, RESERVA], ['2025-06-15', 1500.00, RESERVA],
  ['2025-07-15', 1500.00, RESERVA], ['2025-08-15', 1500.00, RESERVA],
  ['2025-09-15', 2000.00, RESERVA], ['2025-10-15', 2000.00, RESERVA],
  ['2025-11-15', 2000.00, RESERVA], ['2026-03-02',  970.00, RESERVA],
  ['2026-04-02',  144.12, APOSENTADORIA],
  ['2026-04-02', 1500.00, RESERVA], ['2026-04-16', 1800.00, RESERVA],
  ['2026-05-31',  500.00, RESERVA], ['2026-07-13', 1000.00, RESERVA],
];

const cent = (v) => Math.round((Number(v) || 0) * 100);
const CATS_INV = ['investimento', 'PeN4LIxUoj7ZiolRLCl5'];

window.__arrumarBase = async function (opts = {}) {
  const { state } = await import('/js/utils.js');
  const db = await import('/js/db.js');
  const faz = !!opts.executar;
  const log = [];

  // `state.transactions` EXCLUI as linhas de extrato — `loadAllData` separa as
  // duas listas (db.js:90). As duas moram na MESMA coleção do Firestore, então
  // escrever é igual; o que muda é onde achá-las. Três dos 17 aportes e os dois
  // resgates são de extrato: sem juntar as listas, o script abortaria neles.
  const todas = [...state.transactions, ...(state.extratoTransactions || [])];

  // ── 1. categorias ───────────────────────────────────────────────────
  const txRepontar = todas.filter(t => FUSAO[t.categoryId]);
  // Os orçamentos vêm do Firestore, não do `state`: ali eles já foram
  // transformados no mapa { "YYYY-MM": { catId: valor } } (db.js:115) e os
  // ids dos documentos se perderam no caminho.
  const bgRepontar = (await db.getAll('budgets')).filter(b => FUSAO[b.categoryId]);
  // `state.categories` já vem deduplicado por nome (db.js:103), então o lado
  // escondido de cada par não está ali. A fusão precisa dos dois.
  const catsSumir  = (await db.getAll('categories')).filter(c => FUSAO[c.id]);
  log.push(`1. categorias: ${txRepontar.length} lançamentos e ${bgRepontar.length} orçamentos repontados, ${catsSumir.length} categorias apagadas`);

  // ── 2. aportes ──────────────────────────────────────────────────────
  // Casa cada linha da lista com o lançamento real, por data + valor. Se
  // alguma não casar, PARA: lista escrita à mão contra banco que mudou é
  // exatamente o caso em que escrever no ativo errado passa despercebido.
  const inv = todas.filter(t => CATS_INV.includes(t.categoryId));
  const casados = [];
  const orfas = [];
  for (const [data, valor, ativoId] of APORTES) {
    const tx = inv.find(t => t.date === data && cent(t.amount) === cent(valor)
                             && !casados.some(c => c.tx.id === t.id));
    if (!tx) { orfas.push(`${data} R$ ${valor}`); continue; }
    casados.push({ tx, ativoId });
  }
  log.push(`2. aportes: ${casados.length} de ${APORTES.length} casados` + (orfas.length ? ` — NÃO ACHEI: ${orfas.join(', ')}` : ''));

  // ── 3. resgates ─────────────────────────────────────────────────────
  const resgates = todas.filter(t => CATS_INV.includes(t.categoryId) && /RESGATE/i.test(t.description));
  log.push(`3. resgates a tirar das despesas: ${resgates.length} (R$ ${resgates.reduce((s, t) => s + t.amount, 0).toFixed(2)})`);

  console.log(log.join('\n'));

  if (orfas.length) {
    console.error('ABORTADO: a lista de aportes não bate com o banco. Nada foi feito.');
    return { ok: false, orfas };
  }
  if (!faz) {
    console.log('\nConferência só. Para executar: await window.__arrumarBase({ executar: true })');
    return { ok: true, previa: log };
  }

  // ── executa ─────────────────────────────────────────────────────────
  for (const t of txRepontar) await db.updateFields('transactions', t.id, { categoryId: FUSAO[t.categoryId] });
  console.log(`  ${txRepontar.length} lançamentos repontados`);
  for (const b of bgRepontar) await db.updateFields('budgets', b.id, { categoryId: FUSAO[b.categoryId] });
  console.log(`  ${bgRepontar.length} orçamentos repontados`);
  for (const c of catsSumir) await db.deleteCategory(c.id);
  console.log(`  ${catsSumir.length} categorias duplicadas apagadas`);

  // Agrupa por ativo: uma escrita por ativo, não uma por aporte — saveAsset
  // reescreve o documento inteiro, e escritas sequenciais no mesmo ativo
  // deixariam o state intermediário decidir o resultado.
  const porAtivo = new Map();
  for (const { tx, ativoId } of casados) {
    if (!porAtivo.has(ativoId)) porAtivo.set(ativoId, []);
    porAtivo.get(ativoId).push({
      amount: tx.amount,
      date: tx.date,
      obs: tx.description,
      source: 'migracao-historico',
    });
  }
  for (const [ativoId, novos] of porAtivo) {
    const asset = state.assets.find(a => a.id === ativoId);
    if (!asset) { console.error(`  ativo ${ativoId} não existe — pulado`); continue; }
    const { id: _ignora, ...dados } = asset;
    // currentValue INTOCADO de propósito: o saldo já contém esses aportes.
    await db.saveAsset({ ...dados, contributions: [...(asset.contributions || []), ...novos] }, ativoId);
    console.log(`  ${novos.length} aportes em "${asset.name}" (saldo inalterado: R$ ${asset.currentValue})`);
  }
  // O lançamento vira aporte: deixá-lo também como despesa contaria duas vezes.
  for (const { tx } of casados) await db.deleteTx(tx.id);
  console.log(`  ${casados.length} lançamentos de investimento removidos das despesas`);

  for (const t of resgates) await db.deleteTx(t.id);
  console.log(`  ${resgates.length} resgates removidos das despesas`);

  console.log('\nPronto. Recarregue a página.');
  return { ok: true };
};
