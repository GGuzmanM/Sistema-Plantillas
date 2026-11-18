# Reauditoría QA: verificación de correcciones y asuntos pendientes

> **Resultado en navegador:** ejecuté `http://localhost:8765/pruebas/` en Edge. Las **29 comprobaciones visibles pasaron**. La página también confirmó los dos PUT de STL de prueba (izquierdo y derecho, respuestas de guardado exitosas). La batería valida el motor geométrico y varios flujos de archivo; no cubre de forma automatizada las validaciones UI de anchos ni el rechazo de recetas que el usuario probó manualmente.

**Proyecto:** Programa de plantillas (Lima Blue)  
**Fecha:** 18 de noviembre de 2026  
**Revisión:** contraste del informe anterior con el código actualizado y revisión estática de flujos relacionados.  
**Archivos principales revisados:** `app/app.js`, `app/index.html`, `app/inicio.js`, `motor/plantilla.js`, `pruebas/pruebas.js`, `servidor.ps1` y `SEGURIDAD.md`.

## Resumen ejecutivo

La primera auditoría informó mal el hallazgo QA-01. Interpretó de manera incorrecta la desestructuración de las filas: en `['Archivo', m.nombre]`, `x` es la etiqueta fija y `y` es el nombre; `y` ya se escapaba. El usuario también comprobó el caso en la interfaz. En el código actual ambos valores pasan por `esc()`. **QA-01 queda cerrado como falso positivo.**

QA-02 sí era real y el código actual contiene los arreglos descritos: valida los anchos escritos a mano, verifica las medidas generadas antes de exportar y rechaza recetas con ancho general fuera del rango admitido. En particular, el guardado/exportación de STL, receta, hoja y G-code llama a `hayFueraDeRango()`.

Encontré una condición de borde que todavía merece corrección: la verificación del ancho real generado comprueba el pie izquierdo (`actual.m`) pero no el derecho (`actual.mDer`). En diseños con contorno independiente para el pie derecho, las medidas generadas de ese pie pueden diferir. Es un hallazgo de revisión estática que debe reproducirse con una receta o muestra asimétrica antes de considerar cerrada la cobertura de QA-02.

## Estado de las incidencias anteriores

| ID | Resultado de la reauditoría | Evidencia |
|---|---|---|
| QA-01 | **Falso positivo; cerrado.** | `ponerMuestra()` muestra ambos valores mediante `esc(x)` y `esc(y)` en `app/app.js`. El nombre está en `y`, así que ya estaba escapado antes del cambio adicional. La prueba manual del usuario confirma que el nombre se ve como texto. |
| QA-02a | **Corregido según código; probado manualmente por el usuario.** | `valoresFuera()` incorpora `anchoAntepie` cuando el automático está desactivado y `anchoTalon` cuando el talón no está en modo automático. |
| QA-02b | **Corregido según código; prueba manual reportada por el usuario.** | `limpiarReceta()` rechaza `ancho` fuera de 40–160 mm. El control de exportación también mide el ancho resultante, por lo que el límite de receta no es el único control. |
| QA-02c | **Cobertura incompleta para el pie derecho asimétrico; pendiente de reproducir.** | `hayFueraDeRango()` consulta `actual?.m`, pero `actual` también contiene `mDer`. La batería del motor ejecutada usa un par simétrico, así que no cubre esta condición. |

## Ejecución de pruebas en navegador

**Entorno:** Microsoft Edge, URL `http://localhost:8765/pruebas/`, servidor local del proyecto.  
**Resultado observado:** 29 de 29 comprobaciones aparecen como **Pasa**.

La cobertura observada incluyó contorno, medidas y sólidos de resina en ambos lados, acabado, espejo, tallas extremas, arco, elementos, edición de forma, escaneos Podoscan, muestras PNG/PDF, contacto, altura del borde, hormas Crocs/Chimpunes/Guía y G-code EVA. Los dos últimos casos de guardado informaron que `prueba_resina_240_izq.stl` y `prueba_resina_240_der.stl` se guardaron en `salida/`.

**Efecto de la prueba:** la página escribe esos dos STL de prueba en `salida/`. Los dejo registrados como productos de la ejecución; no los eliminé.

**Límite:** pasar esta batería no prueba las validaciones del formulario principal ni la función `limpiarReceta()`. Esos casos se verifican por los resultados manuales comunicados por el usuario y por lectura del código; no deben reportarse como cubiertos por estas 29 pruebas.

## QA-01 — Corrección del informe anterior

El informe inicial dijo que el nombre del archivo se interpolaba en `x` sin escapar. Eso fue una lectura equivocada de esta estructura:

```js
[['Archivo', m.nombre], ...].map(([x, y]) => ...)
```

En el primer par, `x === 'Archivo'` y `y === m.nombre`. La versión anterior ya aplicaba `esc(y)`. El cambio que añadió `esc(x)` es defensa en profundidad y mejora de claridad, pero no corrige una vulnerabilidad que existiera en esa fila.

La prueba con el nombre malicioso y la muestra normal fue realizada por el usuario. No la ejecuté yo en esta reauditoría. Además, los nombres `<`, `>` y `"` no son nombres válidos de archivo en Windows; esto limita esa prueba concreta en Windows, pero no cambia el análisis del escape: el dato del nombre ya pasaba por `esc()`.

**Conclusión:** retirar QA-01 de la lista de defectos reales y corregir el informe anterior. La ubicación actual, alrededor de `app/app.js:1316`, escapa tanto etiqueta como nombre.

## QA-02 — Confirmación de las correcciones

### Anchos manuales

