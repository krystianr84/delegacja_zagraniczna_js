// Dieta zagraniczna wg rozporządzenia MPiPS z 29.01.2013 (t.j. Dz.U. 2023 poz. 2190).
// Kolejność działań i zaokrągleń jak w wersji excelowej (build.py, sekcja 3) – wyniki mają się zgadzać co do grosza.
// Czyste funkcje bez DOM.
//
// Dane wejściowe:
//   podroz = {
//     etapy: [{ kraj, wjazd, sniadania, obiady, kolacje, przyjazd?, wyjazd? }],  // wjazd = przekroczenie granicy
//     powrot,                       // powrót przez granicę PL (koniec pobytu za granicą, §12)
//     wyjazdZMiejscowosci?, powrotDoMiejscowosci?, dataKursu?, dataPolecenia?
//   }
//   daty jako tekst „RRRR-MM-DDTGG:MM” (pole datetime-local) albo „RRRR-MM-DD”
//   kraje = tablica [nazwa, waluta, dieta, limit_noclegu] z dane/kraje.json
//   kursy = { EUR: { kurs, data, tabela, reczny? } }  – brak waluty = brak kursu

import { round, roundUp } from './round.js';

export const POTRACENIA = { sniadanie: 0.15, obiad: 0.30, kolacja: 0.30 };   // §14 ust. 2

const pusta = (v) => v === undefined || v === null || String(v).trim() === '';

/**
 * Data i godzina → minuty od 1970-01-01 liczone w UTC (jak numer seryjny daty w Excelu: bez stref i zmiany czasu).
 * Pusta wartość → null, niepoprawna → NaN.
 */
export function minuty(v) {
  if (pusta(v)) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(v).trim());
  if (!m) return NaN;
  const [r, mies, d, g = 0, min = 0] = m.slice(1, 6).map((x) => (x === undefined ? 0 : Number(x)));
  const ms = Date.UTC(r, mies - 1, d, g, min);
  const t = new Date(ms);
  if (t.getUTCFullYear() !== r || t.getUTCMonth() !== mies - 1 || t.getUTCDate() !== d || g > 23 || min > 59) return NaN;
  return ms / 60000;
}

/** §13 ust. 3: pełne doby + niepełna doba: do 8 h 1/3, 8–12 h 1/2, ponad 12 h cała dieta. */
export function liczbaDiet(godziny) {
  const d = Math.floor(godziny / 24);
  const reszta = godziny - 24 * d;
  return d + (reszta === 0 ? 0 : reszta <= 8 ? 1 / 3 : reszta <= 12 ? 1 / 2 : 1);
}

function mapaKrajow(kraje) {
  return kraje instanceof Map ? kraje : new Map(kraje.map((k) => [k[0], k]));
}

// etapy z wybranym krajem (do pierwszego pustego – pusty etap w środku zgłasza kontrola)
function etapyZKrajem(podroz) {
  return (podroz.etapy ?? []).filter((e) => !pusta(e.kraj));
}

/**
 * Wyliczenie diety dla każdego etapu (sekcja 3 Kalkulatora).
 * Zakłada poprawne dane – najpierw sprawdź je funkcją kontrola().
 */
export function obliczEtapy(podroz, kraje, kursy = {}) {
  const mk = mapaKrajow(kraje);
  const etapy = etapyZKrajem(podroz);
  return etapy.map((e, i) => {
    const [, waluta = '?', stawka = 0] = mk.get(e.kraj) ?? [];
    const od = minuty(e.wjazd);
    const doMin = i + 1 < etapy.length ? minuty(etapy[i + 1].wjazd) : minuty(podroz.powrot);
    let godziny = Math.max(0, round(doMin - od, 0) / 60);
    if (!Number.isFinite(godziny)) godziny = 0;
    const diet = liczbaDiet(godziny);
    const potracenie = round(stawka * ((Number(e.sniadania) || 0) * POTRACENIA.sniadanie
      + (Number(e.obiady) || 0) * POTRACENIA.obiad + (Number(e.kolacje) || 0) * POTRACENIA.kolacja), 2);
    const dietaWaluta = Math.max(0, round(stawka * diet - potracenie, 2));
    const k = kursy[waluta];
    const kurs = typeof k?.kurs === 'number' && Number.isFinite(k.kurs) ? k.kurs : null;
    return {
      kraj: e.kraj, waluta, stawka, od: e.wjazd, do: i + 1 < etapy.length ? etapy[i + 1].wjazd : podroz.powrot,
      minuty: round(doMin - od, 0), godziny, liczbaDiet: diet,
      wysokoscDiet: round(stawka * diet, 2), potracenie, dietaWaluta,
      kurs, dietaPLN: kurs === null ? null : round(dietaWaluta * kurs, 2),
    };
  });
}

