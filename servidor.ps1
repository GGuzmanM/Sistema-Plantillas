param([int]$Puerto = 8765)
# Servidor local del programa de plantillas. Sirve esta carpeta en http://localhost:<puerto>/ y guarda en
# la carpeta "salida" lo que la página envía con PUT /salida/<archivo> (y las combinaciones de elementos en
# biblioteca/combinaciones.json). Solo escucha en esta PC.
#
# Seguridad (auditoría 2026-11-18):
#  - solo escucha en localhost (otras PC de la red no llegan) y rechaza otro nombre en "Host" (DNS rebinding)
#  - nada fuera de la carpeta del programa, ni carpetas ocultas (.git, .claude) ni scripts .ps1/.cmd
#  - PUT solo desde la propia página (Origin/Referer de localhost), solo a salida/ y combinaciones.json, hasta 200 MB
#  - otros métodos (POST, DELETE, OPTIONS…) se rechazan
#  - cabeceras para que otra página no pueda meter el programa en un marco ni adivinar tipos de archivo
$raiz = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
$tipos = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
            '.css' = 'text/css; charset=utf-8'; '.stl' = 'model/stl'; '.png' = 'image/png'; '.svg' = 'image/svg+xml'
            '.pdf' = 'application/pdf'; '.md' = 'text/plain; charset=utf-8'; '.iso' = 'text/plain; charset=utf-8' }
$prohibidas = @('.ps1', '.cmd', '.bat', '.exe', '.dll', '.zip')
$origenes = @("http://localhost:$Puerto")
$maxPut = 200MB
$http = New-Object Net.HttpListener
$http.Prefixes.Add("http://localhost:$Puerto/")
try { $http.Start() }
catch { "No se pudo abrir el puerto $Puerto (¿el programa ya está abierto en otra ventana?): $($_.Exception.Message)"; exit 1 }
"Programa de plantillas en http://localhost:$Puerto/  (pruebas del motor en /pruebas/). Ctrl + C para cerrar."
try {
  while ($http.IsListening) {
    $ctx = $http.GetContext(); $req = $ctx.Request; $res = $ctx.Response
    try {
      $res.Headers['X-Content-Type-Options'] = 'nosniff'
      $res.Headers['X-Frame-Options'] = 'SAMEORIGIN'
      $res.Headers['Referrer-Policy'] = 'no-referrer'
      $res.Headers['Cross-Origin-Resource-Policy'] = 'same-origin'
      $metodo = $req.HttpMethod
      $hostNombre = ($req.Headers['Host'] -replace ':\d+$', '').ToLower()
      $ruta = [Uri]::UnescapeDataString($req.Url.AbsolutePath).TrimStart('/')
      if ($ruta.EndsWith('/')) { $ruta += 'index.html' }
      $archivo = [IO.Path]::GetFullPath((Join-Path $raiz $ruta))
      $partes = $ruta -split '[\\/]'
      if ($hostNombre -ne 'localhost') { $res.StatusCode = 421 }
      elseif ($metodo -notin @('GET', 'HEAD', 'PUT')) { $res.StatusCode = 405; $res.Headers['Allow'] = 'GET, HEAD, PUT' }
      # la raíz lleva a la pantalla (con su propia dirección, para que sus rutas relativas funcionen)
      elseif ($ruta -eq '' -or $ruta -eq 'index.html') { $res.StatusCode = 302; $res.RedirectLocation = '/app/' }
      # nada fuera de la carpeta del programa, ni carpetas/archivos ocultos, ni scripts
      elseif (-not $archivo.StartsWith($raiz, [StringComparison]::OrdinalIgnoreCase) -or
              ($partes | Where-Object { $_.StartsWith('.') }) -or
              ($prohibidas -contains [IO.Path]::GetExtension($archivo).ToLower())) { $res.StatusCode = 403 }
      elseif ($metodo -eq 'PUT') {
        $nombre = [IO.Path]::GetFileName($archivo)
        $origen = $req.Headers['Origin']; if (-not $origen -and $req.UrlReferrer) { $origen = $req.UrlReferrer.GetLeftPart([UriPartial]::Authority) }
        # se puede escribir solo en salida/ (STL, recetas y hojas del diseño) y el archivo de combinaciones de elementos
        $permitido = ($ruta -match '^salida/[^/]+$' -and $nombre -match '^[\w\-. ()]+\.(stl|json|html|iso)$') -or $ruta -eq 'biblioteca/combinaciones.json'
        if ($origenes -notcontains $origen) { $res.StatusCode = 403 }
        elseif (-not $permitido) { $res.StatusCode = 403 }
        elseif ($req.ContentLength64 -gt $maxPut) { $res.StatusCode = 413 }
        else {
          $ms = New-Object IO.MemoryStream; $buf = New-Object byte[] 65536
          while (($n = $req.InputStream.Read($buf, 0, $buf.Length)) -gt 0) {
            $ms.Write($buf, 0, $n); if ($ms.Length -gt $maxPut) { break }
          }
          if ($ms.Length -gt $maxPut) { $res.StatusCode = 413 }
          else {
            # se escribe en un temporal y se cambia de nombre: un corte a medias no deja el archivo roto
            $tmp = $archivo + '.tmp'
            [IO.File]::WriteAllBytes($tmp, $ms.ToArray()); Move-Item -LiteralPath $tmp -Destination $archivo -Force
            $res.StatusCode = 204
          }
        }
      }
      elseif (Test-Path -LiteralPath $archivo -PathType Leaf) {
        $bytes = [IO.File]::ReadAllBytes($archivo)
        $tipo = $tipos[[IO.Path]::GetExtension($archivo).ToLower()]; if (-not $tipo) { $tipo = 'application/octet-stream' }
        $res.ContentType = $tipo; $res.Headers['Cache-Control'] = 'no-store'
        $res.ContentLength64 = $bytes.Length
        if ($metodo -ne 'HEAD') { $res.OutputStream.Write($bytes, 0, $bytes.Length) }
      }
      else { $res.StatusCode = 404 }
    } catch { try { $res.StatusCode = 500 } catch { } }
    try { $res.Close() } catch { }
  }
} finally { $http.Stop() }
