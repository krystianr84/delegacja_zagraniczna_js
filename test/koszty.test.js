// Koszty do rachunku delegacji, pola z błędem, formatowanie i model formularza.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  oblicz, obliczKoszty, kosztPLN, parsujKwote, walutyWUzyciu, polaZBledem, slownieZlotych,
} from '../web/lib/obliczenia.js';
import * as f from '../web/lib/format.js';
import { pustyStan, przykladowyStan, pobierz, ustaw, widoczneEtapy } from '../web/lib/model.js';

const kraje = JSON.parse(readFileSync(new URL('../dane/kraje.json', import.meta.url), 'utf8'));
const EUR = { EUR: { kurs: 4.3171, data: '2026-09-09', tabela: '175/A/NBP/2026' } };
const NBSP = ' ';

test('przykład z build.py: dieta 930,46 + noclegi 380 EUR → ogółem 2 570,96 (test.ps1)', () => {
  const s = przykladowyStan();
  const w = oblicz(s, kraje, EUR);
  assert.equal(w.kontrola, 'OK');
  assert.equal(w.dietaRazem, 930.46);
  const k = obliczKoszty(s, EUR, w.dietaRazem);
  assert.equal(k.pozostale.noclegi.pln, 1640.5);   // 380 × 4,3171 = 1640,498
  assert.equal(k.przejazdyRazem, 0);
  assert.equal(k.ogolem, 2570.96);
  assert.equal(f.kwota(k.ogolem), `2${NBSP}570,96`);
  assert.equal(slownieZlotych(k.ogolem), 'dwa tysiące pięćset siedemdziesiąt złotych i 96/100');
});

test('słownie z test.ps1: inne wydatki dopełniają ogółem (bez noclegów)', () => {
  for (const [inne, oczekiwane] of [['1.54', 932], ['4,54', 935], ['81.54', 1012], ['91,54', 1022]]) {
    const s = przykladowyStan();
    s.koszty.noclegi.kwota = '';
    s.koszty.inne.kwota = inne;
    assert.equal(obliczKoszty(s, EUR, 930.46).ogolem, oczekiwane);
  }
  // pusty druk: bez kraju, inne wydatki 1 zł → dieta nie liczy się, „jeden złoty”
  const s = pustyStan();
  s.koszty.inne.kwota = '1';
  assert.equal(obliczKoszty(s, {}, 0).ogolem, 1);
});

test('koszty: PLN, waluta obca, brak kursu, niepoprawna kwota, przejazdy w etapach i w powrocie', () => {
  assert.equal(kosztPLN('', 'EUR'), null);
  assert.equal(kosztPLN('0', 'EUR'), null);
  assert.deepEqual(kosztPLN('1 234,56', 'PLN'), { kwota: 1234.56, waluta: 'PLN', kurs: null, pln: 1234.56, blad: null });
  assert.equal(kosztPLN('100', '', EUR).pln, 100);
  assert.equal(kosztPLN('1.005', 'EUR', { EUR: { kurs: 1 } }).pln, 1.01);
  assert.equal(kosztPLN('100', 'USD', EUR).blad, 'kurs');
  assert.equal(kosztPLN('-5', 'PLN').blad, 'kwota');
  assert.equal(kosztPLN('abc', 'PLN').blad, 'kwota');

  const s = przykladowyStan();
  s.etapy[0].koszt = '250'; s.etapy[1].koszt = '30'; s.etapy[1].waluta = 'EUR';
  s.etapy[3].koszt = '999';   // etap bez kraju – nie liczy się
  s.powrotPrzejazd = { srodek: 'samochód', koszt: '200', waluta: 'PLN' };
  const k = obliczKoszty(s, EUR, 930.46);
  assert.equal(k.przejazdy[1].pln, 129.51);   // 30 × 4,3171 = 129,513
  assert.equal(k.przejazdyRazem, 579.51);
  assert.equal(k.ogolem, 3150.47);   // 930,46 + 579,51 + 1640,50

  s.koszty.inne = { kwota: '10', waluta: 'USD' };
  const zBledem = obliczKoszty(s, EUR, 930.46);
  assert.equal(zBledem.blad, true);
  assert.equal(zBledem.ogolem, null);
  assert.equal(obliczKoszty(przykladowyStan(), EUR, null).ogolem, null);
});

