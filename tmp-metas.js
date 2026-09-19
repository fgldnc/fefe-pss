/**
 * tmp-metas.js — quarta e última arrumação. NÃO faz parte do app.
 *
 * O PROBLEMA: nenhum dos 8 ativos tinha `linkedGoalId`. Sem o vínculo, aporte
 * no ativo não credita a meta (db.js:390), e as duas telas contavam o mesmo
 * dinheiro em separado — a meta "Reserva de Emergência" estava R$ 3.100,00
 * atrás do ativo, que é exatamente a soma dos 4 aportes de julho. A migração
 * do histórico piorou o desencontro, porque entrou só de um lado.
 *
 * O QUE FAZ, confirmado pela usuária:
 *   Reserva de Emergência   ← Reserva Emergência (CDB/Selic)
 *   Reserva Aposentadoria   ← Tesouro SELIC 2031 + Tesouro IPCA 2050
 *
 * VÁRIOS ATIVOS PODEM APONTAR PARA A MESMA META: o vínculo mora no ativo, não
 * na meta. Por isso a Aposentadoria pode ser alimentada por dois Tesouros.
 *
 * `currentAmount` da meta passa a ser a SOMA DO VALOR ATUAL dos ativos ligados
 * — o valor do ativo é o que a usuária confere no extrato do banco; o da meta
 * era digitado à mão e por isso derivou.
 *
 * AS CONTRIBUIÇÕES SÃO UNIÃO, NÃO SUBSTITUIÇÃO. Espelhar direto apagaria o que
 * só existe do lado da meta — o aporte de R$ 90,97 de 18/06 na Aposentadoria
 * não tem correspondente em ativo nenhum. A união casa por data+valor, então
 * o que já existe dos dois lados não duplica, e o que é exclusivo sobrevive.
 * O script imprime o que preservou.
 *
 * A MARCA NA TELA NÃO PRECISA DE CÓDIGO NOVO: `js/guardado.js:312` já desenha
 * "↳ credita a meta <b>Nome</b>" embaixo do ativo, e a meta já lista
 * "↳ alimentada por". As duas estavam mudas só porque não havia vínculo.
 *
 * Uso: abrir o app logado, colar no console:
 *   await import('/tmp-metas.js'); await window.__metas();
 *   await window.__metas({ executar: true });
 *
 * Volta atrás: o backup v6.
 */

/** meta → ativos que a alimentam. */
const VINCULOS = [
  { metaId: 'sinwhy4k', ativos: ['a2'] },          // Reserva de Emergência
  { metaId: 'x7wogtnk', ativos: ['a5', 'a6'] },    // Reserva Aposentadoria
];

const cent = (v) => Math.round((Number(v) || 0) * 100);
const chave = (c) => `${c.date}|${cent(c.amount)}`;

window.__metas = async function (opts = {}) {
  const { state } = await import('/js/utils.js');
  const db = await import('/js/db.js');
  const faz = !!opts.executar;

  const plano = [];
  for (const { metaId, ativos } of VINCULOS) {
    const meta = state.goals.find(g => g.id === metaId);
    if (!meta) { console.error(`meta ${metaId} não existe — pulada`); continue; }
    const assets = ativos.map(id => state.assets.find(a => a.id === id)).filter(Boolean);
    if (assets.length !== ativos.length) { console.error(`algum ativo de ${meta.name} não existe — pulada`); continue; }

    const valor = assets.reduce((s, a) => s + (a.currentValue || 0), 0);
    const dosAtivos = assets.flatMap(a => (a.contributions || []).map(c => ({
      amount: c.amount, date: c.date, obs: c.obs || a.name, source: c.source || 'ativo',
    })));
    const vistos = new Set(dosAtivos.map(chave));
    const sóDaMeta = (meta.contributions || []).filter(c => !vistos.has(chave(c)));

    plano.push({ meta, assets, valor, dosAtivos, sóDaMeta });

    console.log(`\n${meta.name}`);
    console.log(`  alimentada por: ${assets.map(a => a.name).join(' + ')}`);
    console.log(`  valor: R$ ${(meta.currentAmount || 0).toFixed(2)} → R$ ${valor.toFixed(2)} (de R$ ${(meta.targetAmount || 0).toFixed(2)})`);
    console.log(`  aportes: ${(meta.contributions || []).length} → ${dosAtivos.length + sóDaMeta.length}`);
    if (sóDaMeta.length) {
      console.log(`  preservados (só existem na meta):`);
      sóDaMeta.forEach(c => console.log(`     ${c.date}  R$ ${Number(c.amount).toFixed(2)}`));
    }
  }

  if (!faz) {
    console.log('\nConferência só. Para executar: await window.__metas({ executar: true })');
    return { ok: true };
  }

  for (const { meta, assets, valor, dosAtivos, sóDaMeta } of plano) {
    const contributions = [...dosAtivos, ...sóDaMeta].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const { id: _gid, ...dados } = meta;
    await db.saveGoal({ ...dados, currentAmount: valor, contributions }, meta.id);
    console.log(`  meta "${meta.name}": R$ ${valor.toFixed(2)}, ${contributions.length} aportes`);

    // O vínculo por último: se algo falhar antes, o pior caso é meta sem
    // vínculo (o estado de hoje), não vínculo apontando para meta desatualizada.
    for (const a of assets) {
      await db.updateFields('assets', a.id, { linkedGoalId: meta.id });
      a.linkedGoalId = meta.id;
      console.log(`    ativo "${a.name}" vinculado`);
    }
  }

  console.log('\nPronto. Recarregue a página.');
  return { ok: true };
};
