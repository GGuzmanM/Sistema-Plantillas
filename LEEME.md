# Programa de plantillas (Lima Blue)

Programa propio para generar plantillas a partir de una horma, la talla y lo que pide el doctor.
Propuesta completa: https://claude.ai/artifact/V3d9ySiZSVo18Pr1CfUkZq

## Estado

- Etapa 0 (motor de geometría) cerrada el 2026-11-11: Ernesto aprobó el acabado de la resina en Bambu Studio.
  Queda probar el laminado en ideaMaker (PodoTec).
- Etapa 1 (pantalla de diseño de resinas) en uso de prueba. Lo agregado la noche del 2026-11-11 está en
  `PROGRESO_NOCHE.md`.
- 22 pruebas automáticas en `pruebas/` (todas pasan).

## Resumen de funciones (2026-11-11)

| Dónde | Qué hace |
| --- | --- |
| Base | Paciente, escaneo del pie (STL), muestra 2D (PNG) y plantilla con su forma, talla o largo, ancho, alturas, ubicación del arco. |
| Diseño | Elementos por pie: altura, posición, giro y tamaño; combinaciones guardadas. |
| Exportar | Medidas, revisión, STL de los dos pies, receta y hoja del diseño. Los elementos quedan fijos. |
| Visor | Cubo de vistas (como Bambu Studio), vistas sin perspectiva, mostrar u ocultar cada pie, arrastrar elementos (Ctrl + arrastrar los gira), Medir, Corte, Mapa de alturas, Ajuste al pie. |
| Arriba | Deshacer / rehacer, enlace a la orden del doctor. |
| Siempre | Autoguardado (al abrir ofrece recuperar), arrastrar archivos sobre el 3D, atajos de teclado. |

Vistas (2026-11-12): cubo arriba a la derecha como en Bambu Studio (clic en una cara = vista exacta desde ahí; en
una esquina = en diagonal; arrastrar = girar). Por defecto sin perspectiva, así la pieza se ve con su forma real
igual que en Bambu; "Perspectiva" la activa. "Izquierdo" y "Derecho" muestran u ocultan cada pie.
Atajos: 1–5 vistas (3D, arriba, lado, atrás, abajo), M medir, C corte, A mapa de alturas, J ajuste al pie,
Supr quita el elemento elegido, Esc suelta todo, Ctrl+Z / Ctrl+Y deshacer y rehacer.

## Cómo abrir la pantalla

Doble clic en `Abrir programa.cmd`: arranca el servidor y abre http://localhost:8765/ en el navegador.
La ventana negra del servidor debe quedar abierta mientras se usa; al cerrarla, se cierra el programa.

La pantalla (etapa 1, en curso) tiene: paciente, producto, talla de la tabla o largo libre, ancho
proporcional o fijo, copa, espesor del antepié, arco proporcional o fijo y canto del borde. Muestra los dos
pies en 3D (vistas 3D, arriba, lado, atrás y abajo), las medidas y avisos de revisión. Exporta los dos STL y
la receta a `salida/`, y abre recetas guardadas.

Elementos (2026-11-11): cuña externa e interna de antepié, cuña externa e interna de retropié, cuña
antisupinación, barra metatarsal y oliva, cada uno con su altura por pie (0 = ese pie no lo lleva). Se ven en
naranja sobre la plantilla. Sus zonas y perfiles están en `biblioteca/elementos.json`, tomados de capturas de la
biblioteca de EasyCAD; se ajustan ahí sin tocar el programa. El arco lateral queda para después.

Herramientas del visor: "Medir" (clic en la plantilla: línea vertical con la altura, el espesor y lo que suma
el elemento en ese punto; la lectura se actualiza al cambiar el diseño) y "Mapa de alturas" (colores de 0 a
20 mm con su escala).

Módulos (como en LutraCAD): "1. Base" (paciente, talla, alturas), "2. Diseño" (elementos) y "3. Exportar"
(medidas, revisión, archivos). En Base y Diseño los elementos se arrastran con el ratón sobre el 3D o se
corren con los números "Hacia los dedos" y "Hacia interno" (mm, por pie; "Mover igual en los dos pies" los
mueve juntos). En Exportar el diseño queda fijo. La posición se guarda en la receta (`mov`).

Escaneo del pie (2026-11-11): en Base, "Abrir escaneo (STL)…" abre el STL del Podoscan que Baro deja en la
carpeta del paciente (`Podoscan3D_IZ.stl` y `Podoscan3D_DC.stl`, se pueden elegir los dos juntos). El lado sale
del nombre (IZ / DC). `motor/escaneo.js` lo orienta como la plantilla (talón atrás, dedos adelante, apoyo abajo),
lo alinea con el eje de cada plantilla y lo muestra en azul transparente, apoyado sobre el antepié. Da largo,
ancho de antepié y ancho de talón del pie. Ejemplo en `escaneos/`.
Al abrirlo pone solos el largo y el ancho de la plantilla iguales al pie (el más grande de los dos, redondeado a
0,5 mm; confirmado por Ernesto el 2026-11-11) y muestra la talla de la tabla más cercana como referencia. Los
dos se pueden cambiar a mano; el botón "Volver a usar las medidas del escaneo" los repone.

Secciones desplegables (2026-11-13): cada título del panel (Paciente, Escaneo, Muestra 2D, Plantilla…) abre o
cierra su sección. Empiezan cerradas, el programa recuerda cuáles quedaron abiertas y, cerrada, el título muestra
un resumen (talla y largo, copa y arco, cuántos avisos…). Al abrir un escaneo o una muestra su sección se abre sola.

Guía de tallas (2026-11-13): "Medida desde" = Guía de tallas o Muestra o escaneo. Con guía de tallas se elige el
cuadro (Hombre US, Dama US — de `biblioteca/tallas_usa.json`, GUIA DE TALLAS USA.pdf — o EU Baroflex 27 a 48) y la
talla, y el largo sale del cuadro. Margen para pulir (2026-11-19): desplegable con interruptor en Plantilla (EVA o
impresa; en EVA viene prendido); alarga la punta (`margenPunta`, 5 mm: nada se mueve hasta el 75 % del largo) y abre
los costados del antepié (`margenLados`, 3 mm por lado) y del retropié (`margenTalon`, 0 por defecto; también atrás del
talón, que queda en Y negativo). Los costados son una banda seguida: la del retropié hasta el 35 % del largo, pasa suave
a la del antepié hasta el 65 % (antes cada una se apagaba y el borde se angostaba en el arco). Vale con guía de
tallas y con muestra. Largo y ancho del antepié en el panel se muestran sin el margen. Las recetas EVA de antes con largo = talla + 5 se pasan solas a margen de 5 mm. Con guía de tallas, abrir el escaneo no cambia el largo ni el ancho (solo se usa para el arco);
"Usar las medidas del escaneo", "Usar solo largo y ancho de la muestra" o "Plantilla con la forma de la muestra"
pasan a "Muestra o escaneo". Elegir una talla vuelve a guía de tallas. La receta guarda `medidaDesde`, `cuadro` y
`talla` (texto); las recetas viejas con talla en número se abren con el cuadro EU.

Regla (2026-11-13): herramienta "Regla" (tecla R): clic en un punto y clic en otro = distancia en mm, con marcas
cada 10 mm. Sobre la plantilla toma la superficie; fuera de ella, el piso (sirve sobre la muestra en la vista
Arriba). Si los puntos están a distinta altura también muestra la distancia en planta y el alto. "Borrar medidas"
las quita. Después del primer clic la línea sigue al ratón; con Mayús (como LutraCAD) queda recta en la vista que
se mira (horizontal o vertical en la pantalla, la más cercana al ratón). Esc cancela la regla a medio poner.
Se dibuja como la cota de LutraCAD: cruz de guía de lado a lado por el ratón mientras la regla está prendida, línea
verde con el valor escrito a lo largo, y la línea se puede agarrar y correr a un lado (de costado a lo medido) para
no tapar la plantilla; quedan líneas finas de referencia desde los puntos medidos hasta la cota. Clic en la línea
de una cota = queda elegida (naranja) y Supr la borra (con cualquier herramienta).