test('parsujKwote', () => {
  assert.equal(parsujKwote(' 380 '), 380);
  assert.equal(parsujKwote(`1${NBSP}234,5`), 1234.5);
  assert.equal(parsujKwote(0), 0);
  assert.equal(parsujKwote(null), null);
  assert.ok(Number.isNaN(parsujKwote('1,2,3')));
  assert.ok(Number.isNaN(parsujKwote(-1)));
});

test('waluty w użyciu: diety i koszty w walucie obcej z kwotą', () => {
  const s = przykladowyStan();
  assert.deepEqual(walutyWUzyciu(s, kraje), ['EUR']);
  s.etapy[1].kraj = 'Szwajcaria';
  s.powrotPrzejazd = { koszt: '50', waluta: 'GBP' };
  s.koszty.inne = { kwota: '', waluta: 'USD' };   // bez kwoty – nie potrzeba kursu
  assert.deepEqual(walutyWUzyciu(s, kraje).sort(), ['CHF', 'EUR', 'GBP']);
  assert.deepEqual(walutyWUzyciu(pustyStan(), kraje), []);
});

test('pola z błędem: przykład bez błędów, pusty formularz – kraj i data kursu', () => {
  assert.deepEqual([...polaZBledem(przykladowyStan(), kraje, EUR)], []);
  assert.deepEqual([...polaZBledem(pustyStan(), kraje, {})].sort(), ['dataKursu', 'etapy.0.kraj']);
});

test('pola z błędem: reguły z formatowania warunkowego Kalkulatora', () => {
  const przypadki = [
    [(s) => { s.etapy[1].kraj = ''; s.etapy[2].kraj = 'Włochy'; s.etapy[2].wjazd = '2026-09-17T10:00'; }, ['etapy.1.kraj']],
    [(s) => { s.etapy[0].wjazd = 'abc'; }, ['etapy.0.wjazd']],
    [(s) => { s.etapy[1].wjazd = ''; }, ['etapy.1.wjazd']],
    [(s) => { s.etapy[1].wjazd = '2026-09-14T09:00'; }, ['etapy.1.wjazd', 'etapy.0.przyjazd', 'etapy.0.wyjazd', 'etapy.0.sniadania']],
    [(s) => { s.powrot = '2026-09-15T10:00'; }, ['powrot', 'etapy.1.przyjazd', 'etapy.1.wyjazd', 'etapy.1.sniadania']],
    [(s) => { s.powrot = ''; }, ['powrot']],
    [(s) => { s.etapy[0].sniadania = '9'; }, ['etapy.0.sniadania']],
    [(s) => { s.etapy[0].obiady = '1.5'; }, ['etapy.0.obiady']],
    [(s) => { s.dataKursu = ''; }, ['dataKursu']],
    [(s) => { s.wyjazdZMiejscowosci = '2026-09-14T11:00'; }, ['wyjazdZMiejscowosci']],
    [(s) => { s.powrotDoMiejscowosci = '2026-09-18T16:00'; }, ['powrotDoMiejscowosci']],
    [(s) => { s.etapy[0].przyjazd = '2026-09-14T10:00'; }, ['etapy.0.przyjazd']],
    [(s) => { s.etapy[0].wyjazd = '2026-09-16T15:00'; }, ['etapy.0.wyjazd']],
    [(s) => { s.etapy[0].przyjazd = ''; s.etapy[0].wyjazd = '2026-09-14T10:00'; }, ['etapy.0.wyjazd']],
    [(s) => { s.koszty.inne = { kwota: '10', waluta: 'USD' }; }, ['koszty.inne.waluta']],
    [(s) => { s.koszty.inne = { kwota: '-1', waluta: 'PLN' }; }, ['koszty.inne.kwota']],
    [(s) => { s.etapy[0].koszt = 'x'; }, ['etapy.0.koszt']],
    [(s) => { s.powrotPrzejazd = { koszt: '5', waluta: 'GBP' }; }, ['powrotPrzejazd.waluta']],
    [(s) => { s.etapy[0].kraj = 'Atlantyda'; }, ['etapy.0.kraj']],
  ];
  for (const [zmien, oczekiwane] of przypadki) {
    const s = przykladowyStan();
    zmien(s);
    assert.deepEqual([...polaZBledem(s, kraje, EUR)].sort(), oczekiwane.sort(), zmien.toString());
  }
});

