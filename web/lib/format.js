// Formatowanie liczb i dat jak w polskim Excelu (formaty z build.py). Czyste funkcje.

import { round } from './round.js';

const NBSP = ' ';   // separator tysięcy w polskim Excelu (nie łamie się w środku kwoty)

function grupuj(calkowite) {
  return calkowite.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
}

/** Format M2: „#,##0.00;-#,##0.00;"-"” → „2 570,96”, zero → „-”, puste → „”. */
export function kwota(x, { zero = '-' } = {}) {
  if (x === null || x === undefined || x === '' || !Number.isFinite(Number(x))) return '';
  const r = round(Number(x), 2);
  if (r === 0) return zero;
  const [c, u] = Math.abs(r).toFixed(2).split('.');
  return (r < 0 ? '-' : '') + grupuj(c) + ',' + u;
}

/** Kwota z „zł”, jak na kafelkach: „930,46 zł”. */
export function zl(x) {
  const k = kwota(x, { zero: '0,00' });
  return k === '' ? '' : `${k}${NBSP}zł`;
}

/** Format kursu „0.0000##”: 4–6 miejsc po przecinku → „4,3789”, „0,027345”. */
export function kurs(x) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '';
  // 6 miejsc, potem usuń zera końcowe ponad 4 miejsca
  return round(x, 6).toFixed(6).replace(/(\.\d{4}\d*?)0+$/, '$1').replace('.', ',');
}

/** Liczba z ułamkiem (np. liczba diet 2,3333, czas 51,50) – stała liczba miejsc, bez grupowania. */
export function liczba(x, miejsca = 2) {
  if (x === null || x === undefined || !Number.isFinite(x)) return '';
  return round(x, miejsca).toFixed(miejsca).replace('.', ',');
}

/** „2026-09-14T10:30” → „14.09.2026 10:30”, „2026-09-14” → „14.09.2026”; inne bez zmian. */
export function data(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(String(s ?? ''));
  if (!m) return s ?? '';
  return `${m[3]}.${m[2]}.${m[1]}` + (m[4] ? ` ${m[4]}:${m[5]}` : '');
}
