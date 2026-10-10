// Serwer do podglądu lokalnego (moduły ES nie działają z file://). Bez zależności.
// Serwuje katalog główny repozytorium tak jak GitHub Pages: strona pod /web/, dane pod /dane/.
// Użycie: node narzedzia/serwer.js [port]   →   http://localhost:8080/web/

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const KORZEN = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2] ?? process.env.PORT ?? 8080);
const TYPY = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    let sciezka = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (sciezka === '/') { res.writeHead(302, { Location: '/web/' }).end(); return; }
    let plik = normalize(join(KORZEN, sciezka));
    if (plik !== KORZEN && !plik.startsWith(KORZEN + sep)) { res.writeHead(403).end(); return; }
    if ((await stat(plik).catch(() => null))?.isDirectory()) plik = join(plik, 'index.html');
    const tresc = await readFile(plik);
    res.writeHead(200, { 'Content-Type': TYPY[extname(plik)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(tresc);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}/web/`));
