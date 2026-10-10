# Wzorce druku z wersji excelowej

PDF-y wyeksportowane z arkuszy **Delegacja** i **Raport** wersji excelowej 2.5
(`wydanie/Kalkulator_delegacji_zagranicznej.xlsx`, 11.10.2026, kursy NBP z api.nbp.pl). Dane są fikcyjne
(przykład z `build.py`, „Jan Kowalski”).

| Plik | Dane |
|---|---|
| `excel-Delegacja-A.pdf`, `excel-Raport-A.pdf` | przycisk **Wczytaj przykład**: dieta 930,46, ogółem 2 570,96 |
| `excel-Delegacja-B.pdf` | przykład + przejazdy (250 PLN; pociąg 30 EUR; powrót 200 PLN), zaliczka 500, termin 14 dni, 3 dowody: ogółem 3 150,47, do wypłaty 2 650,47 |

Teksty z tych PDF-ów są wpisane w `test/druk.test.js` (porównanie co do znaku). Układ porównuje się ręcznie:

1. Wydrukuj ten sam wariant ze strony do PDF (Chrome: **Drukuj delegację** → *Zapisz jako PDF*, albo
   `Page.printToPDF` z `preferCSSPageSize: true`, jak w `narzedzia/sprawdz-przegladarke.mjs`).
2. `python test/wzorce/porownaj.py test/wzorce/excel-Delegacja-B.pdf delegacja.pdf` (Pillow + Poppler).
3. Linie ramek i obrys zawartości powinny się zgadzać z dokładnością do ~2 pt (11.10.2026: strona 2 Delegacji
   do 0,5 pt u góry i ~2 pt na dole, Raport ~2 pt).

**Wysokość wierszy.** Wiersze bez ustawionej wysokości mają w openpyxl 15 pt (domyślny styl Calibri 11).
Przy skali 84% (Delegacja) Excel zaokrągla wysokości wierszy do pełnych pikseli i domyślny wiersz wychodzi
na wydruku ok. 12 pt, czyli 14,3 pt przed skalowaniem – stąd `domyslna: 14.3` w `delegacjaHTML()`
(`web/lib/druk.js`). Raport (skala 74%, dopasowanie do strony) zgadza się z 15 pt. Wartość 14,3 jest
dobrana pomiarem tym skryptem, nie wyliczona.

**Nowe wzorce** (np. po zmianie układu w wersji excelowej): `test/wzorce/eksport-z-excela.ps1`
(Excel na Windows, plik otwierany tylko do odczytu). Po eksporcie sprawdź metadane PDF-ów (`pdfinfo`) –
nie powinny zawierać autora.
