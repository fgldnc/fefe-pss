/**
 * tmp-limpar-fatura.js — limpeza pontual, NÃO faz parte do app.
 *
 * A fatura de julho/2026 entrou QUATRO vezes. Três dessas importações gravaram
 * a competência à mão e com o ano errado (2025-07 duas vezes, 2025-10 uma), e
 * projetaram as parcelas dos contratos a partir de nov/2025 — por isso AMAZON
 * BRSAO P e SENAC aparecem em dobro em Cartão. A quarta importação é a boa: é
 * o lote de ids `fx-…`, com competência 2026-07 deduzida do vencimento.
 *
 * O CRITÉRIO É O CARIMBO DO ARQUIVO, NÃO DESCRIÇÃO PARECIDA. As três ruins
 * carregam `invoiceFingerprint = 5f6f5829…` e `competenceSource: "manual"`;
 * o lote bom não tem fingerprint nenhum. Não há como pegar o certo por engano.
 *
 * ANTES DE APAGAR, TRANSPLANTA OS NOMES EDITADOS À MÃO. Nove linhas do lote
 * ruim foram renomeadas pela usuária ("INGRESSO SHOW DA GABI", os "Compra
 * LIGAFEST - …") e esse texto só existe lá: apagar sem copiar perderia o
 * único trabalho humano que há nesses lotes. O par é achado por data + valor,
 * que é o que os dois lotes têm em comum — a descrição, justamente, não é.
 *
 * Uso: abrir o app logado, colar no console:
 *   await import('/tmp-limpar-fatura.js'); await window.__limparFatura();
 *   await window.__limparFatura({ apagar: true });
 *
 * Volta atrás: restaurar financas-backup-v6-2026-09-19-140119.json.
 */
const FP = '5f6f5829a8a5673349c84c18aee23da1578c4ea89670d1537ce10650be601afe';
const ESPERADO = 213;

const cent = (v) => Math.round((Number(v) || 0) * 100);
const par = (t) => `${t.date}|${cent(t.amount)}`;

window.__limparFatura = async function (opts = {}) {
  const { state } = await import('/js/utils.js');
  const db = await import('/js/db.js');

  const ruins = state.transactions.filter(t => t.invoiceFingerprint === FP);
  const bons = state.transactions.filter(t => String(t.id).startsWith('fx-'));

  console.log(`Lançamentos hoje: ${state.transactions.length}`);
  console.log(`A apagar: ${ruins.length} | lote correto (fx-): ${bons.length}`);

  // Trava: se a conta não bate com o que foi medido no backup v6, o banco não
  // é o que este script analisou. Parar é mais barato que consertar depois.
  if (ruins.length !== ESPERADO) {
    console.error(`ABORTADO: esperava ${ESPERADO}, achei ${ruins.length}. Nada foi feito.`);
    return { ok: false, achado: ruins.length };
  }
  if (ruins.some(t => String(t.id).startsWith('fx-'))) {
    console.error('ABORTADO: o alvo inclui o lote correto. Nada foi feito.');
    return { ok: false };
  }

  // ── nomes editados à mão, para transplantar ──────────────────────────
  // Só conta como edição o que DIVERGE do texto cru do lote bom; o resto do
  // lote ruim é a mesma descrição do parser e não tem nada a preservar.
  const porPar = new Map();
  for (const b of bons) if (!porPar.has(par(b))) porPar.set(par(b), b);

  const transplantes = [];
  const vistos = new Set();
  for (const r of ruins) {
    const b = porPar.get(par(r));
    if (!b || r.description === b.description) continue;
    if (vistos.has(b.id)) continue;          // duas cópias ruins, um alvo só
    vistos.add(b.id);
    transplantes.push({ id: b.id, de: b.description, para: r.description });
  }

  console.log(`\nNomes editados à mão a transplantar: ${transplantes.length}`);
  console.table(transplantes.map(t => ({ 'vira': t.para, 'era': t.de })));

  if (!opts.apagar) {
    console.log('\nConferência só. Para executar: await window.__limparFatura({ apagar: true })');
    return { ok: true, apagar: ruins.length, transplantes: transplantes.length };
  }

  // Renomear PRIMEIRO: se algo falhar no meio, o pior caso é ter os dois
  // lotes com o nome certo — não o lote bom sem o nome e o ruim já apagado.
  for (const t of transplantes) {
    await db.updateFields('transactions', t.id, { description: t.para });
    console.log(`  renomeado: ${t.para}`);
  }

  let feitos = 0;
  for (const t of ruins) {
    await db.deleteTx(t.id);
    if (++feitos % 25 === 0) console.log(`  apagados ${feitos}/${ruins.length}…`);
  }

  console.log(`\nPronto. Apagados ${feitos}, renomeados ${transplantes.length}.`);
  console.log(`Sobraram ${state.transactions.length} lançamentos (esperado: 736).`);
  console.log('Recarregue a página.');
  return { ok: true, apagados: feitos, renomeados: transplantes.length };
};
