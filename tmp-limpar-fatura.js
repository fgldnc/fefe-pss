/**
 * tmp-limpar-fatura.js — limpeza pontual, NÃO faz parte do app.
 *
 * A fatura de julho/2026 (invoiceFingerprint 5f6f5829…) entrou quatro vezes:
 * um lote com competência 2025-10, dois lotes com 2025-07 (o mesmo arquivo
 * duas vezes, 130 linhas para 65 compras) e o lote correto, de ids `fx-…`,
 * com competência 2026-07.
 *
 * Este script apaga os TRÊS lotes errados — 197 linhas, R$ 8.336,77 — e deixa
 * o lote `fx-…` intacto. O alvo é o carimbo do próprio arquivo, não descrição
 * parecida: o lote bom não tem `invoiceFingerprint`, então não há como pegá-lo.
 *
 * Uso: abrir o app logado, colar no console:
 *   await import('/tmp-limpar-fatura.js'); await window.__limparFatura();      // confere só
 *   await window.__limparFatura({ apagar: true });                            // apaga
 *
 * Volta atrás: restaurar financas-backup-v6-2026-09-19-140119.json.
 */
const FP = '5f6f5829a8a5673349c84c18aee23da1578c4ea89670d1537ce10650be601afe';
const COMPETENCIAS_ERRADAS = ['2025-07', '2025-10'];
const ESPERADO = 197;

window.__limparFatura = async function (opts = {}) {
  const { state } = await import('/js/utils.js');
  const db = await import('/js/db.js');

  const alvo = state.transactions.filter(
    t => t.invoiceFingerprint === FP && COMPETENCIAS_ERRADAS.includes(t.competenceMonth)
  );
  const total = alvo.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  console.log(`Lançamentos hoje: ${state.transactions.length}`);
  console.log(`Alvo: ${alvo.length} linhas, R$ ${total.toFixed(2)}`);
  console.table(
    Object.entries(alvo.reduce((a, t) => { a[t.competenceMonth] = (a[t.competenceMonth] || 0) + 1; return a; }, {}))
      .map(([competencia, linhas]) => ({ competencia, linhas }))
  );

  // Trava: se a conta não bate com o que foi medido no backup v6, o estado do
  // banco não é o que este script analisou — parar é mais barato que consertar.
  if (alvo.length !== ESPERADO) {
    console.error(`ABORTADO: esperava ${ESPERADO} linhas, achei ${alvo.length}. Nada foi apagado.`);
    return { ok: false, achado: alvo.length };
  }
  // Cinto e suspensório: o lote correto tem id `fx-…` e nenhum fingerprint.
  if (alvo.some(t => String(t.id).startsWith('fx-'))) {
    console.error('ABORTADO: o alvo inclui uma linha do lote correto. Nada foi apagado.');
    return { ok: false };
  }

  if (!opts.apagar) {
    console.log('Conferência só. Para apagar: await window.__limparFatura({ apagar: true })');
    return { ok: true, alvo: alvo.length };
  }

  let feitos = 0;
  for (const t of alvo) {
    await db.deleteTx(t.id);
    if (++feitos % 25 === 0) console.log(`  ${feitos}/${alvo.length}…`);
  }
  console.log(`Apagados ${feitos}. Sobraram ${state.transactions.length} lançamentos (esperado: 752).`);
  console.log('Recarregue a página para as telas recontarem.');
  return { ok: true, apagados: feitos };
};
