// Formularz Kalkulatora: stan → obliczenia (web/lib) → wynik na stronie. Cała logika liczenia jest w web/lib.

import { oblicz, obliczEtapy, obliczKoszty, wgWalut, walutyWUzyciu, polaZBledem, KOSZTY } from './lib/obliczenia.js';
import { pobierzKurs, zastosujReczne, dzienSzukany, dzisiaj, BladNBP } from './lib/nbp.js';
import { daneDelegacji, daneRaportu, delegacjaHTML, raportHTML } from './lib/druk.js';
import { pustyStan, przykladowyStan, pobierz, ustaw, widoczneEtapy, ETAPY, WALUTY_KOSZTOW } from './lib/model.js';
import * as fmt from './lib/format.js';

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

let kraje = [];
let mapaKrajow = new Map();
let stan = pustyStan();

// magazyn na cache kursów – sam dostęp do localStorage potrafi rzucić wyjątek (zablokowane dane witryny)
let magazyn = null;
try { magazyn = window.localStorage; } catch { magazyn = null; }

// ---------- budowa formularza ----------

function opcje(select, wartosci, pusta = null) {
  select.replaceChildren(
    ...(pusta === null ? [] : [new Option(pusta, '')]),
    ...wartosci.map((w) => new Option(w, w)),
  );
}

