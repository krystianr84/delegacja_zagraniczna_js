"""Porównanie położenia linii (ramek) na wydruku strony i na wzorcu z Excela.

Użycie: python porownaj.py wzorzec.pdf strona.pdf
Wymaga: pdftoppm (Poppler) w PATH i Pillow. Wypisuje dla każdej strony pozycje poziomych linii w pt
(od górnej krawędzi kartki) i obrys zawartości. Różnice do ~2 pt są normalne (inne renderowanie czcionek).
"""
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

DPI = 150


def strony(pdf, katalog):
    subprocess.run(["pdftoppm", "-r", str(DPI), "-png", pdf, str(Path(katalog) / Path(pdf).stem)], check=True,
                   stderr=subprocess.DEVNULL)
    return sorted(Path(katalog).glob(Path(pdf).stem + "-*.png"))


def linie(png, prog=0.25):
    im = Image.open(png).convert("L")
    w, h = im.size
    px = im.load()
    wynik = []
    for y in range(h):
        if sum(1 for x in range(0, w, 2) if px[x, y] < 140) * 2 > prog * w:
            if wynik and y - wynik[-1][1] <= 2:
                wynik[-1][1] = y
            else:
                wynik.append([y, y])
    pt = lambda v: round(v * 72 / DPI, 1)
    obrys = im.point(lambda v: 255 if v < 128 else 0).getbbox()
    return [pt((a + b) / 2) for a, b in wynik], [pt(v) for v in obrys]


def main(wzorzec, strona):
    with tempfile.TemporaryDirectory() as t:
        for i, (a, b) in enumerate(zip(strony(wzorzec, t), strony(strona, t)), 1):
            (la, oa), (lb, ob) = linie(a), linie(b)
            print(f"strona {i}\n  linie wzorzec: {la}\n  linie strona:  {lb}\n  obrys wzorzec: {oa}\n  obrys strona:  {ob}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
