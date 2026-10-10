// Druk Delegacji (polecenie wyjazdu + rachunek kosztów, 2 strony) i Raportu (1 strona) – jak arkusze
// „Delegacja” i „Raport” wersji excelowej (build.py): te same teksty, kropki w pustych polach i układ komórek.
// Czyste funkcje: dane wydruku i HTML jako tekst (bez DOM).

import { oblicz, obliczEtapy, wgWalut, kosztPLN, parsujKwote, minuty, czasTekst, slownie, slownieZlotych, KOSZTY } from './obliczenia.js';
import { round } from './round.js';
import * as fmt from './format.js';
import { TRYB_W_DNIU } from './nbp.js';

const pusta = (v) => v === undefined || v === null || String(v).trim() === '';
export const KROPKI = (n) => '. '.repeat(n);
const wartosc = (v, n) => (pusta(v) ? KROPKI(n) : String(v).trim());   // wartość albo kropki
const liczbaN = (v) => { const x = parsujKwote(v); return Number.isFinite(x) ? x : 0; };   // N() z Excela
const dzien = (s) => fmt.data(String(s ?? '').slice(0, 10));
const godzina = (s) => (/T(\d{2}:\d{2})/.exec(String(s ?? '')) ?? [, '00:00'])[1];

// ---------- dane: Delegacja ----------

function uwagaDelegacji(podroz, kontrola, kursy) {
  if (kontrola !== 'OK') return `UWAGA: ${kontrola}`;
  const e = podroz.etapy;
  const m = minuty;
  if (!pusta(podroz.wyjazdZMiejscowosci) && m(podroz.wyjazdZMiejscowosci) > m(e[0].wjazd)) {
    return 'UWAGA: wyjazd z miejscowości jest po przekroczeniu granicy';
  }
  if (!pusta(podroz.powrotDoMiejscowosci) && m(podroz.powrotDoMiejscowosci) < m(podroz.powrot)) {
    return 'UWAGA: powrót do miejscowości jest przed przekroczeniem granicy';
  }
  const koszty = [...e.map((x) => [x.koszt, x.waluta]), [podroz.powrotPrzejazd?.koszt, podroz.powrotPrzejazd?.waluta],
    ...KOSZTY.map(({ klucz }) => [podroz.koszty?.[klucz]?.kwota, podroz.koszty?.[klucz]?.waluta])];
  if (koszty.some(([k, w]) => kosztPLN(k, w, kursy)?.blad === 'kurs')) return 'UWAGA: brak kursu NBP dla waluty kosztu – sprawdź datę kursu';
  const zleGodziny = e.some((x, i) => {
    const nast = i + 1 < e.length && !pusta(e[i + 1].kraj) ? e[i + 1].wjazd : podroz.powrot;
    const od = pusta(x.przyjazd) ? x.wjazd : x.przyjazd;
    return (!pusta(x.przyjazd) && m(x.przyjazd) < m(x.wjazd))
      || (!pusta(x.wyjazd) && (m(x.wyjazd) < m(od) || m(x.wyjazd) > m(nast)));
  });
  if (zleGodziny) return 'UWAGA: godziny przyjazdu/wyjazdu z miejscowości nie zgadzają się z przekroczeniami granic – zobacz czerwone pola w formularzu';
  return '';
}

