param(
    [string]$File = "C:\MOJE\Projekt_delegacje\wydanie\Kalkulator_delegacji_zagranicznej.xlsx",
    [string]$Out = $PSScriptRoot
)
# Eksport arkuszy Delegacja i Raport z wersji excelowej do PDF – wzorce do porównania z drukiem strony.
# Plik jest otwierany tylko do odczytu i zamykany bez zapisu. Wymaga Excela (Windows) i internetu (kursy NBP).
# Wariant A = przykład z build.py; wariant B = przykład + przejazdy, zaliczka, termin rozliczenia i liczba dowodów.
$OutputEncoding = [Console]::OutputEncoding = [Text.Encoding]::UTF8
$warianty = @(
    @{ N = "A"; Set = "" },
    @{ N = "B"; Set = "L15=250;K16=pociąg;L16=30;M16=EUR;K20=samochód służbowy;L20=200;K9=500;K10=14;K11=3" }
)
$x = New-Object -ComObject Excel.Application
$x.DisplayAlerts = $false
try {
    foreach ($w in $warianty) {
        $wb = $x.Workbooks.Open($File, 0, $true)
        try {
            $k = $wb.Worksheets.Item("Kalkulator")
            if ($w.Set) { foreach ($kv in $w.Set.Split(";")) { $a, $v = $kv.Split("=", 2); $k.Range($a).Formula = $v } }
            $x.CalculateFull()
            $kn = $wb.Worksheets.Item("Kursy NBP")
            for ($p = 0; $p -lt 6 -and [string]$kn.Range("N8").Value2 -eq "BLAD"; $p++) { Start-Sleep 10; $x.CalculateFull() }
            "$($w.N): kontrola = $($k.Range('E1').Text)"
            foreach ($ark in "Delegacja", "Raport") {
                $wb.Worksheets.Item($ark).ExportAsFixedFormat(0, (Join-Path $Out "excel-$ark-$($w.N).pdf"))
            }
        } finally { $wb.Close($false) }
    }
} finally { $x.Quit() }