/** Sekcja 4: dieta według walut – suma w walucie, potem jedno zaokrąglenie (może się różnić o grosz od sumy etapów). */
export function wgWalut(etapy, kursy = {}) {
  const sumy = new Map();
  for (const e of etapy) sumy.set(e.waluta, (sumy.get(e.waluta) ?? 0) + e.dietaWaluta);
  return [...sumy].filter(([, kwota]) => kwota !== 0).map(([waluta, kwota]) => {
    const kurs = typeof kursy[waluta]?.kurs === 'number' ? kursy[waluta].kurs : null;
    return { waluta, kwota: round(kwota, 2), kurs, pln: kurs === null ? null : round(kwota * kurs, 2) };
  });
}

/** Kontrola danych – te same komunikaty i ta sama kolejność co komórka E1 Kalkulatora. „OK”, gdy dane są poprawne. */
export function kontrola(podroz, kraje, kursy = {}) {
  const mk = mapaKrajow(kraje);
  const wszystkie = podroz.etapy ?? [];
  if (pusta(wszystkie[0]?.kraj)) return 'Wybierz kraj w etapie 1';
  for (let i = 1; i < wszystkie.length; i++) {
    if (!pusta(wszystkie[i].kraj) && pusta(wszystkie[i - 1].kraj)) return 'Nie zostawiaj pustego etapu między krajami';
  }
  const etapy = etapyZKrajem(podroz);
  for (const e of etapy) if (!mk.has(e.kraj)) return `Nieznany kraj: ${e.kraj}`;

  const daty = [podroz.powrot, podroz.wyjazdZMiejscowosci, podroz.powrotDoMiejscowosci, podroz.dataKursu, podroz.dataPolecenia,
    ...wszystkie.flatMap((e) => [e.wjazd, e.przyjazd, e.wyjazd])];
  if (daty.some((d) => Number.isNaN(minuty(d)))) return 'Niepoprawna data (wpisz np. 14.09.2026 10:30) – zobacz czerwone pole';
  if (etapy.some((e) => pusta(e.wjazd))) return 'Uzupełnij datę wjazdu w każdym etapie';
  for (let i = 1; i < etapy.length; i++) {
    if (minuty(etapy[i].wjazd) <= minuty(etapy[i - 1].wjazd)) return 'Etapy muszą być w kolejności chronologicznej';
  }
  if (pusta(podroz.powrot)) return 'Uzupełnij datę powrotu przez granicę';
  if (minuty(podroz.powrot) <= Math.max(...etapy.map((e) => minuty(e.wjazd)))) return 'Powrót przez granicę musi być po ostatnim wjeździe';

  // posiłków jednego rodzaju nie może być więcej niż rozpoczętych dób pobytu w danym kraju
  const wyliczone = obliczEtapy(podroz, mk, kursy);
  if (etapy.some((e, i) => {
    const doby = roundUp(wyliczone[i].liczbaDiet, 0);
    return [e.sniadania, e.obiady, e.kolacje].some((n) => (Number(n) || 0) > doby);
  })) return 'Więcej posiłków niż dni pobytu w kraju – sprawdź śniadania, obiady i kolacje';

  if (pusta(podroz.dataKursu)) return 'Uzupełnij datę kursu';
  if (Object.values(kursy).some((k) => k?.reczny && (pusta(k.data) || pusta(k.tabela)))) {
    return 'Kurs ręczny: uzupełnij datę notowania i nr tabeli (arkusz Kursy NBP)';
  }
  if (wyliczone.some((e) => e.dietaPLN === null)) {
    return 'Brak kursu NBP – sprawdź datę kursu i internet albo wpisz kurs ręcznie (arkusz Kursy NBP)';
  }
  return 'OK';
}

/**
 * Całe wyliczenie: kontrola, etapy, dieta według walut i dieta razem (PLN).
 * Dieta razem = suma etapowych kwot PLN (każda zaokrąglona osobno), nie suma z tabeli według walut.
 */
export function oblicz(podroz, kraje, kursy = {}) {
  const mk = mapaKrajow(kraje);
  const wynik = kontrola(podroz, mk, kursy);
  if (wynik !== 'OK') return { kontrola: wynik, etapy: [], wgWalut: [], dietaRazem: null };
  const etapy = obliczEtapy(podroz, mk, kursy);
  return {
    kontrola: wynik,
    etapy,
    wgWalut: wgWalut(etapy, kursy),
    dietaRazem: round(etapy.reduce((s, e) => s + e.dietaPLN, 0), 2),
  };
}