Inicio, diseñadores y proyectos (2026-11-13, como la pantalla de clientes de LutraCAD; `app/inicio.js`):
- Al abrir el programa sale la pantalla de inicio con dos apartados: Diseñadores y Biblioteca (la biblioteca es el
  siguiente paso). El botón "⌂ Inicio" del encabezado vuelve a ella; al lado se ve "diseñador › paciente".
- Carpeta de trabajo: la carpeta de OneDrive "Programa Plantillas - Datos compartidos" (la ven las tres PC). Cada PC
  la elige una vez ("Elegir carpeta…"); el navegador la recuerda y a lo más pide confirmar el permiso con un clic.
  Necesita Chrome, Edge o el navegador de Claude (File System Access).
- Diseños/<Diseñador>/<Paciente - fecha>/: cada proyecto con su `proyecto.json` (paciente, diseñador, fechas, estado
  "En diseño"/"Exportado", lista de exportaciones y la receta). El diseño se guarda solo al cambiar (1,2 s después).
  Los STL, la hoja y la receta se guardan en esa carpeta (ya no en Programa_Plantillas\salida). Sin proyecto abierto
  no se guarda nada: el mensaje lo indica.
- Diseñadores: tarjetas con "Abrir" y "Nuevo diseñador" (sin clave). Proyectos: búsqueda por paciente, creado,
  modificado, estado y "Abrir"; "+ Nuevo proyecto" con el nombre del paciente. "📁 Nuevo desde carpeta…"
  (2026-11-19, Ernesto) crea el proyecto sin escribir el nombre: sale de la carpeta del paciente (sin el número del
  final, como al abrir la carpeta) y después se cargan su escaneo y sus muestras.
- Con un proyecto abierto, "Abrir carpeta del paciente" solo carga el escaneo y las muestras; el diseño se conserva
  (así se retoma un proyecto). Sin proyecto sigue empezando de cero.
- Eliminar diseño (2026-11-14): botón "Eliminar" en la lista de proyectos del diseñador. Pide confirmar y no borra
  de una: mueve la carpeta del proyecto a `Papelera/<Diseñador>/` de la carpeta compartida (de ahí se recupera a
  mano). Si era el proyecto abierto, deja de guardarse.
- Para probar sin elegir carpeta: `app/index.html?almacenPrueba=1` usa el almacenamiento interno del navegador.
- El proyecto se guarda ~0,7 s después de cada cambio, y enseguida al ir a Inicio o cambiar de ventana; si se cierra
  o recarga con un cambio sin guardar, el navegador pregunta antes de salir.

Panel del elemento elegido (2026-11-13, como "Configuración de recursos" de LutraCAD): al tocar un elemento en el 3D
o su tarjeta aparece un panel arriba a la derecha del 3D con: altura; qué hace arrastrar (Mover, Girar, Escala 1D
—a lo largo o a lo ancho según si se agarra hacia una punta o hacia un costado— y Escala 2D, pareja); giro, largo y
ancho en números; "Reflejar al otro pie" (copia altura, posición, giro y tamaño); "Borrar"; "Añadir a la biblioteca"
(lo guarda como elemento propio con `inicial` = altura, posición, giro y tamaño, que se aplican al agregarlo).
El elemento elegido se ve en verde en el pie tocado y en rojo en el otro pie. Todo sigue "Mover igual en los dos
pies". Fluir y Dividir de LutraCAD quedan para cuando se vea la impresión por densidades.

Biblioteca de elementos (2026-11-13, apartado "Biblioteca" del inicio; `app/biblioteca.js`):
- Tarjetas por categoría (Cuñas, Barras y olivas, Arcos, Talón, Otros) con el dibujo de cada elemento sobre una
  plantilla izquierda de 240 mm (lo dibuja el motor), búsqueda, ★ favoritos.
- "+ Nuevo elemento": se elige una forma base (gota, óvalo, cuña de retropié, cuña de antepié, cuña larga, barra) y
  se ajustan campos entendibles (largo y ancho en %, dónde va, centro, parte más ancha y más alta, llenura, giro,
  lado, alcance, altura y suavidad) con vista previa. Todos tienen "Editar" (2026-11-14): el editor se abre a
  pantalla completa (Esc o Cancelar lo cierran): campos a la izquierda, la plantilla de 240 mm con el elemento en 3D
  al centro (visor propio, `vista3DElemento` en app.js; se gira, acerca y mueve como en el diseño, con botones de
  vista) y la vista de arriba con la caja a la derecha; los dos se rehacen con cada cambio y al terminar se elige "Guardar como nuevo" (pide otro nombre; el
  original queda igual) o "Sobrescribir <nombre>" (pide confirmar; los diseños que lo usan cambian al abrirse).
  Sobrescribir uno del programa lo guarda en `Biblioteca/elementos.json` con su mismo id (la app lo marca
  `modificado` y reemplaza al original; `ORIGINALES` en app.js guarda cómo viene) y su tarjeta ofrece "Volver al
  original". Los propios además tienen Duplicar y Borrar. Campos agregados el 2026-11-14: subida desde atrás y bajada hacia
  adelante (olivas/gotas) y borde en diagonal (cuñas de retropié y antepié).
- Caja del elemento (2026-11-14, como "Editar 2D" de la biblioteca de LutraCAD): en el editor, "Editar forma con la
  caja" acerca la vista al elemento y pone un cuadro de 5 × 5 puntos encima. Clic elige un punto (Shift suma),
  arrastrar en vacío elige los de adentro del rectángulo, arrastrar los elegidos da forma con la herramienta
  elegida: Mover, Girar, Escala 1D (en la dirección en que se agarra) o Escala 2D, alrededor del centro de los
  elegidos (o de toda la caja si es uno solo); se calcula en el dibujo, a escala pareja. Se guarda en el elemento
  como `caja` = { u0, u1, v0, v1, nf, nc, d } (d = cuánto se movió cada punto, en fracciones de largo y de ancho de
  la fila). El motor (`desplazCajaElemento` en plantilla.js) interpola el desplazamiento con Catmull-Rom y lee la
  forma original en el punto de donde viene (se busca por aproximaciones), antes de suavizarla. "Restablecer forma"
  la quita. Prueba 15 del motor.
- Caja en el 3D (2026-11-14): el 3D del editor tiene el mismo cubo de vistas del diseño. Con la caja activa, en la
  vista Arriba se ven y se arrastran los mismos puntos (mismas herramientas; arrastrar en vacío elige, clic derecho
  gira la vista). En las vistas de costado aparece la caja de costado: 5 puntos arriba a lo largo del elemento (y
  5 abajo, fijos); subir o bajar uno cambia el alto en ese tramo y muestra los mm. Se guarda como `perfil` =
  { u0, u1, f } (alto relativo en cada punto; el motor lo interpola con Catmull-Rom, `factorPerfil`, y multiplica
  la forma antes de suavizarla). "Restablecer forma" quita caja y perfil.