/** Wszystkie teksty druku Delegacji. kursy jak w obliczenia.js (z kursem ręcznym). */
export function daneDelegacji(podroz, kraje, kursy = {}) {
  const { kontrola } = oblicz(podroz, kraje, kursy);
  const e = podroz.etapy;
  const n = e.filter((x) => !pusta(x.kraj)).length;
  const dom = pusta(podroz.miejscowosc) ? 'Polska' : podroz.miejscowosc.trim();
  const miejsce = (x) => (pusta(x.miejscowosc) ? x.kraj : x.miejscowosc.trim());
  const start = pusta(podroz.wyjazdZMiejscowosci) ? e[0]?.wjazd : podroz.wyjazdZMiejscowosci;
  const koniec = pusta(podroz.powrotDoMiejscowosci) ? podroz.powrot : podroz.powrotDoMiejscowosci;
  const miejsca = [...new Set(e.filter((x) => !pusta(x.kraj)).map(miejsce))];

  const zal = liczbaN(podroz.zaliczka);
  const zalT = zal === 0 ? KROPKI(8) : fmt.kwota(zal);
  const zalS = zal === 0 ? KROPKI(30) : slownie(zal);

  // trasa: dom → miejscowość 1 → … → miejscowość n → dom (8 wierszy)
  const przyjazd = (x) => (pusta(x.przyjazd) ? x.wjazd : x.przyjazd);
  const wyjazd = (x, i) => (!pusta(x.wyjazd) ? x.wyjazd : i + 1 < e.length && !pusta(e[i + 1].kraj) ? e[i + 1].wjazd : podroz.powrot);
  const trasa = Array.from({ length: 8 }, (_, k) => {
    const i = k + 1;
    if (n === 0 || i > n + 1) return null;
    const wyjDt = i === 1 ? start : wyjazd(e[i - 2], i - 2);
    const przDt = i <= n ? przyjazd(e[i - 1]) : koniec;
    const przejazd = i <= n ? e[i - 1] : (podroz.powrotPrzejazd ?? {});
    const koszt = kosztPLN(przejazd.koszt, przejazd.waluta, kursy);
    return {
      skad: i === 1 ? dom : miejsce(e[i - 2]),
      wyjazdData: pusta(wyjDt) ? '' : dzien(wyjDt), wyjazdGodz: pusta(wyjDt) ? '' : godzina(wyjDt),
      dokad: i <= n ? miejsce(e[i - 1]) : dom,
      przyjazdData: pusta(przDt) ? '' : dzien(przDt), przyjazdGodz: pusta(przDt) ? '' : godzina(przDt),
      srodek: pusta(przejazd.srodek) ? (podroz.srodki ?? '').trim() : przejazd.srodek.trim(),
      koszt: koszt === null ? null : koszt.blad === 'kurs' ? 'brak kursu' : koszt.pln,
    };
  });

  // zestawienie kosztów – SUM jak w Excelu (tekst „brak kursu” pomijany)
  const poz = (klucz) => { const k = kosztPLN(podroz.koszty?.[klucz]?.kwota, podroz.koszty?.[klucz]?.waluta, kursy); return k === null ? null : k.blad === 'kurs' ? 'brak kursu' : k.pln; };
  const num = (v) => (typeof v === 'number' ? v : 0);
  const ryczalty = poz('ryczaltyDojazdy'), dojazdy = poz('dojazdy');
  const razem = round(trasa.reduce((s, t) => s + num(t?.koszt), 0) + num(ryczalty) + num(dojazdy), 2);
  const diety = round(obliczEtapy(podroz, kraje, kursy).reduce((s, x) => s + num(x.dietaPLN), 0), 2);
  const noclegi = poz('noclegi'), noclegiRyczalt = poz('noclegiRyczalt'), inne = poz('inne');
  const ogolem = round(razem + diety + num(noclegi) + num(noclegiRyczalt) + num(inne), 2);
  const dowody = liczbaN(podroz.dowody), termin = liczbaN(podroz.terminRozliczenia);

  return {
    uwaga: uwagaDelegacji(podroz, kontrola, kursy),
    nr: `SŁUŻBOWEGO Nr ${wartosc(podroz.nrPolecenia, 8)}`,
    zDnia: `z dnia ${pusta(podroz.dataPolecenia) ? KROPKI(14) : dzien(podroz.dataPolecenia)}`,
    dla: `dla ${wartosc(podroz.pracownik, 40)}`,
    stanowisko: wartosc(podroz.stanowisko, 44),
    doMiejsc: `do ${miejsca.length ? miejsca.join(', ') : KROPKI(40)}`,
    naCzas: `na czas od ${pusta(start) ? KROPKI(10) : dzien(start)} do ${pusta(koniec) ? KROPKI(10) : dzien(koniec)}`,
    wCelu: `w celu ${wartosc(podroz.cel, 40)}`,
    srodki: wartosc(podroz.srodki, 30),
    prosba: `Proszę o wypłacenie zaliczki w kwocie zł ${zalT} słownie zł ${zalS}`,
    naPokrycie: `na pokrycie wydatków zgodnie z poleceniem wyjazdu służbowego nr ${wartosc(podroz.nrPolecenia, 10)}`,
    trasa,
    zestawienie: { ryczalty, dojazdy, razem, diety, noclegi, noclegiRyczalt, inne },
    ogolem,
    ogolemSlownie: slownieZlotych(ogolem),
    zalaczam: `${dowody === 0 ? KROPKI(5) : dowody} dowodów`,
    pobrano: zal === 0 ? null : zal,
    doWyplaty: round(ogolem - zal, 2),
    oswiadczenie: `Zaliczkę w kwocie zł ${zalT}   słownie zł ${zalS}   otrzymałem i zobowiązuję się rozliczyć z niej w terminie `
      + `${termin === 0 ? '. . . .' : termin} dni po zakończeniu podróży, upoważniając równocześnie zakład pracy do potrącenia `
      + 'kwoty nierozliczonej zaliczki z najbliższej wypłaty wynagrodzenia.',
    delegowany: wartosc(podroz.pracownik, 24),
  };
}

