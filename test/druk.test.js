// Druk Delegacji i Raportu – teksty porównane z eksportem PDF wersji excelowej
// (wydanie/Kalkulator_delegacji_zagranicznej.xlsx, 11.10.2026): wariant A = przykład z build.py,
// wariant B = przykład + przejazdy (250 PLN, pociąg 30 EUR, powrót 200 PLN), zaliczka 500, termin 14 dni, 3 dowody.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { daneDelegacji, daneRaportu, delegacjaHTML, raportHTML, arkusz, kursRaportu, KROPKI } from '../web/lib/druk.js';
import { przykladowyStan, pustyStan } from '../web/lib/model.js';

const kraje = JSON.parse(readFileSync(new URL('../dane/kraje.json', import.meta.url), 'utf8'));
const EUR = { EUR: { kurs: 4.3171, data: '2026-09-09', tabela: '175/A/NBP/2026' } };
const NBSP = ' ';
const bezNbsp = (s) => String(s).replaceAll(NBSP, ' ');

function wariantB() {
  const s = przykladowyStan();
  s.etapy[0].koszt = '250';
  Object.assign(s.etapy[1], { srodek: 'pociąg', koszt: '30', waluta: 'EUR' });
  s.powrotPrzejazd = { srodek: 'samochód służbowy', koszt: '200', waluta: 'PLN' };
  Object.assign(s, { zaliczka: '500', terminRozliczenia: '14', dowody: '3' });
  return s;
}

test('Delegacja, strona 1 (wariant B) – jak w PDF z Excela', () => {
  const d = daneDelegacji(wariantB(), kraje, EUR);
  assert.equal(d.uwaga, '');
  assert.equal(d.nr, 'SŁUŻBOWEGO Nr 1/2026');
  assert.equal(d.zDnia, 'z dnia 10.09.2026');
  assert.equal(d.dla, 'dla Jan Kowalski');
  assert.equal(d.stanowisko, 'Serwisant');
  assert.equal(d.doMiejsc, 'do Monachium, Linz');
  assert.equal(d.naCzas, 'na czas od 14.09.2026 do 18.09.2026');
  assert.equal(d.wCelu, 'w celu Serwis linii pakującej – klient w Monachium i Linzu');
  assert.equal(d.srodki, 'samochód służbowy');
  assert.equal(d.prosba, 'Proszę o wypłacenie zaliczki w kwocie zł 500,00 słownie zł pięćset 00/100');
  assert.equal(d.naPokrycie, 'na pokrycie wydatków zgodnie z poleceniem wyjazdu służbowego nr 1/2026');
});

test('Delegacja, strona 2 (wariant B): trasa, zestawienie, ogółem 3 150,47, do wypłaty 2 650,47', () => {
  const d = daneDelegacji(wariantB(), kraje, EUR);
  assert.deepEqual(d.trasa.slice(0, 3), [
    { skad: 'Poznań', wyjazdData: '14.09.2026', wyjazdGodz: '05:30', dokad: 'Monachium', przyjazdData: '14.09.2026', przyjazdGodz: '12:15', srodek: 'samochód służbowy', koszt: 250 },
    { skad: 'Monachium', wyjazdData: '16.09.2026', wyjazdGodz: '09:00', dokad: 'Linz', przyjazdData: '16.09.2026', przyjazdGodz: '15:30', srodek: 'pociąg', koszt: 129.51 },
    { skad: 'Linz', wyjazdData: '18.09.2026', wyjazdGodz: '14:00', dokad: 'Poznań', przyjazdData: '18.09.2026', przyjazdGodz: '22:00', srodek: 'samochód służbowy', koszt: 200 },
  ]);
  assert.deepEqual(d.trasa.slice(3), [null, null, null, null, null]);
  assert.deepEqual(d.zestawienie, { ryczalty: null, dojazdy: null, razem: 579.51, diety: 930.46, noclegi: 1640.5, noclegiRyczalt: null, inne: null });
  assert.equal(d.ogolem, 3150.47);
  assert.equal(d.ogolemSlownie, 'trzy tysiące sto pięćdziesiąt złotych i 47/100');
  assert.equal(d.zalaczam, '3 dowodów');
  assert.equal(d.pobrano, 500);
  assert.equal(d.doWyplaty, 2650.47);
  assert.equal(d.oswiadczenie, 'Zaliczkę w kwocie zł 500,00   słownie zł pięćset 00/100   otrzymałem i zobowiązuję się rozliczyć z niej '
    + 'w terminie 14 dni po zakończeniu podróży, upoważniając równocześnie zakład pracy do potrącenia kwoty nierozliczonej '
    + 'zaliczki z najbliższej wypłaty wynagrodzenia.');
  assert.equal(d.delegowany, 'Jan Kowalski');
});

