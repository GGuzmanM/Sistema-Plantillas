# Seguridad del Programa de Plantillas

Auditoría del 2026-11-18. Qué protege el programa, qué se corrigió y qué depende de cómo se use.

## Cómo está hecho

- El programa corre en la PC: `servidor.ps1` sirve la carpeta en `http://localhost:8765` y el navegador hace todos los cálculos. No usa internet ni manda datos a ningún servidor de afuera.
- Los datos de los pacientes (diseños, STL, hojas, recetas, G-code) se guardan en la carpeta compartida de OneDrive "Programa Plantillas - Datos compartidos", no en esta carpeta.
- Las carpetas `escaneos/` y `salida/` tienen datos de pacientes de prueba. Están en `.gitignore` y nunca se suben a GitHub.

## Lo que hace el servidor (servidor.ps1)

| Protección | Contra qué |
|---|---|
| Escucha solo en `localhost` | Que otra PC de la red entre al programa |
| Rechaza otro nombre en `Host` | Que una página web maliciosa lea el programa haciéndose pasar por localhost (DNS rebinding) |
| Nada fuera de la carpeta; ni `.git`, `.claude` ni archivos `.ps1`, `.cmd`, `.bat`, `.exe` o `.zip` | Leer otros archivos de la PC o el historial del código |
| `PUT` solo desde la propia página (cabecera Origin), solo en `salida/` y `combinaciones.json`, con un máximo de 200 MB | Que otra página o programa escriba archivos en la PC |
| Solo `GET`, `HEAD` y `PUT` | Otros métodos que no se usan |
| Cabeceras `nosniff`, `X-Frame-Options` y `Cross-Origin-Resource-Policy` | Meter el programa dentro de otra página o leer sus archivos desde otro sitio |
| Escritura en un temporal y cambio de nombre | Archivos a medias si algo se corta |

## Lo que se corrigió en la pantalla

- Nombres de elementos, avisos, datos del escaneo y la orden del doctor se escapan antes de mostrarse. Antes, una receta o una biblioteca armada a propósito podía ejecutar código en el programa.
- Las correcciones (arco medial y mover ápice) se validan: antes aceptaban 999 mm sin avisar.
- No se exporta (STL, G-code, hoja ni receta) mientras haya un casillero fuera de rango. Antes se exportaba la última plantilla válida aunque la pantalla mostrara otros números.
- G-code: si el alto del bloque está vacío o tiene letras, ya no se usa 26 mm por defecto. Se pide el alto real, de 10 a 60 mm.
- Al abrir una receta, las correcciones se recortan a los límites del panel y una orden que no es un objeto se descarta.

## Revisión externa (QA, 2026-11-18)

- **QA-01, nombre de la muestra sin escapar: no se reproduce.** El nombre ya pasaba por `esc()`, también en la primera versión subida a GitHub. Además, Windows no permite `<`, `>` ni `"` en nombres de archivo. Igual se escapó también la columna de títulos, que son textos fijos.
- **QA-02, anchos fuera de rango: confirmado y corregido.**
  - Con 150 mm de antepié o 120 mm de talón, el campo quedaba con ese número, pero se exportaba la plantilla anterior. Ahora se marca "Revise" y se bloquean el STL, la receta, la hoja y el G-code. Los límites probados (40 / 140 y 30 / 110) exportan bien.
  - Más grave: una receta con `ancho: 99999` generaba una plantilla de 99 998 mm y decía "Listo". Ahora la receta se rechaza con un mensaje.
  - Como seguro final, antes de exportar se revisan los anchos de la plantilla real.

- **QA-02c, ancho del pie derecho con línea de corte propia: confirmado y corregido.**
  - Una receta con la línea de corte derecha 1,7 veces más ancha exportaba un STL derecho de 161,5 mm, mientras el izquierdo medía 95 mm.
  - La causa: sin campos separados por pie, el programa medía el derecho con las medidas del izquierdo. Eso también afectaba a la hoja y a los avisos.
  - Ahora cada pie se mide por separado y se validan los dos antes de exportar el STL, la receta, la hoja o el G-code.
  - Se probó con el derecho a 1,0 y 1,3 veces (exporta; el G-code avisa si no entra en el bloque) y a 1,7 veces (bloquea los 4 formatos).

## Lo que se probó y funciona bien

- Nombres de diseñador o paciente con `<`, `../`, `CON` o espacios: se limpian.
- El doble clic en "Nuevo proyecto" crea un solo proyecto.
- Cambiar de proyecto, volver y cambiar otra vez: cada uno guarda lo suyo. Deshacer no pasa cambios de un paciente a otro.
- Al eliminar el proyecto abierto, se guarda antes su último cambio en la Papelera y después ya no se exporta ahí.
- Recetas rotas, con datos basura o con código: se rechazan o se limpian sin errores.
- Se recorrieron los módulos 1 a 4 de ida y vuelta, cambiando el método de producción en cada uno, y se hicieron clics al azar en el diseño y la biblioteca. Hubo un solo error, en el editor de elementos, y está corregido.

## Lo que depende de cómo se use (no se arregla con código)

1. **Copiar el programa.** Un programa que corre en el navegador se puede copiar si alguien tiene la carpeta. Lo que lo protege es controlar quién tiene la carpeta:
   - repositorio de GitHub **privado** y con pocas personas invitadas;
   - carpeta solo en las PC de la empresa, con usuario de Windows y contraseña;
   - no mandar el zip por WhatsApp ni por correo.
2. **Datos de pacientes en OneDrive.** La carpeta "Datos compartidos" debe compartirse solo con las cuentas de la empresa, nunca con un enlace de "cualquiera con el enlace". Conviene activar la verificación en dos pasos en las cuentas de Microsoft y de GitHub.
3. **Respaldos.** Los zip de `Respaldos_Programa_Plantillas` traen el programa completo, con `escaneos/` y `salida/`. Trátalos como datos de pacientes.