/** Czas w minutach → „4 dni 4 godz. 0 min” (Raport: czas podróży). bezZeraMinut: „4 dni 4 godz.” (Raport: czas pobytu etapu). */
export function czasTekst(min, bezZeraMinut = false) {
  const m = round(min, 0);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mi = m % 60;
  const dni = d + (d === 1 ? ' dzień ' : ' dni ') + h + ' godz.';
  return bezZeraMinut && mi === 0 ? dni : `${dni} ${mi} min`;
}

// ---------- kwota słownie ----------

const JED = ['', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'];
const NAST = ['dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście',
  'siedemnaście', 'osiemnaście', 'dziewiętnaście'];
const DZIES = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt',
  'osiemdziesiąt', 'dziewięćdziesiąt'];
const SETKI = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset'];

/** Odmiana jak dla „tysiąc”: 1 → pojedyncza, 2–4 (bez 12–14) → dw, reszta → wl. */
export function odmiana(v, jedna, dw, wl) {
  if (v === 1) return jedna;
  const j = v % 10, d = v % 100;
  return j >= 2 && j <= 4 && (d < 10 || d > 20) ? dw : wl;
}

function setki(v) {
  const h = Math.floor(v / 100), t = Math.floor((v % 100) / 10), u = v % 10;
  return [SETKI[h], t === 1 ? NAST[u] : `${DZIES[t]} ${JED[u]}`].join(' ');
}

function grupa(v, jedna, dw, wl) {
  if (v === 0) return '';
  return v === 1 ? jedna : `${setki(v)} ${odmiana(v, '', dw, wl)}`;
}

/**
 * Kwota słownie jak w wersji excelowej, np. 930.46 → „dziewięćset trzydzieści 46/100”.
 * jedn: tekst wstawiany przed groszami albo trójka form, np. ['złoty i', 'złote i', 'złotych i'].
 */
export function slownie(x, jedn = '') {
  const a = round(Math.abs(x), 2);
  const z = Math.floor(a);
  const g = round((a - z) * 100, 0);
  const s = z === 0 ? 'zero' : [
    grupa(Math.floor(z / 1e6), 'jeden milion', 'miliony', 'milionów'),
    grupa(Math.floor((z % 1e6) / 1000), 'jeden tysiąc', 'tysiące', 'tysięcy'),
    setki(z % 1000),
  ].join(' ');
  const j = Array.isArray(jedn) ? odmiana(z, ...jedn) : jedn;
  const tekst = [s, j, String(g).padStart(2, '0') + '/100'].join(' ');
  return tekst.replace(/\s+/g, ' ').trim();
}

/** Pole „Słownie złotych” na druku Delegacji – puste przy kwocie 0 (pusty druk). */
export function slownieZlotych(x) {
  return !Number(x) ? '' : slownie(x, ['złoty i', 'złote i', 'złotych i']);
}

// ---------- koszty do rachunku delegacji (przejazdy i sekcja 5) ----------
// Tylko do druku: kwoty wpisane ręcznie, waluta obca po kursie NBP jak dieta (ROUND(kwota × kurs; 2)).

/** Pozycje sekcji 5 Kalkulatora (pozostałe koszty podróży). */
export const KOSZTY = [
  { klucz: 'ryczaltyDojazdy', nazwa: 'Ryczałty za dojazdy', uwaga: 'Ryczałt za dojazdy: 10% diety za każdą rozpoczętą dobę pobytu (§16 ust. 3).' },
  { klucz: 'dojazdy', nazwa: 'Dojazdy udokumentowane' },
  { klucz: 'noclegi', nazwa: 'Noclegi wg rachunków' },
  { klucz: 'noclegiRyczalt', nazwa: 'Noclegi – ryczałt', uwaga: 'Ryczałt za nocleg bez rachunku: 25% limitu noclegu danego kraju (§16 ust. 2).' },
  { klucz: 'inne', nazwa: 'Inne wydatki wg załączników', uwaga: 'Np. parking, opłaty drogowe, wiza, telefon – wg rachunków.' },
];

