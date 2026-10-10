// Stawki z datą obowiązywania: wybór zestawu według dnia rozpoczęcia podróży.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { zestawyStawek, dataPodrozy, zestawNaDzien, nazwyKrajow } from '../web/lib/stawki.js';
import { oblicz } from '../web/lib/obliczenia.js';
import { przykladowyStan, pustyStan } from '../web/lib/model.js';

const czytaj = (p) => JSON.parse(readFileSync(new URL(`../dane/${p}`, import.meta.url), 'utf8'));
const indeks = czytaj('stawki.json');
const kraje = czytaj('kraje.json');
const EUR = { EUR: { kurs: 4.3171, data: '2026-09-09', tabela: '175/A/NBP/2026' } };

// zestaw testowy: od 01.01.2027 Niemcy 60 EUR zamiast 49, Austria bez zmian, nowy kraj „Atlantyda”
const kraje2027 = [...kraje.map((k) => (k[0] === 'Niemcy' ? ['Niemcy', 'EUR', 60, 170] : k)), ['Atlantyda', 'EUR', 50, 100]];
const zestawy = zestawyStawek(
  { zestawy: [...indeks.zestawy, { od: '2027-01-01', podstawa: 'test', plik: 'kraje-2027.json' }] },
  { 'kraje.json': kraje, 'kraje-2027.json': kraje2027 },
);

test('dane/stawki.json: jeden zestaw od 29.11.2022 z dane/kraje.json (120 państw)', () => {
  const z = zestawyStawek(indeks, { 'kraje.json': kraje });
  assert.equal(z.length, 1);
  assert.equal(z[0].od, '2022-11-29');
  assert.equal(z[0].plik, 'kraje.json');
  assert.equal(z[0].kraje.length, 120);
  assert.match(z[0].podstawa, /Dz\.U\. 2023 poz\. 2190/);
});

test('data podróży: wyjazd z miejscowości, a gdy pusty – wjazd w etapie 1', () => {
  const s = przykladowyStan();
  assert.equal(dataPodrozy(s), '2026-09-14');
  s.wyjazdZMiejscowosci = '2026-09-13T23:30';
  assert.equal(dataPodrozy(s), '2026-09-13');
  s.wyjazdZMiejscowosci = '';
  s.etapy[0].wjazd = '2026-09-15T01:00';
  assert.equal(dataPodrozy(s), '2026-09-15');
  s.etapy[0].wjazd = 'abc';
  assert.equal(dataPodrozy(s), '');
  assert.equal(dataPodrozy(pustyStan()), '');
});

test('zestaw na dzień: granica „od”, brak daty → najnowszy, data sprzed pierwszego → pierwszy z flagą', () => {
  assert.equal(zestawNaDzien(zestawy, '2026-12-31').zestaw.od, '2022-11-29');
  assert.equal(zestawNaDzien(zestawy, '2027-01-01').zestaw.od, '2027-01-01');
  assert.equal(zestawNaDzien(zestawy, '').zestaw.od, '2027-01-01');
  assert.deepEqual(zestawNaDzien(zestawy, '2022-11-28'), { zestaw: zestawy[0], przedPierwszym: true });
  assert.equal(zestawNaDzien(zestawy, '2022-11-29').przedPierwszym, false);
});

test('podróż liczona zestawem z dnia rozpoczęcia – także gdy trwa przez zmianę stawek', () => {
  const s = przykladowyStan();   // Niemcy + Austria, wrzesień 2026
  const stawkiDla = (p) => new Map(zestawNaDzien(zestawy, dataPodrozy(p)).zestaw.kraje.map((k) => [k[0], k]));
  assert.equal(oblicz(s, stawkiDla(s), EUR).dietaRazem, 930.46);   // stare stawki – bez zmian po dodaniu nowych

  // ta sama podróż przesunięta na 2027: Niemcy po 60 EUR → 60 × 2⅓ − 18,00 = 122,00 EUR (zamiast 99,63)
  const p = structuredClone(s);
  const przesun = (v) => v.replace('2026-09', '2027-01');
  for (const k of ['wyjazdZMiejscowosci', 'powrotDoMiejscowosci', 'powrot']) p[k] = przesun(p[k]);
  for (const e of p.etapy) for (const k of ['wjazd', 'przyjazd', 'wyjazd']) e[k] = przesun(e[k]);
  const w = oblicz(p, stawkiDla(p), EUR);
  assert.equal(w.etapy[0].dietaWaluta, 122);
  assert.equal(w.etapy[1].dietaWaluta, 115.9);

  // wyjazd 31.12.2026, powrót w styczniu – cała podróż starymi stawkami
  p.wyjazdZMiejscowosci = '2026-12-31T22:00';
  assert.equal(oblicz(p, stawkiDla(p), EUR).etapy[0].dietaWaluta, 99.63);
});

test('lista krajów: wszystkie z najnowszego zestawu, potem brakujące ze starszych', () => {
  const n = nazwyKrajow(zestawy);
  assert.equal(n.length, 121);
  assert.equal(n.at(-1), 'Atlantyda');
  const tylkoStary = zestawyStawek(
    { zestawy: [{ od: '2020-01-01', plik: 'a' }, { od: '2022-11-29', plik: 'b' }] },
    { a: [['Zair', 'USD', 40, 100], ['Niemcy', 'EUR', 40, 100]], b: [['Niemcy', 'EUR', 49, 170]] },
  );
  assert.deepEqual(nazwyKrajow(tylkoStary), ['Niemcy', 'Zair']);
});

test('zestawyStawek: odrzuca błędne dane', () => {
  const k = { 'kraje.json': kraje };
  assert.throws(() => zestawyStawek({}, k), /brak zestawów/);
  assert.throws(() => zestawyStawek({ zestawy: [{ od: '29.11.2022', plik: 'kraje.json' }] }, k), /niepoprawna data/);
  assert.throws(() => zestawyStawek({ zestawy: [{ od: '2022-11-29', plik: 'brak.json' }] }, k), /brak pliku/);
  assert.throws(() => zestawyStawek({ zestawy: [{ od: '2022-11-29', plik: 'x' }] }, { x: [['Niemcy', 'eur', 49, 170]] }), /niepoprawny wpis/);
  assert.throws(() => zestawyStawek({ zestawy: [{ od: '2022-11-29', plik: 'x' }] }, { x: [['Niemcy', 'EUR', 0, 170]] }), /niepoprawny wpis/);
  assert.throws(() => zestawyStawek({ zestawy: [{ od: '2022-11-29', plik: 'kraje.json' }, { od: '2022-11-29', plik: 'kraje.json' }] }, k), /dwa zestawy/);
});
