# Informe QA: hallazgos y guía de solución

> **SUPERADO:** este informe inicial marcó QA-01 como defecto por una lectura equivocada. En `['Archivo', m.nombre]`, el nombre estaba en `y`, que ya se escapaba. Ver [REPORTE_QA_REAUDITORIA.md](REPORTE_QA_REAUDITORIA.md) para la corrección de esa conclusión y la reauditoría del estado actual.

**Proyecto:** Programa de plantillas (Lima Blue)  
**Fecha de auditoría:** 18 de noviembre de 2026  
**Alcance:** revisión estática de interfaz, importación de archivos, validación de medidas, exportación y controles del servidor local.  
**Estado:** se identificaron dos defectos reproducibles por inspección de código. Este informe propone los cambios; no se modificó el código del proyecto.

## Resumen

| ID | Prioridad | Hallazgo | Archivo |
|---|---|---|---|
| QA-01 | Alta | El nombre de una muestra se inserta en HTML sin escapar. | `app/app.js` |
| QA-02 | Alta | La validación que bloquea exportaciones no comprueba el ancho de antepié ni el ancho de talón. | `app/app.js` |

## QA-01 — Escapar el nombre del archivo de muestra antes de mostrarlo

**Prioridad:** Alta.  
**Ubicación:** `app/app.js`, alrededor de las líneas 1300–1308; la inserción vulnerable está en la línea 1306.

### Qué sucede

`ponerMuestra(m)` construye las filas de la tabla con `innerHTML`. El nombre `m.nombre` proviene de `f.name`, es decir, del nombre local del archivo abierto. La plantilla de fila inserta el primer valor directamente:

```js
.map(([x, y]) => `<tr><td>${x}</td><td>${esc(y)}</td></tr>`).join('');
```

El valor `x` no se escapa. El segundo valor sí pasa por `esc`, lo que confirma la diferencia en el tratamiento.

### Impacto

Un archivo cuyo nombre incluya marcado HTML puede alterar la tabla y, con contenido preparado, ejecutar código en el origen local del programa al abrir la muestra. Esto también contradice la documentación de seguridad, que indica que los nombres y datos mostrados se escapan.

### Cómo reproducir de forma controlada

1. En una copia de prueba, crear un PNG válido para el programa y ponerle un nombre que contenga marcado HTML, por ejemplo una etiqueta de imagen con un manejador `onerror` inocuo que cambie el título de la página.
2. Abrir el programa y cargar ese PNG como muestra.
3. Observar si se modifica el título de la página o si el marcado aparece interpretado dentro de la tabla de medidas.
4. Repetir con un nombre de archivo normal para confirmar que la muestra sigue cargándose.

Hacer esta comprobación solamente en un entorno de prueba; no usar un archivo con código que lea o transmita datos.

### Corrección propuesta

Escapar ambos valores antes de interpolarlos en el HTML:

```js
.map(([x, y]) => `<tr><td>${esc(x)}</td><td>${esc(y)}</td></tr>`).join('');
```

También conviene buscar otras interpolaciones de datos externos en `innerHTML`. En esta revisión, el nombre de muestra de esa tabla es el caso concreto identificado; los nombres en la lista desplegable de muestras sí se pasan por `esc`.

### Criterios de aceptación

- Un nombre con `<`, `>`, `&`, comillas o marcado HTML se muestra como texto literal.
- No se ejecuta ningún manejador HTML procedente del nombre del archivo.
- El nombre normal y las demás medidas siguen mostrándose correctamente.

## QA-02 — Incluir ambos anchos en la validación que bloquea la exportación

**Prioridad:** Alta.  
**Ubicación:** `app/app.js`, manejadores alrededor de las líneas 381–390 y función `valoresFuera()` alrededor de las líneas 1020–1038.

### Qué sucede

Los campos de ancho tienen límites HTML: antepié de 40 a 140 mm y talón de 30 a 110 mm. Sus manejadores de entrada comprueban el rango y no actualizan el modelo si el valor no es válido. Sin embargo, la función `valoresFuera()` —usada por `hayFueraDeRango()` antes de exportar STL, receta y hoja— valida largo, copa, espesor, canto, arco y correcciones, pero omite `anchoAntepie` y `anchoTalon`.

