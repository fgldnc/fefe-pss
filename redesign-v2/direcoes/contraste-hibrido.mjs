/**
 * contraste-hibrido.mjs — confere WCAG AA da paleta do Radar.
 * Rode com:  node contraste-hibrido.mjs
 *
 * Texto: 4,5:1. Elemento gráfico, borda de campo e glifo de pastilha: 3:1.
 * Cada cor é medida contra os três fundos empilhados (fundo → folha → folha-2)
 * e vale o pior dos três.
 *
 * DOIS TEMAS desde a rodada 9 (frente D). "Tem modo escuro" sem rodar isto é
 * chute: no escuro o mesmo verde que passa no branco reprova, e o mesmo
 * cinza de borda some. Os números aqui são os do `:root` e os do bloco
 * escuro de css/style.css — mexeu lá, mexa aqui, e rode.
 */

const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const razao = (a, b) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** cor com opacidade p sobre um fundo — é assim que a pastilha é composta */
const mistura = (cor, p, fundo) => {
  const A = parseInt(cor.slice(1), 16), B = parseInt(fundo.slice(1), 16);
  const canal = (s) => Math.round(((A >> s & 255) * p + (B >> s & 255) * (1 - p)));
  return '#' + [16, 8, 0].map(s => canal(s).toString(16).padStart(2, '0')).join('');
};

// A MARCA TEM DOIS PAPÉIS, e eles não se confundem:
//   fundo = superfície de marca com BRANCO por cima (botão, faixa do herói)
//   ink   = marca como TEXTO/traço sobre a folha (item ativo, curva do saldo)
// No claro são a mesma cor; no escuro NÃO PODEM ser (ver css/style.css).
const MARCAS = {
  claro: {
    ameixa:  { fundo: ['#7A2E52', '#9A3E6E'], ink: '#7A2E52', tinta: '#F6E8F0' },
    roxo:    { fundo: ['#6B3FA0', '#8557C4'], ink: '#6B3FA0', tinta: '#EFE8F8' },
    grafite: { fundo: ['#2E3440', '#41485A'], ink: '#2E3440', tinta: '#E7E9EE' },
  },
  escuro: {
    ameixa:  { fundo: ['#6E2A4B', '#8C3C66'], ink: '#D98CB4', tinta: '#33222C' },
    roxo:    { fundo: ['#5A3690', '#7149B0'], ink: '#BFA3F0', tinta: '#2A2440' },
    grafite: { fundo: ['#3D434E', '#545B69'], ink: '#C7CACE', tinta: '#2B2D31' },
  },
};

const TEMAS = {
  claro: {
    fundos: { fundo: '#F3F5F9', folha: '#FFFFFF', 'folha-2': '#EDF1F8' },
    serie:  { s1: '#A8336B', s2: '#12915A', s3: '#E0553F', s4: '#B97A0C', s5: '#6B4BC9', s6: '#79838F' },
    texto:  { ink: '#141821', 'ink-2': '#4A5265', 'ink-3': '#616B79',
              entrou: '#0E7C4C', saiu: '#BE3729', deduzido: '#8F5C00' },
    bordaForte: '#7E8999',
    // a pastilha da categoria é a cor a 14% sobre a folha
    chipBase: '#FFFFFF',
  },
  escuro: {
    fundos: { fundo: '#121419', folha: '#1B1E24', 'folha-2': '#23272E' },
    serie:  { s1: '#E48CB4', s2: '#5FCB99', s3: '#F59480', s4: '#D9A64A', s5: '#AC93EC', s6: '#A3ACB7' },
    texto:  { ink: '#F1F2F4', 'ink-2': '#C6CAD1', 'ink-3': '#A2A9B3',
              entrou: '#5FCB99', saiu: '#FF9184', deduzido: '#DDAE55' },
    bordaForte: '#8C949F',
    chipBase: '#1B1E24',
  },
};

let falhas = 0;

const linha = (nome, cor, exige, fundos) => {
  const rs = Object.values(fundos).map(f => razao(cor, f));
  const ok = Math.min(...rs) >= exige;
  if (!ok) falhas++;
  console.log(
    '  ' + nome.padEnd(13) + cor + '  ' + rs.map(r => r.toFixed(2).padStart(7)).join('') +
    `   ${exige}   ${ok ? 'sim' : 'NÃO'}`
  );
};

for (const [tema, p] of Object.entries(TEMAS)) {
  console.log(`\n═══ TEMA ${tema.toUpperCase()} ═══`);
  console.log('  token        cor         fundo  folha folha-2  exige passa');
  console.log('  ── texto ──');
  for (const [k, v] of Object.entries(p.texto)) linha(k, v, 4.5, p.fundos);
  console.log('  ── gráfico e borda ──');
  for (const [k, v] of Object.entries({ 'borda-forte': p.bordaForte, ...p.serie })) linha(k, v, 3, p.fundos);
  console.log('  ── glifo sobre a pastilha da categoria (cor a 14% na folha) ──');
  for (const [k, v] of Object.entries(p.serie)) {
    const chip = mistura(v, 0.14, p.chipBase);
    const r = razao(v, chip);
    if (r < 3) falhas++;
    console.log(`    ${k} sobre ${chip}  ${r.toFixed(2)}   3   ${r >= 3 ? 'sim' : 'NÃO'}`);
  }
}

// A marca entra na varredura de CADA tema: o mesmo ameixa que serve de fundo
// no claro seria texto ilegível sobre a folha escura, e é esse o erro que este
// bloco existe para pegar.
for (const [tema, p] of Object.entries(TEMAS)) {
  console.log(`\n═══ MARCA NO TEMA ${tema.toUpperCase()} ═══`);
  for (const [nome, m] of Object.entries(MARCAS[tema])) {
    for (const [i, c] of m.fundo.entries()) {
      const r = razao('#FFFFFF', c);
      if (r < 4.5) falhas++;
      const rot = nome + (i ? '-fundo-2' : '-fundo');
      console.log(`  branco sobre ${rot.padEnd(16)} ${c}  ${r.toFixed(2)}   4.5   ${r >= 4.5 ? 'sim' : 'NÃO'}`);
    }
    for (const [rot, fundo] of [['folha', p.fundos.folha], ['tinta', m.tinta]]) {
      const r = razao(m.ink, fundo);
      if (r < 4.5) falhas++;
      console.log(`  ${(nome + '-ink').padEnd(14)} sobre ${rot.padEnd(6)} ${m.ink}  ${r.toFixed(2)}   4.5   ${r >= 4.5 ? 'sim' : 'NÃO'}`);
    }
  }
}

console.log(falhas === 0
  ? '\nTudo passa no mínimo exigido.'
  : `\n${falhas} par(es) abaixo do mínimo.`);