test('pola z błędem: kurs ręczny', () => {
  const s = przykladowyStan();
  const b = (r) => [...polaZBledem(s, kraje, EUR, r)].sort();
  assert.deepEqual(b({ EUR: { kurs: '', data: '', tabela: '' } }), []);
  assert.deepEqual(b({ EUR: { kurs: '4,4', data: '2026-10-08', tabela: '196/A/NBP/2026' } }), []);
  assert.deepEqual(b({ EUR: { kurs: '4,4' } }), ['kursyReczne.EUR.data', 'kursyReczne.EUR.tabela']);
  assert.deepEqual(b({ EUR: { kurs: '0', data: '2026-10-08', tabela: 'x' } }), ['kursyReczne.EUR.kurs']);
});

test('format: kwoty jak „#,##0.00;-#,##0.00;"-"”', () => {
  assert.equal(f.kwota(930.46), '930,46');
  assert.equal(f.kwota(1012), `1${NBSP}012,00`);
  assert.equal(f.kwota(1234567.891), `1${NBSP}234${NBSP}567,89`);
  assert.equal(f.kwota(0), '-');
  assert.equal(f.kwota(-5.5), '-5,50');
  assert.equal(f.kwota(1.005), '1,01');
  assert.equal(f.kwota(null), '');
  assert.equal(f.zl(834.92), `834,92${NBSP}zł`);
  assert.equal(f.zl(0), `0,00${NBSP}zł`);
});

test('format: kurs, liczba, data', () => {
  assert.equal(f.kurs(4.3789), '4,3789');
  assert.equal(f.kurs(4.4), '4,4000');
  assert.equal(f.kurs(0.027345), '0,027345');
  assert.equal(f.kurs(0.02734), '0,02734');
  assert.equal(f.liczba(2 + 1 / 3, 4), '2,3333');
  assert.equal(f.liczba(51.5), '51,50');
  assert.equal(f.data('2026-09-14T10:30'), '14.09.2026 10:30');
  assert.equal(f.data('2026-09-14'), '14.09.2026');
  assert.equal(f.data(''), '');
});

test('model: ścieżki i widoczne etapy', () => {
  const s = pustyStan();
  assert.equal(widoczneEtapy(s), 1);
  ustaw(s, 'etapy.0.kraj', 'Niemcy');
  assert.equal(pobierz(s, 'etapy.0.kraj'), 'Niemcy');
  assert.equal(widoczneEtapy(s), 2);
  ustaw(s, 'kursyReczne.EUR.kurs', '4,4');
  assert.deepEqual(s.kursyReczne, { EUR: { kurs: '4,4' } });
  assert.equal(pobierz(s, 'kursyReczne.USD.kurs'), undefined);
  s.etapy[3].miejscowosc = 'Linz';   // dane w dalszym etapie – pokaż aż do niego
  assert.equal(widoczneEtapy(s), 4);
  s.etapy.forEach((e) => { e.kraj = 'Niemcy'; });
  assert.equal(widoczneEtapy(s), 5);
  assert.equal(widoczneEtapy(przykladowyStan()), 3);
});

test('model: pustyEtap – waluta domyślna się nie liczy', async () => {
  const { pustyEtap } = await import('../web/lib/model.js');
  const s = pustyStan();
  assert.equal(pustyEtap(s.etapy[1]), true);
  s.etapy[1].waluta = 'EUR';
  assert.equal(pustyEtap(s.etapy[1]), true);
  s.etapy[1].koszt = ' ';
  assert.equal(pustyEtap(s.etapy[1]), true);
  s.etapy[1].miejscowosc = 'Linz';
  assert.equal(pustyEtap(s.etapy[1]), false);
});