- Caja del elemento en el diseño (2026-11-19, Ernesto): en el panel del elemento elegido, "Caja: editar la forma"
  pone la misma caja de 5 × 5 puntos sobre el elemento en el 3D (vista Arriba), con Mover, Girar, Escala 1D, Escala 2D
  y Lazo como la caja de la línea de corte; "↶ Paso" (o Ctrl+Z) deshace, "Restablecer forma" vuelve a la de la
  biblioteca y "Listo" (o Esc) termina. Cambia la forma solo en este diseño: se guarda en el elemento de la receta como
  `caja` = { izq, der } (cada una como la `caja` de la biblioteca; con "Mover igual en los dos pies" se copia al otro
  pie). Para dibujar y arrastrar los puntos, el motor devuelve con `conUV` de qué (u, v) del elemento viene cada punto
  de la malla (`uvs`). "Añadir a la biblioteca" guarda el elemento con esa forma.
- Los propios y los favoritos van a `Biblioteca/elementos.json` de la carpeta compartida (los ven las tres PC). Al
  conectar la carpeta se suman al programa: "Agregar elemento" muestra ★ Favoritos primero y después por categoría.
- Los elementos del programa tienen ahora `categoria` en `biblioteca/elementos.json`.

Ratón en el 3D (2026-11-13, pedido de Ernesto): arrastrar con el izquierdo mueve la vista (la pieza sigue a la
mano) y con el derecho la gira; Mayús invierte. El clic izquierdo sigue siendo el de las herramientas (medir, regla,
corte) y el de agarrar elementos y cotas. Rueda: acercar.

Editar línea de corte (2026-11-13, como LutraCAD): botón "Línea de corte" en las herramientas del 3D. Pasa a la
vista Arriba, dibuja el contorno en verde y abre el panel Acción con dos modos:
- Mover región: clic en la línea y mover el ratón (o arrastrar); el punto tomado va adonde va el ratón, en cualquier
  dirección (arriba, abajo, de costado), y el tramo de la región se vuelve a dibujar como curva suave que pasa por él
  y se une sin quiebre con el resto (dos curvas de Hermite con las tangentes de la línea original). La región se
  ensancha cuando se tira más ("Tamaño de la región", 60 mm por defecto; en naranja se ve qué parte se mueve). Otro
  clic lo deja.
- Edición libre: apretar sobre la línea, dibujar el tramo nuevo y soltar sobre la línea; ese tramo reemplaza al que
  había (el del lado del trazo), con un suavizado leve.
- Caja (2026-11-13, como LutraCAD): cuadro con grilla de 3 columnas × 14 filas alrededor de cada pie. Al mover
  puntos la línea se deforma suave (desplazamientos interpolados: Catmull-Rom a lo largo, parábola a lo ancho).
  Herramientas: Mover, Girar, Escala 1D (por el eje donde se agarra), Escala 2D (alrededor del centro de los puntos
  elegidos, o del cuadro si es uno solo) y Lazo. Clic elige un punto, Shift + clic suma o quita. Cada pie por
  separado; Paso atrás y Reflejar rehacen la grilla. Se guarda como la línea de corte editada.
- Vista de costado (2026-11-13, como LutraCAD): con la edición abierta, en las vistas Izquierda o Derecha se ve el
  borde de arriba del lado que mira a la cámara (rojo = como está, verde = como queda). Clic en la línea y subir o
  bajar el ratón: ese tramo sube o baja con una campana suave del tamaño de la región (se ensancha si se tira mucho;
  muestra los mm). Así se cambia el arco por el costado. Se guarda en la receta como `alturaBorde` = { izq, der } con
  { interno, externo }: 201 valores en mm a lo largo (fracción del largo, sigue a la talla). En el motor
  (`p.alturaBorde`) sube del todo en el borde y se apaga suave hasta el 40 % del ancho; la cara de abajo acompaña.
  Reflejar copia también lo editado; "Volver a la forma de la horma" lo quita. Prueba 14 del motor.
"↶ Paso" o Ctrl+Z deshace un paso, Esc suelta el tramo que se mueve (o cierra sin guardar), Enter o "Confirmar" la
guarda, "Cancelar" la descarta. Al confirmar queda como contorno de la plantilla (`contorno` de la receta, igual
que la forma de la muestra): largo y ancho pasan a los de la línea nueva, Ctrl+Z la deshace y "Volver a la forma de
la horma" la quita. Cada pie se edita por separado; "Reflejar izquierdo → derecho" (o al revés, según el último pie
editado) copia la línea al otro pie en espejo, como en LutraCAD. Si los pies quedan distintos, la receta guarda
`contorno.puntosDer`; el largo y el ancho del derecho guardan su proporción con el izquierdo, que es el que marcan
"Largo" y "Ancho".

Elementos con forma propia (2026-11-13): la oliva (todo elemento con `pieza` en elementos.json) se corre, gira y
agranda en mm y conserva su forma donde se la ponga; antes se estiraba o se angostaba con el ancho de la plantilla.
Las cuñas siguen adaptándose al borde, porque su forma depende de él.

Arco lateral (2026-11-14, captura de LutraCAD de Ernesto): media luna pegada al borde externo (`largo.tipo =
"arco"`), del 24 % al 62 % del largo desde el talón; entra hasta el 37 % del ancho en el medio del tramo y se afina
a punta en los dos extremos. Alto: lo más alto en el borde y baja parejo hacia adentro; a lo largo, de costado es
un huso como en LutraCAD (captura de costado de Ernesto): sube suave desde las puntas, sin escalón, hasta el medio
(`subida` 2 = seno²; suavizado 5 mm). El borde externo de la plantilla queda con una sola loma suave sobre la copa
y el arco (10 → 11,3 mm al 36 % y baja al antepié). Sigue el borde (no es rígido).

Barra metatarsal (2026-11-14, foto de Ernesto del pad 7904, izquierdo y derecho): ya no es una franja de borde a
borde sino una pieza propia (`pieza.planta = "campana"`): placa casi cuadrada (22 % del largo × 66 % del ancho,
frente al 72 % desde el talón), borde de atrás cóncavo (`concavo` 10 %), costados casi rectos (`angosta` 7 % más
angosta atrás), adelante hombros al 79 % (`hombro`) y una cúpula al medio (`cupula` 26 % del ancho). Alto: sube
desde atrás hasta el 60 % y baja redondeado al frente; bóveda a lo ancho. Es rígida (se mueve en mm como la oliva).
El pie derecho es el espejo. Las formas viejas tipo franja siguen como base "Barra de lado a lado" en "+ Nuevo
elemento". Los diseños guardados con la barra anterior la toman con la forma nueva al abrirse.

Colores en el 3D (2026-11-13, como LutraCAD): plantilla blanca con contorno verde oscuro, cada elemento en turquesa
liso y el elegido en verde. El borde del elemento (donde sube 0,12 mm) lo corta el visor en cada píxel (`col2` +
`marca` en visor.js), así sale nítido aunque la malla sea gruesa. Hay una luz desde la cámara para que lo que se
mira de frente se vea claro.

Ocultar la muestra (2026-11-13): botón "👁 Muestra" en la barra de vistas, junto a Izquierdo y Derecho. Aparece
solo con una muestra abierta y va junto con la casilla "Mostrar debajo (vista Arriba)" de la sección Muestra 2D.
"👁 Escaneo" (2026-11-19) hace lo mismo con el escaneo, en cualquier módulo.

Escaneo y muestra al volver a abrir un proyecto (2026-11-19, Ernesto): "Abrir carpeta del paciente…", "📁 Nuevo desde
carpeta…" y soltar la carpeta sobre el 3D usan, en Chrome/Edge, el acceso a la carpeta que el navegador deja recordar
(showDirectoryPicker / getAsFileSystemHandle). Se guarda en IndexedDB de esta PC como `paciente:<diseñador>/<carpeta del
proyecto>`; no se copia ningún archivo del paciente. Al abrir el proyecto (también después de recargar o cerrar) se
vuelve a leer esa carpeta; si el navegador pide permiso otra vez aparece "Volver a abrir la carpeta …" en Paciente (un
clic). Dentro de la misma sesión, el escaneo y la muestra ya abiertos se reponen de memoria (`archivosAbiertos`).