// ---------- dane: Raport ----------

/** Kurs jak FIXED(k; IF(k<0,1; 6; 4); TRUE): 4,3171 / 4,4000 / 0,027345. */
export function kursRaportu(k) {
  return round(k, k < 0.1 ? 6 : 4).toFixed(k < 0.1 ? 6 : 4).replace('.', ',');
}

/** Wszystkie teksty druku Raportu. dzis = data sporządzenia „RRRR-MM-DD”. */
export function daneRaportu(podroz, kraje, kursy = {}, dzis = '') {
  const { kontrola } = oblicz(podroz, kraje, kursy);
  const e = podroz.etapy;
  const start = e[0]?.wjazd, koniec = podroz.powrot;
  const etapy = obliczEtapy(podroz, kraje, kursy);
  const waluty = wgWalut(etapy, kursy);
  const czas = pusta(start) || pusta(koniec) ? '' : czasTekst(minuty(koniec) - minuty(start));
  const dietaRazem = round(etapy.reduce((s, x) => s + (x.dietaPLN ?? 0), 0), 2);
  return {
    uwaga: kontrola === 'OK' ? '' : `UWAGA: ${kontrola}`,
    pracownik: (podroz.pracownik ?? '').trim(),
    cel: (podroz.cel ?? '').trim(),
    kraje: [...new Set(e.filter((x) => !pusta(x.kraj)).map((x) => x.kraj))].join(', '),
    start: pusta(start) ? '' : fmt.data(start),
    koniec: pusta(koniec) ? '' : fmt.data(koniec),
    czas,
    diety: etapy.map((x) => ({
      kraj: x.kraj, od: fmt.data(x.od), do: fmt.data(x.do),
      czas: czasTekst(round(x.godziny * 60, 0), true),
      stawka: fmt.kwota(x.stawka), liczba: fmt.liczba(x.liczbaDiet, 4),
      wysokosc: fmt.kwota(x.wysokoscDiet), potracenie: fmt.kwota(x.potracenie), nalezna: fmt.kwota(x.dietaWaluta),
      waluta: x.waluta,
    })),
    dietyWWalucie: waluty.map((w) => `${fmt.kwota(w.kwota, { zero: '0,00' })} ${w.waluta}`).join('; '),
    kurs: waluty.map((w) => {
      const k = kursy[w.waluta];
      const kurs = typeof k?.kurs === 'number' ? kursRaportu(k.kurs) : 'brak kursu';
      return `1 ${w.waluta} = ${kurs} PLN (tab. ${k?.tabela ?? ''} z ${k?.data ? dzien(k.data) : ''})`;
    }).join('; '),
    kosztCalkowity: `${fmt.kwota(dietaRazem, { zero: '0,00' })} PLN`,
    stopka: `Kurs NBP z ${podroz.trybKursu === TRYB_W_DNIU ? 'dnia ' : 'ostatniego dnia roboczego przed dniem '}`
      + `${pusta(podroz.dataKursu) ? '-' : dzien(podroz.dataKursu)}. Dieta liczona wg §13–14 rozporządzenia, osobno dla każdego kraju.`,
    dataSporzadzenia: `Data sporządzenia: ${dzien(dzis)}`,
  };
}

