// Testy strony w prawdziwej przeglądarce (Chrome / Edge bez okna, protokół DevTools). Bez zależności.
// Kursy NBP są podstawiane (prawdziwe notowania EUR zapisane niżej), więc test nie potrzebuje sieci.
//
// Użycie: node narzedzia/sprawdz-przegladarke.mjs        (CHROME=ścieżka – własna przeglądarka)
// Kod wyjścia 1, gdy któryś krok się nie powiódł.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { serwuj } from './serwer.js';
import { doPliku } from '../web/lib/zapis.js';
import { przykladowyStan } from '../web/lib/model.js';

// ---------- dane NBP (api.nbp.pl, pobrane 10.10.2026) ----------

const EUR = [
  ['165/A/NBP/2026', '2026-08-26', 4.3014], ['166/A/NBP/2026', '2026-08-27', 4.3274], ['167/A/NBP/2026', '2026-08-28', 4.3328],
  ['168/A/NBP/2026', '2026-08-31', 4.3264], ['169/A/NBP/2026', '2026-09-01', 4.3328], ['170/A/NBP/2026', '2026-09-02', 4.3311],
  ['171/A/NBP/2026', '2026-09-03', 4.3211], ['172/A/NBP/2026', '2026-09-04', 4.3179], ['173/A/NBP/2026', '2026-09-07', 4.31],
  ['174/A/NBP/2026', '2026-09-08', 4.3155], ['175/A/NBP/2026', '2026-09-09', 4.3171],
  ['186/A/NBP/2026', '2026-09-24', 4.39], ['187/A/NBP/2026', '2026-09-25', 4.375], ['188/A/NBP/2026', '2026-09-28', 4.3769],
  ['189/A/NBP/2026', '2026-09-29', 4.3728], ['190/A/NBP/2026', '2026-09-30', 4.3672], ['191/A/NBP/2026', '2026-10-01', 4.377],
  ['192/A/NBP/2026', '2026-10-02', 4.3745], ['193/A/NBP/2026', '2026-10-05', 4.3855], ['194/A/NBP/2026', '2026-10-06', 4.3699],
  ['195/A/NBP/2026', '2026-10-07', 4.3797], ['196/A/NBP/2026', '2026-10-08', 4.3789], ['197/A/NBP/2026', '2026-10-09', 4.3775],
];
let nbpOffline = false;
let stawkiTestowe = false;   // true: do dane/stawki.json dochodzi testowy zestaw od 01.01.2027 (Niemcy 60 EUR)
const zapytaniaNBP = [];
const naglowkiNBP = [];   // [metoda, nazwy nagłówków] każdego zapytania do api.nbp.pl

function odpowiedzNBP(url) {
  zapytaniaNBP.push(url);
  const m = /\/rates\/A\/(\w+)\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})\//.exec(url);
  const rates = m && m[1] === 'EUR' ? EUR.filter(([, d]) => d >= m[2] && d <= m[3]).map(([no, effectiveDate, mid]) => ({ no, effectiveDate, mid })) : [];
  return rates.length
    ? { status: 200, body: JSON.stringify({ table: 'A', code: m[1], rates }), typ: 'application/json; charset=utf-8' }
    : { status: 404, body: '404 NotFound - Not Found - Brak danych', typ: 'text/plain; charset=utf-8' };
}

function odpowiedzStawki(url) {
  const dane = (p) => JSON.parse(readFileSync(new URL(`../dane/${p}`, import.meta.url), 'utf8'));
  if (url.endsWith('/dane/stawki.json')) {
    const indeks = dane('stawki.json');
    indeks.zestawy.push({ od: '2027-01-01', podstawa: 'zestaw testowy', plik: 'kraje-test-2027.json' });
    return JSON.stringify(indeks);
  }
  return JSON.stringify(dane('kraje.json').map((k) => (k[0] === 'Niemcy' ? ['Niemcy', 'EUR', 60, 170] : k)));
}

// ---------- przeglądarka ----------