test('Delegacja (wariant A): bez zaliczki kropki, bez przejazdów „-”, ogółem 2 570,96', () => {
  const d = daneDelegacji(przykladowyStan(), kraje, EUR);
  assert.equal(d.prosba, `Proszę o wypłacenie zaliczki w kwocie zł ${KROPKI(8)} słownie zł ${KROPKI(30)}`);
  assert.equal(d.trasa[0].koszt, null);
  assert.equal(d.zestawienie.razem, 0);
  assert.equal(d.ogolem, 2570.96);
  assert.equal(d.ogolemSlownie, 'dwa tysiące pięćset siedemdziesiąt złotych i 96/100');
  assert.equal(d.zalaczam, '. . . . .  dowodów');
  assert.equal(d.pobrano, null);
  assert.equal(d.doWyplaty, 2570.96);
  assert.match(d.oswiadczenie, /w terminie \. \. \. \. dni po/);
  const html = bezNbsp(delegacjaHTML(d));
  for (const tekst of ['POLECENIE WYJAZDU', 'RACHUNEK KOSZTÓW PODRÓŻY', '2 570,96', '1 640,50', '930,46', '>-<', 'str. 1', 'str. 2']) {
    assert.ok(html.includes(tekst), tekst);
  }
  assert.equal((html.match(/class="kartka delegacja"/g) ?? []).length, 2, 'dwie strony');
});

test('Delegacja: pusty druk – kropki, „Polska”, bez słownie', () => {
  const d = daneDelegacji(pustyStan(), kraje, {});
  assert.equal(d.uwaga, 'UWAGA: Wybierz kraj w etapie 1');
  assert.equal(d.nr, `SŁUŻBOWEGO Nr ${KROPKI(8)}`);
  assert.equal(d.dla, `dla ${KROPKI(40)}`);
  assert.equal(d.doMiejsc, `do ${KROPKI(40)}`);
  assert.equal(d.naCzas, `na czas od ${KROPKI(10)} do ${KROPKI(10)}`);
  assert.deepEqual(d.trasa, Array(8).fill(null));
  assert.equal(d.ogolem, 0);
  assert.equal(d.ogolemSlownie, '');
  const s = pustyStan();
  s.koszty.inne.kwota = '1';
  assert.equal(daneDelegacji(s, kraje, {}).ogolemSlownie, 'jeden złoty i 00/100');
});

test('Delegacja: ostrzeżenia jak w komórce B1', () => {
  const uwaga = (zmien) => { const s = przykladowyStan(); zmien(s); return daneDelegacji(s, kraje, EUR).uwaga; };
  assert.equal(uwaga((s) => { s.wyjazdZMiejscowosci = '2026-09-14T11:00'; }), 'UWAGA: wyjazd z miejscowości jest po przekroczeniu granicy');
  assert.equal(uwaga((s) => { s.powrotDoMiejscowosci = '2026-09-18T16:00'; }), 'UWAGA: powrót do miejscowości jest przed przekroczeniem granicy');
  assert.equal(uwaga((s) => { s.koszty.inne = { kwota: '5', waluta: 'USD' }; }), 'UWAGA: brak kursu NBP dla waluty kosztu – sprawdź datę kursu');
  assert.match(uwaga((s) => { s.etapy[0].wyjazd = '2026-09-16T15:00'; }), /^UWAGA: godziny przyjazdu\/wyjazdu/);
  assert.match(uwaga((s) => { s.etapy[0].przyjazd = '2026-09-14T10:00'; }), /^UWAGA: godziny przyjazdu\/wyjazdu/);
  assert.equal(uwaga((s) => { s.powrot = ''; }), 'UWAGA: Uzupełnij datę powrotu przez granicę');
  // brak kursu kosztu: w trasie „brak kursu”, w sumie pominięty (SUM w Excelu)
  const s = wariantB();
  s.etapy[1].waluta = 'USD';
  const d = daneDelegacji(s, kraje, EUR);
  assert.equal(d.trasa[1].koszt, 'brak kursu');
  assert.equal(d.zestawienie.razem, 450);
});

test('Delegacja: miejscowość pusta → kraj, środek pusty → domyślny, wyjazd pusty → wjazd do kolejnego kraju', () => {
  const s = przykladowyStan();
  Object.assign(s, { miejscowosc: '', wyjazdZMiejscowosci: '', powrotDoMiejscowosci: '' });
  Object.assign(s.etapy[0], { miejscowosc: '', przyjazd: '', wyjazd: '' });
  const d = daneDelegacji(s, kraje, EUR);
  assert.equal(d.doMiejsc, 'do Niemcy, Linz');
  assert.equal(d.naCzas, 'na czas od 14.09.2026 do 18.09.2026');
  assert.deepEqual(d.trasa[0], { skad: 'Polska', wyjazdData: '14.09.2026', wyjazdGodz: '10:30', dokad: 'Niemcy', przyjazdData: '14.09.2026', przyjazdGodz: '10:30', srodek: 'samochód służbowy', koszt: null });
  assert.equal(d.trasa[1].wyjazdGodz, '14:00');   // wjazd do Austrii
  assert.equal(d.trasa[2].przyjazdGodz, '16:45'); // powrót przez granicę
});

