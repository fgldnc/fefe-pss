/**
 * contraste-paletas.mjs — lê as paletas direto do jornal.html e confere WCAG AA.
 * Rode com:  node contraste-paletas.mjs
 *
 * Texto precisa de 4,5:1; elemento gráfico e fio estrutural, de 3:1.
 * Cada cor é medida contra os DOIS fundos (papel e papel-2) e vale o pior.
 */
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('./jornal.html', import.meta.url), 'utf8');

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

const TEXTO  = ['tinta', 'tinta-2', 'tinta-3', 'entrou', 'saiu', 'deduzido'];
const GRAF   = ['acento', 'fio-forte', 's1', 's2', 's3', 's4', 's5', 's6'];
const PALETAS = ['neve', 'ameixa', 'marinho', 'noite'];

let falhas = 0;
for (const nome of PALETAS) {
  const bloco = src.match(new RegExp(`html\\[data-pal="${nome}"\\]\\{([^}]*)\\}`))?.[1];
  if (!bloco) { console.log(`${nome}: bloco não encontrado`); falhas++; continue; }

  const p = {};
  for (const m of bloco.matchAll(/--([a-z0-9-]+):\s*(#[0-9A-Fa-f]{6})/g)) p[m[1]] = m[2];

  console.log(`\n### ${nome.toUpperCase()}`);
  console.log('token'.padEnd(12) + 'papel'.padStart(7) + 'papel-2'.padStart(9) + '   exige  passa');
  for (const k of [...TEXTO, ...GRAF]) {
    const exige = TEXTO.includes(k) ? 4.5 : 3;
    const a = razao(p[k], p['papel']);
    const b = razao(p[k], p['papel-2']);
    const ok = Math.min(a, b) >= exige;
    if (!ok) falhas++;
    console.log(
      k.padEnd(12) + a.toFixed(2).padStart(7) + b.toFixed(2).padStart(9) +
      `   ${exige}    ${ok ? 'sim' : 'NÃO'}`
    );
  }
}
console.log(falhas === 0
  ? '\nAs quatro paletas passam em AA.'
  : `\n${falhas} par(es) abaixo do mínimo.`);
