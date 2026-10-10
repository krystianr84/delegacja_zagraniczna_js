# CLAUDE.md

Wskazówki dla Claude Code przy pracy w tym repozytorium.

## Cel projektu

Kalkulator diety zagranicznej dla serwisantów jako **statyczna strona HTML/JS** (GitHub Pages), działająca bez Excela, także na telefonie. Liczona jest tylko dieta zagraniczna. Przejazdy, ryczałty, noclegi, inne wydatki i zaliczka są wpisywane kwotami (z przeliczeniem waluty po kursie NBP) wyłącznie na potrzeby druku delegacji. Dieta krajowa, kilometrówka i automatyczne liczenie ryczałtów – poza zakresem.

To nowy, niezależny projekt. Wzorcem merytorycznym jest wcześniejsza wersja excelowa w `C:\MOJE\Projekt_delegacje` (tylko do odczytu – nie zmieniaj tam niczego). Reguły są w formułach w `build/build.py`, przypadki testowe w `build/test.ps1`, a układ druku w lokalnym `DELEGACJA.pdf` (poza repozytorium).

## Założenia techniczne

- Zwykły HTML, CSS i moduły ES, **bez frameworka i bez kroku budowania** (bez npm-owych zależności w czasie działania).
- Logika to czyste funkcje w `web/lib/` bez dostępu do DOM. Testy przez `node --test` (wbudowany runner, bez bibliotek).
- Kursy NBP: `fetch` z `https://api.nbp.pl/api/exchangerates/rates/A/{waluta}/{od}/{do}/?format=json`. API zwraca `Access-Control-Allow-Origin: *` (sprawdzone 10.10.2026). Nie dodawaj własnych nagłówków do zapytania, bo wymuszą preflight OPTIONS, a ten zwraca 404. Cache w `localStorage` i kurs ręczny jako tryb awaryjny.
- Druk Delegacji (2 strony) i Raportu (1 strona) przez widok druku + `window.print()` („Zapisz jako PDF”), CSS `@page A4`.
- Dane zostają w przeglądarce: autozapis w `localStorage` (każdy odczyt i zapis w try/catch) oraz eksport i import pliku `.json` podróży. Strona nic nie wysyła poza zapytaniami o kurs do NBP.
- `dane/kraje.json` – 120 państw `[nazwa, waluta, dieta, limit_noclegu]` z załącznika do rozporządzenia MPiPS z 29.01.2013 (t.j. Dz.U. 2023 poz. 2190), skopiowane z wersji excelowej.

## Reguły merytoryczne

- Czas (§12): od przekroczenia granicy (samolot: start) do powrotu przez granicę (lądowanie). Etap kończy się wjazdem do kolejnego kraju.
- Dieta (§13): liczona osobno dla każdego etapu. Pełne doby + reszta: ≤8 h → 1/3, ≤12 h → 1/2, >12 h → 1.
- Posiłki (§14): −15% / −30% / −30% diety dziennej za każdy posiłek; dieta nie spada poniżej 0.
- Kurs „z dnia X” = zakres X−14…X i ostatnie notowanie (weekendy i święta → 404). Jedno zapytanie obejmuje maksymalnie 93 dni.
- Kwota słownie z odmianą złoty/złote/złotych.

## Zgodność z Excelem (decyzja właściciela, 10.10.2026)

Wyniki mają być **identyczne jak w wersji excelowej, łącznie z zaokrągleniami** – wydruki z obu wersji muszą się zgadzać co do grosza. Kolejność zaokrągleń z `build.py` (sekcja 3, wiersz w wiersz dla każdego etapu):

1. Czas etapu w godzinach = `round((koniec − początek) w minutach) / 60`, nie mniej niż 0.
2. Liczba diet = pełne doby + ułamek za resztę (reszta = 0 → nic).
3. Potrącenie za posiłki = `round(dieta_dzienna × (śn×0,15 + ob×0,30 + kol×0,30), 2)`.
4. Dieta w walucie = `max(0, round(dieta_dzienna × liczba_diet − potrącenie, 2))`.
5. Dieta w PLN = `round(dieta_w_walucie × kurs, 2)` **osobno dla każdego etapu**.
6. Dieta razem (PLN) = suma etapowych kwot PLN z pkt 5 (nie suma z tabeli „według walut”, gdzie zaokrągla się sumę w walucie – te kwoty mogą się różnić o grosz; liczy się suma etapów).

`ROUND` w Excelu zaokrągla połówki od zera i działa na wartości z 15 cyframi znaczącymi. Zwykłe `Math.round(x*100)/100` w JS daje inne wyniki dla przypadków typu 1,005 – napisz własną funkcję `round(x, n)` zgodną z Excelem (np. przez `Number(x.toPrecision(15))` przed skalowaniem, połówki od zera) i pokryj ją testami.

Przypadek kontrolny: Węgry, wjazd 28.09.2026 12:00, powrót 02.10.2026 16:00, bez posiłków, kurs w dniu daty kursu 08.10.2026 → „4 dni 4 godz. 0 min”, 190,67 EUR, 834,92 PLN (kurs 4,3789, tabela 196/A/NBP/2026).

## Plan prac

1. `web/lib/obliczenia.js` + testy (przypadki z `test.ps1` i przypadek kontrolny).
2. `web/lib/nbp.js` – pobieranie kursu, obsługa 404, kurs ręczny.
3. Formularz i wynik (sekcje 1–5 i kafelki jak w Kalkulatorze).
4. Druk Delegacji i Raportu, porównany z eksportem PDF z wersji excelowej.
5. Zapis i import, GitHub Pages, README.