function znajdzPrzegladarke() {
  const kandydaci = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge',
  ].filter(Boolean);
  const p = kandydaci.find((k) => existsSync(k));
  if (!p) throw new Error('Nie znaleziono Chrome ani Edge – ustaw zmienną CHROME na ścieżkę przeglądarki.');
  return p;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function uruchomPrzegladarke() {
  const profil = mkdtempSync(join(tmpdir(), 'kalkulator-test-'));
  const args = ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profil}`, '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--hide-scrollbars', '--lang=pl-PL', 'about:blank'];
  if (process.env.CI) args.unshift('--no-sandbox');   // runnery CI (Ubuntu 24.04) blokują piaskownicę Chrome
  const proc = spawn(znajdzPrzegladarke(), args, { stdio: 'ignore' });
  let port;
  for (let i = 0; i < 100 && !port; i++) {
    try { port = readFileSync(join(profil, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { await sleep(100); }
  }
  if (!port) throw new Error('Przeglądarka nie uruchomiła DevTools');
  let strona;
  for (let i = 0; i < 50 && !strona; i++) {
    try { strona = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((c) => c.type === 'page'); } catch {}
    if (!strona) await sleep(100);
  }
  const ws = new WebSocket(strona.webSocketDebuggerUrl);
  await new Promise((ok, blad) => { ws.onopen = ok; ws.onerror = blad; });
  let id = 0;
  const czeka = new Map();
  const wyjatki = [];
  ws.onmessage = async (e) => {
    const m = JSON.parse(e.data);
    if (m.id && czeka.has(m.id)) {
      const [ok, blad] = czeka.get(m.id); czeka.delete(m.id);
      m.error ? blad(new Error(`${m.error.message} (${m.error.data ?? ''})`)) : ok(m.result);
    }
    if (m.method === 'Runtime.exceptionThrown') wyjatki.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') wyjatki.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Fetch.requestPaused' && !m.params.request.url.includes('api.nbp.pl')) {
      const { requestId, request } = m.params;
      if (!stawkiTestowe) { cdp('Fetch.continueRequest', { requestId }); return; }
      cdp('Fetch.fulfillRequest', {
        requestId, responseCode: 200, body: Buffer.from(odpowiedzStawki(request.url)).toString('base64'),
        responseHeaders: [{ name: 'Content-Type', value: 'application/json; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }],
      });
      return;
    }
    if (m.method === 'Fetch.requestPaused') {
      const { requestId, request } = m.params;
      naglowkiNBP.push([request.method, Object.keys(request.headers).map((n) => n.toLowerCase())]);
      if (nbpOffline) { zapytaniaNBP.push(request.url); cdp('Fetch.failRequest', { requestId, errorReason: 'InternetDisconnected' }); return; }
      const o = odpowiedzNBP(request.url);
      cdp('Fetch.fulfillRequest', {
        requestId, responseCode: o.status, body: Buffer.from(o.body).toString('base64'),
        responseHeaders: [{ name: 'Content-Type', value: o.typ }, { name: 'Access-Control-Allow-Origin', value: '*' }],
      });
    }
  };
  const cdp = (method, params = {}) => new Promise((ok, blad) => { const i = ++id; czeka.set(i, [ok, blad]); ws.send(JSON.stringify({ id: i, method, params })); });
  await cdp('Runtime.enable');
  await cdp('Page.enable');
  await cdp('DOM.enable');
  await cdp('Fetch.enable', { patterns: [{ urlPattern: 'https://api.nbp.pl/*' }, { urlPattern: '*/dane/stawki.json' }, { urlPattern: '*/dane/kraje-test-2027.json' }] });
  const zamknij = () => { try { ws.close(); } catch {} proc.kill(); setTimeout(() => rmSync(profil, { recursive: true, force: true }), 500); };
  return { cdp, wyjatki, zamknij, profil };
}

// ---------- PDF: liczba i rozmiar stron, strumienie treści ----------

function stronyPDF(pdf) {
  const s = pdf.toString('latin1');
  const boxy = [...s.matchAll(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)\s*\]/g)].map((m) => [Number(m[1]), Number(m[2])]);
  return { strony: (s.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length, boxy };
}

/** Rozpakowane strumienie treści (bez metadanych z datą) – do porównania dwóch wydruków. */
function trescPDF(pdf) {
  const s = pdf.toString('latin1');
  const wynik = [];
  for (const m of s.matchAll(/stream\r?\n/g)) {
    const start = m.index + m[0].length;
    const koniec = s.indexOf('endstream', start);
    try { wynik.push(inflateSync(pdf.subarray(start, koniec)).toString('latin1')); } catch {}
  }
  return wynik.join('\n');
}

// ---------- scenariusze ----------

const { cdp, wyjatki, zamknij } = await uruchomPrzegladarke();
const serwer = await serwuj(0);
const URL_STRONY = `http://127.0.0.1:${serwer.address().port}/web/`;
const tmp = mkdtempSync(join(tmpdir(), 'kalkulator-pliki-'));

