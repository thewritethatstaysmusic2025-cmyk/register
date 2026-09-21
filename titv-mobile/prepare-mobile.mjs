import fs from 'node:fs/promises';
import path from 'node:path';

const base = 'https://6ab0b5600d26a5471dd4a27b--titv-engineering-scheduler.netlify.app';
const publicBase = 'https://titv-engineering-scheduler.netlify.app';
const out = path.resolve('www');

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, 'vendor'), { recursive: true });

async function download(remote, local) {
  const res = await fetch(remote);
  if (!res.ok) throw new Error(`${remote} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.mkdir(path.dirname(local), { recursive: true });
  await fs.writeFile(local, buf);
}

await download(`${base}/RELEASE_NOTES_V3.30.5.txt`, path.join(out, 'RELEASE_NOTES_V3.30.5.txt'));
const release = await fs.readFile(path.join(out, 'RELEASE_NOTES_V3.30.5.txt'), 'utf8');
if (!release.includes('V3.30.5')) throw new Error('Pinned deployment is not V3.30.5');

const files = [
  ['/', 'index.html'],
  ['/vendor/jszip.min.js', 'vendor/jszip.min.js'],
  ['/TITV_LOGO.png', 'TITV_LOGO.png'],
  ['/favicon.ico', 'favicon.ico'],
  ['/favicon-32x32.png', 'favicon-32x32.png'],
  ['/apple-touch-icon.png', 'apple-touch-icon.png'],
  ['/android-chrome-192x192.png', 'android-chrome-192x192.png'],
  ['/site.webmanifest', 'site.webmanifest']
];

for (const [remote, local] of files) {
  try {
    await download(`${base}${remote}`, path.join(out, local));
  } catch (err) {
    if (local === 'index.html' || local.includes('jszip')) throw err;
    console.warn('optional asset skipped:', local, String(err));
  }
}

let html = await fs.readFile(path.join(out, 'index.html'), 'utf8');

html = html
  .replaceAll('fetch(`/.netlify/functions/', 'fetch(`' + publicBase + '/.netlify/functions/')
  .replaceAll("fetch('/.netlify/functions/", "fetch('" + publicBase + "/.netlify/functions/")
  .replaceAll('fetch("/.netlify/functions/', 'fetch("' + publicBase + '/.netlify/functions/')
  .replaceAll('${location.origin}/line-webhook', publicBase + '/line-webhook')
  .replaceAll('${location.origin}', publicBase);

if (!/name=["']viewport["']/i.test(html)) {
  html = html.replace('<head>', '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">');
}

const mobileCss = `
<style id="titv-native-mobile">
  html, body {
    overscroll-behavior: none;
    -webkit-text-size-adjust: 100%;
    -webkit-tap-highlight-color: transparent;
  }
  body {
    min-height: 100dvh;
  }
  input, select, textarea, button {
    font-size: max(16px, 1em);
  }
  @media (max-width: 900px) {
    html, body {
      max-width: 100vw;
      overflow-x: hidden;
    }
    body {
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
    }
    table {
      max-width: none;
    }
  }
</style>`;

html = html.replace('</head>', mobileCss + '\n</head>');
await fs.writeFile(path.join(out, 'index.html'), html, 'utf8');

await fs.mkdir('assets', { recursive: true });
try {
  await download(`${base}/android-chrome-512x512.png`, path.resolve('assets/source-icon.png'));
} catch {
  await download(`${base}/android-chrome-192x192.png`, path.resolve('assets/source-icon.png'));
}

console.log('Prepared TITV V3.30.5 mobile web bundle.');
