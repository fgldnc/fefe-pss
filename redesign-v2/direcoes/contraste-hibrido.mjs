/**
 * contraste-hibrido.mjs — confere WCAG AA da paleta do hibrido.html.
 * Rode com:  node contraste-hibrido.mjs
 *
 * Texto: 4,5:1. Elemento gráfico, borda de campo e glifo de pastilha: 3:1.
 * Cada cor é medida contra os três fundos empilhados (fundo → folha → folha-2)
 * e vale o pior dos três.
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

const FUNDOS = { fundo: '#F3F5F9', folha: '#FFFFFF', 'folha-2': '#EDF1F8' };
const SERIE  = { s1: '#A8336B', s2: '#12915A', s3: '#E0553F', s4: '#B97A0C', s5: '#6B4BC9', s6: '#79838F' };

const TEXTO = {
  ink: '#141821', 'ink-2': '#4A5265', 'ink-3': '#616B79',
  entrou: '#0E7C4C', saiu: '#BE3729', deduzido: '#8F5C00',

};
const GRAFICO = { 'borda-forte': '#7E8999', ...SERIE };

let falhas = 0;
const linha = (nome, cor, exige) => {
  const rs = Object.values(FUNDOS).map(f => razao(cor, f));
  const ok = Math.min(...rs) >= exige;
  if (!ok) falhas++;
  console.log(
    nome.padEnd(13) + cor + '  ' + rs.map(r => r.toFixed(2).padStart(7)).join('') +
    `   ${exige}   ${ok ? 'sim' : 'NÃO'}`
  );
};

console.log('token        cor         fundo  folha folha-2  exige passa');
console.log('── texto ──');
for (const [k, v] of Object.entries(TEXTO)) linha(k, v, 4.5);
console.log('── gráfico e borda ──');
for (const [k, v] of Object.entries(GRAFICO)) linha(k, v, 3);

console.log('── marca: branco por cima (botão, faixa do herói) e como texto ──');
const MARCAS = { 'ameixa':['#7A2E52','#9A3E6E'], 'roxo':['#6B3FA0','#8557C4'], 'grafite':['#2E3440','#41485A'] };
 for (const [k, v] of Object.entries(MARCAS).flatMap(([n,par])=>par.map((c,i)=>[n+(i?'-2':''),c]))) {
  const r = razao('#FFFFFF', v);
  if (r < 4.5) falhas++;
  console.log(`  branco sobre ${k.padEnd(11)} ${r.toFixed(2)}   4.5   ${r >= 4.5 ? 'sim' : 'NÃO'}`);
}

console.log('── glifo sobre a pastilha da categoria (cor a 14% no branco) ──');
for (const [k, v] of Object.entries(SERIE)) {
  const chip = mistura(v, 0.14, '#FFFFFF');
  const r = razao(v, chip);
  if (r < 3) falhas++;
  console.log(`  ${k} sobre ${chip}  ${r.toFixed(2)}   3   ${r >= 3 ? 'sim' : 'NÃO'}`);
}

console.log(falhas === 0
  ? '\nTudo passa no mínimo exigido.'
  : `\n${falhas} par(es) abaixo do mínimo.`);
