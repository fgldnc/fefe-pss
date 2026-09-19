/**
 * contraste.mjs — a tabela de contraste do DESIGN-SYSTEM-v2.md, calculada.
 * Rode com:  node contraste.mjs
 *
 * Fórmula WCAG 2.x: luminância relativa com gamma sRGB, razão (L1+.05)/(L2+.05).
 * Exigido: 4,5:1 para texto normal, 3:1 para elemento gráfico e borda de campo.
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

const TEMAS = {
  ESCURO: {
    fundos: { 'bg-app': '#0E1014', 'bg-surface': '#161A21', 'bg-raised': '#1E232C' },
    frente: {
      'text-1': ['#EEF0F4', 4.5], 'text-2': ['#A8B0BE', 4.5], 'text-3': ['#828B99', 4.5],
      'brand': ['#8E9BFF', 4.5], 'income': ['#5BD98C', 4.5], 'expense': ['#FF8A82', 4.5],
      'inferred': ['#F0B849', 4.5], 'c5': ['#5FD0D6', 3], 'c6': ['#D08CE8', 3],
      'line-strong': ['#666F80', 3], 'line': ['#333A47', 0],
    },
    sobreMarca: ['#0E1014', '#8E9BFF'],
  },
  CLARO: {
    fundos: { 'bg-app': '#F6F5F2', 'bg-surface': '#FFFFFF', 'bg-raised': '#EFEEEA' },
    frente: {
      'text-1': ['#15171C', 4.5], 'text-2': ['#555C69', 4.5], 'text-3': ['#636A76', 4.5],
      'brand': ['#4A4FD4', 4.5], 'income': ['#0B7A45', 4.5], 'expense': ['#C0362B', 4.5],
      'inferred': ['#8A5A00', 4.5], 'c5': ['#0E6E77', 3], 'c6': ['#8A3FA8', 3],
      'line-strong': ['#8C887E', 3], 'line': ['#D4D2CC', 0],
    },
    sobreMarca: ['#FFFFFF', '#4A4FD4'],
  },
};

let falhas = 0;
for (const [nome, t] of Object.entries(TEMAS)) {
  console.log(`\n### ${nome}`);
  const fundos = Object.entries(t.fundos);
  console.log('token'.padEnd(13) + fundos.map(([f]) => f.padStart(12)).join('') + '   exige  passa');
  for (const [token, [cor, exige]] of Object.entries(t.frente)) {
    const rs = fundos.map(([, fv]) => razao(cor, fv));
    const ok = exige === 0 ? '—' : (Math.min(...rs) >= exige ? 'sim' : 'NÃO');
    if (ok === 'NÃO') falhas++;
    console.log(
      token.padEnd(13) + rs.map(r => r.toFixed(2).padStart(12)).join('') +
      (exige === 0 ? '  decorativa' : `   ${exige}     ${ok}`)
    );
  }
  const [fg, bg] = t.sobreMarca;
  const r = razao(fg, bg);
  if (r < 4.5) falhas++;
  console.log(`brand-fg sobre brand: ${r.toFixed(2)}   4.5   ${r >= 4.5 ? 'sim' : 'NÃO'}`);
}
console.log(falhas === 0
  ? '\nTodos os pares passam no mínimo exigido.'
  : `\n${falhas} par(es) abaixo do mínimo.`);
