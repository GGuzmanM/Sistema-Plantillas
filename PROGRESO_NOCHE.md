# Trabajo de la noche (2026-11-11)

Lista aprobada por Ernesto. Se marca cada punto al terminarlo y probarlo. Antes de cada bloque hay un respaldo
zip en `Respaldos_Programa_Plantillas/`. Si la sesión se corta, se sigue desde el primer punto sin marcar.

## Bloque 1
- [x] 1. Arco: la ubicación se pone sola desde el escaneo (promedio de los dos pies, editable). Probado: 42 %.
- [x] 2. Mapa "Ajuste al pie": azul = hueco, blanco = toca, rojo = plantilla más alta que el pie. Aparece al
      abrir un escaneo; el escaneo se oculta mientras está el mapa. Probado con el escaneo de ejemplo.

## Bloque 2
- [x] 3. Deshacer / rehacer (botones arriba y Ctrl+Z / Ctrl+Y). Probado.
- [x] 4. Autoguardado en el navegador; al abrir ofrece recuperar el diseño sin exportar. Probado.

## Bloque 3
- [x] 5. Arrastrar y soltar escaneo (STL) o receta (JSON) sobre el 3D. Probado.
- [x] 6. Atajos de teclado: 1–5 vistas, M medir, A alturas, J ajuste, Supr quitar elemento, Esc. Probado.
- [x] 7. Girar y cambiar largo/ancho de los elementos (por pie, en "Posición, giro y tamaño"; Ctrl+arrastrar en
      el 3D gira). Alrededor del centro del elemento, sin cambiar su altura. Probado con la oliva.

## Bloque 4
- [x] 8. Avisos nuevos: elemento fuera de la plantilla, plantilla más corta o angosta que el pie, pies del
      escaneo de distinto largo. Probado.
- [x] 9. Hoja del diseño: botón en Archivos, se guarda en salida/ como "<paciente> … hoja.html" y se imprime o se
      guarda en PDF desde el navegador. Probado. (El servidor ahora deja guardar .html en salida/.)
- [x] 10. La receta guarda los nombres de los archivos del escaneo; al abrir la receta los muestra. Probado.

## Bloque 5 (extras)
- [x] Vista de corte: herramienta "Corte" (tecla C). Perfil a lo ancho y a lo largo por el punto elegido, con
      elementos en naranja y la planta del pie del escaneo en azul punteado. Probado.
- [x] Combinaciones guardadas de elementos (Diseño): guardar, aplicar y borrar; archivo compartido
      `biblioteca/combinaciones.json`. Probado (la de prueba se borró).
- [x] Peso del par (macizo) en Medidas y en la hoja. Densidad 1,2 g/cm³ en `biblioteca.json`: A CONFIRMAR.

## Bloque 6 (si alcanza)
- [x] 11. Muestra 2D: "Abrir muestra (PNG con regla)…" en Base (o arrastrar el PNG). Encuentra el contorno solo
      (aunque el trazo sea muy tenue), mide largo y ancho, sabe qué pie es y lo dibuja debajo en la vista Arriba
      (espejo en el otro pie). Se corre y gira a mano. Botón para usar su largo y ancho. Probado con Karol
      (241,7 × 85,0, izquierdo) y Nicole (259,6 × 92,2, derecho).
- [x] 12. Orden del doctor (borrador): `app/orden.html` (enlace arriba en el programa). Genera la receta; el
      programa la abre, muestra la nota del doctor y, si la talla es "según escaneo", toma las medidas del
      escaneo. Probado de punta a punta.

## Cierre
- [x] 4 pruebas nuevas (ubicación del arco; mover, girar y agrandar; escaneo; muestra 2D): 19 de 19 pasan.
      LEEME actualizado.

## Lista aprobada: completa. Mejoras extra (después del respaldo "lista_completa")
- [x] Clic en el 3D 25 veces más rápido (0,7 ms en vez de 18 ms; misma posición con 0,2 mm de diferencia):
      medir, corte y agarrar elementos responden al instante.
- [x] El elemento elegido se ve en naranja más oscuro en el 3D (clic en su tarjeta o al agarrarlo).
- [x] Mapa de ajuste más parejo en el borde del escaneo.
- [x] Revisado en pantalla de laptop (1100 × 700): todo entra.
