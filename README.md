# Kalkulator diety zagranicznej

Kalkulator diety z tytułu zagranicznej podróży służbowej wg rozporządzenia MPiPS z 29.01.2013
(t.j. Dz.U. 2023 poz. 2190) z kursem średnim NBP oraz druk delegacji i raportu. Zwykła strona
HTML/JS – działa w przeglądarce, także na telefonie, bez Excela i bez instalacji.

**Strona:** https://krystianr84.github.io/delegacja_zagraniczna_js/

Wyniki są takie same jak w wersji excelowej, łącznie z zaokrągleniami – wydruki z obu wersji
zgadzają się co do grosza.

## Co liczy

- **Dietę zagraniczną** (§12–§14) osobno dla każdego kraju (do 5 etapów): pełne doby + niepełna doba
  (do 8 h – 1/3, 8–12 h – 1/2, ponad 12 h – cała dieta), minus zapewnione posiłki
  (śniadanie 15%, obiad i kolacja po 30% diety dziennej).
- **Kurs średni NBP** (tabela A) pobierany automatycznie z `api.nbp.pl` – z dnia daty kursu albo
  z ostatniego dnia roboczego przed nią. Gdy kurs się nie pobiera (np. sieć firmowa blokuje
  `api.nbp.pl`), można wpisać kurs ręcznie z datą notowania i numerem tabeli.
- **Przejazdy, ryczałty, noclegi i inne wydatki** – wpisywane kwotami (waluta obca po kursie NBP)
  wyłącznie na potrzeby rachunku kosztów w delegacji. Kalkulator ich nie wylicza.

Poza zakresem: dieta krajowa, kilometrówka, automatyczne liczenie ryczałtów.

## Jak używać

1. Sekcja 1 – dane podróży i **data kursu NBP** (dzień wypłaty zaliczki / rozliczenia).
2. Sekcja 2 – każdy kraj to osobny etap: kraj i chwila **przekroczenia granicy** (samolot: start
   z ostatniego lotniska w kraju), zapewnione posiłki; na końcu **powrót przez granicę**
   (samolot: lądowanie). Miejscowości, godziny i koszty przejazdu są tylko do druku delegacji.
3. Wynik jest na górze strony: dieta do wypłaty, wydatki i ogółem. Pole „Kontrola danych”
   podpowiada, co poprawić (błędne pola są czerwone).
4. Sekcja 6 – **Drukuj delegację** (polecenie wyjazdu + rachunek kosztów, 2 strony A4) albo
   **Drukuj raport** (rozliczenie diety, 1 strona). W oknie drukowania można wybrać „Zapisz jako PDF”;
   wyłącz nagłówki i stopki przeglądarki.

### Gdzie są dane

- Wszystko zostaje **w tej przeglądarce** – formularz zapisuje się sam i wraca po ponownym otwarciu
  strony. Strona nie wysyła żadnych danych; jedyne zapytania to kursy walut do `api.nbp.pl`.
- **Zapisz plik .json** zapisuje podróż do pliku (np. `delegacja_1-2026_Jan_Kowalski_2026-09-14.json`),
  który można przenieść na inne urządzenie i otworzyć przyciskiem **Wczytaj plik .json**.
- Tryb prywatny przeglądarki lub zablokowane dane witryny wyłączają autozapis – wtedy używaj pliku.

## Dla programistów

Bez frameworka, bez zależności i bez kroku budowania: HTML, CSS i moduły ES.

```
web/
  index.html, app.js, style.css   formularz i widok (app.js tylko łączy pola z web/lib/)
  lib/round.js       ROUND / ROUNDUP zgodne z Excelem (15 cyfr znaczących, połówki od zera)
  lib/obliczenia.js  dieta, kontrola danych, koszty w PLN, kwota słownie
  lib/nbp.js         kursy NBP: zapytanie, 404/400, cache w localStorage, kurs ręczny
  lib/druk.js        Delegacja i Raport (teksty jak formuły arkuszy + układ komórek)
  lib/zapis.js       plik .json i autozapis
  lib/format.js, lib/model.js
dane/kraje.json      120 państw: [nazwa, waluta, dieta, limit noclegu] z załącznika do rozporządzenia
test/                testy (node --test)
narzedzia/serwer.js  podgląd lokalny
```

```sh
npm test                 # albo: node --test   (Node 20+)
NBP_LIVE=1 node --test   # dodatkowo test na żywym api.nbp.pl
npm start                # albo: node narzedzia/serwer.js → http://localhost:8080/web/
```

Moduły ES nie działają z `file://`, więc do podglądu potrzebny jest serwer (wystarczy dowolny
serwer plików statycznych uruchomiony w katalogu głównym repozytorium).

### Zgodność z wersją excelową

Kolejność zaokrągleń dla każdego etapu: czas w minutach zaokrąglony do pełnej minuty → liczba diet
→ potrącenie za posiłki `ROUND(…; 2)` → dieta w walucie `MAX(0; ROUND(…; 2))` → dieta w PLN
`ROUND(dieta × kurs; 2)` osobno dla etapu; dieta razem to suma kwot etapów. Przypadki testowe pochodzą
z testów wersji excelowej, a druk porównano z PDF-em wyeksportowanym z arkusza (te same teksty
i kwoty, układ w granicach ~2 mm).

Przypadek kontrolny: Węgry, wjazd 28.09.2026 12:00, powrót 02.10.2026 16:00, bez posiłków, kurs
z dnia 08.10.2026 (4,3789, tabela 196/A/NBP/2026) → 4 dni 4 godz. 0 min, 190,67 EUR, **834,92 zł**.

### Publikacja

GitHub Pages z gałęzi `main`, katalog główny (`/`). `index.html` w katalogu głównym przekierowuje
na `web/`; strona czyta `../dane/kraje.json`.

### Aktualizacja stawek

Stawki diet i limity noclegów są w `dane/kraje.json`; procenty za posiłki w `POTRACENIA`
(`web/lib/obliczenia.js`). Po zmianie uruchom testy.

## Licencja

[MIT](LICENSE)
