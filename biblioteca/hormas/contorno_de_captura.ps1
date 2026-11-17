# Saca el contorno de una horma de una captura de LutraCAD vista de arriba (plantilla clara sobre fondo azul,
# dedos arriba, pie izquierdo con el lado interno a la derecha) y lo escribe como <salida>.json en esta carpeta:
# puntos en mm como pie izquierdo (talón en Y = 0, dedos hacia +Y, interno hacia +X), a `largo` mm.
# Uso: powershell -ExecutionPolicy Bypass -File contorno_de_captura.ps1 referencias\guia_arriba.png guia_contorno "Guía de tallas"
param([string]$imagen, [string]$salida, [string]$nombre, [double]$largo = 288)
Add-Type -AssemblyName System.Drawing
$aqui = Split-Path -Parent $MyInvocation.MyCommand.Path
$bmp = New-Object System.Drawing.Bitmap((Join-Path $aqui $imagen))
$rows = @()
for ($y = 0; $y -lt $bmp.Height; $y++) {
  $a = -1; $c = -1
  # plantilla = gris (claro, sombreado o el trazo negro del borde: rojo y azul parecidos); fondo = azul (azul >> rojo)
  for ($x = 0; $x -lt $bmp.Width; $x++) { $p = $bmp.GetPixel($x, $y); if (($p.B - $p.R) -lt 25) { if ($a -lt 0) { $a = $x }; $c = $x } }
  if ($a -ge 0 -and ($c - $a) -gt 3) { $rows += , @($y, $a, $c) }
}
$bmp.Dispose()
$y0 = $rows[0][0]; $y1 = $rows[-1][0]; $s = $largo / ($y1 - $y0)
$minx = ($rows | ForEach-Object { $_[1] } | Measure-Object -Minimum).Minimum; $maxx = ($rows | ForEach-Object { $_[2] } | Measure-Object -Maximum).Maximum; $xc = ($minx + $maxx) / 2
$inv = [Globalization.CultureInfo]::InvariantCulture
$sel = @(); for ($i = 0; $i -lt $rows.Count; $i += 5) { $sel += , $rows[$i] }; if ($sel[-1][0] -ne $y1) { $sel += , $rows[-1] }
$pts = @()
for ($i = $sel.Count - 1; $i -ge 0; $i--) { $r = $sel[$i]; $pts += ('[{0},{1}]' -f (($r[1] - 0.5 - $xc) * $s).ToString('0.0', $inv), (($y1 - $r[0]) * $s).ToString('0.0', $inv)) }
for ($i = 0; $i -lt $sel.Count; $i++) { $r = $sel[$i]; $pts += ('[{0},{1}]' -f (($r[2] + 0.5 - $xc) * $s).ToString('0.0', $inv), (($y1 - $r[0]) * $s).ToString('0.0', $inv)) }
$ancho = (($maxx - $minx + 1) * $s).ToString('0.0', $inv)
$img = $imagen -replace '\\', '/'
$json = "{`n  `"nota`": `"Contorno de la horma $nombre como pie izquierdo, en mm (talon en Y = 0, dedos hacia +Y, interno hacia +X), sacado de $img a largo $largo mm con contorno_de_captura.ps1.`",`n  `"largo`": $largo,`n  `"ancho`": $ancho,`n  `"puntos`": [" + ($pts -join ',') + "]`n}"
[IO.File]::WriteAllText((Join-Path $aqui "$salida.json"), $json, (New-Object Text.UTF8Encoding($false)))
"$salida.json: $($rows.Count) filas, $($pts.Count) puntos, ancho $ancho mm"
