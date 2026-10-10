import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  dzienSzukany, dodajDni, roznicaDni, urlKursow, pobierzNotowania, pobierzKurs, pobierzKursy, pobierzKursyZOkresu,
  parsujKurs, zastosujReczne, BladNBP, TRYB_W_DNIU, TRYB_DZIEN_PRZED,
} from '../web/lib/nbp.js';
import { oblicz } from '../web/lib/obliczenia.js';

const kraje = JSON.parse(readFileSync(new URL('../dane/kraje.json', import.meta.url), 'utf8'));

// notowania EUR z api.nbp.pl (pobrane 10.10.2026)
const EUR = [
  ['186/A/NBP/2026', '2026-09-24', 4.39], ['187/A/NBP/2026', '2026-09-25', 4.375],
  ['188/A/NBP/2026', '2026-09-28', 4.3769], ['189/A/NBP/2026', '2026-09-29', 4.3728],
  ['190/A/NBP/2026', '2026-09-30', 4.3672], ['191/A/NBP/2026', '2026-10-01', 4.377],
  ['192/A/NBP/2026', '2026-10-02', 4.3745], ['193/A/NBP/2026', '2026-10-05', 4.3855],
  ['194/A/NBP/2026', '2026-10-06', 4.3699], ['195/A/NBP/2026', '2026-10-07', 4.3797],
  ['196/A/NBP/2026', '2026-10-08', 4.3789], ['197/A/NBP/2026', '2026-10-09', 4.3775],
];

/**
 * Udawane api.nbp.pl (zachowanie sprawdzone 10.10.2026): notowania z zakresu z URL-a, 404 gdy brak,
 * 400 „Błędny zakres dat”, gdy zakres kończy się po dniu `dzis`; zapisuje wywołania.
 */
function udawaneApi(notowania = { EUR }, dzis = '2026-10-10') {
  const wywolania = [];
  const f = async (url, opcje) => {
    wywolania.push({ url, opcje });
    const m = /\/rates\/A\/(\w+)\/(\d{4}-\d{2}-\d{2})\/(\d{4}-\d{2}-\d{2})\/\?format=json$/.exec(url);
    if (!m) return new Response('400 BadRequest', { status: 400 });
    const [, w, od, doDnia] = m;
    if (doDnia > dzis) return new Response('400 BadRequest - Błędny zakres dat / Invalid date range', { status: 400 });
    if (roznicaDni(od, doDnia) + 1 > 93) return new Response('400 BadRequest - Przekroczony limit 93 dni', { status: 400 });
    const rates = (notowania[w] ?? []).filter(([, d]) => d >= od && d <= doDnia)
      .map(([no, effectiveDate, mid]) => ({ no, effectiveDate, mid }));
    if (!rates.length) return new Response('404 NotFound - Not Found - Brak danych', { status: 404 });
    return Response.json({ table: 'A', code: w, rates });
  };
  return { fetch: f, wywolania };
}

