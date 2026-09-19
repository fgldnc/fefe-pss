/**
 * tmp-regras.js — terceira e última arrumação. NÃO faz parte do app.
 *
 * Duas coisas, nesta ordem:
 *
 *   1. CADASTRA 5 REGRAS DE CLASSIFICAÇÃO e as aplica ao que já está na base.
 *      A coleção `rules` estava VAZIA: o app nunca teve regra da usuária, só
 *      as de fábrica (`DEFAULT_RULES`, base-parser.js:6). As de fábrica já
 *      resolvem boa parte, mas não conhecem sorveteria, 99 Ride, Buser nem
 *      assinatura de IA — e é justamente o que se repete na base dela.
 *      REGRA, NÃO SCRIPT DE PREENCHER: um script consertaria as 78 linhas de
 *      hoje e a próxima importação traria as mesmas sem categoria de novo.
 *      A regra fica em Ajustes → Categorias e regras, editável, e vale para
 *      toda importação futura.
 *
 *   2. CONFIRMA AS 5 PARCELAS PREVISTAS VENCIDAS (opcional, ver `parcelas`).
 *      São parcelas de contrato de valor fixo cuja competência já passou;
 *      confirmá-las é dizer "aconteceu mesmo". Usa o MESMO caminho que a tela
 *      de Conferir usa (`saveTx` com `isProjected: false`), e não o
 *      `confirmarProjecao` de gastos.js, que abre um `confirm()` por parcela.
 *
 * A CLASSIFICAÇÃO USA O MOTOR DO PRÓPRIO APP. `autoClassify` de
 * base-parser.js, com `state.importRules` como regras do usuário — as mesmas
 * funções que a importação chama. Reescrever as regras aqui criaria uma
 * segunda cópia da regra de classificação, que é exatamente o que o projeto
 * evita em `getInvestCatIds` e em `semCat`.
 *
 * Uso: abrir o app logado, colar no console:
 *   await import('/tmp-regras.js'); await window.__regras();
 *   await window.__regras({ executar: true });
 *   await window.__regras({ executar: true, parcelas: true });   // + as 5 parcelas
 *
 * Volta atrás: as regras se apagam em Ajustes; a categoria de cada lançamento,
 * no modal de Mês. E o backup v6 continua valendo.
 */

/**
 * As 5 regras. Os padrões usam " *" em vez de `\s*` de propósito: o padrão
 * viaja como STRING até o Firestore e volta por `new RegExp(r.pattern)`, e
 * barra invertida em string é a fonte clássica de regra que "não pega nada".
 */
const REGRAS = [
  { pattern: '99 *food|ifd\\*|sorveteria|cheirin *bao|pastelar|alimentos|decanto|sub *contorno|papua',
    category: 'alimentacao', type: 'expense' },
  { pattern: '99 *ride|buser', category: 'transporte', type: 'expense' },
  { pattern: 'claude\\.ai|anthropic|openai|chatgpt', category: 'assinatura', type: 'expense' },
  { pattern: 'cofrinho', category: 'investimento', type: 'expense' },
  { pattern: 'booking\\.com|airbnb|hotel|hostel', category: 'viagem', type: 'expense' },
];

window.__regras = async function (opts = {}) {
  const u = await import('/js/utils.js');
  const db = await import('/js/db.js');
  const { autoClassify } = await import('/js/parsers/base-parser.js');
  const { state, resolveCategoryId } = u;
  const faz = !!opts.executar;

  // ── 1. regras ───────────────────────────────────────────────────────
  const jaTem = new Set((state.importRules || []).map(r => r.pattern));
  const novas = REGRAS.filter(r => !jaTem.has(r.pattern));
  console.log(`Regras cadastradas hoje: ${(state.importRules || []).length} · a cadastrar: ${novas.length}`);

  // Simula com as regras novas já valendo, para a prévia contar certo.
  const comNovas = [...(state.importRules || []), ...novas];

  // `state.transactions` exclui as linhas de extrato (db.js:90) — as duas
  // listas moram na mesma coleção, então escrever é igual nas duas.
  const todas = [...state.transactions, ...(state.extratoTransactions || [])];
  const semCat = todas.filter(t => t.type !== 'income' && !(t.categoryId || resolveCategoryId(t.category)));

  const plano = [];
  for (const t of semCat) {
    const { category } = autoClassify(t.description, t.amount, comNovas);
    const catId = category ? resolveCategoryId(category) : '';
    if (catId) plano.push({ t, catId });
  }

  const porCat = {};
  for (const p of plano) {
    const nome = (state.categories.find(c => c.id === p.catId) || {}).name || p.catId;
    porCat[nome] = (porCat[nome] || 0) + 1;
  }
  console.log(`\nSem categoria: ${semCat.length} · o motor classifica ${plano.length} · restam ${semCat.length - plano.length}`);
  console.table(Object.entries(porCat).map(([categoria, linhas]) => ({ categoria, linhas })));

  const sobram = semCat.filter(t => !plano.some(p => p.t.id === t.id));
  if (sobram.length) {
    console.log('Sobram (uma escolha sua em Conferir, ou "Outros"):');
    sobram.forEach(t => console.log(`   ${t.date}  R$ ${Number(t.amount).toFixed(2)}  ${t.description}`));
  }

  // ── 2. parcelas previstas vencidas ──────────────────────────────────
  const mes = u.thisMonth();
  const previstas = state.transactions.filter(t => t.isProjected && u.competenceOf(t) && u.competenceOf(t) < mes);
  console.log(`\nParcelas previstas vencidas: ${previstas.length}` + (opts.parcelas ? ' — SERÃO CONFIRMADAS' : ' — não serão tocadas (passe { parcelas: true })'));
  previstas.forEach(t => console.log(`   ${t.description} ${t.installmentCurrent}/${t.installmentTotal} · ${u.competenceOf(t)} · R$ ${Number(t.amount).toFixed(2)}`));

  if (!faz) {
    console.log('\nConferência só. Para executar: await window.__regras({ executar: true })');
    return { ok: true };
  }

  // ── executa ─────────────────────────────────────────────────────────
  for (const r of novas) {
    const id = await db.saveDoc('rules', r);
    if (!state.importRules) state.importRules = [];
    state.importRules.push({ id, ...r });
    console.log(`  regra cadastrada: ${r.category} ← ${r.pattern}`);
  }
  for (const { t, catId } of plano) await db.updateFields('transactions', t.id, { categoryId: catId });
  console.log(`  ${plano.length} lançamentos classificados`);

  if (opts.parcelas) {
    for (const t of previstas) {
      const { id: _ignora, ...dados } = t;
      await db.saveTx({ ...dados, isProjected: false }, t.id);
      console.log(`  confirmada: ${t.description} ${t.installmentCurrent}/${t.installmentTotal}`);
    }
  }

  console.log('\nPronto. Recarregue a página.');
  return { ok: true };
};
