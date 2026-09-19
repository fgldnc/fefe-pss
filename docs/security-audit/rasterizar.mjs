/**
 * rasterizar.mjs — confere o relatório VENDO, não supondo.
 *
 *   node docs/security-audit/rasterizar.mjs
 *
 * Abre `relatorio.html` com a mídia `print` emulada, numa viewport do tamanho
 * da área útil de uma A4 a 96dpi (21cm − 4cm de margem = 17cm ≈ 643px), e
 * recorta a página inteira em fatias da altura de uma folha. Serve para achar
 * estouro de coluna, tabela ilegível e gráfico que não desenhou — defeitos que
 * o contador de páginas não pega.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const AQUI = dirname(fileURLToPath(import.meta.url));
const SAIDA = join(AQUI, '.fatias');
if (!existsSync(SAIDA)) mkdirSync(SAIDA);

const L = 643;   // 17 cm a 96dpi — a largura útil da A4 com margem de 2 cm
const A = 953;   // 25,2 cm — a altura útil

const CANDIDATOS = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
];
const navegador = CANDIDATOS.find(existsSync);
const PORTA = 9334;
const proc = spawn(navegador, [
  '--headless=new', `--remote-debugging-port=${PORTA}`, '--disable-gpu',
  '--no-first-run', '--no-default-browser-check',
  `--user-data-dir=${join(AQUI, '.chrome-perfil-raster')}`, 'about:blank',
], { stdio: 'ignore' });

const espera = ms => new Promise(r => setTimeout(r, ms));

try {
  let url;
  for (let i = 0; i < 60; i++) {
    try {
      const abas = await (await fetch(`http://127.0.0.1:${PORTA}/json/list`)).json();
      const p = abas.find(a => a.type === 'page');
      if (p) { url = p.webSocketDebuggerUrl; break; }
    } catch { /* subindo */ }
    await espera(250);
  }
  const ws = new WebSocket(url);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = no; });

  let id = 0; const pend = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
  };
  const cmd = (method, params = {}) => new Promise(ok => {
    const meu = ++id; pend.set(meu, ok);
    ws.send(JSON.stringify({ id: meu, method, params }));
  });

  await cmd('Page.enable');
  await cmd('Emulation.setDeviceMetricsOverride',
    { width: L, height: A, deviceScaleFactor: 1.5, mobile: false });
  await cmd('Emulation.setEmulatedMedia', { media: 'print' });
  await cmd('Page.navigate',
    { url: 'file:///' + join(AQUI, 'relatorio.html').replace(/\\/g, '/') });
  await espera(1500);

  const { cssContentSize } = await cmd('Page.getLayoutMetrics');
  const folhas = Math.ceil(cssContentSize.height / A);
  console.log(`altura total ${Math.round(cssContentSize.height)}px → ${folhas} fatias`);

  for (let i = 0; i < folhas; i++) {
    const { data } = await cmd('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: true,
      clip: { x: 0, y: i * A, width: L, height: A, scale: 1.5 },
    });
    writeFileSync(join(SAIDA, `fatia-${String(i + 1).padStart(2, '0')}.png`),
      Buffer.from(data, 'base64'));
  }
  ws.close();
  console.log('fatias em', SAIDA);
} finally {
  proc.kill();
}
