// Stan formularza (jedna podróż) – kształt danych, które czytają obliczenia.js i nbp.js. Czyste funkcje.

import { KOSZTY } from './obliczenia.js';
import { WALUTY, TRYB_DZIEN_PRZED } from './nbp.js';

export const ETAPY = 5;
export const WALUTY_KOSZTOW = ['PLN', ...WALUTY];

const nowyEtap = () => ({
  kraj: '', wjazd: '', sniadania: '', obiady: '', kolacje: '',
  miejscowosc: '', przyjazd: '', wyjazd: '',
  srodek: '', koszt: '', waluta: 'PLN',
});

export function pustyStan() {
  return {
    // sekcja 1: dane podróży i polecenia wyjazdu
    pracownik: '', stanowisko: '', cel: '', nrPolecenia: '', dataPolecenia: '', miejscowosc: '', srodki: '',
    wyjazdZMiejscowosci: '', powrotDoMiejscowosci: '', dataKursu: '', trybKursu: TRYB_DZIEN_PRZED,
    zaliczka: '', terminRozliczenia: '', dowody: '',
    // sekcja 2: etapy (kraje) i powrót przez granicę
    etapy: Array.from({ length: ETAPY }, nowyEtap),
    powrot: '',
    powrotPrzejazd: { srodek: '', koszt: '', waluta: 'PLN' },
    // sekcja 5: pozostałe koszty
    koszty: Object.fromEntries(KOSZTY.map(({ klucz }) => [klucz, { kwota: '', waluta: 'PLN' }])),
    // kurs ręczny (awaryjnie): { EUR: { kurs, data, tabela } }
    kursyReczne: {},
  };
}

/** Przykład z wersji excelowej (build.py): Niemcy + Austria, dieta 930,46, ogółem 2 570,96. */
export function przykladowyStan() {
  const s = pustyStan();
  Object.assign(s, {
    pracownik: 'Jan Kowalski', stanowisko: 'Serwisant', cel: 'Serwis linii pakującej – klient w Monachium i Linzu',
    nrPolecenia: '1/2026', dataPolecenia: '2026-09-10', miejscowosc: 'Poznań', srodki: 'samochód służbowy',
    wyjazdZMiejscowosci: '2026-09-14T05:30', powrotDoMiejscowosci: '2026-09-18T22:00', dataKursu: '2026-09-10',
    powrot: '2026-09-18T16:45',
  });
  Object.assign(s.etapy[0], { kraj: 'Niemcy', wjazd: '2026-09-14T10:30', sniadania: '2', obiady: '0', kolacje: '0',
    miejscowosc: 'Monachium', przyjazd: '2026-09-14T12:15', wyjazd: '2026-09-16T09:00' });
  Object.assign(s.etapy[1], { kraj: 'Austria', wjazd: '2026-09-16T14:00', sniadania: '2', obiady: '0', kolacje: '0',
    miejscowosc: 'Linz', przyjazd: '2026-09-16T15:30', wyjazd: '2026-09-18T14:00' });
  s.koszty.noclegi = { kwota: '380', waluta: 'EUR' };
  return s;
}

/** Wartość pod ścieżką „etapy.0.kraj”. */
export function pobierz(stan, sciezka) {
  return sciezka.split('.').reduce((o, k) => (o == null ? undefined : o[k]), stan);
}

/** Ustawia wartość pod ścieżką, tworząc brakujące obiekty (np. „kursyReczne.EUR.kurs”). */
export function ustaw(stan, sciezka, wartosc) {
  const klucze = sciezka.split('.');
  const ostatni = klucze.pop();
  let o = stan;
  for (const k of klucze) {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    o = o[k];
  }
  o[ostatni] = wartosc;
}

/** Czy etap jest całkiem pusty (waluta przejazdu ma wartość domyślną, więc się nie liczy). */
export function pustyEtap(e) {
  return Object.entries(e).every(([k, v]) => k === 'waluta' || String(v ?? '').trim() === '');
}

/** Ile etapów pokazać: wszystkie wypełnione + jeden pusty (jak wyszarzanie wierszy w Excelu), co najmniej 1. */
export function widoczneEtapy(stan) {
  let ostatni = -1;
  stan.etapy.forEach((e, i) => { if (!pustyEtap(e)) ostatni = i; });
  const zKrajem = stan.etapy.findLastIndex((e) => String(e.kraj ?? '').trim() !== '');
  return Math.min(ETAPY, Math.max(ostatni + 1, zKrajem + 2, 1));
}
