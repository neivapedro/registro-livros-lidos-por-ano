// Gera o ícone do app (favicon.svg e os PNG) e as telas de abertura do iPhone, todos a partir
// do desenho abaixo: um livro aberto em caramelo, com a fita marcadora creme, sobre o fundo
// escuro quente do app. Rodar de novo reproduz exatamente os mesmos arquivos.
// Uso: node tools/gerar-icones.cjs   (Playwright do projeto ou o global)
// Depois de mudar os tamanhos de SPLASH, atualize os <link rel="apple-touch-startup-image">
// do index.html (o script imprime as linhas) e o SHELL do sw.js.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(path.join(execSync('npm root -g').toString().trim(), 'playwright'));
}
const { chromium } = playwright;

const dir = path.join(__dirname, '..', 'app', 'icons');

// Cores do app (app/css/app.css).
const INK = '#0E0C0B';
const PAPER = '#F6F1EB';

/**
 * O desenho, numa área de 512×512 centrada em (256, 270).
 * ribbon: cor da fita (creme no escuro, tinta no papel).
 */
function mark({ ribbon = '#F4EFEA' } = {}) {
  return `
  <defs>
    <linearGradient id="pl" x1="0" y1="0" x2="1" y2="0.2"><stop offset="0" stop-color="#E9B27D"/><stop offset="1" stop-color="#D08C4F"/></linearGradient>
    <linearGradient id="pr" x1="1" y1="0" x2="0" y2="0.2"><stop offset="0" stop-color="#D99A5E"/><stop offset="1" stop-color="#BC7841"/></linearGradient>
  </defs>
  <path d="M256 214 C214 188 160 182 106 190 L106 370 C160 362 214 370 256 396 C298 370 352 362 406 370 L406 190 C352 182 298 188 256 214 Z" fill="#7A4626"/>
  <path d="M256 200 C220 176 170 170 118 176 L118 352 C170 346 220 352 256 376 Z" fill="url(#pl)"/>
  <path d="M256 200 C292 176 342 170 394 176 L394 352 C342 346 292 352 256 376 Z" fill="url(#pr)"/>
  <path d="M256 200 L256 376" stroke="#8E5428" stroke-width="3" stroke-linecap="round" opacity=".55"/>
  <g stroke="#7A4626" stroke-width="5" stroke-linecap="round" opacity=".22" fill="none">
    <path d="M146 226 C180 222 212 227 236 238"/><path d="M146 256 C180 252 212 257 236 268"/><path d="M146 286 C180 282 212 287 236 298"/><path d="M146 316 C172 313 194 316 212 322"/>
    <path d="M366 226 C332 222 300 227 276 238"/><path d="M366 256 C332 252 300 257 276 268"/><path d="M366 286 C332 282 300 287 276 298"/><path d="M366 316 C340 313 318 316 300 322"/>
  </g>
  <path d="M310 185 L334 182 L334 414 L322 403 L310 414 Z" fill="${ribbon}"/>`;
}

/** Ícone: fundo escuro com um brilho quente atrás do livro. rx: cantos (0 no quadrado). scale: tamanho do livro. */
function icon({ rx = 0, scale = 1 } = {}) {
  const t = scale === 1 ? '' : ` transform="translate(256 270) scale(${scale}) translate(-256 -270)"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><radialGradient id="glow" cx="0.5" cy="0.46" r="0.62"><stop offset="0" stop-color="#2E231B"/><stop offset="1" stop-color="${INK}"/></radialGradient></defs>
  <rect width="512" height="512"${rx ? ` rx="${rx}"` : ''} fill="url(#glow)"/>
  <g${t}>${mark()}
  </g>
</svg>
`;
}

/** Tela de abertura: o livro no centro, sobre o fundo do tema (sem texto, como os apps do iPhone). */
function splash(theme, w, h) {
  const bg = theme === 'dark' ? INK : PAPER;
  const size = Math.round(Math.min(w, h) * 0.4);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <rect width="${w}" height="${h}" fill="${bg}"/>
  <svg x="${(w - size) / 2}" y="${(h - size) / 2 - h * 0.02}" width="${size}" height="${size}" viewBox="0 0 512 512">${mark({ ribbon: theme === 'dark' ? '#F4EFEA' : '#3A2E26' })}</svg>
</svg>`;
}

// iPhones com tela de início (retrato): [largura, altura em pontos, densidade]. Do SE 2 ao 17 Pro Max.
const SPLASH = [
  [375, 667, 2], // SE 2/3, 8
  [414, 896, 2], // XR, 11
  [375, 812, 3], // X, XS, 11 Pro, 12/13 mini
  [414, 896, 3], // XS Max, 11 Pro Max
  [390, 844, 3], // 12, 13, 14, 16e
  [428, 926, 3], // 12/13 Pro Max, 14 Plus
  [393, 852, 3], // 14 Pro, 15, 15 Pro, 16
  [430, 932, 3], // 14 Pro Max, 15 Plus/Pro Max, 16 Plus
  [402, 874, 3], // 16 Pro, 17, 17 Pro
  [440, 956, 3], // 16 Pro Max, 17 Pro Max
  [420, 912, 3], // Air
];
const splashName = (theme, w, h, d) => `splash-${theme === 'dark' ? 'escuro' : 'claro'}-${w * d}x${h * d}.png`;

const pngs = [
  ['icon-192.png', 192, icon()],
  ['icon-512.png', 512, icon()],
  // "maskable": o sistema corta em círculo ou gota; o livro fica dentro da área segura (80%).
  ['icon-maskable-512.png', 512, icon({ scale: 0.8 })],
  ['apple-touch-icon.png', 180, icon()],
];

(async () => {
  fs.writeFileSync(path.join(dir, 'favicon.svg'), icon({ rx: 112 }));
  console.log('ok favicon.svg');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size, source] of pngs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:${INK}">${source.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`);
    await page.screenshot({ path: path.join(dir, name) });
    console.log('ok', name);
  }
  const links = [];
  for (const theme of ['dark', 'light']) {
    for (const [w, h, d] of SPLASH) {
      const name = splashName(theme, w, h, d);
      await page.setViewportSize({ width: w * d, height: h * d });
      await page.setContent(`<html><body style="margin:0">${splash(theme, w * d, h * d)}</body></html>`);
      await page.screenshot({ path: path.join(dir, name) });
      links.push(`  <link rel="apple-touch-startup-image" href="icons/${name}" media="(device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${d}) and (orientation: portrait) and (prefers-color-scheme: ${theme})">`);
    }
  }
  await browser.close();
  console.log(`\n<!-- index.html -->\n${links.join('\n')}`);
})();