La función `valoresFuera()` ahora valida los campos de ancho únicamente cuando están en modo manual. Los manejadores de entrada cambian el modo automático a manual cuando el valor está fuera de rango y solicitan actualizar el estado. Esto permite que el control de exportación vea el valor inválido, aunque la geometría conserve el último modelo válido.

El límite del formulario es 40–140 mm para el antepié y 30–110 mm para el talón. `hayFueraDeRango()` comprueba además el resultado geométrico del pie izquierdo. El usuario reporta que los cuatro destinos se bloquean con los valores 150 y 120 y vuelven a funcionar al corregirlos; esa prueba manual es evidencia operativa aportada por el usuario.

### Recetas con anchura extrema

`limpiarReceta()` rechaza `ancho` menor que 40 o mayor que 160 mm. Esto impide el caso `ancho: 99999` que el usuario observó anteriormente. El umbral de 160 corresponde al parámetro general de ancho usado por el motor; la medida final real se valida también en `hayFueraDeRango()`.

La revisión de código confirma estas defensas, pero yo no importé una receta ni ejecuté la pantalla. La reproducción del valor de casi 100 metros y la prueba de rechazo son resultados informados por el usuario.

## Hallazgo residual: falta validar el ancho real del pie derecho

**Prioridad sugerida:** Media, elevar a Alta si la prueba demuestra que se puede exportar una pieza derecha fuera de límite.  
**Ubicación:** `app/app.js`, alrededor de las líneas 2541–2547 (`hayFueraDeRango()`) y 1058–1090 (cálculo y almacenamiento de `mDer`).

### Evidencia

`actualizar()` calcula las medidas de ambos pies cuando corresponde:

```js
m = medidas(r.izq);
mDer = d.der ? medidas(r.der) : m;
actual = { d, ...r, m, mDer };
```

Pero `hayFueraDeRango()` solo toma:

```js
const m = actual?.m;
```

y compara únicamente `m.anchoAntepie` y `m.anchoTalon`. El proyecto permite un contorno separado para el pie derecho (`d.contorno.puntosDer`), y `generarPies()` construye `hDer` desde ese contorno y recalcula el pie derecho. Es posible, por tanto, que el ancho generado derecho difiera del izquierdo aunque el campo editable sea compartido.

### Cómo comprobarlo

En una copia de prueba, preparar un proyecto con contornos distintos para cada pie. Elegir dimensiones que dejen el ancho generado izquierdo dentro de los límites y el derecho fuera. Pulsar sucesivamente STL, guardar receta, hoja y G-code. Registrar el mensaje, las medidas de `actual.m` y `actual.mDer` y si se creó algún archivo. No usar archivos destinados a fabricación para esta prueba.

Si no se puede alcanzar un ancho derecho fuera de rango con los límites del formulario, probarlo con una receta de contorno asimétrico y documentar el resultado. Si la geometría nunca puede exceder los límites, dejarlo asentado con evidencia del motor y una prueba de regresión.

### Cambio recomendado si se reproduce

Validar los resultados de los dos pies, evitando duplicar lógica:

```js
const medidasPorPie = [
  ['izquierdo', actual?.m],
  ['derecho', actual?.mDer ?? actual?.m],
];
for (const [pie, medidas] of medidasPorPie) {
  if (!medidas) continue;
  if (!(medidas.anchoAntepie >= 40 && medidas.anchoAntepie <= 140)) {
    f.push(`Ancho de antepié ${pie} (${f1(medidas.anchoAntepie)} mm; de 40 a 140)`);
  }
  if (!(medidas.anchoTalon >= 30 && medidas.anchoTalon <= 110)) {
    f.push(`Ancho de talón ${pie} (${f1(medidas.anchoTalon)} mm; de 30 a 110)`);
  }
}
```

Adaptar el texto al estilo del programa. El guard debe seguir ejecutándose antes de cada formato de exportación. Si, por diseño del motor, el derecho nunca puede exceder el límite, preferir una prueba que demuestre esa propiedad en vez de añadir una validación redundante.

## Cobertura de pruebas y límites

- `pruebas/pruebas.js` cubre principalmente geometría del motor, sólidos, hormas y G-code. No encontré pruebas automatizadas específicas para el escape de nombres, el estado del formulario fuera de rango, el bloqueo de cada destino de exportación ni el sanitizado de `ancho` en recetas.
- La página de pruebas escribe STL de ejemplo en `salida/`; la ejecución modifica archivos locales. En esta sesión la batería sí se ejecutó en Edge y todas las 29 comprobaciones visibles pasaron.
- Node.js no es necesario para ejecutar el proyecto ni esta página de pruebas; la ejecución en navegador confirma ese flujo.
- QA-01 y las verificaciones operativas de QA-02 citadas aquí se atribuyen explícitamente a las pruebas manuales que reportó el usuario; no las presento como ejecución propia.
- El proyecto ya tenía cambios locales y archivos sin seguimiento. No los modifiqué.

## Acciones recomendadas

1. Corregir `REPORTE_QA_SOLUCIONES.md` o marcarlo como superado: QA-01 fue falso positivo.
2. Probar el ancho real del pie derecho en contornos asimétricos. Si se reproduce, validar `actual.mDer` antes de exportar.
3. Añadir regresiones para receta con `ancho: 99999`, entrada manual de 150/120, valores de frontera y los cuatro destinos de exportación.
4. Para repetir la batería, iniciar `Abrir programa.cmd` y abrir `http://localhost:8765/pruebas/` en Edge o Chrome; revisar los STL de prueba que genera en `salida/`.
