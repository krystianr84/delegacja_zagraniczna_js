// Zapis podróży: plik .json (eksport / import) i autozapis w localStorage. Czyste funkcje (magazyn przekazywany).
// Import jest odporny na stare lub ręcznie edytowane pliki: znane pola są przepisywane na pusty stan jako tekst,
// nieznane pomijane – formularz zawsze dostaje pełny, poprawny kształt danych.

import { pustyStan, ETAPY, WALUTY_KOSZTOW } from './model.js';
import { KOSZTY } from './obliczenia.js';
import { WALUTY, TRYB_W_DNIU, TRYB_DZIEN_PRZED } from './nbp.js';

export const FORMAT = 'kalkulator-diety-zagranicznej';
export const WERSJA = 1;
export const KLUCZ_AUTOZAPISU = 'delegacja:stan';

const tekst = (v) => (v === undefined || v === null ? '' : typeof v === 'object' ? '' : String(v));
const obiekt = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Stan → obiekt pliku podróży. */
export function doPliku(stan, zapisano = new Date().toISOString()) {
  return { format: FORMAT, wersja: WERSJA, zapisano, podroz: oczysc(stan) };
}

/** Dowolne dane → pełny stan formularza (tylko znane pola, wszystkie jako tekst). */
export function oczysc(dane) {
  const d = obiekt(dane);
  const s = pustyStan();
  for (const k of Object.keys(s)) {
    if (typeof s[k] === 'string' && k in d) s[k] = tekst(d[k]);
  }
  if (![TRYB_W_DNIU, TRYB_DZIEN_PRZED].includes(s.trybKursu)) s.trybKursu = TRYB_DZIEN_PRZED;

  const etapy = Array.isArray(d.etapy) ? d.etapy.slice(0, ETAPY) : [];
  etapy.forEach((e, i) => {
    const z = obiekt(e);
    for (const k of Object.keys(s.etapy[i])) if (k in z) s.etapy[i][k] = tekst(z[k]);
  });
  const waluta = (w) => (WALUTY_KOSZTOW.includes(w) ? w : 'PLN');
  s.etapy.forEach((e) => { e.waluta = waluta(e.waluta); });

  const pp = obiekt(d.powrotPrzejazd);
  for (const k of Object.keys(s.powrotPrzejazd)) if (k in pp) s.powrotPrzejazd[k] = tekst(pp[k]);
  s.powrotPrzejazd.waluta = waluta(s.powrotPrzejazd.waluta);

  const koszty = obiekt(d.koszty);
  for (const { klucz } of KOSZTY) {
    const k = obiekt(koszty[klucz]);
    s.koszty[klucz] = { kwota: tekst(k.kwota), waluta: waluta(tekst(k.waluta) || 'PLN') };
  }

  const reczne = obiekt(d.kursyReczne);
  for (const w of WALUTY) {
    const r = obiekt(reczne[w]);
    const wpis = { kurs: tekst(r.kurs), data: tekst(r.data), tabela: tekst(r.tabela) };
    if (wpis.kurs || wpis.data || wpis.tabela) s.kursyReczne[w] = wpis;
  }
  return s;
}

/** Tekst pliku → stan. Rzuca Error z komunikatem dla użytkownika, gdy plik nie jest plikiem podróży. */
export function zPliku(tresc) {
  let json;
  try {
    json = JSON.parse(String(tresc).replace(/^﻿/, ''));
  } catch {
    throw new Error('To nie jest plik JSON.');
  }
  if (json?.format !== FORMAT || typeof json.podroz !== 'object' || json.podroz === null) {
    throw new Error('To nie jest plik podróży z Kalkulatora diety zagranicznej.');
  }
  if (Number(json.wersja) > WERSJA) {
    throw new Error(`Plik zapisano w nowszej wersji kalkulatora (${json.wersja}) – odśwież stronę.`);
  }
  return oczysc(json.podroz);
}

/** Nazwa pliku, np. „delegacja_1-2026_Jan_Kowalski_2026-09-14.json”. */
export function nazwaPliku(stan) {
  const czesc = (v) => tekst(v).trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '_')
    .replace(/^[-_.]+|[-_.]+$/g, '')
    .slice(0, 40);
  const data = tekst(stan.etapy?.[0]?.wjazd || stan.wyjazdZMiejscowosci || stan.dataPolecenia).slice(0, 10);
  return ['delegacja', czesc(stan.nrPolecenia), czesc(stan.pracownik), /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : '']
    .filter(Boolean).join('_') + '.json';
}

/** Czy stan jest pusty (nic nie wpisano) – wtedy nie ma czego autozapisywać ani chronić przed nadpisaniem. */
export function czyPusty(stan) {
  return JSON.stringify(oczysc(stan)) === JSON.stringify(pustyStan());
}

// ---------- autozapis (każdy odczyt i zapis w try/catch) ----------

export function wczytajAutozapis(magazyn) {
  try {
    const s = magazyn?.getItem(KLUCZ_AUTOZAPISU);
    return s ? zPliku(s) : null;
  } catch {
    return null;
  }
}

/** true = zapisano; false = brak miejsca / zablokowany magazyn. Pusty stan usuwa autozapis. */
export function autozapis(magazyn, stan) {
  try {
    if (czyPusty(stan)) magazyn?.removeItem(KLUCZ_AUTOZAPISU);
    else magazyn?.setItem(KLUCZ_AUTOZAPISU, JSON.stringify(doPliku(stan)));
    return !!magazyn;
  } catch {
    return false;
  }
}