// ---------- renderer arkusza (kolumny, wiersze, scalenia, ramki) ----------

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const kol = (litera) => litera.charCodeAt(0) - 65;   // A → 0
function adres(a) {
  const m = /^([A-Z])(\d+)$/.exec(a);
  return { c: kol(m[1]), r: Number(m[2]) };
}
function zakres(z) {
  const [a, b = a] = z.split(':');
  const p = adres(a), k = adres(b);
  return { r0: p.r, c0: p.c, r1: k.r, c1: k.c };
}
// szerokość kolumny Excela (w znakach Arial 10) → piksele → mm
const pxKolumny = (w) => Math.trunc(w * 7 + 5);
const MM_NA_PX = 25.4 / 96;

/**
 * Arkusz jako HTML. Opis:
 *   kolumny: szerokości (znaki) od kolumny A, wysokosci: { nrWiersza: pt }, domyslna: wysokość pozostałych wierszy
 *   (openpyxl: 15 pt; w PDF z Excela przy skali 84% wychodzi ~14,3 pt – Excel zaokrągla wiersze do pikseli), skala,
 *   komorki: [[zakres, tekst, styl]] – styl: { f: pt, b, i, kolor, h, v, wrap, tlo, klasa },
 *   ramki: [[zakres, 'obwod' | 'siatka', css?]], linie: [[zakres, 'gora' | 'dol', css]],
 *   strony: [[od, do]] – zakresy wierszy; każda strona od nowej kartki.
 */
export function arkusz({ kolumny, wysokosci = {}, domyslna = 15, skala = 1, komorki, ramki = [], linie = [], strony, klasa = '' }) {
  const krawedz = new Map();   // `${r},${c},${bok}` → css
  const ustaw = (r, c, bok, css) => krawedz.set(`${r},${c},${bok}`, css);
  const cienka = `${(0.75 * skala).toFixed(2)}pt solid #000`;
  for (const [z, typ, css = cienka] of ramki) {
    const { r0, c0, r1, c1 } = zakres(z);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (typ === 'siatka' || r === r0) ustaw(r, c, 'top', css);
        if (typ === 'siatka' || r === r1) ustaw(r, c, 'bottom', css);
        if (typ === 'siatka' || c === c0) ustaw(r, c, 'left', css);
        if (typ === 'siatka' || c === c1) ustaw(r, c, 'right', css);
      }
    }
  }
  for (const [z, bok, css] of linie) {
    const { r0, c0, r1, c1 } = zakres(z);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) ustaw(r, c, bok === 'gora' ? 'top' : 'bottom', css);
  }
  const kotwice = new Map(), zakryte = new Set();
  for (const [z, tekst, styl = {}] of komorki) {
    const g = zakres(z);
    kotwice.set(`${g.r0},${g.c0}`, { ...g, tekst, styl });
    for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) if (r !== g.r0 || c !== g.c0) zakryte.add(`${r},${c}`);
  }
  const mm = kolumny.map((w) => pxKolumny(w) * MM_NA_PX * skala);
  const szer = mm.reduce((a, b) => a + b, 0);
  const colgroup = `<colgroup>${mm.map((w) => `<col style="width:${w.toFixed(2)}mm">`).join('')}</colgroup>`;

  const komorka = (r, c) => {
    const k = kotwice.get(`${r},${c}`) ?? { r0: r, c0: c, r1: r, c1: c, tekst: '', styl: {} };
    const s = k.styl;
    const bok = (b, rr, cc) => krawedz.get(`${rr},${cc},${b}`);
    const zbierz = (b) => {
      for (let rr = k.r0; rr <= k.r1; rr++) {
        for (let cc = k.c0; cc <= k.c1; cc++) {
          if ((b === 'top' && rr === k.r0) || (b === 'bottom' && rr === k.r1) || (b === 'left' && cc === k.c0) || (b === 'right' && cc === k.c1)) {
            const css = bok(b, rr, cc);
            if (css) return css;
          }
        }
      }
      return null;
    };
    const css = [];
    for (const b of ['top', 'bottom', 'left', 'right']) { const x = zbierz(b); if (x) css.push(`border-${b}:${x}`); }
    if (s.f) css.push(`font-size:${(s.f * skala).toFixed(2)}pt`);
    if (s.b) css.push('font-weight:700');
    if (s.i) css.push('font-style:italic');
    if (s.kolor) css.push(`color:${s.kolor}`);
    if (s.tlo) css.push(`background:${s.tlo}`);
    css.push(`text-align:${{ l: 'left', c: 'center', r: 'right' }[s.h ?? 'l']}`);
    css.push(`vertical-align:${{ t: 'top', c: 'middle', b: 'bottom' }[s.v ?? 'c']}`);
    if (s.wrap) css.push('white-space:pre-wrap');   // bez wrap: white-space: pre (CSS) – spacje jak w Excelu
    const span = (k.r1 > k.r0 ? ` rowspan="${k.r1 - k.r0 + 1}"` : '') + (k.c1 > k.c0 ? ` colspan="${k.c1 - k.c0 + 1}"` : '');
    const kl = s.klasa ? ` class="${s.klasa}"` : '';
    return `<td${span}${kl} style="${css.join(';')}">${esc(k.tekst)}</td>`;
  };

  return strony.map(([od, doW]) => {
    const wiersze = [];
    for (let r = od; r <= doW; r++) {
      const h = (wysokosci[r] ?? domyslna) * skala;
      let tds = '';
      for (let c = 0; c < kolumny.length; c++) if (!zakryte.has(`${r},${c}`)) tds += komorka(r, c);
      wiersze.push(`<tr style="height:${h.toFixed(2)}pt">${tds}</tr>`);
    }
    return `<div class="kartka ${klasa}"><table class="arkusz" style="width:${szer.toFixed(2)}mm;--skala:${skala}">`
      + `${colgroup}<tbody>${wiersze.join('')}</tbody></table></div>`;
  }).join('');
}

