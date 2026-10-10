// Przypadki z wersji excelowej (C:\MOJE\Projekt_delegacje\build\test.ps1) i przypadek kontrolny z CLAUDE.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  oblicz, kontrola, obliczEtapy, wgWalut, liczbaDiet, minuty, czasTekst, slownie, slownieZlotych,
} from '../web/lib/obliczenia.js';

const kraje = JSON.parse(readFileSync(new URL('../dane/kraje.json', import.meta.url), 'utf8'));

// kursy pobrane z api.nbp.pl 10.10.2026
const EUR_0909 = { EUR: { kurs: 4.3171, data: '2026-09-09', tabela: '175/A/NBP/2026' } };   // „dzień przed” 10.09.2026
const EUR_0810 = { EUR: { kurs: 4.3789, data: '2026-10-08', tabela: '196/A/NBP/2026' } };   // „w dniu” 08.10.2026

// przykład z build.py: Niemcy + Austria, data kursu 10.09.2026 (kurs z dnia poprzedniego)
const przyklad = () => ({
  wyjazdZMiejscowosci: '2026-09-14T05:30',
  powrotDoMiejscowosci: '2026-09-18T22:00',
  dataPolecenia: '2026-09-10',
  dataKursu: '2026-09-10',
  etapy: [
    { kraj: 'Niemcy', wjazd: '2026-09-14T10:30', sniadania: 2, obiady: 0, kolacje: 0,
      przyjazd: '2026-09-14T12:15', wyjazd: '2026-09-16T09:00' },
    { kraj: 'Austria', wjazd: '2026-09-16T14:00', sniadania: 2, obiady: 0, kolacje: 0,
      przyjazd: '2026-09-16T15:30', wyjazd: '2026-09-18T14:00' },
  ],
  powrot: '2026-09-18T16:45',
});

// przypadek kontrolny: Węgry, kurs w dniu daty kursu 08.10.2026
const wegry = () => ({
  dataKursu: '2026-10-08',
  etapy: [{ kraj: 'Węgry', wjazd: '2026-09-28T12:00', sniadania: 0, obiady: 0, kolacje: 0 }],
  powrot: '2026-10-02T16:00',
});

test('przypadek kontrolny: Węgry → 190,67 EUR, 834,92 PLN, 4 dni 4 godz. 0 min', () => {
  const p = wegry();
  const w = oblicz(p, kraje, EUR_0810);
  assert.equal(w.kontrola, 'OK');
  assert.equal(w.etapy.length, 1);
  const [e] = w.etapy;
  assert.equal(e.waluta, 'EUR');
  assert.equal(e.stawka, 44);
  assert.equal(e.godziny, 100);
  assert.equal(e.liczbaDiet, 4 + 1 / 3);
  assert.equal(e.dietaWaluta, 190.67);
  assert.equal(e.dietaPLN, 834.92);
  assert.equal(w.dietaRazem, 834.92);
  assert.equal(czasTekst(minuty(p.powrot) - minuty(p.etapy[0].wjazd)), '4 dni 4 godz. 0 min');
  assert.equal(czasTekst(e.minuty, true), '4 dni 4 godz.');
});

test('przykład z build.py (Niemcy + Austria) → dieta 930,46', () => {
  const w = oblicz(przyklad(), kraje, EUR_0909);
  assert.equal(w.kontrola, 'OK');
  const [de, at] = w.etapy;
  assert.equal(de.godziny, 51.5);
  assert.equal(de.liczbaDiet, 2 + 1 / 3);
  assert.equal(de.potracenie, 14.7);
  assert.equal(de.dietaWaluta, 99.63);
  assert.equal(de.dietaPLN, 430.11);
  assert.equal(at.godziny, 50.75);
  assert.equal(at.potracenie, 17.1);
  assert.equal(at.dietaWaluta, 115.9);
  assert.equal(at.dietaPLN, 500.35);
  assert.equal(w.dietaRazem, 930.46);
  assert.deepEqual(w.wgWalut, [{ waluta: 'EUR', kwota: 215.53, kurs: 4.3171, pln: 930.46 }]);
});

