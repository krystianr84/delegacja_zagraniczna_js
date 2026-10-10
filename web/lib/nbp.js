// Kursy średnie NBP (tabela A) z api.nbp.pl – jak arkusz „Kursy NBP” wersji excelowej.
// Bez DOM: fetch i magazyn (localStorage) są przekazywane w opcjach, więc testy działają bez sieci.
// Zapytanie bez własnych nagłówków – nagłówki wymuszają preflight OPTIONS, a ten NBP odrzuca (404).
//
// Wynik kursu (format oczekiwany przez obliczenia.js):
//   { kurs: 4.3789, data: '2026-10-08', tabela: '196/A/NBP/2026', reczny?: true }

export const WALUTY = ['EUR', 'USD', 'AUD', 'DKK', 'JPY', 'CAD', 'NOK', 'CHF', 'SEK', 'GBP'];
export const TRYB_W_DNIU = 'w dniu daty kursu';
export const TRYB_DZIEN_PRZED = 'dzień przed datą kursu';
export const DNI_WSTECZ = 14;     // weekendy i święta (nawet długie, np. Boże Narodzenie) mieszczą się w zakresie
export const MAKS_DNI = 93;       // limit API NBP na jedno zapytanie (10.10.2026 przechodziło więcej, ale trzymamy się dokumentacji)
const API = 'https://api.nbp.pl/api/exchangerates/rates/A';
const CACHE = 'nbp:';

/**
 * Błąd pobierania kursu. powod: 'brak' (brak notowań: 404 albo data z przyszłości), 'siec' (brak połączenia),
 * 'odpowiedz' (inny status / zły JSON).
 */
export class BladNBP extends Error {
  constructor(powod, komunikat) {
    super(komunikat);
    this.name = 'BladNBP';
    this.powod = powod;
  }
}

// ---------- daty „RRRR-MM-DD” (UTC, bez zmiany czasu) ----------

const DZIEN = /^(\d{4})-(\d{2})-(\d{2})/;

function msDnia(s) {
  const m = DZIEN.exec(String(s ?? ''));
  if (!m) throw new RangeError(`Niepoprawna data: ${s}`);
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  if (new Date(ms).getUTCDate() !== +m[3]) throw new RangeError(`Niepoprawna data: ${s}`);
  return ms;
}

const tekstDnia = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Data przesunięta o n dni; przyjmuje też „RRRR-MM-DDTGG:MM” (godzina jest pomijana). */
export function dodajDni(s, n) {
  return tekstDnia(msDnia(s) + n * 86400000);
}

/** Liczba dni od a do b (b − a). */
export function roznicaDni(a, b) {
  return Math.round((msDnia(b) - msDnia(a)) / 86400000);
}

/** Dzisiejsza data lokalna (zegar urządzenia) jako „RRRR-MM-DD” – np. data sporządzenia wydruku. */
export function dzisiaj(teraz = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  return `${teraz.getFullYear()}-${p(teraz.getMonth() + 1)}-${p(teraz.getDate())}`;
}

/**
 * Dzisiejsza data w Warszawie – „dziś” dla NBP: od niej zależy, czy dzień jest z przyszłości (NBP: 400)
 * i czy kurs da się zapamiętać. Zegar urządzenia za granicą (albo serwera CI w UTC) bywa w innym dniu.
 */
export function dzisWarszawa(teraz = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(teraz);
  } catch {
    return dzisiaj(teraz);   // przeglądarka bez danych stref czasowych
  }
}

/** Dzień, do którego szukamy ostatniego notowania: data kursu albo dzień wcześniej (praktyka podatkowa). */
export function dzienSzukany(dataKursu, tryb = TRYB_DZIEN_PRZED) {
  return dodajDni(dataKursu, tryb === TRYB_W_DNIU ? 0 : -1);
}

export function urlKursow(waluta, od, doDnia) {
  return `${API}/${encodeURIComponent(waluta)}/${od}/${doDnia}/?format=json`;
}

// ---------- zapytanie ----------

/**
 * Notowania z zakresu dat (najwyżej 93 dni): [{ kurs, data, tabela }] rosnąco po dacie.
 * Brak notowań → BladNBP('brak'). API odpowiada 404, gdy w zakresie nie ma notowań, a 400 „Błędny zakres dat”, gdy
 * zakres kończy się po dzisiejszej dacie – takiego zapytania nie wysyłamy, a 400 z NBP (inny zegar) też znaczy „brak”.
 */
export async function pobierzNotowania(waluta, od, doDnia, { fetch: f = globalThis.fetch, timeoutMs = 15000, dzis = dzisWarszawa() } = {}) {
  if (roznicaDni(od, doDnia) < 0) throw new RangeError('Data „od” jest po dacie „do”');
  if (roznicaDni(od, doDnia) + 1 > MAKS_DNI) throw new RangeError(`Zakres dłuższy niż ${MAKS_DNI} dni`);
  if (doDnia > dzis) throw new BladNBP('brak', `Brak kursu ${waluta} z dnia ${doDnia} – data z przyszłości`);
  let odp;
  try {
    const opcje = typeof AbortSignal?.timeout === 'function' ? { signal: AbortSignal.timeout(timeoutMs) } : undefined;
    odp = await f(urlKursow(waluta, od, doDnia), opcje);
  } catch (e) {
    throw new BladNBP('siec', `Brak połączenia z api.nbp.pl (${e?.message ?? e})`);
  }
  if (odp.status === 404 || odp.status === 400) throw new BladNBP('brak', `Brak notowań ${waluta} od ${od} do ${doDnia}`);
  if (!odp.ok) throw new BladNBP('odpowiedz', `api.nbp.pl zwróciło błąd ${odp.status}`);
  let json;
  try {
    json = await odp.json();
  } catch {
    throw new BladNBP('odpowiedz', 'Niepoprawna odpowiedź api.nbp.pl');
  }
  const notowania = (json?.rates ?? [])
    .filter((r) => typeof r?.mid === 'number' && typeof r?.effectiveDate === 'string')
    .map((r) => ({ kurs: r.mid, data: r.effectiveDate, tabela: String(r.no ?? '') }))
    .sort((a, b) => a.data.localeCompare(b.data));
  if (!notowania.length) throw new BladNBP('brak', `Brak notowań ${waluta} od ${od} do ${doDnia}`);
  return notowania;
}

