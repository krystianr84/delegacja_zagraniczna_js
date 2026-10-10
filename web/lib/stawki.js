// Zestawy stawek diet z datą obowiązywania (dane/stawki.json + pliki krajów w formacie dane/kraje.json).
// Podróż liczy się jednym zestawem – obowiązującym w dniu jej rozpoczęcia – żeby po zmianie stawek wczytana
// stara podróż dawała te same kwoty co wtedy (przepisy przejściowe zwykle każą stosować dotychczasowe stawki
// do podróży rozpoczętych przed zmianą). Czyste funkcje.

const DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Indeks + zawartość plików krajów → zestawy posortowane rosnąco po dacie „od”.
 * pliki: { 'kraje.json': [[nazwa, waluta, dieta, limit], …] }. Rzuca Error przy niepoprawnych danych.
 */
export function zestawyStawek(indeks, pliki) {
  const lista = indeks?.zestawy;
  if (!Array.isArray(lista) || !lista.length) throw new Error('stawki.json: brak zestawów stawek');
  const zestawy = lista.map((z) => {
    if (!DATA.test(z?.od ?? '')) throw new Error(`stawki.json: niepoprawna data „od”: ${z?.od}`);
    const kraje = pliki[z.plik];
    if (!Array.isArray(kraje) || !kraje.length) throw new Error(`stawki.json: brak pliku krajów ${z.plik}`);
    for (const k of kraje) {
      const ok = Array.isArray(k) && typeof k[0] === 'string' && /^[A-Z]{3}$/.test(k[1]) && k[2] > 0 && k[3] > 0;
      if (!ok) throw new Error(`${z.plik}: niepoprawny wpis ${JSON.stringify(k)}`);
    }
    return { od: z.od, podstawa: String(z.podstawa ?? ''), plik: z.plik, kraje };
  }).sort((a, b) => a.od.localeCompare(b.od));
  for (let i = 1; i < zestawy.length; i++) {
    if (zestawy[i].od === zestawy[i - 1].od) throw new Error(`stawki.json: dwa zestawy od ${zestawy[i].od}`);
  }
  return zestawy;
}

/** Dzień rozpoczęcia podróży „RRRR-MM-DD”: wyjazd z miejscowości, a gdy pusty – wjazd w etapie 1; brak → ''. */
export function dataPodrozy(podroz) {
  for (const v of [podroz?.wyjazdZMiejscowosci, podroz?.etapy?.[0]?.wjazd]) {
    const d = String(v ?? '').trim().slice(0, 10);
    if (DATA.test(d) && !Number.isNaN(Date.parse(d))) return d;
  }
  return '';
}

/**
 * Zestaw na dzień: ostatni z „od” ≤ data. Bez daty – najnowszy (formularz w trakcie wypełniania).
 * Data sprzed pierwszego zestawu – pierwszy, z flagą przedPierwszym (kalkulator nie ma starszych stawek).
 */
export function zestawNaDzien(zestawy, data) {
  if (!data) return { zestaw: zestawy.at(-1), przedPierwszym: false };
  const pasujace = zestawy.filter((z) => z.od <= data);
  return pasujace.length
    ? { zestaw: pasujace.at(-1), przedPierwszym: false }
    : { zestaw: zestawy[0], przedPierwszym: true };
}

/** Nazwy krajów ze wszystkich zestawów (lista w formularzu): kolejność najnowszego, potem brakujące ze starszych. */
export function nazwyKrajow(zestawy) {
  const nazwy = [];
  for (const z of [...zestawy].reverse()) for (const [n] of z.kraje) if (!nazwy.includes(n)) nazwy.push(n);
  const najnowsze = zestawy.at(-1).kraje.length;
  return [...nazwy.slice(0, najnowsze), ...nazwy.slice(najnowsze).sort((a, b) => a.localeCompare(b, 'pl'))];
}