const js = async (wyr) => {
  const r = await cdp('Runtime.evaluate', { expression: wyr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};
const tekst = (sel) => js(`document.querySelector(${JSON.stringify(sel)})?.textContent ?? null`);
async function czekaj(wyr, opis, ms = 8000) {
  const koniec = Date.now() + ms;
  while (Date.now() < koniec) { if (await js(wyr)) return; await sleep(100); }
  throw new Error(`Nie doczekano się: ${opis}`);
}
const ustaw = (pola) => js(`(() => { for (const [p, v] of ${JSON.stringify(pola)}) {
  const el = document.querySelector('[data-pole="' + p + '"]'); el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } })()`);
const kafle = async () => [await tekst('#kafel-dieta'), await tekst('#kafel-wydatki'), await tekst('#kafel-ogolem')].map((t) => t.replaceAll('\u00a0', ' '));
async function otworz() {
  await cdp('Page.navigate', { url: URL_STRONY });
  await czekaj(`document.querySelector('#kontrola')?.textContent !== 'Wczytywanie…' && document.querySelectorAll('#etapy .etap').length === 5`, 'załadowanie strony');
}
async function drukujPDF(rodzaj, naglowki) {
  await js(`(() => { document.querySelector('#podglad').open = true;
    document.querySelector('input[name="podglad"][value="${rodzaj}"]').checked = true;
    window.dispatchEvent(new Event('beforeprint')); })()`);
  // treść przed drukiem: printToPDF wywołuje afterprint, a strona czyści wtedy #druk
  const druk = await js(`document.querySelector('#druk').textContent`);
  // displayHeaderFooter = nagłówki i stopki jak w oknie drukowania Chrome (data, tytuł, adres, numer strony)
  const r = await cdp('Page.printToPDF', { preferCSSPageSize: true, printBackground: true, displayHeaderFooter: naglowki });
  await js(`window.dispatchEvent(new Event('afterprint'))`);
  return { pdf: Buffer.from(r.data, 'base64'), druk: druk.replaceAll('\u00a0', ' ') };
}
async function wczytajPlik(sciezka) {
  const doc = await cdp('DOM.getDocument');
  const { nodeId } = await cdp('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#plik' });
  await cdp('DOM.setFileInputFiles', { nodeId, files: [sciezka] });
}

const kroki = [];
const krok = (nazwa, fn) => kroki.push([nazwa, fn]);

krok('pusty formularz: kontrola „Wybierz kraj w etapie 1”, kafelki „—”', async () => {
  await otworz();
  assert.equal(await tekst('#kontrola'), 'Wybierz kraj w etapie 1');
  assert.deepEqual(await kafle(), ['—', '—', '—']);
  assert.equal(await js(`[...document.querySelectorAll('#etapy .etap')].filter((e) => !e.hidden).length`), 1);
});

krok('przykład z build.py: dieta 930,46 zł, ogółem 2 570,96 zł, kurs 4,3171 z 09.09.2026', async () => {
  await js(`document.querySelector('#przyklad').click()`);
  await czekaj(`document.querySelector('#kontrola').textContent === 'OK'`, 'kontrola OK');
  assert.deepEqual(await kafle(), ['930,46 zł', '1 640,50 zł', '2 570,96 zł']);
  assert.equal(await tekst('#kafel-dieta-etykieta'), 'Do wypłaty – dieta (215,53 EUR)');
  assert.equal(await js(`[...document.querySelectorAll('#kursy tbody tr')[0].cells].slice(0, 5).map((c) => c.textContent).join(' | ')`),
    'EUR | 4,3171 | 09.09.2026 | 175/A/NBP/2026 | NBP');
  assert.ok(zapytaniaNBP.some((u) => u.includes('/EUR/2026-08-26/2026-09-09/')), 'zapytanie o kurs „dzień przed” 10.09.2026');
});

krok('pusty kolejny etap jest zwinięty do wyboru kraju i rozwija się po wybraniu kraju', async () => {
  const stanEtapu = (i) => js(`(() => { const e = document.querySelector('#etapy .etap[data-etap="${i}"]');
    return { ukryty: e.hidden, zwiniety: e.classList.contains('zwiniety'),
      wjazdWidoczny: !!document.querySelector('[data-pole="etapy.${i}.wjazd"]').offsetParent,
      krajWidoczny: !!document.querySelector('[data-pole="etapy.${i}.kraj"]').offsetParent }; })()`);
  assert.deepEqual(await stanEtapu(0), { ukryty: false, zwiniety: false, wjazdWidoczny: true, krajWidoczny: true });
  assert.deepEqual(await stanEtapu(2), { ukryty: false, zwiniety: true, wjazdWidoczny: false, krajWidoczny: true });
  await ustaw([['etapy.2.kraj', 'Włochy']]);
  assert.deepEqual(await stanEtapu(2), { ukryty: false, zwiniety: false, wjazdWidoczny: true, krajWidoczny: true });
  await ustaw([['etapy.2.kraj', '']]);
  assert.deepEqual(await stanEtapu(2), { ukryty: false, zwiniety: true, wjazdWidoczny: false, krajWidoczny: true });
  assert.equal(await tekst('#kontrola'), 'OK');
});

krok('wersja kalkulatora w nagłówku i stopce', async () => {
  const w = await js(`[...document.querySelectorAll('[data-wersja]')].map((e) => e.textContent)`);
  assert.equal(w.length, 2);
  for (const t of w) assert.match(t, /^ver\. \d+\.\d+ \(\d{2}\.\d{2}\.\d{4}\)$/);
});

krok('zapytanie do NBP: GET bez własnych nagłówków (inaczej preflight OPTIONS, a NBP odpowiada 404)', async () => {
  assert.ok(naglowkiNBP.length > 0);
  // nagłówki, które przeglądarka dodaje sama i które nie wymuszają preflight
  const dozwolone = (n) => ['accept', 'accept-language', 'user-agent', 'referer', 'origin'].includes(n) || n.startsWith('sec-');
  for (const [metoda, nazwy] of naglowkiNBP) {
    assert.equal(metoda, 'GET');
    assert.deepEqual(nazwy.filter((n) => !dozwolone(n)), [], 'nagłówki spoza listy bezpiecznych');
  }
});

krok('autozapis: dane wracają po odświeżeniu strony', async () => {
  await sleep(500);   // autozapis po 300 ms
  await otworz();
  await czekaj(`document.querySelector('#kontrola').textContent === 'OK'`, 'kontrola OK po odświeżeniu');
  assert.equal(await js(`document.querySelector('[data-pole="pracownik"]').value`), 'Jan Kowalski');
  assert.equal(await tekst('#zapis-status'), 'Przywrócono dane z ostatniej wizyty');
  assert.deepEqual(await kafle(), ['930,46 zł', '1 640,50 zł', '2 570,96 zł']);
});

krok('druk Delegacji: 2 strony A4, kwoty i słownie, bez nagłówków i stopek przeglądarki', async () => {
  const z = await drukujPDF('delegacja', true);
  const bez = await drukujPDF('delegacja', false);
  const { strony, boxy } = stronyPDF(z.pdf);
  assert.equal(strony, 2);
  for (const [w, h] of boxy) assert.ok(Math.abs(w - 595) < 1.5 && Math.abs(h - 842) < 1.5, `A4, jest ${w}×${h}`);
  for (const t of ['POLECENIE WYJAZDU', 'SŁUŻBOWEGO Nr 1/2026', 'do Monachium, Linz', 'RACHUNEK KOSZTÓW PODRÓŻY', '2 570,96',
    'dwa tysiące pięćset siedemdziesiąt złotych i 96/100', '1 640,50']) assert.ok(z.druk.includes(t), t);
  assert.ok(trescPDF(z.pdf) === trescPDF(bez.pdf), 'wydruk z włączonymi nagłówkami przeglądarki różni się od wydruku bez nich');
});

krok('druk Raportu: 1 strona A4, bez nagłówków i stopek przeglądarki', async () => {
  const z = await drukujPDF('raport', true);
  const bez = await drukujPDF('raport', false);
  assert.equal(stronyPDF(z.pdf).strony, 1);
  for (const t of ['Rozliczenie diety z tytułu zagranicznej podróży służbowej', '4 dni 6 godz. 15 min', '930,46 PLN',
    '1 EUR = 4,3171 PLN (tab. 175/A/NBP/2026 z 09.09.2026)']) assert.ok(z.druk.includes(t), t);
  assert.ok(trescPDF(z.pdf) === trescPDF(bez.pdf), 'wydruk z włączonymi nagłówkami przeglądarki różni się od wydruku bez nich');
  assert.equal(await js(`document.querySelector('#druk').innerHTML`), '', 'po druku #druk jest pusty');
});

krok('zapis pliku .json: nazwa i format', async () => {
  const katalog = mkdtempSync(join(tmp, 'pobrane-'));
  await cdp('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: katalog });
  await js(`document.querySelector('#zapisz-plik').click()`);
  let pliki = [];
  for (let i = 0; i < 50 && !pliki.some((p) => p.endsWith('.json')); i++) { await sleep(100); pliki = readdirSync(katalog); }
  assert.deepEqual(pliki, ['delegacja_1-2026_Jan_Kowalski_2026-09-14.json']);
  const json = JSON.parse(readFileSync(join(katalog, pliki[0]), 'utf8'));
  assert.equal(json.format, 'kalkulator-diety-zagranicznej');
  assert.equal(json.podroz.pracownik, 'Jan Kowalski');
});

krok('wyczyszczenie wymaga potwierdzenia i usuwa autozapis', async () => {
  await js(`document.querySelector('#wyczysc').click()`);
  assert.equal(await tekst('#wyczysc'), 'Na pewno? Kliknij jeszcze raz');
  assert.equal(await tekst('#kontrola'), 'OK', 'pierwsze kliknięcie nic nie usuwa');
  await js(`document.querySelector('#wyczysc').click()`);
  await czekaj(`document.querySelector('#kontrola').textContent === 'Wybierz kraj w etapie 1'`, 'pusty formularz');
  await sleep(500);
  assert.equal(await js(`localStorage.getItem('delegacja:stan')`), null);
});

krok('import pliku .json przywraca podróż; zły plik jest odrzucany', async () => {
  const dobry = join(tmp, 'podroz.json');
  writeFileSync(dobry, JSON.stringify(doPliku(przykladowyStan())));
  await wczytajPlik(dobry);
  await czekaj(`document.querySelector('#kontrola').textContent === 'OK'`, 'kontrola OK po imporcie');
  assert.deepEqual(await kafle(), ['930,46 zł', '1 640,50 zł', '2 570,96 zł']);
  await czekaj(`document.querySelector('#zapis-status').textContent === 'Wczytano plik podroz.json'`, 'komunikat o wczytaniu');
  const zly = join(tmp, 'zly.json');
  writeFileSync(zly, '{"a":1}');
  await wczytajPlik(zly);
  await czekaj(`document.querySelector('#zapis-status').textContent.startsWith('Nie wczytano pliku zly.json')`, 'komunikat o złym pliku');
  assert.equal(await tekst('#kontrola'), 'OK', 'zły plik nie zmienia formularza');
});

krok('przypadek kontrolny: Węgry, kurs w dniu 08.10.2026 → 834,92 zł', async () => {
  await ustaw([['etapy.1.kraj', ''], ['etapy.1.wjazd', ''], ['etapy.1.sniadania', ''], ['etapy.1.przyjazd', ''], ['etapy.1.wyjazd', ''],
    ['etapy.1.miejscowosc', ''], ['etapy.0.kraj', 'Węgry'], ['etapy.0.wjazd', '2026-09-28T12:00'], ['etapy.0.sniadania', '0'],
    ['etapy.0.przyjazd', ''], ['etapy.0.wyjazd', ''], ['powrot', '2026-10-02T16:00'], ['dataKursu', '2026-10-08'],
    ['trybKursu', 'w dniu daty kursu'], ['wyjazdZMiejscowosci', ''], ['powrotDoMiejscowosci', ''], ['koszty.noclegi.kwota', '']]);
  await czekaj(`document.querySelector('#kafel-dieta').textContent.includes('834,92')`, 'dieta 834,92');
  assert.equal(await tekst('#kontrola'), 'OK');
  assert.deepEqual(await kafle(), ['834,92 zł', '0,00 zł', '834,92 zł']);
  assert.equal(await js(`document.querySelector('#wyliczenie tbody tr').cells[10].textContent`), '4,3789');
});

krok('błąd w danych: 9 śniadań → komunikat, czerwone pole, kafelki „—”', async () => {
  await ustaw([['etapy.0.sniadania', '9']]);
  assert.equal(await tekst('#kontrola'), 'Więcej posiłków niż dni pobytu w kraju – sprawdź śniadania, obiady i kolacje');
  assert.ok(await js(`document.querySelector('[data-pole="etapy.0.sniadania"]').classList.contains('blad')`));
  assert.deepEqual(await kafle(), ['—', '—', '—']);
  await ustaw([['etapy.0.sniadania', '0']]);
});

krok('brak połączenia z NBP: komunikat, potem kurs ręczny 4,4 → 838,95 zł', async () => {
  nbpOffline = true;
  await ustaw([['dataKursu', '2026-10-07']]);   // dzień, którego kursu nie ma jeszcze w cache
  await czekaj(`document.querySelector('#kontrola').textContent.startsWith('Brak kursu NBP')`, 'komunikat o braku kursu');
  await czekaj(`document.querySelector('#kursy-status').textContent.includes('brak połączenia')`, 'opis błędu połączenia');
  await ustaw([['kursyReczne.EUR.kurs', '4,4'], ['kursyReczne.EUR.data', '2026-10-08'], ['kursyReczne.EUR.tabela', '196/A/NBP/2026']]);
  assert.equal(await tekst('#kontrola'), 'OK');
  assert.deepEqual(await kafle(), ['838,95 zł', '0,00 zł', '838,95 zł']);
  assert.equal(await js(`document.querySelector('#kursy tbody tr').cells[4].textContent`), 'wpisany ręcznie');
  nbpOffline = false;
});

krok('stawki z datą: podróż liczona stawkami z dnia rozpoczęcia (testowy zestaw od 01.01.2027)', async () => {
  stawkiTestowe = true;
  try {
    await otworz();
    await js(`document.querySelector('#przyklad').click()`);
    await js(`document.querySelector('#przyklad').click()`);   // drugie kliknięcie potwierdza nadpisanie
    await czekaj(`document.querySelector('#kafel-dieta').textContent.includes('930,46')`, 'dieta 930,46 (stare stawki)');
    assert.match(await tekst('#stawki-opis'), /^Stawki diet obowiązujące od 29\.11\.2022 .* według dnia rozpoczęcia podróży \(14\.09\.2026\)\.$/);
    assert.ok(await js(`[...document.querySelector('[data-pole="etapy.0.kraj"]').options].some((o) => o.value === 'Niemcy')`));

    const pola = ['wyjazdZMiejscowosci', 'powrotDoMiejscowosci', 'powrot',
      ...[0, 1].flatMap((i) => ['wjazd', 'przyjazd', 'wyjazd'].map((k) => `etapy.${i}.${k}`))];
    await ustaw(await js(`${JSON.stringify(pola)}.map((p) => [p, document.querySelector('[data-pole="' + p + '"]').value.replace('2026-09', '2027-01')])`));
    assert.equal(await tekst('#kontrola'), 'OK');
    assert.match(await tekst('#stawki-opis'), /od 01\.01\.2027 \(zestaw testowy\) – według dnia rozpoczęcia podróży \(14\.01\.2027\)/);
    // Niemcy 60 EUR: 60 × 2⅓ − 2 śniadania × 15% = 122,00 EUR; Austria bez zmian 115,90 EUR
    assert.deepEqual(await js(`[...document.querySelectorAll('#wyliczenie tbody tr')].map((r) => r.cells[9].textContent)`), ['122,00', '115,90']);
    assert.equal(await js(`document.querySelector('#wyliczenie tbody tr').cells[3].textContent`), '60,00');

    await ustaw([['wyjazdZMiejscowosci', '2026-12-31T22:00']]);   // wyjazd przed zmianą → cała podróż starymi stawkami
    assert.deepEqual(await js(`[...document.querySelectorAll('#wyliczenie tbody tr')].map((r) => r.cells[9].textContent)`), ['99,63', '115,90']);

    await ustaw([['wyjazdZMiejscowosci', '2022-11-01T05:00']]);   // przed pierwszym zestawem → ostrzeżenie
    assert.match(await tekst('#stawki-opis'), /Uwaga: podróż zaczyna się 01\.11\.2022/);
    assert.ok(await js(`document.querySelector('#stawki-opis').classList.contains('blad-tekst')`));
  } finally {
    stawkiTestowe = false;
  }
});

krok('telefon (390 px): bez przewijania w poziomie, podgląd wydruku mieści się na ekranie', async () => {
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await sleep(300);
  assert.ok(await js(`document.documentElement.scrollWidth`) <= 390, 'strona szersza niż ekran');
  await js(`document.querySelector('#podglad').open = true; document.querySelector('#podglad').dispatchEvent(new Event('toggle'))`);
  await sleep(300);
  const szer = await js(`document.querySelector('#podglad-tresc .kartka').getBoundingClientRect().width * Number(getComputedStyle(document.querySelector('#podglad-tresc')).zoom || 1)`);
  assert.ok(await js(`document.documentElement.scrollWidth`) <= 390, 'podgląd rozpycha stronę');
  assert.ok(szer > 0);
  await cdp('Emulation.clearDeviceMetricsOverride');
});

krok('konsola bez błędów i wyjątków', async () => {
  assert.deepEqual(wyjatki, []);
});

// ---------- uruchomienie ----------

let bledy = 0;
const start = Date.now();
try {
  for (const [nazwa, fn] of kroki) {
    try {
      await fn();
      console.log(`✔ ${nazwa}`);
    } catch (e) {
      bledy++;
      console.log(`✖ ${nazwa}\n    ${String(e.message).split('\n').join('\n    ')}`);
    }
  }
} finally {
  zamknij();
  serwer.close();
  rmSync(tmp, { recursive: true, force: true });
}
console.log(`\n${kroki.length - bledy} z ${kroki.length} kroków przeszło (${((Date.now() - start) / 1000).toFixed(1)} s)`);
process.exit(bledy ? 1 : 0);