Correr y girar el escaneo y la muestra con el ratón (2026-11-19, Ernesto, como "Girar" de LutraCAD): clic sobre el
escaneo lo elige (se pinta verde) y aparece su panel con Mover / Girar; arrastrar sobre él lo corre o lo gira
alrededor del medio del pie (`escaneos[pie].ajuste` = { dx, dy, giro }, aplicado en `alinearEscaneo`, así el contacto
total lo sigue; no se guarda en la receta). "Mover o girar la muestra…" (sección Muestra 2D) hace lo mismo con el
dibujo de la muestra, arrastrando sobre la plantilla en la vista Arriba; reemplaza a los campos "Correr hacia interno",
"Correr hacia los dedos" y "Girar", que quedan ocultos (`muestraX`, `muestraY`, `muestraGiro`). "Volver a su lugar"
quita lo corrido y girado; Esc o "Listo" terminan. Con el escaneo a la vista, un clic sobre él lo elige en vez de la
plantilla (para elegir la plantilla debajo, ocultar el escaneo con "👁 Escaneo").

Valores por pie (2026-11-12, como el candado de LutraCAD): copa, antepié, altura y ubicación del arco y canto
tienen un candado al lado. Cerrado (por defecto) = el mismo valor en los dos pies. Abierto = el primer casillero es
el pie izquierdo y aparece otro para el derecho; al cerrarlo, los dos vuelven al valor del izquierdo. Las medidas,
la hoja del diseño, la receta y deshacer guardan los dos valores ("izq / der"; en la receta: `separados` y `der`).

Arco (2026-11-11): la altura se cambia en "Altura del arco" (desmarcar "Proporcional a la copa") y la ubicación
en "Ubicación del arco", en % del largo desde el talón (se puede de 28 a 52 %). Por defecto la cima queda al 35 %
como LutraCAD (Ernesto, 2026-11-12; la horma lo trae al 40 %). Comparado con la plantilla de LutraCAD de Mayra
Mateos (243 × 80 mm) el borde interno queda a 1–2 mm en todo el arco. El escaneo ya no cambia la ubicación: solo
la muestra como dato. El relieve entre el 15 % y el 65 % del largo se corre sin tocar la copa ni el antepié. El
escaneo muestra dónde está el arco del pie del paciente y, al abrirlo, pone esa ubicación (promedio de los dos
pies); se puede cambiar a mano.

Contacto total en el arco (2026-11-12, opción elegida por Ernesto): con escaneo abierto aparece en Alturas
"Contacto con el pie" (activo por defecto, 100 %). Solo el arco (Ernesto, 2026-11-12: "solo se adapte el arco, lo
demás no"): entre el 24 % y el 66 % del largo DEL PIE (no de la plantilla; 2026-11-13: con talla más larga que el
pie la zona llegaba al juanete y dejaba un escalón en el borde interno del antepié) y del lado interno (desde el 30 % del ancho de cada fila, del todo
desde el 60 %), la cara de arriba se lleva hacia la planta del pie del escaneo, con transición suave. La copa, el
lado externo y el antepié siguen siendo de la horma (la copa cambia menos de 0,2 mm).
Solo sube (Ernesto, 2026-11-12): el arco nunca queda más bajo que el de la horma. Con pie cavo sube hasta tocar el
pie (Santos: hasta 20,8 mm); con pie plano o escaneo cargando peso queda el arco de la horma (Mayra: 15,8 mm; su
plantilla de LutraCAD tiene 14,9 mm). Donde el escaneo sube a más de 45° es el costado del pie y no se copia. La diferencia se suaviza 5 mm para no copiar el ruido del escaneo y nunca baja del
espesor del antepié. Con menos de 100 % el arco queda en proporción más bajo. La receta guarda el %.
"Forma del arco": "Natural (alisada)" por defecto (pedido de Ernesto, comparado con el arco de LutraCAD): la
superficie se alisa a lo largo (25 mm) y se rellenan los pozos sin bajar la cima, así el perfil queda como una
campana continua que baja de a poco hasta el 80 % del largo. Queda en promedio 0,5 mm del pie (un poco más alta
que el pie). "Fiel al escaneo" copia el pie con más detalle (0,2 mm).

Ajuste al pie: con escaneo abierto, la herramienta "Ajuste al pie" pinta la diferencia entre la planta del pie y
la cara de arriba: azul = hueco, blanco = toca, rojo = la plantilla queda más alta que el pie (en la copa es
normal porque envuelve el talón).

Corte: clic en un punto y abajo aparecen el perfil a lo ancho y a lo largo por ese punto (plantilla, elementos en
naranja y planta del pie en azul punteado). La altura del dibujo va agrandada (se indica ×k).

Elementos: además de moverlos, en "Posición, giro y tamaño" se giran (°, positivo = frente hacia interno) y se
cambia su largo y ancho (%), por pie. Todo alrededor del centro del elemento y sin cambiar su altura.
Las combinaciones guardadas están en `biblioteca/combinaciones.json` (compartidas por todas las PC que usan
esta carpeta).

Muestra 2D: el PNG que hace `muestra_a_png.ps1` (la escala sale del nombre `_<dpi>dpi` o del PNG; los PNG del
escáner a 300 dpi también sirven, y la foto escaneada de una plantilla). `motor/muestra.js` busca el contorno
cerrado: cierra los huecos del trazo (hasta 12 mm, con una curva que sigue la dirección del trazo), borra la regla,
deja adentro las notas escritas dentro y afuera las de afuera. Lo mide, reconoce el pie por la curva del arco (se
puede cambiar en "Pie de la muestra") y lo dibuja debajo de la plantilla en la vista Arriba (en el otro pie, en
espejo). Se puede correr y girar a mano.

Carpeta del paciente (2026-11-12): "Abrir carpeta del paciente…" (arriba en Base) o arrastrar la carpeta sobre el
3D. Pone el nombre (de "Nombre-DNI"), carga los escaneos del Podoscan (IZ/DC o Izda/Dcha) con sus medidas y lee
todas las muestras escaneadas de la carpeta, directo del PDF del escáner (`motor/pdf.js`: JPEG, blanco y negro
CCITT G4 o Flate) o de un PNG. Reportes, recetas, RMN e incidencias no se miran. Si hay varias muestras, se elige
en "Muestra 2D". Abrir otra carpeta empieza un paciente nuevo (elementos y forma en cero; Deshacer lo devuelve).
En la vista Arriba, la línea roja fina es el contorno que encontró el programa; si el trazo estaba muy cortado o
es lápiz, aparece un aviso para revisarla. El navegador pregunta si "subir" los archivos: es solo a esta PC.

Forma de la muestra (2026-11-12): "Plantilla con la forma de la muestra" hace la plantilla con el contorno de la
muestra (a menos de 1 mm del trazo; solo se suaviza el temblor del lapicero). La copa, el arco y el antepié son los
de la horma del producto, repartidos en ese contorno (`hormaConContorno` en `motor/plantilla.js`). El largo y el
ancho quedan iguales a la muestra; si se cambian, la forma se estira. El contorno viaja en la receta (`contorno`),
así el diseño se rehace sin el PNG. "Volver a la forma de la horma" lo quita.
"Borde" elige cuánto se limpia el trazo: "Fiel al trazo" (tal cual), "Prolijo" (por defecto: quita doble línea,
bultos y entradas cortas sin cambiar la forma ni el largo; las paredes de la copa salen lisas) o "Muy prolijo"
(`contornoProlijo` en `motor/muestra.js`). El PNG no se toca: se limpia el contorno. "Usar solo largo y ancho de la
muestra" deja la forma de la horma. Probado con 12 muestras (zapatos, chimpunes, tacos, deportiva, muestra única
y una plantilla Hush Puppies escaneada) en `escaneos/muestras/`.