// ---------- układ: Delegacja (arkusz „Delegacja”, skala 84%) ----------

const F8 = { f: 8 }, F7 = { f: 7 };

export function delegacjaHTML(d) {
  const k = [];
  const t = (z, tekst, styl) => k.push([z, tekst, { f: 10, ...styl }]);
  const ramki = [];
  const r = (z, typ = 'obwod') => ramki.push([z, typ]);
  const h = {};
  const wys = (wiersze, pt) => { for (const w of wiersze) h[w] = pt; };

  // strona 1: polecenie wyjazdu
  t('B1:I1', d.uwaga, { f: 9, b: true, kolor: '#c00000' });
  t('F2:I2', 'STWIERDZENIE POBYTU SŁUŻBOWEGO', { f: 9, h: 'c' });
  r('F2:I2'); r('F3:I21');
  t('B5:E5', 'Pieczątka wysyłającego', { ...F7, h: 'c', v: 'b' });
  wys([2, 3, 4, 5], 24);
  t('B6:E6', 'POLECENIE WYJAZDU', { f: 15, b: true, h: 'c' });
  t('B7:E7', d.nr, { f: 15, b: true, h: 'c' });
  wys([6, 7], 26);
  t('B8:E8', d.zDnia, { h: 'c' });
  t('B10:E10', d.dla);
  t('B11:E11', '(imię i nazwisko)', { ...F7, h: 'c', v: 't' });
  t('B12:E12', d.stanowisko);
  t('B13:E13', '(stanowisko służbowe)', { ...F7, h: 'c', v: 't' });
  t('B14:E14', d.doMiejsc, { wrap: true });
  t('B15:E15', d.naCzas);
  t('B16:E16', d.wCelu, { wrap: true, v: 't' });
  wys([9], 10); wys([10, 12, 15], 22); wys([11, 13], 12); wys([14], 34); wys([16], 48);
  t('B17:E17', 'środki lokomocji', { v: 't' });
  t('B18:E18', d.srodki);
  wys([17, 18], 18);
  t('B20', KROPKI(7), { h: 'c', v: 'b' });
  t('C20:E20', KROPKI(12), { h: 'c', v: 'b' });
  t('B21', 'data', { ...F7, h: 'c', v: 't' });
  t('C21:E21', 'podpis wysyłającego', { ...F7, h: 'c', v: 't' });
  wys([19, 20], 20);
  r('B6:E16'); r('B17:E18'); r('B19:E21');
  const linie = [['A23:I23', 'dol', `${(0.75 * 0.84).toFixed(2)}pt dashed #000`]];
  t('B25:I25', d.prosba, { wrap: true });
  t('B26:I26', d.naPokrycie);
  wys([25], 30); wys([26], 20);
  t('H28:I28', KROPKI(12), { h: 'c', v: 'b' });
  t('H29:I29', 'Podpis delegowanego', { ...F7, h: 'c', v: 't' });
  t('B31:I31', `Zatwierdzono na zł ${KROPKI(8)} słownie zł ${KROPKI(40)}`);
  t('B32:I32', `do wypłaty z sum ${KROPKI(14)}`);
  wys([31, 32], 22);
  ['Część', 'Dział', 'Rozdział', '§', 'Poz.'].forEach((l, i) => t(`${'BCDEF'[i]}35`, l, { ...F8, h: 'c' }));
  r('B35:F36', 'siatka');
  t('G34:H34', 'Konto', { ...F8, h: 'c' });
  t('G35', 'Wn', { ...F8, h: 'c' });
  t('H35', 'Ma', { ...F8, h: 'c' });
  t('I34:I35', 'Nr dowodu', { ...F8, h: 'c' });
  r('G34:I36', 'siatka');
  wys([34, 35, 36], 16);
  t('F38', KROPKI(7), { h: 'c', v: 'b' });
  t('G38:I38', KROPKI(14), { h: 'c', v: 'b' });
  t('F39', 'data', { ...F7, h: 'c', v: 't' });
  t('G39:I39', 'podpisy sprawdzających', { ...F7, h: 'c', v: 't' });
  t('I40', 'str. 1', { ...F8, h: 'r' });

  // strona 2: rachunek kosztów podróży
  t('B41:I41', 'RACHUNEK KOSZTÓW PODRÓŻY', { f: 13, b: true, h: 'c' });
  wys([41], 30);
  t('B43:D43', 'W Y J A Z D', { ...F8, h: 'c' });
  t('E43:G43', 'P R Z Y J A Z D', { ...F8, h: 'c' });
  t('H43:H44', 'Środki lokomocji*)', { ...F8, h: 'c' });
  t('I43', 'Koszty przejazdu', { ...F8, h: 'c' });
  ['miejscowość', 'data', 'godz.', 'miejscowość', 'data', 'godz.', 'zł i gr'].forEach((l, i) => t(`${'BCDEFGI'[i]}44`, l, { ...F8, h: 'c' }));
  r('B43:I52', 'siatka');
  wys([45, 46, 47, 48, 49, 50, 51, 52], 17);
  d.trasa.forEach((w, i) => {
    if (!w) return;
    const row = 45 + i;
    const s = { ...F8, h: 'c', klasa: 'zmiesc' };
    [w.skad, w.wyjazdData, w.wyjazdGodz, w.dokad, w.przyjazdData, w.przyjazdGodz, w.srodek].forEach((v, j) => t(`${'BCDEFGH'[j]}${row}`, v, s));
    t(`I${row}`, typeof w.koszt === 'number' ? fmt.kwota(w.koszt) : w.koszt ?? '', s);
  });
  const z = d.zestawienie;
  const pozycje = [['Ryczałty za dojazdy', z.ryczalty], ['Dojazdy udokumentowane', z.dojazdy], ['Razem przejazdy, dojazdy', z.razem],
    ['Diety', z.diety], ['Noclegi wg rachunków', z.noclegi], ['Noclegi – ryczałt', z.noclegiRyczalt], ['Inne wydatki wg załączników', z.inne]];
  pozycje.forEach(([l, v], i) => {
    const row = 53 + i;
    t(`F${row}:H${row}`, l, F8);
    r(`F${row}:H${row}`);
    t(`I${row}`, typeof v === 'number' ? fmt.kwota(v) : v ?? '', { ...F8, h: 'r', b: i === 3 });
    r(`I${row}`);
  });
  wys([53, 54, 55, 56, 57, 58, 59], 15);
  t('B53:E54', 'Rachunek sprawdzono pod względem', { ...F8, h: 'c' });
  t('B55:C56', 'Merytorycznym', { ...F8, h: 'c' });
  t('D55:E56', 'Formalnym\ni rachunkowym', { ...F8, h: 'c', wrap: true });
  for (const [a, b] of [['B', 'C'], ['D', 'E']]) {
    t(`${a}58:${b}58`, `${KROPKI(5)}   ${KROPKI(6)}`, { ...F8, h: 'c', v: 'b' });
    t(`${a}59:${b}59`, 'Data            podpis', { ...F7, h: 'c', v: 't', klasa: 'spacje' });
    r(`${a}55:${b}56`); r(`${a}57:${b}59`);
  }
  r('B53:E54');
  t('F60:H60', 'Ogółem', { f: 9, b: true, h: 'r' });
  t('F61:H65', 'Słownie złotych:', { ...F8, v: 't' });
  t('I60', fmt.kwota(d.ogolem), { f: 10, b: true, h: 'r', v: 't' });
  t('I61:I65', d.ogolemSlownie, { f: 10, h: 'c', v: 't', wrap: true, klasa: 'zawijaj' });
  r('F60:H65'); r('I60:I65');
  t('B60:E60', `Zatwierdzono na zł ${KROPKI(10)}`, { ...F8, h: 'c' });
  t('B61:E61', `słownie ${KROPKI(32)}`, F8);
  t('B62:E62', KROPKI(40), F8);
  t('B64:E64', `${KROPKI(7)}        ${KROPKI(16)}`, { ...F8, h: 'c', v: 'b', klasa: 'spacje' });
  t('B65:E65', 'data                              podpisy zatwierdzających', { ...F7, h: 'c', v: 't', klasa: 'spacje' });
  r('B60:E65');
  wys([60, 61, 62, 63, 64, 65], 17);
  t('F66', 'Załączam', { ...F8, v: 't' });
  t('F67', d.zalaczam, { ...F7, h: 'c', v: 'b' });
  t('G66:H66', 'Pobrano zaliczkę', F8);
  t('G67:H67', 'Do wypłaty - zwrotu', F8);
  t('I66', d.pobrano === null ? '' : fmt.kwota(d.pobrano), { f: 9, h: 'r' });
  t('I67', fmt.kwota(d.doWyplaty), { f: 9, b: true, h: 'r' });
  r('G66:H66'); r('I66'); r('G67:H67'); r('I67'); r('F66:F67');
  t('F68:I68', 'Niniejszy rachunek przedkładam', { ...F8, v: 't' });
  t('F70:G70', KROPKI(10), { ...F8, h: 'c', v: 'b' });
  t('H70:I70', KROPKI(12), { ...F8, h: 'c', v: 'b' });
  t('F71:G71', 'data', { ...F7, h: 'c', v: 't' });
  t('H71:I71', 'podpis', { ...F7, h: 'c', v: 't' });
  r('F68:I71');
  t('B67:E67', `Kwituję odbiór zł ${KROPKI(12)}`, F8);
  t('B68:E68', `Słownie zł ${KROPKI(30)}`, F8);
  t('B69:E69', KROPKI(40), F8);
  t('B70:E70', `${KROPKI(8)}        ${KROPKI(14)}`, { ...F8, h: 'c', v: 'b', klasa: 'spacje' });
  t('B71:E71', 'data                              podpis', { ...F7, h: 'c', v: 't', klasa: 'spacje' });
  r('B66:E71');
  wys([66, 67, 68, 69, 70, 71], 17);
  t('B73:I74', d.oswiadczenie, { wrap: true, v: 't', klasa: 'spacje zawijaj' });
  wys([73, 74], 22);
  t('B76:D76', d.delegowany, { h: 'c', v: 'b' });
  t('G76:I76', KROPKI(22), { h: 'c', v: 'b' });
  t('B77:D77', 'imię i nazwisko delegowanego', { ...F7, h: 'c', v: 't' });
  t('G77:I77', 'data i podpis delegowanego', { ...F7, h: 'c', v: 't' });
  wys([76], 28);
  t('B79:I80', '*) Wymienić środek lokomocji, klasę, rodzaj biletu (bezpłatny, ulgowy, normalny). W podróżach przy użyciu '
    + 'własnych środków lokomocji (samochód, motocykl, motorower) podać również ilość km i stawkę za 1 km.', { ...F7, v: 't', wrap: true, klasa: 'zawijaj' });
  t('I82', 'str. 2', { ...F8, h: 'r' });

  return arkusz({
    kolumny: [1, 15, 11.5, 7.5, 15, 11.5, 7.5, 15, 14.5], wysokosci: h, domyslna: 14.3, skala: 0.84,
    komorki: k, ramki, linie, strony: [[1, 40], [41, 82]], klasa: 'delegacja',
  });
}