test('krótki wyjazd 7,5 h → 1/3 diety, 38,77', () => {
  const p = przyklad();
  p.etapy = [{ ...p.etapy[0], sniadania: 1 }];
  p.powrot = '2026-09-14T18:00';
  const w = oblicz(p, kraje, EUR_0909);
  assert.equal(w.kontrola, 'OK');
  assert.equal(w.etapy[0].godziny, 7.5);
  assert.equal(w.etapy[0].liczbaDiet, 1 / 3);
  assert.equal(w.etapy[0].dietaWaluta, 8.98);
  assert.equal(w.dietaRazem, 38.77);
});

test('kurs ręczny zamiast NBP (Węgry, 4,4) → 838,95', () => {
  const w = oblicz(wegry(), kraje, { EUR: { kurs: 4.4, data: '2026-10-08', tabela: '196/A/NBP/2026', reczny: true } });
  assert.equal(w.kontrola, 'OK');
  assert.equal(w.dietaRazem, 838.95);
});

test('kontrola danych: komunikaty jak w komórce E1', async (t) => {
  const przypadki = [
    ['pusty etap między krajami', (p) => { p.etapy.splice(1, 1, { kraj: '' }, { kraj: 'Austria', wjazd: '2026-09-16T14:00' }); },
      'Nie zostawiaj pustego etapu'],
    ['tekst zamiast daty', (p) => { p.etapy[0].wjazd = 'abc'; }, 'Niepoprawna data'],
    ['nieistniejąca data', (p) => { p.dataKursu = '2026-02-30'; }, 'Niepoprawna data'],
    ['więcej posiłków niż dób', (p) => { p.etapy[0].sniadania = 9; }, 'Więcej posiłków niż dni'],
    ['powrót przed wjazdem', (p) => { p.powrot = '2026-09-15T10:00'; }, 'Powrót przez granicę musi być po'],
    ['brak kursu (data z przyszłości)', (p) => { p.dataKursu = '2099-12-31'; }, 'Brak kursu NBP', {}],
    ['kurs ręczny bez nr tabeli', () => {}, 'Kurs ręczny: uzupełnij', { EUR: { kurs: 4.4, data: '2026-10-08', tabela: '', reczny: true } }],
    ['brak kraju w etapie 1', (p) => { p.etapy = [{ kraj: '' }]; }, 'Wybierz kraj w etapie 1'],
    ['etapy nie po kolei', (p) => { p.etapy[1].wjazd = '2026-09-14T10:00'; }, 'Etapy muszą być w kolejności'],
    ['brak daty wjazdu', (p) => { p.etapy[1].wjazd = ''; }, 'Uzupełnij datę wjazdu'],
    ['brak powrotu', (p) => { p.powrot = ''; }, 'Uzupełnij datę powrotu'],
    ['brak daty kursu', (p) => { p.dataKursu = ''; }, 'Uzupełnij datę kursu'],
  ];
  for (const [nazwa, zmien, oczekiwany, kursy = EUR_0909] of przypadki) {
    await t.test(nazwa, () => {
      const p = przyklad();
      zmien(p);
      const k = kontrola(p, kraje, kursy);
      assert.ok(k.startsWith(oczekiwany), `„${k}”, oczekiwano „${oczekiwany}…”`);
      assert.equal(oblicz(p, kraje, kursy).dietaRazem, null);
    });
  }
});

test('posiłki: tyle, ile rozpoczętych dób, jest dozwolone; dieta nie spada poniżej 0', () => {
  const p = przyklad();
  p.etapy = [{ ...p.etapy[0], sniadania: 3, obiady: 3, kolacje: 3 }];   // 2⅓ doby → 3 posiłki każdego rodzaju
  p.powrot = '2026-09-16T14:00';
  const w = oblicz(p, kraje, EUR_0909);
  assert.equal(w.kontrola, 'OK');
  assert.equal(w.etapy[0].potracenie, 110.25);   // 49 × 2,25
  assert.equal(w.etapy[0].dietaWaluta, 4.08);    // 114,33 − 110,25
  const [e] = obliczEtapy({ ...p, powrot: '2026-09-14T12:00' }, kraje, EUR_0909);   // 1,5 h → 1/3 diety
  assert.equal(e.dietaWaluta, 0);
});