Elemento elegido: se ve en verde en el 3D (los demás en naranja) y su tarjeta queda marcada en verde.

Orden del doctor (borrador): `app/orden.html`. El doctor pone paciente, producto, talla (o "según escaneo"),
copa, antepié, elementos por pie y una nota, y descarga la receta. El programa la abre (botón o arrastrándola),
muestra la nota en Base y, si es "según escaneo", toma largo, ancho y arco del escaneo.

Hoja del diseño: botón en Exportar. Se guarda en `salida/` como `<paciente> … hoja.html` con medidas,
elementos, avisos y tres vistas; desde el navegador se imprime o se guarda en PDF.

Peso: "Peso del par (macizo)" usa la densidad del producto en `biblioteca.json` (1,2 g/cm³, a confirmar con el
material real).

## Carpetas

| Carpeta | Contenido |
| --- | --- |
| `app/` | La pantalla de diseño (`index.html`, `app.js`), el visor 3D propio (`visor.js`, WebGL sin librerías) y la orden del doctor (`orden.html`). |
| `motor/` | `plantilla.js` (geometría), `escaneo.js` (STL del Podoscan), `muestra.js` (PNG de la muestra). No dependen de la pantalla. |
| `biblioteca/` | Datos: hormas, productos, tabla de tallas, elementos y combinaciones. Agregar uno es agregar un archivo. |
| `escaneos/` | Ejemplos para las pruebas: escaneo Podoscan y dos muestras 2D. En `muestras/`, las muestras que pasó Ernesto (PDF y PNG). |
| `pruebas/` | Página que corre las pruebas del motor y muestra la forma. |
| `salida/` | STL, recetas y hojas del diseño. |
| `servidor.ps1` | Servidor local (solo esta PC). Solo deja escribir en `salida/` (STL, JSON, HTML) y en `biblioteca/combinaciones.json`. |

## Cómo correr las pruebas

```
powershell -ExecutionPolicy Bypass -File servidor.ps1
```

Luego abrir http://localhost:8765/pruebas/ en Chrome o Edge.

## Cómo se arma una horma de la biblioteca

`LutraCAD_analisis/hormas/suavizar_horma.ps1` lee el STL exportado de EasyCAD (cara de arriba, pie
izquierdo), suaviza el contorno, redondea talón y punta, y escribe `<nombre>_horma.json`. Ese archivo se
copia a `biblioteca/hormas/` y se registra en `biblioteca/biblioteca.json` con sus alturas de referencia.

### Editor de hormas (2026-11-17, pedido de Ernesto)

Inicio → Biblioteca → Hormas: cada horma tiene **Editar** y **Duplicar**; las propias, **Borrar**; las del programa
sobrescritas, **Volver al original**. El editor (pantalla completa, como el de elementos) muestra la plantilla de
muestra en 3D (260 mm, copa y espesor del tipo, arco neutro) y dos vistas:
- **Arriba**: 24 puntos sobre el contorno; arrastrar uno mueve el borde con una campana suave del radio elegido (mm).
- **Costado**: rojo = lo más alto del lado interno, amarillo = borde externo; arrastrar un punto sube o baja ese
  tramo (multiplica el factor de relieve `interno`/`externo` con una campana de ±10 % del largo, puntos cada 2 %,
  y corrige hasta 3 veces). La cima del arco y la copa quedan en los valores del diseño: se cambia la forma entre ellos.
- Tipo (delgada/estándar), cima del arco (%), deshacer, **Guardar como nueva** (otro nombre) o **Sobrescribir**.
Se guardan en la carpeta compartida, `Biblioteca/hormas.json` (con sus puntos adentro); las ven las tres PC. Una
receta con una horma borrada abre con la guía de tallas.

### Muestra 2D al centro del trazo (2026-11-17, decisión de Ernesto)

Antes el contorno quedaba en el borde de afuera del trazo. Ahora `analizarMuestra` mide el grosor del trazo en la
imagen (cruza el trazo por la normal en 1 de cada 4 puntos del borde; mediana) y corre el contorno medio grosor hacia
adentro; el largo y los anchos devueltos también restan el grosor (`grosorTrazo` en el resultado). En las muestras
de ejemplo el trazo mide 0,25 a 0,57 mm. La foto de una plantilla (sin trazo) no cambia.

### Hormas de las capturas de LutraCAD (2026-11-17)

- **Base interna**: el STL de EasyCAD (`hormas/guia_tallas.json`) quedó como `base_easycad` (oculta). Las hormas que
  se eligen salen de ella: contorno propio + factores de relieve (`interno` y `externo`, este último nuevo).
- **Guía de tallas**: estándar por defecto (copa 14, espesor 2). Contorno de `guia_arriba.png`; relieve ajustado a
  los dos costados. Cima del arco al **40 %** como en la captura (antes el programa la ponía al 35 %).
- **Chimpunes**: delgada (espesor 1,5). Copa recta y baja por el borde externo hasta el 45 % (`copaLado: externo`),
  lado interno que sube de a poco desde el talón hasta la cima al 34 %.
- **Crocs**: mismo relieve; contorno sacado otra vez con el borde sombreado incluido (el anterior quedó en
  `referencias/crocs_contorno_anterior.json`).
- Diferencias medidas contra las capturas: contorno ≤ 0,6 mm; lado interno ≤ 0,6 mm; borde externo ≤ 0,2 mm (prueba 19).
- `hormas/contorno_de_captura.ps1`: saca el contorno de una captura de arriba (gris = plantilla, azul = fondo).
- Ajuste del relieve: se mide la silueta interna y el borde externo de las capturas de costado y se corrigen los
  factores por tramos hasta < 1 mm. En la punta del talón los dos lados llevan el mismo factor (sin escalón).
- Recetas viejas: la copa guardada define si son delgadas o estándar (una resina con copa 10 sigue delgada).

### Biblioteca con menú y descargas (2026-11-16, pedido de Ernesto)

- **Biblioteca** como LutraCAD: menú a la izquierda (Hormas · Elementos: Elementos y Descargas) y lista en filas.
- **Guía de tallas = STL de referencia de Ernesto** (2026-11-17, "idéntico a la referencia"): 
  `referencias/guia_de_talla_L_optimizada_v2.stl` (pie izq. 268 mm, copa 13, espesor 2, arco 20,1 al 40 %) se pasó al
  formato de horma (`hormas/guia_stl.json`: cara de arriba cada 0,5 mm, 61 columnas; el chaflán del borde del antepié
  se subió a 2 mm porque el programa pone su canto). Horma raíz oculta `base_guia_stl` con `op` de suavizado propio
  (`recorteBorde` 0,01, `suaveAncho` 0,03, `suaveLargo` 0,002, `suaveContorno` 1; app.js pasa `m.op` / `b.op` a
  `prepararHorma`). `guia_tallas` = `base: base_guia_stl` sin relieve ni contorno. Con copa 13 / espesor 2 / arco 20,1
  queda a 0,08 mm del STL en promedio (95 % < 0,39 mm), pliegue 8,3°. Luego (pedido de Ernesto) se compensaron las
  paredes de la copa, que salían 0,2–0,3 mm bajas por el suavizado: 2 pasadas sumando la diferencia con el STL a los
  datos, suavizada, sin tocar 3 columnas de cada borde (canto) ni 6 mm de cada punta (si no, sale un pico en la punta
  de los dedos). Ahora prueba 19: media 0,06 mm, 95 % < 0,26 mm, pliegue 8,7°; copa 10–18 sin pliegues > 10,2°. Prueba 19 compara toda la cara de arriba con el
  STL. Copa 10–18 y arco 20–23 dan las medidas pedidas sin pliegues > 9,5°. El editor de hormas, si la horma no trae
  archivo de contorno, toma el de la propia horma (`defHorma`).