/** Magazyn jak localStorage; zepsuty = każda operacja rzuca (tryb prywatny, zablokowane dane witryny). */
function magazyn(zepsuty = false) {
  const m = new Map();
  return {
    m,
    getItem: (k) => { if (zepsuty) throw new Error('SecurityError'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (zepsuty) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
  };
}

test('dzień szukany: w dniu / dzień przed datą kursu', () => {
  assert.equal(dzienSzukany('2026-10-08', TRYB_W_DNIU), '2026-10-08');
  assert.equal(dzienSzukany('2026-10-08', TRYB_DZIEN_PRZED), '2026-10-07');
  assert.equal(dzienSzukany('2026-03-01'), '2026-02-28');
  assert.equal(dodajDni('2026-10-08T12:30', -14), '2026-09-24');
  assert.equal(dodajDni('2026-10-24', 2), '2026-10-26');   // przez zmianę czasu
});

test('URL zapytania jak w CLAUDE.md', () => {
  assert.equal(urlKursow('EUR', '2026-09-24', '2026-10-08'),
    'https://api.nbp.pl/api/exchangerates/rates/A/EUR/2026-09-24/2026-10-08/?format=json');
});

test('przypadek kontrolny: kurs w dniu 08.10.2026 → 4,3789, tabela 196/A/NBP/2026, 834,92 PLN', async () => {
  const api = udawaneApi();
  const { kursy, bledy } = await pobierzKursy(['EUR'], '2026-10-08', TRYB_W_DNIU, { fetch: api.fetch, dzis: '2026-10-10' });
  assert.deepEqual(bledy, {});
  assert.deepEqual(kursy, { EUR: { kurs: 4.3789, data: '2026-10-08', tabela: '196/A/NBP/2026' } });
  assert.equal(api.wywolania[0].url, urlKursow('EUR', '2026-09-24', '2026-10-08'));
  const p = {
    dataKursu: '2026-10-08',
    etapy: [{ kraj: 'Węgry', wjazd: '2026-09-28T12:00' }],
    powrot: '2026-10-02T16:00',
  };
  assert.equal(oblicz(p, kraje, kursy).dietaRazem, 834.92);
});

test('zapytanie bez własnych nagłówków (inaczej preflight OPTIONS → 404)', async () => {
  const api = udawaneApi();
  await pobierzKurs('EUR', '2026-10-08', { fetch: api.fetch });
  const opcje = api.wywolania[0].opcje ?? {};
  assert.equal(opcje.headers, undefined);
  assert.ok(!opcje.method || opcje.method === 'GET');
});

test('weekend: kurs z ostatniego notowania przed dniem szukanym', async () => {
  const api = udawaneApi();
  // niedziela 04.10 → piątek 02.10; poniedziałek 05.10 „dzień przed” → piątek 02.10
  assert.equal((await pobierzKurs('EUR', '2026-10-04', { fetch: api.fetch })).data, '2026-10-02');
  const { kursy } = await pobierzKursy(['EUR'], '2026-10-05', TRYB_DZIEN_PRZED, { fetch: api.fetch });
  assert.equal(kursy.EUR.tabela, '192/A/NBP/2026');
});

test('data z przyszłości → BladNBP „brak” bez zapytania; 400 z NBP (inny zegar) też „brak”', async () => {
  const api = udawaneApi();
  await assert.rejects(pobierzKurs('EUR', '2099-12-31', { fetch: api.fetch, dzis: '2026-10-10' }),
    (e) => e instanceof BladNBP && e.powod === 'brak');
  assert.equal(api.wywolania.length, 0);
  // zegar urządzenia spieszy się o dzień: zapytanie do 11.10 idzie, NBP odpowiada 400
  await assert.rejects(pobierzKurs('EUR', '2026-10-11', { fetch: api.fetch, dzis: '2026-10-11' }), (e) => e.powod === 'brak');
  assert.equal(api.wywolania.length, 1);
});

test('404 (brak notowań waluty) → BladNBP „brak”, bez blokowania innych walut', async () => {
  const api = udawaneApi();
  const { kursy, bledy } = await pobierzKursy(['EUR', 'USD', 'EUR', 'PLN'], '2026-10-08', TRYB_W_DNIU, { fetch: api.fetch, dzis: '2026-10-10' });
  assert.deepEqual(Object.keys(kursy), ['EUR']);
  assert.equal(bledy.USD.powod, 'brak');
  assert.equal(api.wywolania.length, 2, 'EUR raz, USD raz, PLN wcale');
});

test('brak sieci i inne błędy API', async () => {
  const offline = async () => { throw new TypeError('Failed to fetch'); };
  await assert.rejects(pobierzKurs('EUR', '2026-10-08', { fetch: offline }), (e) => e.powod === 'siec');
  const blad500 = async () => new Response('err', { status: 500 });
  await assert.rejects(pobierzKurs('EUR', '2026-10-08', { fetch: blad500 }), (e) => e.powod === 'odpowiedz');
  const zlyJson = async () => new Response('<html>', { status: 200 });
  await assert.rejects(pobierzKurs('EUR', '2026-10-08', { fetch: zlyJson }), (e) => e.powod === 'odpowiedz');
  await assert.rejects(pobierzNotowania('EUR', '2026-01-01', '2026-06-30', { fetch: offline }), RangeError);
});

test('cache: kurs z przeszłości zapamiętany, dzisiejszy przed publikacją tabeli – nie', async () => {
  const api = udawaneApi();
  const mag = magazyn();
  await pobierzKurs('EUR', '2026-10-08', { fetch: api.fetch, magazyn: mag, dzis: '2026-10-10' });
  const drugi = await pobierzKurs('EUR', '2026-10-08', { fetch: api.fetch, magazyn: mag, dzis: '2026-10-10' });
  assert.equal(api.wywolania.length, 1);
  assert.equal(drugi.kurs, 4.3789);

  // 10.10 rano: tabeli z 10.10 jeszcze nie ma → wynik z 09.10, nie zapamiętujemy
  await pobierzKurs('EUR', '2026-10-10', { fetch: api.fetch, magazyn: mag, dzis: '2026-10-10' });
  await pobierzKurs('EUR', '2026-10-10', { fetch: api.fetch, magazyn: mag, dzis: '2026-10-10' });
  assert.equal(api.wywolania.length, 3);
  assert.ok(!mag.m.has('nbp:EUR:2026-10-10'));
});

test('cache: zepsuty localStorage i śmieci w cache nie przeszkadzają', async () => {
  const api = udawaneApi();
  const k = await pobierzKurs('EUR', '2026-10-08', { fetch: api.fetch, magazyn: magazyn(true) });
  assert.equal(k.kurs, 4.3789);
  const mag = magazyn();
  mag.m.set('nbp:EUR:2026-10-08', '{nie json');
  assert.equal((await pobierzKurs('EUR', '2026-10-08', { fetch: api.fetch, magazyn: mag })).kurs, 4.3789);
});

test('kursy z okresu: podział na zapytania po 93 dni, okres bez notowań → pusto', async () => {
  const api = udawaneApi();
  const n = await pobierzKursyZOkresu('EUR', '2026-06-01', '2026-10-08', { fetch: api.fetch });
  assert.equal(api.wywolania.length, 2);
  assert.match(api.wywolania[0].url, /2026-06-01\/2026-09-01\//);
  assert.match(api.wywolania[1].url, /2026-09-02\/2026-10-08\//);
  assert.equal(n.length, 11);
  // koniec okresu po dzisiejszej dacie przycięty do dziś (inaczej NBP odpowiada 400)
  const przyciete = await pobierzKursyZOkresu('EUR', '2026-10-01', '2026-10-31', { fetch: api.fetch, dzis: '2026-10-10' });
  assert.equal(przyciete.at(-1).data, '2026-10-09');
  assert.match(api.wywolania.at(-1).url, /2026-10-01\/2026-10-10\//);
  assert.equal(n[0].data, '2026-09-24');
  assert.deepEqual(await pobierzKursyZOkresu('USD', '2026-10-01', '2026-10-08', { fetch: api.fetch }), []);
  assert.equal((await pobierzKursyZOkresu('EUR', '2026-10-08', '2026-10-08', { fetch: api.fetch })).length, 1);
});

test('parsujKurs', () => {
  assert.equal(parsujKurs('4,2563'), 4.2563);
  assert.equal(parsujKurs(' 4.4 '), 4.4);
  assert.equal(parsujKurs(4.4), 4.4);
  assert.equal(parsujKurs(''), null);
  assert.equal(parsujKurs(null), null);
  assert.ok(Number.isNaN(parsujKurs('abc')));
  assert.ok(Number.isNaN(parsujKurs('0')));
  assert.ok(Number.isNaN(parsujKurs('-4,4')));
  assert.ok(Number.isNaN(parsujKurs('4,4,4')));
});

test('kurs ręczny zastępuje kurs z NBP (Węgry, 4,4 → 838,95)', async () => {
  const p = {
    dataKursu: '2099-12-31',
    etapy: [{ kraj: 'Węgry', wjazd: '2026-09-28T12:00' }],
    powrot: '2026-10-02T16:00',
  };
  const { kursy } = await pobierzKursy(['EUR'], p.dataKursu, TRYB_W_DNIU, { fetch: udawaneApi().fetch, dzis: '2026-10-10' });
  assert.ok(oblicz(p, kraje, kursy).kontrola.startsWith('Brak kursu NBP'));

  const reczne = zastosujReczne(kursy, { EUR: { kurs: '4,4', data: '2026-10-08', tabela: '196/A/NBP/2026' }, USD: { kurs: '' } });
  assert.deepEqual(reczne, { EUR: { kurs: 4.4, data: '2026-10-08', tabela: '196/A/NBP/2026', reczny: true } });
  assert.equal(oblicz(p, kraje, reczne).dietaRazem, 838.95);

  const bezTabeli = zastosujReczne(kursy, { EUR: { kurs: '4,4', data: '2026-10-08' } });
  assert.ok(oblicz(p, kraje, bezTabeli).kontrola.startsWith('Kurs ręczny: uzupełnij'));
});

test('kurs ręczny: puste pole zostawia kurs NBP, niepoprawny daje brak kursu', () => {
  const nbp = { EUR: { kurs: 4.3789, data: '2026-10-08', tabela: '196/A/NBP/2026' } };
  assert.deepEqual(zastosujReczne(nbp, { EUR: { kurs: '' } }), nbp);
  assert.deepEqual(zastosujReczne(nbp, { EUR: { kurs: 'abc' } }), {});
  assert.deepEqual(nbp.EUR.kurs, 4.3789, 'wejście bez zmian');
});

test('na żywo: api.nbp.pl (NBP_LIVE=1)', { skip: !process.env.NBP_LIVE && 'ustaw NBP_LIVE=1' }, async () => {
  const { kursy, bledy } = await pobierzKursy(['EUR'], '2026-10-08', TRYB_W_DNIU);
  assert.deepEqual(bledy, {});
  assert.deepEqual(kursy.EUR, { kurs: 4.3789, data: '2026-10-08', tabela: '196/A/NBP/2026' });
  await assert.rejects(pobierzKurs('EUR', '2099-12-31'), (e) => e.powod === 'brak');
  // NBP: 400 dla zakresu po dzisiejszej dacie – sprawdzamy, że nadal traktujemy to jako brak kursu
  const jutro = dodajDni(new Date().toISOString().slice(0, 10), 1);
  await assert.rejects(pobierzKurs('EUR', jutro, { dzis: jutro }), (e) => e.powod === 'brak');
});