test('liczbaDiet: progi 8 h i 12 h', () => {
  assert.equal(liczbaDiet(0), 0);
  assert.equal(liczbaDiet(8), 1 / 3);
  assert.equal(liczbaDiet(8 + 1 / 60), 1 / 2);
  assert.equal(liczbaDiet(12), 1 / 2);
  assert.equal(liczbaDiet(12 + 1 / 60), 1);
  assert.equal(liczbaDiet(24), 1);
  assert.equal(liczbaDiet(32), 1 + 1 / 3);
  assert.equal(liczbaDiet(48), 2);
});

test('minuty: bez wpływu zmiany czasu (25.10.2026)', () => {
  assert.equal(minuty('2026-10-26T00:00') - minuty('2026-10-25T00:00'), 1440);
  assert.equal(minuty(''), null);
  assert.ok(Number.isNaN(minuty('14.09.2026')));
  assert.ok(Number.isNaN(minuty('2026-09-14T24:00')));
});

test('wgWalut: kilka walut i pominięcie zer', () => {
  const etapy = [
    { waluta: 'EUR', dietaWaluta: 10.005 }, { waluta: 'USD', dietaWaluta: 0 }, { waluta: 'EUR', dietaWaluta: 1 },
  ];
  // jak w Excelu: kurs × niezaokrąglona suma (11,005 × 4 = 44,02), nie × kwota w tabeli (11,01)
  assert.deepEqual(wgWalut(etapy, { EUR: { kurs: 4 } }), [{ waluta: 'EUR', kwota: 11.01, kurs: 4, pln: 44.02 }]);
});

test('czasTekst: 1 dzień i minuty', () => {
  assert.equal(czasTekst(1440 + 75), '1 dzień 1 godz. 15 min');
  assert.equal(czasTekst(1440 + 75, true), '1 dzień 1 godz. 15 min');
  assert.equal(czasTekst(450, true), '0 dni 7 godz. 30 min');
});

test('słownie: przypadki z test.ps1', () => {
  assert.equal(slownieZlotych(2570.96), 'dwa tysiące pięćset siedemdziesiąt złotych i 96/100');
  assert.equal(slownieZlotych(932), 'dziewięćset trzydzieści dwa złote i 00/100');
  assert.equal(slownieZlotych(935), 'dziewięćset trzydzieści pięć złotych i 00/100');
  assert.equal(slownieZlotych(1012), 'jeden tysiąc dwanaście złotych i 00/100');
  assert.equal(slownieZlotych(1022), 'jeden tysiąc dwadzieścia dwa złote i 00/100');
  assert.equal(slownieZlotych(1), 'jeden złoty i 00/100');
  assert.equal(slownieZlotych(0), '');
});

test('słownie: inne kwoty', () => {
  assert.equal(slownie(930.46), 'dziewięćset trzydzieści 46/100');
  assert.equal(slownieZlotych(0.5), 'zero złotych i 50/100');
  assert.equal(slownieZlotych(2_000_000.01), 'dwa miliony złotych i 01/100');
  assert.equal(slownieZlotych(1_001_114), 'jeden milion jeden tysiąc sto czternaście złotych i 00/100');
  assert.equal(slownieZlotych(5_022_013.1), 'pięć milionów dwadzieścia dwa tysiące trzynaście złotych i 10/100');
  assert.equal(slownieZlotych(112_000), 'sto dwanaście tysięcy złotych i 00/100');
  assert.equal(slownieZlotych(1.005), 'jeden złoty i 01/100');
});