- Editor de hormas, vista de costado en proporción (2026-11-17, "se ve desproporcionada"): la altura va aumentada 3
  veces respecto del largo (`EXAG` en biblioteca.js; antes ~6), lienzo de 300 × 110, rótulo "altura ×3".
- **4 módulos como LutraCAD** (2026-11-17): 1. Base · 2. Diseño · 3. EVA o 3. Imprimir (según el "Método de
  producción", el antiguo "Producto": "Fresado: …" sin acabado, "Impresión 3D: …" con acabado) · 4. Exportar. En Base
  y Diseño la plantilla se ve como **lámina** de espesor parejo (`lamina(g)`: abajo = arriba − espesor del antepié,
  abajo en verde `COLOR_LAMINA`), solo para ver; en 3 y 4 se ve el sólido real y el diseño queda fijo
  (`fijoModulo()`). En 3. EVA está el alto del bloque (`#altoBloque`); el G-code sigue en 4. Exportar.
- Editor de hormas: al elegir la plantilla, dos modos como LutraCAD: "✂ Editar línea de corte" (solo puntos azules
  del contorno) y "✎ Editar alturas" (rojos interno / amarillos externo); solo se muestran y se agarran los puntos
  del lado que mira a la cámara (`seVe`, por la normal de cada punto; desde arriba, todos).
- **Correcciones como LutraCAD** (2026-11-17, sección "Correcciones" en 2. Diseño, valor izq/der, receta
  `correcciones: { arcoMedial: [i, d], moverApice: [i, d] }`), medidas en vistas de costado de LutraCAD que mandó
  Ernesto: **Corrección del arco medial** = campana gaussiana a lo largo (sigma 12 % del largo: del ~10 % al ~59 %)
  centrada en la cima del arco, solo hacia el lado interno (`suave((v−0,3)/0,6)`), sumada después de las alturas
  (motor: `p.arcoMedial`, paso 2c); talón y antepié no cambian. **Mover ápice** = corre la cima esos mm hacia los
  dedos (motor: `p.moverApice`, en `correrArco`). Desde 2026-11-19 (Ernesto) corre el arco entero a la par: desde su
  comienzo (12 % del largo antes de la cima) hasta la cima; entre la copa del talón (12 %) y el comienzo, y entre la
  cima y el 65 %, se estira o encoge suave. Copa y antepié no cambian. Pendientes, cuando haya
  capturas: ancho de la plantilla, ancho del talón, altura de la cazoleta, elevación del talón, suave.
- **G-code para la fresadora de EVA** (2026-11-17, `motor/fresado.js`, botón "G-code para la fresadora (EVA)" en
  Exportar, solo con productos sin acabado de resina). Máquina: Sensor Medica VX1R (2021) con EdingCNC 4.03.55, CPU5A,
  en mm. Formato copiado de un trabajo real de la máquina (proyecto de un paciente, .iso descargado en la PC de la
  fresadora): par en un bloque de 350 × 260 mm (alto 26–30), cero en el centro, Z 0 = base; cada plantilla a lo largo
  de X (talón en X−), izquierda en Y+ y derecha en Y− con el arco hacia el centro (borde interno a |Y| = 7); relieve
  en zigzag (filas cada 0,5 mm a lo ancho, puntos cada 2 mm, X impares); contorno corrido 5 mm (radio de la fresa) con
  una vuelta a Z 15 y otra a Z 1; `S24000 M03 G64`, todo G01 (F14400 trasladar, F900 bajar, F1800 cortar); fin
  `G01 Z55 / G28 / M5 / %`, saltos de línea LF. Fresa de bola Ø 10 mm (Ernesto): la altura de cada punto se calcula
  para que la bola no toque la plantilla. Avisa y no genera si no entra en el bloque o si pasa el alto del bloque.
  Se guarda como "… fresadora.iso" en la carpeta del proyecto. Prueba 20. Antes de usarlo de verdad: verlo en la
  vista de EdingCNC, pasarlo en el aire y luego en un bloque de prueba.
  **Máquinas: mesas de trabajo e impresoras** (2026-11-19, Ernesto, como la mesa de trabajo de LutraCAD): Inicio →
  Máquinas (`app/maquinas.js`) lista varias mesas de trabajo de la fresadora y perfiles de impresora 3D, guardados en la
  carpeta compartida (`Biblioteca/maquinas.json`, las ven las tres PC). Mesa: bloque (largo, ancho, alto por defecto),
  fresa (diámetro de punta redonda, giro rpm), avances (trasladar, bajar, cortar), relieve (paso entre filas, paso entre
  puntos, dejar de más arriba para pulir), contorno (cortarlo sí/no, 1.ª y 2.ª vuelta, corte más afuera del borde),
  ubicación (borde interno al centro, altura segura). Impresora: área X × Y × Z y notas. La "Sensor Medica VX1R" y la
  impresora vienen de fábrica (se editan; "Valores de fábrica" las repone); las propias se crean, duplican y eliminan.
  En el diseño solo se elige: la mesa en 3. EVA (pone su alto de bloque) y la impresora en 3. Imprimir; la receta guarda
  `mesa` e `impresora` (id). El G-code toma los valores con `opcionesGcode`. La de fábrica da exactamente el G-code de
  antes (prueba "Mesa de trabajo del G-code"). El archivo de mesa de LutraCAD (.lrss) viene cifrado: no se pudo leer;
  un G-code real hecho con LutraCAD (no de paciente) usa los mismos S24000 / F14400 / F900 / F1800.
- **Identidad visual azul + blanco** (2026-11-19, Ernesto, referencia de color #1838D9): `app/marca.css` se carga
  encima de `estilo.css` (quitar su `<link>` vuelve al aspecto anterior). Barra de arriba y módulo activo en degradado
  azul, panel izquierdo en tinte azul claro, visor blanco con halo azul, Inicio / Biblioteca / Máquinas sobre azul con
  luces difuminadas y tarjetas translúcidas, botones principales blancos sobre azul. En el 3D, el contorno de la
  plantilla y los elementos van en azul de la marca; elegido (verde), su par (rojo) y descargas (naranja) no cambian.
  La Orden del doctor lleva los mismos colores. Ícono azul en la pestaña.
- **Auditoría 2026-11-19** (después del cambio visual): aviso real si la plantilla no entra en la impresora elegida
  (la nota lo prometía y no se hacía); la carpeta del paciente se recordaba en el proyecto equivocado si se cambiaba
  de proyecto mientras cargaba, y al reabrir podía cargarse en otro proyecto; al eliminar un proyecto ahora se olvida
  el acceso a la carpeta del paciente; carpeta vacía avisa; el escaneo en memoria se limita a los 6 últimos proyectos;
  el G-code no se genera si la altura segura queda a menos de 10 mm sobre el bloque (seguridad) y las vueltas del
  contorno siempre van de arriba hacia abajo; el panel del escaneo o la muestra se cierra al pasar a Imprimir o
  Exportar y al abrir otra carpeta; ícono de la pestaña (error 404 en la consola).
- **Chimpunes y Crocs rehechas desde las capturas** (2026-11-17, Ernesto: "se ven tan mal… idénticas a las imágenes").
  Las de antes (base EasyCAD + factores de relieve cada 2,5 %, hasta ×12) tenían arrugas a lo ancho. Ahora cada una es
  una horma raíz propia (`base_chimpunes` / `base_crocs`, datos `hormas/chimpunes_datos.json` / `crocs_datos.json`),
  armada con `herramientas/horma_de_capturas.js`: contorno de arriba, lado interno (silueta del costado interno) y
  borde externo (línea blanca del costado externo; copa recta hasta el 42 % / 40 %), cortes de lado a lado de la Guía
  (STL) como molde, sin cortes bruscos, alisada 6 mm a lo largo, puntas del talón y de los dedos parejas, y 4 pasadas
  de corrección (alisadas). Contra las capturas: Chimpunes ±0,22 / ±0,10 mm, Crocs ±0,28 / ±0,21 mm; pliegue 3,4–4°.
  Prueba 19 las compara con las capturas (`armarDesdeCapturas`, `perfilCostado`); prueba 16 mide pliegues fuera del
  2 % del talón y abajo admite 33° (canto del acabado: 28° ya con la Guía).
- **Editor de hormas sobre el 3D** (2026-11-17, Ernesto): sin vistas 2D. Clic en la plantilla → "✎ Editar con puntos":
  azules en el borde (mueven el contorno sobre el plano del borde, radio en mm), rojos (lado interno) y amarillos (borde
  externo) suben o bajan (escala de la pantalla igual al largo; ±10 mm por arrastre). `editorHorma.vista3D` devuelve
  `visor`; capa `#eh-capa`, barra `#eh-barra`. Sin archivo de contorno, `defHorma` toma el de la horma.
- STL de referencia de Ernesto (`referencias/referencia eva|3d nuevo programa_L|R.stl`): misma cara de arriba (0 mm);
  EVA = bloque con base plana y paredes rectas; 3D = macizo, plano al centro y la base sube cerca del borde (hasta
  9,4 mm bajo el arco interno): es lo que ya hace el acabado de resina. Falta el acabado de EVA.
- **Copa y arco por capas** (Ernesto, 2026-11-19; reemplaza la regla de 2026-11-17 "arco siempre 6 mm sobre la copa"):
  `prepararHorma` separa el relieve en capa de copa (el lado externo, reflejado del lado interno) y capa de arco (lo
  que el interno sube sobre eso); `alturasPorCapas` parte de la horma con su copa aprobada (`ref.copa` de la
  biblioteca), suma el cambio de copa solo en el talón (externo hasta el 40–70 %, interno hasta el 15–40 %) y escala el
  arco del lado interno (15 %–65 %) para que la cima quede en el arco pedido. Así una horma delgada puesta en estándar
  no hace meseta, la cima no se corre y el arco puede bajar de copa + 6 (con copa 14 no baja de ~14: aviso
  `#avisoArcoSube`). Prueba 22 "Copa y arco por capas". Comparado con LutraCAD (capturas de costado: copa 10 → 14 con
  el arco igual, 17,09 mm). Las hormas sin capas siguen con `curvaAlturas`. Corregido el 2026-11-19 (Ernesto con
  Chimpunes: "cuando aumento la copa el arco se va para atrás"): del lado interno el cambio de copa ahora se apaga 14 %
  del largo antes de la cima de la horma (`ref.arcoPos`; nunca después del 40 %), porque en Chimpunes (cima al 35 %) y
  Crocs (38 %) el 40 % ya era dentro del arco y la cima se corría hasta 40 mm hacia el talón. Prueba 27 "Subir la copa
  no corre el arco" (copa 10, 14 y 18 en las tres hormas).
- (Antes) Arco de la Guía de tallas (2026-11-17, Ernesto eligió la propuesta "C1" vista de costado): lado interno 100 % recto a
  14,6 mm desde el talón hasta el 16 %, sube parejo hasta 20 mm al 38 % (`valores.arcoPos` 0,38) y baja largo hasta
  2,6 mm al 66 %. Factores `relieve` reajustados (interno a ±0,2 mm de la curva; borde externo igual que antes, ±0,4 mm,
  sin el bulto de la punta del talón). Prueba 19 actualizada; su control de talón ahora mide el salto entre puntos
  vecinos del borde (< 0,3 mm), porque el borde sube parejo de 13,4 (externo) a 14,6 mm (interno).
- Miniaturas (2026-11-17, como LutraCAD): silueta gris clara con luz (`luzCara`, `SILUETA` en app.js), sin recuadro y
  solo con el nombre; los datos (copa, espesor, altura…) salen al pasar el mouse. Hormas: la plantilla entera;
  elementos y descargas: solo la forma del elemento (`miniaturaElemento(def, cv, { silueta: true })`), con el borde
  recortado por interpolación dentro de cada celda para que salga liso.
- **Descargas**: elementos con `"descarga": true` (categoría "Descargas"); `altura` = profundidad. El motor hunde la
  cara de arriba (la de abajo no cambia) y nunca deja menos de `p.espesorDescarga` (1 mm) sobre la cara de abajo,
  con un mínimo suave (sin arista). En el 3D y en la biblioteca se pintan en naranja. Si el espesor frena la
  descarga, "Revisión" avisa cuánto pudo hundir. Prueba 18.
- Descargas de partida (formas a confirmar con LutraCAD): 1.er metatarsiano, 5.º metatarsiano y talón (espolón).
  "+ Nueva descarga" parte de una forma ovalada, en gota o de talón.
- Límite físico: en un diseño delgado (1,5 a 2 mm de espesor) una descarga solo puede hundir 0,5 a 1 mm.

### Auditoría (2026-11-16): bugs encontrados rompiendo los flujos, y su arreglo

1. **Último cambio perdido** al ir a Inicio y abrir otro proyecto en menos de 0,5 s (podía guardarse en el otro
   proyecto). Ahora `antesDeSalir` anota y guarda lo pendiente, y el guardado recuerda a qué proyecto pertenece.
2. **Mismo paciente en el mismo minuto** caía en la misma carpeta y pisaba el diseño del primero: ahora "(2)", "(3)".
3. **Recetas dañadas** dejaban la pantalla a medio cargar o el programa trabado (línea de corte rota):
   `limpiarReceta` descarta lo que no tiene el formato; si igual falla, vuelve el diseño anterior; un error al
   generar se avisa y no traba.
4. **Ancho escrito rápido** se acumulaba (90,5 → 77,5 mm): la proporción sale de la última plantilla generada; el
   talón se afina hasta ±0,2 mm.
5. **Valores imposibles** (largo 9999, arco 500, elemento de 500 mm): cada casillero respeta su mínimo y máximo
   ("Revise: …" en el estado); los elementos van de 0 a 15 mm también desde la tarjeta y en recetas.
6. **Línea de corte abierta en Exportar**: al pasar a Exportar se guarda lo hecho y se cierra.
7. **Nombres que fallan en Windows** ("Dr." pierde el punto, "CON" es reservado): se corrigen al crear.

### Estética (2026-11-16, pedido de Ernesto: más intuitivo, solo estética)

`app/estilo.css`, cargado después de los estilos de `index.html`; quitar su `<link>` vuelve al aspecto anterior. Sigue
las guías frontend-design (Anthropic), web-design-guidelines (Vercel) y design-taste-frontend (se leyeron, no se
instalaron): títulos sin mayúsculas, un solo azul de acción y verde para "elegido", foco visible con teclado, filas
alineadas, paneles flotantes iguales, inicio sin degradé ni brillos, respeta "reducir movimiento". No cambia código.

### Tipos de diseño y de arco, Medidas y alturas, plantilla elegida (2026-11-16, pedido de Ernesto)

- **Tipo de diseño** (sección Plantilla): delgado = copa 10, espesor 1,5; estándar = copa 14, espesor 2
  (`tiposHorma`). El producto trae el suyo (resina delgado, EVA estándar) y una horma delgada o estándar lo pone.
- **Tipo de arco**: neutro 20, plano 21, cavo 23 mm (`tiposArco`, iguales en delgado y estándar) o "A mano"
  (con candado izq/der). Recetas de antes sin arco quedan "Proporcional a la copa (receta antigua)", como se hicieron.
- **Medidas y alturas** (una sola sección, editable): largo, ancho antepié, ancho talón, copa, alto de arco y antepié
  (espesor). Los anchos se escriben como se miden en la plantilla: el del antepié se pasa al ancho de la horma
  (oculto, `ancho`); el del talón a `escalaTalon` (motor: angosta o ensancha solo el talón, pasa a 1 entre el 22 % y
  el 50 % del largo; prueba 17). "Más ajustes" guarda ubicación del arco y canto del borde. En Exportar se ve fija.
- **Plantilla elegida**: clic en una plantilla (fuera de los elementos) abre su panel con "Línea de corte" y
  "Reflejar en la otra" (= "bilateral" de Ernesto: copia solo la plantilla, o sea alturas, línea de corte y altura del
  borde, en espejo; los elementos no, cada uno se refleja desde su panel; Ctrl+Z la deshace).
  El botón "Línea de corte" ya no está en la barra.

### Biblioteca de hormas (2026-11-16)

Clasificación del área (Ernesto): **delgadas** (Crocs, resinas 3D, botines, mocasines, zapatos de vestir,
sandalias, chimpunes; copa 10, antepié 1,5) y **estándar** (urbanas, deportivas, botas de seguridad; copa 14,
antepié 2). Está en `biblioteca.json` → `tiposHorma`. Cada horma lleva `tipo` (o ninguno: la guía de tallas sirve
para las dos y toma copa y antepié del producto) y puede cambiar sus valores en `valores` (`copa`, `antepie`,
`arcoPos`).

Una horma sin STL propio se arma desde otra (`base`):
- `contorno`: archivo con los puntos del borde (pie izquierdo, mm, talón en Y = 0, interno hacia +X). El relieve de
  la base se reparte en proporción (`hormaConContorno`).
- `relieve`: factores sobre el relieve de la base a lo largo (`todo` = todo el ancho; `interno` = hacia el lado
  interno), como `[[fracción del largo, factor], …]`; el motor los une con una curva monótona (`curvaPuntos`).

**Crocs**: contorno sacado de `hormas/referencias/crocs_arriba.png` (punta ancha y cuadrada, antepié 0,37 del largo).
Copa recta (Ernesto, 2026-11-16): el borde externo queda a la altura de la copa desde el talón hasta el arco
(`copaLado: "externo"`: la copa de la horma y la de "Medidas" se miden solo en el borde externo). El lado interno sube
de a poco desde el talón hasta la cima al 39 % (`crocs_costado2.png`) y baja más rápido que la guía hasta el 65 %
(`crocs_costado.png`). Arco por defecto 20,8 mm con copa 10 (`valores.arco`, aprobado por Ernesto; con otra copa
crece en proporción). Prueba 16: borde externo a 10 mm ± 0,3 y lado interno a < 1 mm de la captura.

En la pantalla: "Horma" en la sección Plantilla (agrupadas); al cambiarla se ponen su copa, antepié y ubicación del
arco. La receta guarda `horma` (las viejas toman la del producto). La línea de corte editada o la muestra se
mantienen: el relieve es el de la horma elegida. En Inicio → Biblioteca aparece "Hormas" con el dibujo de arriba y
de costado. Para sumar una horma: capturas de arriba y de costado (o el STL), y se registra igual que la Crocs.

## Referencias (definido por Ernesto el 2026-11-11)

- El largo sale siempre de la tabla de tallas (`biblioteca/tallas_guia.json`).
- De la horma de EasyCAD solo se toma la proporción del contorno (ancho respecto del largo).
- La forma 3D de la resina no se toma de EasyCAD. El acabado de la cara de abajo sale de una resina de
  LutraCAD (diseño delgado, con cuña externa de retropié de unos 4 mm), solo como proporción: en el centro la
  base es plana y cerca del borde sube hasta dejar un canto fino (mínimo 1,2 mm). Está en
  `biblioteca/acabados/base_curva.json` y se saca con `herramientas/extraer_acabado.ps1`.

## Acabado (revisado contra el STL de LutraCAD el 2026-11-11)

- La malla va en anillos, del contorno hacia una línea central. El contorno de la horma se suaviza como
  curva cerrada, así el talón y la punta salen redondos y sin quiebres.
- El relieve de la horma se suaviza y se le quita el labio plano del borde: la copa baja desde el canto mismo.
- La cara de abajo sube según la distancia al borde y llega hasta un canto fino y redondeado (1,2 mm).
- `herramientas/ver_stl.ps1` dibuja dos STL con la misma vista para compararlos. La prueba "Acabado liso"
  vigila el mayor quiebre del contorno y los pliegues de las dos caras.

## Reglas de alturas

Confirmado por Ernesto el 2026-11-11: el arco baja en proporción a la copa. Las otras dos reglas salen de
comparar las hormas 43 y 46 de EasyCAD y falta confirmarlas con más tallas.

- Las alturas no cambian con la talla: solo cambian el largo y el ancho.
- El ancho crece en proporción al largo, salvo que se pida un ancho.
- Sobre el antepié, el relieve de la horma se reparte en dos tramos (hasta la copa y de la copa al arco).
  Si no se pide un arco, baja en la misma proporción que la copa: con copa 10 y antepié 1,5 mm el arco
  queda en 15,4 mm (la horma trae copa 14, antepié 2 y arco 21,5 mm).
- **Fresado EVA, 2026-11-21** (primera prueba real en la VX1R, salió bien): (1) el contorno ahora empieza en la punta
  de los dedos y baja 3 mm afuera de la plantilla (antes bajaba junto al arco interno y en el pie derecho la fresa
  mordió ahí); (2) velocidad del relieve como LutraCAD: F1800 solo los primeros 3,5 mm de cada plantilla y el
  contorno, el resto a F14400 (tardaba 40 min contra 15-20 de LutraCAD; tiempo teórico 52 → 9 min). Los dos valores
  se cambian en Inicio → Máquinas ("Fresar el relieve", "Ancho que entra despacio"). Prueba nueva: revisa el recorrido
  cada 0,2 mm también entre puntos.
- **Velocidad punto medio y materiales EVA, 2026-11-21** (Ernesto: rápido como EasyCAD sin arriesgar la fresa): el
  relieve va a F6000 de fábrica (≈14 min el par de 255 mm; LutraCAD usa 14400, todo a 1800 eran 40 min). Lo que más
  carga la fresa sigue lento a F1800: la entrada (primeros 3,5 mm de cada plantilla, corta el bloque a toda su altura)
  y el contorno. Inicio → Máquinas tiene la pestaña **Materiales EVA**: Relax S20 (relieve F6600), Protection S40
  (F6000) y Dynamic S50 (F5400; más duro = más carga). En el diseño, 3. EVA → "Material EVA"; sus velocidades
  reemplazan a las de la mesa, se guarda en la receta (`materialEva`) y el nombre va en el archivo del G-code.
- **Impresora de fábrica = Bambu Lab H2D (TPU), 2026-11-21**: con los mods oficiales para TPU, que va por una sola
  boquilla → área 325 × 320 × 325 mm (antes 350 × 320 × 325 de relleno; 350 solo sumando las dos boquillas).
