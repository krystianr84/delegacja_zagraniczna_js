// Zaokrąglenia zgodne z Excelem (ROUND, ROUNDUP).
// Excel liczy na wartości z 15 cyframi znaczącymi i zaokrągla połówki od zera, więc ROUND(1,005; 2) = 1,01,
// a zwykłe Math.round(1.005 * 100) / 100 daje 1 (1.005 * 100 = 100.49999999999999).

// Obcina szum binarny do 15 cyfr znaczących, jak Excel.
const do15 = (x) => Number(x.toPrecision(15));

// Przesuwa przecinek o n miejsc (n < 0 – w lewo) i obcina szum, np. 1.005 → 100.5 dla n = 2.
function skaluj(x, n) {
  return do15(n >= 0 ? x * 10 ** n : x / 10 ** -n);
}

function wroc(x, n) {
  return n >= 0 ? x / 10 ** n : x * 10 ** -n;
}

/** Excel ROUND(x; n): połówki od zera. */
export function round(x, n = 0) {
  if (!Number.isFinite(x)) return x;
  const s = skaluj(do15(Math.abs(x)), n);
  const c = Math.trunc(s);
  const wynik = wroc(s - c >= 0.5 ? c + 1 : c, n);
  return x < 0 && wynik !== 0 ? -wynik : wynik;
}

/** Excel ROUNDUP(x; n): zawsze od zera. */
export function roundUp(x, n = 0) {
  if (!Number.isFinite(x)) return x;
  const wynik = wroc(Math.ceil(skaluj(do15(Math.abs(x)), n)), n);
  return x < 0 && wynik !== 0 ? -wynik : wynik;
}
