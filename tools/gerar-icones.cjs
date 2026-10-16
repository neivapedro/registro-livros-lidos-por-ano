// Gera os ícones PNG do app a partir de app/icons/favicon.svg.
// Uso: NODE_PATH=$(npm root -g) node tools/gerar-icones.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dir = path.join(__dirname, '..', 'app', 'icons');
const svg = fs.readFileSync(path.join(dir, 'favicon.svg'), 'utf8');
// Versão sem cantos arredondados: o sistema do celular aplica a própria máscara.
const square = svg.replace('rx="112" ', '');
// Versão "maskable": desenho menor para caber na área segura de qualquer formato.
const maskable = square.replace(/<rect x="146"/, '<g transform="translate(256 256) scale(0.82) translate(-256 -256)"><rect x="146"').replace('</svg>', '</g></svg>').replace(/(<rect width="512" height="512" fill="#0E0C0B"\/>)([\s\S]*?)<g transform="translate/, '$1$2<g transform="translate');

const targets = [
  ['icon-192.png', 192, square],
  ['icon-512.png', 512, square],
  ['icon-maskable-512.png', 512, maskable],
  ['apple-touch-icon.png', 180, square],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size, source] of targets) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:#0E0C0B">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(dir, name), omitBackground: false });
    console.log('ok', name);
  }
  await browser.close();
})();
