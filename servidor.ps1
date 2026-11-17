param([int]$Puerto = 8765)
# Servidor local del programa de plantillas. Sirve esta carpeta en http://localhost:<puerto>/ y guarda en
# la carpeta "salida" lo que la página envía con PUT /salida/<archivo> (y las combinaciones de elementos en
# biblioteca/combinaciones.json). Solo escucha en esta PC.
$raiz = $PSScriptRoot
$tipos = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
            '.css' = 'text/css; charset=utf-8'; '.stl' = 'model/stl'; '.png' = 'image/png'; '.svg' = 'image/svg+xml' }
$http = New-Object Net.HttpListener
$http.Prefixes.Add("http://localhost:$Puerto/")
$http.Start()
"Programa de plantillas en http://localhost:$Puerto/  (pruebas del motor en /pruebas/)"
try {
  while ($http.IsListening) {
    $ctx = $http.GetContext(); $req = $ctx.Request; $res = $ctx.Response
    try {
      $ruta = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
      if ($ruta.EndsWith('/')) { $ruta += 'index.html' }
      $archivo = [IO.Path]::GetFullPath((Join-Path $raiz $ruta))
      # la raíz lleva a la pantalla (con su propia dirección, para que sus rutas relativas funcionen)
      if ($ruta -eq '' -or $ruta -eq 'index.html') { $res.StatusCode = 302; $res.RedirectLocation = '/app/' }
      # nada fuera de la carpeta del programa
      elseif (-not $archivo.StartsWith($raiz, [StringComparison]::OrdinalIgnoreCase)) { $res.StatusCode = 403 }
      elseif ($req.HttpMethod -eq 'PUT') {
        $nombre = [IO.Path]::GetFileName($archivo)
        # se puede escribir solo en salida/ (STL, recetas y hojas del diseño) y el archivo de combinaciones de elementos
        $permitido = ($ruta -match '^salida/[^/]+$' -and $nombre -match '^[\w\-. ]+\.(stl|json|html)$') -or $ruta -eq 'biblioteca/combinaciones.json'
        if (-not $permitido) { $res.StatusCode = 403 }
        else {
          $ms = New-Object IO.MemoryStream; $req.InputStream.CopyTo($ms)
          [IO.File]::WriteAllBytes($archivo, $ms.ToArray()); $res.StatusCode = 204
        }
      }
      elseif (Test-Path -LiteralPath $archivo -PathType Leaf) {
        $bytes = [IO.File]::ReadAllBytes($archivo)
        $tipo = $tipos[[IO.Path]::GetExtension($archivo).ToLower()]; if (-not $tipo) { $tipo = 'application/octet-stream' }
        $res.ContentType = $tipo; $res.Headers['Cache-Control'] = 'no-store'
        $res.ContentLength64 = $bytes.Length; $res.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      else { $res.StatusCode = 404 }
    } catch { $res.StatusCode = 500 }
    $res.Close()
  }
} finally { $http.Stop() }