test('Raport (wariant A) – jak w PDF z Excela', () => {
  const d = daneRaportu(przykladowyStan(), kraje, EUR, '2026-10-11');
  assert.equal(d.uwaga, '');
  assert.equal(d.pracownik, 'Jan Kowalski');
  assert.equal(d.cel, 'Serwis linii pakującej – klient w Monachium i Linzu');
  assert.equal(d.kraje, 'Niemcy, Austria');
  assert.equal(d.start, '14.09.2026 10:30');
  assert.equal(d.koniec, '18.09.2026 16:45');
  assert.equal(d.czas, '4 dni 6 godz. 15 min');
  assert.deepEqual(d.diety.map((x) => Object.values(x).join(' | ')), [
    'Niemcy | 14.09.2026 10:30 | 16.09.2026 14:00 | 2 dni 3 godz. 30 min | 49,00 | 2,3333 | 114,33 | 14,70 | 99,63 | EUR',
    'Austria | 16.09.2026 14:00 | 18.09.2026 16:45 | 2 dni 2 godz. 45 min | 57,00 | 2,3333 | 133,00 | 17,10 | 115,90 | EUR',
  ]);
  assert.equal(d.dietyWWalucie, '215,53 EUR');
  assert.equal(d.kurs, '1 EUR = 4,3171 PLN (tab. 175/A/NBP/2026 z 09.09.2026)');
  assert.equal(d.kosztCalkowity, '930,46 PLN');
  assert.equal(d.stopka, 'Kurs NBP z ostatniego dnia roboczego przed dniem 10.09.2026. Dieta liczona wg §13–14 rozporządzenia, osobno dla każdego kraju.');
  assert.equal(d.dataSporzadzenia, 'Data sporządzenia: 11.10.2026');
  const html = raportHTML(d);
  assert.ok(html.includes('Rozliczenie diety z tytułu zagranicznej podróży służbowej'));
  assert.ok(html.includes('4 dni 6 godz. 15 min'));
});

test('Raport: przypadek kontrolny Węgry, kurs w dniu, „0 min” tylko w czasie podróży', () => {
  const s = pustyStan();
  Object.assign(s, { dataKursu: '2026-10-08', trybKursu: 'w dniu daty kursu', powrot: '2026-10-02T16:00' });
  Object.assign(s.etapy[0], { kraj: 'Węgry', wjazd: '2026-09-28T12:00' });
  const d = daneRaportu(s, kraje, { EUR: { kurs: 4.3789, data: '2026-10-08', tabela: '196/A/NBP/2026' } }, '2026-10-11');
  assert.equal(d.czas, '4 dni 4 godz. 0 min');
  assert.equal(d.diety[0].czas, '4 dni 4 godz.');
  assert.equal(d.kosztCalkowity, '834,92 PLN');
  assert.equal(d.kurs, '1 EUR = 4,3789 PLN (tab. 196/A/NBP/2026 z 08.10.2026)');
  assert.match(d.stopka, /^Kurs NBP z dnia 08\.10\.2026\./);
});

test('Raport: błędne dane – UWAGA, kilka walut, brak kursu', () => {
  const s = przykladowyStan();
  s.etapy[1].kraj = 'Szwajcaria';
  const d = daneRaportu(s, kraje, EUR, '2026-10-11');
  assert.match(d.uwaga, /^UWAGA: Brak kursu NBP/);
  assert.equal(bezNbsp(d.dietyWWalucie), '99,63 EUR; 178,93 CHF');   // 88 CHF × 2⅓ − 2 śniadania (26,40)
  assert.equal(d.kurs, '1 EUR = 4,3171 PLN (tab. 175/A/NBP/2026 z 09.09.2026); 1 CHF = brak kursu PLN (tab.  z )');
});

test('kurs w Raporcie: 4 albo 6 miejsc', () => {
  assert.equal(kursRaportu(4.4), '4,4000');
  assert.equal(kursRaportu(4.3171), '4,3171');
  assert.equal(kursRaportu(0.027345), '0,027345');
});

test('arkusz: scalenia, ramki, wysokości, skala, escapowanie', () => {
  const html = arkusz({
    kolumny: [1, 10, 10], wysokosci: { 2: 20 }, skala: 0.5,
    komorki: [['B1:C1', 'a<b>', { f: 10, b: true, h: 'c' }], ['B2', 'x']],
    ramki: [['B1:C2', 'obwod']], strony: [[1, 2]],
  });
  assert.ok(html.includes('colspan="2"'));
  assert.ok(html.includes('a&lt;b&gt;'));
  assert.ok(html.includes('font-size:5.00pt'));
  assert.ok(html.includes('height:10.00pt'));
  assert.ok(html.includes('height:7.50pt'));   // domyślne 15 pt × 0,5
  assert.equal((html.match(/<td/g) ?? []).length, 5);   // A1, B1:C1, A2, B2, C2
  assert.ok(/<td style="border-bottom[^"]*border-right/.test(html) || html.includes('border-right'));
});