// ---------- cache w localStorage (każdy odczyt i zapis w try/catch) ----------

function czytajCache(magazyn, klucz) {
  try {
    const s = magazyn?.getItem(CACHE + klucz);
    const k = s ? JSON.parse(s) : null;
    return typeof k?.kurs === 'number' && k.data && k.tabela ? k : null;
  } catch {
    return null;
  }
}

function zapiszCache(magazyn, klucz, kurs) {
  try {
    magazyn?.setItem(CACHE + klucz, JSON.stringify(kurs));
  } catch { /* brak miejsca, tryb prywatny – trudno, pobierzemy jeszcze raz */ }
}

/**
 * Kurs „z dnia” = ostatnie notowanie z zakresu (dzień − 14 … dzień).
 * Do cache trafia tylko kurs, który już się nie zmieni: dzień z przeszłości albo notowanie z tego samego dnia
 * (dzisiejsza tabela ukazuje się około południa – rano wynikiem jest wczorajszy kurs, którego nie zapamiętujemy).
 */
export async function pobierzKurs(waluta, dzien, { magazyn, dzis = dzisWarszawa(), ...opcje } = {}) {
  const klucz = `${waluta}:${dzien}`;
  const zCache = czytajCache(magazyn, klucz);
  if (zCache) return zCache;
  const notowania = await pobierzNotowania(waluta, dodajDni(dzien, -DNI_WSTECZ), dzien, { ...opcje, dzis });
  const kurs = notowania.at(-1);
  if (dzien < dzis || kurs.data === dzien) zapiszCache(magazyn, klucz, kurs);
  return kurs;
}

/**
 * Kursy wielu walut na datę kursu z Kalkulatora.
 * Wynik: { kursy: { EUR: {...} }, bledy: { USD: BladNBP } } – błąd jednej waluty nie blokuje pozostałych.
 */
export async function pobierzKursy(waluty, dataKursu, tryb = TRYB_DZIEN_PRZED, opcje = {}) {
  const dzien = dzienSzukany(dataKursu, tryb);
  const kursy = {}, bledy = {};
  await Promise.all([...new Set(waluty)].filter((w) => w && w !== 'PLN').map(async (w) => {
    try {
      kursy[w] = await pobierzKurs(w, dzien, opcje);
    } catch (e) {
      bledy[w] = e;
    }
  }));
  return { kursy, bledy };
}

/**
 * Notowania z okresu (sekcja B arkusza „Kursy NBP”), dzielone na zapytania po 93 dni.
 * Koniec okresu po dzisiejszej dacie jest przycinany do dziś; okres bez żadnego notowania daje pustą tablicę.
 */
export async function pobierzKursyZOkresu(waluta, od, doDnia, { dzis = dzisWarszawa(), ...opcje } = {}) {
  if (doDnia > dzis) doDnia = dzis;
  opcje = { ...opcje, dzis };
  const wynik = [];
  for (let start = od; roznicaDni(start, doDnia) >= 0; start = dodajDni(start, MAKS_DNI)) {
    const koniec = roznicaDni(start, doDnia) >= MAKS_DNI ? dodajDni(start, MAKS_DNI - 1) : doDnia;
    try {
      wynik.push(...await pobierzNotowania(waluta, start, koniec, opcje));
    } catch (e) {
      if (!(e instanceof BladNBP && e.powod === 'brak')) throw e;
    }
  }
  return wynik;
}

// ---------- kurs ręczny ----------

/** Kurs wpisany ręcznie: „4,2563” albo „4.2563” → 4.2563; puste → null; niepoprawny lub ≤ 0 → NaN. */
export function parsujKurs(v) {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  if (typeof v === 'number') return v > 0 ? v : NaN;
  const s = String(v).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(s)) return NaN;
  const x = Number(s);
  return x > 0 ? x : NaN;
}

/**
 * Kurs ręczny zastępuje kurs z NBP (awaryjnie, gdy api.nbp.pl nie działa).
 * reczne = { EUR: { kurs: '4,4', data: '2026-10-08', tabela: '196/A/NBP/2026' } } – waluty bez kursu są pomijane.
 * Brak daty lub nr tabeli zgłasza kontrola() z obliczenia.js; niepoprawny kurs daje brak kursu.
 */
export function zastosujReczne(kursyNBP, reczne = {}) {
  const wynik = { ...kursyNBP };
  for (const [w, r] of Object.entries(reczne)) {
    const kurs = parsujKurs(r?.kurs);
    if (kurs === null) continue;
    if (Number.isNaN(kurs)) { delete wynik[w]; continue; }
    wynik[w] = { kurs, data: r.data ?? '', tabela: String(r.tabela ?? '').trim(), reczny: true };
  }
  return wynik;
}