/** Kwota wpisana ręcznie: „1 234,56” / „380” / 380 → liczba; puste → null; ujemna lub niepoprawna → NaN. */
export function parsujKwote(v) {
  if (pusta(v)) return null;
  if (typeof v === 'number') return v >= 0 ? v : NaN;
  const s = String(v).replace(/[\s ]/g, '').replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/**
 * Koszt w PLN. Pusta lub zerowa kwota → null (pusta komórka w Excelu).
 * Wynik: { kwota, waluta, kurs, pln, blad } – blad: 'kwota' (niepoprawna) albo 'kurs' (brak kursu NBP).
 */
export function kosztPLN(kwota, waluta, kursy = {}) {
  const k = parsujKwote(kwota);
  if (k === null || k === 0) return null;
  const w = pusta(waluta) ? 'PLN' : waluta;
  if (Number.isNaN(k)) return { kwota: k, waluta: w, kurs: null, pln: null, blad: 'kwota' };
  if (w === 'PLN') return { kwota: k, waluta: w, kurs: null, pln: k, blad: null };
  const kurs = typeof kursy[w]?.kurs === 'number' ? kursy[w].kurs : null;
  return { kwota: k, waluta: w, kurs, pln: kurs === null ? null : round(k * kurs, 2), blad: kurs === null ? 'kurs' : null };
}

/**
 * Przejazdy (koszt w każdym etapie z krajem i w powrocie) i pozostałe koszty (sekcja 5) w PLN oraz ogółem:
 * dieta razem + przejazdy + pozostałe. Ogółem = null, gdy brakuje diety albo któryś koszt ma błąd
 * (Excel w takiej sytuacji po cichu pomija koszt bez kursu – tu wolimy nie pokazywać niepełnej kwoty).
 */
export function obliczKoszty(podroz, kursy = {}, dietaRazem = null) {
  const przejazdy = etapyZKrajem(podroz).map((e) => kosztPLN(e.koszt, e.waluta, kursy));
  const powrot = kosztPLN(podroz.powrotPrzejazd?.koszt, podroz.powrotPrzejazd?.waluta, kursy);
  const pozostale = Object.fromEntries(KOSZTY.map(({ klucz }) =>
    [klucz, kosztPLN(podroz.koszty?.[klucz]?.kwota, podroz.koszty?.[klucz]?.waluta, kursy)]));
  const blad = [...przejazdy, powrot, ...Object.values(pozostale)].some((k) => k?.blad);
  const suma = (lista) => round(lista.reduce((s, k) => s + (k?.pln ?? 0), 0), 2);
  const przejazdyRazem = suma([...przejazdy, powrot]);
  const pozostaleRazem = suma(Object.values(pozostale));
  return {
    przejazdy, powrot, pozostale, przejazdyRazem, pozostaleRazem, blad,
    ogolem: blad || dietaRazem === null ? null : round(dietaRazem + przejazdyRazem + pozostaleRazem, 2),
  };
}

/** Waluty, dla których potrzebny jest kurs: waluty diet z etapów oraz waluty obce kosztów z kwotą. */
export function walutyWUzyciu(podroz, kraje) {
  const mk = mapaKrajow(kraje);
  const w = new Set();
  const etapy = etapyZKrajem(podroz);
  for (const e of etapy) if (mk.has(e.kraj)) w.add(mk.get(e.kraj)[1]);
  const koszty = [...etapy, podroz.powrotPrzejazd ?? {},
    ...Object.values(podroz.koszty ?? {}).map((k) => ({ koszt: k?.kwota, waluta: k?.waluta }))];
  for (const k of koszty) {
    if (!pusta(k.waluta) && k.waluta !== 'PLN' && parsujKwote(k.koszt) > 0) w.add(k.waluta);
  }
  return [...w];
}

// ---------- pola z błędem (czerwone podświetlenie jak w Kalkulatorze) ----------

/**
 * Klucze pól z błędem, np. 'etapy.0.kraj', 'powrot', 'koszty.noclegi.waluta', 'kursyReczne.EUR.tabela'.
 * Reguły jak w formatowaniu warunkowym arkusza – także te, które nie blokują wyniku (np. przyjazd poza etapem).
 */
export function polaZBledem(podroz, kraje, kursy = {}, kursyReczne = {}) {
  const bledy = new Set();
  const mk = mapaKrajow(kraje);
  const etapy = podroz.etapy ?? [];
  const zle = (v) => Number.isNaN(minuty(v));
  const dodaj = (warunek, klucz) => { if (warunek) bledy.add(klucz); };

  dodaj(pusta(etapy[0]?.kraj), 'etapy.0.kraj');
  etapy.forEach((e, i) => {
    if (i > 0) dodaj(pusta(e.kraj) && etapy.slice(i + 1).some((x) => !pusta(x.kraj)), `etapy.${i}.kraj`);
    dodaj(!pusta(e.kraj) && !mk.has(e.kraj), `etapy.${i}.kraj`);
    for (const p of ['wjazd', 'przyjazd', 'wyjazd']) dodaj(zle(e[p]), `etapy.${i}.${p}`);
  });
  for (const p of ['powrot', 'wyjazdZMiejscowosci', 'powrotDoMiejscowosci', 'dataKursu', 'dataPolecenia']) dodaj(zle(podroz[p]), p);

  const zKrajem = etapy.map((e, i) => ({ e, i })).filter(({ e }) => !pusta(e.kraj));
  const ok = (v) => { const m = minuty(v); return Number.isFinite(m) ? m : null; };
  const powrot = ok(podroz.powrot);
  zKrajem.forEach(({ e, i }, j) => {
    const wjazd = ok(e.wjazd);
    dodaj(pusta(e.wjazd), `etapy.${i}.wjazd`);
    if (j > 0) {
      const poprz = ok(zKrajem[j - 1].e.wjazd);
      dodaj(wjazd !== null && poprz !== null && wjazd <= poprz, `etapy.${i}.wjazd`);
    }
    // koniec etapu: wjazd do kolejnego kraju albo powrót przez granicę
    const nastepny = j + 1 < zKrajem.length ? ok(zKrajem[j + 1].e.wjazd) : null;
    const nast = nastepny ?? powrot;
    const przyjazd = ok(e.przyjazd), wyjazd = ok(e.wyjazd);
    if (przyjazd !== null && wjazd !== null) dodaj(przyjazd < wjazd || (nast !== null && przyjazd > nast), `etapy.${i}.przyjazd`);
    const od = przyjazd ?? wjazd;
    if (wyjazd !== null && od !== null) dodaj(wyjazd < od || (nast !== null && wyjazd > nast), `etapy.${i}.wyjazd`);
    for (const p of ['sniadania', 'obiady', 'kolacje']) {
      dodaj(!pusta(e[p]) && !(Number.isInteger(Number(e[p])) && Number(e[p]) >= 0), `etapy.${i}.${p}`);
    }
  });
  if (zKrajem.length) {
    const maks = Math.max(...zKrajem.map(({ e }) => ok(e.wjazd) ?? -Infinity));
    dodaj(powrot === null || powrot <= maks, 'powrot');
  }
  // posiłki ponad liczbę rozpoczętych dób (tylko gdy daty etapów są poprawne)
  if (zKrajem.length && powrot !== null && zKrajem.every(({ e }) => ok(e.wjazd) !== null)) {
    obliczEtapy(podroz, mk, kursy).forEach((w, j) => {
      const doby = roundUp(w.liczbaDiet, 0);
      for (const p of ['sniadania', 'obiady', 'kolacje']) dodaj((Number(zKrajem[j].e[p]) || 0) > doby, `etapy.${zKrajem[j].i}.${p}`);
    });
  }
  dodaj(pusta(podroz.dataKursu), 'dataKursu');
  const wjazd1 = ok(etapy[0]?.wjazd), wyjazdZ = ok(podroz.wyjazdZMiejscowosci), powrotDo = ok(podroz.powrotDoMiejscowosci);
  dodaj(wyjazdZ !== null && wjazd1 !== null && wyjazdZ > wjazd1, 'wyjazdZMiejscowosci');
  dodaj(powrotDo !== null && powrot !== null && powrotDo < powrot, 'powrotDoMiejscowosci');

  // koszty: niepoprawna kwota albo brak kursu waluty
  const koszt = (kwota, waluta, prefiks, poleKwoty) => {
    const k = kosztPLN(kwota, waluta, kursy);
    dodaj(k?.blad === 'kwota', `${prefiks}.${poleKwoty}`);
    dodaj(k?.blad === 'kurs', `${prefiks}.waluta`);
  };
  zKrajem.forEach(({ e, i }) => koszt(e.koszt, e.waluta, `etapy.${i}`, 'koszt'));
  koszt(podroz.powrotPrzejazd?.koszt, podroz.powrotPrzejazd?.waluta, 'powrotPrzejazd', 'koszt');
  for (const { klucz } of KOSZTY) koszt(podroz.koszty?.[klucz]?.kwota, podroz.koszty?.[klucz]?.waluta, `koszty.${klucz}`, 'kwota');

  // kurs ręczny: niepoprawny kurs, brak daty notowania albo nr tabeli
  for (const [w, r] of Object.entries(kursyReczne ?? {})) {
    if (pusta(r?.kurs)) continue;
    dodaj(!(parsujKwote(r.kurs) > 0), `kursyReczne.${w}.kurs`);
    dodaj(pusta(r.data) || zle(r.data), `kursyReczne.${w}.data`);
    dodaj(pusta(r.tabela), `kursyReczne.${w}.tabela`);
  }
  return bledy;
}
