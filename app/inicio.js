// Pantalla de inicio (como la de LutraCAD) y carpeta de trabajo compartida (Ernesto, 2026-11-13).
//
// Los diseños se guardan en una carpeta de OneDrive que ven las tres PC ("Programa Plantillas - Datos
// compartidos"). Antes de guardar, cada PC indica una vez cuál es esa carpeta; el navegador la recuerda.
//
// Dentro de la carpeta:
//   Diseños/<Diseñador>/<Paciente - fecha>/proyecto.json   ← el diseño (se guarda solo) y sus datos
//   Diseños/<Diseñador>/<Paciente - fecha>/*.stl, hoja, receta ← lo que se exporta de ese paciente
//   Biblioteca/                                            ← elementos propios (siguiente paso)
// Cada diseñador es una carpeta dentro de Diseños; cada proyecto, una carpeta dentro del diseñador.

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// nombre válido de carpeta en Windows (auditoría 2026-11-16): sin caracteres prohibidos, sin puntos ni espacios al
// final (Windows los quita y la carpeta queda con otro nombre) y sin nombres reservados (CON, PRN, AUX, NUL, COM1…)
const limpioNombre = s => {
  let n = String(s ?? '').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(n)) n += '_';
  return n.slice(0, 120);
};
const fechaCorta = iso => iso ? new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : '';