function zbudujFormularz() {
  const szablon = $('#szablon-etapu');
  const kontener = $('#etapy');
  for (let i = 0; i < ETAPY; i++) {
    const el = szablon.content.firstElementChild.cloneNode(true);
    el.dataset.etap = i;
    $('[data-nr]', el).textContent = i + 1;
    for (const x of $$('[data-pole], [data-wynik]', el)) {
      for (const a of ['pole', 'wynik']) if (x.dataset[a]) x.dataset[a] = x.dataset[a].replace('#', i);
    }
    $('[data-podpowiedz-wjazd]', el).textContent = i === 0
      ? 'Podróż lądowa: chwila przekroczenia granicy. Samolot: start z ostatniego lotniska w kraju (§12).'
      : 'Wjazd do tego kraju z poprzedniego (koniec poprzedniego etapu).';
    kontener.append(el);
  }
  for (const s of $$('[data-kraje]')) opcje(s, kraje.map((k) => k[0]), '– wybierz kraj –');
  for (const s of $$('[data-waluty]')) opcje(s, WALUTY_KOSZTOW);

  const tbody = $('#koszty tbody');
  for (const { klucz, nazwa, uwaga } of KOSZTY) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<th scope="row"></th>
      <td><input data-pole="koszty.${klucz}.kwota" inputmode="decimal" class="kwota"></td>
      <td><select data-pole="koszty.${klucz}.waluta" data-waluty></select></td>
      <td data-wynik="koszty.${klucz}.kurs"></td>
      <td data-wynik="koszty.${klucz}.pln"></td>`;
    $('th', tr).textContent = nazwa;
    if (uwaga) $('th', tr).title = uwaga;
    for (const x of $$('input, select', tr)) x.setAttribute('aria-label', nazwa);
    opcje($('select', tr), WALUTY_KOSZTOW);
    tbody.append(tr);
  }
}

/** Wpisuje stan do wszystkich pól (po wczytaniu przykładu / wyczyszczeniu). */
function wypelnijPola() {
  for (const el of $$('[data-pole]')) {
    const v = pobierz(stan, el.dataset.pole);
    el.value = v ?? '';
    if (el.tagName === 'SELECT' && el.value !== String(v ?? '')) el.value = el.options[0]?.value ?? '';
  }
  ostatnieWalutyKursow = null;   // przebuduj tabelę kursów (pola kursu ręcznego)
}

// ---------- kursy NBP ----------

// klucz `${waluta}:${dzień}` → { stan: 'trwa' | 'ok' | 'blad', kurs?, blad? }
const kursyNBP = new Map();
let timerKursow = null;

function dzienKursu() {
  try {
    return stan.dataKursu ? dzienSzukany(stan.dataKursu, stan.trybKursu) : null;
  } catch {
    return null;
  }
}

function zaplanujPobieranie() {
  clearTimeout(timerKursow);
  timerKursow = setTimeout(pobierzBrakujace, 300);
}

function pobierzBrakujace() {
  const dzien = dzienKursu();
  if (!dzien) return;
  for (const w of walutyWUzyciu(stan, mapaKrajow)) {
    const klucz = `${w}:${dzien}`;
    if (kursyNBP.has(klucz)) continue;
    kursyNBP.set(klucz, { stan: 'trwa' });
    pobierzKurs(w, dzien, { magazyn })
      .then((kurs) => kursyNBP.set(klucz, { stan: 'ok', kurs }))
      .catch((blad) => kursyNBP.set(klucz, { stan: 'blad', blad }))
      .finally(przelicz);
  }
}

/** Kursy do obliczeń: z NBP dla bieżącego dnia + kurs ręczny (tylko dla walut w użyciu). */
function aktualneKursy(waluty) {
  const dzien = dzienKursu();
  const nbp = {};
  for (const w of waluty) {
    const k = dzien && kursyNBP.get(`${w}:${dzien}`);
    if (k?.stan === 'ok') nbp[w] = k.kurs;
  }
  const reczne = Object.fromEntries(waluty.filter((w) => stan.kursyReczne[w]).map((w) => [w, stan.kursyReczne[w]]));
  return { kursy: zastosujReczne(nbp, reczne), reczne };
}

let ostatnieWalutyKursow = null;

function pokazKursy(waluty, kursy) {
  const dzien = dzienKursu();
  $('#kursy-opis').textContent = dzien
    ? `Szukany kurs: ostatni opublikowany do dnia ${fmt.data(dzien)} (${stan.trybKursu}, data kursu ${fmt.data(stan.dataKursu)}).`
    : 'Wpisz datę kursu NBP w sekcji 1.';
  const tbody = $('#kursy tbody');
  const klucz = waluty.join(',');
  if (klucz !== ostatnieWalutyKursow) {
    ostatnieWalutyKursow = klucz;
    tbody.replaceChildren(...waluty.map((w) => {
      const tr = document.createElement('tr');
      tr.dataset.waluta = w;
      tr.innerHTML = `<th scope="row">${w}</th><td data-k="kurs"></td><td data-k="data"></td><td data-k="tabela"></td><td data-k="zrodlo"></td>
        <td class="reczny"><input data-pole="kursyReczne.${w}.kurs" inputmode="decimal" class="kwota" aria-label="Kurs ręczny ${w}"></td>
        <td class="reczny"><input type="date" data-pole="kursyReczne.${w}.data" aria-label="Data notowania ${w}"></td>
        <td class="reczny"><input data-pole="kursyReczne.${w}.tabela" placeholder="np. 196/A/NBP/2026" aria-label="Nr tabeli ${w}"></td>`;
      for (const el of $$('[data-pole]', tr)) el.value = pobierz(stan, el.dataset.pole) ?? '';
      return tr;
    }));
    if (!waluty.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="pusto">Wybierz kraj albo wpisz koszt w walucie obcej.</td></tr>';
    }
  }
  const bledy = [];
  for (const tr of $$('tr[data-waluta]', tbody)) {
    const w = tr.dataset.waluta;
    const nbp = dzien ? kursyNBP.get(`${w}:${dzien}`) : null;
    const k = kursy[w];
    const komorka = (n, t) => { $(`[data-k="${n}"]`, tr).textContent = t; };
    komorka('kurs', k ? fmt.kurs(k.kurs) : nbp?.stan === 'trwa' ? 'pobieranie…' : dzien ? 'brak kursu' : '');
    komorka('data', k ? fmt.data(k.data) : '');
    komorka('tabela', k?.tabela ?? '');
    komorka('zrodlo', k?.reczny ? 'wpisany ręcznie' : k ? 'NBP' : '');
    $('[data-k="kurs"]', tr).classList.toggle('blad-tekst', !k && dzien && nbp?.stan !== 'trwa');
    $('[data-k="zrodlo"]', tr).classList.toggle('reczny-zrodlo', !!k?.reczny);
    if (nbp?.stan === 'blad' && !k?.reczny) bledy.push(`${w}: ${opisBledu(nbp.blad)}`);
  }
  $('#kursy-status').textContent = bledy.join(' · ');
}

function opisBledu(blad) {
  if (!(blad instanceof BladNBP)) return String(blad?.message ?? blad);
  if (blad.powod === 'siec') return 'brak połączenia z api.nbp.pl – sprawdź internet albo wpisz kurs ręcznie';
  if (blad.powod === 'brak') return 'brak notowań – sprawdź datę kursu (nie może być z przyszłości)';
  return blad.message;
}

// ---------- przeliczenie i wynik ----------

function ustawWynik(klucz, tekst, blad = false) {
  for (const el of $$(`[data-wynik="${klucz}"]`)) {
    el.textContent = tekst;
    el.classList.toggle('blad-tekst', blad);
  }
}

function przelicz() {
  const waluty = walutyWUzyciu(stan, mapaKrajow);
  const { kursy, reczne } = aktualneKursy(waluty);
  const wynik = oblicz(stan, mapaKrajow, kursy);
  const ok = wynik.kontrola === 'OK';
  const koszty = obliczKoszty(stan, kursy, wynik.dietaRazem);
  const bledy = polaZBledem(stan, mapaKrajow, kursy, reczne);
  const trwa = waluty.some((w) => kursyNBP.get(`${w}:${dzienKursu()}`)?.stan === 'trwa');

  // kontrola danych
  const kontrola = $('#kontrola');
  kontrola.textContent = !ok && trwa && wynik.kontrola.startsWith('Brak kursu') ? 'Pobieranie kursów NBP…' : wynik.kontrola;
  kontrola.classList.toggle('ok', ok);
  kontrola.classList.toggle('blad', !ok && !trwa);

  // kafelki (przy błędnych danych bez kwot)
  const dietaWal = wynik.wgWalut.map((w) => `${fmt.kwota(w.kwota)} ${w.waluta}`).join(' + ');
  $('#kafel-dieta-etykieta').textContent = 'Do wypłaty – dieta' + (ok && dietaWal ? ` (${dietaWal})` : '');
  $('#kafel-dieta').textContent = ok ? fmt.zl(wynik.dietaRazem) : '—';
  $('#kafel-wydatki').textContent = ok && koszty.ogolem !== null ? fmt.zl(koszty.ogolem - wynik.dietaRazem) : '—';
  $('#kafel-ogolem').textContent = ok && koszty.ogolem !== null ? fmt.zl(koszty.ogolem) : '—';

  // etapy: widoczność, waluta i stawka, wymagane pola
  const widoczne = widoczneEtapy(stan);
  for (const el of $$('#etapy .etap')) {
    const i = Number(el.dataset.etap);
    el.hidden = i >= widoczne;
    const e = stan.etapy[i];
    const kraj = mapaKrajow.get(e.kraj);
    ustawWynik(`etapy.${i}.stawka`, kraj ? `${kraj[1]} · dieta ${fmt.kwota(kraj[2])} za dobę` : '');
    $(`[data-pole="etapy.${i}.wjazd"]`).classList.toggle('wymagane', i === 0 || !!e.kraj);
    $(`[data-pole="etapy.${i}.kraj"]`).classList.toggle('wymagane', i === 0);
  }
  $$('[data-domyslny-srodek]').forEach((el) => { el.placeholder = stan.srodki || ''; });

  // przejazdy
  const zKrajem = stan.etapy.map((e, i) => i).filter((i) => stan.etapy[i].kraj);
  for (let i = 0; i < ETAPY; i++) {
    const j = zKrajem.indexOf(i);
    const k = j >= 0 ? koszty.przejazdy[j] : null;
    ustawWynik(`etapy.${i}.pln`, k ? (k.blad === 'kurs' ? 'brak kursu' : fmt.kwota(k.pln)) : '', k?.blad === 'kurs');
  }
  const kp = koszty.powrot;
  ustawWynik('powrotPrzejazd.pln', kp ? (kp.blad === 'kurs' ? 'brak kursu' : fmt.kwota(kp.pln)) : '', kp?.blad === 'kurs');

  pokazKursy(waluty, kursy);
  pokazWyliczenie(kursy, wynik);
  pokazKoszty(koszty, wynik, ok);

  // czerwone pola
  for (const el of $$('[data-pole]')) el.classList.toggle('blad', bledy.has(el.dataset.pole));
  ostatnieKursy = kursy;
  pokazPodglad();
  zaplanujPobieranie();
}

// ---------- druk ----------

let ostatnieKursy = {};

// marginesy stron jak w arkuszach Excela (cale → mm): Delegacja 0,5 / 0,4 / 0,4 / 0,4, Raport 0,6 / 0,5
const MARGINESY = { delegacja: '12.7mm 10.2mm 10.2mm', raport: '15.2mm 12.7mm' };

function htmlDruku(rodzaj) {
  return rodzaj === 'raport'
    ? raportHTML(daneRaportu(stan, mapaKrajow, ostatnieKursy, dzisiaj()))
    : delegacjaHTML(daneDelegacji(stan, mapaKrajow, ostatnieKursy));
}

function ustawStrone(rodzaj) {
  $('#styl-strony').textContent = `@page { size: A4 portrait; margin: ${MARGINESY[rodzaj]}; }`;
}

function drukuj(rodzaj) {
  $('#druk').innerHTML = htmlDruku(rodzaj);
  ustawStrone(rodzaj);
  window.print();
}

function pokazPodglad() {
  const podglad = $('#podglad');
  if (!podglad.open) return;
  const rodzaj = $('input[name="podglad"]:checked').value;
  const tresc = $('#podglad-tresc');
  tresc.innerHTML = htmlDruku(rodzaj);
  tresc.dataset.rodzaj = rodzaj;
  dopasujPodglad();
}

/** Kartka A4 (210 mm) pomniejszona do szerokości ekranu (zoom), żeby na telefonie widać było całą stronę. */
function dopasujPodglad() {
  const tresc = $('#podglad-tresc');
  const a4 = 210 * 96 / 25.4 + 2;
  tresc.style.zoom = Math.min(1, tresc.parentElement.clientWidth / a4).toFixed(3);
}

function komorki(tr, wartosci) {
  for (const w of wartosci) {
    const td = document.createElement('td');
    if (w && typeof w === 'object') {
      td.textContent = w.t;
      if (w.blad) td.classList.add('blad-tekst');
      if (w.b) td.classList.add('pogrubione');
    } else td.textContent = w ?? '';
    tr.append(td);
  }
}

function pokazWyliczenie(kursy, wynik) {
  // sekcja 3 jak w Excelu: liczona także przy błędach w danych (wtedy bez sumy)
  const zle = ['Wybierz kraj', 'Nie zostawiaj', 'Nieznany kraj', 'Niepoprawna data'].some((p) => wynik.kontrola.startsWith(p));
  const etapy = zle ? [] : obliczEtapy(stan, mapaKrajow, kursy);
  const tbody = $('#wyliczenie tbody');
  tbody.replaceChildren(...etapy.map((e, i) => {
    const tr = document.createElement('tr');
    komorki(tr, [`Etap ${i + 1}`, e.kraj, e.waluta, fmt.kwota(e.stawka), fmt.data(e.od), fmt.data(e.do),
      fmt.liczba(e.godziny), fmt.liczba(e.liczbaDiet, 4), fmt.kwota(e.potracenie),
      { t: fmt.kwota(e.dietaWaluta), b: true }, e.kurs === null ? { t: 'brak kursu', blad: true } : fmt.kurs(e.kurs),
      e.dietaPLN === null ? { t: 'brak kursu', blad: true } : { t: fmt.kwota(e.dietaPLN), b: true }]);
    return tr;
  }));
  if (!etapy.length) tbody.innerHTML = '<tr><td colspan="12" class="pusto">Uzupełnij kraj i daty w sekcji 2.</td></tr>';
  $('#dieta-razem').textContent = wynik.dietaRazem === null ? '—' : fmt.kwota(wynik.dietaRazem, { zero: '0,00' });

  const waluty = wgWalut(etapy, kursy);
  $('#waluty tbody').replaceChildren(...waluty.map((w) => {
    const tr = document.createElement('tr');
    komorki(tr, [w.waluta, fmt.kwota(w.kwota), w.kurs === null ? { t: 'brak kursu', blad: true } : fmt.kurs(w.kurs),
      w.pln === null ? '' : fmt.kwota(w.pln)]);
    return tr;
  }));
  if (!waluty.length) $('#waluty tbody').innerHTML = '<tr><td colspan="4" class="pusto">—</td></tr>';
}

function pokazKoszty(koszty, wynik, ok) {
  for (const { klucz } of KOSZTY) {
    const k = koszty.pozostale[klucz];
    ustawWynik(`koszty.${klucz}.kurs`, k?.kurs ? fmt.kurs(k.kurs) : k?.blad === 'kurs' ? 'brak kursu' : '', k?.blad === 'kurs');
    ustawWynik(`koszty.${klucz}.pln`, k && k.pln !== null ? fmt.kwota(k.pln) : '');
  }
  $('#suma-dieta').textContent = ok ? fmt.kwota(wynik.dietaRazem) : '—';
  $('#suma-przejazdy').textContent = fmt.kwota(koszty.przejazdyRazem);
  $('#suma-pozostale').textContent = fmt.kwota(koszty.pozostaleRazem);
  $('#ogolem').textContent = ok && koszty.ogolem !== null ? fmt.kwota(koszty.ogolem, { zero: '0,00' }) : '—';
}

// ---------- zdarzenia ----------

function naZmiane(ev) {
  const el = ev.target.closest('[data-pole]');
  if (!el) return;
  ustaw(stan, el.dataset.pole, el.value);
  przelicz();
}

function przyciskZPotwierdzeniem(btn, akcja) {
  const tekst = btn.textContent;
  let timer = null;
  btn.addEventListener('click', () => {
    if (!btn.classList.contains('potwierdz')) {
      btn.classList.add('potwierdz');
      btn.textContent = 'Na pewno? Kliknij jeszcze raz';
      timer = setTimeout(() => { btn.classList.remove('potwierdz'); btn.textContent = tekst; }, 3000);
      return;
    }
    clearTimeout(timer);
    btn.classList.remove('potwierdz');
    btn.textContent = tekst;
    akcja();
  });
}

async function start() {
  try {
    const odp = await fetch('../dane/kraje.json');
    if (!odp.ok) throw new Error(`HTTP ${odp.status}`);
    kraje = await odp.json();
  } catch (e) {
    $('#kontrola').textContent = `Nie udało się wczytać listy krajów (dane/kraje.json): ${e.message}`;
    $('#kontrola').classList.add('blad');
    return;
  }
  mapaKrajow = new Map(kraje.map((k) => [k[0], k]));
  zbudujFormularz();
  wypelnijPola();

  const main = $('#formularz');
  main.addEventListener('input', naZmiane);
  main.addEventListener('change', naZmiane);
  $('#przyklad').addEventListener('click', () => { stan = przykladowyStan(); wypelnijPola(); przelicz(); });
  przyciskZPotwierdzeniem($('#wyczysc'), () => { stan = pustyStan(); wypelnijPola(); przelicz(); });
  for (const b of $$('[data-drukuj]')) b.addEventListener('click', () => drukuj(b.dataset.drukuj));
  $('#podglad').addEventListener('toggle', pokazPodglad);
  for (const r of $$('input[name="podglad"]')) r.addEventListener('change', pokazPodglad);
  window.addEventListener('resize', () => { if ($('#podglad').open) dopasujPodglad(); });
  // Ctrl+P bez przycisku: drukuj to, co jest w podglądzie (domyślnie Delegację)
  window.addEventListener('beforeprint', () => {
    if ($('#druk').innerHTML) return;
    const rodzaj = $('#podglad').open ? $('input[name="podglad"]:checked').value : 'delegacja';
    $('#druk').innerHTML = htmlDruku(rodzaj);
    ustawStrone(rodzaj);
  });
  window.addEventListener('afterprint', () => { $('#druk').innerHTML = ''; });
  $('#pobierz-kursy').addEventListener('click', () => {
    for (const [k, v] of kursyNBP) if (v.stan === 'blad') kursyNBP.delete(k);
    pobierzBrakujace();
    przelicz();
  });
  przelicz();
}

start();
