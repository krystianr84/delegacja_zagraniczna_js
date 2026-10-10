import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { doPliku, zPliku, oczysc, nazwaPliku, czyPusty, wczytajAutozapis, autozapis, FORMAT, KLUCZ_AUTOZAPISU } from '../web/lib/zapis.js';
import { pustyStan, przykladowyStan } from '../web/lib/model.js';
import { oblicz } from '../web/lib/obliczenia.js';

const kraje = JSON.parse(readFileSync(new URL('../dane/kraje.json', import.meta.url), 'utf8'));
const EUR = { EUR: { kurs: 4.3171, data: '2026-09-09', tabela: '175/A/NBP/2026' } };

function magazyn(zepsuty = false) {
  const m = new Map();
  const rzuc = () => { if (zepsuty) throw new Error('QuotaExceededError'); };
  return {
    m,
    getItem: (k) => { rzuc(); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { rzuc(); m.set(k, String(v)); },
    removeItem: (k) => { rzuc(); m.delete(k); },
  };
}

test('eksport → import: ten sam stan i ta sama dieta (930,46)', () => {
  const s = przykladowyStan();
  s.kursyReczne = { EUR: { kurs: '4,4', data: '2026-10-08', tabela: '196/A/NBP/2026' } };
  const plik = JSON.stringify(doPliku(s, '2026-10-11T10:00:00.000Z'), null, 2);
  const json = JSON.parse(plik);
  assert.equal(json.format, FORMAT);
  assert.equal(json.wersja, 1);
  assert.equal(json.zapisano, '2026-10-11T10:00:00.000Z');
  const w = zPliku(plik);
  assert.deepEqual(w, s);
  assert.equal(oblicz(w, kraje, EUR).dietaRazem, 930.46);
});

test('import: BOM, liczby zamiast tekstu, brakujące i nieznane pola', () => {
  const plik = '﻿' + JSON.stringify({
    format: FORMAT, wersja: 1,
    podroz: {
      pracownik: 'Anna Nowak', zaliczka: 500, nieznane: 'x', trybKursu: 'jutro',
      etapy: [{ kraj: 'Węgry', wjazd: '2026-09-28T12:00', sniadania: 1, waluta: 'XYZ', obce: 1 }, null, 'abc'],
      powrot: '2026-10-02T16:00',
      koszty: { noclegi: { kwota: 380, waluta: 'EUR' }, inne: 'zle' },
      kursyReczne: { EUR: { kurs: 4.4 }, XXX: { kurs: '1' } },
    },
  });
  const s = zPliku(plik);
  assert.equal(s.pracownik, 'Anna Nowak');
  assert.equal(s.zaliczka, '500');
  assert.equal(s.trybKursu, 'dzień przed datą kursu');
  assert.ok(!('nieznane' in s));
  assert.equal(s.etapy.length, 5);
  assert.deepEqual(s.etapy[0], { ...pustyStan().etapy[0], kraj: 'Węgry', wjazd: '2026-09-28T12:00', sniadania: '1', waluta: 'PLN' });
  assert.deepEqual(s.etapy[1], pustyStan().etapy[1]);
  assert.deepEqual(s.koszty.noclegi, { kwota: '380', waluta: 'EUR' });
  assert.deepEqual(s.koszty.inne, { kwota: '', waluta: 'PLN' });
  assert.deepEqual(s.kursyReczne, { EUR: { kurs: '4.4', data: '', tabela: '' } });
});

test('import: odrzuca pliki, które nie są plikiem podróży', () => {
  assert.throws(() => zPliku('nie json'), /nie jest plik JSON/);
  assert.throws(() => zPliku('{"a":1}'), /nie jest plik podróży/);
  assert.throws(() => zPliku(JSON.stringify({ format: FORMAT, podroz: null })), /nie jest plik podróży/);
  assert.throws(() => zPliku(JSON.stringify({ format: FORMAT, wersja: 2, podroz: {} })), /nowszej wersji/);
  assert.throws(() => zPliku('[]'), /nie jest plik podróży/);
});

test('import: za dużo etapów – zostaje 5', () => {
  const s = zPliku(JSON.stringify({ format: FORMAT, wersja: 1, podroz: { etapy: Array.from({ length: 9 }, (_, i) => ({ kraj: `K${i}` })) } }));
  assert.deepEqual(s.etapy.map((e) => e.kraj), ['K0', 'K1', 'K2', 'K3', 'K4']);
});

test('nazwa pliku', () => {
  assert.equal(nazwaPliku(przykladowyStan()), 'delegacja_1-2026_Jan_Kowalski_2026-09-14.json');
  assert.equal(nazwaPliku(pustyStan()), 'delegacja.json');
  const s = pustyStan();
  Object.assign(s, { nrPolecenia: ' 7/A:B ', pracownik: 'Zażółć  Gęślą', dataPolecenia: '2026-01-05' });
  assert.equal(nazwaPliku(s), 'delegacja_7-A-B_Zażółć_Gęślą_2026-01-05.json');
});

test('czyPusty', () => {
  assert.equal(czyPusty(pustyStan()), true);
  assert.equal(czyPusty(przykladowyStan()), false);
  const s = pustyStan();
  s.kursyReczne.EUR = { kurs: '', data: '', tabela: '' };   // puste pola kursu ręcznego nie liczą się
  assert.equal(czyPusty(s), true);
});

test('autozapis: zapis, odczyt, pusty stan usuwa wpis, zepsuty magazyn nie rzuca', () => {
  const m = magazyn();
  assert.equal(wczytajAutozapis(m), null);
  assert.equal(autozapis(m, przykladowyStan()), true);
  assert.deepEqual(wczytajAutozapis(m), przykladowyStan());
  assert.equal(autozapis(m, pustyStan()), true);
  assert.ok(!m.m.has(KLUCZ_AUTOZAPISU));
  m.m.set(KLUCZ_AUTOZAPISU, '{zepsute');
  assert.equal(wczytajAutozapis(m), null);
  assert.equal(autozapis(magazyn(true), przykladowyStan()), false);
  assert.equal(wczytajAutozapis(magazyn(true)), null);
  assert.equal(autozapis(null, przykladowyStan()), false);
  assert.equal(wczytajAutozapis(null), null);
});

test('oczysc nie zmienia wejścia', () => {
  const s = przykladowyStan();
  const kopia = structuredClone(s);
  oczysc(s);
  assert.deepEqual(s, kopia);
});