// ---------- układ: Raport (arkusz „Raport”, dopasowany do 1 strony) ----------

export function raportHTML(d) {
  const k = [];
  const t = (z, tekst, styl) => k.push([z, tekst, { f: 10, ...styl }]);
  const h = {};
  const linie = [];
  const szara = `${(0.75 * 0.74).toFixed(2)}pt solid #d9d9d9`;
  const sekcja = (w, tekst) => { t(`B${w}:K${w}`, tekst, { b: true, tlo: '#f2f2f2', h: 'c' }); h[w] = 22; };
  const kv = (w, etykieta, wart, duza = false) => {
    t(`B${w}:D${w}`, etykieta, { b: true, f: duza ? 11 : 10 });
    t(`E${w}:K${w}`, wart, { h: 'r', b: duza, f: duza ? 11 : 10 });
    linie.push([`B${w}:K${w}`, 'dol', szara]);
    h[w] = 20;
  };
  t('B2:K2', 'Rozliczenie diety z tytułu zagranicznej podróży służbowej', { f: 14, b: true });
  t('B3:K3', 'wg rozporządzenia MPiPS z 29.01.2013 (t.j. Dz.U. 2023 poz. 2190) · kursy średnie NBP (tabela A)', { f: 9, i: true, kolor: '#595959' });
  t('B4:K4', d.uwaga, { b: true, kolor: '#c00000' });
  sekcja(6, 'Dane podróży');
  kv(7, 'Pracownik:', d.pracownik);
  kv(8, 'Cel podróży:', d.cel);
  kv(9, 'Kraj docelowy:', d.kraje);
  kv(10, 'Data i godzina rozpoczęcia:', d.start);
  kv(11, 'Data i godzina zakończenia:', d.koniec);
  kv(12, 'Czas podróży:', d.czas);
  sekcja(14, 'Diety');
  ['Kraj', 'Od', 'Do', 'Czas pobytu', 'Dieta za dobę', 'Liczba diet', 'Wysokość diet', 'Potrącenie za posiłki', 'Należna dieta', 'Waluta']
    .forEach((l, i) => t(`${'BCDEFGHIJK'[i]}15`, l, { f: 8, b: true, h: 'c', wrap: true }));
  linie.push(['B15:K15', 'dol', `${(0.75 * 0.74).toFixed(2)}pt solid #808080`]);
  h[15] = 30;
  for (let i = 0; i < 5; i++) {
    const w = 16 + i;
    const x = d.diety[i];
    if (x) {
      [x.kraj, x.od, x.do, x.czas, x.stawka, x.liczba, x.wysokosc, x.potracenie, x.nalezna, x.waluta]
        .forEach((v, j) => t(`${'BCDEFGHIJK'[j]}${w}`, v, { f: 9, h: j === 0 ? 'l' : 'c', b: j === 8 }));
    }
    linie.push([`B${w}:K${w}`, 'dol', szara]);
    h[w] = 18;
  }
  sekcja(22, 'Koszty podróży');
  kv(23, 'Należne diety w walucie:', d.dietyWWalucie);
  kv(24, 'Kurs średni NBP:', d.kurs);
  kv(25, 'Koszt całkowity w PLN:', d.kosztCalkowity, true);
  t('B28:K28', d.stopka, { f: 8, i: true, kolor: '#7f7f7f' });
  t('B29:K29', d.dataSporzadzenia, { f: 8, i: true, kolor: '#7f7f7f' });
  return arkusz({
    kolumny: [2, 18, 15.5, 15.5, 19, 9, 8.5, 10.5, 10.5, 10.5, 7], wysokosci: h, skala: 0.74,
    komorki: k, linie, strony: [[1, 29]], klasa: 'raport',
  });
}