Por lo tanto, cuando se escribe un ancho inválido, puede quedar visible en el campo mientras el modelo conserva el último ancho aceptado. La función de bloqueo no detecta ese estado y puede permitir exportar la geometría anterior con una pantalla que muestra otro valor.

### Impacto

La persona usuaria puede creer que exportó una pieza con el ancho visible en pantalla, cuando el archivo corresponde al ancho válido anterior. En fabricación, esa discrepancia puede producir una pieza que no coincide con la orden o con la revisión visual.

### Cómo reproducir de forma controlada

1. Abrir un proyecto de prueba y esperar a que se genere la plantilla inicial.
2. Desactivar el ajuste automático del ancho del antepié.
3. Escribir `150` en el campo de ancho del antepié (el máximo indicado es 140 mm). Repetir por separado con `120` en ancho de talón (máximo 110 mm).
4. Observar si el campo conserva el valor introducido mientras el modelo queda con su geometría anterior.
5. Pulsar la acción de exportar y comprobar si aparece un bloqueo por valor fuera de rango o si se guardan archivos.
6. Repetir con valores dentro de los rangos para confirmar el flujo normal.

Realizarlo en un proyecto desechable para no confundir archivos de prueba con producción.

### Corrección propuesta

Agregar los dos campos a la validación, respetando cuándo cada campo representa un valor editable. Una solución directa es incluirlos en el listado de `ids` de `valoresFuera()`:

```js
const ids = ['largo', 'anchoAntepie', 'anchoTalon', 'copa', 'antepie', 'canto'];
```

Antes de aplicar esa forma, comprobar el comportamiento de los campos en modo automático: si el ancho se calcula y el campo se rellena desde el modelo, validar su valor mostrado no debe bloquear un diseño válido por una diferencia de redondeo. Si ocurre, validar el campo solo cuando su modo automático está desactivado:

```js
const ids = ['largo', 'copa', 'antepie', 'canto'];
if (!$('anchoAuto').checked) ids.push('anchoAntepie');
if (!$('anchoTalonAuto').checked) ids.push('anchoTalon');
```

La validación debe informar cuál campo está fuera de rango y bloquear todas las exportaciones, igual que para los demás campos. Conviene además revisar si las recetas importadas pueden asignar a `ancho` valores fuera de rango; el sanitizado de recetas debería impedir que esos datos eludan el control de la interfaz.

### Criterios de aceptación

- Un ancho manual fuera del rango se identifica como inválido y bloquea STL, receta, hoja y G-code.
- El mensaje indica el campo y sus límites.
- Corregir el valor a un número dentro del rango vuelve a habilitar la exportación.
- Con los anchos automáticos activados, los valores calculados válidos siguen exportándose.
- Una receta con ancho inválido se rechaza o se limpia de manera explícita; no produce silenciosamente una geometría extrema.

## Plan de verificación después de aplicar las correcciones

1. Ejecutar las pruebas automatizadas del motor desde `pruebas/` en una máquina con Node.js y el servidor local disponible. Tener en cuenta que la página de pruebas guarda STL en `salida/`.
2. Añadir una prueba de regresión para el escape del nombre, o verificarlo manualmente con un archivo de prueba y confirmar que el marcado se muestra como texto.
3. Añadir pruebas de límites para ambos anchos: justo dentro del mínimo/máximo, fuera por debajo y fuera por encima.
4. Confirmar que cada acción de exportación se bloquea ante los campos inválidos y funciona después de corregirlos.
5. Revisar el diff final para confirmar que el cambio de seguridad cubre todas las interpolaciones de datos externos relevantes.

## Límites de esta auditoría

- La revisión fue estática: en este entorno no estaba disponible Node.js, así que no se ejecutó la batería JavaScript ni se comprobó la interfaz en un navegador.
- Las reproducciones anteriores son procedimientos propuestos a partir de las rutas del código; no se ejecutaron durante la auditoría.
- El repositorio ya tenía modificaciones y archivos sin seguimiento antes de esta revisión. Se preservaron y no se alteraron.
