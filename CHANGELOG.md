# Historia zmian

Numer wersji jest widoczny w nagłówku i w stopce strony kalkulatora oraz w zapisanym pliku `.json` podróży. Strona zawsze działa w najnowszej wersji – poprzednich nie trzeba pobierać ani instalować.

## 1.2 (11.10.2026)

**Dodano**
- **Stawki diet z datą obowiązywania** (`dane/stawki.json`). Podróż liczy się stawkami z dnia jej rozpoczęcia (wyjazd z miejscowości, a gdy pusty – wjazd do pierwszego kraju) – po zmianie przepisów wczytana stara podróż da te same kwoty co wcześniej. Nad tabelą w sekcji 3 widać, który zestaw stawek został użyty, a przy podróży sprzed najstarszego zestawu – ostrzeżenie.
- Instrukcja dodawania nowych stawek w README; testy wyboru zestawu (także w przeglądarce, z testowym zestawem od 01.01.2027).

**Bez zmian**
- Obecne stawki (od 29.11.2022) i wszystkie wyniki – wydruki nadal zgodne z wersją excelową.

## 1.1 (11.10.2026)

**Dodano**
- **Testy w GitHub Actions** przy każdej zmianie: obliczenia (`node --test`) i strona w Chrome. Raz w tygodniu dodatkowo test na żywym api.nbp.pl, który wykrywa zmiany w zachowaniu API.
- **Testy strony w przeglądarce** (`npm run test:przegladarka`): przykład i przypadek kontrolny, błędy w danych, druk Delegacji i Raportu do PDF, autozapis, zapis i import pliku, brak sieci i kurs ręczny, widok telefonu.
- **Formularze zgłoszeń** na GitHubie: błąd w wyliczeniu, strona nie działa, propozycja zmiany.
- Numer wersji w nagłówku i stopce strony oraz w pliku `.json` podróży; ta historia zmian.

**Zmieniono**
- **Druk bez nagłówków przeglądarki:** Chrome i Edge nie dopisują już daty, tytułu ani adresu strony na Delegacji i Raporcie – nie trzeba wyłączać „Nagłówków i stopek” w oknie drukowania. Położenie elementów na kartce bez zmian.
- **Pusty etap jest zwinięty** do wyboru kraju – na telefonie formularz jest krótszy. Po wybraniu kraju pojawiają się pozostałe pola.
- Kurs „z przyszłości” i zapamiętywanie kursów liczone według daty w Warszawie (dzień NBP), a nie zegara urządzenia.

## 1.0 (11.10.2026)

Pierwsza wersja w przeglądarce, odpowiednik [wersji excelowej 2.5](https://github.com/krystianr84/delegacja_zagraniczna_plus) – te same reguły i zaokrąglenia, wydruki zgodne co do grosza.

**Dodano**
- Dieta zagraniczna wg §12–§14 rozporządzenia, do 5 krajów w podróży, potrącenia za posiłki; zaokrąglenia jak `ROUND` w Excelu.
- Kursy średnie NBP (tabela A) pobierane z api.nbp.pl, z dnia daty kursu albo z dnia poprzedniego; kurs ręczny, gdy kurs się nie pobiera.
- Formularz z kontrolą danych (te same komunikaty co w Excelu), czerwonym podświetleniem błędnych pól i kafelkami wyniku; działa na telefonie.
- Przejazdy, ryczałty, noclegi i inne wydatki wpisywane kwotami (waluta obca po kursie NBP) do rachunku kosztów.
- Druk Delegacji (polecenie wyjazdu + rachunek kosztów, 2 strony A4) i Raportu (1 strona) – porównany z PDF-em z wersji excelowej; podgląd wydruku na ekranie.
- Autozapis w przeglądarce oraz zapis i wczytanie podróży z pliku `.json`.
- Publikacja na GitHub Pages, README ze zrzutami ekranu.