// ---- La carpeta elegida se recuerda en el navegador (IndexedDB guarda el permiso de la carpeta) ----
const BD = 'plantillas-lima-blue', TABLA = 'ajustes';
function bd() {
  return new Promise((ok, mal) => {
    const r = indexedDB.open(BD, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(TABLA);
    r.onsuccess = () => ok(r.result); r.onerror = () => mal(r.error);
  });
}
async function leerAjuste(k) { try { const b = await bd(); return await new Promise(ok => { const r = b.transaction(TABLA).objectStore(TABLA).get(k); r.onsuccess = () => ok(r.result); r.onerror = () => ok(null); }); } catch { return null; } }
async function ponerAjuste(k, v) { try { const b = await bd(); await new Promise(ok => { const t = b.transaction(TABLA, 'readwrite'); t.objectStore(TABLA).put(v, k); t.oncomplete = ok; t.onerror = ok; }); } catch { /* sin almacenamiento */ } }

// ---- Archivos dentro de la carpeta ----
async function carpetaEn(dir, partes, crear = false) {
  for (const p of partes) dir = await dir.getDirectoryHandle(p, { create: crear });
  return dir;
}
async function escribir(dir, nombre, cuerpo) {
  const f = await dir.getFileHandle(nombre, { create: true }), w = await f.createWritable();
  await w.write(cuerpo); await w.close();
}
async function leerJSON(dir, nombre) {
  try { return JSON.parse(await (await (await dir.getFileHandle(nombre)).getFile()).text()); } catch { return null; }
}
async function subcarpetas(dir) {
  const r = []; for await (const [n, h] of dir.entries()) if (h.kind === 'directory') r.push([n, h]);
  return r.sort((a, b) => a[0].localeCompare(b[0], 'es'));
}

import { pintarBiblioteca } from './biblioteca.js';

// biblioteca: { catalogo(), miniatura(def, canvas), aplicar(datos) } — aplicar suma los propios al programa
// antesDeSalir(): pasa ya al guardado el último cambio del diseño que todavía esperaba (auditoría 2026-11-16)
export function crearInicio({ aplicarReceta, recetaNueva, mensaje, alAbrir, biblioteca, antesDeSalir, abrirCarpeta, elegirCarpetaPaciente }) {
  let datosBib = { elementos: [], favoritos: [] };   // Biblioteca/elementos.json de la carpeta compartida
  let datosHormas = { hormas: [] };                   // Biblioteca/hormas.json (hormas propias y modificadas, 2026-11-17)
  async function cargarBiblioteca() {
    if (!raiz) return;
    const dir = await carpetaEn(raiz, ['Biblioteca'], true);
    datosBib = (await leerJSON(dir, 'elementos.json')) ?? { elementos: [], favoritos: [] };
    biblioteca?.aplicar(datosBib);
    datosHormas = (await leerJSON(dir, 'hormas.json')) ?? { hormas: [] };
    biblioteca?.aplicarHormas?.(datosHormas);
  }
  async function guardarHormas(d) {
    datosHormas = { ...d, modificado: new Date().toISOString() };
    biblioteca?.aplicarHormas?.(datosHormas);
    try { await escribir(await carpetaEn(raiz, ['Biblioteca'], true), 'hormas.json', JSON.stringify(datosHormas, null, 2)); }
    catch (e) { alert('No se pudo guardar la horma: ' + e.message); }
  }
  async function guardarBiblioteca(d) {
    datosBib = { ...d, modificado: new Date().toISOString() };
    biblioteca?.aplicar(datosBib);
    try { await escribir(await carpetaEn(raiz, ['Biblioteca'], true), 'elementos.json', JSON.stringify(datosBib, null, 2)); }
    catch (e) { alert('No se pudo guardar la biblioteca: ' + e.message); }
  }
  let raiz = null;          // carpeta de trabajo (con permiso)
  let guardada = null;      // la recordada, aunque falte confirmar el permiso
  let disenador = null;     // nombre del diseñador abierto en la pantalla de inicio
  let proyecto = null;      // { disenador, carpeta, dir, datos } del diseño abierto
  let vista = 'disenadores';

  // en pruebas (sin ventana para elegir carpeta) se usa el almacenamiento propio del navegador
  const PRUEBA = new URLSearchParams(location.search).has('almacenPrueba');

  async function iniciar() {
    if (PRUEBA) { raiz = await navigator.storage.getDirectory(); }
    else {
      guardada = await leerAjuste('carpeta');
      if (guardada && (await guardada.queryPermission({ mode: 'readwrite' })) === 'granted') raiz = guardada;
    }
    await cargarBiblioteca();
    mostrar(true);
  }
  const CARPETA_COMPARTIDA = 'Programa Plantillas - Datos compartidos';
  const tieneSub = async (dir, n) => { try { await dir.getDirectoryHandle(n); return true; } catch { return false; } };
  async function elegirCarpeta() {
    if (!window.showDirectoryPicker) { alert('Este navegador no deja elegir carpetas. Use Google Chrome o Microsoft Edge actualizados.'); return; }
    let h;
    try { h = await window.showDirectoryPicker({ id: 'plantillas-datos', mode: 'readwrite' }); }
    catch (e) {
      if (e.name === 'AbortError') return;   // canceló
      // algunos navegadores no dejan pedir el permiso de edición en el mismo paso: se elige y se pide aparte
      try { h = await window.showDirectoryPicker(); if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('no se dio permiso para guardar en la carpeta'); }
      catch (e2) { if (e2.name !== 'AbortError') alert(`No se pudo usar la carpeta: ${e2.name}: ${e2.message} (primer intento: ${e.name}: ${e.message})`); return; }
    }
    try {
      // si se eligió "Diseños" o "Biblioteca" por error, se avisa (el navegador no deja subir a la carpeta de arriba)
      if (/^(diseños|biblioteca)$/i.test(h.name)) alert(`Eligió la carpeta "${h.name}". Elija la carpeta de arriba, "Programa Plantillas - Datos compartidos" (la que contiene Diseños y Biblioteca).`);
      // otra carpeta que no es la compartida y que todavía no tiene diseños (2026-11-14: en una PC quedó elegida
      // "Plantillas personalizadas de Office" por error y los diseños se guardaron ahí): se pregunta antes de usarla
      else if (h.name !== CARPETA_COMPARTIDA && !(await tieneSub(h, 'Diseños')) &&
               !confirm(`La carpeta elegida es "${h.name}", no "${CARPETA_COMPARTIDA}".\n\nSi la usa, los diseños de esta PC se guardan ahí y las otras PC no los ven. ¿Usarla igual?`)) { /* eligió no usarla */ }
      else {
        raiz = guardada = h; await ponerAjuste('carpeta', h);
        await carpetaEn(raiz, ['Diseños'], true); await carpetaEn(raiz, ['Biblioteca'], true);
        await cargarBiblioteca();
      }
      pintar();
    } catch (e) { alert(`No se pudo usar la carpeta: ${e.name}: ${e.message}`); }
  }
  async function conectar() {
    if (!guardada) return elegirCarpeta();
    if ((await guardada.requestPermission({ mode: 'readwrite' })) === 'granted') { raiz = guardada; await cargarBiblioteca(); pintar(); }
  }

  // ---- Pantalla ----
  function mostrar(si) {
    $('inicio').hidden = !si;
    document.body.classList.toggle('en-inicio', si);
    if (si) pintar(); else pintarCabecera();
  }
  function pintarCabecera() {
    $('inicioCarpeta').textContent = raiz ? `Carpeta: ${PRUEBA ? '(prueba)' : raiz.name}` : 'Sin carpeta de trabajo';
    $('inicioVolver').hidden = !proyecto;
    document.querySelectorAll('[data-inicio-vista]').forEach(b => b.classList.toggle('activo', b.dataset.inicioVista === vista));
    // en el diseño: diseñador › paciente
    $('proyectoActual').textContent = proyecto ? `${proyecto.disenador} › ${proyecto.datos.paciente || proyecto.carpeta}` : 'Sin proyecto (no se guarda)';
    $('proyectoActual').classList.toggle('sin-proyecto', !proyecto);
  }
  async function pintar() {
    pintarCabecera();
    const cuerpo = $('inicioCuerpo');
    if (!raiz) {
      cuerpo.innerHTML = `<div class="inicio-aviso">
        <h3>${guardada ? 'Conectar con la carpeta de trabajo' : 'Elija la carpeta de trabajo'}</h3>
        <p>Los diseños, los STL y las hojas se guardan en la carpeta compartida de OneDrive
        <b>"Programa Plantillas - Datos compartidos"</b>, así las tres PC ven lo mismo.
        ${!guardada ? 'Se elige una sola vez en cada PC.'
          : guardada.name === CARPETA_COMPARTIDA ? `Esta PC ya la tiene elegida (<b>${esc(guardada.name)}</b>); el navegador pide confirmar el permiso.`
          : `<span class="aviso-carpeta">Ojo: esta PC tiene elegida otra carpeta, <b>${esc(guardada.name)}</b>, no la compartida. Use "Elegir otra carpeta…" y elija "${CARPETA_COMPARTIDA}" (en la raíz de OneDrive).</span>`}</p>
        <button class="primario" id="inicioElegir">${guardada ? 'Conectar con ' + esc(guardada.name) : 'Elegir carpeta…'}</button>
        ${guardada ? '<button id="inicioOtra">Elegir otra carpeta…</button>' : ''}
      </div>`;
      $('inicioElegir').onclick = guardada ? conectar : elegirCarpeta;
      if ($('inicioOtra')) $('inicioOtra').onclick = elegirCarpeta;
      return;
    }
    if (vista === 'biblioteca') {
      pintarBiblioteca(cuerpo, { catalogo: biblioteca.catalogo, miniatura: biblioteca.miniatura, recuadro: biblioteca.recuadro, vista3D: biblioteca.vista3D, hormas: biblioteca.hormas, editorHorma: biblioteca.editorHorma,
        datosHormas: () => datosHormas, guardarHormas, datos: () => datosBib, guardar: guardarBiblioteca });
      return;
    }
    if (!disenador) return pintarDisenadores(cuerpo);
    return pintarProyectos(cuerpo);
  }
  async function pintarDisenadores(cuerpo) {
    const dis = await carpetaEn(raiz, ['Diseños'], true), lista = await subcarpetas(dis);
    const tarjetas = await Promise.all(lista.map(async ([n, h]) => [n, (await subcarpetas(h)).length]));
    cuerpo.innerHTML = `<div class="inicio-titulo"><h2>Diseñadores</h2></div>
      <div class="tarjetas">
        ${tarjetas.map(([n, k]) => `<div class="tarjeta">
          <div class="tarjeta-cab">● Activo</div>
          <div class="tarjeta-nombre">${esc(n)}</div>
          <div class="tarjeta-dato">Proyectos: ${k}</div>
          <button class="abrir" data-disenador="${esc(n)}">Abrir</button></div>`).join('')}
        <div class="tarjeta nueva">
          <div class="tarjeta-nombre">Nuevo diseñador</div>
          <input type="text" id="nuevoDisenador" placeholder="Nombre" aria-label="Nombre del nuevo diseñador">
          <button class="abrir" id="crearDisenador">Crear</button></div>
      </div>`;
    cuerpo.querySelectorAll('[data-disenador]').forEach(b => b.onclick = () => { disenador = b.dataset.disenador; pintar(); });
    const crear = async () => {
      const n = limpioNombre($('nuevoDisenador').value); if (!n) { $('nuevoDisenador').focus(); return; }
      try { await carpetaEn(raiz, ['Diseños', n], true); } catch (e) { alert(`No se pudo crear el diseñador "${n}": ${e.message}`); return; }
      disenador = n; pintar();
    };
    $('crearDisenador').onclick = crear;
    $('nuevoDisenador').onkeydown = e => { if (e.key === 'Enter') crear(); };
  }
  async function pintarProyectos(cuerpo) {
    const dir = await carpetaEn(raiz, ['Diseños', disenador], true), lista = [];
    for (const [n, h] of await subcarpetas(dir)) {
      const p = await leerJSON(h, 'proyecto.json');
      lista.push({ carpeta: n, paciente: p?.paciente || n, creado: p?.creado, modificado: p?.modificado, estado: p?.estado || 'En diseño' });
    }
    lista.sort((a, b) => String(b.modificado ?? '').localeCompare(String(a.modificado ?? '')));
    cuerpo.innerHTML = `<div class="inicio-titulo">
        <button class="volver" id="inicioDisenadores">‹ Diseñadores</button><h2>${esc(disenador)}</h2>
        <input type="search" id="buscarProyecto" placeholder="Buscar paciente…" aria-label="Buscar paciente">
      </div>
      <div class="nuevo-proyecto">
        <input type="text" id="nuevoPaciente" placeholder="Nombre del paciente" aria-label="Nombre del paciente del nuevo proyecto">
        <button class="primario" id="crearProyecto">+ Nuevo proyecto</button>
        <button id="crearDesdeCarpeta" title="Elegir la carpeta del paciente: el proyecto toma el nombre de la carpeta y se cargan su escaneo y sus muestras">📁 Nuevo desde carpeta…</button>
        <input type="file" id="archivoNuevoCarpeta" webkitdirectory multiple hidden>
      </div>
      <table class="proyectos"><thead><tr><th>Paciente</th><th>Creado</th><th>Modificado</th><th>Estado</th><th></th></tr></thead>
      <tbody>${lista.map(p => `<tr data-buscar="${esc(p.paciente.toLowerCase())}"><td>${esc(p.paciente)}</td><td>${fechaCorta(p.creado)}</td>
        <td>${fechaCorta(p.modificado)}</td><td><span class="estado ${p.estado === 'Exportado' ? 'ok' : ''}">${esc(p.estado)}</span></td>
        <td class="acciones-proyecto"><button data-proyecto="${esc(p.carpeta)}">Abrir</button><button class="peligro" data-eliminar="${esc(p.carpeta)}" title="Mover este diseño a la Papelera">Eliminar</button></td></tr>`).join('') || '<tr><td colspan="5" class="vacio">Todavía no hay proyectos.</td></tr>'}</tbody></table>`;
    $('inicioDisenadores').onclick = () => { disenador = null; pintar(); };
    $('buscarProyecto').oninput = e => { const q = e.target.value.trim().toLowerCase(); cuerpo.querySelectorAll('[data-buscar]').forEach(tr => { tr.hidden = q && !tr.dataset.buscar.includes(q); }); };
    cuerpo.querySelectorAll('[data-proyecto]').forEach(b => b.onclick = () => abrirProyecto(disenador, b.dataset.proyecto));
    cuerpo.querySelectorAll('[data-eliminar]').forEach(b => b.onclick = async () => {
      const p = lista.find(x => x.carpeta === b.dataset.eliminar); if (!p) return;
      if (!confirm(`¿Eliminar el diseño de "${p.paciente}" (creado ${fechaCorta(p.creado)})?\n\nSe mueve a la carpeta "Papelera" de la carpeta compartida, con su STL, hoja y receta. De ahí se puede recuperar.`)) return;
      b.disabled = true;
      try { await eliminarProyecto(disenador, p.carpeta); mensaje(`Diseño de ${p.paciente} movido a la Papelera.`); }
      catch (e) { alert('No se pudo eliminar: ' + e.message); }
      pintar();
    });
    let creando = false;
    // archivos = carpeta del paciente (Nuevo desde carpeta): el nombre sale de la carpeta y después se cargan su escaneo y muestras
    const crear = async (archivos = null, handle = null) => {
      const desdeCarpeta = archivos?.length ? (archivos[0].webkitRelativePath || '').split('/')[0].replace(/\s*-\s*\d{6,}\s*$/, '') : null;
      const paciente = limpioNombre(desdeCarpeta ?? $('nuevoPaciente').value);
      if (!paciente) { if (archivos) alert('No se pudo leer el nombre de la carpeta.'); else $('nuevoPaciente').focus(); return; }
      if (creando) return; creando = true;   // doble clic o Enter repetido: un solo proyecto
      try {
        antesDeSalir?.(); await guardarYa();   // lo pendiente del proyecto anterior va a su carpeta
        const ahora = new Date(), sello = ahora.toISOString().slice(0, 16).replace('T', ' ').replace(':', '');
        // mismo paciente en el mismo minuto (auditoría 2026-11-16): antes caía en la misma carpeta y pisaba el
        // diseño del primero; ahora lleva (2), (3)…
        const padre = await carpetaEn(raiz, ['Diseños', disenador], true);
        let carpeta = `${paciente} - ${sello}`;
        for (let k = 2; await tieneSub(padre, carpeta); k++) carpeta = `${paciente} - ${sello} (${k})`;
        const h = await padre.getDirectoryHandle(carpeta, { create: true });
        const datos = { paciente, disenador, creado: ahora.toISOString(), modificado: ahora.toISOString(), estado: 'En diseño', exportes: [], receta: recetaNueva(paciente) };
        await escribir(h, 'proyecto.json', JSON.stringify(datos, null, 2));
        abrirNuevo(h, carpeta, datos, paciente);
        if (archivos?.length && abrirCarpeta) await abrirCarpeta(archivos, handle);
      } catch (e) { alert('No se pudo crear el proyecto: ' + e.message); }
      finally { creando = false; }
    };
    const abrirNuevo = (h, carpeta, datos, paciente) => {
      proyecto = { disenador, carpeta, dir: h, datos };
      aplicarReceta(datos.receta, true); mostrar(false); alAbrir?.(proyecto, true);
      mensaje(`Proyecto nuevo: ${paciente} (${disenador}). Abra la carpeta del paciente para cargar el escaneo y la muestra. El diseño se guarda solo.`);
    };
    $('crearProyecto').onclick = () => crear();
    $('nuevoPaciente').onkeydown = e => { if (e.key === 'Enter') crear(); };
    // Nuevo desde carpeta (Ernesto, 2026-11-19): sin escribir el nombre; sale de la carpeta del paciente
    // con Chrome/Edge la carpeta se elige recordándola (al volver a abrir el proyecto se relee, 2026-11-19)
    $('crearDesdeCarpeta').onclick = async () => {
      const r = await elegirCarpetaPaciente?.();
      if (r?.cancelado) return;
      if (r?.archivos?.length) crear(r.archivos, r.handle); else if (!r) $('archivoNuevoCarpeta').click();
    };
    $('archivoNuevoCarpeta').onchange = ev => { const fs = [...ev.target.files]; ev.target.value = ''; if (fs.length) crear(fs); };
  }
  // Eliminar un diseño (Ernesto, 2026-11-14): no se borra de una, se mueve a Papelera/<diseñador>/<proyecto> dentro
  // de la carpeta compartida (copia de todos sus archivos y después se quita la carpeta original).
  async function copiarCarpeta(de, a) {
    for await (const [n, h] of de.entries()) {
      if (h.kind === 'directory') await copiarCarpeta(h, await a.getDirectoryHandle(n, { create: true }));
      else { const f = await h.getFile(), w = await (await a.getFileHandle(n, { create: true })).createWritable(); await w.write(f); await w.close(); }
    }
  }
  async function eliminarProyecto(dis, carpeta) {
    const padre = await carpetaEn(raiz, ['Diseños', dis]), h = await padre.getDirectoryHandle(carpeta);
    let destino = carpeta, papelera = await carpetaEn(raiz, ['Papelera', dis], true);
    // si ya hay uno con ese nombre en la Papelera, se le suma la hora
    try { await papelera.getDirectoryHandle(destino); destino += ' (eliminado ' + new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '') + ')'; } catch { /* no existe */ }
    await copiarCarpeta(h, await papelera.getDirectoryHandle(destino, { create: true }));
    await padre.removeEntry(carpeta, { recursive: true });
    // si era el proyecto abierto, deja de guardarse ahí
    const esEse = p => p?.disenador === dis && p?.carpeta === carpeta;
    if (esEse(pendiente?.p)) { pendiente = null; clearTimeout(tGuardar); }
    if (esEse(proyecto)) { proyecto = null; pintarCabecera(); }
  }
  async function abrirProyecto(dis, carpeta) {
    antesDeSalir?.(); await guardarYa();   // lo pendiente del proyecto anterior va a su carpeta, no a este
    const h = await carpetaEn(raiz, ['Diseños', dis, carpeta]), datos = await leerJSON(h, 'proyecto.json');
    if (!datos?.receta) { alert('Este proyecto no tiene diseño guardado (falta proyecto.json).'); return; }
    proyecto = { disenador: dis, carpeta, dir: h, datos };
    let repuestos = false;
    try { repuestos = aplicarReceta(datos.receta, false); } catch (e) { alert('No se pudo abrir el diseño: ' + e.message); return; }
    mostrar(false); alAbrir?.(proyecto, false);
    // el escaneo y la muestra no se guardan en el proyecto: si ya se habían abierto en esta sesión vuelven solos
    mensaje(`Proyecto abierto: ${datos.paciente} (${dis}). ` + (repuestos ? 'Se volvieron a poner el escaneo y la muestra que tenía abiertos.'
      : 'Para ver el escaneo y la muestra, use "Abrir carpeta del paciente…".'));
  }

  // ---- Guardado del diseño en su proyecto (solo, al cambiar) ----
  // se guarda 0,6 s después del último cambio, y enseguida al ir a Inicio o al dejar la página
  // `pendiente` = { p: proyecto al que pertenece, receta }: así un cambio que espera nunca se escribe en otro
  // proyecto abierto después (auditoría 2026-11-16)
  let tGuardar = null, pendiente = null;
  async function guardarYa() {
    clearTimeout(tGuardar); if (!pendiente) return;
    const { p, receta } = pendiente; pendiente = null;
    if (!p) return;
    const d = p.datos;
    d.receta = receta; d.modificado = new Date().toISOString(); if (receta.paciente) d.paciente = receta.paciente;
    try { await escribir(p.dir, 'proyecto.json', JSON.stringify(d, null, 2)); if (p === proyecto) $('proyectoActual').title = 'Guardado ' + fechaCorta(d.modificado); }
    catch (e) { mensaje('No se pudo guardar el proyecto: ' + e.message, false); }
    pintarCabecera();
  }
  function alCambiar(receta) {
    if (!proyecto) return;
    pendiente = { p: proyecto, receta }; clearTimeout(tGuardar); tGuardar = setTimeout(guardarYa, 250);
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') guardarYa(); });
  // cerrar o recargar con un cambio sin guardar: se guarda y el navegador pregunta antes de salir
  window.addEventListener('beforeunload', e => { if (pendiente && proyecto) { guardarYa(); e.preventDefault(); e.returnValue = ''; } });
  const guardarAhora = receta => { if (!proyecto) return; pendiente = { p: proyecto, receta }; return guardarYa(); };
  // Archivos que se generan (STL, hoja, receta): van a la carpeta del proyecto. Sin proyecto no se guarda.
  async function guardarArchivo(nombre, cuerpo) {
    if (!proyecto) throw new Error('primero abra o cree el proyecto del paciente en Inicio (los archivos se guardan en su carpeta)');
    await escribir(proyecto.dir, nombre, cuerpo);
  }
  async function exportado(archivos) {
    if (!proyecto) return;
    const d = proyecto.datos; d.estado = 'Exportado'; d.exportes = [...(d.exportes ?? []), { fecha: new Date().toISOString(), archivos }];
    d.modificado = new Date().toISOString();
    await escribir(proyecto.dir, 'proyecto.json', JSON.stringify(d, null, 2));
  }

  $('irInicio').onclick = async () => { antesDeSalir?.(); await guardarYa(); vista = 'disenadores'; if (proyecto) disenador = proyecto.disenador; mostrar(true); };
  $('inicioVolver').onclick = () => mostrar(false);
  document.querySelectorAll('[data-inicio-vista]').forEach(b => b.onclick = () => { vista = b.dataset.inicioVista; if (vista === 'disenadores') disenador = null; pintar(); });
  iniciar();

  return {
    guardarArchivo, exportado, alCambiar, guardarAhora,
    // "Añadir a la biblioteca" desde el diseño (necesita la carpeta de trabajo)
    agregarABiblioteca: async def => {
      if (!raiz) throw new Error('primero elija la carpeta de trabajo en Inicio');
      await guardarBiblioteca({ ...datosBib, elementos: [...(datosBib.elementos ?? []).filter(e => e.id !== def.id), def] });
    },
    proyecto: () => proyecto,
    carpetaProyecto: () => proyecto ? `${raiz?.name ?? ''}\\Diseños\\${proyecto.disenador}\\${proyecto.carpeta}` : null,
  };
}
